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
import { notificationRouter } from './notification.routes';
import { aiRouter } from './ai.routes';
import { iapRouter } from './iap.routes';
import { createPreviewProxy, createAssetProxy } from '../middleware/vm-router';
import { config } from '../config';
import { optionalAuth } from '../middleware/auth';

export function mountRoutes(app: Express): void {
  // Health & logs (root level) — public
  app.use('/', healthRouter);

  // Published sites: /p/{slug} — public
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
  app.all(/^\/.+\.(css|js|mjs|jsx|tsx|ts|map|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|webp|json)$/i, createAssetProxy());

  // --- Public routes (no auth required) ---

  // IAP — webhook is public (Apple calls it), verify-receipt has its own requireAuth
  app.use('/iap', iapRouter);

  // OAuth callbacks — public
  app.use('/github', githubRouter);
  app.use('/oauth/gitlab', gitlabRouter);
  app.use('/oauth/bitbucket', bitbucketRouter);

  // --- Auth-protected routes ---

  // Agent routes — optionalAuth (supports old app versions without auth token)
  app.use('/agent', optionalAuth, agentRouter);

  // Notifications — optionalAuth (supports old app versions without auth token)
  app.use('/notifications', optionalAuth, notificationRouter);

  // Workstation — optionalAuth (supports old app versions that may not send token yet)
  // verifyProjectOwnership already returns true during migration period
  app.use('/workstation', optionalAuth, workstationRouter);

  // Fly — optionalAuth (supports old app versions without auth token)
  app.get('/fly/health', (req, res) => {
    res.json({ status: 'ok', backend: 'docker-ts', timestamp: new Date().toISOString() });
  });
  app.get('/fly/status', (req, res, next) => {
    // Delegate to the flyRouter's /status handler without auth
    req.url = '/status';
    flyRouter(req, res, next);
  });
  app.use('/fly', optionalAuth, flyRouter);

  // Git — optionalAuth (supports old app versions without auth token)
  app.use('/git', optionalAuth, gitRouter);

  // AI — optionalAuth (supports old app versions without auth token)
  app.use('/ai', optionalAuth, aiRouter);

  // Root info — public
  app.get('/', (req, res) => {
    res.json({
      name: 'Drape AI Backend',
      version: '3.0.0',
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
