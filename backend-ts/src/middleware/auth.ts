import { Request, Response, NextFunction } from 'express';
import { execSync } from 'child_process';
import { FieldValue } from 'firebase-admin/firestore';
import { firebaseService } from '../services/firebase.service';
import { config } from '../config';
import { log } from '../utils/logger';
import { auditService } from '../services/audit.service';

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// ── Token verification cache (avoids Firebase network call on every request) ──
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const tokenCache = new Map<string, { userId: string; expiresAt: number }>();

function getCachedToken(token: string): string | null {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenCache.delete(token);
    return null;
  }
  return entry.userId;
}

function setCachedToken(token: string, userId: string): void {
  tokenCache.set(token, { userId, expiresAt: Date.now() + TOKEN_CACHE_TTL });
  // Evict stale entries periodically (keep map bounded)
  if (tokenCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of tokenCache) {
      if (now > v.expiresAt) tokenCache.delete(k);
    }
  }
}

// ── Ownership verification cache ──
const OWNERSHIP_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const ownershipCache = new Map<string, { result: boolean; expiresAt: number }>();

function getCachedOwnership(userId: string, projectId: string): boolean | null {
  const key = `${userId}:${projectId}`;
  const entry = ownershipCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    ownershipCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedOwnership(userId: string, projectId: string, result: boolean): void {
  const key = `${userId}:${projectId}`;
  ownershipCache.set(key, { result, expiresAt: Date.now() + OWNERSHIP_CACHE_TTL });
  if (ownershipCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of ownershipCache) {
      if (now > v.expiresAt) ownershipCache.delete(k);
    }
  }
}

/**
 * requireAuth — Middleware that requires a valid Firebase ID token.
 * Extracts the token from the Authorization: Bearer <token> header,
 * verifies it, and attaches req.userId from the decoded token's uid.
 * Returns 401 if the token is missing or invalid.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  if (!token) {
    res.status(401).json({ success: false, error: 'Missing token' });
    return;
  }

  // Check token cache first
  const cachedUserId = getCachedToken(token);
  if (cachedUserId) {
    req.userId = cachedUserId;
    next();
    return;
  }

  try {
    const decodedToken = await firebaseService.getAuth().verifyIdToken(token);
    req.userId = decodedToken.uid;
    setCachedToken(token, decodedToken.uid);
    next();
  } catch (err: any) {
    auditService.log({ userId: 'unknown', action: 'auth_failed', resource: req.path, details: err.message, ip: req.ip });
    log.warn(`[Auth] Token verification failed: ${err.message}`);
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

/**
 * optionalAuth — Middleware that attempts to verify a Firebase ID token
 * but does not fail if one is not present or is invalid.
 * Sets req.userId to the uid if valid, or undefined if not.
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.userId = undefined;
    next();
    return;
  }

  const token = authHeader.slice(7);

  if (!token) {
    req.userId = undefined;
    next();
    return;
  }

  // Check token cache first
  const cachedUserId = getCachedToken(token);
  if (cachedUserId) {
    req.userId = cachedUserId;
    next();
    return;
  }

  try {
    const decodedToken = await firebaseService.getAuth().verifyIdToken(token);
    req.userId = decodedToken.uid;
    setCachedToken(token, decodedToken.uid);
  } catch {
    req.userId = undefined;
  }

  next();
}

// ── User plan cache ──
const USER_PLAN_CACHE_TTL = 60 * 1000; // 60 seconds — short TTL so plan upgrades apply quickly
const userPlanCache = new Map<string, { plan: string; expiresAt: number }>();

/** Invalidate plan cache immediately (call after any plan change) */
export function invalidateUserPlanCache(userId: string): void {
  userPlanCache.delete(userId);
}

/**
 * getUserPlan — Fetches the user's subscription plan from Firestore.
 * Returns 'free' if the user document doesn't exist or on error.
 */
export async function getUserPlan(userId: string): Promise<string> {
  const cached = userPlanCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.plan;
  try {
    const db = firebaseService.getFirestore();
    if (!db) return 'free';
    const doc = await db.collection('users').doc(userId).get();
    const raw = doc.data()?.plan || 'free';
    const plan = raw === 'starter' ? 'free' : raw;
    userPlanCache.set(userId, { plan, expiresAt: Date.now() + USER_PLAN_CACHE_TTL });
    return plan;
  } catch {
    return 'free';
  }
}

/**
 * verifyProjectOwnership — Checks whether the authenticated user owns the given project.
 * Looks in both the 'projects' and 'workstations' subcollections under the user document.
 * Returns false if ownership cannot be confirmed.
 */
// ── Plan project limits ────────────────────────────────────────────────────
export interface PlanProjectLimits {
  maxCreated: number;   // progetti creati da template
  maxCloned: number;    // progetti clonati da repo
  maxLocal: number;     // progetti aperti da file locale
  maxStorageMb: number; // storage totale per utente in MB
}

