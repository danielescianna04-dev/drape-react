/**
 * Git Cache Store
 * Caches git data (commits, branches, status) per project for instant UI
 * Uses Stale-While-Revalidate pattern like Replit
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GitCommitCache {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    authorEmail: string;
    authorAvatar?: string;
    authorLogin?: string;
    date: string; // ISO string for persistence
    isHead: boolean;
    branch?: string;
    url?: string;
}

interface GitBranchCache {
    name: string;
    isCurrent: boolean;
    isRemote: boolean;
    tracking?: string;
    ahead?: number;
    behind?: number;
}

interface GitStatusCache {
    staged: string[];
    modified: string[];
    untracked: string[];
    deleted: string[];
}

interface GitCacheEntry {
    commits: GitCommitCache[];
    branches: GitBranchCache[];
    status: GitStatusCache | null;
    currentBranch: string;
    isGitRepo: boolean;
    timestamp: number;
}

interface GitCacheState {
    cache: Record<string, GitCacheEntry>;

    // Get cached git data (returns null if no cache)
    getGitData: (projectId: string) => GitCacheEntry | null;

    // Set cached git data
    setGitData: (projectId: string, data: Omit<GitCacheEntry, 'timestamp'>) => void;

    // Check if cache is valid (not expired)
    isCacheValid: (projectId: string, maxAgeMs?: number) => boolean;

    // Clear cache for a project
    clearCache: (projectId: string) => void;

    // Clear all cache
    clearAllCache: () => void;
}

// Cache expiry: 2 minutes (git data changes more frequently)
const DEFAULT_CACHE_MAX_AGE = 2 * 60 * 1000;

export const useGitCacheStore = create<GitCacheState>()(
    persist(
        (set, get) => ({
            cache: {},

            getGitData: (projectId: string) => {
                return get().cache[projectId] || null;
            },

            setGitData: (projectId: string, data: Omit<GitCacheEntry, 'timestamp'>) => {
                set(state => ({
                    cache: {
                        ...state.cache,
                        [projectId]: {
                            ...data,
                            timestamp: Date.now(),
                        }
                    }
                }));
                console.log(`🔀 [GitCache] Cached ${data.commits.length} commits, ${data.branches.length} branches for ${projectId}`);
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
                    console.log(`🔀 [GitCache] Cleared cache for ${projectId}`);
                    return { cache: newCache };
                });
            },

            clearAllCache: () => {
                set({ cache: {} });
                console.log(`🔀 [GitCache] Cleared all cache`);
            },
        }),
        {
            name: 'git-cache-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
