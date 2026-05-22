/**
 * Vercel AI SDK v6 UI Message Stream protocol helpers.
 *
 * The protocol is plain SSE: each event is `data: <json>\n\n`, terminated by
 * `data: [DONE]\n\n`. The response must carry the
 * `x-vercel-ai-ui-message-stream: v1` header so clients identify the format.
 *
 * See https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol — keep the part shapes
 * in sync with the SDK version installed in package.json.
 */
import type { Response } from 'express';

export type AiSdkPart =
  | { type: 'start'; messageId: string }
  | { type: 'start-step' }
  | { type: 'finish-step' }
  | { type: 'text-start'; id: string }
  | { type: 'text-delta'; id: string; delta: string }
  | { type: 'text-end'; id: string }
  | { type: 'tool-input-start'; toolCallId: string; toolName: string }
  | { type: 'tool-input-delta'; toolCallId: string; inputTextDelta: string }
  | { type: 'tool-input-available'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-output-available'; toolCallId: string; output: unknown }
  | { type: 'tool-output-error'; toolCallId: string; errorText: string }
  | { type: `data-${string}`; data: unknown }
  | { type: 'finish' }
  | { type: 'error'; errorText: string }
  | { type: 'abort'; reason: string };

export interface AiSdkStreamHandle {
  writePart: (part: AiSdkPart) => void;
  end: () => void;
  isClosed: () => boolean;
}

export function startAiSdkStream(res: Response, onClose?: () => void): AiSdkStreamHandle {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('x-vercel-ai-ui-message-stream', 'v1');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };

  res.on('close', close);

  return {
    writePart: (part) => {
      if (closed) return;
      try {
        res.write(`data: ${JSON.stringify(part)}\n\n`);
      } catch {
        close();
      }
    },
    end: () => {
      if (closed) return;
      try {
        res.write(`data: [DONE]\n\n`);
        res.end();
      } catch {
        // ignore
      }
      close();
    },
    isClosed: () => closed,
  };
}

/** Tool names the agent is allowed to call but whose result is provided by the
 *  client (human-in-the-loop). For these, we emit tool-input-available and stop —
 *  the client will respond via addToolOutput which arrives as the next request. */
export const CLIENT_RESOLVED_TOOLS = new Set(['user_question']);
