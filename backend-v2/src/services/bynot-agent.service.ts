/**
 * Bynot Agent Service — direct Vercel AI SDK v6 implementation (no opencode).
 *
 * Replaces the opencode HTTP bridge with a thin agent loop that calls
 * OpenRouter (→ DeepSeek V4-Pro) directly via the AI SDK v6 `streamText`
 * helper and exposes a small set of project-scoped filesystem tools.
 *
 * Why bypass opencode for new builds:
 *   • opencode's generic agent loop makes 10-15 LLM calls per task because
 *     it has to explore the filesystem from scratch each time.
 *   • DeepSeek (or any modern provider) supports parallel tool calls — we
 *     can write all files for a landing page in one round trip if the
 *     model decides to.
 *   • AI SDK v6 has built-in support for stopWhen, parallel tools,
 *     onStepFinish — everything opencode wraps with its own protocol.
 *
 * Project filesystem layout:
 *   /root/projects/<projectId>/   ← project root (created on first tool call)
 *
 * Tools exposed to the model:
 *   write_file       — create/overwrite a file (path + content)
 *   read_file        — read file contents (optional line range)
 *   edit_file        — replace a substring inside a file
 *   list_directory   — list files in a directory
 *   grep_search      — regex search across project files
 *   add_dependency   — npm install <pkg> (whitelisted, no arbitrary shell)
 *
 * The model receives a pre-built "useful-context" block in the system prompt
 * containing the current file tree + package.json + key file snapshots so
 * it almost never needs to call read_file / list_directory.
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { streamText, stepCountIs, tool, type ModelMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { supabaseStorageService } from './supabase-storage.service';

/** Best-effort sync of a local project file to Supabase Storage so it appears
 * in the Sandpack preview the next time the client refreshes its file list.
 * Never throws — preview sync is non-critical and failing it should not
 * abort the agent stream. */
async function syncFileToStorage(userId: string, projectId: string, rel: string, content: string): Promise<void> {
  try {
    await supabaseStorageService.uploadFile(userId, projectId, rel, content);
  } catch (err: any) {
    console.warn(`[bynot-agent] storage sync failed for ${rel}:`, err?.message ?? err);
  }
}

const PROJECTS_ROOT = process.env.BYNOT_PROJECTS_ROOT ?? '/root/projects';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-pro';
const MAX_AGENT_STEPS = 30; // hard cap on tool-calling loop iterations

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

// ── Filesystem helpers (project-scoped, no path traversal) ───────────────

function resolveProjectRoot(projectId: string): string {
  // Reject anything that could escape the projects root.
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    throw new Error(`Invalid projectId: ${projectId}`);
  }
  return path.join(PROJECTS_ROOT, projectId);
}

function safeJoin(projectId: string, rel: string): string {
  const root = resolveProjectRoot(projectId);
  // Strip leading slash and any ".." segments so the model can't escape the
  // project directory.
  const clean = rel.replace(/^\/+/, '').split('/').filter((s) => s && s !== '..').join('/');
  const full = path.join(root, clean);
  if (!full.startsWith(root)) throw new Error(`Path escapes project root: ${rel}`);
  return full;
}

async function ensureProjectDir(projectId: string): Promise<void> {
  await fs.mkdir(resolveProjectRoot(projectId), { recursive: true });
}

// ── Tool implementations ─────────────────────────────────────────────────

