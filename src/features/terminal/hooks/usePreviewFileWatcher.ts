/**
 * usePreviewFileWatcher — Hot reload banner logic.
 * Connects to file watcher, tracks pending changes,
 * shows reload banner when changes detected (debounced).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { fileWatcherService } from '../../../core/services/agentService';
import { useAgentStore } from '../../../core/agent/agentStore';
import { logOutput } from '../../../core/terminal/terminalLogger';

interface UsePreviewFileWatcherOptions {
  workstationId: string | undefined;
  username: string;
  serverStatus: string;
  onReload: () => void;
}

export function usePreviewFileWatcher({ workstationId, username, serverStatus, onReload }: UsePreviewFileWatcherOptions) {
  const [showBanner, setShowBanner] = useState(false);
  const pendingChangesRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentIsRunningRef = useRef(false);

  // Track agent running state
  useEffect(() => {
    const unsub = useAgentStore.subscribe((state) => {
      const wasRunning = agentIsRunningRef.current;
      agentIsRunningRef.current = state.isRunning;
      // Agent just finished — show banner if there are pending changes
      if (wasRunning && !state.isRunning && pendingChangesRef.current > 0) {
        setShowBanner(true);
      }
    });
    return unsub;
  }, []);

  // Connect to file watcher
  useEffect(() => {
    if (serverStatus !== 'running' || !workstationId || !username) return;

    fileWatcherService.connect(workstationId, username, (change) => {
      logOutput(`[Hot Reload] ${change.file} changed`, 'preview', 0);
      pendingChangesRef.current += 1;

      if (agentIsRunningRef.current) return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (pendingChangesRef.current > 0) {
          setShowBanner(true);
        }
      }, 1000);
    });

    return () => {
      fileWatcherService.disconnect();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [serverStatus, workstationId, username]);

  const handleBannerReload = useCallback(() => {
    setShowBanner(false);
    pendingChangesRef.current = 0;
    onReload();
  }, [onReload]);

  const dismissBanner = useCallback(() => {
    setShowBanner(false);
    pendingChangesRef.current = 0;
  }, []);

  return {
    showReloadBanner: showBanner,
    handleBannerReload,
    dismissBanner,
  };
}
