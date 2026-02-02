import express from 'express';
import cors from 'cors';
import { mountRoutes } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error-handler';

export function createApp(): express.Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Routes
  mountRoutes(app);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
