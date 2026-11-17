// "Scientific unit tests" for the white blood cell differential: they assert the biology, not the
// code. Targets: docs/BLOOD_MODULE.md. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Blood, Bench, trial, flags, binomAtLeast, binomRange, rng, TYPES, CELL, REF, PROBLEMS, DAY } = require('../blood/engine.js');

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what} = ${Number(x).toPrecision(4)}, expected ${lo}–${hi}`);
const after = (cond, days, o) => new Blood().start(cond, o).advance(days * DAY);

// ------------------------------------------------------------------ the healthy balance
test('a healthy adult: every cell within the handout\'s reference range, and steady for a month', () => {
  const b = new Blood();
  b.advance(30 * DAY);
  const r = b.report();
  between(r.wbc.value, 4500, 11000, 'white cells per µL');
  for (const row of r.rows) {
    assert.equal(row.pctFlag, '', `${row.type} percent in range`);
    assert.equal(row.absFlag, '', `${row.type} count in range`);
    between(row.abs / CELL[row.type].n0, 0.999, 1.001, `${row.type} steady`);
  }
  between(TYPES.reduce((s, k) => s + b.percent[k], 0), 99.999, 100.001, 'percentages add to 100');
});

test('neutrophils are the commonest white cell, then lymphocytes, monocytes, eosinophils, basophils', () => {
  const n = new Blood().n;
  assert.ok(n.neut > n.lymph && n.lymph > n.mono && n.mono > n.eos && n.eos > n.baso);
});

test('a neutrophil spends hours in the blood: with no supply, half are gone in about 7 hours', () => {
  const b = new Blood(); b.supply = 0;
  b.advance(7);
  between(b.n.neut / CELL.neut.n0, 0.42, 0.56, 'fraction of neutrophils left after 7 h');
  assert.ok(b.n.lymph / CELL.lymph.n0 > b.n.neut / CELL.neut.n0, 'lymphocytes stay longer than neutrophils');
});

// ------------------------------------------------------------------ what each condition does to the count
test('bacterial infection: neutrophils triple within a day, from the marrow reserve', () => {
  const b = after('bacterial', 1);
  between(b.n.neut / CELL.neut.n0, 2.5, 3.5, 'neutrophils at 24 h (fold)');
  between(b.total, 11000, 18000, 'white cells per µL');
  between(b.percent.neut, 70, 85, 'neutrophils, %');
  assert.ok(b.reserve.neut < 0.85 * CELL.neut.reserve * CELL.neut.n0, 'the reserve has been drawn on');
  assert.equal(b.report().rows.find(r => r.type === 'neut').pctFlag, 'H');
  assert.equal(b.report().wbc.flag, 'H');
});

test('bacterial infection: lymphocytes fall as a percentage but not as a number', () => {
  const b = after('bacterial', 2);
  between(b.n.lymph / CELL.lymph.n0, 0.99, 1.01, 'lymphocytes per µL (fold)');
  const row = b.report().rows.find(r => r.type === 'lymph');
  assert.equal(row.pctFlag, 'L', 'flagged low as a percentage');
  assert.equal(row.absFlag, '', 'normal as a count');
});

test('bacterial infection: the count is back to normal two weeks after it began', () => {
  const b = after('bacterial', 14);
  assert.deepEqual(flags(Object.fromEntries(TYPES.map(k => [k, b.percent[k]])), 100), {});
  between(b.n.neut / CELL.neut.n0, 0.95, 1.1, 'neutrophils (fold)');
});

test('allergy: eosinophils rise over days, not hours, and fall again when the exposure ends', () => {
  const day1 = after('allergy', 1), wk2 = after('allergy', 14);
  assert.ok(day1.percent.eos < 4, 'still in range after one day');
  between(wk2.n.eos, 500, 1000, 'eosinophils per µL at two weeks');
  between(wk2.percent.eos, 5, 12, 'eosinophils, % at two weeks');
  between(wk2.n.neut / CELL.neut.n0, 0.99, 1.01, 'neutrophils unchanged');
  between(wk2.total, 4500, 11000, 'total white cells stay in range');
  wk2.end('allergy').advance(21 * DAY);
  assert.ok(wk2.percent.eos < 4, 'back in range three weeks after the season ends');
});

test('a parasitic worm calls eosinophils more strongly than an allergy does', () => {
  assert.ok(after('parasite', 28).n.eos > 1.4 * after('allergy', 28).n.eos);
  between(after('parasite', 28).n.eos, 900, 2000, 'eosinophils per µL');
});

test('a virus such as mononucleosis: lymphocytes become the commonest cell in the second week', () => {
  const b = after('viral', 12);
  between(b.percent.lymph, 50, 70, 'lymphocytes, %');
  between(b.n.lymph / CELL.lymph.n0, 2.3, 3.3, 'lymphocytes (fold)');
  between(b.n.neut / CELL.neut.n0, 0.99, 1.01, 'neutrophils per µL unchanged');
  assert.equal(b.report().rows.find(r => r.type === 'neut').pctFlag, 'L', 'neutrophils flagged low as a percentage only');
  assert.ok(after('viral', 3).percent.lymph < b.percent.lymph, 'still rising on day 3');
  between(after('viral', 60).percent.lymph, 30, 40, 'lymphocytes back in range by two months, %');
});

test('each condition raises a different cell most', () => {
  const top = (cond, days) => { const b = after(cond, days); return TYPES.map(k => [k, b.n[k] / CELL[k].n0]).sort((a, c) => c[1] - a[1])[0][0]; };
  assert.equal(top('bacterial', 2), 'neut');
  assert.equal(top('viral', 12), 'lymph');
  assert.equal(top('allergy', 14), 'eos');
  assert.equal(top('parasite', 28), 'eos');
});

// ------------------------------------------------------------------ a count is a sample
test('a count of 100 cells adds to 100 and averages to the true percentages', () => {
  const b = new Blood(), rand = rng(11), sum = Object.fromEntries(TYPES.map(k => [k, 0])), N = 3000;
  for (let i = 0; i < N; i++) { const c = b.differential(100, rand); assert.equal(TYPES.reduce((s, k) => s + c[k], 0), 100); for (const k of TYPES) sum[k] += c[k]; }
  for (const k of TYPES) between(sum[k] / N, b.percent[k] - 0.4, b.percent[k] + 0.4, `mean ${k} count`);
});

test('counts of the same healthy slide differ: rare cells most, in proportion', () => {
  const b = new Blood(), rand = rng(3), eos = [], neut = [];
  for (let i = 0; i < 400; i++) { const c = b.differential(100, rand); eos.push(c.eos); neut.push(c.neut); }
  const cv = (a) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) / m; };
  assert.ok(cv(eos) > 4 * cv(neut), 'eosinophil counts scatter far more, relative to their size');
  assert.ok(Math.max(...eos) >= 6 && Math.min(...eos) === 0, 'eosinophils range from none to six or more');
});

test('about half of 100-cell counts of a healthy person have a value outside the reference range', () => {
  const b = new Blood(), rand = rng(5);
  let flagged = 0; const N = 4000;
  for (let i = 0; i < N; i++) if (Object.keys(flags(b.differential(100, rand), 100)).length) flagged++;
  between(flagged / N, 0.35, 0.65, 'fraction of healthy counts with a flag');
});

test('the binomial helpers agree with repeated counting', () => {
  const b = new Blood(), rand = rng(8), p = b.percent.eos / 100;
  let hi = 0; const N = 20000;
  for (let i = 0; i < N; i++) if (b.differential(100, rand).eos >= 5) hi++;
  between(hi / N, binomAtLeast(100, p, 5) - 0.012, binomAtLeast(100, p, 5) + 0.012, 'P(5 or more eosinophils)');
  const [lo, up] = binomRange(100, 0.55, 0.95);
  between(lo, 43, 47, 'lower end for neutrophils'); between(up, 63, 67, 'upper end for neutrophils');
  assert.deepEqual(binomRange(100, 0.005, 0.95)[0], 0);
});

test('the same seed gives the same slide', () => {
  const b = new Blood();
  assert.deepEqual(b.cells(50, rng(42)), b.cells(50, rng(42)));
  assert.notDeepEqual(b.cells(50, rng(42)), b.cells(50, rng(43)));
});

// ------------------------------------------------------------------ five cells, five jobs
test('each problem is dealt with by one kind of cell, and a different one each time', () => {
  const winners = {};
  for (const p of Object.keys(PROBLEMS)) {
    const solvedBy = TYPES.filter(k => trial(p, k).solved);
    assert.equal(solvedBy.length, 1, `${p}: solved by ${solvedBy.join(', ') || 'none'}`);
    winners[p] = solvedBy[0];
  }
  assert.deepEqual(winners, { bacteria: 'neut', debris: 'mono', worm: 'eos', pollen: 'baso', virus: 'lymph' });
  assert.equal(new Set(Object.values(winners)).size, 5);
});

test('bacteria: neutrophils win within a day because they arrive in numbers; monocytes are too few and too slow', () => {
  const n = new Bench({ problem: 'bacteria' }).send('neut');
  let cleared = null, most = 0;
  for (let h = 0; h < 24; h++) { n.advance(1); most = Math.max(most, n.bacteria); for (const e of n.takeEvents()) if (e.type === 'cleared') cleared = e.t; }
  between(cleared, 8, 20, 'hours to clear');
  assert.ok(most < 1e6, 'held below a million');
  const m = trial('bacteria', 'mono');
  assert.ok(m.bacteria > 100 * 1e5, 'with monocytes alone: more than 100 times the starting number at 24 h');
  assert.ok(n.site.neut + n.debris > 5 * (m.site.mono + m.macrophages), 'far more neutrophils arrive than monocytes');
  assert.ok(trial('bacteria', 'lymph').bacteria > 5e8 && trial('bacteria', 'baso').bacteria > 5e8, 'lymphocytes and basophils do not slow them');
});

test('unopposed bacteria double every 90 minutes', () => {
  const b = new Bench({ problem: 'bacteria' }); b.advance(3);
  between(b.bacteria / 1e5, 3.8, 4.1, 'growth in 3 h (fold)');
});

test('clean-up: macrophages clear the dead cells in about two days; more neutrophils make more pus', () => {
  const m = new Bench({ problem: 'debris' }).send('mono');
  let cleared = null;
  for (let h = 0; h < 72; h++) { m.advance(1); for (const e of m.takeEvents()) if (e.type === 'cleared') cleared = e.t; }
  between(cleared, 24, 60, 'hours to clear');
  assert.ok(m.macrophages > 3 * m.site.mono, 'most monocytes have become macrophages');
  assert.ok(trial('debris', 'neut').debris > 1.5 * 20000, 'neutrophils add to the debris');
});

test('a parasite too large to swallow: only eosinophils harm it', () => {
  const e = trial('worm', 'eos');
  assert.equal(e.worm, 0);
  for (const k of ['neut', 'mono']) between(trial('worm', k).worm, 0.9, 0.999, `worm left after ${k}`);
  for (const k of ['lymph', 'baso']) assert.equal(trial('worm', k).worm, 1);
});

test('pollen: harmless on its own; the swelling comes from the basophils\' histamine', () => {
  for (const k of ['neut', 'lymph', 'mono', 'eos']) assert.equal(trial('pollen', k).leak, 0, `${k}: no swelling`);
  assert.equal(new Bench({ problem: 'pollen' }).advance(6).leak, 0, 'no cells: no swelling');
  const b = trial('pollen', 'baso');
  between(b.leak, 0.6, 0.95, 'leak with basophils');
  assert.ok(b.site.baso < 100, 'from a few dozen cells');
});

test('virus inside cells: lymphocytes clear it in about a week; nothing else does', () => {
  const l = new Bench({ problem: 'virus' }).send('lymph');
  let cleared = null, d3 = null;
  for (let h = 0; h < 240; h++) { l.advance(1); if (h === 71) d3 = l.infected; for (const e of l.takeEvents()) if (e.type === 'cleared') cleared = e.t; }
  between(cleared / DAY, 6, 9, 'days to clear');
  assert.ok(d3 > 100, 'still spreading on day 3: the lymphocytes that fit are too few');
  for (const k of ['neut', 'mono', 'eos', 'baso']) assert.ok(trial('virus', k).infected > 500, `${k}: not cleared`);
});
