/**
 * MCP servers (Model Context Protocol) — installable tool providers the agent
 * can launch alongside its built-in tool set. Conceptually the same lifecycle
 * as skills (draft → publish → install) but the payload is execution config
 * (command + args + env) instead of a prompt body.
 *
 * Two collections:
 *   - `mcps`         per-user installed/draft (private, owner-scoped)
 *   - `mcps_public`  marketplace (visible to everyone, immutable by others)
 *
 * Env handling: each declared env var has an `isSecret` flag. Public/marketplace
 * docs only carry the schema (name + description + isSecret), never the value.
 * The user-installed copy carries the actual values, encrypted at rest is a
 * future hardening; for v1 they live in plaintext in the user's `mcps` doc
 * (private rules ensure only the owner reads them).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { firebaseService } from './firebase.service';
import { log } from '../utils/logger';

export type McpCategory =
  | 'productivity'
  | 'dev'
  | 'data'
  | 'design'
  | 'web'
  | 'other';

export interface McpEnvDecl {
  /** UPPER_SNAKE name as the MCP binary expects. */
  name: string;
  /** Short label for the install form ("GitHub personal access token"). */
  label?: string;
  /** Markdown blurb shown under the input. May contain a "Get one here" link. */
  description?: string;
  /** UI hides the value (password input) and never logs it. */
  isSecret?: boolean;
  /** Optional placeholder shown empty. */
  placeholder?: string;
  /** If true, install is blocked unless the user provides a value. */
  required?: boolean;
}

export interface McpServer {
  id: string;
  /** URL-safe handle, unique per owner (e.g. "github", "filesystem-home"). */
  slug: string;
  name: string;
  description: string;
  category: McpCategory;

  /** Executable to launch (path or PATH-resolvable name). */
  command: string;
  /** Static args passed to `command` (env interpolation: ${VAR_NAME}). */
  args: string[];
  /** Env vars: schema lives on marketplace docs; values live on installed copies. */
  env: McpEnvDecl[];
  /** Resolved env values (only on the installed copy in `mcps`). */
  envValues: Record<string, string>;

  tags: string[];
  ownerUid: string | null;
  authorUsername: string | null;
  isOfficial: boolean;
  isPrivate: boolean;
  sourceMarketplaceId: string | null;
  installCount: number;

  /** True once the user filled all required env vars. Affects whether the
   *  AgentLoop will spawn this server. Drafts default to false. */
  isEnabled: boolean;

  createdAt: number;
  updatedAt: number;
}

const COLL_USER = 'mcps';
const COLL_PUBLIC = 'mcps_public';
const SLUG_RE = /^[a-z][a-z0-9-]{1,40}$/;

function now(): number { return Date.now(); }

function normalizeSlug(input: string): string {
  return String(input || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '-');
}

function clampLen(s: string, max: number): string {
  const v = String(s || '').trim();
  return v.length > max ? v.slice(0, max) : v;
}

function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(
    tags.map((t) => String(t || '').toLowerCase().trim()).filter((t) => t && t.length <= 24)
  )).slice(0, 8);
}

function sanitizeArgs(args: unknown): string[] {
  if (!Array.isArray(args)) return [];
  return args
    .map((a) => clampLen(String(a ?? ''), 200))
    .filter((a) => a.length > 0)
    .slice(0, 20);
}

function sanitizeEnvDecls(env: unknown): McpEnvDecl[] {
  if (!Array.isArray(env)) return [];
  const seen = new Set<string>();
  const out: McpEnvDecl[] = [];
  for (const e of env as any[]) {
    const name = String(e?.name || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      name,
      label: clampLen(e?.label || '', 80) || undefined,
      description: clampLen(e?.description || '', 240) || undefined,
      isSecret: e?.isSecret === true,
      placeholder: clampLen(e?.placeholder || '', 80) || undefined,
      required: e?.required === true,
    });
    if (out.length >= 12) break;
  }
  return out;
}

/** Strip values for any env var whose decl is `isSecret` — used when copying
 *  marketplace docs that should never carry secrets. */
function sanitizeEnvValues(values: unknown, decls: McpEnvDecl[]): Record<string, string> {
  if (!values || typeof values !== 'object') return {};
  const out: Record<string, string> = {};
  for (const decl of decls) {
    const v = (values as any)[decl.name];
    if (typeof v === 'string') out[decl.name] = clampLen(v, 4000);
  }
  return out;
}

