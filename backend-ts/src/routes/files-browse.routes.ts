import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { firebaseService } from '../services/firebase.service';
import { verifyProjectOwnership } from '../middleware/auth';
import { fileService } from '../services/file.service';
import { config } from '../config';
import { log } from '../utils/logger';
import { sanitizePath } from '../utils/helpers';

export const filesBrowseRouter = Router();

// ── Token-based auth for browser access ──
async function verifyBrowseToken(req: Request, res: Response): Promise<string | null> {
  const token = (req.query.token as string) || '';
  if (!token) {
    res.status(401).send('Authentication required');
    return null;
  }
  try {
    const auth = firebaseService.getAuth();
    const decoded = await auth.verifyIdToken(token);
    return decoded.uid;
  } catch (err: any) {
    log.warn(`[FilesBrowse] Token verification failed: ${err.message}`);
    res.status(401).send('Invalid or expired token');
    return null;
  }
}

// ── Browse page: GET /files/:projectId/browse?token=... ──
filesBrowseRouter.get('/:projectId/browse', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const userId = await verifyBrowseToken(req, res);
  if (!userId) return;

  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) { res.status(403).send('Access denied'); return; }

  try {
    const result = await fileService.listAllFiles(projectId);
    const files = result.data || [];

    const token = req.query.token as string;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderBrowsePage(projectId, files, token, baseUrl));
  } catch (err: any) {
    log.error(`[FilesBrowse] Error listing files for ${projectId}: ${err.message}`);
    res.status(500).send('Error loading files');
  }
});

// ── Download file: GET /files/:projectId/download?path=...&token=... ──
filesBrowseRouter.get('/:projectId/download', async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const filePath = req.query.path as string;
  if (!filePath) { res.status(400).send('Missing path parameter'); return; }

  const userId = await verifyBrowseToken(req, res);
  if (!userId) return;

  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) { res.status(403).send('Access denied'); return; }

  try {
    const basePath = path.join(config.projectsRoot, projectId);
    const fullPath = sanitizePath(basePath, filePath);
    const stat = await fs.stat(fullPath);

    if (!stat.isFile()) { res.status(400).send('Not a file'); return; }

    // 50MB limit
    if (stat.size > 50 * 1024 * 1024) { res.status(413).send('File too large'); return; }

    const fileName = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', stat.size);

    const { createReadStream } = await import('fs');
    createReadStream(fullPath).pipe(res);
  } catch (err: any) {
    if (err.message === 'Path traversal detected') {
      res.status(400).send('Invalid path');
    } else {
      log.error(`[FilesBrowse] Download error: ${err.message}`);
      res.status(404).send('File not found');
    }
  }
});

// ── Download all as ZIP: GET /files/:projectId/download-zip?token=... ──
filesBrowseRouter.get('/:projectId/download-zip', async (req: Request, res: Response) => {
  const { projectId } = req.params;

  const userId = await verifyBrowseToken(req, res);
  if (!userId) return;

  const isOwner = await verifyProjectOwnership(userId, projectId);
  if (!isOwner) { res.status(403).send('Access denied'); return; }

  try {
    const projectDir = path.join(config.projectsRoot, projectId);
    await fs.access(projectDir);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${projectId}.zip"`);

    const { execFile } = await import('child_process');
    const zipProcess = execFile('zip', [
      '-r', '-q', '-', '.',
      '-x', 'node_modules/*', '.git/*', '.next/*', 'dist/*', 'build/*', '.cache/*',
    ], { cwd: projectDir, maxBuffer: 200 * 1024 * 1024 });

    if (zipProcess.stdout) {
      zipProcess.stdout.pipe(res);
    }
    zipProcess.on('error', (err) => {
      log.error(`[FilesBrowse] Zip error: ${err.message}`);
      if (!res.headersSent) res.status(500).send('Zip failed');
    });
  } catch (err: any) {
    log.error(`[FilesBrowse] Zip error: ${err.message}`);
    res.status(500).send('Error creating archive');
  }
});

// ── HTML renderer ──
interface FileEntry {
  path: string;
  size?: number;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  size?: number;
  children: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const existing = current.find(n => n.name === name);

      if (existing) {
        if (isLast) {
          existing.size = file.size;
        }
        current = existing.children;
      } else {
        const node: TreeNode = {
          name,
          path: parts.slice(0, i + 1).join('/'),
          isDir: !isLast,
          size: isLast ? file.size : undefined,
          children: [],
        };
        current.push(node);
        current = node.children;
      }
    }
  }

  // Sort: directories first, then alphabetical
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => sort(n.children));
  };
  sort(root);
  return root;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(name: string): string {
  const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
  const icons: Record<string, string> = {
    '.ts': '📘', '.tsx': '📘', '.js': '📒', '.jsx': '📒',
    '.json': '📋', '.md': '📝', '.css': '🎨', '.scss': '🎨',
    '.html': '🌐', '.svg': '🖼️', '.png': '🖼️', '.jpg': '🖼️',
    '.gif': '🖼️', '.webp': '🖼️', '.ico': '🖼️',
    '.env': '🔐', '.yml': '⚙️', '.yaml': '⚙️', '.toml': '⚙️',
    '.sh': '⚡', '.bash': '⚡', '.lock': '🔒',
    '.sql': '🗃️', '.db': '🗃️', '.sqlite': '🗃️',
  };
  return icons[ext] || '📄';
}

