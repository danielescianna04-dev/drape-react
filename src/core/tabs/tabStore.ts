import { create } from 'zustand';

export type TabType = 'terminal' | 'file' | 'chat' | 'settings';

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
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  addTerminalItem: (tabId: string, item: any) => void;
}

export const useTabStore = create<TabStore>((set) => ({
  tabs: [
    {
      id: 'terminal-main',
      type: 'terminal',
      title: 'Terminal',
    }
  ],
  activeTabId: 'terminal-main',
  
  addTab: (tab) => set((state) => {
    // Check if tab already exists
    const exists = state.tabs.find(t => t.id === tab.id);
    if (exists) {
      return { activeTabId: tab.id };
    }
    return {
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    };
  }),
  
  removeTab: (id) => set((state) => {
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
}));
