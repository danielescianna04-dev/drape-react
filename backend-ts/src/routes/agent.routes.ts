import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { getUserPlan, verifyProjectOwnership } from '../middleware/auth';
import { dockerService } from '../services/docker.service';
import { workspaceService } from '../services/workspace.service';
import { log } from '../utils/logger';
import { auditService } from '../services/audit.service';
import { runAgentChatStream } from '../services/agent-chat-stream.service';
import { runAgentChatStreamV2 } from '../services/agent-chat-stream-v2.service';
import { startAiSdkStream } from '../services/ai-sdk-stream';
import { fileService } from '../services/file.service';
import { config as appConfig, planAiBudgets } from '../config';
import { BuildReportTracker } from '../services/build-report.service';
import { runAgentProjectCreation } from '../services/agent-project-creation.service';
import { verifyAndFixProject } from '../services/verify-project.service';
import { metricsService } from '../services/metrics.service';
import { canUseModel, normalizePlan } from '../services/plan-entitlements';
import { getAgentModeFromPath, setupAgentSse } from './agentSse';
import { clearPlan, getStoredPlan, storePlan, updateStoredPlan } from './agentPlanStore';
import {
  ensureProjectOwnership,
  getAgentUserId,
  requireBooleanField,
  requireField,
} from './agentRequestGuards';
import { updateProjectCreationStatus } from '../services/project-status.service';
import { appendEvent as jobAppendEvent, createJob, updateJob } from '../services/generation-jobs.service';
import { isDrapeCloudConfigured } from '../services/drape-cloud/client';
import { notificationService } from '../services/notification.service';
import nodePath from 'path';
import nodeFs from 'fs';

// SSE event types we persist to the job timeline. Anything not in this list
// (heartbeats, token deltas, processing messages) is sent to the live client
// only — we don't want to bloat the events JSONB with thousands of rows.
const PERSISTED_EVENT_TYPES = new Set([
  'phase',
  'phase_start',
  'phase_complete',
  'file',
  'file_batch',
  'tool_call',
  'tool_result',
  'error',
  'done',
  'plan',
]);

const PHASE_PROGRESS: Record<string, number> = {
  generation: 25,
  ts_fix: 45,
  preview_start: 60,
  preview_fix: 75,
  full_verify: 90,
  finalize: 95,
  done: 100,
};

export const agentRouter = Router();

const PROJECT_AI_PHASES = ['generation', 'verify', 'verify_escalation'];
const FREE_AGENT_MODEL = 'gemini-3-flash';

function getMonthlyAgentBudget(userId: string, planId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const usage = metricsService.getAIUsageSummary(userId, monthStart.getTime(), PROJECT_AI_PHASES);
  const plan = planAiBudgets[planId as keyof typeof planAiBudgets] || planAiBudgets.free;
  const spentEur = usage.totalCostEur;
  return {
    spentEur,
    budgetEur: plan.monthlyBudgetEur,
    remainingEur: Math.max(0, plan.monthlyBudgetEur - spentEur),
    percentUsed: plan.monthlyBudgetEur > 0 ? Math.round((spentEur / plan.monthlyBudgetEur) * 100) : 0,
  };
}

// GET /tools - Returns tool definitions (OpenCode handles tools internally)
agentRouter.get('/tools', asyncHandler(async (req, res) => {
  res.json({ success: true, tools: ['read', 'write', 'edit', 'bash', 'glob', 'grep', 'webfetch'] });
}));

// GET /status - Agent capabilities
agentRouter.get('/status', asyncHandler(async (req, res) => {
  res.json({
    success: true,
    status: 'operational',
    capabilities: {
      streaming: true,
      tools: true,
      multimodal: true,
      models: ['claude-4-7-opus', 'gemini-3-flash', 'gemini-3.1-pro', 'gemini-3.1-flash-lite'],
    },
    version: '1.0.0',
  });
}));

