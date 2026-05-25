import { getAuthToken } from '../../core/api/getAuthToken';
import type { WorkstationInfo, TerminalItem } from '../../shared/types';
import { TerminalItemType } from '../../shared/types';
import { sanitizeAgentText } from '../../shared/utils/sanitizeAgentText';
import { parseUndoData } from './chatUndo';
import { appendTabTerminalItems, updateTabTerminalItem } from './chatTabStoreHelpers';
import { buildAiChatRequestPayload } from './chatSendUtils';
import { formatToolResult, friendlyToolStatus, encodeActivityCard } from './chatToolFormatting';

interface StreamLegacyAiChatParams {
  apiUrl: string;
  userMessage: string;
  selectedModel: string;
  conversationHistory: string[];
  currentWorkstation: WorkstationInfo | null;
  rawUserId: string | null;
  thinkingLevel: string;
  activeTabId: string;
  initialStreamingMessageId: string;
  addTerminalItem: (item: Partial<TerminalItem> & { id: string; content: string }) => void;
  recordModification: (undoData: {
    filePath: string;
    originalContent?: string;
    newContent?: string;
  }, toolName: 'write_file' | 'edit_file') => void;
}

interface StreamLegacyAiChatResult {
  streamedContent: string;
  streamingMessageId: string;
}

