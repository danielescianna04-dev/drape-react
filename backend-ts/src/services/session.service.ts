import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
    const session = this.sessions.get(sessionKey(userId, projectId)) || null;
    if (session && !session.accessToken) {
      session.accessToken = this.generateAccessToken();
      this.saveToDiskDebounced();
    }
    return session;
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
        if (!session.accessToken) {
          session.accessToken = this.generateAccessToken();
          this.saveToDiskDebounced();
        }
        if (!best || (session.lastUsed || 0) > (best.lastUsed || 0)) {
          best = session;
        }
      }
    }
    return best;
  }

  async getByProjectIdAndAccessToken(projectId: string, accessToken: string): Promise<Session | null> {
    if (!accessToken) return null;
    // Case-insensitive projectId match. Firestore IDs are mixed-case but
    // DNS hostnames are always lowercased by Express (req.hostname), so a
    // strict === would miss every session when coming through the subdomain
    // proxy. Access token remains case-sensitive.
    const projectIdLc = projectId.toLowerCase();
    for (const session of this.sessions.values()) {
      if (
        session.projectId.toLowerCase() === projectIdLc &&
        session.accessToken === accessToken
      ) {
        return session;
      }
    }
    return null;
  }

  async set(projectId: string, userId: string, session: Session): Promise<void> {
    session.lastUsed = Date.now();
    if (!session.accessToken) {
      session.accessToken = this.generateAccessToken();
    }
    this.sessions.set(sessionKey(userId, projectId), session);
    this.saveToDiskDebounced();
  }

  async delete(projectId: string, userId: string): Promise<void> {
    this.sessions.delete(sessionKey(userId, projectId));
    this.saveToDiskDebounced();
  }

  async getAll(): Promise<Session[]> {
    const all = Array.from(this.sessions.values());
    let changed = false;
    for (const s of all) {
      if (!s.accessToken) {
        s.accessToken = this.generateAccessToken();
        changed = true;
      }
    }
    if (changed) this.saveToDiskDebounced();
    return all;
  }

  /**
   * Find all sessions for a userId (across all projects).
   * Used to enforce 1-container-per-user limit.
   */
  async getByUserId(userId: string): Promise<Session[]> {
    const results: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        if (!session.accessToken) {
          session.accessToken = this.generateAccessToken();
          this.saveToDiskDebounced();
        }
        results.push(session);
      }
    }
    return results;
  }

  async getByContainerId(containerId: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.containerId === containerId) {
        if (!session.accessToken) {
          session.accessToken = this.generateAccessToken();
          this.saveToDiskDebounced();
        }
        return session;
      }
    }
    return null;
  }

  async deleteByContainerId(containerId: string): Promise<void> {
    let changed = false;
    for (const [key, session] of this.sessions.entries()) {
      if (session.containerId === containerId) {
        this.sessions.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.saveToDiskDebounced();
    }
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
          let changed = false;
          for (const entry of data) {
            if (entry.projectId) {
              // Backward compat: old sessions without userId get 'legacy'
              const uid = entry.userId || 'legacy';
              entry.userId = uid;
              if (!entry.accessToken) {
                entry.accessToken = this.generateAccessToken();
                changed = true;
              }
              this.sessions.set(sessionKey(uid, entry.projectId), entry);
            }
          }
          if (changed) this.saveToDiskDebounced();
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

  private generateAccessToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }
}

export const sessionService = new SessionService();
