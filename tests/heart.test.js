// "Scientific unit tests" for the heart and circulation: they assert the physiology, not the code.
// Targets: docs/HEART_MODULE.md (Physiological targets, Acceptance tests). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Heart } = require('../heart/engine.js');

const DT = 0.5; // ms between samples

// Run `beats` beats, calling onSample after each DT; returns the events.
function run(h, beats, onSample) {
  const end = h.t + beats * h.rr;
  let events = [];
  while (h.t < end - 1e-9) {
    h.advance(Math.min(DT, end - h.t));
    if (onSample) onSample(h);
    events = events.concat(h.takeEvents());
  }
  return events;
}
// A heart that has had time to reach its new steady state after a change.
function steady(mutate, beats = 40) {
  const h = new Heart();
  if (mutate) mutate(h);
  run(h, beats);
  return h;
}
function means(h, keys, beats = 2) {
  const acc = {}, max = {}, min = {}; let n = 0;
  run(h, beats, (x) => { n++; for (const k of keys) { acc[k] = (acc[k] || 0) + x.P[k]; max[k] = Math.max(max[k] ?? -Infinity, x.P[k]); min[k] = Math.min(min[k] ?? Infinity, x.P[k]); } });
  const out = {}; for (const k of keys) out[k] = { mean: acc[k] / n, max: max[k], min: min[k] };
  return out;
}
const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what} = ${x.toFixed(2)}, expected ${lo}–${hi}`);
function valveTimes(events, valve, open) { return events.filter(e => e.type === 'valve' && e.valve === valve && e.open === open).map(e => e.t); }

test('blood volume is conserved (no leaks in the loop)', () => {
  const h = new Heart();
  const v0 = h.totalVolume();
  run(h, 100);
  assert.ok(Math.abs(h.totalVolume() - v0) < 0.01, `volume drifted by ${(h.totalVolume() - v0).toFixed(4)} mL`);
});

test('resting adult: pressures, volumes and output are in the normal range', () => {
  const h = steady();
  const L = h.stats.L, R = h.stats.R;
  between(L.sys, 110, 135, 'aortic systolic (mmHg)');
  between(L.dia, 70, 85, 'aortic diastolic (mmHg)');
  between(L.mean, 85, 100, 'MAP (mmHg)');
  between(L.edv, 110, 130, 'LV EDV (mL)');
  between(L.esv, 40, 60, 'LV ESV (mL)');
  between(L.ef * 100, 55, 65, 'EF (%)');
  between(L.co, 4.5, 6, 'cardiac output (L/min)');
  between(R.sys, 20, 30, 'pulmonary artery systolic (mmHg)');
  between(R.dia, 6, 14, 'pulmonary artery diastolic (mmHg)');
  const m = means(h, ['LA', 'RA', 'RV']);
  between(m.LA.mean, 5, 12, 'mean LA pressure (mmHg)');
  between(m.RA.mean, 0, 8, 'mean RA pressure (mmHg)');
  between(m.RV.max, 20, 30, 'RV systolic (mmHg)');
  between(m.RV.min, -1, 6, 'RV diastolic (mmHg)');
});

test('left and right ventricles pump the same volume per minute', () => {
  const h = steady();
  let fwdL = 0, fwdR = 0;
  run(h, 20, (x) => { fwdL += x.Q.aortic * DT; fwdR += x.Q.pulmonary * DT; });
  assert.ok(Math.abs(fwdL - fwdR) / fwdL < 0.02, `left ${fwdL.toFixed(0)} vs right ${fwdR.toFixed(0)}`);
});

test('valves follow pressure: open only when pressure behind them is higher', () => {
  const h = steady();
  let bad = [];
  run(h, 4, (x) => {
    const P = x.P;
    // AV valves: open exactly when atrium > ventricle.
    if (x.valveOpen.mitral !== (P.LA > P.LV)) bad.push(`mitral ${x.valveOpen.mitral} at LA ${P.LA.toFixed(1)} LV ${P.LV.toFixed(1)}`);
    if (x.valveOpen.tricuspid !== (P.RA > P.RV)) bad.push('tricuspid');
    // Semilunar valves: never shut while the ventricle is clearly above the artery.
    if (!x.valveOpen.aortic && P.LV > P.sysArt + 0.5) bad.push(`aortic shut at LV ${P.LV.toFixed(1)} > Ao ${P.sysArt.toFixed(1)}`);
    if (!x.valveOpen.pulmonary && P.RV > P.pulArt + 0.5) bad.push('pulmonary');
    // Open semilunar valve with backward pressure: only allowed during the brief closing backflow.
    if (x.valveOpen.aortic && x.Q.aortic < 0 && x.backflow.aortic > 1) bad.push('aortic backflow too large');
    if (x.valveOpen.mitral && x.valveOpen.aortic) bad.push('mitral and aortic open together');
  });
  assert.deepEqual(bad.slice(0, 3), []);
});

test('isovolumetric phases: LV volume does not change while both valves are shut', () => {
  const h = steady();
  let maxChange = 0, ref = null;
  run(h, 4, (x) => {
    const shut = !x.valveOpen.mitral && !x.valveOpen.aortic;
    if (shut) { if (ref == null) ref = x.V.LV; maxChange = Math.max(maxChange, Math.abs(x.V.LV - ref)); }
    else ref = null;
  });
  assert.ok(maxChange < 1, `LV volume changed ${maxChange.toFixed(2)} mL during an isovolumetric phase`);
});

test('every beat: atria → bicuspid closes (S1) → aortic opens → aortic closes (S2) → bicuspid opens', () => {
  const h = steady();
  const ev = run(h, 6).filter(e => e.type === 'beat' || (e.type === 'valve' && e.side === 'left') || e.type === 'sound');
  const seq = ev.map(e => e.type === 'beat' ? 'beat' : e.type === 'sound' ? e.sound : `${e.valve}${e.open ? '+' : '-'}`).join(' ');
  const cycle = 'beat mitral- S1 aortic+ aortic- S2 mitral+';
  assert.ok(seq.includes(`${cycle} ${cycle} ${cycle}`), seq);
});

test('timing at 75 bpm: systole ≈ 300 ms, diastole ≈ 500 ms', () => {
  const h = steady();
  const ev = run(h, 3);
  const mc = valveTimes(ev, 'mitral', false), ac = valveTimes(ev, 'aortic', false);
  const sys = ac[1] - mc[1], dia = h.rr - sys;
  between(sys, 260, 340, 'systole (ms)');
  between(dia, 460, 540, 'diastole (ms)');
});

test('most ventricular filling is passive; the atrial kick adds roughly the last 10–30 %', () => {
  const h = steady();
  // LV volume when the atria start to contract vs at end-diastole.
  let vAtStart = null, edv = null;
  const tBeat = h.t; // steady() ends on a beat boundary
  run(h, 1, (x) => {
    if (vAtStart == null && x.t >= tBeat + x.p.atrialDelay) vAtStart = x.V.LV;
    if (edv == null && vAtStart != null && !x.valveOpen.mitral && x.e.LV > 0) edv = x.V.LV;
  });
  const kick = (edv - vAtStart) / edv;
  between(kick * 100, 10, 30, 'atrial contribution to EDV (%)');
});

test('aortic pressure shows the dicrotic notch when the aortic valve snaps shut', () => {
  const h = steady();
  let minDiff = 0;
  const ev = [];
  run(h, 2, (x) => {
    if (x.valveOpen.aortic && x.Q.aortic < 0) minDiff = Math.min(minDiff, x.P.aorta - x.P.sysArt);
    ev.push(...x.events);
  });
  assert.ok(minDiff < -1, `aortic-root pressure dipped only ${minDiff.toFixed(2)} mmHg during closing backflow`);
});

test('Frank–Starling: more filling → larger EDV and larger stroke volume', () => {
  const base = steady().stats.L;
  const more = steady((h) => h.infuse(500)).stats.L;
  assert.ok(more.edv > base.edv + 10, `EDV ${base.edv.toFixed(0)} → ${more.edv.toFixed(0)}`);
  assert.ok(more.sv > base.sv + 5, `SV ${base.sv.toFixed(0)} → ${more.sv.toFixed(0)}`);
});

test('afterload: constricting arterioles raises ESV and lowers stroke volume (no reflex)', () => {
  const base = steady().stats.L;
  // Measure a few beats after the change, before slower volume shifts muddy the picture.
  const h = steady(); h.p.R.sys *= 1.6; run(h, 6);
  const hi = h.stats.L;
  assert.ok(hi.esv > base.esv + 5, `ESV ${base.esv.toFixed(0)} → ${hi.esv.toFixed(0)}`);
  assert.ok(hi.sv < base.sv - 3, `SV ${base.sv.toFixed(0)} → ${hi.sv.toFixed(0)}`);
  assert.ok(hi.mean > base.mean + 10, `MAP ${base.mean.toFixed(0)} → ${hi.mean.toFixed(0)}`);
});

test('contractility: stronger squeeze → smaller ESV, larger SV and EF', () => {
  const base = steady().stats.L;
  const s = steady((h) => { h.p.chambers.LV.Emax *= 1.3; h.p.chambers.RV.Emax *= 1.3; }).stats.L;
  assert.ok(s.esv < base.esv - 5, `ESV ${base.esv.toFixed(0)} → ${s.esv.toFixed(0)}`);
  assert.ok(s.sv > base.sv + 2 && s.ef > base.ef + 0.03, `SV ${base.sv.toFixed(0)} → ${s.sv.toFixed(0)}, EF ${base.ef.toFixed(2)} → ${s.ef.toFixed(2)}`);
});

test('a weakened left ventricle dams blood in the lungs until Frank–Starling rebalances the two sides', () => {
  const h = steady();
  const before = { pv: means(h, ['pulVen']).pulVen.mean, edv: h.stats.L.edv };
  h.p.chambers.LV.Emax *= 0.4;   // e.g. a large heart attack (no reflexes or kidney compensation here)
  run(h, 2);   // stats describe the last completed beat, i.e. the first weakened one
  const early = { L: h.stats.L.sv, R: h.stats.R.sv };
  assert.ok(early.R > early.L * 1.1, `first weak beat: right SV ${early.R.toFixed(1)} vs left ${early.L.toFixed(1)}`);
  run(h, 30);
  const late = { L: h.stats.L.sv, R: h.stats.R.sv };
  assert.ok(Math.abs(late.R - late.L) / late.L < 0.02, `after 30 beats: right ${late.R.toFixed(1)} vs left ${late.L.toFixed(1)}`);
  const pv = means(h, ['pulVen']).pulVen.mean;
  assert.ok(pv > before.pv + 3, `pulmonary venous pressure ${before.pv.toFixed(1)} → ${pv.toFixed(1)} mmHg`);
  assert.ok(h.stats.L.edv > before.edv + 10, `LV EDV ${before.edv.toFixed(0)} → ${h.stats.L.edv.toFixed(0)} (stretched ventricle)`);
});

test('faster heart rate shortens diastole much more than systole', () => {
  function phases(hr) {
    const h = steady((x) => { x.p.hr = hr; x.setMode('sinus'); });
    const ev = run(h, 3);
    const mc = valveTimes(ev, 'mitral', false)[1], ac = valveTimes(ev, 'aortic', false).find(t => t > mc);
    const sys = ac - mc;
    return { sys, dia: h.rr - sys };
  }
  const a = phases(75), b = phases(150);
  const sysShort = (a.sys - b.sys) / a.sys, diaShort = (a.dia - b.dia) / a.dia;
  assert.ok(diaShort > 1.5 * sysShort, `systole −${(sysShort * 100).toFixed(0)} %, diastole −${(diaShort * 100).toFixed(0)} %`);
  assert.ok(b.sys / (b.sys + b.dia) > a.sys / (a.sys + a.dia) + 0.1, 'systole takes up more of each cycle at the faster rate');
});

test('pacing very fast without sympathetic help: output rises far less than heart rate', () => {
  const co = (hr) => steady((x) => { x.p.hr = hr; x.setMode('sinus'); }, 60).stats.L;
  const a = co(75), b = co(180);
  assert.ok(b.sv < a.sv * 0.7, `SV ${a.sv.toFixed(0)} → ${b.sv.toFixed(0)}`);
  assert.ok(b.co / a.co < 0.6 * (180 / 75), `CO ×${(b.co / a.co).toFixed(2)} for HR ×${(180 / 75).toFixed(2)}`);
});

test('MAP ≈ CO × TPR + right atrial pressure', () => {
  const h = steady();
  const m = means(h, ['sysArt', 'RA'], 4);
  const co = h.stats.L.co * 1000 / 60; // mL/s
  const predicted = co * h.p.R.sys + m.RA.mean;
  assert.ok(Math.abs(predicted - m.sysArt.mean) / m.sysArt.mean < 0.05, `MAP ${m.sysArt.mean.toFixed(1)} vs CO×TPR+RAP ${predicted.toFixed(1)}`);
});

test('a stiffer aorta widens pulse pressure at a similar MAP', () => {
  const a = steady().stats.L;
  const b = steady((h) => h.setAorticStiffness(2)).stats.L;
  assert.ok(b.sys - b.dia > (a.sys - a.dia) * 1.4, `pulse pressure ${(a.sys - a.dia).toFixed(0)} → ${(b.sys - b.dia).toFixed(0)}`);
  assert.ok(Math.abs(b.mean - a.mean) / a.mean < 0.1, `MAP ${a.mean.toFixed(0)} → ${b.mean.toFixed(0)}`);
});

test('about two-thirds of the blood sits in the systemic veins', () => {
  const d = steady().distribution();
  between(d.sysVen * 100, 60, 75, 'systemic veins (% of volume)');
  assert.ok(d.sysArt < d.sysVen / 3);
});

test('manual squeeze: pressure alone moves the valves', () => {
  const h = steady();
  run(h, 0.7); // finish the current beat (ejection is over by 70 % of the cycle)
  h.setMode('manual');
  const aoBefore = h.P.sysArt;
  // No squeeze: nothing is ejected and arterial pressure drains away into the body.
  const idle = run(h, 2);
  assert.equal(valveTimes(idle, 'aortic', true).length, 0, 'aortic valve opened without a squeeze');
  assert.ok(h.P.sysArt < aoBefore - 15, `arterial pressure ${aoBefore.toFixed(0)} → ${h.P.sysArt.toFixed(0)}`);
  // Squeeze: bicuspid shuts first, then the aortic valve opens; release: aortic shuts, then bicuspid opens.
  h.squeeze(1);
  let ev = [];
  for (let i = 0; i < 600; i++) { h.advance(0.5); ev = ev.concat(h.takeEvents()); }
  h.squeeze(0);
  for (let i = 0; i < 1200; i++) { h.advance(0.5); ev = ev.concat(h.takeEvents()); }
  const seq = ev.filter(e => e.type === 'valve' && e.side === 'left').map(e => `${e.valve}${e.open ? '+' : '-'}`).join(' ');
  assert.equal(seq, 'mitral- aortic+ aortic- mitral+');
});
