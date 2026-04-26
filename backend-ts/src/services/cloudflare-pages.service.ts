/**
 * Cloudflare Pages publishing backend.
 *
 * Each published Drape app becomes a CF Pages project named after its slug.
 * - Project lifecycle (create/delete/domain) via CF REST API.
 * - File upload + deployment via `wrangler pages deploy` shelled out — wrangler
 *   handles BLAKE3 hashing, missing-asset checks, batched uploads and manifest
 *   creation, which we don't want to reimplement.
 *
 * Requires env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID
 * (zone id only used when attaching <slug>.{publishDomain} as custom domain).
 */

import { spawn } from 'child_process';
import { config } from '../config';
import { log } from '../utils/logger';

const CF_API = 'https://api.cloudflare.com/client/v4';

interface CfResponse<T = unknown> {
  success: boolean;
  errors?: Array<{ code: number; message: string }>;
  messages?: unknown[];
  result?: T;
}

function cfHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${config.cloudflareApiToken}`,
    'Content-Type': 'application/json',
  };
}

async function cfFetch<T = unknown>(path: string, init?: RequestInit): Promise<CfResponse<T>> {
  const url = `${CF_API}${path}`;
  const r = await fetch(url, {
    ...init,
    headers: { ...cfHeaders(), ...(init?.headers || {}) },
  });
  const text = await r.text();
  let json: CfResponse<T>;
  try {
    json = JSON.parse(text) as CfResponse<T>;
  } catch {
    throw new Error(`Cloudflare API non-JSON response (${r.status}): ${text.slice(0, 200)}`);
  }
  return json;
}

function ensureCredentials(): void {
  if (!config.cloudflareAccountId || !config.cloudflareApiToken) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set');
  }
}

/**
 * Create the Pages project if it doesn't already exist. Idempotent.
 * Returns the canonical *.pages.dev subdomain for the project.
 */
export async function ensureProject(slug: string): Promise<{ subdomain: string }> {
  ensureCredentials();
  const get = await cfFetch<{ subdomain: string }>(
    `/accounts/${config.cloudflareAccountId}/pages/projects/${slug}`,
  );
  if (get.success && get.result) {
    return { subdomain: get.result.subdomain };
  }

  const create = await cfFetch<{ subdomain: string }>(
    `/accounts/${config.cloudflareAccountId}/pages/projects`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: slug,
        production_branch: 'main',
      }),
    },
  );
  if (!create.success || !create.result) {
    const msg = create.errors?.map((e) => e.message).join(', ') || 'unknown';
    throw new Error(`Failed to create CF Pages project ${slug}: ${msg}`);
  }
  return { subdomain: create.result.subdomain };
}

/**
 * Upload `dir` to Cloudflare Pages as the production deployment for `slug`.
 * Shells out to wrangler to avoid reimplementing the chunked upload protocol.
 */
export async function deployStaticSite(
  slug: string,
  dir: string,
): Promise<{ url: string; deploymentId: string | null }> {
  ensureCredentials();
  await ensureProject(slug);

  const args = [
    'wrangler',
    'pages',
    'deploy',
    dir,
    `--project-name=${slug}`,
    '--branch=main',
    '--commit-dirty=true',
  ];

  const env = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: config.cloudflareApiToken,
    CLOUDFLARE_ACCOUNT_ID: config.cloudflareAccountId,
  };

  const { stdout, stderr, exitCode } = await runProcess('npx', args, env);

  if (exitCode !== 0) {
    log.error(`[CFPages] wrangler deploy failed for ${slug}: ${stderr || stdout}`);
    throw new Error(`wrangler deploy exited ${exitCode}: ${(stderr || stdout).slice(0, 400)}`);
  }

  // wrangler logs the URL like:
  //   ✨ Deployment complete! Take a peek over at https://abc123.{slug}.pages.dev
  const urlMatch = stdout.match(/https:\/\/[a-z0-9.-]+\.pages\.dev/i);
  const url = urlMatch ? urlMatch[0] : `https://${slug}.pages.dev`;

  return { url, deploymentId: null };
}

/**
 * Delete the Pages project entirely (drops all deployments + custom domains).
 */
export async function deleteSite(slug: string): Promise<void> {
  ensureCredentials();
  const r = await cfFetch(`/accounts/${config.cloudflareAccountId}/pages/projects/${slug}`, {
    method: 'DELETE',
  });
  if (!r.success) {
    const msg = r.errors?.map((e) => e.message).join(', ') || 'unknown';
    // Treat 'not found' as already-deleted.
    if (msg.toLowerCase().includes('not found')) return;
    throw new Error(`Failed to delete CF Pages project ${slug}: ${msg}`);
  }
}

/**
 * Attach a custom domain (e.g. mysite.drape.info) to the project.
 * Cloudflare auto-provisions SSL because the apex is in the same account.
 */
export async function addCustomDomain(slug: string, domain: string): Promise<void> {
  ensureCredentials();
  const r = await cfFetch(
    `/accounts/${config.cloudflareAccountId}/pages/projects/${slug}/domains`,
    {
      method: 'POST',
      body: JSON.stringify({ name: domain }),
    },
  );
  if (!r.success) {
    const msg = r.errors?.map((e) => e.message).join(', ') || 'unknown';
    if (msg.toLowerCase().includes('already exists')) return;
    throw new Error(`Failed to attach ${domain} to ${slug}: ${msg}`);
  }
}

export async function removeCustomDomain(slug: string, domain: string): Promise<void> {
  ensureCredentials();
  const r = await cfFetch(
    `/accounts/${config.cloudflareAccountId}/pages/projects/${slug}/domains/${domain}`,
    { method: 'DELETE' },
  );
  if (!r.success) {
    const msg = r.errors?.map((e) => e.message).join(', ') || 'unknown';
    if (msg.toLowerCase().includes('not found')) return;
    throw new Error(`Failed to detach ${domain} from ${slug}: ${msg}`);
  }
}

/**
 * Compose the canonical user-facing URL for a published slug.
 * Uses <slug>.{publishDomain} when configured (after we attach the custom
 * domain), otherwise falls back to the *.pages.dev subdomain.
 */
export function publishedUrlFor(slug: string): string {
  if (config.publishDomain) return `https://${slug}.${config.publishDomain}`;
  return `https://${slug}.pages.dev`;
}

function runProcess(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
    child.on('error', (e) => {
      resolve({ stdout, stderr: stderr + String(e), exitCode: 1 });
    });
  });
}
