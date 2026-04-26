// ================================================================
// Skills (Plugins) routes — user-invokable AI prompt presets.
//
// Mounted at /skills. All endpoints require auth via requireAuth.
//
// Endpoints:
//   GET    /skills/mine                 user's installed skills
//   GET    /skills/marketplace          public marketplace (?search, ?category)
//   GET    /skills/:id                  fetch one (user copy)
//   POST   /skills                      create a draft (private to owner)
//   PATCH  /skills/:id                  update an owned draft
//   DELETE /skills/:id                  delete an owned skill
//   POST   /skills/:id/publish          push the user's draft to the marketplace
//   POST   /skills/marketplace/:id/install   clone a marketplace skill into mine
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
  update,
  type SkillCategory,
} from '../services/skills.service';

export const skillsRouter = Router();

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

skillsRouter.get('/mine', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const skills = await listMyInstalled(uid);
  res.json({ skills });
}));

skillsRouter.get('/marketplace', asyncHandler(async (req: Request, res: Response) => {
  const category = (req.query.category as SkillCategory | undefined) || undefined;
  const search = (req.query.search as string | undefined) || undefined;
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '100'), 10) || 100));
  const skills = await listMarketplace({ search, category, limit });
  res.json({ skills });
}));

skillsRouter.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const fromMarketplace = String(req.query.source) === 'marketplace';
  const skill = await getById(req.params.id, { fromMarketplace });
  if (!skill) return res.status(404).json({ error: 'Not found' });
  // Private user-skills are only readable by the owner.
  if (!fromMarketplace && skill.ownerUid && skill.ownerUid !== uid) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({ skill });
}));

// ─── Writes ──────────────────────────────────────────────────────────────

skillsRouter.post('/', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const author = await getAuthorUsername(uid);
  try {
    const skill = await createDraft(uid, author, req.body || {});
    res.status(201).json({ skill });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Invalid input' });
  }
}));

skillsRouter.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    const skill = await update(uid, req.params.id, req.body || {});
    res.json({ skill });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Update failed' });
  }
}));

skillsRouter.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    await remove(uid, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : 400;
    res.status(status).json({ error: err?.message || 'Delete failed' });
  }
}));

skillsRouter.post('/:id/publish', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  try {
    const skill = await publish(uid, req.params.id);
    res.json({ skill });
  } catch (err: any) {
    const status = /forbidden/i.test(err?.message) ? 403 : /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Publish failed' });
  }
}));

skillsRouter.post('/marketplace/:id/install', asyncHandler(async (req: Request, res: Response) => {
  const uid = req.userId!;
  const author = await getAuthorUsername(uid);
  try {
    const skill = await install(uid, req.params.id, author);
    res.json({ skill });
  } catch (err: any) {
    const status = /not found/i.test(err?.message) ? 404 : 400;
    res.status(status).json({ error: err?.message || 'Install failed' });
  }
}));
