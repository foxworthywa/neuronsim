/* HeartSim app: views, traces, heart sounds and the Part A lesson. The simulation lives in
 * engine.js; the lesson runner in ../lib/lesson.js. Everything drawn here is read from the model. */
(function () {
  'use strict';

  // =========================================================================
  // Utilities
  // =========================================================================
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (sel) => document.querySelector(sel);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const htmlEl = Lesson.htmlEl;
  const r0 = (x) => Math.round(x);
  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function setAttrs(e, attrs) { for (const k in attrs) e.setAttribute(k, attrs[k]); }

  const COL = {
    rich: '#d23c35', poor: '#7b2d5b', muscle: '#c98b7c', muscleDark: '#8c4a3e', wall: '#2a2f3a',
    LA: '#b7791f', LV: '#1f2430', aorta: '#c23b33', RA: '#9a6fb0', RV: '#5b4a8a', pulTrunk: '#7b2d5b', vol: '#0f766e',
    open: '#2f9e5b', shut: '#8f97a6',
  };
  const PHASE_FILL = { 'filling': '#e9f4e6', 'isovolumetric contraction': '#fdf0d9', 'ejection': '#fbe1de', 'isovolumetric relaxation': '#ebe7f7' };
  const PHASE_SHORT = { 'filling': 'filling', 'isovolumetric contraction': 'isovol. contraction', 'ejection': 'ejection', 'isovolumetric relaxation': 'isovol. relaxation' };
  const TRACE_LABEL = { LA: 'left atrium', LV: 'left ventricle', aorta: 'aorta', RA: 'right atrium', RV: 'right ventricle', pulTrunk: 'pulmonary trunk' };

  // =========================================================================
  // Shared state
  // =========================================================================
  const sim = new HeartSim.Heart();
  const app = {
    speed: 0.25,           // simulated ms per real ms
    paused: false,
    view: null, viewName: null,
    history: [],           // samples for the traces
    window: 2400,          // ms of simulated time visible on the traces
    markers: [],           // {t, label}
    sounds: [],            // {t, sound}
    traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true, phases: false },
    loops: [], curLoop: [],// PV loops, split at bicuspid closure
    ghost: null,           // a saved loop drawn dashed for comparison
    meters: null,          // () => [[label, value, hot], …]
    soundOn: true,
    lung: { acc: 0, T: 0, mean: 7 },
    userSpeed: null,
    lastFrame: null,
  };
  window.__heartsim = { sim, app, goto: (s, k) => runner.goto(s, k), runner: () => runner, lesson: () => LESSON };

  function resetSim() {
    sim.p = HeartSim.defaultParams();   // undo every experiment (arterioles, heart attack, …)
    sim.reset(8);
    app.history = []; app.markers = []; app.sounds = []; app.loops = []; app.curLoop = []; app.ghost = null;
    app.lung = { acc: 0, T: 0, mean: sim.P.pulVen };
    // Two beats already on the traces and one complete PV loop, so comparisons work at once.
    // Exactly two beat intervals, so we stop on a beat boundary with no contraction under way.
    if (sim.mode !== 'manual') advanceSim(2 * sim.rr, false);
  }

  // Advance the model in ≤1 ms chunks, recording samples, splitting PV loops at bicuspid
  // closure and collecting heart sounds. Returns the events.
  function advanceSim(dtSim, audible) {
    let events = [], remaining = dtSim;
    while (remaining > 1e-9) {
      const hh = Math.min(1, remaining);
      sim.advance(hh); remaining -= hh;
      const ev = sim.takeEvents();
      for (const e of ev) {
        if (e.type === 'valve' && e.valve === 'mitral' && !e.open) {
          // keep only complete loops (from one bicuspid closure to the next, through ejection)
          const cl = app.curLoop;
          if (cl.length > 20 && cl[0].phase === 'isovolumetric contraction' && cl.some(q => q.phase === 'ejection') && cl.some(q => q.phase === 'filling')) { app.loops.push(cl); if (app.loops.length > 6) app.loops.shift(); }
          app.curLoop = [];
        }
        if (e.type === 'sound') { app.sounds.push({ t: e.t, sound: e.sound }); if (audible !== false) playSound(e.sound); }
      }
      if (ev.length) events = events.concat(ev);
      recordSample();
      // mean lung (pulmonary venous) pressure over each beat-length of time
      const L = app.lung; L.acc += sim.P.pulVen * hh; L.T += hh;
      if (L.T >= sim.rr) { L.mean = L.acc / L.T; L.acc = 0; L.T = 0; }
    }
    if (app.sounds.length > 40) app.sounds.splice(0, app.sounds.length - 40);
    return events;
  }

  // =========================================================================
  // Heart sounds (synthesized at the valve-closure events the engine emits)
  // =========================================================================
  const audio = { ctx: null };
  function ensureAudio() {
    try {
      if (!audio.ctx) audio.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
    } catch (e) { audio.ctx = null; }
  }
  document.addEventListener('pointerdown', ensureAudio, { once: false });
  document.addEventListener('keydown', ensureAudio, { once: false });
  function playSound(kind) {
    if (!app.soundOn || !audio.ctx || audio.ctx.state !== 'running') return;
    const c = audio.ctx, t0 = c.currentTime;
    // "lub" (S1): lower and longer; "dub" (S2): higher and shorter. A damped tone plus a soft thump.
    const [f0, f1, dur, vol] = kind === 'S1' ? [120, 70, 0.14, 0.55] : [170, 110, 0.09, 0.45];
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // =========================================================================
  // Views
  // =========================================================================
  const stage = $('#stage');
  const views = {};
  function mountView(name, opts) {
    stage.innerHTML = '';
    app.view = views[name](opts || {});
    app.viewName = name;
    $('#stage-caption').textContent = (opts && opts.caption) || '';
    $('#meters').classList.toggle('shifted', name === 'heart');   // keep clear of the real-heart inset
  }

  // Dots that drift along a straight channel at a speed proportional to the model's flow there.
  function makeStream(parent, x0, x1, y, halfH, n, color) {
    const g = svgEl('g', { 'pointer-events': 'none' }, parent);
    const dots = [];
    for (let i = 0; i < n; i++) dots.push({ u: i / n, dy: (Math.random() * 2 - 1) * halfH * 0.7, el: svgEl('circle', { r: 3.2, fill: '#fff', opacity: 0, stroke: color, 'stroke-width': 1 }, g) });
    return {
      g, x0, x1, y,
      update(Q, dtSim) {
        const len = Math.abs(x1 - x0), v = Q * 0.55 * dtSim / 1000 / len; // 0.55 px per mL
        const op = clamp(Math.abs(Q) / 60, 0, 0.9);
        for (const d of dots) {
          d.u = ((d.u + v) % 1 + 1) % 1;
          setAttrs(d.el, { cx: lerp(x0, x1, d.u), cy: this.y + d.dy, opacity: op });
        }
      },
    };
  }

  // A valve drawn as two leaflets hinged on the channel walls. openness 0 = shut, 1 = wide open.
  function makeValve(parent, x, yTop, yBot, len, kind) {
    const g = svgEl('g', {}, parent);
    const a = svgEl('line', { stroke: COL.wall, 'stroke-width': kind === 'semilunar' ? 5 : 4, 'stroke-linecap': 'round' }, g);
    const b = svgEl('line', { stroke: COL.wall, 'stroke-width': kind === 'semilunar' ? 5 : 4, 'stroke-linecap': 'round' }, g);
    const ring = svgEl('rect', { x: x - 26, y: yTop - 8, width: 52, height: yBot - yTop + 16, rx: 10, fill: 'none', stroke: '#f0b429', 'stroke-width': 3, opacity: 0 }, g);
    const v = { g, open: 0, ring };
    v.set = (openness) => {
      v.open = openness;
      const ang = lerp(84, 14, openness) * Math.PI / 180; // angle from the channel axis
      setAttrs(a, { x1: x, y1: yTop, x2: x + len * Math.cos(ang), y2: yTop + len * Math.sin(ang) });
      setAttrs(b, { x1: x, y1: yBot, x2: x + len * Math.cos(ang), y2: yBot - len * Math.sin(ang) });
    };
    v.highlight = (on) => ring.setAttribute('opacity', on ? 1 : 0);
    v.set(0);
    return v;
  }

  // A valve placed anywhere: `angle` is the direction blood flows through it (degrees, SVG axes).
  function placeValve(parent, cx, cy, angle, hw, len, kind) {
    const g = svgEl('g', { transform: `translate(${cx},${cy}) rotate(${angle})` }, parent);
    const v = makeValve(g, 0, -hw, hw, len, kind);
    v.outer = g;
    return v;
  }
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  // ------------------------------------------------------------- the real heart (frontal section)
  // A textbook frontal section seen from the front: the person's right is on the viewer's left.
  // It shares the 1000×560 frame of the circulation diagram, so one can morph into the other.
  // The four valves open and shut from the model; chambers swell and shrink with model volumes.
  const ANAT = {
    silhouette: 'M352,212 C330,240 326,300 350,332 C368,350 392,352 400,352 C425,420 478,470 560,496 C600,510 628,508 645,495 C700,455 718,375 704,305 C700,275 702,250 690,228 C672,206 630,206 606,214 C590,218 575,214 560,206 C520,200 470,206 440,210 C410,210 375,205 352,212 Z',
    cavity: {
      RA: 'M391,337 C365,325 352,295 356,265 C360,232 385,218 410,222 C440,226 452,255 448,285 C446,305 438,318 429,323 Z',
      RV: 'M391,337 C405,390 440,440 505,462 C535,470 552,455 550,425 C548,380 546,330 552,285 C556,250 560,228 562,211 L528,199 C515,240 480,290 429,323 Z',
      LV: 'M578,248 C577,280 576,310 579,350 C582,410 600,455 630,470 C645,476 656,468 660,450 C672,400 672,340 660,300 L650,296 L614,296 C608,280 604,262 602,248 Z',
      LA: 'M614,296 C604,284 600,268 604,252 C610,232 640,222 664,228 C684,234 690,255 682,272 C676,285 662,292 650,296 Z',
    },
    // [x, y, flow direction (deg), half-width, leaflet length, kind]
    valves: { tricuspid: [410, 330, 70, 20, 22, 'av'], mitral: [632, 296, 90, 18, 22, 'av'], pulmonary: [545, 205, -70, 17, 13, 'semilunar'], aortic: [590, 248, -90, 12, 11, 'semilunar'] },
    pivot: { RA: [410, 330], RV: [477, 267], LA: [632, 296], LV: [611, 272] },   // chambers swell about their valve plane
    vref: { RA: 45, RV: 80, LA: 50, LV: 85 },
    lungR: 'M250,90 C160,80 70,200 60,330 C52,420 80,480 150,485 C210,488 245,460 255,420 C262,330 262,180 250,90 Z',
    lungL: 'M760,90 C850,80 940,200 948,330 C955,420 925,480 860,485 C800,488 770,460 765,430 C790,400 795,360 770,330 C760,250 755,170 760,90 Z',
  };
  const VALVE_NAME = { tricuspid: 'tricuspid valve', mitral: 'bicuspid valve', pulmonary: 'pulmonary valve', aortic: 'aortic valve' };

  function drawAnatomy(parent, opts) {
    opts = opts || {};
    const g = svgEl('g', {}, parent);
    const hits = {}, labels = {}, valves = {}, cav = {}, cavG = {}, flows = [];
    const back = svgEl('g', {}, g);       // lungs and vessels behind the heart
    const lungG = { R: svgEl('g', {}, back), L: svgEl('g', {}, back) };
    svgEl('path', { d: ANAT.lungR, fill: '#f3dcda', stroke: '#e2b9b5', 'stroke-width': 2 }, lungG.R);
    svgEl('path', { d: ANAT.lungL, fill: '#f3dcda', stroke: '#e2b9b5', 'stroke-width': 2 }, lungG.L);
    // fixedBack/fixedFront: everything that fades when the picture is simplified (behind and in
    // front of the chambers)
    const fixedBack = svgEl('g', {}, g);
    const vessel = (p, d, color, w) => {
      const vg = svgEl('g', {}, p);
      svgEl('path', { d, fill: 'none', stroke: COL.wall, 'stroke-width': w + 3, 'stroke-linecap': 'round', opacity: 0.55 }, vg);
      svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, vg);
      return vg;
    };
    const behind = svgEl('g', {}, fixedBack);
    const rpa = vessel(behind, 'M590,148 C520,150 400,160 250,185', COL.poor, 22);
    const pvR = [vessel(behind, 'M235,250 C330,250 450,252 604,258', COL.rich, 15), vessel(behind, 'M235,292 C330,292 450,282 606,274', COL.rich, 15)];
    // descending aorta: only the parts above and below the heart are drawn (it runs behind it)
    const desc = svgEl('g', {}, behind); desc.appendChild(vessel(behind, 'M690,150 L690,240', COL.rich, 32)); desc.appendChild(vessel(behind, 'M690,462 L690,548', COL.rich, 32));
    svgEl('path', { d: ANAT.silhouette, fill: COL.muscle, stroke: COL.muscleDark, 'stroke-width': 2.5 }, fixedBack);
    // chambers (in their own layer: they slide into the diagram when the picture is simplified)
    const cavLayer = svgEl('g', {}, g);
    for (const k of ['RA', 'RV', 'LA', 'LV']) {
      cavG[k] = svgEl('g', {}, cavLayer);
      cav[k] = svgEl('path', { d: ANAT.cavity[k], fill: k[0] === 'R' ? COL.poor : COL.rich }, cavG[k]);
    }
    const fixedFront = svgEl('g', {}, g);
    const front = fixedFront;
    const asc = vessel(front, 'M590,244 C590,200 582,160 584,128 C588,92 640,74 680,96 C694,108 690,130 690,170', COL.rich, 32);
    for (const d of ['M612,86 L606,30', 'M640,78 L642,26', 'M668,88 L682,36']) vessel(front, d, COL.rich, 11);
    const svc = vessel(front, 'M392,40 L394,230', COL.poor, 30);
    const ivc = vessel(front, 'M350,550 C350,450 354,380 366,318', COL.poor, 30);
    const trunk = vessel(front, 'M545,207 C550,180 565,158 590,148', COL.poor, 30);
    const lpa = vessel(front, 'M590,148 C650,140 720,160 790,190', COL.poor, 22);
    const pvL = [vessel(front, 'M800,240 C760,240 720,248 688,252', COL.rich, 15), vessel(front, 'M800,285 C760,282 720,276 686,268', COL.rich, 15)];
    // valves last, so they sit on top of the vessel openings
    for (const k in ANAT.valves) { const [x, y, a, hw, len, kind] = ANAT.valves[k]; valves[k] = placeValve(front, x, y, a, hw, len, kind); }
    // blood flow: dots along each route, speed ∝ the model's flow there
    const flowLayer = svgEl('g', { 'pointer-events': 'none' }, g);
    const route = (d, qKey, n) => {
      const p = svgEl('path', { d, fill: 'none', stroke: 'none' }, flowLayer);
      const L = p.getTotalLength(), dots = [];
      for (let i = 0; i < n; i++) dots.push({ u: i / n, el: svgEl('circle', { r: 3, fill: '#fff', opacity: 0.85 }, flowLayer) });
      flows.push({ p, L, dots, qKey });
    };
    if (!opts.inset) {
      route('M393,45 L395,250', 'ven', 6); route('M350,545 C350,450 354,380 366,312', 'ven', 7);
      route('M402,280 C410,320 430,360 455,395', 'tricuspid', 5);
      route('M470,420 C500,380 530,300 545,207 C550,180 565,158 590,148', 'pulmonary', 9);
      route('M590,148 C520,150 400,160 255,185', 'pul', 9); route('M590,148 C650,140 720,160 785,190', 'pul', 6);
      route('M795,240 C760,240 720,248 650,256', 'pulVen', 5); route('M795,285 C760,282 720,276 650,268', 'pulVen', 5);
      route('M650,262 C640,280 634,300 630,360', 'mitral', 5);
      route('M625,430 C610,380 595,300 590,244 C590,200 582,160 584,128 C588,92 640,74 680,96 C694,108 690,130 690,170 L690,232', 'aortic', 13); route('M690,470 L690,545', 'aortic', 3);
    }
    // labels
    const labelLayer = svgEl('g', { 'pointer-events': 'none' }, g);
    const label = (key, text, x, y, anchor, lx, ly, inside) => {
      const lg = svgEl('g', { opacity: 0 }, labelLayer);
      if (lx != null) {
        const ln = { x1: x + (anchor === 'end' ? 3 : anchor === 'start' ? -3 : 0), y1: y - 4, x2: lx, y2: ly, 'stroke-linecap': 'round' };
        svgEl('line', Object.assign({ stroke: '#fff', 'stroke-width': 5, opacity: 0.9 }, ln), lg);   // halo: readable on dark vessels
        svgEl('line', Object.assign({ stroke: '#1f2430', 'stroke-width': 2 }, ln), lg);
        svgEl('circle', { cx: lx, cy: ly, r: 3, fill: '#1f2430', stroke: '#fff', 'stroke-width': 1.5 }, lg);
      }
      const t = svgEl('text', { x, y, 'text-anchor': anchor || 'middle', 'font-size': inside ? 12 : 12, 'font-weight': inside ? 700 : 600, fill: inside ? '#fff' : '#1f2430', text }, lg);
      if (!inside) { lg.insertBefore(svgEl('rect', { fill: 'rgba(255,255,255,.85)', rx: 3 }, null), t); }
      labels[key] = { g: lg, t, x, y };
      return lg;
    };
    label('RA', 'Right atrium', 402, 278, 'middle', null, null, true);
    label('RV', 'Right ventricle', 478, 410, 'middle', null, null, true);
    label('LA', 'Left atrium', 644, 266, 'middle', null, null, true);
    label('LV', 'Left ventricle', 622, 395, 'middle', null, null, true);
    label('tricuspid', 'tricuspid valve', 330, 398, 'end', 405, 336);
    label('mitral', 'bicuspid valve', 745, 335, 'start', 640, 300);
    label('pulmonary', 'pulmonary valve', 440, 232, 'end', 540, 208);
    label('aortic', 'aortic valve', 520, 290, 'end', 586, 252);
    label('trunk', 'pulmonary trunk & arteries', 470, 128, 'end', 560, 168);
    label('aorta', 'aorta', 720, 80, 'start', 690, 98);
    label('pv', 'pulmonary veins', 812, 266, 'start', 798, 262);
    label('cava', 'venae cavae', 290, 470, 'end', 350, 470);
    label('lungs', 'lungs', 150, 300, 'middle');
    label('body', 'to the body ↓', 710, 536, 'start');
    // clickable regions (on top, invisible)
    const hitLayer = svgEl('g', {}, g);
    const hit = (key, el, name) => {
      el.setAttribute('data-stop', key); el.style.cursor = 'pointer';
      el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', name);
      hits[key] = el;
      return el;
    };
    const strokeHit = (d, w) => svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': w, 'stroke-linecap': 'round' });
    const hg = (key, name, kids) => { const e = svgEl('g', {}, hitLayer); kids.forEach(k => e.appendChild(k)); return hit(key, e, name); };
    hg('lungs', 'Lungs', [svgEl('path', { d: ANAT.lungR, fill: 'transparent' }), svgEl('path', { d: ANAT.lungL, fill: 'transparent' })]);
    hg('cava', 'Venae cavae', [strokeHit('M392,40 L394,215', 34), strokeHit('M350,550 C350,450 354,380 360,345', 36)]);
    hg('trunk', 'Pulmonary trunk and arteries', [strokeHit('M548,195 C552,180 565,158 590,148', 30), strokeHit('M590,148 C650,140 720,160 790,190', 24), strokeHit('M580,148 C520,150 400,160 262,184', 24)]);
    hg('pv', 'Pulmonary veins', [strokeHit('M800,240 C760,240 720,248 692,252', 20), strokeHit('M800,285 C760,282 720,276 690,268', 20), strokeHit('M240,250 L325,251', 18), strokeHit('M240,292 L325,291', 18)]);
    hg('aorta', 'Aorta', [strokeHit('M590,232 C590,200 582,160 584,128 C588,92 640,74 680,96 C694,108 690,130 690,170 L690,232', 34), strokeHit('M690,470 L690,548', 34)]);
    for (const k of ['RA', 'RV', 'LA', 'LV']) hg(k, { RA: 'Right atrium', RV: 'Right ventricle', LA: 'Left atrium', LV: 'Left ventricle' }[k], [svgEl('path', { d: ANAT.cavity[k], fill: 'transparent' })]);
    for (const k in ANAT.valves) { const [x, y] = ANAT.valves[k]; hg(k, VALVE_NAME[k], [svgEl('circle', { cx: x, cy: y, r: 17, fill: 'transparent' })]); }
    if (opts.inset) hitLayer.setAttribute('display', 'none');

    const glow = 'drop-shadow(0 0 5px #f0b429) drop-shadow(0 0 2px #f0b429)';
    const shown = new Set();
    const groupsFor = { RA: [cavG.RA], RV: [cavG.RV], LA: [cavG.LA], LV: [cavG.LV], lungs: [lungG.R, lungG.L], trunk: [trunk, lpa, rpa], pv: [...pvL, ...pvR], aorta: [asc, desc], cava: [svc, ivc] };
    const A = {
      g, back, fixed: [fixedBack, fixedFront], cavLayer, labelLayer, hitLayer, flowLayer, lungG, cavG, cav, valves, hits, labels,
      leftSide: { dim: [cavG.RA, cavG.RV, svc, ivc, trunk, lpa, rpa, lungG.R, lungG.L, valves.tricuspid.outer, valves.pulmonary.outer] },
      setLabels(keys) {
        shown.clear();
        for (const k of (keys === 'all' ? Object.keys(labels) : keys || [])) shown.add(k);
        for (const k in labels) {
          const L = labels[k]; L.g.setAttribute('opacity', shown.has(k) ? 1 : 0);
          const r = L.g.querySelector('rect');
          if (r && shown.has(k)) { const b = L.t.getBBox(); setAttrs(r, { x: b.x - 3, y: b.y - 1, width: b.width + 6, height: b.height + 2 }); }
        }
      },
      highlight(key) {
        for (const k in groupsFor) for (const e of groupsFor[k]) e.style.filter = '';
        for (const k in valves) valves[k].highlight(false);
        if (!key) return;
        if (valves[key]) valves[key].highlight(true);
        for (const e of groupsFor[key] || []) e.style.filter = glow;
      },
      // Fade everything except the left-heart route (pulmonary veins → LA → LV → aorta).
      dimRight(on) { for (const e of A.leftSide.dim) e.style.opacity = on ? 0.18 : ''; },
      beat: true,
      update(dtReal, dtSim) {
        const k = 1 - Math.exp(-dtReal / 45);
        for (const n in valves) valves[n].set(lerp(valves[n].open, sim.valveOpen[n] ? 1 : 0, k));
        if (A.beat) for (const c of ['RA', 'RV', 'LA', 'LV']) {
          const s = 1 + 0.35 * (Math.sqrt(Math.max(5, sim.V[c]) / ANAT.vref[c]) - 1), [px, py] = ANAT.pivot[c];
          cav[c].setAttribute('transform', `translate(${px},${py}) scale(${s.toFixed(4)}) translate(${-px},${-py})`);
        }
        for (const f of flows) {
          const Q = sim.Q[f.qKey];
          for (const d of f.dots) {
            d.u = (d.u + Q * 0.9 * dtSim / 1000 / f.L + 1) % 1;
            const p = f.p.getPointAtLength(d.u * f.L);
            setAttrs(d.el, { cx: p.x, cy: p.y });
          }
        }
      },
    };
    return A;
  }

  // ------------------------------------------------------------- the circulation diagram
  // Boxes and pipes: atria sit directly on their ventricles, joined by the AV valves.
  const DIAG_BOX = { RA: [330, 200, 140, 94], RV: [330, 300, 140, 110], LA: [530, 200, 140, 94], LV: [530, 300, 140, 110], lungs: [330, 30, 340, 80], body: [300, 450, 400, 80] };
  function drawDiagram(parent) {
    const g = svgEl('g', {}, parent);
    const defs = svgEl('defs', {}, g);
    const grad = svgEl('linearGradient', { id: 'bodygrad', x1: '1', x2: '0', y1: '0', y2: '0' }, defs);
    svgEl('stop', { offset: '0%', 'stop-color': COL.rich }, grad); svgEl('stop', { offset: '100%', 'stop-color': COL.poor }, grad);
    const grad2 = svgEl('linearGradient', { id: 'lunggrad', x1: '0', x2: '1', y1: '0', y2: '0' }, defs);
    svgEl('stop', { offset: '0%', 'stop-color': COL.poor }, grad2); svgEl('stop', { offset: '100%', 'stop-color': COL.rich }, grad2);
    const hits = {}, valves = {}, flows = [], groups = {};
    const hit = (el, key, name) => {
      el.setAttribute('data-stop', key); el.style.cursor = 'pointer';
      el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', name);
      hits[key] = el; groups[key] = el;
    };
    const vessel = (d, color, key, name) => {
      const vg = svgEl('g', {}, g);
      svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 18, 'stroke-linejoin': 'round', opacity: 0.9 }, vg);
      svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 30 }, vg);
      hit(vg, key, name);
      return svgEl('path', { d, fill: 'none', stroke: 'none' }, vg);
    };
    const P = {
      cava: vessel('M300,490 L210,490 L210,245 L330,245', COL.poor, 'cava', 'Venae cavae'),
      trunk: vessel('M470,330 L500,330 L500,110', COL.poor, 'trunk', 'Pulmonary trunk and arteries'),
      pv: vessel('M670,70 L750,70 L750,245 L670,245', COL.rich, 'pv', 'Pulmonary veins'),
      aorta: vessel('M670,355 L800,355 L800,490 L700,490', COL.rich, 'aorta', 'Aorta'),
    };
    const box = (key, color, title, sub, name) => {
      const [x, y, w, h] = DIAG_BOX[key], bg = svgEl('g', {}, g);
      svgEl('rect', { x, y, width: w, height: h, rx: 18, fill: color, opacity: 0.85 }, bg);
      svgEl('text', { x: x + w / 2, y: y + h / 2 - 4, 'text-anchor': 'middle', fill: '#fff', 'font-size': 16, 'font-weight': 650, text: title }, bg);
      svgEl('text', { x: x + w / 2, y: y + h / 2 + 18, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12, text: sub }, bg);
      hit(bg, key, name);
    };
    box('lungs', 'url(#lunggrad)', 'Lungs', 'pulmonary capillaries: blood picks up O₂, gives off CO₂', 'Lungs');
    box('body', 'url(#bodygrad)', 'Body tissues', 'systemic capillaries: cells take O₂, give off CO₂', 'Body tissues');
    const chamber = (key, color, label, wall) => {
      const [x, y, w, h] = DIAG_BOX[key], cg = svgEl('g', {}, g);
      svgEl('rect', { x, y, width: w, height: h, rx: 14, fill: color, stroke: COL.muscleDark, 'stroke-width': wall }, cg);
      svgEl('text', { x: x + w / 2, y: y + h / 2 + 5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 14, 'font-weight': 650, text: label }, cg);
      hit(cg, key, label);
    };
    chamber('RA', COL.poor, 'Right atrium', 4); chamber('RV', COL.poor, 'Right ventricle', 6);
    chamber('LA', COL.rich, 'Left atrium', 4); chamber('LV', COL.rich, 'Left ventricle', 14);
    // AV openings joining each atrium to its ventricle, with their valves
    svgEl('rect', { x: 378, y: 284, width: 44, height: 26, fill: COL.poor }, g);
    svgEl('rect', { x: 578, y: 284, width: 44, height: 26, fill: COL.rich }, g);
    valves.tricuspid = placeValve(g, 400, 296, 90, 18, 15, 'av');
    valves.mitral = placeValve(g, 600, 296, 90, 18, 15, 'av');
    valves.pulmonary = placeValve(g, 478, 330, 0, 9, 9, 'semilunar');
    valves.aortic = placeValve(g, 678, 355, 0, 9, 9, 'semilunar');
    svgEl('text', { x: 312, y: 300, 'text-anchor': 'end', 'font-size': 11, fill: '#5f6675', text: 'tricuspid valve' }, g);
    svgEl('text', { x: 688, y: 300, 'text-anchor': 'start', 'font-size': 11, fill: '#5f6675', text: 'bicuspid valve' }, g);
    svgEl('text', { x: 400, y: 190, 'text-anchor': 'middle', 'font-size': 13, fill: '#5f6675', text: 'RIGHT HEART' }, g);
    svgEl('text', { x: 600, y: 190, 'text-anchor': 'middle', 'font-size': 13, fill: '#5f6675', text: 'LEFT HEART' }, g);
    svgEl('text', { x: 500, y: 438, 'text-anchor': 'middle', 'font-size': 11, fill: '#5f6675', text: 'drawn as if facing the person: their right is on your left' }, g);
    const flowLayer = svgEl('g', { 'pointer-events': 'none' }, g);
    const route = (pathEl, qKey, n) => {
      const L = pathEl.getTotalLength(), dots = [];
      for (let i = 0; i < n; i++) dots.push({ u: i / n, el: svgEl('circle', { r: 3.5, fill: '#fff', opacity: 0.85 }, flowLayer) });
      flows.push({ p: pathEl, L, dots, qKey });
    };
    route(P.cava, 'ven', 9); route(P.trunk, 'pulmonary', 9); route(P.pv, 'pulVen', 9); route(P.aorta, 'aortic', 9);
    route(svgEl('path', { d: 'M400,262 L400,330' }, flowLayer), 'tricuspid', 4);
    route(svgEl('path', { d: 'M600,262 L600,330' }, flowLayer), 'mitral', 4);
    route(svgEl('path', { d: 'M690,470 L310,470' }, flowLayer), 'sys', 10);
    route(svgEl('path', { d: 'M310,520 L690,520' }, flowLayer), 'sys', 10);
    route(svgEl('path', { d: 'M340,42 L660,42' }, flowLayer), 'pul', 9);
    route(svgEl('path', { d: 'M340,100 L660,100' }, flowLayer), 'pul', 9);
    return {
      g, hits, valves,
      highlight(key) {
        for (const k in groups) groups[k].style.filter = '';
        for (const k in valves) valves[k].highlight(false);
        if (key && valves[key]) valves[key].highlight(true);
        if (key && groups[key]) groups[key].style.filter = 'drop-shadow(0 0 6px #f0b429) drop-shadow(0 0 2px #f0b429)';
      },
      update(dtReal, dtSim) {
        const k = 1 - Math.exp(-dtReal / 45);
        for (const n in valves) valves[n].set(lerp(valves[n].open, sim.valveOpen[n] ? 1 : 0, k));
        for (const f of flows) {
          const Q = sim.Q[f.qKey];
          for (const d of f.dots) {
            d.u = (d.u + Q * 0.9 * dtSim / 1000 / f.L + 1) % 1;
            const p = f.p.getPointAtLength(d.u * f.L);
            setAttrs(d.el, { cx: p.x, cy: p.y });
          }
        }
      },
    };
  }

  // ------------------------------------------------------------- real heart ⇄ diagram (scenes 1–3)
  // One view, two pictures. morph runs 0 → 1 from the real heart to a simpler layout: the
  // circulation diagram ('diagram') or the left heart straightened into a line ('line').
  // Chambers slide and stretch into place; everything else cross-fades.
  views.circuit = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'The heart and circulation' }, stage);
    const D = drawDiagram(svg), A = drawAnatomy(svg);
    const linePipes = svgEl('g', { opacity: 0, 'pointer-events': 'none' }, svg);
    svgEl('rect', { x: 40, y: 262, width: 190, height: 34, fill: COL.rich }, linePipes);
    svgEl('rect', { x: 640, y: 258, width: 250, height: 42, fill: COL.rich }, linePipes);
    svgEl('text', { x: 50, y: 250, 'font-size': 13, fill: '#5f6675', text: 'from the lungs' }, linePipes);
    svgEl('text', { x: 880, y: 246, 'font-size': 13, fill: '#5f6675', 'text-anchor': 'end', text: 'to the body →' }, linePipes);
    // the same simple shapes the line view uses, so the hand-over is seamless
    const lineShapes = svgEl('g', { opacity: 0 }, linePipes);
    svgEl('rect', { x: 290, y: 251, width: 210, height: 56, fill: COL.rich }, lineShapes);
    svgEl('rect', { x: 500, y: 255, width: 160, height: 48, fill: COL.rich }, lineShapes);
    svgEl('circle', { cx: 290, cy: 279, r: 56, fill: COL.rich, stroke: COL.muscleDark, 'stroke-width': 7 }, lineShapes);
    svgEl('ellipse', { cx: 500, cy: 279, rx: 125, ry: 98, fill: COL.muscle, stroke: COL.muscleDark, 'stroke-width': 2 }, lineShapes);
    svgEl('rect', { x: 290, y: 251, width: 210, height: 56, fill: COL.rich }, lineShapes);
    svgEl('rect', { x: 500, y: 255, width: 160, height: 48, fill: COL.rich }, lineShapes);
    svgEl('ellipse', { cx: 500, cy: 279, rx: 108, ry: 80, fill: COL.rich }, lineShapes);
    svgEl('text', { x: 290, y: 284, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#fff', text: 'LA' }, lineShapes);
    svgEl('text', { x: 500, y: 285, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#fff', text: 'LV' }, lineShapes);
    const lineValves = { mitral: placeValve(lineShapes, 360, 279, 0, 28, 30, 'av'), aortic: placeValve(lineShapes, 640, 279, 0, 24, 25, 'semilunar') };
    svgEl('text', { x: 360, y: 345, 'font-size': 13, fill: '#3a3f4a', 'text-anchor': 'middle', text: 'bicuspid valve' }, linePipes);
    svgEl('text', { x: 640, y: 345, 'font-size': 13, fill: '#3a3f4a', 'text-anchor': 'middle', text: 'aortic valve' }, linePipes);
    // where each moving part ends up
    const TARGET = {
      diagram: { RA: DIAG_BOX.RA, RV: DIAG_BOX.RV, LA: DIAG_BOX.LA, LV: DIAG_BOX.LV, lungR: [330, 30, 170, 80], lungL: [500, 30, 170, 80] },
      line: { LA: [234, 223, 112, 112], LV: [375, 181, 250, 196] },
    };
    const LABEL_AT = {
      diagram: { RA: [400, 252], RV: [400, 355], LA: [600, 252], LV: [600, 355], lungs: [500, 70] },
      line: { LA: [290, 284], LV: [495, 284] },
    };
    const native = {};
    for (const k of ['RA', 'RV', 'LA', 'LV']) { const b = A.cav[k].getBBox(); native[k] = [b.x, b.y, b.width, b.height]; }
    for (const k of ['R', 'L']) { const b = A.lungG[k].getBBox(); native['lung' + k] = [b.x, b.y, b.width, b.height]; }
    const movers = { RA: A.cavG.RA, RV: A.cavG.RV, LA: A.cavG.LA, LV: A.cavG.LV, lungR: A.lungG.R, lungL: A.lungG.L };
    const STOP_POS = {
      anatomy: { body: [690, 528], cava: [350, 470], RA: [402, 255], RV: [470, 380], trunk: [600, 160], lungs: [150, 260], pv: [760, 262], LA: [644, 250], LV: [625, 360], aorta: [640, 82] },
      diagram: { body: [380, 470], cava: [210, 360], RA: [400, 218], RV: [400, 322], trunk: [500, 200], lungs: [380, 48], pv: [750, 160], LA: [600, 218], LV: [600, 322], aorta: [800, 420] },
    };
    const STOP_O2 = { body: 'poor', cava: 'poor', RA: 'poor', RV: 'poor', trunk: 'poor', lungs: 'rich', pv: 'rich', LA: 'rich', LV: 'rich', aorta: 'rich' };
    const token = svgEl('g', { 'pointer-events': 'none', opacity: 0 }, svg);
    const tokenDisc = svgEl('ellipse', { rx: 13, ry: 9, fill: COL.poor, stroke: '#fff', 'stroke-width': 3 }, token);
    let tokStop = null, tok = { x: 500, y: 470 };

    const view = {
      svg, A, D, onStop: null, other: 'diagram', m: 0, target: 0, rate: 0,
      // jump straight to a layout
      setLayout(name) { if (name === 'anatomy') { view.m = view.target = 0; } else { view.other = name; view.m = view.target = 1; } apply(); },
      // animate to a layout over `ms` of real time
      morphTo(name, ms) {
        if (name === 'anatomy') view.target = 0; else { if (view.other !== name && view.m > 0) view.m = 0; view.other = name; view.target = 1; }
        view.rate = 1 / (ms || 2500);
      },
      layout() { return view.m <= 0.001 ? 'anatomy' : view.m >= 0.999 ? view.other : 'moving'; },
      showToken(stop) { tokStop = stop; token.setAttribute('opacity', 1); tokenDisc.setAttribute('fill', STOP_O2[stop] === 'rich' ? COL.rich : COL.poor); },
      highlight(key) { A.highlight(key); D.highlight(key); },
      update(dtReal, dtSim) {
        if (view.m !== view.target) { const s = Math.sign(view.target - view.m); view.m = clamp(view.m + s * view.rate * dtReal, Math.min(view.m, view.target), Math.max(view.m, view.target)); apply(); }
        A.beat = view.m === 0;
        A.update(dtReal, dtSim); D.update(dtReal, dtSim);
        if (view.other === 'line' && view.m > 0.5) { const k = 1 - Math.exp(-dtReal / 45); for (const n in lineValves) lineValves[n].set(lerp(lineValves[n].open, sim.valveOpen[n] ? 1 : 0, k)); }
        if (tokStop) {
          const pa = STOP_POS.anatomy[tokStop], pd = STOP_POS.diagram[tokStop], e = view.other === 'diagram' ? smooth(view.m) : 0;
          const tx = lerp(pa[0], pd[0], e), ty = lerp(pa[1], pd[1], e), k = 1 - Math.exp(-dtReal / 120);
          tok.x += (tx - tok.x) * k; tok.y += (ty - tok.y) * k;
          token.setAttribute('transform', `translate(${tok.x},${tok.y})`);
        }
      },
      narrate() {
        if (view.layout() === 'anatomy') return narrateValves();
        if (view.other === 'line') return narrateLeftHeart();
        if (view.layout() !== 'diagram') return narrateValves();
        const L = sim.stats.L, R = sim.stats.R;
        if (!L || !R) return null;
        return { html: `Each beat the <b>right</b> ventricle sends <b>${r0(R.sv)} mL</b> to the lungs and the <b>left</b> ventricle sends <b>${r0(L.sv)} mL</b> to the body: two pumps in one loop. The white dots move with the model's blood flow.`, key: 'circuit' };
      },
    };
    function apply() {
      const m = view.m, line = view.other === 'line', e = smooth(m);
      // the parts of the real heart that do not move fade out early
      for (const f of A.fixed) f.style.opacity = 1 - smooth(m / 0.4);
      A.flowLayer.style.opacity = 1 - smooth(m / 0.25);
      A.hitLayer.style.display = m < 0.02 ? '' : 'none';
      D.g.style.opacity = line ? 0 : smooth((m - 0.8) / 0.2);
      D.g.style.pointerEvents = !line && m > 0.98 ? '' : 'none';
      linePipes.setAttribute('opacity', line ? smooth((m - 0.45) / 0.55) : 0);
      lineShapes.setAttribute('opacity', line ? smooth((m - 0.7) / 0.3) : 0);
      for (const k in movers) {
        const el = movers[k], from = native[k], to = TARGET[view.other][k];
        if (k.startsWith('R') || k.startsWith('lung')) { if (line) { el.style.opacity = 1 - smooth(m / 0.5); el.removeAttribute('transform'); continue; } }
        if (!to) { el.removeAttribute('transform'); continue; }
        const box = from.map((v, i) => lerp(v, to[i], e)), sx = box[2] / from[2], sy = box[3] / from[3];
        el.setAttribute('transform', m === 0 ? '' : `translate(${box[0] - from[0] * sx},${box[1] - from[1] * sy}) scale(${sx},${sy})`);
        el.style.opacity = 1 - smooth((m - (line ? 0.7 : 0.82)) / (line ? 0.3 : 0.18));
      }
      if (m > 0) for (const c of ['RA', 'RV', 'LA', 'LV']) A.cav[c].removeAttribute('transform');
      // chamber labels travel with their chambers; other labels fade
      const at = LABEL_AT[view.other];
      for (const k in A.labels) {
        const L = A.labels[k], p = at[k];
        if (p) { L.g.setAttribute('transform', `translate(${lerp(0, p[0] - L.x, e)},${lerp(0, p[1] - L.y, e)})`); L.g.style.opacity = String(1 - smooth((m - (line ? 0.7 : 0.82)) / (line ? 0.3 : 0.18))); }
        else L.g.style.opacity = String(1 - smooth(m / 0.3));
      }
    }
    for (const src of [A.hits, D.hits]) for (const key in src) {
      const el = src[key];
      el.addEventListener('click', () => view.onStop && view.onStop(key));
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); view.onStop && view.onStop(key); } });
    }
    view.setLayout(opts.layout || 'anatomy');
    A.setLabels(opts.labels || 'all');
    return view;
  };

  // What the four valves are doing, for the real-heart view.
  function narrateValves() {
    const ph = sim.phase('left');
    let html;
    if (ph === 'filling') html = `<b>Filling.</b> The <b>AV valves</b> (tricuspid and bicuspid) are open: blood flows from each atrium down into its ventricle. The <b>semilunar valves</b> (pulmonary and aortic) are shut.`;
    else if (ph === 'ejection') html = `<b>Ejection.</b> Both ventricles squeeze together: the <b>semilunar valves</b> are open and blood is pumped into the pulmonary trunk and the aorta. The AV valves are shut, so nothing goes back into the atria.`;
    else if (ph === 'isovolumetric contraction') html = `<b>All four valves shut.</b> The ventricles have started to squeeze, which pushed the AV valves shut, but their pressure has not yet forced the semilunar valves open.`;
    else html = `<b>All four valves shut.</b> The ventricles are relaxing: the semilunar valves have snapped shut, and the AV valves have not yet been pushed open.`;
    return { html, key: 'valves-' + ph };
  }

  // ------------------------------------------------------------- left heart strip (scenes 3–6)
  views.heart = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 420', role: 'img', 'aria-label': 'Left heart: pulmonary veins, left atrium, bicuspid valve, left ventricle, aortic valve, aorta' }, stage);
    // where we are: the real heart, with the left-side route highlighted
    const insetG = svgEl('g', { transform: 'translate(2,0) scale(0.17)', 'pointer-events': 'none' }, svg);
    svgEl('rect', { x: 30, y: 6, width: 940, height: 548, rx: 36, fill: '#fff', stroke: '#d9d6cc', 'stroke-width': 5 }, insetG);
    const inset = drawAnatomy(insetG, { inset: true });
    inset.setLabels([]); inset.dimRight(true);
    svgEl('text', { x: 500, y: 600, 'text-anchor': 'middle', 'font-size': 52, fill: '#5f6675', text: 'the real heart: left side' }, insetG);
    const strip = svgEl('g', {}, svg);
    if (opts.pv) strip.setAttribute('transform', 'translate(0,62) scale(0.66)');
    const Y = 215;
    // labels
    svgEl('text', { x: 24, y: Y - 34, 'font-size': 14, fill: '#5f6675', text: 'from the lungs' }, strip);
    svgEl('text', { x: 24, y: Y - 18, 'font-size': 12, fill: '#8a90a0', text: '(pulmonary veins)' }, strip);
    svgEl('text', { x: 795, y: Y - 44, 'font-size': 14, fill: '#5f6675', 'text-anchor': 'end', text: 'to the body →' }, strip);
    // pipes and passages (blood colour), under the chambers
    const pv = svgEl('rect', { x: 10, y: Y - 16, width: 200, height: 32, fill: COL.rich }, strip);
    svgEl('line', { x1: 10, y1: Y - 16, x2: 180, y2: Y - 16, stroke: COL.wall, 'stroke-width': 2 }, strip);
    svgEl('line', { x1: 10, y1: Y + 16, x2: 180, y2: Y + 16, stroke: COL.wall, 'stroke-width': 2 }, strip);
    const aorta = svgEl('rect', { x: 600, y: Y - 22, width: 200, height: 44, fill: COL.rich }, strip);
    const aoTop = svgEl('line', { x1: 625, x2: 800, stroke: COL.wall, 'stroke-width': 2.5 }, strip);
    const aoBot = svgEl('line', { x1: 625, x2: 800, stroke: COL.wall, 'stroke-width': 2.5 }, strip);
    // left atrium
    const la = svgEl('circle', { cx: 200, cy: Y, r: 56, fill: COL.rich, stroke: COL.muscleDark, 'stroke-width': 7 }, strip);
    // left ventricle: muscle (outer) then the passages through its wall, then the cavity
    const lvOuter = svgEl('ellipse', { cx: 470, cy: Y, fill: COL.muscle, stroke: COL.muscleDark, 'stroke-width': 2 }, strip);
    svgEl('rect', { x: 200, y: Y - 28, width: 270, height: 56, fill: COL.rich }, strip);
    svgEl('rect', { x: 470, y: Y - 24, width: 160, height: 48, fill: COL.rich }, strip);
    const lvCav = svgEl('ellipse', { cx: 470, cy: Y, fill: COL.rich }, strip);
    // valve rings (the fibrous skeleton) drawn as short wall stubs
    for (const [x, h] of [[300, 28], [620, 24]]) {
      svgEl('rect', { x: x - 5, y: Y - h - 10, width: 10, height: 12, fill: COL.wall, rx: 2 }, strip);
      svgEl('rect', { x: x - 5, y: Y + h - 2, width: 10, height: 12, fill: COL.wall, rx: 2 }, strip);
    }
    const mitral = makeValve(strip, 300, Y - 28, Y + 28, 30, 'av');
    const aortic = makeValve(strip, 620, Y - 24, Y + 24, 25, 'semilunar');
    svgEl('text', { x: 300, y: Y + 62, 'text-anchor': 'middle', 'font-size': 13, fill: '#3a3f4a', text: 'bicuspid valve' }, strip);
    svgEl('text', { x: 620, y: Y + 62, 'text-anchor': 'middle', 'font-size': 13, fill: '#3a3f4a', text: 'aortic valve' }, strip);
    const mState = svgEl('text', { x: 300, y: Y + 78, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700 }, strip);
    const aState = svgEl('text', { x: 620, y: Y + 78, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700 }, strip);
    // chamber read-outs
    const laTxt = svgEl('text', { x: 200, y: Y - 80, 'text-anchor': 'middle', 'font-size': 13, fill: '#1f2430' }, strip);
    const lvTxt = svgEl('text', { x: 470, y: Y - 128, 'text-anchor': 'middle', 'font-size': 14, fill: '#1f2430' }, strip);
    const lvTxt2 = svgEl('text', { x: 470, y: Y - 112, 'text-anchor': 'middle', 'font-size': 12, fill: '#5f6675' }, strip);
    const aoTxt = svgEl('text', { x: 720, y: Y + 54, 'text-anchor': 'middle', 'font-size': 13, fill: '#1f2430' }, strip);
    svgEl('text', { x: 200, y: Y + 5, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#fff', text: 'LA' }, strip);
    svgEl('text', { x: 470, y: Y + 6, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 700, fill: '#fff', text: 'LV' }, strip);
    svgEl('text', { x: 720, y: Y + 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#fff', text: 'aorta' }, strip);
    // flow streams
    const sPV = makeStream(strip, 15, 150, Y, 14, 10, COL.wall);
    const sM = makeStream(strip, 262, 360, Y, 24, 8, COL.wall);
    const sA = makeStream(strip, 575, 795, Y, 20, 14, COL.wall);

    // pressure ladder: three columns and the valve rule between them
    let ladder = null;
    if (!opts.pv) {
      const g = svgEl('g', {}, svg);
      const base = 352, top = 56, pmax = 140, sc = (base - top) / pmax;
      const yP = (p) => base - clamp(p, 0, pmax) * sc;
      svgEl('text', { x: 905, y: 22, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 650, fill: '#3a3f4a', text: 'Pressure (mmHg)' }, g);
      svgEl('text', { x: 905, y: 37, 'text-anchor': 'middle', 'font-size': 11, fill: '#8a90a0', text: 'blood is pushed from high to low' }, g);
      for (let p = 0; p <= pmax; p += 20) {
        svgEl('line', { x1: 832, x2: 990, y1: yP(p), y2: yP(p), stroke: '#ebe8df' }, g);
        svgEl('text', { x: 826, y: yP(p) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#8a90a0', text: p }, g);
      }
      const cols = {};
      for (const [k, x, label, color] of [['LA', 850, 'LA', '#e2867f'], ['LV', 905, 'LV', COL.rich], ['aorta', 960, 'aorta', '#9e2a24']]) {
        const bar = svgEl('rect', { x: x - 15, width: 30, fill: color, rx: 3 }, g);
        const val = svgEl('text', { x, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#1f2430' }, g);
        svgEl('text', { x, y: base + 16, 'text-anchor': 'middle', 'font-size': 12, fill: '#3a3f4a', text: label }, g);
        cols[k] = { bar, val };
      }
      const rule = (x, label) => {
        const r = svgEl('g', {}, g);
        const arrow = svgEl('text', { x, y: base + 34, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 }, r);
        const txt = svgEl('text', { x, y: base + 48, 'text-anchor': 'middle', 'font-size': 11 }, r);
        svgEl('text', { x, y: base + 61, 'text-anchor': 'middle', 'font-size': 10, fill: '#8a90a0', text: label }, r);
        return { arrow, txt };
      };
      const rM = rule(877, 'bicuspid'), rA = rule(932, 'aortic');
      ladder = {
        update() {
          for (const k of ['LA', 'LV', 'aorta']) {
            const P = sim.P[k], y = yP(P);
            setAttrs(cols[k].bar, { y, height: Math.max(0, base - y) });
            setAttrs(cols[k].val, { y: y - 5 }); cols[k].val.textContent = r0(P);
          }
          const setRule = (r, up, down, open) => {
            r.arrow.textContent = up > down ? '→' : '←';
            r.arrow.setAttribute('fill', open ? COL.open : COL.shut);
            r.txt.textContent = open ? 'open' : 'shut';
            r.txt.setAttribute('fill', open ? COL.open : '#5f6675');
          };
          setRule(rM, sim.P.LA, sim.P.LV, sim.valveOpen.mitral);
          setRule(rA, sim.P.LV, sim.P.sysArt, sim.valveOpen.aortic);
        },
      };
    }

    // pressure–volume loop
    let pvPlot = null;
    if (opts.pv) {
      const g = svgEl('g', {}, svg);
      const x0 = 600, x1 = 980, y0 = 370, y1 = 22, vmin = 20, vmax = 180, pmin = 0, pmax = 150;
      const X = (v) => x0 + (v - vmin) / (vmax - vmin) * (x1 - x0), Yp = (p) => y0 - (clamp(p, pmin, pmax) - pmin) / (pmax - pmin) * (y0 - y1);
      svgEl('rect', { x: x0, y: y1, width: x1 - x0, height: y0 - y1, fill: '#fff', stroke: '#d9d6cc' }, g);
      for (let v = vmin; v <= vmax; v += 10) {
        svgEl('line', { x1: X(v), x2: X(v), y1: y1, y2: y0, stroke: v % 20 === 0 ? '#e6e3da' : '#f3f1ec' }, g);
        if (v % 20 === 0) svgEl('text', { x: X(v), y: y0 + 15, 'text-anchor': 'middle', 'font-size': 11, fill: '#5f6675', text: v }, g);
      }
      for (let p = pmin; p <= pmax; p += 10) {
        svgEl('line', { x1: x0, x2: x1, y1: Yp(p), y2: Yp(p), stroke: p % 50 === 0 ? '#e6e3da' : '#f6f4ef' }, g);
        if (p % 25 === 0) svgEl('text', { x: x0 - 6, y: Yp(p) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#5f6675', text: p }, g);
      }
      svgEl('text', { x: (x0 + x1) / 2, y: y0 + 32, 'text-anchor': 'middle', 'font-size': 13, fill: '#3a3f4a', text: 'LV volume (mL)' }, g);
      svgEl('text', { x: x0 - 44, y: (y0 + y1) / 2, 'text-anchor': 'middle', 'font-size': 13, fill: '#3a3f4a', transform: `rotate(-90 ${x0 - 44} ${(y0 + y1) / 2})`, text: 'LV pressure (mmHg)' }, g);
      svgEl('text', { x: x0 + 8, y: y1 + 18, 'font-size': 13, 'font-weight': 650, fill: '#3a3f4a', text: 'Pressure–volume loop' }, g);
      const ghost = svgEl('path', { fill: 'none', stroke: '#9aa1ae', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, g);
      const ghostLbl = svgEl('text', { 'font-size': 12, 'font-weight': 600, fill: '#6b7280', stroke: '#fff', 'stroke-width': 4, 'paint-order': 'stroke' }, g);
      const old = svgEl('path', { fill: 'none', stroke: '#c9c5bb', 'stroke-width': 2 }, g);
      const segG = svgEl('g', {}, g);
      const cur = svgEl('path', { fill: 'none', stroke: COL.LV, 'stroke-width': 2.5 }, g);
      const dot = svgEl('circle', { r: 6, fill: COL.rich, stroke: '#fff', 'stroke-width': 2 }, g);
      const mk = svgEl('g', {}, g);
      const segs = {};
      for (const ph of Object.keys(PHASE_FILL)) {
        const sg = svgEl('g', { tabindex: '0', role: 'button', 'aria-label': 'Side of the loop: ' + ph }, segG);
        const vis = svgEl('path', { fill: 'none', stroke: COL.LV, 'stroke-width': 3 }, sg);
        const hit = svgEl('path', { fill: 'none', stroke: 'transparent', 'stroke-width': 22, 'stroke-linecap': 'round' }, sg);
        sg.addEventListener('click', () => view.onSegment && view.onSegment(ph));
        sg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); view.onSegment && view.onSegment(ph); } });
        segs[ph] = { g: sg, vis, hit };
      }
      const pathOf = (pts) => pts.length ? 'M' + pts.map(p => `${X(p.V).toFixed(1)},${Yp(p.P).toFixed(1)}`).join('L') : '';
      let lastLoopN = -1;
      pvPlot = {
        segs,
        update() {
          // the most recent complete loop, split into its four sides
          const loop = app.loops[app.loops.length - 1];
          if (loop && app.loops.length !== lastLoopN) {
            lastLoopN = app.loops.length;
            for (const ph in segs) {
              const pts = loop.filter(p => p.phase === ph);
              // connect each side to the next sample so the loop is closed
              const i = loop.findIndex(p => p.phase === ph), j = loop.length - 1 - [...loop].reverse().findIndex(p => p.phase === ph);
              const run = i >= 0 ? loop.slice(i, Math.min(loop.length, j + 2)) : [];
              const d = pathOf(run.length ? run : pts);
              segs[ph].vis.setAttribute('d', d); segs[ph].hit.setAttribute('d', d);
            }
            old.setAttribute('d', app.loops.length > 1 ? pathOf(app.loops[app.loops.length - 2]) : '');
            mk.innerHTML = '';
            if (view.markersOn) {
              const st = sim.stats.L;
              if (st) for (const [v, lab] of [[st.edv, 'EDV'], [st.esv, 'ESV']]) {
                svgEl('line', { x1: X(v), x2: X(v), y1: y1, y2: y0, stroke: '#2f6fd6', 'stroke-dasharray': '4 4', 'stroke-width': 1.5 }, mk);
                svgEl('text', { x: X(v), y: y1 - 6, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#2f6fd6', text: lab }, mk);
              }
            }
          }
          cur.setAttribute('d', pathOf(app.curLoop));
          setAttrs(dot, { cx: X(sim.V.LV), cy: Yp(sim.P.LV) });
          if (app.ghost) {
            ghost.setAttribute('d', pathOf(app.ghost.loop) + 'Z');
            // label inside the dashed loop it belongs to (at its centre)
            const gl = app.ghost.loop, cv = gl.reduce((a, p) => a + p.V, 0) / gl.length, cp = (Math.max(...gl.map(p => p.P)) + Math.min(...gl.map(p => p.P))) / 2;
            setAttrs(ghostLbl, { x: X(cv), y: Yp(cp) + 4, 'text-anchor': 'middle' }); ghostLbl.textContent = app.ghost.label || 'before';
          } else { ghost.setAttribute('d', ''); ghostLbl.textContent = ''; }
        },
        refresh() { lastLoopN = -1; },
        highlight(ph, color) { for (const k in segs) { segs[k].vis.setAttribute('stroke', k === ph ? (color || '#f0b429') : COL.LV); segs[k].vis.setAttribute('stroke-width', k === ph ? 6 : 3); } },
      };
    }

    // numbered key explaining how to read the picture (scene 3)
    const keyG = svgEl('g', { 'pointer-events': 'none', display: opts.key ? '' : 'none' }, svg);
    const badge = (n, x, y) => { const b = svgEl('g', { transform: `translate(${x},${y})` }, keyG); svgEl('circle', { r: 13, fill: '#2f6fd6', stroke: '#fff', 'stroke-width': 2.5 }, b); svgEl('text', { y: 5, 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 700, fill: '#fff', text: n }, b); };
    if (!opts.pv) { badge(1, 470, Y + 112); badge(2, 556, Y - 112); badge(3, 300, Y - 46); badge(4, 130, Y + 34); badge(5, 802, 128); badge(6, 820, 386); }

    let lastT = 0;
    const view = {
      svg, mitral, aortic, pv: pvPlot, onSegment: null, markersOn: false,
      showKey(on) { keyG.setAttribute('display', on ? '' : 'none'); },
      update(dtReal, dtSim) {
        // chambers sized from the model's volumes (area ∝ volume)
        la.setAttribute('r', 7.4 * Math.sqrt(Math.max(1, sim.V.LA)));
        const V = Math.max(1, sim.V.LV), rx = 10.4 * Math.sqrt(V), ry = 7.9 * Math.sqrt(V), w = 12 + 22 * sim.e.LV;
        setAttrs(lvOuter, { rx: rx + w, ry: ry + w });
        setAttrs(lvCav, { rx, ry });
        // the aorta bulges with pressure (it is elastic)
        const hh = clamp(14 + sim.P.sysArt * 0.085, 12, 30);
        setAttrs(aorta, { y: Y - hh, height: 2 * hh });
        setAttrs(aoTop, { y1: Y - hh, y2: Y - hh }); setAttrs(aoBot, { y1: Y + hh, y2: Y + hh });
        sA.y = Y; // streams stay centred
        // valves move toward the state the pressures put them in
        const k = 1 - Math.exp(-dtReal / 45);
        mitral.set(lerp(mitral.open, sim.valveOpen.mitral ? 1 : 0, k));
        aortic.set(lerp(aortic.open, sim.valveOpen.aortic ? 1 : 0, k));
        sPV.update(sim.Q.pulVen, dtSim); sM.update(sim.Q.mitral, dtSim); sA.update(sim.Q.aortic, dtSim);
        // read-outs (4 per second is plenty to read)
        lastT += dtReal;
        if (lastT > 220) {
          lastT = 0;
          laTxt.textContent = `${r0(sim.P.LA)} mmHg · ${r0(sim.V.LA)} mL`;
          lvTxt.textContent = `${r0(sim.P.LV)} mmHg`;
          lvTxt2.textContent = `${r0(sim.V.LV)} mL`;
          aoTxt.textContent = `${r0(sim.P.aorta)} mmHg`;
          mState.textContent = sim.valveOpen.mitral ? 'OPEN' : 'SHUT'; mState.setAttribute('fill', sim.valveOpen.mitral ? COL.open : '#5f6675');
          aState.textContent = sim.valveOpen.aortic ? 'OPEN' : 'SHUT'; aState.setAttribute('fill', sim.valveOpen.aortic ? COL.open : '#5f6675');
        }
        lvTxt.setAttribute('y', Y - ry - w - 22); lvTxt2.setAttribute('y', Y - ry - w - 6);
        if (ladder) ladder.update();
        if (pvPlot) pvPlot.update();
        inset.update(dtReal, dtSim);
      },
      narrate() { return narrateLeftHeart(); },
    };
    return view;
  };

  // One sentence on what the left heart is doing and why, from the model's state.
  function narrateLeftHeart() {
    const P = sim.P, ph = sim.phase('left');
    const close = Math.abs(P.LA - P.LV) < 1.5, d1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
    const la = close ? d1(P.LA) : r0(P.LA), lv = close ? d1(P.LV) : r0(P.LV), ao = r0(P.sysArt);
    const manualIdle = sim.mode === 'manual' && sim.e.LV < 0.03;
    let html;
    switch (ph) {
      case 'filling':
        html = `<b>Filling.</b> LA pressure (${la}) is above LV pressure (${lv}), so blood pushes the bicuspid valve open and flows into the relaxed ventricle. The aortic valve stays shut: the aorta (${ao}) is far above the LV.`;
        if (manualIdle) html += ` Nothing is refilling the aorta, so its pressure drains away into the body.`;
        break;
      case 'isovolumetric contraction':
        html = `<b>Both valves shut.</b> The LV is squeezing: its pressure (${lv}) is above the LA (${la}), so the bicuspid valve is pushed shut, but still below the aorta (${ao}), so the aortic valve stays shut. No blood can move, so volume stays the same while pressure climbs.`;
        break;
      case 'ejection':
        html = `<b>Ejection.</b> LV pressure (${lv}) has pushed past aortic pressure, so the aortic valve is open and blood is driven into the aorta. The LV gets smaller.`;
        break;
      default:
        html = `<b>Both valves shut.</b> The LV is relaxing: its pressure (${lv}) has fallen below the aorta (${ao}), so the aortic valve snapped shut, but it is still above the LA (${la}), so the bicuspid valve stays shut. Volume stays the same while pressure falls.`;
    }
    return { html, key: ph + (manualIdle ? '-idle' : '') };
  }

  // =========================================================================
  // Traces (pressures, LV volume, valve states, heart sounds)
  // =========================================================================
  const traceCanvas = $('#trace');
  function recordSample() {
    const P = sim.P;
    app.history.push({ t: sim.t, LA: P.LA, LV: P.LV, aorta: P.aorta, RA: P.RA, RV: P.RV, pulTrunk: P.pulTrunk, VLV: sim.V.LV, mitral: sim.valveOpen.mitral, aortic: sim.valveOpen.aortic, phase: sim.phase('left') });
    const tmin = sim.t - app.window * 1.3;
    while (app.history.length && app.history[0].t < tmin) app.history.shift();
    app.curLoop.push({ V: sim.V.LV, P: P.LV, phase: sim.phase('left') });
  }
  function drawTraces() {
    const dpr = window.devicePixelRatio || 1;
    const w = traceCanvas.clientWidth, h = traceCanvas.clientHeight;
    if (traceCanvas.width !== Math.round(w * dpr) || traceCanvas.height !== Math.round(h * dpr)) { traceCanvas.width = Math.round(w * dpr); traceCanvas.height = Math.round(h * dpr); }
    const c = traceCanvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const tr = app.traces;
    const padL = 96, padR = 14, padT = 6, padB = 18;
    const valveH = tr.valves ? 34 : 0, volH = tr.volume ? 52 : 0;
    const W = app.window, t1 = Math.max(sim.t, W), t0 = t1 - W;
    const X = (t) => padL + (t - t0) / W * (w - padL - padR);
    // marker labels get their own strip above the plot, one row per overlap
    c.font = '11px system-ui, sans-serif';
    const rowEnd = [], placed = [];
    for (const m of app.markers.filter(m => m.t >= t0 && m.t <= sim.t).sort((a, b) => a.t - b.t)) {
      const x = X(m.t), tw = c.measureText(m.label).width, lx = Math.min(x + 2, w - padR - tw - 4);
      let row = 0; while (rowEnd[row] != null && rowEnd[row] > lx) row++;
      rowEnd[row] = lx + tw + 8;
      placed.push({ x, lx, row, label: m.label });
    }
    const pTop = padT + rowEnd.length * 13 + (rowEnd.length ? 3 : 0), pBot = h - padB - valveH - volH - (tr.volume ? 8 : 0);
    const vTop = pBot + 8, vBot = vTop + volH;
    const pmax = tr.pmax || 140;
    const Yp = (p) => pTop + (pmax - clamp(p, -5, pmax + 5)) / pmax * (pBot - pTop);
    const Yv = (v) => vTop + (170 - clamp(v, 20, 170)) / 150 * (vBot - vTop);
    c.font = '11px system-ui, sans-serif';
    // phase shading
    if (tr.phases) {
      let prev = null, start = null;
      const flush = (end) => { if (prev && start != null) { c.fillStyle = PHASE_FILL[prev]; c.fillRect(X(start), pTop, X(end) - X(start), (tr.volume ? vBot : pBot) - pTop); } };
      for (const s of app.history) { if (s.t < t0) continue; if (s.phase !== prev) { flush(s.t); prev = s.phase; start = s.t; } }
      flush(sim.t);
    }
    // pressure grid
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let p = 0; p <= pmax; p += (pmax > 60 ? 40 : 10)) {
      c.strokeStyle = p === 0 ? '#c9c5bb' : '#eceae3'; c.lineWidth = 1; c.beginPath(); c.moveTo(padL, Yp(p)); c.lineTo(w - padR, Yp(p)); c.stroke();
      c.fillStyle = '#8a90a0'; c.fillText(String(p), padL - 4, Yp(p));
    }
    c.save(); c.translate(12, (pTop + pBot) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.fillStyle = '#5f6675'; c.fillText('pressure (mmHg)', 0, 0); c.restore();
    // time grid
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = Math.ceil(t0 / 200) * 200; t <= t1 + 1e-6; t += 200) {
      c.strokeStyle = '#f1efe9'; c.beginPath(); c.moveTo(X(t), pTop); c.lineTo(X(t), vBot || pBot); c.stroke();
      if (t % 400 === 0) { c.fillStyle = '#8a90a0'; c.fillText((t / 1000).toFixed(1) + ' s', X(t), h - padB + 4); }
    }
    const line = (key, color, lw, Yf) => {
      c.strokeStyle = color; c.lineWidth = lw; c.beginPath(); let first = true;
      for (const s of app.history) { if (s.t < t0) continue; const x = X(s.t), y = Yf(s[key]); if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); }
      c.stroke();
    };
    for (const k of tr.pressures) line(k, COL[k], k === 'LV' || k === 'RV' ? 2.2 : 1.8, Yp);
    // LV volume
    if (tr.volume) {
      c.textAlign = 'right'; c.textBaseline = 'middle';
      for (const v of [50, 100, 150]) { c.strokeStyle = '#eceae3'; c.beginPath(); c.moveTo(padL, Yv(v)); c.lineTo(w - padR, Yv(v)); c.stroke(); c.fillStyle = '#8a90a0'; c.fillText(String(v), padL - 4, Yv(v)); }
      c.fillStyle = COL.vol; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('LV volume (mL)', padL + 4, vTop + 1);
      line('VLV', COL.vol, 2, Yv);
    }
    // valve rows and heart sounds
    if (tr.valves) {
      const rows = [['mitral', 'bicuspid open'], ['aortic', 'aortic open']];
      rows.forEach(([k, label], i) => {
        const y = h - padB - valveH + 4 + i * 14;
        c.fillStyle = '#5f6675'; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(label, padL - 4, y + 5);
        c.fillStyle = '#f1efe9'; c.fillRect(padL, y, w - padL - padR, 10);
        c.fillStyle = COL.rich;
        let start = null;
        for (const s of app.history) { if (s.t < t0) continue; if (s[k] && start == null) start = s.t; if (!s[k] && start != null) { c.fillRect(X(start), y, X(s.t) - X(start), 10); start = null; } }
        if (start != null) c.fillRect(X(start), y, X(sim.t) - X(start), 10);
      });
      c.textAlign = 'center'; c.textBaseline = 'bottom'; c.font = 'bold 11px system-ui, sans-serif';
      for (const s of app.sounds) { if (s.t < t0) continue; c.fillStyle = '#1f2430'; c.fillText(s.sound, X(s.t), h - padB - valveH + 3); }
      c.font = '11px system-ui, sans-serif';
    }
    // markers
    c.textAlign = 'left'; c.textBaseline = 'top';
    for (const m of placed) {
      const ly = padT + m.row * 13;
      c.strokeStyle = '#9ca3af'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(m.x, ly + 12); c.lineTo(m.x, vBot || pBot); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#374151'; c.fillText(m.label, m.lx + 2, ly);
    }
    // legend
    const items = tr.pressures.map(k => `<span><i style="background:${COL[k]}"></i>${TRACE_LABEL[k]}</span>`);
    if (tr.volume) items.push(`<span><i style="background:${COL.vol}"></i>LV volume</span>`);
    if (tr.phases) items.push(...Object.keys(PHASE_FILL).map(k => `<span><b class="phase-key" style="background:${PHASE_FILL[k]};border:1px solid #d9d6cc"></b>${PHASE_SHORT[k]}</span>`));
    const html = items.join('');
    const legend = $('#trace-legend'); if (legend.innerHTML !== html) legend.innerHTML = html;
  }

  // =========================================================================
  // Lesson runner wiring
  // =========================================================================
  const panel = $('#panel');
  function setPaused(p) {
    app.paused = p;
    $('#btn-pause').textContent = p ? 'Resume' : 'Pause';
    $('#paused-badge').style.display = p ? 'block' : 'none';
  }
  function setSpeed(s) {
    app.speed = s;
    const sel = $('#speed'); sel.value = String(s);
    if (sel.value !== String(s)) { const o = document.createElement('option'); o.value = String(s); o.textContent = `${Math.round(s * 100)} %`; sel.appendChild(o); sel.value = String(s); }
  }
  const DEFAULT_TRACES = { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true, phases: false };

  const host = {
    ctx: {
      sim, app,
      view: () => app.view,
      pause() { setPaused(true); },
      resume() { setPaused(false); },
      mark(label, row) { app.markers.push({ t: sim.t, label, row }); },
      resetSim,
    },
    applyStep({ step, eff, sceneChanged }) {
      if (step.reset) resetSim();
      const needView = eff.view && (eff.view !== app.viewName || step.remount || sceneChanged);
      if (needView) mountView(eff.view, eff.viewOpts || {});
      else if (eff.viewOpts && eff.viewOpts.caption != null) $('#stage-caption').textContent = eff.viewOpts.caption;
      if (sceneChanged) app.userSpeed = null;
      if (app.userSpeed == null && eff.speed) setSpeed(eff.speed);
      if (eff.mode && (sim.mode !== eff.mode || step.reset)) sim.setMode(eff.mode);
      app.traces = Object.assign({}, DEFAULT_TRACES, eff.traces || {});
      app.meters = eff.meters || null;
      renderMeters(true);
      setPaused(!!step.pause);
      if (sim.mode === 'manual' && !step.keepSqueeze) sim.squeeze(0);
    },
  };

  let runner; // created after LESSON is defined

  // =========================================================================
  // Meters overlay and badge
  // =========================================================================
  let meterClock = 0;
  function renderMeters(force) {
    const el = $('#meters');
    if (!app.meters) { el.classList.remove('on'); el.innerHTML = ''; return; }
    if (!force && meterClock < 250) return;
    meterClock = 0;
    el.classList.add('on');
    el.innerHTML = app.meters().map(([label, value, hot]) => `<div class="m${hot ? ' hot' : ''}">${label}<b>${value}</b></div>`).join('');
  }
  function updateBadge() {
    const lab = $('#badge-label'), val = $('#badge-value');
    if (sim.mode === 'manual') { lab.textContent = 'Heartbeat:'; val.textContent = 'you'; return; }
    if (sim.mode === 'single') { lab.textContent = 'Heartbeat:'; val.textContent = 'one at a time'; return; }
    const L = sim.stats.L;
    lab.textContent = `HR ${r0(sim.p.hr)}/min · CO`;
    val.textContent = L ? `${L.co.toFixed(1)} L/min` : '—';
  }

  // =========================================================================
  // Main loop
  // =========================================================================
  let srKey = null, narrClock = 1e9;
  function frame(ts) {
    if (app.lastFrame == null) app.lastFrame = ts;
    const dtReal = Math.min(50, ts - app.lastFrame); app.lastFrame = ts;
    let dtSim = 0, events = [];
    if (!app.paused) { dtSim = dtReal * app.speed; events = advanceSim(dtSim, true); }
    if (app.view && app.view.update) app.view.update(dtReal, dtSim, events);
    if (runner) runner.tick(events, dtSim);
    // narrator: visible text refreshed a few times a second; screen readers hear only phase changes
    narrClock += dtReal;
    if (app.view && app.view.narrate && narrClock > 250) {
      narrClock = 0;
      const n = app.view.narrate();
      if (n) {
        if ($('#narrator').innerHTML !== n.html) $('#narrator').innerHTML = n.html;
        if (n.key !== srKey) { srKey = n.key; $('#sr-live').textContent = n.html.replace(/<[^>]*>/g, ''); }
      }
    } else if (!app.view || !app.view.narrate) $('#narrator').innerHTML = '';
    meterClock += dtReal; renderMeters(false);
    drawTraces();
    updateBadge();
    $('#sim-clock').textContent = `t = ${(sim.t / 1000).toFixed(2)} s`;
    requestAnimationFrame(frame);
  }

  // =========================================================================
  // Wiring
  // =========================================================================
  $('#speed').addEventListener('change', (e) => { app.speed = parseFloat(e.target.value); app.userSpeed = app.speed; });
  $('#btn-pause').addEventListener('click', () => setPaused(!app.paused));
  $('#btn-sound').addEventListener('click', () => {
    app.soundOn = !app.soundOn; ensureAudio();
    $('#btn-sound').textContent = 'Sound: ' + (app.soundOn ? 'on' : 'off');
    $('#btn-sound').setAttribute('aria-pressed', String(app.soundOn));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) setPaused(!app.paused);
  });

  // =========================================================================
  // Lesson content: Part A (see docs/HEART_MODULE.md)
  // =========================================================================
  // In one-beat mode a step waiting for a valve event must never wait on a beat that has already
  // ended (e.g. after the student steps Back): start a fresh beat once the last one is over.
  function keepBeating(c) {
    if (c.stepState().done || app.paused || sim.mode !== 'single') return;
    if (sim.e.LV < 0.005 && sim.pendingVentricular == null && sim.t - sim.onset.ventricles > 600 && sim.phase('left') === 'filling') {
      sim.triggerBeat(); app.markers.push({ t: sim.t + sim.p.atrialDelay, label: 'atria contract' });
    }
  }
  // The patient whose case runs through Part A (fictional). Her numbers are the model's.
  const CASE_HTML = `<p><b>Dana Brooks, 62,</b> had a heart attack two weeks ago: a blocked coronary artery killed part of the muscle of her <b>left ventricle</b>.</p>
      <p>Today she is back in the clinic. She gets out of breath climbing one flight of stairs, and she has started sleeping propped up on three pillows because lying flat makes her breathless. Her doctor hears <b>crackles at the bottom of both lungs</b>, but her heart sounds are normal, with no murmur.</p>
      <p>Her <b>echocardiogram</b> (ultrasound of the heart) report: <i>"Left ventricle dilated. End-diastolic volume 180 mL. Ejection fraction 40 %."</i></p>
      <p>She is started on a <b>diuretic</b>, a drug that makes the kidneys remove extra fluid from the body.</p>`;
  const CASE_QUESTIONS = `<ol style="margin:4px 0 0 18px;padding:0"><li>Her heart is damaged, so why does she have a <i>lung</i> problem?</li><li>What do "EDV 180 mL" and "EF 40 %" mean, and how do they compare with a healthy heart?</li><li>How does a diuretic help her, and why could a large IV fluid bolus be dangerous for her?</li></ol>`;
  const caseNote = (html) => `<div class="case"><div class="case-h">Back to Dana</div>${html}</div>`;
  const SQUEEZE = { label: 'Hold to squeeze the ventricle', cls: 'blood', hold: true, up: () => sim.squeeze(0),
    down: (c) => { if (sim.P.sysArt < 40 && sim.e.LV < 0.05) { resetSim(); sim.setMode('manual'); } c.resume(); sim.squeeze(1); } };
  // With the heartbeat off the aorta drains into the body. If a student has been away long enough
  // for that, start the squeeze steps again from a freshly stopped heart.
  function freshStop() { if (sim.mode !== 'manual' || (sim.P.sysArt < 60 && sim.e.LV < 0.05)) { resetSim(); sim.setMode('manual'); } }
  let lvFail = {};   // state of the weakened-LV experiment, shown by the meters in later steps too
  const beatsSince = (c) => { const d = c.stepState().data; if (d.beat0 == null) d.beat0 = sim.beats; return sim.beats - d.beat0; };
  const fmt = (x, d) => (x == null ? '—' : x.toFixed(d || 0));
  const statsL = () => sim.stats.L || {};
  // Remember the current loop and stats as the "before" for a comparison.
  function saveBaseline(c, label) {
    const d = c.stepState().data;
    d.base = Object.assign({}, sim.stats.L);
    const loop = app.loops[app.loops.length - 1];
    app.ghost = loop ? { loop: loop.slice(), label: label || 'before' } : null;
    if (app.view && app.view.pv) app.view.pv.refresh();
  }
  function clearTraces() { app.history = []; app.curLoop = []; app.loops = []; app.markers = []; app.sounds = []; }

  const CIRCUIT_STOPS = [
    ['RA', 'Our cell has just left the body tissues, where it gave up its oxygen. It returns through a vena cava into which chamber? Click it.', 'The <b>right atrium</b> collects oxygen-poor blood from the whole body.'],
    ['RV', 'Next it passes the tricuspid valve into the chamber that pumps it to the lungs. Click it.', 'The <b>right ventricle</b> pumps blood to the lungs only.'],
    ['trunk', 'Through the pulmonary valve into the vessel that carries blood away from the heart toward the lungs. Click it.', 'The <b>pulmonary trunk</b>, which splits into the pulmonary arteries, one to each lung. Vessels that carry blood <i>away</i> from the heart are arteries, even when the blood in them is oxygen-poor.'],
    ['lungs', 'Here the blood picks up O₂ and gets rid of CO₂. Click it.', 'In the <b>lung capillaries</b> the blood is oxygenated. Watch the cell change colour.'],
    ['pv', 'These vessels bring the blood back to the heart from the lungs. Click them.', 'The <b>pulmonary veins</b>, two from each lung. Vessels that carry blood <i>toward</i> the heart are veins, even when the blood in them is oxygen-rich.'],
    ['LA', 'The chamber that receives blood from the lungs. Click it.', 'The <b>left atrium</b>.'],
    ['LV', 'Through the bicuspid valve into the thick-walled chamber that pumps blood to the whole body. Click it.', 'The <b>left ventricle</b>.'],
    ['aorta', 'Through the aortic valve into the large artery that carries blood to the body. Click it.', 'The <b>aorta</b>. Its branches carry blood to every organ; the blood gives up O₂ in the tissues and returns through the venae cavae: one complete loop.'],
  ];
  const ANAT_FIND = [
    ['RA', 'Blood returning from the whole body enters this chamber through the two venae cavae, one from above and one from below. Click it.', 'The <b>right atrium</b>.'],
    ['RV', 'This chamber pumps blood up into the pulmonary trunk, toward the lungs. Click it.', 'The <b>right ventricle</b>. It forms most of the front of the heart.'],
    ['LA', 'This chamber receives blood coming back from the lungs through the pulmonary veins. Click it.', 'The <b>left atrium</b>. It sits at the back of the heart, so in this view it appears high up, behind the great arteries.'],
    ['LV', 'This chamber has the thickest wall. It pumps blood into the aorta for the whole body, and forms the tip of the heart (the apex). Click it.', 'The <b>left ventricle</b>. Its wall is about three times as thick as the right ventricle\'s.'],
    ['tricuspid', 'Each atrium empties into the ventricle below it through an <b>atrioventricular (AV) valve</b>. Click the AV valve on the right side of the heart.', 'The <b>tricuspid valve</b> (three flaps), between the right atrium and right ventricle.'],
    ['mitral', 'Now click the AV valve on the left side of the heart.', 'The <b>bicuspid valve</b> (two flaps), between the left atrium and left ventricle.'],
    ['pulmonary', 'Each ventricle empties into a large artery through a <b>semilunar valve</b>. Click the one at the exit of the right ventricle.', 'The <b>pulmonary valve</b>, at the start of the pulmonary trunk.'],
    ['aortic', 'Click the semilunar valve at the exit of the left ventricle.', 'The <b>aortic valve</b>, at the start of the aorta. It sits just behind the pulmonary trunk.'],
  ];
  const STOP_NAME = { RA: 'the right atrium', RV: 'the right ventricle', trunk: 'the pulmonary trunk', lungs: 'the lungs', pv: 'the pulmonary veins', LA: 'the left atrium', LV: 'the left ventricle', aorta: 'the aorta', body: 'the body tissues', cava: 'the venae cavae', tricuspid: 'the tricuspid valve', mitral: 'the bicuspid valve', pulmonary: 'the pulmonary valve', aortic: 'the aortic valve' };

  const LESSON = [
    // ------------------------------------------------------------- 1. the real heart
    {
      id: 'anatomy', title: 'The real heart', speed: 0.5,
      steps: [
        {
          view: 'circuit', viewOpts: { layout: 'anatomy', labels: [], caption: 'A real heart, cut in a frontal section and seen from the front. It is beating.' }, reset: true, mode: 'sinus', remount: true,
          traces: { pressures: ['aorta', 'pulTrunk'], volume: false, valves: false },
          title: 'Why this matters: a patient',
          enter: (c) => { c.view().A.setLabels([]); c.view().highlight(null); c.view().onStop = null; },
          text: `<div class="case"><div class="case-h">Dana's case</div>${CASE_HTML}</div>
                 <p>By the end of this lab you will be able to answer three questions about Dana (they are on your worksheet):</p>${CASE_QUESTIONS}
                 <p style="margin-top:8px">You can reopen her case at any time with the <b>Dana's case</b> button at the top.</p>`,
          question: { prompt: 'Before you start, make a guess: why might a damaged heart make someone short of breath?', options: [
            { t: 'Blood backs up into the lungs', ok: true, fb: 'Keep your guess in mind. You will test it in scene 6.' },
            { t: 'The heart sends less oxygen to the body, so the person breathes harder', ok: true, fb: 'Keep your guess in mind. You will test it in scene 6.' },
            { t: 'The heart attack also damaged the lungs', ok: true, fb: 'Keep your guess in mind. You will test it in scene 6.' },
          ] },
        },
        {
          view: 'circuit',
          title: 'Meet the heart',
          enter: (c) => { c.view().A.setLabels([]); c.view().highlight(null); c.view().onStop = null; },
          text: `<p>This is the heart as you would see it in a textbook figure or a lab model, cut open from front to back (a <b>frontal section</b>). The lungs sit on either side.</p>
                 <p>It is the simulation, not a picture: the valves open and shut because the model's pressures push them, and the white dots move with the model's blood flow.</p>`,
          question: { prompt: 'The person is facing you. Which side of the picture is the person\'s left side?', options: [
            { t: 'Your right', ok: true, fb: 'Anatomical drawings show the body facing you, like a person standing in front of you. Their left is on your right. So the "left" ventricle is on the right of the picture.' },
            { t: 'Your left', fb: 'Imagine the person standing in front of you, facing you, and raising their left hand. Which side of your view is it on?' },
          ] },
        },
        ...ANAT_FIND.map(([part, prompt, explain], i) => ({
          view: 'circuit', title: `Find the parts (${i + 1} of ${ANAT_FIND.length})`,
          text: `<p>${prompt}</p>`,
          enter: (c) => {
            const v = c.view(), found = ANAT_FIND.slice(0, i).map(f => f[0]);
            v.A.setLabels(found); v.highlight(null);
            v.onStop = (s) => {
              if (s === part) { v.highlight(part); v.A.setLabels(found.concat(part)); c.status(`<b>Yes: ${STOP_NAME[part]}.</b> ${explain}`, true); c.complete(); }
              else c.status(`That is ${STOP_NAME[s] || s}. Try again.`, false);
            };
          },
          waitFor: () => false, waitHint: 'Click the structure described',
        })),
        {
          view: 'circuit', title: 'Watch the valves',
          enter: (c) => { c.view().A.setLabels('all'); c.view().highlight(null); c.view().onStop = null; },
          text: `<p>All four valves are labelled now. Watch them for a few beats; the narrator under the picture says what they are doing.</p>`,
          question: { prompt: 'How do the valves behave as the heart beats?', options: [
            { t: 'The two AV valves open and shut together, and so do the two semilunar valves; when one pair is open the other is shut', ok: true, fb: 'Both sides of the heart beat at the same moment. When the ventricles relax, the AV valves are open and they fill; when they squeeze, the semilunar valves are open and they empty. In between, for a moment, all four are shut.' },
            { t: 'The right side beats first, then the left', fb: 'Watch the tricuspid and bicuspid valves together: they move at the same moment.' },
            { t: 'All four valves open and shut together', fb: 'Watch an AV valve and a semilunar valve on the same side: are they ever open at the same time?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 2. two pumps, one loop
    {
      id: 'loop', title: 'Two pumps, one loop', speed: 0.5,
      steps: [
        ...CIRCUIT_STOPS.map(([stop, prompt, explain], i) => ({
          view: 'circuit', viewOpts: { layout: 'anatomy', labels: 'all', caption: 'Follow one red blood cell through the heart. Click the next stop.' }, mode: 'sinus', reset: i === 0,
          traces: { pressures: ['aorta', 'pulTrunk'], volume: false, valves: false },
          title: `Follow a red blood cell (${i + 1} of ${CIRCUIT_STOPS.length})`,
          text: `<p>${prompt}</p>`,
          enter: (c) => {
            const v = c.view();
            if (v.layout() !== 'anatomy') v.setLayout('anatomy');
            v.A.setLabels('all');
            v.showToken(i === 0 ? 'body' : CIRCUIT_STOPS[i - 1][0]);
            v.highlight(null);
            v.onStop = (s) => {
              if (s === stop) { v.highlight(stop); v.showToken(stop); c.status(`<b>Yes: ${STOP_NAME[stop]}.</b> ${explain}`, true); c.complete(); }
              else c.status(`That is ${STOP_NAME[s] || s}. Try again.`, false);
            };
          },
          waitFor: () => false, waitHint: 'Click the next stop on the heart',
        })),
        {
          view: 'circuit', title: 'From the real heart to a diagram',
          enter: (c) => { const v = c.view(); v.onStop = null; v.highlight(null); c.stepState().data.sawDiagram = v.layout() === 'diagram'; },
          text: `<p>Your cell went body → right heart → lungs → left heart → body. In the real heart that route twists around itself, so most diagrams pull the heart apart into boxes.</p>
                 <p>Watch the chambers slide into a diagram, then switch back and forth until you can match each box to the real chamber.</p>`,
          actions: [
            { label: 'Simplify into a diagram', cls: 'primary', run: (c) => c.view().morphTo('diagram', 3200) },
            { label: 'Back to the real heart', run: (c) => c.view().morphTo('anatomy', 3200) },
          ],
          tick: (c) => { if (c.view().layout && c.view().layout() === 'diagram') c.stepState().data.sawDiagram = true; },
          question: { prompt: 'In both pictures, what joins each atrium to the ventricle below it?', options: [
            { t: 'An AV valve (tricuspid on the right, bicuspid on the left)', ok: true, fb: 'In the diagram the atrium sits directly on its ventricle with the AV valve between them, just as in the real heart. The diagram changes the shapes and spacing, not the connections.' },
            { t: 'Nothing: each atrium is a separate chamber with its own exit', fb: 'Switch back to the real heart and look where the bottom of each atrium opens.' },
            { t: 'The septum', fb: 'The septum is the wall that separates the right side from the left. It joins nothing. What sits at the opening between an atrium and its ventricle?' },
          ] },
          waitFor: (c) => c.stepState().data.sawDiagram, waitHint: 'Simplify the heart into the diagram',
        },
        {
          view: 'circuit', title: 'Arteries, veins and oxygen',
          enter: (c) => { const v = c.view(); if (v.layout() !== 'diagram') v.setLayout('diagram'); v.showToken('aorta'); v.highlight('pv'); v.onStop = null; },
          text: `<p>Your cell went body → right heart → lungs → left heart → body.</p>`,
          question: { prompt: 'Compared with blood in the venae cavae, blood in the pulmonary veins carries…', options: [
            { t: 'much more oxygen', ok: true, fb: 'The pulmonary veins carry the most oxygen-rich blood in the body; it has just left the lungs. "Vein" means the vessel carries blood <i>toward</i> the heart. It says nothing about oxygen.' },
            { t: 'less oxygen, because veins carry deoxygenated blood', fb: 'A common rule of thumb that fails here. Veins are defined by direction (toward the heart), not by oxygen. Where has this blood just been?' },
            { t: 'about the same amount of oxygen', fb: 'Between the venae cavae and the pulmonary veins the blood passes through the lungs. What happens there?' },
          ] },
        },
        {
          view: 'circuit', title: 'Which side pumps more?',
          enter: (c) => { const v = c.view(); if (v.layout() !== 'diagram') v.setLayout('diagram'); v.highlight(null); },
          meters: () => [['Right ventricle → lungs', `${fmt((sim.stats.R || {}).co, 1)} L/min`], ['Left ventricle → body', `${fmt((sim.stats.L || {}).co, 1)} L/min`]],
          text: `<p>The two sides are pumps <b>in series</b>: everything the right ventricle pumps out must, a few seconds later, arrive at the left ventricle.</p>`,
          question: { prompt: 'Over a minute, which side pumps more blood?', options: [
            { t: 'Both pump the same volume', ok: true, fb: 'Look at the meters. If one side pumped even 1 mL more per beat, about 75 mL a minute would pile up in the lungs or the body. In scene 6 you will see what stops that from happening.' },
            { t: 'The left side, because it is bigger and stronger', fb: 'Its wall is thicker, but look at the meters on the diagram: the volumes match. What would happen to the lungs if the right side pumped less than the left for an hour?' },
            { t: 'The right side, because it has to fill the lungs', fb: 'Look at the meters on the diagram. Any mismatch would steadily empty or flood one circuit.' },
          ] },
        },
        {
          view: 'circuit', title: 'Same volume, different job',
          enter: (c) => { const v = c.view(); if (v.layout() !== 'diagram') v.setLayout('diagram'); v.highlight(null); },
          meters: () => [['Pulmonary trunk', `${r0((sim.stats.R || {}).sys || 0)}/${r0((sim.stats.R || {}).dia || 0)} mmHg`], ['Aorta', `${r0((sim.stats.L || {}).sys || 0)}/${r0((sim.stats.L || {}).dia || 0)} mmHg`]],
          text: `<p>The trace at the bottom shows the pressure in the two arteries leaving the heart: the <b>aorta</b> and the <b>pulmonary trunk</b>.</p>`
            + caseNote(`Dana's heart attack damaged her <b>left</b> ventricle: the pump that has to generate the high pressure for the whole body. Her right ventricle is fine. Keep the two-pumps-in-series idea in mind; it is the key to her breathlessness.`),
          question: { prompt: 'Both ventricles pump the same volume. Why is the left ventricle\'s wall about three times thicker?', options: [
            { t: 'It must push blood out against a much higher pressure', ok: true, fb: 'About 120/80 mmHg in the aorta vs about 25/10 in the pulmonary trunk. The lungs are close by and offer little resistance; the rest of the body offers much more. Same volume, much more force.' },
            { t: 'It pumps more blood per beat', fb: 'Check the previous answer: the volumes are the same. Look at the two pressure traces instead.' },
            { t: 'It has to pump blood farther, so it needs to pump faster', fb: 'Both ventricles beat together, at the same rate. Look at the pressure each one has to overcome.' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 2. pressure moves blood
    {
      id: 'pressure', title: 'Pressure moves blood', speed: 0.25,
      steps: [
        {
          view: 'circuit', viewOpts: { layout: 'anatomy', labels: 'all', caption: 'The left side of the heart, highlighted.' }, reset: true, mode: 'sinus', remount: true, speed: 0.5,
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true },
          title: 'Just the left side',
          enter: (c) => { const v = c.view(); v.A.dimRight(true); v.onStop = null; c.stepState().data.sawLine = false; },
          text: `<p>From here on we follow only the <b>left</b> side: pulmonary veins → left atrium → bicuspid valve → left ventricle → aortic valve → aorta. (The right side works the same way, at lower pressures.)</p>
                 <p>To compare the pressures along this route, we straighten it out into a line.</p>`,
          actions: [{ label: 'Straighten out the left side', cls: 'primary', run: (c) => c.view().morphTo('line', 3000) }],
          tick: (c) => { if (c.view().layout && c.view().layout() === 'line') c.stepState().data.sawLine = true; },
          question: { prompt: 'Going from the lungs to the aorta, which valves does the blood pass, in order?', options: [
            { t: 'Bicuspid, then aortic', ok: true, fb: 'Into the left atrium, through the bicuspid valve into the left ventricle, then through the aortic valve into the aorta.' },
            { t: 'Aortic, then bicuspid', fb: 'Follow the highlighted route from the pulmonary veins: which chamber comes first?' },
            { t: 'Tricuspid, then pulmonary', fb: 'Those are the valves of the right side, faded out here.' },
          ] },
          waitFor: (c) => c.stepState().data.sawLine, waitHint: 'Straighten out the left side',
        },
        {
          view: 'heart', viewOpts: { key: true, caption: 'The left side of the heart, straightened into a line, beating. Numbers: see the panel.' }, reset: true, mode: 'sinus', remount: true, speed: 0.25,
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true },
          title: 'How to read this picture',
          enter: (c) => c.view().showKey(true),
          text: `<p>This is the same route you just straightened: lungs → <b>LA</b> → bicuspid valve → <b>LV</b> → aortic valve → aorta. The heart is beating. The numbers on the picture:</p>
                 <p><b>1 · Chamber size = how much blood is inside.</b> The cavity is drawn to scale with the model's volume (the mL number above it). When blood leaves, it shrinks.</p>
                 <p><b>2 · The muscle wall.</b> The pink ring is the ventricle's muscle. It thickens each time the muscle squeezes.</p>
                 <p><b>3 · Valves.</b> Two flaps each. They are drawn open or shut (and labelled OPEN/SHUT) exactly as the model has them.</p>
                 <p><b>4 · White dots = blood moving.</b> They move only where blood is flowing, at a speed set by the flow.</p>
                 <p><b>5 · Pressure bars.</b> The pressure (mmHg) in the left atrium, left ventricle and aorta. Pressure is how hard the blood is being pushed.</p>
                 <p><b>6 · The valve rule.</b> Between two bars, the arrow points from the higher pressure to the lower. A valve opens when that push is forward and shuts when it is backward.</p>
                 <p>The graph at the bottom records the same pressures and the LV volume over time, so you can look back at what just happened. (The speed menu at the top slows things down.)</p>`,
          question: { prompt: 'Watch a few beats, using the pressure bars (5) and the arrow between them (6). When is the aortic valve open?', options: [
            { t: 'Whenever the LV is at its fullest', fb: 'Watch the LV size (1) and the aortic valve together: the LV is fullest just before the valve opens, while the valve is still shut. Now watch the LV and aorta bars.' },
            { t: 'Only while the LV bar is higher than the aorta bar', ok: true, fb: 'While the LV pressure is above the aorta\'s, the push on the valve is forward and blood flows out. The rest of the time the aorta pushes back and holds the valve shut. Next, you will make that happen yourself.' },
            { t: 'Whenever the muscle wall is relaxed', fb: 'Watch the wall (2): the aortic valve is open while the wall is thick, not thin. What do the LV and aorta bars show at that moment?' },
          ] },
        },
        {
          view: 'heart', viewOpts: { caption: 'The heartbeat is switched off and the clock is paused: you are the heart muscle.' }, reset: true, mode: 'manual', pause: true,
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true },
          title: 'You are the heart muscle',
          enter: (c) => c.view().showKey(false),
          text: `<p>Now the heartbeat has been switched off, just as the ventricle finished filling, and the clock is <b>paused</b>, so nothing changes until you act.</p>
                 <p>In the next steps <b>you</b> are the heart muscle: holding a button makes the ventricle contract. First, look at the bicuspid valve: it is open.</p>`,
          question: { prompt: 'With the ventricle relaxed, what is holding the bicuspid valve open?', options: [
            { t: 'The papillary muscles and chordae tendineae pull the flaps open', fb: 'The chordae only stop the flaps from blowing back into the atrium when the ventricle squeezes. They do not open the valve. Look at the pressure bars.' },
            { t: 'The atrium is contracting and pushing it open', fb: 'Nothing is contracting right now; the heartbeat is off. Yet the valve is open. Look at the pressure bars for the reason.' },
            { t: 'Atrial pressure is slightly higher than ventricular pressure, so blood pushes the flaps open', ok: true, fb: 'Valves have no muscle of their own: they are flaps that blood pushes open or shut. The LA bar is a little higher than the LV bar, and the arrow between them points forward.' },
            { t: 'A nerve signal holds it open', fb: 'Valves have no nerves or muscle that move them. Look at the pressure bars.' },
          ] },
        },
        {
          view: 'heart', title: 'Predict, then squeeze', pause: true,
          enter: () => freshStop(),
          text: `<p>When you <b>press and hold</b> the button below, the ventricle's muscle contracts (its wall thickens) and the pressure inside the LV rises. The clock starts when you press it.</p>`,
          question: { prompt: 'When you start squeezing and LV pressure begins to rise, which valve moves first?', options: [
            { t: 'The aortic valve opens', fb: 'Only when LV pressure exceeds aortic pressure. Look at the bars: how far apart are LV and aorta now?' },
            { t: 'Neither: blood immediately flows into the aorta', fb: 'The aortic valve is held shut by aortic pressure of about 80 mmHg. How high is the LV now?' },
            { t: 'The bicuspid valve is pushed shut', ok: true, fb: 'As soon as LV pressure rises above LA pressure, blood is pushed backward and slams the bicuspid flaps shut. Now hold the button and watch.' },
            { t: 'Both valves open', fb: 'Squeezing raises LV pressure. Compare it with the pressure on each side.' },
          ] },
          actions: [SQUEEZE],
          tick: (c, events) => {
            const d = c.stepState().data; d.seq = d.seq || [];
            for (const e of events) if (e.type === 'valve' && e.side === 'left') d.seq.push(`${e.valve}${e.open ? '+' : '-'}`);
          },
          waitFor: (c) => { const s = (c.stepState().data.seq || []).join(' '); return s.includes('mitral- aortic+'); },
          waitHint: 'Hold the squeeze button until blood leaves the ventricle',
          status: (c) => c.stepState().done ? '<b>Observed:</b> the bicuspid valve shut first; the aortic valve opened only when LV pressure passed aortic pressure. Then blood left.' : `LV ${r0(sim.P.LV)} mmHg · aorta ${r0(sim.P.sysArt)} mmHg. Press and hold the button.`,
        },
        {
          view: 'heart', title: 'Both valves shut', pause: true,
          enter: () => freshStop(),
          text: `<p>Between the bicuspid valve shutting and the aortic valve opening there was a moment with <b>both valves shut</b>. Squeeze again and watch the LV size and the volume trace during that moment.</p>`,
          actions: [SQUEEZE],
          question: { prompt: 'While both valves are shut and the muscle squeezes, the LV…', options: [
            { t: 'gets smaller as blood leaves', fb: 'Where could the blood go? Both exits are shut. Look at the volume trace during that moment.' },
            { t: 'keeps the same volume while its pressure climbs', ok: true, fb: 'Blood cannot be compressed and has nowhere to go, so the squeeze turns entirely into pressure. This is <b>isovolumetric contraction</b> ("same volume").' },
            { t: 'loses pressure', fb: 'The muscle is squeezing on a fixed amount of blood. Look at the LV pressure trace.' },
          ] },
        },
        {
          view: 'heart', title: 'Let go', pause: true,
          enter: () => freshStop(),
          text: `<p>Squeeze until blood is leaving, then <b>let go</b> and watch which valve moves.</p>`,
          actions: [SQUEEZE],
          question: { prompt: 'When the muscle relaxes, which valve shuts first?', options: [
            { t: 'The bicuspid valve', fb: 'It is already shut. What has to happen before it can open again?' },
            { t: 'Neither: both stay open', fb: 'Check the pressure bars when you let go.' },
            { t: 'The aortic valve, because LV pressure falls below aortic pressure', ok: true, fb: 'The aorta is stretched full of blood at high pressure. As the LV relaxes its pressure drops below that, blood starts back toward the ventricle and snaps the aortic valve shut. Test it.' },
          ] },
          tick: (c, events) => {
            const d = c.stepState().data; d.seq = d.seq || [];
            for (const e of events) if (e.type === 'valve' && e.side === 'left') d.seq.push(`${e.valve}${e.open ? '+' : '-'}`);
          },
          waitFor: (c) => (c.stepState().data.seq || []).join(' ').includes('aortic- mitral+'),
          waitHint: 'Squeeze, then let go, and watch both valves',
          status: (c) => c.stepState().done ? '<b>Observed:</b> aortic valve shut, then a moment with both valves shut while the pressure fell (<b>isovolumetric relaxation</b>), then the bicuspid valve was pushed open and filling restarted.' : `LV ${r0(sim.P.LV)} · aorta ${r0(sim.P.sysArt)} · LA ${r0(sim.P.LA)} mmHg`,
        },
        {
          view: 'heart', title: 'Between beats',
          text: `<p>Stop squeezing for a few seconds and watch the aortic pressure bar.</p>`,
          question: { prompt: 'Why does aortic pressure fall while the heart is not squeezing?', options: [
            { t: 'Blood keeps running out of the aorta into the body, and nothing is refilling it', ok: true, fb: 'The aorta is elastic: stretched by each beat, it keeps pushing blood on between beats. That is why diastolic pressure is not zero. But without the next beat it runs down. A real heart refills it about 75 times a minute.' },
            { t: 'The aorta is a muscle that relaxes', fb: 'Its wall stretches and recoils; it does not pump. Where is the blood going?' },
            { t: 'Blood leaks back into the ventricle', fb: 'The aortic valve is shut (look at the diagram), so no blood goes back. Follow the flow the other way.' },
          ] },
          waitFor: () => sim.P.sysArt < 60 && sim.e.LV < 0.05, waitHint: 'Stop squeezing and watch the aortic pressure fall below 60 mmHg',
          status: () => `Aortic pressure ${r0(sim.P.sysArt)} mmHg`,
        },
      ],
    },
    // ------------------------------------------------------------- 3. the cardiac cycle
    {
      id: 'cycle', title: 'Building the cardiac cycle', speed: 0.2,
      steps: [
        {
          view: 'heart', viewOpts: { caption: 'The heart now squeezes on its own, one beat each time you press Beat.' }, reset: true, mode: 'single', remount: true,
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true },
          title: 'One beat in slow motion',
          enter: (c) => { clearTraces(); c.stepState().data.armed = false; },
          text: `<p>Each beat the <b>atria contract first</b>, topping up the ventricles, and about 0.15 s later the <b>ventricles</b> contract. We will stop the clock at each valve event.</p>`,
          question: { prompt: 'Once the ventricle starts to squeeze, which valve event comes first?', options: [
            { t: 'The bicuspid valve shuts', ok: true, fb: 'Exactly as when you squeezed the ventricle in scene 3. Press Beat and watch.' },
            { t: 'The aortic valve opens', fb: 'Remember scene 3: LV pressure first has to pass the atrium, then the aorta.' },
            { t: 'The bicuspid valve opens', fb: 'It is already open during filling. What does rising LV pressure do to it?' },
          ] },
          actions: [{ label: 'Beat', cls: 'blood', run: (c) => { const d = c.stepState().data; if (d.armed || sim.e.LV > 0.01 || sim.pendingVentricular != null) return; d.armed = true; sim.triggerBeat(); app.markers.push({ t: sim.t + sim.p.atrialDelay, label: 'atria contract' }); c.resume(); } }],
          tick: (c, events) => { const d = c.stepState().data; if (d.armed && !c.stepState().done && events.some(e => e.type === 'valve' && e.valve === 'mitral' && !e.open)) { c.pause(); c.mark('bicuspid shuts (S1)'); c.complete(); } },
          waitFor: () => false, waitHint: 'Press Beat',
          status: (c) => c.stepState().done ? '<b>Paused:</b> the bicuspid valve has just shut. You heard the first heart sound, S1 ("lub").' : '',
        },
        {
          view: 'heart', title: 'Both valves shut, muscle squeezing', pause: true,
          text: `<p>The clock is paused just after the bicuspid valve shut.</p>`,
          question: { prompt: 'What happens next, before anything else changes?', options: [
            { t: 'LV pressure climbs at constant volume until it passes aortic pressure', ok: true, fb: 'Isovolumetric contraction, as you saw when you squeezed the ventricle in scene 3. Resume to see it.' },
            { t: 'LV volume falls as blood is ejected', fb: 'Not yet: the aortic valve is still shut. Look at the aortic pressure the LV has to beat.' },
            { t: 'The atrium refills the ventricle', fb: 'The bicuspid valve is shut now; nothing more can enter.' },
          ] },
          actions: [{ label: 'Resume', cls: 'primary', run: (c) => c.resume() }],
          tick: (c, events) => { keepBeating(c); if (!c.stepState().done && events.some(e => e.type === 'valve' && e.valve === 'aortic' && e.open)) { c.pause(); c.mark('aortic opens'); c.complete(); } },
          waitFor: () => false, waitHint: 'Resume and wait for the next valve event',
          status: (c) => c.stepState().done ? '<b>Paused:</b> the aortic valve just opened. Look how flat the volume trace was until now.' : '',
        },
        {
          view: 'heart', title: 'Ejection', pause: true,
          question: { prompt: 'Why did the aortic valve open at exactly this moment?', options: [
            { t: 'LV pressure rose just past aortic pressure', ok: true, fb: 'Look at where the black LV trace crosses the red aortic trace. From now on the two move together while blood is ejected.' },
            { t: 'The ventricle reached its largest volume', fb: 'The volume has been at its largest since the bicuspid valve shut. What changed just now?' },
            { t: 'The muscle reached full strength', fb: 'The squeeze is still building. The valve does not know about the muscle, only the pressures on its two sides.' },
          ] },
          actions: [{ label: 'Resume', cls: 'primary', run: (c) => c.resume() }],
          tick: (c, events) => { keepBeating(c); if (!c.stepState().done && events.some(e => e.type === 'valve' && e.valve === 'aortic' && !e.open)) { c.pause(); c.mark('aortic shuts (S2)'); c.complete(); } },
          waitFor: () => false, waitHint: 'Resume and wait for the next valve event',
          status: (c) => c.stepState().done ? '<b>Paused:</b> the aortic valve has just shut. That was S2 ("dub"). Look for the small notch in the aortic trace.' : '',
        },
        {
          view: 'heart', title: 'The aortic valve shuts', pause: true,
          question: { prompt: 'What shut the aortic valve?', options: [
            { t: 'The relaxing LV\'s pressure fell below aortic pressure, and a little backflow snapped the cusps shut', ok: true, fb: 'That brief backflow is the small dip in the aortic trace, the <b>dicrotic notch</b> (incisura). After it, the elastic aorta keeps pushing blood to the body while the heart rests.' },
            { t: 'The ventricle ran out of blood', fb: 'Look at the volume trace: about 50 mL is still in the LV. Look at the two pressure traces instead.' },
            { t: 'A muscle in the aortic wall closed it', fb: 'Valves have no muscle. Look at which pressure is higher now.' },
          ] },
          actions: [{ label: 'Resume', cls: 'primary', run: (c) => c.resume() }],
          tick: (c, events) => { keepBeating(c); if (!c.stepState().done && events.some(e => e.type === 'valve' && e.valve === 'mitral' && e.open)) { c.pause(); c.mark('bicuspid opens'); c.complete(); } },
          waitFor: () => false, waitHint: 'Resume and wait for the next valve event',
          status: (c) => c.stepState().done ? '<b>Paused:</b> the bicuspid valve has just opened. In between, both valves were shut while the pressure fell: isovolumetric relaxation.' : '',
        },
        {
          view: 'heart', title: 'Filling again', pause: true,
          question: { prompt: 'The bicuspid valve just opened. What happens to LV volume now?', options: [
            { t: 'It rises quickly at first, with no help from the atrium', ok: true, fb: 'Blood that piled up in the atrium and lung veins during systole rushes in as soon as the valve opens (<b>rapid filling</b>). The atrial contraction at the end of the cycle only tops it up (about 10–20 % of the final volume at rest).' },
            { t: 'It stays the same until the atrium contracts', fb: 'Resume and watch the volume trace: most filling happens long before the atrium contracts.' },
            { t: 'It falls', fb: 'Blood is now flowing from the atrium into the ventricle. Which way must the volume go?' },
          ] },
          actions: [{ label: 'Resume', cls: 'primary', run: (c) => c.resume() }],
          waitFor: (c) => { const d = c.stepState().data; if (d.t0 == null) d.t0 = sim.t; return sim.t > d.t0 + 300 && !app.paused; },
          waitHint: 'Resume and watch the ventricle fill',
        },
        {
          view: 'heart', title: 'Heart sounds',
          text: `<p>Each beat you heard two sounds: <b>S1</b> ("lub") and <b>S2</b> ("dub"). They are marked under the valve bars at the bottom.</p>`
            + caseNote(`Dana's doctor heard a normal S1 and S2 and no murmur (the whooshing sound of blood leaking through a valve that does not shut, or squeezing through one that does not open fully). Her valves open and shut normally. Her problem is the muscle.`),
          question: { prompt: 'What makes the two heart sounds?', options: [
            { t: 'Valves shutting: S1 the AV valves (bicuspid, tricuspid), S2 the semilunar valves (aortic, pulmonary)', ok: true, fb: 'Sudden closure sets the blood and valve leaflets vibrating. Valves opening is silent in a healthy heart, which is why there are two sounds per beat and not four.' },
            { t: 'The atria and then the ventricles contracting', fb: 'Look at where S1 and S2 sit on the traces: exactly where a valve shut, not where contraction began.' },
            { t: 'Valves opening', fb: 'Check the marks: S1 sits where the bicuspid valve shut, S2 where the aortic valve shut.' },
          ] },
        },
        {
          view: 'heart', title: 'The whole cycle', mode: 'sinus',
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true, phases: true },
          enter: () => { sim.setMode('sinus'); },
          text: `<p>Now the heart beats continuously at 75 per minute. The four phases are shaded on the traces: <b>filling</b>, <b>isovolumetric contraction</b>, <b>ejection</b>, <b>isovolumetric relaxation</b>. Systole = the two contraction-side phases; diastole = relaxation plus filling.</p>`,
          question: { prompt: 'At rest, which phase takes the longest?', options: [
            { t: 'Filling', ok: true, fb: 'About half of every beat at rest. That spare filling time is what a fast heart rate eats into (Part B).' },
            { t: 'Ejection', fb: 'Compare the widths of the shaded bands on the traces.' },
            { t: 'Isovolumetric contraction', fb: 'Compare the widths of the shaded bands: this one is very short.' },
          ] },
          waitFor: (c) => beatsSince(c) >= 2, waitHint: 'Watch two full beats',
        },
      ],
    },
    // ------------------------------------------------------------- 4. pressure–volume loop
    {
      id: 'pv', title: 'How much per beat?', speed: 0.25,
      steps: [
        {
          view: 'heart', viewOpts: { pv: true, caption: 'Left: the left heart. Right: LV pressure plotted against LV volume, drawn live.' }, reset: true, mode: 'sinus', remount: true,
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true, phases: true },
          title: 'Each beat draws a loop',
          text: `<p>Plot LV pressure against LV volume and every beat traces a closed loop: the red dot moves around it once per beat. The newest complete loop is black; older ones grey.</p>`,
          waitFor: (c) => app.loops.length >= 2, waitHint: 'Watch two beats',
        },
        ...[
          ['filling', 'Volume increases while pressure stays low: the ventricle is filling. Click that side of the loop.'],
          ['isovolumetric contraction', 'Pressure shoots up but volume does not change: both valves are shut while the muscle squeezes. Click that side.'],
          ['ejection', 'Volume falls while pressure stays high: blood is leaving through the aortic valve. Click that side.'],
          ['isovolumetric relaxation', 'Pressure falls with no change in volume: the muscle relaxes with both valves shut. Click that side.'],
        ].map(([ph, prompt], i) => ({
          view: 'heart', title: `Read the loop (${i + 1} of 4)`,
          text: `<p>${prompt}</p>`,
          enter: (c) => {
            const v = c.view(); v.pv.highlight(null);
            v.onSegment = (s) => {
              if (s === ph) { v.pv.highlight(ph, '#2f9e5b'); c.status(`<b>Yes: ${ph}.</b>`, true); c.complete(); }
              else { v.pv.highlight(s, '#d24b3f'); c.status(`That side is <b>${s}</b>. Which way does volume change there, and which way pressure?`, false); }
            };
          },
          waitFor: () => false, waitHint: 'Click the matching side of the loop',
        })),
        {
          view: 'heart', title: 'Why is filling so cheap?',
          enter: (c) => { c.view().onSegment = null; c.view().pv.highlight('filling'); },
          question: { prompt: 'Along the bottom of the loop the ventricle gains about 70 mL, yet its pressure rises only a few mmHg. Why?', options: [
            { t: 'The relaxed muscle is very stretchy (compliant), so it fills without much pressure', ok: true, fb: 'A relaxed ventricle is like a soft balloon. That is why a low venous pressure of a few mmHg is enough to fill it. If the wall gets stiff (as in some heart diseases), filling needs much higher pressure.' },
            { t: 'The bicuspid valve is shut', fb: 'During filling the bicuspid valve is open. That is how the blood gets in.' },
            { t: 'The atrium sucks blood back out', fb: 'Blood is moving from atrium to ventricle the whole time. Think about the ventricle wall.' },
          ] },
        },
        {
          view: 'heart', title: 'Measure the stroke volume',
          enter: (c) => { c.view().markersOn = true; c.view().pv.refresh(); c.view().pv.highlight(null); },
          text: `<p>The dashed blue lines mark <b>EDV</b> (end-diastolic volume: the fullest the ventricle gets) and <b>ESV</b> (end-systolic volume: what is left after ejection). Read both off the volume axis (gridlines every 10 mL).</p>
                 <p><b>Stroke volume</b> SV = EDV − ESV, the volume ejected per beat.</p>`,
          question: { type: 'number', prompt: 'Stroke volume of this heart:', unit: 'mL', recordAs: 'SV',
            answer: () => statsL().edv - statsL().esv, tol: 6,
            explain: (c, v) => `This heart ejects about ${r0(statsL().edv - statsL().esv)} mL per beat (EDV ≈ ${r0(statsL().edv)} mL, ESV ≈ ${r0(statsL().esv)} mL).`,
            hint: (c, v, t) => v > 140 ? 'That is larger than the whole ventricle. Subtract ESV from EDV.' : 'Read EDV (right dashed line) and ESV (left dashed line) on the volume axis, then subtract.' },
        },
        {
          view: 'heart', title: 'Ejection fraction',
          text: `<p><b>Ejection fraction</b> EF = SV ÷ EDV: the fraction of the blood in the full ventricle that each beat pushes out. Clinicians measure it with ultrasound; a healthy EF is about 55–70 %.</p>`,
          question: { type: 'number', prompt: 'Ejection fraction of this heart:', unit: '%', recordAs: 'EF',
            answer: () => 100 * (statsL().edv - statsL().esv) / statsL().edv, tol: 5,
            explain: () => `EF ≈ ${r0(100 * (statsL().edv - statsL().esv) / statsL().edv)} %. Even a healthy heart leaves about 40 % of its blood behind each beat: a reserve it can use when it squeezes harder.`,
            hint: (c, v) => v < 1.5 ? 'Give it as a percentage (e.g. 0.6 → 60 %).' : 'Divide your stroke volume by EDV and multiply by 100.' },
        },
        {
          view: 'heart', title: 'Dana\'s echo report',
          text: caseNote(`Her echocardiogram: <i>"End-diastolic volume 180 mL. Ejection fraction 40 %."</i> Compare with the healthy heart you just measured.`),
          question: { type: 'number', prompt: 'How much blood does Dana\'s left ventricle eject with each beat?', unit: 'mL', recordAs: 'danaSV',
            answer: () => 72, tol: 2,
            explain: () => `40 % of 180 mL = 72 mL: about the same as the healthy heart. But her ventricle has to stretch to 180 mL (healthy: about 118 mL) to manage it, because the damaged muscle pushes out only 40 % of what it holds. Scene 6 shows how her heart got there, and what it costs her.`,
            hint: (c, v) => v > 150 ? 'Stroke volume is the part of EDV that is ejected: EF × EDV.' : 'EF = SV ÷ EDV, so SV = EF × EDV. Use 0.40 for 40 %.' },
        },
      ],
    },
    // ------------------------------------------------------------- 5. Frank–Starling
    {
      id: 'starling', title: 'More in, more out', speed: 0.5,
      steps: [
        {
          view: 'heart', viewOpts: { pv: true, caption: 'Dashed loop: before your change. Solid: now.' }, reset: true, mode: 'sinus', remount: true,
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true },
          meters: () => [['Stroke volume', `${fmt(statsL().sv)} mL`], ['EDV', `${fmt(statsL().edv)} mL`], ['ESV', `${fmt(statsL().esv)} mL`]],
          title: 'Fill it more',
          enter: (c) => { c.stepState().data.armedAt = null; },
          text: `<p>A patient receives 500 mL of IV fluid. It enters the veins, so more blood returns to the heart each beat (more <b>preload</b>). Nerves and hormones are switched off in this model, so you see only the heart itself.</p>`,
          question: { prompt: 'Predict: with more blood returning, the stroke volume will…', options: [
            { t: 'increase', ok: true, fb: 'Give the fluid and watch the loop.' },
            { t: 'stay the same, because nothing told the heart to squeeze harder', fb: 'A reasonable guess, but test it: give the fluid and watch the loop.' },
            { t: 'decrease, because the heart is overloaded', fb: 'Only at extreme filling. Give the fluid and watch.' },
          ] },
          actions: [{ label: 'Give 500 mL IV fluid', cls: 'blood', run: (c) => { const d = c.stepState().data; if (d.armedAt != null) return; saveBaseline(c, 'before fluid'); sim.infuse(500); d.armedAt = sim.beats; c.note(`fluid given`); } }],
          waitFor: (c) => { const d = c.stepState().data; return d.armedAt != null && sim.beats - d.armedAt >= 6 && statsL().sv > d.base.sv + 5; },
          onDone: (c) => { const d = c.stepState().data, s = statsL(); c.recordValue('preload', { edv0: d.base.edv, edv1: s.edv, sv0: d.base.sv, sv1: s.sv }); },
          waitHint: 'Give the fluid and watch several beats',
          status: (c) => { const d = c.stepState().data; if (d.armedAt == null) return ''; const s = statsL(); return `${c.stepState().done ? '<b>Observed:</b> ' : ''}EDV ${r0(d.base.edv)} → ${r0(s.edv)} mL · SV ${r0(d.base.sv)} → ${r0(s.sv)} mL`; },
        },
        {
          view: 'heart', title: 'Why did it pump more?',
          question: { prompt: 'Nothing changed the heart muscle, yet each beat now ejects more. Why?', options: [
            { t: 'The fuller ventricle was stretched more, and stretched heart muscle contracts more forcefully', ok: true, fb: 'This is the <b>Frank–Starling law of the heart</b>: within limits, the heart pumps out whatever comes in. Look at the loop: it moved right (bigger EDV) and grew wider, but its left edge (ESV) hardly moved.' },
            { t: 'The nervous system made it beat harder', fb: 'Nerves are switched off in this model, and the heart rate did not change. The change came from inside the heart. What changed in the loop?' },
            { t: 'The heart rate went up', fb: 'Check the badge: still 75 per minute. Only the filling changed.' },
          ] },
        },
        {
          view: 'heart', viewOpts: { pv: true, caption: 'Dashed loop: before your change. Solid: now.' }, title: 'Harder to push against', reset: true, remount: true,
          meters: () => [['Stroke volume', `${fmt(statsL().sv)} mL`], ['ESV', `${fmt(statsL().esv)} mL`], ['Mean aortic pressure', `${fmt(statsL().mean)} mmHg`]],
          enter: (c) => { c.stepState().data.armedAt = null; },
          text: `<p>Now, starting from a normal heart, the small arteries of the body (<b>arterioles</b>) constrict. Their resistance rises 60 %, so the ventricle has to push against higher aortic pressure (more <b>afterload</b>).</p>`,
          question: { prompt: 'Predict: against the higher pressure, the ventricle will eject…', options: [
            { t: 'less blood per beat, leaving more behind (higher ESV)', ok: true, fb: 'Constrict the arterioles and watch the loop.' },
            { t: 'more blood, because the pressure is higher', fb: 'Higher pressure is something the ventricle has to overcome, not help. Test it.' },
            { t: 'the same amount', fb: 'Test it and compare the loops.' },
          ] },
          actions: [{ label: 'Constrict the arterioles', cls: 'blood', run: (c) => { const d = c.stepState().data; if (d.armedAt != null) return; saveBaseline(c, 'before constriction'); sim.p.R.sys *= 1.6; d.armedAt = sim.beats; } }],
          waitFor: (c) => { const d = c.stepState().data; return d.armedAt != null && sim.beats - d.armedAt >= 4 && statsL().esv > d.base.esv + 4; },
          onDone: (c) => { const d = c.stepState().data, s = statsL(); c.recordValue('afterload', { esv0: d.base.esv, esv1: s.esv, sv0: d.base.sv, sv1: s.sv, map0: d.base.mean, map1: s.mean }); },
          waitHint: 'Constrict the arterioles and watch several beats',
          status: (c) => { const d = c.stepState().data; if (d.armedAt == null) return ''; const s = statsL(); return `${c.stepState().done ? '<b>Observed:</b> ' : ''}ESV ${r0(d.base.esv)} → ${r0(s.esv)} mL · SV ${r0(d.base.sv)} → ${r0(s.sv)} mL · mean aortic ${r0(d.base.mean)} → ${r0(s.mean)} mmHg. The loop got taller and narrower: the aortic valve opens later and shuts sooner.`; },
        },
        {
          view: 'heart', viewOpts: { pv: true, caption: 'Dana\'s heart: a heart attack has just damaged part of her left ventricle.' }, title: 'Dana\'s heart attack', reset: true, remount: true,
          meters: () => {
            const L = sim.stats.L || {}, R = sim.stats.R || {}, d = lvFail;
            const diff = L.sv && R.sv ? Math.abs(R.sv - L.sv) / L.sv : 0;
            return [['Right ventricle', `${fmt(R.sv, 1)} mL/beat`, diff > 0.02], ['Left ventricle', `${fmt(L.sv, 1)} mL/beat`, diff > 0.02], ['Lung vein pressure', `${fmt(app.lung.mean, 1)} mmHg`, d.pv0 != null && app.lung.mean > d.pv0 + 1.5], ['LV EDV', `${fmt(L.edv)} mL`]];
          },
          enter: (c) => { const d = lvFail = c.stepState().data; d.armedAt = null; d.pv0 = null; },
          text: `<p>Two weeks ago, Dana's heart attack killed part of her left ventricle's muscle: it now squeezes 60 % less hard. Her right ventricle is unharmed. Start from a healthy heart and give it her damage.</p>`,
          question: { prompt: 'For the first beat after the damage, the right ventricle still pumps its usual ~70 mL but the left pumps much less. Where does the difference go?', options: [
            { t: 'It backs up in the lungs (and the left atrium)', ok: true, fb: 'The right ventricle keeps delivering blood that the weakened left ventricle does not pass on. Weaken the LV and watch the meters.' },
            { t: 'Into the body tissues', fb: 'The body gets blood only from the left ventricle, which is now pumping less. Follow the extra blood from the right ventricle.' },
            { t: 'Nowhere: the right ventricle slows down to match', fb: 'Nothing tells the right ventricle about the damage; nerves are off in this model. Where does its output go next?' },
          ] },
          actions: [{ label: 'Weaken the left ventricle', cls: 'blood', run: (c) => { const d = c.stepState().data; if (d.armedAt != null) return; saveBaseline(c, 'before the heart attack'); d.edv0 = statsL().edv; d.sv0 = statsL().sv; d.pv0 = app.lung.mean; sim.p.chambers.LV.Emax *= 0.4; d.armedAt = sim.beats; } }],
          waitFor: (c) => {
            const d = c.stepState().data, L = sim.stats.L, R = sim.stats.R;
            if (d.armedAt == null) return false;
            if (L && R && R.sv > L.sv * 1.05) d.sawMismatch = true;
            return d.sawMismatch && sim.beats - d.armedAt >= 10 && Math.abs(R.sv - L.sv) / L.sv < 0.02;
          },
          onDone: (c) => { const d = c.stepState().data, L = statsL(); c.recordValue('lvFailure', { pv0: d.pv0, pv1: app.lung.mean, edv0: d.edv0, edv1: L.edv, sv0: d.sv0, sv1: L.sv, ef1: L.ef, sys: L.sys, dia: L.dia }); },
          waitHint: 'Weaken the left ventricle and watch until the two sides match again',
          status: (c) => { const d = c.stepState().data; if (d.armedAt == null) return ''; return c.stepState().done ? `<b>Observed:</b> for a few beats the right side out-pumped the left and blood built up in the lungs; lung vein pressure rose from ${fmt(d.pv0, 1)} to ${fmt(app.lung.mean, 1)} mmHg. Then the outputs matched again.` : 'Watch the two outputs and the lung vein pressure.'; },
        },
        {
          view: 'heart', title: 'What rebalanced the two sides?',
          question: { prompt: 'Within a few beats both sides pumped the same volume again, with no nerves or hormones involved. What made the weak left ventricle pump more?', options: [
            { t: 'The blood backing up stretched it (bigger EDV), and stretched muscle squeezes harder: Frank–Starling', ok: true, fb: 'The same law as with the IV fluid, now keeping the two pumps matched beat by beat. The price is a higher pressure in the lungs. But look at her blood pressure and output: both are lower than before the heart attack. Her body will not leave it there.' },
            { t: 'The right ventricle slowed down', fb: 'The heart rate is the same for both sides. Look at what happened to LV EDV.' },
            { t: 'The damaged muscle healed', fb: 'The weakening is still in place. Look at what happened to LV EDV and the loop.' },
          ] },
        },
        {
          view: 'heart', viewOpts: { pv: true, caption: 'Dana\'s heart in the weeks after the heart attack.' }, title: 'Two weeks later',
          meters: () => { const L = sim.stats.L || {}, pv = app.lung.mean; return [[pv > 18 ? 'Lung veins: fluid leaking!' : 'Lung vein pressure', `${fmt(pv, 1)} mmHg`, pv > 18], ['Blood pressure', `${r0(L.sys || 0)}/${r0(L.dia || 0)} mmHg`], ['Stroke volume', `${fmt(L.sv)} mL`], ['LV EDV', `${fmt(L.edv)} mL`]]; },
          enter: (c) => {
            c.stepState().data.armedAt = null;
            if (c.stepState().done) return;
            // let the heart settle after the heart attack, and record where it settled
            advanceSim(40 * sim.rr, false);
            const L = statsL(), v = c.record.values.lvFailure;
            if (v) Object.assign(v, { pv1: app.lung.mean, edv1: L.edv, sv1: L.sv, ef1: L.ef, sys: L.sys, dia: L.dia });
          },
          text: `<p>With her weaker heart, Dana's blood pressure and output fell. Her kidneys sense this and respond the only way they can: they hold on to salt and water (you will see how in the kidney lab). Over two weeks she has kept about <b>600 mL</b> of extra fluid in her blood.</p>
                 <p>Watch the lung vein pressure. Above about <b>18 mmHg</b>, fluid is forced out of the lung capillaries into the air spaces (<b>pulmonary edema</b>).</p>`,
          question: { prompt: 'Predict: what will the 600 mL of extra fluid do?', options: [
            { t: 'Raise her stroke volume and blood pressure, but also the pressure in her lungs', ok: true, fb: 'Fast-forward the two weeks and look at the meters.' },
            { t: 'Raise her stroke volume and lower the pressure in her lungs', fb: 'Where does extra blood returning to a weak left ventricle wait before it can be pumped out? Test it.' },
            { t: 'Nothing, because the damaged ventricle cannot use extra blood', fb: 'The damaged muscle still follows Frank–Starling. Test it.' },
          ] },
          actions: [{ label: 'Fast-forward two weeks: the kidneys retain 600 mL', cls: 'blood', run: (c) => { const d = c.stepState().data; if (d.armedAt != null || c.stepState().done) return; saveBaseline(c, 'after the heart attack'); d.pv0 = app.lung.mean; sim.infuse(600); advanceSim(40 * sim.rr, false); d.armedAt = sim.beats; } }],
          waitFor: (c) => { const d = c.stepState().data; return d.armedAt != null && sim.beats - d.armedAt >= 2; },
          onDone: (c) => { const d = c.stepState().data, L = statsL(); c.recordValue('retention', { pv0: d.pv0, pv1: app.lung.mean, sv0: d.base.sv, sv1: L.sv, sys0: d.base.sys, dia0: d.base.dia, sys1: L.sys, dia1: L.dia, edv1: L.edv, ef1: L.ef }); },
          waitHint: 'Fast-forward two weeks and look at the meters',
          status: (c) => { const d = c.stepState().data; if (d.armedAt == null) return ''; const L = statsL(); return c.stepState().done ? `<b>Observed:</b> stroke volume ${r0(d.base.sv)} → ${r0(L.sv)} mL and blood pressure ${r0(d.base.sys)}/${r0(d.base.dia)} → ${r0(L.sys)}/${r0(L.dia)} mmHg (Frank–Starling at work), but lung vein pressure ${fmt(d.pv0, 1)} → ${fmt(app.lung.mean, 1)} mmHg: fluid is now leaking into her lungs. Her EDV (${r0(L.edv)} mL) and EF (${r0(100 * L.ef)} %) now match her echo report.` : 'Watch the meters.'; },
        },
        {
          view: 'heart', title: 'The diuretic',
          meters: () => { const L = sim.stats.L || {}, pv = app.lung.mean; return [[pv > 18 ? 'Lung veins: fluid leaking!' : 'Lung vein pressure', `${fmt(pv, 1)} mmHg`, pv > 18], ['Blood pressure', `${r0(L.sys || 0)}/${r0(L.dia || 0)} mmHg`], ['Stroke volume', `${fmt(L.sv)} mL`], ['LV EDV', `${fmt(L.edv)} mL`]]; },
          enter: (c) => { c.stepState().data.armedAt = null; },
          text: caseNote(`The crackles in Dana's lungs are that leaked fluid, and lying flat makes it worse because blood from her legs returns to her chest. Her doctor starts a <b>diuretic</b>: her kidneys pass about <b>400 mL</b> of the extra fluid out as urine.`),
          question: { prompt: 'Predict: what will removing 400 mL do?', options: [
            { t: 'Lung pressure falls below the leak line, and stroke volume falls a little', ok: true, fb: 'Give the diuretic and watch the meters.' },
            { t: 'Lung pressure falls and stroke volume rises', fb: 'Less blood returning means less stretch. What does Frank–Starling say about stroke volume then? Test it.' },
            { t: 'Lung pressure stays high: the fluid is already in the lungs', fb: 'The pressure in the lung vessels depends on how much blood is backed up behind the left ventricle. Test it.' },
          ] },
          actions: [{ label: 'Give the diuretic and fast-forward a few days (−400 mL)', cls: 'blood', run: (c) => { const d = c.stepState().data; if (d.armedAt != null || c.stepState().done) return; saveBaseline(c, 'before the diuretic'); d.pv0 = app.lung.mean; sim.hemorrhage(400); advanceSim(40 * sim.rr, false); d.armedAt = sim.beats; } }],
          waitFor: (c) => { const d = c.stepState().data; return d.armedAt != null && sim.beats - d.armedAt >= 2; },
          onDone: (c) => { const d = c.stepState().data, L = statsL(); c.recordValue('diuretic', { pv0: d.pv0, pv1: app.lung.mean, sv0: d.base.sv, sv1: L.sv, sys1: L.sys, dia1: L.dia }); },
          waitHint: 'Give the diuretic and look at the meters',
          status: (c) => { const d = c.stepState().data; if (d.armedAt == null) return ''; const L = statsL(); return c.stepState().done ? `<b>Observed:</b> lung vein pressure ${fmt(d.pv0, 1)} → ${fmt(app.lung.mean, 1)} mmHg, below the leak line. Stroke volume ${r0(d.base.sv)} → ${r0(L.sv)} mL: a small price, paid through Frank–Starling, for dry lungs.` : 'Watch the meters.'; },
        },
        {
          view: 'heart', title: 'Part A complete', continueLabel: 'Done',
          text: `<p>You now have what you need to answer Dana's three questions on your worksheet:</p>${CASE_QUESTIONS}
                 <p style="margin-top:8px">Your results from this lab are below. Copy them onto your worksheet. Then type your name to get your <b>completion code</b> and put it on the worksheet too.</p>`,
          extra: (el, c) => renderCompletion(el, c),
        },
      ],
    },
  ];

  // =========================================================================
  // Completion: the student's results (for the worksheet) and a completion code
  // =========================================================================
  // The code comes from the student's name and is shown only once every question in Part A has
  // been answered. It shows the lab was finished; the worksheet carries the grade. It deters
  // casual sharing but is not security (anyone can read this page's source).
  const CODE_SALT = 'heartsim-partA-complete-v1';
  const normName = (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const completionCode = (name) => 'A-' + Lesson.checkCode(normName(name), CODE_SALT);
  function questionsLeft() {
    const r = runner.runner.record, left = [];
    LESSON.forEach((sc, si) => sc.steps.forEach((st, ki) => {
      const a = r.answers[`${sc.id}.${ki}`];
      if (st.question && !(a && a.done)) left.push(si + 1);
    }));
    return [...new Set(left)];
  }
  function resultsLines() {
    const v = runner.runner.record.values, L = [];
    const pct = (x) => x == null ? '—' : `${r0(100 * x)} %`;
    L.push('HeartSim Part A: my results');
    L.push('Healthy heart (scene 5)');
    if (v.SV) L.push(`  Stroke volume I measured from the PV loop: ${v.SV.entered} mL`);
    if (v.EF) L.push(`  Ejection fraction I calculated: ${v.EF.entered} %`);
    if (v.danaSV) L.push(`  Dana's stroke volume from her echo report: ${v.danaSV.entered} mL`);
    L.push('Experiments (scene 6)');
    if (v.preload) L.push(`  +500 mL IV fluid (healthy heart): EDV ${r0(v.preload.edv0)} → ${r0(v.preload.edv1)} mL; stroke volume ${r0(v.preload.sv0)} → ${r0(v.preload.sv1)} mL`);
    if (v.afterload) L.push(`  Arterioles constricted: ESV ${r0(v.afterload.esv0)} → ${r0(v.afterload.esv1)} mL; stroke volume ${r0(v.afterload.sv0)} → ${r0(v.afterload.sv1)} mL; mean aortic pressure ${r0(v.afterload.map0)} → ${r0(v.afterload.map1)} mmHg`);
    if (v.lvFailure) L.push(`  Dana's heart attack: stroke volume ${r0(v.lvFailure.sv0)} → ${r0(v.lvFailure.sv1)} mL; LV EDV ${r0(v.lvFailure.edv0)} → ${r0(v.lvFailure.edv1)} mL; EF ${pct(v.lvFailure.ef1)}; blood pressure ${r0(v.lvFailure.sys)}/${r0(v.lvFailure.dia)} mmHg; lung vein pressure ${fmt(v.lvFailure.pv0, 1)} → ${fmt(v.lvFailure.pv1, 1)} mmHg`);
    if (v.retention) L.push(`  Two weeks of fluid retention (+600 mL): stroke volume ${r0(v.retention.sv0)} → ${r0(v.retention.sv1)} mL; blood pressure ${r0(v.retention.sys0)}/${r0(v.retention.dia0)} → ${r0(v.retention.sys1)}/${r0(v.retention.dia1)} mmHg; LV EDV ${r0(v.retention.edv1)} mL; EF ${pct(v.retention.ef1)}; lung vein pressure ${fmt(v.retention.pv0, 1)} → ${fmt(v.retention.pv1, 1)} mmHg`);
    if (v.diuretic) L.push(`  Diuretic (−400 mL): stroke volume ${r0(v.diuretic.sv0)} → ${r0(v.diuretic.sv1)} mL; blood pressure ${r0(v.diuretic.sys1)}/${r0(v.diuretic.dia1)} mmHg; lung vein pressure ${fmt(v.diuretic.pv0, 1)} → ${fmt(v.diuretic.pv1, 1)} mmHg`);
    return L;
  }
  function renderCompletion(el, c) {
    el.className = 'extra record';
    el.innerHTML = '';
    const ta = htmlEl('textarea', { readonly: 'readonly', 'aria-label': 'Your results' });
    ta.value = resultsLines().join('\n');
    const row = htmlEl('div', { class: 'row' });
    const copy = htmlEl('button', { type: 'button' }, 'Copy my results');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value); c.status('<b>Copied.</b> Paste them into your worksheet.', true); }
      catch (e) { ta.focus(); ta.select(); c.status('Selected: press Ctrl+C (⌘C on a Mac) to copy.', false); }
    });
    row.appendChild(copy);
    el.appendChild(ta); el.appendChild(row);
    const left = questionsLeft();
    if (left.length) {
      el.appendChild(htmlEl('p', { class: 'warn' }, `<b>Not finished yet:</b> answer the remaining questions in scene${left.length > 1 ? 's' : ''} ${left.join(', ')} to get your completion code. (Use the numbered buttons at the top.)`));
      return;
    }
    el.appendChild(htmlEl('label', { for: 'rec-name' }, 'Your name, as it appears in Canvas'));
    const name = htmlEl('input', { type: 'text', id: 'rec-name', autocomplete: 'name' });
    name.value = c.record.name || '';
    const code = htmlEl('div', { class: 'code', 'aria-live': 'polite' });
    const update = () => { c.record.name = name.value.trim(); code.innerHTML = c.record.name ? `Completion code: <b>${completionCode(c.record.name)}</b>` : 'Type your name to see your completion code.'; };
    name.addEventListener('input', update);
    el.appendChild(name); el.appendChild(code);
    update();
    c.complete();
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.dialog.on').forEach(d => d.classList.remove('on')); });
  function openCase() { $('#case').classList.add('on'); $('#case-close').focus(); }
  $('#case-body').innerHTML = CASE_HTML + '<p style="margin:8px 0 2px"><b>Questions you will answer on your worksheet:</b></p>' + CASE_QUESTIONS;
  $('#btn-case').addEventListener('click', openCase);
  $('#case-close').addEventListener('click', () => $('#case').classList.remove('on'));
  function openVerify() { $('#verify').classList.add('on'); $('#verify-name').focus(); }
  $('#verify-check').addEventListener('click', () => {
    const ok = completionCode($('#verify-name').value) === $('#verify-code').value.trim().toUpperCase();
    $('#verify-result').textContent = ok ? '✓ This code matches this name.' : '✗ This code does not match this name (check the spelling of the name).';
    $('#verify-result').style.color = ok ? 'var(--good)' : 'var(--bad)';
  });
  $('#verify-close').addEventListener('click', () => $('#verify').classList.remove('on'));
  window.__heartsim.completionCode = completionCode;
  window.__heartsim.results = () => resultsLines().join('\n');

  // =========================================================================
  // Start
  // =========================================================================
  runner = Lesson.createRunner({
    lesson: LESSON, panel, progress: $('#progress'), host, partLabel: 'Part A',
    inheritKeys: ['view', 'viewOpts', 'speed', 'mode', 'traces', 'meters'],
  });
  if (location.hash === '#verify') openVerify();
  window.addEventListener('hashchange', () => { if (location.hash === '#verify') openVerify(); });
  runner.goto(0, 0);
  requestAnimationFrame(frame);
})();
