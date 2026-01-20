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
                    console.log(`⏳ [useFileSync] Ignoring initial file burst for ${projectId} (3s grace period)`);
                }
                return; // Skip processing this event
            }

            // Log burst summary if we had one
            if (burstCountRef.current > 0 && timeSinceSubscription >= 3000) {
                console.log(`✅ [useFileSync] Initial burst complete: ignored ${burstCountRef.current} events`);
                burstCountRef.current = 0; // Reset counter
            }

            console.log(`📡 [useFileSync] File change detected: ${event.type} ${event.path} for project ${projectId}`);
            // Invalidate cache for this project so the next load will fetch fresh data
            useFileCacheStore.getState().clearCache(projectId);
        };

        console.log(`🔌 [useFileSync] Subscribing to file changes for project: ${projectId}`);
        websocketService.subscribeToFiles(projectId, handleFileChange);

        return () => {
            console.log(`🔌 [useFileSync] Unsubscribing from file changes for project: ${projectId}`);
            websocketService.unsubscribeFromFiles(projectId, handleFileChange);
        };
    }, [projectId]);
};
