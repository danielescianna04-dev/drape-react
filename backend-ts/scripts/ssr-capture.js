#!/usr/bin/env node
/**
 * SSR Capture: renders all pages with Puppeteer, inlines all CSS,
 * and saves complete HTML files to /home/coder/project/.ssr/
 *
 * Usage: node ssr-capture.js
 * Output: JSON with captured pages info
 *
 * Each page is rendered, all computed styles are captured,
 * external stylesheets are inlined, and the result is a
 * self-contained HTML file that works without JS or CSS loading.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const SSR_DIR = '/home/coder/project/.ssr';
const BASE_URL = 'http://localhost:3000';

// Auto-detect pages from project structure
function detectPages() {
  const projectDir = '/home/coder/project';
  const pages = ['/'];

  const appDir = path.join(projectDir, 'app');
  if (fs.existsSync(appDir)) {
    const scan = (dir, prefix) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.') &&
              entry.name !== 'api' && entry.name !== 'components' && entry.name !== 'lib' &&
              entry.name !== 'hooks' && entry.name !== 'utils') {
            const route = entry.name.startsWith('(') ? prefix : `${prefix}/${entry.name}`;
            const hasPage = ['page.tsx', 'page.jsx', 'page.ts', 'page.js'].some(f =>
              fs.existsSync(path.join(dir, entry.name, f))
            );
            if (hasPage && route !== '/') pages.push(route);
            scan(path.join(dir, entry.name), route);
          }
        }
      } catch {}
    };
    scan(appDir, '');
  }

  // React/Vue: src/pages
  for (const pagesDir of ['src/pages', 'pages']) {
    const fullDir = path.join(projectDir, pagesDir);
    if (fs.existsSync(fullDir)) {
      try {
        for (const f of fs.readdirSync(fullDir)) {
          if (f.match(/\.(tsx|jsx|vue)$/) && !f.startsWith('_') && !f.startsWith('[')) {
            const name = f.replace(/\.(tsx|jsx|vue)$/, '').replace(/index$/, '');
            if (name && name !== 'page') pages.push(`/${name.toLowerCase()}`);
          }
        }
      } catch {}
    }
  }

  return [...new Set(pages)].slice(0, 15);
}

(async () => {
  const pages = detectPages();
  console.error(`[SSR] Capturing ${pages.length} pages: ${pages.join(', ')}`);

  // Create output directory
  fs.mkdirSync(SSR_DIR, { recursive: true });

  let browser;
  const results = { pages: [], errors: [] };

  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 430, height: 932 }); // iPhone 15 Pro Max

    for (const pagePath of pages) {
      const url = `${BASE_URL}${pagePath}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
        // Wait for hydration + rendering
        await new Promise(r => setTimeout(r, 2000));

        // Capture the fully rendered HTML with all styles inlined
        const capturedHtml = await page.evaluate(() => {
          // Collect all stylesheets (external + internal)
          let allCSS = '';

          // Get all loaded stylesheets
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                allCSS += rule.cssText + '\n';
              }
            } catch {
              // Cross-origin stylesheet — skip (CORS)
            }
          }

          // Get computed styles for key elements and create a style tag
          const html = document.documentElement.outerHTML;

          // Remove all <script> tags (not needed for static preview)
          const cleaned = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<link[^>]*rel="preload"[^>]*>/gi, '');

          // Build final HTML with inlined CSS
          const finalHtml = `<!DOCTYPE html>
<html${document.documentElement.getAttribute('lang') ? ` lang="${document.documentElement.getAttribute('lang')}"` : ''}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${document.title || 'Preview'}</title>
  <style>${allCSS}</style>
</head>
<body${document.body.className ? ` class="${document.body.className}"` : ''}${document.body.getAttribute('style') ? ` style="${document.body.getAttribute('style')}"` : ''}>
  ${document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '')}
</body>
</html>`;

          return {
            html: finalHtml,
            title: document.title,
            bodyText: document.body.innerText?.substring(0, 200) || '',
            cssLength: allCSS.length,
          };
        });

        // Save HTML file
        const fileName = pagePath === '/' ? 'index.html' : `${pagePath.replace(/^\//, '').replace(/\//g, '_')}.html`;
        const filePath = path.join(SSR_DIR, fileName);
        fs.writeFileSync(filePath, capturedHtml.html);

        results.pages.push({
          path: pagePath,
          file: fileName,
          size: capturedHtml.html.length,
          cssSize: capturedHtml.cssLength,
          hasContent: capturedHtml.bodyText.length > 20,
          title: capturedHtml.title,
        });

        console.error(`[SSR] Captured ${pagePath} → ${fileName} (${(capturedHtml.html.length / 1024).toFixed(1)}KB, CSS: ${(capturedHtml.cssLength / 1024).toFixed(1)}KB)`);

      } catch (err) {
        console.error(`[SSR] Failed to capture ${pagePath}: ${err.message}`);
        results.errors.push(`${pagePath}: ${err.message}`);
      }
    }

  } catch (err) {
    results.errors.push(`Browser error: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  // Write manifest
  fs.writeFileSync(path.join(SSR_DIR, 'manifest.json'), JSON.stringify(results, null, 2));

  // Output results
  process.stdout.write(JSON.stringify(results));
})();
