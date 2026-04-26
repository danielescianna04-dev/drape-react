// ================================================================
// Creator routes — owner-side platform operations.
//
// Mounted at /creator and protected by requireAuth.
//
// Endpoints:
//   POST   /creator/me/username                       set / change own username
//   POST   /creator/me/profile                        set bio / avatar
//   GET    /creator/projects/:id/analytics            visits/day, countries, refs
//   POST   /creator/published/:slug/remix             fork into a new project
//   POST   /creator/published/:slug/rebind-domain     re-attach <slug>.{publishDomain}
//   GET    /creator/projects/:id/versions             list snapshots
//   POST   /creator/projects/:id/rollback/:versionId  republish a past snapshot
//   POST   /creator/projects/:id/custom-domain        add a custom domain
//   GET    /creator/projects/:id/custom-domains       list domains for project
//   DELETE /creator/custom-domain/:domain             remove a domain
// ================================================================

import { Router, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { firebaseService } from '../services/firebase.service';
import { fileService } from '../services/file.service';
import { workspaceService } from '../services/workspace.service';
import { config } from '../config';
import { log } from '../utils/logger';
import { verifyProjectOwnership, getUserPlan, getPlanProjectLimits, getLifetimeCreationCounts, incrementCreationCounter } from '../middleware/auth';
import { getPublishedAnalytics } from '../services/published-analytics.service';
import { addCustomDomain as cfAddCustomDomain, publishedUrlFor } from '../services/cloudflare-pages.service';
import { getSql, isDrapeCloudConfigured } from '../services/drape-cloud/client';
import { auditService } from '../services/audit.service';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { validateProjectId } from '../utils/helpers';

export const creatorRouter = Router();

// ----------------------------------------------------------------
// Username + profile
// ----------------------------------------------------------------

const USERNAME_RE = /^[a-z0-9_]{2,30}$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'drape', 'support', 'help', 'api', 'www',
  'explore', 'p', 'u', 'creator', 'auth', 'login', 'signup',
  'settings', 'profile', 'me', 'about', 'home', 'app',
]);

creatorRouter.post('/me/username', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const raw = String(req.body?.username || '').toLowerCase().trim();
  if (!USERNAME_RE.test(raw)) {
    throw new ValidationError('Username deve essere 2-30 caratteri: lettere minuscole, numeri, underscore');
  }
  if (RESERVED_USERNAMES.has(raw)) {
    throw new ValidationError('Questo username è riservato');
  }
  const db = firebaseService.getFirestore();
  if (!db) return res.status(503).json({ error: 'Firestore unavailable' });

  // Reserve via dedicated `usernames` collection (doc id = username)
  // for atomic uniqueness — Firestore can't query for uniqueness.
  const reserveRef = db.collection('usernames').doc(raw);
  const userRef = db.collection('users').doc(uid);

  try {
    await db.runTransaction(async (tx) => {
      const reserve = await tx.get(reserveRef);
      if (reserve.exists && reserve.data()?.uid !== uid) {
        throw new ValidationError('Username già preso');
      }
      // Release previous username if user is changing.
      const userDoc = await tx.get(userRef);
      const prev = userDoc.data()?.username;
      if (prev && prev !== raw) {
        tx.delete(db.collection('usernames').doc(prev));
      }
      tx.set(reserveRef, { uid, createdAt: new Date() });
      tx.set(userRef, { username: raw, usernameUpdatedAt: new Date() }, { merge: true });
    });
    res.json({ success: true, username: raw });
  } catch (e: any) {
    if (e instanceof ValidationError) throw e;
    log.error(`[Creator] username set failed for ${uid}: ${e?.message}`);
    res.status(500).json({ error: 'Username update failed' });
  }
}));

