// Walk through every step of BloodSim in Chromium: answer, do the activity, wait for Continue.
/*
 * Answers each question (a wrong answer first on every other step, to exercise the feedback),
 * does each step's activity, fast-forwards each experiment to its end, waits for Continue, and
 * checks the completion code at the end.
 *   node tests/ui/blood-walk.js [page] [seed]     page defaults to dist/blood.html
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
const SHOTS = (process.env.SHOTS || require('os').tmpdir()) + '/bloodsim-walk-';
const arg = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2] : null;
const seed = process.argv.slice(2).find(a => /^\d+$/.test(a)) || '7';
const URL = (arg ? (arg.includes('://') ? arg : 'file://' + path.resolve(arg)) : 'file://' + path.resolve(__dirname, '..', '..', 'dist', 'blood.html')) + '?seed=' + seed;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', e => { errors.push('PAGEERROR ' + e.message); console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(0, 3).join(' / ')); });
  await page.goto(URL);
  await page.waitForTimeout(800);
  const lesson = await page.evaluate(() => window.__bloodsim.lesson().map(s => ({ id: s.id, steps: s.steps.map(st => ({ title: st.title || s.title, q: !!st.question })) })));
  const continueEnabled = () => page.evaluate(() => { const b = document.querySelector('#btn-continue'); return b && !b.disabled; });
  const waitContinue = async (ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await continueEnabled()) return true; await page.waitForTimeout(100); } return false; };
  const finishRuns = async () => { for (let i = 0; i < 12; i++) { const running = await page.evaluate(() => { const a = window.__bloodsim.app; if (a.run) { window.__bloodsim.finishRun(); return true; } return false; }); if (!running) break; await page.waitForTimeout(120); } };
  const answer = async (ki) => {
    const texts = await page.evaluate(() => { const q = window.__bloodsim.runner().currentStep().question; const strip = (t) => t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); const w = q.options.find(o => !o.ok); return { ok: strip(q.options.find(o => o.ok).t), wrong: w ? strip(w.t) : null }; });
    const clickText = async (t) => { const btns = page.locator('.question .options button'); const n = await btns.count(); for (let i = 0; i < n; i++) { const b = btns.nth(i); if ((await b.textContent()).replace(/\s+/g, ' ').trim() === t) { if (!(await b.isDisabled())) await b.click(); return; } } throw new Error('option not found: ' + t); };
    if (texts.wrong && ki % 2 === 0) await clickText(texts.wrong);
    await clickText(texts.ok);
    await page.waitForTimeout(80);
  };
  // a table of choices: try each option until the cell is right
  const fillTable = async () => {
    const nSel = await page.locator('.extra .ptable select').count();
    for (let i = 0; i < nSel; i++) {
      const sel = page.locator('.extra .ptable select').nth(i);
      if (await sel.isDisabled()) continue;
      const values = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean));
      for (const v of values.reverse()) { await sel.selectOption(v); if (await sel.evaluate(e => e.parentElement.classList.contains('right'))) break; }
    }
  };
  const report = [], sent = [];
  for (let si = 0; si < lesson.length; si++) {
    for (let ki = 0; ki < lesson[si].steps.length; ki++) {
      const st = lesson[si].steps[ki], id = lesson[si].id;
      const at = await page.evaluate(() => { const r = window.__bloodsim.runner().runner; return [r.scene, r.step]; });
      if (at[0] !== si || at[1] !== ki) { report.push(`!! expected ${si}.${ki} but at ${at}`); await page.evaluate(([a, b]) => window.__bloodsim.goto(a, b), [si, ki]); await page.waitForTimeout(200); }
      if (st.q) await answer(ki);
      const view = await page.evaluate(() => window.__bloodsim.app.viewName);
      if (id === 'smear' && ki === 0) {
        // a red cell and a platelet by mistake, then every white cell: by the mouse, and by the keyboard's buttons
        const pts = await page.evaluate(() => { const v = window.__bloodsim.app.view; return { cells: v.cells.map(k => [k.x, k.y]), rbc: [v.rbcs[40].x, v.rbcs[40].y] }; });
        const box = await page.locator('#cv').boundingBox();
        await page.mouse.click(box.x + pts.rbc[0], box.y + pts.rbc[1]);
        await page.waitForTimeout(350);
        if (!(await page.locator('#narrator').textContent()).includes('red blood cell')) report.push('!! clicking a red cell gave no feedback');
        await page.mouse.click(box.x + pts.cells[0][0], box.y + pts.cells[0][1]);
        const hot = page.locator('#hot button[aria-label="A cell with a nucleus"]');
        for (let i = 1; i < await hot.count(); i++) await hot.nth(i).click();
      } else if (view === 'bench' && await page.locator('.actions button.cellbtn').count()) {
        // send a cell that does not work first, then every cell until one does
        const types = await page.evaluate(() => { const st = window.__bloodsim.runner().currentStep(), w = window.__bloodsim.PROBLEMS[window.__bloodsim.app.view.problem].winner; return st.actions.map(a => a.type).sort((a, b) => (a === w) - (b === w)); });
        for (const t of [types[ki % 4], types[4]]) {
          await page.locator('.actions button.cellbtn').nth(['neut', 'lymph', 'mono', 'eos', 'baso'].indexOf(t)).click();
          await page.waitForTimeout(350); await finishRuns(); await page.waitForTimeout(120);
          sent.push(`${await page.evaluate(() => window.__bloodsim.app.view.problem)}/${t}: ${(await page.locator('.status').textContent()).slice(0, 110)}`);
        }
      } else if (id === 'count' && st.title === 'Two more calls') {
        for (const key of await page.evaluate(() => Object.keys(window.__bloodsim.CONDS))) {
          const row = () => page.locator('.ptable tr', { has: page.locator(`button[data-cond="${key}"]`) });
          // one prediction wrong and one right, to see both verdicts
          await row().locator('select').selectOption(key === 'allergy' ? 'neut' : 'lymph');
          await row().locator('button').click();
          await page.waitForTimeout(250); await finishRuns(); await page.waitForTimeout(150);
        }
        const verdicts = await page.locator('.ptable .verdict').allTextContents();
        if (verdicts.length !== 2 || !verdicts[0].includes('Not this time') || !verdicts[1].includes('Right')) report.push('!! predictions not marked right or wrong: ' + JSON.stringify(verdicts));
      } else if (id === 'hundred' && ki === 0) {
        // name 20 cells, the first one wrongly at first
        for (let i = 0; i < 20; i++) {
          const actual = await page.evaluate(() => window.__bloodsim.app.view.current().type);
          const order = ['neut', 'lymph', 'mono', 'eos', 'baso'];
          if (i === 0) await page.locator('.actions button.cellbtn').nth(order.indexOf(actual === 'neut' ? 'lymph' : 'neut')).click();
          await page.locator('.actions button.cellbtn').nth(order.indexOf(actual)).click();
          await page.waitForTimeout(40);
        }
        await page.locator('.actions button', { hasText: 'Count the other 80' }).click();
      } else {
        // ordinary steps: press each activity button in turn, finishing each experiment
        const n = await page.locator('.actions button').count();
        for (let i = 0; i < n; i++) {
          const b = page.locator('.actions button').nth(i);
          if (!(await b.isDisabled())) { await b.click(); await page.waitForTimeout(150); await finishRuns(); await page.waitForTimeout(80); }
        }
      }
      await fillTable();
      if (si === lesson.length - 1 && ki === lesson[si].steps.length - 1) await page.fill('#rec-name', 'Test Student, Another Person');
      const last = si === lesson.length - 1 && ki === lesson[si].steps.length - 1;
      const ok = await waitContinue(15000) || last;
      await page.waitForTimeout(450);
      await page.screenshot({ path: `${SHOTS}${si + 1}-${ki}.png` });
      report.push(`${ok ? 'ok ' : 'XX '} ${si + 1}.${ki} ${id} · ${st.title}${ok ? '' : '  (Continue never enabled: ' + (await page.evaluate(() => { const e = document.querySelector('.nav .hint'); return e ? e.textContent : 'NO NAV'; })) + ')'}`);
      if (ok && !last) await page.click('#btn-continue');
      else if (!ok) await page.evaluate(([a, b]) => window.__bloodsim.goto(a, b), [ki + 1 < lesson[si].steps.length ? si : si + 1, ki + 1 < lesson[si].steps.length ? ki + 1 : 0]);
      await page.waitForTimeout(150);
    }
  }
  const has = await page.locator('#rec-name').count();
  const rec = has ? await page.$eval('.record textarea', t => t.value) + '\n' + await page.$eval('.record .code', e => e.textContent) : await page.evaluate(() => document.querySelector('.extra') ? document.querySelector('.extra').textContent : '(no completion panel)');
  const code = await page.evaluate(() => window.__bloodsim.completionCode('another   PERSON and test student'));
  const ver = rec.includes(code);
  const tampered = rec.includes(await page.evaluate(() => window.__bloodsim.completionCode('Someone Else')));
  const solo = await page.evaluate(() => /^BL-[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(window.__bloodsim.completionCode('One Student')));
  console.log(report.join('\n'));
  if (process.env.VERBOSE) console.log('\n--- cells sent ---\n' + sent.join('\n'));
  console.log('\n--- record ---\n' + rec + '\n--- verify (names in another order):', ver, '| tampered:', tampered, '| a single name gives a code:', solo);
  console.log('\n--- console errors/warnings ---\n' + (errors.join('\n') || '(none)'));
  await browser.close();
  const failed = report.filter(r => !r.startsWith('ok')).length + errors.filter(e => e.startsWith('PAGEERROR')).length + (ver && !tampered && solo ? 0 : 1);
  console.log(failed ? `blood walkthrough FAILED (${failed} problem(s))` : 'blood walkthrough OK');
  process.exit(failed ? 1 : 0);
})();