const PLAN_PROJECT_LIMITS: Record<string, PlanProjectLimits> = {
  free:    { maxCreated: 2, maxCloned: 1, maxLocal: 1, maxStorageMb: 1024 },
  go:      { maxCreated: 10, maxCloned: 5, maxLocal: 3, maxStorageMb: 5120 },
  pro:     { maxCreated: 50, maxCloned: 25, maxLocal: 10, maxStorageMb: 20480 },
  team:    { maxCreated: 200, maxCloned: 100, maxLocal: 20, maxStorageMb: 51200 },
};

export function getPlanProjectLimits(planId: string): PlanProjectLimits {
  return PLAN_PROJECT_LIMITS[planId] || PLAN_PROJECT_LIMITS.free;
}

/**
 * countUserProjects — Counts the user's projects from Firestore.
 * Returns { created, cloned } counts.
 */
export async function countUserProjects(userId: string): Promise<{ created: number; cloned: number; local: number }> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return { created: 0, cloned: 0, local: 0 };

    const seen = new Set<string>();
    let created = 0;
    let cloned = 0;
    let local = 0;

    const acc = (id: string, data: Record<string, any>) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      if (data.source === 'local') {
        local++;
      } else if (data.repositoryUrl || data.clonedFrom) {
        cloned++;
      } else {
        created++;
      }
    };

    // Newer schema: users/{uid}/projects + users/{uid}/workstations
    const projectsSnap = await db.collection('users').doc(userId).collection('projects').get();
    for (const d of projectsSnap.docs) acc(d.id, d.data() as Record<string, any>);

    const wsSnap = await db.collection('users').doc(userId).collection('workstations').get();
    for (const d of wsSnap.docs) acc(d.id, d.data() as Record<string, any>);

    // Legacy/current app schema: top-level user_projects with userId field
    const userProjectsSnap = await db.collection('user_projects').where('userId', '==', userId).get();
    for (const d of userProjectsSnap.docs) acc(d.id, d.data() as Record<string, any>);

    return { created, cloned, local };
  } catch (err: any) {
    log.warn(`[Auth] countUserProjects error for ${userId}: ${err.message}`);
    return { created: 0, cloned: 0, local: 0 };
  }
}

// ── Lifetime creation counter (anti-bypass) ────────────────────────────────
// Tracks cumulative creations. Never decreases on project deletion, never resets.

interface CreationCounters {
  created: number;
  cloned: number;
  local: number;
}

/**
 * getLifetimeCreationCounts — Reads the user's lifetime creation counters.
 * These never reset — deleting a project does not free up a slot.
 */
export async function getLifetimeCreationCounts(userId: string): Promise<CreationCounters> {
  const zero: CreationCounters = { created: 0, cloned: 0, local: 0 };
  try {
    const db = firebaseService.getFirestore();
    if (!db) return zero;

    const userDoc = await db.collection('users').doc(userId).get();
    const data = userDoc.data()?.creationCounters as CreationCounters | undefined;
    if (data) {
      return { created: data.created || 0, cloned: data.cloned || 0, local: data.local || 0 };
    }
    // Fallback for old accounts without creationCounters: count existing projects (exclude failed/creating)
    const projectsSnap = await db.collection('user_projects').where('userId', '==', userId).get();
    let created = 0, cloned = 0, local = 0;
    projectsSnap.docs.forEach(d => {
      const p = d.data();
      if (p.status === 'creating' || p.status === 'failed') return;
      if (p.source === 'local') local++;
      else if (p.repositoryUrl) cloned++;
      else created++;
    });
    return { created, cloned, local };
  } catch (err: any) {
    log.warn(`[Auth] getLifetimeCreationCounts error for ${userId}: ${err.message}`);
    return zero;
  }
}

/**
 * incrementCreationCounter — Atomically increments the lifetime creation counter for the given type.
 * Uses Firestore's FieldValue.increment() to avoid TOCTOU race conditions.
 * Call AFTER a project is successfully created/cloned.
 */
export async function incrementCreationCounter(userId: string, type: 'created' | 'cloned' | 'local'): Promise<void> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return;

    const userRef = db.collection('users').doc(userId);
    await userRef.set({
      creationCounters: {
        [type]: FieldValue.increment(1),
      },
    }, { merge: true });
  } catch (err: any) {
    log.warn(`[Auth] incrementCreationCounter error for ${userId}: ${err.message}`);
  }
}

/**
 * decrementCreationCounter — Atomically decrements the lifetime creation counter.
 * Call when a project is deleted or a clone fails after the counter was already incremented.
 * Ensures counter never goes below 0.
 */
export async function decrementCreationCounter(userId: string, type: 'created' | 'cloned' | 'local'): Promise<void> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const current = userDoc.data()?.creationCounters?.[type] || 0;
    if (current <= 0) return; // Don't go below 0

    await userRef.set({
      creationCounters: {
        [type]: FieldValue.increment(-1),
      },
    }, { merge: true });
  } catch (err: any) {
    log.warn(`[Auth] decrementCreationCounter error for ${userId}: ${err.message}`);
  }
}

// ── User storage cache ──
const USER_STORAGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const userStorageCache = new Map<string, { mb: number; expiresAt: number }>();

