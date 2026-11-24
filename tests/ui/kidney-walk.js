// Walk through every step of KidneySim in Chromium: answer, do the activity, wait for Continue.
/*
 * Answers each question (a wrong answer first on every other step, to exercise the feedback),
 * does each step's activity (clicking structures, fitting pumps, turning dials, filling tables),
 * fast-forwards each experiment to its end, waits for Continue, and checks the completion code.
 *   node tests/ui/kidney-walk.js [page]     page defaults to dist/kidney.html
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
const SHOTS = (process.env.KIDNEY_SHOTS || require('os').tmpdir()) + '/kidneysim-walk-';
const arg = process.argv[2] || null;
const URL = (arg ? (arg.includes('://') ? arg : 'file://' + path.resolve(arg)) : 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'kidney.html')) + '?fresh=1';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' / ')); });
  await page.goto(URL);
  await page.waitForTimeout(800);
  const lesson = await page.evaluate(() => window.__kidneysim.lesson().map(s => ({ id: s.id, steps: s.steps.map(st => ({ title: st.title || s.title, q: !!st.question, num: !!(st.question && st.question.type === 'number'), find: st.findPart ? [].concat(st.findPart)[0] : null })) })));
  const continueEnabled = () => page.evaluate(() => { const b = document.querySelector('#btn-continue'); return b && !b.disabled; });
  const waitContinue = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await continueEnabled()) return true; await page.waitForTimeout(100); } return false; };
  // Let any running experiment finish (possibly one that starts another when it ends).
  const finishRuns = async () => { for (let i = 0; i < 12; i++) { const running = await page.evaluate(() => { const a = window.__kidneysim.app; if (a.run) { window.__kidneysim.finishRun(); return true; } return false; }); if (!running) break; await page.waitForTimeout(120); } };
  const answered = () => page.evaluate(() => window.__kidneysim.runner().runner.state.answered);
  const answer = async (ki) => {
    const q = await page.evaluate(() => { const q = window.__kidneysim.runner().currentStep().question, c = window.__kidneysim.runner().ctx; const strip = (t) => t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); if (q.type === 'number') return { num: q.answer(c), tol: typeof q.tol === 'function' ? q.tol(c) : q.tol }; const w = q.options.find(o => !o.ok); return { ok: strip(q.options.find(o => o.ok).t), wrong: w ? strip(w.t) : null }; });
    if (q.num != null) {
      if (ki % 2 === 0) { await page.fill('.numrow input', String(+(q.num + 3 * q.tol + 1).toFixed(2))); await page.click('.numrow button'); }
      await page.fill('.numrow input', String(+q.num.toFixed(2))); await page.click('.numrow button');
    } else {
      const clickText = async (t) => { const btns = page.locator('.question .options button'); const n = await btns.count(); for (let i = 0; i < n; i++) { const b = btns.nth(i); if ((await b.textContent()).replace(/\s+/g, ' ').trim() === t) { if (!(await b.isDisabled())) await b.click(); return; } } throw new Error('option not found: ' + t); };
      if (q.wrong && ki % 2 === 0) await clickText(q.wrong);
      await clickText(q.ok);
    }
    await page.waitForTimeout(80);
  };
  const setRange = (sel, v) => page.evaluate(([sel, v]) => { const e = document.querySelector(sel); if (!e) return false; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); return true; }, [sel, v]);
  const report = [];
  for (let si = 0; si < lesson.length; si++) {
    for (let ki = 0; ki < lesson[si].steps.length; ki++) {
      const st = lesson[si].steps[ki], id = lesson[si].id;
      const at = await page.evaluate(() => { const r = window.__kidneysim.runner().runner; return [r.scene, r.step]; });
      if (at[0] !== si || at[1] !== ki) { report.push(`!! expected ${si}.${ki} but at ${at}`); await page.evaluate(([a, b]) => window.__kidneysim.goto(a, b), [si, ki]); await page.waitForTimeout(200); }
      // multiple-choice predictions first (a prediction unlocks the experiment); numbers that need the model wait
      if (st.q && !st.num) await answer(ki);
      if (st.q && st.num && !['Too much to take back'].includes(st.title)) await answer(ki);
      // find-the-structure steps: a wrong part, then the right one
      if (st.find) await page.evaluate((p) => { const v = window.__kidneysim.app.view; v.onPart(p === 'kidney' ? 'bladder' : 'kidney'); v.onPart(p); }, st.find);
      // the design bench: fit a pump in every slot the step offers
      if (id === 'design') await page.evaluate(() => { const v = window.__kidneysim.app.view; if (v && v.onSlot) for (const k of ['urea', 'potassium', 'acid', 'water', 'salt', 'glucose']) v.onSlot(k); });
      // predictions in a table: choose the last option everywhere, then run
      const nPred = await page.locator('.extra .ptable select').count();
      const isMatch = ['Whose urine?', 'Four patients, four charts', 'Four events'].includes(st.title);
      if (nPred && !isMatch) {
        for (let i = 0; i < nPred; i++) { const sel = page.locator('.extra .ptable select').nth(i); const opts = await sel.locator('option').allTextContents(); await sel.selectOption({ label: opts[opts.length - 1] }); }
        await page.locator('.extra button.go').click(); await page.waitForTimeout(150);
      }
      if (st.title === 'Hold her steady for a day') {
        // start the day, then turn the dials as an attentive student would
        await page.locator('.extra button.go').click();
        await page.evaluate(() => { const a = window.__kidneysim.app; a.speed = 240; });
        for (let i = 0; i < 400; i++) {
          const done = await page.evaluate(() => {
            const a = window.__kidneysim.app, b = a.sim; if (!a.run) return true;
            const water = Math.max(0.3, Math.min(12, 1 + 9 * b.waterExcess + b.gut.water / 250)), salt = Math.max(0, Math.min(2, 0.37 + 0.11 * b.saltExcess));
            const w = document.querySelector('#dial-water'), s = document.querySelector('#dial-salt');
            w.value = Math.log(water / 0.3) / Math.log(40) * 100; w.dispatchEvent(new Event('input', { bubbles: true }));
            s.value = salt; s.dispatchEvent(new Event('input', { bubbles: true }));
            return false;
          });
          if (done) break; await page.waitForTimeout(40);
        }
      } else if (st.title === 'What pushes it through?' || st.title === 'Holding it steady') {
        for (const v of [120, 150, 80, 60, 93]) { await setRange('#dial-map', v); await page.waitForTimeout(60); }
      } else if (st.title === 'Too much to take back') {
        for (const v of [150, 180, 250, 300]) { await setRange('#dial-glucose', v); await page.waitForTimeout(60); }
        await answer(ki);
      } else if (st.title === 'Try the two dials') {
        for (const [w, a] of [[5, 50], [100, 50], [80, 100]]) { await setRange('#dial-w', w); await setRange('#dial-a', a); await page.waitForTimeout(60); }
      } else if (!nPred || isMatch) {
        // ordinary steps: press each activity button in turn, finishing each experiment
        const n = await page.locator('.actions button').count();
        for (let i = 0; i < n; i++) {
          const b = page.locator('.actions button').nth(i);
          if (!(await b.isDisabled())) { await b.click(); await page.waitForTimeout(120); await finishRuns(); await page.waitForTimeout(80); }
        }
      }
      await finishRuns(); await page.waitForTimeout(100);
      // a table of choices: try each option until the cell is right
      if (isMatch) {
        const nSel = await page.locator('.extra .ptable select').count();
        for (let i = 0; i < nSel; i++) {
          const sel = page.locator('.extra .ptable select').nth(i);
          const opts = await sel.locator('option').allTextContents();
          for (const o of opts.slice(1).reverse()) { await sel.selectOption({ label: o }); if (await sel.evaluate(e => e.parentElement.classList.contains('right'))) break; }
        }
      }
      if (st.q && !(await answered())) await answer(1);
      const last = si === lesson.length - 1 && ki === lesson[si].steps.length - 1;
      if (last) await page.fill('#rec-name', 'Test Student, Another Person');
      const ok = await waitContinue(15000) || last;
      await page.screenshot({ path: `${SHOTS}${String(si + 1).padStart(2, '0')}-${String(ki).padStart(2, '0')}.png` });
      report.push(`${ok ? 'ok ' : 'XX '} ${si + 1}.${ki} ${id} · ${st.title}${ok ? '' : '  (Continue never enabled: ' + (await page.evaluate(() => { const e = document.querySelector('.nav .hint'); return e ? e.textContent : 'NO NAV'; })) + ')'}`);
      console.log(report[report.length - 1]);
      if (ok && !last) await page.click('#btn-continue');
      else if (!ok) await page.evaluate(([a, b]) => window.__kidneysim.goto(a, b), [ki + 1 < lesson[si].steps.length ? si : si + 1, ki + 1 < lesson[si].steps.length ? ki + 1 : 0]);
      await page.waitForTimeout(150);
    }
  }
  const has = await page.locator('#rec-name').count();
  const rec = has ? await page.$eval('.record textarea', t => t.value) + '\n' + await page.$eval('.record .code', e => e.textContent) : await page.evaluate(() => document.querySelector('.extra') ? document.querySelector('.extra').textContent : '(no completion panel)');
  const code = await page.evaluate(() => window.__kidneysim.completionCode('another   PERSON and test student'));
  const ver = rec.includes(code);
  const tampered = rec.includes(await page.evaluate(() => window.__kidneysim.completionCode('Someone Else')));
  const solo = await page.evaluate(() => /^KD-[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(window.__kidneysim.completionCode('One Student')));
  console.log('\n--- record ---\n' + rec + '\n--- verify (names in another order):', ver, '| tampered:', tampered, '| a single name gives a code:', solo);
  console.log('\n--- console errors/warnings ---\n' + (errors.join('\n') || '(none)'));
  await browser.close();
  const failed = report.filter(r => !r.startsWith('ok')).length + errors.filter(e => e.startsWith('PAGEERROR')).length + (ver && !tampered && solo ? 0 : 1);
  console.log(failed ? `kidney walkthrough FAILED (${failed} problem(s))` : 'kidney walkthrough OK');
  process.exit(failed ? 1 : 0);
})();
