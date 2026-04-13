import { fileService } from './file.service';
import { log } from '../utils/logger';

export const finalizeProjectVerificationReport = async ({
  projectId,
  filesCreated,
  previewOk,
}: {
  projectId: string;
  filesCreated: number;
  previewOk: boolean;
}) => {
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
      qaAction.metadata = {
        qaStatus: previewOk ? 'passed' : 'failed',
        qualityScore: previewOk ? 7 : 3,
        totalIssues: previewOk ? 0 : 1,
      };
      if (!previewOk) qaAction.error = 'Preview returned empty or minimal content';
    }
    existingReport.status = 'completed';
    existingReport.completedAt = now;
    existingReport.totalDurationMs = new Date(now).getTime() - new Date(existingReport.createdAt).getTime();
    existingReport.summary = { ...existingReport.summary, filesGenerated: filesCreated };
    try {
      await fileService.writeFile(projectId, '.drape/build-report.json', JSON.stringify(existingReport, null, 2));
    } catch {}
  }

  try {
    await fileService.writeFile(projectId, '.drape/verification-report.json', JSON.stringify({
      projectId,
      createdAt: existingReport?.createdAt || now,
      completedAt: now,
      status: previewOk ? 'passed' : 'failed',
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
    }, null, 2));
  } catch (error: any) {
    log.warn(`[Agent] Failed to write verification report for ${projectId}: ${error.message}`);
  }
};
