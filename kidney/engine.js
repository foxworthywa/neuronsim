/*
 * KidneySim engine: the body's fluid and the kidney that keeps it steady (see
 * docs/KIDNEY_MODULE.md, "The model").
 *
 *   the BODY     total body water, with the fluid outside the cells (and the plasma within it)
 *                sized by how much sodium it holds; potassium, urea, creatinine, glucose, one
 *                drug. A way in (the gut) and the ways out the body does not set for this purpose
 *                (lungs, skin, gut).
 *   the NEPHRON  one, standing for all two million: a filter driven by blood pressure that passes
 *                everything small; a first stretch that takes most of it back whatever the body
 *                needs; a loop that keeps the inner kidney salty; and a last stretch whose
 *                take-back of water and salt is set by two hormones.
 *   CONTROL      ADH follows the concentration of the blood, aldosterone its volume (and
 *                potassium). A student's dials can replace either.
 *
 * Nothing in the code says "after a litre of water the urine is dilute": the water lowers the
 * concentration of the blood, ADH falls, the last stretch takes back less water, and whatever
 * solute is left carries more water out with it.
 *
 * Units: time in minutes; volumes in litres (flows along the tubule in mL/min); sodium, potassium
 * and urea in mmol; glucose, creatinine, albumin and the drug in mg. Works in the browser
 * (window.KidneySim) and in Node.
 */