// ── POST /create ─ Dedicated project-creation endpoint ──────────────────
// Chat routes will never run creation, and this route will never run chat.
// The separation is hard: creation needs AgentLoop + the creation pipeline;
// chat uses OpenCode inside the container. Different code paths, different
// cost profiles, different failure modes — so different URLs.
agentRouter.post('/create', asyncHandler(async (req, res) => {
  const { prompt, projectId, projectName } = req.body;

  const userId = getAgentUserId(req);
  const promptPreview = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  log.info(`[Agent/create] Incoming prompt for ${projectId}: ${JSON.stringify(promptPreview)}`);

  requireField(prompt, 'prompt is required');
  requireField(projectId, 'projectId is required');

  const [userPlan, isOwner] = await Promise.all([
    getUserPlan(userId),
    verifyProjectOwnership(userId, projectId),
  ]);

  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to create on project ${projectId} without ownership`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  let clientDisconnected = false;
  const { writeEvent: rawWriteSseEvent, cleanup } = setupAgentSse({
    res,
    onDisconnect: () => {
      clientDisconnected = true;
      log.info(`[Agent/create] Client disconnected for project ${projectId}, work continues in background`);
    },
  });

  // Create a durable job record so the work survives client disconnects and
  // can be observed via GET /agent/jobs/:id (snapshot) or
  // GET /agent/jobs/:id/events (SSE replay+tail). If the cloud DB is not
  // configured (legacy dev), skip persistence — pipeline still works, just
  // no resume across reconnects.
  let jobId: string | null = null;
  if (isDrapeCloudConfigured()) {
    try {
      const j = await createJob({ userId, projectId, projectName: projectName || projectId, prompt });
      jobId = j.id;
      await updateJob(jobId, { status: 'running', phase: 'generation', progress: 5 });
    } catch (err: any) {
      log.warn('[Agent/create] could not create generation job:', err?.message || err);
    }
  }

  // Decorated writer: emits to the live SSE client AND persists to the job
  // timeline (filtered). Phase events also bump the progress integer.
  const writeSseEvent = (eventType: string, payload: any, options?: any): boolean => {
    const sent = rawWriteSseEvent(eventType as any, payload, options);
    if (jobId && PERSISTED_EVENT_TYPES.has(eventType)) {
      jobAppendEvent(jobId, { type: eventType, data: payload }).catch((err) => {
        log.warn('[Agent/create] job appendEvent failed:', err?.message || err);
      });
      // Bump phase + progress when the pipeline announces a new phase.
      const phase: string | undefined =
        (eventType === 'phase' || eventType === 'phase_start' || eventType === 'phase_complete')
          ? (payload?.phase || payload?.name)
          : undefined;
      if (phase) {
        const progress = PHASE_PROGRESS[phase];
        updateJob(jobId, { phase, ...(progress != null ? { progress } : {}) }).catch(() => {});
      }
    }
    return sent;
  };

  try {
    auditService.log({ userId, action: 'agent_create_start', resource: projectId, details: 'project_creation', ip: req.ip });
    await updateProjectCreationStatus(userId, projectId, 'generating', {
      name: projectName || projectId,
      startedAt: new Date().toISOString(),
    });

    // Tell the client about the jobId in the very first event so it can
    // re-attach later via /agent/jobs/:id/events.
    if (jobId) {
      rawWriteSseEvent('job_created' as any, { type: 'job_created', jobId, projectId } as any);
    }

    writeSseEvent('processing', {
      type: 'processing',
      message: 'Connecting to AI agent...',
      elapsedSec: 0,
    });

    const session = await workspaceService.getOrCreateContainer(projectId, userId);
    if (!session?.containerId) {
      writeSseEvent('error', { type: 'error', error: 'Container not ready' });
      writeSseEvent('done', { type: 'done' });
      cleanup();
      return;
    }

    await runAgentProjectCreation({
      projectId,
      userId,
      userPlan: userPlan || 'free',
      prompt,
      projectName,
      sessionProjectType: session?.projectInfo?.type as string | undefined,
      isClientConnected: () => !clientDisconnected && !res.writableEnded,
      writeSseEvent,
    });

    log.info(`[Agent/create] Creation completed for project ${projectId}`);
    await updateProjectCreationStatus(userId, projectId, 'ready', {
      name: projectName || projectId,
    });
    if (jobId) {
      await updateJob(jobId, { status: 'completed', phase: 'done', progress: 100 });
    }
    // Push notification — fires regardless of whether the SSE client is still
    // attached. This is the whole point of the durable job: tell the user
    // their project is ready even with the app closed.
    notificationService.sendToUser(
      userId,
      {
        type: 'project_created',
        title: '✓ Progetto pronto',
        body: `${projectName || projectId} è stato generato e ti aspetta.`,
      },
      {
        projectId,
        ...(jobId ? { jobId } : {}),
        deepLink: `project/${projectId}`,
      },
    ).catch((err) => log.warn('[Agent/create] push send failed:', err?.message || err));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    log.error(`[Agent/create] Error for project ${projectId}:`, errMsg);
    if (errStack) log.error(`[Agent/create] Stack:`, errStack);
    await updateProjectCreationStatus(userId, projectId, 'failed', {
      name: projectName || projectId,
      error: errMsg || 'Creation failed',
    });
    if (jobId) {
      await updateJob(jobId, { status: 'failed', error: errMsg || 'Creation failed' }).catch(() => {});
    }
    // Push at failure too — the user explicitly asked for status updates and
    // a silent failure is worse than a notified one.
    notificationService.sendToUser(
      userId,
      {
        type: 'project_failed',
        title: 'Generazione fallita',
        body: `${projectName || projectId} non è stato generato. Apri l'app per riprovare.`,
      },
      {
        projectId,
        ...(jobId ? { jobId } : {}),
        deepLink: `project/${projectId}`,
        error: (errMsg || '').slice(0, 200),
      },
    ).catch((err) => log.warn('[Agent/create] push send failed:', err?.message || err));

    if (!res.writableEnded) {
      writeSseEvent('error', { type: 'error', error: errMsg || 'Creation failed' });
    }
  } finally {
    cleanup();
  }
}));

