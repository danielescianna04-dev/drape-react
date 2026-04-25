// ================================================================
// Explore — public gallery of published Drape apps.
//
// Two surfaces:
//   GET /explore       — server-rendered HTML page (SEO-indexable).
//   GET /api/explore   — JSON for the mobile app.
//
// Source of truth: Firestore `published_sites` collection. Apps
// only show up here when the owner sets `isPublic: true` (opt-in).
// Ranking is by `viewCount` desc (with `publishedAt` as tiebreaker)
// — simple but enough for the launch. We can swap in a real score
// (recency + views + remixes) later without changing the API shape.
// ================================================================

import { Router, Request, Response } from 'express';
import { firebaseService } from '../services/firebase.service';
import { log } from '../utils/logger';
import { config } from '../config';

export const exploreRouter = Router();

const PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 60;

const VALID_CATEGORIES = new Set([
  'app', 'game', 'tool', 'site', 'art', 'other',
]);

interface PublicSite {
  slug: string;
  title: string;
  description: string;
  category: string;
  url: string;
  authorId: string;
  authorUsername?: string;
  viewCount: number;
  publishedAt: number;
  remixOfSlug?: string;
}

async function fetchPublicSites(opts: {
  limit: number;
  category?: string;
  cursorViewCount?: number;
  cursorPublishedAt?: number;
}): Promise<PublicSite[]> {
  const db = firebaseService.getFirestore();
  if (!db) return [];

  let q: FirebaseFirestore.Query = db.collection('published_sites')
    .where('isPublic', '==', true);

  if (opts.category && VALID_CATEGORIES.has(opts.category)) {
    q = q.where('category', '==', opts.category);
  }

  // Order by viewCount desc, publishedAt desc as tiebreaker.
  q = q.orderBy('viewCount', 'desc').orderBy('publishedAt', 'desc').limit(opts.limit);

  if (typeof opts.cursorViewCount === 'number' && typeof opts.cursorPublishedAt === 'number') {
    q = q.startAfter(opts.cursorViewCount, new Date(opts.cursorPublishedAt));
  }

  const snap = await q.get();
  if (snap.empty) return [];

  // Resolve author usernames in a batch (one read per unique author).
  const authorIds = Array.from(new Set(snap.docs.map(d => d.data().userId).filter(Boolean)));
  const authorMap = new Map<string, string>();
  await Promise.all(authorIds.map(async (uid) => {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      const username = userDoc.data()?.username;
      if (username) authorMap.set(uid, username);
    } catch {}
  }));

  return snap.docs.map(doc => {
    const d = doc.data();
    const publishedAtMs = d.publishedAt?.toMillis?.() ?? (d.publishedAt instanceof Date ? d.publishedAt.getTime() : Date.now());
    return {
      slug: d.slug,
      title: d.title || d.slug,
      description: d.description || '',
      category: d.category || 'other',
      url: d.url || `${config.publicUrl}/p/${d.slug}`,
      authorId: d.userId,
      authorUsername: authorMap.get(d.userId),
      viewCount: typeof d.viewCount === 'number' ? d.viewCount : 0,
      publishedAt: publishedAtMs,
      remixOfSlug: d.remixOfSlug,
    };
  });
}

// GET /api/explore — JSON for the mobile app
exploreRouter.get('/api/explore', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(String(req.query.limit ?? PAGE_SIZE), 10) || PAGE_SIZE));
    const category = req.query.category ? String(req.query.category) : undefined;
    const cursorViewCount = req.query.cursorViews ? parseInt(String(req.query.cursorViews), 10) : undefined;
    const cursorPublishedAt = req.query.cursorAt ? parseInt(String(req.query.cursorAt), 10) : undefined;

    const sites = await fetchPublicSites({
      limit,
      category,
      cursorViewCount: Number.isFinite(cursorViewCount as number) ? cursorViewCount : undefined,
      cursorPublishedAt: Number.isFinite(cursorPublishedAt as number) ? cursorPublishedAt : undefined,
    });

    const last = sites[sites.length - 1];
    const nextCursor = sites.length === limit && last
      ? { cursorViews: last.viewCount, cursorAt: last.publishedAt }
      : null;

    res.set('Cache-Control', 'public, max-age=30, s-maxage=60');
    res.json({ items: sites, nextCursor, total: sites.length });
  } catch (e: any) {
    log.error(`[Explore] /api/explore failed: ${e?.message || e}`);
    res.status(500).json({ error: 'Explore lookup failed' });
  }
});

