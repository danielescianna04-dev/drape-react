/**
 * xterm.js HTML bundle for interactive terminal inside React Native WebView.
 * Connects to backend WebSocket PTY (terminal_start/input/output/resize).
 */
export function getTerminalHtml(wsUrl: string, authToken: string, projectId: string, startCommand?: string): string {
  // Escape values for safe injection into JS template
  const escJs = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/<\//g, '<\\/');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/@xterm/xterm@5.5.0/css/xterm.css"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 28%, rgba(124, 92, 255, 0.12), transparent 28%),
      linear-gradient(180deg, #07070B 0%, #0D0B14 30%, #1A1033 70%, #0A0A12 100%);
  }
  #terminal {
    width: 100%;
    height: 100%;
    padding: 14px 10px 16px 16px;
    background: transparent;
  }
  .xterm { height: 100%; background: transparent !important; }
  .xterm-helpers {
    position: fixed !important;
    left: -9999px !important;
    top: auto !important;
    bottom: 0 !important;
    width: 1px !important;
    height: 1px !important;
    overflow: hidden !important;
    pointer-events: none !important;
  }
  .xterm-viewport,
  .xterm-screen,
  .xterm-scroll-area { background: transparent !important; }
  .xterm-helpers,
  .xterm-helper-textarea {
    background: transparent !important;
    position: fixed !important;
    left: -9999px !important;
    top: auto !important;
    bottom: 0 !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
  }
  .xterm-screen { padding-left: 0 !important; }
  .xterm-viewport::-webkit-scrollbar { width: 4px; }
  .xterm-viewport::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
