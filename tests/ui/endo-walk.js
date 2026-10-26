// Walk through every step of EndoSim Part A in Chromium: answer, do the activity, wait for Continue.
/*
 * Answers each question (a wrong answer first on every other step, to exercise the feedback),
 * clicks each step's activity buttons, fast-forwards each experiment to its end, waits for
 * Continue, and checks the completion code at the end.
 *   node tests/ui/endo-walk.js [page]     page defaults to dist/endo.html
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
const SHOTS = require('os').tmpdir() + '/endosim-walk-';
const URL = process.argv[2] ? (process.argv[2].includes('://') ? process.argv[2] : 'file://' + path.resolve(process.argv[2])) : 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'endo.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, e.stack.split('\n').slice(0, 3).join(' / ')); });
  await page.goto(URL);
  await page.waitForTimeout(800);
  const lesson = await page.evaluate(() => window.__endosim.lesson().map(s => ({ id: s.id, steps: s.steps.map(st => ({ title: st.title, q: !!st.question, acts: (st.actions || []).length })) })));
  const continueEnabled = () => page.evaluate(() => { const b = document.querySelector('#btn-continue'); return b && !b.disabled; });
  const waitContinue = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await continueEnabled()) return true; await page.waitForTimeout(100); } return false; };
  // Let any running experiment finish (possibly one that starts another when it ends).
  const finishRuns = async () => { for (let i = 0; i < 5; i++) { const running = await page.evaluate(() => { const a = window.__endosim.app; if (a.run) { window.__endosim.finishRun(); return true; } return false; }); if (!running) break; await page.waitForTimeout(150); } };
  const report = [];
  for (let si = 0; si < lesson.length; si++) {
    for (let ki = 0; ki < lesson[si].steps.length; ki++) {
      const st = lesson[si].steps[ki], id = lesson[si].id;
      const at = await page.evaluate(() => { const r = window.__endosim.runner().runner; return [r.scene, r.step]; });
      if (at[0] !== si || at[1] !== ki) { report.push(`!! expected ${si}.${ki} but at ${at}`); await page.evaluate(([a, b]) => window.__endosim.goto(a, b), [si, ki]); }
      // the dial challenge: two tries always completes it
      const reps = id === 'pituitary' && ki === 1 ? 2 : 1;
      for (let rep = 0; rep < reps; rep++) {
        const n = await page.locator('.actions button').count();
        for (let i = 0; i < n; i++) {
          const b = page.locator('.actions button').nth(i);
          if ((await b.textContent()).includes('another pulse')) continue;
          if (!(await b.isDisabled())) await b.click();
          await page.waitForTimeout(120);
          await finishRuns();
        }
      }
      // steps that wait on free-running time: speed the clock up
      await page.evaluate(() => { const a = window.__endosim.app; if (a.clock === 'free' && a.viewName === 'axis') a.speed = 2880; });
      if (st.q) {
        const texts = await page.evaluate(() => { const q = window.__endosim.runner().currentStep().question; const strip = (t) => t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); const w = q.options.find(o => !o.ok); return { ok: strip(q.options.find(o => o.ok).t), wrong: w ? strip(w.t) : null }; });
        const clickText = async (t) => { const btns = page.locator('.question .options button'); const n = await btns.count(); for (let i = 0; i < n; i++) { const b = btns.nth(i); if ((await b.textContent()).replace(/\s+/g, ' ').trim() === t) { if (!(await b.isDisabled())) await b.click(); return; } } throw new Error('option not found: ' + t); };
        if (texts.wrong && ki % 2 === 0) await clickText(texts.wrong);
        await clickText(texts.ok);
      }
      const ok = await waitContinue(25000);
      await page.screenshot({ path: `${SHOTS}${si + 1}-${String(ki).padStart(2, '0')}.png` });
      report.push(`${ok ? 'ok ' : 'XX '} ${si + 1}.${ki} ${id} · ${st.title}${ok ? '' : '  (Continue never enabled: ' + (await page.evaluate(() => { const e = document.querySelector('.nav .hint'); return e ? e.textContent : 'NO NAV'; })) + ')'}`);
      if (ok && !(si === lesson.length - 1 && ki === lesson[si].steps.length - 1)) await page.click('#btn-continue');
      else if (!ok) await page.evaluate(([a, b]) => window.__endosim.goto(a, b), [ki + 1 < lesson[si].steps.length ? si : si + 1, ki + 1 < lesson[si].steps.length ? ki + 1 : 0]);
      await page.waitForTimeout(150);
    }
  }
  await page.fill('#rec-name', 'Test Student, Another Person');
  const rec = await page.$eval('.record textarea', t => t.value) + '\n' + await page.$eval('.record .code', e => e.textContent);
  const code = await page.evaluate(() => window.__endosim.completionCode('another   PERSON and test student'));
  const ver = rec.includes(code);
  const tampered = rec.includes(await page.evaluate(() => window.__endosim.completionCode('Someone Else')));
  console.log(report.join('\n'));
  console.log('\n--- record ---\n' + rec + '\n--- verify (names in another order):', ver, '| tampered:', tampered);
  console.log('\n--- console errors/warnings ---\n' + (errors.join('\n') || '(none)'));
  await browser.close();
  const failed = report.filter(r => !r.startsWith('ok')).length + errors.filter(e => e.startsWith('PAGEERROR')).length + (ver && !tampered ? 0 : 1);
  console.log(failed ? `endo walkthrough FAILED (${failed} problem(s))` : 'endo walkthrough OK');
  process.exit(failed ? 1 : 0);
})();
