/**
 * Thin HTTP client for the opencode `serve` daemon.
 *
 * Used for human-in-the-loop flows that the chatStream async generator can't
 * express — primarily answering a pending `question` tool the agent invoked.
 * Reuses OPENCODE_API_URL from env (validated in src/config/env.ts).
 */
import { env } from '../config/env';

const OPENCODE_URL = env.OPENCODE_API_URL || 'http://127.0.0.1:4000';

/** Reply to a pending opencode question. `answers` is an array of answer
 *  arrays — for a free-form text question pass `[[text]]`. */
export async function replyToQuestion(requestID: string, answers: string[][]): Promise<boolean> {
  const res = await fetch(`${OPENCODE_URL}/question/${encodeURIComponent(requestID)}/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.OPENCODE_API_KEY ? { Authorization: `Bearer ${env.OPENCODE_API_KEY}` } : {}),
    },
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
    headers: env.OPENCODE_API_KEY ? { Authorization: `Bearer ${env.OPENCODE_API_KEY}` } : {},
  });
  return res.ok;
}
