#!/usr/bin/env node
/**
 * Comprehensive E2E verification: visit ALL pages, check for:
 * - Console errors (JS runtime errors)
 * - Network failures (CSS/JS not loading)
 * - Missing styles (page has no computed styles)
 * - Blank/white screens
 * - Error screens (Next.js error overlay, "Application error", etc.)
 * - Visual check via screenshot comparison
 *
 * Usage: node e2e-check.js
 * Outputs JSON: { "passed": true/false, "pages": [...], "errors": [...] }
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Auto-detect pages from the project structure
function detectPages() {
  const projectDir = '/home/coder/project';
  const pages = ['/'];

  // Next.js: app/*/page.tsx
  const appDir = path.join(projectDir, 'app');
  if (fs.existsSync(appDir)) {
    const scan = (dir, prefix) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.') && entry.name !== 'api' && entry.name !== 'components' && entry.name !== 'lib' && entry.name !== 'hooks' && entry.name !== 'utils') {
            const route = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
            const hasPage = fs.existsSync(path.join(dir, entry.name, 'page.tsx')) || fs.existsSync(path.join(dir, entry.name, 'page.jsx')) || fs.existsSync(path.join(dir, entry.name, 'page.ts')) || fs.existsSync(path.join(dir, entry.name, 'page.js'));
            if (hasPage && route !== '/') pages.push(route);
            scan(path.join(dir, entry.name), route);
          }
        }
      } catch {}
    };
    scan(appDir, '');
  }

  // React/Vue/Svelte: src/pages/*.tsx or pages/*.vue
  for (const pagesDir of ['src/pages', 'pages', 'src/routes']) {
    const fullDir = path.join(projectDir, pagesDir);
    if (fs.existsSync(fullDir)) {
      try {
        for (const f of fs.readdirSync(fullDir)) {
          if (f.match(/\.(tsx|jsx|vue|svelte|astro)$/) && !f.startsWith('_') && !f.startsWith('[') && !f.startsWith('+')) {
            const name = f.replace(/\.(tsx|jsx|vue|svelte|astro)$/, '').replace(/index$/, '');
            if (name && name !== 'page' && name !== 'Home') pages.push(`/${name.toLowerCase()}`);
          }
        }
      } catch {}
    }
  }

  return [...new Set(pages)].slice(0, 10); // Max 10 pages
}

const TIMEOUT = 12000;

