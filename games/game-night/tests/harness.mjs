// Test harness: static server + CDN interception (the sandbox cannot reach the CDNs) + local PeerJS broker.
// Usage: GN_VENDOR=/path/to/dir-with-node_modules node tests/xxx.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');
export const VENDOR = process.env.GN_VENDOR || '/tmp/claude-0/-home-user-sonnet-games/2da07e77-4e51-589b-8a5d-b13a1d8faf75/scratchpad/vendor';
export const SHOTS = process.env.GN_SHOTS || path.join(ROOT, 'screenshots');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };

export function startStatic(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve({ srv, port: srv.address().port, url: `http://127.0.0.1:${srv.address().port}/` }));
  });
}

export async function startPeerServer(port = 9000) {
  const { PeerServer } = await import(pathToFileURL(path.join(VENDOR, 'node_modules/peer/dist/module.mjs')).href).catch(async () => await import(pathToFileURL(path.join(VENDOR, 'node_modules/peer/dist/bin/peerjs.js')).href));
  const server = PeerServer({ port, path: '/gn', host: '127.0.0.1', allow_discovery: true });
  return { port, path: '/gn', close: () => server.close?.() };
}

export async function launch({ headless = true } = {}) {
  const { chromium } = await import(pathToFileURL(path.join(VENDOR, 'node_modules/playwright/index.mjs')).href);
  return chromium.launch({
    headless,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  });
}

const CDN = [
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.170\.0\/(.*)$/, (m) => path.join(VENDOR, 'node_modules/three', m[1])],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/@dimforge\/rapier3d-compat@0\.14\.0\/(.*)$/, (m) => path.join(VENDOR, 'node_modules/@dimforge/rapier3d-compat', m[1])],
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/peerjs@1\.5\.4\/(.*)$/, (m) => path.join(VENDOR, 'node_modules/peerjs', m[1])],
  [/^https:\/\/unpkg\.com\/peerjs@1\.5\.4\/(.*)$/, (m) => path.join(VENDOR, 'node_modules/peerjs', m[1])],
];

export async function newPage(browser, { width = 1280, height = 720, dpr = 1, touch = false, errors = [], logs = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: touch, isMobile: touch });
  await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, (route) => {
    const url = route.request().url();
    for (const [re, fn] of CDN) {
      const m = url.match(re);
      if (m) {
        const f = fn(m);
        if (fs.existsSync(f)) return route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': MIME[path.extname(f)] || 'text/javascript', 'access-control-allow-origin': '*' } });
      }
    }
    return route.fulfill({ status: 404, body: 'not mapped: ' + url });
  });
  // fonts etc are blocked by the sandbox; answer instantly so they never stall page load
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '', headers: { 'content-type': 'text/css' } }));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + (e.stack ? '\n' + e.stack.split('\n').slice(0, 4).join('\n') : '')));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console.error: ' + m.text());
    else if (logs) console.log('[page]', m.type(), m.text());
  });
  page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) errors.push('requestfailed: ' + r.url()); });
  return { page, ctx, errors };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function report(errors, label = '') {
  if (errors.length) { console.log(`✗ ${label} console errors (${errors.length}):`); errors.slice(0, 12).forEach((e) => console.log('   ', e)); }
  else console.log(`✓ ${label} no console errors`);
  return errors.length === 0;
}
