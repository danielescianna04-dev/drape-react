/**
 * File Cache Store
 * Caches file lists per project to avoid repeated backend calls
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FileCacheEntry {
    files: string[];
    timestamp: number;
    repositoryUrl?: string;
}

interface FileCacheState {
    cache: Record<string, FileCacheEntry>;

    // Track which projects are being prefetched
    prefetchingProjects: Set<string>;

    // Track last cleared project (for subscriptions)
    lastClearedProject: string | null;

    // Get cached files for a project (returns null if expired)
    getFiles: (projectId: string) => string[] | null;

    // Get cached files ignoring expiry (for Stale-While-Revalidate)
    getFilesIgnoringExpiry: (projectId: string) => string[] | null;

    // Set cached files for a project
    setFiles: (projectId: string, files: string[], repositoryUrl?: string) => void;

    // Check if cache is valid (not expired)
    isCacheValid: (projectId: string, maxAgeMs?: number) => boolean;

    // Clear cache for a project (triggers refresh in FileExplorer)
    clearCache: (projectId: string) => void;

    // Clear all cache
    clearAllCache: () => void;

    // Check if a project is being prefetched
    isPrefetching: (projectId: string) => boolean;

    // Set prefetching status
    setPrefetching: (projectId: string, isPrefetching: boolean) => void;
}

// Default cache expiry: 5 minutes
const DEFAULT_CACHE_MAX_AGE = 5 * 60 * 1000;

export const useFileCacheStore = create<FileCacheState>()(
    persist(
        (set, get) => ({
            cache: {},
            prefetchingProjects: new Set<string>(),
            lastClearedProject: null,

            getFiles: (projectId: string) => {
                const entry = get().cache[projectId];
                if (!entry) return null;

                // Check if cache is still valid
                if (!get().isCacheValid(projectId)) {
                    return null;
                }

                return entry.files;
            },

            getFilesIgnoringExpiry: (projectId: string) => {
                const entry = get().cache[projectId];
                return entry ? entry.files : null;
            },

            setFiles: (projectId: string, files: string[], repositoryUrl?: string) => {
                set(state => ({
                    cache: {
                        ...state.cache,
                        [projectId]: {
                            files,
                            timestamp: Date.now(),
                            repositoryUrl,
                        }
                    }
                }));
                console.log(`📁 [FileCache] Cached ${files.length} files for ${projectId}`);
            },

            isCacheValid: (projectId: string, maxAgeMs = DEFAULT_CACHE_MAX_AGE) => {
                const entry = get().cache[projectId];
                if (!entry) return false;

                const age = Date.now() - entry.timestamp;
                return age < maxAgeMs;
            },

            clearCache: (projectId: string) => {
                set(state => {
                    const newCache = { ...state.cache };
                    delete newCache[projectId];
                    console.log(`📁 [FileCache] Cleared cache for ${projectId}`);
                    return { cache: newCache, lastClearedProject: projectId };
                });
            },

            clearAllCache: () => {
                set({ cache: {} });
                console.log(`📁 [FileCache] Cleared all cache`);
            },

            isPrefetching: (projectId: string) => {
                return get().prefetchingProjects.has(projectId);
            },

            setPrefetching: (projectId: string, isPrefetching: boolean) => {
                set(state => {
                    const newSet = new Set(state.prefetchingProjects);
                    if (isPrefetching) {
                        newSet.add(projectId);
                    } else {
                        newSet.delete(projectId);
                    }
                    return { prefetchingProjects: newSet };
                });
            },
        }),
        {
            name: 'file-cache-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({ cache: state.cache }), // Don't persist prefetchingProjects
        }
    )
);
