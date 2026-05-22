/**
 * Thin HTTP client for the opencode `serve` daemon running on the host.
 *
 * We use this to drive human-in-the-loop flows (e.g. answering a `question`
 * tool the agent invoked) — the JSONL stream produced by `opencode run` does
 * not expose a way to send an answer back, so we have to talk to the HTTP API
 * directly. Default URL points at the local daemon; override via env.
 */
import { log } from '../utils/logger';

const OPENCODE_URL = process.env.OPENCODE_URL || 'http://127.0.0.1:4000';

export interface PendingQuestion {
  requestID: string;
  sessionID?: string;
  questions?: Array<{ text?: string; choices?: string[] }>;
}

export async function listPendingQuestions(): Promise<PendingQuestion[]> {
  const res = await fetch(`${OPENCODE_URL}/question`);
  if (!res.ok) throw new Error(`opencode /question returned ${res.status}`);
  return (await res.json()) as PendingQuestion[];
}

export async function findPendingQuestionForSession(sessionID: string): Promise<PendingQuestion | null> {
  try {
    const all = await listPendingQuestions();
    return all.find((q) => q.sessionID === sessionID) || all[0] || null;
  } catch (err: any) {
    log.warn(`[opencode-http] listPendingQuestions failed: ${err?.message || err}`);
    return null;
  }
}

/** Reply to a pending question. `answers` is an array of answer arrays —
 *  for a free-form text question pass `[[text]]`. */
export async function replyToQuestion(requestID: string, answers: string[][]): Promise<boolean> {
  const res = await fetch(`${OPENCODE_URL}/question/${encodeURIComponent(requestID)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`opencode reply ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

export async function rejectQuestion(requestID: string): Promise<boolean> {
  const res = await fetch(`${OPENCODE_URL}/question/${encodeURIComponent(requestID)}/reject`, {
    method: 'POST',
  });
  return res.ok;
}