creatorRouter.post('/me/profile', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const bio = typeof req.body?.bio === 'string' ? req.body.bio.trim().slice(0, 280) : undefined;
  const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim().slice(0, 500) : undefined;
  const db = firebaseService.getFirestore();
  if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
  const update: Record<string, unknown> = { profileUpdatedAt: new Date() };
  if (bio !== undefined) update.bio = bio;
  if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
  await db.collection('users').doc(uid).set(update, { merge: true });
  res.json({ success: true });
}));

// ----------------------------------------------------------------
// Analytics — owner only
// ----------------------------------------------------------------

creatorRouter.get('/projects/:id/analytics', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId!;
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) return res.status(403).json({ error: 'Access denied' });

  const db = firebaseService.getFirestore();
  if (!db) return res.json({ slug: null, summary: null });

  const snap = await db.collection('published_sites').where('projectId', '==', projectId).limit(1).get();
  if (snap.empty) return res.json({ slug: null, summary: null });

  const slug = snap.docs[0].data().slug as string;
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30));
  const summary = await getPublishedAnalytics(slug, days);
  res.json({ slug, days, summary });
}));

// ----------------------------------------------------------------
// Rebind subdomain — re-attach <slug>.{publishDomain} to a Cloudflare-hosted
// site. Useful when the apex DNS wasn't active at first publish, so the
// site lives only on *.pages.dev. Idempotent.
// ----------------------------------------------------------------

creatorRouter.post('/published/:slug/rebind-domain', asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug || '').toLowerCase();
  const uid = req.userId!;
  if (!slug) throw new ValidationError('slug required');

  const db = firebaseService.getFirestore();
  if (!db) return res.status(503).json({ error: 'Firestore unavailable' });

  const siteDoc = await db.collection('published_sites').doc(slug).get();
  if (!siteDoc.exists) return res.status(404).json({ error: 'Not published' });
  const site = siteDoc.data()!;
  if (site.userId !== uid) return res.status(403).json({ error: 'Access denied' });
  if (site.provider !== 'cloudflare') {
    return res.status(400).json({ error: 'Custom subdomain rebind only applies to Cloudflare-hosted sites' });
  }

  const customDomain = `${slug}.${config.publishDomain}`;
  try {
    await cfAddCustomDomain(slug, customDomain);
  } catch (e: any) {
    log.warn(`[Rebind] ${customDomain} attach failed: ${e?.message || e}`);
    return res.status(502).json({ error: 'Domain attach failed', detail: String(e?.message || e).slice(0, 300) });
  }

  const url = publishedUrlFor(slug);
  await db.collection('published_sites').doc(slug).set({ url }, { merge: true });
  auditService.log({ userId: uid, action: 'rebind-domain', resource: slug, details: customDomain, ip: req.ip });
  res.json({ success: true, url, domain: customDomain });
}));

// ----------------------------------------------------------------
// Remix — fork a public published site into a new project owned by
// the requesting user. Requires the source to have isPublic=true.
// Counts against the user's lifetime project creation limits.
// ----------------------------------------------------------------

