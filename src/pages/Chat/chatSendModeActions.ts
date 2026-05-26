import apiClient from '../../core/api/apiClient';
import { useAgentStore } from '../../core/agent/agentStore';
import { TerminalItemType, TerminalItem } from '../../shared/types';
import type { WorkstationInfo } from '../../shared/types';
import type { Tab } from '../../core/tabs/tabStore';
import type { ChatHistoryItem } from './chatConversationHistory';

interface SharedAddTerminalItem {
  addTerminalItem: (item: Partial<TerminalItem> & { id: string; content: string }) => void;
}

export const startAgentModeSend = ({
  userMessage,
  currentWorkstation,
  currentTab,
  cleanImagesForStore,
  cleanImagesForAgent,
  selectedModel,
  thinkingLevel,
  agentConversationHistory,
  addTerminalItem,
  setInput,
  setSelectedInputImages,
  setLoading,
  setNearBottomState,
  scrollToBottom,
  startAgent,
  preThinkingIdRef,
  reuseExistingThinkingId,
  skipUserBubble,
}: {
  userMessage: string;
  currentWorkstation: WorkstationInfo;
  currentTab: Tab | undefined;
  cleanImagesForStore: { uri: string; type?: string }[];
  cleanImagesForAgent: { base64: string; type: string }[];
  selectedModel: string;
  thinkingLevel: string;
  agentConversationHistory: ChatHistoryItem[];
  setInput: (v: string) => void;
  setSelectedInputImages: React.Dispatch<React.SetStateAction<{ uri: string; base64?: string; type?: string }[]>>;
  setLoading: (loading: boolean) => void;
  setNearBottomState: (v: boolean) => void;
  scrollToBottom: (animated: boolean) => void;
  startAgent: (prompt: string, projectId: string, model: string, history: ChatHistoryItem[], images?: { base64: string; type: string }[], thinkingLevel?: string) => void;
  preThinkingIdRef: React.MutableRefObject<string | null>;
  /** Already-mounted thinking placeholder (e.g. from the auto-create-project
   * flow). When set, we adopt it as the engine bridge's preId instead of
   * adding a fresh one — so the spinner the user is already watching
   * becomes the real streaming placeholder with no flash. */
  reuseExistingThinkingId?: string;
  /** Skip mounting the user message bubble — the caller already rendered
   * one (e.g. handleSendWithAutoProject did). */
  skipUserBubble?: boolean;
} & SharedAddTerminalItem) => {
  if (!skipUserBubble) {
    addTerminalItem({
      id: Date.now().toString(),
      content: userMessage,
      type: TerminalItemType.USER_MESSAGE,
      timestamp: new Date(),
      images: cleanImagesForStore,
    });
  }

  if (reuseExistingThinkingId) {
    preThinkingIdRef.current = reuseExistingThinkingId;
  } else {
    const preId = `pre-thinking-${Date.now()}`;
    preThinkingIdRef.current = preId;
    addTerminalItem({
      id: preId,
      content: '',
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
      isThinking: true,
      thinkingContent: '',
    });
  }

  setInput('');
  setSelectedInputImages([]);
  setLoading(true);
  setNearBottomState(true);
  setTimeout(() => scrollToBottom(true), 50);

  const agentState = useAgentStore.getState();
  agentState.setCurrentPrompt(userMessage);
  agentState.setCurrentProjectId(currentWorkstation.id);

  startAgent(
    userMessage,
    currentWorkstation.id,
    selectedModel,
    agentConversationHistory,
    cleanImagesForAgent,
    thinkingLevel,
  );

  setLoading(false);
};

export const executeTerminalModeCommand = async ({
  apiUrl,
  currentWorkstation,
  userMessage,
  t,
  addTerminalItem,
  setInput,
  setSelectedInputImages,
  setLoading,
  setNearBottomState,
  scrollToBottom,
}: {
  apiUrl: string;
  currentWorkstation: WorkstationInfo;
  userMessage: string;
  t: (key: string, opts?: Record<string, unknown>) => string;
  setInput: (v: string) => void;
  setSelectedInputImages: React.Dispatch<React.SetStateAction<{ uri: string; base64?: string; type?: string }[]>>;
  setLoading: (loading: boolean) => void;
  setNearBottomState: (v: boolean) => void;
  scrollToBottom: (animated: boolean) => void;
} & SharedAddTerminalItem) => {
  addTerminalItem({
    id: Date.now().toString(),
    content: userMessage,
    type: TerminalItemType.COMMAND,
    isDirectTerminal: true,
    timestamp: new Date(),
  });

  setInput('');
  setSelectedInputImages([]);
  setLoading(true);

  try {
    const response = await apiClient.post(`${apiUrl}/workstation/execute-command`, {
      projectId: currentWorkstation.id,
      command: userMessage,
    });

    const stdout = response.data.stdout || '';
    const stderr = response.data.stderr || '';
    const output = (stdout + (stderr ? `\n${stderr}` : '')).trim() || '(nessun output)';

    addTerminalItem({
      id: (Date.now() + 1).toString(),
      content: output,
      type: TerminalItemType.OUTPUT,
      isDirectTerminal: true,
      timestamp: new Date(),
    });
  } catch (err: unknown) {
    addTerminalItem({
      id: (Date.now() + 1).toString(),
      content: `${t('common:error')}: ${err instanceof Error ? err.message : t('terminal:tools.failed')}`,
      isDirectTerminal: true,
      type: TerminalItemType.OUTPUT,
      timestamp: new Date(),
    });
  } finally {
    setLoading(false);
  }

  setNearBottomState(true);
  setTimeout(() => scrollToBottom(true), 100);
  setTimeout(() => scrollToBottom(true), 350);
};
