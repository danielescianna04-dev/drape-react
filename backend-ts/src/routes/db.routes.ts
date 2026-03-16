import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { sessionService } from '../services/session.service';
import { dockerService } from '../services/docker.service';
import { log } from '../utils/logger';

export const dbRouter = Router();

/** Helper: get active session's agentUrl for a project */
async function getAgentUrl(projectId: string, userId: string): Promise<string> {
  const session = await sessionService.get(projectId, userId);
  if (!session?.agentUrl) {
    throw Object.assign(new Error('No active container for this project. Open the project first.'), { status: 404 });
  }
  return session.agentUrl;
}

/** Helper: run a node script in the container and parse JSON output */
async function execNodeScript(agentUrl: string, script: string, timeout = 15000): Promise<any> {
  // Escape single quotes for bash -c wrapping
  const escaped = script.replace(/'/g, "'\\''");
  const result = await dockerService.exec(agentUrl, `node -e '${escaped}'`, '/home/coder/project', timeout);

  if (result.exitCode !== 0) {
    const errMsg = result.stderr || result.stdout || 'Script execution failed';
    throw Object.assign(new Error(errMsg), { status: 500 });
  }

  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw Object.assign(new Error(`Invalid JSON output: ${result.stdout.slice(0, 200)}`), { status: 500 });
  }
}

/** Helper: ensure better-sqlite3 is available, install if missing */
async function ensureSqlite3(agentUrl: string): Promise<boolean> {
  const check = await dockerService.exec(agentUrl, `node -e "try{require('better-sqlite3');console.log('ok')}catch{console.log('missing')}"`, '/home/coder/project', 5000, true);
  if (check.stdout.trim() === 'ok') return true;

  log.info('[DB] better-sqlite3 not found, installing...');
  const install = await dockerService.exec(agentUrl, 'npm install better-sqlite3 --no-save --silent 2>&1', '/home/coder/project', 60000, true);
  return install.exitCode === 0;
}

// ─── GET /db/discover/:projectId ───
// Find all SQLite database files in the project
dbRouter.get('/discover/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const uid = req.userId!;
  log.info(`[DB] Discover request for project=${projectId} user=${uid}`);

  // Graceful: if no container session, return empty instead of 404
  let agentUrl: string;
  try {
    agentUrl = await getAgentUrl(projectId, uid);
    log.info(`[DB] Found agentUrl=${agentUrl} for project=${projectId}`);
  } catch (e: any) {
    log.warn(`[DB] No container session for project=${projectId}: ${e.message}`);
    return res.json({ databases: [], pgDetected: false, containerReady: false });
  }

  const result = await dockerService.exec(
    agentUrl,
    `find /home/coder/project -maxdepth 4 \\( -name "*.sqlite" -o -name "*.db" -o -name "*.sqlite3" \\) -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/.git/*" 2>/dev/null || true`,
    '/home/coder/project',
    10000,
  );

  const files = result.stdout.trim().split('\n').filter(Boolean).map(f => {
    const relative = f.replace('/home/coder/project/', '');
    return { path: relative, fullPath: f };
  });

  // Also check for PostgreSQL
  let pgDetected = false;
  const pgCheck = await dockerService.exec(agentUrl, `ss -tlnp 2>/dev/null | grep -q :5432 && echo yes || echo no`, '/home/coder/project', 3000, true);
  if (pgCheck.stdout.trim() === 'yes') pgDetected = true;

  res.json({ databases: files, pgDetected, containerReady: true });
}));

// ─── GET /db/tables/:projectId ───
// List tables with row counts for a given database
dbRouter.get('/tables/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const dbPath = req.query.db as string;
  if (!dbPath) return res.status(400).json({ error: 'db query param required' });

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  await ensureSqlite3(agentUrl);

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)}, { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
const result = tables.map(t => {
  const count = db.prepare("SELECT COUNT(*) as c FROM " + JSON.stringify(t.name).replace(/"/g, '\\"')).get();
  return { name: t.name, rowCount: count ? count.c : 0 };
});
db.close();
console.log(JSON.stringify(result));
`;

  const tables = await execNodeScript(agentUrl, script);
  res.json({ tables });
}));

// ─── GET /db/rows/:projectId ───
// Get paginated rows for a table
dbRouter.get('/rows/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const dbPath = req.query.db as string;
  const table = req.query.table as string;
  const page = parseInt(req.query.page as string) || 0;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const filterCol = req.query.filterCol as string;
  const filterOp = req.query.filterOp as string;
  const filterVal = req.query.filterVal as string;

  if (!dbPath || !table) return res.status(400).json({ error: 'db and table query params required' });

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  // Build WHERE clause for filters
  let whereClause = '';
  let filterParam = '';
  if (filterCol && filterOp && filterVal !== undefined) {
    const ops: Record<string, string> = { eq: '=', neq: '!=', gt: '>', lt: '<', like: 'LIKE' };
    const sqlOp = ops[filterOp] || '=';
    const val = filterOp === 'like' ? `%${filterVal}%` : filterVal;
    whereClause = `WHERE ${JSON.stringify(filterCol).replace(/"/g, '')} ${sqlOp} ?`;
    filterParam = JSON.stringify(val);
  }

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)}, { readonly: true });
const tbl = ${JSON.stringify(table)};
const limit = ${limit};
const offset = ${page * limit};
${filterParam ? `const filterVal = ${filterParam};` : ''}
const countStmt = db.prepare("SELECT COUNT(*) as c FROM " + tbl + " ${whereClause}");
const total = ${filterParam ? 'countStmt.get(filterVal).c' : 'countStmt.get().c'};
const rowsStmt = db.prepare("SELECT rowid, * FROM " + tbl + " ${whereClause} LIMIT ? OFFSET ?");
const rows = ${filterParam ? 'rowsStmt.all(filterVal, limit, offset)' : 'rowsStmt.all(limit, offset)'};
const cols = rows.length > 0 ? Object.keys(rows[0]) : db.prepare("PRAGMA table_info(" + tbl + ")").all().map(c => c.name);
db.close();
console.log(JSON.stringify({ rows, columns: cols, total }));
`;

  const data = await execNodeScript(agentUrl, script, 30000);
  res.json(data);
}));

// ─── GET /db/schema/:projectId ───
// Get full schema with foreign keys
dbRouter.get('/schema/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const dbPath = req.query.db as string;
  if (!dbPath) return res.status(400).json({ error: 'db query param required' });

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)}, { readonly: true });
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
const schema = tables.map(t => {
  const columns = db.prepare("PRAGMA table_info(" + t.name + ")").all();
  const fks = db.prepare("PRAGMA foreign_key_list(" + t.name + ")").all();
  const count = db.prepare("SELECT COUNT(*) as c FROM " + t.name).get();
  return { name: t.name, sql: t.sql, columns, foreignKeys: fks, rowCount: count ? count.c : 0 };
});
db.close();
console.log(JSON.stringify(schema));
`;

  const schema = await execNodeScript(agentUrl, script);
  res.json({ schema });
}));

