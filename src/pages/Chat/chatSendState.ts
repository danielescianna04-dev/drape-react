import { TerminalItemType, type TerminalItem } from '../../shared/types';
import type { Tab } from '../../core/tabs/tabStore';

export const canSendChatMessage = ({
  input,
  imageCount,
  isLoading,
}: {
  input: string;
  imageCount: number;
  isLoading: boolean;
}) => {
  if (isLoading) return false;
  return input.trim().length > 0 || imageCount > 0;
};

export const buildStreamingPlaceholder = (id: string): Partial<TerminalItem> & { id: string; content: string } => ({
  id,
  content: '',
  type: TerminalItemType.OUTPUT,
  timestamp: new Date(),
  isThinking: true,
});

export const clearStreamingPlaceholderOnError = ({
  tab,
  streamingMessageId,
}: {
  tab: Tab;
  streamingMessageId: string;
}): Tab => ({
  ...tab,
  terminalItems: tab.terminalItems
    ?.map((item) =>
      item.id === streamingMessageId
        ? { ...item, isThinking: false, content: '' }
        : item,
    )
    .filter((item) => item.content !== '' || item.isThinking),
});
