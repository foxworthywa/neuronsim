// "Scientific unit tests" for the skeletal muscle fibre: they assert the physiology in
// docs/MUSCLE_MODULE.md ("Acceptance tests"), not just the code.
// Run with:  npm test   (Node 18+)
const test = require('node:test');
const assert = require('node:assert/strict');
const { MuscleFibre } = require('../muscle.js');

// One fibre, reset between tests (construction runs a threshold search).
const fibre = new MuscleFibre();
function fresh(setup) {
  fibre.reset();
  if (setup) setup(fibre);
  return fibre;
}

/** Advance `ms`, collecting events and per-0.1 ms samples of a few readouts. */
function run(f, ms, onStep) {
  const ev = [], rec = [];
  const step = 0.1;
  for (let t = 0; t < ms - 1e-9; t += step) {
    if (onStep) onStep(f.t);
    f.advance(step);
    const e = f.takeEvents(); for (const x of e) ev.push(x);
    rec.push({ t: f.t, V: f.endplate.V, V3: f.byName.R3.V, ca: f.ca, force: f.force, g: f.receptor.g });
  }
  return { ev, rec };
}
const spikes = (ev, name) => ev.filter(e => e.type === 'spike' && (!name || e.name === name)).length;
const maxOf = (rec, k) => rec.reduce((m, r) => Math.max(m, r[k]), -Infinity);
const minOf = (rec, k) => rec.reduce((m, r) => Math.min(m, r[k]), Infinity);
const REST = -85, BASE_F = 0.03, BASE_CA = 0.15;

test('gradients and Nernst potentials as in the neuron', () => {
  const f = fresh();
  assert.ok(f.conc.K.in > f.conc.K.out && f.conc.Na.out > f.conc.Na.in && f.conc.Ca.out / f.conc.Ca.in > 1000);
  const E = f.E;
  assert.ok(E.K < -90 && E.K > -100, 'E_K ≈ −95');
  assert.ok(E.Na > 60 && E.Na < 75, 'E_Na ≈ +67');
  assert.ok(E.Ca > 100);
});

test('rests at −85 mV, stably, in every segment', () => {
  const f = fresh();
  run(f, 100);
  for (const c of f.comps) assert.ok(Math.abs(c.V - REST) < 1, `${c.name} rests at ${c.V.toFixed(1)}`);
  assert.ok(f.force < BASE_F && f.ca < BASE_CA, 'no force or Ca²⁺ at rest');
});

test('the resting membrane is mostly K⁺-permeable; opening Na⁺ channels depolarizes, K⁺ hyperpolarizes', () => {
  let f = fresh();
  assert.ok(f.endplate.gKLeak > 5 * f.endplate.gNaLeak, 'K⁺ leak dominates');
  f.manual.gNa = 0.9; run(f, 10);
  assert.ok(f.endplate.V > REST + 5, `Na⁺ opened by hand: ${f.endplate.V.toFixed(1)}`);
  f = fresh(); f.manual.gK = 6; run(f, 10);
  assert.ok(f.endplate.V < REST - 2, `K⁺ opened by hand: ${f.endplate.V.toFixed(1)}`);
});

test('a subthreshold shock decays back to rest; a suprathreshold shock fires an all-or-none spike', () => {
  let f = fresh(); f.shock(0.5); let r = run(f, 20);
  assert.equal(spikes(r.ev, 'R3'), 0, 'no propagated spike below threshold');
  assert.ok(Math.abs(f.byName.R3.V - REST) < 1.5, 'back to rest');
  f = fresh(); f.shock(1.2); r = run(f, 30);
  const peakA = maxOf(r.rec, 'V3');
  assert.equal(spikes(r.ev, 'R3'), 1);
  assert.ok(peakA > 20, `overshoot: ${peakA.toFixed(1)}`);
  assert.ok(minOf(r.rec.filter(x => x.t > 8), 'V3') < REST - 3, 'a dip below rest after the spike');
  f = fresh(); f.shock(2.4); r = run(f, 30);
  const peakB = maxOf(r.rec, 'V3');
  assert.ok(Math.abs(peakA - peakB) < 2, `all-or-none: ${peakA.toFixed(1)} vs ${peakB.toFixed(1)}`);
  assert.ok(r.rec.filter(x => x.V3 > -30).length * 0.1 < 3, 'spike lasts a couple of ms');
});

test('the threshold readout is ≈ 1 in normal fluid', () => {
  const f = fresh();
  const th = f.thresholdStrength();
  assert.ok(th > 0.9 && th < 1.15, `threshold ${th.toFixed(2)}`);
});

