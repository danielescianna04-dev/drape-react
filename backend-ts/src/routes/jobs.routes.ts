/**
 * /agent/jobs/* — read-side API for long-running generation jobs.
 *
 * - GET /agent/jobs                — list this user's pending (queued/running) jobs
 * - GET /agent/jobs/:id            — snapshot of a single job (status + result)
 * - GET /agent/jobs/:id/events     — SSE: replay all events so far + tail live ones
 *
 * Jobs are created and mutated by the existing /agent/create handler; this
 * router only reads them, so a client can re-attach after disconnect / app
 * restart without losing state.
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import {
  getJobIfOwnedBy,
  listPendingForUser,
  subscribeToJob,
} from '../services/generation-jobs.service';
import { setupAgentSse } from './agentSse';

const router: Router = Router();

router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.uid as string;
  const jobs = await listPendingForUser(userId);
  res.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      projectId: j.projectId,
      projectName: j.projectName,
      status: j.status,
      phase: j.phase,
      progress: j.progress,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
  });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.uid as string;
  const job = await getJobIfOwnedBy(req.params.id, userId);
  if (!job) {
    res.status(404).json({ error: 'job_not_found' });
    return;
  }
  res.json({ job });
}));

/**
 * Live stream: replay every event the job has emitted so far, then tail any
 * new events as they happen. If the job is already terminal, replay-only
 * then close immediately.
 */
router.get('/:id/events', asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.uid as string;
  const job = await getJobIfOwnedBy(req.params.id, userId);
  if (!job) {
    res.status(404).json({ error: 'job_not_found' });
    return;
  }

  const sse = setupAgentSse({
    res,
    onDisconnect: () => { unsubscribe?.(); },
  });

  // 1. Snapshot envelope so the client immediately knows what it's looking at.
  sse.writeEvent('job_snapshot', {
    type: 'job_snapshot',
    id: job.id,
    projectId: job.projectId,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
  } as any);

  // 2. Replay the event log in order.
  for (const e of job.events) {
    sse.writeEvent(e.type, e.data as any);
  }

  // 3. If the job is already terminal, send a final marker and end.
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
    sse.writeEvent('job_end', {
      type: 'job_end',
      status: job.status,
      error: job.error,
      result: job.result,
    } as any);
    sse.cleanup();
    return;
  }

  // 4. Otherwise, subscribe to live events.
  let unsubscribe: (() => void) | null = null;
  unsubscribe = subscribeToJob(
    job.id,
    (e) => { sse.writeEvent(e.type, e.data as any); },
    () => {
      // Re-fetch terminal state to give the client the final result/error
      getJobIfOwnedBy(job.id, userId)
        .then((j) => {
          if (j) {
            sse.writeEvent('job_end', {
              type: 'job_end',
              status: j.status,
              error: j.error,
              result: j.result,
            } as any);
          }
          sse.cleanup();
        })
        .catch(() => sse.cleanup());
    },
  );
}));

export const jobsRouter: Router = router;
