/**
 * usePreviewNavigation — viewport mode, current preview URL tracking,
 * back/forward state, toolbar-facing state, reload banner, and
 * handler registration for PreviewPanel's toolbar.
 */
import { useState, useEffect, useRef } from 'react';
import { Animated, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { useAgentStore } from '../../../../core/agent/agentStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { tracciaAnteprimaAggiornata } from '../../../../core/services/analyticsService';
import { fileWatcherService } from '../../../../core/services/agentService';
import { ViewportMode } from '../../components/PreviewToolbar';
import { renderHeartbeat } from '../webview/renderHeartbeat';

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

  useEffect(() => {
    const currentGlobalUrl = useUIStore.getState().previewCurrentUrl;
    if (currentGlobalUrl !== session.currentPreviewUrl) {
      setPreviewCurrentUrl(session.currentPreviewUrl);
    }
  }, [session.currentPreviewUrl, setPreviewCurrentUrl]);

  useEffect(() => {
    const currentGlobalViewport = useUIStore.getState().previewViewportMode;
    if (currentGlobalViewport !== viewportMode) {
      setPreviewViewportMode(viewportMode);
    }
  }, [viewportMode, setPreviewViewportMode]);

  // ── Ref-stable handlers for toolbar ──────────────────────────

  const handleRefreshRef = useRef(() => {});
  const publishRef = useRef(publishOpenPublishModal);
  publishRef.current = publishOpenPublishModal;
  const setCurrentPreviewUrlRef = useRef(session.setCurrentPreviewUrl);
  setCurrentPreviewUrlRef.current = session.setCurrentPreviewUrl;
  // Track the latest preview URL via ref so the handler registered once
  // with the empty-deps useEffect below always opens the current URL
  // (otherwise we'd be stuck on the URL captured at registration time).
  const currentPreviewUrlRef = useRef(session.currentPreviewUrl);
  currentPreviewUrlRef.current = session.currentPreviewUrl;

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
      openInBrowser: async () => {
        const url = currentPreviewUrlRef.current;
        if (!url || !url.startsWith('http')) return;
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await WebBrowser.openBrowserAsync(url);
        } catch {}
      },
    });
    return () => setPreviewHandlers({ refresh: null, publish: null, setViewportMode: null, setUrl: null, goBack: null, goForward: null, openInBrowser: null });
  }, []);

  // ── HMR-aware reload reconciliation ──────────────────────────
  //
  // Core idea: a file change is "handled" if the preview WebView emitted a
  // DOM mutation (render_heartbeat) shortly after the change. If no
  // mutation arrived in the window, HMR couldn't apply the change and the
  // user needs to reload.
  //
  // Stack-agnostic: Next Fast Refresh, Vite HMR, Astro HMR, plain HTML
  // refresh — all of them end up mutating the DOM, which the heartbeat
  // catches.
  //
  // Tuning:
  //   RECONCILE_DELAY_MS — how long we wait for HMR to kick in before
  //     concluding it didn't. 3s is generous for most stacks; cold Next
  //     compilations can exceed this, in which case the banner appears
  //     for a split second before the next heartbeat hides it (handled
  //     by the post-heartbeat re-check effect below).
  //   HMR_SLOP_MS — forgive small clock drift; if the last render is
  //     within this window BEFORE the change, treat it as concurrent.
  const RECONCILE_DELAY_MS = 3000;
  const HMR_SLOP_MS = 500;

  const lastChangeAtRef = useRef(0);

  function reconcile() {
    const lastChange = lastChangeAtRef.current;
    if (!lastChange) return;
    const lastRender = renderHeartbeat.lastAt();
    // Mutation after the change (+ slop) means HMR handled it. Silent.
    if (lastRender >= lastChange - HMR_SLOP_MS) return;
    setShowReloadBanner(true);
  }

  function scheduleReconcile() {
    lastChangeAtRef.current = Date.now();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(reconcile, RECONCILE_DELAY_MS);
  }

  // File watcher → schedule a reconcile window. Ignore events while the
  // agent is streaming; we'll do one big reconcile when it finishes.
  useEffect(() => {
    const workstationId = currentWorkstation?.id;
    const username = currentWorkstation?.githubAccountUsername?.toLowerCase() || 'default';
    if (serverStatus === 'running' && workstationId && username) {
      fileWatcherService.connect(workstationId, username, () => {
        pendingChangesRef.current += 1;
        if (agentIsRunningRef.current) return;
        scheduleReconcile();
      });
    }
  }, [serverStatus, currentWorkstation?.id]);

  // Agent finished writing: if any files were touched, show the banner
  // UNCONDITIONALLY. The MutationObserver-based HMR check is too
  // sensitive (any DOM change — polling, user input, animations —
  // resets the timestamp) so trusting it to silence the banner hides
  // the banner even when the AI really did modify the page. For the
  // agent-finish path, the user deserves explicit acknowledgement
  // that changes are available — a quick tap to see the latest.
  useEffect(() => {
    const wasRunning = agentIsRunningRef.current;
    agentIsRunningRef.current = agentIsRunning;
    if (wasRunning && !agentIsRunning) {
      const agentTouchedFiles = agentFilesCreated.length + agentFilesModified.length;
      if (pendingChangesRef.current > 0 || agentTouchedFiles > 0) {
        pendingChangesRef.current = 0;
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
