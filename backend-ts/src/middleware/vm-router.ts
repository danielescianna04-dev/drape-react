import { Request, Response } from 'express';
import { sessionService } from '../services/session.service';
import { log } from '../utils/logger';
import * as http from 'http';
import { Session } from '../types';

// Track the last active project for asset proxying
let lastActiveProjectId: string | null = null;

/**
 * Preview proxy middleware
 * Forwards requests to the container's dev server
 */
export function createPreviewProxy() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = req.params.projectId || req.params[0];

      if (!projectId) {
        res.status(400).json({ error: 'projectId required' });
        return;
      }

      // Redirect /preview/:projectId to /preview/:projectId/ (trailing slash)
      // Without it, relative URLs like "style.css" resolve to /preview/style.css instead of /preview/:projectId/style.css
      if (req.url === `/preview/${projectId}` || req.url.match(new RegExp(`^/preview/${projectId}\\?`))) {
        const qs = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
        res.redirect(301, `/preview/${projectId}/${qs}`);
        return;
      }

      const session = await sessionService.getByProjectId(projectId);

      if (!session) {
        res.status(404).json({ error: 'No active session for project', projectId });
        return;
      }

      // Track last active project for asset proxying
      lastActiveProjectId = projectId;

      // Calculate the path to proxy (remove the /preview/:projectId prefix)
      const pathPrefix = `/preview/${projectId}`;
      let proxyPath = req.url.replace(pathPrefix, '') || '/';
      // Ensure path starts with / (query-only strings like ?_t=123 need a leading /)
      if (!proxyPath.startsWith('/')) {
        proxyPath = '/' + proxyPath;
      }

      // Use container IP directly via Docker network (agentUrl contains the container IP)
      // Format: http://172.18.0.X:13338 -> extract IP and use internal port 3000
      const containerIp = session.agentUrl?.replace('http://', '').split(':')[0];
      const previewPort = containerIp ? (session.projectInfo?.port || 3000) : (session.previewPort || 3000);
      const containerHost = containerIp || 'localhost';
      log.info(`[Preview Proxy] ${req.method} ${proxyPath} → ${containerHost}:${previewPort} (user: ${session.userId}, lastUsed: ${new Date(session.lastUsed).toISOString()})`);

      await proxyRequest(req, res, previewPort, proxyPath, projectId, containerHost, session);
    } catch (error: any) {
      log.error('[Preview Proxy] Unexpected error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal preview proxy error', message: error.message });
      }
    }
  };
}

/**
 * Asset proxy middleware for /_next/* and other static assets
 * Next.js references these from root, so we proxy them to the active container
 */
export function createAssetProxy() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const projectId = lastActiveProjectId;
      if (!projectId) {
        res.status(404).json({ error: 'No active preview session' });
        return;
      }

      const session = await sessionService.getByProjectId(projectId);
      if (!session) {
        res.status(404).json({ error: 'No active session' });
        return;
      }

      // Use container IP directly via Docker network (agentUrl contains the container IP)
      const containerIp = session.agentUrl?.replace('http://', '').split(':')[0];
      const previewPort = containerIp ? (session.projectInfo?.port || 3000) : (session.previewPort || 3000);
      const containerHost = containerIp || 'localhost';
      log.debug(`[Asset Proxy] ${req.method} ${req.url} → ${containerHost}:${previewPort}`);

      await proxyRequest(req, res, previewPort, req.url, projectId, containerHost);
    } catch (error: any) {
      log.error('[Asset Proxy] Error:', error.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Asset proxy error', message: error.message });
      }
    }
  };
}

/**
 * Proxy a request to the preview server
 */
function proxyRequest(
  req: Request,
  res: Response,
  port: number,
  path: string,
  projectId: string,
  hostname = 'localhost',
  session?: Session | null
): Promise<void> {
  return new Promise((resolve, reject) => {
    const headers: http.OutgoingHttpHeaders = { ...req.headers };
    // Set correct host for the target
    headers['host'] = `${hostname}:${port}`;
    // Remove headers that cause issues with proxying
    delete headers['connection'];
    delete headers['transfer-encoding'];
    // Force uncompressed response so we can safely manipulate HTML
    headers['accept-encoding'] = 'identity';

    const proxyReq = http.request(
      { hostname, port, path, method: req.method, headers },
      (proxyRes) => {
        try {
          const contentType = proxyRes.headers['content-type'] || '';
          const isHtml = contentType.includes('text/html');

          // Only inject SPA routing fix for client-side rendered apps (Vite, CRA, etc.)
          // Next.js uses SSR and handles routing server-side — no injection needed
          const projectType = session?.projectInfo?.type;
          const needsSpaFix = isHtml && proxyRes.statusCode === 200 && projectType !== 'nextjs';

          if (needsSpaFix) {
            // Buffer HTML response to inject SPA routing fix
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              let html = Buffer.concat(chunks).toString('utf-8');
              // Inject script before </head> to fix SPA router path
              const spaScript = `<script>history.replaceState(null,'','/');</script>`;
              html = html.replace('<head>', `<head>${spaScript}`);
              // Send modified response (recalculate content-length)
              const responseHeaders = { ...proxyRes.headers };
              responseHeaders['content-length'] = String(Buffer.byteLength(html));
              delete responseHeaders['content-encoding']; // Remove if was gzipped
              res.writeHead(proxyRes.statusCode || 200, responseHeaders);
              res.end(html);
              resolve();
            });
            proxyRes.on('error', (err) => {
              log.error(`[Preview Proxy] Response error for ${projectId}:`, err.message);
              reject(err);
            });
          } else {
            // Non-HTML: stream directly
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
            proxyRes.on('end', () => resolve());
            proxyRes.on('error', (err) => {
              log.error(`[Preview Proxy] Response error for ${projectId}:`, err.message);
              reject(err);
            });
          }
        } catch (error: any) {
          log.error(`[Preview Proxy] Write error for ${projectId}:`, error.message);
          reject(error);
        }
      }
    );

    proxyReq.on('error', (err) => {
      log.error(`[Preview Proxy] Request error for ${projectId}:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Preview server not responding', projectId, port, message: err.message });
      }
      resolve(); // Don't reject — error already sent to client
    });

    proxyReq.setTimeout(30000, () => {
      log.error(`[Preview Proxy] Timeout for ${projectId}`);
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Preview server timeout', projectId, port });
      }
      resolve();
    });

    // For GET/HEAD/OPTIONS — no body to forward
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET')) {
      proxyReq.end();
    } else {
      // For POST/PUT/etc — re-send the parsed body since Express consumed the stream
      if (req.body && Object.keys(req.body).length > 0) {
        const bodyStr = JSON.stringify(req.body);
        proxyReq.setHeader('content-type', 'application/json');
        proxyReq.setHeader('content-length', Buffer.byteLength(bodyStr));
        proxyReq.end(bodyStr);
      } else {
        proxyReq.end();
      }
    }

    // Handle client disconnect gracefully
    req.on('close', () => {
      if (!res.writableEnded && !proxyReq.destroyed) {
        proxyReq.destroy();
      }
    });
  });
}
