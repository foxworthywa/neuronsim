// "Scientific unit tests" for the hormone feedback axes: they assert the physiology, not the code.
// Targets: docs/ENDO_MODULE.md (Physiological targets, Acceptance tests). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Thyroid, Adrenal, patient, DAY, HOUR } = require('../endo/engine.js');

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what} = ${x.toFixed(3)}, expected ${lo}–${hi}`);
const settled = (params, days = 300) => { const a = new Thyroid(params); a.advance(days * DAY); return a; };
// Cortisol and ACTH at a given clock time on a settled day.
function at(ad, hour) { ad.advanceTo(hour); return { cortisol: ad.cortisol, ACTH: ad.ACTH }; }
// Mean glucocorticoid effect (own cortisol + drug) over the next `days` days, one value per day.
function dailyGC(ad, days) {
  const out = [];
  for (let d = 0; d < days; d++) { let s = 0, n = 0; for (let m = 0; m < DAY; m += 10) { ad.advance(10); s += ad.gcEffect; n++; } out.push(s / n); }
  return out;
}

// ------------------------------------------------------------------ thyroid
test('healthy thyroid axis sits in the reference ranges and stays there for a year', () => {
  const a = new Thyroid();
  for (let m = 0; m < 12; m++) {
    a.advance(30 * DAY);
    between(a.TSH, 0.4, 4.0, `TSH at month ${m + 1} (mIU/L)`);
    between(a.FT4, 0.8, 1.8, `free T4 at month ${m + 1} (ng/dL)`);
    between(a.FT3, 2.3, 4.2, `free T3 at month ${m + 1} (pg/mL)`);
    between(a.size, 10, 25, `thyroid size at month ${m + 1} (g)`);
  }
  between(a.RAIU, 10, 30, 'radioactive iodine uptake (%)');
});

test('the axis settles back to normal from an abnormal starting state', () => {
  const a = new Thyroid();
  a.TSH = 20; a.T4 = 300; a.mass = 2;
  a.advance(300 * DAY);
  between(a.TSH, 1.2, 1.8, 'TSH (mIU/L)');
  between(a.FT4, 1.2, 1.4, 'free T4 (ng/dL)');
});

test('TSH and free T4 have the clinical log-linear relationship (small T4 change → large TSH change)', () => {
  const lo = settled({ thyroid: 0.5 }), hi = settled({ levothyroxine: 150 });
  const ratioT4 = hi.FT4 / lo.FT4, ratioTSH = lo.TSH / hi.TSH;
  // clinically, halving free T4 raises TSH roughly a hundredfold
  assert.ok(Math.log(ratioTSH) > 4 * Math.log(ratioT4), `free T4 ×${ratioT4.toFixed(2)} but TSH only ×${ratioTSH.toFixed(1)}`);
});

test('localization rule: the level above a broken link rises, the level below falls', () => {
  // thyroid removed: TRH ↑ TSH ↑ T4 ↓
  const rem = new Thyroid(); rem.removeThyroid(); rem.advance(60 * DAY);
  assert.ok(rem.TRH > 1.3 && rem.TSH > 10 && rem.FT4 < 0.3, `removed: TRH ${rem.TRH.toFixed(2)} TSH ${rem.TSH.toFixed(1)} FT4 ${rem.FT4.toFixed(2)}`);
  // pituitary blocked: TRH ↑ TSH ↓ T4 ↓
  const pit = new Thyroid({ pituitary: 0 }); pit.advance(60 * DAY);
  assert.ok(pit.TRH > 1.3 && pit.TSH < 0.1 && pit.FT4 < 0.6, `pituitary: TRH ${pit.TRH.toFixed(2)} TSH ${pit.TSH.toFixed(2)} FT4 ${pit.FT4.toFixed(2)}`);
  // hypothalamus blocked: TRH ↓ TSH ↓ T4 ↓
  // hypothalamus failing: TRH ↓, T4 ↓, and TSH low or "inappropriately normal" (not raised)
  const hyp = new Thyroid({ hypothalamus: 0.02 }); hyp.advance(120 * DAY);
  assert.ok(hyp.TRH < 0.5 && hyp.TSH < 1.5 && hyp.FT4 < 0.8, `hypothalamus: TRH ${hyp.TRH.toFixed(2)} TSH ${hyp.TSH.toFixed(2)} FT4 ${hyp.FT4.toFixed(2)}`);
});

test('T4 tablets in a healthy person: own production falls, so total T4 rises less than the dose', () => {
  const a = new Thyroid({ levothyroxine: 150 }); a.advance(180 * DAY);
  assert.ok(a.TSH < 0.4, `TSH ${a.TSH.toFixed(2)} should be suppressed`);
  assert.ok(a.glandT4 < 0.3 * a.P0, `gland output ${a.glandT4.toFixed(0)} µg/day should fall far below normal ${a.P0.toFixed(0)}`);
  // without feedback the gland's 89 µg/day plus 80 µg absorbed would nearly double free T4
  assert.ok(a.FT4 < 1.3 * 1.6, `free T4 ${a.FT4.toFixed(2)} rose much less than the dose alone predicts`);
  assert.ok(a.size < 12, `thyroid ${a.size.toFixed(1)} g should shrink`);
});

test('iodine deficiency: low T4, high TSH, and a goiter within 6 months', () => {
  const a = new Thyroid({ iodine: 0.01 }); a.advance(180 * DAY);
  assert.ok(a.FT4 < 0.85 && a.TSH > 6, `FT4 ${a.FT4.toFixed(2)} TSH ${a.TSH.toFixed(1)}`);
  assert.ok(a.size > 1.5 * 18, `thyroid ${a.size.toFixed(0)} g should be ≥ 50 % larger than 18 g`);
});

test("Graves': the antibody is not under feedback, so TSH is suppressed while T4 stays high", () => {
  const a = patient('graves');
  assert.ok(a.TSH < 0.1, `TSH ${a.TSH.toFixed(3)}`);
  assert.ok(a.FT4 > 1.8 && a.FT3 > 4.2, `FT4 ${a.FT4.toFixed(2)} FT3 ${a.FT3.toFixed(1)}`);
  assert.ok(a.size > 25 && a.RAIU > 30, `goiter ${a.size.toFixed(0)} g, uptake ${a.RAIU.toFixed(0)} %`);
});

test('primary vs secondary hypothyroidism differ in TSH; hidden tablets differ from Graves in uptake', () => {
  const pri = patient('maria'), sec = patient('secondary'), tab = patient('tablets'), gr = patient('graves');
  assert.ok(pri.FT4 < 0.8 && pri.TSH > 4, `primary: FT4 ${pri.FT4.toFixed(2)} TSH ${pri.TSH.toFixed(1)}`);
  assert.ok(sec.FT4 < 0.8 && sec.TSH < 4, `secondary: FT4 ${sec.FT4.toFixed(2)} TSH ${sec.TSH.toFixed(2)} (low or inappropriately normal)`);
  assert.ok(tab.TSH < 0.4 && tab.FT4 > 1.8 && tab.RAIU < 10 && tab.size < 10, `tablets: uptake ${tab.RAIU.toFixed(0)} % size ${tab.size.toFixed(0)} g`);
  assert.ok(gr.RAIU > 3 * tab.RAIU, 'Graves uptake is far higher than hidden-tablet uptake');
});

test('levothyroxine: free T4 recovers within about 2 weeks, but TSH lags and needs ~6 weeks to settle', () => {
  const a = patient('maria');
  assert.ok(a.FT4 < 0.8 && a.TSH > 20, `untreated: FT4 ${a.FT4.toFixed(2)} TSH ${a.TSH.toFixed(1)}`);
  a.p.levothyroxine = 100;
  a.advance(7 * DAY);
  assert.ok(a.TSH > 4, `TSH after 1 week ${a.TSH.toFixed(1)} should still be high (TSH cells adapt over weeks)`);
  a.advance(7 * DAY);
  between(a.FT4, 0.8, 1.8, 'free T4 after 2 weeks (ng/dL)');
  a.advance(28 * DAY);
  between(a.TSH, 0.4, 4.0, 'TSH after 6 weeks on 100 µg (mIU/L)');
  between(a.FT4, 0.8, 1.8, 'free T4 after 6 weeks (ng/dL)');
});

test('an injected pulse of TSH is gone within hours (half-life ≈ 1 h)', () => {
  const a = new Thyroid(); a.injectTSH(10);
  a.advance(60); between(a.injected, 4.5, 5.5, 'injected TSH after 1 h');
  a.advance(5 * 60); assert.ok(a.injected < 0.2);
});

// ------------------------------------------------------------------ adrenal
test('cortisol has a daily rhythm: highest soon after waking, lowest near midnight', () => {
  const ad = new Adrenal();
  const m = at(ad, 8), mid = at(ad, 24);
  between(m.cortisol, 10, 25, '8 am cortisol (µg/dL)');
  between(m.ACTH, 10, 60, '8 am ACTH (pg/mL)');
  assert.ok(mid.cortisol < m.cortisol / 3, `midnight ${mid.cortisol.toFixed(1)} vs morning ${m.cortisol.toFixed(1)}`);
  let best = 0, bestH = 0;
  for (let h = 1; h <= 24; h++) { ad.advanceTo(h); if (ad.cortisol > best) { best = ad.cortisol; bestH = h; } }
  assert.ok(bestH >= 7 && bestH <= 10, `peak at ${bestH}:00`);
});

test('stress raises cortisol above the normal level for that time of day', () => {
  const a = new Adrenal(), b = new Adrenal();
  a.advanceTo(14); b.advanceTo(13); b.p.stress = 3; b.advanceTo(14);
  assert.ok(b.cortisol > 1.5 * a.cortisol, `stressed ${b.cortisol.toFixed(1)} vs ${a.cortisol.toFixed(1)}`);
});

test('dexamethasone suppression: healthy suppresses on 1 mg; pituitary Cushing only on 8 mg; ectopic and adrenal tumour never', () => {
  const dex = (mk, mg) => { const a = mk(); a.advanceTo(8); const c0 = a.cortisol; a.advanceTo(23); a.giveDexamethasone(mg); a.advanceTo(8); return { c0, c1: a.cortisol }; };
  const h = dex(() => new Adrenal(), 1);
  assert.ok(h.c1 < 1.8, `healthy after 1 mg: ${h.c1.toFixed(2)} µg/dL`);
  const cdLow = dex(() => patient('cushingDisease'), 1), cdHigh = dex(() => patient('cushingDisease'), 8);
  assert.ok(cdLow.c1 > 5, `Cushing disease after 1 mg: ${cdLow.c1.toFixed(1)}`);
  assert.ok(cdHigh.c1 < 0.5 * cdHigh.c0, `Cushing disease after 8 mg: ${cdHigh.c0.toFixed(1)} → ${cdHigh.c1.toFixed(1)}`);
  for (const name of ['ectopic', 'adrenalTumour']) {
    const r = dex(() => patient(name), 8);
    assert.ok(r.c1 > 0.8 * r.c0, `${name} after 8 mg: ${r.c0.toFixed(1)} → ${r.c1.toFixed(1)}`);
  }
});

test('Cushing sources are told apart by ACTH: high in pituitary and ectopic, suppressed with an adrenal tumour', () => {
  const cd = at(patient('cushingDisease'), 8), ec = at(patient('ectopic'), 8), at_ = at(patient('adrenalTumour'), 8);
  for (const [n, r] of [['Cushing disease', cd], ['ectopic', ec], ['adrenal tumour', at_]]) assert.ok(r.cortisol > 25, `${n} cortisol ${r.cortisol.toFixed(1)}`);
  assert.ok(cd.ACTH > 40 && ec.ACTH > 60 && at_.ACTH < 10, `ACTH: disease ${cd.ACTH.toFixed(0)}, ectopic ${ec.ACTH.toFixed(0)}, tumour ${at_.ACTH.toFixed(0)}`);
});

test("ACTH stimulation: healthy cortisol rises to ≥ 18 µg/dL; Addison's does not, and its ACTH is high", () => {
  const stim = (a) => { a.advanceTo(8); a.giveCosyntropin(); a.advance(60); return a.cortisol; };
  assert.ok(stim(new Adrenal()) >= 18);
  const ad = patient('addison'); const m = at(ad, 8);
  assert.ok(m.cortisol < 5 && m.ACTH > 60, `Addison 8 am cortisol ${m.cortisol.toFixed(1)} ACTH ${m.ACTH.toFixed(0)}`);
  assert.ok(stim(patient('addison')) < 10);
  assert.ok(patient('addison').lab(['size'])[0].value < 3, 'the destroyed adrenal is small');
});

test('8 weeks of prednisone shrink the adrenals; stopping abruptly leaves days of very low cortisol', () => {
  const ad = new Adrenal(); ad.setPrednisone(20); ad.advance(56 * DAY);
  assert.ok(ad.mass < 0.4, `adrenal ${(ad.mass * 5).toFixed(1)} g`);
  ad.advanceTo(8); assert.ok(ad.ACTH < 5, `ACTH ${ad.ACTH.toFixed(1)}`);
  ad.setPrednisone(0);
  const gc = dailyGC(ad, 6);
  const crisisDays = gc.filter(g => g < 3).length;
  assert.ok(crisisDays >= 3, `daily glucocorticoid effect ${gc.map(g => g.toFixed(1)).join(', ')}`);
  // a cosyntropin test now is blunted
  ad.advanceTo(8); ad.giveCosyntropin(); ad.advance(60);
  assert.ok(ad.cortisol < 18, `stimulated cortisol ${ad.cortisol.toFixed(1)}`);
});

test('a taper lets the axis recover while the drug still covers the body', () => {
  const ad = new Adrenal(); ad.setPrednisone(20); ad.advance(56 * DAY);
  const steps = [[15, 7], [10, 7], [7.5, 7], [5, 14], [2.5, 14]];
  let min = Infinity;
  for (const [mg, d] of steps) { ad.setPrednisone(mg); for (const g of dailyGC(ad, d)) min = Math.min(min, g); }
  ad.setPrednisone(0);
  for (const g of dailyGC(ad, 6)) min = Math.min(min, g);
  assert.ok(min > 4, `lowest daily glucocorticoid effect during and after the taper ${min.toFixed(1)}`);
  assert.ok(ad.mass > 0.5, `adrenal recovered to ${(ad.mass * 5).toFixed(1)} g`);
});