test('refractory period: a 2× shock 3 ms after a spike fails, 20 ms after it succeeds', () => {
  let f = fresh(); f.pair(3, 2); let r = run(f, 40);
  assert.equal(spikes(r.ev, 'R3'), 1, 'second shock in the refractory period does nothing');
  f = fresh(); f.pair(20, 2); r = run(f, 40);
  assert.equal(spikes(r.ev, 'R3'), 2);
});

test('the impulse spreads from the end plate to both ends, in order, over a few ms', () => {
  const f = fresh(); f.shock(1.5);
  const { ev } = run(f, 30);
  const sp = ev.filter(e => e.type === 'spike');
  assert.equal(sp.length, f.comps.length, 'every segment spikes');
  const tOf = (n) => sp.find(e => e.name === n).t;
  assert.ok(tOf('R1') < tOf('R4') && tOf('R4') < tOf('R8'), 'in distance order (right)');
  assert.ok(tOf('L1') < tOf('L4') && tOf('L4') < tOf('L8'), 'in distance order (left)');
  const delay = tOf('R8') - tOf('endplate');
  assert.ok(delay > 2 && delay < 10, `end-to-end delay ${delay.toFixed(1)} ms`);
  assert.ok(f.endplate.V < -60, 'the end plate has repolarized before the far end fires... or soon after');
});

test('one twitch: spike → Ca²⁺ → force, force outlasts the spike, all return to baseline', () => {
  const f = fresh(); f.shock(1.5);
  const { ev, rec } = run(f, 260);
  const tSpike = ev.find(e => e.type === 'spike' && e.name === 'R3').t;
  const caPeak = maxOf(rec, 'ca'), tCa = rec.find(x => x.ca === caPeak).t;
  const fPeak = maxOf(rec, 'force'), tF = rec.find(x => x.force === fPeak).t;
  assert.ok(tSpike < tCa && tCa < tF, `order: spike ${tSpike.toFixed(1)} < Ca ${tCa.toFixed(1)} < force ${tF.toFixed(1)}`);
  assert.ok(caPeak > 1, `Ca²⁺ rises into the µM range (${caPeak.toFixed(2)})`);
  assert.ok(fPeak > 0.2 && fPeak < 0.35, `twitch ≈ 0.27 (${fPeak.toFixed(2)})`);
  assert.ok(tF > 20 && tF < 50, `time to peak ≈ 33 ms (${tF.toFixed(0)})`);
  const spikeMs = rec.filter(x => x.V3 > -30).length * 0.1;
  const forceMs = rec.filter(x => x.force > BASE_F).length * 0.1;
  assert.ok(forceMs > 20 * spikeMs, `force (${forceMs.toFixed(0)} ms) lasts far longer than the spike (${spikeMs.toFixed(1)} ms)`);
  assert.ok(f.force < BASE_F && f.ca < BASE_CA, 'back to baseline');
  assert.ok(ev.some(e => e.type === 'ca_release') && ev.some(e => e.type === 'twitch_peak') && ev.some(e => e.type === 'relaxed'), 'events emitted');
});

test('summation and tetanus: a 20 ms doublet adds, 10 Hz is unfused, 50 Hz fuses, 100 Hz reads ≈ 1', () => {
  let f = fresh(); f.shock(1.5); const single = maxOf(run(f, 250).rec, 'force');
  f = fresh(); f.pair(20, 1.5); const dbl = maxOf(run(f, 250).rec, 'force');
  assert.ok(dbl > 1.3 * single, `doublet ${dbl.toFixed(2)} vs twitch ${single.toFixed(2)}`);
  const plateau = (hz) => { f = fresh(); f.train(hz, Math.round(hz * 0.5), 1.5); const { rec, ev } = run(f, 500); const late = rec.filter(x => x.t > 250 && x.t < 480); const mx = maxOf(late, 'force'), mn = minOf(late, 'force'); return { mx, ripple: (mx - mn) / mx, fused: ev.some(e => e.type === 'tetanus_fused'), spikes: spikes(ev, 'R3') }; };
  const p10 = plateau(10), p50 = plateau(50), p100 = plateau(100);
  assert.ok(p10.ripple > 0.5 && !p10.fused, `10 Hz unfused (ripple ${(p10.ripple * 100).toFixed(0)} %)`);
  assert.ok(p50.ripple < 0.1 && p50.fused && p50.mx > 2.2 * single, `50 Hz fused at ${p50.mx.toFixed(2)}`);
  assert.ok(p100.mx > 0.9 && p100.mx <= 1.05 && p100.mx > 3 * single, `100 Hz ≈ 1 (${p100.mx.toFixed(2)})`);
  assert.equal(p100.spikes, 50, 'the spikes stay separate at 100 Hz');
});

