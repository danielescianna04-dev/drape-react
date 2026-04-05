import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { getUserPlan, verifyProjectOwnership } from '../middleware/auth';
import { streamOpenCodeFromContainer, mapDrapeModelToOpenCode } from '../services/opencode-adapter.service';
import { dockerService } from '../services/docker.service';
import { workspaceService } from '../services/workspace.service';
import { log } from '../utils/logger';
import { auditService } from '../services/audit.service';
import { metricsService } from '../services/metrics.service';

export const agentRouter = Router();

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
      models: ['gemini-3-flash', 'gemini-3.1-pro', 'gemini-3.1-flash-lite'],
    },
    version: '1.0.0',
  });
}));

// POST /stream, /run/fast, /run/plan, /run/execute - SSE streaming endpoint
agentRouter.post(['/stream', '/run/fast', '/run/plan', '/run/execute'], asyncHandler(async (req, res) => {
  const {
    prompt,
    projectId,
    model,
    conversationHistory,
    images,
    thinkingLevel,
    plan,
    previewContext,
  } = req.body;

  const userId = req.userId || 'anonymous';
  const promptPreview = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  log.info(`[Agent] Incoming prompt for ${projectId}: ${JSON.stringify(promptPreview)}`);

  if (!prompt || !String(prompt).trim()) {
    throw new ValidationError('prompt is required');
  }
  if (!projectId) {
    throw new ValidationError('projectId is required');
  }

  // Parallelize Firebase calls to reduce latency
  const [userPlan, isOwner] = await Promise.all([
    getUserPlan(userId),
    verifyProjectOwnership(userId, projectId),
  ]);

  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  // Determine mode from URL path
  const path = req.path;
  let mode: 'fast' | 'plan' | 'execute' = 'fast';
  if (path.includes('/run/plan')) {
    mode = 'plan';
  } else if (path.includes('/run/execute')) {
    mode = 'execute';
  }

  // Set SSE headers and flush immediately so client receives them
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Disable Nagle's algorithm — send each SSE chunk immediately instead of
  // buffering small writes for ~40ms. Critical for streaming responsiveness.
  res.socket?.setNoDelay(true);

  // TCP keepalive — prevents mobile proxies and NAT from closing the idle connection
  res.socket?.setKeepAlive(true, 10000);

  // Send initial SSE comment to confirm connection
  res.write(': connected\n\n');

  log.info(`[Agent] SSE headers flushed for project ${projectId}, mode: ${mode}`);

  // Track if client is still connected
  let clientDisconnected = false;
  const streamStartedAt = Date.now();
  let lastPayloadEventAt = Date.now();

  // Centralized SSE writer to keep activity timestamps in sync
  const writeSseEvent = (
    eventType: string,
    payload: Record<string, any>,
    options: { countAsActivity?: boolean } = {},
  ): boolean => {
    if (res.writableEnded || clientDisconnected) return false;
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
    if (options.countAsActivity !== false) {
      lastPayloadEventAt = Date.now();
    }
    return true;
  };

  // Keep-alive + heartbeat: 1s interval for smooth second-by-second UI updates.
  // Rotating messages give the user context about what's happening.
  const waitingMessages = [
    'Preparazione risposta...',
    'Il modello sta analizzando il contesto...',
    'Generazione del codice in corso...',
    'Elaborazione di una risposta complessa...',
    'Il modello sta ragionando...',
    'Scrittura del codice...',
    'Quasi pronto...',
    'Ancora in elaborazione...',
  ];
  const keepAliveInterval = setInterval(() => {
    if (res.writableEnded || clientDisconnected) return;

    res.write(': keepalive\n\n');

    const silenceMs = Date.now() - lastPayloadEventAt;
    if (silenceMs >= 2000) {
      const elapsedSec = Math.floor(silenceMs / 1000);
      // Rotate through messages every 5 seconds
      const msgIndex = Math.floor(elapsedSec / 5) % waitingMessages.length;
      const message = `${waitingMessages[msgIndex]} (${elapsedSec}s)`;
      writeSseEvent('heartbeat', {
        type: 'heartbeat',
        status: 'alive',
        message,
        elapsedSec,
        silenceMs,
      }, { countAsActivity: false });
    }
  }, 1000);

  // Cleanup function
  const cleanup = () => {
    clearInterval(keepAliveInterval);
    if (!res.writableEnded) {
      res.end();
    }
  };

  // Handle client disconnect — use res.on('close'), NOT req.on('close')
  // req.on('close') fires when the request body is consumed (after body-parser),
  // NOT when the client TCP connection closes. res.on('close') fires on actual disconnect.
  res.on('close', () => {
    clientDisconnected = true;
    log.info(`[Agent] Client disconnected for project ${projectId}`);
    cleanup();
  });

  try {
    auditService.log({ userId, action: 'agent_stream_start', resource: projectId, details: `mode: ${mode}, model: ${model || 'gemini-3-flash'}`, ip: req.ip });
    log.info(`[Agent] Starting OpenCode stream for project ${projectId}, model: ${model || 'gemini-3-flash'}`);

    // Send initial processing event immediately
    writeSseEvent('processing', {
      type: 'processing',
      message: 'Connecting to AI agent...',
      elapsedSec: 0,
    });

    // Get or create container for this project
    const session = await workspaceService.getOrCreateContainer(projectId, userId);
    if (!session?.containerId) {
      writeSseEvent('error', { type: 'error', error: 'Container not ready' });
      writeSseEvent('done', { type: 'done' });
      cleanup();
      return;
    }

    // Get Docker container object
    const container = await dockerService.getDockerContainer(session.containerId);

    // Build the prompt — include preview context if an element was selected
    let fullPrompt = prompt;
    if (previewContext?.elementSummary) {
      const lang = previewContext.language === 'it' ? 'it' : 'en';
      const contextPrefix = lang === 'it'
        ? `L'utente sta guardando la preview del sito e ha selezionato questo elemento: ${previewContext.elementSummary}\nLa sua richiesta è: `
        : `The user is viewing the site preview and selected this element: ${previewContext.elementSummary}\nTheir request is: `;
      fullPrompt = contextPrefix + prompt;
    }

    // Stream from OpenCode — intercept usage event for metrics tracking
    const usedModel = model || 'gemini-3-flash';
    await streamOpenCodeFromContainer(
      container,
      fullPrompt,
      usedModel,
      `project-${projectId}`,
      (event) => {
        if (clientDisconnected || res.writableEnded) return;
        const eventType = event.type || 'message';
        writeSseEvent(eventType, event.data || event);

        // Track AI usage when usage event arrives
        if (event.type === 'usage' && event.data) {
          const { costEur, tokensUsed } = event.data;
          metricsService.trackAIUsage({
            userId,
            model: usedModel,
            inputTokens: tokensUsed?.input || 0,
            outputTokens: tokensUsed?.output || 0,
            costEur: costEur || 0,
          });
          log.info(`[Agent] Usage tracked: model=${usedModel}, input=${tokensUsed?.input || 0}, output=${tokensUsed?.output || 0}, cost=${costEur || 0}`);
        }
      },
      () => { /* onDone — cleanup handled below */ },
    );

    log.info(`[Agent] Stream completed for project ${projectId}`);
  } catch (error: any) {
    log.error(`[Agent] Stream error for project ${projectId}:`, error.message);
    log.error(`[Agent] Stack:`, error.stack);

    if (!res.writableEnded) {
      const errorEvent = {
        type: 'error',
        error: error.message || 'Stream failed',
      };
      writeSseEvent('error', errorEvent);
    }
  } finally {
    cleanup();
  }
}));

