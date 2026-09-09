// "Scientific unit tests": these assert the biology, not just the code.
// Run with:  npm test   (Node 18+)
const test = require('node:test');
const assert = require('node:assert/strict');
const { Neuron, nernst } = require('../engine.js');

function run(n, ms, onStep) {
  let events = [];
  for (let t = 0; t < ms; t += 0.05) {
    if (onStep) onStep(t);
    n.advance(0.05);
    events = events.concat(n.takeEvents());
  }
  return events;
}
function peak(n, ms, comp, onStep) {
  let pk = -Infinity;
  run(n, ms, (t) => { if (onStep) onStep(t); pk = Math.max(pk, (comp || n.soma).V); });
  return pk;
}

test('ion gradients: K⁺ high inside, Na⁺/Ca²⁺/Cl⁻ high outside', () => {
  const n = new Neuron();
  assert.ok(n.conc.K.in > n.conc.K.out);
  assert.ok(n.conc.Na.out > n.conc.Na.in);
  assert.ok(n.conc.Ca.out / n.conc.Ca.in > 1000);
  assert.ok(n.conc.Cl.out > n.conc.Cl.in);
});

test('Nernst potentials have the right sign and magnitude', () => {
  const n = new Neuron();
  const E = n.E;
  assert.ok(E.K < -80 && E.K > -100, 'EK ≈ −90 mV');
  assert.ok(E.Na > 50 && E.Na < 75, 'ENa ≈ +60 mV');
  assert.ok(E.Ca > 100, 'ECa strongly positive');
  assert.ok(E.Cl < -60 && E.Cl > -90, 'ECl near or below rest');
  assert.ok(Math.abs(nernst(1, 10, 100, 37) - (-61.5)) < 1, 'tenfold gradient ≈ 61.5 mV at 37 °C');
});

test('resting potential is ≈ −70 mV and stable', () => {
  const n = new Neuron();
  run(n, 100);
  for (const c of n.comps) assert.ok(Math.abs(c.V + 70) < 1, `${c.name} rests at ${c.V.toFixed(1)}`);
});

test('opening Na⁺ conductance at −70 mV produces inward Na⁺ current and depolarizes', () => {
  const n = new Neuron();
  n.manual.gNa = 0.001;
  n.advance(0.5);
  assert.ok(n.soma.iNa < 0, 'inward (negative) Na⁺ current');
  const pk = peak(n, 10);
  assert.ok(pk > -68, `depolarized to ${pk.toFixed(1)}`);
});

test('opening K⁺ conductance produces outward K⁺ current and hyperpolarizes', () => {
  const n = new Neuron();
  n.manual.gK = 0.004;
  n.advance(0.5);
  assert.ok(n.soma.iK > 0, 'outward (positive) K⁺ current');
  run(n, 20);
  assert.ok(n.soma.V < -73, `hyperpolarized to ${n.soma.V.toFixed(1)}`);
});

test('K⁺ conductance during depolarization carries outward current that repolarizes', () => {
  const make = () => { const n = new Neuron(); n.naBlock = 1; n.manual.gNa = 0.04; run(n, 15); return n; };
  const withoutK = make(), withK = make();
  assert.ok(withK.soma.V > -40, 'membrane was depolarized by a Na⁺ leak');
  withK.manual.gK = 0.02; withK.advance(0.2);
  assert.ok(withK.soma.iK > 0, 'outward K⁺ current at depolarized Vm');
  run(withoutK, 10); run(withK, 10);
  assert.ok(withK.soma.V < withoutK.soma.V - 5, `K⁺ conductance repolarized: ${withK.soma.V.toFixed(1)} vs ${withoutK.soma.V.toFixed(1)}`);
});

test('a single EPSP is subthreshold (≈ 4–9 mV) and does not trigger an AP', () => {
  const n = new Neuron();
  n.fireInput('A');
  let spiked = false; let pk = -Infinity;
  run(n, 40, () => { pk = Math.max(pk, n.soma.V); }).forEach(e => { if (e.type === 'spike') spiked = true; });
  assert.ok(!spiked);
  assert.ok(pk > -66 && pk < -61, `EPSP peak ${pk.toFixed(1)}`);
});

test('EPSPs sum: two stay subthreshold, three close together cross threshold and fire', () => {
  let n = new Neuron();
  n.fireInput('A');
  let ev = run(n, 40, (t) => { if (Math.abs(t - 3) < 0.03) n.fireInput('B'); });
  assert.ok(!ev.some(e => e.type === 'spike'), 'two EPSPs: no AP');

  n = new Neuron();
  n.fireInput('A');
  ev = run(n, 40, (t) => { if (Math.abs(t - 3) < 0.03) n.fireInput('B'); if (Math.abs(t - 6) < 0.03) n.fireInput('A'); });
  const spikes = ev.filter(e => e.type === 'spike');
  assert.ok(spikes.length > 0, 'three EPSPs: AP');
  assert.equal(spikes[0].name, 'hillock', 'the AP starts at the axon hillock');
});

test('an inhibitory input can prevent the same excitation from firing', () => {
  const n = new Neuron();
  n.fireInput('C'); n.fireInput('A');
  const ev = run(n, 40, (t) => { if (Math.abs(t - 3) < 0.03) n.fireInput('B'); if (Math.abs(t - 6) < 0.03) n.fireInput('A'); });
  assert.ok(!ev.some(e => e.type === 'spike'));
  assert.equal(n.input('C').receptor.type, 'inhibitory');
});

