// Jump straight into every step of KidneySim, in reverse order, on a fresh page.
/*
 * A student can reach any scene with the numbered circles, and any step with Back, without having
 * done the steps before it. So every step must build what it needs for itself: no step may throw,
 * stop the animation loop, or show an empty picture because an earlier step was skipped. This
 * visits every step from last to first, calls each step's text() and status() with the step
 * marked done and not done, lets a second of animation run, then steps Back once.
 *   node tests/ui/kidney-jump.js [page]     page defaults to dist/kidney.html
 * Exits non-zero on any page error.
 */
'use strict';
const path = require('path'), { execSync } = require('child_process');
function loadPlaywright() { try { return require('playwright'); } catch (e) { return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } }
const { chromium } = loadPlaywright();
const arg = process.argv[2] || null;
const URL = (arg ? 'file://' + path.resolve(arg) : 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'kidney.html')) + '?fresh=1';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(600);
  const shape = await page.evaluate(() => window.__kidneysim.lesson().map(s => s.steps.length));
  let visited = 0, empty = [];
  for (let si = shape.length - 1; si >= 0; si--) for (let ki = shape[si] - 1; ki >= 0; ki--) {
    const before = errors.length;
    const r = await page.evaluate(([si, ki]) => {
      const H = window.__kidneysim; H.goto(si, ki);
      const st = H.runner().currentStep(), c = H.runner().ctx, state = H.runner().runner.state, out = [];
      for (const done of [true, false]) {
        const keep = state.done; state.done = done;
        for (const key of ['text', 'status']) if (typeof st[key] === 'function') { try { st[key](c); } catch (e) { out.push(`${key}() threw with done=${done}: ${e.message}`); } }
        state.done = keep;
      }
      return out;
    }, [si, ki]);
    await page.waitForTimeout(350);
    const drawn = await page.evaluate(() => { const s = document.querySelector('#stage'); return s.children.length > 0 && document.querySelector('#panel h2') != null; });
    if (!drawn) empty.push(`${si + 1}.${ki}`);
    for (const m of r) errors.push(`${si + 1}.${ki} ${m}`);
    await page.click('.nav button:first-child').catch(() => {});
    await page.waitForTimeout(120);
    if (errors.length > before) console.log(`XX ${si + 1}.${ki}: ${errors.slice(before).join(' | ')}`);
    visited++;
  }
  const alive = await page.evaluate(() => new Promise(res => { const t0 = window.__kidneysim.app.lastFrame; setTimeout(() => res(window.__kidneysim.app.lastFrame !== t0), 300); }));
  await browser.close();
  console.log(`${visited} steps entered directly; page errors: ${errors.length}; empty pictures: ${empty.join(', ') || 'none'}; animation loop alive: ${alive}`);
  const failed = errors.length + empty.length + (alive ? 0 : 1);
  console.log(failed ? 'kidney jump test FAILED' : 'kidney jump test OK');
  process.exit(failed ? 1 : 0);
})();
