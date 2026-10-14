// Walk through every step of HeartSim Part A in Chromium: answer, do the activity, wait for Continue.
/*
 * HeartSim walkthrough: every step of Part A in headless Chromium. Answers each question (a wrong
 * answer first on every other step, to exercise the feedback), does each activity by clicking the
 * real drawing or panel buttons, waits for Continue, and checks the completion code at the end.
 *   node tests/ui/heart-walk.js [page]     page defaults to dist/heart.html
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
const SHOTS = require('os').tmpdir() + '/heartsim-walk-';
const URL = process.argv[2] ? (process.argv[2].includes('://') ? process.argv[2] : 'file://' + path.resolve(process.argv[2])) : 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'heart.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, e.stack.split('\n').slice(0,3).join(' / ')); });
  await page.goto(URL);
  await page.waitForTimeout(800);
  const lesson = await page.evaluate(() => window.__heartsim.lesson().map(s => ({ id: s.id, steps: s.steps.map(st => ({ title: st.title, q: st.question ? (st.question.type === 'number' ? 'number' : st.question.options.findIndex(o => o.ok)) : null })) })));
  const continueEnabled = () => page.evaluate(() => { const b = document.querySelector('#btn-continue'); return b && !b.disabled; });
  const waitContinue = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await continueEnabled()) return true; await page.waitForTimeout(100); } return false; };
  const report = [];
  for (let si = 0; si < lesson.length; si++) {
    for (let ki = 0; ki < lesson[si].steps.length; ki++) {
      const st = lesson[si].steps[ki];
      // we arrive here by pressing Continue (except the very first step)
      const at = await page.evaluate(() => { const r = window.__heartsim.runner().runner; return [r.scene, r.step]; });
      if (at[0] !== si || at[1] !== ki) { report.push(`!! expected ${si}.${ki} but at ${at}`); await page.evaluate(([a, b]) => window.__heartsim.goto(a, b), [si, ki]); }
      const id = lesson[si].id;
      // activity first where the step needs it before/independent of the question
      if (st.q === 'number') {
        await page.waitForTimeout(400);
        const ans = await page.evaluate(() => { const s = window.__heartsim.sim.stats.L; if (document.querySelector('#panel h2').textContent.includes('Dana')) return 72; return document.querySelector('.question .unit').textContent === '%' ? 100 * (s.edv - s.esv) / s.edv : s.edv - s.esv; });
        await page.fill('.question input', String(Math.round(ans)));
        await page.click('.question .numrow button');
      } else if (st.q != null) {
        // first answer wrong (if there is a wrong option) to exercise feedback, then right; options are shuffled, so match by text
        const texts = await page.evaluate(() => { const q = window.__heartsim.runner().currentStep().question; const strip = (t) => t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); return { ok: strip(q.options.find(o => o.ok).t), wrong: (q.options.find(o => !o.ok) || {}).t ? strip(q.options.find(o => !o.ok).t) : null }; });
        const clickText = async (t) => { const btns = page.locator('.question .options button'); const n = await btns.count(); for (let i = 0; i < n; i++) { const b = btns.nth(i); if ((await b.textContent()).replace(/\s+/g, ' ').trim() === t) { if (!(await b.isDisabled())) await b.click(); return; } } throw new Error('option not found: ' + t); };
        if (texts.wrong && ki % 2 === 0) await clickText(texts.wrong);
        await clickText(texts.ok);
      }
      // scene-specific activities: click real parts of the drawing at their on-screen positions
      const PT = { RA: [402, 270], RV: [470, 390], LA: [640, 262], LV: [622, 380], tricuspid: [410, 330], mitral: [632, 296], pulmonary: [545, 205], aortic: [590, 248], trunk: [720, 172], lungs: [150, 300], pv: [780, 241], aorta: [640, 82] };
      const clickSvg = async (key) => {
        const pt = await page.evaluate(([x, y]) => { const m = document.querySelector('#stage svg').getScreenCTM(); return { x: m.a * x + m.e, y: m.d * y + m.f }; }, PT[key]);
        await page.mouse.click(pt.x, pt.y);
      };
      if (id === 'anatomy' && st.title.startsWith('Find the parts')) await clickSvg(['RA', 'RV', 'LA', 'LV', 'tricuspid', 'mitral', 'pulmonary', 'aortic'][ki - 2]);
      if (id === 'loop' && st.title.startsWith('Follow')) { await page.waitForTimeout(300); await clickSvg(['RA', 'RV', 'trunk', 'lungs', 'pv', 'LA', 'LV', 'aorta'][ki]); }
      if (id === 'loop' && st.title.startsWith('From the real heart')) await page.click('.actions button:has-text("Simplify")');
      if (id === 'pressure' && ki === 0) await page.click('.actions button:has-text("Straighten")');
      if (id === 'pressure' && ki >= 3 && ki <= 5) {
        const btn = page.locator('.actions button', { hasText: 'squeeze' });
        for (let rep = 0; rep < 2 && !(await continueEnabled()); rep++) {
          await btn.hover(); await page.mouse.down(); await page.waitForTimeout(2500); await page.mouse.up(); await page.waitForTimeout(2500);
        }
      }
      if (id === 'cycle' && ki === 0) await page.click('.actions button:has-text("Beat")');
      if (id === 'cycle' && ki >= 1 && ki <= 4) await page.click('.actions button:has-text("Resume")');
      if (id === 'pv' && st.title.startsWith('Read the loop')) {
        const ph = ['filling', 'isovolumetric contraction', 'ejection', 'isovolumetric relaxation'][ki - 1];
        // wrong segment first, then right
        const wrongPh = ph === 'filling' ? 'ejection' : 'filling';
        await page.evaluate(([w, r]) => { const v = window.__heartsim.app.view; v.onSegment(w); v.onSegment(r); }, [wrongPh, ph]);
      }
      if (id === 'starling') {
        const act = page.locator('.actions button');
        if (await act.count()) await act.first().click();
      }
      const ok = await waitContinue(id === 'starling' ? 40000 : 20000);
      const shot = `${String(si + 1)}-${String(ki).padStart(2, '0')}.png`;
      await page.screenshot({ path: SHOTS + shot });
      report.push(`${ok ? 'ok ' : 'XX '} ${si + 1}.${ki} ${id} · ${st.title}${ok ? '' : '  (Continue never enabled: ' + (await page.evaluate(() => { const e = document.querySelector('.nav .hint'); return e ? e.textContent : 'NO NAV; panel=' + document.querySelector('#panel').innerText.slice(0, 200); })) + ')'}`);
      if (ok && !(si === lesson.length - 1 && ki === lesson[si].steps.length - 1)) await page.click('#btn-continue');
      else if (!ok) await page.evaluate(([a, b]) => window.__heartsim.goto(a, b), [ki + 1 < lesson[si].steps.length ? si : si + 1, ki + 1 < lesson[si].steps.length ? ki + 1 : 0]);
      await page.waitForTimeout(150);
    }
  }
  // completion
  await page.fill('#rec-name', 'Test Student');
  const rec = await page.$eval('.record textarea', t => t.value) + '\n' + await page.$eval('.record .code', e => e.textContent);
  const code = await page.evaluate(() => window.__heartsim.completionCode('  test   STUDENT '));
  const ver = { ok: rec.includes(code) };
  const tampered = { ok: rec.includes(await page.evaluate(() => window.__heartsim.completionCode('Someone Else'))) };
  console.log(report.join('\n'));
  console.log('\n--- record ---\n' + rec + '\n--- verify:', ver.ok, '| tampered:', tampered.ok);
  console.log('\n--- console errors/warnings ---\n' + (errors.join('\n') || '(none)'));
  await browser.close();
  const failed = report.filter(r => !r.startsWith('ok')).length + errors.filter(e => e.startsWith('PAGEERROR')).length + (ver.ok && !tampered.ok ? 0 : 1);
  console.log(failed ? `heart walkthrough FAILED (${failed} problem(s))` : 'heart walkthrough OK');
  process.exit(failed ? 1 : 0);
})();