function rowToMcp(id: string, data: FirebaseFirestore.DocumentData): McpServer {
  const env = Array.isArray(data.env) ? data.env : [];
  return {
    id,
    slug: data.slug || id,
    name: data.name || '',
    description: data.description || '',
    category: (data.category as McpCategory) || 'other',
    command: data.command || '',
    args: Array.isArray(data.args) ? data.args : [],
    env,
    envValues: data.envValues && typeof data.envValues === 'object' ? data.envValues : {},
    tags: Array.isArray(data.tags) ? data.tags : [],
    ownerUid: data.ownerUid ?? null,
    authorUsername: data.authorUsername ?? null,
    isOfficial: data.isOfficial === true,
    isPrivate: data.isPrivate !== false,
    sourceMarketplaceId: data.sourceMarketplaceId ?? null,
    installCount: typeof data.installCount === 'number' ? data.installCount : 0,
    isEnabled: data.isEnabled === true,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

export interface McpDraftInput {
  slug: string;
  name: string;
  description: string;
  category: McpCategory;
  command: string;
  args?: string[];
  env?: McpEnvDecl[];
  tags?: string[];
}

function validateDraft(input: McpDraftInput): { ok: true; clean: McpDraftInput } | { ok: false; error: string } {
  const slug = normalizeSlug(input.slug);
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'Invalid slug (lowercase letters, digits, hyphens; 2-41 chars; must start with a letter).' };
  const name = clampLen(input.name, 60);
  if (name.length < 2) return { ok: false, error: 'Name too short.' };
  const description = clampLen(input.description, 300);
  if (description.length < 4) return { ok: false, error: 'Description too short.' };
  const command = clampLen(input.command, 240);
  if (command.length < 1) return { ok: false, error: 'Command is required.' };
  const category: McpCategory = (['productivity', 'dev', 'data', 'design', 'web', 'other'] as const).includes(input.category as any)
    ? input.category
    : 'other';
  return {
    ok: true,
    clean: {
      slug,
      name,
      description,
      category,
      command,
      args: sanitizeArgs(input.args),
      env: sanitizeEnvDecls(input.env),
      tags: sanitizeTags(input.tags),
    },
  };
}

// ─── Reads ────────────────────────────────────────────────────────────────

export async function getById(id: string, opts?: { fromMarketplace?: boolean }): Promise<McpServer | null> {
  const db = firebaseService.getFirestore();
  if (!db) return null;
  const coll = opts?.fromMarketplace ? COLL_PUBLIC : COLL_USER;
  const doc = await db.collection(coll).doc(id).get();
  if (!doc.exists) return null;
  return rowToMcp(doc.id, doc.data() || {});
}

export async function listMyInstalled(uid: string): Promise<McpServer[]> {
  const db = firebaseService.getFirestore();
  if (!db) return [];
  const snap = await db.collection(COLL_USER).where('ownerUid', '==', uid).get();
  return snap.docs.map((d) => rowToMcp(d.id, d.data())).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Same as listMyInstalled but only the ones marked enabled. Used by AgentLoop
 *  to know which servers to spawn for this user's chat session. */
export async function listMyEnabled(uid: string): Promise<McpServer[]> {
  const installed = await listMyInstalled(uid);
  return installed.filter((m) => m.isEnabled);
}

export async function listMarketplace(opts?: { search?: string; category?: McpCategory; limit?: number }): Promise<McpServer[]> {
  const db = firebaseService.getFirestore();
  if (!db) return [];
  let q: FirebaseFirestore.Query = db.collection(COLL_PUBLIC);
  if (opts?.category) q = q.where('category', '==', opts.category);
  q = q.orderBy('installCount', 'desc').limit(Math.min(200, opts?.limit ?? 100));
  const snap = await q.get();
  let rows = snap.docs.map((d) => rowToMcp(d.id, d.data()));
  const search = opts?.search?.toLowerCase().trim();
  if (search) {
    rows = rows.filter((r) =>
      r.slug.includes(search) ||
      r.name.toLowerCase().includes(search) ||
      r.description.toLowerCase().includes(search) ||
      r.tags.some((t) => t.includes(search))
    );
  }
  return rows;
}

// ─── Writes — drafts (user-owned) ─────────────────────────────────────────

export async function createDraft(uid: string, authorUsername: string | null, input: McpDraftInput): Promise<McpServer> {
  const v = validateDraft(input);
  if (!v.ok) throw new Error(v.error);
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');

  const existing = await db.collection(COLL_USER)
    .where('ownerUid', '==', uid)
    .where('slug', '==', v.clean.slug)
    .limit(1)
    .get();
  if (!existing.empty) throw new Error(`You already have an MCP named ${v.clean.slug}.`);

  const ts = now();
  const ref = db.collection(COLL_USER).doc();
  const data = {
    slug: v.clean.slug,
    name: v.clean.name,
    description: v.clean.description,
    category: v.clean.category,
    command: v.clean.command,
    args: v.clean.args || [],
    env: v.clean.env || [],
    envValues: {},
    tags: v.clean.tags || [],
    ownerUid: uid,
    authorUsername,
    isOfficial: false,
    isPrivate: true,
    sourceMarketplaceId: null,
    installCount: 0,
    // Drafts start disabled — user must fill required env vars and toggle on.
    isEnabled: !(v.clean.env || []).some((e) => e.required),
    createdAt: ts,
    updatedAt: ts,
  };
  await ref.set(data);
  return rowToMcp(ref.id, data);
}

export async function update(uid: string, id: string, patch: Partial<McpDraftInput>): Promise<McpServer> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection(COLL_USER).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Not found');
  const cur = snap.data() || {};
  if (cur.ownerUid !== uid) throw new Error('Forbidden');

  const merged: McpDraftInput = {
    slug: patch.slug ?? cur.slug,
    name: patch.name ?? cur.name,
    description: patch.description ?? cur.description,
    category: patch.category ?? cur.category,
    command: patch.command ?? cur.command,
    args: patch.args ?? cur.args ?? [],
    env: patch.env ?? cur.env ?? [],
    tags: patch.tags ?? cur.tags ?? [],
  };
  const v = validateDraft(merged);
  if (!v.ok) throw new Error(v.error);

  await ref.update({
    slug: v.clean.slug,
    name: v.clean.name,
    description: v.clean.description,
    category: v.clean.category,
    command: v.clean.command,
    args: v.clean.args || [],
    env: v.clean.env || [],
    tags: v.clean.tags || [],
    updatedAt: now(),
  });
  const fresh = await ref.get();
  return rowToMcp(fresh.id, fresh.data() || {});
}

export async function setEnvValues(uid: string, id: string, envValues: Record<string, string>): Promise<McpServer> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection(COLL_USER).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Not found');
  const cur = snap.data() || {};
  if (cur.ownerUid !== uid) throw new Error('Forbidden');
  const decls: McpEnvDecl[] = Array.isArray(cur.env) ? cur.env : [];
  const cleanValues = sanitizeEnvValues(envValues, decls);
  // If all required vars are now set, auto-enable the MCP.
  const allRequiredOk = decls.filter((d) => d.required).every((d) => !!cleanValues[d.name]);
  await ref.update({ envValues: cleanValues, isEnabled: allRequiredOk, updatedAt: now() });
  const fresh = await ref.get();
  return rowToMcp(fresh.id, fresh.data() || {});
}