creatorRouter.post('/published/:slug/remix', asyncHandler(async (req: Request, res: Response) => {
  const slug = String(req.params.slug || '').toLowerCase();
  const uid = req.userId!;
  if (!slug) throw new ValidationError('slug required');

  const db = firebaseService.getFirestore();
  if (!db) return res.status(503).json({ error: 'Firestore unavailable' });

  const siteDoc = await db.collection('published_sites').doc(slug).get();
  if (!siteDoc.exists) return res.status(404).json({ error: 'Source not found' });
  const site = siteDoc.data()!;
  if (site.isPublic !== true) return res.status(403).json({ error: 'Source is not public' });

  // Plan limits — remix creates a "local" project for the user.
  const planId = await getUserPlan(uid);
  const limits = getPlanProjectLimits(planId);
  const counts = await getLifetimeCreationCounts(uid);
  if (counts.local >= limits.maxLocal) {
    return res.status(403).json({
      error: 'LOCAL_LIMIT_EXCEEDED',
      limits: { maxLocal: limits.maxLocal, current: counts.local },
      message: `Hai raggiunto il limite di ${limits.maxLocal} progetti per il piano ${planId}`,
    });
  }

  const sourceProjectId = site.projectId as string;
  const newProjectId = randomUUID();

  // Copy the source project directory into a new one.
  const srcDir = path.join(config.projectsRoot, sourceProjectId);
  const dstDir = await fileService.ensureProjectDir(newProjectId);
  try {
    // node 16.7+ has fs.cp.
    await fs.cp(srcDir, dstDir, { recursive: true, force: true });
    // Re-chown the copy so the container user (1000) can write.
    try { await fs.chown(dstDir, 1000, 1000); } catch {}
  } catch (e: any) {
    log.error(`[Remix] copy failed ${sourceProjectId} → ${newProjectId}: ${e?.message}`);
    await fileService.deleteProject(newProjectId).catch(() => {});
    return res.status(500).json({ error: 'Remix copy failed' });
  }

  // Register ownership record for the new project.
  await db.collection('users').doc(uid).collection('projects').doc(newProjectId).set({
    projectId: newProjectId,
    name: `Remix di ${site.title || site.slug}`,
    technology: 'unknown',
    description: `Remix di ${site.slug}`,
    userId: uid,
    status: 'ready',
    createdAt: new Date().toISOString(),
    remixOfSlug: site.slug,
    remixOfProjectId: sourceProjectId,
  }, { merge: true });

  incrementCreationCounter(uid, 'created').catch(() => {});
  auditService.log({ userId: uid, action: 'remix', resource: newProjectId, details: `from: ${slug}`, ip: req.ip });

  res.json({ success: true, projectId: newProjectId, remixOfSlug: slug });
}));

// ----------------------------------------------------------------
// Versions — list and rollback
// ----------------------------------------------------------------

creatorRouter.get('/projects/:id/versions', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId!;
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) return res.status(403).json({ error: 'Access denied' });
  if (!isDrapeCloudConfigured()) return res.json({ versions: [] });

  const sql = getSql();
  const rows = await sql<{ id: string; version_number: number; size_bytes: string | null; message: string | null; is_active: boolean; created_at: Date }[]>`
    SELECT id, version_number, size_bytes, message, is_active, created_at
    FROM drape_project_versions
    WHERE project_id = ${projectId}
    ORDER BY version_number DESC
    LIMIT 20
  `;
  res.json({
    versions: rows.map(r => ({
      id: r.id,
      versionNumber: r.version_number,
      sizeBytes: r.size_bytes ? parseInt(r.size_bytes, 10) : null,
      message: r.message,
      isActive: r.is_active,
      createdAt: r.created_at.toISOString(),
    })),
  });
}));

creatorRouter.post('/projects/:id/rollback/:versionId', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const versionId = req.params.versionId;
  const uid = req.userId!;
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) return res.status(403).json({ error: 'Access denied' });
  if (!isDrapeCloudConfigured()) return res.status(503).json({ error: 'Versioning unavailable' });

  const sql = getSql();
  const rows = await sql<{ snapshot_path: string; slug: string }[]>`
    SELECT snapshot_path, slug FROM drape_project_versions
    WHERE id = ${versionId} AND project_id = ${projectId}
    LIMIT 1
  `;
  if (rows.length === 0) return res.status(404).json({ error: 'Version not found' });
  const { snapshot_path, slug } = rows[0];

  // Restore the snapshot directory back to the published path.
  const destDir = path.join(config.publishedRoot, slug);
  try {
    await fs.rm(destDir, { recursive: true, force: true });
    await fs.cp(snapshot_path, destDir, { recursive: true, force: true });
  } catch (e: any) {
    log.error(`[Rollback] restore failed ${snapshot_path} → ${destDir}: ${e?.message}`);
    return res.status(500).json({ error: 'Rollback restore failed' });
  }

  // Mark the chosen version active, deactivate the rest.
  await sql`UPDATE drape_project_versions SET is_active = false WHERE project_id = ${projectId}`;
  await sql`UPDATE drape_project_versions SET is_active = true  WHERE id = ${versionId}`;

  auditService.log({ userId: uid, action: 'rollback', resource: projectId, details: `version: ${versionId}`, ip: req.ip });
  res.json({ success: true, slug });
}));

