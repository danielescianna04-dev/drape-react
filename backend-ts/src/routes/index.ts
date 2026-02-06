import { Express } from 'express';
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
import { createPreviewProxy, createAssetProxy } from '../middleware/vm-router';

export function mountRoutes(app: Express): void {
  // Health & logs (root level)
  app.use('/', healthRouter);

  // Preview proxy: /preview/:projectId/* → container dev server
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

  // Core routes
  app.use('/fly', flyRouter);
  app.use('/workstation', workstationRouter);
  app.use('/git', gitRouter);
  app.use('/github', githubRouter);
  app.use('/oauth/gitlab', gitlabRouter);
  app.use('/oauth/bitbucket', bitbucketRouter);
  app.use('/agent', agentRouter);
  app.use('/notifications', notificationRouter);
  app.use('/ai', aiRouter);

  // Root info
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
        health: '/health',
        logs: '/logs/stream',
      },
    });
  });
}
