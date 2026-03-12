import React from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PreviewLoadingScreen } from './PreviewServerStatus';
import { PreviewLog } from '../../../hooks/api/usePreviewLogs';
import type { ViewportMode } from './PreviewToolbar';
import { TerminalWebView } from './TerminalWebView';
import { trackPreviewError, trackElementSelected } from '../../../core/services/analyticsService';

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
  topInset: number;
  viewportMode: ViewportMode;

  // Interactive terminal (console projects)
  projectId?: string;
  wsUrl?: string;
  authToken?: string | null;
  startCommand?: string;

  t: ReturnType<typeof useTranslation>['t'];
}

export const PreviewWebView: React.FC<PreviewWebViewProps> = ({
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
      ? 'width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=5.0, user-scalable=yes'
      : 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';
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
                  ? 'width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=5.0, user-scalable=yes'
                  : 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes';
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
                  style.innerHTML = 'html, body { background-color: #ffffff !important; }';
                  document.head.appendChild(style);
                }

                // Fix iOS keyboard pushing content up and showing white space
                if (window.visualViewport) {
                  var lastHeight = window.visualViewport.height;
                  window.visualViewport.addEventListener('resize', function() {
                    var newHeight = window.visualViewport.height;
                    if (newHeight < lastHeight) {
                      // Keyboard opened — constrain body height to visual viewport
                      document.documentElement.style.height = newHeight + 'px';
                      document.body.style.height = newHeight + 'px';
                      document.documentElement.style.overflow = 'auto';
                      // Ensure focused input stays in view within the constrained area
                      var focused = document.activeElement;
                      if (focused && focused.tagName && /INPUT|TEXTAREA|SELECT/.test(focused.tagName)) {
                        setTimeout(function() { focused.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
                      }
                    } else {
                      // Keyboard closed — restore
                      document.documentElement.style.height = '';
                      document.body.style.height = '';
                      document.documentElement.style.overflow = '';
                    }
                    lastHeight = newHeight;
                  });
                }

                // Check for React/Next.js mount
                var checkCount = 0;
                var checkInterval = setInterval(function() {
                  checkCount++;
                  if (document.body) {
                    // Support multiple root element IDs
                    var root = document.getElementById('root') ||
                               document.getElementById('__next') ||
                               document.getElementById('__nuxt') ||
                               document.querySelector('[data-reactroot]') ||
                               document.querySelector('app-root') ||
                               document.querySelector('[id^="app"]');
                    var rootChildren = root ? root.children.length : 0;
                    var text = document.body.innerText || '';

                    // Check for blockers
                    if (text.indexOf("Blocked request") !== -1 || text.indexOf("404 (Gateway)") !== -1) {
                      clearInterval(checkInterval);
                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'TRIGGER_REFRESH' }));
                      return;
                    }

                    // Flutter web uses canvas rendering — no DOM text.
                    // Detect via flutter-view, flt-glass-pane, or canvas inside #flutter_target.
                    var isFlutter = !!(document.querySelector('flutter-view') ||
                                       document.querySelector('flt-glass-pane') ||
                                       document.querySelector('canvas'));

                    // React/Next.js/Expo mounted
                    // If a known root element exists, wait for it to have children AND visible text.
                    // The text check prevents triggering on empty runtime wrappers (Metro/Expo bootstrap).
                    // Only use body.children fallback for non-SPA pages (no root element).
                    var hasText = root && root.innerText && root.innerText.trim().length > 0;
                    var isReady = isFlutter
                      ? true
                      : root
                        ? rootChildren > 0 && hasText
                        : document.body.children.length > 2;
                    if (isReady) {
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

                // Detect JSON error responses from preview proxy (e.g. ECONNREFUSED)
                // AND framework build error overlays (Next.js, Vite, etc.)
                webViewRef.current?.injectJavaScript(`
               (function() {
                 try {
                   var bodyText = document.body && document.body.innerText && document.body.innerText.trim();
                   if (!bodyText) return;

                   // 1. JSON proxy errors
                   if (bodyText.charAt(0) === '{' && bodyText.indexOf('"error"') !== -1) {
                     try {
                       var parsed = JSON.parse(bodyText);
                       if (parsed.error) {
                         window.ReactNativeWebView?.postMessage(JSON.stringify({
                           type: 'PREVIEW_ERROR',
                           message: parsed.error + (parsed.message ? ': ' + parsed.message : '')
                         }));
                         return;
                       }
                     } catch(e) {}
                   }

                   // 2. Framework build/compile error overlays
                   var lower = bodyText.toLowerCase();
                   var isBuildError = false;
                   var errorMsg = '';

                   // Next.js error overlay
                   var hasServerError = lower.indexOf('server error') !== -1;
                   var hasUnhandled = lower.indexOf('unhandled') !== -1;
                   var hasBuildFail = lower.indexOf('module build failed') !== -1
                     || lower.indexOf('modulebuildError') !== -1
                     || lower.indexOf('failed to compile') !== -1
                     || lower.indexOf('build error') !== -1;
                   var hasSyntaxErr = lower.indexOf('syntaxerror') !== -1
                     || lower.indexOf('unexpected token') !== -1;
                   var hasModuleNotFound = lower.indexOf('module not found') !== -1
                     || lower.indexOf('cannot find module') !== -1;

                   if (hasServerError && (hasBuildFail || hasSyntaxErr || hasModuleNotFound || hasUnhandled)) {
                     isBuildError = true;
                   }
                   if (hasBuildFail || (hasSyntaxErr && hasUnhandled)) {
                     isBuildError = true;
                   }

                   // Vite error overlay
                   if (document.querySelector('vite-error-overlay')) {
                     isBuildError = true;
                   }

                   if (isBuildError) {
                     // Extract a concise error message from the page
                     var lines = bodyText.split('\\n').map(function(l) { return l.trim(); }).filter(Boolean);
                     var errorLines = [];
                     for (var i = 0; i < lines.length && errorLines.length < 8; i++) {
                       var ll = lines[i].toLowerCase();
                       if (ll.indexOf('error') !== -1 || ll.indexOf('expected') !== -1
                           || ll.indexOf('cannot find') !== -1 || ll.indexOf('module not found') !== -1
                           || ll.indexOf('syntaxerror') !== -1 || (ll.indexOf('|') !== -1 && errorLines.length > 0)) {
                         errorLines.push(lines[i]);
                       }
                     }
                     errorMsg = errorLines.length > 0 ? errorLines.join('\\n') : bodyText.substring(0, 500);
                     window.ReactNativeWebView?.postMessage(JSON.stringify({
                       type: 'BUILD_ERROR',
                       message: errorMsg
                     }));
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

                 window.addEventListener('unhandledrejection', function(e) {
                   var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Unhandled promise rejection';
                   window.ReactNativeWebView?.postMessage(JSON.stringify({
                     type: 'JS_ERROR',
                     message: msg
                   }));
                 });

                 // Detect React/CRA error overlay ("Uncaught runtime errors" overlay)
                 // React error boundaries catch errors before window.onerror, so we
                 // observe DOM mutations for the error overlay iframe/container.
                 var envErrorSent = false;

                 // Auto-dismiss dev error overlays for all frameworks
                 function dismissOverlay(el) {
                   try {
                     // Try clicking dismiss/close button
                     if (el.tagName === 'IFRAME' && el.contentDocument) {
                       var closeBtn = el.contentDocument.querySelector('[aria-label="Dismiss"], button, .close-button');
                       if (closeBtn) { closeBtn.click(); return; }
                     }
                     // For custom elements (Vite), try shadow DOM close button
                     if (el.shadowRoot) {
                       var shadowClose = el.shadowRoot.querySelector('button, .close, [aria-label="Dismiss"]');
                       if (shadowClose) { shadowClose.click(); return; }
                     }
                     el.style.display = 'none';
                     // CRA backdrop
                     var backdrop = document.getElementById('webpack-dev-server-client-overlay-div');
                     if (backdrop) backdrop.style.display = 'none';
                   } catch(e) {}
                 }

                 function findErrorOverlay() {
                   // CRA / webpack-dev-server
                   var el = document.getElementById('webpack-dev-server-client-overlay');
                   if (el) return el;
                   // Older CRA
                   el = document.getElementById('react-error-overlay');
                   if (el) return el;
                   // Next.js error overlay
                   el = document.querySelector('nextjs-portal');
                   if (el) return el;
                   el = document.getElementById('__next-build-error');
                   if (el) return el;
                   el = document.querySelector('[data-nextjs-dialog]');
                   if (el) return el;
                   // Vite error overlay (custom element)
                   el = document.querySelector('vite-error-overlay');
                   if (el) return el;
                   // Nuxt error overlay
                   el = document.getElementById('__nuxt-error');
                   if (el) return el;
                   // Generic: full-screen fixed iframe (common pattern)
                   el = document.querySelector('iframe[style*="position: fixed"]');
                   if (el) return el;
                   return null;
                 }

                 function getOverlayText(el) {
                   try {
                     if (el.tagName === 'IFRAME' && el.contentDocument) {
                       return el.contentDocument.body ? el.contentDocument.body.innerText : '';
                     }
                     if (el.shadowRoot) {
                       return el.shadowRoot.textContent || '';
                     }
                     return el.innerText || el.textContent || '';
                   } catch(e) {
                     return el.getAttribute('title') || '';
                   }
                 }

                 function checkForErrorOverlay() {
                   if (envErrorSent) return;
                   var overlay = findErrorOverlay();
                   if (overlay) {
                     var text = getOverlayText(overlay);
                     if (text) {
                       envErrorSent = true;
                       window.ReactNativeWebView?.postMessage(JSON.stringify({
                         type: 'RUNTIME_ENV_ERROR',
                         message: text.substring(0, 1000)
                       }));
                       dismissOverlay(overlay);
                       return;
                     }
                   }

                   var bodyText = document.body ? (document.body.innerText || '') : '';
                   var lower = bodyText.toLowerCase();
                   if (lower.indexOf('uncaught runtime error') !== -1 ||
                       lower.indexOf('unhandled runtime error') !== -1) {
                     var lines = bodyText.split('\\n').filter(function(l) { return l.trim(); });
                     var errorText = lines.slice(0, 10).join('\\n');
                     envErrorSent = true;
                     window.ReactNativeWebView?.postMessage(JSON.stringify({
                       type: 'RUNTIME_ENV_ERROR',
                       message: errorText.substring(0, 1000)
                     }));
                   }
                 }

                 // Check periodically for error overlays (React renders them async)
                 var overlayCheckCount = 0;
                 var overlayInterval = setInterval(function() {
                   overlayCheckCount++;
                   checkForErrorOverlay();
                   if (envErrorSent || overlayCheckCount >= 20) {
                     clearInterval(overlayInterval);
                   }
                 }, 1000);

                 // Also observe DOM for dynamically added overlay elements
                 if (typeof MutationObserver !== 'undefined') {
                   var observer = new MutationObserver(function() {
                     checkForErrorOverlay();
                     if (envErrorSent) observer.disconnect();
                   });
                   observer.observe(document.body || document.documentElement, {
                     childList: true, subtree: true
                   });
                   // Auto-disconnect after 30s to avoid memory leaks
                   setTimeout(function() { observer.disconnect(); }, 30000);
                 }

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
                                  document.getElementById('__nuxt') ||
                                  document.querySelector('[data-reactroot]') ||
                                  document.querySelector('app-root') ||
                                  document.querySelector('[id^="app"]');
                     // Flutter web uses canvas — no DOM text. Detect early.
                     const isFlutter = !!(document.querySelector('flutter-view') ||
                                          document.querySelector('flt-glass-pane') ||
                                          document.querySelector('canvas'));

                     // If a known root element exists, wait for it to have children AND visible text.
                     // The text check prevents triggering on empty runtime wrappers (Metro/Expo bootstrap).
                     // Only use body.children fallback for non-SPA pages (no root).
                     const rootChildren = root ? root.children.length : 0;
                     const hasText = root && root.innerText && root.innerText.trim().length > 0;
                     const hasContent = isFlutter
                       ? true
                       : root
                         ? rootChildren > 0 && hasText
                         : document.body.children.length > 2;

                     if (hasContent) {
                       window.ReactNativeWebView?.postMessage(JSON.stringify({
                         type: 'PAGE_INFO',
                         hasContent: hasContent,
                         rootChildren: isFlutter ? 1 : rootChildren,
                         forceReady: isFlutter
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
              }}
              onShouldStartLoadWithRequest={(request) => {
                const url = request.url;
                // Extract the preview base path from currentPreviewUrl
                const previewBase = currentPreviewUrl.split('?')[0].replace(/\/$/, '');
                const previewPathMatch = previewBase.match(/\/preview\/[^\/]+/);
                const previewPath = previewPathMatch ? previewPathMatch[0] : null;

                // If navigating to drape.info but NOT within the preview path, rewrite it
                // Check hostname (not full string) to avoid matching external URLs that reference drape.info in hash/query
                let urlHost = '';
                try { urlHost = new URL(url).hostname; } catch {}
                if (previewPath && urlHost === 'drape.info' && !url.includes(previewPath)) {
                  // Extract the path from the URL (e.g., /login from https://drape.info/login)
                  const urlObj = new URL(url);
                  const targetPath = urlObj.pathname;

                  // Don't intercept preview paths or special routes
                  if (!targetPath.startsWith('/preview/') && !targetPath.startsWith('/_next/') && !targetPath.startsWith('/@')) {
                    // Guard against infinite rewrite loops
                    if (rewriteCountRef.current >= MAX_REWRITES) {
                      console.warn('[Preview] Max rewrites exceeded, stopping rewrite loop');
                      return true;
                    }
                    rewriteCountRef.current++;
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
                      rawMsg.includes('429');
                    if (isTransient && proxyRetryCountRef.current < MAX_PROXY_RETRIES) {
                      proxyRetryCountRef.current++;
                      console.warn(`[Preview] Transient proxy error (retry ${proxyRetryCountRef.current}/${MAX_PROXY_RETRIES}):`, rawMsg);
                      setTimeout(() => {
                        webViewRef.current?.reload();
                      }, 2000);
                      return;
                    }
                    // Exhausted retries or non-transient error — check for env error first
                    console.error('WebView detected proxy error:', rawMsg);
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
                    trackPreviewError(userMsg);
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
                    trackPreviewError(buildMsg);
                    setServerStatus('stopped');
                    setIsStarting(false);
                  }
                  if (data.type === 'JS_ERROR' || data.type === 'RUNTIME_ENV_ERROR') {
                    const jsMsg = data.message || '';
                    console.warn('[Preview] JS/runtime error in WebView:', jsMsg);
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
                    trackElementSelected(elementSelector);
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
};

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
