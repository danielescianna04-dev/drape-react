import { describe, expect, it } from 'vitest';
import { TerminalItemType, type TerminalItem } from '../../shared/types';
import { buildAgentConversationHistory } from '../../pages/Chat/chatConversationHistory';
import { getProcessedTerminalItems } from '../../pages/Chat/chatTerminalItems';

const now = new Date('2026-01-01T00:00:00.000Z');

describe('chat helpers', () => {
  it('builds multimodal history while excluding tool-noise outputs', () => {
    const terminalItems: TerminalItem[] = [
      {
        id: '1',
        content: 'Hello',
        type: TerminalItemType.USER_MESSAGE,
        timestamp: now,
      },
      {
        id: '2',
        content: 'Read src/App.tsx',
        type: TerminalItemType.OUTPUT,
        timestamp: now,
      },
      {
        id: '3',
        content: '',
        type: TerminalItemType.USER_MESSAGE,
        timestamp: now,
        images: [{ uri: 'file://image.jpg', base64: 'abc123', type: 'image/jpeg' }],
      },
      {
        id: '4',
        content: 'Here is the answer',
        type: TerminalItemType.OUTPUT,
        timestamp: now,
      },
    ];

    expect(buildAgentConversationHistory(terminalItems)).toEqual([
      { role: 'user', content: 'Hello' },
      {
        role: 'user',
        content: '[Image attached]',
        images: [{ base64: 'abc123', type: 'image/jpeg' }],
      },
      { role: 'assistant', content: 'Here is the answer' },
    ]);
  });

  it('collapses command-output pairs for message rendering', () => {
    const terminalItems: TerminalItem[] = [
      {
        id: 'cmd',
        content: 'ls -la',
        type: TerminalItemType.COMMAND,
        timestamp: now,
      },
      {
        id: 'out',
        content: 'file-a\nfile-b',
        type: TerminalItemType.OUTPUT,
        timestamp: now,
      },
      {
        id: 'chat',
        content: 'Assistant reply',
        type: TerminalItemType.OUTPUT,
        timestamp: now,
      },
    ];

    const processed = getProcessedTerminalItems(terminalItems, {
      isLoading: false,
      agentStreaming: false,
      isCommand: (value) => value.startsWith('ls'),
    });

    expect(processed).toHaveLength(2);
    expect(processed[0].item.id).toBe('cmd');
    expect(processed[0].outputItem?.id).toBe('out');
    expect(processed[1].item.id).toBe('chat');
  });
});
