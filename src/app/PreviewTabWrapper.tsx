import React from 'react';
import { useWorkstationStore } from '../core/terminal/workstationStore';
import { useUIStore } from '../core/terminal/uiStore';
import { useTabStore } from '../core/tabs/tabStore';
import { PreviewPanel } from '../features/terminal/components/PreviewPanel';
import { config } from '../config/config';

export const PreviewTabWrapper: React.FC = () => {
  const ws = useWorkstationStore((state) => state.currentWorkstation);
  const previewServerUrl = useUIStore((state) => state.previewServerUrl);
  const projectPreviewUrls = useUIStore((state) => state.projectPreviewUrls);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const tabs = useTabStore((state) => state.tabs);

  const isPreviewActive = React.useMemo(() => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    return activeTab?.type === 'preview';
  }, [activeTabId, tabs]);

  const previewUrl = (ws?.id ? projectPreviewUrls[ws.id] : null)
    || (previewServerUrl && ws?.id && previewServerUrl.includes(`/preview/${ws.id}`) ? previewServerUrl : '')
    || config.apiUrl
    || '';

  const handleClose = React.useCallback(() => {
    const { removeTab, setActiveTab, tabs } = useTabStore.getState();
    removeTab('preview');
    const chatTab = tabs.find((tab) => tab.type === 'chat');
    if (chatTab) {
      setActiveTab(chatTab.id);
    }
  }, []);

  return (
    <PreviewPanel
      onClose={handleClose}
      previewUrl={previewUrl}
      projectName="Project Preview"
      isVisible={isPreviewActive}
    />
  );
};