test('Ca²⁺-free bath (Mg²⁺ substituted): a shock still twitches; a command releases nothing', () => {
  let f = fresh(); f.shock(1.5); const control = maxOf(run(f, 250).rec, 'force');
  f = fresh(f => f.setCaFreeBath(true)); run(f, 20);
  assert.ok(Math.abs(f.gatingShift) < 0.5, 'excitability unchanged');
  f.shock(1.5); const r = run(f, 250);
  assert.ok(Math.abs(maxOf(r.rec, 'force') - control) < 0.05 * control + 0.01, 'twitch within 5 % of control');
  f = fresh(f => f.setCaFreeBath(true)); f.command(); const r2 = run(f, 120);
  assert.equal(r2.ev.filter(e => e.type === 'release').length, 0, 'no release');
  assert.ok(maxOf(r2.rec, 'force') < BASE_F, 'no twitch');
});

test('no ATP: one contraction, then force and Ca²⁺ never fall (rigor)', () => {
  const f = fresh(f => { f.atp = 0; }); f.shock(1.5);
  const { rec } = run(f, 400);
  assert.ok(maxOf(rec, 'force') > 0.5, 'contracted');
  assert.ok(f.force > 0.9 * maxOf(rec, 'force'), `locked (${f.force.toFixed(2)})`);
  assert.ok(f.ca > 1, `Ca²⁺ stays up (${f.ca.toFixed(2)} µM)`);
});

test('a leaky SR release channel contracts the fibre with no impulses; dantrolene relaxes it', () => {
  const f = fresh(f => { f.ryrLeak = 0.3; });
  const { ev } = run(f, 400);
  assert.equal(spikes(ev), 0, 'no impulses');
  assert.ok(f.force > 0.5, `sustained force ${f.force.toFixed(2)}`);
  f.dantrolene = 1; run(f, 400);
  assert.ok(f.force < BASE_F, `relaxed by dantrolene (${f.force.toFixed(3)})`);
});

test('a nerve command → release → end-plate potential → impulse → twitch; the EPP alone is ≈ 2× threshold', () => {
  let f = fresh(); f.command();
  const { ev, rec } = run(f, 250);
  const types = ev.map(e => e.type);
  assert.ok(types.includes('command') && types.includes('release') && types.includes('spike') && types.includes('twitch_peak'));
  assert.ok(ev.find(e => e.type === 'release').t < ev.find(e => e.type === 'spike').t, 'release precedes the spike');
  assert.ok(maxOf(rec, 'force') > 0.2, 'twitch');
  f = fresh(f => { f.naBlock = 1; }); f.command(); const r2 = run(f, 40);
  const epp = maxOf(r2.rec, 'V') - REST, step = -60 - REST;
  assert.ok(r2.ev.some(e => e.type === 'epp_peak'), 'epp_peak event');
  assert.ok(epp / step > 1.7 && epp / step < 2.5, `EPP ${epp.toFixed(0)} mV is ${(epp / step).toFixed(1)}× the threshold step`);
});

test('receptor block: a full twitch at 50 %, failure at 85 %; neostigmine rescues 85 % but not 95 %; sugammadex does', () => {
  let f = fresh(); f.command(); const control = maxOf(run(f, 200).rec, 'force');
  f = fresh(f => { f.receptor.block = 0.5; }); f.command(); let r = run(f, 200);
  assert.ok(spikes(r.ev, 'R3') === 1 && Math.abs(maxOf(r.rec, 'force') - control) < 0.05 * control, 'half block: full-size twitch');
  f = fresh(f => { f.receptor.block = 0.85; }); f.command(); r = run(f, 200);
  assert.ok(spikes(r.ev, 'R3') === 0 && maxOf(r.rec, 'force') < BASE_F, '85 % block: no twitch');
  f = fresh(f => { f.receptor.block = 0.85; f.acheActivity = 0.3; }); f.command(); r = run(f, 200);
  assert.equal(spikes(r.ev, 'R3'), 1, 'neostigmine at 85 %: twitch returns');
  f = fresh(f => { f.receptor.block = 0.95; f.acheActivity = 0.3; }); f.command(); r = run(f, 200);
  assert.equal(spikes(r.ev, 'R3'), 0, 'neostigmine at 95 %: nothing');
  f = fresh(f => { f.receptor.block = 0.95; }); f.receptor.block = 0; f.command(); r = run(f, 200);
  assert.equal(spikes(r.ev, 'R3'), 1, 'sugammadex (block removed): twitch');
});

