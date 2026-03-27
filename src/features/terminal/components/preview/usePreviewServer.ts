/**
 * usePreviewServer — Server lifecycle management.
 * Handles: start (SSE), health check, stop, retry.
 * Returns a clean state machine: stopped → starting → running.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { config } from '../../../../config/config';
import { useUIStore } from '../../../../core/terminal/uiStore';
import { useWorkstationStore } from '../../../../core/terminal/workstationStore';
import { getAuthToken } from '../../../../core/api/getAuthToken';

export type ServerStatus = 'stopped' | 'starting' | 'checking' | 'running';

interface UsePreviewServerReturn {
  status: ServerStatus;
  previewUrl: string;
  error: string | null;
  terminalOutput: string[];
  progress: number;
  statusMessage: string;

  start: () => void;
  stop: () => void;
  retry: () => void;
}

export function usePreviewServer(projectId: string | undefined): UsePreviewServerReturn {
  const [status, setStatus] = useState<ServerStatus>('stopped');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const statusRef = useRef<ServerStatus>('stopped');
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const apiUrl = config.apiUrl;

  const currentWorkstation = useWorkstationStore((s) => s.currentWorkstation);
  const globalFlyMachineId = useUIStore((s) => s.flyMachineId);
  const projectPreviewUrls = useUIStore((s) => s.projectPreviewUrls);

  // Initialize preview URL from store
  useEffect(() => {
    if (projectId && projectPreviewUrls[projectId]) {
      setPreviewUrl(projectPreviewUrls[projectId]);
    }
  }, [projectId]);

  const updateStatus = useCallback((s: ServerStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  // ── Health check ──────────────────────────────────────────

  const checkHealth = useCallback(async () => {
    if (!previewUrl || statusRef.current !== 'running') return;
    try {
      const url = new URL(previewUrl);
      const match = url.pathname.match(/^(\/preview\/[^/]+\/)/);
      if (match) url.pathname = match[1]; // Always check root

      const resp = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'X-Drape-Check': 'true' },
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok && resp.status >= 500) {
        const body = await resp.text();
        if (body.includes('Endpoint not found') || body.includes('ECONNREFUSED')) {
          return; // Transient proxy error — ignore
        }
      }
    } catch {
      // Network error — ignore, server might be temporarily slow
    }
  }, [previewUrl]);

  useEffect(() => {
    if (status === 'running') {
      healthCheckRef.current = setInterval(checkHealth, 5000);
    } else {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
    }
    return () => {
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
    };
  }, [status, checkHealth]);

  // ── Start server via SSE ──────────────────────────────────

  const start = useCallback(async () => {
    if (!projectId) return;
    updateStatus('starting');
    setError(null);
    setTerminalOutput([]);
    setProgress(5);
    setStatusMessage('Avvio server in corso...');

    try {
      const authToken = await getAuthToken(true);
      const resp = await fetch(`${apiUrl}/fly/preview/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          projectId,
          repositoryUrl: currentWorkstation?.repositoryUrl,
        }),
      });

      if (!resp.ok || !resp.body) {
        const text = await resp.text();
        setError(text || 'Failed to start server');
        updateStatus('stopped');
        return;
      }

      // Read SSE stream
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const data = JSON.parse(line.slice(5).trim());

            if (data.type === 'step') {
              setStatusMessage(data.message || '');
              if (data.progress) setProgress(data.progress);
            }
            if (data.type === 'log') {
              setTerminalOutput(prev => [...prev.slice(-50), data.message || data.log || '']);
            }
            if (data.type === 'step.ready' || data.type === 'ready') {
              const url = data.previewUrl || data.url || previewUrl;
              if (url) {
                setPreviewUrl(url);
                useUIStore.getState().setPreviewServerUrl(url, projectId);
              }
              updateStatus('running');
              setProgress(100);
              setStatusMessage('Server pronto');
            }
            if (data.type === 'error') {
              setError(data.message || 'Server start failed');
              updateStatus('stopped');
            }
          } catch { /* parse error, skip */ }
        }
      }

      // If stream ended without ready event
      if (statusRef.current === 'starting') {
        // Check if URL is already available
        if (previewUrl || projectPreviewUrls[projectId || '']) {
          updateStatus('running');
        } else {
          setError('Server stream ended without ready signal');
          updateStatus('stopped');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start');
      updateStatus('stopped');
    }
  }, [projectId, apiUrl, currentWorkstation, previewUrl, projectPreviewUrls, updateStatus]);

  // ── Stop ──────────────────────────────────────────────────

  const stop = useCallback(() => {
    updateStatus('stopped');
    setError(null);
    setStatusMessage('');
    setProgress(0);
  }, [updateStatus]);

  // ── Retry ─────────────────────────────────────────────────

  const retry = useCallback(() => {
    setError(null);
    if (previewUrl) {
      // Server might still be running, just reload
      updateStatus('running');
    } else {
      start();
    }
  }, [previewUrl, start, updateStatus]);

  return {
    status,
    previewUrl,
    error,
    terminalOutput,
    progress,
    statusMessage,
    start,
    stop,
    retry,
  };
}
