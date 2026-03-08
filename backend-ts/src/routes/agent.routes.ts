import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { getUserPlan, verifyProjectOwnership } from '../middleware/auth';
import { AgentLoop } from '../services/agent-loop.service';
import { getToolDefinitions } from '../tools';
import { getTodos } from '../tools/todo-write';
import { log } from '../utils/logger';

export const agentRouter = Router();

// GET /tools - Returns tool definitions
agentRouter.get('/tools', asyncHandler(async (req, res) => {
  const tools = getToolDefinitions();
  res.json({ success: true, tools });
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
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
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
    // Create AgentLoop with options and mode
    const agentLoop = new AgentLoop({
      projectId,
      mode,
      model: model || 'claude-3-5-sonnet-20241022',
      conversationHistory: conversationHistory || [],
      thinkingLevel,
      executionPlan: mode === 'execute' ? plan : undefined,
      previewContext: previewContext || null,
      userId,
      userPlan,
    });

    log.info(`[Agent] Starting stream for project ${projectId}, mode: ${mode}, model: ${model || 'default'}`);

    // Send a real SSE event immediately so mobile proxies don't time out waiting
    // for data before Claude sends its first token (TTFT can be 20-30s)
    writeSseEvent('processing', {
      type: 'processing',
      message: 'Preparazione contesto e avvio esecuzione...',
      elapsedSec: 0,
    });

    // Stream events from agent loop
    for await (const event of agentLoop.run(prompt, images)) {
      if (res.writableEnded) {
        log.warn(`[Agent] Response ended, stopping stream for project ${projectId}`);
        break;
      }

      // Use named SSE events so react-native-sse addEventListener works
      const eventType = (event as any).type || 'message';
      writeSseEvent(eventType, event as any);
    }

    // Send completion event
    writeSseEvent('done', { type: 'done' });

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
    // Create a temporary agent loop to execute the tool
    const userPlan = await getUserPlan(userId);
    const agentLoop = new AgentLoop({ projectId, userId, userPlan });
    const result = await agentLoop.executeTool(tool, input);

    res.json({
      success: true,
      tool,
      result,
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
