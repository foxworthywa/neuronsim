/*
 * MuscleSim engine — one skeletal muscle fibre, from the sarcolemma to force.
 *
 * Builds on engine.js (NeuronSim): the same Hodgkin–Huxley channel kinetics,
 * Nernst potentials, presynaptic Terminal and postsynaptic Receptor classes.
 * See docs/MUSCLE_MODULE.md ("Engine additions") for the design and
 * docs/BIOLOGY.md for the physiology every statement here must respect.
 *
 * Units: mV, ms, µS, nF, nA, mM; cytosolic Ca²⁺ in µM; force normalized so a
 * fused tetanus ≈ 1 and a single twitch ≈ 0.25.
 *
 * Works as a browser global (window.MuscleSim, after engine.js has loaded)
 * and as a CommonJS module (tests/muscle.test.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MuscleSim = factory(root.NeuronSim);
})(typeof self !== 'undefined' ? self : this, function (NS) {
  'use strict';

  const { hhRates, nernst, expEuler, pumpRundown, Terminal, Receptor, templateAP, DEFAULT_CONC } = NS;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------------------------------------------------------------------------
  // Default parameters (see docs/MUSCLE_MODULE.md)
  // ---------------------------------------------------------------------------
  const DEFAULTS = {
    nSide: 8,             // segments on each side of the end plate (17 in all)
    segLen: 1750,         // µm  (17 × 1.75 mm ≈ 3 cm)
    diameter: 50,         // µm
    rest: -85,            // mV, set by the K⁺/Na⁺ leak ratio
    gNa: 80, gK: 36,      // mS/cm² (voltage-gated, HH kinetics)
    gLeak: 0.1,           // mS/cm² total leak (K⁺ + Na⁺, Nernst-referenced)
    phi: 2,               // rate scale (temperature correction of the squid rates)
    hShift: -10,          // mV: muscle Na⁺ channels inactivate at more negative voltages
    gAxial: 5,            // µS between neighbouring segments (tuned for a few ms end to end)
    // excitation–contraction coupling
    dHalf: -20, dSlope: 6, tauD: 1.0,        // T-tubule voltage sensor
    kRel: 0.25,           // /ms release rate constant (store units per ms per open fraction)
    sigma: 28,            // µM cytosolic Ca²⁺ per store unit released
    tauRefillSR: 60,      // ms: store refills from the Ca²⁺ SERCA returns
    vSerca: 0.6, kSerca: 1.0,                // µM/ms, µM
    caRest: 0.1,          // µM
    tnKon: 0.12, tnKoff: 0.10,               // /µM/ms, /ms  (K½ ≈ 0.8 µM)
    xbKon: 0.06, xbKoff: 0.03,               // /ms
    cocked0: 0.6, tauCock: 3,                // pre-cocked head pool and its ATP-dependent refill
    forceNorm: 0.753,     // divides raw force so a fused (100 Hz) tetanus reads ≈ 1 (calibrated by simulation)
    tauForce: 10,         // ms series-elastic lag between attached bridges and measured force
    // neuromuscular junction
    receptorGmax: 50,     // µS (sized against the whole fibre's resting conductance)
    receptorKon: 1.0, receptorKoff: 1 / 3,   // /(unit·ms), /ms (nicotinic receptors bind and close fast)
    terminalGCa: 0.05,    // µS: motor terminal Ca²⁺ channels (release sits near the knee of its Ca²⁺ dependence)
    tauAChE: 0.8, tauDiff: 40,               // ms: enzymatic and (slow) diffusional ACh clearance out of the folded cleft
    tauAgonist: 20,       // ms: a persistent agonist (succinylcholine bolus) arrives over this time
    tauRefill: 300,       // ms vesicle restocking (3 Hz trains show ≈ 20 % rundown; 20 Hz is still sustained)
    kRelease: 0.8,        // /ms: release rate at saturating terminal Ca²⁺ (sets the fraction of the pool used per impulse)
    K1: 0.5, K2: 0.5,     // mM: Ca²⁺ / Mg²⁺ competition at the terminal (Dodge–Rahamimoff)
    // surface-charge screening of Na⁺ channel gating by divalent cations
    kShift: 9, alphaMg: 0.5, c0: 0.5, maxShift: 15,
  };

  function segmentArea(p) { return Math.PI * p.diameter * p.segLen; } // µm²

  // ---------------------------------------------------------------------------
  // The fibre
  // ---------------------------------------------------------------------------
  class MuscleFibre {
    constructor(opts) {
      this.p = Object.assign({}, DEFAULTS, opts || {});
      const p = this.p;
      this.tempC = 37;
      this.dt = 0.02;
      this.t = 0;
      this.events = [];
      this.conc = JSON.parse(JSON.stringify(DEFAULT_CONC));
      this.conc.Mg = { out: 1, in: 0.5 };

      // --- lab / scenario controls
      this.naBlock = 0; this.kBlock = 0;       // TTX-like, TEA-like
      this.pumpOn = true; this.pumpRundownRate = 0;
      this.atp = 1;                            // 0 = ATP exhausted (rigor)
      this.atpDecline = 0;                     // /ms, used by the malignant-hyperthermia scenario
      this.ryrLeak = 0;                        // 0..1 fraction of SR release channels held open
      this.dantrolene = 0;                     // 0..1
      this.caEntryBlock = 0;                   // 0..1 (unused by default; Ca²⁺-free bath uses conc)
      this.acheActivity = 1;                   // 1 normal; 0.3 neostigmine; 0.05 overdose; 0 organophosphate
      this.agonist = 0;                        // persistent cleft agonist (succinylcholine), transmitter units (target)
      this._agonistNow = 0;                    // ramps toward `agonist` with tauAgonist
      this.releaseBlock = 0;                   // 0..1 (botulinum)
      this.receptorDensity = 1;                // 0..1 (myasthenia)
      this.nerveEnabled = true;                // the black-box motor nerve can fire on its own
      this.manual = { gNa: 0, gK: 0, gCl: 0 }; // µS opened by hand on the end-plate segment
      this.stim = {};                          // segment index → nA
      this.heat = 0;                           // derived readout for the MH scenario

      // --- segments
      const n = 2 * p.nSide + 1, mid = p.nSide;
      const area = segmentArea(p);
      this.comps = [];
      for (let i = 0; i < n; i++) {
        const name = i === mid ? 'endplate' : (i < mid ? 'L' + (mid - i) : 'R' + (i - mid));
        this.comps.push({
          index: i, name, kind: i === mid ? 'endplate' : 'sarcolemma', area,
          C: area * 1e-5,
          gNaMax: p.gNa * area * 1e-5, gKMax: p.gK * area * 1e-5,
          gKLeak: 0, gNaLeak: 0, gL: 0, EL: p.rest,
          V: p.rest, m: 0, h: 1, n: 0, gNa: 0, gK: 0, iNa: 0, iK: 0, iL: 0, iCl: 0, iSyn: 0, iAx: 0, dVdt: 0,
          // EC coupling
          d: 0, ryr: 0, caSR: 1, ca: p.caRest, tn: 0, xb: 0, cocked: p.cocked0, force: 0,
          _spiking: false, _caHigh: false,
        });
      }
      this.byName = {};
      this.comps.forEach(c => { this.byName[c.name] = c; });
      this.byName.end = this.comps[n - 1];
      this.byName.mid = this.comps[mid + Math.floor(p.nSide / 2)];
      this.gAxial = [];
      for (let i = 0; i < n - 1; i++) this.gAxial.push(p.gAxial);
      this.calibrateLeak();

      // --- neuromuscular junction (the motor neuron is a black box)
      this.terminal = new Terminal({ name: 'motor', gCa: p.terminalGCa });
      this.terminal.tauRefill = p.tauRefill;
      this.terminal.kRelease = p.kRelease;
      this._gCa0 = this.terminal.gCa;
      this.receptor = new Receptor({ type: 'excitatory', E: 0, gmax: p.receptorGmax, kon: p.receptorKon, koff: p.receptorKoff });
      this.nerveV = p.rest;
      this.commandT = null;
      this.schedule = [];                      // pending shocks / commands
      this._eppMax = -Infinity; this._eppArmed = false;
      this._forceHist = [];                    // recent force samples for tetanus detection
      this._forcePeakArmed = false; this._forceMax = 0;
      this._fused = false;
      this._pulseEnd = null;

      // reference shock strength: the current that just fires a healthy fibre
      this.refShockNA = 0;
      this.refShockNA = this._findThreshold(0.5) * 1.0;
      this.force = 0;
      this.reset();
    }

    // Leak: two Nernst-referenced conductances whose ratio sets the resting potential.
    calibrateLeak() {
      const p = this.p, E = this.E, V = p.rest;
      const r = hhRates(V, { hShift: p.hShift, phi: p.phi });
      const A = V - E.K, B = V - E.Na;                      // driving forces at rest (+10, −152 mV)
      for (const c of this.comps) {
        const gTot = p.gLeak * c.area * 1e-5;
        // resting "window" currents through the voltage-gated channels count too
        const gNa0 = c.gNaMax * Math.pow(r.minf, 3) * r.hinf, gK0 = c.gKMax * Math.pow(r.ninf, 4);
        // choose the K⁺/Na⁺ split of the leak so the total current is zero at rest
        let gK = (-B * (gTot + gNa0) - A * gK0) / (A - B);
        gK = clamp(gK, 0.5 * gTot, gTot);
        c.gKLeak = gK; c.gNaLeak = gTot - gK; c.gL = gTot;
      }
    }

    get E() {
      const c = this.conc, min = 1e-4;
      return {
        Na: nernst(1, Math.max(c.Na.out, min), c.Na.in, this.tempC),
        K: nernst(1, Math.max(c.K.out, min), c.K.in, this.tempC),
        Cl: nernst(-1, Math.max(c.Cl.out, min), c.Cl.in, this.tempC),
        Ca: nernst(2, Math.max(c.Ca.out, min), c.Ca.in, this.tempC),
      };
    }

    /** Surface-charge shift of Na⁺ channel gating by extracellular Ca²⁺ and Mg²⁺ (mV). */
    get gatingShift() {
      const p = this.p, Ca = Math.max(0, this.conc.Ca.out), Mg = Math.max(0, this.conc.Mg.out);
      const ref = DEFAULT_CONC.Ca.out + p.alphaMg * 1 + p.c0;   // normal fluid: 2 mM Ca²⁺, 1 mM Mg²⁺
      return clamp(p.kShift * Math.log((Ca + p.alphaMg * Mg + p.c0) / ref), -p.maxShift, p.maxShift);
    }

    /** Ca²⁺ / Mg²⁺ competition at the motor terminal, relative to normal fluid. */
    get terminalCaFactor() {
      const p = this.p, Ca = Math.max(0, this.conc.Ca.out), Mg = Math.max(0, this.conc.Mg.out);
      const f = (Ca / p.K1) / (1 + Ca / p.K1 + Mg / p.K2);
      const f0 = (2 / p.K1) / (1 + 2 / p.K1 + 1 / p.K2);
      return f / f0;
    }

    /** The black-box nerve's own firing rate (Hz) when extracellular divalents are low. */
    get spontaneousRate() {
      const s = this.gatingShift;
      return s < -2 ? (-s - 2) * 4 : 0;
    }

    reset() {
      const p = this.p;
      this.t = 0; this.events = [];
      this.conc = JSON.parse(JSON.stringify(DEFAULT_CONC)); this.conc.Mg = { out: 1, in: 0.5 };
      this.naBlock = 0; this.kBlock = 0; this.pumpOn = true; this.pumpRundownRate = 0;
      this.atp = 1; this.atpDecline = 0; this.ryrLeak = 0; this.dantrolene = 0;
      this.acheActivity = 1; this.agonist = 0; this._agonistNow = 0; this.releaseBlock = 0; this.receptorDensity = 1; this.nerveEnabled = true;
      this.manual = { gNa: 0, gK: 0, gCl: 0 }; this.stim = {}; this.schedule = []; this.heat = 0; this._pulseEnd = null;
      this.calibrateLeak();
      this._resetState();
      this.terminal.reset(); this.terminal.caBlock = 0; this.receptor.reset(); this.receptor.block = 0; this.nerveV = p.rest; this.commandT = null;
      this._eppMax = -Infinity; this._eppArmed = false; this._forceHist = []; this._forcePeakArmed = false; this._forceMax = 0; this._fused = false;
      this.force = 0;
    }
    _resetState() {
      const p = this.p, r = this._rates(p.rest);
      for (const c of this.comps) {
        c.V = p.rest; c.m = r.minf; c.h = r.hinf; c.n = r.ninf;
        c.gNa = 0; c.gK = 0; c.iNa = 0; c.iK = 0; c.iL = 0; c.iCl = 0; c.iSyn = 0; c.iAx = 0; c.dVdt = 0;
        c.d = 0; c.ryr = 0; c.caSR = 1; c.ca = p.caRest; c.tn = 0; c.xb = 0; c.cocked = p.cocked0; c.force = 0;
        c._spiking = false; c._caHigh = false;
      }
    }

    _rates(V) {
      const p = this.p;
      const shift = this.gatingShift;
      const rNa = hhRates(V - shift, { hShift: p.hShift, phi: p.phi });
      const rK = shift === 0 ? rNa : hhRates(V, { hShift: p.hShift, phi: p.phi });
      return { minf: rNa.minf, taum: rNa.taum, hinf: rNa.hinf, tauh: rNa.tauh, ninf: rK.ninf, taun: rK.taun };
    }

    // ----------------------------------------------------------------- stimulation
    /** Inject `nA` into a segment for `ms`, then stop. */
    pulse(comp, nA, ms) {
      const idx = typeof comp === 'number' ? comp : this.byName[comp].index;
      this.setStim(idx, nA);
      this._pulseComp = idx; this._pulseEnd = this.t + ms;
      this.events.push({ t: this.t, type: 'shock', comp: idx, name: this.comps[idx].name, nA, strength: nA / this.refShockNA });
    }
    setStim(comp, nA) {
      const idx = typeof comp === 'number' ? comp : this.byName[comp].index;
      if (nA) this.stim[idx] = nA; else delete this.stim[idx];
    }
    /** A brief shock of `strength` × the reference threshold current. */
    shock(strength, ms, segment) {
      this.pulse(segment || 'endplate', (strength == null ? 1.5 : strength) * this.refShockNA, ms || 0.5);
    }
    /** Two shocks `intervalMs` apart. */
    pair(intervalMs, strength, segment) {
      this.shock(strength, 0.5, segment);
      this.schedule.push({ t: this.t + intervalMs, kind: 'shock', strength, segment });
    }
    /** `n` shocks at `rateHz`, the first one now. */
    train(rateHz, n, strength, segment) {
      const dtms = 1000 / rateHz;
      for (let i = 0; i < n; i++) this.schedule.push({ t: this.t + i * dtms, kind: 'shock', strength, segment });
    }
    /** Fire the motor nerve once (one action potential into the terminal). */
    command(spontaneous) {
      this.commandT = this.t;
      this.events.push({ t: this.t, type: spontaneous ? 'spontaneous_command' : 'command' });
    }
    commandTrain(rateHz, n) {
      const dtms = 1000 / rateHz;
      for (let i = 0; i < n; i++) this.schedule.push({ t: this.t + i * dtms, kind: 'command' });
    }
    cancelScheduled() { this.schedule = []; }
    /** The classic Ca²⁺-free bath: Ca²⁺ replaced by enough Mg²⁺ to leave Na⁺ channel gating unchanged. */
    setCaFreeBath(on) {
      const p = this.p;
      if (on) { this.conc.Ca.out = 0; this.conc.Mg.out = 1 + DEFAULT_CONC.Ca.out / p.alphaMg; }
      else { this.conc.Ca.out = DEFAULT_CONC.Ca.out; this.conc.Mg.out = 1; }
    }

    /** Shock strength (× reference) that just fires the fibre in its current state. */
    thresholdStrength(segment) {
      const nA = this._findThreshold(0.5, segment);
      return nA / this.refShockNA;
    }
    // Bracketing search on the live object; state is saved and restored around it.
    _findThreshold(ms, segment) {
      const saved = this._snapshot();
      const idx = segment ? this.byName[segment].index : this.p.nSide;
      const fires = (nA) => {
        this._restore(saved);
        this.events = []; this.schedule = []; this.stim = {}; this._pulseEnd = null;
        this.pulse(idx, nA, ms);
        let spiked = false;
        const probe = this.comps[Math.min(this.comps.length - 1, idx + 3)];   // a propagated spike, not the stimulus artefact
        for (let k = 0; k < 10 / this.dt && !spiked; k++) { this._step(this.dt); if (probe.V > -10) spiked = true; }
        return spiked;
      };
      let lo = 0, hi = this.refShockNA > 0 ? this.refShockNA * 4 : 400;
      let tries = 0;
      while (!fires(hi) && tries++ < 6) hi *= 2;              // expand until something fires
      if (tries > 6) { this._restore(saved); return Infinity; }
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (fires(mid)) hi = mid; else lo = mid; }
      this._restore(saved);
      return hi;
    }
    _snapshot() {
      return {
        t: this.t, comps: this.comps.map(c => Object.assign({}, c)), stim: Object.assign({}, this.stim), schedule: this.schedule.slice(),
        events: this.events.slice(), pulseEnd: this._pulseEnd, pulseComp: this._pulseComp,
        term: Object.assign({}, this.terminal), rec: Object.assign({}, this.receptor), nerveV: this.nerveV, commandT: this.commandT,
        conc: JSON.parse(JSON.stringify(this.conc)), force: this.force, heat: this.heat,
        eppMax: this._eppMax, eppArmed: this._eppArmed, forceHist: this._forceHist.slice(), forcePeakArmed: this._forcePeakArmed, forceMax: this._forceMax, fused: this._fused,
      };
    }
    _restore(s) {
      this.t = s.t; this.comps.forEach((c, i) => Object.assign(c, s.comps[i])); this.stim = Object.assign({}, s.stim); this.schedule = s.schedule.slice();
      this.events = s.events.slice(); this._pulseEnd = s.pulseEnd; this._pulseComp = s.pulseComp;
      Object.assign(this.terminal, s.term); Object.assign(this.receptor, s.rec); this.nerveV = s.nerveV; this.commandT = s.commandT;
      this.conc = JSON.parse(JSON.stringify(s.conc)); this.force = s.force; this.heat = s.heat;
      this._eppMax = s.eppMax; this._eppArmed = s.eppArmed; this._forceHist = s.forceHist.slice(); this._forcePeakArmed = s.forcePeakArmed; this._forceMax = s.forceMax; this._fused = s.fused;
    }

    // ----------------------------------------------------------------- time stepping
    advance(ms) {
      const steps = Math.max(1, Math.round(ms / this.dt));
      const dt = ms / steps;
      for (let s = 0; s < steps; s++) this._step(dt);
    }

    _step(dt) {
      const p = this.p, E = this.E, comps = this.comps, n = comps.length;

      // --- housekeeping: pump rundown, timed pulse end, scheduled shocks/commands
      if (!this.pumpOn && this.pumpRundownRate > 0) pumpRundown(this.conc, this.pumpRundownRate * dt);
      if (this._pulseEnd != null && this.t >= this._pulseEnd) { this.setStim(this._pulseComp, 0); this._pulseEnd = null; }
      if (this.schedule.length) {
        const due = this.schedule.filter(s => s.t <= this.t + 1e-9);
        if (due.length) {
          this.schedule = this.schedule.filter(s => s.t > this.t + 1e-9);
          for (const s of due) { if (s.kind === 'shock') this.shock(s.strength, 0.5, s.segment); else this.command(); }
        }
      }
      // the black-box nerve fires on its own when extracellular Ca²⁺/Mg²⁺ is low
      if (this.nerveEnabled) {
        const rate = this.spontaneousRate;
        if (rate > 0 && Math.random() < rate * dt / 1000) this.command(true);
      }
      // succinylcholine lets K⁺ out of the fibres (accelerated, capped)
      this._agonistNow = expEuler(this._agonistNow, this.agonist, p.tauAgonist, dt);
      if (this._agonistNow > 0.05 && this.conc.K.out < 5.5) this.conc.K.out += 0.0008 * dt;
      if (this.atpDecline > 0 && this.atp > 0) this.atp = Math.max(0, this.atp - this.atpDecline * dt);

      // --- neuromuscular junction
      this.nerveV = this.commandT == null ? p.rest : templateAP(this.t - this.commandT);
      this.terminal.gCa = this._gCa0 * this.terminalCaFactor * (1 - this.caEntryBlock);
      this.terminal.tauClear = 1 / (this.acheActivity / p.tauAChE + 1 / p.tauDiff);
      this.terminal.kRelease = p.kRelease * (1 - this.releaseBlock);
      const started = this.terminal.step(dt, this.nerveV);
      if (started) this.events.push({ t: this.t, type: 'release' });
      const ep = comps[p.nSide];
      this.receptor.gmax = p.receptorGmax * this.receptorDensity;
      this.receptor.step(dt, this.terminal.nt + this._agonistNow, ep.V);

      // --- membrane (exponential Euler, explicit axial coupling)
      const Vold = comps.map(c => c.V);
      for (let i = 0; i < n; i++) {
        const c = comps[i], V = c.V;
        const r = this._rates(V);
        c.m = expEuler(c.m, r.minf, r.taum, dt);
        c.h = expEuler(c.h, r.hinf, r.tauh, dt);
        c.n = expEuler(c.n, r.ninf, r.taun, dt);
        c.gNa = c.gNaMax * (1 - this.naBlock) * c.m * c.m * c.m * c.h;
        c.gK = c.gKMax * (1 - this.kBlock) * c.n * c.n * c.n * c.n;
        let gsum = c.gNa + c.gK + c.gKLeak + c.gNaLeak;
        let gE = c.gNa * E.Na + c.gK * E.K + c.gKLeak * E.K + c.gNaLeak * E.Na;
        let iSyn = 0;
        if (c.kind === 'endplate') {
          gsum += this.manual.gNa + this.manual.gK + this.manual.gCl;
          gE += this.manual.gNa * E.Na + this.manual.gK * E.K + this.manual.gCl * E.Cl;
          gsum += this.receptor.g; gE += this.receptor.g * this.receptor.E;
          iSyn = this.receptor.g * (V - this.receptor.E);
        }
        let iAx = 0;
        if (i > 0) { const g = this.gAxial[i - 1]; gsum += g; gE += g * Vold[i - 1]; iAx += g * (Vold[i - 1] - V); }
        if (i < n - 1) { const g = this.gAxial[i]; gsum += g; gE += g * Vold[i + 1]; iAx += g * (Vold[i + 1] - V); }
        const inj = this.stim[i] || 0;
        const Vinf = (gE + inj) / gsum;
        const Vnew = Vinf + (V - Vinf) * Math.exp(-gsum * dt / c.C);
        const man = c.kind === 'endplate' ? this.manual : null;
        c.iNa = (c.gNa + c.gNaLeak + (man ? man.gNa : 0)) * (V - E.Na);
        c.iK = (c.gK + c.gKLeak + (man ? man.gK : 0)) * (V - E.K);
        c.iL = c.gKLeak * (V - E.K) + c.gNaLeak * (V - E.Na);
        c.iCl = man ? man.gCl * (V - E.Cl) : 0;
        c.iSyn = iSyn; c.iAx = iAx;
        c.dVdt = (Vnew - V) / dt;
        c.V = Vnew;
        if (!c._spiking && Vnew > -10 && V <= -10) { c._spiking = true; this.events.push({ t: this.t, type: 'spike', comp: i, name: c.name }); }
        else if (c._spiking && Vnew < -30) c._spiking = false;

        // --- excitation–contraction coupling
        const dinf = 1 / (1 + Math.exp(-(Vnew - p.dHalf) / p.dSlope));
        c.d = expEuler(c.d, dinf, p.tauD, dt);
        c.ryr = clamp(c.d * (1 - 0.7 * this.dantrolene) + this.ryrLeak * (1 - this.dantrolene), 0, 1);
        const rel = p.kRel * c.ryr * c.caSR;                 // store units / ms
        const uptake = p.vSerca * c.ca * c.ca / (c.ca * c.ca + p.kSerca * p.kSerca) * this.atp;   // µM/ms
        c.caSR += (-rel + uptake / p.sigma) * dt;
        c.caSR = clamp(c.caSR, 0, 1);
        c.ca += (p.sigma * rel - uptake) * dt;
        if (c.ca < p.caRest) c.ca += (p.caRest - c.ca) * (1 - Math.exp(-dt / 5));   // resting leak keeps the floor
        if (!c._caHigh && c.ca > 1) { c._caHigh = true; this.events.push({ t: this.t, type: 'ca_release', comp: i, name: c.name }); }
        else if (c._caHigh && c.ca < 0.5) c._caHigh = false;
        c.tn += (p.tnKon * c.ca * (1 - c.tn) - p.tnKoff * c.tn) * dt;
        c.tn = clamp(c.tn, 0, 1);
        const attach = p.xbKon * c.tn * c.tn * c.cocked * (1 - c.xb);
        const detach = p.xbKoff * this.atp * c.xb;
        c.xb += (attach - detach) * dt;
        c.cocked += ((p.cocked0 - c.cocked) / p.tauCock * this.atp - attach) * dt;
        c.cocked = clamp(c.cocked, 0, 1); c.xb = clamp(c.xb, 0, 1);
        c.force = expEuler(c.force, c.xb, p.tauForce, dt);
      }

      // --- whole-fibre readouts and events
      // normalize: subtract the resting floor, scale so a fused tetanus reads ≈ 1; rigor locks just above it
      const xbMax = p.xbKon * p.cocked0 / (p.xbKon * p.cocked0 + p.xbKoff);
      const tnRest = p.tnKon * p.caRest / (p.tnKon * p.caRest + p.tnKoff);
      const xbFloor = p.xbKon * tnRest * tnRest * p.cocked0 / (p.xbKon * tnRest * tnRest * p.cocked0 + p.xbKoff);
      let fsum = 0; for (const c of comps) fsum += c.force;
      this.force = clamp((fsum / n - xbFloor) / (xbMax - xbFloor) / p.forceNorm, 0, 1.05);
      this.heat += (this.force * 0.02 - this.heat * 0.002) * dt;
      // end-plate potential peak (the receptor conductance passing its maximum)
      const g = this.receptor.g;
      if (g > this._eppMax + 1e-9) { this._eppMax = g; this._eppArmed = g > 0.05 * this.receptor.gmax; }
      else if (this._eppArmed && g < this._eppMax * 0.98) { this._eppArmed = false; this.events.push({ t: this.t, type: 'epp_peak', V: ep.V }); }
      if (g < 1e-6) this._eppMax = 0;
      // twitch peak / relaxed
      const F = this.force;
      if (F > this._forceMax) { this._forceMax = F; if (F > 0.05) this._forcePeakArmed = true; }
      else if (this._forcePeakArmed && F < this._forceMax * 0.97) { this._forcePeakArmed = false; this.events.push({ t: this.t, type: 'twitch_peak', force: this._forceMax }); this._wasContracting = true; }
      if (F < 0.02) { if (this._wasContracting) { this._wasContracting = false; this.events.push({ t: this.t, type: 'relaxed' }); } this._forceMax = 0; }
      if (this._forceMax > 0 && F < this._forceMax * 0.9) this._forceMax = F > 0.02 ? Math.max(F, 0) : 0; // re-arm after a partial relaxation
      // fused tetanus: force high and steady over the last 60 ms
      this._forceHist.push({ t: this.t, F });
      while (this._forceHist.length && this._forceHist[0].t < this.t - 60) this._forceHist.shift();
      if (this._forceHist.length > 10) {
        let mn = Infinity, mx = -Infinity; for (const s of this._forceHist) { if (s.F < mn) mn = s.F; if (s.F > mx) mx = s.F; }
        const fused = mx > 0.6 && mn > 0.9 * mx;
        if (fused && !this._fused) this.events.push({ t: this.t, type: 'tetanus_fused', force: mx });
        this._fused = fused;
      }
      this.t += dt;
    }

    takeEvents() { const e = this.events; this.events = []; return e; }

    // ----------------------------------------------------------------- helpers for the renderer / lesson
    naState(c) {
      if (c.h < 0.25) return 'inactivated';
      if (c.m * c.m * c.m * c.h > 0.08) return 'open';
      return 'closed';
    }
    kState(c) { return c.n * c.n * c.n * c.n > 0.25 ? 'open' : 'closed'; }
    caState(term) { return term.s > 0.3 ? 'open' : 'closed'; }
    sensorState(c) { return c.d > 0.3 ? 'active' : 'resting'; }
    ryrState(c) { return c.ryr > 0.3 ? 'open' : 'closed'; }
    troponinState(c) { return c.tn > 0.4 ? 'bound' : 'free'; }
    bridgeState(c) { return c.xb > 0.15 ? 'attached' : 'detached'; }
    receptorState() { return this.receptor.r > 0.06 ? 'open' : 'closed'; }
    get endplate() { return this.byName.endplate; }
    get end() { return this.byName.end; }
    get srLevel() { let s = 0; for (const c of this.comps) s += c.caSR; return s / this.comps.length; }
    get ca() { let s = 0; for (const c of this.comps) s += c.ca; return s / this.comps.length; }
    get isFused() { return this._fused; }
    /** Scalar series for the trace bands. */
    sampleExtras() { return { ca: this.ca, force: this.force, sr: this.srLevel, nerve: this.nerveV, epp: this.receptor.g }; }
  }

  return { MuscleFibre, DEFAULTS };
});
