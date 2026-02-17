/**
 * usePreviewLogs Hook
 * Streams real-time container logs during preview startup.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import EventSource from 'react-native-sse';
import { config } from '../../config/config';
import { getAuthToken } from '../../core/api/getAuthToken';

export interface PreviewLog {
  id: number;
  timestamp: number;
  message: string;
}

interface UsePreviewLogsOptions {
  enabled?: boolean;
  maxLogs?: number;
  projectId?: string;
  previewToken?: string | null;
}

const stripAnsi = (input: string): string =>
  input
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\[[\d;]*m/g, '');

const normalizeWhitespace = (input: string): string =>
  input.replace(/\s+/g, ' ').trim();

const extractBackendHint = (rawMessage: string): string | null => {
  const message = normalizeWhitespace(stripAnsi(String(rawMessage || '')));
  if (!message) return null;

  const lower = message.toLowerCase();
  const isDeps =
    message.includes('[Deps]') ||
    message.includes('[Workspace]') ||
    lower.includes('dependency') ||
    lower.includes('install') ||
    lower.includes('node_modules') ||
    lower.includes('cache');

  if (!isDeps) return null;

  if (
    lower.includes('websocket') ||
    lower.includes('heartbeat') ||
    lower.includes('health check') ||
    lower.includes('metrics')
  ) {
    return null;
  }

  return message.replace(/^\[[^\]]+\]\s*/, '');
};

/**
 * Connect to /fly/logs/:projectId SSE and stream real container logs
 * (npm/pnpm/yarn install + dev server output).
 */