// ── POST /stream, /run/fast, /run/plan, /run/execute ─ Chat SSE endpoints ──
// These NEVER run project creation. Any creation must go through /create.
agentRouter.post(['/stream', '/run/fast', '/run/plan', '/run/execute'], asyncHandler(async (req, res) => {
  const { prompt, projectId, model, previewContext } = req.body;

  const userId = getAgentUserId(req);
  const promptPreview = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  log.info(`[Agent/chat] Incoming prompt for ${projectId}: ${JSON.stringify(promptPreview)}`);

  requireField(prompt, 'prompt is required');
  requireField(projectId, 'projectId is required');

  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const mode = getAgentModeFromPath(req.path);
  log.info(`[Agent/chat] SSE headers flushed for project ${projectId}, mode: ${mode}`);

  let clientDisconnected = false;
  const { writeEvent: writeSseEvent, cleanup } = setupAgentSse({
    res,
    onDisconnect: () => {
      clientDisconnected = true;
      log.info(`[Agent/chat] Client disconnected for project ${projectId}`);
    },
  });

  try {
    const userPlan = await getUserPlan(userId);
    const normalizedPlan = normalizePlan(userPlan);
    const requestedModel = model || FREE_AGENT_MODEL;
    const effectiveModel = normalizedPlan === 'free' ? FREE_AGENT_MODEL : requestedModel;
    const budget = getMonthlyAgentBudget(userId, normalizedPlan);

    if (!canUseModel(normalizedPlan, effectiveModel)) {
      writeSseEvent('error', {
        type: 'error',
        error: `Model ${effectiveModel} is not available on plan ${normalizedPlan}.`,
      });
      writeSseEvent('done', { type: 'done' });
      cleanup();
      return;
    }

    if (budget.budgetEur > 0 && budget.spentEur >= budget.budgetEur) {
      log.warn(`[Agent/chat] Budget blocked user=${userId}, plan=${normalizedPlan}, spent=€${budget.spentEur}, budget=€${budget.budgetEur}`);
      writeSseEvent('budget_exceeded', {
        type: 'budget_exceeded',
        message: `Budget esaurito: speso €${budget.spentEur.toFixed(2)} su €${budget.budgetEur.toFixed(2)} (piano ${normalizedPlan}).`,
        percentUsed: budget.percentUsed,
        plan: normalizedPlan,
      });
      writeSseEvent('done', { type: 'done' });
      cleanup();
      return;
    }

    auditService.log({ userId, action: 'agent_chat_start', resource: projectId, details: `mode: ${mode}, model: ${effectiveModel}${effectiveModel !== requestedModel ? ` (requested ${requestedModel})` : ''}`, ip: req.ip });
    log.info(`[Agent/chat] Starting OpenCode stream for project ${projectId}, plan=${normalizedPlan}, model=${effectiveModel}, requested=${requestedModel}, budget=${budget.spentEur}/${budget.budgetEur}`);

    writeSseEvent('processing', {
      type: 'processing',
      message: effectiveModel !== requestedModel
        ? 'Free plan uses Gemini Flash for in-project AI to protect your budget...'
        : 'Connecting to AI agent...',
      elapsedSec: 0,
    });

    const session = await workspaceService.getOrCreateContainer(projectId, userId);
    if (!session?.containerId) {
      writeSseEvent('error', { type: 'error', error: 'Container not ready' });
      writeSseEvent('done', { type: 'done' });
      cleanup();
      return;
    }

    const container = await dockerService.getDockerContainer(session.containerId);

    // Skill (plugin) detection — if the prompt starts with `/<slash>`, fetch
    // the user's installed skill body and pass it through. The slash prefix
    // is stripped from the prompt the model sees.
    let promptForRun = prompt as string;
    let skillBody: string | null = null;
    let skillSlash: string | null = null;
    const slashMatch = String(prompt || '').match(/^\/([a-z][a-z0-9-]{1,30})(?=\s|$)/);
    if (slashMatch) {
      try {
        const { findInstalledBySlash } = await import('../services/skills.service');
        const skill = await findInstalledBySlash(userId, slashMatch[1]);
        if (skill) {
          skillBody = skill.body;
          skillSlash = skill.slash;
          promptForRun = String(prompt).slice(slashMatch[0].length).trimStart();
        }
      } catch (err: any) {
        log.warn(`[Agent/chat] Skill lookup failed for /${slashMatch[1]}: ${err?.message || err}`);
      }
    }

    await runAgentChatStream({
      container,
      projectId,
      userId,
      prompt: promptForRun,
      model: effectiveModel,
      previewContext,
      skillBody,
      skillSlash,
      isClientConnected: () => !clientDisconnected && !res.writableEnded,
      writeSseEvent,
    });

    log.info(`[Agent/chat] Stream completed for project ${projectId}`);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    log.error(`[Agent/chat] Stream error for project ${projectId}:`, errMsg);
    if (errStack) log.error(`[Agent/chat] Stack:`, errStack);

    if (!res.writableEnded) {
      writeSseEvent('error', { type: 'error', error: errMsg || 'Stream failed' });
    }
  } finally {
    cleanup();
  }
}));

