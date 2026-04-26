/**
 * Skills (a.k.a. Plugins) — reusable AI prompt presets the user invokes via
 * `/slash` commands in chat. Two collections:
 *   - `skills`         per-user installed/draft skills (private, owner-scoped)
 *   - `skills_public`  marketplace (visible to everyone, immutable by others)
 *
 * Lifecycle:
 *   create draft  → POST /skills        → writes to `skills` (private = true)
 *   publish       → POST /skills/:id/publish → copy to `skills_public` + flag private = false
 *   install       → POST /skills/:id/install → copy from `skills_public` into the user's `skills`
 *   uninstall     → DELETE/uninstall from `skills` (does not touch marketplace copy)
 *
 * The skill body is a markdown blob that gets prepended to the AgentLoop
 * system prompt when the user invokes `/<slash>` in chat.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { firebaseService } from './firebase.service';
import { log } from '../utils/logger';

export type SkillCategory =
  | 'design'
  | 'build'
  | 'review'
  | 'ops'
  | 'data'
  | 'other';

export interface SkillExample {
  prompt: string;
  outcome?: string;
}

export interface Skill {
  id: string;
  /** URL-safe slash name without leading slash (e.g. "landing-page"). */
  slash: string;
  name: string;
  description: string;
  category: SkillCategory;
  /** Markdown body — injected into the agent system prompt. */
  body: string;
  tags: string[];
  examples: SkillExample[];
  /** Owner (Firebase uid). Empty/null for marketplace-owned official skills. */
  ownerUid: string | null;
  /** Display name in marketplace ("@danix"). */
  authorUsername: string | null;
  /** True for skills authored/curated by the Drape team. */
  isOfficial: boolean;
  /** Skill is private to its owner; false once published to marketplace. */
  isPrivate: boolean;
  /** When installed from marketplace, points back to the public copy. */
  sourceMarketplaceId: string | null;
  installCount: number;
  likeCount: number;
  createdAt: number;
  updatedAt: number;
}

const COLL_USER = 'skills';
const COLL_PUBLIC = 'skills_public';
const SLASH_RE = /^[a-z][a-z0-9-]{1,30}$/;

function now(): number { return Date.now(); }

function normalizeSlash(input: string): string {
  return String(input || '').toLowerCase().trim().replace(/^\/+/, '').replace(/[^a-z0-9-]/g, '-');
}

function clampLen(s: string, max: number): string {
  const v = String(s || '').trim();
  return v.length > max ? v.slice(0, max) : v;
}

function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return Array.from(new Set(
    tags
      .map((t) => String(t || '').toLowerCase().trim())
      .filter((t) => t && t.length <= 24)
  )).slice(0, 8);
}

function sanitizeExamples(ex: unknown): SkillExample[] {
  if (!Array.isArray(ex)) return [];
  return ex
    .map((e: any) => {
      const out: SkillExample = { prompt: clampLen(e?.prompt || '', 240) };
      if (e?.outcome) out.outcome = clampLen(e.outcome, 240);
      return out;
    })
    .filter((e) => e.prompt.length > 0)
    .slice(0, 5);
}

function rowToSkill(id: string, data: FirebaseFirestore.DocumentData): Skill {
  return {
    id,
    slash: data.slash || id,
    name: data.name || '',
    description: data.description || '',
    category: (data.category as SkillCategory) || 'other',
    body: data.body || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    examples: Array.isArray(data.examples) ? data.examples : [],
    ownerUid: data.ownerUid ?? null,
    authorUsername: data.authorUsername ?? null,
    isOfficial: data.isOfficial === true,
    isPrivate: data.isPrivate !== false,
    sourceMarketplaceId: data.sourceMarketplaceId ?? null,
    installCount: typeof data.installCount === 'number' ? data.installCount : 0,
    likeCount: typeof data.likeCount === 'number' ? data.likeCount : 0,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
  };
}

export interface SkillDraftInput {
  slash: string;
  name: string;
  description: string;
  category: SkillCategory;
  body: string;
  tags?: string[];
  examples?: SkillExample[];
}

function validateDraft(input: SkillDraftInput): { ok: true; clean: SkillDraftInput } | { ok: false; error: string } {
  const slash = normalizeSlash(input.slash);
  if (!SLASH_RE.test(slash)) return { ok: false, error: 'Invalid slash (lowercase letters, digits, hyphens; 2-31 chars; must start with a letter).' };
  const name = clampLen(input.name, 60);
  if (name.length < 2) return { ok: false, error: 'Name too short.' };
  const description = clampLen(input.description, 200);
  if (description.length < 4) return { ok: false, error: 'Description too short.' };
  const body = clampLen(input.body, 8000);
  if (body.length < 20) return { ok: false, error: 'Body too short — write a real prompt.' };
  const category: SkillCategory = (['design', 'build', 'review', 'ops', 'data', 'other'] as const).includes(input.category as any)
    ? input.category
    : 'other';
  return { ok: true, clean: { slash, name, description, category, body, tags: sanitizeTags(input.tags), examples: sanitizeExamples(input.examples) } };
}

