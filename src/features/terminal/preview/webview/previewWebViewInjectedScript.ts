/**
 * Builds the JavaScript string injected into the preview WebView
 * before any page content loads. Handles:
 * - Cookie injection for auth
 * - Viewport meta tag for mobile/desktop modes
 * - Reload blocking (Vite HMR workaround)
 * - White background default
 * - iOS keyboard fix
 * - Ready-state detection and signaling
 */

export interface InjectedScriptOptions {
  coderToken: string;
  globalFlyMachineId: string;
  previewAccessToken: string;
  isDesktopMode: boolean;
}

export function buildPreviewInjectedScript(options: InjectedScriptOptions): string {
  const { coderToken, globalFlyMachineId, previewAccessToken, isDesktopMode } = options;

  return `
    (function() {
      if (window.__drapeInit) return; window.__drapeInit = true;
      var token = ${JSON.stringify(coderToken)};
      var vmId = ${JSON.stringify(globalFlyMachineId)};
      var previewToken = ${JSON.stringify(previewAccessToken)};

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
      var isDesktopMode = ${JSON.stringify(isDesktopMode)};
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

      // Block ALL forms of page reload — prevents any flash in WebView
      location.reload = function() {
        console.log('[Drape] Blocked location.reload');
      };
      var origHistoryGo = history.go;
      history.go = function(delta) {
        if (!delta || delta === 0) { console.log('[Drape] Blocked history.go(0)'); return; }
        origHistoryGo.call(history, delta);
      };

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
      document.addEventListener('DOMContentLoaded', checkReady);
      window.addEventListener('load', checkReady);
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
  `;
}

/**
 * Script injected after page load to detect errors and content readiness.
 */
export function buildPostLoadDetectionScript(): string {
  return `
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
  `;
}

/**
 * Render heartbeat — posts a RENDER_HEARTBEAT message whenever the DOM
 * mutates. The host uses these timestamps to decide if HMR already applied
 * a file change (DOM mutated shortly after the change) or if the user
 * needs to tap Reload (no mutation in the window). Stack-agnostic: works
 * for Next, Vite, Astro, plain HTML, anything that produces a DOM.
 *
 * Throttled to 1 message per ~200ms to avoid flooding the bridge on
 * busy pages (animations, polling clients). Re-inject-safe via a
 * window-level guard.
 */
export function buildRenderHeartbeatScript(): string {
  return `
    (function() {
      try {
        if (window.__drapeHeartbeatInstalled) {
          // Already installed: just post the current timestamp so the host
          // knows the observer survived a same-page navigation (SPA route).
          window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'RENDER_HEARTBEAT',
            at: Date.now()
          }));
          return;
        }
        window.__drapeHeartbeatInstalled = true;
        window.__drapeLastRender = Date.now();
        var pending = false;
        function post() {
          if (pending) return;
          pending = true;
          setTimeout(function() {
            pending = false;
            window.ReactNativeWebView?.postMessage(JSON.stringify({
              type: 'RENDER_HEARTBEAT',
              at: window.__drapeLastRender
            }));
          }, 200);
        }
        // Initial beat so the host has a baseline timestamp even on idle pages.
        post();
        try {
          var obs = new MutationObserver(function() {
            window.__drapeLastRender = Date.now();
            post();
          });
          obs.observe(document.documentElement, {
            childList: true, subtree: true, attributes: true, characterData: true
          });
        } catch(e) {}
      } catch(e) {}
    })();
    true;
  `;
}

/**
 * Script to switch viewport mode at runtime.
 */
export function buildViewportSwitchScript(isDesktop: boolean): string {
  const content = isDesktop
    ? 'width=1280, initial-scale=0.3, minimum-scale=0.1, maximum-scale=1.0, user-scalable=no'
    : 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no';
  return `
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
  `;
}
