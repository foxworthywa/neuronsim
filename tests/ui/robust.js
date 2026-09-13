#!/usr/bin/env node
/*
 * Two guarantees that keep a lesson from freezing mid-scene:
 *
 *  1. No step callback throws. A step's status()/text() must survive being called in any state
 *     the runner can put it in — in particular "done" before the activity that produces the
 *     measurement it wants to report.
 *  2. Even if one did, the animation loop survives it. A throw inside a step callback used to
 *     skip requestAnimationFrame, which stopped the clock, the trace and every control until the
 *     page was reloaded.
 *
 * Usage: NODE_PATH=<global node_modules> node tests/ui/robust.js [page ...]
 */
'use strict';
const path = require('path'), { execSync } = require('child_process');
function loadPlaywright() { try { return require('playwright'); } catch (e) { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'playwright')); } }
const { chromium } = loadPlaywright();
const ROOT = path.resolve(__dirname, '..', '..');
const PAGES = process.argv.slice(2).filter(a => !a.startsWith('--'));

(async () => {
  const browser = await chromium.launch();
  const failures = [];
  for (const page_ of (PAGES.length ? PAGES : ['index.html', 'muscle.html'])) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto('file://' + ROOT + '/' + page_);
    await page.waitForFunction('!!window.__simapp');

    // 1. every step's status()/text(), in every state the runner can produce
    const crashes = await page.evaluate(() => {
      const H = window.__simapp, out = [];
      const scenes = H.lesson(), keep = { scene: H.runner().scene, step: H.runner().step, state: H.runner().state };
      const ctx = { sim: H.sim, app: H.app, profile: H.profile, view: () => H.app.view, complete() {}, status() {}, pause() {}, resume() {}, next() {}, mark() {}, stepState: () => H.runner().state, refresh() {} };
      for (let i = 0; i < scenes.length; i++) for (let k = 0; k < scenes[i].steps.length; k++) {
        const st = scenes[i].steps[k];
        for (const done of [false, true]) {
          H.runner().scene = i; H.runner().step = k;
          H.runner().state = { done, answered: true, attempts: 0, data: {} };
          for (const key of ['status', 'text']) {
            if (typeof st[key] !== 'function') continue;
            try { st[key](ctx); } catch (e) { out.push(`scene ${i + 1} (${scenes[i].id}) step ${k}: ${key}() threw with done=${done} and no measurements yet — ${e.message}`); }
          }
        }
      }
      H.runner().scene = keep.scene; H.runner().step = keep.step; H.runner().state = keep.state;
      return out;
    });
    crashes.forEach(c => failures.push(`${page_}: ${c}`));

    // 2. a throwing callback must not stop the loop
    await page.evaluate(() => { window.__simapp.gotoStep(0, 0); });
    const survived = await page.evaluate(async () => {
      const H = window.__simapp;
      const step = H.lesson()[H.runner().scene].steps[H.runner().step];
      const saved = step.tick;
      step.tick = () => { throw new Error('deliberate test failure'); };
      H.app.paused = false;
      const t0 = H.sim.t;
      await new Promise(r => setTimeout(r, 400));
      const stillRunning = H.sim.t > t0;
      step.tick = saved;
      const t1 = H.sim.t;
      await new Promise(r => setTimeout(r, 300));
      return { stillRunning, recovered: H.sim.t > t1 };
    });
    if (!survived.stillRunning) failures.push(`${page_}: a throwing step.tick stopped the simulation clock`);
    if (!survived.recovered) failures.push(`${page_}: the loop did not resume after the throwing callback was removed`);
    await page.close();
    console.log(`${page_}: ${crashes.length} callback crash(es), loop survives a throwing callback: ${survived.stillRunning && survived.recovered}`);
  }
  await browser.close();
  if (failures.length) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log('robustness OK');
})().catch(e => { console.error(e); process.exit(1); });
