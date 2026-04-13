import { useTabStore } from '../../core/tabs/tabStore';
import type { TerminalItem } from '../../shared/types';

export const mapTabTerminalItems = (
  tabId: string,
  mapper: (item: TerminalItem) => TerminalItem,
) => {
  useTabStore.setState((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            terminalItems: tab.terminalItems?.map(mapper) || [],
          }
        : tab,
    ),
  }));
};

export const updateTabTerminalItem = (
  tabId: string,
  itemId: string,
  patch: Partial<TerminalItem>,
) => {
  mapTabTerminalItems(tabId, (item) =>
    item.id === itemId ? { ...item, ...patch } : item,
  );
};

export const appendTabTerminalItems = (
  tabId: string,
  items: TerminalItem[],
) => {
  useTabStore.setState((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            terminalItems: [...(tab.terminalItems || []), ...items],
          }
        : tab,
    ),
  }));
};

export const clearInterruptedThinkingItems = (tabId: string) => {
  useTabStore.setState((state) => ({
    tabs: state.tabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            terminalItems:
              tab.terminalItems
                ?.map((item) =>
                  item.isThinking
                    ? { ...item, isThinking: false, content: item.content || '(Interrotto)' }
                    : item,
                )
                .filter(
                  (item) => item.content !== '' && item.content !== '(Interrotto)',
                ) || [],
          }
        : tab,
    ),
  }));
};
