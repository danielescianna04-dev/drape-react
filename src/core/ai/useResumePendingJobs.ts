/**
 * useResumePendingJobs — at app boot (and on auth change), reconcile any
 * pending generation jobs we tracked locally against the server.
 *
 * Why: a job can finish while the app is backgrounded or killed entirely.
 * The push notification covers the "user gets told" case, but if the user
 * just reopens the app without tapping a notification, we still need to:
 *   - clear pendingJobs entries for jobs that are already terminal
 *   - leave entries for jobs still running, so when the user opens the
 *     project chat tab, useAgentStream.attachToJob picks them up
 *
 * Runs once per authenticated session — not on every render.
 */

import { useEffect } from 'react';
import { jobsApi } from '../api/jobsApi';
import { pendingJobs } from './pendingJobsStore';

export function useResumePendingJobs(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const local = await pendingJobs.getAll();
        if (cancelled || local.length === 0) return;
        for (const { projectId, jobId } of local) {
          try {
            const snap = await jobsApi.get(jobId);
            if (cancelled) return;
            if (!snap) {
              await pendingJobs.clear(projectId);
              continue;
            }
            if (snap.status === 'completed' || snap.status === 'failed' || snap.status === 'cancelled') {
              await pendingJobs.clear(projectId);
            }
            // Running/queued: keep it; the project chat will resume on mount.
          } catch {
            // Network blip — leave entry, retry next launch.
          }
        }
      } catch {
        // Storage unreadable — non-fatal.
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);
}
