import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware';
import { supabaseStorageService } from '../services/supabase-storage.service';
import { supabaseAdmin } from '../lib/supabase';

export const filesRouter = Router();

async function ensureProjectOwnership(userId: string, projectId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single();
  return !!data && data.user_id === userId;
}

/**
 * GET /api/files/:projectId
 * Lista metadata dei file di un progetto.
 */
filesRouter.get('/:projectId', requireAuth, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!(await ensureProjectOwnership(req.userId!, projectId))) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  try {
    const files = await supabaseStorageService.listFiles(req.userId!, projectId);
    res.json({ files });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'list failed' });
  }
});

/**
 * POST /api/files/:projectId
 * Body: { path: string, content: string (base64 o utf8), mime?: string, encoding?: 'utf8'|'base64' }
 * Crea o aggiorna un singolo file.
 */
const uploadBody = z.object({
  path: z.string().min(1).max(500),
  content: z.string(),
  mime: z.string().optional(),
  encoding: z.enum(['utf8', 'base64']).default('utf8'),
});

filesRouter.post('/:projectId', requireAuth, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  if (!(await ensureProjectOwnership(req.userId!, projectId))) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const parsed = uploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }

  const { path, content, mime, encoding } = parsed.data;
  const buf = Buffer.from(content, encoding);

  try {
    await supabaseStorageService.uploadFile(req.userId!, projectId, path, buf, mime);
    res.json({ ok: true, path, size: buf.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'upload failed' });
  }
});

/**
 * GET /api/files/:projectId/content?path=...&encoding=utf8|base64
 * Scarica il contenuto di un singolo file.
 */
filesRouter.get('/:projectId/content', requireAuth, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  const path = String(req.query.path ?? '');
  const encoding = (req.query.encoding === 'base64' ? 'base64' : 'utf8') as 'utf8' | 'base64';

  if (!path) {
    res.status(400).json({ error: 'path query param required' });
    return;
  }
  if (!(await ensureProjectOwnership(req.userId!, projectId))) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const buf = await supabaseStorageService.downloadFile(req.userId!, projectId, path);
    res.json({ path, content: buf.toString(encoding), encoding });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'download failed' });
  }
});

/**
 * GET /api/files/:projectId/signed-url?path=...
 * Genera URL firmato (1 ora) per download diretto client-side.
 */
filesRouter.get('/:projectId/signed-url', requireAuth, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  const path = String(req.query.path ?? '');
  if (!path) {
    res.status(400).json({ error: 'path query param required' });
    return;
  }
  if (!(await ensureProjectOwnership(req.userId!, projectId))) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    const url = await supabaseStorageService.createSignedUrl(req.userId!, projectId, path);
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'sign failed' });
  }
});

/**
 * DELETE /api/files/:projectId?path=...
 * Cancella un singolo file (se path query) o tutti i file del progetto (no path).
 */
filesRouter.delete('/:projectId', requireAuth, async (req: AuthedRequest, res) => {
  const { projectId } = req.params;
  const path = req.query.path ? String(req.query.path) : null;

  if (!(await ensureProjectOwnership(req.userId!, projectId))) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  try {
    if (path) {
      await supabaseStorageService.deleteFile(req.userId!, projectId, path);
    } else {
      await supabaseStorageService.deleteProjectFiles(req.userId!, projectId);
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'delete failed' });
  }
});
