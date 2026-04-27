import { Express } from 'express';
import express from 'express';
import path from 'path';
import { flyRouter } from './fly.routes';
import { workstationRouter } from './workstation.routes';
import { gitRouter } from './git.routes';
import { githubRouter } from './github.routes';
import { gitlabRouter } from './gitlab.routes';
import { bitbucketRouter } from './bitbucket.routes';
import { healthRouter } from './health.routes';
import { agentRouter } from './agent.routes';
import { jobsRouter } from './jobs.routes';
import { notificationRouter } from './notification.routes';
import { aiRouter } from './ai.routes';
import { iapRouter } from './iap.routes';
import { authRouter } from './auth.routes';
import { dbRouter } from './db.routes';
import { dataExportRouter } from './data-export.routes';
import { createDrapeCloudRouter } from './drape-cloud.routes';
import { filesBrowseRouter } from './files-browse.routes';
import { exploreRouter } from './explore.routes';
import { creatorRouter } from './creator.routes';
import { skillsRouter } from './skills.routes';
import { createPreviewProxy, createAssetProxy, createSubdomainPreviewProxy } from '../middleware/vm-router';
import { config } from '../config';
import { requireAuth } from '../middleware/auth';

export function mountRoutes(app: Express): void {
  // Subdomain preview proxy: {projectId}.drape.info → container dev server
  // Must be registered BEFORE all other routes to intercept subdomain requests
  app.use(createSubdomainPreviewProxy());

  // Health & logs (root level) — public
  app.use('/', healthRouter);

  // Published sites: /p/{slug} — public
  // Track a view on root document load only (skip assets like .css/.js).
  // Best-effort: never block the response, never throw.
  app.use('/p/:slug', (req, res, next) => {
    const slug = req.params.slug;
    const isDocument = req.path === '/' || req.path === '' || req.path === '/index.html'
      || (!path.extname(req.path) && req.method === 'GET');
    if (isDocument && req.method === 'GET') {
      // Resolve projectId from Firestore (cheap: ~10ms, can be cached later).
      // Fire-and-forget; no await on the response path.
      import('../services/firebase.service').then(({ firebaseService }) => {
        const db = firebaseService.getFirestore();
        if (!db) return;
        return db.collection('published_sites').doc(slug).get().then(snap => {
          const projectId = snap.data()?.projectId;
          if (!projectId) return;
          return import('../services/published-analytics.service').then(({ recordPublishedView }) =>
            recordPublishedView({
              slug,
              projectId,
              ip: (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim(),
              userAgent: req.headers['user-agent']?.toString() || '',
              referrer: req.headers['referer']?.toString(),
              path: req.path,
              country: req.headers['cf-ipcountry']?.toString() || req.headers['x-vercel-ip-country']?.toString(),
            })
          );
        });
      }).catch(() => { /* analytics must never break a request */ });
    }
    next();
  });
  // Document-only handler: when the request is for the root of a
  // published site (path / or /index.html), serve index.html with
  // Open Graph + Twitter card meta tags injected from Firestore.
  // Static assets (.css/.js/images) fall through to express.static.
  app.get(['/p/:slug', '/p/:slug/', '/p/:slug/index.html'], async (req, res, next) => {
    try {
      const slug = req.params.slug;
      const indexPath = path.join(config.publishedRoot, slug, 'index.html');
      const fs = await import('fs/promises');
      let html: string;
      try { html = await fs.readFile(indexPath, 'utf-8'); }
      catch { return next(); }

      // Look up site metadata; non-fatal if Firestore is unavailable.
      const { firebaseService } = await import('../services/firebase.service');
      const db = firebaseService.getFirestore();
      const meta = db ? (await db.collection('published_sites').doc(slug).get()).data() : null;
      const title = meta?.title || slug;
      const description = meta?.description || `App pubblicata con Drape.`;
      const url = meta?.url || `${config.publicUrl}/p/${slug}/`;

      const escape = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const ogBlock = `
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escape(url)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(title)}" />
    <meta name="twitter:description" content="${escape(description)}" />
    <meta name="description" content="${escape(description)}" />`;

      // Inject right after <head> if present, otherwise prepend.
      const injected = /<head[^>]*>/i.test(html)
        ? html.replace(/<head([^>]*)>/i, `<head$1>${ogBlock}`)
        : ogBlock + html;

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(injected);
    } catch {
      next();
    }
  });
  app.use('/p', express.static(config.publishedRoot, { extensions: ['html'] }));
  app.get('/p/:slug/*', (req, res, next) => {
    const indexPath = path.join(config.publishedRoot, req.params.slug, 'index.html');
    res.sendFile(indexPath, (err) => { if (err) next(); });
  });

  // Preview proxy: /preview/:projectId/* — container dev server
  app.all('/preview/:projectId', createPreviewProxy());
  app.all('/preview/:projectId/*', createPreviewProxy());

  // Asset proxy: framework/static assets referenced from root
  // Next.js
  app.all('/_next/*', createAssetProxy());
  app.all('/__nextjs_original-stack-frame', createAssetProxy());
  // Vite
  app.all('/@vite/*', createAssetProxy());
  app.all('/@react-refresh', createAssetProxy());
  app.all('/@fs/*', createAssetProxy());
  app.all('/src/*', createAssetProxy());
  app.all('/node_modules/*', createAssetProxy());
  // Common
  app.all('/favicon.ico', createAssetProxy());
  // Static file extensions (CSS, JS, images, fonts) — catch root-relative refs
  app.all(/^\/.+\.(css|js|mjs|jsx|tsx|ts|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|otf|eot|webp|json|wasm)$/i, createAssetProxy());

  // --- Public routes (no auth required) ---

  // Explore — public gallery + JSON API. SEO-indexable HTML page.
  app.use('/', exploreRouter);

  // Drape Cloud — public multi-tenant API for generated apps.
  // Auth is via x-drape-project-key header (not Drape user auth).
  app.use('/v1', createDrapeCloudRouter());

  // IAP — webhook is public (Apple calls it), verify-receipt has its own requireAuth
  app.use('/iap', iapRouter);

  // OAuth callbacks — public
  app.use('/github', githubRouter);
  app.use('/oauth/gitlab', gitlabRouter);
  app.use('/oauth/bitbucket', bitbucketRouter);

  // Auth email routes — public (called during registration before user is authenticated)
  app.use('/auth', authRouter);

  // File browser — public (auth via query token for browser access)
  app.use('/files', filesBrowseRouter);

  // --- Auth-protected routes ---

  // Long-running generation jobs (read-side: snapshots + live SSE replay/tail).
  // MUST be mounted before the catch-all /agent router so its paths win.
  app.use('/agent/jobs', requireAuth, jobsRouter);

  // Agent routes
  app.use('/agent', requireAuth, agentRouter);

  // Notifications
  app.use('/notifications', requireAuth, notificationRouter);

  // Workstation
  app.use('/workstation', requireAuth, workstationRouter);

  // Fly
  app.get('/fly/health', (req, res) => {
    res.json({ status: 'ok', backend: 'docker-ts', timestamp: new Date().toISOString() });
  });
  app.get('/fly/status', (req, res, next) => {
    // Delegate to the flyRouter's /status handler without auth
    req.url = '/status';
    flyRouter(req, res, next);
  });
  app.use('/fly', requireAuth, flyRouter);

  // Git
  app.use('/git', requireAuth, gitRouter);

  // AI
  app.use('/ai', requireAuth, aiRouter);

  // Database viewer
  app.use('/db', requireAuth, dbRouter);

  // Data export (GDPR right to portability)
  app.use('/data-export', requireAuth, dataExportRouter);

  // Creator — owner-side platform operations (analytics, remix,
  // versions, custom domains, profile/username).
  app.use('/creator', requireAuth, creatorRouter);

  // Skills (Plugins) — user-invokable AI prompt presets + marketplace.
  app.use('/skills', requireAuth, skillsRouter);

  // Root info — public
  app.get('/', (req, res) => {
    res.json({
      name: 'Drape AI Backend',
      version: '2.2.1',
      architecture: 'docker-ts',
      endpoints: {
        fly: '/fly/*',
        workstation: '/workstation/*',
        git: '/git/*',
        agent: '/agent/*',
        published: '/p/:slug',
        health: '/health',
        logs: '/logs/stream',
      },
    });
  });
}
