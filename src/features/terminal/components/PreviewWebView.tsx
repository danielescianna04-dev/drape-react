import React from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PreviewLoadingScreen } from './PreviewServerStatus';
import { PreviewLog } from '../../../hooks/api/usePreviewLogs';
import type { ViewportMode } from './PreviewToolbar';
import { TerminalWebView } from './TerminalWebView';
import { tracciaErroreAnteprima, tracciaElementoSelezionato } from '../../../core/services/analyticsService';

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
  onEnvError?: (message: string) => void;
  onJsError?: (message: string) => void;
  topInset: number;
  viewportMode: ViewportMode;

  // Interactive terminal (console projects)
  projectId?: string;
  wsUrl?: string;
  authToken?: string | null;
  startCommand?: string;

  t: ReturnType<typeof useTranslation>['t'];
}

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
  onEnvError,
  onJsError,
  topInset,
  viewportMode,
  projectId,
  wsUrl,
  authToken,
  startCommand,
  t,
}) => {
  // Detect env-related error messages from the WebView
  const isEnvRelatedMessage = (msg: string): boolean => {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    return lower.includes('missing value') ||
      lower.includes('apikey') ||
      lower.includes('api key') ||
      lower.includes('api_key') ||
      lower.includes('environment variable') ||
      lower.includes('env variable') ||
      lower.includes('not defined') ||
      lower.includes('is not set') ||
      lower.includes('is undefined') ||
      lower.includes('process.env') ||
      /\b(NEXT_PUBLIC_|REACT_APP_|VITE_|NUXT_)\w+/.test(msg);
  };

  // Safety-net retry for transient proxy errors that slip past checkServerStatus
  const proxyRetryCountRef = React.useRef(0);
  const MAX_PROXY_RETRIES = 5;
  const readyFallbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard against infinite rewrite loops in onShouldStartLoadWithRequest
  const rewriteCountRef = React.useRef(0);
  const MAX_REWRITES = 3;

  // Reset retry counters when URL or server status changes
  React.useEffect(() => {
    proxyRetryCountRef.current = 0;
    rewriteCountRef.current = 0;
  }, [currentPreviewUrl, serverStatus]);

  // Switch viewport at runtime when user toggles desktop/mobile
  React.useEffect(() => {
    if (!webViewRef.current || serverStatus !== 'running') return;
    const isDesktop = viewportMode === 'desktop';
    const content = isDesktop
      ? 'width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=1.0, user-scalable=no'
      : 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no';
    webViewRef.current.injectJavaScript(`
      (function() {
        var meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
          meta.setAttribute('content', '${content}');
        } else {
          meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = '${content}';
          document.head.appendChild(meta);
        }
      })();
      true;
    `);
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
                  ...(previewAccessToken ? { 'X-Drape-Preview-Token': previewAccessToken } : {}),
                  ...(globalFlyMachineId ? { 'Fly-Force-Instance-Id': globalFlyMachineId } : {}),
                  // IMPORTANT: lowercase 'cookie' key triggers react-native-webview native code
                  // (RNCWebViewImpl.m:849) to write cookies into WKHTTPCookieStore.
                  // Uppercase 'Cookie' only sets the header on the initial request but cookies
                  // are lost on redirects. Lowercase writes to the store so cookies persist
                  // across ALL requests (redirects, sub-resources, navigations).
                  'cookie': `drape_vm_id=${globalFlyMachineId || ''}; fly-force-instance-id=${globalFlyMachineId || ''}; session_token=${coderToken || ''}; coder_session_token=${coderToken || ''}; drape_preview_token=${previewAccessToken || ''}`,
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
                if (window.__drapeInit) return; window.__drapeInit = true;
                var token = ${JSON.stringify(coderToken || '')};
                var vmId = ${JSON.stringify(globalFlyMachineId || '')};
                var previewToken = ${JSON.stringify(previewAccessToken || '')};

                // Set cookies
                if (token) {
                  document.cookie = "coder_session_token=" + token + "; path=/; SameSite=Lax";
                  document.cookie = "session_token=" + token + "; path=/; SameSite=Lax";
                }
                if (vmId) {
                  document.cookie = "drape_vm_id=" + vmId + "; path=/; SameSite=Lax";
                  document.cookie = "fly-force-instance-id=" + vmId + "; path=/; SameSite=Lax";
                }
                if (previewToken) {
                  document.cookie = "drape_preview_token=" + previewToken + "; path=/; SameSite=Lax";
                }

                // Set viewport based on mode (mobile or desktop)
                var isDesktopMode = ${JSON.stringify(viewportMode === 'desktop')};
                var viewportContent = isDesktopMode
                  ? 'width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=1.0, user-scalable=no'
                  : 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no';
                var existingMeta = document.querySelector('meta[name="viewport"]');
                if (existingMeta) {
                  existingMeta.setAttribute('content', viewportContent);
                } else {
                  var meta = document.createElement('meta');
                  meta.name = 'viewport';
                  meta.content = viewportContent;
                  if (document.head) document.head.appendChild(meta);
                  else document.addEventListener('DOMContentLoaded', function() { document.head.appendChild(meta); });
                }

                // White background (most generated apps use white)
                if (document.head) {
                  var style = document.createElement('style');
                  style.textContent = 'html, body { background-color: #ffffff !important; -webkit-tap-highlight-color: transparent; } * { touch-action: pan-x pan-y; }';
                  document.head.appendChild(style);
                }

                // Fix iOS keyboard pushing content up
                if (window.visualViewport) {
                  window.visualViewport.addEventListener('resize', function() {
                    var vh = window.visualViewport.height;
                    document.documentElement.style.height = vh < window.innerHeight ? vh + 'px' : '';
                    document.body.style.height = vh < window.innerHeight ? vh + 'px' : '';
                  });
                }

                // Single lightweight ready check — no polling, uses requestAnimationFrame
                var readySent = false;
                function checkReady() {
                  if (readySent) return;
                  var root = document.getElementById('root') || document.getElementById('__next') ||
                             document.getElementById('__nuxt') || document.querySelector('[id^="app"]');
                  var isFlutter = !!document.querySelector('flutter-view, flt-glass-pane');
                  var hasContent = isFlutter || (root ? root.children.length > 0 && (root.innerText || '').trim().length > 0 : document.body && document.body.children.length > 2);
                  if (hasContent) {
                    readySent = true;
                    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' }));
                  }
                }
                // Check on DOMContentLoaded and load
                document.addEventListener('DOMContentLoaded', checkReady);
                window.addEventListener('load', checkReady);
                // Fallback: check a few times with rAF then give up after 5s
                var rafCount = 0;
                function rafCheck() {
                  if (readySent || rafCount++ > 30) { if (!readySent) { readySent = true; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' })); } return; }
                  checkReady();
                  if (!readySent) requestAnimationFrame(rafCheck);
                }
                requestAnimationFrame(rafCheck);
                setTimeout(function() { if (!readySent) { readySent = true; window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEBVIEW_READY' })); } }, 5000);
              })();
              true;
            `}

              onLoadStart={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.log('WebView load start:', nativeEvent.url);
                if (readyFallbackTimerRef.current) {
                  clearTimeout(readyFallbackTimerRef.current);
                  readyFallbackTimerRef.current = null;
                }
                if (serverStatus !== 'running') {
                  setWebViewReady(false);
                }
                setIsLoading(true);
              }}
              onLoadEnd={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                const finalUrl = nativeEvent.url;
                console.log('WebView load end:', finalUrl);

                // Lightweight error detection + content check (single injection, no polling)
                webViewRef.current?.injectJavaScript(`
               (function() {
                 try {
                   var bodyText = (document.body && document.body.innerText || '').trim();
                   // JSON proxy errors
                   if (bodyText.charAt(0) === '{' && bodyText.indexOf('"error"') !== -1) {
                     try {
                       var p = JSON.parse(bodyText);
                       if (p.error) { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'PREVIEW_ERROR', message: p.error + (p.message ? ': ' + p.message : '') })); return; }
                     } catch(e) {}
                   }
                   // Build errors
                   var lower = bodyText.toLowerCase();
                   if (lower.indexOf('failed to compile') !== -1 || lower.indexOf('build error') !== -1 || lower.indexOf('module not found') !== -1 || document.querySelector('vite-error-overlay')) {
                     window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'BUILD_ERROR', message: bodyText.substring(0, 500) }));
                   }
                 } catch(e) {}

                 // Error listeners (lightweight, no polling)
                 window.addEventListener('error', function(e) {
                   window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'JS_ERROR', message: e.message }));
                 });

                 // Auto-dismiss error overlays once (no MutationObserver, no setInterval)
                 setTimeout(function() {
                   var overlay = document.querySelector('nextjs-portal, [data-nextjs-dialog], vite-error-overlay, #webpack-dev-server-client-overlay');
                   if (overlay) {
                     var text = overlay.innerText || overlay.textContent || '';
                     if (text) window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'RUNTIME_ENV_ERROR', message: text.substring(0, 500) }));
                     overlay.style.display = 'none';
                     var backdrop = document.getElementById('webpack-dev-server-client-overlay-div');
                     if (backdrop) backdrop.style.display = 'none';
                   }
                 }, 2000);

                 // Content ready signal
                 var root = document.getElementById('root') || document.getElementById('__next') || document.querySelector('[id^="app"]');
                 var hasContent = root ? root.children.length > 0 : document.body && document.body.children.length > 2;
                 window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'PAGE_INFO', hasContent: hasContent, rootChildren: root ? root.children.length : 0 }));
               })();
               true;
             `);
                setIsLoading(false);
              }}

              onLoadProgress={({ nativeEvent }) => {
                // Don't wait for full network completion to reveal content.
                if (nativeEvent.progress >= 0.85) setIsLoading(false);
              }}
              onNavigationStateChange={(navState) => {
                setCanGoBack(navState.canGoBack);
                setCanGoForward(navState.canGoForward);
                // After first render, avoid bouncing back to loading on SPA-internal navigations.
                if (!webViewReady || !navState.loading) {
                  setIsLoading(navState.loading);
                }
                // Sync URL for back/forward navigation (which bypasses onShouldStartLoadWithRequest)
                if (navState.url && !navState.loading) {
                  try {
                    const navUrl = new URL(navState.url);
                    const isSubdomainPreview = navUrl.hostname.endsWith('.drape.info') && !['www.drape.info', 'dev.drape.info', 'api.drape.info'].includes(navUrl.hostname);
                    const isPathPreview = (navUrl.hostname === 'drape.info' || navUrl.hostname === 'dev.drape.info') && navUrl.pathname.startsWith('/preview/');
                    if (isSubdomainPreview || isPathPreview) {
                      setCurrentPreviewUrl(navState.url);
                    }
                  } catch { /* ignore */ }
                }
              }}
              onShouldStartLoadWithRequest={(request) => {
                const url = request.url;
                let urlHost = '';
                try { urlHost = new URL(url).hostname; } catch {}

                // Subdomain preview (project-xxx.drape.info) — no rewriting needed,
                // all navigations stay on the same subdomain naturally
                const isSubdomainPreview = urlHost.endsWith('.drape.info') && !['www.drape.info', 'dev.drape.info', 'api.drape.info', 'drape.info'].includes(urlHost);
                if (isSubdomainPreview) return true;

                // Legacy path-based preview (/preview/{projectId}/) — needs URL rewriting
                const previewBase = currentPreviewUrl.split('?')[0].replace(/\/$/, '');
                const previewPathMatch = previewBase.match(/\/preview\/[^\/]+/);
                const previewPath = previewPathMatch ? previewPathMatch[0] : null;

                if (previewPath && (urlHost === 'drape.info' || urlHost === 'dev.drape.info') && !url.includes(previewPath)) {
                  const urlObj = new URL(url);
                  const targetPath = urlObj.pathname;

                  if (!targetPath.startsWith('/preview/') && !targetPath.startsWith('/_next/') && !targetPath.startsWith('/@')) {
                    if (rewriteCountRef.current >= MAX_REWRITES) {
                      console.warn('[Preview] Max rewrites exceeded, stopping rewrite loop');
                      return true;
                    }
                    rewriteCountRef.current++;
                    const newUrl = `https://${urlHost}${previewPath}${targetPath}${urlObj.search}`;
                    console.log(`[Preview] Rewriting navigation: ${url} -> ${newUrl}`);
                    setCurrentPreviewUrl(newUrl);
                    return false;
                  }
                }
                return true;
              }}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);

                  if (data.type === 'WEBVIEW_READY') {
                    if (readyFallbackTimerRef.current) {
                      clearTimeout(readyFallbackTimerRef.current);
                      readyFallbackTimerRef.current = null;
                    }
                    setWebViewReady(true);
                  }
                  if (data.type === 'PREVIEW_ERROR') {
                    const rawMsg = data.message || '';
                    // During verification phase (checking), ignore proxy errors —
                    // checkServerStatus is polling and will handle the transition to 'running'.
                    // Only treat errors as fatal when the server was confirmed running.
                    if (serverStatus !== 'running') {
                      console.warn('[Preview] Proxy error during verification (ignored, checkServerStatus polling):', rawMsg);
                      return;
                    }
                    // Server was 'running' but proxy error appeared — try a few retries first
                    const isTransient =
                      rawMsg.includes('No active session') ||
                      rawMsg.includes('ECONNREFUSED') ||
                      rawMsg.includes('Too many requests') ||
                      rawMsg.includes('Endpoint not found') ||
                      rawMsg.includes('429');
                    if (isTransient) {
                      if (proxyRetryCountRef.current < MAX_PROXY_RETRIES) {
                        proxyRetryCountRef.current++;
                        console.warn(`[Preview] Transient proxy error (retry ${proxyRetryCountRef.current}/${MAX_PROXY_RETRIES}):`, rawMsg);
                        // Exponential backoff: 2s, 4s, 6s...
                        setTimeout(() => {
                          webViewRef.current?.reload();
                        }, Math.min(2000 * proxyRetryCountRef.current, 8000));
                        return;
                      }
                      // Transient errors exhausted retries — keep preview visible, just reset and keep trying
                      // Do NOT set serverStatus='stopped' for transient errors
                      console.warn('[Preview] Transient error retries exhausted — resetting counter, keeping preview visible');
                      proxyRetryCountRef.current = 0;
                      setTimeout(() => { webViewRef.current?.reload(); }, 5000);
                      return;
                    }
                    // Non-transient error — check for env error first
                    console.warn('WebView detected non-transient proxy error:', rawMsg);
                    if (onEnvError && isEnvRelatedMessage(rawMsg)) {
                      onEnvError(rawMsg);
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
                    setPreviewError({ message: userMsg, timestamp: new Date() });
                    tracciaErroreAnteprima(userMsg);
                    setServerStatus('stopped');
                    setIsStarting(false);
                  }
                  if (data.type === 'BUILD_ERROR') {
                    const buildMsg = data.message || 'Build error';
                    console.error('[Preview] Build error detected in WebView:', buildMsg);
                    if (onEnvError && isEnvRelatedMessage(buildMsg)) {
                      onEnvError(buildMsg);
                      return;
                    }
                    setPreviewError({ message: buildMsg, timestamp: new Date() });
                    tracciaErroreAnteprima(buildMsg);
                    setServerStatus('stopped');
                    setIsStarting(false);
                  }
                  if (data.type === 'JS_ERROR' || data.type === 'RUNTIME_ENV_ERROR') {
                    const jsMsg = data.message || '';
                    // Filter out CSS injection noise (Bootstrap Reboot, etc.)
                    if (jsMsg.startsWith(':host') || jsMsg.includes('Bootstrap') || jsMsg.includes('reboot') || jsMsg.includes('box-sizing')) return;
                    console.warn('[Preview] JS/runtime error in WebView:', jsMsg);
                    onJsError?.(jsMsg);
                    if (onEnvError && isEnvRelatedMessage(jsMsg)) {
                      onEnvError(jsMsg);
                      return;
                    }
                  }
                  if (data.type === 'TRIGGER_REFRESH') {
                    handleRefresh();
                  }
                  if (data.type === 'PAGE_INFO') {
                    if (data.rootChildren > 0 || data.forceReady) {
                      if (readyFallbackTimerRef.current) {
                        clearTimeout(readyFallbackTimerRef.current);
                        readyFallbackTimerRef.current = null;
                      }
                      if (!webViewReady) setWebViewReady(true);
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
                    tracciaElementoSelezionato(elementSelector);
                    // Stay in inspect mode -- user exits by pressing the button again
                  }
                } catch (error) { }
              }}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={false}
              bounces={false}
              mixedContentMode="compatibility"
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              // Preview loads user-created web apps on various origins - broad whitelist required
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
