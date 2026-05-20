import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware';
import { opencodeHttpService } from '../services/opencode-http.service';
import { buildDrapeSystemPrompt } from '../templates/opencode-system-prompt';
import { supabaseAdmin } from '../lib/supabase';

/**
 * Legacy v1 endpoints per agent streaming.
 *
 * Frontend chiama:
 *   POST /agent/create               → creazione progetto (CreateProjectScreen)
 *   POST /agent/run/fast             → chat fast mode
 *   POST /agent/run/plan             → planning mode
 *   POST /agent/run/execute          → execute mode
 *
 * Tutti mappano a opencode con eventi SSE in formato named (event: name + data).
 */
export const agentStreamRouter = Router();

const bodySchema = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1).max(50000),
  mode: z.string().optional(),
  model: z.string().optional(),
  thinkingLevel: z.string().nullable().optional(),
  projectName: z.string().optional(),
  conversationHistory: z.array(z.any()).optional(),
  images: z.array(z.any()).optional(),
}).passthrough();

function writeSseEvent(res: any, eventName: string, data: unknown): void {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function handleAgentStream(req: AuthedRequest, res: any): Promise<void> {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { projectId, prompt, model, projectName } = parsed.data;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const jobId = randomUUID();
  const sessionId = `${projectId}-${jobId}`;

  // 1. job_created (per durable resume in client)
  writeSseEvent(res, 'job_created', { jobId, projectId });

  // 2. status iniziale
  writeSseEvent(res, 'status', { status: 'connecting', message: 'Connecting AI agent...' });

  // 3. Verifica ownership progetto (best-effort)
  let appwriteCreds: any = undefined;
  try {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('user_id, appwrite_database_id, appwrite_endpoint, appwrite_project_id')
      .eq('id', projectId)
      .maybeSingle();

    if (project && project.user_id !== req.userId) {
      writeSseEvent(res, 'error', { error: 'Forbidden' });
      writeSseEvent(res, 'done', {});
      res.end();
      return;
    }

    if (project?.appwrite_database_id && project.appwrite_endpoint && project.appwrite_project_id) {
      appwriteCreds = {
        endpoint: project.appwrite_endpoint,
        projectId: project.appwrite_project_id,
        databaseId: project.appwrite_database_id,
      };
    }
  } catch (e) {
    // non-blocking
  }

  const systemContext = buildDrapeSystemPrompt({
    extraContext: projectName ? `Project name: ${projectName}` : undefined,
  });

  writeSseEvent(res, 'status', { status: 'thinking', message: 'Agent thinking...' });

  let assembledText = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let lastError: string | undefined;
  const startedAt = Date.now();

  try {
    for await (const event of opencodeHttpService.chatStream({
      sessionId,
      message: prompt,
      model,
      appwriteCredentials: appwriteCreds,
      systemContext,
    })) {
      switch (event.type) {
        case 'token':
          assembledText += event.content;
          writeSseEvent(res, 'text_delta', { text: event.content });
          break;
        case 'tool_use':
          writeSseEvent(res, 'tool_start', {
            tool: event.name,
            input: event.input,
            toolUseId: event.id,
          });
          break;
        case 'tool_result':
          writeSseEvent(res, event.error ? 'tool_error' : 'tool_complete', {
            toolUseId: event.id,
            output: event.output,
            error: event.error,
            success: !event.error,
          });
          break;
        case 'message_start':
          writeSseEvent(res, 'iteration_start', { iteration: 1, model: event.model });
          break;
        case 'message_end':
          tokensIn = event.tokensIn;
          tokensOut = event.tokensOut;
          writeSseEvent(res, 'usage', { tokensIn, tokensOut });
          break;
        case 'session_end':
          if (event.reason === 'completed') {
            writeSseEvent(res, 'complete', {
              success: true,
              result: { text: assembledText, tokensIn, tokensOut },
              message: assembledText,
            });
            writeSseEvent(res, 'done', { jobId });
          } else {
            lastError = event.error ?? 'session ended unexpectedly';
            writeSseEvent(res, 'error', { error: lastError });
            writeSseEvent(res, 'done', { jobId });
          }
          break;
        case 'error':
          lastError = event.message;
          writeSseEvent(res, 'error', { error: event.message });
          break;
      }
    }
  } catch (err: any) {
    console.error('[agent-stream] error:', err);
    lastError = err?.message ?? 'agent stream error';
    writeSseEvent(res, 'error', { error: lastError });
    writeSseEvent(res, 'done', { jobId });
  } finally {
    res.end();
  }

  // Persist ai_run record best-effort: serve prima un ai_sessions UUID singolo.
  // TODO: gestire sessions table propriamente (riutilizzare sessione tra turn).
  // Per ora skippiamo persist se sessionId composto non è UUID singolo.
  void (async () => {
    try {
      const { data: aiSession, error: sessionError } = await supabaseAdmin
        .from('ai_sessions')
        .insert({
          project_id: projectId,
          user_id: req.userId,
          title: projectName ? `Generation: ${projectName}` : 'Agent run',
          status: lastError ? 'failed' : 'completed',
        })
        .select('id')
        .single();
      if (sessionError || !aiSession) return;

      await supabaseAdmin.from('ai_runs').insert({
        session_id: aiSession.id,
        user_id: req.userId,
        prompt,
        response: assembledText || null,
        model: model ?? null,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        duration_ms: Date.now() - startedAt,
        error: lastError ?? null,
      } as any);
    } catch (err: any) {
      console.warn('[agent-stream] persist ai_run failed:', err?.message);
    }
  })();
}

// Tutti gli endpoint legacy mappano allo stesso handler (con prompt diverso lato client)
agentStreamRouter.post('/create', requireAuth, handleAgentStream);
agentStreamRouter.post('/run/fast', requireAuth, handleAgentStream);
agentStreamRouter.post('/run/plan', requireAuth, handleAgentStream);
agentStreamRouter.post('/run/execute', requireAuth, handleAgentStream);

// Cancel
agentStreamRouter.post('/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const { projectId, jobId } = req.body ?? {};
  if (projectId && jobId) {
    await opencodeHttpService.cancelSession(`${projectId}-${jobId}`).catch(() => {});
  }
  res.json({ ok: true });
});
