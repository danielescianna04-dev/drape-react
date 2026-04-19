/**
 * End-user authentication for GENERATED apps.
 *
 * The users created here are not Drape users — they are users of
 * the apps the AI generated. Scope is per-project: two different
 * generated apps have independent user pools, even when both use
 * the same email.
 *
 * Design choices:
 * - Opaque session tokens (not JWTs) so revocation is a DB delete.
 * - bcrypt@12 for password hashing (cost chosen to stay under 150ms
 *   per signup on the VPS without being trivially brute-forceable).
 * - Anonymous-first: a device gets an anon_id on first SDK use.
 *   Signup promotes it to a real account without losing the rows
 *   the device already wrote (those rows keep the same end_user_id).
 */

import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { getSql } from './client';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_DAYS = 30;
const ANON_ID_RE = /^anon_[a-z0-9]{16,48}$/;

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
  }
}

export interface EndUser {
  id: string;
  projectId: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  anonymousId: string | null;
  createdAt: string;
}

export interface Session {
  token: string;
  projectId: string;
  endUserId: string;
  expiresAt: string;
}

function rowToUser(r: any): EndUser {
  return {
    id: r.id,
    projectId: r.project_id,
    email: r.email,
    displayName: r.display_name,
    isAnonymous: r.is_anonymous,
    anonymousId: r.anonymous_id,
    createdAt: r.created_at,
  };
}

function generateAnonId(): string {
  return 'anon_' + randomBytes(12).toString('hex');
}

function generateSessionToken(): string {
  return 'dcs_' + randomBytes(32).toString('hex');
}

function sessionExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_TTL_DAYS);
  return d;
}

/**
 * Idempotently resolve the "current" end user based on an optional
 * anon_id from the client. Creates a new anon user if the client
 * has no id yet or the id is unknown for this project.
 */
export async function ensureAnonUser(projectId: string, anonIdIn?: unknown): Promise<EndUser> {
  const sql = getSql();
  const anonId = typeof anonIdIn === 'string' && ANON_ID_RE.test(anonIdIn) ? anonIdIn : null;

  if (anonId) {
    const existing = await sql<any[]>`
      SELECT id, project_id, email, display_name, is_anonymous, anonymous_id, created_at
      FROM drape_end_users
      WHERE project_id = ${projectId} AND anonymous_id = ${anonId}
    `;
    if (existing.length > 0) return rowToUser(existing[0]);
  }

  const newAnon = anonId || generateAnonId();
  const rows = await sql<any[]>`
    INSERT INTO drape_end_users (project_id, is_anonymous, anonymous_id)
    VALUES (${projectId}, true, ${newAnon})
    RETURNING id, project_id, email, display_name, is_anonymous, anonymous_id, created_at
  `;
  return rowToUser(rows[0]);
}

export async function signUp(opts: {
  projectId: string;
  email: string;
  password: string;
  displayName?: string;
  promoteAnonId?: string | null;
}): Promise<{ user: EndUser; session: Session }> {
  if (typeof opts.email !== 'string' || !opts.email.includes('@') || opts.email.length > 254) {
    throw new AuthError('invalid_email', 'Invalid email');
  }
  if (typeof opts.password !== 'string' || opts.password.length < 8 || opts.password.length > 200) {
    throw new AuthError('weak_password', 'Password must be 8–200 characters');
  }
  const sql = getSql();
  const hash = await bcrypt.hash(opts.password, BCRYPT_ROUNDS);
  const emailLower = opts.email.trim().toLowerCase();

  // If an anon_id was passed, try to promote that row instead of
  // creating a new one. This is the "keep my data after signup"
  // path. Done in a transaction to avoid duplicate-email races.
  const result = await sql.begin(async (tx) => {
    if (opts.promoteAnonId && ANON_ID_RE.test(opts.promoteAnonId)) {
      const promoted = await tx<any[]>`
        UPDATE drape_end_users
        SET email = ${emailLower},
            password_hash = ${hash},
            display_name = ${opts.displayName ?? null},
            is_anonymous = false,
            updated_at = now()
        WHERE project_id = ${opts.projectId}
          AND anonymous_id = ${opts.promoteAnonId}
          AND is_anonymous = true
        RETURNING id, project_id, email, display_name, is_anonymous, anonymous_id, created_at
      `;
      if (promoted.length > 0) return promoted[0];
    }
    const created = await tx<any[]>`
      INSERT INTO drape_end_users (project_id, email, password_hash, display_name, is_anonymous)
      VALUES (${opts.projectId}, ${emailLower}, ${hash}, ${opts.displayName ?? null}, false)
      RETURNING id, project_id, email, display_name, is_anonymous, anonymous_id, created_at
    `;
    return created[0];
  }).catch((err: any) => {
    if (err?.code === '23505') throw new AuthError('email_taken', 'Email already registered', 409);
    throw err;
  });

  const user = rowToUser(result);
  const session = await issueSession(opts.projectId, user.id);
  return { user, session };
}

export async function signIn(opts: {
  projectId: string;
  email: string;
  password: string;
}): Promise<{ user: EndUser; session: Session }> {
  if (typeof opts.email !== 'string' || !opts.email.includes('@')) {
    throw new AuthError('invalid_credentials', 'Invalid email or password', 401);
  }
  const sql = getSql();
  const emailLower = opts.email.trim().toLowerCase();
  const rows = await sql<any[]>`
    SELECT id, project_id, email, display_name, is_anonymous, anonymous_id, created_at, password_hash
    FROM drape_end_users
    WHERE project_id = ${opts.projectId} AND lower(email) = ${emailLower}
    LIMIT 1
  `;
  if (rows.length === 0 || !rows[0].password_hash) {
    // Same error regardless of which half is wrong — don't leak account existence.
    throw new AuthError('invalid_credentials', 'Invalid email or password', 401);
  }
  const ok = await bcrypt.compare(opts.password, rows[0].password_hash);
  if (!ok) throw new AuthError('invalid_credentials', 'Invalid email or password', 401);

  const user = rowToUser(rows[0]);
  const session = await issueSession(opts.projectId, user.id);
  return { user, session };
}

export async function issueSession(projectId: string, endUserId: string): Promise<Session> {
  const sql = getSql();
  const token = generateSessionToken();
  const expiresAt = sessionExpiry();
  await sql`
    INSERT INTO drape_sessions (token, project_id, end_user_id, expires_at)
    VALUES (${token}, ${projectId}, ${endUserId}, ${expiresAt})
  `;
  return { token, projectId, endUserId, expiresAt: expiresAt.toISOString() };
}

/**
 * Resolve a session token to its end user. Returns null on:
 * - missing/malformed token
 * - unknown/expired session
 * - session belongs to a different project (invariant: a token
 *   issued for project A can NEVER authenticate on project B)
 */
export async function resolveSession(
  projectId: string,
  token: unknown,
): Promise<EndUser | null> {
  if (typeof token !== 'string' || !token.startsWith('dcs_') || token.length < 20) return null;
  const sql = getSql();
  const rows = await sql<any[]>`
    SELECT u.id, u.project_id, u.email, u.display_name, u.is_anonymous, u.anonymous_id, u.created_at
    FROM drape_sessions s
    JOIN drape_end_users u ON u.id = s.end_user_id
    WHERE s.token = ${token}
      AND s.project_id = ${projectId}
      AND u.project_id = ${projectId}
      AND s.expires_at > now()
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

export async function signOut(token: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM drape_sessions WHERE token = ${token}`;
}