// ─── Reads ────────────────────────────────────────────────────────────────

export async function getById(id: string, opts?: { fromMarketplace?: boolean }): Promise<Skill | null> {
  const db = firebaseService.getFirestore();
  if (!db) return null;
  const coll = opts?.fromMarketplace ? COLL_PUBLIC : COLL_USER;
  const doc = await db.collection(coll).doc(id).get();
  if (!doc.exists) return null;
  return rowToSkill(doc.id, doc.data() || {});
}

/** All skills installed by `uid` (private drafts + installed-from-marketplace copies). */
export async function listMyInstalled(uid: string): Promise<Skill[]> {
  const db = firebaseService.getFirestore();
  if (!db) return [];
  const snap = await db.collection(COLL_USER).where('ownerUid', '==', uid).get();
  return snap.docs.map((d) => rowToSkill(d.id, d.data())).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listMarketplace(opts?: { search?: string; category?: SkillCategory; limit?: number }): Promise<Skill[]> {
  const db = firebaseService.getFirestore();
  if (!db) return [];
  let q: FirebaseFirestore.Query = db.collection(COLL_PUBLIC);
  if (opts?.category) q = q.where('category', '==', opts.category);
  // Firestore doesn't support free-text search; we filter client-side after a
  // bounded fetch sorted by installCount desc.
  q = q.orderBy('installCount', 'desc').limit(Math.min(200, opts?.limit ?? 100));
  const snap = await q.get();
  let rows = snap.docs.map((d) => rowToSkill(d.id, d.data()));
  const search = opts?.search?.toLowerCase().trim();
  if (search) {
    rows = rows.filter((r) =>
      r.slash.includes(search) ||
      r.name.toLowerCase().includes(search) ||
      r.description.toLowerCase().includes(search) ||
      r.tags.some((t) => t.includes(search))
    );
  }
  return rows;
}

// ─── Writes — drafts (user-owned) ─────────────────────────────────────────

export async function createDraft(uid: string, authorUsername: string | null, input: SkillDraftInput): Promise<Skill> {
  const v = validateDraft(input);
  if (!v.ok) throw new Error(v.error);
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');

  // Ensure unique slash within the user's collection.
  const existing = await db.collection(COLL_USER)
    .where('ownerUid', '==', uid)
    .where('slash', '==', v.clean.slash)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new Error(`You already have a skill named /${v.clean.slash}.`);
  }

  const ts = now();
  const ref = db.collection(COLL_USER).doc();
  const data = {
    slash: v.clean.slash,
    name: v.clean.name,
    description: v.clean.description,
    category: v.clean.category,
    body: v.clean.body,
    tags: v.clean.tags || [],
    examples: v.clean.examples || [],
    ownerUid: uid,
    authorUsername,
    isOfficial: false,
    isPrivate: true,
    sourceMarketplaceId: null,
    installCount: 0,
    likeCount: 0,
    createdAt: ts,
    updatedAt: ts,
  };
  await ref.set(data);
  return rowToSkill(ref.id, data);
}

export async function update(uid: string, id: string, patch: Partial<SkillDraftInput>): Promise<Skill> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection(COLL_USER).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Not found');
  const cur = snap.data() || {};
  if (cur.ownerUid !== uid) throw new Error('Forbidden');

  const merged: SkillDraftInput = {
    slash: patch.slash ?? cur.slash,
    name: patch.name ?? cur.name,
    description: patch.description ?? cur.description,
    category: patch.category ?? cur.category,
    body: patch.body ?? cur.body,
    tags: patch.tags ?? cur.tags ?? [],
    examples: patch.examples ?? cur.examples ?? [],
  };
  const v = validateDraft(merged);
  if (!v.ok) throw new Error(v.error);

  await ref.update({
    slash: v.clean.slash,
    name: v.clean.name,
    description: v.clean.description,
    category: v.clean.category,
    body: v.clean.body,
    tags: v.clean.tags || [],
    examples: v.clean.examples || [],
    updatedAt: now(),
  });
  const fresh = await ref.get();
  return rowToSkill(fresh.id, fresh.data() || {});
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