</style>
</head>
<body>
<div id="terminal"></div>
<script src="https://unpkg.com/@xterm/xterm@5.5.0/lib/xterm.js"></script>
<script src="https://unpkg.com/@xterm/addon-fit@0.10.0/lib/addon-fit.js"></script>
<script src="https://unpkg.com/@xterm/addon-web-links@0.11.0/lib/addon-web-links.js"></script>
<script>
(function() {
  var WS_URL = '${escJs(wsUrl)}';
  var AUTH_TOKEN = '${escJs(authToken)}';
  var PROJECT_ID = '${escJs(projectId)}';
  var START_CMD = ${startCommand ? `'${escJs(startCommand)}'` : 'null'};
  // Clean up non-interactive wrappers from startCommand (designed for /exec, not PTY)
  if (START_CMD) {
    START_CMD = START_CMD
      .replace(/timeout\\s+\\d+\\s+/g, '')
      .replace(/stdbuf\\s+-oL\\s+/g, '')
      .replace(/\\s*<\\s*\\/dev\\/null/g, '')
      .replace(/\\s*2>&1/g, '')
      .replace(/;\\s*true\\s*$/g, '');
  }

  // Notify React Native
  function postRN(type, data) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, data: data }));
      }
    } catch(e) {}
  }

  // Calculate optimal font size: fit ~80 cols on screen, but bias slightly larger for readability.
  // Monospace char width ≈ fontSize * 0.6. Subtract padding + scrollbar + safety margin.
  var availW = window.innerWidth - 36;
  var optimalSize = Math.max(11, Math.min(15, Math.floor(availW / (80 * 0.595))));

  // Create terminal
  var term = new Terminal({
    cols: 80,
    rows: 24,
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: optimalSize,
    fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
    lineHeight: 1.28,
    theme: {
      background: '#00000000',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      cursorAccent: '#0D0B14',
      selectionBackground: 'rgba(56,139,253,0.3)',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39d353',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d364',
      brightWhite: '#f0f6fc',
      transparent: '#00000000',
    },
    allowProposedApi: true,
    scrollback: 5000,
    convertEol: false,
  });

  var fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  try {
    var webLinksAddon = new WebLinksAddon.WebLinksAddon();
    term.loadAddon(webLinksAddon);
  } catch(e) {}

  var container = document.getElementById('terminal');
  term.open(container);
  postRN('ready', { cols: term.cols, rows: term.rows });

  function getSafeSize() {
    var cols = term.cols || 0;
    var rows = term.rows || 0;
    if (cols <= 0 || rows <= 0) {
      cols = 80;
      rows = 24;
      try {
        term.resize(cols, rows);
      } catch (e) {}
    }
    return { cols: cols, rows: rows };
  }

  function focusTerminal() {
    try {
      term.focus();
      if (term.textarea && term.textarea.focus) {
        try {
          term.textarea.focus({ preventScroll: true });
        } catch (_) {
          term.textarea.focus();
        }
      }
    } catch(e) {}
  }
  window.__DRAPE_TERM_FOCUS = focusTerminal;
  window.__DRAPE_TERM_SEND = function(encoded) {
    try {
      if (ws && ws.readyState === WebSocket.OPEN && encoded) {
        ws.send(JSON.stringify({ type: 'terminal_input', data: encoded }));
      }
    } catch(e) {}
  };
  container.addEventListener('touchstart', focusTerminal, { passive: true });
  container.addEventListener('mousedown', focusTerminal);

  // Fit terminal to container and resize when keyboard appears/disappears
  function doFit() {
    try {
      // Resize container to match visual viewport (handles iOS keyboard)
      if (window.visualViewport) {
        container.style.height = window.visualViewport.height + 'px';
      }
      fitAddon.fit();
      var size = getSafeSize();
      postRN('fit', size);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal_resize', cols: size.cols, rows: size.rows }));
      }
    } catch(e) {}
  }
  doFit();
  setTimeout(doFit, 100);
  setTimeout(doFit, 500);
  setTimeout(doFit, 1000);

  // iOS keyboard: visualViewport shrinks when keyboard opens
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      doFit();
      // Scroll cursor into view after resize
      setTimeout(function() { term.scrollToBottom(); }, 50);
    });
  }

  // WebSocket connection
  var ws = null;
  var connected = false;
  var reconnectTimer = null;
  var reconnectAttempts = 0;
  var MAX_RECONNECT = 5;
  var authScanBuffer = '';
  var lastPostedAuthUrl = null;
  var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  function maybePostAuthUrl(text) {
    if (!text) return;
    authScanBuffer = (authScanBuffer + text).slice(-12000);
    var match = authScanBuffer.match(/https:\/\/claude\.ai\/oauth\/authorize[^\s"'<>]+/);
    if (match && match[0] && match[0] !== lastPostedAuthUrl) {
      lastPostedAuthUrl = match[0];
      postRN('auth_url', { url: match[0] });
    }
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

    var url = WS_URL + '/ws';
    if (AUTH_TOKEN) url += '?token=' + encodeURIComponent(AUTH_TOKEN);

    ws = new WebSocket(url);

    ws.onopen = function() {
      connected = true;
      reconnectAttempts = 0;
      var size = getSafeSize();
      // Request terminal start
      ws.send(JSON.stringify({
        type: 'terminal_start',
        projectId: PROJECT_ID,
        cols: size.cols,
        rows: size.rows,
      }));
    };

    ws.onmessage = function(event) {
      try {
        var msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'terminal_started':
            postRN('connected', {});
            // Fit after mount and send a non-zero terminal size to the PTY.
            doFit();
            setTimeout(doFit, 50);
            setTimeout(doFit, 150);
            setTimeout(doFit, 400);
            // Auto-run start command if provided
            if (START_CMD) {
              setTimeout(function() {
                var encoded = btoa(START_CMD + '\\n');
                ws.send(JSON.stringify({ type: 'terminal_input', data: encoded }));
              }, 300);
            }
            break;
          case 'terminal_output':
            if (msg.data) {
              var bytes = Uint8Array.from(atob(msg.data), function(c) { return c.charCodeAt(0); });
              term.write(bytes);
              if (decoder) {
                try {
                  maybePostAuthUrl(decoder.decode(bytes, { stream: true }));
                } catch (_) {}
              }
            }
            break;
          case 'terminal_exit':
            term.write('\\r\\n\\x1b[90m[Process exited]\\x1b[0m\\r\\n');
            postRN('exit', {});
            break;
          case 'terminal_error':
            term.write('\\r\\n\\x1b[31m[Error: ' + (msg.message || 'unknown') + ']\\x1b[0m\\r\\n');
            postRN('error', { message: msg.message });
            break;
        }
      } catch(e) {}
    };

    ws.onclose = function() {
      connected = false;
      if (reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        var delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 8000);
        reconnectTimer = setTimeout(connect, delay);
      } else {
        term.write('\\r\\n\\x1b[31m[Disconnected]\\x1b[0m\\r\\n');
        postRN('disconnected', {});
      }
    };

    ws.onerror = function() {
      // onclose will fire after onerror
    };
  }

  // Terminal input → WebSocket
  term.onData(function(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'terminal_input', data: btoa(data) }));
    }
  });

  // Handle resize
  var resizeTimeout = null;
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      fitAddon.fit();
      var size = getSafeSize();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal_resize', cols: size.cols, rows: size.rows }));
      }
    }, 150);
  }

  window.addEventListener('resize', handleResize);

  // Messages from React Native
  window.addEventListener('message', function(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'resize') {
        handleResize();
      } else if (msg.type === 'disconnect') {
        if (ws) ws.close();
      } else if (msg.type === 'reconnect') {
        if (msg.token) AUTH_TOKEN = msg.token;
        reconnectAttempts = 0;
        if (ws) ws.close();
        setTimeout(connect, 100);
      }
    } catch(e) {}
  });

  // Start connection
  connect();
  focusTerminal();
})();
</script>
</body>
</html>`;
}
