/*
 * HeartSim engine — a closed-loop, lumped model of the heart and circulation.
 *
 * Everything the student sees (valves opening, chambers filling and emptying, the pressure and
 * volume traces, the PV loop) is rendered from the state held here. Nothing in the UI sets a
 * pressure or opens a valve directly; valves move only because of the pressures across them.
 *
 * Structure (see docs/HEART_MODULE.md):
 *   systemic veins → RA → tricuspid → RV → pulmonary valve → pulmonary arteries → lungs
 *   → pulmonary veins → LA → bicuspid (mitral) → LV → aortic valve → systemic arteries → body → …
 *
 * - Chambers are time-varying elastances: P = E(t)·(V − V₀), E(t) = Emin + (Emax − Emin)·e(t),
 *   where e(t) ∈ [0, 1] is the activation (how hard the muscle is squeezing). The relaxed
 *   ventricles instead follow an exponential pressure–volume curve (A, B), so an over-filled
 *   ventricle stiffens and blood backs up into the veins and lungs behind it.
 * - Vessels are compliances with an unstressed volume: P = (V − Vu) / C.
 * - AV valves (tricuspid, bicuspid) are one-way resistances. Semilunar valves (aortic, pulmonary)
 *   also have inertance and close only after a small backflow, which produces the incisura
 *   (dicrotic notch) in aortic pressure. Characteristic impedance Zc makes the aortic-root
 *   pressure differ from the arterial compliance pressure while blood is moving.
 * - Volume is conserved exactly except for explicit infuse() / hemorrhage().
 *
 * Milestone M1: activation comes from a simple clock (sinus), a button (single beat) or the
 * student's own squeeze (manual). In M2 the clock is replaced by the pacemaker and conduction
 * cell models, with the same activation interface.
 *
 * Units: time ms in the API (seconds inside the integrator), pressure mmHg, volume mL,
 * flow mL/s, elastance mmHg/mL, compliance mL/mmHg, resistance mmHg·s/mL, inertance mmHg·s²/mL.
 *
 * Works both as a browser global (window.HeartSim) and as a CommonJS module, so the tests in
 * tests/ run against exactly the same code as the page.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HeartSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const H = 0.05; // integration step, ms

  // ---------------------------------------------------------------------------
  // Default physiology: healthy adult, supine, at rest (targets in docs/HEART_MODULE.md)
  // ---------------------------------------------------------------------------
  function defaultParams() {
    return {
      hr: 75,             // beats per minute (sinus clock)
      pr: 160,            // ms from atrial to ventricular depolarization (stands in for AV conduction until M2)
      atrialDelay: 105,    // ms from atrial depolarization (the beat) to atrial contraction
      emd: 30,            // ms from ventricular depolarization to contraction (electromechanical delay)
      aRise: 85, aFall: 140, // ms; atrial contraction and relaxation
      chambers: {
        LA: { Emax: 0.55, Emin: 0.15, V0: 4 },
        LV: { Emax: 2.9,  Emin: 0.075, V0: 10, A: 0.82, B: 0.022 },
        RA: { Emax: 0.35, Emin: 0.10, V0: 4 },
        RV: { Emax: 0.7,  Emin: 0.045, V0: 10, A: 0.5,  B: 0.022 },
      },
      vessels: {
        sysArt: { C: 2.1,  Vu: 620 },
        sysVen: { C: 75,   Vu: 3110 },
        pulArt: { C: 3.8,  Vu: 100 },
        pulVen: { C: 12,   Vu: 220 },
      },
      R: {
        sys: 1.0,         // total peripheral resistance (arterioles)
        ven: 0.025,       // systemic veins → RA
        pul: 0.075,       // pulmonary vascular resistance
        pulVen: 0.01,     // pulmonary veins → LA
      },
      valves: {
        tricuspid: { R: 0.004, Rback: Infinity, K: 0 },
        mitral:    { R: 0.004, Rback: Infinity, K: 0 },
        pulmonary: { R: 0.003, Rback: Infinity, K: 0, Zc: 0.02, L: 0.0003, Vclose: 0.6 },
        aortic:    { R: 0.003, Rback: Infinity, K: 0, Zc: 0.035, L: 0.0005, Vclose: 0.8 },
      },
      manual: { tauOn: 70, tauOff: 90 },   // ms; how quickly a hand squeeze builds and fades
      totalVolume: 5000,
    };
  }

  // Normalised activation for a chamber that was activated `tau` ms ago.
  // Raised-cosine rise over `rise` ms, then relaxation over `fall` ms.
  function activation(tau, rise, fall) {
    if (tau < 0) return 0;
    if (tau < rise) return 0.5 * (1 - Math.cos(Math.PI * tau / rise));
    if (tau < rise + fall) return 0.5 * (1 + Math.cos(Math.PI * (tau - rise) / fall));
    return 0;
  }

  const VALVES = ['tricuspid', 'pulmonary', 'mitral', 'aortic'];
  const UPSTREAM = { tricuspid: 'RA', pulmonary: 'RV', mitral: 'LA', aortic: 'LV' };

  class Heart {
    constructor(opts) {
      this.p = defaultParams();
      if (opts && opts.params) deepAssign(this.p, opts.params);
      this.reset(opts && opts.settle === false ? 0 : 8);
    }

    /** Reset to the default resting state. `settleBeats` beats are run silently so the student
     *  starts from a steady state rather than from initial guesses. */
    reset(settleBeats) {
      const p = this.p;
      this.t = 0;                 // ms
      this.mode = 'sinus';        // 'sinus' | 'single' | 'manual'
      this.nextBeat = 0;
      this.onset = { atria: -1e9, ventricles: -1e9 };
      this.pendingVentricular = null;
      this.squeezeTarget = 0;
      this.eManual = 0;
      this.e = { LA: 0, LV: 0, RA: 0, RV: 0 };
      // Initial volumes (mL): close to the resting steady state.
      this.V = { RA: 40, RV: 90, LA: 50, LV: 95, sysArt: 790, sysVen: 3500, pulArt: 140, pulVen: 310 };
      const sum = Object.values(this.V).reduce((a, b) => a + b, 0);
      this.V.sysVen += p.totalVolume - sum;
      this.Q = { sys: 0, ven: 0, tricuspid: 0, pulmonary: 0, pul: 0, pulVen: 0, mitral: 0, aortic: 0 };
      this.valveOpen = { tricuspid: false, pulmonary: false, mitral: false, aortic: false };
      this.backflow = { pulmonary: 0, aortic: 0 };
      this.lastValveEvent = { left: null, right: null };
      this.events = [];
      this.beats = 0;
      this.infused = 0;
      this.cycle = { L: newCycle(), R: newCycle() };
      this.stats = { L: null, R: null };
      this.P = {};
      this.computePressures();
      if (settleBeats) {
        this.advance(settleBeats * 60000 / p.hr);
        this.events = [];   // the student's clock starts here, at the start of a beat
      }
    }

    get rr() { return 60000 / this.p.hr; }

    /** Systolic timing scales with the square root of the beat interval (shorter at fast rates). */
    timing() {
      const s = Math.sqrt(Math.min(this.rr, 1500) / 800);
      return { vRise: 270 * s, vFall: 140 * s, aRise: this.p.aRise, aFall: this.p.aFall };
    }

    setMode(mode) {
      this.mode = mode;
      if (mode === 'sinus') this.nextBeat = this.t;
      if (mode === 'manual') { this.squeezeTarget = 0; this.eManual = this.e.LV; }
    }
    /** One beat on demand (atria, then ventricles after the PR delay). */
    triggerBeat() { this.startBeat(); }
    /** Manual mode: how hard the student is squeezing the ventricles, 0–1. */
    squeeze(level) { this.squeezeTarget = Math.max(0, Math.min(1, level)); }
    /** Aortic stiffening (aging, atherosclerosis): compliance falls and characteristic impedance
     *  rises (∝ √stiffness, because pulse-wave velocity rises). factor 1 = normal. */
    setAorticStiffness(factor) {
      const base = defaultParams();
      this.p.vessels.sysArt.C = base.vessels.sysArt.C / factor;
      this.p.valves.aortic.Zc = base.valves.aortic.Zc * Math.sqrt(factor);
    }
    infuse(mL) { this.V.sysVen += mL; this.infused += mL; }
    hemorrhage(mL) { this.V.sysVen = Math.max(this.p.vessels.sysVen.Vu * 0.5, this.V.sysVen - mL); this.infused -= mL; }
    totalVolume() { return Object.values(this.V).reduce((a, b) => a + b, 0); }

    startBeat() {
      this.onset.atria = this.t + this.p.atrialDelay;
      this.pendingVentricular = this.t + this.p.pr + this.p.emd;
      this.beats++;
      this.events.push({ type: 'beat', t: this.t });
    }

    /** Advance the model by dtMs milliseconds. */
    advance(dtMs) {
      let remaining = dtMs;
      while (remaining > 1e-9) {
        const h = Math.min(H, remaining);
        this.step(h);
        remaining -= h;
      }
    }

    computePressures() {
      const p = this.p, c = p.chambers, v = p.vessels, P = this.P, V = this.V, e = this.e;
      for (const k of ['LA', 'LV', 'RA', 'RV']) {
        const ch = c[k], x = V[k] - ch.V0;
        if (ch.A) {
          // Ventricles: relaxed wall follows an exponential (stiffening) curve; the active wall a
          // linear end-systolic elastance. Activation blends between the two.
          const passive = ch.A * (Math.exp(ch.B * x) - 1);
          P[k] = e[k] * ch.Emax * x + (1 - e[k]) * passive;
        } else {
          P[k] = (ch.Emin + (ch.Emax - ch.Emin) * e[k]) * x;
        }
      }
      for (const k of ['sysArt', 'sysVen', 'pulArt', 'pulVen']) P[k] = (V[k] - v[k].Vu) / v[k].C;
      // Pressure just above each semilunar valve (what a catheter in the aortic root would read).
      P.aorta = P.sysArt + p.valves.aortic.Zc * this.Q.aortic;
      P.pulTrunk = P.pulArt + p.valves.pulmonary.Zc * this.Q.pulmonary;
    }

    step(hMs) {
      const p = this.p, t = this.t;
      // --- activation -----------------------------------------------------------
      if (this.mode === 'sinus' && t >= this.nextBeat) { this.startBeat(); this.nextBeat += this.rr; }
      if (this.pendingVentricular != null && t >= this.pendingVentricular) { this.onset.ventricles = this.pendingVentricular; this.pendingVentricular = null; }
      const tm = this.timing();
      if (this.mode === 'manual') {
        const tau = this.squeezeTarget > this.eManual ? p.manual.tauOn : p.manual.tauOff;
        this.eManual += (this.squeezeTarget - this.eManual) * (1 - Math.exp(-hMs / tau));
        this.e.LV = this.e.RV = this.eManual;
        this.e.LA = this.e.RA = 0;
      } else {
        const ea = activation(t - this.onset.atria, tm.aRise, tm.aFall);
        const ev = activation(t - this.onset.ventricles, tm.vRise, tm.vFall);
        this.e.LA = this.e.RA = ea;
        this.e.LV = this.e.RV = ev;
      }
      this.computePressures();
      const P = this.P, Q = this.Q, R = p.R, va = p.valves, h = hMs / 1000;

      // --- flows ----------------------------------------------------------------
      Q.sys = (P.sysArt - P.sysVen) / R.sys;
      Q.ven = (P.sysVen - P.RA) / R.ven;
      Q.pul = (P.pulArt - P.pulVen) / R.pul;
      Q.pulVen = (P.pulVen - P.LA) / R.pulVen;
      Q.tricuspid = this.avValve('tricuspid', P.RA - P.RV);
      Q.mitral = this.avValve('mitral', P.LA - P.LV);
      Q.pulmonary = this.semilunar('pulmonary', P.RV, P.pulArt, h);
      Q.aortic = this.semilunar('aortic', P.LV, P.sysArt, h);

      // --- volumes (every flow leaves one compartment and enters the next) ------
      const V = this.V;
      V.RA += (Q.ven - Q.tricuspid) * h;
      V.RV += (Q.tricuspid - Q.pulmonary) * h;
      V.pulArt += (Q.pulmonary - Q.pul) * h;
      V.pulVen += (Q.pul - Q.pulVen) * h;
      V.LA += (Q.pulVen - Q.mitral) * h;
      V.LV += (Q.mitral - Q.aortic) * h;
      V.sysArt += (Q.aortic - Q.sys) * h;
      V.sysVen += (Q.sys - Q.ven) * h;

      this.t += hMs;
      this.computePressures();
      this.trackCycle('L', h);
      this.trackCycle('R', h);
    }

    // AV valve: opens whenever the atrium is above the ventricle. A regurgitant valve leaks back
    // through Rback when closed. K adds the extra (quadratic) pressure drop of a stenotic orifice.
    avValve(name, dP) {
      const v = this.p.valves[name];
      let q;
      if (dP > 0) q = flowThrough(dP, v.R, v.K);
      else q = isFinite(v.Rback) ? dP / v.Rback : 0;
      this.setValve(name, dP > 0);
      return q;
    }

    // Semilunar valve with inertance: opens when the ventricle exceeds the artery, keeps moving
    // blood by momentum after the pressures cross, and snaps shut after a small backflow.
    semilunar(name, Pup, Pdown, h) {
      const v = this.p.valves[name];
      let q = this.Q[name];
      if (!this.valveOpen[name]) {
        if (Pup > Pdown) { this.setValve(name, true); this.backflow[name] = 0; q = 0; }
        else return isFinite(v.Rback) ? (Pup - Pdown) / (v.Rback + v.Zc) : 0;
      }
      const Rtot = v.R + v.Zc + v.K * Math.abs(q);
      q += (Pup - Pdown - Rtot * q) / v.L * h;
      if (q < 0) {
        this.backflow[name] += -q * h;
        if (this.backflow[name] > v.Vclose) { this.setValve(name, false); return isFinite(v.Rback) ? (Pup - Pdown) / (v.Rback + v.Zc) : 0; }
      }
      return q;
    }

    setValve(name, open) {
      if (this.valveOpen[name] === open) return;
      this.valveOpen[name] = open;
      const side = name === 'mitral' || name === 'aortic' ? 'left' : 'right';
      this.lastValveEvent[side] = { valve: name, open, t: this.t };
      this.events.push({ type: 'valve', valve: name, open, side, t: this.t, P: { ...this.P }, V: { ...this.V } });
      // Heart sounds: S1 when the AV valves close, S2 when the semilunar valves close.
      if (!open && name === 'mitral') this.events.push({ type: 'sound', sound: 'S1', t: this.t });
      if (!open && name === 'aortic') this.events.push({ type: 'sound', sound: 'S2', t: this.t });
    }

    /** Phase of the left (or right) ventricle, read from its two valves. */
    phase(side) {
      const [inV, outV] = side === 'right' ? ['tricuspid', 'pulmonary'] : ['mitral', 'aortic'];
      if (this.valveOpen[outV]) return 'ejection';
      if (this.valveOpen[inV]) return 'filling';
      const last = this.lastValveEvent[side || 'left'];
      if (last && last.valve === outV) return 'isovolumetric relaxation';
      return 'isovolumetric contraction';
    }

    // Per-beat bookkeeping, measured the way a clinician would: EDV when the AV valve closes,
    // ESV when the outflow valve closes, SV as the volume that actually went out through the
    // outflow valve. A cycle runs from one AV-valve closure to the next.
    trackCycle(side, h) {
      const c = this.cycle[side];
      const [ven, inV, outV, art] = side === 'L' ? ['LV', 'mitral', 'aortic', 'aorta'] : ['RV', 'tricuspid', 'pulmonary', 'pulTrunk'];
      const V = this.V[ven];
      c.vMax = Math.max(c.vMax, V); c.vMin = Math.min(c.vMin, V);
      c.pVentMax = Math.max(c.pVentMax, this.P[ven]);
      c.pArtMax = Math.max(c.pArtMax, this.P[art]); c.pArtMin = Math.min(c.pArtMin, this.P[art]);
      c.pArtInt += this.P[art] * h; c.dur += h;
      c.fwd += Math.max(0, this.Q[outV]) * h; c.back += Math.max(0, -this.Q[outV]) * h;
      if (this.valveOpen[outV]) c.wasEjecting = true;
      if (c.wasEjecting && !this.valveOpen[outV] && c.esv == null) c.esv = V;
      if (!this.valveOpen[inV] && c.inWasOpen) {
        // AV valve just closed: end of this cycle (end-diastole of the next).
        if (c.edv != null && c.esv != null && c.dur > 0.15) {
          const prevEdv = c.edv;
          this.stats[side] = {
            edv: prevEdv, esv: c.esv, sv: c.fwd - c.back, ef: (prevEdv - c.esv) / prevEdv,
            sys: c.pArtMax, dia: c.pArtMin, mean: c.pArtInt / c.dur, pVentMax: c.pVentMax,
            hr: 60 / c.dur, co: (c.fwd - c.back) * 60 / c.dur / 1000, t: this.t,
          };
          if (side === 'L') this.events.push({ type: 'beatStats', t: this.t, L: this.stats.L, R: this.stats.R });
        }
        const next = newCycle(); next.edv = V; this.cycle[side] = next; next.inWasOpen = false;
        return;
      }
      c.inWasOpen = this.valveOpen[inV];
    }

    takeEvents() { const e = this.events; this.events = []; return e; }

    /** Fraction of total blood volume in each region (for the "where is the blood" question). */
    distribution() {
      const tot = this.totalVolume(), V = this.V;
      return {
        sysVen: V.sysVen / tot, sysArt: V.sysArt / tot, pulmonary: (V.pulArt + V.pulVen) / tot,
        heart: (V.LA + V.LV + V.RA + V.RV) / tot,
      };
    }
  }

  function newCycle() {
    return { edv: null, esv: null, vMax: -Infinity, vMin: Infinity, pVentMax: -Infinity, pArtMax: -Infinity, pArtMin: Infinity, pArtInt: 0, dur: 0, fwd: 0, back: 0, wasEjecting: false, inWasOpen: true };
  }

  // Flow through an orifice with linear resistance R plus a quadratic (stenotic) term K:
  // dP = R·Q + K·Q²  →  Q = (−R + √(R² + 4K·dP)) / 2K
  function flowThrough(dP, R, K) {
    if (!K) return dP / R;
    return (-R + Math.sqrt(R * R + 4 * K * dP)) / (2 * K);
  }

  function deepAssign(target, src) {
    for (const k in src) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) { if (!target[k]) target[k] = {}; deepAssign(target[k], src[k]); }
      else target[k] = src[k];
    }
    return target;
  }

  return { Heart, defaultParams, activation, VALVES, UPSTREAM };
});