export const streamLegacyAiChat = async ({
  apiUrl,
  userMessage,
  selectedModel,
  conversationHistory,
  currentWorkstation,
  rawUserId,
  thinkingLevel,
  activeTabId,
  initialStreamingMessageId,
  addTerminalItem,
  recordModification,
}: StreamLegacyAiChatParams): Promise<StreamLegacyAiChatResult> => {
  const chatAuthToken = await getAuthToken();
  let streamingMessageId = initialStreamingMessageId;
  let streamedContent = '';

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', `${apiUrl}/ai/chat`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (chatAuthToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${chatAuthToken}`);
    }
    // Code-gen prompts (landing pages, multi-file scaffolds) routinely take
     // 1-4 min through opencode: the LLM call itself is fast but opencode runs
     // an agentic loop with tool calls (write/bash/read) before the final
     // reply. The backend emits a heartbeat every 10s so this is an idle
     // timeout, not a wall-clock budget — 5 min covers the heaviest cases
     // we've seen empirically.
    xhr.timeout = 300000;

    let buffer = '';
    let thinkingContent = '';
    const thinkingStartTime = Date.now();
    const MIN_THINKING_TIME = 500;
    let hasShownFirstContent = false;

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(buffer.length);
      buffer = xhr.responseText;

      const lines = newData.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.substring(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.toolStart) {
            // Lovable-style single activity card: encode the friendly status
            // into the streaming message's content. ChatMessageList sees the
            // ACTIVITY_PREFIX sentinel and renders a card with title +
            // animated subtitle, instead of plain text. The card is
            // overwritten naturally when the model finally streams real text
            // (the parsed.text handler below replaces content).
            const { name, args } = parsed.toolStart;
            updateTabTerminalItem(activeTabId, streamingMessageId, {
              isThinking: false,
              content: encodeActivityCard('running', 'Lavoro in corso', friendlyToolStatus(name, args)),
            });
            continue;
          }

          if (parsed.toolResult) {
            const { name, args, result } = parsed.toolResult;
            // Track undo metadata for the "revert AI changes" affordance —
            // independent from how we render activity in the chat.
            const { undoData } = parseUndoData(result);
            if (undoData && undoData.__undo && undoData.filePath) {
              recordModification(undoData, name as 'write_file' | 'edit_file');
            }
            // No visible state change: the next toolStart will overwrite the
            // subtitle, or the model's text stream will replace the card
            // entirely with the final reply.
            continue;
          }

          if (parsed.toolResultsBatch) {
            const { toolResultsBatch } = parsed;
            updateTabTerminalItem(activeTabId, streamingMessageId, { isThinking: false });

            const formattedToolItems = toolResultsBatch.map((toolResult: { name: string; args: Record<string, unknown>; result: string }, index: number) => {
              const { name, args, result } = toolResult;
              const { cleanResult, undoData } = parseUndoData(result);

              if (undoData && undoData.__undo && undoData.filePath) {
                recordModification(undoData, name as 'write_file' | 'edit_file');
              }

              return {
                id: `tool-result-${Date.now()}-${name}-${index}`,
                type: TerminalItemType.OUTPUT,
                content: formatToolResult(name, args, cleanResult),
                timestamp: new Date(),
              };
            });

            appendTabTerminalItems(activeTabId, formattedToolItems);

            streamingMessageId = `stream-after-batch-${Date.now()}`;
            streamedContent = '';

            addTerminalItem({
              id: streamingMessageId,
              content: '',
              type: TerminalItemType.OUTPUT,
              timestamp: new Date(),
            });
            continue;
          }

          if (parsed.functionCall) {
            const { name } = parsed.functionCall;
            updateTabTerminalItem(activeTabId, streamingMessageId, { isThinking: false });

            addTerminalItem({
              id: `tool-${Date.now()}-${name}`,
              content: `Executing: ${name}`,
              type: TerminalItemType.OUTPUT,
              timestamp: new Date(),
            });

            streamingMessageId = `stream-after-tool-${Date.now()}`;
            streamedContent = '';

            addTerminalItem({
              id: streamingMessageId,
              content: '',
              type: TerminalItemType.OUTPUT,
              timestamp: new Date(),
            });
            continue;
          }

          if (parsed.type === 'thinking_start') {
            thinkingContent = '';
            updateTabTerminalItem(activeTabId, streamingMessageId, { isThinking: true, thinkingContent: '' });
            continue;
          }

          if (parsed.type === 'thinking' && parsed.text) {
            thinkingContent += parsed.text;
            updateTabTerminalItem(activeTabId, streamingMessageId, { isThinking: true, thinkingContent });
            continue;
          }

          if (parsed.type === 'thinking_end') {
            updateTabTerminalItem(activeTabId, streamingMessageId, { isThinking: false, thinkingContent });
            continue;
          }

          if (parsed.text) {
            streamedContent += parsed.text;

            const updateContent = () => {
              const cleanContent = sanitizeAgentText(streamedContent);
              updateTabTerminalItem(activeTabId, streamingMessageId, { content: cleanContent, isThinking: false });
            };

            if (!hasShownFirstContent) {
              hasShownFirstContent = true;
              const elapsed = Date.now() - thinkingStartTime;
              const remaining = MIN_THINKING_TIME - elapsed;

              if (remaining > 0) {
                setTimeout(updateContent, remaining);
              } else {
                updateContent();
              }
            } else {
              updateContent();
            }
          }
        } catch {
          // Skip invalid JSON chunks
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve();
      } else if (xhr.status === 429) {
        // Quota exceeded — monthly cap, surface backend message + retry-after
        // so the chat UI can offer the Plus upgrade flow / show days-until-reset.
        let body: any = {};
        try { body = JSON.parse(xhr.responseText); } catch {}
        const retrySec = body.retryAfterSec ?? 86400;
        const days = Math.ceil(retrySec / 86400);
        const human = days >= 2 ? `${days} giorni` : days === 1 ? '1 giorno' : 'poche ore';
        const message = body.message || `Hai esaurito il quota mensile. Rinnovo fra ${human}, oppure passa a Plus.`;
        const err = new Error(message) as Error & { code?: string; retryAfterSec?: number };
        err.code = 'quota_exceeded';
        err.retryAfterSec = retrySec;
        reject(err);
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Request timeout - AI non risponde'));

    xhr.send(JSON.stringify(
      buildAiChatRequestPayload(
        userMessage,
        selectedModel,
        conversationHistory,
        currentWorkstation,
        rawUserId,
        thinkingLevel,
      )
    ));
  });

  return {
    streamedContent,
    streamingMessageId,
  };
};