export async function setEnabled(uid: string, id: string, enabled: boolean): Promise<void> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection(COLL_USER).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Not found');
  const cur = snap.data() || {};
  if (cur.ownerUid !== uid) throw new Error('Forbidden');
  if (enabled) {
    const decls: McpEnvDecl[] = Array.isArray(cur.env) ? cur.env : [];
    const values: Record<string, string> = cur.envValues && typeof cur.envValues === 'object' ? cur.envValues : {};
    for (const d of decls) {
      if (d.required && !values[d.name]) throw new Error(`Required env var ${d.name} is missing.`);
    }
  }
  await ref.update({ isEnabled: !!enabled, updatedAt: now() });
}

export async function remove(uid: string, id: string): Promise<void> {
  const db = firebaseService.getFirestore();
  if (!db) return;
  const ref = db.collection(COLL_USER).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return;
  if ((snap.data() || {}).ownerUid !== uid) throw new Error('Forbidden');
  await ref.delete();
}

// ─── Marketplace publish + install ────────────────────────────────────────

export async function publish(uid: string, id: string): Promise<McpServer> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const userRef = db.collection(COLL_USER).doc(id);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error('Not found');
  const cur = snap.data() || {};
  if (cur.ownerUid !== uid) throw new Error('Forbidden');

  const pubRef = db.collection(COLL_PUBLIC).doc(id);
  const ts = now();
  // NEVER publish actual env values — only the schema travels to marketplace.
  const pubData = {
    slug: cur.slug,
    name: cur.name,
    description: cur.description,
    category: cur.category,
    command: cur.command,
    args: cur.args || [],
    env: cur.env || [],
    envValues: {},
    tags: cur.tags || [],
    ownerUid: uid,
    authorUsername: cur.authorUsername || null,
    isOfficial: false,
    isPrivate: false,
    sourceMarketplaceId: null,
    installCount: cur.installCount || 0,
    isEnabled: false,
    createdAt: cur.createdAt || ts,
    updatedAt: ts,
  };
  await pubRef.set(pubData, { merge: true });
  await userRef.update({ isPrivate: false, updatedAt: ts, sourceMarketplaceId: id });
  return rowToMcp(pubRef.id, pubData);
}