function renderTreeHTML(nodes: TreeNode[], downloadBase: string, depth: number = 0): string {
  return nodes.map(node => {
    if (node.isDir) {
      return `
        <div class="folder" style="--depth:${depth}">
          <div class="folder-header" onclick="this.parentElement.classList.toggle('open')">
            <span class="arrow">▶</span>
            <span class="icon">📁</span>
            <span class="name">${node.name}</span>
            <span class="count">${countFiles(node)} files</span>
          </div>
          <div class="folder-content">
            ${renderTreeHTML(node.children, downloadBase, depth + 1)}
          </div>
        </div>`;
    }
    return `
      <div class="file" style="--depth:${depth}">
        <span class="icon">${getFileIcon(node.name)}</span>
        <span class="name">${node.name}</span>
        <span class="size">${formatSize(node.size)}</span>
        <a class="dl-btn" href="${downloadBase}&path=${encodeURIComponent(node.path)}" title="Download">⬇</a>
      </div>`;
  }).join('');
}

function countFiles(node: TreeNode): number {
  if (!node.isDir) return 1;
  return node.children.reduce((sum, c) => sum + countFiles(c), 0);
}

function renderBrowsePage(projectId: string, files: FileEntry[], token: string, baseUrl: string): string {
  const tree = buildTree(files);
  const downloadBase = `${baseUrl}/files/${projectId}/download?token=${encodeURIComponent(token)}`;
  const zipUrl = `${baseUrl}/files/${projectId}/download-zip?token=${encodeURIComponent(token)}`;
  const totalSize = files.reduce((s, f) => s + (f.size || 0), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Project Files — Drape</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0C0816;
      color: #e0dce8;
      min-height: 100vh;
    }
    .header {
      background: linear-gradient(135deg, #1a0a2e 0%, #2d0845 50%, #1a0a2e 100%);
      padding: 24px 20px 20px;
      border-bottom: 1px solid rgba(139, 92, 246, 0.2);
    }
    .header h1 {
      font-size: 20px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-size: 13px;
      color: #9D98B2;
    }
    .actions {
      display: flex;
      gap: 10px;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .actions a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 20px;
      background: rgba(139, 92, 246, 0.15);
      color: #A78BFA;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      border: 1px solid rgba(139, 92, 246, 0.25);
      transition: background 0.2s;
    }
    .actions a:hover { background: rgba(139, 92, 246, 0.25); }
    .search-bar {
      padding: 12px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .search-bar input {
      width: 100%;
      padding: 10px 14px;
      border-radius: 12px;
      border: 1px solid rgba(139, 92, 246, 0.2);
      background: rgba(255,255,255,0.04);
      color: #fff;
      font-size: 14px;
      outline: none;
    }
    .search-bar input::placeholder { color: rgba(255,255,255,0.25); }
    .search-bar input:focus { border-color: rgba(139, 92, 246, 0.5); }
    .tree { padding: 8px 0; }
    .folder, .file {
      padding-left: calc(16px + var(--depth, 0) * 20px);
    }
    .folder-header, .file {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px 8px 0;
      cursor: pointer;
      transition: background 0.15s;
      font-size: 14px;
    }
    .folder-header:hover, .file:hover {
      background: rgba(139, 92, 246, 0.08);
    }
    .folder-header .arrow {
      font-size: 10px;
      color: #9D98B2;
      transition: transform 0.2s;
      width: 14px;
      text-align: center;
    }
    .folder.open > .folder-header .arrow { transform: rotate(90deg); }
    .folder-content { display: none; }
    .folder.open > .folder-content { display: block; }
    .icon { font-size: 16px; flex-shrink: 0; }
    .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .size { color: #9D98B2; font-size: 12px; font-family: monospace; flex-shrink: 0; }
    .count { color: #9D98B2; font-size: 11px; flex-shrink: 0; }
    .dl-btn {
      color: #A78BFA;
      text-decoration: none;
      font-size: 14px;
      padding: 4px 8px;
      border-radius: 6px;
      opacity: 0.5;
      transition: opacity 0.2s;
      flex-shrink: 0;
    }
    .file:hover .dl-btn { opacity: 1; }
    .file.hidden { display: none; }
    .folder.hidden { display: none; }
    .empty {
      text-align: center;
      padding: 60px 20px;
      color: #9D98B2;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📂 Project Files</h1>
    <div class="subtitle">${files.length} files · ${formatSize(totalSize)}</div>
  </div>
  <div class="actions">
    <a href="${zipUrl}">⬇ Download ZIP</a>
  </div>
  <div class="search-bar">
    <input type="text" id="search" placeholder="Search files..." autocomplete="off">
  </div>
  <div class="tree" id="tree">
    ${files.length === 0 ? '<div class="empty">No files found</div>' : renderTreeHTML(tree, downloadBase)}
  </div>
  <script>
    // Auto-open first level
    document.querySelectorAll('.folder').forEach((f, i) => {
      if (f.parentElement.id === 'tree') f.classList.add('open');
    });
    // Search
    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      document.querySelectorAll('.file').forEach(el => {
        const name = el.querySelector('.name').textContent.toLowerCase();
        el.classList.toggle('hidden', q && !name.includes(q));
      });
      document.querySelectorAll('.folder').forEach(el => {
        if (!q) { el.classList.remove('hidden'); return; }
        const visibleFiles = el.querySelectorAll('.file:not(.hidden)');
        el.classList.toggle('hidden', visibleFiles.length === 0);
        if (visibleFiles.length > 0) el.classList.add('open');
      });
    });
  </script>
</body>
</html>`;
}
