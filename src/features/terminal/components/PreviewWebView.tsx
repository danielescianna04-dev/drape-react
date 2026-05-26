import React from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PreviewLoadingScreen } from './PreviewServerStatus';
import { PreviewLog } from '../../../hooks/api/usePreviewLogs';
import type { ViewportMode } from './PreviewToolbar';
import { TerminalWebView } from './TerminalWebView';
import { PreviewWebViewEvent, parseWebViewMessage } from '../preview/webview/previewWebViewEvents';
import {
  buildPreviewInjectedScript,
  buildPostLoadDetectionScript,
  buildRenderHeartbeatScript,
  buildViewportSwitchScript,
} from '../preview/webview/previewWebViewInjectedScript';
import { evaluateNavigation } from '../preview/webview/previewWebViewBridge';

export interface PreviewWebViewProps {
  // WebView config
  webViewRef: React.RefObject<WebView>;
  currentPreviewUrl: string;
  coderToken: string | null;
  globalFlyMachineId: string | null;
  previewAccessToken: string | null;
  flyMachineIdRef: React.MutableRefObject<string | null>;

  // State
  hasWebUI: boolean;
  webViewReady: boolean;
  serverStatus: 'checking' | 'running' | 'stopped';
  isLoading: boolean;
  terminalOutput: string[];
  terminalScrollRef: React.RefObject<ScrollView>;

  // Loading mask
  maskOpacityAnim: Animated.Value;
  previewError: { message: string; timestamp: Date } | null;
  previewLogs: PreviewLog[];
  displayedMessage: string;
  startingMessage: string;
  smoothProgress: number;
  elapsedSeconds: number;
  pulseAnim: Animated.Value;

  // Incrementing counter — when it changes the WebView bypasses the same-URL
  // reload block so a transient-error retry can actually reload the page.
  forceReloadKey?: number;

  // Callbacks — structured event emitter replaces individual setters
  onPreviewEvent: (event: PreviewWebViewEvent) => void;
  setIsLoading: (v: boolean) => void;
  setCurrentPreviewUrl: (url: string) => void;

  // Error / Loading screen callbacks
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  topInset: number;
  viewportMode: ViewportMode;

  // Interactive terminal (console projects)
  projectId?: string;
  wsUrl?: string;
  authToken?: string | null;
  startCommand?: string;

  t: ReturnType<typeof useTranslation>['t'];
}

const MAX_REWRITES = 3;

