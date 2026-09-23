// Dev helper: drive the real app in headless Chromium and take screenshots.
//   node tools/dev/app.mjs <outdir> <scenario.mjs> [width height]    (env: CHROMIUM=<path>, SCHEME=dark, TOUCH=1)
// A scenario module exports `async ({ page, shot }) => {...}`; window.__app exposes the app state.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('public');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'content-length': fs.statSync(f).size });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;
const [out = 'shots', scenario, w = 1400, h = 900] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: process.env.SCHEME || 'light', hasTouch: !!process.env.TOUCH, isMobile: !!process.env.TOUCH });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => window.__app, null, { timeout: 180000 });
console.log(`loaded in ${Date.now() - t0} ms`);
const shot = async (name) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('shot', name); };
const { default: run } = await import(path.resolve(scenario));
try { await run({ page, shot }); } catch (e) { console.log('scenario error:', e.message); }
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
server.close();
