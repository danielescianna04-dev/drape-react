import chokidar from 'chokidar';
import path from 'path';
import WebSocket from 'ws';
import { config } from '../config';
import { log } from '../utils/logger';
import { IGNORED_DIRS } from '../utils/constants';

interface WatcherState {
  watcher: ReturnType<typeof chokidar.watch>;
  projectId: string;
}

class FileWatcherService {
  private watchers = new Map<string, WatcherState>();
  private clients = new Map<string, Set<WebSocket>>();

  /**
   * Start watching a project directory for changes
   */
  async startWatching(projectId: string): Promise<void> {
    if (this.watchers.has(projectId)) return;

    const projectDir = path.join(config.projectsRoot, projectId);
    const ignorePattern = new RegExp(`(${IGNORED_DIRS.join('|')})`);

    const watcher = chokidar.watch(projectDir, {
      ignored: ignorePattern,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    watcher.on('change', (filePath) => {
      const rel = path.relative(projectDir, filePath);
      this.broadcast(projectId, { type: 'file_changed', path: rel, projectId, timestamp: Date.now() });
    });

    watcher.on('add', (filePath) => {
      const rel = path.relative(projectDir, filePath);
      this.broadcast(projectId, { type: 'file_created', path: rel, projectId, timestamp: Date.now() });
    });

    watcher.on('unlink', (filePath) => {
      const rel = path.relative(projectDir, filePath);
      this.broadcast(projectId, { type: 'file_deleted', path: rel, projectId, timestamp: Date.now() });
    });

    this.watchers.set(projectId, { watcher, projectId });
    log.info(`[FileWatcher] Watching ${projectId}`);
  }

  /**
   * Stop watching a project
   */
  stopWatching(projectId: string): void {
    const state = this.watchers.get(projectId);
    if (state) {
      state.watcher.close();
      this.watchers.delete(projectId);
      log.info(`[FileWatcher] Stopped watching ${projectId}`);
    }
  }

  /**
   * Register a WebSocket client for file change events
   */
  registerClient(projectId: string, ws: WebSocket): void {
    if (!this.clients.has(projectId)) {
      this.clients.set(projectId, new Set());
    }
    this.clients.get(projectId)!.add(ws);

    ws.on('close', () => {
      this.clients.get(projectId)?.delete(ws);
      if (this.clients.get(projectId)?.size === 0) {
        this.clients.delete(projectId);
      }
    });
  }

  /**
   * Manually notify about a file change (e.g., after write via API)
   */
  notifyChange(projectId: string, filePath: string, type: 'file_created' | 'file_changed' | 'file_deleted' = 'file_changed'): void {
    this.broadcast(projectId, { type, path: filePath, projectId, timestamp: Date.now() });
  }

  private broadcast(projectId: string, event: Record<string, unknown>): void {
    const clients = this.clients.get(projectId);
    if (!clients || clients.size === 0) return;

    const data = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); } catch { /* ignore */ }
      }
    }
  }
}

export const fileWatcherService = new FileWatcherService();
