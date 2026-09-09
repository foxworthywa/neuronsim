/*
 * NeuronSim engine — a small conductance-based model of one neuron.
 *
 * Everything the student sees (ions moving, channels opening, the voltage
 * trace, vesicles fusing) is rendered from the state held here. Nothing in the
 * UI sets a voltage directly.
 *
 * Units: mV, ms, µS (conductance), nF (capacitance), nA (current), mM (concentration),
 *        µM for cytosolic Ca²⁺ inside a terminal.
 *
 * Works both as a browser global (window.NeuronSim) and as a CommonJS module so
 * the biology tests in tests/ run against exactly the same code as the page.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NeuronSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const R = 8.314;      // J/(mol·K)
  const F = 96485;      // C/mol

  /** Nernst equilibrium potential in mV for an ion of valence z. */
  function nernst(z, outside, inside, tempC) {
    const T = 273.15 + (tempC == null ? 37 : tempC);
    return (1000 * R * T) / (z * F) * Math.log(outside / inside);
  }

  function expEuler(x, xinf, tau, dt) {
    return xinf + (x - xinf) * Math.exp(-dt / tau);
  }

  // x / (1 - exp(-x/y)) with the removable singularity handled.
  function vtrap(x, y) {
    return Math.abs(x / y) < 1e-6 ? y * (1 - x / y / 2) : x / (1 - Math.exp(-x / y));
  }

  // Hodgkin–Huxley gating kinetics, shifted so the resting potential is ≈ −70 mV.
  const HH_SHIFT = 0;
  function hhRates(V) {
    const v = V + HH_SHIFT;
    const am = 0.1 * vtrap(v + 40, 10), bm = 4 * Math.exp(-(v + 65) / 18);
    const ah = 0.07 * Math.exp(-(v + 65) / 20), bh = 1 / (1 + Math.exp(-(v + 35) / 10));
    const an = 0.01 * vtrap(v + 55, 10), bn = 0.125 * Math.exp(-(v + 65) / 80);
    return {
      minf: am / (am + bm), taum: 1 / (am + bm),
      hinf: ah / (ah + bh), tauh: 1 / (ah + bh),
      ninf: an / (an + bn), taun: 1 / (an + bn),
    };
  }

  // ---------------------------------------------------------------------------
  // Default biology (see docs/BIOLOGY.md)
  // ---------------------------------------------------------------------------
  const DEFAULT_CONC = {
    Na: { out: 145, in: 12 },
    K:  { out: 4,   in: 140 },
    Cl: { out: 110, in: 6 },
    Ca: { out: 2,   in: 0.0001 },
  };

  const N_AXON = 12;

  // Areas in µm², channel densities in mS/cm².
  function defaultCompartmentSpecs() {
    const specs = [
      { name: 'dendrite', kind: 'dendrite', area: 2000, gNa: 0,   gK: 0,   gL: 0.1 },
      { name: 'soma',     kind: 'soma',     area: 1250, gNa: 30,  gK: 4,   gL: 0.1 },
      { name: 'hillock',  kind: 'hillock',  area: 250,  gNa: 300, gK: 70, gL: 0.1 },
    ];
    for (let i = 0; i < N_AXON; i++) {
      specs.push({ name: 'axon' + (i + 1), kind: 'axon', index: i, area: 314, gNa: 120, gK: 36, gL: 0.1 });
    }
    specs.push({ name: 'terminal', kind: 'terminal', area: 300, gNa: 120, gK: 36, gL: 0.1, gCa: 20 });
    return specs;
  }

  // Axial conductances (µS) between compartment i and i+1.
  function defaultAxialConductances(n) {
    const g = [];
    for (let i = 0; i < n - 1; i++) {
      if (i === 0) g.push(0.05);        // dendrite–soma (thick)
      else if (i === 1) g.push(0.03);   // soma–hillock
      else if (i === 2) g.push(0.012);  // hillock–axon1
      else g.push(0.008);               // axon–axon (1 µm diameter, 100 µm segments)
    }
    return g;
  }

  // Stereotyped action-potential waveform used to drive *input* terminals
  // (the presynaptic neurons are not simulated in full).
  function templateAP(tSinceSpike) {
    const t = tSinceSpike;
    if (t < 0) return -70;
    if (t < 0.5) return -70 + (40 + 70) * (t / 0.5);            // rise to +40
    if (t < 1.7) return 40 - (40 + 80) * ((t - 0.5) / 1.2);      // fall to −80
    if (t < 5)   return -80 + 10 * ((t - 1.7) / 3.3);            // recover to −70
    return -70;
  }

  // ---------------------------------------------------------------------------
  // Presynaptic terminal: voltage → Ca²⁺ channel → Ca²⁺ → vesicle fusion → transmitter
  // ---------------------------------------------------------------------------
  class Terminal {
    constructor(opts) {
      opts = opts || {};
      this.name = opts.name || 'terminal';
      this.gCa = opts.gCa != null ? opts.gCa : 0.06;   // µS (fully open)
      this.s = 0;               // Ca channel activation (0..1)
      this.ca = 0.1;            // cytosolic Ca²⁺ near the release site (µM)
      this.ca0 = 0.1;
      this.tauCa = 2;           // ms
      this.kCa = 4;             // µM per (nA·ms)
      this.caHalf = 12;         // µM for half-maximal release
      this.kRelease = 0.8;      // /ms (one AP releases roughly half of the docked pool)
      this.vesicles = 1;        // fraction of docked, release-ready vesicles
      this.tauRefill = 5;       // ms (fast restocking so repeated inputs stay similar in size)
      this.nt = 0;              // transmitter in the cleft (arbitrary units)
      this.tauClear = 0.8;      // ms
      this.releaseRate = 0;
      this.iCa = 0;
      this.V = -70;
      this.eCa = 130;
      this.caBlock = 0;         // 0..1 fraction of Ca channels blocked
      this._releasing = false;
    }
    reset() {
      this.s = 0; this.ca = this.ca0; this.vesicles = 1; this.nt = 0;
      this.releaseRate = 0; this.iCa = 0; this.V = -70; this._releasing = false;
    }
    /** Advance by dt at membrane potential V. Returns true when a release burst begins. */
    step(dt, V) {
      this.V = V;
      const sinf = 1 / (1 + Math.exp(-(V + 20) / 6));
      this.s = expEuler(this.s, sinf, 1.0, dt);
      this.iCa = this.gCa * (1 - this.caBlock) * this.s * (V - this.eCa); // nA (negative = inward)
      this.ca += (-this.iCa * this.kCa - (this.ca - this.ca0) / this.tauCa) * dt;
      if (this.ca < 0) this.ca = 0;
      const c4 = Math.pow(this.ca, 4), h4 = Math.pow(this.caHalf, 4);
      this.releaseRate = this.kRelease * (c4 / (c4 + h4)) * this.vesicles;
      const released = this.releaseRate * dt;
      this.vesicles += (-this.releaseRate + (1 - this.vesicles) / this.tauRefill) * dt;
      if (this.vesicles < 0) this.vesicles = 0;
      this.nt += released - (this.nt / this.tauClear) * dt;
      if (this.nt < 0) this.nt = 0;
      const nowReleasing = this.releaseRate > 0.05;
      const started = nowReleasing && !this._releasing;
      this._releasing = nowReleasing;
      return started;
    }
  }

  // ---------------------------------------------------------------------------
  // Postsynaptic receptor: transmitter binding opens a channel with reversal E.
  // ---------------------------------------------------------------------------
  class Receptor {
    constructor(opts) {
      opts = opts || {};
      this.type = opts.type || 'excitatory';
      this.E = opts.E != null ? opts.E : (this.type === 'excitatory' ? 0 : -75);
      this.gmax = opts.gmax != null ? opts.gmax : 0.0025;   // µS
      this.kon = opts.kon != null ? opts.kon : 0.4;         // /(unit·ms) — one release burst opens ~30% of receptors
      this.koff = opts.koff != null ? opts.koff : (this.type === 'excitatory' ? 1 / 18 : 1 / 20);
      this.r = 0;        // fraction of receptor channels open
      this.g = 0;
      this.i = 0;
      this.block = 0;    // 0..1 fraction of receptors blocked (antagonist)
    }
    reset() { this.r = 0; this.g = 0; this.i = 0; }
    step(dt, nt, V) {
      const dr = this.kon * nt * (1 - this.r) - this.koff * this.r;
      this.r += dr * dt;
      if (this.r < 0) this.r = 0; if (this.r > 1) this.r = 1;
      this.g = this.gmax * (1 - this.block) * this.r;
      this.i = this.g * (V - this.E);
    }
  }

  // ---------------------------------------------------------------------------
  // The neuron
  // ---------------------------------------------------------------------------
  class Neuron {
    constructor(opts) {
      opts = opts || {};
      this.tempC = 37;
      this.conc = JSON.parse(JSON.stringify(DEFAULT_CONC));
      this.dt = opts.dt || 0.02;
      this.t = 0;
      this.events = [];
      this.naBlock = 0;   // TTX-like: fraction of voltage-gated Na⁺ channels blocked
      this.kBlock = 0;    // TEA-like: fraction of voltage-gated K⁺ channels blocked
      this.pumpOn = true;
      this.pumpRundownRate = 0; // mM/ms of gradient loss when the pump is off (teaching, accelerated)
      this.manual = { gNa: 0, gK: 0, gCl: 0 };   // µS of manually opened channels on the soma
      this.stim = {};                              // compartment index → nA injected

      const specs = opts.compartments || defaultCompartmentSpecs();
      this.comps = specs.map((s, i) => ({
        index: i, name: s.name, kind: s.kind, area: s.area,
        C: s.area * 1e-5,                     // nF
        gNaMax: (s.gNa || 0) * s.area * 1e-5, // µS
        gKMax: (s.gK || 0) * s.area * 1e-5,
        gL: (s.gL || 0.1) * s.area * 1e-5,
        EL: -70,
        V: -70, m: 0, h: 1, n: 0,
        gNa: 0, gK: 0, iNa: 0, iK: 0, iL: 0, iSynE: 0, iSynI: 0, iAx: 0,
        dVdt: 0,
      }));
      this.gAxial = opts.gAxial || defaultAxialConductances(this.comps.length);
      this.byName = {};
      this.comps.forEach(c => { this.byName[c.name] = c; });

      // Input synapses from other neurons onto this one.
      this.inputs = [];
      const dend = this.byName.dendrite.index, soma = this.byName.soma.index;
      this.addInput({ id: 'A', label: 'Input A', type: 'excitatory', target: dend, gmax: 0.004 });
      this.addInput({ id: 'B', label: 'Input B', type: 'excitatory', target: dend, gmax: 0.004 });
      this.addInput({ id: 'C', label: 'Input C', type: 'inhibitory', target: soma, gmax: 0.012 });

      // This neuron's own output terminal and the next neuron it talks to.
      const term = this.byName.terminal;
      this.terminal = new Terminal({ name: 'output', gCa: (specs[term.index].gCa || 20) * term.area * 1e-5 });
      this.nextReceptor = new Receptor({ type: 'excitatory', gmax: 0.004 });
      this.next = { V: -70, C: 0.02, gL: 0.006, EL: -70, i: 0 };

      this.calibrateLeak();
      this.reset();
    }

    addInput(spec) {
      const inp = {
        id: spec.id, label: spec.label || spec.id, type: spec.type, target: spec.target,
        terminal: new Terminal({ name: spec.id }),
        receptor: new Receptor({ type: spec.type, gmax: spec.gmax }),
        spikeT: null, V: -70, active: false, autoFire: false, autoInterval: 20, lastAuto: -1e9,
      };
      this.inputs.push(inp);
      return inp;
    }

    get E() {
      const c = this.conc;
      return {
        Na: nernst(1, c.Na.out, c.Na.in, this.tempC),
        K: nernst(1, c.K.out, c.K.in, this.tempC),
        Cl: nernst(-1, c.Cl.out, c.Cl.in, this.tempC),
        Ca: nernst(2, c.Ca.out, c.Ca.in, this.tempC),
      };
    }

    /** Choose EL for each compartment so that the resting potential is exactly −70 mV. */
    calibrateLeak() {
      const E = this.E, V = -70;
      const r = hhRates(V);
      for (const c of this.comps) {
        const gNa = c.gNaMax * Math.pow(r.minf, 3) * r.hinf;
        const gK = c.gKMax * Math.pow(r.ninf, 4);
        const iNa = gNa * (V - E.Na), iK = gK * (V - E.K);
        c.EL = V + (iNa + iK) / c.gL;
      }
    }

    reset() {
      this.t = 0;
      this.events = [];
      const r = hhRates(-70);
      for (const c of this.comps) {
        c.V = -70; c.m = r.minf; c.h = r.hinf; c.n = r.ninf;
        c.gNa = 0; c.gK = 0; c.iNa = 0; c.iK = 0; c.iL = 0; c.iSynE = 0; c.iSynI = 0; c.iAx = 0; c.dVdt = 0;
        c._spiking = false;
      }
      for (const inp of this.inputs) {
        inp.terminal.reset(); inp.receptor.reset(); inp.spikeT = null; inp.V = -70; inp.active = false;
        inp.autoFire = false; inp.lastAuto = -1e9;
      }
      this.terminal.reset(); this.nextReceptor.reset();
      this.next.V = -70; this.next.i = 0;
      this.manual = { gNa: 0, gK: 0, gCl: 0 };
      this.stim = {};
      this.naBlock = 0; this.kBlock = 0; this.pumpOn = true;
      this.conc = JSON.parse(JSON.stringify(DEFAULT_CONC));
      this.calibrateLeak();
    }

    /** Make presynaptic input `id` fire one action potential now. */
    fireInput(id) {
      const inp = this.inputs.find(x => x.id === id);
      if (!inp) throw new Error('no input ' + id);
      inp.spikeT = this.t;
      this.events.push({ t: this.t, type: 'input_spike', input: id });
      return inp;
    }

    /** Inject current (nA) into a compartment by name or index. Pass 0 to stop. */
    setStim(comp, nA) {
      const idx = typeof comp === 'number' ? comp : this.byName[comp].index;
      if (nA) this.stim[idx] = nA; else delete this.stim[idx];
    }

    /** Advance the model by `ms` of simulated time. */
    advance(ms) {
      const steps = Math.max(1, Math.round(ms / this.dt));
      const dt = ms / steps;
      for (let s = 0; s < steps; s++) this._step(dt);
    }

    _step(dt) {
      const E = this.E;
      const comps = this.comps;
      const n = comps.length;

      // Pump off → gradients slowly run down (accelerated for teaching).
      if (!this.pumpOn && this.pumpRundownRate > 0) {
        const c = this.conc, k = this.pumpRundownRate * dt;
        if (c.Na.in < 60) c.Na.in += k * 6;
        if (c.K.in > 60) c.K.in -= k * 6;
        if (c.K.out < 30) c.K.out += k * 1.5;
      }

      // --- input synapses (presynaptic terminals driven by template APs)
      for (const inp of this.inputs) {
        if (inp.autoFire && this.t - inp.lastAuto >= inp.autoInterval) {
          inp.lastAuto = this.t; inp.spikeT = this.t;
          this.events.push({ t: this.t, type: 'input_spike', input: inp.id });
        }
        inp.V = inp.spikeT == null ? -70 : templateAP(this.t - inp.spikeT);
        const started = inp.terminal.step(dt, inp.V);
        if (started) this.events.push({ t: this.t, type: 'release', input: inp.id });
        const target = comps[inp.target];
        if (inp.receptor.type === 'inhibitory') inp.receptor.E = E.Cl;
        inp.receptor.step(dt, inp.terminal.nt, target.V);
        inp.active = inp.receptor.r > 0.02;
      }

      // --- membrane compartments (exponential Euler on V, explicit coupling)
      const Vold = comps.map(c => c.V);
      for (let i = 0; i < n; i++) {
        const c = comps[i];
        const V = c.V;
        const r = hhRates(V);
        c.m = expEuler(c.m, r.minf, r.taum, dt);
        c.h = expEuler(c.h, r.hinf, r.tauh, dt);
        c.n = expEuler(c.n, r.ninf, r.taun, dt);
        c.gNa = c.gNaMax * (1 - this.naBlock) * c.m * c.m * c.m * c.h;
        c.gK = c.gKMax * (1 - this.kBlock) * c.n * c.n * c.n * c.n;

        let gsum = c.gNa + c.gK + c.gL;
        let gE = c.gNa * E.Na + c.gK * E.K + c.gL * c.EL;

        // manual channels live on the soma
        if (c.kind === 'soma') {
          gsum += this.manual.gNa + this.manual.gK + this.manual.gCl;
          gE += this.manual.gNa * E.Na + this.manual.gK * E.K + this.manual.gCl * E.Cl;
        }

        // synaptic input
        let iSynE = 0, iSynI = 0;
        for (const inp of this.inputs) {
          if (inp.target !== i) continue;
          const rc = inp.receptor;
          gsum += rc.g; gE += rc.g * rc.E;
          if (rc.type === 'excitatory') iSynE += rc.g * (V - rc.E); else iSynI += rc.g * (V - rc.E);
        }

        // axial coupling to neighbours
        let iAx = 0;
        if (i > 0) { const g = this.gAxial[i - 1]; gsum += g; gE += g * Vold[i - 1]; iAx += g * (Vold[i - 1] - V); }
        if (i < n - 1) { const g = this.gAxial[i]; gsum += g; gE += g * Vold[i + 1]; iAx += g * (Vold[i + 1] - V); }

        const inj = this.stim[i] || 0;
        const Vinf = (gE + inj) / gsum;
        const Vnew = Vinf + (V - Vinf) * Math.exp(-gsum * dt / c.C);

        c.iNa = c.gNa * (V - E.Na) + (c.kind === 'soma' ? this.manual.gNa * (V - E.Na) : 0);
        c.iK = c.gK * (V - E.K) + (c.kind === 'soma' ? this.manual.gK * (V - E.K) : 0);
        c.iL = c.gL * (V - c.EL);
        c.iCl = c.kind === 'soma' ? this.manual.gCl * (V - E.Cl) : 0;
        c.iSynE = iSynE; c.iSynI = iSynI; c.iAx = iAx;
        c.dVdt = (Vnew - V) / dt;
        c.V = Vnew;

        // spike detection (upward crossing of −10 mV)
        if (!c._spiking && Vnew > -10 && V <= -10) {
          c._spiking = true;
          this.events.push({ t: this.t, type: 'spike', comp: i, name: c.name });
        } else if (c._spiking && Vnew < -30) {
          c._spiking = false;
        }
      }

      // --- this neuron's own terminal and the next neuron
      const term = comps[n - 1];
      const started = this.terminal.step(dt, term.V);
      if (started) this.events.push({ t: this.t, type: 'release', input: 'output' });
      this.nextReceptor.step(dt, this.terminal.nt, this.next.V);
      {
        const nx = this.next;
        const gsum = nx.gL + this.nextReceptor.g;
        const gE = nx.gL * nx.EL + this.nextReceptor.g * this.nextReceptor.E;
        const Vinf = gE / gsum;
        nx.i = this.nextReceptor.g * (nx.V - this.nextReceptor.E);
        nx.V = Vinf + (nx.V - Vinf) * Math.exp(-gsum * dt / nx.C);
      }

      this.t += dt;
    }

    /** Drain accumulated events. */
    takeEvents() { const e = this.events; this.events = []; return e; }

    // --- helpers for the renderer / lesson -------------------------------
    naState(c) {
      if (c.h < 0.25) return c.gNaMax > 0 && c.m > 0.3 ? 'inactivated' : 'inactivated';
      if (c.m * c.m * c.m * c.h > 0.08) return 'open';
      return 'closed';
    }
    kState(c) { return c.n * c.n * c.n * c.n > 0.25 ? 'open' : 'closed'; }
    caState(term) { return term.s > 0.3 ? 'open' : 'closed'; }
    get soma() { return this.byName.soma; }
    get hillock() { return this.byName.hillock; }
    get axon() { return this.comps.filter(c => c.kind === 'axon'); }
    get term() { return this.byName.terminal; }
    input(id) { return this.inputs.find(x => x.id === id); }
  }

  return { Neuron, Terminal, Receptor, nernst, hhRates, templateAP, DEFAULT_CONC, N_AXON };
});
