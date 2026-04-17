import { fileService } from './file.service';
import { log } from '../utils/logger';

export const finalizeProjectVerificationReport = async ({
  projectId,
  filesCreated,
  generatedFiles,
  previewOk,
}: {
  projectId: string;
  filesCreated: number;
  generatedFiles?: string[];
  previewOk: boolean;
}) => {
  const now = new Date().toISOString();
  let existingReport: any = null;
  let existingVerificationReport: any = null;

  try {
    const rr = await fileService.readFile(projectId, '.drape/build-report.json');
    if (rr.success && rr.data) existingReport = JSON.parse(rr.data.content);
  } catch {}

  try {
    const vr = await fileService.readFile(projectId, '.drape/verification-report.json');
    if (vr.success && vr.data) existingVerificationReport = JSON.parse(vr.data.content);
  } catch {}

  if (existingReport) {
    const qaAction = existingReport.actions?.find((a: any) => a.step === 'qa' && a.status === 'running');
    if (qaAction) {
      qaAction.status = previewOk ? 'completed' : 'failed';
      qaAction.completedAt = now;
      qaAction.durationMs = new Date(now).getTime() - new Date(qaAction.startedAt).getTime();
      qaAction.metadata = {
        qaStatus: previewOk ? 'passed' : 'failed',
        qualityScore: previewOk ? 7 : 3,
        totalIssues: previewOk ? 0 : 1,
      };
      if (!previewOk) qaAction.error = 'Preview returned empty or minimal content';
    }
    if (!qaAction) {
      existingReport.actions = existingReport.actions || [];
      existingReport.actions.push({
        id: `qa-final-${Date.now()}`,
        step: 'qa',
        title: 'QA Verification — functional + visual testing',
        status: previewOk ? 'completed' : 'failed',
        startedAt: existingReport.createdAt || now,
        completedAt: now,
        durationMs: Math.max(0, new Date(now).getTime() - new Date(existingReport.createdAt || now).getTime()),
        error: previewOk ? undefined : 'Preview returned empty or minimal content',
        metadata: {
          qaStatus: previewOk ? 'passed' : 'failed',
          qualityScore: previewOk ? 7 : 3,
          totalIssues: previewOk ? 0 : 1,
        },
      });
    }

    // If the preview is verified in the end, intermediate startup/runtime failures
    // that happened before the successful verification should be marked as fixed.
    if (Array.isArray(existingReport.actions)) {
      const latestRuntimeRecoveryTs = existingReport.actions.reduce((maxTs: number, action: any) => {
        if (action?.step !== 'dev-server' || action?.status !== 'fixed') return maxTs;
        if (!/Runtime recovery applied|Next\.js cache corruption/i.test(action?.title || '')) return maxTs;
        const ts = action?.completedAt ? new Date(action.completedAt).getTime() : 0;
        return Math.max(maxTs, ts);
      }, 0);

      if (latestRuntimeRecoveryTs > 0) {
        for (const action of existingReport.actions) {
          if (action?.step !== 'runtime') continue;
          if (action?.status !== 'failed') continue;
          if (!['Next.js routes-manifest.json missing', 'Next.js middleware-manifest.json missing', 'Stale webpack chunk'].includes(action?.title)) continue;
          const actionTs = action?.completedAt
            ? new Date(action.completedAt).getTime()
            : (action?.startedAt ? new Date(action.startedAt).getTime() : 0);
          if (actionTs > 0 && actionTs <= latestRuntimeRecoveryTs) {
            action.status = 'fixed';
            if (!action.fix) {
              action.fix = 'Recovered by runtime cache clear + restart';
            }
          }
        }
      }
    }

    if (previewOk && Array.isArray(existingReport.actions)) {
      const latestVerifyRecoveryTs = existingReport.actions.reduce((maxTs: number, action: any) => {
        if (action?.step !== 'verify' || action?.status !== 'fixed') return maxTs;
        const ts = action?.completedAt ? new Date(action.completedAt).getTime() : 0;
        return Math.max(maxTs, ts);
      }, 0);

      if (latestVerifyRecoveryTs > 0) {
        for (const action of existingReport.actions) {
          if (!['runtime', 'compile', 'dev-server', 'warming'].includes(action?.step)) continue;
          if (action?.status !== 'failed') continue;
          const actionTs = action?.completedAt
            ? new Date(action.completedAt).getTime()
            : (action?.startedAt ? new Date(action.startedAt).getTime() : 0);
          if (actionTs > 0 && actionTs <= latestVerifyRecoveryTs) {
            action.status = 'fixed';
            if (!action.fix) {
              action.fix = 'Recovered by later verification and auto-fix';
            }
          }
        }
      }
    }

    existingReport.status = previewOk ? 'completed' : 'failed';
    existingReport.previewBlocked = !previewOk;
    existingReport.completedAt = now;
    existingReport.totalDurationMs = new Date(now).getTime() - new Date(existingReport.createdAt).getTime();
    existingReport.summary = {
      ...existingReport.summary,
      filesGenerated: generatedFiles?.length || filesCreated,
      generatedFiles: generatedFiles && generatedFiles.length > 0
        ? generatedFiles
        : (existingReport.summary?.generatedFiles || []),
    };
    try {
      await fileService.writeFile(projectId, '.drape/build-report.json', JSON.stringify(existingReport, null, 2));
    } catch {}
  }

  try {
    const mergedVerificationReport = existingVerificationReport || {
      projectId,
      createdAt: existingReport?.createdAt || now,
      backendVerification: {
        attempts: [{
          attemptNumber: 1,
          timestamp: now,
          status: previewOk ? 'passed' : 'failed',
          pages: [{ path: '/', status: previewOk ? 200 : 0, errors: previewOk ? [] : ['Preview empty'] }],
          navigation: [],
          fixes: [],
        }],
        totalDuration: existingReport ? new Date(now).getTime() - new Date(existingReport.createdAt).getTime() : 0,
      },
    };

    mergedVerificationReport.projectId = mergedVerificationReport.projectId || projectId;
    mergedVerificationReport.createdAt = mergedVerificationReport.createdAt || existingReport?.createdAt || now;
    mergedVerificationReport.completedAt = now;
    mergedVerificationReport.status = previewOk ? 'passed' : 'failed';
    if (!mergedVerificationReport.backendVerification) {
      mergedVerificationReport.backendVerification = {
        attempts: [],
        totalDuration: existingReport ? new Date(now).getTime() - new Date(existingReport.createdAt).getTime() : 0,
      };
    } else if (mergedVerificationReport.backendVerification.totalDuration == null) {
      mergedVerificationReport.backendVerification.totalDuration =
        existingReport ? new Date(now).getTime() - new Date(existingReport.createdAt).getTime() : 0;
    }

    await fileService.writeFile(
      projectId,
      '.drape/verification-report.json',
      JSON.stringify(mergedVerificationReport, null, 2)
    );
  } catch (error: any) {
    log.warn(`[Agent] Failed to write verification report for ${projectId}: ${error.message}`);
  }
};
