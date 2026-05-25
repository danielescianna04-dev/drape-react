/**
 * useChatEngineBridge — Syncs engine.messages → tabStore terminal items.
 *
 * Extracted from ChatPage to reduce its size. Handles:
 * - Mapping engine message IDs to terminal item IDs via engineIdMapRef
 * - Replacing pre-thinking placeholders with real engine messages
 * - Removing items the engine filtered out
 * - Tracking previous engine messages for diffing
 *
 * Tool-call collapsing (Lovable-style):
 * Instead of rendering one terminal item per tool (N "Leggo X / Creo Y /
 * Bash Z" cards that look noisy), all tool_start/tool_complete/tool_error
 * messages are folded into a SINGLE long-lived "agent activity" card. The
 * card content is updated in place as new tools start. When the agent stops
 * (no more active tool events seen across renders), the card is removed.
 *
 * The card is encoded with the ACTIVITY_PREFIX sentinel so ChatMessageList
 * picks it up and renders AgentActivityCard (animated dot + shimmering
 * subtitle that rotates Italian status lines from STATUS_POOLS).
 */

import { useEffect, useRef, MutableRefObject } from 'react';
import type { ChatEngineMessage } from '../../hooks/engine/useChatEngine';
import { formatEngineMessage, encodeActivityCard, toolToPool } from './chatToolFormatting';
import { TerminalItemType } from '../../shared/types';

export interface UseChatEngineBridgeParams {
  tabId: string | undefined;
  engineMessages: ChatEngineMessage[];
  preThinkingIdRef: MutableRefObject<string | null>;
  engineIdMapRef: MutableRefObject<Map<string, string>>;
  prevEngineMessagesRef: MutableRefObject<ChatEngineMessage[]>;
  addTerminalItem: (item: Partial<import('../../shared/types').TerminalItem> & { id: string; content: string }) => void;
  removeTerminalItemById: (tabId: string, itemId: string) => void;
  updateTerminalItemById: (tabId: string, itemId: string, updates: Partial<import('../../shared/types').TerminalItem>) => void;
  unknownErrorLabel: string;
}

// Tool-event message types that get collapsed into the single activity card.
const TOOL_TYPES = new Set<ChatEngineMessage['type']>(['tool_start', 'tool_complete', 'tool_error']);

export function useChatEngineBridge({
  tabId,
  engineMessages,
  preThinkingIdRef,
  engineIdMapRef,
  prevEngineMessagesRef,
  addTerminalItem,
  removeTerminalItemById,
  updateTerminalItemById,
  unknownErrorLabel,
}: UseChatEngineBridgeParams): void {
  // Per-tab singleton: id of the collapsed agent activity card, if any.
  const agentCardIdRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!tabId) return;
    const prev = prevEngineMessagesRef.current;
    const curr = engineMessages;
    const idMap = engineIdMapRef.current;
    const currIds = new Set(curr.map(m => m.id));

    const prevMap = new Map<string, ChatEngineMessage>();
    for (const m of prev) prevMap.set(m.id, m);

    // Remove items that the engine filtered out (e.g. empty thinking placeholders)
    for (const prevMsg of prev) {
      if (!currIds.has(prevMsg.id)) {
        const terminalId = idMap.get(prevMsg.id);
        if (terminalId) {
          removeTerminalItemById(tabId, terminalId);
          idMap.delete(prevMsg.id);
        }
      }
    }

    // Walk the current messages and find:
    //   - the LAST tool_start (or tool_complete) to drive the activity card
    //   - whether there are any tools NOT yet completed (=> show running)
    //   - whether the agent has fully finished (=> remove the card)
    let lastToolMsg: ChatEngineMessage | null = null;
    let hasRunningTool = false;
    let hasFinalText = false;
    let isCompacting = false;
    for (const msg of curr) {
      if (TOOL_TYPES.has(msg.type)) {
        lastToolMsg = msg;
        if (msg.type === 'tool_start' || msg.isExecuting) hasRunningTool = true;
      }
      // A non-empty text message AFTER the tools means the model is now
      // streaming its visible reply — we should tear down the activity card.
      if (msg.type === 'text' && (msg.content || '').trim().length > 0) {
        hasFinalText = true;
      }
      if (msg.isCompacting) isCompacting = true;
    }

    // Drive the collapsed activity card:
    //   • If we have a tool event and no final text yet → create/update card.
    //   • If the model has started streaming its reply → remove the card.
    const existingCardId = agentCardIdRef.current.get(tabId);
    const shouldShowCard = !!lastToolMsg && !hasFinalText && !isCompacting;

    if (shouldShowCard && lastToolMsg) {
      const { poolKey, file } = toolToPool(lastToolMsg.tool ?? '', lastToolMsg.toolInput);
      const cardContent = encodeActivityCard(
        hasRunningTool ? 'running' : 'done',
        poolKey,
        file,
      );
      if (existingCardId) {
        updateTerminalItemById(tabId, existingCardId, { content: cardContent });
      } else {
        const cardId = `agent-card-${tabId}`;
        agentCardIdRef.current.set(tabId, cardId);
        // Replace the pre-thinking placeholder if one is pending so the user
        // sees a smooth transition from "Sto pensando" → activity card.
        if (preThinkingIdRef.current) {
          const preId = preThinkingIdRef.current;
          preThinkingIdRef.current = null;
          updateTerminalItemById(tabId, preId, {
            content: cardContent,
            type: TerminalItemType.OUTPUT,
            isThinking: false,
            thinkingContent: '',
          });
          agentCardIdRef.current.set(tabId, preId);
        } else {
          addTerminalItem({
            id: cardId,
            content: cardContent,
            type: TerminalItemType.OUTPUT,
            timestamp: new Date(),
          });
        }
      }
    } else if (!shouldShowCard && existingCardId) {
      // Agent has finished tooling: drop the card so the visible reply is
      // the only thing left.
      removeTerminalItemById(tabId, existingCardId);
      agentCardIdRef.current.delete(tabId);
    }

    for (const msg of curr) {
      if (msg.type === 'completion') continue;
      // Tool messages no longer create their own terminal items — they all
      // feed into the singleton agent card above.
      if (TOOL_TYPES.has(msg.type)) {
        // Make sure no stale items survive from a previous bridge build.
        if (idMap.has(msg.id)) {
          const stale = idMap.get(msg.id)!;
          removeTerminalItemById(tabId, stale);
          idMap.delete(msg.id);
        }
        continue;
      }

      const prevMsg = prevMap.get(msg.id);

      if (!prevMsg && !idMap.has(msg.id)) {
        // New text/thinking message — replace pre-thinking placeholder if
        // it still exists AND we didn't already consume it for the card.
        if (preThinkingIdRef.current) {
          const preId = preThinkingIdRef.current;
          idMap.set(msg.id, preId);
          preThinkingIdRef.current = null;
          updateTerminalItemById(tabId, preId, formatEngineMessage(msg, unknownErrorLabel));
        } else {
          idMap.set(msg.id, msg.id);
          addTerminalItem({ id: msg.id, ...formatEngineMessage(msg, unknownErrorLabel) });
        }
      } else if (prevMsg && prevMsg !== msg) {
        const terminalId = idMap.get(msg.id) || msg.id;
        updateTerminalItemById(tabId, terminalId, formatEngineMessage(msg, unknownErrorLabel));
      }
    }

    prevEngineMessagesRef.current = curr;
  }, [engineMessages, tabId]);
}
