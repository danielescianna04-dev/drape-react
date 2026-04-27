/**
 * Generation jobs — durable record of long-running AI project-generation work.
 *
 * Jobs survive client disconnects: the HTTP request that creates them returns
 * a `jobId` immediately and the runner persists state here. Clients can
 * GET /agent/jobs/:id (snapshot) or attach to /agent/jobs/:id/events (live
 * SSE replay+tail) at any time, including after app restart.
 *
 * Storage: Postgres `generation_jobs` table (schema in drape-cloud/schema.sql).
 * Why Postgres over Firestore: better fit for ordered event lists, time-window
 * queries ("show jobs from last 24h"), and JSONB indexing.
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { getSql, isDrapeCloudConfigured } from './drape-cloud/client';
import { log } from '../utils/logger';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobEvent {
  // matches the SSE event name (e.g. 'phase', 'log', 'file', 'error', 'done')
  type: string;
  // payload as sent to clients (already JSON-serializable)
  data: unknown;
  // server timestamp at the moment the event was recorded
  ts: number;
}

export interface GenerationJob {
  id: string;
  userId: string;
  projectId: string;
  projectName: string | null;
  prompt: string | null;
  status: JobStatus;
  phase: string | null;
  progress: number;
  error: string | null;
  lastEvent: JobEvent | null;
  events: JobEvent[];
  result: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface CreateJobInput {
  userId: string;
  projectId: string;
  projectName?: string | null;
  prompt?: string | null;
}

// In-process pubsub for live tailing — clients attaching to /events while the
// job is still running get pushed each new event without polling. The bus is
// keyed by jobId; emitters are removed when the job reaches a terminal state.
const liveBus = new EventEmitter();
liveBus.setMaxListeners(50); // generous: a job rarely has more than 1-2 watchers

function rowToJob(row: any): GenerationJob {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    projectName: row.project_name,
    prompt: row.prompt,
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    error: row.error,
    lastEvent: row.last_event ?? null,
    events: row.events ?? [],
    result: row.result ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    completedAt: row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at,
  };
}

function ensureConfigured(): void {
  if (!isDrapeCloudConfigured()) {
    throw new Error('generation_jobs requires Drape Cloud DB to be configured (DRAPE_CLOUD_DB_URL)');
  }
}

export async function createJob(input: CreateJobInput): Promise<GenerationJob> {
  ensureConfigured();
  const id = randomUUID();
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO generation_jobs (id, user_id, project_id, project_name, prompt, status)
    VALUES (${id}, ${input.userId}, ${input.projectId}, ${input.projectName ?? null}, ${input.prompt ?? null}, 'queued')
    RETURNING *
  `;
  log.info('[gen-jobs] created', { jobId: id, projectId: input.projectId, userId: input.userId });
  return rowToJob(row);
}

export async function getJob(jobId: string): Promise<GenerationJob | null> {
  ensureConfigured();
  const sql = getSql();
  const rows = await sql`SELECT * FROM generation_jobs WHERE id = ${jobId} LIMIT 1`;
  return rows[0] ? rowToJob(rows[0]) : null;
}

export async function getJobIfOwnedBy(jobId: string, userId: string): Promise<GenerationJob | null> {
  const job = await getJob(jobId);
  if (!job) return null;
  if (job.userId !== userId) return null;
  return job;
}

export async function listPendingForUser(userId: string): Promise<GenerationJob[]> {
  ensureConfigured();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM generation_jobs
    WHERE user_id = ${userId}
      AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 20
  `;
  return rows.map(rowToJob);
}

interface UpdateJobInput {
  status?: JobStatus;
  phase?: string | null;
  progress?: number;
  error?: string | null;
  result?: unknown;
}

export async function updateJob(jobId: string, patch: UpdateJobInput): Promise<void> {
  ensureConfigured();
  const sql = getSql();
  const isTerminal = patch.status === 'completed' || patch.status === 'failed' || patch.status === 'cancelled';
  // postgres.js doesn't have a clean "partial update" helper, so we build the
  // SET clause inline. All fields are typed scalars or JSON values — no SQLi.
  await sql`
    UPDATE generation_jobs SET
      status       = COALESCE(${patch.status ?? null}, status),
      phase        = COALESCE(${patch.phase ?? null}, phase),
      progress     = COALESCE(${patch.progress ?? null}, progress),
      error        = COALESCE(${patch.error ?? null}, error),
      result       = COALESCE(${patch.result !== undefined ? sql.json(patch.result as any) : null}, result),
      updated_at   = now(),
      completed_at = CASE WHEN ${isTerminal} THEN COALESCE(completed_at, now()) ELSE completed_at END
    WHERE id = ${jobId}
  `;
  if (isTerminal) {
    // signal any live tailers to flush + close
    liveBus.emit(`done:${jobId}`);
    liveBus.removeAllListeners(`evt:${jobId}`);
    liveBus.removeAllListeners(`done:${jobId}`);
  }
}

/**
 * Append an event to the job's timeline AND push it to live tailers.
 * Use sparingly for high-frequency events (e.g. token-by-token text deltas):
 * those should be filtered to phase transitions, file batches, or final text.
 */
export async function appendEvent(jobId: string, event: Omit<JobEvent, 'ts'>): Promise<void> {
  ensureConfigured();
  const sql = getSql();
  const e: JobEvent = { ...event, ts: Date.now() };
  await sql`
    UPDATE generation_jobs SET
      events     = events || ${sql.json([e] as any)}::jsonb,
      last_event = ${sql.json(e as any)},
      updated_at = now()
    WHERE id = ${jobId}
  `;
  liveBus.emit(`evt:${jobId}`, e);
}

/**
 * Subscribe to live events for a job. Returns an unsubscribe function.
 * `onEvent` is called for each new event after the moment of subscription.
 * `onDone` is called once when the job reaches a terminal state.
 */
export function subscribeToJob(
  jobId: string,
  onEvent: (e: JobEvent) => void,
  onDone: () => void,
): () => void {
  const evtListener = (e: JobEvent) => onEvent(e);
  const doneListener = () => onDone();
  liveBus.on(`evt:${jobId}`, evtListener);
  liveBus.once(`done:${jobId}`, doneListener);
  return () => {
    liveBus.off(`evt:${jobId}`, evtListener);
    liveBus.off(`done:${jobId}`, doneListener);
  };
}
