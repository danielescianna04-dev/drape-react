// ================================================================
// MCP servers (Model Context Protocol) — installable tool providers.
//
// Mounted at /mcps. All endpoints require auth via requireAuth.
//
// Endpoints:
//   GET    /mcps/mine                       user's installed MCPs
//   GET    /mcps/marketplace                public marketplace (?search, ?category)
//   GET    /mcps/:id                        fetch one (user copy or marketplace via ?source=marketplace)
//   POST   /mcps                            create a draft (private to owner)
//   PATCH  /mcps/:id                        update an owned draft (metadata + command/args/env schema)
//   PATCH  /mcps/:id/env                    set env values (the secret part)
//   PATCH  /mcps/:id/enabled                toggle on/off (off = AgentLoop won't spawn it)
//   DELETE /mcps/:id                        delete an owned MCP
//   POST   /mcps/:id/publish                push the user's draft to the marketplace
//   POST   /mcps/marketplace/:id/install    clone a marketplace MCP into mine
// ================================================================

import { Router, Request, Response } from 'express';
import { firebaseService } from '../services/firebase.service';
import { asyncHandler } from '../middleware/async-handler';
import {
  createDraft,
  getById,
  install,
  listMarketplace,
  listMyInstalled,
  publish,
  remove,
  setEnabled,
  setEnvValues,
  update,
  type McpCategory,
} from '../services/mcp.service';

export const mcpsRouter = Router();

async function getAuthorUsername(uid: string): Promise<string | null> {
  try {
    const db = firebaseService.getFirestore();
    if (!db) return null;
    const u = await db.collection('users').doc(uid).get();
    return (u.data()?.username as string) || null;
  } catch {
    return null;
  }
}

// ─── Reads ───────────────────────────────────────────────────────────────

mcpsRouter.get('/mine', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const mcps = await listMyInstalled(uid);
  res.json({ mcps });
}));

mcpsRouter.get('/marketplace', asyncHandler(async (req: Request, res: Response) => {
  const category = (req.query.category as McpCategory | undefined) || undefined;
  const search = (req.query.search as string | undefined) || undefined;
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10) || 100));
  const mcps = await listMarketplace({ search, category, limit });
  res.json({ mcps });
}));

mcpsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const fromMarketplace = String(req.query.source) === 'marketplace';
  const mcp = await getById(req.params.id, { fromMarketplace });
  if (!mcp) return res.status(404).json({ error: 'Not found' });
  if (!fromMarketplace && mcp.ownerUid && mcp.ownerUid !== uid) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ mcp });
}));

// ─── Writes ──────────────────────────────────────────────────────────────

mcpsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const author = await getAuthorUsername(uid);
  try {
    const mcp = await createDraft(uid, author, req.body || {});
    res.status(201).json({ mcp });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid input' });
  }
}));

mcpsRouter.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    const mcp = await update(uid, req.params.id, req.body || {});
    res.json({ mcp });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Update failed' });
  }
}));

mcpsRouter.patch('/:id/env', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    const mcp = await setEnvValues(uid, req.params.id, (req.body?.envValues as Record<string, string>) || {});
    res.json({ mcp });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Env update failed' });
  }
}));

mcpsRouter.patch('/:id/enabled', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    await setEnabled(uid, req.params.id, !!req.body?.enabled);
    res.json({ success: true });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Toggle failed' });
  }
}));

mcpsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    await remove(uid, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : 400;
    res.status(status).json({ error: err?.message || 'Delete failed' });
  }
}));

mcpsRouter.post('/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    const mcp = await publish(uid, req.params.id);
    res.json({ mcp });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Publish failed' });
  }
}));

mcpsRouter.post('/marketplace/:id/install', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const author = await getAuthorUsername(uid);
  try {
    const mcp = await install(uid, req.params.id, author);
    res.json({ mcp });
  } catch (err: any) {
    const status = /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Install failed' });
  }
}));
