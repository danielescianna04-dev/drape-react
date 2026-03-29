import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { firebaseService } from '../services/firebase.service';
import { log } from '../utils/logger';

export const dataExportRouter = Router();

/**
 * GDPR Article 20 — Right to Data Portability
 *
 * GET /data-export/my-data
 * Returns ALL user data as a structured JSON document.
 *
 * Data categories exported:
 *  - profile:        users/{uid} document (email, displayName, plan, etc.)
 *  - projects:       user_projects where userId == uid
 *  - events:         user_events where userId == uid (analytics/telemetry)
 *  - gitAccounts:    users/{uid}/git-accounts subcollection (tokens EXCLUDED)
 *  - configs:        user_configs/{uid} document
 *  - publishedSites: published_sites where userId == uid
 *  - presence:       presence/{uid} document
 *
 * Rate limited: 1 request per hour per user (in-memory).
 */

// Simple in-memory rate limiter: userId -> last export timestamp
const exportRateLimit = new Map<string, number>();
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour

dataExportRouter.get('/my-data', asyncHandler(async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  // Rate limiting check
  const lastExport = exportRateLimit.get(userId);
  if (lastExport && Date.now() - lastExport < RATE_LIMIT_MS) {
    const retryAfterSeconds = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastExport)) / 1000);
    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded. You can export your data once per hour.',
      retryAfterSeconds,
    });
    return;
  }

  const db = firebaseService.getFirestore();
  if (!db) {
    res.status(503).json({ success: false, error: 'Database not available' });
    return;
  }

  log.info(`[DataExport] Exporting data for user ${userId}`);

  const exportData: Record<string, any> = {
    exportedAt: new Date().toISOString(),
    userId,
    gdprArticle: 'Article 20 — Right to Data Portability',
  };

  // 1. User profile
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      const data = { ...userDoc.data() };
      // Exclude sensitive internal fields
      delete data.activeDevice;
      delete data.pushToken;
      exportData.profile = data;
    } else {
      exportData.profile = null;
    }
  } catch (e: any) {
    log.warn(`[DataExport] Failed to export profile for ${userId}: ${e.message}`);
    exportData.profile = { error: 'Failed to export' };
  }

  // 2. Projects metadata
  try {
    const projectsSnap = await db.collection('user_projects').where('userId', '==', userId).get();
    exportData.projects = projectsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e: any) {
    log.warn(`[DataExport] Failed to export projects for ${userId}: ${e.message}`);
    exportData.projects = { error: 'Failed to export' };
  }

  // 3. Analytics events
  try {
    const eventsSnap = await db.collection('user_events').where('userId', '==', userId).get();
    exportData.events = eventsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e: any) {
    log.warn(`[DataExport] Failed to export events for ${userId}: ${e.message}`);
    exportData.events = { error: 'Failed to export' };
  }

  // 4. Git accounts (WITHOUT tokens — sensitive credentials excluded)
  try {
    const gitSnap = await db.collection('users').doc(userId).collection('git-accounts').get();
    exportData.gitAccounts = gitSnap.docs.map(d => {
      const data: Record<string, any> = { id: d.id, ...d.data() };
      // Strip tokens for security
      delete data.token;
      delete data.accessToken;
      delete data.refreshToken;
      return data;
    });
  } catch (e: any) {
    log.warn(`[DataExport] Failed to export git accounts for ${userId}: ${e.message}`);
    exportData.gitAccounts = { error: 'Failed to export' };
  }

  // 5. User configs
  try {
    const configDoc = await db.collection('user_configs').doc(userId).get();
    exportData.configs = configDoc.exists ? configDoc.data() : null;
  } catch (e: any) {
    log.warn(`[DataExport] Failed to export configs for ${userId}: ${e.message}`);
    exportData.configs = { error: 'Failed to export' };
  }

  // 6. Published sites
  try {
    const sitesSnap = await db.collection('published_sites').where('userId', '==', userId).get();
    exportData.publishedSites = sitesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e: any) {
    log.warn(`[DataExport] Failed to export published sites for ${userId}: ${e.message}`);
    exportData.publishedSites = { error: 'Failed to export' };
  }

  // 7. Presence data
  try {
    const presenceDoc = await db.collection('presence').doc(userId).get();
    exportData.presence = presenceDoc.exists ? presenceDoc.data() : null;
  } catch (e: any) {
    log.warn(`[DataExport] Failed to export presence for ${userId}: ${e.message}`);
    exportData.presence = { error: 'Failed to export' };
  }

  // Update rate limit timestamp
  exportRateLimit.set(userId, Date.now());

  // Evict stale rate-limit entries periodically
  if (exportRateLimit.size > 500) {
    const now = Date.now();
    for (const [k, v] of exportRateLimit) {
      if (now - v > RATE_LIMIT_MS) exportRateLimit.delete(k);
    }
  }

  log.info(`[DataExport] Export completed for user ${userId}`);

  res.json({
    success: true,
    data: exportData,
  });
}));
