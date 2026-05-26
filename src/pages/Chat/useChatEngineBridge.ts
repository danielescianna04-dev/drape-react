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

    // Walk the current messages. Lovable-style: ONE long-lived activity card
    // that appears as soon as the agent starts and STAYS visible alongside
    // any text the model streams (preamble, final reply, anything in between).
    //   - Last tool event drives the card's subtitle/poolKey while running.
    //   - When no tool is running AND no more tool events are expected, the
    //     card flips to 'done' but remains on screen as the completion marker.
    //   - Card is dropped only on compaction (full conversation rebuild).
    let lastToolMsg: ChatEngineMessage | null = null;
    let hasRunningTool = false;
    let isCompacting = false;
    for (const msg of curr) {
      if (TOOL_TYPES.has(msg.type)) {
        lastToolMsg = msg;
        if (msg.type === 'tool_start' || msg.isExecuting) hasRunningTool = true;
      }
      if (msg.isCompacting) isCompacting = true;
    }

    const existingCardId = agentCardIdRef.current.get(tabId);
    // Show the activity card only when the agent actually does work
    // (≥1 tool call). For plain chat exchanges — "ciao", "grazie", a single
    // question with no filesystem change — the model just replies text and
    // the card would be visual noise ("Lavoro completato" for nothing).
    const shouldShowCard = !!lastToolMsg && !isCompacting;

    if (shouldShowCard) {
      const { poolKey, file } = lastToolMsg
        ? toolToPool(lastToolMsg.tool ?? '', lastToolMsg.toolInput)
        : { poolKey: 'subagent' as const, file: '' };
      // Always encode 'running' from the bridge — the gap between two
      // tool calls is NOT "done", and ChatMessageList already flips the
      // card to 'done' once agentStreaming goes false (= stream truly
      // finished). Without this the card showed "Fatto! / Avvia preview"
      // mid-task whenever no tool was actively executing.
      const cardContent = encodeActivityCard('running', poolKey, file);
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

    // Lovable parity: only the FINAL assistant text becomes a visible bubble.
    // Intermediate text messages (the model thinking out loud between tool
    // calls — "Devo installare uno alla volta…", "Ora creo il footer…") get
    // suppressed and live only inside the activity card's rotating subtitle.
    // We treat a text message as "final" if (a) it's the last text in the
    // stream AND (b) no tool is currently running — i.e. the agent has
    // stopped tooling and is just streaming its closing line.
    let lastTextMsgId: string | null = null;
    for (let i = curr.length - 1; i >= 0; i--) {
      if (curr[i].type === 'text') { lastTextMsgId = curr[i].id; break; }
    }
    const allowText = !hasRunningTool;

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

      // While the activity card is up, suppress every non-tool engine
      // message — text preambles, "thinking" placeholders the engine
      // synthesises between tool turns, etc. The card's rotating subtitle
      // is the only progress surface the user should see. The single
      // exception is the FINAL text bubble: visible once no tool is
      // running and it's the last text in the stream.
      const isFinalText = msg.type === 'text' && msg.id === lastTextMsgId && allowText;
      if (shouldShowCard && !isFinalText) {
        if (idMap.has(msg.id)) {
          removeTerminalItemById(tabId, idMap.get(msg.id)!);
          idMap.delete(msg.id);
        }
        continue;
      }
      // No card scenario (plain chat exchange) — also suppress
      // intermediate text so only the final reply lands as a bubble.
      if (msg.type === 'text' && (msg.id !== lastTextMsgId || !allowText)) {
        if (idMap.has(msg.id)) {
          removeTerminalItemById(tabId, idMap.get(msg.id)!);
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
