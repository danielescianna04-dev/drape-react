import { useEffect } from 'react';
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

    useEffect(() => {
        if (!projectId) return;

        const handleFileChange = (event: any) => {
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
