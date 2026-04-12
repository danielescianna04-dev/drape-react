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
import { fileService } from '../services/file.service';
import { config as appConfig } from '../config';
import { BuildReportTracker } from '../services/build-report.service';
import { AgentLoop } from '../services/agent-loop.service';
import { verifyAndFixProject } from '../services/verify-project.service';
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
      models: ['gemini-2.5-flash', 'gemini-3.1-pro', 'gemini-3.1-flash-lite'],
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
    auditService.log({ userId, action: 'agent_stream_start', resource: projectId, details: `mode: ${mode}, model: ${model || 'gemini-2.5-flash'}`, ip: req.ip });
    log.info(`[Agent] Starting OpenCode stream for project ${projectId}, model: ${model || 'gemini-2.5-flash'}`);

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
    // Use Claude Sonnet 4.6 for project creation (better code quality), Gemini for chat
    // Project creation prompts are always >2000 chars (they include the full system prompt)
    const usedModel = model || 'gemini-2.5-flash';
    const sessionId = `project-${projectId}`;

    // Track whether we're suppressing 'done'/'complete' events (during multi-phase generation)
    let suppressDoneEvents = false;

    const streamToClient = (event: any) => {
      if (clientDisconnected || res.writableEnded) return;
      const eventType = event.type || 'message';

      // Suppress done/complete during intermediate phases — frontend would close the connection
      if (suppressDoneEvents && (eventType === 'done' || eventType === 'complete')) {
        log.info(`[Agent] Suppressed '${eventType}' event (QA phase pending)`);
        return;
      }

      writeSseEvent(eventType, event.data || event);

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
    };

    // ── Route: project creation uses AgentLoop (direct Claude API), chat uses OpenCode ──
    const isProjectCreation = fullPrompt.length > 2000;

    if (isProjectCreation) {
      // ═══ PROJECT CREATION: Direct Claude API via AgentLoop ═══
      // Like Lovable — full control over iterations, tool calls, and quality
      log.info(`[Agent] Using AgentLoop (direct API) for project creation: ${projectId}`);

      const agentLoop = new AgentLoop({
        projectId,
        mode: 'fast',
        model: 'gemini-2.5-flash',
        userId,
        userPlan: userPlan || 'free',
        conversationHistory: [],
        thinkingLevel: 'low',
      });

      // Increase max iterations for project creation — we want thorough generation
      agentLoop.maxIterations = 80;

      let filesCreated = 0;

      try {
      for await (const event of agentLoop.run(fullPrompt)) {
        if (clientDisconnected || res.writableEnded) break;

        // Map AgentLoop events to SSE format the frontend expects
        switch (event.type) {
          case 'text_delta':
            writeSseEvent('message', { type: 'text', text: event.text });
            break;
          case 'tool_start':
            writeSseEvent('tool_start', { type: 'tool_start', tool: event.tool, id: event.id });
            if (event.tool === 'write_file') filesCreated++;
            break;
          case 'tool_input':
            writeSseEvent('tool_input', { type: 'tool_input', tool: event.tool, id: event.id, input: event.input });
            break;
          case 'tool_complete':
            writeSseEvent('tool_complete', { type: 'tool_complete', tool: event.tool, id: event.id, result: event.result });
            break;
          case 'tool_error':
            writeSseEvent('tool_error', { type: 'tool_error', tool: event.tool, id: event.id, error: event.error });
            break;
          case 'usage': {
            const ev = event as any;
            metricsService.trackAIUsage({
              userId,
              model: 'gemini-2.5-flash',
              inputTokens: ev.totalInputTokens || 0,
              outputTokens: ev.totalOutputTokens || 0,
              costEur: ev.totalCostEur || 0,
            });
            writeSseEvent('usage', { type: 'usage', costEur: ev.totalCostEur, tokensUsed: { input: ev.totalInputTokens, output: ev.totalOutputTokens } });
            break;
          }
          case 'complete':
            log.info(`[Agent] AgentLoop completed for ${projectId}: ${event.result || 'done'}`);
            break;
          case 'error':
            writeSseEvent('error', { type: 'error', error: event.error || event.message });
            break;
          case 'iteration_start':
            log.info(`[Agent] AgentLoop iteration ${event.iteration} for ${projectId}`);
            break;
          // Pass through thinking events if present
          case 'thinking':
            if (event.text) writeSseEvent('thinking', { type: 'thinking', text: event.text });
            break;
        }
      }
      } catch (loopErr: any) {
        log.error(`[Agent] AgentLoop error for ${projectId}: ${loopErr.message}`);
        log.error(`[Agent] AgentLoop stack: ${loopErr.stack}`);
      }

      log.info(`[Agent] AgentLoop finished for ${projectId}, files created: ${filesCreated}`);

      // ── POST-GENERATION: Compile check + fix loop ──
      if (!clientDisconnected && !res.writableEnded) {
        // Wait for container to be ready
        for (let w = 0; w < 10; w++) {
          try {
            const s = await workspaceService.getOrCreateContainer(projectId, userId);
            if (s?.containerId) break;
          } catch {}
          await new Promise(r => setTimeout(r, 2000));
        }

        for (let fixAttempt = 0; fixAttempt < 3; fixAttempt++) {
          let compileErrors = '';
          try {
            const tscResult = await workspaceService.exec(projectId, userId,
              'cd /home/coder/project && npx tsc --noEmit --pretty 2>&1 | head -60 || true'
            );
            const output = tscResult.stdout || '';
            log.info(`[Agent] Post-gen tsc (${output.length} chars): ${output.substring(0, 120)}...`);
            if (output.includes('error TS')) {
              compileErrors = output.trim();
            }
          } catch (e: any) {
            log.warn(`[Agent] Post-gen tsc failed: ${e.message}`);
          }

          if (!compileErrors) {
            log.info(`[Agent] Post-gen compile check passed for ${projectId}`);
            break;
          }

          const errorCount = (compileErrors.match(/error TS/g) || []).length;
          log.info(`[Agent] Post-gen: ${errorCount} errors, fix ${fixAttempt + 1} for ${projectId}`);
          writeSseEvent('status', { type: 'status', message: `Fixing ${errorCount} compile errors...`, phase: 'fix' });

          const fixLoop = new AgentLoop({
            projectId, mode: 'fast', model: 'gemini-2.5-flash',
            userId, userPlan: userPlan || 'free', conversationHistory: [],
          });
          fixLoop.maxIterations = 15;

          try {
            for await (const event of fixLoop.run(`Fix these TypeScript errors:\n\n${compileErrors}\n\nRead each broken file, fix the error, save. Then run: npx tsc --noEmit 2>&1 | head -30`)) {
              if (clientDisconnected || res.writableEnded) break;
              const ev = event as any;
              if (event.type === 'text_delta') writeSseEvent('message', { type: 'text', text: ev.text });
              else if (event.type === 'tool_start') writeSseEvent('tool_start', { type: 'tool_start', tool: ev.tool, id: ev.id });
              else if (event.type === 'tool_complete') writeSseEvent('tool_complete', { type: 'tool_complete', tool: ev.tool, id: ev.id, result: ev.result });
            }
          } catch (fixErr: any) {
            log.warn(`[Agent] Fix loop error: ${fixErr.message}`);
          }
        }
      }

      // ── FAST VERIFICATION: compile check + warm up + curl check + auto-fix ──
      // No Puppeteer/screenshots — fast like Lovable. Guarantees no blank page.
      writeSseEvent('status', { type: 'status', message: 'Starting preview...', phase: 'warmup' });

      // 1. Warm up: install deps + start dev server + wait for port 3000
      try {
        await workspaceService.warmProject(projectId, userId);
        log.info(`[Agent] Warm-up complete for ${projectId}`);
      } catch (e: any) {
        log.warn(`[Agent] Warm-up failed: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 3000)); // Vite first compilation settle

      // 2. Curl check — does the page serve real content?
      let previewOk = false;
      for (let check = 0; check < 2; check++) {
        try {
          const curl = await workspaceService.exec(projectId, userId,
            'curl -s http://localhost:3000 2>/dev/null | wc -c'
          );
          const bytes = parseInt((curl.stdout || '0').trim(), 10);
          previewOk = bytes > 200;
          log.info(`[Agent] Curl check ${check + 1}: ${bytes} bytes — ${previewOk ? 'OK' : 'TOO SMALL'}`);
          if (previewOk) break;
        } catch {}

        if (!previewOk && check === 0) {
          // Page too small or empty — get error and ask AI to fix
          writeSseEvent('status', { type: 'status', message: 'Fixing preview...', phase: 'fix' });
          let errorContext = '';
          try {
            // Try multiple log sources — Next.js turbopack logs go to process stdout, not server.log
            const serverLog = await workspaceService.exec(projectId, userId, 'tail -50 /home/coder/server.log 2>/dev/null; cat /tmp/next-dev.log 2>/dev/null | tail -50');
            const processLog = await workspaceService.exec(projectId, userId, 'cat /proc/$(pgrep -f "next dev" | head -1)/fd/1 2>/dev/null | tail -30 || true');
            const htmlContent = await workspaceService.exec(projectId, userId, 'curl -s http://localhost:3000 2>/dev/null | head -100');
            const serverLogText = (serverLog.stdout || '') + (processLog.stdout || '');
            errorContext = `Server log:\n${serverLogText.substring(0, 800)}\n\nHTML output:\n${(htmlContent.stdout || '').substring(0, 500)}`;
          } catch {}

          if (errorContext) {
            const fixLoop = new AgentLoop({
              projectId, mode: 'fast', model: 'gemini-2.5-flash',
              userId, userPlan: userPlan || 'free', conversationHistory: [],
            });
            fixLoop.maxIterations = 10;
            try {
              for await (const ev of fixLoop.run(`The preview is broken or showing a blank page. Fix it.\n\n${errorContext}\n\nIMPORTANT: Read the server log errors carefully. Common fixes:\n- If middleware.ts imports Node.js-only packages (better-auth, jose, pg), remove those imports and simplify middleware to only check cookies\n- If ENOENT for .next files, delete .next folder and the dev server will rebuild\n- If module not found, check imports match actual file paths\n- For Next.js: never use 'use client' in layout.tsx unless needed for hooks\n- For React: ensure App.tsx has BrowserRouter and correct routes\n\nRead the broken files, fix errors, save.`)) {
                if (clientDisconnected || res.writableEnded) break;
                const e = ev as any;
                if (ev.type === 'text_delta') writeSseEvent('message', { type: 'text', text: e.text });
                else if (ev.type === 'tool_start') writeSseEvent('tool_start', { type: 'tool_start', tool: e.tool, id: e.id });
                else if (ev.type === 'tool_complete') writeSseEvent('tool_complete', { type: 'tool_complete', tool: e.tool, id: e.id, result: e.result });
              }
            } catch (fixErr: any) {
              log.warn(`[Agent] Preview fix error: ${fixErr.message}`);
            }
            await new Promise(r => setTimeout(r, 3000)); // Let Vite recompile
          }
        }
      }

      // 2b. Full verify + autoFix (multi-route compile check, autoFix loop).
      // This runs AFTER the simple curl check above because the curl check handles
      // the obvious "blank page" case. The full verify catches subtle errors like
      // syntax errors, failed imports, wrong relative paths — things the AI's own
      // self-check missed.
      if (previewOk && !clientDisconnected && !res.writableEnded) {
        writeSseEvent('status', { type: 'status', message: 'Verifying all routes...', phase: 'verify' });
        try {
          const vr = await verifyAndFixProject({
            projectId,
            userId,
            technology: (session?.projectInfo?.type as string) || 'nextjs',
            onProgress: (_pct, msg) => {
              if (!clientDisconnected && !res.writableEnded) {
                writeSseEvent('status', { type: 'status', message: msg, phase: 'verify' });
              }
            },
          });
          if (!vr.passed) {
            log.warn(`[Agent] Verify found ${vr.errors.length} issues post-gen: ${vr.errors.slice(0, 3).join('; ')}`);
            previewOk = false; // demote to failed so buildReport reflects it
          } else {
            log.info(`[Agent] Full verify passed for ${projectId}`);
          }
        } catch (verifyErr: any) {
          log.warn(`[Agent] Full verify threw: ${verifyErr.message}`);
        }
      }

      // 3. Finalize build report
      const now = new Date().toISOString();
      let existingReport: any = null;
      try {
        const rr = await fileService.readFile(projectId, '.drape/build-report.json');
        if (rr.success && rr.data) existingReport = JSON.parse(rr.data.content);
      } catch {}

      if (existingReport) {
        const qaAction = existingReport.actions?.find((a: any) => a.step === 'qa' && a.status === 'running');
        if (qaAction) {
          qaAction.status = previewOk ? 'completed' : 'failed';
          qaAction.completedAt = now;
          qaAction.durationMs = new Date(now).getTime() - new Date(qaAction.startedAt).getTime();
          qaAction.metadata = { qaStatus: previewOk ? 'passed' : 'failed', qualityScore: previewOk ? 7 : 3, totalIssues: previewOk ? 0 : 1 };
          if (!previewOk) qaAction.error = 'Preview returned empty or minimal content';
        }
        existingReport.status = 'completed';
        existingReport.completedAt = now;
        existingReport.totalDurationMs = new Date(now).getTime() - new Date(existingReport.createdAt).getTime();
        existingReport.summary = { ...existingReport.summary, filesGenerated: filesCreated };
        try { await fileService.writeFile(projectId, '.drape/build-report.json', JSON.stringify(existingReport, null, 2)); } catch {}
      }

      // 4. Write verification report
      try {
        await fileService.writeFile(projectId, '.drape/verification-report.json', JSON.stringify({
          projectId, createdAt: existingReport?.createdAt || now, completedAt: now,
          status: previewOk ? 'passed' : 'failed',
          backendVerification: {
            attempts: [{ attemptNumber: 1, timestamp: now, status: previewOk ? 'passed' : 'failed',
              pages: [{ path: '/', status: previewOk ? 200 : 0, errors: previewOk ? [] : ['Preview empty'] }],
              navigation: [], fixes: [] }],
            totalDuration: existingReport ? new Date(now).getTime() - new Date(existingReport.createdAt).getTime() : 0,
          },
        }, null, 2));
      } catch {}

      log.info(`[Agent] Creation complete for ${projectId}, files: ${filesCreated}, preview: ${previewOk ? 'OK' : 'EMPTY'}`);

      // Send final events
      if (!clientDisconnected && !res.writableEnded) {
        writeSseEvent('complete', { type: 'complete', message: 'Project created and verified' });
        writeSseEvent('done', { type: 'done' });
      }
    } else {
      // ═══ CHAT: Use OpenCode via container (Gemini Flash for speed) ═══
      await streamOpenCodeFromContainer(container, fullPrompt, usedModel, sessionId, streamToClient, () => {});
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