export const PreviewWebView: React.FC<PreviewWebViewProps> = React.memo(({
  webViewRef,
  currentPreviewUrl,
  coderToken,
  globalFlyMachineId,
  previewAccessToken,
  flyMachineIdRef,
  hasWebUI,
  webViewReady,
  serverStatus,
  isLoading,
  terminalOutput,
  terminalScrollRef,
  maskOpacityAnim,
  previewError,
  previewLogs,
  displayedMessage,
  startingMessage,
  smoothProgress,
  elapsedSeconds,
  pulseAnim,
  onPreviewEvent,
  setIsLoading,
  setCurrentPreviewUrl,
  onClose,
  onRetryPreview,
  onSendErrorReport,
  topInset,
  viewportMode,
  projectId,
  wsUrl,
  authToken,
  startCommand,
  forceReloadKey,
  t,
}) => {
  const readyFallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewriteCountRef = React.useRef(0);
  const initialLoadDoneRef = React.useRef(false);
  const lastLoadedUrlRef = React.useRef<string>('');

  // Reset counters when URL or server status changes
  React.useEffect(() => {
    rewriteCountRef.current = 0;
    initialLoadDoneRef.current = false;
    lastLoadedUrlRef.current = '';
  }, [currentPreviewUrl, serverStatus]);

  // Honor force-reload token from parent: clear same-URL lock, then reload.
  const prevForceReloadKey = React.useRef<number | undefined>(forceReloadKey);
  React.useEffect(() => {
    if (forceReloadKey === undefined) return;
    if (prevForceReloadKey.current === forceReloadKey) return;
    prevForceReloadKey.current = forceReloadKey;
    lastLoadedUrlRef.current = '';
    try { webViewRef.current?.reload(); } catch { /* no-op */ }
  }, [forceReloadKey]);

  // Switch viewport at runtime when user toggles desktop/mobile
  React.useEffect(() => {
    if (!webViewRef.current || serverStatus !== 'running') return;
    webViewRef.current.injectJavaScript(buildViewportSwitchScript(viewportMode === 'desktop'));
  }, [viewportMode]);

  React.useEffect(() => {
    return () => {
      if (readyFallbackTimerRef.current) {
        clearTimeout(readyFallbackTimerRef.current);
        readyFallbackTimerRef.current = null;
      }
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      {/* LIVE APP LAYER (Below) */}
      <View style={StyleSheet.absoluteFill}>
        {hasWebUI ? (
          currentPreviewUrl && (currentPreviewUrl.startsWith('http://') || currentPreviewUrl.startsWith('https://')) ? (
            <WebView
              key={coderToken || 'init'}
              ref={webViewRef}
              source={{
                uri: currentPreviewUrl,
                headers: {
                  'Coder-Session-Token': coderToken || '',
                  'session_token': coderToken || '',
                  ...(previewAccessToken ? { 'X-Bynot-Preview-Token': previewAccessToken } : {}),
                  ...(globalFlyMachineId ? { 'Fly-Force-Instance-Id': globalFlyMachineId } : {}),
                  'cookie': `bynot_vm_id=${globalFlyMachineId || ''}; fly-force-instance-id=${globalFlyMachineId || ''}; session_token=${coderToken || ''}; coder_session_token=${coderToken || ''}; bynot_preview_token=${previewAccessToken || ''}`,
                  ...(flyMachineIdRef.current ? {
                    'X-Bynot-VM-Id': flyMachineIdRef.current,
                    'Fly-Force-Instance-Id': flyMachineIdRef.current
                  } : {})
                }
              }}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              style={styles.webView}

              injectedJavaScriptBeforeContentLoaded={buildPreviewInjectedScript({
                coderToken: coderToken || '',
                globalFlyMachineId: globalFlyMachineId || '',
                previewAccessToken: previewAccessToken || '',
                isDesktopMode: viewportMode === 'desktop',
              })}

              onLoadStart={() => {
                if (readyFallbackTimerRef.current) {
                  clearTimeout(readyFallbackTimerRef.current);
                  readyFallbackTimerRef.current = null;
                }
                setIsLoading(true);
              }}
              onLoadEnd={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                lastLoadedUrlRef.current = nativeEvent.url;
                if (!initialLoadDoneRef.current) {
                  initialLoadDoneRef.current = true;
                }
                // Inject post-load detection script
                webViewRef.current?.injectJavaScript(buildPostLoadDetectionScript());
                // Install the render heartbeat so the host can decide if
                // HMR already applied a file change (mutation observed) or
                // if the user needs to tap Reload (no mutation within window).
                webViewRef.current?.injectJavaScript(buildRenderHeartbeatScript());
                setIsLoading(false);
              }}

              onLoadProgress={({ nativeEvent }) => {
                if (nativeEvent.progress >= 0.85) setIsLoading(false);
              }}
              onNavigationStateChange={(navState) => {
                onPreviewEvent({
                  type: 'navigation_state',
                  canGoBack: navState.canGoBack,
                  canGoForward: navState.canGoForward,
                  url: navState.url,
                });
                if (!webViewReady || !navState.loading) {
                  setIsLoading(navState.loading);
                }
              }}
              onShouldStartLoadWithRequest={(request) => {
                const decision = evaluateNavigation({
                  requestUrl: request.url,
                  currentPreviewUrl,
                  lastLoadedUrl: lastLoadedUrlRef.current,
                  initialLoadDone: initialLoadDoneRef.current,
                  rewriteCount: rewriteCountRef.current,
                  maxRewrites: MAX_REWRITES,
                });

                if (decision.allow === true) return true;

                switch (decision.reason) {
                  case 'same_url_reload':
                    console.log('[Preview] Blocked same-URL reload (Vite HMR)');
                    return false;
                  case 'rewrite':
                    rewriteCountRef.current++;
                    console.log(`[Preview] Rewriting navigation: ${request.url} -> ${decision.rewrittenUrl}`);
                    setCurrentPreviewUrl(decision.rewrittenUrl);
                    return false;
                }
                return true;
              }}
              onMessage={(event) => {
                const parsed = parseWebViewMessage(event.nativeEvent.data);
                if (!parsed) return;

                // Manage the ready fallback timer for ready/page_info events
                if (parsed.type === 'ready' || parsed.type === 'page_info') {
                  if (readyFallbackTimerRef.current) {
                    clearTimeout(readyFallbackTimerRef.current);
                    readyFallbackTimerRef.current = null;
                  }
                }

                // Emit the structured event to the parent
                onPreviewEvent(parsed);
              }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={false}
              bounces={false}
              mixedContentMode="compatibility"
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              originWhitelist={['https://', 'http://']}
              renderToHardwareTextureAndroid={true}
              shouldRasterizeIOS={true}
              cacheEnabled={true}
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: '#ffffff' }} />
          )
        ) : (
          /* Interactive Terminal for CLI projects */
          projectId && wsUrl && authToken ? (
            <TerminalWebView
              projectId={projectId}
              wsUrl={wsUrl}
              authToken={authToken}
              startCommand={startCommand}
            />
          ) : (
            <View style={styles.terminalEmpty}>
              <Ionicons name="terminal" size={48} color="rgba(255,255,255,0.2)" />
              <Text style={styles.terminalEmptyText}>
                {t('terminal:preview.noWebUI')}
              </Text>
            </View>
          )
        )}
      </View>

      {/* LOADING SPIRIT MASK (Above) */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: maskOpacityAnim },
          webViewReady && { pointerEvents: 'none' }
        ]}
      >
        <PreviewLoadingScreen
          previewError={previewError}
          previewLogs={previewLogs}
          terminalOutput={terminalOutput}
          displayedMessage={displayedMessage}
          startingMessage={startingMessage}
          smoothProgress={smoothProgress}
          elapsedSeconds={elapsedSeconds}
          pulseAnim={pulseAnim}
          onClose={onClose}
          onRetryPreview={onRetryPreview}
          onSendErrorReport={onSendErrorReport}
          topInset={topInset}
          t={t}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  webView: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  terminalEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  terminalEmptyText: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    lineHeight: 22,
  },
});
