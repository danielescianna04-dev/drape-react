import { Router } from 'express';
import axios from 'axios';
import { asyncHandler } from '../middleware/async-handler';
import { sessionService } from '../services/session.service';
import { dockerService } from '../services/docker.service';
import { config } from '../config';
import { log } from '../utils/logger';
import { fileService } from '../services/file.service';
import { isDrapeCloudConfigured, getSql as getDrapeCloudSql } from '../services/drape-cloud/client';
import { ScopedRowStore } from '../services/drape-cloud/scoped-query';
import { applyDeclareChange } from '../services/drape-cloud/declared-tables.service';

export const dbRouter = Router();

/**
 * A project is on Drape Cloud when its creation-input.json explicitly
 * opted in. We never guess from env files — the opt-in is the single
 * source of truth to avoid misclassifying legacy projects that still
 * have stray cloud env vars lying around.
 */
async function isDrapeCloudProject(projectId: string): Promise<boolean> {
  if (!config.drapeCloudEnabled || !isDrapeCloudConfigured()) return false;
  try {
    const read = await fileService.readFile(projectId, '.drape/creation-input.json');
    if (!read.success || !read.data?.content) return false;
    const parsed = JSON.parse(read.data.content);
    return parsed?.useDrapeCloud === true;
  } catch {
    return false;
  }
}

/**
 * Flatten a DrapeRow record into the columns-row shape the existing
 * DatabaseView UI expects: id + timestamps + every jsonb key pulled
 * up to the top level. `rowid` is aliased to `id` so the update/
 * delete flow (which passes { rowid }) works unchanged.
 */
function flattenDrapeRow(row: any): Record<string, any> {
  const flat: Record<string, any> = {
    rowid: row.id,
    id: row.id,
    end_user_id: row.end_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.data && typeof row.data === 'object') {
    for (const [k, v] of Object.entries(row.data)) {
      if (k in flat) continue; // don't let payload overwrite id/timestamps
      flat[k] = v;
    }
  }
  return flat;
}

/**
 * Derive columns from a set of drape_rows. Order optimises for
 * at-a-glance readability in the mobile DB viewer: the grid only
 * shows the first 3 columns in each row, so payload keys must come
 * BEFORE meta (end_user_id, timestamps) — otherwise the user sees
 * three meta columns and has to open the row modal to read anything.
 *
 * Final order: id, ...payload keys (first-seen), end_user_id,
 * created_at, updated_at.
 */
function deriveDrapeColumns(rows: any[]): string[] {
  const payload: string[] = [];
  const seen = new Set<string>(['id', 'end_user_id', 'created_at', 'updated_at']);
  for (const r of rows) {
    if (!r.data || typeof r.data !== 'object') continue;
    for (const k of Object.keys(r.data)) {
      if (seen.has(k)) continue;
      seen.add(k);
      payload.push(k);
    }
  }
  return ['id', ...payload, 'end_user_id', 'created_at', 'updated_at'];
}

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

  // Drape Cloud short-circuit: no container needed, data lives in our
  // central Postgres. Surface a pseudo-database so the existing UI
  // flow (pick DB → see tables) works unchanged.
  const drapeCloudActive = await isDrapeCloudProject(projectId);
  if (drapeCloudActive) {
    log.info(`[DB] Project ${projectId} is on Drape Cloud — skipping container probe`);
    return res.json({
      databases: [{ path: '__drape__', fullPath: 'drape-cloud' }],
      drapeCloudDetected: true,
      pgDetected: false,
      containerReady: true,
    });
  }

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

  // Check for Neon connection (DATABASE_URL with neon.tech)
  let supabaseDetected = false;
  let supabaseUrl = '';
  const neonCheck = await dockerService.exec(
    agentUrl,
    `grep -s 'DATABASE_URL' .env.local .env 2>/dev/null | head -1 || true`,
    '/home/coder/project', 3000, true,
  );
  const neonMatch = neonCheck.stdout.match(/DATABASE_URL=(.+)/);
  if (neonMatch && neonMatch[1].includes('neon.tech')) {
    supabaseDetected = true; // reuse flag for UI compatibility
    supabaseUrl = neonMatch[1].trim();
  }

  // Check for Supabase connection (.env.local with SUPABASE_URL)
  if (!supabaseDetected) {
    const supabaseCheck = await dockerService.exec(
      agentUrl,
      `grep -s NEXT_PUBLIC_SUPABASE_URL .env.local .env 2>/dev/null | head -1 || true`,
      '/home/coder/project', 3000, true,
    );
    const supabaseMatch = supabaseCheck.stdout.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
    if (supabaseMatch) {
      supabaseDetected = true;
      supabaseUrl = supabaseMatch[1].trim();
    }
  }

  // Also read anon key and service role key for Supabase API access
  let supabaseAnonKey = '';
  let supabaseServiceKey = '';
  if (supabaseDetected) {
    const keysCheck = await dockerService.exec(
      agentUrl,
      `grep -s 'NEXT_PUBLIC_SUPABASE_ANON_KEY\\|SUPABASE_SERVICE_ROLE_KEY' .env.local .env 2>/dev/null || true`,
      '/home/coder/project', 3000, true,
    );
    const anonMatch = keysCheck.stdout.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
    if (anonMatch) supabaseAnonKey = anonMatch[1].trim();
    const svcMatch = keysCheck.stdout.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/);
    if (svcMatch) supabaseServiceKey = svcMatch[1].trim();

    // Return cloud DB as a "database" so the existing UI flow works
    if (supabaseUrl) {
      const isNeon = supabaseUrl.includes('neon.tech');
      files.push({ path: isNeon ? '__neon__' : '__supabase__', fullPath: supabaseUrl });
    }
  }

  res.json({ databases: files, pgDetected, supabaseDetected, supabaseUrl, supabaseAnonKey, supabaseServiceKey, containerReady: true });
}));