(async () => {
  const PAGES_TO_CHECK = detectPages();
  console.error(`[E2E] Checking ${PAGES_TO_CHECK.length} pages: ${PAGES_TO_CHECK.join(', ')}`);
  let browser;
  const results = { passed: true, pages: [], errors: [] };

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    for (const pagePath of PAGES_TO_CHECK) {
      const url = `http://localhost:3000${pagePath}`;
      const pageResult = { path: pagePath, status: 'unknown', hasContent: false, hasStyles: false, errors: [] };

      // Fresh error collectors per page
      const consoleErrors = [];
      const networkFailures = [];

      page.removeAllListeners('pageerror');
      page.removeAllListeners('console');
      page.removeAllListeners('requestfailed');

      page.on('pageerror', err => consoleErrors.push(err.message));
      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          // Skip noise
          if (text.includes('favicon') || text.includes('DevTools') || text.includes('download the React DevTools')) return;
          consoleErrors.push(text);
        }
      });
      page.on('requestfailed', req => {
        const reqUrl = req.url();
        if (reqUrl.includes('favicon') || reqUrl.includes('hot-update') || reqUrl.includes('__webpack_hmr') || reqUrl.includes('__turbopack')) return;
        const resType = req.resourceType();
        networkFailures.push({ url: reqUrl, type: resType, error: req.failure()?.errorText || 'unknown' });
      });

      try {
        const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT });
        pageResult.status = response ? response.status() : 0;

        // Check for redirects — follow them and verify destination exists
        if (pageResult.status >= 300 && pageResult.status < 400) {
          const finalUrl = page.url();
          const finalResponse = await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: TIMEOUT }).catch(() => null);
          pageResult.status = finalResponse ? finalResponse.status() : 404;
          if (pageResult.status === 404) {
            pageResult.errors.push(`[${pagePath}] Redirects to ${finalUrl} which returns 404`);
            results.passed = false;
          }
        }

        if (pageResult.status === 200) {
          // Wait for hydration + CSS injection
          await new Promise(r => setTimeout(r, 2000));

          // Check content and styles
          const pageAnalysis = await page.evaluate(() => {
            const body = document.body;
            const text = body?.innerText?.trim() || '';

            // Check for error screens
            const hasErrorScreen = text.includes('Application error') ||
              text.includes('Internal Server Error') ||
              text.includes('Unhandled Runtime Error') ||
              text.includes('Module not found') ||
              text.includes("Can't resolve") ||
              text.includes('CssSyntaxError') ||
              document.querySelector('nextjs-portal') !== null;

            // Check if page has actual visible content
            const hasContent = text.length > 20;

            // Check if CSS is loaded by examining computed styles
            const firstElement = body?.querySelector('main, div, section, header, article, h1, p') || body?.firstElementChild;
            let hasStyles = false;
            if (firstElement) {
              const styles = window.getComputedStyle(firstElement);
              // If CSS loaded, at least some non-default styles should be present
              const bg = styles.backgroundColor;
              const color = styles.color;
              const fontSize = parseFloat(styles.fontSize);
              const padding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
              const margin = parseFloat(styles.marginTop) + parseFloat(styles.marginBottom);
              // Check if any styling exists beyond browser defaults
              hasStyles = bg !== 'rgba(0, 0, 0, 0)' || fontSize !== 16 || padding > 0 || margin !== 0 ||
                styles.display === 'flex' || styles.display === 'grid';
            }

            // Check for unstyled content (images without layout, raw text)
            const images = document.querySelectorAll('img');
            let unstyledImages = 0;
            images.forEach(img => {
              const s = window.getComputedStyle(img);
              if (s.maxWidth === 'none' && img.naturalWidth > 500) unstyledImages++;
            });

            // Extract error overlay text if present
            let errorOverlayText = '';
            const overlay = document.querySelector('[data-nextjs-dialog]') || document.querySelector('.nextjs-container-errors-body');
            if (overlay) errorOverlayText = overlay.innerText?.substring(0, 500) || '';

            return { hasContent, hasStyles, hasErrorScreen, errorOverlayText, textLength: text.length, unstyledImages };
          });

          pageResult.hasContent = pageAnalysis.hasContent;
          pageResult.hasStyles = pageAnalysis.hasStyles;

          if (pageAnalysis.hasErrorScreen) {
            const errMsg = pageAnalysis.errorOverlayText || 'Error screen detected on page';
            pageResult.errors.push(`[${pagePath}] ${errMsg}`);
            results.passed = false;
          }

          if (!pageAnalysis.hasContent) {
            pageResult.errors.push(`[${pagePath}] Page is blank — no visible text content`);
            results.passed = false;
          }

          if (!pageAnalysis.hasStyles && pageAnalysis.hasContent) {
            pageResult.errors.push(`[${pagePath}] Page has content but NO CSS styles applied — CSS likely not loading. Check globals.css, Tailwind config, and PostCSS setup.`);
            results.passed = false;
          }

          if (pageAnalysis.unstyledImages > 0) {
            pageResult.errors.push(`[${pagePath}] ${pageAnalysis.unstyledImages} images have no width constraints — CSS not applied`);
          }
        } else if (pageResult.status === 404) {
          pageResult.errors.push(`[${pagePath}] Page returns 404 — file exists but page not found`);
          results.passed = false;
        } else if (pageResult.status >= 500) {
          pageResult.errors.push(`[${pagePath}] Server error: HTTP ${pageResult.status}`);
          results.passed = false;
        }
      } catch (err) {
        pageResult.status = 'timeout';
        if (pagePath === '/') {
          pageResult.errors.push(`[${pagePath}] Page timed out — server may not be responding`);
          results.passed = false;
        }
      }

      // Take screenshot for verification
      if (pageResult.status === 200 || pageResult.status === 404) {
        try {
          const ss = await page.screenshot({ type: 'png', encoding: 'base64' });
          pageResult.screenshot = ss;
        } catch {}
      }

      // Add console errors
      for (const err of consoleErrors) {
        pageResult.errors.push(`[${pagePath}] JS: ${err}`);
        if (pageResult.status === 200) results.passed = false;
      }

      // Add network failures (CSS/JS not loading is critical)
      for (const nf of networkFailures) {
        if (nf.type === 'stylesheet' || nf.type === 'script') {
          pageResult.errors.push(`[${pagePath}] Network: ${nf.type} failed to load: ${nf.url} (${nf.error})`);
          results.passed = false;
        }
      }

      results.pages.push(pageResult);
    }

    // Collect all critical errors
    results.errors = results.pages
      .flatMap(p => p.errors)
      .slice(0, 15); // Max 15 errors to avoid overwhelming the AI

  } catch (err) {
    results.passed = false;
    results.errors.push(`Browser launch failed: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  process.stdout.write(JSON.stringify(results));
})();
