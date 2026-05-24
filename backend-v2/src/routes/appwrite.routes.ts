import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware';
import { appwriteManagementService } from '../services/appwrite-management.service';
import { supabaseAdmin } from '../lib/supabase';

export const appwriteRouter = Router();

/**
 * POST /api/appwrite/provision
 * Body: { projectId: uuid }
 * Provisiona (o riusa) il database Appwrite per l'utente autenticato
 * e lo collega al progetto Bynot indicato.
 */
appwriteRouter.post('/provision', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ projectId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { projectId } = parsed.data;

  // Verifica che il progetto Bynot appartenga all'utente
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, user_id, appwrite_database_id')
    .eq('id', projectId)
    .single();

  if (projectError || !project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  if (project.user_id !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const result = await appwriteManagementService.provisionUserDatabase(req.userId!, projectId);
    res.json(result);
  } catch (err: any) {
    console.error('[provision] error:', err);
    res.status(500).json({ error: err?.message ?? 'provision failed' });
  }
});

/**
 * POST /api/appwrite/collections
 * Body: { projectId: uuid, schema: AppwriteCollectionSchema }
 */
appwriteRouter.post('/collections', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({
      projectId: z.string().uuid(),
      schema: z.object({
        id: z.string().min(1).max(36),
        name: z.string().min(1),
        attributes: z.array(z.any()).min(1),
        indexes: z.array(z.any()).optional(),
        documentSecurity: z.boolean().optional(),
      }),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }

  const { projectId, schema } = parsed.data;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('appwrite_database_id, user_id')
    .eq('id', projectId)
    .single();

  if (!project || project.user_id !== req.userId || !project.appwrite_database_id) {
    res.status(404).json({ error: 'Project DB not provisioned' });
    return;
  }

  try {
    await appwriteManagementService.createCollection(project.appwrite_database_id, schema as any);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[createCollection] error:', err);
    res.status(500).json({ error: err?.message ?? 'createCollection failed' });
  }
});

/**
 * DELETE /api/appwrite/database/:projectId
 * Cancella tutto il database Appwrite associato al progetto Bynot.
 */
appwriteRouter.delete('/database/:projectId', requireAuth, async (req: AuthedRequest, res) => {
  const projectId = req.params.projectId;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('appwrite_database_id, user_id')
    .eq('id', projectId)
    .single();

  if (!project || project.user_id !== req.userId) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (project.appwrite_database_id) {
    try {
      await appwriteManagementService.deleteUserDatabase(project.appwrite_database_id);
    } catch (err: any) {
      console.error('[deleteUserDatabase] error:', err);
    }
  }

  await supabaseAdmin
    .from('projects')
    .update({
      appwrite_database_id: null,
      appwrite_endpoint: null,
      appwrite_project_id: null,
      appwrite_api_key_encrypted: null,
    })
    .eq('id', projectId);

  res.json({ ok: true });
});

/**
 * GET /api/appwrite/health — diagnostica connessione Appwrite
 */
appwriteRouter.get('/health', async (_req, res) => {
  const result = await appwriteManagementService.health();
  res.status(result.ok ? 200 : 503).json(result);
});
