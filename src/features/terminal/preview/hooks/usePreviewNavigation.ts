/**
 * usePreviewNavigation — viewport mode, current preview URL tracking,
 * back/forward state, toolbar-facing state, reload banner, and
 * handler registration for PreviewPanel's toolbar.
 */
import { useState, useEffect, useRef } from 'react';
import { Animated, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAgentStore } from '../../../../core/agent/agentStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { tracciaAnteprimaAggiornata } from '../../../../core/services/analyticsService';
import { fileWatcherService } from '../../../../core/services/agentService';
import { ViewportMode } from '../../components/PreviewToolbar';

import type { PreviewSessionReturn } from './usePreviewSession';

// ── Types ────────────────────────────────────────────────────

type ServerStatus = 'checking' | 'running' | 'stopped';

export interface PreviewNavigationParams {
  currentWorkstation: any;
  webViewRef: React.RefObject<WebView>;
  session: PreviewSessionReturn;
  serverStatus: ServerStatus;
  setPreviewCurrentUrl: (url: string) => void;
  setPreviewViewportMode: (mode: string) => void;
  setPreviewHandlers: (handlers: any) => void;
  publishOpenPublishModal: () => void;
  checkServerStatus: (urlOverride?: string, retryCount?: number) => Promise<void>;
}

export interface PreviewNavigationReturn {
  viewportMode: ViewportMode;
  setViewportMode: React.Dispatch<React.SetStateAction<ViewportMode>>;
  canGoBack: boolean;
  setCanGoBack: React.Dispatch<React.SetStateAction<boolean>>;
  canGoForward: boolean;
  setCanGoForward: React.Dispatch<React.SetStateAction<boolean>>;
  showReloadBanner: boolean;
  setShowReloadBanner: React.Dispatch<React.SetStateAction<boolean>>;
  handleRefresh: () => void;
  handleBannerReload: () => void;
}

export function usePreviewNavigation({
  currentWorkstation,
  webViewRef,
  session,
  serverStatus,
  setPreviewCurrentUrl,
  setPreviewViewportMode,
  setPreviewHandlers,
  publishOpenPublishModal,
  checkServerStatus,
}: PreviewNavigationParams): PreviewNavigationReturn {

  const [viewportMode, setViewportMode] = useState<ViewportMode>('mobile');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Reload banner
  const [showReloadBanner, setShowReloadBanner] = useState(false);
  const pendingChangesRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const agentIsRunning = useAgentStore((s) => s.isRunning);
  const agentFilesCreated = useAgentStore((s) => s.filesCreated);
  const agentFilesModified = useAgentStore((s) => s.filesModified);
  const agentIsRunningRef = useRef(false);

  // ── Sync to uiStore ──────────────────────────────────────────

  useEffect(() => { setPreviewCurrentUrl(session.currentPreviewUrl); }, [session.currentPreviewUrl]);
  useEffect(() => { setPreviewViewportMode(viewportMode); }, [viewportMode]);

  // ── Ref-stable handlers for toolbar ──────────────────────────

  const handleRefreshRef = useRef(() => {});
  const publishRef = useRef(publishOpenPublishModal);
  publishRef.current = publishOpenPublishModal;
  const setCurrentPreviewUrlRef = useRef(session.setCurrentPreviewUrl);
  setCurrentPreviewUrlRef.current = session.setCurrentPreviewUrl;

  const handleRefresh = () => {
    tracciaAnteprimaAggiornata();
    pendingChangesRef.current = 0;
    setShowReloadBanner(false);
    useAgentStore.getState().clearFileTracking();
    webViewRef.current?.clearCache(true);
    const baseUrl = session.currentPreviewUrl.split('?')[0];
    session.setCurrentPreviewUrl(`${baseUrl}?_t=${Date.now()}`);
    webViewRef.current?.reload();
    checkServerStatus();
  };
  handleRefreshRef.current = handleRefresh;

  const handleBannerReload = () => {
    pendingChangesRef.current = 0;
    setShowReloadBanner(false);
    useAgentStore.getState().clearFileTracking();
    handleRefresh();
  };

  // ── Register handlers ────────────────────────────────────────

  useEffect(() => {
    setPreviewHandlers({
      refresh: () => handleRefreshRef.current(),
      publish: () => publishRef.current(),
      setViewportMode: (mode: 'mobile' | 'desktop') => { setViewportMode(mode); },
      setUrl: (url: string) => setCurrentPreviewUrlRef.current(url),
      goBack: () => webViewRef.current?.goBack(),
      goForward: () => webViewRef.current?.goForward(),
    });
    return () => setPreviewHandlers({ refresh: null, publish: null, setViewportMode: null, setUrl: null, goBack: null, goForward: null });
  }, []);

  // ── Hot reload: file watcher ─────────────────────────────────

  useEffect(() => {
    const workstationId = currentWorkstation?.id;
    const username = currentWorkstation?.githubAccountUsername?.toLowerCase() || 'default';
    if (serverStatus === 'running' && workstationId && username) {
      fileWatcherService.connect(workstationId, username, (change) => {
        pendingChangesRef.current += 1;
        if (agentIsRunningRef.current) return;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
          if (pendingChangesRef.current > 0) setShowReloadBanner(true);
        }, 1000);
      });
    }
  }, [serverStatus, currentWorkstation?.id]);

  // ── Show reload banner when agent finishes ───────────────────

  useEffect(() => {
    const wasRunning = agentIsRunningRef.current;
    agentIsRunningRef.current = agentIsRunning;
    if (wasRunning && !agentIsRunning) {
      const agentTouchedFiles = agentFilesCreated.length + agentFilesModified.length;
      if (pendingChangesRef.current > 0 || agentTouchedFiles > 0) {
        setShowReloadBanner(true);
      }
    }
  }, [agentIsRunning, agentFilesCreated.length, agentFilesModified.length]);

  return {
    viewportMode,
    setViewportMode,
    canGoBack,
    setCanGoBack,
    canGoForward,
    setCanGoForward,
    showReloadBanner,
    setShowReloadBanner,
    handleRefresh,
    handleBannerReload,
  };
}
