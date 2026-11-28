// "Scientific unit tests" for the kidney: they assert the physiology, not the code.
// Targets: docs/KIDNEY_MODULE.md. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Kidney, Bench, herrera, STUDENT_DAY, HERRERA_DAYS, HOUR, DAY } = require('../kidney/engine.js');

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what} = ${Number(x).toPrecision(4)}, expected ${lo}–${hi}`);
const perDay = (b, key) => b.ledger(key);
const inRange = (b) => b.labPanel(['Na', 'K', 'BUN', 'creatinine', 'osmolarity']).every(r => r.flag === '');

// ------------------------------------------------------------------ a healthy adult at rest
test('at rest: 125 mL/min filtered, 180 L a day, of which about 99 % is taken back', () => {
  const b = new Kidney();
  between(b.f.gfr, 120, 130, 'filtering rate (mL/min)');
  const w = perDay(b, 'water');
  between(w.filtered, 175, 185, 'water filtered (L/day)');
  between(w.excreted, 1, 2, 'urine (L/day)');
  between(w.reabsorbed / w.filtered, 0.985, 0.995, 'share of filtered water taken back');
  between(w.filtered / 3, 55, 65, 'times the plasma is filtered each day');
  between(b.f.urine.osm, 500, 800, 'urine concentration at rest (mOsm/L)');
});

test('at rest: blood values in their reference ranges, and steady for three days', () => {
  const b = new Kidney();
  const start = { na: b.sodium, k: b.potassium, bun: b.bun, cr: b.creatinine, tbw: b.tbw };
  b.advance(3 * DAY);
  assert.ok(inRange(b), 'every value in range');
  between(b.sodium / start.na, 0.999, 1.001, 'sodium steady');
  between(b.potassium / start.k, 0.995, 1.005, 'potassium steady');
  between(b.bun / start.bun, 0.99, 1.01, 'urea steady');
  between(b.creatinine / start.cr, 0.99, 1.01, 'creatinine steady');
  between(b.tbw / start.tbw, 0.999, 1.001, 'body water steady');
  between(b.osmolarity, 285, 295, 'plasma concentration (mOsm/L)');
  const bp = b.bp; between(bp.sys, 115, 125, 'systolic'); between(bp.dia, 75, 85, 'diastolic');
});

test('what the textbook says is filtered and taken back each day', () => {
  const b = new Kidney();
  const na = perDay(b, 'na'), k = perDay(b, 'k'), glu = perDay(b, 'glucose'), urea = perDay(b, 'urea'), cr = perDay(b, 'cr');
  between(na.filtered, 24000, 26500, 'sodium filtered (mmol/day)');
  assert.ok(na.excreted / na.filtered < 0.01, 'more than 99 % of filtered sodium is taken back');
  between(na.excreted, 100, 200, 'sodium excreted (mmol/day)');
  between(k.excreted, 50, 100, 'potassium excreted (mmol/day)');
  between(glu.filtered, 150, 200, 'glucose filtered (g/day)');
  assert.equal(glu.excreted, 0, 'no glucose in the urine');
  between(urea.excreted / urea.filtered, 0.4, 0.6, 'share of filtered urea excreted');
  between(cr.excreted / cr.filtered, 0.95, 1.05, 'creatinine excreted ÷ filtered');
  between(b.f.reachNa / b.f.filt.na, 0.05, 0.12, 'share of filtered salt left for the last stretch');
});

test('every substance is conserved: what came in is in the body or went out', () => {
  const b = new Kidney({ start: 7 * HOUR }).follow(STUDENT_DAY);
  const had = { water: b.tbw * 1000, na: b.na, k: b.kx + b.kb, urea: b.urea, cr: b.cr };
  b.advance(16 * HOUR);
  const c = b.cum;
  const close = (a, e, what) => assert.ok(Math.abs(a - e) <= 0.001 * Math.max(1, Math.abs(e)) + 1e-6, `${what}: ${a} vs ${e}`);
  close(b.tbw * 1000 + b.gut.water - had.water, c.waterIn - c.waterOut, 'water (mL)');
  close(b.na + b.gut.na - had.na, c.naIn - c.naOut, 'sodium (mmol)');
  close(b.kx + b.kb + b.gut.k - had.k, c.kIn - c.kOut, 'potassium (mmol)');
  close(b.urea - had.urea, c.ureaIn - c.ureaOut, 'urea (mmol)');
  close(b.cr - had.cr, c.crIn - c.crOut, 'creatinine (mg)');
});

// ------------------------------------------------------------------ the purpose: the urine changes so the blood does not
test('an ordinary day on automatic: the blood stays in range while the urine swings', () => {
  const b = new Kidney({ start: 7 * HOUR }).follow(STUDENT_DAY);
  let lo = 1e9, hi = 0, olo = 1e9, ohi = 0, ok = 0, n = 0, plo = 1e9, phi = 0;
  for (let i = 0; i < 16 * 12; i++) {
    b.advance(5);
    const u = b.f.urine;
    lo = Math.min(lo, u.flow); hi = Math.max(hi, u.flow); olo = Math.min(olo, u.osm); ohi = Math.max(ohi, u.osm);
    plo = Math.min(plo, b.osmolarity); phi = Math.max(phi, b.osmolarity);
    n++; if (b.osmolarity >= 285 && b.osmolarity <= 295 && Math.abs(b.saltExcess) <= 3) ok++;
    assert.ok(b.potassium >= 3.5 && b.potassium <= 5.0, 'potassium in range all day');
  }
  assert.ok(hi / lo >= 8, `urine flow varies at least eightfold (${lo.toFixed(2)}–${hi.toFixed(2)} mL/min)`);
  assert.ok(ohi / olo >= 5, `urine concentration varies at least fivefold (${olo.toFixed(0)}–${ohi.toFixed(0)} mOsm/L)`);
  assert.ok((phi - plo) / 290 < 0.04, 'plasma concentration varies by less than 4 %');
  assert.ok(ok / n >= 0.9, `water and salt in range at least 90 % of the day (${(100 * ok / n).toFixed(0)} %)`);
  between(b.cum.urine, 1000, 2200, 'urine in 16 hours (mL)');
});

test('the same day with no kidneys: water, salt, potassium and urea all pile up, and no other exit can fix it', () => {
  const b = new Kidney({ start: 7 * HOUR, setup: (x) => { x.s.nephrons = 0; } }).follow(STUDENT_DAY);
  b.advance(16 * HOUR);
  assert.equal(b.cum.urine, 0, 'no urine');
  assert.ok(b.waterExcess > 0.75, 'water above its band');
  assert.ok(b.saltExcess > 3, 'salt above its band');
  assert.ok(b.potassium > 4.25 && b.bun > 16, 'potassium and urea rising');
  // even sweating twice as hard all day does not remove the salt and potassium that were eaten
  const s = new Kidney({ start: 7 * HOUR, setup: (x) => { x.s.nephrons = 0; } }).follow(STUDENT_DAY);
  s.lose({ sweat: 2000, over: 16 * HOUR }); s.advance(16 * HOUR);
  assert.ok(s.saltExcess > 0 && s.potassium > 4.25 && s.bun > 16, 'sweat cannot be set to match what was eaten');
});

test('Mr. Herrera, 44 hours between dialysis sessions: weight, potassium and urea out of range', () => {
  const b = herrera().follow(HERRERA_DAYS);
  assert.equal(b.f.gfr, 0);
  const w0 = b.weight, k0 = b.potassium, bun0 = b.bun;
  b.advance(44 * HOUR);
  between((b.weight - w0) / (44 / 24), 1, 1.5, 'weight gained (kg/day)');
  between((b.bun - bun0) / (44 / 24), 18, 28, 'BUN rise (mg/dL per day)');
  between(b.potassium - k0, 0.5, 1.6, 'potassium rise (mmol/L)');
  assert.ok(b.potassium > 5.0, 'potassium above the reference range');
  assert.ok(b.pressure > 95, 'blood pressure up with the extra fluid');
  // a four-hour session puts him back where he started
  b.dialyse({ hours: 4, removeWater: (b.weight - 82) * 1000 }).advance(4 * HOUR);
  between(b.weight, 81.7, 82.3, 'weight after dialysis (kg)');
  between(b.bun / (bun0 + (b.bun - bun0)), 0, 1, 'sanity');
  between(b.bun, 18, 32, 'BUN after dialysis');
  between(b.potassium, 3.5, 4.4, 'potassium after dialysis');
  // and it starts again
  const k1 = b.potassium; b.follow(HERRERA_DAYS.map(e => Object.assign({}, e, { at: e.at + 2 * DAY }))).advance(DAY);
  assert.ok(b.potassium > k1 && b.weight > 82.5, 'it all rises again');
});

// ------------------------------------------------------------------ the filter
test('the filter passes by size: glucose, salt, urea and water through; protein and cells held back', () => {
  const b = new Kidney(), f = b.f.filt;
  between(f.glucose / (b.f.gfr / 100 * b.glucose), 0.999, 1.001, 'glucose filtered as freely as water');
  between(f.urea / (b.f.gfr / 1000 * b.urea / b.tbw), 0.999, 1.001, 'urea filtered as freely as water, no faster');
  assert.equal(f.alb, 0, 'no albumin through an intact filter');
  assert.equal(b.urineReport().blood, 'negative');
  assert.equal(b.urineReport().protein, 'negative');
});

test('filtering is driven by pressure, and held steady across ordinary pressures', () => {
  const at = (map, autoreg) => new Kidney().set('map', map).set('autoreg', autoreg).f.gfr;
  for (const m of [80, 100, 120, 150, 180]) between(at(m, 1) / at(93, 1), 0.9, 1.1, `filtering at ${m} mmHg (× normal)`);
  assert.ok(at(60, 1) / at(93, 1) < 0.3, 'at 60 mmHg, filtering is below 30 % of normal');
  assert.ok(at(50, 1) < 3, 'at 50 mmHg, filtering has all but stopped');
  // if the feeding arteriole could not adjust, filtering would follow blood pressure closely
  assert.ok(at(120, 0) / at(93, 0) > 2, 'without adjustment, 120 mmHg more than doubles filtering');
  assert.ok(at(80, 0) / at(93, 0) < 0.4, 'without adjustment, 80 mmHg cuts it by more than half');
});

test('with nothing taken back, the plasma would last about 24 minutes', () => {
  const b = new Kidney();
  between(b.plasma * 1000 / b.f.gfr, 20, 30, 'minutes');
});

// ------------------------------------------------------------------ four substances, three questions
test('four substances: albumin, glucose, creatinine and a drug that is also pushed in', () => {
  const b = new Kidney();
  b.take({ drug: 500 }); b.compute();
  assert.equal(b.f.filt.alb, 0);
  assert.ok(b.f.filt.glucose > 100 && b.f.ex.glucose === 0, 'glucose: filtered, all taken back');
  between(b.f.ex.cr / b.f.filt.cr, 0.95, 1.05, 'creatinine: excreted = filtered');
  assert.ok(b.f.ex.drug > 2 * b.f.filt.drug, 'the drug: more excreted than was filtered');
  const d0 = b.drug; b.advance(HOUR);
  between(b.drug / d0, 0.1, 0.4, 'share of the drug left after an hour');
});

test('a substance the body has no carrier for is still cleared, in hours', () => {
  const b = new Kidney();
  b.take({ toxin: 100 });
  let t = 0; while (b.toxin > 50 && t < 2 * DAY) { b.advance(10); t += 10; }
  between(t / 60, 2, 8, 'half-life (hours)');
  // and without nephrons it is not cleared at all
  const h = herrera(); h.take({ toxin: 100 }); h.advance(DAY);
  between(h.toxin, 99.9, 100, 'left after a day with no kidneys');
});

// ------------------------------------------------------------------ break a step, read the urine
test('glucose appears in the urine only above about 180 mg/dL, and takes water with it', () => {
  const at = (g) => new Kidney().set('glucose', g);
  assert.equal(at(100).urineReport().glucose, 'negative');
  assert.equal(at(150).urineReport().glucose, 'negative');
  assert.notEqual(at(200).urineReport().glucose, 'negative');
  const a = at(250), b = at(400), c = at(500);
  assert.ok(a.f.ex.glucose < b.f.ex.glucose && b.f.ex.glucose < c.f.ex.glucose, 'the higher the blood glucose, the more is lost');
  // the carriers fill unevenly: glucose escapes from about 180 mg/dL, long before all are full at about 300
  between(at(300).ledger('glucose').excreted, 15, 70, 'glucose lost at 300 mg/dL (g/day)');
  between(b.ledger('glucose').excreted, 120, 240, 'glucose lost at 400 mg/dL (g/day)');
  between((c.f.ex.glucose - b.f.ex.glucose) / (c.f.filt.glucose - b.f.filt.glucose), 0.9, 1.05, 'with every carrier full, each extra milligram filtered is lost');
  assert.ok(b.f.urine.flow > 2 * at(100).f.urine.flow, 'urine volume more than doubles at 400 mg/dL');
  // hours later: still a large volume, and the body is short of water
  b.advance(6 * HOUR);
  assert.ok(b.urineReport().perDay > 2.5, 'still more than 2.5 L a day');
  assert.ok(b.waterExcess < -0.3 && b.osmolarity > 293, 'the body is losing water');
  assert.equal(b.urineReport().protein, 'negative');
  // if he drinks when thirsty, the concentration of his blood is held and the loss goes on
  const t = at(400).set('thirst', 1); t.advance(8 * HOUR);
  between(t.osmolarity, 288, 296, 'plasma concentration with thirst (mOsm/L)');
  assert.ok(t.urineReport().perDay > 2.5, 'still polyuric');
});

test('blocking the glucose carrier puts glucose in the urine at a normal blood glucose', () => {
  const b = new Kidney().set('glucoseCarrier', 0.15);
  assert.equal(b.glucose, 90);
  between(b.ledger('glucose').excreted, 40, 100, 'glucose lost (g/day)');
  assert.notEqual(b.urineReport().glucose, 'negative');
  between(b.f.gfr, 120, 130, 'filtering unchanged');
});

test('a damaged filter leaks protein and red cells, and nothing else changes', () => {
  const b = new Kidney().set('filterDamage', 1);
  between(b.ledger('alb').excreted, 3, 8, 'protein lost (g/day)');
  assert.ok(['2+', '3+', '4+'].includes(b.urineReport().protein));
  assert.notEqual(b.urineReport().blood, 'negative');
  assert.equal(b.urineReport().glucose, 'negative');
  between(b.urineReport().perDay, 1, 2, 'urine volume (L/day)');
});

test('blocking salt take-back in the loop: salt stays in the tubule and water stays with it', () => {
  const rest = new Kidney();
  const b = new Kidney().set('loopBlock', 0.25);
  assert.ok(b.f.ex.na > 3 * rest.f.ex.na, 'much more salt excreted');
  assert.ok(b.f.urine.flow > 2.5 * rest.f.urine.flow, 'much more water excreted');
  between(b.f.gfr / rest.f.gfr, 0.98, 1.02, 'filtering unchanged: diuretics do not make the kidney filter more');
  // one dose by mouth: a large volume for about six hours, then the kidney holds on to salt
  const d = new Kidney(); d.take({ diuretic: 1 });
  d.advance(6 * HOUR);
  between(d.cum.urine / 1000, 1.5, 3, 'urine in the six hours after a dose (L)');
  between(d.cum.urineNa, 150, 350, 'sodium lost in six hours (mmol)');
  assert.ok(d.weight < rest.weight - 1, 'more than a kilogram lighter');
  d.advance(4 * HOUR);
  assert.ok(d.f.urine.flow < rest.f.urine.flow && d.f.ex.na < 0.2 * rest.f.ex.na, 'afterwards: little urine, and almost no salt in it');
  // with the loop blocked for good, the kidney can no longer make concentrated urine
  const g = new Kidney().set('loopBlock', 0.9); g.steady = false; g.advance(3 * HOUR);
  assert.ok(g.gradient < 400 && g.f.urine.osm < 400, 'no concentrated urine without the loop');
});

// ------------------------------------------------------------------ the adjustable part
test('a litre of water: dilute urine within the hour, most of the litre out within three, filtering unchanged', () => {
  const b = new Kidney(); const rest = b.f.urine.flow, gfr = b.f.gfr;
  b.take({ water: 1000 });
  let peak = 0, when = 0, low = 1e9;
  for (let t = 10; t <= 180; t += 10) {
    b.advance(10);
    if (b.f.urine.flow > peak) { peak = b.f.urine.flow; when = t; }
    low = Math.min(low, b.f.urine.osm);
    between(b.f.gfr / gfr, 0.95, 1.05, 'filtering rate (× rest)');
    assert.ok(b.osmolarity > 282, 'plasma concentration never falls far');
  }
  assert.ok(peak > 5 * rest, `urine flow rises at least fivefold (peak ${peak.toFixed(1)} mL/min)`);
  between(when, 40, 110, 'time of peak flow (min)');
  assert.ok(low < 200, 'urine more dilute than plasma');
  between(b.cum.urine - rest * 180, 600, 1100, 'extra urine in three hours (mL)');
});

test('a salty meal: more salt in a smaller, more concentrated urine; filtering unchanged', () => {
  const b = new Kidney(); const rest = Object.assign({}, b.f.ex), flow = b.f.urine.flow, gfr = b.f.gfr;
  b.take({ salt: 5 }); b.advance(3 * HOUR);
  assert.ok(b.f.ex.na > 1.5 * rest.na, 'sodium excretion up by at least half');
  assert.ok(b.f.urine.flow < flow && b.f.urine.osm > 900, 'less water, more concentrated');
  between(b.f.gfr / gfr, 0.95, 1.05, 'filtering rate (× rest)');
  assert.ok(b.a < 0.45, 'aldosterone down');
});

test('two hours of sweating: little urine, as concentrated as it can be, with almost no salt in it', () => {
  const b = new Kidney(); const rest = b.f.urine.flow;
  b.lose({ sweat: 2000, over: 120 }); b.advance(3 * HOUR);
  assert.ok(b.f.urine.flow < 0.6 * rest, 'urine flow well down');
  assert.ok(b.f.urine.osm > 1000, 'concentrated');
  assert.ok(b.f.ex.na < 0.2 * 0.105, 'salt held back');
  assert.ok(b.w > 0.95 && b.a > 0.8, 'ADH and aldosterone both high');
  assert.ok(b.urineReport().colour > 0.6, 'dark');
  assert.ok(b.waterExcess < -1.5, 'the kidney cannot put the water back: only drinking can');
});

test('a bleed that drops the pressure to about 60 mmHg: filtering collapses and urine almost stops', () => {
  const b = new Kidney(); b.bleed(1500); b.advance(20);
  between(b.pressure, 52, 66, 'mean pressure (mmHg)');
  assert.ok(b.f.gfr < 0.3 * 125, 'filtering below 30 % of normal');
  assert.ok(b.urineReport().perHour < 20, 'less than 20 mL of urine an hour');
  assert.ok(b.f.urine.osm > 800, 'what little there is, concentrated');
  // creatinine is still being made and no longer leaves
  const cr = b.creatinine; b.advance(2 * HOUR);
  assert.ok(b.creatinine > cr + 0.05, 'creatinine rising');
  // a pint given as a blood donor does none of this
  const d = new Kidney(); d.bleed(500); d.advance(20);
  between(d.f.gfr, 110, 130, 'filtering after a 500 mL donation');
});

test('taking back 1 % less of the filtered water adds about 1.8 L of urine a day', () => {
  const b = new Kidney();
  const flowAt = (w) => { b.manual({ late: { w, a: 0.5 } }); return b.f.urine.flow; };
  // find the two settings whose take-back differs by 1 % of what is filtered
  const share = (w) => 1 - flowAt(w) / b.f.gfr;
  let lo = 0, hi = 1; const target = share(0.82) - 0.01;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (share(m) > target) hi = m; else lo = m; }
  between((flowAt(lo) - flowAt(0.82)) * 1.44, 1.7, 1.9, 'extra urine (L/day)');
  // with no ADH at all the last stretch lets most of its water go
  b.auto(); b.set('adh', 0);
  between(b.urineReport().perDay, 10, 25, 'urine with no ADH (L/day)');
  assert.ok(b.f.urine.osm < 100, 'and very dilute');
});

// ------------------------------------------------------------------ failing kidneys
test('half the filtering: creatinine doubles; a quarter: fourfold, with urea up and potassium only now nearing its limit', () => {
  const half = new Kidney().set('nephrons', 0.5).set('thirst', 1).advance(8 * DAY);
  between(half.creatinine / 0.9, 1.8, 2.2, 'creatinine at half (× normal)');
  between(half.urineReport().perDay, 1, 2.2, 'urine volume still ordinary (L/day)');
  between(half.potassium, 3.5, 4.6, 'potassium barely moved');
  const q = new Kidney().set('nephrons', 0.25).set('thirst', 1).advance(12 * DAY);
  between(q.creatinine / 0.9, 3.6, 4.4, 'creatinine at a quarter (× normal)');
  assert.ok(q.bun > 35, 'urea well up');
  between(q.potassium, 4.5, 5.0, 'potassium high-normal: each surviving nephron pushes out more');
  assert.ok(q.f.urine.osm < 650, 'and the urine can no longer be made very concentrated');
  // and that is a steady state, not a drift: three weeks later nothing has moved
  const later = q.copy().advance(20 * DAY);
  between(later.potassium / q.potassium, 0.98, 1.02, 'potassium steady');
  between(later.sodium, 135, 145, 'sodium in range');
  // at an eighth, potassium is out of range and fluid is retained
  const e = new Kidney().set('nephrons', 0.125).set('thirst', 1).advance(20 * DAY);
  assert.ok(e.potassium > 5.0 && e.ecf > 15 && e.pressure > 96, 'potassium high, fluid retained, pressure up');
});

// ------------------------------------------------------------------ the design bench
test('design 1 (a pump for each waste) holds the wastes but lets an unfamiliar drug pile up', () => {
  const b = new Bench(1); ['urea', 'potassium', 'acid'].forEach(p => b.add(p));
  b.startDrug().advance(2 * DAY);
  for (const w of ['urea', 'potassium', 'acid']) between(b.level[w], 0.9, 1.1, w);
  assert.ok(b.level.drug >= 5.9, 'every dose is still in the body');
  const missing = new Bench(1); missing.add('urea').advance(2 * DAY);
  assert.ok(missing.level.potassium > 2, 'and a waste with no pump of its own piles up too');
});

test('design 2 (filter, then take back): clears the drug it has never met, at the cost of taking back what it must keep', () => {
  const bare = new Bench(2).advance(3 * HOUR);
  assert.ok(bare.dead && bare.dead.t < 2 * HOUR, 'with nothing taken back, half the body\'s fluid is gone within two hours');
  const b = new Bench(2); ['water', 'salt', 'glucose'].forEach(p => b.add(p));
  b.startDrug().advance(2 * DAY - 1);
  assert.equal(b.dead, null);
  for (const k of ['water', 'salt', 'glucose']) assert.equal(b.level[k], 1, k);
  for (const w of ['urea', 'potassium', 'acid']) between(b.level[w], 0.9, 1.1, w);
  assert.ok(b.level.drug < 1, 'less than one dose left just before the seventh');
  between(b.filtered / 2, 170, 190, 'filtered (L/day)');
  between(b.returned / b.filtered, 0.98, 1, 'share taken back');
});

test('a copy of a body runs on exactly as the original does', () => {
  const a = new Kidney({ start: 7 * HOUR }).follow(STUDENT_DAY); a.advance(5 * HOUR);
  const b = a.copy(); a.advance(6 * HOUR); b.advance(6 * HOUR);
  assert.equal(a.tbw, b.tbw); assert.equal(a.na, b.na); assert.equal(a.f.urine.flow, b.f.urine.flow);
});
