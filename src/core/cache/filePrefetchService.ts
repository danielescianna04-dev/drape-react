/**
 * File Prefetch Service
 * Pre-loads project files in the background before entering workspace
 */

import { useFileCacheStore } from './fileCacheStore';
import { workstationService } from '../workstation/workstationService-firebase';
import { gitAccountService } from '../git/gitAccountService';
import { useTerminalStore } from '../terminal/terminalStore';

export interface PrefetchResult {
    success: boolean;
    fileCount: number;
    fromCache: boolean;
    error?: string;
}

export const filePrefetchService = {
    /**
     * Prefetch files for a project before opening it
     * Returns immediately if files are already cached and valid
     */
    async prefetchFiles(
        projectId: string,
        repositoryUrl?: string,
        forceRefresh = false
    ): Promise<PrefetchResult> {
        const cacheStore = useFileCacheStore.getState();

        // Check if already prefetching
        if (cacheStore.isPrefetching(projectId)) {
            return { success: true, fileCount: 0, fromCache: true };
        }

        // Check if cache is valid (unless forcing refresh)
        if (!forceRefresh && cacheStore.isCacheValid(projectId)) {
            const cachedFiles = cacheStore.getFiles(projectId);
            return {
                success: true,
                fileCount: cachedFiles?.length || 0,
                fromCache: true
            };
        }

        try {
            // Mark as prefetching
            cacheStore.setPrefetching(projectId, true);

            // Get token for this repo
            let gitToken: string | null = null;
            const userId = useTerminalStore.getState().userId || 'anonymous';

            try {
                if (repositoryUrl) {
                    const tokenData = await gitAccountService.getTokenForRepo(userId, repositoryUrl);
                    if (tokenData) {
                        gitToken = tokenData.token;
                    }
                }
                if (!gitToken) {
                    const defaultTokenData = await gitAccountService.getDefaultToken(userId);
                    if (defaultTokenData) {
                        gitToken = defaultTokenData.token;
                    }
                }
            } catch (tokenErr) {
            }

            // Fetch files from backend
            const files = await workstationService.getWorkstationFiles(
                projectId,
                repositoryUrl,
                gitToken || undefined
            );

            // Save to cache
            cacheStore.setFiles(projectId, files, repositoryUrl);

            return {
                success: true,
                fileCount: files.length,
                fromCache: false
            };
        } catch (error: any) {
            console.error(`❌ [Prefetch] Error prefetching ${projectId}:`, error);
            return {
                success: false,
                fileCount: 0,
                fromCache: false,
                error: error.message || 'Failed to prefetch files'
            };
        } finally {
            // Clear prefetching status
            cacheStore.setPrefetching(projectId, false);
        }
    },

    /**
     * Quick check if files need to be prefetched
     */
    needsPrefetch(projectId: string): boolean {
        const cacheStore = useFileCacheStore.getState();
        return !cacheStore.isCacheValid(projectId);
    },

    /**
     * Invalidate cache and trigger refresh (useful after AI modifications)
     */
    async refreshProjectFiles(
        projectId: string,
        repositoryUrl?: string
    ): Promise<PrefetchResult> {
        const cacheStore = useFileCacheStore.getState();

        // Clear cache first
        cacheStore.clearCache(projectId);

        // Re-fetch
        return this.prefetchFiles(projectId, repositoryUrl, true);
    }
};