// Tiny HTML escape for SSR.
function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function categoryNav(active: string | undefined): string {
  const cats = [
    { id: '', label: 'Tutto' },
    { id: 'app', label: 'App' },
    { id: 'game', label: 'Giochi' },
    { id: 'tool', label: 'Strumenti' },
    { id: 'site', label: 'Siti' },
    { id: 'art', label: 'Arte' },
    { id: 'other', label: 'Altro' },
  ];
  return cats.map(c => {
    const href = c.id ? `/explore?category=${c.id}` : '/explore';
    const cls = (active || '') === c.id ? 'cat cat-active' : 'cat';
    return `<a class="${cls}" href="${href}">${esc(c.label)}</a>`;
  }).join('');
}

function renderCard(site: PublicSite): string {
  const author = site.authorUsername
    ? `<a class="card-author" href="/u/${esc(site.authorUsername)}">@${esc(site.authorUsername)}</a>`
    : `<span class="card-author">creator anonimo</span>`;
  const desc = site.description ? `<p class="card-desc">${esc(site.description)}</p>` : '';
  return `
    <a class="card" href="/p/${esc(site.slug)}/" target="_blank" rel="noopener">
      <div class="card-frame">
        <iframe loading="lazy" src="/p/${esc(site.slug)}/" title="${esc(site.title)}" sandbox="allow-scripts allow-same-origin" tabindex="-1"></iframe>
      </div>
      <div class="card-body">
        <h3 class="card-title">${esc(site.title)}</h3>
        ${desc}
        <div class="card-meta">${author}<span class="card-views">${site.viewCount} 👁</span></div>
      </div>
    </a>`;
}

