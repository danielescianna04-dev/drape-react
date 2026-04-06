#!/usr/bin/env node
/**
 * Full E2E verification for generated projects.
 *
 * Phase 1: Load each detected page, check content/CSS/errors
 * Phase 2: Click every interactive element (links, buttons, nav items)
 *          and verify navigation works without loops or crashes
 *
 * Output: JSON with verification results
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const MAX_CLICKS = 999;      // no limit — test everything
const CLICK_TIMEOUT = 3000;  // ms to wait after click
const NAV_TIMEOUT = 12000;   // ms for page.goto

// ── Page Detection ─────────────────────────────────────────────

function detectPages() {
  const projectDir = '/home/coder/project';
  const pages = ['/'];

  // Next.js: app/ or src/app/
  for (const appDir of [path.join(projectDir, 'app'), path.join(projectDir, 'src', 'app')]) {
    if (!fs.existsSync(appDir)) continue;
    const scan = (dir, prefix) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
          if (['api','components','lib','hooks','utils','ui','styles','types','constants'].includes(entry.name)) continue;
          const route = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
          const hasPage = ['page.tsx','page.jsx','page.ts','page.js'].some(f =>
            fs.existsSync(path.join(dir, entry.name, f)));
          if (hasPage && route !== '/') pages.push(route);
          scan(path.join(dir, entry.name), route);
        }
      } catch {}
    };
    scan(appDir, '');
  }

  // Vite/React: src/pages/
  const pagesDir = path.join(projectDir, 'src', 'pages');
  if (fs.existsSync(pagesDir)) {
    try {
      for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
          const name = entry.name.replace(/\.(tsx?|jsx?)$/, '').toLowerCase();
          if (!['index', 'home', 'app', '_app', '_document'].includes(name)) pages.push(`/${name}`);
        }
        if (entry.isDirectory()) {
          const hasIndex = ['index.tsx','index.jsx','index.ts','index.js'].some(f =>
            fs.existsSync(path.join(pagesDir, entry.name, f)));
          if (hasIndex) pages.push(`/${entry.name}`);
        }
      }
    } catch {}
  }

  // Extract routes from App.tsx / router files
  try {
    for (const routerFile of ['src/App.tsx', 'src/App.jsx', 'src/router.tsx', 'src/routes.tsx', 'src/router/index.tsx', 'src/router/index.ts']) {
      const fp = path.join(projectDir, routerFile);
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, 'utf-8');
      for (const m of content.matchAll(/path[=:]\s*["']\/([a-zA-Z0-9_-]+)["']/g)) {
        const route = `/${m[1]}`;
        if (!pages.includes(route)) pages.push(route);
      }
    }
  } catch {}

  return [...new Set(pages)];
}

// ── Page Analysis ──────────────────────────────────────────────

async function analyzePage(page) {
  return page.evaluate(() => {
    const body = document.body;
    const text = (body?.innerText?.trim() || '');

    // Content
    const hasContent = text.length > 30;

    // CSS — check for non-default styles
    let hasStyles = false;
    const els = body?.querySelectorAll('main, div, section, header, h1, nav, p, span, a') || [];
    for (const el of Array.from(els).slice(0, 10)) {
      const s = window.getComputedStyle(el);
      const bg = s.backgroundColor;
      if ((bg !== 'rgba(0, 0, 0, 0)' && bg !== 'rgb(255, 255, 255)') ||
          s.display === 'flex' || s.display === 'grid' ||
          parseFloat(s.paddingTop) > 8 || s.borderRadius !== '0px' || parseFloat(s.gap) > 0) {
        hasStyles = true;
        break;
      }
    }

    // Error screen
    const hasError = text.includes('Application error') ||
      text.includes('Internal Server Error') ||
      text.includes('Unhandled Runtime Error') ||
      text.includes("Can't resolve") ||
      (text.includes('404') && text.length < 200) ||
      !!document.querySelector('[data-nextjs-dialog]');

    // Blank check
    const bodyBg = window.getComputedStyle(body).backgroundColor;
    const isBlank = !hasContent && (bodyBg === 'rgb(255, 255, 255)' || bodyBg === 'rgba(0, 0, 0, 0)' || bodyBg === 'rgb(0, 0, 0)');

    // Images
    const images = document.querySelectorAll('img');
    let brokenImages = 0;
    images.forEach(img => { if (!img.complete || img.naturalWidth === 0) brokenImages++; });

    // Interactive elements
    const buttons = document.querySelectorAll('button, [role="button"], a[href]');
    const forms = document.querySelectorAll('form, input, textarea, select');

    return {
      hasContent, hasStyles, hasError, isBlank,
      textLength: text.length,
      elementCount: document.querySelectorAll('*').length,
      imageCount: images.length,
      brokenImages,
      buttonCount: buttons.length,
      formCount: forms.length,
      bodyBg,
      title: document.title,
    };
  });
}

// ── Get all clickable elements ─────────────────────────────────

async function getClickableElements(page) {
  const elements = await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const rects = []; // For bounding box deduplication

    // Helper: check if a rect is fully contained in an already-captured rect
    function isContainedByExisting(rect) {
      for (const r of rects) {
        if (rect.x >= r.x && rect.y >= r.y &&
            rect.x + rect.width <= r.x + r.width &&
            rect.y + rect.height <= r.y + r.height) {
          return true;
        }
      }
      return false;
    }

    function addElement(el, type, href) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return; // Too small
      if (isContainedByExisting(rect)) return; // Child of already-captured parent

      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().substring(0, 50);
      if (!text) return; // No text = can't identify in report

      const key = `${type}:${text}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
      if (seen.has(key)) return;
      seen.add(key);

      rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      results.push({
        type,
        href: href || null,
        text,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        selector: null,
      });
    }

    // 1. Internal links (a[href])
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('http') || href.startsWith('javascript:') ||
          href.startsWith('mailto:') || href.startsWith('tel:') || href === '') continue;
      if (href === '#' || (href.startsWith('#') && href.length < 30)) {
        addElement(a, 'link', href);
        continue;
      }
      addElement(a, 'link', href);
    }

    // 2. Buttons and role="button"
    for (const btn of document.querySelectorAll('button, [role="button"], [onclick], input[type="button"], input[type="submit"]')) {
      if (btn.closest('form') && (btn.type === 'submit' || btn.tagName === 'INPUT')) continue;
      addElement(btn, 'button', null);
    }

    // 3. Nav items
    for (const nav of document.querySelectorAll('nav a, nav button, [role="navigation"] a, [role="tab"], [role="menuitem"]')) {
      const href = nav.getAttribute('href') || '';
      addElement(nav, 'nav', href || null);
    }

    // 4. Elements with cursor: pointer (Tailwind cursor-pointer, inline styles, CSS)
    const allViewportEls = document.querySelectorAll('div, span, li, td, th, label, [tabindex]');
    const viewportEls = Array.from(allViewportEls).filter(el => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width >= 10 && r.height >= 10;
    }).slice(0, 200);
    for (const el of viewportEls) {
      if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' ||
          el.getAttribute('role') === 'button' || el.getAttribute('role') === 'tab' ||
          el.getAttribute('role') === 'menuitem') continue;

      const rect = el.getBoundingClientRect();

      const style = window.getComputedStyle(el);
      const hasCursorPointer = style.cursor === 'pointer';
      const hasTabindex = el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
      const hasDataAction = el.hasAttribute('data-action');

      if (hasCursorPointer || hasTabindex || hasDataAction) {
        addElement(el, 'interactive', null);
      }
    }

    // 5. Broken links (a without href or href="#")
    for (const a of document.querySelectorAll('a:not([href]), a[href=""], a[href="#"]')) {
      addElement(a, 'broken-link', null);
    }

    return results;
  });

  const counts = {};
  for (const e of elements) counts[e.type] = (counts[e.type] || 0) + 1;
  console.error('[e2e] getClickableElements on ' + page.url() + ': ' + JSON.stringify(counts) + ' (' + elements.length + ' total)');
  return elements;
}

// ── Deep DOM snapshot for change detection ────────────────────

async function takeDomSnapshot(page) {
  return page.evaluate(() => {
    const body = document.body;
    const text = (body?.innerText?.trim() || '').substring(0, 500);
    const topChildren = body ? Array.from(body.children).slice(0, 50).map(c =>
      c.tagName + (c.id ? '#' + c.id : '') + (c.className ? '.' + String(c.className).split(' ')[0] : '')
    ).join('|') : '';
    const modalCount = document.querySelectorAll(
      '[role="dialog"], .modal, [aria-modal="true"], dialog, [class*="modal"], [class*="popup"], [class*="overlay"], [class*="drawer"]'
    ).length;
    const visibleCount = document.querySelectorAll('*').length;
    return {
      url: window.location.href,
      text,
      domStructure: topChildren,
      scrollY: window.scrollY,
      modalCount,
      visibleCount,
    };
  }).catch(() => ({ url: '', text: '', domStructure: '', scrollY: 0, modalCount: 0, visibleCount: 0 }));
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
    if (Math.abs(cur.scrollY - prevSnapshot.scrollY) > 50) return { changed: true, type: 'scroll', url: cur.url };
    if (cur.visibleCount !== prevSnapshot.visibleCount) return { changed: true, type: 'elements-changed', url: cur.url };
  }
  return { changed: false, type: 'none', url: page.url() };
}

// ── Main Verify ────────────────────────────────────────────────

async function verify(pages) {
  const results = { passed: true, pages: [], errors: [], navigation: [] };
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 });

    const jsErrors = [];
    page.on('pageerror', err => jsErrors.push(err.message));

    // ── PHASE 1: Load each page directly ──
    for (const pagePath of pages) {
      const url = `${BASE_URL}${pagePath}`;
      const pageResult = { path: pagePath, status: 0, errors: [], checks: {} };
      jsErrors.length = 0;

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
        pageResult.status = response ? response.status() : 0;

        // Follow redirects
        if (pageResult.status >= 300 && pageResult.status < 400) {
          const finalResp = await page.goto(page.url(), { waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null);
          pageResult.status = finalResp ? finalResp.status() : 404;
        }

        // Wait for hydration
        for (let w = 0; w < 8; w++) {
          const textLen = await page.evaluate(() => (document.body?.innerText?.trim() || '').length);
          if (textLen > 30) break;
          await new Promise(r => setTimeout(r, 500));
        }

        if (pageResult.status === 200) {
          const analysis = await analyzePage(page);
          pageResult.checks = analysis;

          if (analysis.hasError) { pageResult.errors.push(`[${pagePath}] Error screen detected`); results.passed = false; }
          if (analysis.isBlank) { pageResult.errors.push(`[${pagePath}] Page is blank (${analysis.textLength} chars)`); results.passed = false; }
          if (!analysis.hasContent) { pageResult.errors.push(`[${pagePath}] No visible content`); results.passed = false; }
          if (!analysis.hasStyles && analysis.hasContent) { pageResult.errors.push(`[${pagePath}] Content without CSS`); results.passed = false; }
          if (analysis.brokenImages > 0) { pageResult.errors.push(`[${pagePath}] ${analysis.brokenImages} broken images`); }
        } else if (pageResult.status === 404) {
          pageResult.errors.push(`[${pagePath}] 404 — page not found`); results.passed = false;
        } else if (pageResult.status >= 500) {
          pageResult.errors.push(`[${pagePath}] Server error: ${pageResult.status}`); results.passed = false;
        }

        // Always capture a screenshot for every page, regardless of status or errors
        try { pageResult.screenshot = await page.screenshot({ type: 'png', encoding: 'base64' }); } catch {}
      } catch (err) {
        pageResult.errors.push(`[${pagePath}] ${err.message}`);
        results.passed = false;
      }

      if (jsErrors.length > 0) {
        for (const e of jsErrors.slice(0, 3)) {
          pageResult.errors.push(`[${pagePath}] JS: ${e}`);
          results.passed = false;
        }
      }

      results.pages.push(pageResult);
    }

    // ── PHASE 2: Click-through navigation test ──
    // Test clickables page by page — for each known page, click all interactive elements
    console.error('[Verify] Phase 2: Testing navigation by clicking...');

    const clickResults = [];
    let clickCount = 0;
    const testedClicks = new Set();

    // Build list of pages to test clicks on (detected pages + homepage)
    const pagesToTest = [...new Set(['/', ...pages.filter(p => !p.includes('['))])];

    for (const testPage of pagesToTest) {
      if (clickCount >= MAX_CLICKS) break;

      // Navigate to this page
      const pageUrl = `${BASE_URL}${testPage}`;
      await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {});
      await new Promise(r => setTimeout(r, 400));

      // Check if page redirected us elsewhere (e.g. /browse → /profiles)
      const actualPath = new URL(page.url()).pathname;
      if (actualPath !== testPage && actualPath !== testPage + '/') {
        console.error(`[Verify] Page ${testPage} redirected to ${actualPath}`);
        // Skip this page — we'll test the destination page when we get to it
        continue;
      }

      // Get clickable elements on this page
      await new Promise(r => setTimeout(r, 1000)); // Wait for hydration before checking clickable elements
      const clickables = await getClickableElements(page).catch(() => []);
      console.error(`[Verify] Page ${testPage}: ${clickables.length} clickable elements`);

      for (const el of clickables) {
        if (clickCount >= MAX_CLICKS) break;

        // Broken links are structural errors — report without clicking
        if (el.type === 'broken-link') {
          clickResults.push({
            element: { type: el.type, text: el.text, href: el.href },
            fromPage: testPage,
            result: 'broken-link',
            toPage: null,
            error: `"${el.text}" is a link without a destination (no href) — broken link`,
          });
          results.passed = false;
          results.errors.push(`[nav] "${el.text}" is a broken link (no href)`);
          continue;
        }

        const clickKey = `${testPage}:${el.type}:${el.text}:${el.href || ''}`;
        if (testedClicks.has(clickKey)) continue;
        testedClicks.add(clickKey);

        // Make sure we're on the right page before clicking
        if (new URL(page.url()).pathname !== testPage) {
          await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }).catch(() => {});
          await new Promise(r => setTimeout(r, 500));
          // Refresh element positions after re-navigation
          const refreshed = await getClickableElements(page).catch(() => []);
          const match = refreshed.find(r => r.text === el.text && r.type === el.type);
          if (match) { el.x = match.x; el.y = match.y; }
          else continue; // Element not found anymore — skip
        }

        const prevSnapshot = await takeDomSnapshot(page);
        jsErrors.length = 0;

        const clickResult = {
          element: { type: el.type, text: el.text, href: el.href },
          fromPage: testPage,
          result: 'unknown',
          toPage: null,
          error: null,
        };

        try {
          // Capture "before" screenshot for every click
          let screenshotBefore = null;
          try { screenshotBefore = await page.screenshot({ type: 'png', encoding: 'base64' }); } catch {}

          await page.mouse.click(el.x, el.y);
          clickCount++;

          const change = await waitForChange(page, prevSnapshot);

          if (change.changed) {
            const newPath = change.url ? new URL(change.url).pathname : '(unknown)';
            clickResult.toPage = newPath;
            clickResult.result = change.type;

            if (change.type === 'navigation') {
              // Check for redirect loop
              await new Promise(r => setTimeout(r, 800));
              const afterPath = new URL(page.url()).pathname;

              if (afterPath === testPage && afterPath !== newPath) {
                clickResult.result = 'redirect-loop';
                clickResult.error = `Navigated to ${newPath} but redirected back to ${afterPath} — navigation loop`;
                results.passed = false;
                results.errors.push(`[nav] "${el.text}" → ${newPath} → redirect loop back to ${afterPath}`);
              }

              // Check destination page for errors
              const newAnalysis = await analyzePage(page).catch(() => null);
              if (newAnalysis) {
                if (newAnalysis.hasError) {
                  clickResult.error = `Error screen after clicking "${el.text}"`;
                  results.passed = false;
                  results.errors.push(`[nav] "${el.text}" → ${newPath} → error screen`);
                }
                if (newAnalysis.isBlank) {
                  clickResult.error = `Blank page after clicking "${el.text}"`;
                  results.passed = false;
                  results.errors.push(`[nav] "${el.text}" → ${newPath} → blank page`);
                }
              }
            }

            // JS errors after click
            if (jsErrors.length > 0) {
              clickResult.error = `JS error after click: ${jsErrors[0]}`;
              results.passed = false;
              results.errors.push(`[nav] "${el.text}" → JS: ${jsErrors[0].substring(0, 100)}`);
            }
          } else {
            clickResult.result = 'no-change';
            // Same-page nav links are expected to do nothing — only flag buttons as high severity
            const isLikelySamePageLink = el.href === new URL(page.url()).pathname || el.href === new URL(page.url()).pathname + '/';
            if (!isLikelySamePageLink && el.type === 'button') {
              clickResult.error = `"${el.text}" (${el.type}) clicked but nothing happened — non-functional button`;
              results.passed = false;
              results.errors.push(`[nav] "${el.text}" (${el.type}) clicked but nothing happened — broken button`);
            } else {
              clickResult.error = `"${el.text}" (${el.type}) clicked but nothing happened`;
              // Don't fail the entire test for same-page links or nav items
            }
          }

          // Capture "after" screenshot and attach both to the result
          let screenshotAfter = null;
          try { screenshotAfter = await page.screenshot({ type: 'png', encoding: 'base64' }); } catch {}
          clickResult.screenshotBefore = screenshotBefore;
          clickResult.screenshotAfter = screenshotAfter;
        } catch (err) {
          clickResult.result = 'error';
          clickResult.error = err.message;
        }

        clickResults.push(clickResult);
      }
    }

    if (clickCount === 0 && results.pages.some(p => p.checks && (p.checks.buttonCount > 0 || p.checks.elementCount > 10))) {
      console.error('[e2e] WARNING: 0 click tests executed but pages had interactive elements');
    }

    results.navigation = clickResults;
    console.error(`[Verify] Tested ${clickCount} clicks, ${clickResults.filter(c => c.error).length} issues found`);

    // Aggregate all errors
    results.errors = [...new Set([
      ...results.pages.flatMap(p => p.errors),
      ...results.errors,
    ])].slice(0, 20);

  } catch (err) {
    results.passed = false;
    results.errors.push(`Browser error: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return results;
}

// ── Entry point ────────────────────────────────────────────────

(async () => {
  const pages = detectPages();
  console.error(`[Verify] Phase 1: Checking ${pages.length} pages: ${pages.join(', ')}`);

  const results = await verify(pages);

  const passCount = results.pages.filter(p => p.errors.length === 0).length;
  const navIssues = results.navigation.filter(n => n.error).length;
  console.error(`[Verify] ${passCount}/${results.pages.length} pages OK. ${navIssues} nav issues. ${results.errors.length} total errors.`);

  // Write full results (with screenshots) to file in project dir (bind-mounted)
  const drapeDir = '/home/coder/project/.drape';
  try {
    if (!fs.existsSync(drapeDir)) fs.mkdirSync(drapeDir, { recursive: true });
    const outputPath = path.join(drapeDir, 'e2e-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(results));
    console.error('[e2e] Full results written to ' + outputPath + ' (' + Math.round(fs.statSync(outputPath).size / 1024) + 'KB)');
  } catch (writeErr) {
    console.error('[e2e] Failed to write full results file: ' + writeErr.message);
  }

  // Write stripped version (no screenshots) to stdout for backward compat
  const stripped = JSON.parse(JSON.stringify(results));
  if (stripped.pages) {
    stripped.pages.forEach(p => { delete p.screenshot; });
  }
  if (stripped.navigation) {
    stripped.navigation.forEach(n => { delete n.screenshotBefore; delete n.screenshotAfter; delete n.screenshot; });
  }
  process.stdout.write(JSON.stringify(stripped));
})();
