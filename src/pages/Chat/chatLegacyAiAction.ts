import apiClient from '../../core/api/apiClient';
import { useFileHistoryStore } from '../../core/history/fileHistoryStore';
import { useWorkstationStore } from '../../core/terminal/workstationStore';
import { TerminalItemType, TerminalItem } from '../../shared/types';
import { sanitizeAgentText } from '../../shared/utils/sanitizeAgentText';
import type { WorkstationInfo } from '../../shared/types';
import { executeDetectedToolCalls } from './chatSendToolExecution';
import { streamLegacyAiChat } from './chatStreamingRequest';

export const runLegacyAiSend = async ({
  apiUrl,
  userMessage,
  selectedModel,
  conversationHistory,
  currentWorkstation,
  thinkingLevel,
  activeTabId,
  streamingMessageId,
  addTerminalItem,
  setLoading,
  setConversationHistory,
  isProcessingToolsRef,
}: {
  apiUrl: string;
  userMessage: string;
  selectedModel: string;
  conversationHistory: string[];
  currentWorkstation: WorkstationInfo | null;
  thinkingLevel: string;
  activeTabId: string;
  streamingMessageId: string;
  addTerminalItem: (item: Partial<TerminalItem> & { id: string; content: string }) => void;
  setLoading: (loading: boolean) => void;
  setConversationHistory: (value: string[]) => void;
  isProcessingToolsRef: React.MutableRefObject<boolean>;
}) => {
  let finalStreamingMessageId = streamingMessageId;
  let streamedContent = '';

  const streamingResult = await streamLegacyAiChat({
    apiUrl,
    userMessage,
    selectedModel,
    conversationHistory,
    currentWorkstation,
    rawUserId: useWorkstationStore.getState().userId || null,
    thinkingLevel,
    activeTabId,
    initialStreamingMessageId: streamingMessageId,
    addTerminalItem,
    recordModification: (undoData, toolName) => {
      if (!currentWorkstation?.id) return;
      useFileHistoryStore.getState().recordModification({
        projectId: currentWorkstation.id,
        filePath: undoData.filePath,
        originalContent: undoData.originalContent || '',
        newContent: undoData.newContent,
        toolName,
        description: `AI: ${toolName === 'write_file' ? 'Created' : 'Modified'} ${undoData.filePath}`,
      });
    },
  });

  streamedContent = streamingResult.streamedContent;
  finalStreamingMessageId = streamingResult.streamingMessageId;

  if ((currentWorkstation?.projectId || currentWorkstation?.id) && !isProcessingToolsRef.current) {
    const projectId = currentWorkstation.projectId || currentWorkstation.id;
    isProcessingToolsRef.current = true;
    try {
      const toolExecution = await executeDetectedToolCalls({
        projectId,
        streamedContent,
        currentTabId: activeTabId,
        streamingMessageId: finalStreamingMessageId,
        addTerminalItem: (item) => addTerminalItem(item),
      });
      streamedContent = toolExecution.finalContent;
    } finally {
      isProcessingToolsRef.current = false;
    }
  }

  setConversationHistory([...conversationHistory, userMessage, sanitizeAgentText(streamedContent)]);
  setLoading(false);

  return {
    streamedContent,
    streamingMessageId: finalStreamingMessageId,
  };
};
