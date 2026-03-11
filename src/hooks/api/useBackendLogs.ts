/**
 * useBackendLogs Hook
 * Streams ALL backend logs via WebSocket for real-time visibility
 * Integrates with globalTerminalLog so everything shows in the terminal
 */

import { useEffect, useCallback, useRef } from 'react';
import { config } from '../../config/config';
import { getAuthToken } from '../../core/api/getAuthToken';
import { useTerminalStore } from '../../core/terminal/terminalStore';
import { TerminalItemType } from '../../shared/types';

export interface BackendLog {
    id: number;
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
}

interface UseBackendLogsOptions {
    enabled?: boolean;
}

/**
 * Connect to backend WebSocket log stream and pipe to globalTerminalLog
 * Call this once at app root level to capture all backend activity
 */
export function useBackendLogs(options: UseBackendLogsOptions = {}) {
    const { enabled = true } = options;

    const addGlobalTerminalLog = useTerminalStore((state) => state.addGlobalTerminalLog);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastLogIdRef = useRef<number>(0);
    const reconnectAttemptsRef = useRef<number>(0);
    const MAX_RECONNECT_ATTEMPTS = 5;
    const BASE_DELAY = 3000;

    const connect = useCallback(async () => {
        if (!enabled) return;

        // Close existing connection
        if (wsRef.current) {
            wsRef.current.close();
        }

        try {
            const authToken = await getAuthToken();
            const baseUrl = config.wsUrl + '/ws';
            const url = authToken ? `${baseUrl}?token=${encodeURIComponent(authToken)}` : baseUrl;

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                reconnectAttemptsRef.current = 0; // Reset on successful connection
                ws.send(JSON.stringify({ type: 'subscribe_logs' }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'backend_log' && data.log) {
                        const log: BackendLog = data.log;

                        // Skip if we've already seen this log (reconnect scenario)
                        if (log.id <= lastLogIdRef.current) return;
                        lastLogIdRef.current = log.id;

                        // Map backend log level to TerminalItemType
                        const typeMap: Record<string, TerminalItemType> = {
                            'info': TerminalItemType.SYSTEM,
                            'warn': TerminalItemType.SYSTEM,
                            'error': TerminalItemType.ERROR,
                        };

                        // Add to global terminal log
                        addGlobalTerminalLog({
                            id: `backend-${log.id}`,
                            content: log.message,
                            type: typeMap[log.level] || TerminalItemType.SYSTEM,
                            timestamp: new Date(log.timestamp),
                            source: 'backend',
                        });
                    } else if (data.type === 'subscribed_logs') {
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            };

            ws.onerror = () => {
                // Silenced — onclose handles reconnection
            };

            ws.onclose = () => {
                wsRef.current = null;
                reconnectAttemptsRef.current += 1;

                if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
                    console.warn('[BackendLogs] Max reconnect attempts reached, stopping');
                    return;
                }

                // Exponential backoff: 3s, 6s, 12s, 24s, 48s
                const delay = BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1);
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, delay);
            };
        } catch (e) {
            // Connection failed — will retry via onclose
        }
    }, [enabled, addGlobalTerminalLog]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (wsRef.current) {
            // Unsubscribe before closing
            try {
                wsRef.current.send(JSON.stringify({ type: 'unsubscribe_logs' }));
            } catch (e) {
                // Ignore if already closed
            }
            wsRef.current.close();
            wsRef.current = null;
        }
    }, []);

    // Connect on mount
    useEffect(() => {
        if (enabled) {
            reconnectAttemptsRef.current = 0;
            const timeout = setTimeout(() => {
                connect();
            }, 1000);
            return () => {
                clearTimeout(timeout);
                disconnect();
            };
        }
        return () => disconnect();
    }, [enabled, connect, disconnect]);

    return {
        connect,
        disconnect,
    };
}
