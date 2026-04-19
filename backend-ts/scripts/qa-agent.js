#!/usr/bin/env node
/**
 * QA Agent: Functional Testing + AI Vision + Self-Healing
 *
 * Phase 1: Puppeteer functional testing (pages, clicks, forms) across viewports
 * Phase 2: Gemini Vision screenshot analysis (graceful skip if no key)
 * Phase 3: Self-healing auto-fix + full re-test (max 3 cycles)
 *
 * Output: JSON to stdout (stripped), full report to .drape/qa-report.json
 *
 * Env: GOOGLE_GENERATIVE_AI_API_KEY (optional — skip vision if missing)
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const https = require('https');

const BASE_URL = 'http://localhost:3000';
const CLICK_TIMEOUT = 3000;
const NAV_TIMEOUT = 12000;
// Single-pass probe: run Puppeteer + Gemini Vision, emit qa-report.json with
// findings. Backend verify/auto-fix-orchestrator.ts owns all healing now —
// qa-agent no longer writes files or calls the LLM for fixes.
const VISION_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '';
const PROJECT_DIR = '/home/coder/project';
const MAX_SCREENSHOTS_PER_BATCH = 4;
const MAX_SCREENSHOTS_TOTAL = 20; // Prevent OOM on large projects
const PRIMARY_ROUTE_LIMIT = 5;
const PRIMARY_CLICK_LIMIT = 24;
const DEEP_CLICK_LIMIT = 80;
const TRANSIENT_EXTERNAL_IMAGE_HOSTS = [
  'picsum.photos',
  'images.unsplash.com',
  'source.unsplash.com',
  'placehold.co',
  'via.placeholder.com',
  'dummyimage.com',
  'placekitten.com',
];

// Mobile-only for speed during creation gate. Multi-viewport is future deep QA.
const VIEWPORTS = [
  { name: 'mobile', width: 430, height: 932 },
];

function normalizeInteractiveLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function isInputDependentAction(el) {
  const label = normalizeInteractiveLabel(el?.text);
  return /(send|submit|search|filter|apply|reply|comment|message|chat)/i.test(label);
}

function isLikelyPrimaryInteractive(el) {
  const label = normalizeInteractiveLabel(el?.text);
  const href = normalizeInteractiveLabel(el?.href);
  const tag = normalizeInteractiveLabel(el?.tag);

  if (!label && !href && !el?.iconOnly) return false;
  if (el?.type === 'button' || el?.type === 'interactive') return true;
  if (el?.type === 'broken-link') return true;
  if (href && href !== '#' && href !== '/') return true;
  if (tag === 'button') return true;
  if (el?.iconOnly && (el?.aboveFold || el?.inHeader || el?.inNav)) return true;

  return /(home|chat|messages|status|settings|profile|search|explore|discover|feed|cart|checkout|shop|buy|subscribe|pricing|camera|reels|shorts|library|menu|account|orders|favorites|saved|notifications|inbox|calendar|book|schedule|next|continue|start|get started|view|open|export|download|share|play|watch|details)/i.test(label);
}

// Filter chips that represent the "no filter / all" default. Clicking
// one when it's already selected is a legitimate no-op and should NOT
// be flagged as a dead interactive — the previous logic was creating
// an infinite fix loop on every catalog/listing page.
const FILTER_RESET_LABELS = new Set([
  'all', 'tutti', 'tutte', 'tutto',
  'all categories', 'tutte le categorie',
  'show all', 'mostra tutto', 'vedi tutti',
  'any', 'qualsiasi',
  'clear', 'clear filters', 'azzera', 'reset',
  'default',
]);

function isResetLikeFilterChip(el) {
  const text = normalizeInteractiveLabel(el?.text || '');
  if (!text) return false;
  if (!FILTER_RESET_LABELS.has(text)) return false;
  // Must look like a filter chip/toggle/tab — not a primary CTA.
  if (el?.type === 'button' || el?.type === 'interactive' || el?.type === 'chip' || el?.type === 'tab') return true;
  // Buttons without an href that are short labels are almost always chips.
  if (!el?.href && typeof el?.text === 'string' && el.text.length <= 20) return true;
  return false;
}

function classifyDeadInteractive(el, pagePath) {
  const normalizedHref = normalizeInteractiveLabel(el?.href);
  const normalizedPage = normalizeInteractiveLabel(pagePath);
  const samePageHref =
    normalizedHref &&
    normalizedHref !== '#' &&
    (normalizedHref === normalizedPage || normalizedHref === `${normalizedPage}/`);

  if (samePageHref && el?.type === 'link') {
    return {
      severity: 'low',
      blocking: false,
      reason: 'same-page link',
    };
  }

  if (isResetLikeFilterChip(el)) {
    return {
      severity: 'low',
      blocking: false,
      reason: 'reset/default filter chip (expected no-op when already active)',
    };
  }

  if (el?.disabled || el?.ariaDisabled) {
    return {
      severity: 'low',
      blocking: false,
      reason: 'disabled interactive',
    };
  }

  if (el?.inputRequired && el?.inputEmpty && isInputDependentAction(el)) {
    return {
      severity: 'low',
      blocking: false,
      reason: 'awaiting user input',
    };
  }

  if (isLikelyPrimaryInteractive(el)) {
    return {
      severity: 'high',
      blocking: true,
      reason: 'primary interactive did nothing',
    };
  }

  return {
    severity: 'medium',
    blocking: false,
    reason: 'secondary interactive did nothing',
  };
}

function isLikelyPrimaryRoute(route) {
  if (!route || route === '/') return true;
  if (route.includes('[') || route.includes(']')) return false;
  const depth = route.split('/').filter(Boolean).length;
  return depth <= 1;
}

function prioritizeClickables(clickables, pagePath, mode) {
  const ranked = [...clickables].sort((a, b) => {
    const aPrimary = isLikelyPrimaryInteractive(a) ? 1 : 0;
    const bPrimary = isLikelyPrimaryInteractive(b) ? 1 : 0;
    if (aPrimary !== bPrimary) return bPrimary - aPrimary;

    const aAboveFold = a.aboveFold ? 1 : 0;
    const bAboveFold = b.aboveFold ? 1 : 0;
    if (aAboveFold !== bAboveFold) return bAboveFold - aAboveFold;

    const aNav = a.type === 'nav' ? 1 : 0;
    const bNav = b.type === 'nav' ? 1 : 0;
    if (aNav !== bNav) return bNav - aNav;

    return 0;
  });

  if (mode === 'primary') {
    return ranked.filter(el => isLikelyPrimaryInteractive(el) || el.type === 'nav').slice(0, PRIMARY_CLICK_LIMIT);
  }

  return ranked.slice(0, DEEP_CLICK_LIMIT);
}

// ── Logging (no base64, no secrets) ────────────────────────────
const qaLog = [];
function logAction(phase, action, detail) {
  const entry = { phase, action, detail: typeof detail === 'string' ? detail.substring(0, 300) : JSON.stringify(detail).substring(0, 300), ts: new Date().toISOString() };
  qaLog.push(entry);
  console.error(`[QA:${phase}] ${action}: ${entry.detail}`);
}

// ── Page Detection ─────────────────────────────────────────────
function detectPages() {
  const pages = ['/'];

  for (const appDir of [path.join(PROJECT_DIR, 'app'), path.join(PROJECT_DIR, 'src', 'app')]) {
    if (!fs.existsSync(appDir)) continue;
    const scan = (dir, prefix) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
          if (['api', 'components', 'lib', 'hooks', 'utils', 'ui', 'styles', 'types', 'constants'].includes(entry.name)) continue;
          const route = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
          const hasPage = ['page.tsx', 'page.jsx', 'page.ts', 'page.js'].some(f =>
            fs.existsSync(path.join(dir, entry.name, f)));
          if (hasPage && route !== '/') pages.push(route);
          scan(path.join(dir, entry.name), route);
        }
      } catch {}
    };
    scan(appDir, '');
  }

  const pagesDir = path.join(PROJECT_DIR, 'src', 'pages');
  if (fs.existsSync(pagesDir)) {
    try {
      for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
          const name = entry.name.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
          if (!['index', 'home', 'app', '_app', '_document'].includes(name)) pages.push(`/${name}`);
        }
        if (entry.isDirectory()) {
          const hasIndex = ['index.tsx', 'index.jsx', 'index.ts', 'index.js'].some(f =>
            fs.existsSync(path.join(pagesDir, entry.name, f)));
          if (hasIndex) pages.push(`/${entry.name}`);
        }
      }
    } catch {}
  }

  try {
    for (const routerFile of ['src/App.tsx', 'src/App.jsx', 'src/router.tsx', 'src/routes.tsx']) {
      const fp = path.join(PROJECT_DIR, routerFile);
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf-8');
      for (const m of content.matchAll(/path[=:]\s*["']\/([a-zA-Z0-9_-]+)["']/g)) {
        const route = `/${m[1]}`;
        if (!pages.includes(route)) pages.push(route);
      }
    }
  } catch {}

  // Filter out dynamic routes with unresolved params — these return 404 when tested literally
  // Only test concrete, navigable URLs
  const concrete = [...new Set(pages)].filter(p => !p.includes('[') && !p.includes(']'));
  logAction('detect', 'pages', `${concrete.length} concrete pages (filtered ${pages.length - concrete.length} dynamic routes)`);
  return concrete.slice(0, 15);
}

// ── Page Analysis ──────────────────────────────────────────────
async function analyzePage(page) {
  return page.evaluate((transientImageHosts) => {
    const body = document.body;
    const text = (body?.innerText?.trim() || '');
    const hasContent = text.length > 30;

    let hasStyles = false;
    const els = body?.querySelectorAll('main, div, section, header, h1, nav, p') || [];
    for (const el of Array.from(els).slice(0, 10)) {
      const s = window.getComputedStyle(el);
      const bg = s.backgroundColor;
      if ((bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') ||
          s.display === 'flex' || s.display === 'grid' ||
          parseFloat(s.paddingTop) > 8 || s.borderRadius !== '0px') {
        hasStyles = true;
        break;
      }
    }

    const hasError = text.includes('Application error') ||
      text.includes('Internal Server Error') ||
      text.includes('Unhandled Runtime Error') ||
      text.includes("Can't resolve") ||
      (text.includes('404') && text.length < 200) ||
      !!document.querySelector('[data-nextjs-dialog]');

    const bodyBg = window.getComputedStyle(body).backgroundColor;
    const isBlank = !hasContent && (bodyBg === 'rgb(255, 255, 255)' || bodyBg === 'rgba(0, 0, 0, 0)' || bodyBg === 'rgb(0, 0, 0)');

    const images = document.querySelectorAll('img');
    let brokenImages = 0;
    images.forEach((img) => {
      if (img.complete && img.naturalWidth > 0) return;
      const src = img.currentSrc || img.getAttribute('src') || '';
      let host = '';
      try {
        host = new URL(src, window.location.href).hostname.toLowerCase();
      } catch {}
      const isTransientExternal =
        !!host &&
        transientImageHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
      if (!isTransientExternal) brokenImages++;
    });

    return {
      hasContent, hasStyles, hasError, isBlank,
      textLength: text.length,
      elementCount: document.querySelectorAll('*').length,
      imageCount: images.length,
      brokenImages,
      buttonCount: document.querySelectorAll('button, [role="button"], a[href]').length,
      formCount: document.querySelectorAll('form, input, textarea, select').length,
      bodyBg,
      title: document.title,
    };
  }, TRANSIENT_EXTERNAL_IMAGE_HOSTS);
}

// ── Clickable Elements (CSS selectors, not coordinates) ────────
async function getClickableElements(page) {
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const rects = [];
    let qaIdCounter = 0;

    function isContainedByExisting(rect) {
      for (const existing of rects) {
        if (
          rect.x >= existing.x &&
          rect.y >= existing.y &&
          rect.x + rect.width <= existing.x + existing.width &&
          rect.y + rect.height <= existing.y + existing.height
        ) {
          return true;
        }
      }
      return false;
    }

    function addEl(el, type, href) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 5 || rect.height < 5) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return;
      const disabled =
        !!el.disabled ||
        el.getAttribute('aria-disabled') === 'true' ||
        el.getAttribute('data-disabled') === 'true';
      if (disabled) return;
      if (isContainedByExisting(rect)) return;
      const interactiveAncestor = el.parentElement?.closest(
        'a[href], button, [role="button"], [onclick], nav a, nav button, [role="tab"], [role="menuitem"]',
      );
      if (interactiveAncestor && interactiveAncestor !== el) return;

      // Get text from multiple sources — icon buttons often have no innerText
      let text = (el.innerText || '').trim().substring(0, 50);
      if (!text) text = el.getAttribute('aria-label') || '';
      if (!text) text = el.getAttribute('title') || '';
      if (!text) {
        // Icon button fallback: use SVG class, child icon class, or tag+position
        const svg = el.querySelector('svg');
        const icon = el.querySelector('[class*="icon"], [class*="Icon"], [data-icon]');
        if (svg) {
          text = svg.getAttribute('aria-label') || svg.getAttribute('class') || 'icon-button';
        } else if (icon) {
          text = icon.getAttribute('class') || 'icon-button';
        } else if (el.className && typeof el.className === 'string') {
          // Use meaningful class name fragments
          const cls = el.className.split(/\s+/).find(c => /btn|button|action|nav|icon|close|menu|toggle|heart|like|star|cart|search|share|edit|delete/i.test(c));
          if (cls) text = cls;
        }
      }
      const iconOnly = !text;
      // Last resort: use tag + coordinates as identifier
      if (!text) text = `${el.tagName.toLowerCase()}@${Math.round(rect.x)},${Math.round(rect.y)}`;

      const key = `${type}:${text}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
      if (seen.has(key)) return;
      seen.add(key);
      rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });

      const qaId = el.getAttribute('data-drape-qa-id') || `qa-${++qaIdCounter}`;
      el.setAttribute('data-drape-qa-id', qaId);
      const selector = `[data-drape-qa-id="${qaId}"]`;

      const scope =
        el.closest('form, [role="search"], [class*="search"], [class*="chat"], [class*="message"], [class*="composer"], [data-chat], [data-search]') ||
        el.parentElement ||
        el;
      const relatedField = scope?.querySelector?.(
        'textarea, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])'
      );
      const relatedValue = typeof relatedField?.value === 'string' ? relatedField.value.trim() : '';
      const inputRequired = !!relatedField;
      const inputEmpty = inputRequired && relatedValue.length === 0;

      results.push({
        type, href: href || null, text, selector,
        tag: el.tagName.toLowerCase(),
        iconOnly,
        disabled,
        ariaDisabled: el.getAttribute('aria-disabled') === 'true',
        inputRequired,
        inputEmpty,
        inHeader: !!el.closest('header, [role="banner"]'),
        inNav: !!el.closest('nav, [role="navigation"], [role="tablist"]'),
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        aboveFold: rect.top >= 0 && rect.top < (window.innerHeight * 1.1),
      });
    }

    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      addEl(a, 'link', href);
    }
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      if (btn.closest('form') && btn.type === 'submit') continue;
      addEl(btn, 'button', null);
    }
    for (const nav of document.querySelectorAll('nav a, nav button, [role="tab"], [role="menuitem"]')) {
      addEl(nav, 'nav', nav.getAttribute('href') || null);
    }
    // Detect icon buttons and interactive elements that aren't <button> or <a>
    // These are common in modern React apps (div with onClick, svg buttons, etc.)
    for (const el of document.querySelectorAll('[onclick], [role="button"], [tabindex="0"], [class*="cursor-pointer"]')) {
      if (el.tagName === 'A' || el.tagName === 'BUTTON') continue; // Already handled
      addEl(el, 'interactive', null);
    }

    return results.slice(0, 80); // Cap clickables per page
  });
}

async function refreshClickable(page, target) {
  const currentClickables = await getClickableElements(page).catch(() => []);
  return currentClickables.find((candidate) =>
    candidate.type === target.type &&
    candidate.text === target.text &&
    (candidate.href || '') === (target.href || '')
  ) || null;
}

// ── Form Detection & Fill ──────────────────────────────────────
async function detectAndFillForms(page, pagePath) {
  const results = [];

  const forms = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('form')).slice(0, 5).map((form, i) => {
      const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map(inp => ({
        tag: inp.tagName.toLowerCase(),
        type: inp.getAttribute('type') || 'text',
        name: inp.getAttribute('name') || '',
        placeholder: inp.getAttribute('placeholder') || '',
        id: inp.id || '',
      }));
      const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
      return { index: i, inputs, hasSubmit: !!submit };
    });
  });

  for (const form of forms) {
    if (form.inputs.length === 0) continue;
    logAction('functional', 'form-fill', `${pagePath} form[${form.index}] with ${form.inputs.length} inputs`);

    for (const input of form.inputs) {
      try {
        const selector = input.id ? `#${input.id}` : `form:nth-of-type(${form.index + 1}) ${input.tag}[name="${input.name}"]`;
        const testValue = getTestValue(input.type, input.name, input.placeholder);
        if (input.tag === 'select') {
          await page.select(selector, '').catch(() => {});
        } else if (input.type !== 'hidden' && input.type !== 'checkbox' && input.type !== 'radio') {
          await page.type(selector, testValue, { delay: 10 }).catch(() => {});
        }
      } catch {}
    }

    if (form.hasSubmit) {
      try {
        await page.click(`form:nth-of-type(${form.index + 1}) button[type="submit"], form:nth-of-type(${form.index + 1}) button:not([type])`).catch(() => {});
        await new Promise(r => setTimeout(r, 1500));
      } catch {}
    }

    results.push({ page: pagePath, form: form.index, inputCount: form.inputs.length, status: 'filled' });
  }
  return results;
}

function getTestValue(type, name, placeholder) {
  const hint = (name + placeholder).toLowerCase();
  if (type === 'email' || hint.includes('email')) return 'test@example.com';
  if (type === 'password' || hint.includes('password')) return 'Test123!';
  if (type === 'tel' || hint.includes('phone')) return '+1234567890';
  if (type === 'number') return '25';
  if (type === 'url') return 'https://example.com';
  if (hint.includes('name')) return 'John Doe';
  if (hint.includes('search')) return 'test';
  if (hint.includes('message') || hint.includes('comment')) return 'Test message.';
  return 'Test';
}

// ── DOM Snapshot for change detection ──────────────────────────
async function takeDomSnapshot(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    text: (document.body?.innerText?.trim() || '').substring(0, 500),
    domStructure: document.body ? Array.from(document.body.children).slice(0, 20).map(c =>
      c.tagName + (c.id ? '#' + c.id : '')
    ).join('|') : '',
    modalCount: document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"], dialog').length,
  })).catch(() => ({ url: '', text: '', domStructure: '', modalCount: 0 }));
}

async function waitForChange(page, prevSnapshot, timeout = CLICK_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 300));
    const cur = await takeDomSnapshot(page);
    if (cur.url !== prevSnapshot.url) return { changed: true, type: 'navigation', url: cur.url };
    if (cur.text !== prevSnapshot.text && cur.text.length > 0) return { changed: true, type: 'content', url: cur.url };
    if (cur.domStructure !== prevSnapshot.domStructure) return { changed: true, type: 'dom-change', url: cur.url };
    if (cur.modalCount !== prevSnapshot.modalCount) return { changed: true, type: 'modal', url: cur.url };
  }
  return { changed: false, type: 'none', url: page.url() };
}

// ── Phase 1: Functional Testing ────────────────────────────────
async function functionalTest(browser, options = {}) {
  const mode = options.mode || 'deep';
  const results = { pages: [], clicks: [], forms: [], issues: [], screenshots: {} };
  const jsErrors = [];
  const detectedPages = detectPages();
  const pagesUnderTest = mode === 'primary'
    ? detectedPages.filter(isLikelyPrimaryRoute).slice(0, PRIMARY_ROUTE_LIMIT)
    : detectedPages;
  logAction('functional', 'start', `Testing ${pagesUnderTest.length} pages across ${VIEWPORTS.length} viewports (${mode})`);

  let screenshotCount = 0;

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height });
    page.on('pageerror', err => jsErrors.push(err.message));

    for (const pagePath of pagesUnderTest) {
      const url = `${BASE_URL}${pagePath}`;
      const pageResult = { path: pagePath, status: 0, errors: [], checks: {}, viewport: vp.name };
      jsErrors.length = 0;

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
        pageResult.status = response ? response.status() : 0;

        // Hydration wait — Vite dev compiles on-demand on first request,
        // so the initial page may be empty for several seconds
        for (let w = 0; w < 15; w++) {
          const textLen = await page.evaluate(() => (document.body?.innerText?.trim() || '').length);
          if (textLen > 30) break;
          await new Promise(r => setTimeout(r, 1000));
        }

        if (pageResult.status === 200) {
          const analysis = await analyzePage(page);
          pageResult.checks = analysis;
          if (analysis.hasError) { pageResult.errors.push(`Error screen on ${pagePath}`); results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: 'Error screen detected' }); }
          if (analysis.isBlank) { pageResult.errors.push(`Blank page: ${pagePath}`); results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: 'Page is blank' }); }
          if (!analysis.hasContent) { results.issues.push({ type: 'functional', severity: 'high', page: pagePath, viewport: vp.name, description: 'No visible content' }); }
          if (!analysis.hasStyles && analysis.hasContent) { results.issues.push({ type: 'functional', severity: 'high', page: pagePath, viewport: vp.name, description: 'Content without CSS' }); }
          if (analysis.brokenImages > 0) { results.issues.push({ type: 'functional', severity: 'medium', page: pagePath, viewport: vp.name, description: `${analysis.brokenImages} broken images` }); }
        } else if (pageResult.status === 404) {
          pageResult.errors.push(`404: ${pagePath}`);
          results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: '404 page not found' });
        }

        // Screenshot (capped)
        if (screenshotCount < MAX_SCREENSHOTS_TOTAL) {
          try {
            const ss = await page.screenshot({ type: 'png', encoding: 'base64' });
            pageResult.screenshot = ss;
            results.screenshots[`${vp.name}:${pagePath}`] = ss;
            screenshotCount++;
          } catch {}
        }

        if (jsErrors.length > 0) {
          for (const e of jsErrors.slice(0, 3)) {
            pageResult.errors.push(`JS: ${e.substring(0, 150)}`);
            results.issues.push({ type: 'functional', severity: 'high', page: pagePath, viewport: vp.name, description: `JS error: ${e.substring(0, 100)}` });
          }
        }
      } catch (err) {
        pageResult.errors.push(err.message.substring(0, 150));
        results.issues.push({ type: 'functional', severity: 'critical', page: pagePath, viewport: vp.name, description: err.message.substring(0, 100) });
      }

      // Only push page results for mobile viewport (backward compat with e2e-check format)
      if (vp.name === 'mobile') {
        results.pages.push(pageResult);
      }

      logAction('functional', 'page', `${vp.name}:${pagePath} — ${pageResult.status} ${pageResult.errors.length ? 'ERRORS' : 'OK'}`);
    }

    // Click testing + form testing: only on mobile viewport (avoid tripling time)
    if (vp.name === 'mobile') {
      const testedClicks = new Set();
      for (const testPage of pagesUnderTest) {
        // Skip dynamic routes with [params] — they cause navigation issues
        if (testPage.includes('[')) continue;

        try {
        await page.goto(`${BASE_URL}${testPage}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {});
        await new Promise(r => setTimeout(r, 800));

        const actualPath = new URL(page.url()).pathname;
        if (actualPath !== testPage && actualPath !== testPage + '/') continue;

        // Clicks
        const clickables = prioritizeClickables(await getClickableElements(page).catch(() => []), testPage, mode);
        logAction('functional', 'click-scan', `${testPage}: ${clickables.length} clickables (${mode})`);

        for (const el of clickables) {
          const clickKey = `${testPage}:${el.type}:${el.text}`;
          if (testedClicks.has(clickKey)) continue;
          testedClicks.add(clickKey);

          if (new URL(page.url()).pathname !== testPage) {
            await page.goto(`${BASE_URL}${testPage}`, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {});
            await new Promise(r => setTimeout(r, 500));
          }

          const refreshed = await refreshClickable(page, el);
          if (!refreshed) {
            logAction('functional', 'click-skip', `${testPage}: could not reacquire ${el.type} "${el.text}"`);
            continue;
          }
          el.selector = refreshed.selector;
          el.x = refreshed.x;
          el.y = refreshed.y;
          el.tag = refreshed.tag;
          el.iconOnly = refreshed.iconOnly;
          el.inHeader = refreshed.inHeader;
          el.inNav = refreshed.inNav;
          el.aboveFold = refreshed.aboveFold;

          jsErrors.length = 0;
          const clickResult = { element: { type: el.type, text: el.text, href: el.href }, fromPage: testPage, result: 'unknown', toPage: null, error: null };

          try {
            // Click by selector first, fallback coordinates
            let clicked = false;
            if (el.selector) {
              try {
                await page.$eval(el.selector, (node) => {
                  node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                });
                await new Promise(r => setTimeout(r, 150));
                clicked = true;
              } catch {}
            }

            let screenshotBefore = null;
            if (screenshotCount < MAX_SCREENSHOTS_TOTAL) {
              screenshotBefore = await page.screenshot({ type: 'png', encoding: 'base64' }).catch(() => null);
              if (screenshotBefore) screenshotCount++;
            }

            const prevSnap = await takeDomSnapshot(page);

            if (clicked && el.selector) {
              try {
                await page.click(el.selector);
              } catch {
                clicked = false;
              }
            }
            if (!clicked) {
              await page.evaluate((x, y) => {
                window.scrollTo({ top: Math.max(0, y - window.innerHeight / 2), behavior: 'instant' });
              }, el.x, el.y).catch(() => {});
              await new Promise(r => setTimeout(r, 150));
              await page.mouse.click(el.x, el.y);
            }

            const change = await waitForChange(page, prevSnap);

            if (change.changed) {
              clickResult.result = change.type;
              clickResult.toPage = change.url ? new URL(change.url).pathname : null;

              if (change.type === 'navigation') {
                const newAnalysis = await analyzePage(page).catch(() => null);
                if (newAnalysis?.hasError) {
                  const errDetail = await page
                    .evaluate(() => {
                      const bodyText = (document.body?.innerText || '').trim();
                      const line = bodyText.split('\n').map(s => s.trim()).find(s => s.length > 8) || '';
                      return line.substring(0, 200);
                    })
                    .catch(() => '');
                  const toPath = clickResult.toPage || '';
                  clickResult.error = `Error screen after clicking "${el.text}"${toPath ? ` → ${toPath}` : ''}${errDetail ? ` — ${errDetail}` : ''}`;
                  results.issues.push({ type: 'functional', severity: 'critical', page: testPage, description: clickResult.error });
                }
                if (newAnalysis?.isBlank) {
                  clickResult.error = `Blank page after clicking "${el.text}"`;
                  results.issues.push({ type: 'functional', severity: 'critical', page: testPage, description: clickResult.error });
                }
              }

              if (jsErrors.length > 0) {
                clickResult.error = `JS error after click: ${jsErrors[0].substring(0, 100)}`;
                results.issues.push({ type: 'functional', severity: 'high', page: testPage, description: clickResult.error });
              }
            } else {
              clickResult.result = 'no-change';
              const deadInteractive = classifyDeadInteractive(el, testPage);
              clickResult.error = `"${el.text}" (${el.type}) clicked but nothing happened`;
              results.issues.push({
                type: 'functional',
                severity: deadInteractive.severity,
                blocking: deadInteractive.blocking,
                page: testPage,
                description: clickResult.error,
                meta: {
                  elementType: el.type,
                  href: el.href || null,
                  reason: deadInteractive.reason,
                },
              });
            }

            let screenshotAfter = null;
            if (screenshotCount < MAX_SCREENSHOTS_TOTAL) {
              screenshotAfter = await page.screenshot({ type: 'png', encoding: 'base64' }).catch(() => null);
              if (screenshotAfter) screenshotCount++;
            }
            clickResult.screenshotBefore = screenshotBefore;
            clickResult.screenshotAfter = screenshotAfter;
          } catch (err) {
            clickResult.result = 'error';
            clickResult.error = err.message.substring(0, 150);
          }

          results.clicks.push(clickResult);
        }

        // Forms
        const formResults = await detectAndFillForms(page, testPage);
        results.forms.push(...formResults);
        } catch (pageErr) {
          // Catch detached frame, navigation errors — skip this page, continue testing
          logAction('functional', 'page-error', `${testPage}: ${(pageErr.message || '').substring(0, 80)}`);
        }
      }
    }

    await page.close();
  }

  logAction('functional', 'complete', `${results.pages.length} pages, ${results.clicks.length} clicks, ${results.forms.length} forms, ${results.issues.length} issues`);
  return results;
}

// ── Phase 2: Visual Testing (Gemini Vision) ────────────────────
async function visualTest(screenshots) {
  if (!VISION_API_KEY) {
    logAction('visual', 'skipped', 'No API key — visual analysis skipped');
    return { issues: [], skipped: true };
  }

  const entries = Object.entries(screenshots);
  if (entries.length === 0) return { issues: [], skipped: false };

  logAction('visual', 'start', `Analyzing ${entries.length} screenshots`);
  const allIssues = [];
  let qualityScoreSum = 0;
  let qualityCount = 0;

  for (let i = 0; i < entries.length; i += MAX_SCREENSHOTS_PER_BATCH) {
    const batch = entries.slice(i, i + MAX_SCREENSHOTS_PER_BATCH);

    const parts = [];
    parts.push({ text: `You are a senior QA engineer reviewing screenshots of a generated web application.
Analyze each screenshot for visual quality issues. Return JSON only:
{
  "issues": [
    { "page": "/path", "type": "layout|typography|color|spacing|overlap|empty", "severity": "critical|high|medium|low", "description": "What is wrong", "suggestion": "Code fix" }
  ],
  "quality_score": 8,
  "looks_professional": true
}
Check: overlapping elements, truncated text, broken layouts, inconsistent spacing, empty sections, unstyled elements, broken images. Only report REAL issues. Return ONLY valid JSON.` });

    for (const [key, base64] of batch) {
      parts.push({ inlineData: { mimeType: 'image/png', data: base64 } });
      parts.push({ text: `Screenshot: ${key}` });
    }

    try {
      const response = await callGeminiVision(parts);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.issues)) {
          for (const issue of parsed.issues) {
            allIssues.push({ ...issue, source: 'visual' });
          }
        }
        if (typeof parsed.quality_score === 'number') {
          qualityScoreSum += parsed.quality_score;
          qualityCount++;
        }
        logAction('visual', 'batch', `${parsed.issues?.length || 0} issues, quality: ${parsed.quality_score || '?'}/10`);
      }
    } catch (err) {
      logAction('visual', 'error', `Vision API: ${err.message.substring(0, 100)}`);
    }
  }

  const avgQuality = qualityCount > 0 ? Math.round(qualityScoreSum / qualityCount) : null;
  logAction('visual', 'complete', `${allIssues.length} visual issues, avg quality: ${avgQuality}/10`);
  return { issues: allIssues, skipped: false, qualityScore: avgQuality };
}

// ── Gemini Vision API (HTTPS, no npm deps) ─────────────────────
function callGeminiVision(parts) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    });

    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${VISION_API_KEY}`);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message || 'API error')); return; }
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
          resolve(text);
        } catch (e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vision API timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Main QA probe ──────────────────────────────────────────────
async function main() {
  const report = {
    status: 'failed',
    qualityScore: 0,
    totalIssues: 0,
    attempts: [],
    log: qaLog,
  };

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--max-old-space-size=512'],
      timeout: 15000,
    });

    // Single-pass probe: functional + visual, no internal self-heal.
    // The backend orchestrator (verify/auto-fix-orchestrator.ts) decides
    // whether to auto-fix, which model to use, and how many cycles to run.
    const primaryFunctional = await functionalTest(browser, { mode: 'primary' });
    const primaryIssues = [...primaryFunctional.issues];
    const primaryBlocking = primaryIssues.filter(i => i.severity === 'critical' || i.severity === 'high' || i.blocking);
    const primaryDeadInteractives = primaryFunctional.issues.filter(i =>
      i.type === 'functional' &&
      typeof i.description === 'string' &&
      i.description.includes('clicked but nothing happened')
    );

    let functional = primaryFunctional;
    let visual = { issues: [], skipped: true };
    let allIssues = [...primaryIssues];
    let criticalHigh = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high');
    let blockingIssues = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high' || i.blocking);
    let deadInteractiveIssues = primaryDeadInteractives;

    if (primaryBlocking.length === 0) {
      logAction('qa', 'primary-pass', `Primary gate passed, running deep verification`);
      const deepFunctional = await functionalTest(browser, { mode: 'deep' });
      visual = await visualTest(deepFunctional.screenshots);
      functional = deepFunctional;
      allIssues = [...deepFunctional.issues, ...(visual.issues || [])];
      criticalHigh = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high');
      blockingIssues = allIssues.filter(i => i.severity === 'critical' || i.severity === 'high' || i.blocking);
      deadInteractiveIssues = deepFunctional.issues.filter(i =>
        i.type === 'functional' &&
        typeof i.description === 'string' &&
        i.description.includes('clicked but nothing happened')
      );
    } else {
      logAction('qa', 'primary-fail', `${primaryBlocking.length} blocking issues in primary gate — skipping deep verification`);
    }

    const attempt = {
      cycle: 1,
      verificationMode: primaryBlocking.length === 0 ? 'deep' : 'primary-only',
      primaryFunctionalIssues: primaryFunctional.issues.length,
      primaryBlockingCount: primaryBlocking.length,
      primaryDeadInteractiveCount: primaryDeadInteractives.length,
      functionalIssues: functional.issues.length,
      visualIssues: (visual.issues || []).length,
      criticalHighCount: criticalHigh.length,
      blockingIssueCount: blockingIssues.length,
      deadInteractiveCount: deadInteractiveIssues.length,
      pages: functional.pages,
      clicks: functional.clicks,
      forms: functional.forms,
      visualAnalysis: (visual.issues || []).slice(0, 20), // Cap for report size
      visualSkipped: visual.skipped || false,
      fix: null, // Healing is the backend's responsibility now.
    };
    report.attempts.push(attempt);

    if (blockingIssues.length === 0) {
      report.status = 'verified';
      report.qualityScore = visual.qualityScore || (10 - Math.min(5, allIssues.filter(i => i.severity === 'medium').length));
      logAction('qa', 'verified', `Passed! Score: ${report.qualityScore}/10`);
    } else {
      logAction('qa', 'issues', `${blockingIssues.length} blocking issues found (${deadInteractiveIssues.length} dead interactives) — backend will auto-fix`);
    }

    report.totalIssues = criticalHigh.length;
  } catch (err) {
    const msg = (err && err.message ? String(err.message) : String(err)).substring(0, 300);
    logAction('qa', 'fatal', msg);
    report.status = 'error';
    // Persist the actual failure reason — the backend orchestrator surfaces
    // this to the auto-fix model. Without it, all crashes look the same
    // ("status=error, issues=0") and the AI has nothing to fix.
    report.fatalError = msg;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  const drapeDir = path.join(PROJECT_DIR, '.drape');
  if (!fs.existsSync(drapeDir)) fs.mkdirSync(drapeDir, { recursive: true });

  // Save screenshots separately BEFORE stripping them from the report
  // This file is read by the /screenshots endpoint for Project History
  try {
    const ssData = { pages: {}, nav: {} };
    const lastAttemptData = report.attempts[report.attempts.length - 1];
    if (lastAttemptData?.pages) {
      for (const p of lastAttemptData.pages) {
        if (p.screenshot && p.path) ssData.pages[p.path] = p.screenshot;
      }
    }
    if (lastAttemptData?.clicks) {
      for (const c of lastAttemptData.clicks) {
        // Robust key: fromPage|type|text to avoid collisions
        const key = `${c.fromPage || '/'}|${c.element?.type || ''}|${c.element?.text || ''}`;
        if (c.screenshotBefore) ssData.nav[key + '|before'] = c.screenshotBefore;
        if (c.screenshotAfter) ssData.nav[key + '|after'] = c.screenshotAfter;
      }
    }
    if (Object.keys(ssData.pages).length > 0 || Object.keys(ssData.nav).length > 0) {
      fs.writeFileSync(path.join(drapeDir, 'qa-screenshots.json'), JSON.stringify(ssData));
      logAction('qa', 'saved', `Screenshots saved: ${Object.keys(ssData.pages).length} pages, ${Object.keys(ssData.nav).length} nav`);
    }
  } catch (ssErr) {
    console.error('[QA] Failed to save screenshots:', ssErr.message);
  }

  // Save report WITHOUT screenshots (keep it small)
  try {
    const reportToSave = JSON.parse(JSON.stringify(report));
    if (reportToSave.attempts) {
      for (const a of reportToSave.attempts) {
        if (a.pages) a.pages.forEach(p => delete p.screenshot);
        if (a.clicks) a.clicks.forEach(c => { delete c.screenshotBefore; delete c.screenshotAfter; });
      }
    }
    fs.writeFileSync(path.join(drapeDir, 'qa-report.json'), JSON.stringify(reportToSave));
    logAction('qa', 'saved', 'Report saved to .drape/qa-report.json');
  } catch (err) {
    console.error('[QA] Failed to save report:', err.message);
  }

  // Backward-compatible stdout output (same shape as e2e-check.js)
  const lastAttempt = report.attempts[report.attempts.length - 1];
  const pageErrors = (lastAttempt?.pages || []).flatMap(p => p.errors || []);
  // Surface dead/broken button clicks as errors so autoFix can see them.
  // Exclude 'low' severity (same-page links are expected to do nothing).
  const deadClickErrors = (lastAttempt?.clicks || [])
    .filter(c => c.error && c.result !== 'unknown')
    .map(c => {
      const elDesc = c.element ? `${c.element.type || 'element'} "${c.element.text || ''}"`.trim() : 'element';
      const pageDesc = c.fromPage ? ` on page ${c.fromPage}` : '';
      // Surface href so the AI auto-fix can see the target route and decide
      // whether to create the missing page or rewire the link.
      const rawHref = c.element?.href;
      const hrefDesc = typeof rawHref === 'string' && rawHref.length > 0
        ? ` [href=${rawHref}]`
        : (c.element?.type === 'link' ? ' [href=none]' : '');
      return `Dead interactive element: ${elDesc}${hrefDesc}${pageDesc} — ${c.error}`;
    });
  // If qa-agent crashed before producing issues, surface the fatal message
  // as a real error string so the backend auto-fix has something to act on.
  const fatalErrors = report.status === 'error' && report.fatalError
    ? [`QA agent fatal error: ${report.fatalError}`]
    : [];
  const backcompat = {
    passed: report.status === 'verified',
    pages: lastAttempt?.pages || [],
    navigation: lastAttempt?.clicks || [],
    errors: [...pageErrors, ...deadClickErrors, ...fatalErrors],
    qaReport: {
      status: report.status,
      qualityScore: report.qualityScore,
      totalIssues: report.totalIssues,
      fatalError: report.fatalError || undefined,
      attempts: (report.attempts || []).map(a => ({
        cycle: a.cycle,
        functionalIssues: a.functionalIssues,
        visualIssues: a.visualIssues,
        criticalHighCount: a.criticalHighCount,
        blockingIssueCount: a.blockingIssueCount,
        deadInteractiveCount: a.deadInteractiveCount,
        visualAnalysis: a.visualAnalysis,
        visualSkipped: a.visualSkipped,
        fix: a.fix,
      })),
    },
  };

  // Strip screenshots from stdout
  if (backcompat.pages) backcompat.pages.forEach(p => delete p.screenshot);
  if (backcompat.navigation) backcompat.navigation.forEach(n => { delete n.screenshotBefore; delete n.screenshotAfter; });

  process.stdout.write(JSON.stringify(backcompat));
}

main().catch(err => {
  console.error('[QA] Fatal:', err);
  process.stdout.write(JSON.stringify({
    passed: false, errors: [err.message], qaReport: { status: 'error', qualityScore: 0, totalIssues: 0, attempts: [] }
  }));
  process.exit(1);
});
