import React, { useRef, useCallback, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { encode as btoa } from 'base-64';
import { getTerminalHtml } from '../constants/terminalHtml';
import { AppColors } from '../../../shared/theme/colors';

interface TerminalWebViewProps {
  projectId: string;
  wsUrl: string;
  authToken: string;
  startCommand?: string;
  onConnected?: () => void;
  onExit?: () => void;
  onError?: (message: string) => void;
  onAuthUrl?: (url: string) => void;
}

export interface TerminalWebViewHandle {
  focus: () => void;
  sendInput: (data: string) => void;
}

export const TerminalWebView = React.forwardRef<TerminalWebViewHandle, TerminalWebViewProps>(({
  projectId,
  wsUrl,
  authToken,
  startCommand,
  onConnected,
  onExit,
  onError,
  onAuthUrl,
}, ref) => {
  const webViewRef = useRef<WebView>(null);

  const html = React.useMemo(
    () => getTerminalHtml(wsUrl, authToken, projectId, startCommand),
    [wsUrl, authToken, projectId, startCommand],
  );

  const handleMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      switch (msg.type) {
        case 'connected':
          onConnected?.();
          break;
        case 'exit':
          onExit?.();
          break;
        case 'error':
          onError?.(msg.data?.message || 'Terminal error');
          break;
        case 'disconnected':
          onError?.('Terminal disconnected');
          break;
        case 'auth_url':
          if (msg.data?.url) onAuthUrl?.(msg.data.url);
          break;
      }
    } catch {}
  }, [onAuthUrl, onConnected, onExit, onError]);

  useImperativeHandle(ref, () => ({
    focus: () => {
      webViewRef.current?.injectJavaScript(`
        window.__BYNOT_TERM_FOCUS && window.__BYNOT_TERM_FOCUS();
        true;
      `);
    },
    sendInput: (data: string) => {
      const encoded = btoa(data);
      webViewRef.current?.injectJavaScript(`
        window.__BYNOT_TERM_SEND && window.__BYNOT_TERM_SEND('${encoded}');
        true;
      `);
    },
  }), []);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['https://*', 'http://localhost*', 'http://127.0.0.1*', 'about:*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView={false}
        onMessage={handleMessage}
        allowsInlineMediaPlayback={true}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.dark.backgroundAlt,
  },
  webview: {
    flex: 1,
    backgroundColor: AppColors.dark.backgroundAlt,
  },
});

TerminalWebView.displayName = 'TerminalWebView';
