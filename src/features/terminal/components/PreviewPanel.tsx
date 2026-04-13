import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { useAnimatedStyle, useAnimatedReaction, runOnJS, useSharedValue } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import { useWorkstationStore } from '../../../core/terminal/workstationStore';
import { useUIStore } from '../../../core/terminal/uiStore';
import { useAuthStore } from '../../../core/auth/authStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkConfig } from '../../../providers/NetworkConfigProvider';
import { useSidebarOffset } from '../context/SidebarContext';
import { AskUserQuestionModal } from '../../../shared/components/modals/AskUserQuestionModal';
import { tracciaCambioViewport, tracciaErroreAnteprima, tracciaElementoSelezionato, tracciaPaginaPianiVista } from '../../../core/services/analyticsService';
import { useNavigationStore } from '../../../core/navigation/navigationStore';
import type { PreviewWebViewEvent } from '../preview/webview/previewWebViewEvents';
import { isEnvRelatedMessage, isTransientProxyError, isCssNoiseError } from '../preview/webview/previewWebViewBridge';

// Sub-components
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewAIChat } from './PreviewAIChat';
import { PreviewPublishSheet } from './PreviewPublishSheet';
import { usePreviewMachine } from '../preview';
import { derivePreviewPhase } from '../preview/derivePreviewPhase';
import {
  PreviewStateStart,
  PreviewStateLoading,
  PreviewStateFixing,
  PreviewStateEnvRequired,
  PreviewStateSessionExpired,
  PreviewStateFatalError,
  PreviewSurfaceWeb,
  PreviewSurfaceConsole,
} from '../preview/components';
import { getPreviewCapability } from '../preview/previewCapabilities';

// Hooks
import { usePreviewPublish } from '../hooks/usePreviewPublish';
import { usePreviewChat } from '../hooks/usePreviewChat';
import { usePreviewAutoFix } from '../../../hooks/preview/usePreviewAutoFix';
import { usePreviewServerLifecycle } from '../hooks/usePreviewServerLifecycle';
import { previewStyles as styles } from './PreviewPanel.styles';

/**
 * PreviewPanel — Main preview component
 *
 * Server lifecycle logic extracted to usePreviewServerLifecycle hook.
 * The startup hook (usePreviewStartup) is called inside usePreviewServerLifecycle
 * so it receives the real serverStatus & webViewReady values.
 *
 * EXTRACTED FILES:
 * - PreviewPanel.styles.ts — StyleSheet
 * - usePreviewFileWatcher.ts — Hot reload banner logic
 * - usePreviewStartup.ts — Startup state/animations
 * - usePreviewPublish.ts — Publish flow
 * - usePreviewChat.ts — AI chat integration
 * - usePreviewAutoFix.ts — Auto-fix engine
 * - usePreviewServerLifecycle.ts — Server state, lifecycle, effects
 */

interface Props {
  onClose: () => void;
  previewUrl: string;
  projectName?: string;
  projectPath?: string;
  isVisible?: boolean;
}

