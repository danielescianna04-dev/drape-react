import { TerminalItemType, type TerminalItem } from '../../shared/types';

export interface ProcessedTerminalItem {
  item: TerminalItem;
  isOutputAfterTerminalCommand: boolean;
  isNextItemAI: boolean;
  outputItem?: TerminalItem;
  shouldShowLoading: boolean;
}

export const getProcessedTerminalItems = (
  terminalItems: TerminalItem[],
  options: {
    isLoading: boolean;
    agentStreaming: boolean;
    isCommand: (value: string) => boolean;
  },
): ProcessedTerminalItem[] => {
  if (terminalItems.length === 0) return [];

  const filtered = terminalItems.filter(
    (item) =>
      item &&
      item.content != null &&
      (item.content.trim() !== '' ||
        (item.isThinking && (options.isLoading || options.agentStreaming)) ||
        item.isAgentProgress) &&
      item.content !== '...' &&
      !item.content.startsWith('Executing: '),
  );

  return filtered
    .map((item, index, filteredArray) => {
      const prevItem = filteredArray[index - 1];
      const nextItem = filteredArray[index + 1];

      const isOutputAfterTerminalCommand =
        item.type === TerminalItemType.OUTPUT &&
        prevItem?.type === TerminalItemType.COMMAND &&
        (options.isCommand(prevItem.content || '') || prevItem.isDirectTerminal);

      const isNextItemAI =
        item.type !== TerminalItemType.USER_MESSAGE &&
        Boolean(nextItem) &&
        nextItem.type !== TerminalItemType.USER_MESSAGE;

      const outputItem =
        item.type === TerminalItemType.COMMAND &&
        (options.isCommand(item.content || '') || item.isDirectTerminal) &&
        nextItem?.type === TerminalItemType.OUTPUT
          ? nextItem
          : undefined;

      const isLastItem = index === filteredArray.length - 1;
      const shouldShowLoading = isLastItem && (options.isLoading || options.agentStreaming);

      return {
        item,
        isOutputAfterTerminalCommand,
        isNextItemAI,
        outputItem,
        shouldShowLoading,
      };
    })
    .filter((processed) => !processed.isOutputAfterTerminalCommand);
};
