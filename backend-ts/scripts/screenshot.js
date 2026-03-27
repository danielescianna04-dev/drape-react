#!/usr/bin/env node
/**
 * Take a screenshot of http://localhost:3000 using Puppeteer.
 * Usage: node screenshot.js [output.png]
 * Outputs base64 to stdout if no output path given.
 */
const puppeteer = require('puppeteer-core');

(async () => {
  const outputPath = process.argv[2] || null;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      timeout: 15000,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 20000 });
    // Wait a bit for client-side hydration
    await new Promise(r => setTimeout(r, 2000));

    const screenshot = await page.screenshot({ type: 'png', encoding: outputPath ? undefined : 'base64' });

    if (outputPath) {
      require('fs').writeFileSync(outputPath, screenshot);
      console.log(outputPath);
    } else {
      process.stdout.write(screenshot);
    }

    // Also collect console errors
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    if (errors.length > 0) {
      process.stderr.write(JSON.stringify({ errors }));
    }
  } catch (err) {
    process.stderr.write(JSON.stringify({ error: err.message }));
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