// ── POST /v2/chat ─ AI SDK UI Message Stream protocol (Vercel ai v6) ────────
// Parallel route to /stream — emits parts conforming to AI SDK so the RN client
// can drive the chat via useChat from @ai-sdk/react. Body shape matches the
// AI SDK transport: { id?, messages: UIMessage[], projectId, model? }
agentRouter.post('/v2/chat', asyncHandler(async (req, res) => {
  const { messages, projectId, model, previewContext } = req.body || {};
  const userId = getAgentUserId(req);

  requireField(projectId, 'projectId is required');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('messages is required');
  }

  // Extract last user message text from AI SDK UIMessage parts
  const lastUserMessage = [...messages].reverse().find((m: any) => m?.role === 'user');
  const promptText: string = Array.isArray(lastUserMessage?.parts)
    ? lastUserMessage.parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('')
    : typeof lastUserMessage?.content === 'string' ? lastUserMessage.content : '';

  if (!promptText.trim()) throw new ValidationError('last user message must contain text');

  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  log.info(`[Agent/v2] Incoming prompt for ${projectId}: ${JSON.stringify(promptText.slice(0, 200))}`);

  const userPlan = await getUserPlan(userId);
  const normalizedPlan = normalizePlan(userPlan);
  const requestedModel = model || FREE_AGENT_MODEL;
  const effectiveModel = normalizedPlan === 'free' ? FREE_AGENT_MODEL : requestedModel;
  const budget = getMonthlyAgentBudget(userId, normalizedPlan);

  const stream = startAiSdkStream(res, () => {
    log.info(`[Agent/v2] Client disconnected for project ${projectId}`);
  });

  if (!canUseModel(normalizedPlan, effectiveModel)) {
    stream.writePart({ type: 'error', errorText: `Model ${effectiveModel} is not available on plan ${normalizedPlan}.` });
    stream.end();
    return;
  }

  if (budget.budgetEur > 0 && budget.spentEur >= budget.budgetEur) {
    stream.writePart({
      type: 'error',
      errorText: `Budget esaurito: speso €${budget.spentEur.toFixed(2)} su €${budget.budgetEur.toFixed(2)} (piano ${normalizedPlan}).`,
    });
    stream.end();
    return;
  }

  try {
    const session = await workspaceService.getOrCreateContainer(projectId, userId);
    if (!session?.containerId) {
      stream.writePart({ type: 'error', errorText: 'Container not ready' });
      stream.end();
      return;
    }
    const container = await dockerService.getDockerContainer(session.containerId);

    let promptForRun = promptText;
    let skillBody: string | null = null;
    let skillSlash: string | null = null;
    const slashMatch = promptText.match(/^\/([a-z][a-z0-9-]{1,30})(?=\s|$)/);
    if (slashMatch) {
      try {
        const { findInstalledBySlash } = await import('../services/skills.service');
        const skill = await findInstalledBySlash(userId, slashMatch[1]);
        if (skill) {
          skillBody = skill.body;
          skillSlash = skill.slash;
          promptForRun = promptText.slice(slashMatch[0].length).trimStart();
        }
      } catch (err: any) {
        log.warn(`[Agent/v2] Skill lookup failed for /${slashMatch[1]}: ${err?.message || err}`);
      }
    }

    auditService.log({ userId, action: 'agent_v2_chat_start', resource: projectId, details: `model: ${effectiveModel}`, ip: req.ip });

    await runAgentChatStreamV2({
      container,
      projectId,
      userId,
      prompt: promptForRun,
      model: effectiveModel,
      previewContext,
      skillBody,
      skillSlash,
      stream,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error(`[Agent/v2] Stream error for project ${projectId}:`, errMsg);
    if (!stream.isClosed()) {
      stream.writePart({ type: 'error', errorText: errMsg });
      stream.end();
    }
  }
}));

// POST /v2/answer-question — forward a user's reply to a pending opencode
// `question` tool. Required by the HITL flow: when the agent invokes the
// question tool, /v2/chat emits a `data-question-meta` part carrying the
// opencode requestID; the client renders an answer UI and POSTs here.
agentRouter.post('/v2/answer-question', asyncHandler(async (req, res) => {
  const { projectId, requestID, answer } = req.body || {};
  const userId = getAgentUserId(req);

  requireField(projectId, 'projectId is required');
  requireField(requestID, 'requestID is required');
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new ValidationError('answer must be a non-empty string');
  }

  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  try {
    const { replyToQuestion } = await import('../services/opencode-http-client');
    await replyToQuestion(requestID, [[answer]]);
    log.info(`[Agent/v2] question ${requestID} answered for project ${projectId}`);
    res.json({ success: true });
  } catch (err: any) {
    log.error(`[Agent/v2] answer-question failed for ${requestID}: ${err?.message || err}`);
    res.status(502).json({ error: err?.message || 'opencode reply failed' });
  }
}));

