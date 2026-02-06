import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { config } from '../config';
import { log } from '../utils/logger';
import { FileEntry, FileContent, Result, GrepMatch } from '../types';
import { BINARY_EXTENSIONS, IGNORED_DIRS, MAX_FILE_SIZE, MAX_FILES_LIST } from '../utils/constants';
import { sanitizePath, execShell, shellEscape } from '../utils/helpers';

class FileService {
  private projectPath(projectId: string): string {
    return path.join(config.projectsRoot, projectId);
  }

  /**
   * Ensure project directory exists on NVMe
   */
  async ensureProjectDir(projectId: string): Promise<string> {
    const dir = this.projectPath(projectId);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  async exists(projectId: string, filePath: string): Promise<boolean> {
    try {
      const fullPath = sanitizePath(this.projectPath(projectId), filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(projectId: string, filePath: string): Promise<Result<FileContent>> {
    try {
      const fullPath = sanitizePath(this.projectPath(projectId), filePath);
      const stat = await fs.stat(fullPath);

      if (stat.size > MAX_FILE_SIZE) {
        return { success: false, error: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB)` };
      }

      const isBinary = this.isBinary(filePath);
      const buffer = await fs.readFile(fullPath);
      const content = isBinary ? buffer.toString('base64') : buffer.toString('utf-8');

      return {
        success: true,
        data: { path: filePath, content, isBinary, size: stat.size },
      };
    } catch (e: any) {
      if (e.code === 'ENOENT') return { success: false, error: 'File not found' };
      return { success: false, error: e.message };
    }
  }

  async writeFile(projectId: string, filePath: string, content: string | Buffer): Promise<Result> {
    try {
      const fullPath = sanitizePath(this.projectPath(projectId), filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });

      if (typeof content === 'string') {
        await fs.writeFile(fullPath, content, 'utf-8');
      } else {
        await fs.writeFile(fullPath, content);
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async deleteFile(projectId: string, filePath: string): Promise<Result> {
    try {
      const fullPath = sanitizePath(this.projectPath(projectId), filePath);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true });
      } else {
        await fs.unlink(fullPath);
      }
      return { success: true };
    } catch (e: any) {
      if (e.code === 'ENOENT') return { success: true }; // Already deleted
      return { success: false, error: e.message };
    }
  }

  async createFolder(projectId: string, folderPath: string): Promise<Result> {
    try {
      const fullPath = sanitizePath(this.projectPath(projectId), folderPath);
      await fs.mkdir(fullPath, { recursive: true });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async listFiles(projectId: string, directory = ''): Promise<Result<FileEntry[]>> {
    try {
      const base = this.projectPath(projectId);
      const dir = directory ? sanitizePath(base, directory) : base;
      const entries = await fs.readdir(dir, { withFileTypes: true });

      const files: FileEntry[] = entries
        .filter(e => !IGNORED_DIRS.includes(e.name))
        .map(e => ({
          path: path.join(directory, e.name),
          isDirectory: e.isDirectory(),
        }));

      return { success: true, data: files };
    } catch (e: any) {
      if (e.code === 'ENOENT') return { success: true, data: [] };
      return { success: false, error: e.message };
    }
  }

  async listAllFiles(projectId: string): Promise<Result<FileEntry[]>> {
    try {
      const base = this.projectPath(projectId);
      const files = await fg('**/*', {
        cwd: base,
        ignore: IGNORED_DIRS.map(d => `${d}/**`),
        dot: true,
        onlyFiles: true,
        stats: true,
      });

      const entries: FileEntry[] = files.slice(0, MAX_FILES_LIST).map(f => ({
        path: f.path,
        size: f.stats?.size,
      }));

      return { success: true, data: entries };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async glob(projectId: string, pattern: string): Promise<Result<string[]>> {
    try {
      const base = this.projectPath(projectId);
      const files = await fg(pattern, {
        cwd: base,
        ignore: IGNORED_DIRS.map(d => `${d}/**`),
        dot: true,
      });
      return { success: true, data: files };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async grep(projectId: string, pattern: string, options?: { maxResults?: number }): Promise<Result<GrepMatch[]>> {
    try {
      const base = this.projectPath(projectId);
      const maxResults = options?.maxResults || 100;
      const excludes = IGNORED_DIRS.map(d => `--exclude-dir=${d}`).join(' ');
      const cmd = `grep -rn ${excludes} --include='*.*' -m ${maxResults} -e ${shellEscape(pattern)} ${shellEscape(base)} 2>/dev/null || true`;
      const result = await execShell(cmd, base, 10000);

      const matches: GrepMatch[] = result.stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, maxResults)
        .map(line => {
          const match = line.match(/^(.+?):(\d+):(.*)$/);
          if (!match) return null;
          return {
            file: match[1].replace(base + '/', ''),
            line: parseInt(match[2]),
            content: match[3],
          };
        })
        .filter((m): m is GrepMatch => m !== null);

      return { success: true, data: matches };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Delete the entire project directory
   */
  async deleteProject(projectId: string): Promise<Result> {
    try {
      // Delete project files
      const dir = this.projectPath(projectId);
      await fs.rm(dir, { recursive: true, force: true });

      // Delete .next build cache
      const nextCacheDir = path.join(config.cacheRoot, 'next-build', projectId);
      await fs.rm(nextCacheDir, { recursive: true, force: true }).catch(() => {});

      log.info(`[File] Deleted project and cache for ${projectId}`);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Notify running container agent about a file change (for hot reload)
   */
  async notifyAgent(agentUrl: string, filePath: string, content: string): Promise<void> {
    try {
      const axios = (await import('axios')).default;
      await axios.post(`${agentUrl}/file`, { path: filePath, content }, { timeout: 3000 });
    } catch {
      // fire-and-forget — container might not be running
    }
  }

  private isBinary(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
  }
}

export const fileService = new FileService();
