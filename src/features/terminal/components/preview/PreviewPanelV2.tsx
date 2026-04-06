/**
 * PreviewPanelV2 — Clean rewrite of the preview system.
 *
 * State machine: stopped → starting → running → [checking → fixing]* → ready
 * User NEVER sees an error screen. All errors are auto-fixed in background.
 *
 * Delegates to:
 * - usePreviewServer: server lifecycle
 * - usePreviewAutoFix: AI auto-fix engine
 * - usePreviewChat: AI chat integration (existing)
 * - usePreviewPublish: publish system (existing)
 * - PreviewWebView: WebView rendering (existing)
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import WebView from 'react-native-webview';

import { useWorkstationStore } from '../../../../core/terminal/workstationStore';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { useSidebarOffset } from '../../context/SidebarContext';
import { usePreviewAutoFix } from '../../../../hooks/preview/usePreviewAutoFix';
import { usePreviewPublish } from '../../hooks/usePreviewPublish';
import { usePreviewChat } from '../../hooks/usePreviewChat';
import { usePreviewStartup } from '../../hooks/usePreviewStartup';
import { config } from '../../../../config/config';

import { PreviewWebView } from '../PreviewWebView';
import { PreviewAIChat } from '../PreviewAIChat';
import { PreviewPublishSheet } from '../PreviewPublishSheet';
import { PreviewStartScreen, PreviewLoadingScreen } from '../PreviewServerStatus';
import { AskUserQuestionModal } from '../../../../shared/components/modals/AskUserQuestionModal';
import { PreviewStartView, PreviewLoadingView } from './PreviewStates';

// ── Types ────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  previewUrl: string;
  projectName?: string;
  isVisible?: boolean;
}

// ── Component ────────────────────────────────────────────────

export const PreviewPanelV2 = React.memo(({ onClose, previewUrl: propUrl, projectName, isVisible }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const insets = useSafeAreaInsets();
  const { sidebarTranslateX } = useSidebarOffset();

  // ── Store state ──
  const currentWorkstation = useWorkstationStore((s) => s.currentWorkstation);
  const projectId = currentWorkstation?.id;
  const globalFlyMachineId = useUIStore((s) => s.flyMachineId);
  const projectPreviewUrls = useUIStore((s) => s.projectPreviewUrls);
  const previewServerUrl = useUIStore((s) => s.previewServerUrl);

  // ── Server state ──
  const [serverStatus, setServerStatus] = useState<'stopped' | 'checking' | 'running'>(() => {
    return projectId && (projectPreviewUrls[projectId] || globalFlyMachineId) ? 'checking' : 'stopped';
  });
  const [webViewReady, setWebViewReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPreviewUrl, setCurrentPreviewUrl] = useState(() => {
    if (projectId && projectPreviewUrls[projectId]) return projectPreviewUrls[projectId];
    return propUrl || '';
  });
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [viewportMode, setViewportMode] = useState<'mobile' | 'desktop'>('mobile');

  // ── Refs ──
  const webViewRef = useRef<WebView>(null);
  const webViewContainerRef = useRef<View>(null);
  const jsErrorsRef = useRef<string[]>([]);
  const serverStatusRef = useRef(serverStatus);
  const preflightDoneRef = useRef(false);
  const autoFixTriggeredRef = useRef(false);
  const hasReachedReadyRef = useRef(false);

  // ── Hooks ──
  const autoFix = usePreviewAutoFix(projectId);
  const startup = usePreviewStartup({
    projectId: projectId || '',
    previewAccessToken: useUIStore.getState().previewAccessToken || null,
    serverStatus,
    webViewReady,
    currentWorkstationName: currentWorkstation?.name || projectName,
  });
  const publish = usePreviewPublish({
    projectId: projectId || '',
    apiUrl: config.apiUrl,
    serverStatus,
  });
  const chat = usePreviewChat({
    currentWorkstationId: currentWorkstation?.id,
    currentWorkstationName: currentWorkstation?.name || projectName,
    webViewRef,
  });

  // ── Animated container ──
  const containerStyle = useAnimatedStyle(() => ({
    left: 44 + sidebarTranslateX.value,
  }));

  // ── Sync refs ──
  useEffect(() => { serverStatusRef.current = serverStatus; }, [serverStatus]);

  // ── Health check on mount: if status is 'checking', verify server is alive ──
  useEffect(() => {
    if (serverStatus !== 'checking' || !currentPreviewUrl) return;
    let cancelled = false;
    let attempts = 0;
    const MAX_CHECK_ATTEMPTS = 5;

    const check = async () => {
      attempts++;
      try {
        // Build health check URL — must include /preview/{projectId}/
        let checkUrl = currentPreviewUrl;
        if (projectId && !checkUrl.includes('/preview/')) {
          checkUrl = `${config.apiUrl}/preview/${projectId}/`;
        }
        try {
          const parsed = new URL(checkUrl);
          const match = parsed.pathname.match(/^(\/preview\/[^/]+\/)/);
          if (match) parsed.pathname = match[1];
          checkUrl = parsed.toString();
        } catch {}

        const headers: Record<string, string> = { 'X-Drape-Check': 'true' };
        const token = useUIStore.getState().previewAccessToken;
        const machineId = useUIStore.getState().flyMachineId;
        if (token) headers['X-Drape-Preview-Token'] = token;
        if (machineId) headers['Fly-Force-Instance-Id'] = machineId;

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const resp = await fetch(checkUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!cancelled) {
          if (resp.ok) {
            console.log('[PreviewV2] Server is alive, transitioning to running');
            setServerStatus('running');
          } else if (attempts < MAX_CHECK_ATTEMPTS) {
            console.log('[PreviewV2] Server responded with', resp.status, `— retry ${attempts}/${MAX_CHECK_ATTEMPTS}`);
            setTimeout(check, 2000);
          } else {
            console.log('[PreviewV2] Server not available after', MAX_CHECK_ATTEMPTS, 'attempts — showing start screen');
            setServerStatus('stopped');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          if (attempts < MAX_CHECK_ATTEMPTS) {
            console.log('[PreviewV2] Health check failed:', err?.message, `— retry ${attempts}/${MAX_CHECK_ATTEMPTS}`);
            setTimeout(check, 2000);
          } else {
            console.log('[PreviewV2] Health check failed after', MAX_CHECK_ATTEMPTS, 'attempts — showing start screen');
            setServerStatus('stopped');
          }
        }
      }
    };

    check();
    return () => { cancelled = true; };
  }, [serverStatus, currentPreviewUrl]);

  // ── Determine what to show ──
  // The user NEVER sees an error screen. Priority:
  // 1. Server stopped, no error → Start screen
  // 2. Server starting/checking OR error with auto-fix → Loading screen
  // 3. Server running, WebView ready → Preview
  const showState = useMemo(() => {
    if (serverStatus === 'stopped' && !startup.previewError && !autoFixTriggeredRef.current) {
      return 'start';
    }
    // Once preview has reached 'ready' at least once, stay ready — don't re-enter loading for transient errors
    const isReady = serverStatus === 'running' && webViewReady && !autoFix.isFixing &&
      (autoFix.state === 'verified' || autoFix.state === 'idle' || autoFix.state === 'exhausted' || preflightDoneRef.current);
    if (isReady) {
      hasReachedReadyRef.current = true;
      return 'ready';
    }
    // After first stable ready, don't go back to loading
    if (hasReachedReadyRef.current && serverStatus === 'running') {
      return 'ready';
    }
    return 'loading';
  }, [serverStatus, webViewReady, autoFix.isFixing, autoFix.state, startup.previewError]);

  // ── Loading message logic ──
  const loadingMessage = useMemo(() => {
    if (autoFix.isFixing) return autoFix.statusMessage;
    if (autoFixTriggeredRef.current && !autoFix.isFixing) return 'Risolvo il problema...';
    if (startup.displayedMessage) return startup.displayedMessage;
    if (serverStatus === 'checking') return 'Verifico il server...';
    if (serverStatus === 'running' && !webViewReady) return 'Caricamento pagina...';
    return 'Preparando...';
  }, [autoFix.isFixing, autoFix.statusMessage, startup.displayedMessage, serverStatus, webViewReady]);

  // ── Auto-fix on fatal error (stays in preview, never goes to chat) ──
  // Only trigger during initial preflight — after first ready, don't auto-fix
  useEffect(() => {
    if (startup.previewError && !autoFixTriggeredRef.current && !hasReachedReadyRef.current) {
      autoFixTriggeredRef.current = true;
      const timer = setTimeout(() => {
        console.log('[PreviewV2] Auto-fixing fatal error in-place');
        const errors = terminalOutput
          .filter(l => /error|failed|cannot/i.test(l))
          .slice(-10);
        autoFix.reportCheckResult({
          rootChildren: 0,
          jsErrors: errors.length > 0 ? errors : [startup.previewError?.message || 'Preview failed'],
          screenshotBase64: null,
        });
      }, 500);
      return () => clearTimeout(timer);
    }
    if (!startup.previewError) {
      autoFixTriggeredRef.current = false;
    }
  }, [startup.previewError]);

  // ── Auto-fix rechecking → restart server ──
  useEffect(() => {
    if (autoFix.state === 'rechecking') {
      jsErrorsRef.current = [];
      setWebViewReady(false);
      if (serverStatus === 'stopped' || startup.previewError) {
        startup.setPreviewError(null);
        handleRetryPreview();
      } else {
        webViewRef.current?.reload();
      }
    }
  }, [autoFix.state]);

  // ── WebView preflight check ──
  useEffect(() => {
    if (!webViewReady || preflightDoneRef.current || hasReachedReadyRef.current || autoFix.state === 'verified' || autoFix.state === 'exhausted' || autoFix.state === 'fixing') return;
    const timer = setTimeout(() => {
      const errors = [...jsErrorsRef.current];
      if (errors.length === 0) {
        autoFix.reportCheckResult({ rootChildren: 1, jsErrors: [], screenshotBase64: null });
        preflightDoneRef.current = true;
      } else {
        autoFix.reportCheckResult({ rootChildren: 1, jsErrors: errors, screenshotBase64: null });
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [webViewReady, autoFix.state]);

  // ── Reset on project change ──
  useEffect(() => {
    preflightDoneRef.current = false;
    autoFixTriggeredRef.current = false;
    hasReachedReadyRef.current = false;
    autoFix.reset();
    jsErrorsRef.current = [];
  }, [projectId]);

  // ── Handlers ──
  const handleStartServer = useCallback(() => {
    // Delegate to existing startup hook's handleStartServer
    // This is simplified — the real logic lives in PreviewPanel's handleStartServer
    // For V2, we trigger it via the existing mechanism
    startup.setIsStarting(true);
    setServerStatus('checking');
  }, []);

  const handleRetryPreview = useCallback(() => {
    startup.setPreviewError(null);
    if (serverStatusRef.current === 'running' || currentPreviewUrl) {
      setServerStatus('running');
      webViewRef.current?.reload();
    } else {
      handleStartServer();
    }
  }, [currentPreviewUrl]);

  const handleRefresh = useCallback(() => {
    webViewRef.current?.reload();
  }, []);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // ── Render ──
  return (
    <>
      <Animated.View style={[styles.container, containerStyle, { right: 0, top: 0, bottom: 0 }]}>
        <View style={styles.inner}>
          {/* Start screen */}
          {showState === 'start' && (
            <PreviewStartView
              projectName={projectName || currentWorkstation?.name}
              technology={currentWorkstation?.technology}
              onStart={handleStartServer}
            />
          )}

          {/* Loading / Fixing screen */}
          {showState === 'loading' && (
            <PreviewLoadingView
              message={loadingMessage}
              subMessage={autoFix.isFixing ? `Tentativo ${autoFix.fixAttempt}` : undefined}
              progress={startup.smoothProgress}
              isFixing={autoFix.isFixing || autoFixTriggeredRef.current}
              fixAttempt={autoFix.fixAttempt}
            />
          )}

          {/* WebView (always mounted when server running, visibility controlled) */}
          {serverStatus === 'running' && (
            <View
              ref={webViewContainerRef}
              style={[styles.webViewLayer, showState !== 'ready' && styles.hidden]}
            >
              <PreviewWebView
                webViewRef={webViewRef}
                currentPreviewUrl={currentPreviewUrl}
                coderToken={null}
                globalFlyMachineId={globalFlyMachineId}
                previewAccessToken={useUIStore.getState().previewAccessToken || null}
                flyMachineIdRef={{ current: globalFlyMachineId }}
                hasWebUI={true}
                webViewReady={showState === 'ready'}
                serverStatus={serverStatus}
                isLoading={isLoading}
                terminalOutput={terminalOutput}
                terminalScrollRef={{ current: null }}
                maskOpacityAnim={startup.maskOpacityAnim}
                previewError={null}
                previewLogs={startup.previewLogs}
                displayedMessage={loadingMessage}
                startingMessage={startup.startingMessage}
                smoothProgress={startup.smoothProgress}
                elapsedSeconds={startup.elapsedSeconds}
                pulseAnim={startup.pulseAnim}
                setIsLoading={setIsLoading}
                setCanGoBack={() => {}}
                setCanGoForward={() => {}}
                setWebViewReady={setWebViewReady}
                setCurrentPreviewUrl={(url: string) => {
                  setCurrentPreviewUrl(url);
                  if (projectId) useUIStore.getState().setPreviewServerUrl(url, projectId);
                }}
                setSelectedElement={chat.setSelectedElement}
                setPreviewError={startup.setPreviewError}
                setServerStatus={setServerStatus as any}
                setIsStarting={startup.setIsStarting}
                handleRefresh={handleRefresh}
                onClose={handleClose}
                onRetryPreview={handleRetryPreview}
                onSendErrorReport={() => {}}
                onEnvError={() => {}}
                onJsError={(msg: string) => { if (!preflightDoneRef.current) jsErrorsRef.current.push(msg); }}
                topInset={insets.top}
                viewportMode={viewportMode}
                projectId={projectId || ''}
                wsUrl={''}
                authToken={null}
                t={t}
              />
            </View>
          )}

          {/* AI Chat FAB (only when preview is ready) */}
          {showState === 'ready' && (
            <PreviewAIChat
              isInputExpanded={chat.isInputExpanded}
              isMessagesCollapsed={chat.isMessagesCollapsed}
              showPastChats={chat.showPastChats}
              message={chat.message}
              aiMessages={chat.aiMessages}
              activeTools={chat.activeTools}
              isAiLoading={chat.isAiLoading}
              agentStreaming={chat.agentStreaming}
              keyboardHeight={chat.keyboardHeight}
              selectedElement={chat.selectedElement}
              isInspectMode={chat.isInspectMode}
              currentTodos={chat.currentTodos}
              previewChatId={chat.previewChatId}
              chatHistory={chat.chatHistory}
              currentWorkstationId={currentWorkstation?.id}
              inputRef={chat.inputRef}
              aiScrollViewRef={chat.aiScrollViewRef}
              fabContentOpacity={chat.fabContentOpacity}
              bottomInset={insets.bottom}
              onExpandFab={chat.expandFab}
              onCollapseFab={chat.collapseFab}
              setMessage={chat.setMessage}
              setIsMessagesCollapsed={chat.setIsMessagesCollapsed}
              setShowPastChats={chat.setShowPastChats}
              onSendMessage={chat.handleSendMessage}
              onStopAgent={() => chat.stopAgent()}
              onToggleInspectMode={chat.toggleInspectMode}
              onClearSelectedElement={chat.clearSelectedElement}
              onSelectParentElement={chat.selectParentElement}
              onLoadPastChat={chat.loadPastChat}
              onStartNewChat={chat.startNewChat}
              contextUsagePercent={chat.contextUsagePercent}
              selectedModel={chat.selectedModel}
            />
          )}
        </View>
      </Animated.View>

      {/* Publish Sheet (always mounted) */}
      <PreviewPublishSheet
        visible={publish.showPublishModal}
        publishSlug={publish.publishSlug}
        onChangeSlug={publish.setPublishSlug}
        isPublishing={publish.isPublishing}
        publishStatus={publish.publishStatus}
        publishedUrl={publish.publishedUrl}
        publishError={publish.publishError}
        existingPublish={publish.existingPublish}
        onPublish={publish.handlePublish}
        onUnpublish={publish.handleUnpublish}
        onClose={publish.closePublishModal}
        isFreeUser={false}
      />

      {/* Ask User Question Modal */}
      <AskUserQuestionModal
        visible={!!chat.pendingQuestion}
        questions={chat.pendingQuestion || []}
        onAnswer={chat.handleQuestionAnswer}
        onCancel={() => {}}
      />
    </>
  );
});

PreviewPanelV2.displayName = 'PreviewPanelV2';

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  webViewLayer: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 88,
  },
  hidden: {
    opacity: 0,
    pointerEvents: 'none' as any,
  },
});
