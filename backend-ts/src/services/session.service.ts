import fs from 'fs';
import path from 'path';
import { Session } from '../types';
import { log } from '../utils/logger';
import { debounce } from '../utils/helpers';

const PERSIST_PATH = path.resolve(__dirname, '../../sessions.json');

class SessionService {
  private sessions = new Map<string, Session>();
  private locks = new Map<string, Promise<void>>();
  private saveToDiskDebounced: () => void;

  constructor() {
    this.saveToDiskDebounced = debounce(() => this.saveToDisk(), 1000);
    this.loadFromDisk();
  }

  async get(projectId: string): Promise<Session | null> {
    return this.sessions.get(projectId) || null;
  }

  async set(projectId: string, session: Session): Promise<void> {
    session.lastUsed = Date.now();
    this.sessions.set(projectId, session);
    this.saveToDiskDebounced();
  }

  async delete(projectId: string): Promise<void> {
    this.sessions.delete(projectId);
    this.saveToDiskDebounced();
  }

  async getAll(): Promise<Session[]> {
    return Array.from(this.sessions.values());
  }

  async getByContainerId(containerId: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.containerId === containerId) return session;
    }
    return null;
  }

  /**
   * Acquire a lock per projectId to prevent concurrent operations
   */
  async withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(projectId)) {
      await this.locks.get(projectId);
    }

    let resolve: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    this.locks.set(projectId, promise);

    try {
      return await fn();
    } finally {
      this.locks.delete(projectId);
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
              this.sessions.set(entry.projectId, entry);
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
