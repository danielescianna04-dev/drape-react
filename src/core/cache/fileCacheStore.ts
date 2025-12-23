/**
 * File Cache Store
 * Caches file lists per project to avoid repeated backend calls
 */

import { create } from 'zustand';

interface FileCacheEntry {
    files: string[];
    timestamp: number;
    repositoryUrl?: string;
}

interface FileCacheState {
    cache: Map<string, FileCacheEntry>;

    // Get cached files for a project
    getFiles: (projectId: string) => string[] | null;

    // Set cached files for a project
    setFiles: (projectId: string, files: string[], repositoryUrl?: string) => void;

    // Check if cache is valid (not expired)
    isCacheValid: (projectId: string, maxAgeMs?: number) => boolean;

    // Clear cache for a project
    clearCache: (projectId: string) => void;

    // Clear all cache
    clearAllCache: () => void;
}

// Default cache expiry: 5 minutes
const DEFAULT_CACHE_MAX_AGE = 5 * 60 * 1000;

export const useFileCacheStore = create<FileCacheState>((set, get) => ({
    cache: new Map(),

    getFiles: (projectId: string) => {
        const entry = get().cache.get(projectId);
        if (!entry) return null;

        // Check if cache is still valid
        if (!get().isCacheValid(projectId)) {
            return null;
        }

        return entry.files;
    },

    setFiles: (projectId: string, files: string[], repositoryUrl?: string) => {
        set(state => {
            const newCache = new Map(state.cache);
            newCache.set(projectId, {
                files,
                timestamp: Date.now(),
                repositoryUrl,
            });
            console.log(`📁 [FileCache] Cached ${files.length} files for ${projectId}`);
            return { cache: newCache };
        });
    },

    isCacheValid: (projectId: string, maxAgeMs = DEFAULT_CACHE_MAX_AGE) => {
        const entry = get().cache.get(projectId);
        if (!entry) return false;

        const age = Date.now() - entry.timestamp;
        return age < maxAgeMs;
    },

    clearCache: (projectId: string) => {
        set(state => {
            const newCache = new Map(state.cache);
            newCache.delete(projectId);
            console.log(`📁 [FileCache] Cleared cache for ${projectId}`);
            return { cache: newCache };
        });
    },

    clearAllCache: () => {
        set({ cache: new Map() });
        console.log(`📁 [FileCache] Cleared all cache`);
    },
}));
