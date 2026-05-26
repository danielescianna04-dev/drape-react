import path from 'path';
import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { healthRouter } from './routes/health.routes';
import { appwriteRouter } from './routes/appwrite.routes';
import { agentRouter } from './routes/agent.routes';
import { agentStreamRouter } from './routes/agent-stream.routes';
import { aiRouter } from './routes/ai.routes';
import { filesRouter } from './routes/files.routes';
import { workstationRouter } from './routes/workstation.routes';

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(
  cors({
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);

// Static: Sandpack bridge HTML servito su /sandpack/* per essere caricato in WebView RN
app.use('/sandpack', express.static(path.join(__dirname, '../public/sandpack')));

app.use('/health', healthRouter);
app.use('/api/appwrite', appwriteRouter);
app.use('/api/agent', agentRouter);
// Legacy v1 path che il frontend chiama: /agent/create, /agent/run/fast, ecc.
app.use('/agent', agentStreamRouter);
app.use('/api/ai', aiRouter);
// Alias legacy: frontend chiama /ai/* (senza /api). Mantieni per compat.
app.use('/ai', aiRouter);
app.use('/api/files', filesRouter);
app.use('/workstation', workstationRouter);
// Anche alias /settings/* (frontend usa questo path per system-status, budget, project-ai-analytics)
app.use('/settings', workstationRouter);

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err);
  res.status(500).json({ error: err?.message ?? 'Internal error' });
});

const server = app.listen(env.PORT, () => {
  console.log(`bynot-backend-v2 listening on :${env.PORT}`);
  console.log(`  Supabase: ${env.SUPABASE_URL}`);
  console.log(`  Appwrite: ${env.APPWRITE_ENDPOINT}`);
});

const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