// ─── POST /db/update/:projectId ───
// Update a single cell value
dbRouter.post('/update/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { db: dbPath, table, rowid, column, value } = req.body;
  if (!dbPath || !table || rowid === undefined || !column) {
    return res.status(400).json({ error: 'db, table, rowid, and column are required' });
  }

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)});
const stmt = db.prepare("UPDATE " + ${JSON.stringify(table)} + " SET " + ${JSON.stringify(column)} + " = ? WHERE rowid = ?");
const result = stmt.run(${JSON.stringify(value)}, ${JSON.stringify(rowid)});
db.close();
console.log(JSON.stringify({ changes: result.changes }));
`;

  const data = await execNodeScript(agentUrl, script);
  res.json(data);
}));

// ─── POST /db/insert/:projectId ───
// Insert a new row
dbRouter.post('/insert/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { db: dbPath, table, values } = req.body;
  if (!dbPath || !table || !values || typeof values !== 'object') {
    return res.status(400).json({ error: 'db, table, and values are required' });
  }

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  const cols = Object.keys(values);
  const vals = Object.values(values);

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)});
const cols = ${JSON.stringify(cols)};
const vals = ${JSON.stringify(vals)};
const placeholders = cols.map(() => "?").join(", ");
const stmt = db.prepare("INSERT INTO " + ${JSON.stringify(table)} + " (" + cols.join(", ") + ") VALUES (" + placeholders + ")");
const result = stmt.run(...vals);
db.close();
console.log(JSON.stringify({ lastInsertRowid: Number(result.lastInsertRowid), changes: result.changes }));
`;

  const data = await execNodeScript(agentUrl, script);
  res.json(data);
}));

// ─── POST /db/delete/:projectId ───
// Delete a row by rowid
dbRouter.post('/delete/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { db: dbPath, table, rowid } = req.body;
  if (!dbPath || !table || rowid === undefined) {
    return res.status(400).json({ error: 'db, table, and rowid are required' });
  }

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)});
const result = db.prepare("DELETE FROM " + ${JSON.stringify(table)} + " WHERE rowid = ?").run(${JSON.stringify(rowid)});
db.close();
console.log(JSON.stringify({ changes: result.changes }));
`;

  const data = await execNodeScript(agentUrl, script);
  res.json(data);
}));

// ─── POST /db/query/:projectId ───
// Execute raw SQL (read-only by default)
dbRouter.post('/query/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { db: dbPath, sql } = req.body;
  if (!dbPath || !sql) return res.status(400).json({ error: 'db and sql are required' });

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  const isWrite = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i.test(sql);

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)}${isWrite ? '' : ', { readonly: true }'});
try {
  const stmt = db.prepare(${JSON.stringify(sql)});
  ${isWrite ? `
  const result = stmt.run();
  console.log(JSON.stringify({ changes: result.changes, columns: [], rows: [] }));
  ` : `
  const rows = stmt.all().slice(0, 1000);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  console.log(JSON.stringify({ rows, columns, total: rows.length }));
  `}
} catch(e) {
  console.log(JSON.stringify({ error: e.message }));
}
db.close();
`;

  const data = await execNodeScript(agentUrl, script, 30000);
  if (data.error) return res.status(400).json({ error: data.error });
  res.json(data);
}));

// ─── GET /db/export/:projectId ───
// Export table as CSV
dbRouter.get('/export/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const dbPath = req.query.db as string;
  const table = req.query.table as string;
  if (!dbPath || !table) return res.status(400).json({ error: 'db and table required' });

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  const script = `
const Database = require("better-sqlite3");
const db = new Database(${JSON.stringify(dbPath)}, { readonly: true });
const rows = db.prepare("SELECT * FROM " + ${JSON.stringify(table)} + " LIMIT 10000").all();
if (rows.length === 0) { console.log(""); db.close(); process.exit(0); }
const cols = Object.keys(rows[0]);
const escape = v => { const s = String(v == null ? "" : v); return s.includes(",") || s.includes('"') || s.includes("\\n") ? '"' + s.replace(/"/g, '""') + '"' : s; };
const lines = [cols.join(","), ...rows.map(r => cols.map(c => escape(r[c])).join(","))];
console.log(lines.join("\\n"));
db.close();
`;

  const result = await dockerService.exec(agentUrl, `node -e '${script.replace(/'/g, "'\\''")}'`, '/home/coder/project', 30000);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
  res.send(result.stdout);
}));
