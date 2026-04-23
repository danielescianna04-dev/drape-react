/**
 * PreviewSurfaceWeb — Wraps the existing PreviewWebView for web preview.
 * This is a thin pass-through that isolates the "web preview surface"
 * concept from the panel orchestration.
 *
 * NOTE: The actual WebView rendering is still done by PreviewWebView
 * in the components/ folder. This component exists to provide a clean
 * boundary for the capability-based branching in PreviewPanel.
 */
import React from 'react';
import { ScrollView, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import type { PreviewLog } from '../../../../hooks/api/usePreviewLogs';
import type { PreviewWebViewEvent } from '../../preview/webview/previewWebViewEvents';
import type { ViewportMode } from '../../components/PreviewToolbar';
import { PreviewWebView } from '../../components/PreviewWebView';
import type { useTranslation } from 'react-i18next';

// ── Props ──────────────────────────────────────────────────

export interface PreviewSurfaceWebProps {
  webViewRef: React.RefObject<WebView>;
  currentPreviewUrl: string;
  coderToken: string | null;
  globalFlyMachineId: string | null;
  previewAccessToken: string | null;
  flyMachineIdRef: React.MutableRefObject<string | null>;
  hasWebUI: boolean;
  webViewReady: boolean;
  serverStatus: 'checking' | 'running' | 'stopped';
  isLoading: boolean;
  terminalOutput: string[];
  terminalScrollRef: React.RefObject<ScrollView>;
  maskOpacityAnim: Animated.Value;
  previewError: { message: string; timestamp: Date } | null;
  previewLogs: PreviewLog[];
  displayedMessage: string;
  startingMessage: string;
  smoothProgress: number;
  elapsedSeconds: number;
  pulseAnim: Animated.Value;
  onPreviewEvent: (event: PreviewWebViewEvent) => void;
  setIsLoading: (v: boolean) => void;
  setCurrentPreviewUrl: (url: string) => void;
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  topInset: number;
  viewportMode: ViewportMode;
  projectId: string;
  wsUrl: string;
  authToken: string | null;
  startCommand?: string;
  forceReloadKey?: number;
  t: ReturnType<typeof useTranslation>['t'];
}

// ── Component ──────────────────────────────────────────────

export const PreviewSurfaceWeb: React.FC<PreviewSurfaceWebProps> = (props) => {
  return (
    <PreviewWebView
      webViewRef={props.webViewRef}
      currentPreviewUrl={props.currentPreviewUrl}
      coderToken={props.coderToken}
      globalFlyMachineId={props.globalFlyMachineId}
      previewAccessToken={props.previewAccessToken}
      flyMachineIdRef={props.flyMachineIdRef}
      hasWebUI={props.hasWebUI}
      webViewReady={props.webViewReady}
      serverStatus={props.serverStatus}
      isLoading={props.isLoading}
      terminalOutput={props.terminalOutput}
      terminalScrollRef={props.terminalScrollRef}
      maskOpacityAnim={props.maskOpacityAnim}
      previewError={props.previewError}
      previewLogs={props.previewLogs}
      displayedMessage={props.displayedMessage}
      startingMessage={props.startingMessage}
      smoothProgress={props.smoothProgress}
      elapsedSeconds={props.elapsedSeconds}
      pulseAnim={props.pulseAnim}
      onPreviewEvent={props.onPreviewEvent}
      setIsLoading={props.setIsLoading}
      setCurrentPreviewUrl={props.setCurrentPreviewUrl}
      onClose={props.onClose}
      onRetryPreview={props.onRetryPreview}
      onSendErrorReport={props.onSendErrorReport}
      topInset={props.topInset}
      viewportMode={props.viewportMode}
      projectId={props.projectId}
      wsUrl={props.wsUrl}
      authToken={props.authToken}
      startCommand={props.startCommand}
      forceReloadKey={props.forceReloadKey}
      t={props.t}
    />
  );
};
