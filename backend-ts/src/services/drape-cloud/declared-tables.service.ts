/**
 * Single source of truth for which tables a Drape Cloud project has
 * DECLARED it will use. Persisted as `.drape/declared-tables.json`.
 *
 * Read/write helpers shared by:
 * - provision (writes the initial baseline)
 * - declare_tables agent tool (adds/removes at runtime)
 * - write_file validator (warns when code references an undeclared table)
 * - verify post-check (flags declared-but-unused tables)
 */

import { fileService } from '../file.service';
import type { PlannedTable } from './feature-to-tables';
import {
  renderDataModelMarkdown,
  type DataModelPlan,
} from './feature-to-tables';

const DECLARED_PATH = '.drape/declared-tables.json';

export interface DeclaredTablesFile {
  projectTitle?: string;
  tables: PlannedTable[];
  /** Append-only log of every declare_tables tool call for audit. */
  changelog: Array<{
    at: string;
    action: 'baseline' | 'add' | 'remove';
    table?: string;
    reason?: string;
  }>;
}

function empty(): DeclaredTablesFile {
  return { tables: [], changelog: [] };
}

export async function readDeclared(projectId: string): Promise<DeclaredTablesFile> {
  try {
    const read = await fileService.readFile(projectId, DECLARED_PATH);
    if (!read.success || !read.data?.content) return empty();
    const parsed = JSON.parse(read.data.content);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tables)) return empty();
    return {
      projectTitle: typeof parsed.projectTitle === 'string' ? parsed.projectTitle : undefined,
      tables: parsed.tables.filter((t: any): t is PlannedTable =>
        t && typeof t.name === 'string' && ['shared', 'mine', 'junction'].includes(t.scope),
      ),
      changelog: Array.isArray(parsed.changelog) ? parsed.changelog : [],
    };
  } catch {
    return empty();
  }
}

async function writeDeclared(projectId: string, state: DeclaredTablesFile): Promise<void> {
  await fileService.writeFile(projectId, DECLARED_PATH, JSON.stringify(state, null, 2));
  // Keep the markdown version in sync — the AI reads that as its schema.
  const plan: DataModelPlan = {
    tables: state.tables,
    matches: [],
    requiresAuth: state.tables.some((t) => t.scope === 'mine' || t.scope === 'junction'),
  };
  await fileService.writeFile(
    projectId,
    '.drape/data-model.md',
    renderDataModelMarkdown(plan, { projectTitle: state.projectTitle }),
  );
}

/** Seed the file from the inferred baseline. Overwrites any previous state. */
export async function writeBaseline(
  projectId: string,
  tables: PlannedTable[],
  opts: { projectTitle?: string } = {},
): Promise<void> {
  const state: DeclaredTablesFile = {
    projectTitle: opts.projectTitle,
    tables,
    changelog: [{ at: new Date().toISOString(), action: 'baseline' }],
  };
  await writeDeclared(projectId, state);
}

const SAFE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export interface DeclareChange {
  add?: PlannedTable[];
  remove?: Array<{ name: string; reason?: string }>;
}

export async function applyDeclareChange(
  projectId: string,
  change: DeclareChange,
): Promise<{ tables: PlannedTable[]; warnings: string[] }> {
  const state = await readDeclared(projectId);
  const warnings: string[] = [];
  const byName = new Map(state.tables.map((t) => [t.name, t]));

  for (const raw of change.add || []) {
    if (!raw || typeof raw.name !== 'string' || !SAFE_NAME_RE.test(raw.name)) {
      warnings.push(`add: invalid table name "${raw?.name}" — skipped`);
      continue;
    }
    if (!['shared', 'mine', 'junction'].includes(raw.scope)) {
      warnings.push(`add: ${raw.name} has invalid scope "${raw.scope}" — skipped`);
      continue;
    }
    const existing = byName.get(raw.name);
    const t: PlannedTable = {
      name: raw.name,
      scope: raw.scope,
      purpose: typeof raw.purpose === 'string' && raw.purpose ? raw.purpose : existing?.purpose || '',
      seedable: raw.seedable === true || (raw.seedable === undefined && raw.scope === 'shared'),
    };
    byName.set(t.name, t);
    state.changelog.push({ at: new Date().toISOString(), action: 'add', table: t.name });
  }

  for (const r of change.remove || []) {
    if (!r || typeof r.name !== 'string') continue;
    if (byName.delete(r.name)) {
      state.changelog.push({
        at: new Date().toISOString(),
        action: 'remove',
        table: r.name,
        reason: typeof r.reason === 'string' ? r.reason : undefined,
      });
    }
  }

  state.tables = Array.from(byName.values());
  const order: Record<string, number> = { shared: 0, mine: 1, junction: 2 };
  state.tables.sort((a, b) => order[a.scope] - order[b.scope] || a.name.localeCompare(b.name));
  await writeDeclared(projectId, state);
  return { tables: state.tables, warnings };
}

/**
 * Scan generated code for `drape.table('x')` or `drape.table("x")` calls.
 * Pure function — exported for testing the regex in isolation.
 */
export function extractTableRefsFromCode(content: string): string[] {
  const found = new Set<string>();
  const re = /\bdrape\s*\.\s*table\s*[<(][^)'"`]*['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) found.add(m[1]);
  return Array.from(found);
}

/**
 * Return table names used in the code that haven't been declared.
 * Case-sensitive (table names are exact match in our SDK).
 */
export async function findUndeclaredTableRefs(
  projectId: string,
  content: string,
): Promise<string[]> {
  const refs = extractTableRefsFromCode(content);
  if (refs.length === 0) return [];
  const state = await readDeclared(projectId);
  const declared = new Set(state.tables.map((t) => t.name));
  return refs.filter((r) => !declared.has(r));
}

/** Called by verify post-check to find declared tables with zero code references. */
export function findUnusedDeclaredTables(declared: PlannedTable[], codeRefs: string[]): string[] {
  const used = new Set(codeRefs);
  return declared.filter((t) => !used.has(t.name)).map((t) => t.name);
}
