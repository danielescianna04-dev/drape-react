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
import { tracciaCambioViewport } from '../../../core/services/analyticsService';

// Sub-components
import { PreviewToolbar } from './PreviewToolbar';
import { PreviewWebView } from './PreviewWebView';
import { PreviewAIChat } from './PreviewAIChat';
import { PreviewPublishSheet } from './PreviewPublishSheet';
import { PreviewStartScreen, PreviewSessionExpiredScreen, PreviewErrorScreen, PreviewLoadingScreen } from './PreviewServerStatus';
import { PreviewEnvVarsForm } from './PreviewEnvVarsForm';

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

  // Sync publish info to uiStore
  React.useEffect(() => { setPreviewPublishInfo(publish.existingPublish); }, [publish.existingPublish]);

  // Keep toolbar hidden during the initial loading mask to avoid the black strip.
  // If WEBVIEW_READY doesn't arrive, reveal it when loading settles.
  // Toolbar hidden — moved to VSCodeSidebar header
  const shouldRenderToolbar = false;

  // ---- Render ----
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
              {serverStatus === 'stopped' && requiredEnvVars ? (
                <PreviewEnvVarsForm
                  requiredEnvVars={requiredEnvVars}
                  envVarValues={envVarValues}
                  onChangeEnvVar={(key, value) => setEnvVarValues(prev => ({ ...prev, [key]: value }))}
                  isSaving={isSavingEnv}
                  onSave={handleSaveEnvVars}
                  onCancel={() => setRequiredEnvVars(null)}
                  topInset={insets.top}
                  bottomInset={insets.bottom}
                />
              ) : sessionExpired ? (
                <PreviewSessionExpiredScreen
                  sessionExpiredMessage={sessionExpiredMessage}
                  onStartServer={handleStartServer}
                  t={t}
                />
              ) : serverStatus === 'stopped' && startup.previewError && !autoFix.isFixing && !autoFixTriggeredRef.current ? (
                <PreviewErrorScreen
                  previewError={startup.previewError}
                  terminalOutput={terminalOutput}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorToChat}
                  topInset={insets.top}
                  t={t}
                />
              ) : serverStatus === 'stopped' && startup.previewError && (autoFix.isFixing || autoFixTriggeredRef.current) ? (
                <PreviewLoadingScreen
                  previewError={null}
                  previewLogs={startup.previewLogs}
                  terminalOutput={terminalOutput}
                  displayedMessage={autoFix.statusMessage || 'Risolvo il problema...'}
                  startingMessage={`Tentativo ${autoFix.fixAttempt}...`}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorToChat}
                  topInset={insets.top}
                  t={t}
                />
              ) : serverStatus === 'stopped' ? (
                <PreviewStartScreen
                  currentWorkstation={currentWorkstation}
                  isStartTransitioning={startup.isStartTransitioning}
                  startTransitionAnim={startup.startTransitionAnim}
                  onStartWithTransition={handleStartWithTransition}
                  t={t}
                />
              ) : serverStatus === 'checking' ? (
                /* During 'checking', show ONLY loading screen — no WebView.
                   checkServerStatus is polling; WebView would just cause
                   conflicting error detection. WebView mounts only after
                   checkServerStatus confirms the server is truly responsive. */
                <PreviewLoadingScreen
                  previewError={startup.previewError}
                  previewLogs={startup.previewLogs}
                  terminalOutput={terminalOutput}
                  displayedMessage={autoFix.isFixing ? autoFix.statusMessage : startup.displayedMessage}
                  startingMessage={startup.startingMessage}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorToChat}
                  topInset={insets.top}
                  t={t}
                />
              ) : (
                <PreviewWebView
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
                  terminalOutput={terminalOutput}
                  terminalScrollRef={terminalScrollRef}
                  maskOpacityAnim={startup.maskOpacityAnim}
                  previewError={startup.previewError}
                  previewLogs={startup.previewLogs}
                  displayedMessage={autoFix.isFixing ? autoFix.statusMessage : startup.displayedMessage}
                  startingMessage={startup.startingMessage}
                  smoothProgress={startup.smoothProgress}
                  elapsedSeconds={startup.elapsedSeconds}
                  pulseAnim={startup.pulseAnim}
                  setIsLoading={setIsLoading}
                  setCanGoBack={setCanGoBack}
                  setCanGoForward={setCanGoForward}
                  setWebViewReady={setWebViewReady}
                  setCurrentPreviewUrl={setCurrentPreviewUrl}
                  setSelectedElement={chat.setSelectedElement}
                  setPreviewError={startup.setPreviewError}
                  setServerStatus={setServerStatus}
                  setIsStarting={startup.setIsStarting}
                  handleRefresh={handleRefresh}
                  onClose={handleClose}
                  onRetryPreview={handleRetryPreview}
                  onSendErrorReport={sendErrorToChat}
                  onEnvError={redirectToEnvVarsWithError}
                  onJsError={(msg: string) => { if (!preflightDoneRef.current) jsErrorsRef.current.push(msg); }}
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

          {serverStatus === 'running' && webViewReady && (
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
