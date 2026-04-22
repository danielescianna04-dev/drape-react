/**
 * Fail-closed gate: after generation, every declared non-junction table
 * must appear in at least one SDK call somewhere in app/. If any table
 * has zero usage, the generator skipped the wiring (the classic failure
 * where the AI creates a beautiful UI with hardcoded mock state).
 *
 * The gate fixes this by re-scaffolding the missing page(s) from the
 * canonical template, so the project always ships with a working data
 * path for every table the user's request implied.
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileService } from '../file.service';
import { log } from '../../utils/logger';
import { readDeclared } from './declared-tables.service';
import { scaffoldDrapeCloudCRUD } from './scaffold-crud';
import { config } from '../../config';

const APP_DIR_CANDIDATES = ['app', 'src/app'];

async function* walkFiles(rootAbs: string): AsyncGenerator<string> {
  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
  try {
    entries = await fs.readdir(rootAbs, { withFileTypes: true }) as any;
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(rootAbs, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', 'dist', 'build', 'out', '.git', '.turbo'].includes(e.name)) continue;
      yield* walkFiles(full);
    } else if (e.isFile()) {
      if (/\.(tsx|jsx|ts|js)$/.test(e.name)) yield full;
    }
  }
}

/**
 * Return the set of table names that are declared but never appear in an
 * SDK call under app/ (or src/app/). A "usage" is any occurrence of
 * drape.table('X') or drape.table("X"). Reference from lib/drape.ts
 * itself doesn't count — it only sets up the client.
 */
export async function findUnwiredTables(projectId: string): Promise<string[]> {
  const declared = await readDeclared(projectId);
  const candidates = declared.tables.filter((t) => t.scope !== 'junction');
  if (candidates.length === 0) return [];

  // Resolve the project root on the host filesystem. fileService is the only
  // sanctioned read path but we need a recursive walk, so go direct to fs.
  const projectRoot = path.join(config.projectsRoot, projectId);

  const code: string[] = [];
  for (const appDir of APP_DIR_CANDIDATES) {
    const absAppDir = path.join(projectRoot, appDir);
    try {
      await fs.stat(absAppDir);
    } catch {
      continue;
    }
    for await (const file of walkFiles(absAppDir)) {
      try {
        const content = await fs.readFile(file, 'utf8');
        code.push(content);
      } catch {}
    }
  }

  const joined = code.join('\n');
  const unwired: string[] = [];
  for (const t of candidates) {
    // Match drape.table('name') or drape.table("name"), allowing whitespace.
    const escaped = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`drape\\s*\\.\\s*table\\s*\\(\\s*['"\`]${escaped}['"\`]`);
    if (!re.test(joined)) unwired.push(t.name);
  }
  return unwired;
}

export interface SdkUsageGateResult {
  unwiredTables: string[];
  /** Files (re-)scaffolded to heal the gate. */
  scaffolded: string[];
  /** True when all declared tables ended up with at least one SDK call. */
  ok: boolean;
}

/**
 * Enforce the gate: if any declared table has zero SDK usage, re-scaffold
 * its CRUD page from the canonical template so the project still ships
 * with a working data path. The re-scaffolded page OVERWRITES any file the
 * AI may have produced — losing the AI's styling is the cost of guaranteeing
 * the feature isn't silently broken.
 */
export async function enforceSdkUsageGate(
  projectId: string,
  technology: string,
): Promise<SdkUsageGateResult> {
  const unwired = await findUnwiredTables(projectId);
  if (unwired.length === 0) {
    return { unwiredTables: [], scaffolded: [], ok: true };
  }

  log.warn(
    `[SDK Gate] Project ${projectId} has ${unwired.length} unwired table(s): ${unwired.join(', ')}. Re-scaffolding.`,
  );

  const declared = await readDeclared(projectId);
  const tablesToRewrite = declared.tables.filter((t) => unwired.includes(t.name));

  // Delete any existing file at app/<table>/page.tsx for the unwired tables
  // so scaffoldDrapeCloudCRUD (which skips existing files) will write fresh.
  for (const t of tablesToRewrite) {
    const rel = path.posix.join('app', t.name, 'page.tsx');
    try {
      await fileService.deleteFile(projectId, rel);
    } catch {}
  }

  const scaffold = await scaffoldDrapeCloudCRUD(projectId, technology, tablesToRewrite);
  const stillUnwired = await findUnwiredTables(projectId);

  return {
    unwiredTables: unwired,
    scaffolded: scaffold.written,
    ok: stillUnwired.length === 0,
  };
}
