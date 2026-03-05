import { Request, Response } from 'express';
import { sessionService } from '../services/session.service';
import { log } from '../utils/logger';
import * as http from 'http';
import { Session } from '../types';
import { AGENT_PORT } from '../utils/constants';

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [k, ...rest] = pair.trim().split('=');
    if (!k) continue;
    const value = rest.join('=').trim();
    out[k] = value ? decodeURIComponent(value) : '';
  }
  return out;
}

function parseProjectIdFromReferer(referer?: string): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const match = url.pathname.match(/^\/preview\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function parsePreviewTokenFromReferer(referer?: string): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const token = url.searchParams.get('pt') || url.searchParams.get('previewToken');
    return token || null;
  } catch {
    return null;
  }
}

function parseProjectIdFromCookies(cookieHeader?: string): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies.drape_project_id || null;
}

function parsePreviewTokenFromCookies(cookieHeader?: string): string | null {
  const cookies = parseCookies(cookieHeader);
  return cookies.drape_preview_token || null;
}

function resolvePreviewToken(req: Request): string | null {
  const qToken = typeof req.query.pt === 'string'
    ? req.query.pt
    : (typeof req.query.previewToken === 'string' ? req.query.previewToken : null);
  return qToken
    || (typeof req.headers['x-drape-preview-token'] === 'string' ? req.headers['x-drape-preview-token'] : null)
    || parsePreviewTokenFromReferer(typeof req.headers.referer === 'string' ? req.headers.referer : undefined)
    || parsePreviewTokenFromReferer(typeof req.headers.referrer === 'string' ? req.headers.referrer : undefined)
    || parsePreviewTokenFromCookies(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
}

function cookieOptions(req: Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const secure = req.secure || proto === 'https';
  return `Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function parseAgentEndpoint(agentUrl?: string): { host: string; port: number | null } {
  if (!agentUrl) return { host: '127.0.0.1', port: null };
  try {
    const u = new URL(agentUrl);
    return {
      host: u.hostname || '127.0.0.1',
      port: u.port ? parseInt(u.port, 10) : null,
    };
  } catch {
    return { host: '127.0.0.1', port: null };
  }
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

function isLikelyContainerBridgeHost(host: string): boolean {
  return /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host);
}

function resolvePreviewTarget(session: Session): { host: string; port: number } {
  const { host: agentHost, port: agentPort } = parseAgentEndpoint(session.agentUrl);
  const appPort = session.projectInfo?.port || 3000;

  // New mode: agentUrl is host-published endpoint (e.g. 127.0.0.1:49xxx).
  // In this mode previewPort is the only correct target for app traffic.
  if (session.previewPort) {
    const legacyBridgeAgent = agentPort === AGENT_PORT
      && isLikelyContainerBridgeHost(agentHost)
      && !isLoopbackHost(agentHost);

    if (legacyBridgeAgent) {
      // Legacy mode: backend can reach container bridge IP directly on app internal port.
      return { host: agentHost, port: appPort };
    }

    // Host-mapped mode: route to host + mapped preview port.
    const host = isLoopbackHost(agentHost) ? '127.0.0.1' : agentHost;
    return { host, port: session.previewPort };
  }

  // Last-resort fallback.
  return { host: isLoopbackHost(agentHost) ? '127.0.0.1' : agentHost, port: appPort };
}

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

      const previewToken = resolvePreviewToken(req);
      if (!previewToken) {
        res.status(401).json({ error: 'Preview access token required' });
        return;
      }

      const session = await sessionService.getByProjectIdAndAccessToken(projectId, previewToken);

      if (!session) {
        res.status(404).json({ error: 'No active session for project', projectId });
        return;
      }

      // Persist project context for root-relative asset requests (/_next/*, /@vite/*, etc.)
      res.append('Set-Cookie', `drape_project_id=${encodeURIComponent(projectId)}; ${cookieOptions(req)}`);
      res.append('Set-Cookie', `drape_preview_token=${encodeURIComponent(previewToken)}; ${cookieOptions(req)}; HttpOnly`);

      // Calculate the path to proxy (remove the /preview/:projectId prefix)
      const pathPrefix = `/preview/${projectId}`;
      let proxyPath = req.url.replace(pathPrefix, '') || '/';
      // Ensure path starts with / (query-only strings like ?_t=123 need a leading /)
      if (!proxyPath.startsWith('/')) {
        proxyPath = '/' + proxyPath;
      }
      // Strip proxy auth params before forwarding to the app.
      try {
        const parsedProxyPath = new URL(proxyPath, 'http://local');
        parsedProxyPath.searchParams.delete('pt');
        parsedProxyPath.searchParams.delete('previewToken');
        proxyPath = parsedProxyPath.pathname + (parsedProxyPath.search || '');
      } catch { /* ignore */ }

      const target = resolvePreviewTarget(session);
      log.info(`[Preview Proxy] ${req.method} ${proxyPath} → ${target.host}:${target.port} (user: ${session.userId}, lastUsed: ${new Date(session.lastUsed).toISOString()})`);

      await proxyRequest(req, res, target.port, proxyPath, projectId, target.host, session);
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
      const projectId =
        req.query.projectId as string
        || (typeof req.headers['x-drape-project-id'] === 'string' ? req.headers['x-drape-project-id'] : null)
        || parseProjectIdFromReferer(typeof req.headers.referer === 'string' ? req.headers.referer : undefined)
        || parseProjectIdFromReferer(typeof req.headers.referrer === 'string' ? req.headers.referrer : undefined)
        || parseProjectIdFromCookies(typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined);
      const previewToken = resolvePreviewToken(req);

      if (!projectId) {
        res.status(404).json({ error: 'No active preview session', detail: 'projectId not inferable for asset request' });
        return;
      }
      if (!previewToken) {
        res.status(401).json({ error: 'Preview access token required' });
        return;
      }

      const session = await sessionService.getByProjectIdAndAccessToken(projectId, previewToken);
      if (!session) {
        res.status(404).json({ error: 'No active session' });
        return;
      }

      const target = resolvePreviewTarget(session);
      log.debug(`[Asset Proxy] ${req.method} ${req.url} → ${target.host}:${target.port}`);

      let assetPath = req.url;
      try {
        const parsedAssetPath = new URL(req.url, 'http://local');
        parsedAssetPath.searchParams.delete('pt');
        parsedAssetPath.searchParams.delete('previewToken');
        assetPath = parsedAssetPath.pathname + (parsedAssetPath.search || '');
      } catch { /* ignore */ }

      await proxyRequest(req, res, target.port, assetPath, projectId, target.host);
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
          const isPlainText = contentType.includes('text/plain') || contentType.includes('text/markdown');

          // Wrap plain text/markdown in a dark-themed HTML page for readability
          if (isPlainText && proxyRes.statusCode === 200) {
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf-8');
              const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px;margin:0;line-height:1.6}pre{white-space:pre-wrap;word-wrap:break-word;font-size:14px;font-family:ui-monospace,SFMono-Regular,monospace}</style></head><body><pre>${escaped}</pre></body></html>`;
              const responseHeaders = { ...proxyRes.headers };
              responseHeaders['content-type'] = 'text/html; charset=utf-8';
              responseHeaders['content-length'] = String(Buffer.byteLength(html));
              delete responseHeaders['content-encoding'];
              res.writeHead(200, responseHeaders);
              res.end(html);
              resolve();
            });
            proxyRes.on('error', (err) => {
              log.error(`[Preview Proxy] Response error for ${projectId}:`, err.message);
              reject(err);
            });
          } else if (isHtml) {
            // Only inject SPA routing fix for client-side rendered apps (Vite, CRA, etc.)
            const projectType = session?.projectInfo?.type;
            const spaTypes = ['vite', 'react', 'vue', 'svelte', 'cra'];
            const needsSpaFix = proxyRes.statusCode === 200
              && projectType != null && spaTypes.includes(projectType);

            if (needsSpaFix) {
              // Buffer HTML response to inject SPA routing fix
              const chunks: Buffer[] = [];
              proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
              proxyRes.on('end', () => {
                let html = Buffer.concat(chunks).toString('utf-8');
                const spaScript = `<script>history.replaceState(null,'','/');</script>`;
                html = html.replace('<head>', `<head>${spaScript}`);
                const responseHeaders = { ...proxyRes.headers };
                responseHeaders['content-length'] = String(Buffer.byteLength(html));
                delete responseHeaders['content-encoding'];
                res.writeHead(proxyRes.statusCode || 200, responseHeaders);
                res.end(html);
                resolve();
              });
              proxyRes.on('error', (err) => {
                log.error(`[Preview Proxy] Response error for ${projectId}:`, err.message);
                reject(err);
              });
            } else {
              // Non-SPA HTML: stream directly
              res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
              proxyRes.pipe(res);
              proxyRes.on('end', () => resolve());
              proxyRes.on('error', (err) => {
                log.error(`[Preview Proxy] Response error for ${projectId}:`, err.message);
                reject(err);
              });
            }
          } else {
            // Non-HTML/text: stream directly
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
