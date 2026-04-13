/**
 * useChatEngineBridge — Syncs engine.messages → tabStore terminal items.
 *
 * Extracted from ChatPage to reduce its size. Handles:
 * - Mapping engine message IDs to terminal item IDs via engineIdMapRef
 * - Replacing pre-thinking placeholders with real engine messages
 * - Removing items the engine filtered out
 * - Tracking previous engine messages for diffing
 */

import { useEffect, useRef, MutableRefObject } from 'react';
import type { ChatEngineMessage } from '../../hooks/engine/useChatEngine';
import { formatEngineMessage } from './chatToolFormatting';

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
  // Optimized: uses Map for O(1) prev lookups instead of O(n) find()
  useEffect(() => {
    if (!tabId) return;
    const prev = prevEngineMessagesRef.current;
    const curr = engineMessages;
    const idMap = engineIdMapRef.current;
    const currIds = new Set(curr.map(m => m.id));

    // Build prev lookup Map once — O(n) instead of O(n²) from prev.find()
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

    for (const msg of curr) {
      if (msg.type === 'completion') continue;
      const prevMsg = prevMap.get(msg.id);

      if (!prevMsg && !idMap.has(msg.id)) {
        // New message — replace pre-thinking placeholder if it exists
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
        // Changed message (reference changed) — update in tabStore
        const terminalId = idMap.get(msg.id) || msg.id;
        updateTerminalItemById(tabId, terminalId, formatEngineMessage(msg, unknownErrorLabel));
      }
    }

    prevEngineMessagesRef.current = curr;
  }, [engineMessages, tabId]);
}