// ─── Helper: query Neon PostgreSQL via pg inside container ───
async function neonSQL(agentUrl: string, sql: string): Promise<any[]> {
  await ensurePg(agentUrl);
  // Write query script to container, load .env.local, execute
  const scriptContent = [
    'const{Pool}=require("pg");',
    'const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});',
    `p.query(${JSON.stringify(sql)}).then(r=>{console.log(JSON.stringify(r.rows));p.end()}).catch(e=>{console.error(e.message);process.exit(1)});`,
  ].join('');
  await dockerService.exec(agentUrl, `cat > /home/coder/project/.nq.cjs << 'NQEOF'\n${scriptContent}\nNQEOF`, '/home/coder/project', 3000, true);
  const result = await dockerService.exec(agentUrl,
    `bash -c 'cd /home/coder/project && set -a && source .env.local 2>/dev/null; source .env 2>/dev/null && set +a && node .nq.cjs'`,
    '/home/coder/project', 15000, true
  );
  const stdout = result.stdout?.trim();
  if (!stdout || !stdout.startsWith('[')) {
    log.warn(`[DB] neonSQL stderr: ${result.stderr?.substring(0, 300)}`);
    throw new Error(`Neon query returned no data: ${stdout?.substring(0, 200)}`);
  }
  return JSON.parse(stdout);
}

// ─── Helper: run multiple Neon queries in a single node execution ───
async function neonMultiQuery(agentUrl: string, queries: string[]): Promise<any[][]> {
  await ensurePg(agentUrl);
  const queryArray = JSON.stringify(queries);
  const scriptContent = [
    'const{Pool}=require("pg");',
    'const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});',
    `const queries=${queryArray};`,
    '(async()=>{const results=[];for(const q of queries){const r=await p.query(q);results.push(r.rows)}console.log(JSON.stringify(results));await p.end()})().catch(e=>{console.error(e.message);process.exit(1)});',
  ].join('');
  await dockerService.exec(agentUrl, `cat > /home/coder/project/.nq.cjs << 'NQEOF'\n${scriptContent}\nNQEOF`, '/home/coder/project', 3000, true);
  const result = await dockerService.exec(agentUrl,
    `bash -c 'cd /home/coder/project && set -a && source .env.local 2>/dev/null; source .env 2>/dev/null && set +a && node .nq.cjs'`,
    '/home/coder/project', 15000, true
  );
  const stdout = result.stdout?.trim();
  if (!stdout || !stdout.startsWith('[')) {
    throw new Error(`Neon multi-query returned no data: ${stdout?.substring(0, 200)}`);
  }
  return JSON.parse(stdout);
}