test('myasthenia: with 20 % of the receptors the first command twitches and later ones fail; pyridostigmine restores the train; overdose blocks', () => {
  let f = fresh(f => { f.receptorDensity = 0.2; }); f.commandTrain(3, 6); let r = run(f, 2000);
  const n = spikes(r.ev, 'R3');
  assert.ok(n >= 1 && n < 6, `${n} of 6 commands fire`);
  assert.ok(r.ev.filter(e => e.type === 'spike' && e.name === 'R3')[0].t < 400, 'the first one fires');
  f = fresh(f => { f.receptorDensity = 0.2; f.acheActivity = 0.3; }); f.commandTrain(3, 6); r = run(f, 2000);
  assert.equal(spikes(r.ev, 'R3'), 6, 'pyridostigmine: all six fire');
  f = fresh(f => { f.receptorDensity = 0.2; f.acheActivity = 0.05; }); f.commandTrain(20, 30); r = run(f, 1600);
  const late = r.ev.filter(e => e.type === 'spike' && e.name === 'R3' && e.t > 800).length;
  assert.ok(spikes(r.ev, 'R3') >= 1 && late === 0, 'overdose: repetitive commands fail (depolarizing block)');
});

test('persistent agonist (succinylcholine): a spontaneous impulse, then commands and end-plate shocks fail while a far shock still fires', () => {
  const f = fresh(f => { f.agonist = 0.6; });
  const { ev } = run(f, 1000);
  assert.ok(spikes(ev, 'R3') >= 1, 'fasciculation');
  assert.ok(f.endplate.V > -60, `end plate held depolarized (${f.endplate.V.toFixed(1)})`);
  f.command(); assert.equal(spikes(run(f, 80).ev, 'R3'), 0, 'command fails');
  f.shock(2); assert.equal(spikes(run(f, 30).ev, 'R3'), 0, 'end-plate shock fails');
  f.shock(2, 0.5, 'end'); assert.equal(spikes(run(f, 30).ev, 'R7'), 1, 'a shock at the far end still fires there');
  assert.ok(f.conc.K.out > 4.3, 'K⁺ has leaked out');
});

test('no acetylcholinesterase: the end-plate potential lasts > 3× longer but not forever; a 20 Hz train ends in depolarizing block; pralidoxime restores', () => {
  const dur = (rec) => rec.filter(x => x.V > -75).length * 0.1;
  let f = fresh(f => { f.naBlock = 1; }); f.command(); const normal = dur(run(f, 300).rec);
  f = fresh(f => { f.naBlock = 1; f.acheActivity = 0; }); f.command(); const blocked = dur(run(f, 300).rec);
  assert.ok(blocked > 3 * normal && blocked < 300, `EPP ${normal.toFixed(0)} → ${blocked.toFixed(0)} ms`);
  f = fresh(f => { f.acheActivity = 0; }); f.commandTrain(20, 30); let r = run(f, 1600);
  assert.ok(spikes(r.ev, 'R3') >= 1 && r.ev.filter(e => e.type === 'spike' && e.name === 'R3' && e.t > 800).length === 0, 'fires, then block');
  f = fresh(f => { f.acheActivity = 0; }); f.acheActivity = 1; f.commandTrain(20, 30); r = run(f, 1600);
  assert.equal(spikes(r.ev, 'R3'), 30, 'pralidoxime (AChE restored): every command fires');
});

test('botulinum: Ca²⁺ enters the terminal but nothing is released; a direct shock still twitches', () => {
  const f = fresh(f => { f.releaseBlock = 1; }); f.command();
  let r = run(f, 150);
  assert.ok(r.rec.length && f.terminal.ca >= 0.1, 'terminal intact');
  assert.equal(r.ev.filter(e => e.type === 'release').length, 0, 'no release');
  assert.ok(maxOf(r.rec, 'force') < BASE_F, 'no twitch');
  f.shock(1.5); r = run(f, 200);
  assert.ok(maxOf(r.rec, 'force') > 0.2, 'shock twitches');
});