function renderExplorePage(sites: PublicSite[], category: string | undefined): string {
  const cards = sites.length
    ? sites.map(renderCard).join('\n')
    : `<div class="empty">
         <h2>Ancora nessuna app pubblica</h2>
         <p>Pubblica la tua dall'app Drape e attiva "Mostra in Explore" per apparire qui.</p>
       </div>`;

  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Explore · Drape</title>
  <meta name="description" content="Scopri le app create con Drape dalla community. Apri, prova, remixa dal telefono." />
  <meta property="og:title" content="Explore · Drape" />
  <meta property="og:description" content="Scopri le app create con Drape dalla community." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="canonical" href="${esc(config.publicUrl)}/explore" />
  <style>
    :root {
      color-scheme: dark;
      --bg: #0a0a0c;
      --surface: #131318;
      --surface-2: #1c1c24;
      --border: #2a2a36;
      --text: #f3f3f7;
      --text-dim: #8a8aa0;
      --accent: #a78bfa;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; min-height: 100vh; }
    a { color: inherit; text-decoration: none; }
    header { padding: 32px 20px 8px; max-width: 1280px; margin: 0 auto; }
    .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 20px; letter-spacing: -0.02em; }
    .brand-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
    h1 { font-size: clamp(28px, 5vw, 44px); margin: 16px 0 4px; letter-spacing: -0.03em; font-weight: 700; }
    .lead { color: var(--text-dim); margin: 0 0 24px; max-width: 60ch; }
    nav.cats { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 20px 16px; max-width: 1280px; margin: 0 auto; }
    .cat { padding: 8px 14px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); color: var(--text-dim); font-size: 14px; transition: all .15s; }
    .cat:hover { color: var(--text); border-color: var(--text-dim); }
    .cat-active { background: var(--accent); color: #0a0a0c; border-color: var(--accent); font-weight: 600; }
    main.grid { display: grid; gap: 20px; padding: 8px 20px 80px; max-width: 1280px; margin: 0 auto; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .card { display: block; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; transition: transform .2s, border-color .2s; }
    .card:hover { transform: translateY(-2px); border-color: var(--accent); }
    .card-frame { position: relative; width: 100%; aspect-ratio: 16/10; background: var(--surface-2); overflow: hidden; pointer-events: none; }
    .card-frame iframe { position: absolute; inset: 0; width: 200%; height: 200%; transform: scale(0.5); transform-origin: top left; border: 0; pointer-events: none; }
    .card-body { padding: 14px 16px 16px; }
    .card-title { font-size: 16px; margin: 0 0 4px; font-weight: 600; }
    .card-desc { color: var(--text-dim); font-size: 13px; margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-dim); }
    .card-author { color: var(--accent); }
    .card-views { font-variant-numeric: tabular-nums; }
    .empty { grid-column: 1 / -1; padding: 80px 16px; text-align: center; color: var(--text-dim); }
    .empty h2 { color: var(--text); margin: 0 0 8px; font-weight: 600; }
    footer { padding: 24px 20px 40px; max-width: 1280px; margin: 0 auto; color: var(--text-dim); font-size: 13px; border-top: 1px solid var(--border); }
    footer a { color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <a class="brand" href="/explore"><span class="brand-dot"></span>Drape</a>
    <h1>Explore</h1>
    <p class="lead">Le app pubblicate dalla community. Aprile, provale dal vivo, remixale dal tuo telefono con Drape.</p>
  </header>
  <nav class="cats">${categoryNav(category)}</nav>
  <main class="grid">${cards}</main>
  <footer>
    Built with <a href="https://drape.info">Drape</a> · Pubblica la tua app dal telefono.
  </footer>
</body>
</html>`;
}

// ----------------------------------------------------------------
// Public creator profiles.
//
// Resolution: /u/:username → look up `users` collection by `username`
// field (lowercased). Then list their public published_sites.
// ----------------------------------------------------------------

interface PublicProfile {
  uid: string;
  username: string;
  bio: string;
  avatarUrl: string | null;
  joinedAt: number | null;
  sites: PublicSite[];
}

async function fetchProfile(rawUsername: string): Promise<PublicProfile | null> {
  const db = firebaseService.getFirestore();
  if (!db) return null;
  const username = rawUsername.toLowerCase().trim();
  if (!/^[a-z0-9_]{2,30}$/.test(username)) return null;

  const snap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (snap.empty) return null;

  const userDoc = snap.docs[0];
  const u = userDoc.data();

  const sitesSnap = await db.collection('published_sites')
    .where('userId', '==', userDoc.id)
    .where('isPublic', '==', true)
    .orderBy('publishedAt', 'desc')
    .limit(50)
    .get();

  const sites: PublicSite[] = sitesSnap.docs.map(doc => {
    const d = doc.data();
    const publishedAtMs = d.publishedAt?.toMillis?.() ?? Date.now();
    return {
      slug: d.slug,
      title: d.title || d.slug,
      description: d.description || '',
      category: d.category || 'other',
      url: d.url || `${config.publicUrl}/p/${d.slug}`,
      authorId: d.userId,
      authorUsername: username,
      viewCount: typeof d.viewCount === 'number' ? d.viewCount : 0,
      publishedAt: publishedAtMs,
      remixOfSlug: d.remixOfSlug,
    };
  });

  return {
    uid: userDoc.id,
    username,
    bio: typeof u.bio === 'string' ? u.bio : '',
    avatarUrl: typeof u.avatarUrl === 'string' ? u.avatarUrl : null,
    joinedAt: u.createdAt?.toMillis?.() ?? null,
    sites,
  };
}

exploreRouter.get('/api/u/:username', async (req: Request, res: Response) => {
  try {
    const profile = await fetchProfile(req.params.username);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    res.set('Cache-Control', 'public, max-age=60, s-maxage=120');
    res.json(profile);
  } catch (e: any) {
    log.error(`[Explore] /api/u failed: ${e?.message || e}`);
    res.status(500).json({ error: 'Profile lookup failed' });
  }
});

function renderProfilePage(profile: PublicProfile): string {
  const cards = profile.sites.length
    ? profile.sites.map(renderCard).join('\n')
    : `<div class="empty"><p>${esc(profile.username)} non ha ancora pubblicato nulla in Explore.</p></div>`;
  const title = `@${profile.username} · Drape`;
  const desc = profile.bio || `App pubbliche di @${profile.username} su Drape.`;
  return `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:type" content="profile" />
  <link rel="canonical" href="${esc(config.publicUrl)}/u/${esc(profile.username)}" />
  <style>
    :root { color-scheme: dark; --bg:#0a0a0c; --surface:#131318; --surface-2:#1c1c24; --border:#2a2a36; --text:#f3f3f7; --text-dim:#8a8aa0; --accent:#a78bfa; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--text); font: 16px/1.5 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
    a { color: inherit; text-decoration: none; }
    .topbar { padding: 18px 20px; max-width: 1280px; margin: 0 auto; }
    .topbar a.brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; }
    .brand-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); }
    header.profile { padding: 24px 20px; max-width: 1280px; margin: 0 auto; display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
    .avatar { width: 80px; height: 80px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--border); overflow: hidden; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .username { font-size: 28px; font-weight: 700; margin: 0; letter-spacing: -0.02em; }
    .bio { color: var(--text-dim); margin: 4px 0 0; max-width: 60ch; }
    main.grid { display: grid; gap: 20px; padding: 8px 20px 80px; max-width: 1280px; margin: 0 auto; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .card { display: block; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; transition: transform .2s, border-color .2s; }
    .card:hover { transform: translateY(-2px); border-color: var(--accent); }
    .card-frame { position: relative; width: 100%; aspect-ratio: 16/10; background: var(--surface-2); overflow: hidden; pointer-events: none; }
    .card-frame iframe { position: absolute; inset: 0; width: 200%; height: 200%; transform: scale(0.5); transform-origin: top left; border: 0; pointer-events: none; }
    .card-body { padding: 14px 16px 16px; }
    .card-title { font-size: 16px; margin: 0 0 4px; font-weight: 600; }
    .card-desc { color: var(--text-dim); font-size: 13px; margin: 0 0 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-dim); }
    .card-author { color: var(--accent); }
    .empty { grid-column: 1 / -1; padding: 60px 16px; text-align: center; color: var(--text-dim); }
  </style>
</head>
<body>
  <div class="topbar"><a class="brand" href="/explore"><span class="brand-dot"></span>Drape · Explore</a></div>
  <header class="profile">
    <div class="avatar">${profile.avatarUrl ? `<img src="${esc(profile.avatarUrl)}" alt="" />` : ''}</div>
    <div>
      <h1 class="username">@${esc(profile.username)}</h1>
      ${profile.bio ? `<p class="bio">${esc(profile.bio)}</p>` : ''}
    </div>
  </header>
  <main class="grid">${cards}</main>
</body>
</html>`;
}

exploreRouter.get('/u/:username', async (req: Request, res: Response) => {
  try {
    const profile = await fetchProfile(req.params.username);
    if (!profile) {
      res.status(404).set('Content-Type', 'text/html').send('<h1>Profilo non trovato</h1>');
      return;
    }
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=60, s-maxage=120');
    res.send(renderProfilePage(profile));
  } catch (e: any) {
    log.error(`[Explore] /u failed: ${e?.message || e}`);
    res.status(500).set('Content-Type', 'text/html').send('<h1>Profilo non disponibile</h1>');
  }
});

// GET /explore — HTML SSR page
exploreRouter.get('/explore', async (req: Request, res: Response) => {
  try {
    const category = req.query.category ? String(req.query.category) : undefined;
    const sites = await fetchPublicSites({ limit: PAGE_SIZE, category });
    const html = renderExplorePage(sites, category);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=60, s-maxage=120');
    res.send(html);
  } catch (e: any) {
    log.error(`[Explore] /explore failed: ${e?.message || e}`);
    res.status(500).set('Content-Type', 'text/html').send('<h1>Explore non disponibile</h1>');
  }
});