// ----------------------------------------------------------------
// Custom domains
// ----------------------------------------------------------------

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;

creatorRouter.post('/projects/:id/custom-domain', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId!;
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) return res.status(403).json({ error: 'Access denied' });

  // Custom domains are paid-only.
  const planId = await getUserPlan(uid);
  if (planId === 'free') {
    return res.status(403).json({ error: 'CUSTOM_DOMAIN_REQUIRES_PAID' });
  }

  const domain = String(req.body?.domain || '').toLowerCase().trim();
  if (!DOMAIN_RE.test(domain)) throw new ValidationError('Dominio non valido');
  if (!isDrapeCloudConfigured()) return res.status(503).json({ error: 'Storage unavailable' });

  // Look up the slug for this project (must be already published).
  const db = firebaseService.getFirestore();
  if (!db) return res.status(503).json({ error: 'Firestore unavailable' });
  const snap = await db.collection('published_sites').where('projectId', '==', projectId).limit(1).get();
  if (snap.empty) return res.status(400).json({ error: 'Pubblica prima il progetto, poi configura il dominio' });
  const slug = snap.docs[0].data().slug as string;

  const sql = getSql();
  try {
    await sql`
      INSERT INTO drape_custom_domains (domain, project_id, slug, user_id, status)
      VALUES (${domain}, ${projectId}, ${slug}, ${uid}, 'pending')
      ON CONFLICT (domain) DO UPDATE SET project_id = EXCLUDED.project_id,
                                         slug = EXCLUDED.slug,
                                         user_id = EXCLUDED.user_id,
                                         status = 'pending',
                                         last_check_at = NULL,
                                         last_error = NULL
    `;
  } catch (e: any) {
    log.error(`[CustomDomain] insert failed: ${e?.message}`);
    return res.status(500).json({ error: 'Domain registration failed' });
  }

  res.json({
    success: true,
    domain,
    status: 'pending',
    instructions: {
      type: 'CNAME',
      name: domain,
      value: 'cname.drape.app',
      help: 'Imposta questo record CNAME presso il tuo registrar. Verificheremo entro qualche minuto.',
    },
  });
}));

creatorRouter.get('/projects/:id/custom-domains', asyncHandler(async (req: Request, res: Response) => {
  const projectId = req.params.id;
  validateProjectId(projectId);
  const uid = req.userId!;
  const isOwner = await verifyProjectOwnership(uid, projectId);
  if (!isOwner) return res.status(403).json({ error: 'Access denied' });
  if (!isDrapeCloudConfigured()) return res.json({ domains: [] });

  const sql = getSql();
  const rows = await sql<{ domain: string; status: string; created_at: Date; verified_at: Date | null; last_error: string | null }[]>`
    SELECT domain, status, created_at, verified_at, last_error
    FROM drape_custom_domains
    WHERE project_id = ${projectId}
    ORDER BY created_at DESC
  `;
  res.json({
    domains: rows.map(r => ({
      domain: r.domain,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      verifiedAt: r.verified_at?.toISOString() || null,
      lastError: r.last_error,
    })),
  });
}));

creatorRouter.delete('/custom-domain/:domain', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const domain = String(req.params.domain || '').toLowerCase();
  if (!isDrapeCloudConfigured()) return res.status(503).json({ error: 'Storage unavailable' });
  const sql = getSql();
  await sql`DELETE FROM drape_custom_domains WHERE domain = ${domain} AND user_id = ${uid}`;
  res.json({ success: true });
}));