test('potassium: 7 mM depolarizes rest and lowers threshold; 11 mM silences commands and IV calcium restores them; 12 mM blocks everything; 2.5 mM hyperpolarizes', () => {
  let f = fresh(f => { f.conc.K.out = 7; }); run(f, 200);
  assert.ok(f.endplate.V > -78 && f.endplate.V < -70, `K⁺ 7: rest ${f.endplate.V.toFixed(1)}`);
  assert.ok(f.thresholdStrength() < 0.9, 'easier to fire');
  f.command(); assert.equal(spikes(run(f, 80).ev, 'R3'), 1, 'commands still work at 7 mM');
  f = fresh(f => { f.conc.K.out = 11; }); run(f, 200); f.command();
  assert.equal(spikes(run(f, 80).ev, 'R3'), 0, 'K⁺ 11: commands fail');
  f = fresh(f => { f.conc.K.out = 11; f.conc.Ca.out = 3; }); run(f, 200); f.command();
  assert.equal(spikes(run(f, 80).ev, 'R3'), 1, 'K⁺ 11 + Ca²⁺ 3: commands work again');
  f = fresh(f => { f.conc.K.out = 12; }); run(f, 200); f.shock(2);
  assert.equal(spikes(run(f, 40).ev, 'R3'), 0, 'K⁺ 12: no spike to a 2× shock');
  f.command(); assert.equal(spikes(run(f, 80).ev, 'R3'), 0, 'K⁺ 12: no spike to a command');
  f = fresh(f => { f.conc.K.out = 2.5; }); run(f, 200);
  assert.ok(f.endplate.V < -92 && f.endplate.V > -100, `K⁺ 2.5: rest ${f.endplate.V.toFixed(1)}`);
  assert.ok(f.thresholdStrength() > 1.2, 'a stronger shock is needed');
  f.command(); assert.equal(spikes(run(f, 80).ev, 'R3'), 1, 'a command still fires');
});

test('calcium and magnesium: low Ca²⁺ lowers threshold and wakes the nerve; high Ca²⁺ raises it; Mg²⁺ 5 mM blocks release and Ca²⁺ 3 mM reverses that', () => {
  let f = fresh(f => { f.conc.Ca.out = 1; f.nerveEnabled = false; }); run(f, 50);
  assert.ok(f.thresholdStrength() < 0.93, 'threshold lower at 1 mM');
  assert.equal(spikes(run(f, 2000).ev, 'R3'), 0, 'the fibre itself does not fire spontaneously');
  assert.ok(f.spontaneousRate > 3, `the nerve would (${f.spontaneousRate.toFixed(1)} Hz)`);
  f.command(); assert.equal(spikes(run(f, 80).ev, 'R3'), 1, 'commands still transmit');
  f = fresh(f => { f.conc.Ca.out = 1; }); const r = run(f, 2000);
  assert.ok(r.ev.some(e => e.type === 'spontaneous_command'), 'spontaneous commands appear');
  f = fresh(f => { f.conc.Ca.out = 3.5; }); run(f, 50);
  assert.ok(f.thresholdStrength() > 1.1, 'threshold higher at 3.5 mM');
  f = fresh(f => { f.conc.Mg.out = 5; }); run(f, 50); f.command();
  assert.equal(spikes(run(f, 120).ev, 'R3'), 0, 'Mg²⁺ 5: command fails');
  f.shock(1.5); assert.ok(maxOf(run(f, 200).rec, 'force') > 0.2, 'a shock still twitches');
  f = fresh(f => { f.conc.Mg.out = 5; f.conc.Ca.out = 3; }); run(f, 50); f.command();
  assert.equal(spikes(run(f, 120).ev, 'R3'), 1, 'Mg²⁺ 5 + Ca²⁺ 3: command works');
});

test('TTX blocks the spike and the twitch from shock or command, but not the end-plate potential', () => {
  const f = fresh(f => { f.naBlock = 1; });
  f.shock(2); let r = run(f, 100);
  assert.equal(spikes(r.ev), 0); assert.ok(maxOf(r.rec, 'force') < BASE_F);
  f.command(); r = run(f, 100);
  assert.equal(spikes(r.ev), 0); assert.ok(maxOf(r.rec, 'V') > -50, 'EPP visible'); assert.ok(maxOf(r.rec, 'force') < BASE_F);
});

test('switching the pump off does not change Vm immediately; with the accelerated rundown it drifts', () => {
  const f = fresh(f => { f.pumpOn = false; f.pumpRundownRate = 0.02; });
  run(f, 5);
  assert.ok(Math.abs(f.endplate.V - REST) < 0.5, 'unchanged at first');
  run(f, 1500);
  assert.ok(f.endplate.V > REST + 5, `drifted to ${f.endplate.V.toFixed(1)} as E_K fell`);
});
