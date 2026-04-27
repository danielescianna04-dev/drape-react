#!/usr/bin/env node
/**
 * Seeds the official Drape MCP servers into Firestore (`mcps_public`).
 * Idempotent — re-run anytime; install counters are preserved.
 *
 * Usage (from /opt/drape-backend-dev or similar):
 *   set -a && . ./.env && set +a && node scripts/seed-mcps.js
 *
 * Each server uses npx invocations from the @modelcontextprotocol/* family
 * so the user doesn't need to install binaries. Required env vars (API
 * tokens) are declared but not filled — the user supplies them after install
 * via PATCH /mcps/:id/env.
 */

const path = require('path');
const admin = require('firebase-admin');

const serviceAccountPath = path.join(__dirname, '..', 'service-account-key.json');

if (!admin.apps.length) {
  try {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccountPath) });
  } catch (e) {
    console.error('Could not init Firebase admin:', e.message);
    process.exit(1);
  }
}

let upsertOfficial;
try {
  ({ upsertOfficial } = require('../dist/services/mcp.service'));
  const { firebaseService } = require('../dist/services/firebase.service');
  firebaseService.initialize();
} catch (e) {
  console.error('Could not load dist/services/mcp.service. Did you build first?');
  console.error(e.message);
  process.exit(1);
}

const MCPS = [
  {
    id: 'drape-mcp-filesystem',
    slug: 'filesystem',
    name: 'Filesystem',
    description: 'Leggi e scrivi file in una directory locale del progetto. Utile per refactor mirati, ricerche full-text, generazione di file.',
    category: 'dev',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
    env: [],
    tags: ['files', 'fs', 'read', 'write'],
  },
  {
    id: 'drape-mcp-github',
    slug: 'github',
    name: 'GitHub',
    description: 'Crea issue, leggi PR, commenta, gestisci repository. Richiede un Personal Access Token con scope repo.',
    category: 'dev',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: [
      {
        name: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        label: 'Personal Access Token',
        description: 'Generalo su github.com/settings/tokens (scope `repo` per repo privati).',
        isSecret: true,
        placeholder: 'ghp_...',
        required: true,
      },
    ],
    tags: ['github', 'git', 'pr', 'issues'],
  },
  {
    id: 'drape-mcp-brave-search',
    slug: 'brave-search',
    name: 'Brave Search',
    description: 'Web search privacy-first via Brave. Utile per ricerche real-time durante la generazione (docs, esempi, news).',
    category: 'web',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: [
      {
        name: 'BRAVE_API_KEY',
        label: 'Brave API Key',
        description: 'Free tier disponibile su api.search.brave.com.',
        isSecret: true,
        placeholder: 'BSA...',
        required: true,
      },
    ],
    tags: ['search', 'web', 'brave'],
  },
  {
    id: 'drape-mcp-fetch',
    slug: 'fetch',
    name: 'Fetch',
    description: 'Scarica e converte pagine web in markdown. Per quando il modello deve leggere documentazione o pagine specifiche.',
    category: 'web',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    env: [],
    tags: ['fetch', 'http', 'markdown'],
  },
  {
    id: 'drape-mcp-sqlite',
    slug: 'sqlite',
    name: 'SQLite',
    description: 'Query e modifica database SQLite locali. Schema introspection, SELECT/INSERT/UPDATE, creazione tabelle.',
    category: 'data',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '${SQLITE_DB_PATH}'],
    env: [
      {
        name: 'SQLITE_DB_PATH',
        label: 'Path al file .db',
        description: 'Percorso assoluto del file SQLite (es. /workspace/data.db).',
        placeholder: '/workspace/data.db',
        required: true,
      },
    ],
    tags: ['sql', 'db', 'sqlite'],
  },
  {
    id: 'drape-mcp-puppeteer',
    slug: 'puppeteer',
    name: 'Puppeteer',
    description: 'Automatizza un browser headless: screenshot, scraping, test E2E. Per validare visivamente le UI generate.',
    category: 'web',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    env: [],
    tags: ['browser', 'screenshot', 'scraping', 'e2e'],
  },
];

async function main() {
  console.log(`🌱 Seeding ${MCPS.length} official MCPs into mcps_public...`);
  for (const m of MCPS) {
    try {
      await upsertOfficial(m.id, {
        slug: m.slug,
        name: m.name,
        description: m.description,
        category: m.category,
        command: m.command,
        args: m.args,
        env: m.env,
        tags: m.tags,
      });
      console.log(`  ✓ ${m.slug} — ${m.name}`);
    } catch (err) {
      console.error(`  ✗ ${m.slug} — ${err && err.message ? err.message : err}`);
    }
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
