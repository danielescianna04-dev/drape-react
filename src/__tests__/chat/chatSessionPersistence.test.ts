import { beforeEach, describe, expect, it } from 'vitest';
import { persistChatMessagesSnapshotByTabId } from '../../pages/Chat/chatSessionPersistence';
import { useChatStore } from '../../core/terminal/chatStore';
import { useTabStore } from '../../core/tabs/tabStore';
import { TerminalItemType } from '../../shared/types';

describe('persistChatMessagesSnapshotByTabId', () => {
  beforeEach(() => {
    useChatStore.setState({
      chatHistory: [
        {
          id: 'chat-1',
          title: 'Test',
          createdAt: new Date(),
          lastUsed: new Date(0),
          messages: [],
          aiModel: 'gpt',
        },
      ],
    } as any);

    useTabStore.setState({
      tabs: [
        {
          id: 'tab-1',
          type: 'chat',
          title: 'Chat',
          data: { chatId: 'chat-1' },
          terminalItems: [
            {
              id: 'msg-1',
              content: 'hello',
              type: TerminalItemType.USER_MESSAGE,
              timestamp: new Date(),
            },
          ],
        },
      ],
      activeTabId: 'tab-1',
    } as any);
  });

  it('persists the latest tab snapshot using the tab id', () => {
    persistChatMessagesSnapshotByTabId('tab-1');

    const chat = useChatStore.getState().chatHistory.find((entry) => entry.id === 'chat-1');
    expect(chat?.messages).toHaveLength(1);
    expect(chat?.messages[0]?.id).toBe('msg-1');
  });

  it('ignores unknown tab ids safely', () => {
    persistChatMessagesSnapshotByTabId('missing');

    const chat = useChatStore.getState().chatHistory.find((entry) => entry.id === 'chat-1');
    expect(chat?.messages).toHaveLength(0);
  });
});
