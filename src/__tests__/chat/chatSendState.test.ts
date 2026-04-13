import { describe, expect, it } from 'vitest';
import { TerminalItemType } from '../../shared/types';
import {
  buildStreamingPlaceholder,
  canSendChatMessage,
  clearStreamingPlaceholderOnError,
} from '../../pages/Chat/chatSendState';

describe('chatSendState', () => {
  it('allows send with text or images when not loading', () => {
    expect(canSendChatMessage({ input: 'hello', imageCount: 0, isLoading: false })).toBe(true);
    expect(canSendChatMessage({ input: '   ', imageCount: 1, isLoading: false })).toBe(true);
    expect(canSendChatMessage({ input: '   ', imageCount: 0, isLoading: false })).toBe(false);
    expect(canSendChatMessage({ input: 'hello', imageCount: 0, isLoading: true })).toBe(false);
  });

  it('builds and clears streaming placeholders predictably', () => {
    const placeholder = buildStreamingPlaceholder('thinking-1');
    expect(placeholder.type).toBe(TerminalItemType.OUTPUT);
    expect(placeholder.isThinking).toBe(true);

    const tab = {
      id: 'tab-1',
      terminalItems: [
        placeholder,
        { id: 'real-1', content: 'done', type: TerminalItemType.OUTPUT, timestamp: new Date() },
      ],
    } as any;

    const nextTab = clearStreamingPlaceholderOnError({
      tab,
      streamingMessageId: 'thinking-1',
    });

    expect(nextTab.terminalItems).toHaveLength(1);
    expect(nextTab.terminalItems?.[0].id).toBe('real-1');
  });
});
