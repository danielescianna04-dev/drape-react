/**
 * useBackendLogs Hook
 * Streams ALL backend logs via WebSocket for real-time visibility
 * Integrates with globalTerminalLog so everything shows in the terminal
 */

import { useEffect, useCallback, useRef } from 'react';
import { config } from '../../config/config';
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

    const connect = useCallback(() => {
        if (!enabled) return;

        // Close existing connection
        if (wsRef.current) {
            wsRef.current.close();
        }

        try {
            const url = config.wsUrl + '/ws';
            console.log('📡 [BackendLogs] Connecting to WebSocket:', url);

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('✅ [BackendLogs] WebSocket connected - subscribing to logs');
                // Subscribe to backend logs
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
                        console.log('✅ [BackendLogs] Subscribed to backend logs stream');
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            };

            ws.onerror = (e) => {
                console.warn('⚠️ [BackendLogs] WebSocket error');
            };

            ws.onclose = () => {
                console.warn('⚠️ [BackendLogs] WebSocket connection closed');
                wsRef.current = null;

                // Auto-reconnect after 5 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    console.log('🔄 [BackendLogs] Reconnecting...');
                    connect();
                }, 5000);
            };
        } catch (e) {
            console.error('❌ [BackendLogs] Failed to connect:', e);
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
            // Small delay to let the app initialize
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