function buildTools(projectId: string, userId: string) {
  return {
    write_file: tool({
      description:
        'Create or overwrite a file at the given path inside the project. ' +
        'Use this for new files and full rewrites. For small edits prefer edit_file.',
      inputSchema: z.object({
        path: z.string().describe('Project-relative path, e.g. "src/components/Hero.tsx"'),
        content: z.string().describe('Full file content. Will overwrite if file exists.'),
      }),
      execute: async ({ path: rel, content }) => {
        await ensureProjectDir(projectId);
        const full = safeJoin(projectId, rel);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content, 'utf8');
        // Sync to Supabase Storage in the background so the Sandpack preview
        // can pull the new file. Non-blocking and never throws.
        void syncFileToStorage(userId, projectId, rel, content);
        return { ok: true, path: rel, bytes: Buffer.byteLength(content, 'utf8') };
      },
    }),

    read_file: tool({
      description:
        'Read the contents of a file. The useful-context block usually contains the ' +
        'critical files already — only call this for files NOT in that block.',
      inputSchema: z.object({
        path: z.string(),
      }),
      execute: async ({ path: rel }) => {
        try {
          const content = await fs.readFile(safeJoin(projectId, rel), 'utf8');
          return { ok: true, path: rel, content };
        } catch (err: any) {
          return { ok: false, path: rel, error: err?.message ?? 'read failed' };
        }
      },
    }),

    edit_file: tool({
      description:
        'Replace a specific substring inside an existing file. Preferred over ' +
        'write_file for small/targeted edits to keep output tokens low.',
      inputSchema: z.object({
        path: z.string(),
        find: z.string().describe('Exact substring to find. Must match uniquely.'),
        replace: z.string().describe('Replacement text.'),
      }),
      execute: async ({ path: rel, find, replace }) => {
        const full = safeJoin(projectId, rel);
        try {
          const original = await fs.readFile(full, 'utf8');
          if (!original.includes(find)) {
            return { ok: false, path: rel, error: 'find pattern not found' };
          }
          const occurrences = original.split(find).length - 1;
          if (occurrences > 1) {
            return { ok: false, path: rel, error: `find pattern is ambiguous (${occurrences} matches) — make it more specific` };
          }
          const next = original.replace(find, replace);
          await fs.writeFile(full, next, 'utf8');
          void syncFileToStorage(userId, projectId, rel, next);
          return { ok: true, path: rel };
        } catch (err: any) {
          return { ok: false, path: rel, error: err?.message ?? 'edit failed' };
        }
      },
    }),

    list_directory: tool({
      description:
        'List entries in a directory inside the project. Useful only when the ' +
        'context is stale or the user asked specifically.',
      inputSchema: z.object({
        path: z.string().default('').describe('Project-relative dir. Empty = root.'),
      }),
      execute: async ({ path: rel }) => {
        try {
          const full = safeJoin(projectId, rel || '');
          const entries = await fs.readdir(full, { withFileTypes: true });
          const items = entries.map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`);
          return { ok: true, path: rel || '.', count: items.length, items };
        } catch (err: any) {
          return { ok: false, path: rel, error: err?.message ?? 'list failed' };
        }
      },
    }),

    grep_search: tool({
      description: 'Regex search across project files. Returns matching lines with file:line.',
      inputSchema: z.object({
        pattern: z.string(),
        include: z.string().optional().describe('Glob pattern, e.g. "**/*.tsx"'),
      }),
      execute: async ({ pattern, include }) => {
        // Implementation deferred to a follow-up commit — keeps the surface
        // narrow for the first cut while we ship the write/edit happy path.
        return { ok: false, error: 'not_implemented_yet', pattern, include };
      },
    }),

    add_dependency: tool({
      description:
        'Install an npm package into the project. Only the package name (and optional ' +
        'version) is accepted — no arbitrary shell commands.',
      inputSchema: z.object({
        name: z.string().describe('Package name, e.g. "framer-motion" or "lodash@latest"'),
      }),
      execute: async ({ name }) => {
        // Reject anything that doesn't look like a valid npm specifier so the
        // model can't inject extra args.
        if (!/^[@a-zA-Z0-9._/-]+(@[a-zA-Z0-9._-]+)?$/.test(name)) {
          return { ok: false, error: `invalid package name: ${name}` };
        }
        await ensureProjectDir(projectId);
        return await new Promise<{ ok: boolean; stdout?: string; error?: string }>((resolve) => {
          const proc = spawn('npm', ['install', name, '--silent'], {
            cwd: resolveProjectRoot(projectId),
            timeout: 90_000,
          });
          let out = '';
          let err = '';
          proc.stdout?.on('data', (d) => { out += d.toString(); });
          proc.stderr?.on('data', (d) => { err += d.toString(); });
          proc.on('close', (code) => {
            if (code === 0) resolve({ ok: true, stdout: out.slice(0, 500) });
            else resolve({ ok: false, error: err.slice(0, 500) || `exit ${code}` });
          });
          proc.on('error', (e) => resolve({ ok: false, error: e.message }));
        });
      },
    }),
  } as const;
}

// ── System prompt (Bynot-original, ispirato a Lovable pattern) ───────────

const BYNOT_SYSTEM_PROMPT = `Sei Bynot, l'AI che costruisce app React per utenti non-developer.

## Stack imposto
Frontend: React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui (Radix sotto).
Database/Auth: Supabase via SDK client.
Stato: zustand + @tanstack/react-query.
Routing: react-router-dom.

NIENTE Next.js, Vue, Svelte, Angular, NestJS, Python, Ruby, Go.

## Regole di output
1. Quando hai più operazioni indipendenti chiama TUTTI i tool in parallelo nella stessa risposta.
2. Per modifiche piccole usa edit_file (find/replace), NON write_file.
3. Per file nuovi o riscritture complete usa write_file.
4. Non chiamare read_file o list_directory se l'informazione è già nel "useful-context" sotto.
5. Risposta finale all'utente: massimo 2-3 righe in italiano. Niente spiegazioni tecniche lunghe.
6. NON dire mai di essere DeepSeek, Claude, GPT, OpenRouter o "un AI". Sei Bynot.

## Design system
Usa SOLO classi Tailwind via design tokens (es. text-primary, bg-card). NON hard-codare colori (NO text-white, NO bg-black). Tutti i colori passano da index.css + tailwind.config.

## Approccio
Per richieste ambigue: chiedi 1 chiarimento (NO più di 1) in 1 riga, oppure assumi una direzione sensata e procedi.
Per richieste chiare: crea tutto in un'unica risposta con tool paralleli.

Rispondi sempre in italiano se l'utente scrive in italiano.`;

// ── Useful-context builder ───────────────────────────────────────────────

const CONTEXT_PRELOAD_FILES = [
  'package.json',
  'tailwind.config.ts',
  'tailwind.config.js',
  'src/index.css',
  'src/main.tsx',
  'src/App.tsx',
];

async function buildUsefulContext(projectId: string): Promise<string> {
  await ensureProjectDir(projectId);
  const root = resolveProjectRoot(projectId);
  const lines: string[] = ['## useful-context (pre-loaded — non chiamare read_file su questi):'];

  // File tree (1 level deep)
  try {
    const tree = await fs.readdir(root, { withFileTypes: true });
    lines.push('\n### tree (root):');
    for (const e of tree.slice(0, 40)) {
      lines.push(`- ${e.name}${e.isDirectory() ? '/' : ''}`);
    }
  } catch { /* fresh project */ }

  // Critical file contents
  for (const rel of CONTEXT_PRELOAD_FILES) {
    try {
      const content = await fs.readFile(path.join(root, rel), 'utf8');
      if (content.length > 8000) continue; // skip huge ones
      lines.push(`\n### ${rel}:\n\`\`\`\n${content}\n\`\`\``);
    } catch { /* file doesn't exist yet */ }
  }
  return lines.join('\n');
}

// ── Public entry point ───────────────────────────────────────────────────

export interface RunBynotAgentParams {
  projectId: string;
  userId: string;
  prompt: string;
  history?: ModelMessage[];
  model?: string;
}

export async function runBynotAgent({
  projectId,
  userId,
  prompt,
  history,
  model,
}: RunBynotAgentParams) {
  const ctx = await buildUsefulContext(projectId);
  const system = `${BYNOT_SYSTEM_PROMPT}\n\n${ctx}`;
  const messages: ModelMessage[] = [
    ...(history ?? []),
    { role: 'user', content: prompt },
  ];

  const result = streamText({
    model: openrouter(model ?? DEFAULT_MODEL),
    system,
    messages,
    tools: buildTools(projectId, userId),
    stopWhen: stepCountIs(MAX_AGENT_STEPS),
    // OpenRouter passthrough: pin to DeepSeek so we hit the prefix cache
    // consistently. Same trick already used by opencode-http.service.ts.
    providerOptions: {
      openrouter: {
        provider: { order: ['deepseek'], allow_fallbacks: false },
      },
    },
  });

  return result;
}
