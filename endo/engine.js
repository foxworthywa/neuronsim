/*
 * EndoSim engine: hormone feedback axes (see docs/ENDO_MODULE.md, "The models").
 *
 * Two three-level axes built on the same pattern:
 *   hypothalamus (releasing hormone) → pituitary (tropic hormone) → gland (target hormone),
 * with the target hormone feeding back on both upper levels, and with the gland's size following
 * the hormone that stimulates it (the trophic effect).
 *
 *   Thyroid: TRH → TSH → T4 (and T3, made mostly from T4 in the tissues).
 *   Adrenal: CRH → ACTH → cortisol, with a 24-hour rhythm and a stress input.
 *
 * Units: time in minutes; TSH mIU/L, free T4 ng/dL, free T3 pg/mL; ACTH pg/mL, cortisol µg/dL;
 * gland sizes in grams. TRH and CRH are not measured clinically, so they are reported relative to
 * normal (1 = normal). Each hormone pool is cleared at a rate set by its half-life; each step uses
 * the exact solution for a constant input over the step, so any step size is stable.
 * Works in the browser (window.EndoSim) and in Node (require).
 */
(function (root) {
  'use strict';

  const LN2 = Math.LN2, DAY = 1440, HOUR = 60;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // Move x toward the steady state of dx/dt = s − k·x over dt.
  function relax(x, s, k, dt) { if (k <= 0) return x + s * dt; const ss = s / k; return ss + (x - ss) * Math.exp(-k * dt); }
  // Inhibition by feedback, normalized to 1 when the signal is at its reference level.
  const inhibit = (x, ref, K, n) => (1 + Math.pow(ref / K, n)) / (1 + Math.pow(Math.max(0, x) / K, n));
  const sat = (x, K) => Math.max(0, x) / (Math.max(0, x) + K);
  const flag = (v, lo, hi) => (v < lo ? 'L' : v > hi ? 'H' : '');

  // =========================================================================
  // Thyroid axis
  // =========================================================================
  function thyroidParams() {
    return {
      FT4ref: 1.3, TSHref: 1.5, FT3ref: 3.0,
      T4poolRef: 900,          // µg of T4 outside the thyroid at normal free T4
      halfTSH: 60, halfT4: 7 * DAY, halfT3: 1 * DAY,
      tauMass: 28 * DAY,       // gland growth / shrinkage
      capExp: 0.6, tauCap: 30 * DAY,   // TSH cells multiply under long stimulation and dwindle under long suppression
      massRef: 18,             // g, a normal adult thyroid
      KsTSH: 3,                // mIU/L: TSH effect on the thyroid saturates above this
      // feedback of free T4 on the hypothalamus (TRH) and pituitary (TSH)
      Kh: 1.3, nh: 2, Kp: 0.65, np: 4,
      // lesions and conditions (1 = normal)
      hypothalamus: 1, pituitary: 1, thyroid: 1, iodine: 1,
      removed: false,          // thyroid surgically removed
      TSI: 0,                  // TSH-receptor-stimulating antibody (Graves'), in TSH-equivalent mIU/L
      nodule: 0,               // µg T4/day from an autonomous nodule (ignores TSH)
      levothyroxine: 0,        // µg/day by mouth
      absorbed: 0.8,           // fraction of an oral T4 dose that is absorbed
      clearance: 1,            // multiplier on T4 breakdown (e.g., a drug that speeds it)
      manualTSH: null,         // when set, the student is the pituitary (scene 2)
    };
  }

  class Thyroid {
    constructor(params) {
      this.p = Object.assign(thyroidParams(), params || {});
      this.reset();
    }
    reset() {
      const p = this.p;
      this.t = 0;
      this.TSH = p.TSHref; this.T4 = p.T4poolRef; this.T3 = 1; this.mass = 1; this.capP = 1;
      this.injected = 0;         // extra TSH given as a pulse (scene 1), mIU/L, decays like TSH
      this.events = [];
      this.computeRates();
    }
    get FT4() { return this.T4 * this.p.FT4ref / this.p.T4poolRef; }
    get FT3() { return this.T3 * this.p.FT3ref; }
    get TSHeff() { return this.TSH + this.injected + this.p.TSI; }
    get size() { return this.p.removed ? 0 : this.mass * this.p.massRef + (this.p.nodule > 0 ? 4 + this.p.nodule / 25 : 0); }
    // How well iodine supply lets the gland make hormone (1 with a normal diet).
    iodineFactor() { const I = Math.max(0, this.p.iodine); return 1.25 * I / (I + 0.25); }
    computeRates() {
      const p = this.p, F = this.FT4;
      const s0 = sat(p.TSHref, p.KsTSH);
      this.TRH = p.hypothalamus * inhibit(F, p.FT4ref, p.Kh, p.nh);
      this.pitStim = this.TRH * inhibit(F, p.FT4ref, p.Kp, p.np);   // what the TSH cells are told to do
      this.pitDrive = p.pituitary * this.capP * this.pitStim;          // TSH secretion, × normal
      this.fbHyp = 1 - 1 / (1 + Math.pow(F / p.Kh, p.nh));       // fraction of TRH output held back
      this.fbPit = 1 - 1 / (1 + Math.pow(F / p.Kp, p.np));
      const P0 = p.T4poolRef * LN2 / p.halfT4 * DAY;             // µg/day made by a normal gland
      const func = p.removed ? 0 : p.thyroid;
      this.glandT4 = P0 * this.mass * func * this.iodineFactor() * sat(this.TSHeff, p.KsTSH) / s0;   // µg/day
      this.T4in = this.glandT4 + p.nodule + p.levothyroxine * p.absorbed;                            // µg/day
      this.P0 = P0;
    }
    advance(dt) {
      const p = this.p;
      // internal steps of at most 10 min (TSH half-life is 60 min)
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(10, left); left -= h;
        this.computeRates();
        const kTSH = LN2 / p.halfTSH;
        if (p.manualTSH != null) this.TSH = relax(this.TSH, kTSH * p.manualTSH, kTSH, h);
        else this.TSH = relax(this.TSH, kTSH * p.TSHref * this.pitDrive, kTSH, h);
        this.injected = relax(this.injected, 0, kTSH, h);
        const kT4 = LN2 / p.halfT4 * p.clearance;
        this.T4 = relax(this.T4, this.T4in / DAY, kT4, h);
        // T3: about 80 % made from T4 in the tissues, 20 % secreted by the gland
        const t3prod = 0.8 * (this.T4 / p.T4poolRef) + 0.2 * (this.glandT4 + p.nodule) / this.P0;
        this.T3 = relax(this.T3, LN2 / p.halfT3 * t3prod, LN2 / p.halfT3, h);
        // trophic effect: the gland grows toward a size set by what stimulates it; a damaged
        // (autoimmune) gland cannot grow much
        // TSH cells: weeks of strong stimulation (an underactive thyroid) build up their number,
        // weeks of suppression shrink it. This is why TSH lags weeks behind a change in T4.
        const capTarget = clamp(Math.pow(this.pitStim, p.capExp), 0.2, 4);
        this.capP = relax(this.capP, capTarget / p.tauCap, 1 / p.tauCap, h);
        if (!p.removed) {
          const target = clamp(Math.sqrt(this.TSHeff / p.TSHref), 0.25, 4) * Math.min(1, p.thyroid + 0.15);
          this.mass = relax(this.mass, target / p.tauMass, 1 / p.tauMass, h);
        }
        this.t += h;
      }
      this.computeRates();
    }
    takeEvents() { const e = this.events; this.events = []; return e; }
    injectTSH(mIU) { this.injected += mIU; }
    removeThyroid() { this.p.removed = true; this.mass = 0; }
    // 24-h radioactive iodine uptake (%): how hard the gland is trapping iodine.
    get RAIU() {
      const p = this.p;
      if (p.removed) return 1;
      const trap = this.mass * p.thyroid * sat(this.TSHeff, p.KsTSH) / sat(p.TSHref, p.KsTSH) / Math.pow(Math.max(0.1, p.iodine), 0.15);
      return 100 * (1 - Math.exp(-0.2877 * trap)) + (p.nodule > 0 ? 3 : 0);
    }
    get TRAb() { return this.p.TSI > 0 ? 2 + 0.8 * this.p.TSI : 0.6; }
    // Lab results with reference ranges and H/L flags, as on a lab report.
    lab(tests) {
      const all = {
        TSH: ['TSH', this.TSHeff - this.p.TSI, 'mIU/L', 0.4, 4.0, 2],
        freeT4: ['Free T4', this.FT4, 'ng/dL', 0.8, 1.8, 2],
        freeT3: ['Free T3', this.FT3, 'pg/mL', 2.3, 4.2, 1],
        TRAb: ['TSH-receptor antibody', this.TRAb, 'IU/L', 0, 1.75, 1],
        size: ['Thyroid size (ultrasound)', this.size, 'g', 10, 25, 0],
        RAIU: ['Radioactive iodine uptake (24 h)', this.RAIU, '%', 10, 30, 0],
      };
      return (tests || Object.keys(all)).map(k => { const [name, v, unit, lo, hi, d] = all[k]; return { key: k, name, value: v, unit, lo, hi, digits: d, flag: flag(v, lo, hi) }; });
    }
    snapshot() { return { t: this.t, TRH: this.TRH, TSH: this.TSHeff - this.p.TSI, FT4: this.FT4, FT3: this.FT3, size: this.size, T4in: this.T4in, glandT4: this.glandT4 }; }
  }

  // =========================================================================
  // Adrenal axis
  // =========================================================================
  function adrenalParams() {
    return {
      Cref: 13, Aref: 20,      // reference cortisol (µg/dL) and ACTH (pg/mL) for normalizing
      halfACTH: 10, halfCortisol: 75,
      KaACTH: 70,              // pg/mL: ACTH effect on the adrenal cortex saturates above this
      Kh: 40, nh: 1, Kp: 15, np: 3,   // glucocorticoid feedback on CRH and ACTH
      tauMass: 14 * DAY, massRef: 5,   // g, one adult adrenal gland
      tauCap: 7 * DAY,         // CRH and ACTH cells recover from long suppression over weeks
      wake: 6.5,                 // h, time of waking (the rhythm peaks just after it)
      rhythmLow: 0.08,         // night-time drive, relative to the morning peak of 2
      hypothalamus: 1, pituitary: 1, adrenal: 1,
      pitTumour: 1,            // ACTH-secreting pituitary tumour: × ACTH output …
      pitResist: 1,            // … and × feedback set point (needs more cortisol to hold it back)
      ectopicACTH: 0,          // pg/mL-per-normal of ACTH from a tumour outside the pituitary
      adrenalTumour: 0,        // µg/dL-equivalent of cortisol made regardless of ACTH
      stress: 1,
    };
  }
  // Prednisone: once-daily at 8 am. Its effect is expressed in cortisol-equivalent µg/dL, and it
  // fades with a biological half-life of about 12 h. Dexamethasone: the cortisol test does not
  // detect it, it is ~7× as potent as prednisone per mg, and it lasts longer.
  const PRED_PER_MG = 3.0, PRED_HALF = 12 * HOUR, DEX_PER_MG = 75, DEX_HALF = 36 * HOUR;

  class Adrenal {
    constructor(params) {
      this.p = Object.assign(adrenalParams(), params || {});
      this.reset();
    }
    reset() {
      this.t = 0;              // minutes since midnight of day 0
      this.ACTH = 6; this.cortisol = 3;
      this.mass = 1; this.capH = 1; this.capP = 1;   // adrenal size, CRH and ACTH cell capacity (× normal)
      this.pred = 0; this.dex = 0;                    // glucocorticoid-equivalent drug levels
      this.prednisone = 0;     // mg/day (given at 8 am)
      this.synACTH = 0;        // cosyntropin (synthetic ACTH) in the blood, pg/mL
      this.events = [];
      this.computeRates();
      // settle the rhythm over a few days so day 0 already looks normal
      this.advance(4 * DAY); this.t = 0; this.events = [];
    }
    get hour() { return ((this.t / HOUR) % 24 + 24) % 24; }
    get day() { return Math.floor(this.t / DAY); }
    // The body's own 24-hour drive to the CRH cells: low through the evening and first half of the
    // night, rising in the hours before waking, highest just after waking.
    circadian(hour) {
      const w = this.p.wake;
      const h = ((hour - w) % 24 + 24) % 24;           // hours since waking
      const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
      const lo = this.p.rhythmLow, hi = 2;
      if (h >= 20 || h < 1) return lo + (hi - lo) * smooth((h >= 20 ? h - 20 : h + 4) / 5);   // rising to a peak ~1 h after waking
      if (h < 13) return lo + (hi - lo) * (1 - smooth((h - 1) / 12));
      return lo;                                       // evening and first half of the night
    }
    get gcEffect() { return this.cortisol + this.pred + this.dex; }   // what the body's tissues feel
    computeRates() {
      const p = this.p, G = this.gcEffect;
      this.fbH = inhibit(G, p.Cref, p.Kh, p.nh);
      this.fbP = inhibit(G, p.Cref * p.pitResist, p.Kp * p.pitResist, p.np);
      this.CRH = p.hypothalamus * this.capH * this.circadian(this.hour) * p.stress * this.fbH;
      // stress also drives the ACTH cells directly (vasopressin from the same hypothalamic neurons)
      this.ACTHin = p.Aref * (p.pituitary * this.capP * p.pitTumour * this.CRH * p.stress * this.fbP + p.ectopicACTH);
      const A = this.ACTH + this.synACTH;
      this.adrenalOut = p.Cref * this.mass * p.adrenal * sat(A, p.KaACTH) / sat(p.Aref, p.KaACTH) + p.adrenalTumour;
      this.fbHyp = 1 - 1 / (1 + Math.pow(G / p.Kh, p.nh));
      this.fbPit = 1 - 1 / (1 + Math.pow(G / (p.Kp * p.pitResist), p.np));
    }
    advance(dt) {
      const p = this.p;
      let left = dt;
      while (left > 1e-9) {
        // steps of at most 2 min (ACTH half-life is 10 min); stop exactly at 8 am for the dose
        const toDose = ((8 * HOUR - (this.t % DAY)) % DAY + DAY) % DAY || DAY;
        const h = Math.min(2, left, toDose); left -= h;
        this.computeRates();
        const kA = LN2 / p.halfACTH, kC = LN2 / p.halfCortisol;
        this.ACTH = relax(this.ACTH, kA * this.ACTHin, kA, h);
        this.synACTH = relax(this.synACTH, 0, LN2 / 30, h);
        this.cortisol = relax(this.cortisol, kC * this.adrenalOut, kC, h);
        this.pred = relax(this.pred, 0, LN2 / PRED_HALF, h);
        this.dex = relax(this.dex, 0, LN2 / DEX_HALF, h);
        // trophic effect: adrenal size follows ACTH (averaged over weeks by the slow time constant)
        const A = this.ACTH + this.synACTH;
        const massTarget = clamp(Math.pow(sat(A, p.KaACTH) / sat(p.Aref, p.KaACTH), 1.2), 0.2, 3) * Math.min(1, p.adrenal + 0.15);
        this.mass = relax(this.mass, massTarget / p.tauMass, 1 / p.tauMass, h);
        // CRH and ACTH cells held back for weeks by a strong glucocorticoid lose capacity, and
        // regain it over weeks once released: the reason a long steroid course is tapered
        const quiet = 1 / (1 + Math.pow(Math.max(0, this.pred + this.dex) / 12, 2));
        const capTarget = clamp(quiet, 0.12, 1);
        this.capH = relax(this.capH, capTarget / p.tauCap, 1 / p.tauCap, h);
        this.capP = relax(this.capP, capTarget / p.tauCap, 1 / p.tauCap, h);
        this.t += h;
        if (Math.abs(this.t % DAY - 8 * HOUR) < 1e-6 && this.prednisone > 0) {
          this.pred += PRED_PER_MG * this.prednisone;
          this.events.push({ type: 'dose', drug: 'prednisone', mg: this.prednisone, t: this.t });
        }
      }
      this.computeRates();
    }
    takeEvents() { const e = this.events; this.events = []; return e; }
    setPrednisone(mgPerDay) { this.prednisone = Math.max(0, mgPerDay); }
    giveDexamethasone(mg) { this.dex += DEX_PER_MG * mg; this.events.push({ type: 'dose', drug: 'dexamethasone', mg, t: this.t }); }
    giveCosyntropin() { this.synACTH += 6000; this.events.push({ type: 'dose', drug: 'cosyntropin', t: this.t }); }
    // Advance to the next time the clock reads `hour` (0–24); returns minutes advanced.
    advanceTo(hour) {
      const now = this.t % DAY, target = hour * HOUR;
      let d = target - now; if (d <= 1e-6) d += DAY;
      this.advance(d); return d;
    }
    lab(tests) {
      const h = this.hour, morning = h >= 6 && h <= 10;
      const all = {
        cortisol: [`Cortisol (${clockLabel(h)})`, this.cortisol, 'µg/dL', morning ? 5 : 0, morning ? 25 : (h >= 22 || h < 2 ? 5 : 15), 1],
        ACTH: [`ACTH (${clockLabel(h)})`, this.ACTH, 'pg/mL', morning ? 10 : 0, 60, 0],
        salivary: ['Late-night salivary cortisol', 0.025 * this.cortisol, 'µg/dL', 0, 0.09, 3],
        size: ['Adrenal size (one gland, CT)', this.mass * this.p.massRef + (this.p.adrenalTumour > 0 ? 12 : 0), 'g', 3, 7, 1],
      };
      return (tests || Object.keys(all)).map(k => { const [name, v, unit, lo, hi, d] = all[k]; return { key: k, name, value: v, unit, lo, hi, digits: d, flag: flag(v, lo, hi) }; });
    }
    snapshot() { return { t: this.t, CRH: this.CRH, ACTH: this.ACTH, cortisol: this.cortisol, gc: this.gcEffect, size: this.mass * this.p.massRef, pred: this.pred, dex: this.dex }; }
  }
  function clockLabel(h) {
    const hh = Math.floor(h + 1e-6) % 24, mm = Math.round((h - Math.floor(h + 1e-6)) * 60) % 60;
    const ap = hh < 12 ? 'am' : 'pm', h12 = hh % 12 === 0 ? 12 : hh % 12;
    if (hh === 0 && mm === 0) return 'midnight';
    if (hh === 12 && mm === 0) return 'noon';
    return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${ap}`;
  }

  // Ready-made people for the lessons and tests. Severity values are chosen so the lab values
  // match the cases in docs/ENDO_MODULE.md.
  const PATIENTS = {
    healthy: { axis: 'thyroid' },
    maria: { axis: 'thyroid', params: { thyroid: 0.16 } },            // Hashimoto's (primary hypothyroidism)
    secondary: { axis: 'thyroid', params: { pituitary: 0.02 } },
    iodine: { axis: 'thyroid', params: { iodine: 0.01 } },
    graves: { axis: 'thyroid', params: { TSI: 4 } },
    tablets: { axis: 'thyroid', params: { levothyroxine: 200 } },
    cushingDisease: { axis: 'adrenal', params: { pitTumour: 2.2, pitResist: 2.6 } },
    ectopic: { axis: 'adrenal', params: { ectopicACTH: 3.5 } },
    adrenalTumour: { axis: 'adrenal', params: { adrenalTumour: 32 } },
    addison: { axis: 'adrenal', params: { adrenal: 0.2 } },
  };
  // A person who has reached the steady state of their condition (gland sizes too).
  function patient(name, days) {
    const def = PATIENTS[name];
    const ax = def.axis === 'thyroid' ? new Thyroid(def.params) : new Adrenal(def.params);
    ax.advance((days || 240) * DAY);
    ax.t = 0;
    ax.takeEvents();
    return ax;
  }

  const api = { Thyroid, Adrenal, thyroidParams, adrenalParams, patient, PATIENTS, DAY, HOUR, clockLabel, PRED_PER_MG, DEX_PER_MG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EndoSim = api;
})(typeof self !== 'undefined' ? self : this);
