import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { ValidationError } from '../middleware/error-handler';
import { getUserPlan, verifyProjectOwnership } from '../middleware/auth';
import { dockerService } from '../services/docker.service';
import { workspaceService } from '../services/workspace.service';
import { log } from '../utils/logger';
import { auditService } from '../services/audit.service';
import { runAgentChatStream } from '../services/agent-chat-stream.service';
import { fileService } from '../services/file.service';
import { config as appConfig } from '../config';
import { BuildReportTracker } from '../services/build-report.service';
import { runAgentProjectCreation } from '../services/agent-project-creation.service';
import { verifyAndFixProject } from '../services/verify-project.service';
import { getAgentModeFromPath, setupAgentSse } from './agentSse';
import { clearPlan, getStoredPlan, storePlan, updateStoredPlan } from './agentPlanStore';
import { resolveAgentStreamRouting } from './agentStreamRouting';
import {
  ensureProjectOwnership,
  getAgentUserId,
  requireBooleanField,
  requireField,
} from './agentRequestGuards';
import nodePath from 'path';
import nodeFs from 'fs';

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
    previewContext,
  } = req.body;

  const userId = getAgentUserId(req);
  const promptPreview = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  log.info(`[Agent] Incoming prompt for ${projectId}: ${JSON.stringify(promptPreview)}`);

  requireField(prompt, 'prompt is required');
  requireField(projectId, 'projectId is required');

  // Parallelize Firebase calls to reduce latency
  const [userPlan, isOwner] = await Promise.all([
    getUserPlan(userId),
    verifyProjectOwnership(userId, projectId),
  ]);

  if (!isOwner) {
    log.warn(`[AUTH] User ${userId} tried to access project ${projectId} without ownership`);
    return res.status(403).json({ error: 'Access denied: you do not own this project' });
  }

  const { mode, intent } = resolveAgentStreamRouting({
    path: req.path,
    body: req.body,
  });

  log.info(`[Agent] SSE headers flushed for project ${projectId}, mode: ${mode}`);

  // Track if client is still connected
  let clientDisconnected = false;
  const { writeEvent: writeSseEvent, cleanup } = setupAgentSse({
    res,
    onDisconnect: () => {
      clientDisconnected = true;
      log.info(`[Agent] Client disconnected for project ${projectId}`);
    },
  });

  // Handle client disconnect — use res.on('close'), NOT req.on('close')
  // req.on('close') fires when the request body is consumed (after body-parser),
  // NOT when the client TCP connection closes. res.on('close') fires on actual disconnect.

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

    // ── Route: project creation uses AgentLoop (direct Claude API), chat uses OpenCode ──
    if (intent === 'project_creation') {
      await runAgentProjectCreation({
        projectId,
        userId,
        userPlan: userPlan || 'free',
        prompt,
        sessionProjectType: session?.projectInfo?.type as string | undefined,
        isClientConnected: () => !clientDisconnected && !res.writableEnded,
        writeSseEvent,
      });
    } else {
      // ═══ CHAT: Use OpenCode via container (Gemini Flash for speed) ═══
      await runAgentChatStream({
        container,
        projectId,
        userId,
        prompt,
        model: model || 'gemini-3-flash',
        previewContext,
        isClientConnected: () => !clientDisconnected && !res.writableEnded,
        writeSseEvent,
      });
    }

    log.info(`[Agent] Stream completed for project ${projectId}`);
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    log.error(`[Agent] Stream error for project ${projectId}:`, errMsg);
    if (errStack) log.error(`[Agent] Stack:`, errStack);

    if (!res.writableEnded) {
      writeSseEvent('error', {
        type: 'error',
        error: errMsg || 'Stream failed',
      });
    }
  } finally {
    cleanup();
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