export async function publish(uid: string, id: string): Promise<Skill> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const userRef = db.collection(COLL_USER).doc(id);
  const snap = await userRef.get();
  if (!snap.exists) throw new Error('Not found');
  const cur = snap.data() || {};
  if (cur.ownerUid !== uid) throw new Error('Forbidden');

  // Reuse the user-doc id as the marketplace id so re-publishing is idempotent.
  const pubRef = db.collection(COLL_PUBLIC).doc(id);
  const ts = now();
  const pubData = {
    slash: cur.slash,
    name: cur.name,
    description: cur.description,
    category: cur.category,
    body: cur.body,
    tags: cur.tags || [],
    examples: cur.examples || [],
    ownerUid: uid,
    authorUsername: cur.authorUsername || null,
    isOfficial: false,
    isPrivate: false,
    sourceMarketplaceId: null,
    installCount: cur.installCount || 0,
    likeCount: cur.likeCount || 0,
    createdAt: cur.createdAt || ts,
    updatedAt: ts,
  };
  await pubRef.set(pubData, { merge: true });
  await userRef.update({ isPrivate: false, updatedAt: ts, sourceMarketplaceId: id });
  return rowToSkill(pubRef.id, pubData);
}

export async function install(uid: string, marketplaceId: string, authorUsername: string | null): Promise<Skill> {
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const pubRef = db.collection(COLL_PUBLIC).doc(marketplaceId);
  const pubSnap = await pubRef.get();
  if (!pubSnap.exists) throw new Error('Skill non trovata nel marketplace.');
  const pub = pubSnap.data() || {};

  // If user already installed this one, just bump updatedAt and return it.
  const existing = await db.collection(COLL_USER)
    .where('ownerUid', '==', uid)
    .where('sourceMarketplaceId', '==', marketplaceId)
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return rowToSkill(doc.id, doc.data());
  }

  // Avoid slash collision with an existing user skill — append "-2", "-3"…
  let slash = pub.slash || marketplaceId;
  let suffix = 1;
  while (true) {
    const conflict = await db.collection(COLL_USER)
      .where('ownerUid', '==', uid)
      .where('slash', '==', slash)
      .limit(1)
      .get();
    if (conflict.empty) break;
    suffix += 1;
    slash = `${pub.slash}-${suffix}`;
  }

  const ts = now();
  const ref = db.collection(COLL_USER).doc();
  const data = {
    slash,
    name: pub.name,
    description: pub.description,
    category: pub.category,
    body: pub.body,
    tags: pub.tags || [],
    examples: pub.examples || [],
    ownerUid: uid,
    authorUsername,
    isOfficial: pub.isOfficial === true,
    isPrivate: false,
    sourceMarketplaceId: marketplaceId,
    installCount: 0,
    likeCount: 0,
    createdAt: ts,
    updatedAt: ts,
  };
  await ref.set(data);

  // Best-effort: bump install counter on marketplace doc.
  pubRef.update({ installCount: FieldValue.increment(1) }).catch((err) => {
    log.warn(`[Skills] install counter bump failed for ${marketplaceId}: ${err?.message || err}`);
  });

  return rowToSkill(ref.id, data);
}

/** Find an installed skill by slash for the given user (used by AgentLoop dispatcher). */
export async function findInstalledBySlash(uid: string, slash: string): Promise<Skill | null> {
  const db = firebaseService.getFirestore();
  if (!db) return null;
  const cleanSlash = normalizeSlash(slash);
  const snap = await db.collection(COLL_USER)
    .where('ownerUid', '==', uid)
    .where('slash', '==', cleanSlash)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return rowToSkill(snap.docs[0].id, snap.docs[0].data());
}

/**
 * Upsert a marketplace skill — used by the seed script to install the curated
 * official Drape skills idempotently.
 */
export async function upsertOfficial(officialId: string, input: SkillDraftInput): Promise<void> {
  const v = validateDraft(input);
  if (!v.ok) throw new Error(v.error);
  const db = firebaseService.getFirestore();
  if (!db) throw new Error('Firestore unavailable');
  const ref = db.collection(COLL_PUBLIC).doc(officialId);
  const existing = await ref.get();
  const ts = now();
  await ref.set({
    slash: v.clean.slash,
    name: v.clean.name,
    description: v.clean.description,
    category: v.clean.category,
    body: v.clean.body,
    tags: v.clean.tags || [],
    examples: v.clean.examples || [],
    ownerUid: null,
    authorUsername: 'drape',
    isOfficial: true,
    isPrivate: false,
    sourceMarketplaceId: null,
    installCount: existing.exists ? (existing.data()?.installCount || 0) : 0,
    likeCount: existing.exists ? (existing.data()?.likeCount || 0) : 0,
    createdAt: existing.exists ? (existing.data()?.createdAt || ts) : ts,
    updatedAt: ts,
  }, { merge: true });
}