export function usePreviewLogs(options: UsePreviewLogsOptions = {}) {
  const { enabled = true, maxLogs = 80, projectId, previewToken } = options;

  const [logs, setLogs] = useState<PreviewLog[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const backendWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backendReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const backendReconnectAttemptsRef = useRef(0);
  const lastBackendLogIdRef = useRef(0);
  const lastMessageRef = useRef<string>('');
  const sinceCursorIdRef = useRef(0);

  const normalizeTimestampMs = useCallback((value?: number) => {
    if (!value || !Number.isFinite(value)) return Date.now();
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }, []);

  const pushLogLine = useCallback((line: string, timestamp?: number, logId?: number) => {
    const cleanLine = stripAnsi(String(line || ''))
      .replace(/\r/g, '')
      .trim();

    if (!cleanLine || cleanLine === ':keepalive') return;
    if (cleanLine === lastMessageRef.current) return;

    lastMessageRef.current = cleanLine;
    const ts = normalizeTimestampMs(timestamp);
    if (Number.isFinite(logId as number) && (logId as number) > 0) {
      sinceCursorIdRef.current = Math.max(sinceCursorIdRef.current, Math.floor(logId as number));
    }
    setLogs((prev) => {
      const next: PreviewLog[] = [
        ...prev,
        {
          id: Date.now() + Math.floor(Math.random() * 1000),
          timestamp: ts,
          message: cleanLine,
        },
      ];
      return next.slice(-maxLogs);
    });
  }, [maxLogs, normalizeTimestampMs]);

  const closeConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (backendReconnectTimeoutRef.current) {
      clearTimeout(backendReconnectTimeoutRef.current);
      backendReconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (backendWsRef.current) {
      try { backendWsRef.current.close(); } catch {}
      backendWsRef.current = null;
    }
  }, []);

  const connectBackendHints = useCallback(async () => {
    if (!enabled) return;

    if (backendWsRef.current) {
      try { backendWsRef.current.close(); } catch {}
      backendWsRef.current = null;
    }

    try {
      const authToken = await getAuthToken();
      const wsBase = `${config.wsUrl}/ws`;
      const wsUrl = authToken ? `${wsBase}?token=${encodeURIComponent(authToken)}` : wsBase;
      const ws = new WebSocket(wsUrl);
      backendWsRef.current = ws;

      ws.onopen = () => {
        backendReconnectAttemptsRef.current = 0;
        try { ws.send(JSON.stringify({ type: 'subscribe_logs' })); } catch {}
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type !== 'backend_log' || !payload?.log) return;
          const log = payload.log;
          const logId = Number(log?.id || 0);
          if (logId > 0) {
            if (logId <= lastBackendLogIdRef.current) return;
            lastBackendLogIdRef.current = logId;
          }

          const hint = extractBackendHint(String(log?.message || ''));
          if (!hint) return;
          pushLogLine(hint, Number(log?.timestamp || Date.now()));
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        if (!enabled) return;
        const delay = Math.min(1000 * Math.pow(2, backendReconnectAttemptsRef.current), 5000);
        backendReconnectTimeoutRef.current = setTimeout(() => {
          backendReconnectAttemptsRef.current += 1;
          connectBackendHints();
        }, delay);
      };

      ws.onerror = () => {
        // onclose handles reconnect
      };
    } catch {
      if (!enabled) return;
      const delay = Math.min(1000 * Math.pow(2, backendReconnectAttemptsRef.current), 5000);
      backendReconnectTimeoutRef.current = setTimeout(() => {
        backendReconnectAttemptsRef.current += 1;
        connectBackendHints();
      }, delay);
    }
  }, [enabled, pushLogLine]);

  const connect = useCallback(async () => {
    if (!enabled || !projectId) return;

    closeConnection();

    try {
      const authToken = await getAuthToken();
      const since = Math.max(0, Math.floor(sinceCursorIdRef.current));
      const queryParts = [`since=${since}`];
      if (previewToken) queryParts.push(`pt=${encodeURIComponent(previewToken)}`);
      const logsUrl = `${config.apiUrl}/fly/logs/${encodeURIComponent(projectId)}?${queryParts.join('&')}`;

      const es = new EventSource(logsUrl, {
        headers: {
          Accept: 'text/event-stream',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      eventSourceRef.current = es;

      es.addEventListener('open', () => {
        reconnectAttemptsRef.current = 0;
      });

      es.addEventListener('message', (event: any) => {
        const rawData = event?.data;
        if (!rawData || rawData === '[DONE]') return;

        try {
          const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
          const text = parsed?.text || parsed?.message || parsed?.line || '';
          const timestamp = Number(parsed?.timestamp || parsed?.ts || Date.now());
          const logId = Number(parsed?.id || 0);
          if (text) {
            const lines = String(text).split('\n').filter((line) => line.trim().length > 0);
            if (lines.length === 0) {
              pushLogLine(text, timestamp, logId);
              return;
            }
            for (const line of lines) {
              pushLogLine(line, timestamp, logId);
            }
          }
        } catch {
          const lines = String(rawData).split('\n').filter((line) => line.trim().length > 0);
          for (const line of lines) {
            pushLogLine(line, Date.now());
          }
        }
      });

      es.addEventListener('error', () => {
        if (!enabled) return;

        closeConnection();
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 5000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connect();
        }, delay);
      });
    } catch (e) {
      if (!enabled) return;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 5000);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        connect();
      }, delay);
    }
  }, [enabled, projectId, previewToken, closeConnection, pushLogLine]);

  const disconnect = useCallback(() => {
    closeConnection();
  }, [closeConnection]);

  const clearLogs = useCallback(() => {
    setLogs([]);
    lastMessageRef.current = '';
    reconnectAttemptsRef.current = 0;
    backendReconnectAttemptsRef.current = 0;
    lastBackendLogIdRef.current = 0;
    sinceCursorIdRef.current = 0;
  }, []);

  useEffect(() => {
    if (enabled && projectId) {
      connect();
      connectBackendHints();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [enabled, projectId, previewToken, connect, connectBackendHints, disconnect]);

  return {
    logs,
    clearLogs,
    connect,
    disconnect,
  };
}
