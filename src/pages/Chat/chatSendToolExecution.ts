import { ToolService } from '../../core/ai/toolService';
import { TerminalItemType } from '../../shared/types';
import { sanitizeAgentText } from '../../shared/utils/sanitizeAgentText';
import { updateTabTerminalItem } from './chatTabStoreHelpers';
import { buildToolCommandText } from './chatSendUtils';

interface ExecuteDetectedToolCallsParams {
  projectId: string;
  streamedContent: string;
  currentTabId: string;
  streamingMessageId: string;
  addTerminalItem: (item: { id: string; content: string; type: TerminalItemType; timestamp: Date }) => void;
}

export const executeDetectedToolCalls = async ({
  projectId,
  streamedContent,
  currentTabId,
  streamingMessageId,
  addTerminalItem,
}: ExecuteDetectedToolCallsParams) => {
  const toolCalls = ToolService.detectToolCalls(streamedContent);
  if (toolCalls.length === 0) {
    return {
      finalContent: sanitizeAgentText(streamedContent),
      executed: false,
    };
  }

  const firstToolCallMatch = streamedContent.match(/(read_file|write_file|list_files|search_in_files)\s*\(/);
  const toolCallIndex = firstToolCallMatch ? streamedContent.indexOf(firstToolCallMatch[0]) : -1;

  let beforeToolCall = streamedContent;
  let afterToolCall = '';

  if (toolCallIndex !== -1) {
    beforeToolCall = streamedContent.substring(0, toolCallIndex).trim();
    const afterToolCallStart = streamedContent.substring(toolCallIndex);
    const toolCallEnd = afterToolCallStart.indexOf('\n');
    if (toolCallEnd !== -1) {
      afterToolCall = afterToolCallStart.substring(toolCallEnd + 1).trim();
    }
  }

  const cleanedContent = sanitizeAgentText(ToolService.removeToolCallsFromText(beforeToolCall));
  updateTabTerminalItem(currentTabId, streamingMessageId, { content: cleanedContent });

  for (const toolCall of toolCalls) {
    if (toolCall.tool === 'write_file' || toolCall.tool === 'edit_file') {
      const result = await ToolService.executeTool(projectId, toolCall);
      addTerminalItem({
        id: (Date.now() + Math.random()).toString(),
        content: result,
        type: TerminalItemType.OUTPUT,
        timestamp: new Date(),
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }

    addTerminalItem({
      id: (Date.now() + Math.random()).toString(),
      content: buildToolCommandText(toolCall.tool, toolCall.args),
      type: TerminalItemType.COMMAND,
      timestamp: new Date(),
    });

    await new Promise(resolve => setTimeout(resolve, 100));

    const result = await ToolService.executeTool(projectId, toolCall);
    addTerminalItem({
      id: (Date.now() + Math.random()).toString(),
      content: result,
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
    });

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const cleanedAfterToolCall = afterToolCall
    ? sanitizeAgentText(ToolService.removeToolCallsFromText(afterToolCall))
    : '';

  if (cleanedAfterToolCall.trim()) {
    addTerminalItem({
      id: (Date.now() + Math.random()).toString(),
      content: cleanedAfterToolCall,
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
    });
  }

  return {
    finalContent: cleanedAfterToolCall ? `${cleanedContent}\n${cleanedAfterToolCall}` : cleanedContent,
    executed: true,
  };
};

