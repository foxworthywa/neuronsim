// Walk through every step of ImmuneSim in Chromium: answer, do the activity, wait for Continue.
/*
 * Answers each question (a wrong answer first on every other step, to exercise the feedback),
 * does each step's activity, fast-forwards each experiment to its end, waits for Continue, and
 * checks the completion code at the end.
 *   node tests/ui/immune-walk.js [page] [seed]     page defaults to dist/immune.html
 * Needs Playwright (npm i -g playwright, or NODE_PATH=<global node_modules>); also looks in
 * `npm root -g`. Never runs `playwright install`. Exits non-zero on any failed step or page error.
 */
'use strict';
const path = require('path'), { execSync } = require('child_process');
function loadPlaywright() {
  try { return require('playwright'); } catch (e) { /* fall through */ }
  try { return require(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); }
  catch (e) { console.error('playwright not found; install it globally or set NODE_PATH'); process.exit(2); }
}
const { chromium } = loadPlaywright();
const SHOTS = require('os').tmpdir() + '/immunesim-walk-';
const arg = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : null;
const seed = process.argv.slice(2).find(a => /^\d+$/.test(a)) || '7';
const URL = (arg ? (arg.includes('://') ? arg : 'file://' + path.resolve(arg)) : 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'immune.html')) + '?seed=' + seed;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' / ')); });
  await page.goto(URL);
  await page.waitForTimeout(800);
  const S = () => window.__immunesim;
  void S;
  const lesson = await page.evaluate(() => window.__immunesim.lesson().map(s => ({ id: s.id, steps: s.steps.map(st => ({ title: st.title || s.title, q: !!st.question, num: !!(st.question && st.question.type === 'number'), acts: (st.actions || []).length })) })));
  const continueEnabled = () => page.evaluate(() => { const b = document.querySelector('#btn-continue'); return b && !b.disabled; });
  const waitContinue = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await continueEnabled()) return true; await page.waitForTimeout(100); } return false; };
  // Let any running experiment finish (possibly one that starts another when it ends).
  const finishRuns = async () => { for (let i = 0; i < 12; i++) { const running = await page.evaluate(() => { const a = window.__immunesim.app; if (a.run) { window.__immunesim.finishRun(); return true; } return false; }); if (!running) break; await page.waitForTimeout(120); } };
  const answer = async (ki) => {
    const texts = await page.evaluate(() => { const q = window.__immunesim.runner().currentStep().question; const strip = (t) => t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); const w = q.options.find(o => !o.ok); return { ok: strip(q.options.find(o => o.ok).t), wrong: w ? strip(w.t) : null }; });
    const clickText = async (t) => { const btns = page.locator('.question .options button'); const n = await btns.count(); for (let i = 0; i < n; i++) { const b = btns.nth(i); if ((await b.textContent()).replace(/\s+/g, ' ').trim() === t) { if (!(await b.isDisabled())) await b.click(); return; } } throw new Error('option not found: ' + t); };
    if (texts.wrong && ki % 2 === 0) await clickText(texts.wrong);
    await clickText(texts.ok);
    await page.waitForTimeout(80);
  };
  const report = [];
  for (let si = 0; si < lesson.length; si++) {
    for (let ki = 0; ki < lesson[si].steps.length; ki++) {
      const st = lesson[si].steps[ki], id = lesson[si].id;
      const at = await page.evaluate(() => { const r = window.__immunesim.runner().runner; return [r.scene, r.step]; });
      if (at[0] !== si || at[1] !== ki) { report.push(`!! expected ${si}.${ki} but at ${at}`); await page.evaluate(([a, b]) => window.__immunesim.goto(a, b), [si, ki]); await page.waitForTimeout(200); }
      // multiple-choice questions first (a prediction unlocks the experiment)
      if (st.q && !st.num) await answer(ki);
      // find-the-structure steps: a wrong part, then the right one
      await page.evaluate(() => { const st = window.__immunesim.runner().currentStep(), v = window.__immunesim.app.view; if (st.findPart && v.onPart) { v.onPart('neck-left'); v.onPart([].concat(st.findPart)[0]); } });
      if (st.title === 'You are the alarm') {
        // hold the alarm: here, by setting it and letting the clock run
        await page.evaluate(() => { const a = window.__immunesim.app; a.sim.set('manualAlarm', 1); a.clock = 'free'; a.speed = 12; });
        await waitContinue(30000);
        await page.evaluate(() => { window.__immunesim.app.clock = 'idle'; });
      } else if (st.title === 'Inside the lymph node: what is a fit?') {
        // bring a lymphocyte that does not fit, wait for it to drift away, then the one that does
        const idx = await page.evaluate(() => { const v = window.__immunesim.app.view; return { no: v.cells.findIndex((c, i) => !v.fits(i)), yes: v.cells.findIndex((c, i) => v.fits(i)) }; });
        await page.evaluate((i) => window.__immunesim.app.view.tryCell(i), idx.no);
        await page.waitForFunction(() => { const v = window.__immunesim.app.view; return v.cells.every(c => !c.busy) && v.cells.some(c => c.arrived); }, null, { timeout: 15000 });
        await page.evaluate((i) => window.__immunesim.app.view.tryCell(i), idx.yes);
        await page.waitForFunction(() => window.__immunesim.app.view.docked != null, null, { timeout: 15000 });
      } else if (st.title === 'Hunt by hand') {
        for (let i = 0; i < 8; i++) { await page.locator('.actions button').first().click(); await page.waitForTimeout(40); }
      } else if (st.title === 'Let the antigen find it' || st.title === 'A different pathogen') {
        await page.locator('.actions button').first().click();
        await page.waitForTimeout(150);
        const n = await page.evaluate(() => { const v = window.__immunesim.app.view; const f = v.fitting(); v.pick(f[0]); return f.length; });
        if (st.num) { await page.fill('.numrow input', String(n + 1)); await page.click('.numrow button'); await page.fill('.numrow input', String(n)); await page.click('.numrow button'); }
      } else if (st.title === 'Step 1: the dendritic cell selects a helper') {
        // bring a helper that does not fit, wait for it to drift away, then the one that does
        const idx = await page.evaluate(() => { const v = window.__immunesim.app.view; const c = v.candidates; return { no: c.findIndex(t => t.f < 0.5), yes: c.findIndex(t => t.f >= 0.5) }; });
        await page.evaluate((i) => window.__immunesim.app.view.tryTh(i), idx.no);
        await page.waitForFunction(() => { const c = window.__immunesim.app.view.candidates; return c.every(t => !t.busy) && c.some(t => t.arrived); }, null, { timeout: 15000 });
        await page.evaluate((i) => window.__immunesim.app.view.tryTh(i), idx.yes);
        await page.waitForFunction(() => window.__immunesim.app.view.chosen != null, null, { timeout: 15000 });
      } else if (st.title === 'You are the cytotoxic T-lymphocyte') {
        await page.evaluate(() => { window.__immunesim.app.view.onCell(5); });      // a healthy cell, by mistake
        await page.locator('.actions button', { hasText: 'Start again' }).click();
        await page.evaluate(() => { window.__immunesim.app.view.onCell(3); });
        await page.locator('.actions button', { hasText: '2 hours' }).click();
        await page.evaluate(() => { window.__immunesim.app.view.onCell(8); });
      } else if (id === 'knock' && ki === 0) {
        for (const key of await page.evaluate(() => window.__immunesim.KO.map(k => k[0]))) {
          const row = page.locator('.ptable tr', { has: page.locator(`button[data-ko="${key}"]`) });
          await row.locator('select').nth(0).selectOption(key === 'tcells' ? 'cleared' : 'not');
          await page.locator('.ptable tr', { has: page.locator(`button[data-ko="${key}"]`) }).locator('select').nth(1).selectOption('cleared');
          await page.locator(`button[data-ko="${key}"]`).click();
          await page.waitForTimeout(150); await finishRuns(); await page.waitForTimeout(150);
        }
      } else {
        // ordinary steps: press each activity button in turn, finishing each experiment
        const n = await page.locator('.actions button').count();
        for (let i = 0; i < n; i++) {
          const b = page.locator('.actions button').nth(i);
          if (!(await b.isDisabled())) { await b.click(); await page.waitForTimeout(120); await finishRuns(); await page.waitForTimeout(80); }
        }
      }
      // an ordering exercise: one wrong card first, then the cards in order
      if (await page.locator('.extra .options button').count()) {
        const order = await page.evaluate(() => window.__immunesim.ORDER);
        await page.locator('.extra .options button', { hasText: order[3] }).first().click();
        for (const t of order) { await page.locator('.extra .options button', { hasText: t }).first().click(); await page.waitForTimeout(50); }
      }
      // a table of choices (not the knock-out table): try each option until the cell is right
      if (!(id === 'knock' && ki === 0)) {
        const nSel = await page.locator('.extra .ptable select').count();
        for (let i = 0; i < nSel; i++) {
          const sel = page.locator('.extra .ptable select').nth(i);
          const opts = await sel.locator('option').allTextContents();
          for (const o of opts.slice(1).reverse()) { await sel.selectOption({ label: o }); if (await sel.evaluate(e => e.parentElement.classList.contains('right'))) break; }
        }
      }
      if (st.q && !st.num && !(await page.evaluate(() => window.__immunesim.runner().runner.state.answered))) await answer(1);
      if (id === 'vaccine' && ki === lesson[si].steps.length - 1) await page.fill('#rec-name', 'Test Student, Another Person');
      const ok = await waitContinue(20000) || (si === lesson.length - 1 && ki === lesson[si].steps.length - 1);
      await page.screenshot({ path: `${SHOTS}${String(si + 1).padStart(2, '0')}-${String(ki).padStart(2, '0')}.png` });
      report.push(`${ok ? 'ok ' : 'XX '} ${si + 1}.${ki} ${id} · ${st.title}${ok ? '' : '  (Continue never enabled: ' + (await page.evaluate(() => { const e = document.querySelector('.nav .hint'); return e ? e.textContent : 'NO NAV'; })) + ')'}`);
      if (ok && !(si === lesson.length - 1 && ki === lesson[si].steps.length - 1)) await page.click('#btn-continue');
      else if (!ok) await page.evaluate(([a, b]) => window.__immunesim.goto(a, b), [ki + 1 < lesson[si].steps.length ? si : si + 1, ki + 1 < lesson[si].steps.length ? ki + 1 : 0]);
      await page.waitForTimeout(150);
    }
  }
  const has = await page.locator('#rec-name').count();
  const rec = has ? await page.$eval('.record textarea', t => t.value) + '\n' + await page.$eval('.record .code', e => e.textContent) : await page.evaluate(() => document.querySelector('.extra') ? document.querySelector('.extra').textContent : '(no completion panel)');
  const code = await page.evaluate(() => window.__immunesim.completionCode('another   PERSON and test student'));
  const ver = rec.includes(code);
  const tampered = rec.includes(await page.evaluate(() => window.__immunesim.completionCode('Someone Else')));
  const solo = await page.evaluate(() => /^IM-[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(window.__immunesim.completionCode('One Student')));
  console.log(report.join('\n'));
  console.log('\n--- record ---\n' + rec + '\n--- verify (names in another order):', ver, '| tampered:', tampered, '| a single name gives a code:', solo);
  console.log('\n--- console errors/warnings ---\n' + (errors.join('\n') || '(none)'));
  await browser.close();
  const failed = report.filter(r => !r.startsWith('ok')).length + errors.filter(e => e.startsWith('PAGEERROR')).length + (ver && !tampered && solo ? 0 : 1);
  console.log(failed ? `immune walkthrough FAILED (${failed} problem(s))` : 'immune walkthrough OK');
  process.exit(failed ? 1 : 0);
})();
