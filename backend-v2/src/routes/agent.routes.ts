import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware';
import { opencodeHttpService } from '../services/opencode-http.service';
import { buildBynotSystemPrompt } from '../templates/opencode-system-prompt';
import { supabaseAdmin } from '../lib/supabase';

export const agentRouter = Router();

const chatBodySchema = z.object({
  sessionId: z.string().uuid(),
  projectId: z.string().uuid(),
  message: z.string().min(1).max(50000),
  model: z.string().optional(),
  starterId: z.string().optional(),
  systemContext: z.string().optional(),
});

/**
 * POST /api/agent/chat
 *
 * SSE streaming endpoint per chat con l'agent opencode.
 *
 * Headers:
 *  - Authorization: Bearer <supabase-access-token>
 *  - Content-Type: application/json
 *
 * Body:
 *  - sessionId: UUID sessione (client-managed, persisti su Supabase ai_sessions)
 *  - projectId: UUID del progetto Bynot
 *  - message: prompt dell'utente
 *  - model?: forza un modello specifico
 *  - starterId?: template scelto (todo, blog, ecc.) per arricchire system prompt
 *  - systemContext?: contesto aggiuntivo (es. lista file)
 *
 * Response:
 *  - text/event-stream con eventi AgentEvent serializzati
 *  - Persiste un ai_run record alla fine per audit
 */
agentRouter.post('/chat', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }

  const { sessionId, projectId, message, model, starterId, systemContext } = parsed.data;

  // Verifica ownership del progetto + recupera credenziali Appwrite
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, user_id, appwrite_database_id, appwrite_endpoint, appwrite_project_id')
    .eq('id', projectId)
    .single();

  if (projectError || !project || project.user_id !== req.userId) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  // SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const appwriteCredentials =
    project.appwrite_database_id && project.appwrite_endpoint && project.appwrite_project_id
      ? {
          endpoint: project.appwrite_endpoint,
          projectId: project.appwrite_project_id,
          databaseId: project.appwrite_database_id,
        }
      : undefined;

  const enrichedSystemContext = buildBynotSystemPrompt({
    starterId,
    extraContext: systemContext,
  });

  const startedAt = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let lastError: string | undefined;
  const toolCalls: Array<{ name: string; input: any }> = [];
  let assembledResponse = '';

  try {
    for await (const event of opencodeHttpService.chatStream({
      sessionId,
      message,
      model,
      appwriteCredentials,
      systemContext: enrichedSystemContext,
      starterId,
    })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      if (event.type === 'token') assembledResponse += event.content;
      if (event.type === 'tool_use') toolCalls.push({ name: event.name, input: event.input });
      if (event.type === 'message_end') {
        tokensIn = event.tokensIn;
        tokensOut = event.tokensOut;
      }
      if (event.type === 'error') lastError = event.message;
    }
  } catch (err: any) {
    console.error('[agent.chat] stream error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err?.message ?? 'unknown' })}\n\n`);
    lastError = err?.message ?? String(err);
  } finally {
    res.end();
  }

  // Persisti ai_run record (best-effort, non bloccante per il client)
  supabaseAdmin
    .from('ai_runs')
    .insert({
      session_id: sessionId,
      user_id: req.userId,
      prompt: message,
      response: assembledResponse || null,
      model: model ?? null,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      duration_ms: Date.now() - startedAt,
      tool_calls: toolCalls,
      error: lastError ?? null,
    } as any)
    .then(({ error }) => {
      if (error) console.warn('[agent.chat] failed to persist ai_run:', error.message);
    });
});

/**
 * POST /api/agent/cancel
 * Body: { sessionId }
 * Cancella una sessione in corso.
 */
agentRouter.post('/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z.object({ sessionId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body' });
    return;
  }

  try {
    await opencodeHttpService.cancelSession(parsed.data.sessionId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'cancel failed' });
  }
});

/**
 * GET /api/agent/health
 */
agentRouter.get('/health', async (_req, res) => {
  const result = await opencodeHttpService.health();
  res.status(result.ok ? 200 : 503).json(result);
});
