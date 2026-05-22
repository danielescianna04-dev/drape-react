/**
 * Agent chat stream — v2 (Vercel AI SDK UI Message Stream protocol).
 *
 * Bridges the existing `OpencodeHttpService.chatStream` async generator to
 * the AI SDK v6 UI Message Stream protocol, so the React Native client can
 * drive the chat with `useChat` from `@ai-sdk/react`.
 *
 * Special-cases the opencode `question` tool: when the agent invokes it,
 * we emit `tool-input-available` and stop — the client renders the answer
 * UI and POSTs back to `/agent/v2/answer-question`.
 */
import { opencodeHttpService, type AgentEvent } from './opencode-http.service';
import type { AiSdkStreamHandle } from './ai-sdk-stream';
import { CLIENT_RESOLVED_TOOLS } from './ai-sdk-stream';

interface RunAgentChatStreamV2Params {
  projectId: string;
  userId: string;
  prompt: string;
  model?: string;
  systemContext?: string;
  stream: AiSdkStreamHandle;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export async function runAgentChatStreamV2({
  projectId,
  userId,
  prompt,
  model,
  systemContext,
  stream,
}: RunAgentChatStreamV2Params): Promise<void> {
  const messageId = newId('msg');
  let textBlockId: string | null = null;
  const knownTools = new Set<string>();

  const openTextBlock = () => {
    if (textBlockId) return;
    textBlockId = newId('txt');
    stream.writePart({ type: 'text-start', id: textBlockId });
  };
  const closeTextBlock = () => {
    if (!textBlockId) return;
    stream.writePart({ type: 'text-end', id: textBlockId });
    textBlockId = null;
  };

  stream.writePart({ type: 'start', messageId });
  stream.writePart({ type: 'start-step' });

  // We reuse projectId as the drape session id — opencodeHttpService memoizes
  // a mapping to its own opencode session, so consecutive turns on the same
  // project resume the same opencode session automatically.
  const drapeSessionId = `proj:${projectId}:user:${userId}`;

  try {
    for await (const ev of opencodeHttpService.chatStream({
      sessionId: drapeSessionId,
      message: prompt,
      model,
      systemContext,
    })) {
      if (stream.isClosed()) break;
      translate(ev);
    }
  } catch (err: any) {
    stream.writePart({ type: 'error', errorText: err?.message || 'opencode stream failed' });
  }

  closeTextBlock();
  stream.writePart({ type: 'finish-step' });
  stream.writePart({ type: 'finish' });
  stream.end();

  function translate(ev: AgentEvent) {
    switch (ev.type) {
      case 'token': {
        if (!ev.content) return;
        openTextBlock();
        stream.writePart({ type: 'text-delta', id: textBlockId!, delta: ev.content });
        return;
      }
      case 'tool_use': {
        closeTextBlock();
        const toolName = ev.name || 'unknown';
        const toolCallId = ev.id || newId('call');
        knownTools.add(toolCallId);
        stream.writePart({ type: 'tool-input-start', toolCallId, toolName });
        stream.writePart({
          type: 'tool-input-available',
          toolCallId,
          toolName,
          input: ev.input ?? {},
        });
        // For client-resolved tools (e.g. the opencode `question` tool) we
        // emit a side-channel data part carrying the opencode requestID so
        // the client can POST the answer. opencode's tool id IS the requestID
        // (que_xxx) for question parts — pass it through directly.
        if (CLIENT_RESOLVED_TOOLS.has(toolName)) {
          stream.writePart({
            type: 'data-question-meta',
            data: { toolCallId, requestID: ev.id, sessionID: drapeSessionId },
          });
        }
        return;
      }
      case 'tool_result': {
        const toolCallId = ev.id;
        if (!toolCallId) return;
        if (ev.error) {
          stream.writePart({ type: 'tool-output-error', toolCallId, errorText: String(ev.error) });
        } else {
          stream.writePart({ type: 'tool-output-available', toolCallId, output: ev.output ?? null });
        }
        return;
      }
      case 'message_end': {
        stream.writePart({
          type: 'data-usage',
          data: { messageId: ev.messageId, tokensIn: ev.tokensIn, tokensOut: ev.tokensOut },
        });
        return;
      }
      case 'error': {
        stream.writePart({ type: 'error', errorText: ev.message });
        return;
      }
      // 'message_start' and 'session_end' are handled implicitly by our
      // start/finish bookkeeping above — no extra protocol parts needed.
      default:
        return;
    }
  }
}
