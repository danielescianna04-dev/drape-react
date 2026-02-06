import { Request, Response, NextFunction } from 'express';
import { firebaseService } from '../services/firebase.service';
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
    return doc.data()?.plan || 'free';
  } catch {
    return 'free';
  }
}

/**
 * verifyProjectOwnership — Checks whether the authenticated user owns the given project.
 * Looks in both the 'projects' and 'workstations' subcollections under the user document.
 * Returns false if ownership cannot be confirmed.
 */
export async function verifyProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return false;

    // Check if project belongs to user in Firestore
    const projectDoc = await db.collection('users').doc(userId).collection('projects').doc(projectId).get();
    if (projectDoc.exists) return true;

    // Also check workstations collection
    const wsDoc = await db.collection('users').doc(userId).collection('workstations').doc(projectId).get();
    if (wsDoc.exists) return true;

    // Fallback: check if the projectId starts with user's ID pattern
    // This is a safety net during migration
    return false;
  } catch {
    return false;
  }
}
