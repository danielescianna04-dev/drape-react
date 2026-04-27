/**
 * Pending generation jobs — local memory of which job is currently running for
 * each project, persisted to AsyncStorage so it survives app kills.
 *
 * Why this exists: when the user starts a generation and then closes/kills
 * the app, the backend keeps running. On next open we want to immediately
 * re-attach to the live SSE stream (or fetch the final state if already
 * completed). The jobId is the only handle we need; everything else lives
 * server-side.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'drape:pending_jobs:v1';

type Map_ = Record<string /* projectId */, string /* jobId */>;

let cache: Map_ | null = null;

async function read(): Promise<Map_> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as Map_) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

async function write(next: Map_): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: in worst case we lose the ability to auto-resume on next launch.
  }
}

export const pendingJobs = {
  async set(projectId: string, jobId: string): Promise<void> {
    const cur = await read();
    if (cur[projectId] === jobId) return;
    await write({ ...cur, [projectId]: jobId });
  },

  async clear(projectId: string): Promise<void> {
    const cur = await read();
    if (!(projectId in cur)) return;
    const { [projectId]: _, ...rest } = cur;
    await write(rest);
  },

  async get(projectId: string): Promise<string | null> {
    const cur = await read();
    return cur[projectId] || null;
  },

  async getAll(): Promise<{ projectId: string; jobId: string }[]> {
    const cur = await read();
    return Object.entries(cur).map(([projectId, jobId]) => ({ projectId, jobId }));
  },
};
