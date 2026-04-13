import { config } from '../../config/config';
import { useChatStore } from '../../core/terminal/chatStore';
import { useTabStore, type Tab } from '../../core/tabs/tabStore';
import { getAuthHeaders } from '../../core/api/getAuthToken';
import { TerminalItemType, type WorkstationInfo } from '../../shared/types';

interface PersistChatSessionParams {
  currentTab?: Tab;
  userMessage: string;
  currentWorkstation?: WorkstationInfo | null;
  selectedModel: string;
  updateTab: (id: string, updates: Partial<Tab>) => void;
}

export const persistChatSessionOnSend = ({
  currentTab,
  userMessage,
  currentWorkstation,
  selectedModel,
  updateTab,
}: PersistChatSessionParams) => {
  if (currentTab?.type !== 'chat' || !currentTab.data?.chatId) {
    return;
  }

  const chatId = currentTab.data.chatId;
  const existingUserMessages =
    currentTab.terminalItems?.filter(
      (item) =>
        item.type === TerminalItemType.USER_MESSAGE || item.type === TerminalItemType.COMMAND,
    ) || [];
  const isFirstUserMessage = existingUserMessages.length === 0;

  if (!isFirstUserMessage) {
    useChatStore.getState().updateChatLastUsed(chatId);
    return;
  }

  const existingChat = useChatStore.getState().chatHistory.find((chat) => chat.id === chatId);

  let title = userMessage.slice(0, 40);
  const punctuationIndex = title.search(/[.!?]/);
  if (punctuationIndex > 10) {
    title = title.slice(0, punctuationIndex);
  }
  if (userMessage.length > 40) title += '...';

  const generateAITitle = async () => {
    try {
      const titleAuthHeaders = await getAuthHeaders();
      const response = await fetch(`${config.apiUrl}/ai/chat/generate-title`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...titleAuthHeaders },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!response.ok) return;

      const data = await response.json();
      if (data.title) {
        useChatStore.getState().updateChat(chatId, { title: data.title });
        updateTab(currentTab.id, { title: data.title });
      }
    } catch {
      // Fall back to the temporary title when generation fails.
    }
  };

  setTimeout(() => {
    void generateAITitle();
  }, 3000);

  if (existingChat) {
    const wasManuallyRenamed = existingChat.title !== 'Nuova Conversazione';
    const finalTitle = wasManuallyRenamed ? existingChat.title : title;

    useChatStore.getState().updateChat(chatId, {
      title: finalTitle,
      description: userMessage.slice(0, 100),
      lastUsed: new Date(),
      repositoryId: existingChat.repositoryId || currentWorkstation?.id,
      repositoryName: existingChat.repositoryName || currentWorkstation?.name,
    });

    if (!wasManuallyRenamed) {
      updateTab(currentTab.id, { title: finalTitle });
    }
    return;
  }

  useChatStore.getState().addChat({
    id: chatId,
    title,
    description: userMessage.slice(0, 100),
    createdAt: new Date(),
    lastUsed: new Date(),
    messages: [],
    aiModel: selectedModel,
    repositoryId: currentWorkstation?.id,
    repositoryName: currentWorkstation?.name,
  });
  updateTab(currentTab.id, { title });
};

export const persistChatMessagesSnapshot = (currentTab?: Tab) => {
  if (currentTab?.type !== 'chat' || !currentTab.data?.chatId) {
    return;
  }

  const chatId = currentTab.data.chatId;
  const existingChat = useChatStore.getState().chatHistory.find((chat) => chat.id === chatId);
  if (!existingChat) {
    return;
  }

  const freshTab = useTabStoreSnapshot(currentTab.id);
  const updatedMessages = freshTab?.terminalItems || [];

  useChatStore.getState().updateChat(chatId, {
    messages: updatedMessages,
    lastUsed: new Date(),
  });
};

const useTabStoreSnapshot = (tabId: string) =>
  useTabStore.getState().tabs.find((tab) => tab.id === tabId);
