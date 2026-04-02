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
const NAV_TIMEOUT = 8000;    // ms for page.goto

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
  return page.evaluate(() => {
    const results = [];
    const seen = new Set();

    // Internal links (a[href])
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || '';
      // Skip external links, anchors, javascript:, mailto:, tel:
      if (href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:') ||
          href.startsWith('mailto:') || href.startsWith('tel:') || href === '') continue;
      const key = `link:${href}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const rect = a.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue; // hidden
      const text = (a.innerText || a.getAttribute('aria-label') || '').trim().substring(0, 50);
      results.push({
        type: 'link',
        href,
        text,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        selector: null, // will use coordinates
      });
    }

    // Buttons and clickable elements (not in forms)
    for (const btn of document.querySelectorAll('button, [role="button"], [onclick]')) {
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // Skip submit buttons inside forms
      if (btn.closest('form') && btn.type === 'submit') continue;
      const text = (btn.innerText || btn.getAttribute('aria-label') || '').trim().substring(0, 50);
      const key = `btn:${text}:${Math.round(rect.x)}:${Math.round(rect.y)}`;
      if (seen.has(key) || !text) continue;
      seen.add(key);
      results.push({
        type: 'button',
        href: null,
        text,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        selector: null,
      });
    }

    // Nav items that aren't already captured
    for (const nav of document.querySelectorAll('nav a, nav button, [role="navigation"] a, [role="tab"], [role="menuitem"]')) {
      const rect = nav.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const text = (nav.innerText || nav.getAttribute('aria-label') || '').trim().substring(0, 50);
      const href = nav.getAttribute('href') || '';
      const key = `nav:${text}:${href}`;
      if (seen.has(key) || !text) continue;
      seen.add(key);
      results.push({
        type: 'nav',
        href: href || null,
        text,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        selector: null,
      });
    }

    return results;
  });
}

// ── Wait for navigation or content change ──────────────────────

async function waitForChange(page, prevUrl, prevText, timeout = CLICK_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 300));
    const curUrl = page.url();
    if (curUrl !== prevUrl) return { changed: true, type: 'navigation', url: curUrl };
    // Check if content changed (e.g. modal opened, tab switched)
    const curText = await page.evaluate(() => (document.body?.innerText?.trim() || '').substring(0, 200)).catch(() => '');
    if (curText !== prevText && curText.length > 0) return { changed: true, type: 'content', url: curUrl };
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

          try { pageResult.screenshot = await page.screenshot({ type: 'png', encoding: 'base64' }); } catch {}
        } else if (pageResult.status === 404) {
          pageResult.errors.push(`[${pagePath}] 404 — page not found`); results.passed = false;
          try { pageResult.screenshot = await page.screenshot({ type: 'png', encoding: 'base64' }); } catch {}
        } else if (pageResult.status >= 500) {
          pageResult.errors.push(`[${pagePath}] Server error: ${pageResult.status}`); results.passed = false;
          try { pageResult.screenshot = await page.screenshot({ type: 'png', encoding: 'base64' }); } catch {}
        }
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
      const clickables = await getClickableElements(page).catch(() => []);
      console.error(`[Verify] Page ${testPage}: ${clickables.length} clickable elements`);

      for (const el of clickables) {
        if (clickCount >= MAX_CLICKS) break;
        const clickKey = `${el.type}:${el.text}:${el.href || ''}`;
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

        const prevUrl = page.url();
        const prevText = await page.evaluate(() => (document.body?.innerText?.trim() || '').substring(0, 200)).catch(() => '');
        jsErrors.length = 0;

        const clickResult = {
          element: { type: el.type, text: el.text, href: el.href },
          fromPage: testPage,
          result: 'unknown',
          toPage: null,
          error: null,
        };

        try {
          await page.mouse.click(el.x, el.y);
          clickCount++;

          const change = await waitForChange(page, prevUrl, prevText);

          if (change.changed) {
            const newPath = new URL(change.url).pathname;
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
            // Check if this button is in a group (profile selector, tabs, menu)
            if (el.type === 'button' || el.type === 'nav') {
              const isSuspicious = await page.evaluate((x, y) => {
                let target = document.elementFromPoint(x, y);
                if (!target) return false;
                const btn = target.closest('button, [role="button"]');
                if (!btn) return false;
                const parent = btn.parentElement;
                if (!parent) return false;
                const sibs = parent.querySelectorAll('button, [role="button"]').length;
                if (sibs >= 2) return true;
                const gp = parent.parentElement;
                return gp ? gp.querySelectorAll('button, [role="button"]').length >= 3 : false;
              }, el.x, el.y).catch(() => false);

              if (isSuspicious) {
                clickResult.error = `Button "${el.text}" in a group produced no change — broken click handler`;
                results.passed = false;
                results.errors.push(`[nav] Button "${el.text}" clicked but nothing happened — broken interaction`);
              }
            }
          }

          try { clickResult.screenshot = await page.screenshot({ type: 'png', encoding: 'base64' }); } catch {}
        } catch (err) {
          clickResult.result = 'error';
          clickResult.error = err.message;
        }

        clickResults.push(clickResult);
      }
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

  process.stdout.write(JSON.stringify(results));
})();