(function (root) {
  'use strict';

  const HOUR = 60, DAY = 1440;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const flag = (v, lo, hi) => (v < lo ? 'L' : v > hi ? 'H' : '');
  const SALT = 17.1;          // mmol of sodium in a gram of table salt

  // A healthy 70-kg adult.
  const P = {
    tbw: 42, ecf: 14, plasma: 3, redCells: 2,           // L
    osmCells: 28 * 290,        // mOsm held inside the cells (fixed)
    osmOther: 140,             // mOsm outside the cells that is not a sodium salt
    na: 140, k: 4.2,           // mmol/L in plasma
    kShare: 0.11,              // of a potassium excess, the share that stays outside the cells
    kUptake: 15,               // min: how fast cells take up (or give back) potassium
    kGutLoss: 0.10,            // share of eaten potassium lost in the stool
    ureaProd: 0.27,            // mmol/min
    crProd: 1.125,             // mg/min
    insensible: 0.63,          // mL/min of water lost from lungs and skin at rest
    metabolic: 0.21,           // mL/min of water made by metabolism
    sweatNa: 45, sweatK: 5,    // mmol/L
    map: 93,                   // mean arterial pressure, mmHg
    kf: 12.5,                  // mL/min filtered per mmHg of net pressure, both kidneys
    pgc: 55, pOppose: 45,      // pressure in the filter's capillaries; what opposes it (plasma proteins, capsule)
    proximal: 0.67,            // share of filtered salt and water taken back in the first stretch
    loopNa: 0.25,              // share of filtered salt taken back in the loop
    lateCap: 2.1,              // mmol/min: the most salt the last stretch can take back
    eNormal: 0.075,            // share of the salt reaching the last stretch that is excreted, normal aldosterone
    eMin: 0.002, eMax: 0.35,   // ... at the most and the least aldosterone
    kBase: 0.0556,             // mmol/min of potassium excreted at rest (80 mmol a day)
    glucoseTm: 375,            // mg/min: the most the glucose carriers take back, all of them full
    glucoseSplay: 35,          // mg/min: carriers fill unevenly, so glucose first escapes at about 180 mg/dL, well before that
    drugSecretion: 0.375,      // L/min of plasma cleared of the drug by its carrier
    drugVd: 20, toxinVd: 42,   // L: volumes the drug and the unfamiliar substance spread through
    uMin: 50, uMax: 1200,      // mOsm/L: the most dilute and the most concentrated urine
    otherSolute: 0.07,         // mOsm/min of other solutes excreted (ammonium, phosphate ...)
    tGutWater: 15, tGutNa: 40, tGutK: 60,               // min: absorption from the gut
    tAdh: 10, tWater: 10, tAldo: 45, tGradient: 30, tRefill: 240,
    albumin: 4.0,              // g/dL in plasma
  };

  // The day of scenes 2 and 9: a nursing student, 7 am to 11 pm. Amounts: water in mL, salt in g,
  // potassium in mmol; sweat in mL over `over` minutes. Times are minutes after midnight.
  const STUDENT_DAY = [
    { at: 7 * 60, label: 'coffee and breakfast', take: { water: 400, salt: 1.5, potassium: 10 } },
    { at: 9 * 60 + 30, label: 'a big bottle of water', take: { water: 800 } },
    { at: 12 * 60 + 30, label: 'salty lunch', take: { water: 350, salt: 5, potassium: 15 } },
    { at: 15 * 60 + 30, label: 'a run in the heat', lose: { sweat: 1000, over: 60 } },
    { at: 16 * 60 + 40, label: 'thirsty: a big glass of water', take: { water: 750 } },
    { at: 19 * 60, label: 'dinner: baked potato, banana', take: { water: 400, salt: 2, potassium: 35 } },
    { at: 21 * 60 + 30, label: 'tea', take: { water: 250 } },
  ];
  // Mr. Herrera's 44 hours between two dialysis sessions (noon Monday to 8 am Wednesday): an
  // ordinary diet, repeated. Times are minutes after midnight on Monday.
  const HERRERA_DAYS = (function () {
    const meals = [
      [7 * 60 + 30, 'breakfast', { water: 450, salt: 1.5, potassium: 20 }],
      [10 * 60, 'coffee', { water: 250 }],
      [12 * 60 + 30, 'lunch', { water: 450, salt: 2.5, potassium: 25 }],
      [15 * 60 + 30, 'a glass of juice', { water: 300, potassium: 10 }],
      [18 * 60 + 30, 'dinner', { water: 450, salt: 3, potassium: 30 }],
    ];
    const out = [];
    for (let d = 0; d < 3; d++) for (const [at, label, take] of meals) out.push({ at: d * DAY + at, label, take });
    return out.filter(e => e.at > 12 * 60 && e.at < DAY + 32 * 60);
  })();

  class Kidney {
    constructor(o) {
      o = o || {};
      this.p = Object.assign({}, P, o.params || {});
      const p = this.p;
      this.t = o.start || 0;
      // ---- the body
      this.tbw = p.tbw;                       // L
      this.na = p.na * p.ecf;                 // mmol outside the cells
      this.kx = 0; this.kb = 0;               // potassium excess: outside the cells, and taken up by them
      this.urea = (p.ureaProd / (0.125 * 0.5)) * p.tbw;      // mmol; steady where production = excretion
      this.cr = (p.crProd / 1.25) * p.tbw * 10;              // mg; 0.9 mg/dL
      this.glucose = 90;                      // mg/dL (set from outside: the pancreas is not modelled)
      this.drug = 0; this.toxin = 0;          // mg
      this.gut = { water: 0, na: 0, k: 0 };
      this.rbcLost = 0; this.plasmaShift = 0; // L: after a bleed
      this.sweat = null;                      // {rate mL/min, until}
      this.weight0 = o.weight || 70;
      // ---- settings (each fault or drug is one of these)
      this.s = {
        nephrons: 1, autoreg: 1, filterDamage: 0, glucoseCarrier: 1, loopBlock: 0, adh: 1, map: null,
        takeBack: 1,           // 0: the tubule takes nothing back (a thought experiment, scene 6)
        thirst: 0,             // 1: she drinks when her blood becomes too concentrated (used for runs of days)
        drugHold: null,        // mg: keep this much of the drug in the body (a steady infusion)
        volumeSet: 1,          // the blood volume (× normal) that aldosterone defends
      };
      this.diuretic = { gut: 0, level: 0 };
      this.dialysis = null;
      this.manualExit = null;                 // {water mL/min, na mmol/min}: scene 2
      this.manualLate = null;                 // {w, a} 0..1: scene 9
      this.steady = true;                     // intake arrives evenly, matched to a resting day's losses
      this.script = [];
      // ---- control
      this.adh = this.adhTarget(); this.w = clamp(this.adh, 0, 1);
      this.aldo = 0.5; this.a = 0.5;
      this.gradient = p.uMax;
      // ---- totals, for balance sheets (mmol, mL, mg)
      this.cum = { waterIn: 0, waterOut: 0, naIn: 0, naOut: 0, kIn: 0, kOut: 0, ureaIn: 0, ureaOut: 0, crIn: 0, crOut: 0, urine: 0, urineNa: 0, urineK: 0, urineGlucose: 0, urineOsm: 0 };
      this.events = [];
      this.f = null;
      this.compute();
      this.base = { urine: this.f.urine.flow, na: this.f.ex.na, k: this.f.ex.k };
      if (o.setup) o.setup(this);
    }

    // ------------------------------------------------------------------ the body's fluid
    get osmOut() { return 2 * this.na + this.p.osmOther + (this.glucose - 90) / 18 * this.p.ecf; }
    get ecf() { return this.tbw * this.osmOut / (this.osmOut + this.p.osmCells); }
    get osmolarity() { return (this.osmOut + this.p.osmCells) / this.tbw; }
    get plasma() { return this.ecf * this.p.plasma / this.p.ecf - this.plasmaShift; }
    get bloodVolume() { return this.plasma + this.p.redCells - this.rbcLost; }
    get volume() { return this.bloodVolume / (this.p.plasma + this.p.redCells); }       // × normal
    get sodium() { return this.na / this.ecf; }
    get potassium() { return (this.p.k * this.p.ecf + this.kx) / this.ecf; }
    get bun() { return this.urea / this.tbw * 2.8; }                     // mg/dL
    get creatinine() { return this.cr / (this.tbw * 10); }               // mg/dL
    get weight() { return this.weight0 + (this.tbw - this.p.tbw) + (this.gut.water / 1000) - this.rbcLost; }
    get saltExcess() { return (this.na - this.p.na * this.p.ecf) / SALT; }         // g of salt above normal
    get waterExcess() { return this.tbw - this.p.tbw; }                            // L above normal
    get pressure() {
      if (this.s.map != null) return this.s.map;
      const x = this.volume;
      return this.p.map * (x >= 0.93 ? 1 + 0.6 * Math.max(0, x - 1) : 1 - 1.6 * (0.93 - x));
    }
    get bp() { const m = this.pressure, pp = 40 * Math.pow(clamp(m / this.p.map, 0.3, 1.6), 0.8); return { sys: Math.round(m + 2 * pp / 3), dia: Math.round(m - pp / 3) }; }

    adhTarget() { return clamp((this.osmolarity - 283) / 8.5, 0, 1.3) + clamp((0.93 - this.volume) * 8, 0, 1); }
    aldoTarget() { return clamp(0.5 + 18 * (this.s.volumeSet - this.volume) + 0.25 * (this.potassium - this.p.k), 0, 1); }

    // ------------------------------------------------------------------ the nephron, this minute
    // Fills this.f with what is filtered, taken back, pushed in and excreted, per minute.
    compute() {
      const p = this.p, s = this.s, N = s.nephrons;
      const map = this.pressure;
      // The filter. With the feeding arteriole adjusting itself, the pressure in the filter's
      // capillaries barely moves between 80 and 180 mmHg; below 80 it cannot be held.
      const passive = p.pgc * map / p.map;
      const held = map >= 80 ? p.pgc + 0.01 * (map - p.map) + (map > 180 ? 0.3 * (map - 180) : 0) : p.pgc - 0.13 - 0.38 * (80 - map);
      const pgc = s.autoreg ? held : passive;
      const net = Math.max(0, pgc - p.pOppose);
      const gfr = p.kf * net * N;                                   // mL/min
      const L = gfr / 1000;                                         // L/min
      const cNa = this.sodium, cK = this.potassium, cUrea = this.urea / this.tbw, cCr = this.creatinine;
      const filt = {
        water: gfr, na: L * cNa, k: L * cK, glucose: gfr / 100 * this.glucose, urea: L * cUrea, cr: gfr / 100 * cCr,
        alb: gfr * p.albumin * 10 * 0.0008 * s.filterDamage,        // mg/min; none through an intact filter
        drug: L * this.drug / p.drugVd, toxin: L * this.toxin / p.toxinVd,
      };
      const ex = {}, sec = { k: 0, drug: 0 };
      const loopWork = (1 - s.loopBlock) * (1 - this.diureticBlock());
      // Glucose: a carrier with a maximum rate.
      const tm = p.glucoseTm * N * s.glucoseCarrier, soft = p.glucoseSplay * Math.max(N * s.glucoseCarrier, 0.02);
      ex.glucose = N > 0 ? soft * Math.log(1 + Math.exp((filt.glucose - tm) / soft)) : 0;
      if (ex.glucose < 0.05) ex.glucose = 0;                    // a trace too small for any test strip
      // Salt: two-thirds in the first stretch, a quarter in the loop, the rest decided last.
      const reach = filt.na * (1 - p.proximal - p.loopNa * loopWork);         // reaches the last stretch
      const a = this.manualLate ? this.manualLate.a : this.a;
      const eps = a >= 0.5 ? p.eNormal * Math.pow(p.eMin / p.eNormal, (a - 0.5) / 0.5) : p.eNormal * Math.pow(p.eMax / p.eNormal, (0.5 - a) / 0.5);
      ex.na = reach - Math.min((1 - eps) * reach, p.lateCap * N);
      // Potassium: nearly all taken back early; the last stretch pushes in what must leave.
      const reach0 = P.na * 0.125 * (1 - p.proximal - p.loopNa) * Math.max(N, 1e-9);
      // (each surviving nephron of a failing kidney pushes out more, so the total falls far less than the number of nephrons)
      ex.k = N > 0 ? Math.min(0.6 * Math.sqrt(N), p.kBase * Math.pow(N, 0.25) * Math.pow(Math.max(a, 0.02) / 0.5, 0.4) * clamp(1 + 4 * (cK - p.k), 0.15, 8) * Math.sqrt(clamp(reach / reach0, 0.2, 4))) : 0;
      sec.k = Math.max(0, ex.k - 0.1 * filt.k);
      // Urea drifts back with the water, a little more when the urine is concentrated.
      const w = !s.adh ? 0 : this.manualLate ? this.manualLate.w : this.w;
      ex.urea = filt.urea * (1 - clamp(0.5 + 0.12 * (w - 0.82), 0.35, 0.65));
      ex.cr = filt.cr;
      ex.alb = filt.alb;
      sec.drug = N > 0 ? p.drugSecretion * N * this.drug / p.drugVd : 0;
      ex.drug = filt.drug + sec.drug;
      ex.toxin = filt.toxin;
      // Water follows solute. Whatever solute is left in the tubule holds water with it, because
      // urine cannot be made more concentrated than the inner kidney is salty; and a flood of
      // solute washes that saltiness out.
      let E = 2 * (ex.na + ex.k) + ex.urea + ex.glucose / 180 + p.otherSolute * gfr / 125;      // mOsm/min
      const e0 = 0.7 * N;
      const top = N > 0 ? Math.min(this.gradient, 300 + (this.gradient - 300) * (0.8 * e0) / (0.8 * e0 + Math.max(0, E - e0))) : 300;
      let osm = p.uMin * Math.pow(Math.max(top, p.uMin) / p.uMin, w);
      let flow = gfr > 0 ? Math.min(E / osm * 1000, 0.2 * gfr) : 0;
      if (this.manualExit) {
        flow = this.manualExit.water; ex.na = this.manualExit.na;
        E = 2 * (ex.na + ex.k) + ex.urea + p.otherSolute;
      }
      if (!s.takeBack) {
        // nothing taken back, nothing pushed in: the filtrate leaves as it was filtered
        for (const k of Object.keys(filt)) ex[k] = filt[k];
        sec.k = 0; sec.drug = 0; flow = gfr; E = flow / 1000 * this.osmolarity;
      }
      if (flow > 0) osm = E / flow * 1000;
      ex.water = flow;
      // What is left in the tubule at four places (as a share of what was filtered): just past the
      // filter, at the end of the first stretch, at the end of the loop, and in the urine.
      const share = (x, f) => (f > 0 ? x / f : 0);
      const all = [1, 1, 1, 1];
      const frac = !s.takeBack ? { water: all, na: all, k: all, glucose: all, urea: all, cr: all, alb: all, drug: all, toxin: all } : {
        water: [1, 1 - p.proximal, 0.18 + 0.1 * (1 - loopWork), share(flow, gfr)],
        na: [1, 1 - p.proximal, 1 - p.proximal - p.loopNa * loopWork, share(ex.na, filt.na)],
        k: [1, 1 - p.proximal, 0.1, share(ex.k, filt.k)],
        glucose: [1, share(ex.glucose, filt.glucose), share(ex.glucose, filt.glucose), share(ex.glucose, filt.glucose)],
        urea: [1, 0.6, 0.6, share(ex.urea, filt.urea)],
        cr: [1, 1, 1, 1],
        alb: [1, 1, 1, 1],
        drug: [1, share(ex.drug, filt.drug), share(ex.drug, filt.drug), share(ex.drug, filt.drug)],
        toxin: [1, 1, 1, 1],
      };
      this.f = {
        map, pgc, passive, net, gfr, arteriole: clamp(pgc / passive, 0.4, 1.6),
        filt, ex, sec, frac, E, top,
        urine: { flow, osm: flow > 0 ? osm : 0 },
        reachNa: reach,
      };
      return this.f;
    }

    diureticBlock() { const L = this.diuretic.level; return L > 0 ? 0.55 * L / (L + 0.12) : 0; }

    // ------------------------------------------------------------------ time
    advance(dt) {
      let left = dt;
      while (left > 1e-9) {
        const next = this.script.find(e => !e.done);
        let h = Math.min(left, 1);
        if (next) {
          if (next.at <= this.t + 1e-9) { next.done = true; this.fire(next); continue; }
          h = Math.min(h, next.at - this.t);
        }
        this.step(h); left -= h;
      }
      this.compute();
      return this;
    }
    fire(e) {
      if (e.take) this.take(e.take);
      if (e.lose) this.lose(e.lose);
      if (e.fn) e.fn(this);
      this.events.push({ type: 'script', label: e.label, t: this.t });
    }
    // Follow a list of timed events (meals, drinks, sweating) instead of an even intake.
    follow(script) { this.steady = false; this.script = script.map(e => Object.assign({}, e, { done: e.at < this.t - 1e-9 })); return this; }

    step(h) {
      const p = this.p, c = this.cum;
      const f = this.compute();
      // ---- the way in
      const gw = this.gut.water * (1 - Math.exp(-h / p.tGutWater)), gn = this.gut.na * (1 - Math.exp(-h / p.tGutNa)), gk = this.gut.k * (1 - Math.exp(-h / p.tGutK));
      this.gut.water -= gw; this.gut.na -= gn; this.gut.k -= gk;
      this.tbw += gw / 1000; this.na += gn; this.kx += gk;
      if (this.steady) {
        // an even intake that matches a resting day's losses
        const win = (this.base.urine + p.insensible - p.metabolic) * h;
        this.tbw += win / 1000; this.na += this.base.na * h; this.kx += this.base.k * h;
        c.waterIn += win; c.naIn += this.base.na * h; c.kIn += this.base.k * h;
      }
      if (this.s.thirst) { const drink = 1.5 * Math.max(0, this.osmolarity - 293) * h; this.tbw += drink / 1000; c.waterIn += drink; }
      this.tbw += p.metabolic * h / 1000; c.waterIn += p.metabolic * h;
      this.urea += p.ureaProd * h; c.ureaIn += p.ureaProd * h;
      this.cr += p.crProd * h; c.crIn += p.crProd * h;
      // ---- the ways out that are not adjusted: lungs and skin, and sweat
      let out = p.insensible * h;
      if (this.sweat) {
        const d = Math.min(h, Math.max(0, this.sweat.until - this.t)), ml = this.sweat.rate * d;
        out += ml; this.na -= ml / 1000 * p.sweatNa; this.kx -= ml / 1000 * p.sweatK;
        c.naOut += ml / 1000 * p.sweatNa; c.kOut += ml / 1000 * p.sweatK;
        if (this.t + h >= this.sweat.until - 1e-9) this.sweat = null;
      }
      this.tbw -= out / 1000; c.waterOut += out;
      // ---- the kidney
      const ex = f.ex;
      this.tbw -= ex.water * h / 1000; this.na -= ex.na * h; this.kx -= ex.k * h;
      this.urea -= ex.urea * h; this.cr -= ex.cr * h;
      this.drug = this.s.drugHold != null ? this.s.drugHold : Math.max(0, this.drug - ex.drug * h); this.toxin = Math.max(0, this.toxin - ex.toxin * h);
      c.waterOut += ex.water * h; c.naOut += ex.na * h; c.kOut += ex.k * h; c.ureaOut += ex.urea * h; c.crOut += ex.cr * h;
      c.urine += ex.water * h; c.urineNa += ex.na * h; c.urineK += ex.k * h; c.urineGlucose += ex.glucose * h; c.urineOsm += f.E * h;
      // ---- the machine, if it is running
      const d = this.dialysis;
      if (d) {
        const uf = d.uf * h / 1000;                                   // L of fluid drawn off, as salty as plasma
        const cNa = this.sodium;
        const naOut = uf * cNa + d.k * (cNa - 140) * h, kOut = (d.k * 1.25) * (this.potassium - 2.0) * h;
        const ureaOut = (d.k + uf / h) * (this.urea / this.tbw) * h, crOut = (d.k * 0.8 + uf / h) * this.creatinine * 10 * h;
        this.tbw -= uf; this.na -= naOut; this.kx -= kOut; this.urea -= ureaOut; this.cr -= crOut;
        c.waterOut += uf * 1000; c.naOut += naOut; c.kOut += kOut; c.ureaOut += ureaOut; c.crOut += crOut;
        d.removed += uf * 1000;
        if (this.t + h >= d.until - 1e-9) { this.dialysis = null; this.events.push({ type: 'dialysisDone', t: this.t + h }); }
      }
      // ---- potassium moves between the fluid and the cells
      const move = (this.kx - p.kShare * (this.kx + this.kb)) * (1 - Math.exp(-h / p.kUptake));
      this.kx -= move; this.kb += move;
      // ---- after a bleed, fluid from the tissues refills the plasma
      this.plasmaShift *= Math.exp(-h / p.tRefill);
      // ---- the diuretic is absorbed and cleared
      const dz = this.diuretic;
      if (dz.gut > 1e-6 || dz.level > 1e-6) { const ab = dz.gut * (1 - Math.exp(-h / 30)); dz.gut -= ab; dz.level += ab; dz.level *= Math.exp(-h / 110); }
      // ---- control
      this.adh += (this.adhTarget() - this.adh) * (1 - Math.exp(-h / p.tAdh));
      this.w += (clamp(this.adh, 0, 1) - this.w) * (1 - Math.exp(-h / p.tWater));
      this.aldo += (this.aldoTarget() - this.aldo) * (1 - Math.exp(-h / p.tAldo));
      this.a = this.aldo;
      const work = (1 - this.s.loopBlock) * (1 - this.diureticBlock());
      this.gradient += (300 + (p.uMax - 300) * Math.pow(work, 1.5) - this.gradient) * (1 - Math.exp(-h / p.tGradient));
      if (ex.glucose > 0.5 && !this.glucoseFlag) { this.glucoseFlag = true; this.events.push({ type: 'glucoseInUrine', t: this.t }); }
      this.t += h;
    }

    // ------------------------------------------------------------------ what can be done to the body
    take(o) {
      const c = this.cum;
      if (o.water) { this.gut.water += o.water; c.waterIn += o.water; }
      if (o.salt) { this.gut.na += o.salt * SALT; c.naIn += o.salt * SALT; }
      if (o.potassium) { const k = o.potassium * (1 - this.p.kGutLoss); this.gut.k += k; c.kIn += k; }
      if (o.drug) this.drug += o.drug;
      if (o.toxin) this.toxin += o.toxin;
      if (o.diuretic) this.diuretic.gut += o.diuretic;
      return this;
    }
    lose(o) {
      if (o.sweat) this.sweat = { rate: o.sweat / (o.over || 60), until: this.t + (o.over || 60) };
      return this;
    }
    // Lose whole blood: plasma (with its salts) and red cells.
    bleed(ml) {
      const pl = 0.6 * ml / 1000, c = this.cum;
      const cNa = this.sodium, cK = this.potassium, cUrea = this.urea / this.tbw, cCr = this.creatinine * 10;
      const before = this.plasma;
      this.tbw -= pl; this.na -= pl * cNa; this.kx -= pl * cK; this.urea -= pl * cUrea; this.cr -= pl * cCr;
      c.waterOut += pl * 1000; c.naOut += pl * cNa; c.kOut += pl * cK; c.ureaOut += pl * cUrea; c.crOut += pl * cCr;
      this.plasmaShift += pl - (before - this.plasma);          // the whole loss comes out of the plasma at first
      this.rbcLost += 0.4 * ml / 1000;
      this.compute();
      return this;
    }
    // Fluid held back before the run begins (salt and water together), e.g. in heart failure.
    retain(litres) { const c = this.sodium, k = this.potassium; this.tbw += litres; this.na += litres * c; this.kx += litres * k; this.compute(); return this; }
    set(key, value) {
      if (key === 'glucose') this.glucose = value;                  // blood glucose is set from outside: the pancreas is not modelled
      else if (key === 'drugHold') { this.s.drugHold = value; if (value != null) this.drug = value; }
      else if (!(key in this.s)) throw new Error('unknown setting ' + key);
      else this.s[key] = value;
      this.compute(); return this;
    }
    manual(o) { this.manualExit = o && o.exit ? Object.assign({}, o.exit) : null; this.manualLate = o && o.late ? Object.assign({}, o.late) : null; this.compute(); return this; }
    auto() { return this.manual(null); }
    dialyse(o) { o = o || {}; const hours = o.hours || 4; this.dialysis = { until: this.t + hours * HOUR, uf: (o.removeWater || 0) / (hours * HOUR), k: o.clearance || 0.2, removed: 0 }; return this; }
    takeEvents() { const e = this.events; this.events = []; return e; }
    copy() {
      const b = Object.create(Kidney.prototype);
      for (const k of Object.keys(this)) b[k] = this[k];
      b.p = Object.assign({}, this.p); b.s = Object.assign({}, this.s); b.gut = Object.assign({}, this.gut);
      b.diuretic = Object.assign({}, this.diuretic); b.cum = Object.assign({}, this.cum); b.base = Object.assign({}, this.base);
      b.dialysis = this.dialysis ? Object.assign({}, this.dialysis) : null; b.sweat = this.sweat ? Object.assign({}, this.sweat) : null;
      b.manualExit = this.manualExit ? Object.assign({}, this.manualExit) : null; b.manualLate = this.manualLate ? Object.assign({}, this.manualLate) : null;
      b.script = this.script.map(e => Object.assign({}, e)); b.events = [];
      b.compute();
      return b;
    }

    // ------------------------------------------------------------------ reports
    // One substance through the nephron, in amounts per day. Units: water L; sodium and potassium
    // mmol; urea, glucose, creatinine, albumin g; the drug mg.
    ledger(key) {
      const f = this.f, k = { water: 1.44, na: DAY, k: DAY, urea: DAY * 0.06, glucose: 1.44, cr: 1.44, alb: 1.44, drug: DAY, toxin: DAY }[key];
      const filtered = f.filt[key] * k, excreted = f.ex[key] * k, secreted = (f.sec[key] || 0) * k;
      return { filtered, secreted, excreted, reabsorbed: Math.max(0, filtered + secreted - excreted) };
    }
    // The urine as a test strip and a measuring jug would report it.
    urineReport() {
      const f = this.f, flow = f.urine.flow, dl = flow / 100;       // dL of urine a minute
      const grade = (x, steps) => { let g = 0; steps.forEach((s, i) => { if (x >= s) g = i + 1; }); return g; };
      const protein = dl > 0 ? f.ex.alb / dl : 0, glucose = dl > 0 ? f.ex.glucose / dl : 0;          // mg/dL
      const words = ['negative', 'trace', '1+', '2+', '3+', '4+'];
      return {
        perDay: flow * 1.44, perHour: flow * 60, flow, osm: f.urine.osm,
        sg: 1 + f.urine.osm / 35000 + glucose / 270000 + protein / 380000,
        colour: clamp(1 / Math.max(flow, 0.05) / 2.6, 0, 1),           // 0 colourless … 1 dark amber: the same pigment in less water
        protein: words[grade(protein, [15, 30, 100, 300, 1000])], proteinMg: protein,
        glucose: words[grade(glucose, [50, 100, 250, 500, 1000])], glucoseMg: glucose,
        blood: words[this.s.filterDamage > 0.6 ? 3 : this.s.filterDamage > 0.3 ? 2 : this.s.filterDamage > 0.05 ? 1 : 0],
      };
    }
    labPanel(keys) {
      const all = {
        Na: { name: 'Sodium', value: this.sodium, unit: 'mmol/L', lo: 135, hi: 145, dp: 0 },
        K: { name: 'Potassium', value: this.potassium, unit: 'mmol/L', lo: 3.5, hi: 5.0, dp: 1 },
        BUN: { name: 'Urea nitrogen (BUN)', short: 'Urea (BUN)', value: this.bun, unit: 'mg/dL', lo: 7, hi: 20, dp: 0 },
        creatinine: { name: 'Creatinine', value: this.creatinine, unit: 'mg/dL', lo: 0.6, hi: 1.2, dp: 1 },
        glucose: { name: 'Glucose', value: this.glucose, unit: 'mg/dL', lo: 70, hi: 140, dp: 0 },
        osmolarity: { name: 'Concentration (osmolarity)', value: this.osmolarity, unit: 'mOsm/L', lo: 285, hi: 295, dp: 0 },
      };
      return (keys || Object.keys(all)).map(k => { const r = all[k]; return Object.assign({ key: k, flag: flag(+r.value.toFixed(r.dp), r.lo, r.hi) }, r); });
    }
  }

  // Mr. Herrera, just off the machine: no working nephrons, at his target weight.
  function herrera() {
    return new Kidney({
      start: 12 * 60, weight: 82, params: { crProd: 0.6, kGutLoss: 0.15, kShare: 0.2 },
      setup(b) {
        b.s.nephrons = 0; b.steady = false;
        const total = (4.0 - b.p.k) * b.p.ecf / b.p.kShare;          // potassium 4.0 mmol/L, cells in step with it
        b.kx = b.p.kShare * total; b.kb = total - b.kx;
        b.urea = 25 / 2.8 * b.tbw; b.cr = 2.5 * b.tbw * 10;
        b.compute();
      },
    });
  }

  // ------------------------------------------------------------------ the design bench (scene 4)
  // Two ways to build an exit for the blood. Levels are amounts in the body as multiples of normal
  // (the unfamiliar drug: multiples of one dose).
  //   design 1: a pump for each thing known to need removing. Each pump moves only its own substance.
  //   design 2: push everything small out through a filter, at the kidney's real rate, and add
  //             pumps that take back what must be kept.
  const BENCH = {
    wastes: ['urea', 'potassium', 'acid'],                 // arrive all day and must leave
    kept: ['water', 'salt', 'glucose'],                    // must not be lost
    spread: { water: 14, salt: 14, glucose: 14, urea: 42, potassium: 14, acid: 14, drug: 42 },     // L each is spread through
    arrive: { urea: 1 / (11 * HOUR), potassium: 1 / (30 * HOUR), acid: 1 / (20 * HOUR) },          // × normal per minute
    filterRate: 0.125,                                     // L/min
    doseEvery: 8 * HOUR,
  };
  class Bench {
    constructor(design) {
      this.design = design; this.t = 0;
      this.pumps = new Set();
      this.level = { water: 1, salt: 1, glucose: 1, urea: 1, potassium: 1, acid: 1, drug: 0 };
      this.dosing = false; this.nextDose = 0;
      this.filtered = 0; this.returned = 0;                // L
      this.dead = null;
    }
    add(pump) { this.pumps.add(pump); return this; }
    startDrug() { this.dosing = true; this.nextDose = this.t; return this; }
    advance(dt) {
      let left = dt;
      while (left > 1e-9 && !this.dead) { const h = Math.min(left, 2); this.step(h); left -= h; }
      return this;
    }
    step(h) {
      const L = this.level;
      if (this.dosing && this.t >= this.nextDose - 1e-9) { L.drug += 1; this.nextDose += BENCH.doseEvery; }
      for (const w of BENCH.wastes) L[w] += BENCH.arrive[w] * h;
      if (this.design === 1) {
        // each pump clears the excess of its own substance, and nothing else
        for (const w of BENCH.wastes) if (this.pumps.has(w)) L[w] -= (L[w] - 1) * (1 - Math.exp(-h / 20));
      } else {
        const water = L.water;                               // how much fluid is left to filter
        for (const k of Object.keys(L)) {
          const rate = BENCH.filterRate / BENCH.spread[k] * (water > 0 ? 1 : 0);
          if (BENCH.kept.includes(k)) { if (!this.pumps.has(k)) L[k] = Math.max(0, L[k] - rate * h); }
          else if (k === 'drug') L[k] *= Math.exp(-rate * h);
          else L[k] -= (L[k] - 1) * (1 - Math.exp(-h / 20));   // filtered, with what the body needs taken back
        }
        this.filtered += BENCH.filterRate * h * (water > 0 ? 1 : 0);
        if (this.pumps.has('water')) this.returned += BENCH.filterRate * h * 0.992;
        for (const k of BENCH.kept) if (L[k] < 0.5 && !this.dead) this.dead = { what: k, t: this.t + h };
      }
      this.t += h;
    }
  }

  const api = { Kidney, Bench, herrera, P, BENCH, STUDENT_DAY, HERRERA_DAYS, SALT, HOUR, DAY, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KidneySim = api;
})(typeof self !== 'undefined' ? self : this);
