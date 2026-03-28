import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';
import itemsRouter from './routes/items.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow frontend dev server
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

// Better Auth handler — must come before express.json() so it can read raw body
app.all('/api/auth/*', toNodeHandler(auth));

// Body parsing for other routes
app.use(express.json());

// API routes
app.use('/api/items', itemsRouter);

// Serve static build in production
const distPath = join(__dirname, '..', 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  console.log(`Auth available at http://localhost:${PORT}/api/auth`);
});