// GET /conversation/:projectId - Load saved conversation
agentRouter.get('/conversation/:projectId', asyncHandler(async (req, res) => {
  const { loadConversation } = await import('../services/conversation-store');
  const userId = getAgentUserId(req);
  const conv = await loadConversation(req.params.projectId, userId);
  res.json({ success: true, conversation: conv });
}));

// DELETE /conversation/:projectId - Delete saved conversation
agentRouter.delete('/conversation/:projectId', asyncHandler(async (req, res) => {
  const { deleteConversation } = await import('../services/conversation-store');
  const userId = getAgentUserId(req);
  await deleteConversation(req.params.projectId, userId);
  res.json({ success: true });
}));

// POST /execute-tool - Single tool execution
agentRouter.post('/execute-tool', asyncHandler(async (req, res) => {
  const { tool, input, projectId } = req.body;
  const userId = getAgentUserId(req);

  requireField(tool, 'tool is required');
  requireField(input, 'input is required');
  requireField(projectId, 'projectId is required');

  // Verify project ownership
  const isOwner = await ensureProjectOwnership(userId, projectId, 'execute-tool');
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  log.info(`[Agent] Executing tool ${tool} for project ${projectId}`);

  try {
    // Execute tool via container exec (OpenCode handles tools internally)
    const session = await workspaceService.getOrCreateContainer(projectId, userId);
    const execResult = await workspaceService.exec(projectId, userId, `opencode run --format json "Execute tool: ${tool} with input: ${JSON.stringify(input).replace(/"/g, '\\"')}"`);

    res.json({
      success: true,
      tool,
      result: execResult.stdout || '',
    });
  } catch (error: unknown) {
    log.error(`[Agent] Tool execution failed for ${tool}:`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}));

// GET /plan/:projectId - Get pending plan
agentRouter.get('/plan/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = getAgentUserId(req);

  // Verify project ownership
  const isOwner = await ensureProjectOwnership(userId, projectId, 'get-plan');
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const plan = getStoredPlan(projectId);

  if (!plan) {
    return res.json({ success: true, plan: null });
  }

  res.json({ success: true, plan });
}));

// POST /approve-plan - Approve or reject a plan
agentRouter.post('/approve-plan', asyncHandler(async (req, res) => {
  const { projectId, approved } = req.body;
  const userId = getAgentUserId(req);

  requireField(projectId, 'projectId is required');
  requireBooleanField(approved, 'approved must be a boolean');

  // Verify project ownership
  const isOwner = await ensureProjectOwnership(userId, projectId, 'approve-plan');
  if (!isOwner) {
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const plan = getStoredPlan(projectId);

  if (!plan) {
    throw new ValidationError('No pending plan found for this project');
  }

  log.info(`[Agent] Plan ${approved ? 'approved' : 'rejected'} for project ${projectId}`);

  const updatedPlan = approved
    ? updateStoredPlan(projectId, { status: 'approved', approvedAt: new Date().toISOString() })
    : updateStoredPlan(projectId, { status: 'rejected', rejectedAt: new Date().toISOString() });

  res.json({
    success: true,
    message: approved ? 'Plan approved' : 'Plan rejected',
    plan: updatedPlan,
  });
}));

// Helper function to store a plan (can be called from AgentLoop)
export { storePlan, clearPlan };
