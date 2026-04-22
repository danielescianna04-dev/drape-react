/**
 * Schema-first scaffolder. Reads declared-tables.json and emits a minimal
 * working CRUD page for each non-junction table before the generation phase.
 *
 * Why: LLMs default to hardcoded mock data in useState even when the prompt
 * forbids it. Handing them files that already import and call the SDK flips
 * the default — the AI's easy path becomes "keep the existing .list() call,
 * restyle around it" instead of "invent an array".
 *
 * Only nextjs is supported for now (the most common technology and the one
 * that bit us on Menumal). Other stacks fall through without writing files.
 */

import path from 'node:path';
import { fileService } from '../file.service';
import { log } from '../../utils/logger';
import type { PlannedTable, TableField } from './feature-to-tables';

const SCAFFOLD_MARKER = '/* drape:scaffold */';

/** Convert a table name to a Title Case label for headers/buttons. */
function titleCase(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pick the "display field" for a row — the thing shown in the list. Prefer
 * name/title/label if declared, otherwise the first text field, otherwise id.
 */
function pickDisplayField(fields: TableField[] | undefined): string {
  if (!fields || fields.length === 0) return 'name';
  const byName = fields.find((f) => ['name', 'title', 'label'].includes(f.name));
  if (byName) return byName.name;
  const firstText = fields.find((f) => f.type === 'text');
  return firstText?.name || fields[0].name;
}

/**
 * Infer a realistic default fields list when the planner didn't declare any.
 * Every table at least has a name field so the scaffolded form is usable.
 */
function ensureFields(t: PlannedTable): TableField[] {
  if (t.fields && t.fields.length > 0) return t.fields;
  return [{ name: 'name', type: 'text' }];
}

function inputTypeForField(f: TableField): string {
  switch (f.type) {
    case 'number': return 'number';
    case 'date': return 'date';
    case 'boolean': return 'checkbox';
    default: return 'text';
  }
}

/**
 * Generate the scaffold page for one table. The code is intentionally
 * verbose and explicit — the AI will restyle it, so clarity beats cleverness.
 */
function renderScaffoldPage(table: PlannedTable): string {
  const fields = ensureFields(table);
  const displayField = pickDisplayField(fields);
  const isMine = table.scope === 'mine';
  const routeName = table.name;
  const label = titleCase(table.name);
  const singular = label.replace(/s$/, '') || label;

  const formFields = fields
    .filter((f) => f.type !== 'reference')
    .map((f) => {
      const inputType = inputTypeForField(f);
      if (inputType === 'checkbox') {
        return `        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!form.${f.name}}
            onChange={(e) => setForm({ ...form, ${f.name}: e.target.checked })}
          />
          <span>${titleCase(f.name)}</span>
        </label>`;
      }
      return `        <input
          type="${inputType}"
          value={form.${f.name} ?? ''}
          onChange={(e) => setForm({ ...form, ${f.name}: ${inputType === 'number' ? 'Number(e.target.value)' : 'e.target.value'} })}
          placeholder="${titleCase(f.name)}"
          className="w-full rounded-lg border px-3 py-2"
        />`;
    })
    .join('\n');

  const defaultForm = fields
    .filter((f) => f.type !== 'reference')
    .map((f) => {
      if (f.type === 'number') return `${f.name}: 0`;
      if (f.type === 'boolean') return `${f.name}: false`;
      return `${f.name}: ''`;
    })
    .join(', ');

  const listOpts = isMine ? `{ mine: true, orderBy: '-created_at' }` : `{ orderBy: '-created_at' }`;
  const insertOpts = isMine ? `, { mine: true }` : '';

  return `${SCAFFOLD_MARKER}
'use client';

// Scaffolded CRUD page for the "${table.name}" table. The imports, the
// drape.table(...) calls and the data flow below are load-bearing — do
// NOT delete them or replace them with hardcoded arrays. You may:
//   - restyle the JSX freely (Tailwind, colors, typography, layout)
//   - add new fields to the form (remember to pass them to insert())
//   - split this page into subcomponents
// You may NOT:
//   - remove the drape.table('${table.name}') calls
//   - replace rows with a useState([...hardcoded...]) array
//   - skip the insert/delete handlers

import { useEffect, useState } from 'react';
import { drape } from '@/lib/drape';

type ${singular}Row = { id: string; data: Record<string, any>; created_at?: string };

export default function ${singular}Page() {
  const [rows, setRows] = useState<${singular}Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Record<string, any>>({ ${defaultForm} });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { rows } = await drape.table('${table.name}').list(${listOpts});
    setRows(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.${displayField} && !Object.values(form).some(Boolean)) return;
    setSubmitting(true);
    await drape.table('${table.name}').insert(form${insertOpts});
    setForm({ ${defaultForm} });
    setSubmitting(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await drape.table('${table.name}').delete(id);
    load();
  };

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="mb-4 text-2xl font-bold">${label}</h1>

      <form onSubmit={handleCreate} className="mb-6 space-y-2 rounded-xl border p-4">
${formFields}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-black px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Add ${singular.toLowerCase()}'}
        </button>
      </form>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">No ${table.name} yet. Add one above.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-lg border p-3">
              <span className="font-medium">{r.data.${displayField} ?? r.id}</span>
              <button
                onClick={() => handleDelete(r.id)}
                className="text-sm text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
`;
}

export interface ScaffoldResult {
  /** Files that were newly written (excluding ones already present). */
  written: string[];
  /** Files that were skipped because they already exist. */
  skipped: string[];
}

/**
 * Write one scaffold page per non-junction table into app/<name>/page.tsx.
 * Files that already exist are left untouched — we never overwrite AI or
 * user work. Junction tables skip scaffolding (they are used from parent
 * tables, not surfaced as their own screen).
 */
export async function scaffoldDrapeCloudCRUD(
  projectId: string,
  technology: string,
  tables: PlannedTable[],
): Promise<ScaffoldResult> {
  const result: ScaffoldResult = { written: [], skipped: [] };

  if (technology !== 'nextjs') {
    log.info(`[Scaffold] Skipping — technology ${technology} not yet supported`);
    return result;
  }
  if (!tables || tables.length === 0) return result;

  for (const t of tables) {
    if (t.scope === 'junction') continue;
    const relPath = path.posix.join('app', t.name, 'page.tsx');

    // Don't overwrite anything — if a file exists (even from an earlier
    // scaffold attempt), trust it. The AI's job is to evolve this file,
    // not restart it from zero.
    const existing = await fileService.readFile(projectId, relPath).catch(() => null);
    if (existing?.success && existing.data?.content) {
      result.skipped.push(relPath);
      continue;
    }

    const content = renderScaffoldPage(t);
    await fileService.writeFile(projectId, relPath, content);
    result.written.push(relPath);
    log.info(`[Scaffold] Wrote CRUD page for table "${t.name}" → ${relPath}`);
  }

  return result;
}
