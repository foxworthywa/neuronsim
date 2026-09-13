#!/usr/bin/env node
/*
 * Live walkthrough of the muscle lesson: performs each scene's activity through the panel
 * buttons (shocks, commands, pairs, trains) and checks that the step's completion condition
 * ("Done when" in docs/MUSCLE_MODULE.md) actually becomes true with the real model, then runs
 * a few lab scenario cards. Fails on any console/page error.
 *
 * Usage: NODE_PATH=<global node_modules> node tests/ui/muscle-walk.js [page] [--serve]
 */
'use strict';
const path = require('path'), { execSync, spawn } = require('child_process');
function loadPlaywright() { try { return require('playwright'); } catch (e) { const g = execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'playwright')); } }
const { chromium } = loadPlaywright();
const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const page_ = args.find(a => !a.startsWith('--')) || 'muscle.html';
const serve = args.includes('--serve');
const H = 'window.__simapp';

(async () => {
  let server = null, base = 'file://' + ROOT + '/';
  if (serve) {
    const port = 8600 + Math.floor(Math.random() * 300);
    server = spawn('http-server', [ROOT, '-p', String(port), '-s', '-c-1'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 800));
    base = `http://127.0.0.1:${port}/`;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(base + page_);
  await page.waitForFunction(`!!${H}`);
  const failures = [];
  const ev = (js) => page.evaluate(js);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const setSpeed = (s) => ev(`(() => { const h = ${H}; h.app.userSpeed = ${s}; h.kit.setSpeed(${s}); })()`);
  const goto = async (scene, step, speed) => { await ev(`${H}.gotoStep(${scene}, ${step})`); await sleep(150); if (speed) await setSpeed(speed); };
  const done = () => ev(`${H}.runner().state.done`);
  const paused = () => ev(`${H}.app.paused`);
  const resume = () => ev(`${H}.kit.setPaused(false)`);
  const click = async (label) => { const b = page.locator('#panel button', { hasText: label }).first(); await b.click(); };
  const answerRight = async () => { const idx = await ev(`(() => { const h = ${H}; const st = h.lesson()[h.runner().scene].steps[h.runner().step]; return st.question ? st.question.options.findIndex(o => o.ok) : -1; })()`); if (idx >= 0) await page.locator('#panel .question .options button').nth(idx).click(); };
  const waitDone = async (ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await done()) return true; await sleep(100); } failures.push(`not done: ${what} (${await ev(`JSON.stringify({ t: ${H}.sim.t, V: ${H}.sim.byName.R3.V, F: ${H}.sim.force, paused: ${H}.app.paused, status: document.querySelector('#panel .status') && document.querySelector('#panel .status').textContent })`)})`); return false; };
  const check = (cond, what) => { if (!cond) failures.push(what); };
  const sceneIdx = async (id) => ev(`${H}.lesson().findIndex(s => s.id === '${id}')`);

  // ---- scene 5: threshold
  let s = await sceneIdx('threshold');
  await goto(s, 0, 0.01); await answerRight(); await click('Shock 20'); await waitDone(8000, 'scene 5 step 0 (small shock rises and falls back)');
  await goto(s, 1, 0.003); await answerRight();
  for (const p of ['20', '40', '60', '80', '100', '120']) { if (await done()) break; await click(`${p} %`); await sleep(2500); }
  await waitDone(3000, 'scene 5 step 1 (pause at threshold)');
  check(await paused(), 'scene 5 step 1 should be paused at threshold');
  check(await ev(`${H}.sim.byName.R3.V > -66 && ${H}.sim.byName.R3.V < -35`), 'scene 5 pause voltage near threshold: ' + await ev(`${H}.sim.byName.R3.V`));
  await goto(s, 3, 0.003); await answerRight(); await click('100 %'); await sleep(4000); await click('200 %'); await waitDone(6000, 'scene 5 step 3 (all-or-none pair)');

  // ---- scene 6: refractory extra step (last step of the ap scene)
  s = await sceneIdx('ap');
  const apSteps = await ev(`${H}.lesson()[${s}].steps.length`);
  await goto(s, apSteps - 1, 0.003); await answerRight(); await sleep(4000); await click('Shock twice'); await waitDone(8000, 'scene 6 refractory pair (second shock fails)');

  // ---- scene 7: spread
  s = await sceneIdx('spread');
  await goto(s, 0, 0.003); await answerRight(); await click('Shock the middle'); await waitDone(8000, 'scene 7 step 0 (both ends spike)');
  await goto(s, 3, 0.003); await answerRight(); await sleep(3000); await click('Shock the middle'); await waitDone(8000, 'scene 7 step 3 (all tubules active)');

  // ---- scene 8: triad
  s = await sceneIdx('triad');
  await goto(s, 0, 0.1); await answerRight(); await click('Shock'); await waitDone(8000, 'scene 8 step 0 (Ca peak and fall)');
  await goto(s, 1, 0.1); await answerRight(); await click('Shock (Ca'); await waitDone(8000, 'scene 8 step 1 (Ca-free twitch)');
  check(await ev(`${H}.sim.conc.Ca.out === 0`), 'scene 8 step 1 bath is Ca-free');

  // ---- scene 9, 10
  s = await sceneIdx('sarcomere');
  await goto(s, 0, 0.1); await answerRight(); await click('Shock'); await waitDone(8000, 'scene 9 step 0 (twitch peak)');
  s = await sceneIdx('relax');
  await goto(s, 0, 0.1); await answerRight(); await click('Shock'); await waitDone(10000, 'scene 10 step 0 (relaxed)');
  await goto(s, 1, 0.1); await answerRight(); await click('Shock (no ATP)'); await waitDone(10000, 'scene 10 step 1 (rigor)');
  check(await ev(`${H}.sim.force > 0.5`), 'rigor force stays up');

  // ---- scene 11, 12
  s = await sceneIdx('twitch');
  await goto(s, 0, 0.15); await answerRight(); await click('Shock once'); await waitDone(12000, 'scene 11 step 0 (clean twitch sequence)');
  s = await sceneIdx('tetanus');
  await goto(s, 1, 0.15); await answerRight(); await click('Shock once'); await sleep(2500); await click('Shock twice'); await waitDone(12000, 'scene 12 step 1 (summation)');
  await goto(s, 2, 0.15); await answerRight();
  await page.locator('#panel [data-role=rate]').fill('50');
  await click('Train at this rate'); await waitDone(15000, 'scene 12 step 2 (fused tetanus)');

  // ---- scene 13: junction
  s = await sceneIdx('nmj');
  await goto(s, 0, 0.003); await answerRight(); await click('Send command'); await waitDone(8000, 'scene 13 step 0 (pause at Ca entry)');
  check(await paused(), 'scene 13 step 0 paused');
  await goto(s, 1, 0.01); await sleep(1500); await click('Send command'); await waitDone(8000, 'scene 13 step 1 (pause at ACh bound)');
  await goto(s, 3, 0.01); await sleep(2000); await click('Send command'); await waitDone(8000, 'scene 13 step 3 (EPP alone)');
  check(await ev(`${H}.sim.naBlock === 1`), 'EPP-alone step has Na blocked');
  const epp = await ev(`(() => { const st = document.querySelector('#panel .status'); return st ? st.textContent : ''; })()`);
  await goto(s, 4, 0.1); await answerRight(); check(await ev(`${H}.sim.naBlock === 0`), 'Na channels restored after EPP step'); await sleep(2000); await click('Send command'); await waitDone(8000, 'scene 13 step 4 (command → twitch)');
  await goto(s, 6, 0.1); await answerRight(); await sleep(2500); await click('Control'); await sleep(3500); await click('Send command (half'); await waitDone(10000, 'scene 13 step 6 (half block full twitch)');

  // ---- lab scenario cards
  await ev(`${H}.enterLab()`); await sleep(300); await setSpeed(0.2);
  const cards = await page.locator('#panel .card').count();
  check(cards >= 13, `lab has ${cards} scenario cards`);
  for (const title of ['Botulinum toxin', 'Rocuronium', 'Malignant hyperthermia', 'Which Ca']) {
    const card = page.locator('#panel .card', { hasText: title }).first();
    await card.locator('.card-head').click();
    const idx = await card.locator('.question').first().evaluate((q) => Array.from(q.querySelectorAll('.options button')).findIndex(b => b.textContent.length > 0));
    // answer: click options until the "Right." feedback appears
    const opts = card.locator('.question').first().locator('.options button');
    const n = await opts.count();
    for (let i = 0; i < n; i++) { await opts.nth(i).click(); if ((await card.locator('.question').first().locator('.feedback').textContent()).startsWith('Right')) break; }
    void idx;
    await card.locator('.actions button').first().click();
    await sleep(2500);
    check((await card.locator('.feedback.good').last().isVisible()), `${title}: explanation shown after Run`);
  }
  check(errors.length === 0, 'page errors: ' + errors.join(' | '));

  await browser.close(); if (server) server.kill();
  if (failures.length) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
  console.log(`muscle walkthrough OK (${epp.trim().slice(0, 90)})`);
})().catch(e => { console.error(e); process.exit(1); });
