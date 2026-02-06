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
  } = req.body;

  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.userId;
  const userPlan = await getUserPlan(userId);

  if (!prompt) {
    throw new ValidationError('prompt is required');
  }
  if (!projectId) {
    throw new ValidationError('projectId is required');
  }

  // Verify project ownership (lenient during migration)
  const isOwner = await verifyProjectOwnership(userId, projectId);
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

  // Send initial SSE comment to confirm connection
  res.write(': connected\n\n');

  log.info(`[Agent] SSE headers flushed for project ${projectId}, mode: ${mode}`);

  // Keep-alive interval
  const keepAliveInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  // Track if client is still connected
  let clientDisconnected = false;

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
      userId,
      userPlan,
    });

    log.info(`[Agent] Starting stream for project ${projectId}, mode: ${mode}, model: ${model || 'default'}`);

    // Stream events from agent loop
    for await (const event of agentLoop.run(prompt, images)) {
      if (res.writableEnded) {
        log.warn(`[Agent] Response ended, stopping stream for project ${projectId}`);
        break;
      }

      const data = JSON.stringify(event);
      // Use named SSE events so react-native-sse addEventListener works
      const eventType = (event as any).type || 'message';
      res.write(`event: ${eventType}\ndata: ${data}\n\n`);
    }

    // Send completion event
    if (!res.writableEnded) {
      res.write(`event: done\ndata: ${JSON.stringify({ type: 'done' })}\n\n`);
    }

    log.info(`[Agent] Stream completed for project ${projectId}`);
  } catch (error: any) {
    log.error(`[Agent] Stream error for project ${projectId}:`, error.message);
    log.error(`[Agent] Stack:`, error.stack);

    if (!res.writableEnded) {
      const errorEvent = {
        type: 'error',
        error: error.message || 'Stream failed',
      };
      res.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
    }
  } finally {
    cleanup();
  }
}));

// POST /execute-tool - Single tool execution
agentRouter.post('/execute-tool', asyncHandler(async (req, res) => {
  const { tool, input, projectId } = req.body;
  const userId = req.userId!;

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
    const agentLoop = new AgentLoop({ projectId });
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
  const userId = req.userId!;

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
  const userId = req.userId!;

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