// Ensure pg is installed in the container
async function ensurePg(agentUrl: string) {
  const check = await dockerService.exec(agentUrl, `node -e "require('pg')" 2>&1 && echo ok`, '/home/coder/project', 5000, true);
  if (check.stdout?.includes('ok')) return;
  log.info(`[DB] Installing pg in container...`);
  await dockerService.exec(agentUrl, `npm install pg --no-save --legacy-peer-deps 2>/dev/null`, '/home/coder/project', 30000, true);
}

// ─── Helper: query Supabase via REST API ───
async function supabaseQuery(url: string, serviceKey: string, sql: string): Promise<any[]> {
  const res = await axios.post(
    `${url}/rest/v1/rpc/`,
    {},
    { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }, timeout: 10000 }
  );
  return res.data;
}

async function supabaseSQL(url: string, serviceKey: string, sql: string): Promise<any> {
  // Use the Supabase Management API to run SQL
  const projectRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) throw new Error('Invalid Supabase URL');

  const accessToken = config.supabaseAccessToken;
  if (!accessToken) throw new Error('Supabase access token not configured');

  const res = await axios.post(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    { query: sql },
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return res.data;
}

// ─── GET /db/tables/:projectId ───
// List tables with row counts for a given database
dbRouter.get('/tables/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const dbPath = req.query.db as string;
  if (!dbPath) return res.status(400).json({ error: 'db query param required' });

  // Drape Cloud tables — query our central Postgres directly. "Tables"
  // here are the logical table_name values the generated app has
  // inserted into. No container needed. Plus two virtual system
  // tables (users, sessions) sourced from drape_end_users /
  // drape_sessions so the project owner can see their auth data.
  if (dbPath === '__drape__') {
    if (!(await isDrapeCloudProject(projectId))) {
      return res.status(400).json({ error: 'Project is not on Drape Cloud' });
    }
    try {
      const sql = getDrapeCloudSql();
      const [dataTables, usersCount] = await Promise.all([
        sql<{ name: string; rowcount: string }[]>`
          SELECT table_name AS name, COUNT(*)::text AS rowcount
          FROM drape_rows
          WHERE project_id = ${projectId}
          GROUP BY table_name
          ORDER BY table_name
        `,
        sql<{ c: string }[]>`
          SELECT COUNT(*)::text AS c FROM drape_end_users WHERE project_id = ${projectId}
        `,
      ]);
      const tables = dataTables.map((r) => ({
        name: r.name,
        rowCount: Number(r.rowcount) || 0,
        system: false,
      }));
      tables.push({ name: 'users', rowCount: Number(usersCount[0]?.c || 0), system: true });
      return res.json({ tables });
    } catch (err: any) {
      log.warn(`[DB] Drape Cloud tables query failed for ${projectId}: ${err.message}`);
      return res.status(500).json({ error: `Drape Cloud query failed: ${err.message}` });
    }
  }

  // Neon tables — query via pg inside container
  if (dbPath === '__neon__') {
    const uid = req.userId!;
    const agentUrl = await getAgentUrl(projectId, uid);

    try {
      const tables = await neonSQL(agentUrl,
        `SELECT relname as name, n_live_tup::int as "rowCount" FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname`
      );
      return res.json({ tables: tables.map((t: any) => ({ name: t.name, rowCount: parseInt(t.rowCount) || 0 })) });
    } catch (err: any) {
      log.warn(`[DB] Neon tables query failed: ${err.message}`);
      return res.status(500).json({ error: `Neon query failed: ${err.message}` });
    }
  }

  // Supabase tables — query via Management API
  if (dbPath === '__supabase__') {
    const uid = req.userId!;
    const agentUrl = await getAgentUrl(projectId, uid);
    const envCheck = await dockerService.exec(
      agentUrl,
      `grep -s NEXT_PUBLIC_SUPABASE_URL .env.local .env 2>/dev/null | head -1 || true`,
      '/home/coder/project', 3000, true,
    );
    const urlMatch = envCheck.stdout.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
    if (!urlMatch) return res.status(400).json({ error: 'Supabase URL not found' });
    const supabaseUrl = urlMatch[1].trim();

    try {
      // Single query to get all tables with row counts (much faster than N queries)
      const tables = await supabaseSQL(supabaseUrl, '', `
        SELECT
          schemaname || '.' || relname as full_name,
          relname as name,
          n_live_tup as "rowCount"
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY relname
      `);

      return res.json({ tables: tables.map((t: any) => ({ name: t.name, rowCount: parseInt(t.rowCount) || 0 })) });
    } catch (err: any) {
      log.warn(`[DB] Supabase tables query failed: ${err.message}`);
      return res.status(500).json({ error: `Supabase query failed: ${err.message}` });
    }
  }

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

  // Drape Cloud rows — paginated list from drape_rows. Columns are
  // inferred from the jsonb payload keys; each row is flattened so
  // existing update/delete flows (which pass rowid=id) work without
  // UI changes.
  if (dbPath === '__drape__') {
    if (!(await isDrapeCloudProject(projectId))) {
      return res.status(400).json({ error: 'Project is not on Drape Cloud' });
    }

    // Virtual system tables — read-only view on auth data.
    if (table === 'users' || table === 'sessions') {
      try {
        const sql = getDrapeCloudSql();
        const offset = page * limit;
        if (table === 'users') {
          // Hide anonymous visitors by default — the SDK creates a row on every
          // preview load (QA agent, device visits), cluttering the viewer.
          const includeAnonymous = req.query.includeAnonymous === 'true';
          const [rows, count] = await Promise.all([
            includeAnonymous
              ? sql<any[]>`
                  SELECT id, email, display_name, is_anonymous, anonymous_id, created_at, updated_at
                  FROM drape_end_users
                  WHERE project_id = ${projectId}
                  ORDER BY created_at DESC
                  LIMIT ${limit} OFFSET ${offset}
                `
              : sql<any[]>`
                  SELECT id, email, display_name, is_anonymous, anonymous_id, created_at, updated_at
                  FROM drape_end_users
                  WHERE project_id = ${projectId} AND is_anonymous = false
                  ORDER BY created_at DESC
                  LIMIT ${limit} OFFSET ${offset}
                `,
            includeAnonymous
              ? sql<{ c: string }[]>`SELECT COUNT(*)::text AS c FROM drape_end_users WHERE project_id = ${projectId}`
              : sql<{ c: string }[]>`SELECT COUNT(*)::text AS c FROM drape_end_users WHERE project_id = ${projectId} AND is_anonymous = false`,
          ]);
          // Always report the full count so the UI can show how many are hidden.
          const totalAll = includeAnonymous
            ? Number(count[0]?.c || 0)
            : Number(
                (await sql<{ c: string }[]>`SELECT COUNT(*)::text AS c FROM drape_end_users WHERE project_id = ${projectId}`)[0]?.c || 0,
              );
          return res.json({
            rows: rows.map((r: any) => ({ rowid: r.id, ...r })),
            columns: ['id', 'email', 'display_name', 'is_anonymous', 'anonymous_id', 'created_at', 'updated_at'],
            total: Number(count[0]?.c || 0),
            totalAll,
            readOnly: true,
            anonymousFilterApplied: !includeAnonymous,
          });
        }
        // sessions
        const [rows, count] = await Promise.all([
          sql<any[]>`
            SELECT token, end_user_id, created_at, expires_at
            FROM drape_sessions
            WHERE project_id = ${projectId}
            ORDER BY created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `,
          sql<{ c: string }[]>`SELECT COUNT(*)::text AS c FROM drape_sessions WHERE project_id = ${projectId}`,
        ]);
        return res.json({
          rows: rows.map((r: any) => ({
            rowid: r.token,
            // Mask the session token (security) — only first 12 chars visible.
            token: typeof r.token === 'string' ? `${r.token.slice(0, 12)}...` : r.token,
            end_user_id: r.end_user_id,
            created_at: r.created_at,
            expires_at: r.expires_at,
          })),
          columns: ['token', 'end_user_id', 'created_at', 'expires_at'],
          total: Number(count[0]?.c || 0),
          readOnly: true,
        });
      } catch (err: any) {
        return res.status(500).json({ error: `Drape Cloud ${table} query failed: ${err.message}` });
      }
    }

    try {
      const store = new ScopedRowStore(projectId);
      const where: Record<string, unknown> | undefined =
        filterCol && filterOp && filterVal !== undefined
          ? { [filterCol]: filterOp === 'like' ? { ilike: `%${filterVal}%` } : { [filterOp]: filterVal } }
          : undefined;
      const { rows } = await store.list({
        tableName: table,
        where,
        orderBy: '-created_at',
        limit,
        offset: page * limit,
      });
      const sql = getDrapeCloudSql();
      const countRows = await sql<{ c: string }[]>`
        SELECT COUNT(*)::text AS c FROM drape_rows
        WHERE project_id = ${projectId} AND table_name = ${table}
      `;
      const total = Number(countRows[0]?.c || 0);
      const columns = deriveDrapeColumns(rows);
      return res.json({
        rows: rows.map(flattenDrapeRow),
        columns,
        total,
      });
    } catch (err: any) {
      log.warn(`[DB] Drape Cloud rows query failed: ${err.message}`);
      return res.status(500).json({ error: `Drape Cloud query failed: ${err.message}` });
    }
  }

  // Neon rows — single combined query via pg inside container
  if (dbPath === '__neon__') {
    const uid = req.userId!;
    const agentUrl = await getAgentUrl(projectId, uid);
    try {
      let whereClause = '';
      if (filterCol && filterOp && filterVal !== undefined) {
        const ops: Record<string, string> = { eq: '=', neq: '!=', gt: '>', lt: '<', like: 'LIKE' };
        const sqlOp = ops[filterOp] || '=';
        const val = filterOp === 'like' ? `%${filterVal.replace(/'/g, "''")}%` : filterVal.replace(/'/g, "''");
        whereClause = `WHERE "${filterCol}" ${sqlOp} '${val}'`;
      }
      const offset = page * limit;
      const result = await neonMultiQuery(agentUrl, [
        `SELECT count(*)::int as c FROM public."${table}" ${whereClause}`,
        `SELECT * FROM public."${table}" ${whereClause} LIMIT ${limit} OFFSET ${offset}`,
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' ORDER BY ordinal_position`,
      ]);
      return res.json({
        total: result[0][0]?.c || 0,
        rows: result[1],
        columns: result[2].map((c: any) => c.column_name),
      });
    } catch (err: any) {
      return res.status(500).json({ error: `Neon query failed: ${err.message}` });
    }
  }

  // Supabase rows
  if (dbPath === '__supabase__') {
    const uid = req.userId!;
    const agentUrl = await getAgentUrl(projectId, uid);
    const envCheck = await dockerService.exec(agentUrl, `grep -s NEXT_PUBLIC_SUPABASE_URL .env.local .env 2>/dev/null | head -1 || true`, '/home/coder/project', 3000, true);
    const urlMatch = envCheck.stdout.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
    if (!urlMatch) return res.status(400).json({ error: 'Supabase URL not found' });
    const supabaseUrl = urlMatch[1].trim();

    try {
      let whereClause = '';
      if (filterCol && filterOp && filterVal !== undefined) {
        const ops: Record<string, string> = { eq: '=', neq: '!=', gt: '>', lt: '<', like: 'LIKE' };
        const sqlOp = ops[filterOp] || '=';
        const val = filterOp === 'like' ? `'%${filterVal.replace(/'/g, "''")}%'` : `'${filterVal.replace(/'/g, "''")}'`;
        whereClause = `WHERE "${filterCol}" ${sqlOp} ${val}`;
      }

      const offset = page * limit;
      const countResult = await supabaseSQL(supabaseUrl, '', `SELECT count(*) as c FROM public."${table}" ${whereClause}`);
      const totalRows = countResult[0]?.c || 0;
      const rows = await supabaseSQL(supabaseUrl, '', `SELECT * FROM public."${table}" ${whereClause} LIMIT ${limit} OFFSET ${offset}`);

      // Get column info
      const colResult = await supabaseSQL(supabaseUrl, '', `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = '${table}'
        ORDER BY ordinal_position
      `);
      const columns = colResult.map((c: any) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        defaultValue: c.column_default,
      }));

      // Normalize to match SQLite format: columns as string[], total as number
      return res.json({
        rows,
        columns: columns.map((c: any) => c.name),
        total: typeof totalRows === 'number' ? totalRows : parseInt(totalRows) || 0,
      });
    } catch (err: any) {
      return res.status(500).json({ error: `Supabase query failed: ${err.message}` });
    }
  }

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

  // Drape Cloud schema — inferred from the jsonb keys. Each logical
  // table becomes one entry; columns are the union of keys across
  // the first 200 rows of that table (cheap sample).
  if (dbPath === '__drape__') {
    if (!(await isDrapeCloudProject(projectId))) {
      return res.status(400).json({ error: 'Project is not on Drape Cloud' });
    }
    try {
      const sql = getDrapeCloudSql();
      const tables = await sql<{ name: string; rowcount: string }[]>`
        SELECT table_name AS name, COUNT(*)::text AS rowcount
        FROM drape_rows
        WHERE project_id = ${projectId}
        GROUP BY table_name
        ORDER BY table_name
      `;
      const schema: any[] = [];
      for (const t of tables) {
        const sample = await sql<any[]>`
          SELECT data FROM drape_rows
          WHERE project_id = ${projectId} AND table_name = ${t.name}
          ORDER BY created_at DESC LIMIT 200
        `;
        const keys = deriveDrapeColumns(sample.map((r) => ({ data: r.data })));
        schema.push({
          name: t.name,
          sql: `-- Drape Cloud jsonb-backed table\n-- Rows live in drape_rows with table_name='${t.name}'`,
          columns: keys.map((k, i) => ({
            cid: i,
            name: k,
            type: k === 'id' || k === 'end_user_id' ? 'uuid' : k.endsWith('_at') ? 'timestamptz' : 'jsonb',
            notnull: k === 'id' ? 1 : 0,
            dflt_value: null,
            pk: k === 'id' ? 1 : 0,
          })),
          foreignKeys: [],
          rowCount: Number(t.rowcount) || 0,
        });
      }
      return res.json({ schema });
    } catch (err: any) {
      return res.status(500).json({ error: `Drape Cloud schema query failed: ${err.message}` });
    }
  }

  const uid = req.userId!;
  const agentUrl = await getAgentUrl(projectId, uid);

  // Neon schema
  if (dbPath === '__neon__') {
    try {
      const tables = await neonSQL(agentUrl, `SELECT tablename as name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
      const schema = [];
      for (const t of tables) {
        const cols = await neonSQL(agentUrl, `SELECT column_name as name, data_type as type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='${t.name}' ORDER BY ordinal_position`);
        const fks = await neonSQL(agentUrl, `SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name='${t.name}'`);
        const cnt = await neonSQL(agentUrl, `SELECT count(*)::int as c FROM public."${t.name}"`);
        schema.push({
          name: t.name,
          columns: cols.map((c: any) => ({ name: c.name, type: c.type, notnull: c.is_nullable === 'NO' ? 1 : 0, dflt_value: c.column_default })),
          foreignKeys: fks,
          rowCount: cnt[0]?.c || 0,
        });
      }
      return res.json({ schema });
    } catch (err: any) {
      return res.status(500).json({ error: `Neon schema query failed: ${err.message}` });
    }
  }

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

  if (dbPath === '__drape__') {
    if (!(await isDrapeCloudProject(projectId))) {
      return res.status(400).json({ error: 'Project is not on Drape Cloud' });
    }
    if (table === 'users' || table === 'sessions') {
      return res.status(400).json({ error: `'${table}' is a Drape Cloud system table and is read-only` });
    }
    // Meta columns (id/timestamps/end_user_id) are not editable via
    // the database viewer — they're managed by the SDK.
    if (['id', 'rowid', 'created_at', 'updated_at', 'end_user_id'].includes(column)) {
      return res.status(400).json({ error: `Column '${column}' is managed by Drape Cloud and cannot be edited` });
    }
    try {
      const store = new ScopedRowStore(projectId);
      const updated = await store.update({
        tableName: table,
        id: String(rowid),
        data: { [column]: value },
      });
      if (!updated) return res.status(404).json({ error: 'Row not found' });
      return res.json({ changes: 1 });
    } catch (err: any) {
      return res.status(500).json({ error: `Drape Cloud update failed: ${err.message}` });
    }
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

  if (dbPath === '__drape__') {
    if (!(await isDrapeCloudProject(projectId))) {
      return res.status(400).json({ error: 'Project is not on Drape Cloud' });
    }
    if (table === 'users' || table === 'sessions') {
      return res.status(400).json({ error: `'${table}' is a Drape Cloud system table and is read-only` });
    }
    try {
      // Strip meta columns from payload — they're DB-assigned.
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (['id', 'rowid', 'created_at', 'updated_at', 'end_user_id'].includes(k)) continue;
        clean[k] = v;
      }
      const store = new ScopedRowStore(projectId);
      const row = await store.insert({ tableName: table, data: clean });
      return res.json({ lastInsertRowid: row.id, changes: 1 });
    } catch (err: any) {
      return res.status(500).json({ error: `Drape Cloud insert failed: ${err.message}` });
    }
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

  if (dbPath === '__drape__') {
    if (!(await isDrapeCloudProject(projectId))) {
      return res.status(400).json({ error: 'Project is not on Drape Cloud' });
    }
    if (table === 'users' || table === 'sessions') {
      return res.status(400).json({ error: `'${table}' is a Drape Cloud system table and is read-only` });
    }
    try {
      const store = new ScopedRowStore(projectId);
      const deleted = await store.delete(table, String(rowid));
      return res.json({ changes: deleted ? 1 : 0 });
    } catch (err: any) {
      return res.status(500).json({ error: `Drape Cloud delete failed: ${err.message}` });
    }
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

// ─── POST /db/create-table/:projectId ───
// Create a new Drape Cloud table (append to declared-tables.json).
// No-op on non-Drape-Cloud projects (classic SQLite tables are created via SQL).
dbRouter.post('/create-table/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { name, scope, purpose, seedable, fields } = req.body || {};

  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    return res.status(400).json({ error: 'Invalid table name. Use snake_case, letters/numbers/underscore, max 64 chars.' });
  }
  if (scope !== 'shared' && scope !== 'mine' && scope !== 'junction') {
    return res.status(400).json({ error: 'scope must be "shared", "mine" or "junction"' });
  }
  if (!(await isDrapeCloudProject(projectId))) {
    return res.status(400).json({ error: 'Table creation is only available on Drape Cloud projects' });
  }
  if (name === 'users' || name === 'sessions') {
    return res.status(400).json({ error: `'${name}' is reserved for the Drape Cloud auth system` });
  }

  try {
    const result = await applyDeclareChange(projectId, {
      add: [{
        name: name.toLowerCase(),
        scope,
        purpose: typeof purpose === 'string' ? purpose.trim().slice(0, 200) : '',
        seedable: seedable === true || (seedable === undefined && scope === 'shared'),
        ...(Array.isArray(fields) ? { fields } : {}),
      } as any],
    });
    return res.json({ tables: result.tables, warnings: result.warnings });
  } catch (err: any) {
    return res.status(500).json({ error: `Failed to create table: ${err.message}` });
  }
}));

// ─── POST /db/query/:projectId ───
// Execute raw SQL (read-only by default)
dbRouter.post('/query/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const { db: dbPath, sql } = req.body;
  if (!dbPath || !sql) return res.status(400).json({ error: 'db and sql are required' });

  if (dbPath === '__drape__') {
    return res.status(400).json({
      error: 'Raw SQL is not available on Drape Cloud — data lives in a shared jsonb-backed store. Use the Rows tab or the drape SDK instead.',
    });
  }

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

  if (dbPath === '__drape__') {
    if (!(await isDrapeCloudProject(projectId))) {
      return res.status(400).send('Project is not on Drape Cloud');
    }
    const store = new ScopedRowStore(projectId);
    const { rows } = await store.list({ tableName: table, limit: 10000, orderBy: '-created_at' });
    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
      return res.send('');
    }
    const flat = rows.map(flattenDrapeRow);
    const cols = deriveDrapeColumns(rows);
    const esc = (v: unknown) => {
      const s = String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };
    const lines = [cols.join(',')];
    for (const r of flat) lines.push(cols.map((c) => esc(r[c])).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${table}.csv"`);
    return res.send(lines.join('\n'));
  }

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
