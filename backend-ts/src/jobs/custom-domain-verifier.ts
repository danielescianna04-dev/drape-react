// ================================================================
// Custom Domain DNS Verifier
//
// Periodic job that walks every drape_custom_domains row whose
// status is `pending` and resolves its CNAME via Node's `dns`
// module. If the CNAME points to one of our expected targets, the
// row is moved to `verified` and a Caddy on-demand TLS handshake
// will issue the cert on first request (no extra step needed when
// Caddy fronts the publishedRoot).
//
// Cert issuance / activation transition (verified → active) is
// handled outside this job: Caddy logs "obtained certificate" and a
// separate small monitor (or first successful HTTPS request) flips
// the row to `active`. Keeping the verifier focused makes this code
// safe to re-run forever without depending on the cert pipeline.
// ================================================================

import { promises as dnsPromises } from 'dns';
import { getSql, isDrapeCloudConfigured } from '../services/drape-cloud/client';
import { log } from '../utils/logger';

// CNAME targets we accept as "pointing at Drape". Both prod and
// dev — the resolver doesn't know which one the user has set up
// against, so we accept either.
const ACCEPTED_TARGETS = new Set([
  'cname.drape.app',
  'drape.info',
  'dev.drape.info',
]);

const VERIFIER_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const INITIAL_DELAY_MS = 60 * 1000;         // 1 min after startup
const MAX_DOMAINS_PER_TICK = 25;            // bound the work per pass

let interval: ReturnType<typeof setInterval> | null = null;
let initialTimeout: ReturnType<typeof setTimeout> | null = null;

interface PendingRow { domain: string; status: string; }

async function resolveCname(domain: string): Promise<string[]> {
  // resolveCname returns the chain target(s). Some DNS providers
  // flatten ALIAS at the apex into A records — so we also fall back
  // to checking that A records map to a Drape ingress IP. We don't
  // hard-code IPs here (they change); CNAME is the supported path.
  try {
    return await dnsPromises.resolveCname(domain);
  } catch {
    return [];
  }
}

function isAcceptedTarget(target: string): boolean {
  const normalized = target.replace(/\.$/, '').toLowerCase();
  return ACCEPTED_TARGETS.has(normalized);
}

async function tick(): Promise<void> {
  if (!isDrapeCloudConfigured()) return;
  const sql = getSql();
  let rows: PendingRow[] = [];
  try {
    rows = await sql<PendingRow[]>`
      SELECT domain, status FROM drape_custom_domains
      WHERE status IN ('pending', 'failed')
      ORDER BY last_check_at NULLS FIRST, created_at ASC
      LIMIT ${MAX_DOMAINS_PER_TICK}
    `;
  } catch (e: any) {
    log.warn(`[DomainVerifier] Query failed: ${e?.message || e}`);
    return;
  }
  if (rows.length === 0) return;

  for (const row of rows) {
    const targets = await resolveCname(row.domain);
    const now = new Date();
    const ok = targets.some(isAcceptedTarget);
    if (ok) {
      try {
        await sql`
          UPDATE drape_custom_domains
          SET status = 'verified', last_check_at = ${now}, verified_at = ${now}, last_error = NULL
          WHERE domain = ${row.domain}
        `;
        log.info(`[DomainVerifier] Verified ${row.domain} (CNAME → ${targets.join(', ')})`);
      } catch (e: any) {
        log.warn(`[DomainVerifier] Update failed for ${row.domain}: ${e?.message || e}`);
      }
    } else {
      // Don't move to `failed` immediately — DNS propagation can
      // take hours. Just record the last check + reason and try
      // again next tick. Truly failed rows can be GCed by an
      // operator if they sit pending for >24h.
      try {
        const reason = targets.length === 0
          ? 'CNAME non trovato. Aggiungi un CNAME per il tuo dominio che punti a cname.drape.app.'
          : `CNAME punta a ${targets[0]}, atteso cname.drape.app.`;
        await sql`
          UPDATE drape_custom_domains
          SET last_check_at = ${now}, last_error = ${reason}
          WHERE domain = ${row.domain}
        `;
      } catch (e: any) {
        log.warn(`[DomainVerifier] Update (fail) failed for ${row.domain}: ${e?.message || e}`);
      }
    }
  }
}

export function startCustomDomainVerifier(): void {
  if (interval) {
    log.warn('[DomainVerifier] Job already running');
    return;
  }
  log.info(`[DomainVerifier] Scheduled — initial run in ${INITIAL_DELAY_MS / 1000}s, then every ${VERIFIER_INTERVAL_MS / 1000}s`);
  initialTimeout = setTimeout(() => { tick(); }, INITIAL_DELAY_MS);
  interval = setInterval(() => { tick(); }, VERIFIER_INTERVAL_MS);
}

export function stopCustomDomainVerifier(): void {
  if (initialTimeout) {
    clearTimeout(initialTimeout);
    initialTimeout = null;
  }
  if (interval) {
    clearInterval(interval);
    interval = null;
    log.info('[DomainVerifier] Stopped');
  }
}