/**
 * getUserStorageMb — Calculates total disk usage (MB) for all the user's projects.
 * Uses `du -sm` on each project directory for fast calculation.
 */
export async function getUserStorageMb(userId: string): Promise<number> {
  const cached = userStorageCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.mb;
  try {
    const db = firebaseService.getFirestore();
    if (!db) return 0;

    // Gather all project IDs for this user
    const projectIds: string[] = [];
    const projectsSnap = await db.collection('users').doc(userId).collection('projects').get();
    for (const doc of projectsSnap.docs) projectIds.push(doc.id);
    const wsSnap = await db.collection('users').doc(userId).collection('workstations').get();
    for (const doc of wsSnap.docs) {
      if (!projectIds.includes(doc.id)) projectIds.push(doc.id);
    }
    const userProjectsSnap = await db.collection('user_projects').where('userId', '==', userId).get();
    for (const doc of userProjectsSnap.docs) {
      if (!projectIds.includes(doc.id)) projectIds.push(doc.id);
    }

    if (projectIds.length === 0) {
      userStorageCache.set(userId, { mb: 0, expiresAt: Date.now() + USER_STORAGE_CACHE_TTL });
      return 0;
    }

    // Calculate total disk usage
    let totalMb = 0;
    for (const pid of projectIds) {
      try {
        const output = execSync(`du -sm "${config.projectsRoot}/${pid}" 2>/dev/null || echo "0"`, { timeout: 5000 }).toString().trim();
        const mb = parseInt(output.split('\t')[0]) || 0;
        totalMb += mb;
      } catch {
        // Project dir might not exist on disk
      }
    }

    userStorageCache.set(userId, { mb: totalMb, expiresAt: Date.now() + USER_STORAGE_CACHE_TTL });
    return totalMb;
  } catch (err: any) {
    log.warn(`[Auth] getUserStorageMb error for ${userId}: ${err.message}`);
    return 0;
  }
}

export async function verifyProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  // CRITICAL: Never allow insecure bypass in production
  let allowBypass = config.allowInsecureOwnershipBypass;
  if (allowBypass && config.nodeEnv === 'production') {
    auditService.log({ userId, action: 'ownership_bypass_blocked', resource: projectId, details: 'Insecure bypass attempted in production' });
    log.error('[Auth] CRITICAL: Insecure ownership bypass enabled in production! Ignoring.');
    allowBypass = false;
  }

  if (!userId || userId === 'anonymous') {
    if (allowBypass) {
      log.warn(`[Auth] Anonymous ownership bypass enabled for project ${projectId} (dev only)`);
      return true;
    }
    return false;
  }

  // Check ownership cache first
  const cached = getCachedOwnership(userId, projectId);
  if (cached !== null) return cached;

  try {
    const db = firebaseService.getFirestore();
    if (!db) {
      if (allowBypass) {
        log.warn(`[Auth] No Firestore available, bypass enabled for user ${userId} on project ${projectId}`);
        return true;
      }
      log.warn(`[Auth] No Firestore available, denying access for user ${userId} to project ${projectId}`);
      return false;
    }

    // Run all ownership checks in parallel instead of sequentially
    const [projectDoc, wsDoc, userProjectDoc, topLevelProjectsDoc, wsByProjectAndUser] = await Promise.all([
      db.collection('users').doc(userId).collection('projects').doc(projectId).get(),
      db.collection('users').doc(userId).collection('workstations').doc(projectId).get(),
      db.collection('user_projects').doc(projectId).get(),
      db.collection('projects').doc(projectId).get(),
      db.collection('workstations')
        .where('projectId', '==', projectId)
        .where('userId', '==', userId)
        .limit(1)
        .get(),
    ]);

    const owned =
      projectDoc.exists ||
      wsDoc.exists ||
      (userProjectDoc.exists && userProjectDoc.data()?.userId === userId) ||
      (topLevelProjectsDoc.exists && (() => {
        const data = topLevelProjectsDoc.data() || {};
        return data.userId === userId || data.ownerId === userId || data.uid === userId || data.createdBy === userId;
      })()) ||
      !wsByProjectAndUser.empty;

    if (owned) {
      setCachedOwnership(userId, projectId, true);
      return true;
    }

    if (allowBypass) {
      auditService.log({ userId, action: 'ownership_bypass_used', resource: projectId, details: 'Project not found, bypass enabled' });
      log.warn(`[Auth] Project ${projectId} not found for user ${userId} — bypass enabled`);
      setCachedOwnership(userId, projectId, true);
      return true;
    }
    auditService.log({ userId, action: 'ownership_denied', resource: projectId, details: 'Not owner' });
    setCachedOwnership(userId, projectId, false);
    return false;
  } catch (err: any) {
    if (allowBypass) {
      log.warn(`[Auth] Ownership check error for ${projectId}: ${err.message} — bypass enabled`);
      return true;
    }
    log.warn(`[Auth] Ownership check error for ${projectId}: ${err.message} — denying access`);
    return false;
  }
}