export async function install(uid: string, marketplaceId: string, authorUsername: string | null): Promise<McpServer> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const pubRef = db.collection(COLL_PUBLIC).doc(marketplaceId);
  const pubSnap = await pubRef.get();
  if (!pubSnap.exists) throw new Error('MCP non trovato nel marketplace.');
  const pub = pubSnap.data() || {};

  const existing = await db.collection(COLL_USER)
    .where('ownerUid', '==', uid)
    .where('sourceMarketplaceId', '==', marketplaceId)
    .limit(1)
    .get();
  if (!existing.empty) {
    return rowToMcp(existing.docs[0].id, existing.docs[0].data());
  }

  // Avoid slug collision within this user's installed list.
  let slug = pub.slug || marketplaceId;
  let suffix = 1;
  while (true) {
    const conflict = await db.collection(COLL_USER)
      .where('ownerUid', '==', uid)
      .where('slug', '==', slug)
      .limit(1)
      .get();
    if (conflict.empty) break;
    suffix += 1;
    slug = `${pub.slug}-${suffix}`;
  }

  const ts = now();
  const ref = db.collection(COLL_USER).doc();
  const decls: McpEnvDecl[] = Array.isArray(pub.env) ? pub.env : [];
  const data = {
    slug,
    name: pub.name,
    description: pub.description,
    category: pub.category,
    command: pub.command,
    args: pub.args || [],
    env: decls,
    envValues: {},
    tags: pub.tags || [],
    ownerUid: uid,
    authorUsername,
    isOfficial: pub.isOfficial === true,
    isPrivate: false,
    sourceMarketplaceId: marketplaceId,
    installCount: 0,
    // If no required env vars, ready to use immediately.
    isEnabled: !decls.some((d) => d.required),
    createdAt: ts,
    updatedAt: ts,
  };
  await ref.set(data);

  pubRef.update({ installCount: FieldValue.increment(1) }).catch((err) => {
    log.warn(`[Mcps] install counter bump failed for ${marketplaceId}: ${err?.message || err}`);
  });

  return rowToMcp(ref.id, data);
}

/**
 * Upsert a marketplace MCP — used by the seed script for curated official
 * Drape MCPs idempotently.
 */
export async function upsertOfficial(officialId: string, input: McpDraftInput): Promise<void> {
  const v = validateDraft(input);
  if (!v.ok) throw new Error(v.error);
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection(COLL_PUBLIC).doc(officialId);
  const existing = await ref.get();
  const ts = now();
  await ref.set({
    slug: v.clean.slug,
    name: v.clean.name,
    description: v.clean.description,
    category: v.clean.category,
    command: v.clean.command,
    args: v.clean.args || [],
    env: v.clean.env || [],
    envValues: {},
    tags: v.clean.tags || [],
    ownerUid: null,
    authorUsername: 'drape',
    isOfficial: true,
    isPrivate: false,
    sourceMarketplaceId: null,
    installCount: existing.exists ? (existing.data()?.installCount || 0) : 0,
    isEnabled: false,
    createdAt: existing.exists ? (existing.data()?.createdAt || ts) : ts,
    updatedAt: ts,
  }, { merge: true });
}
