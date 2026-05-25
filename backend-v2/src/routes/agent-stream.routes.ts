import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware';
import { opencodeHttpService } from '../services/opencode-http.service';
import { buildBynotSystemPrompt } from '../templates/opencode-system-prompt';
import { supabaseAdmin } from '../lib/supabase';
import { checkQuota, recordUsage } from '../services/usage-quota.service';
import { runBynotAgent } from '../services/bynot-agent.service';
import type { ModelMessage } from 'ai';

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

// useV2 = true → drives the stream from runBynotAgent (direct AI SDK v6 +
// OpenRouter, no opencode). Tool calls (write_file, edit_file, ...) run
// directly against /root/projects/<projectId>/ with parallel-call support.
// Used by /run/fast so the chat UX bypasses opencode's slow agentic loop.
async function handleAgentStream(req: AuthedRequest, res: any, opts: { useV2?: boolean } = {}): Promise<void> {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { projectId, prompt, model, projectName } = parsed.data;

  // Quota check BEFORE opening SSE — monthly cap same as /ai/chat.
  // Reject early with 429 so the frontend can show "wait until next month
  // or upgrade" without burning an open EventSource.
  if (req.userId) {
    const quota = await checkQuota(req.userId);
    if (!quota.allowed) {
      res.setHeader('Retry-After', String(quota.retryAfterSec ?? 86400));
      res.status(429).json({
        error: 'quota_exceeded',
        used: quota.used,
        limit: quota.limit,
        retryAfterSec: quota.retryAfterSec,
        message: 'Hai esaurito il quota mensile. Aspetta il rinnovo o passa a Plus.',
      });
      return;
    }
  }

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

  // 2. Verifica ownership progetto (best-effort)
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

  const systemContext = buildBynotSystemPrompt({
    extraContext: projectName ? `Project name: ${projectName}` : undefined,
  });

  let assembledText = '';
  let tokensIn = 0;
  let tokensOut = 0;
  let lastError: string | undefined;
  const startedAt = Date.now();

  try {
    if (opts.useV2) {
      // ── New path: runBynotAgent (direct AI SDK v6 + OpenRouter) ─────────
      // We translate AI SDK v6 stream parts into the legacy named-SSE events
      // that the existing useAgentStream client already understands, so the
      // frontend doesn't need to change at all to benefit from the speed-up.
      const result = await runBynotAgent({
        projectId,
        userId: req.userId || 'anonymous',
        prompt,
        model,
      });

      writeSseEvent(res, 'iteration_start', { iteration: 1, model: model ?? 'openrouter/deepseek/deepseek-v4-pro' });

      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            assembledText += part.text;
            writeSseEvent(res, 'text_delta', { text: part.text });
            break;
          case 'tool-call':
            writeSseEvent(res, 'tool_start', {
              tool: part.toolName,
              input: part.input,
              toolUseId: part.toolCallId,
            });
            break;
          case 'tool-result':
            writeSseEvent(res, 'tool_complete', {
              toolUseId: part.toolCallId,
              tool: part.toolName,
              output: part.output,
              success: true,
            });
            break;
          case 'tool-error':
            writeSseEvent(res, 'tool_error', {
              toolUseId: part.toolCallId,
              tool: part.toolName,
              error: String(part.error),
              success: false,
            });
            break;
          case 'finish':
            tokensIn = part.totalUsage?.inputTokens ?? 0;
            tokensOut = part.totalUsage?.outputTokens ?? 0;
            writeSseEvent(res, 'usage', { tokensIn, tokensOut });
            writeSseEvent(res, 'complete', { success: true, result: { tokensIn, tokensOut } });
            writeSseEvent(res, 'done', { jobId });
            break;
          case 'error':
            lastError = String((part as any).error ?? 'agent error');
            writeSseEvent(res, 'error', { error: lastError });
            writeSseEvent(res, 'done', { jobId });
            break;
          default:
            // step-start, step-finish, abort, source, etc — not surfaced
            break;
        }
      }
    } else {
      // ── Legacy path: opencode (plan/execute/create still use this) ──────
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
                result: { tokensIn, tokensOut },
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
// /run/fast uses the new AI SDK v6 + OpenRouter direct path (no opencode):
// faster, parallel tool calls, no agent loop overhead. The legacy opencode
// path is still used by /create + /run/plan + /run/execute for now.
agentStreamRouter.post('/create', requireAuth, (req, res) => handleAgentStream(req as any, res, { useV2: true }));
agentStreamRouter.post('/run/fast', requireAuth, (req, res) => handleAgentStream(req as any, res, { useV2: true }));
agentStreamRouter.post('/run/plan', requireAuth, (req, res) => handleAgentStream(req as any, res));
agentStreamRouter.post('/run/execute', requireAuth, (req, res) => handleAgentStream(req as any, res));

// Cancel
agentStreamRouter.post('/cancel', requireAuth, async (req: AuthedRequest, res) => {
  const { projectId, jobId } = req.body ?? {};
  if (projectId && jobId) {
    await opencodeHttpService.cancelSession(`${projectId}-${jobId}`).catch(() => {});
  }
  res.json({ ok: true });
});

// ── /v2 — Vercel AI SDK v6 UI Message Stream protocol ────────────────────────
// Parallel to the legacy /create + /run/* endpoints. Used by useAgentChat on
// the client side (src/core/ai/useAgentChat.ts). Body shape matches the
// DefaultChatTransport contract from `ai`:
//   { messages: UIMessage[], id?, projectId, model? }
// Backed by runBynotAgent() — direct AI SDK v6 + OpenRouter (no opencode).

const v2BodySchema = z.object({
  projectId: z.string().min(1),
  messages: z.array(z.any()).min(1),
  model: z.string().optional(),
}).passthrough();

agentStreamRouter.post('/v2/chat', requireAuth, async (req: AuthedRequest, res: any) => {
  const parsed = v2BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { projectId, messages, model } = parsed.data;
  const userId = req.userId || 'anonymous';

  // Quota check (same monthly cap as /ai/chat and /agent/run/fast).
  const quota = await checkQuota(userId);
  if (!quota.allowed) {
    res.setHeader('Retry-After', String(quota.retryAfterSec ?? 86400));
    res.status(429).json({
      error: 'quota_exceeded',
      used: quota.used,
      limit: quota.limit,
      retryAfterSec: quota.retryAfterSec,
      message: 'Hai esaurito il quota mensile. Aspetta il rinnovo o passa a Plus.',
    });
    return;
  }

  // Extract last user message text from AI SDK UIMessage parts (the frontend
  // sends the FULL conversation in `messages`; we forward earlier turns to
  // the model as history but use the last user message as the new prompt).
  const lastUserIdx = [...messages].reverse().findIndex((m: any) => m?.role === 'user');
  const lastUserMessage = lastUserIdx >= 0 ? messages[messages.length - 1 - lastUserIdx] : null;
  const promptText: string = Array.isArray(lastUserMessage?.parts)
    ? lastUserMessage.parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('')
    : typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';
  if (!promptText.trim()) {
    res.status(400).json({ error: 'last user message must contain text' });
    return;
  }

  // Convert prior UIMessages (all messages BEFORE the last user one) into
  // ModelMessages so the agent has the conversation history. We keep only
  // text turns — tool call history is opaque to the new agent and replaying
  // it would require remapping tool ids, not worth the complexity here.
  const priorIdx = lastUserIdx >= 0 ? messages.length - 1 - lastUserIdx : messages.length;
  const history = messages.slice(0, priorIdx)
    .map((m: any) => {
      const role = m?.role;
      if (role !== 'user' && role !== 'assistant') return null;
      const text = Array.isArray(m?.parts)
        ? m.parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('')
        : typeof m?.content === 'string' ? m.content : '';
      if (!text.trim()) return null;
      return { role, content: text } as ModelMessage;
    })
    .filter((m: ModelMessage | null): m is ModelMessage => m !== null);

  try {
    const result = await runBynotAgent({
      projectId,
      userId,
      prompt: promptText,
      history,
      model,
    });

    // Pipe AI SDK v6 UI Message Stream straight to the Express response.
    // useChat on the frontend parses this natively (text-start/delta/end,
    // tool-input-available, tool-output-available, finish, etc.).
    result.pipeUIMessageStreamToResponse(res, {
      onError: (err: any) => {
        console.error(`[Agent/v2] streamText error:`, err?.message ?? err);
        return err?.message || 'agent stream failed';
      },
      onFinish: async ({ totalUsage }: any) => {
        // Record usage for the monthly quota.
        const tokensIn = (totalUsage?.inputTokens ?? 0) + (totalUsage?.cachedInputTokens ?? 0);
        const tokensOut = totalUsage?.outputTokens ?? 0;
        void recordUsage({
          userId,
          sessionId: null,
          model: model ?? 'openrouter/deepseek/deepseek-v4-pro',
          prompt: promptText,
          response: '', // text already streamed to client; not retained here
          tokensIn,
          tokensOut,
          durationMs: 0,
          error: null,
        });
      },
    });
  } catch (err: any) {
    console.error(`[Agent/v2] init failed:`, err?.message ?? err);
    if (!res.headersSent) {
      res.status(500).json({ error: err?.message || 'agent init failed' });
    }
  }
});

// ── /v2/answer-question — HITL: forward user's answer to opencode ───────────
const answerSchema = z.object({
  projectId: z.string().min(1),
  requestID: z.string().min(1),
  answer: z.string().min(1),
});

agentStreamRouter.post('/v2/answer-question', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
    return;
  }
  const { requestID, answer } = parsed.data;
  try {
    const { replyToQuestion } = await import('../services/opencode-http-client');
    await replyToQuestion(requestID, [[answer]]);
    res.json({ success: true });
  } catch (err: any) {
    console.error(`[Agent/v2] answer-question failed for ${requestID}:`, err?.message);
    res.status(502).json({ error: err?.message || 'opencode reply failed' });
  }
});
