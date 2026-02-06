import { useEffect, useRef } from 'react';
import { websocketService } from '../../core/websocket/websocketService';
import { useFileCacheStore } from '../../core/cache/fileCacheStore';
import { useTerminalStore } from '../../core/terminal/terminalStore';

/**
 * Hook to handle global file synchronization.
 * It listens for file changes via WebSocket and invalidates the file cache.
 * This ensures the File Explorer is updated even if it's currently unmounted.
 */
export const useFileSync = () => {
    const currentWorkstation = useTerminalStore((state) => state.currentWorkstation);
    const projectId = currentWorkstation?.id;
    const subscriptionTimeRef = useRef<number>(0);
    const burstCountRef = useRef<number>(0);

    useEffect(() => {
        if (!projectId) return;

        // Track when we subscribe to detect initial burst
        subscriptionTimeRef.current = Date.now();
        burstCountRef.current = 0;

        const handleFileChange = (event: any) => {
            const timeSinceSubscription = Date.now() - subscriptionTimeRef.current;

            // Ignore initial burst of "file_created" events for first 3 seconds
            // This happens when reconnecting to a project with existing files
            if (event.type === 'file_created' && timeSinceSubscription < 3000) {
                burstCountRef.current++;
                if (burstCountRef.current === 1) {
                }
                return; // Skip processing this event
            }

            // Log burst summary if we had one
            if (burstCountRef.current > 0 && timeSinceSubscription >= 3000) {
                burstCountRef.current = 0; // Reset counter
            }

            // Invalidate cache for this project so the next load will fetch fresh data
            useFileCacheStore.getState().clearCache(projectId);
        };

        websocketService.subscribeToFiles(projectId, handleFileChange);

        return () => {
            websocketService.unsubscribeFromFiles(projectId, handleFileChange);
        };
    }, [projectId]);
};
