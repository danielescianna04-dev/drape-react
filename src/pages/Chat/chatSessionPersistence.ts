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
        (item.type === TerminalItemType.USER_MESSAGE || item.type === TerminalItemType.COMMAND) &&
        // The auto-create-project flow mounts a temp user bubble with this
        // sentinel id BEFORE handleSend runs — counting it makes
        // isFirstUserMessage flip false on the very first turn, which
        // skipped the addChat branch and left the conversation invisible
        // to every later persistMessages call.
        !item.id?.startsWith('temp-auto-create-'),
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

  console.log('[PersistDebug] addChat', { chatId, repositoryId: currentWorkstation?.id, repositoryName: currentWorkstation?.name, title });
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
  persistChatMessagesSnapshotByTabId(currentTab?.id);
};

export const persistChatMessagesSnapshotByTabId = (tabId?: string) => {
  if (!tabId) {
    return;
  }

  const freshTab = useTabStoreSnapshot(tabId);
  if (freshTab?.type !== 'chat' || !freshTab.data?.chatId) {
    return;
  }

  const chatId = freshTab.data.chatId;
  const updatedMessages = freshTab?.terminalItems || [];
  const existingChat = useChatStore.getState().chatHistory.find((chat) => chat.id === chatId);

  // Never overwrite a chat that already has messages with an empty
  // snapshot. This happens during workstation switch / app start when
  // the tab mounts empty before hydration drops the saved messages in.
  // Without this guard, the "save outgoing before swap" effect wipes
  // the very chat we're about to hydrate.
  if (existingChat && updatedMessages.length === 0 && (existingChat.messages?.length ?? 0) > 0) {
    return;
  }

  if (!existingChat) {
    // Lazy-create the chat record so we never silently drop a finished
    // conversation just because persistChatSessionOnSend didn't run /
    // bailed for any reason. Look up the workstation id from the global
    // store; if there's none, fall back to anonymous (the hydration
    // effect can still match by chatId on tab.data).
    const ws = require('../../core/workstation/workstationStore').useWorkstationStore.getState().currentWorkstation;
    const firstUserMsg = (updatedMessages.find((m: any) => m.type === 'user_message' || m.type === 'USER_MESSAGE') as any);
    const title = (firstUserMsg?.content || 'Chat').slice(0, 60);
    console.log('[PersistDebug] lazy addChat on snapshot', { chatId, repositoryId: ws?.id, msgs: updatedMessages.length });
    useChatStore.getState().addChat({
      id: chatId,
      title,
      description: title,
      createdAt: new Date(),
      lastUsed: new Date(),
      messages: updatedMessages,
      aiModel: 'unknown',
      repositoryId: ws?.id,
      repositoryName: ws?.name,
    });
    return;
  }

  console.log('[PersistDebug] updateChat snapshot', { chatId, msgs: updatedMessages.length });
  useChatStore.getState().updateChat(chatId, {
    messages: updatedMessages,
    lastUsed: new Date(),
  });
};

const useTabStoreSnapshot = (tabId: string) =>
  useTabStore.getState().tabs.find((tab) => tab.id === tabId);
