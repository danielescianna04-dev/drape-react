/**
 * Project API keys.
 *
 * Each cloud-mode project gets one key at creation. The generated
 * frontend sends it in the `x-drape-project-key` header on every
 * request to /v1/*. This module issues, validates, and revokes keys.
 *
 * Keys are bearer tokens: plain 32-byte hex strings stored as-is.
 * We trade hash-at-rest for simple revocation (single DELETE) and
 * constant-time lookup via the PRIMARY KEY. If a key leaks, the fix
 * is to rotate it, not to peer into a hash column.
 */

import { randomBytes } from 'crypto';
import { getSql } from './client';

export interface DrapeApiKey {
  key: string;
  projectId: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const KEY_PREFIX = 'dck_'; // "drape cloud key" — lets us recognise it in logs

export function generateApiKeyString(): string {
  return KEY_PREFIX + randomBytes(32).toString('hex');
}

export async function issueApiKey(projectId: string, userId: string): Promise<DrapeApiKey> {
  const sql = getSql();
  const key = generateApiKeyString();
  const rows = await sql<{ key: string; project_id: string; user_id: string; created_at: string; last_used_at: string | null }[]>`
    INSERT INTO drape_api_keys (key, project_id, user_id)
    VALUES (${key}, ${projectId}, ${userId})
    RETURNING key, project_id, user_id, created_at, last_used_at
  `;
  const r = rows[0];
  return {
    key: r.key,
    projectId: r.project_id,
    userId: r.user_id,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  };
}

/**
 * Resolve an incoming header token to its project + owner. Returns
 * null when the token is malformed or unknown — never throws.
 * Also touches `last_used_at` as a lightweight observability signal
 * (useful to identify abandoned projects later).
 */
export async function resolveApiKey(token: unknown): Promise<DrapeApiKey | null> {
  if (typeof token !== 'string' || !token.startsWith(KEY_PREFIX) || token.length < 20) {
    return null;
  }
  const sql = getSql();
  const rows = await sql<{ key: string; project_id: string; user_id: string; created_at: string; last_used_at: string | null }[]>`
    UPDATE drape_api_keys
    SET last_used_at = now()
    WHERE key = ${token}
    RETURNING key, project_id, user_id, created_at, last_used_at
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    key: r.key,
    projectId: r.project_id,
    userId: r.user_id,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  };
}

export async function revokeApiKey(key: string): Promise<boolean> {
  const sql = getSql();
  const result = await sql`DELETE FROM drape_api_keys WHERE key = ${key}`;
  return (result.count ?? 0) > 0;
}

export async function revokeProjectApiKeys(projectId: string): Promise<number> {
  const sql = getSql();
  const result = await sql`DELETE FROM drape_api_keys WHERE project_id = ${projectId}`;
  return result.count ?? 0;
}
