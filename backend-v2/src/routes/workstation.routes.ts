import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware';
import { supabaseAdmin } from '../lib/supabase';
import { findStarter } from '../templates/appwrite-starters';

export const workstationRouter = Router();

/**
 * POST /workstation/create-with-template
 * Crea un progetto Drape (riga in `projects`) e ritorna il projectId.
 * Sostituisce l'endpoint v1 che provisionava un Docker workspace.
 */
const createBodySchema = z.object({
  projectName: z.string().min(1).max(100),
  technology: z.string().min(1).max(50),
  description: z.string().max(5000).optional(),
  structuredAnswers: z.record(z.string(), z.any()).optional(),
  cloudEnabled: z.boolean().optional(),
  userId: z.string().optional(),
  agentMode: z.boolean().optional(),
  starterId: z.string().optional(),
});

workstationRouter.post('/create-with-template', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { projectName, technology, description, starterId } = parsed.data;

  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        user_id: req.userId,
        name: projectName,
        description: description ?? null,
        template: starterId ?? technology,
      })
      .select('id')
      .single();
    if (error) throw error;

    res.json({
      success: true,
      projectId: data.id,
      taskId: data.id,
      workstationId: data.id,
    });
  } catch (err: any) {
    console.error('[workstation.create] error:', err);
    res.status(500).json({ success: false, error: err?.message ?? 'create failed' });
  }
});

/**
 * POST /workstation/agent-prompt
 * Costruisce un prompt ottimizzato per l'agent di creazione progetto.
 */
const promptBodySchema = z.object({
  projectId: z.string().uuid().optional(),
  technology: z.string().min(1),
  projectName: z.string().min(1),
  description: z.string().optional(),
  cloudEnabled: z.boolean().optional(),
  structuredAnswers: z.record(z.string(), z.any()).optional(),
});

workstationRouter.post('/agent-prompt', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = promptBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { technology, projectName, description, structuredAnswers, cloudEnabled } = parsed.data;

  let prompt = `Build a ${technology} project named "${projectName}".\n\n`;
  if (description) {
    prompt += `Description:\n${description}\n\n`;
  }

  if (structuredAnswers && Object.keys(structuredAnswers).length > 0) {
    prompt += 'User answers from the interview:\n';
    for (const [key, val] of Object.entries(structuredAnswers)) {
      const v = Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? JSON.stringify(val) : String(val);
      prompt += `- ${key}: ${v}\n`;
    }
    prompt += '\n';
  }

  // Append Appwrite/Sandpack constraints if cloud enabled
  if (cloudEnabled !== false) {
    prompt += `Stack constraints:
- Frontend only (Sandpack-compatible): React/Vite, Vue, Svelte, vanilla HTML/JS. NO backend custom.
- Persistence: Appwrite SDK \`appwrite\` (env: VITE_APPWRITE_ENDPOINT, VITE_APPWRITE_PROJECT_ID, VITE_APPWRITE_DATABASE_ID)
- Payments: Stripe Checkout link (no webhook)
- Email: Resend or Formspree (direct fetch)
- AI external (OpenAI/Anthropic): direct fetch from browser
- NO: express/fastify, fs, child_process, native binaries, Firebase

Output: list of files to create with full content. Include AppwriteCollectionSchema if new tables needed.`;
  }

  res.json({ prompt });
});

/**
 * GET /workstation/list (alias per /api/files/:projectId)
 */
workstationRouter.get('/list', requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('user_id', req.userId)
    .order('updated_at', { ascending: false });
  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }
  res.json({ success: true, projects: data ?? [] });
});

/**
 * Stub per endpoint settings legacy (ritornano dati safe per evitare 404 in app)
 */
workstationRouter.get('/system-status', (_req, res) => {
  res.json({ ok: true, services: { api: 'up', appwrite: 'up', opencode: 'up' } });
});

workstationRouter.get('/budget/:userId', (_req, res) => {
  res.json({ ok: true, used: 0, limit: 0, unlimited: true });
});

workstationRouter.get('/project-ai-analytics/:projectId', (_req, res) => {
  res.json({ ok: true, tokensIn: 0, tokensOut: 0, costUsd: 0 });
});
