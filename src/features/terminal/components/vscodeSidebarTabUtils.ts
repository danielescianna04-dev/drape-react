import type { Tab } from '../../../core/tabs/tabStore';

interface OpenOrCreateTabParams {
  tabs: Tab[];
  setActiveTab: (tabId: string) => void;
  addTab: (tab: Tab) => void;
  id: string;
  type: Tab['type'];
  title: string;
  data?: Tab['data'];
}

export const openOrCreateSidebarTab = ({
  tabs,
  setActiveTab,
  addTab,
  id,
  type,
  title,
  data = {},
}: OpenOrCreateTabParams) => {
  const existing = tabs.find(tab => tab.id === id);
  if (existing) {
    setActiveTab(id);
    return;
  }

  addTab({
    id,
    type,
    title,
    data,
  } as Tab);
};

export const getSidebarPreviewPath = (
  previewCurrentUrl: string | null | undefined,
  lastKnownPath = '/',
) => {
  try {
    const url = new URL(previewCurrentUrl ?? '');
    const match = url.pathname.match(/^\/preview\/[^/]+(\/.*)?$/);
    const path = match?.[1] || '/';
    return path !== '/' ? path : lastKnownPath;
  } catch {
    return lastKnownPath;
  }
};
