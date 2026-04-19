#!/usr/bin/env node
/**
 * Applies src/services/drape-cloud/schema.sql to the configured
 * Drape Cloud database. Idempotent (all CREATE TABLE / INDEX use
 * IF NOT EXISTS). Safe to run on every deploy.
 *
 * Usage:
 *   DRAPE_CLOUD_DB_URL=postgres://... node scripts/drape-cloud-migrate.js
 */

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

async function main() {
  const url = process.env.DRAPE_CLOUD_DB_URL;
  if (!url) {
    console.error('DRAPE_CLOUD_DB_URL is not set');
    process.exit(1);
  }

  // Try src first (local dev) then dist (production deploy rsync'd only dist + scripts).
  const candidates = [
    path.join(__dirname, '..', 'src', 'services', 'drape-cloud', 'schema.sql'),
    path.join(__dirname, '..', 'dist', 'services', 'drape-cloud', 'schema.sql'),
  ];
  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    console.error('[drape-cloud-migrate] schema.sql not found in any of:', candidates);
    process.exit(1);
  }
  const ddl = fs.readFileSync(schemaPath, 'utf8');

  const sql = postgres(url, { max: 1, idle_timeout: 5, connect_timeout: 10 });
  try {
    console.log(`[drape-cloud-migrate] applying schema → ${url.replace(/:[^:@]*@/, ':***@')}`);
    await sql.unsafe(ddl);
    console.log('[drape-cloud-migrate] done');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('[drape-cloud-migrate] failed:', err.message);
  process.exit(1);
});
