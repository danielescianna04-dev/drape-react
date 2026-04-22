/**
 * Drape Cloud client SDK — v1
 *
 * Single-file ES module. Works in vanilla HTML (<script type=module>),
 * bundled React/Vue/Next projects, and Astro. No dependencies.
 *
 * Usage (in a generated app):
 *
 *   import { createDrape } from './drape-cloud.js';
 *   export const drape = createDrape({
 *     apiUrl: 'https://dev.drape.info/v1',
 *     projectKey: 'dck_xxxxxx',
 *   });
 *
 *   // Data
 *   const { rows } = await drape.table('movies').list({ where: { rating: { gte: 8 } }, orderBy: '-year' });
 *   await drape.table('movies').insert({ title: 'Inception' });
 *   await drape.table('movies').update(id, { watched: true });
 *   await drape.table('movies').delete(id);
 *   const row = await drape.table('movies').get(id);
 *
 *   // Auth (end users of the generated app)
 *   const { user } = await drape.auth.signUp('a@b.com', 'pw12345678');
 *   await drape.auth.signIn('a@b.com', 'pw12345678');
 *   drape.auth.user();           // cached user or null
 *   await drape.auth.signOut();
 *
 * Guarantees:
 * - Every request includes x-drape-project-key
 * - On first use, an anonymous id is created in localStorage
 * - Session token (after signin) is attached to every request
 * - Errors throw a DrapeError with .code + .status
 */

const STORAGE_ANON = 'drape.anonId';
const STORAGE_SESSION = 'drape.sessionToken';
const STORAGE_USER = 'drape.user';

export class DrapeError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'DrapeError';
    this.code = code;
    this.status = status;
  }
}

function readStorage(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* cookies/storage blocked — SDK still works, auth state is in-memory only */
  }
}

function parseJson(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createDrape(config) {
  if (!config || !config.apiUrl || !config.projectKey) {
    throw new Error('createDrape requires { apiUrl, projectKey }');
  }
  const apiUrl = config.apiUrl.replace(/\/+$/, '');

  let sessionToken = readStorage(STORAGE_SESSION);
  let cachedUser = parseJson(readStorage(STORAGE_USER));
  let anonEnsured = false;

  async function request(method, path, body) {
    const headers = { 'x-drape-project-key': config.projectKey };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (sessionToken) headers['x-drape-session-token'] = sessionToken;
    const res = await fetch(apiUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* some responses may be empty */
    }
    if (!res.ok) {
      const code = json?.error?.code || 'http_error';
      const msg = json?.error?.message || `HTTP ${res.status}`;
      throw new DrapeError(code, msg, res.status);
    }
    return json;
  }

  function ensureAnonId() {
    let id = readStorage(STORAGE_ANON);
    if (!id) {
      // Very simple anon id — the backend will validate/replace it
      // if it doesn't match the expected shape on first request.
      const rand = Math.random().toString(16).slice(2).padStart(12, '0') + Date.now().toString(16);
      id = 'anon_' + rand.slice(0, 24);
      writeStorage(STORAGE_ANON, id);
    }
    return id;
  }

  async function hydrateAnon() {
    if (anonEnsured) return;
    anonEnsured = true;
    if (sessionToken) return; // signed-in session takes precedence
    try {
      const anonId = ensureAnonId();
      await request('POST', '/auth/anon', { anonId });
    } catch {
      // Non-fatal: the SDK keeps working, data inserts without end_user_id.
    }
  }

  function tableApi(tableName) {
    return {
      async list(opts = {}) {
        await hydrateAnon();
        const params = new URLSearchParams();
        if (opts.where) params.set('where', JSON.stringify(opts.where));
        if (opts.orderBy) params.set('orderBy', opts.orderBy);
        if (opts.limit != null) params.set('limit', String(opts.limit));
        if (opts.offset != null) params.set('offset', String(opts.offset));
        if (opts.mine) params.set('mine', '1');
        const qs = params.toString();
        return request('GET', `/data/${encodeURIComponent(tableName)}${qs ? '?' + qs : ''}`);
      },
      async get(id) {
        return request('GET', `/data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`);
      },
      async insert(data, opts = {}) {
        await hydrateAnon();
        return request('POST', `/data/${encodeURIComponent(tableName)}`, {
          data,
          mine: opts.mine === true,
        });
      },
      async update(id, data) {
        return request('PATCH', `/data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`, { data });
      },
      async delete(id) {
        return request('DELETE', `/data/${encodeURIComponent(tableName)}/${encodeURIComponent(id)}`);
      },
    };
  }

  const auth = {
    async signUp(email, password, opts = {}) {
      const anonId = readStorage(STORAGE_ANON);
      const out = await request('POST', '/auth/signup', {
        email,
        password,
        displayName: opts.displayName,
        anonId,
      });
      sessionToken = out.session.token;
      cachedUser = out.user;
      writeStorage(STORAGE_SESSION, sessionToken);
      writeStorage(STORAGE_USER, JSON.stringify(cachedUser));
      return out;
    },
    async signIn(email, password) {
      const out = await request('POST', '/auth/signin', { email, password });
      sessionToken = out.session.token;
      cachedUser = out.user;
      writeStorage(STORAGE_SESSION, sessionToken);
      writeStorage(STORAGE_USER, JSON.stringify(cachedUser));
      return out;
    },
    async signOut() {
      await request('POST', '/auth/signout', {}).catch(() => {});
      sessionToken = null;
      cachedUser = null;
      writeStorage(STORAGE_SESSION, null);
      writeStorage(STORAGE_USER, null);
    },
    user() {
      return cachedUser;
    },
    async refresh() {
      const out = await request('GET', '/auth/me');
      cachedUser = out?.user || null;
      if (cachedUser) writeStorage(STORAGE_USER, JSON.stringify(cachedUser));
      else writeStorage(STORAGE_USER, null);
      return cachedUser;
    },
  };

  /**
   * Build a publicly-shareable URL for a path inside the app.
   *
   * Why: during preview the app is served on a subdomain like
   * project-XXX.drape.info which requires a ?pt=TOKEN query param (the
   * infra rejects requests without it with 403). Outgoing URLs that the
   * app hands to *other* devices — QR codes, "share" links, "copy URL"
   * pills — won't work if they omit the token. This helper transparently
   * carries the current page's `pt` through to the new URL.
   *
   * In published/production mode there's no pt param in the URL, so the
   * helper just returns origin + path unchanged.
   *
   * Usage:
   *   const qrTarget = drape.publicUrl(`/menu/${id}`);
   *   const shareLink = drape.publicUrl('/preview?menu=' + encodeURIComponent(name));
   */
  function publicUrl(pathOrUrl) {
    if (typeof window === 'undefined') return pathOrUrl || '';
    const path = String(pathOrUrl || '/');
    // Already an absolute URL → pass through unchanged.
    if (/^https?:\/\//i.test(path)) return path;
    const origin = window.location.origin;
    const pt = new URLSearchParams(window.location.search).get('pt');
    const normalizedPath = path.startsWith('/') ? path : '/' + path;
    if (!pt) return origin + normalizedPath;
    const sep = normalizedPath.includes('?') ? '&' : '?';
    return origin + normalizedPath + sep + 'pt=' + encodeURIComponent(pt);
  }

  return {
    table: tableApi,
    auth,
    publicUrl,
    /** Escape hatch for advanced use cases. Don't rely on this in AI-generated code. */
    _request: request,
  };
}
