'use strict';
/**
 * Dynamic Open Graph / Slack preview image generator for Hotline Viseo: After Hours.
 *
 * Runs during deployment CI (or locally) to capture a fresh 1200x630 screenshot
 * of the title screen and write it to assets/images/og-preview.png.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const targetFile = path.join(root, 'assets', 'images', 'og-preview.png');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf'
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/') pathname = '/index.html';
        const file = path.resolve(root, pathname.replace(/^\//, ''));
        if (!file.startsWith(root)) {
          res.writeHead(403);
          return res.end('Forbidden');
        }
        const stat = await fs.promises.stat(file);
        if (!stat.isFile()) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, {
          'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
          'Content-Length': stat.size
        });
        fs.createReadStream(file).pipe(res);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
    server.on('error', reject);
  });
}

async function capture() {
  console.log('[Preview] Initializing Open Graph preview generator...');

  let chromium;
  try {
    const playwright = require('playwright');
    chromium = playwright.chromium;
  } catch {
    console.warn('[Preview] Playwright not found in environment. Keeping existing fallback preview image at:', targetFile);
    return;
  }

  const { server, port } = await startServer();
  const url = `http://127.0.0.1:${port}/`;
  console.log(`[Preview] Ephemeral server running at ${url}`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1
    });

    console.log('[Preview] Loading game page...');
    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for fonts and canvas initialization
    await page.evaluate(() => document.fonts?.ready);
    await page.waitForTimeout(1500);

    // Ensure assets/images directory exists
    const dir = path.dirname(targetFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await page.screenshot({
      path: targetFile,
      type: 'png'
    });

    const stat = fs.statSync(targetFile);
    console.log(`[Preview] Successfully generated ${targetFile} (${stat.size} bytes, 1200x630).`);
  } catch (err) {
    console.warn('[Preview] Failed to generate dynamic screenshot, keeping existing image:', err.message);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
}

capture().catch(err => {
  console.error('[Preview] Unhandled error:', err);
  process.exitCode = 0; // Never break CI deployment
});
