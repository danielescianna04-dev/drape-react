import { Request, Response, NextFunction } from 'express';
import { execSync } from 'child_process';
import { firebaseService } from '../services/firebase.service';
import { config } from '../config';
import { log } from '../utils/logger';

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
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

  try {
    const decodedToken = await firebaseService.getAuth().verifyIdToken(token);
    req.userId = decodedToken.uid;
    next();
  } catch (err: any) {
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

  try {
    const decodedToken = await firebaseService.getAuth().verifyIdToken(token);
    req.userId = decodedToken.uid;
  } catch {
    req.userId = undefined;
  }

  next();
}

/**
 * getUserPlan — Fetches the user's subscription plan from Firestore.
 * Returns 'free' if the user document doesn't exist or on error.
 */
export async function getUserPlan(userId: string): Promise<string> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return 'free';
    const doc = await db.collection('users').doc(userId).get();
    const plan = doc.data()?.plan || 'free';
    return plan === 'starter' ? 'free' : plan;
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
  free:    { maxCreated: 3, maxCloned: 2, maxLocal: 1, maxStorageMb: 1024 },
  go:      { maxCreated: 10, maxCloned: 5, maxLocal: 3, maxStorageMb: 5120 },
  pro:     { maxCreated: 50, maxCloned: 25, maxLocal: 10, maxStorageMb: 10240 },
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

    const doc = await db.collection('users').doc(userId).get();
    const data = doc.data()?.creationCounters as CreationCounters | undefined;
    if (!data) return zero;
    return { created: data.created || 0, cloned: data.cloned || 0, local: data.local || 0 };
  } catch (err: any) {
    log.warn(`[Auth] getLifetimeCreationCounts error for ${userId}: ${err.message}`);
    return zero;
  }
}

/**
 * incrementCreationCounter — Increments the lifetime creation counter for the given type.
 * Call AFTER a project is successfully created/cloned.
 */
export async function incrementCreationCounter(userId: string, type: 'created' | 'cloned' | 'local'): Promise<void> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return;

    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    const current = (doc.data()?.creationCounters as CreationCounters | undefined) || { created: 0, cloned: 0, local: 0 };

    await userRef.set({ creationCounters: { ...current, [type]: (current[type] || 0) + 1 } }, { merge: true });
  } catch (err: any) {
    log.warn(`[Auth] incrementCreationCounter error for ${userId}: ${err.message}`);
  }
}

/**
 * getUserStorageMb — Calculates total disk usage (MB) for all the user's projects.
 * Uses `du -sm` on each project directory for fast calculation.
 */
export async function getUserStorageMb(userId: string): Promise<number> {
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

    if (projectIds.length === 0) return 0;

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

    return totalMb;
  } catch (err: any) {
    log.warn(`[Auth] getUserStorageMb error for ${userId}: ${err.message}`);
    return 0;
  }
}

export async function verifyProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  const allowBypass = config.allowInsecureOwnershipBypass;

  if (!userId || userId === 'anonymous') {
    if (allowBypass) {
      log.warn(`[Auth] Anonymous ownership bypass enabled for project ${projectId}`);
      return true;
    }
    return false;
  }

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

    // Newer schema: users/{uid}/projects/{projectId}
    const projectDoc = await db.collection('users').doc(userId).collection('projects').doc(projectId).get();
    if (projectDoc.exists) return true;

    // Newer schema: users/{uid}/workstations/{projectId}
    const wsDoc = await db.collection('users').doc(userId).collection('workstations').doc(projectId).get();
    if (wsDoc.exists) return true;

    // Legacy/current app schema: top-level user_projects/{projectId}
    const userProjectDoc = await db.collection('user_projects').doc(projectId).get();
    if (userProjectDoc.exists && userProjectDoc.data()?.userId === userId) return true;

    // Additional legacy schema fallbacks
    const topLevelProjectsDoc = await db.collection('projects').doc(projectId).get();
    if (topLevelProjectsDoc.exists) {
      const data = topLevelProjectsDoc.data() || {};
      if (data.userId === userId || data.ownerId === userId || data.uid === userId || data.createdBy === userId) {
        return true;
      }
    }

    const wsByProjectAndUser = await db
      .collection('workstations')
      .where('projectId', '==', projectId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    if (!wsByProjectAndUser.empty) return true;

    if (allowBypass) {
      log.warn(`[Auth] Project ${projectId} not found for user ${userId} — bypass enabled`);
      return true;
    }
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
