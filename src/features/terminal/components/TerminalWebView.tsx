import React, { useRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { getTerminalHtml } from '../constants/terminalHtml';

interface TerminalWebViewProps {
  projectId: string;
  wsUrl: string;
  authToken: string;
  startCommand?: string;
  onConnected?: () => void;
  onExit?: () => void;
  onError?: (message: string) => void;
}

export const TerminalWebView: React.FC<TerminalWebViewProps> = ({
  projectId,
  wsUrl,
  authToken,
  startCommand,
  onConnected,
  onExit,
  onError,
}) => {
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
      }
    } catch {}
  }, [onConnected, onExit, onError]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={['*']}
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
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
});