// GET /conversation/:projectId - Load saved conversation
agentRouter.get('/conversation/:projectId', asyncHandler(async (req, res) => {
  const { loadConversation } = await import('../services/conversation-store');
  const userId = req.userId || 'anonymous';
  const conv = await loadConversation(req.params.projectId, userId);
  res.json({ success: true, conversation: conv });
}));

// DELETE /conversation/:projectId - Delete saved conversation
agentRouter.delete('/conversation/:projectId', asyncHandler(async (req, res) => {
  const { deleteConversation } = await import('../services/conversation-store');
  const userId = req.userId || 'anonymous';
  await deleteConversation(req.params.projectId, userId);
  res.json({ success: true });
}));

// POST /execute-tool - Single tool execution
agentRouter.post('/execute-tool', asyncHandler(async (req, res) => {
  const { tool, input, projectId } = req.body;
  const userId = req.userId || 'anonymous';

  if (!tool) {
    throw new ValidationError('tool is required');
  }
  if (!input) {
    throw new ValidationError('input is required');
  }
  if (!projectId) {
    throw new ValidationError('projectId is required');
  }

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership (execute-tool)`);
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
  } catch (error: any) {
    log.error(`[Agent] Tool execution failed for ${tool}:`, error.message);
    throw error;
  }
}));

// In-memory plan store (projectId -> plan)
const planStore = new Map<string, any>();

// GET /plan/:projectId - Get pending plan
agentRouter.get('/plan/:projectId', asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  const userId = req.userId || 'anonymous';

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership (get-plan)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const plan = planStore.get(projectId);

  if (!plan) {
    return res.json({ success: true, plan: null });
  }

  res.json({ success: true, plan });
}));

// POST /approve-plan - Approve or reject a plan
agentRouter.post('/approve-plan', asyncHandler(async (req, res) => {
  const { projectId, approved } = req.body;
  const userId = req.userId || 'anonymous';

  if (!projectId) {
    throw new ValidationError('projectId is required');
  }
  if (typeof approved !== 'boolean') {
    throw new ValidationError('approved must be a boolean');
  }

  // Verify project ownership
  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership (approve-plan)`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const plan = planStore.get(projectId);

  if (!plan) {
    throw new ValidationError('No pending plan found for this project');
  }

  log.info(`[Agent] Plan ${approved ? 'approved' : 'rejected'} for project ${projectId}`);

  if (approved) {
    // Execute the plan
    plan.status = 'approved';
    plan.approvedAt = new Date().toISOString();
  } else {
    // Reject the plan
    plan.status = 'rejected';
    plan.rejectedAt = new Date().toISOString();
  }

  planStore.set(projectId, plan);

  res.json({
    success: true,
    message: approved ? 'Plan approved' : 'Plan rejected',
    plan,
  });
}));

// Helper function to store a plan (can be called from AgentLoop)
export function storePlan(projectId: string, plan: any): void {
  planStore.set(projectId, {
    ...plan,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
}

// Helper function to clear a plan
export function clearPlan(projectId: string): void {
  planStore.delete(projectId);
}