export const PreviewPanel = React.memo(({ onClose, previewUrl, projectName, projectPath, isVisible = true }: Props) => {
  const { t } = useTranslation(['terminal', 'common']);
  const currentWorkstation = useWorkstationStore((state) => state.currentWorkstation);
  const globalServerUrl = useUIStore((state) => state.previewServerUrl);
  const setPreviewServerStatus = useUIStore((state) => state.setPreviewServerStatus);
  const setPreviewServerUrl = useUIStore((state) => state.setPreviewServerUrl);
  const setPreviewCurrentUrl = useUIStore((state) => state.setPreviewCurrentUrl);
  const setPreviewViewportMode = useUIStore((state) => state.setPreviewViewportMode);
  const setPreviewHandlers = useUIStore((state) => state.setPreviewHandlers);
  const setPreviewPublishInfo = useUIStore((state) => state.setPreviewPublishInfo);
  const globalFlyMachineId = useUIStore((state) => state.flyMachineId);
  const setGlobalFlyMachineId = useUIStore((state) => state.setFlyMachineId);
  const setPreviewAccessToken = useUIStore((state) => state.setPreviewAccessToken);
  const clearProjectPreviewSession = useUIStore((state) => state.clearProjectPreviewSession);
  const projectMachineIds = useUIStore((state) => state.projectMachineIds);
  const projectPreviewUrls = useUIStore((state) => state.projectPreviewUrls);
  const projectPreviewTokens = useUIStore((state) => state.projectPreviewTokens);
  const projectId = currentWorkstation?.id;
  const { apiUrl, wsUrl } = useNetworkConfig();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { sidebarTranslateX } = useSidebarOffset();

  // Animated container position
  const containerAnimatedStyle = useAnimatedStyle(() => {
    'worklet';
    return { left: 44 + sidebarTranslateX.value };
  });

  const isExpandedShared = useSharedValue(false);
  const fabWidthAnim = useRef(new Animated.Value(44)).current;

  const animateFabWidth = (targetWidth: number) => {
    Animated.spring(fabWidthAnim, {
      toValue: targetWidth, useNativeDriver: false, damping: 20, stiffness: 180,
    }).start();
  };

  useAnimatedReaction(
    () => sidebarTranslateX.value,
    (currentValue, previousValue) => {
      if (isExpandedShared.value && previousValue !== null && currentValue !== previousValue) {
        runOnJS(animateFabWidth)(320 + Math.abs(currentValue));
      }
    },
    []
  );

  // Shared refs passed to hooks and render
  const webViewRef = useRef<WebView>(null);
  const webViewContainerRef = useRef<View>(null);
  const jsErrorsRef = useRef<string[]>([]);
  const terminalScrollRef = useRef<ScrollView>(null);
  // Ref for publish.openPublishModal — set after publish hook is created (avoids forward reference)
  const publishOpenRef = useRef<() => void>(() => {});

  // ---- Custom hooks ----
  const autoFix = usePreviewAutoFix(currentWorkstation?.id);

  // Server lifecycle hook (includes usePreviewStartup internally)
  const lifecycle = usePreviewServerLifecycle({
    projectId,
    previewUrl,
    onClose,
    apiUrl,
    wsUrl,
    insets,
    t,
    currentWorkstation,
    globalServerUrl,
    setPreviewServerStatus,
    setPreviewServerUrl,
    setPreviewCurrentUrl,
    setPreviewViewportMode,
    setPreviewHandlers,
    globalFlyMachineId,
    setGlobalFlyMachineId,
    setPreviewAccessToken,
    clearProjectPreviewSession,
    projectMachineIds,
    projectPreviewUrls,
    projectPreviewTokens,
    autoFix,
    isVisible,
    fadeAnim,
    webViewRef,
    webViewContainerRef,
    jsErrorsRef,
    terminalScrollRef,
    publishOpenPublishModal: () => publishOpenRef.current(),
    currentWorkstationName: currentWorkstation?.name,
  });

  // Destructure lifecycle for render convenience
  const {
    serverStatus, currentPreviewUrl, coderToken, previewAccessToken,
    terminalOutput, viewportMode, hasWebUI, webViewReady, isLoading, canGoBack, canGoForward,
    requiredEnvVars, envVarValues, isSavingEnv, sessionExpired, sessionExpiredMessage,
    showReloadBanner, projectInfo, terminalAuthToken,
    flyMachineIdRef, preflightDoneRef, autoFixTriggeredRef,
    setServerStatus, setCurrentPreviewUrl, setWebViewReady, setIsLoading,
    setCanGoBack, setCanGoForward, setViewportMode, setEnvVarValues, setRequiredEnvVars,
    handleStartServer, handleStartWithTransition, handleRetryPreview, handleStopPreview,
    handleClose, handleRefresh, handleBannerReload, handleSaveEnvVars,
    sendErrorToChat, redirectToEnvVarsWithError,
    startup,
  } = lifecycle;

  const publish = usePreviewPublish({ projectId, apiUrl, serverStatus });
  publishOpenRef.current = publish.openPublishModal;

  const chat = usePreviewChat({
    currentWorkstationId: currentWorkstation?.id,
    currentWorkstationName: currentWorkstation?.name,
    webViewRef,
  });

  // Handle structured events from the thin PreviewWebView
  const handlePreviewEvent = React.useCallback((event: PreviewWebViewEvent) => {
    switch (event.type) {
      case 'ready':
        setWebViewReady(true);
        break;

      case 'page_info':
        if (event.rootChildren > 0 || event.forceReady) {
          if (!lifecycle.webViewReady) setWebViewReady(true);
        }
        break;

      case 'navigation_state':
        setCanGoBack(event.canGoBack);
        setCanGoForward(event.canGoForward);
        break;

      case 'preview_error': {
        const rawMsg = event.message;
        if (serverStatus !== 'running') {
          console.warn('[Preview] Proxy error during verification (ignored):', rawMsg);
          return;
        }
        if (isTransientProxyError(rawMsg)) {
          console.warn('[Preview] Transient proxy error (ignored):', rawMsg);
          return;
        }
        console.warn('WebView detected non-transient proxy error:', rawMsg);
        if (isEnvRelatedMessage(rawMsg)) {
          redirectToEnvVarsWithError(rawMsg);
          return;
        }
        let userMsg = rawMsg;
        if (rawMsg.includes('ECONNREFUSED')) {
          userMsg = t('terminal:preview.errorServerFailed');
        } else if (rawMsg.includes('timeout') || rawMsg.includes('Timeout')) {
          userMsg = t('terminal:preview.errorTimeout');
        } else if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('EHOSTUNREACH')) {
          userMsg = t('terminal:preview.errorContainerUnreachable');
        }
        startup.setPreviewError({ message: userMsg, timestamp: new Date() });
        tracciaErroreAnteprima(userMsg);
        setServerStatus('stopped');
        startup.setIsStarting(false);
        break;
      }

      case 'build_error': {
        const buildMsg = event.message || 'Build error';
        console.error('[Preview] Build error detected:', buildMsg);
        if (isEnvRelatedMessage(buildMsg)) {
          redirectToEnvVarsWithError(buildMsg);
          return;
        }
        startup.setPreviewError({ message: buildMsg, timestamp: new Date() });
        tracciaErroreAnteprima(buildMsg);
        setServerStatus('stopped');
        startup.setIsStarting(false);
        break;
      }

      case 'js_error':
      case 'runtime_error': {
        const jsMsg = event.message || '';
        if (isCssNoiseError(jsMsg)) return;
        console.warn('[Preview] JS/runtime error:', jsMsg);
        if (!preflightDoneRef.current) jsErrorsRef.current.push(jsMsg);
        if (isEnvRelatedMessage(jsMsg)) {
          redirectToEnvVarsWithError(jsMsg);
          return;
        }
        break;
      }

      case 'element_selected': {
        const el = event.element;
        let elementSelector = `<${el.tag}>`;
        if (el.id) elementSelector = `<${el.tag}#${el.id}>`;
        else if (el.className) {
          const classes = el.className.split(' ').filter((c: string) => c && !c.startsWith('__inspector')).slice(0, 2);
          if (classes.length > 0) elementSelector = `<${el.tag}.${classes.join('.')}>`;
        }
        chat.setSelectedElement({
          selector: elementSelector,
          text: (el.text?.trim()?.substring(0, 40) || '') + ((el.text?.length || 0) > 40 ? '...' : ''),
          tag: el.tag,
          className: el.className || '',
          id: el.id,
          innerHTML: el.innerHTML,
        });
        tracciaElementoSelezionato(elementSelector);
        break;
      }

      case 'trigger_refresh':
        handleRefresh();
        break;
    }
  }, [serverStatus, lifecycle.webViewReady, setWebViewReady, setCanGoBack, setCanGoForward, setServerStatus, startup, redirectToEnvVarsWithError, handleRefresh, chat, t, preflightDoneRef, jsErrorsRef]);

  // Sync publish info to uiStore
  React.useEffect(() => { setPreviewPublishInfo(publish.existingPublish); }, [publish.existingPublish]);

  // Keep toolbar hidden during the initial loading mask to avoid the black strip.
  // If WEBVIEW_READY doesn't arrive, reveal it when loading settles.
  // Toolbar hidden — moved to VSCodeSidebar header
  const shouldRenderToolbar = false;

  // Phase 6: Capability-based preview routing
  const detectedTech = (projectInfo?.type || currentWorkstation?.technology || currentWorkstation?.language || '').toLowerCase();
  const previewCapability = getPreviewCapability(detectedTech);
  const isPreviewSupported = previewCapability !== 'unsupported';
  const { state: previewState, dispatch: dispatchPreview } = usePreviewMachine();

  React.useEffect(() => {
    const phase = derivePreviewPhase({
      sessionExpired,
      serverStatus,
      hasRequiredEnvVars: !!requiredEnvVars,
      hasPreviewError: !!startup.previewError,
      isFixing: autoFix.isFixing || autoFixTriggeredRef.current,
      previewCapability,
      webViewReady,
    });

    dispatchPreview({
      type: 'SYNC_EXTERNAL_STATE',
      phase,
      previewUrl: currentPreviewUrl || null,
      envVarsRequired: requiredEnvVars,
      error: startup.previewError
        ? {
            kind: sessionExpired ? 'session_expired' : 'unknown',
            message: startup.previewError.message,
            recoverable: !!(autoFix.isFixing || autoFixTriggeredRef.current),
            raw: startup.previewError.message,
          }
        : null,
      sessionExpiredMessage: sessionExpiredMessage || null,
      webViewReady,
      canGoBack,
      canGoForward,
      viewportMode,
      displayedMessage: autoFix.isFixing ? autoFix.statusMessage || startup.displayedMessage : startup.displayedMessage,
      progress: startup.smoothProgress,
      hasWebUi: hasWebUI,
      terminalOutput,
      startupLogs: startup.previewLogs.map((log) => ({
        timestamp: log.timestamp,
        message: log.message,
        type: 'info' as const,
      })),
      autoFix: {
        active: autoFix.isFixing || autoFixTriggeredRef.current,
        attempt: autoFix.fixAttempt,
        statusMessage: autoFix.statusMessage || null,
      },
    });
  }, [
    sessionExpired,
    sessionExpiredMessage,
    serverStatus,
    requiredEnvVars,
    startup.previewError,
    startup.displayedMessage,
    startup.smoothProgress,
    autoFix.isFixing,
    autoFix.fixAttempt,
    autoFix.statusMessage,
    autoFixTriggeredRef.current,
    currentPreviewUrl,
    webViewReady,
    canGoBack,
    canGoForward,
    viewportMode,
    hasWebUI,
    terminalOutput,
    previewCapability,
    dispatchPreview,
  ]);

  const previewTerminalLines = previewState.terminalOutput.length > 0
    ? previewState.terminalOutput
    : previewState.startupLogs.map(log => log.message);
  const previewWebLogs = previewState.startupLogs.map((log, index) => ({
    id: index,
    timestamp: log.timestamp,
    message: log.message,
  }));
  const previewErrorMessage = previewState.error?.message ?? null;
  const previewEnvVars = previewState.envVarsRequired;
  const previewSessionMessage = previewState.sessionExpiredMessage;

  // ---- Render ----
  if (!isPreviewSupported) {
    return (
      <>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <Reanimated.View style={[styles.container, containerAnimatedStyle]}>
          <View style={{ flex: 1, backgroundColor: '#0a0a0f', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
            <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.3)" />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
              Preview non supportata
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 8, textAlign: 'center' }}>
              La preview non è ancora disponibile per i progetti {detectedTech || 'di questo tipo'}.
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 16, textAlign: 'center' }}>
              Stack supportate: Next.js, React, Vue, HTML/CSS/JS, Astro
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12 }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </Reanimated.View>
      </>
    );
  }

  return (
    <>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      <Reanimated.View style={[styles.container, containerAnimatedStyle]}>
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
          <LinearGradient colors={['#0a0a0a', '#000000']} style={StyleSheet.absoluteFill} />

          <View style={{ flex: 1 }}>
            {shouldRenderToolbar && (
              <Animated.View>
                {!hasWebUI ? (
                  /* Console projects: minimal header with just the close button */
                  <View style={{ paddingTop: insets.top, backgroundColor: '#0d1117' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12 }}>
                      <TouchableOpacity onPress={handleStopPreview} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Ionicons name="close" size={22} color="#9ca3af" />
                      </TouchableOpacity>
                      <Text style={{ flex: 1, textAlign: 'center', color: '#6b7280', fontSize: 13, fontFamily: 'SF Mono' }}>Terminal</Text>
                      <View style={{ width: 22 }} />
                    </View>
                  </View>
                ) : (
                  <PreviewToolbar
                    currentPreviewUrl={currentPreviewUrl}
                    onClose={handleStopPreview}
                    onRefresh={handleRefresh}
                    onPublish={publish.openPublishModal}
                    onUrlChange={setCurrentPreviewUrl}
                    existingPublish={publish.existingPublish}
                    topInset={insets.top}
                    viewportMode={viewportMode}
                    onViewportChange={(mode) => { tracciaCambioViewport(mode); setViewportMode(mode); }}
                    canGoBack={canGoBack}
                    canGoForward={canGoForward}
                    onGoBack={() => webViewRef.current?.goBack()}
                    onGoForward={() => webViewRef.current?.goForward()}
                  />
                )}
              </Animated.View>
            )}

            <View ref={webViewContainerRef} style={styles.webViewContainer}>
              {/* Reload banner — shown when file changes detected */}
              {showReloadBanner && serverStatus === 'running' && (
                <TouchableOpacity
                  style={styles.reloadBanner}
                  onPress={handleBannerReload}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={14} color="#fff" />
                  <Text style={styles.reloadBannerText}>Modifiche rilevate — Ricarica</Text>
                </TouchableOpacity>
              )}
              {/* Phase 5: State screens — pure components */}
              {previewState.phase === 'preflight_env' && previewEnvVars ? (
                <PreviewStateEnvRequired
                  requiredEnvVars={previewEnvVars}
                  envVarValues={envVarValues}
                  onChangeEnvVar={(key, value) => setEnvVarValues(prev => ({ ...prev, [key]: value }))}
                  isSaving={isSavingEnv}
                  onSave={handleSaveEnvVars}
                  onCancel={() => setRequiredEnvVars(null)}
                  topInset={insets.top}
                  bottomInset={insets.bottom}
                />
              ) : previewState.phase === 'session_expired' ? (
                <PreviewStateSessionExpired
                  message={previewSessionMessage || ''}
                  onRestart={handleStartServer}
                  t={t}
                />
              ) : previewState.phase === 'fatal_error' && previewErrorMessage ? (
                <PreviewStateFatalError
                  errorMessage={previewErrorMessage}
                  terminalOutput={previewTerminalLines}
                  onRetry={handleRetryPreview}
                  onFixWithAI={sendErrorToChat}
                  onUpgrade={() => { tracciaPaginaPianiVista('preview_limit'); useNavigationStore.getState().navigateTo('plans'); }}
                  t={t}
                />
              ) : previewState.phase === 'fixing' ? (
                <PreviewStateFixing
                  terminalLines={previewState.terminalOutput}
                  statusMessage={previewState.autoFix.statusMessage || 'Risolvo il problema...'}
                  fixAttempt={previewState.autoFix.attempt}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  t={t}
                />
              ) : previewState.phase === 'idle' ? (
                <PreviewStateStart
                  projectName={currentWorkstation?.name}
                  technology={currentWorkstation?.technology}
                  language={currentWorkstation?.language}
                  projectId={currentWorkstation?.id}
                  isStartTransitioning={startup.isStartTransitioning}
                  startTransitionAnim={startup.startTransitionAnim}
                  onStart={handleStartWithTransition}
                  t={t}
                />
              ) : previewState.phase === 'starting' || previewState.phase === 'waiting_health' ? (
                /* During 'checking', show ONLY loading screen — no WebView. */
                <PreviewStateLoading
                  terminalLines={previewTerminalLines}
                  displayedMessage={previewState.displayedMessage}
                  startingMessage={startup.startingMessage}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  t={t}
                />
              ) : previewCapability === 'console' && previewState.phase === 'ready' ? (
                /* Phase 6: Console surface for non-web projects */
                <PreviewSurfaceConsole
                  terminalOutput={previewState.terminalOutput}
                  onStop={handleStopPreview}
                  projectName={currentWorkstation?.name}
                  terminalScrollRef={terminalScrollRef}
                />
              ) : (
                /* Phase 6: Web surface (default) */
                <PreviewSurfaceWeb
                  webViewRef={webViewRef}
                  currentPreviewUrl={currentPreviewUrl}
                  coderToken={coderToken}
                  globalFlyMachineId={globalFlyMachineId}
                  previewAccessToken={previewAccessToken}
                  flyMachineIdRef={flyMachineIdRef}
                  hasWebUI={hasWebUI}
                  webViewReady={webViewReady && (autoFix.state === 'verified' || autoFix.state === 'idle' || preflightDoneRef.current)}
                  serverStatus={serverStatus}
                  isLoading={isLoading}
                  terminalOutput={previewState.terminalOutput}
                  terminalScrollRef={terminalScrollRef}
                  maskOpacityAnim={startup.maskOpacityAnim}
                  previewError={previewState.error ? { message: previewState.error.message, timestamp: new Date() } : null}
                  previewLogs={previewWebLogs}
                  displayedMessage={previewState.displayedMessage}
                  startingMessage={startup.startingMessage}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  onPreviewEvent={handlePreviewEvent}
                  setIsLoading={setIsLoading}
                  setCurrentPreviewUrl={setCurrentPreviewUrl}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorToChat}
                  topInset={insets.top}
                  viewportMode={viewportMode}
                  projectId={projectId || ''}
                  wsUrl={wsUrl}
                  authToken={terminalAuthToken}
                  startCommand={projectInfo?.startCommand}
                  t={t}
                />
              )}
            </View>
          </View>

          {previewState.phase === 'ready' && webViewReady && (
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
              onStopAgent={() => { chat.stopAgent(); }}
              onToggleInspectMode={chat.toggleInspectMode}
              onClearSelectedElement={chat.clearSelectedElement}
              onSelectParentElement={chat.selectParentElement}
              onLoadPastChat={chat.loadPastChat}
              onStartNewChat={chat.startNewChat}
              contextUsagePercent={chat.contextUsagePercent}
              selectedModel={chat.selectedModel}
            />
          )}
        </Animated.View>
      </Reanimated.View>

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
        isFreeUser={(useAuthStore.getState().user?.plan || 'free') === 'free'}
      />

      <AskUserQuestionModal
        visible={!!chat.pendingQuestion}
        questions={chat.pendingQuestion || []}
        onAnswer={chat.handleQuestionAnswer}
        onCancel={() => {}}
      />
    </>
  );
});
