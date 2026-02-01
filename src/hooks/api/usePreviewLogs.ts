/**
 * usePreviewLogs Hook
 * Streams real-time VM logs during preview startup
 * Filters backend logs to show only relevant orchestration messages
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { config } from '../../config/config';

export interface PreviewLog {
    id: number;
    timestamp: number;
    message: string;
}

interface UsePreviewLogsOptions {
    enabled?: boolean;
    maxLogs?: number;
}

/**
 * Connect to backend WebSocket and stream logs during preview startup
 * Automatically filters orchestration logs (VM allocation, file sync, cache, dev server, etc.)
 */
export function usePreviewLogs(options: UsePreviewLogsOptions = {}) {
    const { enabled = true, maxLogs = 15 } = options;

    const [logs, setLogs] = useState<PreviewLog[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const lastLogIdRef = useRef<number>(0);

    const connect = useCallback(() => {
        if (!enabled) return;

        // Close existing connection
        if (wsRef.current) {
            wsRef.current.close();
        }

        try {
            const url = config.wsUrl + '/ws';
            console.log('📡 [PreviewLogs] Connecting to WebSocket:', url);

            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('✅ [PreviewLogs] WebSocket connected - subscribing to logs');
                ws.send(JSON.stringify({ type: 'subscribe_logs' }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'backend_log' && data.log) {
                        const log = data.log;

                        // Skip if we've already seen this log
                        if (log.id <= lastLogIdRef.current) return;
                        lastLogIdRef.current = log.id;

                        const message = log.message;

                        // Filter: Only show orchestration logs relevant to preview
                        const isRelevant = (
                            // VM Pool operations
                            message.includes('[VM Pool]') ||
                            message.includes('[Orchestrator]') ||
                            message.includes('[Setup]') ||
                            message.includes('Allocated VM') ||
                            message.includes('Adopting') ||
                            message.includes('Getting VM') ||
                            // File operations
                            message.includes('Syncing files') ||
                            message.includes('[FileSync]') ||
                            message.includes('[Cache]') ||
                            message.includes('Force-syncing') ||
                            message.includes('tar.gz') ||
                            // Dev server
                            message.includes('Dev server') ||
                            message.includes('npm run dev') ||
                            message.includes('pnpm dev') ||
                            message.includes('yarn dev') ||
                            message.includes('Turbopack') ||
                            message.includes('Starting dev') ||
                            message.includes('listening') ||
                            message.includes('ready on') ||
                            // Cache operations
                            message.includes('node_modules') ||
                            message.includes('.next') ||
                            message.includes('cache restored') ||
                            message.includes('Restoring') ||
                            message.includes('Cache hit') ||
                            message.includes('prewarmed') ||
                            message.includes('with npm cache') ||
                            message.includes('with cache') ||
                            // Git operations
                            message.includes('Cloning') ||
                            message.includes('git clone') ||
                            // Bin symlinks
                            message.includes('Bin symlinks') ||
                            message.includes('symlinks recreated') ||
                            // General progress
                            message.includes('✅') ||
                            message.includes('⚡') ||
                            message.includes('🚀') ||
                            message.includes('📦') ||
                            message.includes('📂') ||
                            message.includes('💪') ||
                            message.includes('🔍') ||
                            // Errors
                            message.includes('❌') ||
                            message.includes('⚠️') ||
                            message.includes('ERROR') ||
                            message.includes('FAILED')
                        );

                        // Skip backend internal noise
                        const isNoise = (
                            message.includes('WebSocket client connected') ||
                            message.includes('WS Message:') ||
                            message.includes('[FileWatcher]') && !message.includes('Starting watch') ||
                            message.includes('[Universal Cache]') ||
                            message.includes('[Auto-Scale]') ||
                            message.includes('[Health Check]') ||
                            message.includes('health check passed') ||
                            message.includes('Status:') && message.includes('running') ||
                            message.includes('[Metrics]') ||
                            message.includes('Found') && message.includes('running VMs')
                        );

                        if (isRelevant && !isNoise) {
                            // Clean up message for display
                            let cleanMessage = message
                                .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s*/, '') // Remove timestamp
                                .replace(/\[.*?\]\s*/g, '') // Remove [tags]
                                .replace(/\s+/g, ' ') // Normalize spaces
                                .trim();

                            // If message is too short or empty after cleanup, use original
                            if (cleanMessage.length < 5) {
                                cleanMessage = message;
                            }

                            // Shorten long messages
                            if (cleanMessage.length > 100) {
                                cleanMessage = cleanMessage.substring(0, 97) + '...';
                            }

                            setLogs((prev) => {
                                const newLogs = [...prev, {
                                    id: log.id,
                                    timestamp: log.timestamp,
                                    message: cleanMessage,
                                }];
                                // Keep only last N logs
                                return newLogs.slice(-maxLogs);
                            });
                        }
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            };

            ws.onerror = () => {
                console.warn('⚠️ [PreviewLogs] WebSocket error');
            };

            ws.onclose = () => {
                console.warn('⚠️ [PreviewLogs] WebSocket closed');
                wsRef.current = null;
            };
        } catch (e) {
            console.error('❌ [PreviewLogs] Failed to connect:', e);
        }
    }, [enabled, maxLogs]);

    const disconnect = useCallback(() => {
        if (wsRef.current) {
            try {
                wsRef.current.send(JSON.stringify({ type: 'unsubscribe_logs' }));
            } catch (e) {
                // Ignore if already closed
            }
            wsRef.current.close();
            wsRef.current = null;
        }
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
        lastLogIdRef.current = 0;
    }, []);

    // Connect when enabled changes
    useEffect(() => {
        if (enabled) {
            connect();
        }
        return () => disconnect();
    }, [enabled, connect, disconnect]);

    return {
        logs,
        clearLogs,
        connect,
        disconnect,
    };
}
