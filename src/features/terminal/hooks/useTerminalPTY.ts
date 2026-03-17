import { useCallback, useEffect, useRef, useState } from 'react';
import { encode as btoa, decode as atob } from 'base-64';
import { config } from '../../../config/config';
import { getAuthToken } from '../../../core/api/getAuthToken';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseTerminalPTYOptions {
  projectId: string;
  sessionId: string;
  onOutput: (data: string) => void;
  onExit?: () => void;
  onError?: (message: string) => void;
}

interface UseTerminalPTYReturn {
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  sendInput: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_RECONNECT_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTerminalPTY({
  projectId,
  sessionId,
  onOutput,
  onExit,
  onError,
}: UseTerminalPTYOptions): UseTerminalPTYReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Refs ---------------------------------------------------------------

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  // Keep the latest callbacks in refs so the WebSocket handlers always see
  // the most recent version without needing to re-create the socket.
  const onOutputRef = useRef(onOutput);
  const onExitRef = useRef(onExit);
  const onErrorRef = useRef(onError);

  useEffect(() => { onOutputRef.current = onOutput; }, [onOutput]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  // Helpers ------------------------------------------------------------

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Core connect / disconnect ------------------------------------------

  const connectInternal = useCallback(async () => {
    // Prevent duplicate connections
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setIsConnecting(true);
    intentionalCloseRef.current = false;

    const authToken = await getAuthToken(true);
    const wsUrl = authToken
      ? `${config.wsUrl}/ws?token=${encodeURIComponent(authToken)}`
      : `${config.wsUrl}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('[TerminalPTY] Failed to create WebSocket:', err);
      setIsConnecting(false);
      scheduleReconnect();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setIsConnecting(false);
      setIsConnected(true);

      // Ask backend to spawn a PTY for this project
      ws.send(JSON.stringify({ type: 'terminal_start', projectId }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string);
        switch (message.type) {
          case 'terminal_started':
            // PTY is ready — nothing extra to do; isConnected is already true
            break;

          case 'terminal_output':
            if (message.data) {
              const decoded = atob(message.data);
              onOutputRef.current(decoded);
            }
            break;

          case 'terminal_exit':
            onExitRef.current?.();
            break;

          case 'terminal_error':
            onErrorRef.current?.(message.message ?? 'Unknown terminal error');
            break;

          default:
            // Ignore unrecognised messages (e.g. 'connected', 'pong')
            break;
        }
      } catch (err) {
        console.error('[TerminalPTY] Message parse error:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[TerminalPTY] WebSocket error:', error);
    };

    ws.onclose = () => {
      wsRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);

      if (!intentionalCloseRef.current) {
        scheduleReconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sessionId]);

  const scheduleReconnect = useCallback(() => {
    clearReconnectTimer();

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[TerminalPTY] Max reconnect attempts reached');
      onErrorRef.current?.('Connection lost. Max reconnect attempts reached.');
      return;
    }

    reconnectAttemptsRef.current++;
    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current - 1);

    reconnectTimerRef.current = setTimeout(() => {
      connectInternal();
    }, delay);
  }, [clearReconnectTimer, connectInternal]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;

    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null; // prevent reconnect logic
      ws.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    // Reset reconnect counter on explicit connect
    reconnectAttemptsRef.current = 0;
    connectInternal();
  }, [connectInternal]);

  // Public actions -----------------------------------------------------

  const sendInput = useCallback((data: string) => {
    send({ type: 'terminal_input', data: btoa(data) });
  }, [send]);

  const resize = useCallback((cols: number, rows: number) => {
    send({ type: 'terminal_resize', cols, rows });
  }, [send]);

  // Cleanup on unmount -------------------------------------------------

  useEffect(() => {
    return () => {
      intentionalCloseRef.current = true;
      clearReconnectTimer();

      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimer]);

  // -------------------------------------------------------------------

  return {
    isConnected,
    isConnecting,
    connect,
    disconnect,
    sendInput,
    resize,
  };
}
