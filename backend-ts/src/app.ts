import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { mountRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { optionalAuth } from './middleware/auth';
import { securityMonitor } from './middleware/security-monitor';

export function createApp(): express.Express {
  const app = express();

  // CORS — restrict to drape.info, *.drape.info, and localhost (any port) for dev
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, mobile apps)
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowed =
        origin === 'https://drape.info' ||
        /^https:\/\/([a-z0-9-]+\.)*drape\.info$/.test(origin) ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin);

      if (allowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  }));

  // Trust proxy (behind reverse proxy / load balancer)
  app.set('trust proxy', 1);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // General rate limiter: 100 requests per minute
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    keyGenerator: (req) => (req as any).userId || req.ip || 'unknown',
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later' },
  });
  app.use(generalLimiter);

  // Strict rate limiter for agent/stream: 10 requests per minute
  const agentStreamLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many agent requests, please try again later' },
  });
  app.use('/agent/stream', agentStreamLimiter);
  app.use('/agent/run', agentStreamLimiter);

  // Optional auth — always extracts userId if token is present
  app.use(optionalAuth);

  // Security monitoring — logs suspicious activity (after auth so userId is available)
  app.use(securityMonitor);

  // Routes
  mountRoutes(app);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
