import fs from 'fs';
import path from 'path';
import { Session } from '../types';
import { log } from '../utils/logger';
import { debounce } from '../utils/helpers';

const PERSIST_PATH = path.resolve(__dirname, '../../sessions.json');

function sessionKey(userId: string, projectId: string): string {
  return `${userId}:${projectId}`;
}

class SessionService {
  private sessions = new Map<string, Session>();
  private locks = new Map<string, Promise<void>>();
  private saveToDiskDebounced: () => void;

  constructor() {
    this.saveToDiskDebounced = debounce(() => this.saveToDisk(), 1000);
    this.loadFromDisk();
  }

  async get(projectId: string, userId: string): Promise<Session | null> {
    return this.sessions.get(sessionKey(userId, projectId)) || null;
  }

  /**
   * Find the most recent session for a projectId (regardless of userId).
   * Used by routes that don't have userId context (preview proxy, file notifications, etc.)
   * Returns the session with the latest lastUsed timestamp to avoid stale entries.
   */
  async getByProjectId(projectId: string): Promise<Session | null> {
    let best: Session | null = null;
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        if (!best || (session.lastUsed || 0) > (best.lastUsed || 0)) {
          best = session;
        }
      }
    }
    return best;
  }

  async set(projectId: string, userId: string, session: Session): Promise<void> {
    session.lastUsed = Date.now();
    this.sessions.set(sessionKey(userId, projectId), session);
    this.saveToDiskDebounced();
  }

  async delete(projectId: string, userId: string): Promise<void> {
    this.sessions.delete(sessionKey(userId, projectId));
    this.saveToDiskDebounced();
  }

  async getAll(): Promise<Session[]> {
    return Array.from(this.sessions.values());
  }

  /**
   * Find all sessions for a userId (across all projects).
   * Used to enforce 1-container-per-user limit.
   */
  async getByUserId(userId: string): Promise<Session[]> {
    const results: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) results.push(session);
    }
    return results;
  }

  async getByContainerId(containerId: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.containerId === containerId) return session;
    }
    return null;
  }

  /**
   * Acquire a lock per userId:projectId to prevent concurrent operations
   */
  async withLock<T>(projectId: string, userId: string, fn: () => Promise<T>): Promise<T> {
    const key = sessionKey(userId, projectId);
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let resolve: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    this.locks.set(key, promise);

    try {
      return await fn();
    } finally {
      this.locks.delete(key);
      resolve!();
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(PERSIST_PATH)) {
        const data = JSON.parse(fs.readFileSync(PERSIST_PATH, 'utf-8'));
        if (Array.isArray(data)) {
          for (const entry of data) {
            if (entry.projectId) {
              // Backward compat: old sessions without userId get 'legacy'
              const uid = entry.userId || 'legacy';
              entry.userId = uid;
              this.sessions.set(sessionKey(uid, entry.projectId), entry);
            }
          }
          log.info(`[Sessions] Loaded ${this.sessions.size} sessions from disk`);
        }
      }
    } catch (e: any) {
      log.warn(`[Sessions] Failed to load from disk: ${e.message}`);
    }
  }

  private saveToDisk(): void {
    try {
      const data = Array.from(this.sessions.values());
      fs.writeFileSync(PERSIST_PATH, JSON.stringify(data, null, 2));
    } catch (e: any) {
      log.warn(`[Sessions] Failed to save to disk: ${e.message}`);
    }
  }
}

export const sessionService = new SessionService();
