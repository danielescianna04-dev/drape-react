import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { API_BASE_URL } from '../../lib/api/client';
import { filesApi } from '../../lib/api/filesApi';
import type { AppwriteCredentials } from '../../lib/api/appwriteApi';

export interface SandpackPreviewProps {
  projectId: string;
  /** Credenziali Appwrite del progetto (se DB provisionato) */
  appwrite?: AppwriteCredentials | null;
  /** Sandpack template (react / vanilla / vue / svelte / static / ecc.) */
  template?: 'react' | 'react-ts' | 'vanilla' | 'vanilla-ts' | 'vue' | 'svelte' | 'static';
  theme?: 'dark' | 'light';
  /** Override file forzati (es. dall'AI durante streaming) — bypassa filesApi.list */
  filesOverride?: Record<string, { code: string; hidden?: boolean }>;
  onReady?: () => void;
  onError?: (msg: string) => void;
}

type BridgeMessage =
  | { type: 'ready'; payload: { sdk: string } }
  | { type: 'pong'; payload: { sdk: string } }
  | { type: 'error'; payload: { message: string } };

const BRIDGE_URL = `${API_BASE_URL}/sandpack/`;

export function SandpackPreview({
  projectId,
  appwrite,
  template = 'react',
  theme = 'dark',
  filesOverride,
  onReady,
  onError,
}: SandpackPreviewProps) {
  const webviewRef = useRef<WebView>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);

  // Carica file di progetto da Supabase Storage via backend
  const [files, setFiles] = useState<Record<string, { code: string; hidden?: boolean }>>(
    filesOverride ?? {},
  );

  useEffect(() => {
    if (filesOverride) {
      setFiles(filesOverride);
      setLoadingFiles(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { files: meta } = await filesApi.list(projectId);
        const acc: Record<string, { code: string }> = {};
        // Limit: carico solo i file <100KB di testo per evitare overload WebView.
        await Promise.all(
          meta
            .filter((f) => f.size < 100 * 1024 && (f.mime?.startsWith('text/') ?? true))
            .map(async (f) => {
              const { content } = await filesApi.download(projectId, f.path, 'utf8');
              acc[f.path.startsWith('/') ? f.path : `/${f.path}`] = { code: content };
            }),
        );
        if (cancelled) return;
        // Fallback se progetto vuoto: minimal hello
        if (Object.keys(acc).length === 0) {
          acc['/App.js'] = {
            code: `export default function App() {\n  return <div style={{padding:24}}>Progetto vuoto — chiedi all'AI di iniziare</div>;\n}`,
          };
        }
        setFiles(acc);
      } catch (err: any) {
        console.warn('[SandpackPreview] loadFiles failed:', err);
        onError?.(err?.message ?? 'load files failed');
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, filesOverride, onError]);

  // Quando bridge ready o file/credenziali cambiano, sincronizza
  const syncToBridge = useCallback(() => {
    if (!bridgeReady) return;
    if (Object.keys(files).length === 0) return;
    webviewRef.current?.postMessage(
      JSON.stringify({ source: 'drape-host', type: 'set_template', payload: { template } }),
    );
    webviewRef.current?.postMessage(
      JSON.stringify({ source: 'drape-host', type: 'set_theme', payload: { theme } }),
    );
    if (appwrite) {
      webviewRef.current?.postMessage(
        JSON.stringify({ source: 'drape-host', type: 'set_appwrite', payload: appwrite }),
      );
    }
    webviewRef.current?.postMessage(
      JSON.stringify({ source: 'drape-host', type: 'set_files', payload: { files } }),
    );
  }, [bridgeReady, files, appwrite, template, theme]);

  useEffect(() => {
    syncToBridge();
  }, [syncToBridge]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let parsed: BridgeMessage | null = null;
      try {
        parsed = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (!parsed) return;
      if (parsed.type === 'ready') {
        setBridgeReady(true);
        onReady?.();
      } else if (parsed.type === 'error') {
        onError?.(parsed.payload.message);
      }
    },
    [onReady, onError],
  );

  const injectedJsBeforeContentLoaded = useMemo(
    () => `
      window.addEventListener('message', function(event){
        // Forward host messages (postMessage from RN) come postMessage interno (per Sandpack iframe nested)
      }, false);
      true;
    `,
    [],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: BRIDGE_URL }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        injectedJavaScriptBeforeContentLoaded={injectedJsBeforeContentLoaded}
        onMessage={onMessage}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          onError?.(`WebView error: ${nativeEvent.description}`);
        }}
        style={styles.webview}
      />
      {(loadingFiles || !bridgeReady) && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#888" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0c' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  overlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,11,12,0.6)',
  },
});
