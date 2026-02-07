import React from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PreviewLoadingScreen } from './PreviewServerStatus';
import { PreviewLog } from '../../../hooks/api/usePreviewLogs';

export interface PreviewWebViewProps {
  // WebView config
  webViewRef: React.RefObject<WebView>;
  currentPreviewUrl: string;
  coderToken: string | null;
  globalFlyMachineId: string | null;
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

  // Callbacks
  setIsLoading: (v: boolean) => void;
  setCanGoBack: (v: boolean) => void;
  setCanGoForward: (v: boolean) => void;
  setWebViewReady: (v: boolean) => void;
  setCurrentPreviewUrl: (url: string) => void;
  setSelectedElement: (el: any) => void;
  setPreviewError: (e: { message: string; timestamp: Date } | null) => void;
  setServerStatus: (s: 'checking' | 'running' | 'stopped') => void;
  setIsStarting: (v: boolean) => void;
  handleRefresh: () => void;

  // Error / Loading screen callbacks
  onClose: () => void;
  onRetryPreview: () => void;
  onSendErrorReport: () => void;
  isSendingReport: boolean;
  reportSent: boolean;
  topInset: number;

  t: ReturnType<typeof useTranslation>['t'];
}

export const PreviewWebView: React.FC<PreviewWebViewProps> = ({
  webViewRef,
  currentPreviewUrl,
  coderToken,
  globalFlyMachineId,
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
  setIsLoading,
  setCanGoBack,
  setCanGoForward,
  setWebViewReady,
  setCurrentPreviewUrl,
  setSelectedElement,
  setPreviewError,
  setServerStatus,
  setIsStarting,
  handleRefresh,
  onClose,
  onRetryPreview,
  onSendErrorReport,
  isSendingReport,
  reportSent,
  topInset,
  t,
}) => {
  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0c' }}>
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
                  ...(globalFlyMachineId ? { 'Fly-Force-Instance-Id': globalFlyMachineId } : {}),
                  'Cookie': `drape_vm_id=${globalFlyMachineId || ''}; session_token=${coderToken || ''}; coder_session_token=${coderToken || ''}`,
                  ...(flyMachineIdRef.current ? {
                    'X-Drape-VM-Id': flyMachineIdRef.current,
                    'Fly-Force-Instance-Id': flyMachineIdRef.current
                  } : {})
                }
              }}
              sharedCookiesEnabled={true}
              thirdPartyCookiesEnabled={true}
              style={styles.webView}

              injectedJavaScriptBeforeContentLoaded={`
              (function() {
                var token = ${JSON.stringify(coderToken || '')};
                var vmId = ${JSON.stringify(globalFlyMachineId || '')};

                // Set cookies
                if (token) {
                  document.cookie = "coder_session_token=" + token + "; path=/; SameSite=Lax";
                  document.cookie = "session_token=" + token + "; path=/; SameSite=Lax";
                }
                if (vmId) {
                  document.cookie = "drape_vm_id=" + vmId + "; path=/; SameSite=Lax";
                }

                // Prevent zoom out below 1.0 — force viewport
                var existingMeta = document.querySelector('meta[name="viewport"]');
                if (existingMeta) {
                  var content = existingMeta.getAttribute('content') || '';
                  if (content.indexOf('minimum-scale') === -1) {
                    existingMeta.setAttribute('content', content + ', minimum-scale=1.0');
                  } else {
                    existingMeta.setAttribute('content', content.replace(/minimum-scale=[0-9.]+/, 'minimum-scale=1.0'));
                  }
                } else {
                  var meta = document.createElement('meta');
                  meta.name = 'viewport';
                  meta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';
                  if (document.head) document.head.appendChild(meta);
                  else document.addEventListener('DOMContentLoaded', function() { document.head.appendChild(meta); });
                }

                // Dark background
                if (document.head) {
                  var style = document.createElement('style');
                  style.innerHTML = 'html, body { background-color: #0a0a0a !important; }';
                  document.head.appendChild(style);
                }

                // Check for React/Next.js mount
                var checkCount = 0;
                var checkInterval = setInterval(function() {
                  checkCount++;
                  if (document.body) {
                    // Support multiple root element IDs
                    var root = document.getElementById('root') ||
                               document.getElementById('__next') ||
                               document.querySelector('[data-reactroot]') ||
                               document.querySelector('[id^="app"]');
                    var rootChildren = root ? root.children.length : 0;
                    var text = document.body.innerText || '';

                    // Check for blockers
                    if (text.indexOf("Blocked request") !== -1 || text.indexOf("404 (Gateway)") !== -1) {
                      clearInterval(checkInterval);
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TRIGGER_REFRESH' }));
                      return;
                    }

                    // React/Next.js mounted - or any content in body
                    if ((root && rootChildren > 0) || document.body.children.length > 2) {
                      clearInterval(checkInterval);
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' }));
                    }

                    // Shorter timeout - 10 seconds (20 checks * 500ms)
                    if (checkCount >= 20) {
                      clearInterval(checkInterval);
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' }));
                    }
                  }
                }, 500);
              })();
              true;
            `}

              onLoadStart={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.log('WebView load start:', nativeEvent.url);
                if (serverStatus !== 'running') {
                  setWebViewReady(false);
                }
                setIsLoading(true);
              }}
              onLoadEnd={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.log('WebView load end:', nativeEvent.url);
                // Detect JSON error responses from preview proxy (e.g. ECONNREFUSED)
                webViewRef.current?.injectJavaScript(`
               (function() {
                 try {
                   var bodyText = document.body && document.body.innerText && document.body.innerText.trim();
                   if (bodyText && bodyText.charAt(0) === '{' && bodyText.indexOf('"error"') !== -1) {
                     var parsed = JSON.parse(bodyText);
                     if (parsed.error) {
                       window.ReactNativeWebView?.postMessage(JSON.stringify({
                         type: 'PREVIEW_ERROR',
                         message: parsed.error + (parsed.message ? ': ' + parsed.message : '')
                       }));
                     }
                   }
                 } catch(e) {}
               })();
               true;
             `);
                webViewRef.current?.injectJavaScript(`
               (function() {
                 window.addEventListener('error', function(e) {
                   window.ReactNativeWebView?.postMessage(JSON.stringify({
                     type: 'JS_ERROR',
                     message: e.message
                   }));
                 });

                 // Support multiple root element IDs
                 const root = document.getElementById('root') ||
                              document.getElementById('__next') ||
                              document.querySelector('[data-reactroot]') ||
                              document.querySelector('[id^="app"]');
                 const rootChildren = root ? root.children.length : 0;

                 let attempts = 0;
                 const maxAttempts = 20; // Reduced from 40 to 20 (10 seconds max)

                 function checkContent() {
                   attempts++;
                   try {
                     const root = document.getElementById('root') ||
                                  document.getElementById('__next') ||
                                  document.querySelector('[data-reactroot]') ||
                                  document.querySelector('[id^="app"]');
                     // Check root children OR any substantial body content
                     const rootChildren = root ? root.children.length : 0;
                     const hasContent = (rootChildren > 0) || (document.body.children.length > 2);

                     if (hasContent) {
                       window.ReactNativeWebView?.postMessage(JSON.stringify({
                         type: 'PAGE_INFO',
                         hasContent: hasContent,
                         rootChildren: rootChildren,
                         forceReady: false
                       }));
                       return true;
                     }

                     // Force ready after max attempts
                     if (attempts >= maxAttempts) {
                       window.ReactNativeWebView?.postMessage(JSON.stringify({
                         type: 'PAGE_INFO',
                         hasContent: true,
                         rootChildren: 0,
                         forceReady: true
                       }));
                       return true;
                     }
                   } catch(e) {}
                   return false;
                 }

                 if (!checkContent()) {
                   const interval = setInterval(function() {
                     if (checkContent()) clearInterval(interval);
                   }, 500);
                 }


               })();
               true;
             `);
                setIsLoading(false);
              }}

              onLoadProgress={({ nativeEvent }) => {
                if (nativeEvent.progress === 1) setIsLoading(false);
              }}
              onNavigationStateChange={(navState) => {
                setCanGoBack(navState.canGoBack);
                setCanGoForward(navState.canGoForward);
                setIsLoading(navState.loading);
              }}
              onShouldStartLoadWithRequest={(request) => {
                const url = request.url;
                // Extract the preview base path from currentPreviewUrl
                const previewBase = currentPreviewUrl.split('?')[0].replace(/\/$/, '');
                const previewPathMatch = previewBase.match(/\/preview\/[^\/]+/);
                const previewPath = previewPathMatch ? previewPathMatch[0] : null;

                // If navigating to drape.info but NOT within the preview path, rewrite it
                if (previewPath && url.includes('drape.info') && !url.includes(previewPath)) {
                  // Extract the path from the URL (e.g., /login from https://drape.info/login)
                  const urlObj = new URL(url);
                  const targetPath = urlObj.pathname;

                  // Don't intercept preview paths or special routes
                  if (!targetPath.startsWith('/preview/') && !targetPath.startsWith('/_next/') && !targetPath.startsWith('/@')) {
                    // Rewrite to stay within preview
                    const newUrl = `https://drape.info${previewPath}${targetPath}${urlObj.search}`;
                    console.log(`[Preview] Rewriting navigation: ${url} -> ${newUrl}`);
                    setCurrentPreviewUrl(newUrl);
                    return false; // Block original navigation, we'll load the rewritten URL
                  }
                }
                return true; // Allow all other navigations
              }}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);

                  if (data.type === 'WEBVIEW_READY') {
                    setWebViewReady(true);
                  }
                  if (data.type === 'PREVIEW_ERROR') {
                    // WebView loaded a JSON error from the proxy -- show error UI
                    console.error('WebView detected proxy error:', data.message);
                    const rawMsg = data.message || '';
                    let userMsg = rawMsg;
                    // Translate common proxy errors to user-friendly Italian messages
                    if (rawMsg.includes('ECONNREFUSED')) {
                      userMsg = t('terminal:preview.errorServerFailed');
                    } else if (rawMsg.includes('timeout') || rawMsg.includes('Timeout')) {
                      userMsg = t('terminal:preview.errorTimeout');
                    } else if (rawMsg.includes('ENOTFOUND') || rawMsg.includes('EHOSTUNREACH')) {
                      userMsg = t('terminal:preview.errorContainerUnreachable');
                    }
                    setPreviewError({ message: userMsg, timestamp: new Date() });
                    setServerStatus('stopped');
                    setIsStarting(false);
                  }
                  if (data.type === 'TRIGGER_REFRESH') {
                    handleRefresh();
                  }
                  if (data.type === 'PAGE_INFO') {
                    if (data.rootChildren > 0 || data.forceReady) {
                      if (!webViewReady) setTimeout(() => setWebViewReady(true), 1000);
                    }
                  }
                  if (data.type === 'ELEMENT_SELECTED') {
                    const el = data.element;
                    let elementSelector = `<${el.tag}>`;
                    if (el.id) elementSelector = `<${el.tag}#${el.id}>`;
                    else if (el.className) {
                      const classNameStr = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
                      const classes = classNameStr.split(' ').filter((c: string) => c && !c.startsWith('__inspector')).slice(0, 2);
                      if (classes.length > 0) elementSelector = `<${el.tag}.${classes.join('.')}>`;
                    }
                    // Always update selection to the new element (replaces previous)
                    setSelectedElement({ selector: elementSelector, text: (el.text?.trim()?.substring(0, 40) || '') + (el.text?.length > 40 ? '...' : ''), tag: el.tag, className: typeof el.className === 'string' ? el.className : (el.className?.baseVal || ''), id: el.id, innerHTML: el.innerHTML });
                    // Stay in inspect mode -- user exits by pressing the button again
                  }
                } catch (error) { }
              }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={false}
              scalesPageToFit={true}
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
            <View style={{ flex: 1, backgroundColor: '#0a0a0c' }} />
          )
        ) : (
          /* Terminal Output View for CLI projects */
          <ScrollView
            ref={terminalScrollRef}
            style={styles.terminalOutputContainer}
            contentContainerStyle={styles.terminalOutputContent}
          >
            <View style={styles.terminalHeader}>
              <View style={styles.terminalDot} />
              <View style={[styles.terminalDot, { backgroundColor: '#f5c542' }]} />
              <View style={[styles.terminalDot, { backgroundColor: '#5ac05a' }]} />
              <Text style={styles.terminalTitle}>Terminal Output</Text>
            </View>
            {terminalOutput.length === 0 ? (
              <View style={styles.terminalEmpty}>
                <Ionicons name="terminal" size={48} color="rgba(255,255,255,0.2)" />
                <Text style={styles.terminalEmptyText}>
                  {t('terminal:preview.noWebUI')}
                </Text>
              </View>
            ) : (
              (terminalOutput || []).map((line, index) => {
                // Detect line type from prefix (system messages start with emoji)
                const isSystem = line.startsWith('\uD83D\uDE80') || line.startsWith('\uD83D\uDD04') || line.startsWith('\u23F9\uFE0F') || line.startsWith('\u274C');
                const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('warn');
                const lineColor = isSystem ? '#6366f1' : isError ? '#f87171' : '#e0e0e0';
                return (
                  <Text key={index} style={[styles.terminalLine, { color: lineColor }]}>
                    {line}
                  </Text>
                );
              })
            )}
          </ScrollView>
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
          displayedMessage={displayedMessage}
          startingMessage={startingMessage}
          smoothProgress={smoothProgress}
          elapsedSeconds={elapsedSeconds}
          pulseAnim={pulseAnim}
          onClose={onClose}
          onRetryPreview={onRetryPreview}
          onSendErrorReport={onSendErrorReport}
          isSendingReport={isSendingReport}
          reportSent={reportSent}
          topInset={topInset}
          t={t}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  webView: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  // Terminal output styles for CLI projects
  terminalOutputContainer: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  terminalOutputContent: {
    padding: 16,
    paddingBottom: 100,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  terminalDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff5f56',
    marginRight: 8,
  },
  terminalTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginRight: 44,
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
  terminalLine: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#e0e0e0',
    lineHeight: 18,
    marginBottom: 2,
  },
});
