import { log } from '../utils/logger';
import { workspaceService } from './workspace.service';
import { AgentLoop } from './agent-loop.service';
import { streamAgentLoopToSse } from './agent-loop-stream.service';
import { verifyAndFixProject } from './verify-project.service';

interface VerifyGeneratedProjectParams {
  projectId: string;
  userId: string;
  userPlan: string;
  sessionProjectType?: string;
  isClientConnected: () => boolean;
  writeSseEvent: (eventType: string, payload: { type: string; [key: string]: unknown }) => void;
}

async function waitForContainer(projectId: string, userId: string) {
  for (let w = 0; w < 10; w++) {
    try {
      const s = await workspaceService.getOrCreateContainer(projectId, userId);
      if (s?.containerId) return;
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function runTypeScriptFixLoop({
  projectId,
  userId,
  userPlan,
  isClientConnected,
  writeSseEvent,
}: Omit<VerifyGeneratedProjectParams, 'sessionProjectType'>) {
  await waitForContainer(projectId, userId);

  for (let fixAttempt = 0; fixAttempt < 3; fixAttempt++) {
    let compileErrors = '';
    try {
      const tscResult = await workspaceService.exec(
        projectId,
        userId,
        'cd /home/coder/project && npx tsc --noEmit --pretty 2>&1 | head -60 || true',
      );
      const output = tscResult.stdout || '';
      log.info(`[Agent] Post-gen tsc (${output.length} chars): ${output.substring(0, 120)}...`);
      if (output.includes('error TS')) {
        compileErrors = output.trim();
      }
    } catch (error: any) {
      log.warn(`[Agent] Post-gen tsc failed: ${error.message}`);
    }

    if (!compileErrors) {
      log.info(`[Agent] Post-gen compile check passed for ${projectId}`);
      break;
    }

    const errorCount = (compileErrors.match(/error TS/g) || []).length;
    log.info(`[Agent] Post-gen: ${errorCount} errors, fix ${fixAttempt + 1} for ${projectId}`);
    writeSseEvent('status', { type: 'status', message: `Fixing ${errorCount} compile errors...`, phase: 'fix' });

    const fixLoop = new AgentLoop({
      projectId,
      mode: 'fast',
      model: 'gemini-3-flash',
      userId,
      userPlan: userPlan || 'free',
      conversationHistory: [],
    });
    fixLoop.maxIterations = 15;

    try {
      await streamAgentLoopToSse({
        stream: fixLoop.run(`Fix these TypeScript errors:\n\n${compileErrors}\n\nRead each broken file, fix the error, save. Then run: npx tsc --noEmit 2>&1 | head -30`),
        isClientConnected,
        writeSseEvent,
      });
    } catch (error: any) {
      log.warn(`[Agent] Fix loop error: ${error.message}`);
    }
  }
}

async function runPreviewRecoveryLoop({
  projectId,
  userId,
  userPlan,
  isClientConnected,
  writeSseEvent,
}: Omit<VerifyGeneratedProjectParams, 'sessionProjectType'>) {
  writeSseEvent('status', { type: 'status', message: 'Starting preview...', phase: 'warmup' });

  try {
    await workspaceService.warmProject(projectId, userId);
    log.info(`[Agent] Warm-up complete for ${projectId}`);
  } catch (error: any) {
    log.warn(`[Agent] Warm-up failed: ${error.message}`);
  }
  await new Promise(r => setTimeout(r, 3000));

  let previewOk = false;
  for (let check = 0; check < 2; check++) {
    try {
      const curl = await workspaceService.exec(projectId, userId, 'curl -s http://localhost:3000 2>/dev/null | wc -c');
      const bytes = parseInt((curl.stdout || '0').trim(), 10);
      previewOk = bytes > 200;
      log.info(`[Agent] Curl check ${check + 1}: ${bytes} bytes — ${previewOk ? 'OK' : 'TOO SMALL'}`);
      if (previewOk) break;
    } catch {}

    if (!previewOk && check === 0) {
      writeSseEvent('status', { type: 'status', message: 'Fixing preview...', phase: 'fix' });
      let errorContext = '';
      try {
        const serverLog = await workspaceService.exec(projectId, userId, 'tail -50 /home/coder/server.log 2>/dev/null; cat /tmp/next-dev.log 2>/dev/null | tail -50');
        const processLog = await workspaceService.exec(projectId, userId, 'cat /proc/$(pgrep -f "next dev" | head -1)/fd/1 2>/dev/null | tail -30 || true');
        const htmlContent = await workspaceService.exec(projectId, userId, 'curl -s http://localhost:3000 2>/dev/null | head -100');
        const serverLogText = (serverLog.stdout || '') + (processLog.stdout || '');
        errorContext = `Server log:\n${serverLogText.substring(0, 800)}\n\nHTML output:\n${(htmlContent.stdout || '').substring(0, 500)}`;
      } catch {}

      if (errorContext) {
        const fixLoop = new AgentLoop({
          projectId,
          mode: 'fast',
          model: 'gemini-3-flash',
          userId,
          userPlan: userPlan || 'free',
          conversationHistory: [],
        });
        fixLoop.maxIterations = 10;
        try {
          await streamAgentLoopToSse({
            stream: fixLoop.run(`The preview is broken or showing a blank page. Fix it.\n\n${errorContext}\n\nIMPORTANT: Read the server log errors carefully. Common fixes:\n- If middleware.ts imports Node.js-only packages (better-auth, jose, pg), remove those imports and simplify middleware to only check cookies\n- If ENOENT for .next files, delete .next folder and the dev server will rebuild\n- If module not found, check imports match actual file paths\n- For Next.js: never use 'use client' in layout.tsx unless needed for hooks\n- For React: ensure App.tsx has BrowserRouter and correct routes\n\nRead the broken files, fix errors, save.`),
            isClientConnected,
            writeSseEvent,
          });
        } catch (error: any) {
          log.warn(`[Agent] Preview fix error: ${error.message}`);
        }
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  return previewOk;
}

async function runFullVerification({
  projectId,
  userId,
  sessionProjectType,
  isClientConnected,
  writeSseEvent,
}: Pick<VerifyGeneratedProjectParams, 'projectId' | 'userId' | 'sessionProjectType' | 'isClientConnected' | 'writeSseEvent'>) {
  writeSseEvent('status', { type: 'status', message: 'Verifying all routes...', phase: 'verify' });
  try {
    const vr = await verifyAndFixProject({
      projectId,
      userId,
      technology: sessionProjectType || 'nextjs',
      onProgress: (_pct, msg) => {
        if (isClientConnected()) {
          writeSseEvent('status', { type: 'status', message: msg, phase: 'verify' });
        }
      },
    });
    if (!vr.passed) {
      log.warn(`[Agent] Verify found ${vr.errors.length} issues post-gen: ${vr.errors.slice(0, 3).join('; ')}`);
      return false;
    }
    log.info(`[Agent] Full verify passed for ${projectId}`);
    return true;
  } catch (error: any) {
    log.warn(`[Agent] Full verify threw: ${error.message}`);
    return false;
  }
}

export const verifyGeneratedProject = async ({
  projectId,
  userId,
  userPlan,
  sessionProjectType,
  isClientConnected,
  writeSseEvent,
}: VerifyGeneratedProjectParams) => {
  if (!isClientConnected()) return false;

  await runTypeScriptFixLoop({ projectId, userId, userPlan, isClientConnected, writeSseEvent });

  let previewOk = await runPreviewRecoveryLoop({ projectId, userId, userPlan, isClientConnected, writeSseEvent });

  if (previewOk && isClientConnected()) {
    previewOk = await runFullVerification({
      projectId,
      userId,
      sessionProjectType,
      isClientConnected,
      writeSseEvent,
    });
  }

  return previewOk;
};
