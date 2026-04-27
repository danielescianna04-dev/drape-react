/**
 * Generation jobs API — read-side client for /agent/jobs endpoints.
 *
 * Used to:
 * - Recover after disconnect: list user's pending jobs at app open and
 *   re-attach to any that are still running.
 * - Snapshot a job's current state without opening an SSE stream.
 *
 * The write side (creating a job) happens implicitly when the frontend
 * POSTs /agent/create — the backend creates the job and emits its id in a
 * `job_created` SSE event. See useAgentStream for the capture path.
 */

import EventSource from 'react-native-sse';
import { config } from '../../config/config';
import { getAuthToken } from './getAuthToken';

export interface JobSummary {
  id: string;
  projectId: string;
  projectName?: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase?: string | null;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail extends JobSummary {
  prompt: string | null;
  error: string | null;
  events: { type: string; data: unknown; ts: number }[];
  result: unknown;
  completedAt: string | null;
}

async function authedFetch(path: string): Promise<Response> {
  const token = await getAuthToken();
  return fetch(`${config.apiUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export const jobsApi = {
  /** List queued/running jobs for the current user. */
  async listPending(): Promise<JobSummary[]> {
    const res = await authedFetch('/agent/jobs');
    if (!res.ok) throw new Error(`listPending failed: ${res.status}`);
    const json = await res.json();
    return json.jobs || [];
  },

  /** Snapshot of a single job (404 if not found / not owned). */
  async get(jobId: string): Promise<JobDetail | null> {
    const res = await authedFetch(`/agent/jobs/${encodeURIComponent(jobId)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`get(${jobId}) failed: ${res.status}`);
    const json = await res.json();
    return json.job || null;
  },

  /**
   * Open a live SSE stream that replays past events then tails new ones.
   * Returns the EventSource so the caller can `.close()` when unmounting.
   * Falls back to polling-style: if the job is already terminal, the stream
   * emits `job_end` and closes immediately.
   */
  async attachStream(jobId: string): Promise<EventSource> {
    const token = await getAuthToken();
    return new EventSource(`${config.apiUrl}/agent/jobs/${encodeURIComponent(jobId)}/events`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      pollingInterval: 0,
    });
  },
};
