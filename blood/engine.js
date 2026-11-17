/*
 * BloodSim engine: the white blood cell differential. See docs/BLOOD_MODULE.md.
 *
 * Three small models, all semi-quantitative (docs/PEDAGOGY.md §9). Time is in hours.
 *
 *   Blood   the five white cells as pools in the blood (cells per microlitre). Each pool is a
 *           balance: cells enter from a reserve (the bone marrow; for lymphocytes, the lymph nodes
 *           and spleen) and leave for the tissues after a few hours to a day. A condition (a
 *           bacterial infection, a virus, an allergy, a parasite) "calls" one kind of cell, which
 *           raises its release, its exit and, after a lag, its production.
 *   Bench   a patch of tissue with one problem in it (bacteria, debris, a parasitic worm, pollen
 *           in an allergic person, virus-infected cells) and one kind of white cell called out of
 *           the blood, in proportion to how many of that kind the blood carries.
 *   counts  a differential is a sample: `differential(n)` draws n white cells from the blood, and
 *           the binomial helpers say how far such a count strays by chance.
 *
 * No DOM here: the same file runs in the browser and under Node (tests/blood.test.js).
 */
(function (root) {
  'use strict';

  const DAY = 24;
  const TYPES = ['neut', 'lymph', 'mono', 'eos', 'baso'];
  const NAMES = { neut: 'neutrophil', lymph: 'lymphocyte', mono: 'monocyte', eos: 'eosinophil', baso: 'basophil' };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // Seeded random numbers (mulberry32), so tests repeat and each group's slide can differ.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------------------------------------
  // The five cells. n0: cells per microlitre of blood in a healthy adult (55, 36, 6, 2.5 and 0.5 %
  // of 7,000). tau: mean time a cell spends in the blood, hours (a half-life of about 7 h for
  // neutrophils). reserve: cells waiting to be released, as a multiple of the number in the blood.
  // gRel, gExit, gProd: how strongly a call raises release, exit to the tissues and production.
  // lag: hours for production to follow a call.
  // ---------------------------------------------------------------------------------------------
  const CELL = {
    neut:  { n0: 3850, tau: 10, reserve: 15, gRel: 3.5, gExit: 0.5, gProd: 3.5, lag: 36 },
    lymph: { n0: 2520, tau: 24, reserve: 0,  gRel: 1,   gExit: 0,   gProd: 0,   lag: 1 },
    mono:  { n0: 420,  tau: 30, reserve: 2,  gRel: 1.2, gExit: 0.4, gProd: 1.2, lag: 36 },
    eos:   { n0: 175,  tau: 24, reserve: 4,  gRel: 3,   gExit: 0.3, gProd: 3,   lag: 60 },
    baso:  { n0: 35,   tau: 48, reserve: 2,  gRel: 0.8, gExit: 0.2, gProd: 0.8, lag: 60 },
  };
  const RBC_PER_UL = 5.0e6;

  // Reference ranges. Percentages are the ones printed on the lab handout (El Brihi and Pathak,
  // StatPearls, 2024); the absolute ranges are the usual adult ones.
  const REF = {
    pct: { neut: [40, 60], lymph: [20, 40], mono: [2, 8], eos: [0, 4], baso: [0, 1] },
    abs: { neut: [1500, 8000], lymph: [1000, 4800], mono: [200, 950], eos: [0, 500], baso: [0, 200] },
    wbc: [4500, 11000],
  };
  const flag = (v, r) => (v < r[0] ? 'L' : v > r[1] ? 'H' : '');

  // What each condition calls, and how fast the call builds and fades (hours).
  const CONDITION = {
    // An acute bacterial infection that the body clears in about six days.
    bacterial: { rise: 6, fall: 18, lasts: 6 * DAY, calls: { neut: 1, mono: 0.6 } },
    // Seasonal allergy: lasts for as long as the person is exposed.
    allergy: { rise: 4 * DAY, fall: 5 * DAY, lasts: Infinity, calls: { eos: 1, baso: 0.5 } },
    // A parasitic worm: a stronger, slower call for the same cell.
    parasite: { rise: 7 * DAY, fall: 7 * DAY, lasts: Infinity, calls: { eos: 3, baso: 0.5 } },
    // A virus such as the one that causes mononucleosis: the lymphocytes selected by the virus
    // multiply in the lymph nodes and spill into the blood, peaking about day 12.
    viral: { peak: 12 * DAY, size: 2 },
  };

  class Blood {
    constructor(o) {
      o = o || {};
      this.t = 0;
      this.n = {}; this.reserve = {}; this.prod = {};
      for (const k of TYPES) { this.n[k] = CELL[k].n0; this.reserve[k] = CELL[k].reserve * CELL[k].n0; this.prod[k] = CELL[k].n0 / CELL[k].tau; }
      this.conditions = [];
      this.supply = 1;            // 1 = normal release from the reserves (tests set it to 0 to measure lifetimes)
      this.flow = { release: {}, exit: {} };
      this._flows();
      if (o.condition) this.start(o.condition, o);
    }
    copy() {
      const b = new Blood();
      b.t = this.t; b.supply = this.supply;
      Object.assign(b.n, this.n); Object.assign(b.reserve, this.reserve); Object.assign(b.prod, this.prod);
      b.conditions = this.conditions.map(c => Object.assign({}, c));
      b._flows();
      return b;
    }
    start(kind, o) {
      if (!CONDITION[kind]) throw new Error('unknown condition: ' + kind);
      this.conditions.push({ kind, t0: this.t, severity: (o && o.severity) || 1, level: 0, on: true });
      return this;
    }
    end(kind) { for (const c of this.conditions) if (c.kind === kind) c.on = false; return this; }
    active(kind) { return this.conditions.some(c => c.kind === kind && c.on); }
    // How strongly the tissues are calling for this kind of cell right now (0 = not at all).
    call(type) {
      let s = 0;
      for (const c of this.conditions) { const def = CONDITION[c.kind]; if (def.calls && def.calls[type]) s += def.calls[type] * c.severity * c.level; }
      return s;
    }
    // Extra lymphocytes entering the blood from the lymph nodes, as a multiple of the normal supply.
    expansion() {
      let s = 0;
      for (const c of this.conditions) {
        const def = CONDITION[c.kind]; if (!def.peak) continue;
        const x = (this.t - c.t0) / def.peak;
        if (x > 0) s += def.size * c.severity * x * x * Math.exp(2 * (1 - x));
      }
      return s;
    }
    _flows() {
      for (const k of TYPES) {
        const p = CELL[k], base = p.n0 / p.tau, c = this.call(k);
        if (k === 'lymph') this.flow.release[k] = base * (1 + this.expansion()) * this.supply;
        else this.flow.release[k] = base * (1 + p.gRel * c) * clamp(this.reserve[k] / (0.2 * p.reserve * p.n0), 0, 1) * this.supply;
        this.flow.exit[k] = this.n[k] / p.tau * (1 + p.gExit * c);
      }
    }
    advance(dt) {
      const H = 0.25;
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(H, left); left -= h;
        for (const c of this.conditions) {
          const def = CONDITION[c.kind]; if (!def.calls) continue;
          if (c.on && this.t - c.t0 >= def.lasts) c.on = false;
          c.level += ((c.on ? 1 : 0) - c.level) * (1 - Math.exp(-h / (c.on ? def.rise : def.fall)));
        }
        this._flows();
        for (const k of TYPES) {
          const p = CELL[k], base = p.n0 / p.tau;
          this.n[k] = Math.max(0, this.n[k] + (this.flow.release[k] - this.flow.exit[k]) * h);
          if (k === 'lymph') continue;
          // production follows the call after a lag, and refills the reserve over about three days
          const full = p.reserve * p.n0;
          const target = base * (1 + p.gProd * this.call(k)) + (full - this.reserve[k]) / 72;
          this.prod[k] += (target - this.prod[k]) * (1 - Math.exp(-h / p.lag));
          this.reserve[k] = Math.max(0, this.reserve[k] + (this.prod[k] - this.flow.release[k]) * h);
        }
        this.t += h;
      }
      this._flows();
      return this;
    }
    get total() { return TYPES.reduce((s, k) => s + this.n[k], 0); }
    get percent() { const T = this.total, o = {}; for (const k of TYPES) o[k] = 100 * this.n[k] / T; return o; }
    // The report an analyser would print: it counts thousands of cells, so chance plays no part.
    report() {
      const pc = this.percent;
      return {
        wbc: { value: this.total, range: REF.wbc, flag: flag(this.total, REF.wbc) },
        rows: TYPES.map(k => ({ type: k, pct: pc[k], pctRange: REF.pct[k], pctFlag: flag(Math.round(pc[k] * 10) / 10, REF.pct[k]), abs: this.n[k], absRange: REF.abs[k], absFlag: flag(this.n[k], REF.abs[k]) })),
      };
    }
    // A manual differential: n white cells met one after another on the smear. Returns their types in order.
    cells(n, rand) {
      const T = this.total, out = [];
      for (let i = 0; i < n; i++) {
        let u = rand() * T, type = TYPES[TYPES.length - 1];
        for (const k of TYPES) { if (u < this.n[k]) { type = k; break; } u -= this.n[k]; }
        out.push(type);
      }
      return out;
    }
    differential(n, rand) { return tally(this.cells(n, rand)); }
  }
  function tally(cells) { const o = {}; for (const k of TYPES) o[k] = 0; for (const c of cells) o[c]++; return o; }
  // Which lines of a count of n cells fall outside the handout's reference ranges.
  function flags(count, n) {
    const o = {};
    for (const k of TYPES) { const f = flag(100 * count[k] / n, REF.pct[k]); if (f) o[k] = f; }
    return o;
  }

  // ---------------------------------------------------------------------------------------------
  // Chance in a count of n cells (binomial).
  // ---------------------------------------------------------------------------------------------
  function binomPmf(n, p, k) {
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    let logC = 0;
    for (let i = 1; i <= k; i++) logC += Math.log((n - k + i) / i);
    return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }
  // Probability of counting k or more.
  function binomAtLeast(n, p, k) { let s = 0; for (let i = Math.max(0, k); i <= n; i++) s += binomPmf(n, p, i); return Math.min(1, s); }
  // The range that holds the middle `level` of counts (0.95: all but 1 count in 20).
  function binomRange(n, p, level) {
    const tail = (1 - (level || 0.95)) / 2;
    let lo = 0, hi = n, s = 0;
    for (let k = 0; k <= n; k++) { s += binomPmf(n, p, k); if (s > tail) { lo = k; break; } }
    s = 0;
    for (let k = n; k >= 0; k--) { s += binomPmf(n, p, k); if (s > tail) { hi = k; break; } }
    return [lo, hi];
  }

  // ---------------------------------------------------------------------------------------------
  // The bench: one problem in a patch of tissue, and one kind of white cell called out of the blood.
  // ---------------------------------------------------------------------------------------------
  const ARRIVE = 0.255;                 // each hour, this fraction of the called cell's blood count (per µL) reaches the site
  const GROW = Math.LN2 / 1.5;          // bacteria double every 90 minutes
  const CRIT_NEUT = 2000;               // neutrophils at the site at which killing equals growth (as in ImmuneSim)
  const PROBLEMS = {
    bacteria: { hours: 24, winner: 'neut' },
    debris: { hours: 72, winner: 'mono' },
    worm: { hours: 72, winner: 'eos' },
    pollen: { hours: 6, winner: 'baso' },
    virus: { hours: 240, winner: 'lymph' },
  };

  class Bench {
    constructor(o) {
      o = o || {};
      if (!PROBLEMS[o.problem]) throw new Error('unknown problem: ' + o.problem);
      this.problem = o.problem;
      this.blood = Object.assign({}, o.counts || Object.fromEntries(TYPES.map(k => [k, CELL[k].n0])));
      this.reset();
    }
    reset() {
      const p = this.problem;
      this.t = 0; this.sent = null; this.events = []; this.done = {}; this.solvedAt = null;
      this.site = { neut: 0, lymph: 0, mono: 0, eos: 0, baso: 0 };
      this.macrophages = 0;
      this.bacteria = p === 'bacteria' ? 1e5 : 0;
      this.debris = p === 'debris' ? 20000 : 0;          // counted in dead neutrophils
      this.worm = p === 'worm' ? 1 : 0;                  // how intact the larva is (1 = unharmed)
      this.attached = 0; this.degranulating = false;
      this.pollen = p === 'pollen' ? 1 : 0;
      this.histamine = 0; this.leak = 0;
      this.infected = p === 'virus' ? 20 : 0;            // of 1,000 lining cells
      this.clone = 0;                                    // lymphocytes whose receptor fits the virus
      return this;
    }
    get hours() { return PROBLEMS[this.problem].hours; }
    send(type) { if (!NAMES[type]) throw new Error('unknown cell: ' + type); this.sent = type; return this; }
    _event(type) { if (!this.done[type]) { this.done[type] = true; this.solvedAt = this.t; this.events.push({ type, t: this.t }); } }
    takeEvents() { return this.events.splice(0); }
    advance(dt) {
      const H = 0.05;
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(H, left); left -= h;
        const s = this.site, k = this.sent;
        // arrivals, in proportion to how many of that cell the blood carries
        if (k && k !== 'lymph') s[k] += ARRIVE * this.blood[k] * h;
        // unselected lymphocytes pass through and leave again (about two hours in the tissue)
        if (k === 'lymph') s.lymph += (ARRIVE * this.blood.lymph - s.lymph / 2) * h;
        // lifetimes at the site: a neutrophil lasts about a day and its remains are the pus
        const dead = s.neut / 24 * h;
        s.neut -= dead; this.debris += dead;
        s.eos -= s.eos / 96 * h; s.baso -= s.baso / 72 * h;
        // a monocyte grows into a macrophage over most of a day; macrophages last for weeks
        const grown = s.mono / 16 * h;
        s.mono -= grown; this.macrophages += grown;

        if (this.problem === 'bacteria' && this.bacteria > 0) {
          const kN = GROW / CRIT_NEUT;
          const kill = kN * (s.neut + 2 * this.macrophages + 0.1 * s.eos);
          this.bacteria += (GROW * (1 - this.bacteria / 1e9) - kill) * this.bacteria * h;
          if (this.bacteria < 1) { this.bacteria = 0; this._event('cleared'); }
        }
        if (this.debris > 0) {
          // macrophages swallow dead cells quickly; neutrophils hardly at all
          const eaten = Math.min(this.debris, (0.5 * this.macrophages + 0.02 * s.neut) * this.debris / (this.debris + 500) * h);
          this.debris -= eaten;
          if (this.problem === 'debris' && this.debris < 200) this._event('cleared');
        }
        if (this.problem === 'worm' && this.worm > 0) {
          // no cell can swallow it: cells can only spread over its surface (room for about 400)
          const present = k === 'mono' ? this.macrophages + s.mono : k ? s[k] : 0;
          this.attached = k === 'lymph' || k === 'baso' ? 0 : Math.min(400, present);
          const perCell = k === 'eos' ? 1 / 40 : k === 'neut' ? 1 / 2000 : k === 'mono' ? 1 / 1500 : 0;
          this.degranulating = k === 'eos' && this.attached > 1;
          this.worm -= perCell * this.attached / 400 * h;
          if (this.worm <= 0) { this.worm = 0; this.degranulating = false; this._event('cleared'); }
        }
        if (this.problem === 'pollen') {
          // only a cell carrying antibody against pollen on its surface responds: the basophil
          this.histamine += (0.15 * s.baso * this.pollen - this.histamine / 0.5) * h;
          this.leak = this.histamine / (this.histamine + 1);
          if (this.leak > 0.5) this._event('symptoms');
        }
        if (this.problem === 'virus' && this.infected > 0) {
          // the one lymphocyte in the sample that fits is selected, then doubles every 10 hours
          if (k === 'lymph') { if (this.clone === 0) this.clone = 1; if (this.t > 24) this.clone = Math.min(2e5, this.clone * Math.pow(2, h / 10)); }
          const beta = 1 / 24;
          this.infected += (beta * (1 - this.infected / 600) - beta / 3000 * this.clone) * this.infected * h;
          if (this.infected < 1) { this.infected = 0; this._event('cleared'); }
        }
        this.t += h;
      }
      return this;
    }
    // Did the cell that was sent deal with the problem?
    get solved() { return !!(this.done.cleared || this.done.symptoms); }
    // The number that measures this problem, and its name.
    get measure() {
      switch (this.problem) {
        case 'bacteria': return { label: 'Bacteria', value: this.bacteria };
        case 'debris': return { label: 'Dead cells and debris', value: this.debris };
        case 'worm': return { label: 'Parasite intact', value: this.worm };
        case 'pollen': return { label: 'Swelling and sneezing', value: this.leak };
        default: return { label: 'Infected cells (of 1,000)', value: this.infected };
      }
    }
  }
  // Run one problem with one cell from start to finish (used by the lesson's tables and the tests).
  function trial(problem, type, counts) {
    const b = new Bench({ problem, counts }).send(type);
    b.advance(b.hours);
    return b;
  }

  const api = { Blood, Bench, trial, tally, flags, flag, binomPmf, binomAtLeast, binomRange, rng, TYPES, NAMES, CELL, REF, CONDITION, PROBLEMS, RBC_PER_UL, DAY, ARRIVE, CRIT_NEUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BloodSim = api;
})(typeof self !== 'undefined' ? self : this);
