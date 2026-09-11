#!/usr/bin/env node
/*
 * UI smoke test: opens a lesson page in headless Chromium, walks every scene and step of the
 * lesson (plus the free-play lab and each of its views), advances the simulation at each step,
 * fails on any console error or uncaught page error, and saves one screenshot per scene.
 * It also drives one full action potential in the "Building the action potential" scene
 * through the panel button, checking that the timed current pulse and the auto-pause work.
 *
 * Usage:
 *   node tests/ui/smoke.js [page ...] [--out=DIR] [--compare=DIR] [--dwell=MS] [--serve]
 *
 *   page       one or more HTML pages relative to the repo root (default: index.html dist/index.html)
 *   --out      directory for screenshots (default: $SMOKE_OUT or <os tmpdir>/neuronsim-ui)
 *   --compare  directory holding earlier screenshots with the same names; each new screenshot is
 *              pixel-compared against it and a *.diff.png is written next to the new one
 *   --dwell    simulated wall-clock milliseconds to run at every step (default 1000)
 *   --serve    serve the repo root over HTTP (http-server) instead of opening file:// URLs
 *
 * Needs Playwright (npm i -g playwright, or NODE_PATH=<global node_modules>); the script also
 * looks in `npm root -g` when a plain require fails. Never runs `playwright install`.
 *
 * The page must expose a debug handle: window.__simapp (set by SimApp.init) or window.__neuronsim.
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), { execSync, spawn } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  try {
    const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return require(path.join(g, 'playwright'));
  } catch (e) {
    console.error('playwright not found; install it globally or set NODE_PATH to a node_modules that has it');
    process.exit(2);
  }
}

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = { out: process.env.SMOKE_OUT || path.join(os.tmpdir(), 'neuronsim-ui'), compare: null, dwell: 1000, serve: false };
const pages = [];
for (const a of args) {
  if (a.startsWith('--out=')) opt.out = path.resolve(a.slice(6));
  else if (a.startsWith('--compare=')) opt.compare = path.resolve(a.slice(10));
  else if (a.startsWith('--dwell=')) opt.dwell = parseInt(a.slice(8), 10);
  else if (a === '--serve') opt.serve = true;
  else pages.push(a);
}
if (!pages.length) pages.push('index.html', 'dist/index.html');
fs.mkdirSync(opt.out, { recursive: true });

const HANDLE = '(window.__simapp || window.__neuronsim || window.__musclesim)';

async function startServer() {
  const port = 8123 + Math.floor(Math.random() * 1000);
  const proc = spawn('http-server', [ROOT, '-p', String(port), '-s', '-c-1'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  return { proc, base: `http://127.0.0.1:${port}/` };
}

async function comparePng(browser, aPath, bPath, diffPath) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const a = 'data:image/png;base64,' + fs.readFileSync(aPath).toString('base64');
  const b = 'data:image/png;base64,' + fs.readFileSync(bPath).toString('base64');
  const res = await page.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const cv = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = cv(ia), db = cv(ib);
    const out = document.createElement('canvas'); out.width = w; out.height = h; const ox = out.getContext('2d');
    const od = ox.createImageData(w, h);
    let diff = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      if (d > 24) { diff++; od.data[i] = 255; od.data[i + 1] = 0; od.data[i + 2] = 0; od.data[i + 3] = 255; }
      else { const g = Math.round((da[i] + da[i + 1] + da[i + 2]) / 3); od.data[i] = od.data[i + 1] = od.data[i + 2] = 255 - Math.round((255 - g) * 0.25); od.data[i + 3] = 255; }
    }
    ox.putImageData(od, 0, 0);
    return { total: w * h, diff, sizeMismatch: ia.width !== ib.width || ia.height !== ib.height, png: out.toDataURL('image/png') };
  }, [a, b]);
  fs.writeFileSync(diffPath, Buffer.from(res.png.split(',')[1], 'base64'));
  await ctx.close();
  return res;
}

async function runPage(browser, url, prefix) {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Deterministic randomness and a controllable clock, so screenshots are reproducible.
  await page.addInitScript(() => {
    let s = 123456789;
    Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x80000000; };
  });
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.goto(url, { waitUntil: 'load' });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.waitForFunction(`typeof ${HANDLE} !== 'undefined' && ${HANDLE} != null`);
  const H = `(${HANDLE})`;
  const run = async (ms) => { await page.clock.runFor(ms); };
  const settle = async () => { await page.waitForTimeout(1500); }; // real time: CSS transitions / Web Animations finish
  const shots = [];
  const shoot = async (name) => { const p = path.join(opt.out, `${prefix}-${name}.png`); await page.screenshot({ path: p }); shots.push(p); return p; };
  const fail = (what) => { if (errors.length) throw new Error(`${what}\n  ${errors.join('\n  ')}`); };

  const lesson = await page.evaluate(`${H}.lesson().map(s => ({ id: s.id, title: s.title, n: s.steps.length }))`);
  console.log(`  ${lesson.length} scenes, ${lesson.reduce((a, s) => a + s.n, 0)} steps`);
  for (let i = 0; i < lesson.length; i++) {
    const sc = lesson[i];
    for (let k = 0; k < sc.n; k++) {
      await page.evaluate(`${H}.gotoStep(${i}, ${k})`);
      await run(opt.dwell);
      fail(`errors at scene ${i + 1} (${sc.id}) step ${k + 1}`);
      const st = await page.evaluate(`(() => { const h = ${H}; return { scene: h.runner().scene, step: h.runner().step, t: h.sim.t, paused: h.app.paused }; })()`);
      if (st.scene !== i || st.step !== k) throw new Error(`gotoStep(${i},${k}) landed on ${st.scene},${st.step}`);
      if (k === 0) { await settle(); await shoot(`${String(i + 1).padStart(2, '0')}-${sc.id}`); }
    }
    console.log(`  scene ${i + 1} (${sc.id}): ${sc.n} steps ok`);
  }

  // Drive an action potential in the "build the AP" scene through the panel button.
  const apIdx = lesson.findIndex(s => s.id === 'ap');
  if (apIdx >= 0) {
    await page.evaluate(`${H}.gotoStep(${apIdx}, 0)`);
    await run(200);
    const btn = page.locator('#panel .actions button').first();
    await btn.click();
    await run(50);
    const stimOn = await page.evaluate(`Object.keys(${H}.sim.stim).length`);
    if (!stimOn) throw new Error('trigger button did not start a current pulse');
    let paused = false, tries = 0;
    while (!paused && tries++ < 40) { await run(250); paused = await page.evaluate(`${H}.app.paused`); }
    const s1 = await page.evaluate(`(() => { const h = ${H}; const p = h.lesson()[${apIdx}]; const c = h.sim.byName[h.app.recordComp]; return { paused: h.app.paused, done: h.runner().state.done, V: c ? c.V : null, stim: Object.keys(h.sim.stim).length, t: h.sim.t }; })()`);
    if (!s1.paused || !s1.done) throw new Error(`AP scene did not auto-pause mid-rise: ${JSON.stringify(s1)}`);
    if (!(s1.V > -30)) throw new Error(`AP scene paused but Vm not in the rising phase: ${JSON.stringify(s1)}`);
    await settle(); await shoot(`${String(apIdx + 1).padStart(2, '0')}-ap-rising`);
    // Continue → (paused question step: answer it) → Continue → runs to the peak and pauses again.
    const answer = async () => {
      const idx = await page.evaluate(`(() => { const h = ${H}; const st = h.lesson()[h.runner().scene].steps[h.runner().step]; return st.question ? st.question.options.findIndex(o => o.ok) : -1; })()`);
      if (idx >= 0) await page.locator('#panel .question .options button').nth(idx).click();
    };
    const state = async () => page.evaluate(`(() => { const h = ${H}; const c = h.sim.byName[h.app.recordComp]; return { paused: h.app.paused, step: h.runner().step, V: c ? c.V : null, stim: Object.keys(h.sim.stim).length, t: h.sim.t, rest: h.profile ? h.profile.rest : -70 }; })()`);
    const untilPaused = async () => { let p = false, n = 0; while (!p && n++ < 40) { await run(250); p = await page.evaluate(`${H}.app.paused`); } return p; };
    await page.locator('#btn-continue').click(); await run(100);
    await answer();
    await page.locator('#btn-continue').click(); await run(100);
    if (await page.evaluate(`${H}.app.paused`)) throw new Error('Continue did not resume the simulation');
    await untilPaused();
    const s2 = await state();
    if (!s2.paused || s2.step !== 2) throw new Error(`AP scene did not pause at the peak: ${JSON.stringify(s2)}`);
    if (!(s2.V > 10)) throw new Error(`AP scene paused at the peak with an odd Vm: ${JSON.stringify(s2)}`);
    // → step 3 (question) → step 4 (question) → step 5 runs to the undershoot and pauses.
    await page.locator('#btn-continue').click(); await run(100); await answer();
    await page.locator('#btn-continue').click(); await run(100); await answer();
    await page.locator('#btn-continue').click(); await run(100);
    await untilPaused();
    const s3 = await state();
    if (!s3.paused || s3.step !== 5) throw new Error(`AP scene did not pause at the undershoot: ${JSON.stringify(s3)}`);
    if (!(s3.V < s3.rest - 5)) throw new Error(`undershoot pause with Vm not below rest: ${JSON.stringify(s3)}`);
    if (s3.stim !== 0) throw new Error(`current pulse did not stop by itself: ${JSON.stringify(s3)}`);
    fail('errors during the action-potential run');
    console.log(`  action potential: paused mid-rise at ${s1.V.toFixed(1)} mV (t=${s1.t.toFixed(1)}), at the peak ${s2.V.toFixed(1)} mV (t=${s2.t.toFixed(1)}), at the undershoot ${s3.V.toFixed(1)} mV (t=${s3.t.toFixed(1)}); pulse auto-stopped`);
  }

  // Lab: enter, screenshot, then mount every view offered by the lab's first select.
  await page.evaluate(`${H}.enterLab()`);
  await run(opt.dwell);
  fail('errors entering the lab');
  await settle(); await shoot('lab');
  const labViews = await page.evaluate(`Array.from(document.querySelectorAll('#panel .lab select')[0].options).map(o => o.value)`);
  for (const v of labViews) {
    await page.evaluate(`(() => { const s = document.querySelectorAll('#panel .lab select')[0]; s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change')); })()`);
    await run(600);
    fail(`errors in lab view ${v}`);
  }
  console.log(`  lab: ${labViews.length} views ok (${labViews.join(', ')})`);

  await ctx.close();
  return shots;
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  let server = null;
  if (opt.serve) server = await startServer();
  let failed = false;
  try {
    for (const pg of pages) {
      const file = path.resolve(ROOT, pg);
      if (!fs.existsSync(file)) { console.log(`skip ${pg}: not found`); continue; }
      const url = server ? server.base + pg : 'file://' + file;
      const base = path.basename(pg, '.html');
      const prefix = (pg.startsWith('dist/') ? 'dist-' : '') + (base === 'index' ? 'neuron' : base);
      console.log(`${pg} (${url})`);
      try {
        const shots = await runPage(browser, url, prefix);
        console.log(`  ${shots.length} screenshots in ${opt.out}`);
        if (opt.compare) {
          for (const p of shots) {
            const q = path.join(opt.compare, path.basename(p));
            if (!fs.existsSync(q)) { console.log(`  compare: no baseline for ${path.basename(p)}`); continue; }
            const r = await comparePng(browser, q, p, p.replace(/\.png$/, '.diff.png'));
            console.log(`  compare ${path.basename(p)}: ${(100 * r.diff / r.total).toFixed(3)}% pixels differ${r.sizeMismatch ? ' (size mismatch)' : ''}`);
          }
        }
      } catch (e) { failed = true; console.error(`  FAIL ${pg}: ${e.message}`); }
    }
  } finally {
    await browser.close();
    if (server) server.proc.kill();
  }
  process.exit(failed ? 1 : 0);
})();
