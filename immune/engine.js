/*
 * ImmuneSim engine: one infection from start to finish (see docs/IMMUNE_MODULE.md, "The model").
 *
 * Three places, as on screen:
 *   the SITE   bacteria between the cells of a wound, or a virus in the cells lining the airway,
 *              with resident macrophages, an alarm signal, a blood vessel and neutrophils;
 *   the NODE   three libraries of lymphocyte clones (B, helper T, cytotoxic T), each clone with a
 *              receptor of a different shape, built before any pathogen is chosen;
 *   the BLOOD  neutrophil and helper-T counts, and antibody.
 *
 * Nothing in the code says which clone wins: every clone divides at a rate set by how well its
 * receptor fits the antigen that reaches the node, and the best-fitting one outgrows the rest.
 * Memory is the same rule run on a library in which one clone has become hundreds of times larger.
 *
 * Units: time in hours; cells and bacteria as counts in the patch of tissue shown; antibody in
 * arbitrary units (1 = just detectable). Works in the browser (window.ImmuneSim) and in Node.
 */
(function (root) {
  'use strict';

  const DAY = 24, LN2 = Math.LN2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sat = (x, K) => (x <= 0 ? 0 : x / (x + K));
  const flag = (v, lo, hi) => (v < lo ? 'L' : v > hi ? 'H' : '');

  // Seeded random numbers (mulberry32), so a run can be repeated exactly.
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
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; }

  // ---------------------------------------------------------------- shape space
  // Every receptor and every antigen is a point in a unit square that wraps round at the edges.
  // Binding strength falls off with the distance between them.
  const GRID = 36;            // each library has GRID × GRID clones
  const SIGMA = 0.02;         // width of binding
  function dist(ax, ay, bx, by) {
    let dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    if (dx > 0.5) dx = 1 - dx; if (dy > 0.5) dy = 1 - dy;
    return Math.sqrt(dx * dx + dy * dy);
  }
  const fitAt = (d) => Math.exp(-d * d / (2 * SIGMA * SIGMA));
  const GOOD_FIT = 0.5;       // "fits": at least half the best possible binding

  // The body's own shapes. Lymphocytes whose receptors fit one of these are removed before they
  // are released (self screening).
  const SELF = [[0.12, 0.18], [0.37, 0.71], [0.58, 0.29], [0.81, 0.62], [0.26, 0.44], [0.69, 0.88], [0.91, 0.13], [0.47, 0.52]];
  const fitsSelf = (x, y) => SELF.some(([sx, sy]) => dist(x, y, sx, sy) < 1.6 * SIGMA);

  // An antigen's shape depends only on the pathogen and its strain (never on the person or on what
  // was asked for earlier), and is kept well away from the body's own shapes.
  const antigenCache = {};
  function antigenShape(kind, strain) {
    const key = kind + ':' + strain;
    if (antigenCache[key]) return antigenCache[key];
    const r = rng(hashStr('antigen|' + key));
    for (;;) {
      const x = r(), y = r();
      if (SELF.some(([sx, sy]) => dist(x, y, sx, sy) < 6 * SIGMA)) continue;
      return (antigenCache[key] = { x, y, key, kind, strain });
    }
  }

  function buildLibrary(kind, rand) {
    const clones = [];
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      // one clone in each cell of a grid, at a random place within it: random shapes, with no gaps
      const x = (i + 0.15 + 0.7 * rand()) / GRID, y = (j + 0.15 + 0.7 * rand()) / GRID;
      const n0 = 1 + Math.floor(rand() * 3);
      clones.push({ id: kind + (i * GRID + j), kind, x, y, n0, self: fitsSelf(x, y), R: n0, E: 0, mem: 0, LL: 0, ab: 0, present: true });
    }
    return clones;
  }

  // ---------------------------------------------------------------- parameters
  function params() {
    const g = LN2 / 1.5;      // bacteria double every 90 minutes when nothing stops them
    return {
      // bacteria at the site
      g, K: 1e9,
      macKill: 800, macHalf: 800,     // resident macrophages: a few cells that can eat only so many an hour
      critN: 2000,                    // neutrophils at the site needed to kill bacteria as fast as they divide
      recruit: 260, tauN: 12,         // neutrophils per hour leaving the blood at full alarm; lifetime at the site (h)
      KC: 2e6,                        // bacteria at which the macrophages' alarm is half-maximal
      ampBase: 0.45, ampN: 800,       // neutrophils at the site add to the alarm
      tauC: 1.5,
      opsMax: 30, opsK: 30,           // antibody coating multiplies phagocyte killing
      // virus in the airway lining
      cells: 1e6, beta: 1e-7, betaCell: 5e-7, eclipse: 6, produce: 5, burst: 10, clearV: LN2 / 3, regrow: 0.012,
      brake: 10, KF: 2e4,             // infected cells warn their neighbours (innate brake on spread)
      neutK: 40,                      // antibody that halves entry of free virus into cells
      ctlKill: 1e-4,                  // per cytotoxic T cell per hour
      // antigen carried to the node by dendritic cells
      loadB: 1e5, loadV: 1e4, transit: 18, persist: 30,
      // lymphocytes
      KA: 0.1, memGain: 5,            // memory cells respond to one-fifth as much antigen
      recruitNaive: 0.05, recruitMem: 0.15,
      divide: LN2 / 8,                // fastest division: once every 8 hours
      die: LN2 / 60, toMemory: 0.07, toLongLived: 0.001,
      Emax: 3e4, KH: 30,
      abRate: 4e-4, abHalf: 21 * DAY, memAntibody: 4, // antibody units per plasma cell per hour; half-life 3 weeks
      // the person
      neutrophils: 1, macrophages: 1, alarm: 1, helperT: 1, bcells: 1, tcells: 1, adaptive: 1, selfScreen: 1,
      manualAlarm: null,              // 0..1 while the student holds the alarm by hand
      ANC0: 4000, CD40: 1000,
    };
  }

  // =========================================================================
  class Immune {
    constructor(opts) {
      opts = opts || {};
      this.p = Object.assign(params(), opts.params || {});
      this.seed = opts.seed == null ? 1 : opts.seed;
      const rand = rng(this.seed * 7919 + 13);
      this.lib = { B: buildLibrary('B', rand), Th: buildLibrary('Th', rand), Tc: buildLibrary('Tc', rand) };
      // which helper-T clones survive when the helper count is low is decided once per person
      this.thOrder = this.lib.Th.map(() => rand());
      this.t = 0;
      this.site = { bacteria: 0, bStrain: null, virus: 0, vStrain: null, healthy: this.p.cells, eclipse: 0, producing: 0, neutrophils: 0, pus: 0, alarm: 0, flow: 1, leak: 0, damage: 0, antibody: 0, ctl: 0 };
      this.antigens = {};       // key → {pt, depot, d1, A}
      this.events = [];
      this.flags = {};
      this.fever = 0;
      this.applyKnockouts();
    }

    set(name, value) { this.p[name] = value; this.applyKnockouts(); }
    applyKnockouts() {
      const p = this.p;
      const order = this.thOrder;
      this.lib.Th.forEach((c, i) => { c.present = order[i] < p.helperT; });
      this.lib.B.forEach(c => { c.present = p.bcells > 0; });
      this.lib.Tc.forEach(c => { c.present = p.tcells > 0; });
      if (p.selfScreen) for (const k of ['B', 'Th', 'Tc']) for (const c of this.lib[k]) if (c.self) c.present = false;
      this._resp = null;
    }

    // ------------------------------------------------------------ exposures
    antigen(kind, strain) {
      const pt = antigenShape(kind, strain);
      if (!this.antigens[pt.key]) { this.antigens[pt.key] = { pt, depot: 0, d1: 0, A: 0, i1: 0, inside: 0 }; this._resp = null; }
      return this.antigens[pt.key];
    }
    infect(kind, o) {
      o = o || {};
      const strain = o.strain || 'A';
      const an = this.antigen(kind, strain);
      // a new infection can be announced again (its first neutrophils, its antigen reaching the
      // node); "first antibody" only if there is none against this antigen already
      delete this.flags.neutrophilsArrive; delete this.flags.ctlArrive; delete this.flags['antigenInNode:' + an.pt.key];
      if (this.antibodyTo(kind, strain) < 1) delete this.flags.firstAntibody;
      if (kind === 'bacterium') { this.site.bacteria += o.dose == null ? 1e4 : o.dose; this.site.bStrain = strain; this.flags.bCleared = false; }
      else { this.site.virus += o.dose == null ? 100 : o.dose; this.site.vStrain = strain; this.flags.vCleared = false; }
      this.events.push({ type: 'infect', kind, strain, t: this.t });
    }
    // Antigen that cannot multiply, given with something that sounds the alarm.
    vaccinate(kind, o) {
      o = o || {};
      this.antigen(kind, o.strain || 'A').depot += o.dose == null ? 1 : o.dose;
      this.events.push({ type: 'vaccine', kind, strain: o.strain || 'A', t: this.t });
    }
    // Ready-made antibody from someone else: it acts at once and leaves the library unchanged.
    giveAntibody(kind, o) {
      o = o || {};
      const pt = antigenShape(kind, o.strain || 'A');
      this.borrowed = this.borrowed || [];
      this.borrowed.push({ pt, ab: o.amount == null ? 400 : o.amount });
      this.events.push({ type: 'antibodyGiven', t: this.t });
    }
    // An antibiotic or antiviral that removes the pathogen (used to reset between experiments).
    clearPathogen() { const s = this.site; s.bacteria = 0; s.virus = 0; s.eclipse = 0; s.producing = 0; }

    // ------------------------------------------------------------ readouts
    // Clones that bind the antigens this person has met, with their fit to each.
    responders() {
      if (this._resp) return this._resp;
      const out = [];
      for (const kind of ['B', 'Th', 'Tc']) for (const c of this.lib[kind]) {
        if (!c.present) continue;
        let fits = null;
        for (const key in this.antigens) {
          const pt = this.antigens[key].pt, f = fitAt(dist(c.x, c.y, pt.x, pt.y));
          if (f >= 0.02) (fits || (fits = {}))[key] = f;
        }
        if (fits) out.push({ c, fits });
      }
      return (this._resp = out);
    }
    fit(clone, kind, strain) { const pt = antigenShape(kind, strain); return fitAt(dist(clone.x, clone.y, pt.x, pt.y)); }
    // Antibody that fits a given antigen (own and borrowed), in the blood.
    antibodyTo(kind, strain) {
      const pt = antigenShape(kind, strain);
      let a = 0;
      for (const c of this.lib.B) if (c.ab > 0) a += c.ab * fitAt(dist(c.x, c.y, pt.x, pt.y));
      for (const b of this.borrowed || []) a += b.ab * fitAt(dist(b.pt.x, b.pt.y, pt.x, pt.y));
      return a;
    }
    // Lymphocytes whose receptors fit a given antigen: resting (naive and memory) and effector.
    specific(kind, strain, lib) {
      const pt = antigenShape(kind, strain);
      const out = { resting: 0, effector: 0, memory: 0, total: 0, clones: 0 };
      for (const k of (lib ? [lib] : ['B', 'Th', 'Tc'])) for (const c of this.lib[k]) {
        if (!c.present) continue;
        if (fitAt(dist(c.x, c.y, pt.x, pt.y)) < GOOD_FIT) continue;
        out.clones++; out.resting += c.R; out.effector += c.E; out.memory += c.mem;
      }
      out.total = out.resting + out.effector;
      return out;
    }
    get helpers() { let h = 0; for (const r of this.responders()) if (r.c.kind === 'Th') h += r.c.E; return h * this.p.helperT; }
    get nodeCells() { let n = 0; for (const r of this.responders()) n += r.c.E + r.c.R; return n; }
    get blood() {
      const p = this.p, s = this.site;
      return { neutrophils: p.ANC0 * p.neutrophils * (1 + 1.2 * clamp(s.alarm, 0, 1)), cd4: p.CD40 * p.helperT };
    }
    get infected() { return this.site.eclipse + this.site.producing; }
    // What the patient shows. Redness and heat follow blood flow; swelling follows the leak;
    // pus is dead neutrophils; fever follows the alarm, not the number of microbes.
    get signs() {
      const s = this.site;
      return {
        redness: clamp((s.flow - 1) / 2, 0, 1), heat: clamp((s.flow - 1) / 2, 0, 1),
        swelling: clamp(s.leak, 0, 1), pus: clamp(s.pus / 4000, 0, 1),
        pain: clamp(0.7 * s.leak + 0.5 * s.damage, 0, 1), fever: clamp(this.fever, 0, 1),
      };
    }
    labPanel() {
      const b = this.blood;
      return [
        { name: 'Neutrophils (absolute count)', value: b.neutrophils, unit: '/µL', lo: 1500, hi: 8000, flag: flag(b.neutrophils, 1500, 8000) },
        { name: 'Helper T cells (CD4 count)', value: b.cd4, unit: '/µL', lo: 500, hi: 1500, flag: flag(b.cd4, 500, 1500) },
      ];
    }
    takeEvents() { const e = this.events; this.events = []; return e; }
    // Has a vaccine (antigen with no infection) raised detectable antibody yet?
    vaccineAb() { for (const k in this.antigens) { const a = this.antigens[k]; if ((a.depot > 0 || a.A > 0.01) && this.antibodyTo(a.pt.kind, a.pt.strain) >= 1) return true; } return false; }
    // An independent copy of this person as they are now (to run "what if" experiments from one moment).
    copy() {
      const b = Object.create(Immune.prototype);
      b.p = Object.assign({}, this.p); b.seed = this.seed; b.t = this.t; b.fever = this.fever;
      b.lib = {}; for (const k in this.lib) b.lib[k] = this.lib[k].map(c => Object.assign({}, c));
      b.thOrder = this.thOrder;
      b.site = Object.assign({}, this.site);
      b.antigens = {}; for (const k in this.antigens) b.antigens[k] = Object.assign({}, this.antigens[k]);
      b.borrowed = (this.borrowed || []).map(x => Object.assign({}, x));
      b.events = []; b.flags = Object.assign({}, this.flags); b._resp = null;
      return b;
    }
    once(type, extra) { if (this.flags[type]) return; this.flags[type] = true; this.events.push(Object.assign({ type, t: this.t }, extra || {})); }

    // ------------------------------------------------------------ time
    get busy() {
      const s = this.site;
      if (s.bacteria > 0 || s.virus > 0 || this.infected > 0 || s.neutrophils > 1 || s.alarm > 0.005 || this.p.manualAlarm != null) return true;
      for (const k in this.antigens) { const a = this.antigens[k]; if (a.depot > 1e-3 || a.d1 > 1e-3 || a.A > 1e-3 || a.inside > 1e-3) return true; }
      for (const r of this.responders()) if (r.c.E > 0.5) return true;
      return false;
    }
    advance(dt) {
      let left = dt;
      while (left > 1e-9) {
        const h = Math.min(left, this.busy ? 0.02 : 0.5);
        this.step(h); left -= h;
      }
    }
    step(dt) {
      const p = this.p, s = this.site;
      const aB = s.bStrain ? this.antibodyTo('bacterium', s.bStrain) : 0;
      const aV = s.vStrain ? this.antibodyTo('virus', s.vStrain) : 0;

      // ---- the alarm, the vessel and the neutrophils
      const nInf = s.eclipse + s.producing;
      const sense = Math.max(p.macrophages > 0 ? sat(s.bacteria, p.KC) : 0, 0.6 * sat(nInf, 20 * p.KF));
      let depotAlarm = 0;
      for (const k in this.antigens) depotAlarm = Math.max(depotAlarm, 0.12 * sat(this.antigens[k].depot, 0.2));
      s.sense = p.alarm * sense;
      let target = p.alarm * Math.max(sense * (p.ampBase + (1 - p.ampBase) * sat(s.neutrophils, p.ampN)), depotAlarm);
      if (p.manualAlarm != null) target = p.manualAlarm;
      s.alarm += (target - s.alarm) * (1 - Math.exp(-dt / p.tauC));
      s.flow += (1 + 2 * clamp(s.alarm, 0, 1) - s.flow) * (1 - Math.exp(-dt / 1));
      s.leak += (clamp(s.alarm, 0, 1) * (0.35 + 0.65 * sat(s.neutrophils, p.ampN)) - s.leak) * (1 - Math.exp(-dt / 3));
      const arriving = p.recruit * clamp(s.alarm, 0, 1) * p.neutrophils;
      const dying = s.neutrophils / p.tauN;
      s.neutrophils += (arriving - dying) * dt;
      s.pus += (dying - s.pus / 36) * dt;
      if (s.neutrophils > 50) this.once('neutrophilsArrive');
      // antibody leaves the blood through the vessel wall, faster where it is leaky
      s.antibody += (aB * (0.25 + 0.75 * clamp(s.leak / 0.3, 0, 1)) - s.antibody) * (1 - Math.exp(-dt / 4));

      // ---- bacteria
      if (s.bacteria > 0) {
        const ops = 1 + p.opsMax * sat(s.antibody, p.opsK);
        const mac = p.macrophages * p.macKill * ops / (s.bacteria + p.macHalf);
        const neut = p.g * (s.neutrophils / p.critN) * ops;
        const rate = p.g * (1 - s.bacteria / p.K) - mac - neut;
        s.bacteria *= Math.exp(rate * dt);
        if (s.bacteria < 0.5) { s.bacteria = 0; if (!this.flags.bCleared) { this.flags.bCleared = true; this.events.push({ type: 'cleared', kind: 'bacterium', t: this.t }); } }
      }
      s.damage += ((0.6 * sat(s.bacteria, 2e7) + 0.25 * sat(s.neutrophils, 3000) + 0.9 * (1 - s.healthy / p.cells)) - s.damage) * (1 - Math.exp(-dt / 30));

      // ---- virus
      // cytotoxic T cells that fit this virus (they travel from the node to the site)
      s.ctl = 0;
      if (s.vStrain) { const pt = antigenShape('virus', s.vStrain); for (const c of this.lib.Tc) if (c.present && c.E > 0) s.ctl += c.E * fitAt(dist(c.x, c.y, pt.x, pt.y)); }
      if (s.ctl > 300 && nInf > 0) this.once('ctlArrive');
      if (s.virus > 0 || nInf > 0) {
        const F = sat(nInf, p.KF), slow = 1 / (1 + p.brake * F);
        const kill = p.ctlKill * s.ctl;
        const entry = p.beta * slow * s.healthy * s.virus / (1 + aV / p.neutK) + p.betaCell * slow * s.healthy * s.producing;
        const lost = p.cells - s.healthy - nInf;
        s.healthy += (-entry + p.regrow * Math.max(0, lost)) * dt;
        s.eclipse += (entry - s.eclipse / p.eclipse - kill * s.eclipse) * dt;
        s.producing += (s.eclipse / p.eclipse - s.producing / p.produce - kill * s.producing) * dt;
        s.virus += (p.burst * slow * s.producing - p.clearV * (1 + aV / p.neutK) * s.virus) * dt;
        if (s.healthy < 0) s.healthy = 0;
        if (s.eclipse + s.producing < 0.5 && s.virus < 0.5) {
          s.eclipse = s.producing = s.virus = 0;
          if (!this.flags.vCleared) { this.flags.vCleared = true; this.events.push({ type: 'cleared', kind: 'virus', t: this.t }); }
        }
      } else if (s.healthy < p.cells) s.healthy = Math.min(p.cells, s.healthy + p.regrow * (p.cells - s.healthy) * dt);
      // fever follows the alarm signals released at the site, not the number of microbes
      // (body temperature takes hours to follow them)
      const feverTarget = clamp(0.5 * Math.max(s.sense, s.alarm) + 1.6 * sat(nInf, 1.5 * p.KF), 0, 1);
      this.fever += (feverTarget - this.fever) * (1 - Math.exp(-dt / 8));

      // ---- dendritic cells carry antigen to the node
      for (const key in this.antigens) {
        const a = this.antigens[key];
        let load = a.depot > 0 ? sat(a.depot, 0.25) : 0;
        if (a.pt.kind === 'bacterium' && s.bStrain === a.pt.strain) load = Math.max(load, sat(s.bacteria, p.loadB));
        if (a.pt.kind === 'virus' && s.vStrain === a.pt.strain) load = Math.max(load, sat(nInf, p.loadV));
        if (a.depot > 0) { a.depot *= Math.exp(-dt * LN2 / 48); if (a.depot < 1e-4) a.depot = 0; }
        a.d1 += (load - a.d1) * (1 - Math.exp(-dt / p.transit));
        a.A += (a.d1 - a.A) * (1 - Math.exp(-dt / (a.d1 > a.A ? 6 : p.persist)));
        const insideLoad = a.pt.kind === 'virus' && s.vStrain === a.pt.strain ? sat(nInf, p.loadV) : 0;
        a.i1 += (insideLoad - a.i1) * (1 - Math.exp(-dt / p.transit));
        a.inside += (a.i1 - a.inside) * (1 - Math.exp(-dt / (a.i1 > a.inside ? 6 : p.persist)));
        if (a.A > 0.05) this.once('antigenInNode:' + key, { key });
      }

      // ---- lymphocytes: selection, expansion, contraction, memory
      if (p.adaptive > 0) {
        const resp = this.responders();
        let H = 0; const tot = { B: 0, Th: 0, Tc: 0 };
        for (const r of resp) { tot[r.c.kind] += r.c.E; if (r.c.kind === 'Th') H += r.c.E; }
        const help = sat(H * p.helperT, p.KH);
        for (const r of resp) {
          const c = r.c;
          const experienced = c.mem > 10;
          let stim = 0;
          for (const key in r.fits) {
            const an = this.antigens[key];
            // Cytotoxic T cells are selected by fragments of what a cell is making inside (MHC I),
            // so they answer infected cells, not bacteria between cells or a vaccine's loose antigen.
            const A = c.kind === 'Tc' ? an.inside : an.A;
            if (A > 0) stim += r.fits[key] * A / (A + (experienced ? p.KA / p.memGain : p.KA));
          }
          stim = Math.min(1, stim);
          const drive = stim * (c.kind === 'Th' ? 1 : help);
          if (experienced && drive > 0.2 && c.E < c.mem) c.boosted = true;   // this response starts from memory cells
          const start = (experienced ? p.recruitMem : p.recruitNaive) * drive * c.R;
          const grow = p.divide * drive * c.E * Math.max(0, 1 - tot[c.kind] / p.Emax);
          const death = p.die * (1 - drive) * c.E;
          const memFrac = c.R > 0 ? clamp(c.mem / c.R, 0, 1) : 0;   // how much of the resting pool is memory
          c.R += (-start + p.toMemory * death) * dt;
          c.mem = Math.max(0, c.mem + (p.toMemory * death - start * memFrac) * dt);
          c.E += (start + grow - death) * dt;
          if (c.E < 1e-6 && drive === 0) c.E = 0;
          if (c.kind === 'B') { c.LL += p.toLongLived * death * dt; }
        }
      }
      // antibody: made by plasma cells, removed with a three-week half-life
      const kAb = LN2 / p.abHalf;
      for (const c of this.lib.B) if (c.E > 0 || c.LL > 0 || c.ab > 0) {
        // plasma cells that come from memory cells make antibody that binds better (counted as more units)
        const make = p.abRate * (c.E + c.LL) * (c.boosted ? p.memAntibody : 1);
        c.ab = make / kAb + (c.ab - make / kAb) * Math.exp(-kAb * dt);
      }
      if (this.borrowed) for (const b of this.borrowed) b.ab *= Math.exp(-kAb * dt);
      if ((s.bStrain && s.bacteria > 0 && aB >= 1) || (s.vStrain && aV >= 1) || this.vaccineAb()) this.once('firstAntibody');

      this.t += dt;
    }
  }

  // A dish of bacteria, with or without antibody and phagocytes (scene 8).
  class Dish {
    constructor(o) { o = o || {}; this.p = params(); this.t = 0; this.bacteria = o.bacteria == null ? 1e5 : o.bacteria; this.antibody = o.antibody || 0; this.phagocytes = o.phagocytes || 0; }
    get coated() { return sat(this.antibody, this.p.opsK); }
    advance(dt) {
      const p = this.p;
      for (let left = dt; left > 1e-9;) {
        const h = Math.min(left, 0.02); left -= h; this.t += h;
        if (this.bacteria <= 0) continue;
        const ops = 1 + p.opsMax * this.coated;
        const rate = p.g * (1 - this.bacteria / 1e8) - p.g * (this.phagocytes / p.critN) * ops;
        this.bacteria *= Math.exp(rate * h);
        if (this.bacteria < 0.5) this.bacteria = 0;
      }
    }
  }

  // A short row of airway cells, for reading MHC class I windows by hand (scene 11). Time moves
  // only when advance() is called. A cell that has been infected for an hour shows fragments of
  // viral protein in its windows; after the eclipse it releases virus, and two hours later the
  // virus has reached its healthy neighbours; then it dies.
  class Patch {
    constructor(o) {
      o = o || {};
      const p = params();
      this.eclipse = p.eclipse; this.produce = p.produce; this.t = 0;
      this.cells = Array.from({ length: o.n || 12 }, () => ({ state: 'healthy', since: 0 }));
      // infected cells: an index, or [index, hours since it was infected]
      for (const e of (o.infected || [2, 8])) { const [i, age] = Array.isArray(e) ? e : [e, o.age == null ? 2 : o.age]; this.cells[i] = { state: 'infected', since: -age }; }
      this.killedHealthy = 0; this.killedInfected = 0;
    }
    shows(i) { const c = this.cells[i]; return (c.state === 'infected' || c.state === 'releasing') && this.t - c.since >= 1; }
    get infected() { return this.cells.filter(c => c.state === 'infected' || c.state === 'releasing').length; }
    get healthy() { return this.cells.filter(c => c.state === 'healthy').length; }
    get lost() { return this.cells.length - this.healthy - this.infected; }
    kill(i) {
      const c = this.cells[i];
      if (c.state === 'dead' || c.state === 'killed') return null;
      const was = c.state;
      if (was === 'healthy') this.killedHealthy++; else this.killedInfected++;
      this.cells[i] = { state: 'killed', since: this.t, was };
      return was;
    }
    advance(dt) {
      for (let left = dt; left > 1e-9;) {
        const h = Math.min(left, 0.25); left -= h; this.t += h;
        this.cells.forEach((c, i) => {
          const age = this.t - c.since;
          if (c.state === 'infected' && age >= this.eclipse) { c.state = 'releasing'; }
          if (c.state === 'releasing') {
            if (age >= this.eclipse + 2 && !c.spread) {
              c.spread = true;
              for (const j of [i - 1, i + 1]) if (this.cells[j] && this.cells[j].state === 'healthy') this.cells[j] = { state: 'infected', since: this.t };
            }
            if (age >= this.eclipse + this.produce) this.cells[i] = { state: 'dead', since: this.t };
          }
        });
      }
    }
  }

  const api = { Immune, Dish, Patch, params, antigenShape, fitAt, dist, SELF, GRID, SIGMA, GOOD_FIT, DAY, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ImmuneSim = api;
})(typeof self !== 'undefined' ? self : this);
