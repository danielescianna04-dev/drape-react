/**
 * Clone Status Store
 * Tracks the clone status for projects
 */

import { create } from 'zustand';

interface CloneStatus {
    isCloning: boolean;
    progress?: string;
    success?: boolean;
    error?: string;
    repoName?: string;
    startedAt?: number;
}

interface CloneStatusState {
    statuses: Map<string, CloneStatus>;

    // Get status for a project
    getStatus: (projectId: string) => CloneStatus | null;

    // Start cloning
    startClone: (projectId: string, repoName?: string) => void;

    // Update progress
    updateProgress: (projectId: string, progress: string) => void;

    // Complete clone (success)
    completeClone: (projectId: string) => void;

    // Fail clone
    failClone: (projectId: string, error: string) => void;

    // Clear status
    clearStatus: (projectId: string) => void;
}

export const useCloneStatusStore = create<CloneStatusState>((set, get) => ({
    statuses: new Map(),

    getStatus: (projectId: string) => {
        return get().statuses.get(projectId) || null;
    },

    startClone: (projectId: string, repoName?: string) => {
        set(state => {
            const newStatuses = new Map(state.statuses);
            newStatuses.set(projectId, {
                isCloning: true,
                repoName,
                startedAt: Date.now(),
            });
            return { statuses: newStatuses };
        });
    },

    updateProgress: (projectId: string, progress: string) => {
        set(state => {
            const newStatuses = new Map(state.statuses);
            const current = newStatuses.get(projectId);
            if (current) {
                newStatuses.set(projectId, { ...current, progress });
            }
            return { statuses: newStatuses };
        });
    },

    completeClone: (projectId: string) => {
        set(state => {
            const newStatuses = new Map(state.statuses);
            const current = newStatuses.get(projectId);
            newStatuses.set(projectId, {
                ...current,
                isCloning: false,
                success: true,
                error: undefined,
            });

            // Auto-clear after 3 seconds
            setTimeout(() => {
                get().clearStatus(projectId);
            }, 3000);

            return { statuses: newStatuses };
        });
    },

    failClone: (projectId: string, error: string) => {
        set(state => {
            const newStatuses = new Map(state.statuses);
            const current = newStatuses.get(projectId);
            newStatuses.set(projectId, {
                ...current,
                isCloning: false,
                success: false,
                error,
            });

            // Auto-clear after 5 seconds
            setTimeout(() => {
                get().clearStatus(projectId);
            }, 5000);

            return { statuses: newStatuses };
        });
    },

    clearStatus: (projectId: string) => {
        set(state => {
            const newStatuses = new Map(state.statuses);
            newStatuses.delete(projectId);
            return { statuses: newStatuses };
        });
    },
}));