test('the AP overshoots 0 mV, then undershoots below rest (after-hyperpolarization)', () => {
  const n = new Neuron();
  n.setStim('soma', 0.5);
  let pk = -Infinity, trough = Infinity;
  run(n, 25, (t) => { if (t > 2) n.setStim('soma', 0); pk = Math.max(pk, n.soma.V); if (t > 4) trough = Math.min(trough, n.soma.V); });
  assert.ok(pk > 10, `peak ${pk.toFixed(1)}`);
  assert.ok(trough < -74, `undershoot ${trough.toFixed(1)}`);
});

test('Na⁺ channels inactivate shortly after the AP (basis of the refractory period)', () => {
  const n = new Neuron();
  n.setStim('soma', 0.5);
  let hAtRest = n.hillock.h, hMin = 1;
  run(n, 10, (t) => { if (t > 2) n.setStim('soma', 0); hMin = Math.min(hMin, n.hillock.h); });
  assert.ok(hAtRest > 0.5 && hMin < 0.2, `h fell from ${hAtRest.toFixed(2)} to ${hMin.toFixed(2)}`);
});

test('the AP propagates from hillock to terminal in order, with a delay', () => {
  const n = new Neuron();
  n.setStim('soma', 0.5);
  const ev = run(n, 20, (t) => { if (t > 2) n.setStim('soma', 0); }).filter(e => e.type === 'spike');
  const order = ev.filter(e => /^(hillock|axon\d+|terminal)$/.test(e.name)).map(e => e.name);
  const expected = ['hillock'].concat(n.axon.map(c => c.name)).concat(['terminal']);
  assert.deepEqual(order, expected);
  const tH = ev.find(e => e.name === 'hillock').t, tT = ev.find(e => e.name === 'terminal').t;
  assert.ok(tT - tH > 1 && tT - tH < 10, `conduction delay ${(tT - tH).toFixed(2)} ms`);
});

test('the AP opens terminal Ca²⁺ channels, Ca²⁺ enters, and transmitter is released', () => {
  const n = new Neuron();
  n.setStim('soma', 0.5);
  let sPk = 0, caPk = 0, iCaMin = 0, ntPk = 0;
  const ev = run(n, 25, (t) => {
    if (t > 2) n.setStim('soma', 0);
    sPk = Math.max(sPk, n.terminal.s); caPk = Math.max(caPk, n.terminal.ca);
    iCaMin = Math.min(iCaMin, n.terminal.iCa); ntPk = Math.max(ntPk, n.terminal.nt);
  });
  assert.ok(sPk > 0.5, 'Ca²⁺ channels opened');
  assert.ok(iCaMin < 0, 'Ca²⁺ current is inward');
  assert.ok(caPk > 10 * n.terminal.ca0, 'cytosolic Ca²⁺ rose');
  assert.ok(ntPk > 0.05, 'transmitter appeared in the cleft');
  assert.ok(ev.some(e => e.type === 'release' && e.input === 'output'));
});

test('released transmitter depolarizes the next neuron (an EPSP)', () => {
  const n = new Neuron();
  n.setStim('soma', 0.5);
  let pk = -Infinity;
  run(n, 30, (t) => { if (t > 2) n.setStim('soma', 0); pk = Math.max(pk, n.next.V); });
  assert.ok(pk > -67 && pk < -40, `next-neuron EPSP peak ${pk.toFixed(1)}`);
});

test('no AP at the terminal → no release', () => {
  const n = new Neuron();
  let ntPk = 0;
  run(n, 30, () => { ntPk = Math.max(ntPk, n.terminal.nt); });
  assert.ok(ntPk < 1e-3, 'no transmitter in the cleft');
});

test('blocking voltage-gated Na⁺ channels (TTX) prevents the AP', () => {
  const n = new Neuron();
  n.naBlock = 1;
  n.fireInput('A');
  const ev = run(n, 40, (t) => { if (Math.abs(t - 2) < 0.03) n.fireInput('B'); if (Math.abs(t - 4) < 0.03) n.fireInput('A'); });
  assert.ok(!ev.some(e => e.type === 'spike'));
});

test('blocking Ca²⁺ channels at the terminal prevents release even though the AP arrives', () => {
  const n = new Neuron();
  n.terminal.caBlock = 1;
  n.setStim('soma', 0.5);
  let ntPk = 0;
  const ev = run(n, 25, (t) => { if (t > 2) n.setStim('soma', 0); ntPk = Math.max(ntPk, n.terminal.nt); });
  assert.ok(ev.some(e => e.type === 'spike' && e.name === 'terminal'), 'AP reached the terminal');
  assert.ok(ntPk < 0.01, 'but no transmitter was released');
});

test('raising extracellular K⁺ depolarizes the resting membrane', () => {
  const n = new Neuron();
  n.conc.K.out = 12;
  run(n, 80);
  assert.ok(n.soma.V > -62, `rest with high K⁺: ${n.soma.V.toFixed(1)}`);
});

test('turning the pump off does not change Vm immediately (gradients, not the pump, set Vm)', () => {
  const n = new Neuron();
  n.pumpOn = false; n.pumpRundownRate = 0;
  run(n, 50);
  assert.ok(Math.abs(n.soma.V + 70) < 1);
  n.pumpRundownRate = 0.05; // accelerated rundown
  run(n, 200);
  assert.ok(n.soma.V > -60, `after gradients run down: ${n.soma.V.toFixed(1)}`);
});
