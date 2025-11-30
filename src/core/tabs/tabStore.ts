import { create } from 'zustand';
import { useTerminalStore } from '../terminal/terminalStore';

export type TabType = 'terminal' | 'file' | 'chat' | 'settings' | 'github' | 'browser' | 'preview';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  data?: any;
  terminalItems?: any[];
  workstationId?: string;
  isLoading?: boolean;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;

  addTab: (tab: Tab) => void;
  removeTab: (id: string) => void;
  removeTabsByWorkstation: (workstationId: string) => void;
  resetTabs: () => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  addTerminalItem: (tabId: string, item: any) => void;
  clearTerminalItems: (tabId: string) => void;
  removeTerminalItemsByType: (tabId: string, type: string) => void;
  updateTerminalItemsByType: (tabId: string, oldType: string, updates: any) => void;
}

export const useTabStore = create<TabStore>((set) => ({
  tabs: [
    {
      id: 'chat-main',
      type: 'chat',
      title: 'Nuova Conversazione',
      data: { chatId: Date.now().toString() }
    }
  ],
  activeTabId: 'chat-main',
  
  addTab: (tab) => set((state) => {
    // Check if tab already exists
    const exists = state.tabs.find(t => t.id === tab.id);
    if (exists) {
      // Tab exists - update it with new data and set as active
      return {
        tabs: state.tabs.map(t => t.id === tab.id ? { ...t, ...tab } : t),
        activeTabId: tab.id
      };
    }
    return {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    };
  }),
  
  removeTab: (id) => set((state) => {
    const tabToRemove = state.tabs.find(t => t.id === id);

    // If removing a chat tab with no messages, delete it from chatHistory
    if (tabToRemove?.type === 'chat' && tabToRemove.data?.chatId) {
      const hasMessages = tabToRemove.terminalItems && tabToRemove.terminalItems.length > 0;
      if (!hasMessages) {
        // Delete empty chat from terminalStore
        useTerminalStore.getState().deleteChat(tabToRemove.data.chatId);
      }
    }

    const newTabs = state.tabs.filter(t => t.id !== id);
    let newActiveId = state.activeTabId;

    // If removing active tab, switch to another
    if (state.activeTabId === id && newTabs.length > 0) {
      const index = state.tabs.findIndex(t => t.id === id);
      newActiveId = newTabs[Math.max(0, index - 1)]?.id || newTabs[0]?.id;
    }

    return {
      tabs: newTabs,
      activeTabId: newTabs.length > 0 ? newActiveId : null,
    };
  }),

  removeTabsByWorkstation: (workstationId) => set((state) => {
    console.log('🗑️🗑️🗑️ [TabStore] === REMOVE TABS BY WORKSTATION ===');
    console.log('🗑️ [TabStore] workstationId:', workstationId);

    // Extract projectId if workstationId has ws- prefix
    const projectId = workstationId.startsWith('ws-')
      ? workstationId.substring(3)
      : workstationId;
    console.log('🗑️ [TabStore] projectId (extracted):', projectId);

    // Log all current tabs
    console.log('🗑️ [TabStore] ALL CURRENT TABS:');
    state.tabs.forEach(t => {
      console.log(`   - id: "${t.id}", type: "${t.type}", wsId: "${t.workstationId}", items: ${t.terminalItems?.length || 0}`);
    });

    // Find all tabs to remove (by workstationId, projectId, or by id containing either)
    const tabsToRemove = state.tabs.filter(t =>
      t.workstationId === workstationId ||
      t.workstationId === projectId ||
      t.data?.projectId === workstationId ||
      t.data?.projectId === projectId ||
      t.id.includes(workstationId) ||
      t.id.includes(projectId) ||
      t.id.includes(`ws-${projectId}`)
    );

    console.log('🗑️ [TabStore] TABS TO REMOVE:', tabsToRemove.length);
    tabsToRemove.forEach(t => {
      console.log(`   - id: "${t.id}", type: "${t.type}", items: ${t.terminalItems?.length || 0}`);
    });

    // Only delete EMPTY chats from terminalStore (preserve chats with messages)
    tabsToRemove.forEach(tab => {
      if (tab.type === 'chat' && tab.data?.chatId) {
        // Check if chat has messages in chatHistory (not just in tab.terminalItems)
        const chatInHistory = useTerminalStore.getState().chatHistory.find(c => c.id === tab.data.chatId);
        const hasMessagesInHistory = chatInHistory?.messages && chatInHistory.messages.length > 0;
        const hasMessagesInTab = tab.terminalItems && tab.terminalItems.length > 0;

        if (!hasMessagesInHistory && !hasMessagesInTab) {
          // Only delete truly empty chats
          console.log('🗑️ [TabStore] Deleting empty chat:', tab.data.chatId);
          useTerminalStore.getState().deleteChat(tab.data.chatId);
        } else {
          console.log('✅ [TabStore] Preserving chat with messages:', tab.data.chatId);
        }
      }
    });

    const newTabs = state.tabs.filter(t =>
      t.workstationId !== workstationId &&
      t.workstationId !== projectId &&
      t.data?.projectId !== workstationId &&
      t.data?.projectId !== projectId &&
      !t.id.includes(workstationId) &&
      !t.id.includes(projectId) &&
      !t.id.includes(`ws-${projectId}`)
    );

    console.log('🗑️ Removed', tabsToRemove.length, 'tabs, remaining:', newTabs.length);

    // If active tab was removed, switch to the first remaining tab
    let newActiveId = state.activeTabId;
    if (tabsToRemove.some(t => t.id === state.activeTabId)) {
      newActiveId = newTabs[0]?.id || null;
    }

    return {
      tabs: newTabs,
      activeTabId: newActiveId,
    };
  }),

  resetTabs: () => {
    console.log('🗑️🗑️🗑️ [TabStore] === RESET TABS TO DEFAULT ===');
    set({
      tabs: [
        {
          id: 'chat-main',
          type: 'chat',
          title: 'Nuova Conversazione',
          data: { chatId: Date.now().toString() },
          terminalItems: []
        }
      ],
      activeTabId: 'chat-main',
    });
    console.log('🗑️ [TabStore] Tabs reset complete - only chat-main remains');
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, updates) => set((state) => ({
    tabs: state.tabs.map(t => t.id === id ? { ...t, ...updates } : t),
  })),

  addTerminalItem: (tabId, item) => {
    console.log('🔵 Store addTerminalItem called:', { tabId, itemType: item?.type, itemContent: item?.content?.substring(0, 50) });
    set((state) => {
      const tab = state.tabs.find(t => t.id === tabId);
      const currentItems = tab?.terminalItems || [];
      console.log('🔵 Current items count:', currentItems.length, '→ New count:', currentItems.length + 1);
      return {
        tabs: state.tabs.map(t =>
          t.id === tabId
            ? { ...t, terminalItems: [...(t.terminalItems || []), item] }
            : t
        ),
      };
    });
  },

  clearTerminalItems: (tabId) => {
    console.log('🔵 Clearing terminal items for tab:', tabId);
    set((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? { ...t, terminalItems: [] }
          : t
      ),
    }));
  },

  removeTerminalItemsByType: (tabId, type) => {
    console.log('🔵 Removing terminal items of type:', type, 'from tab:', tabId);
    set((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? { ...t, terminalItems: (t.terminalItems || []).filter(item => item.type !== type) }
          : t
      ),
    }));
  },

  updateTerminalItemsByType: (tabId, oldType, updates) => {
    console.log('🔵 Updating terminal items of type:', oldType, 'in tab:', tabId);
    set((state) => ({
      tabs: state.tabs.map(t =>
        t.id === tabId
          ? {
              ...t,
              terminalItems: (t.terminalItems || []).map(item =>
                item.type === oldType ? { ...item, ...updates } : item
              )
            }
          : t
      ),
    }));
  },
}));
