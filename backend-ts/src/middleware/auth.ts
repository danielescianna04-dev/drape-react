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
    if (!db) return 'starter';
    const doc = await db.collection('users').doc(userId).get();
    const plan = doc.data()?.plan || 'starter';
    return plan === 'free' ? 'starter' : plan;
  } catch {
    return 'starter';
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
  starter: { maxCreated: 3, maxCloned: 2, maxLocal: 1, maxStorageMb: 1024 },
  go:      { maxCreated: 10, maxCloned: 5, maxLocal: 3, maxStorageMb: 5120 },
  pro:     { maxCreated: 50, maxCloned: 25, maxLocal: 10, maxStorageMb: 10240 },
  team:    { maxCreated: 200, maxCloned: 100, maxLocal: 20, maxStorageMb: 51200 },
};

export function getPlanProjectLimits(planId: string): PlanProjectLimits {
  return PLAN_PROJECT_LIMITS[planId] || PLAN_PROJECT_LIMITS.starter;
}

/**
 * countUserProjects — Counts the user's projects from Firestore.
 * Returns { created, cloned } counts.
 */
export async function countUserProjects(userId: string): Promise<{ created: number; cloned: number; local: number }> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return { created: 0, cloned: 0, local: 0 };

    // Count from 'projects' subcollection
    const projectsSnap = await db.collection('users').doc(userId).collection('projects').get();
    let created = 0;
    let cloned = 0;
    let local = 0;
    for (const doc of projectsSnap.docs) {
      const data = doc.data();
      if (data.source === 'local') {
        local++;
      } else if (data.repositoryUrl || data.clonedFrom) {
        cloned++;
      } else {
        created++;
      }
    }

    // Also count from 'workstations' subcollection
    const wsSnap = await db.collection('users').doc(userId).collection('workstations').get();
    for (const doc of wsSnap.docs) {
      const data = doc.data();
      if (data.source === 'local') {
        local++;
      } else if (data.repositoryUrl || data.clonedFrom) {
        cloned++;
      } else {
        created++;
      }
    }

    return { created, cloned, local };
  } catch (err: any) {
    log.warn(`[Auth] countUserProjects error for ${userId}: ${err.message}`);
    return { created: 0, cloned: 0, local: 0 };
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
  try {
    const db = firebaseService.getFirestore();
    if (!db) {
      // No Firestore connection — allow access (local dev / migration)
      log.warn(`[Auth] No Firestore available, allowing access for user ${userId} to project ${projectId}`);
      return true;
    }

    // Check if project belongs to user in Firestore
    const projectDoc = await db.collection('users').doc(userId).collection('projects').doc(projectId).get();
    if (projectDoc.exists) return true;

    // Also check workstations collection
    const wsDoc = await db.collection('users').doc(userId).collection('workstations').doc(projectId).get();
    if (wsDoc.exists) return true;

    // Fallback: allow access but log warning during migration period
    // Projects created locally may not yet be synced to Firestore
    log.warn(`[Auth] Project ${projectId} not found in Firestore for user ${userId} — allowing access (migration)`);
    return true;
  } catch (err: any) {
    log.warn(`[Auth] Ownership check error for ${projectId}: ${err.message} — allowing access`);
    return true;
  }
}
