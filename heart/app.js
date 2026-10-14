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
    userSpeed: null,
    lastFrame: null,
  };
  window.__heartsim = { sim, app, goto: (s, k) => runner.goto(s, k), runner: () => runner, lesson: () => LESSON };

  function resetSim() {
    sim.reset(8);
    app.history = []; app.markers = []; app.sounds = []; app.loops = []; app.curLoop = []; app.ghost = null;
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

  // ------------------------------------------------------------- circuit (scene 1)
  views.circuit = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'The circulation: right heart pumps blood to the lungs, left heart pumps it to the body' }, stage);
    const defs = svgEl('defs', {}, svg);
    const grad = svgEl('linearGradient', { id: 'bodygrad', x1: '1', x2: '0', y1: '0', y2: '0' }, defs);
    svgEl('stop', { offset: '0%', 'stop-color': COL.rich }, grad); svgEl('stop', { offset: '100%', 'stop-color': COL.poor }, grad);
    const grad2 = svgEl('linearGradient', { id: 'lunggrad', x1: '0', x2: '1', y1: '0', y2: '0' }, defs);
    svgEl('stop', { offset: '0%', 'stop-color': COL.poor }, grad2); svgEl('stop', { offset: '100%', 'stop-color': COL.rich }, grad2);
    const parts = {};
    const clickable = (el, stop, label) => {
      el.setAttribute('data-stop', stop); el.style.cursor = 'pointer';
      el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button'); el.setAttribute('aria-label', label);
      el.addEventListener('click', () => view.onStop && view.onStop(stop));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); view.onStop && view.onStop(stop); } });
      parts[stop] = el;
    };
    // vessels (drawn first, under the heart)
    const vessel = (d, color, stop, label) => {
      const g = svgEl('g', {}, svg);
      svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 18, 'stroke-linejoin': 'round', opacity: 0.9 }, g);
      const hit = svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 30 }, g);
      const p = svgEl('path', { d, fill: 'none', stroke: 'none' }, g);
      if (stop) clickable(g, stop, label);
      return { g, path: p, hit };
    };
    const V = {
      cava: vessel('M300,490 L210,490 L210,245 L330,245', COL.poor, 'cava', 'Venae cavae'),
      trunk: vessel('M470,320 L500,320 L500,110', COL.poor, 'trunk', 'Pulmonary trunk and arteries'),
      pv: vessel('M670,70 L750,70 L750,245 L670,245', COL.rich, 'pv', 'Pulmonary veins'),
      aorta: vessel('M670,355 L800,355 L800,490 L700,490', COL.rich, 'aorta', 'Aorta'),
    };
    // lungs and body
    const lungs = svgEl('g', {}, svg);
    svgEl('rect', { x: 330, y: 30, width: 340, height: 80, rx: 18, fill: 'url(#lunggrad)', opacity: 0.85 }, lungs);
    svgEl('text', { x: 500, y: 66, 'text-anchor': 'middle', fill: '#fff', 'font-size': 16, 'font-weight': 650, text: 'Lungs' }, lungs);
    svgEl('text', { x: 500, y: 88, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12, text: 'pulmonary capillaries: blood picks up O₂, gives off CO₂' }, lungs);
    clickable(lungs, 'lungs', 'Lungs');
    const body = svgEl('g', {}, svg);
    svgEl('rect', { x: 300, y: 450, width: 400, height: 80, rx: 18, fill: 'url(#bodygrad)', opacity: 0.85 }, body);
    svgEl('text', { x: 500, y: 486, 'text-anchor': 'middle', fill: '#fff', 'font-size': 16, 'font-weight': 650, text: 'Body tissues' }, body);
    svgEl('text', { x: 500, y: 508, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12, text: 'systemic capillaries: cells take O₂, give off CO₂' }, body);
    clickable(body, 'body', 'Body tissues');
    // heart chambers
    const chamber = (x, y, w, h, color, stop, label, wall) => {
      const g = svgEl('g', {}, svg);
      svgEl('rect', { x, y, width: w, height: h, rx: 14, fill: color, stroke: COL.muscleDark, 'stroke-width': wall }, g);
      svgEl('text', { x: x + w / 2, y: y + h / 2 + 5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 14, 'font-weight': 650, text: label.split(' (')[0] }, g);
      clickable(g, stop, label);
      return g;
    };
    chamber(330, 200, 140, 90, COL.poor, 'RA', 'Right atrium', 4);
    chamber(330, 300, 140, 110, COL.poor, 'RV', 'Right ventricle', 6);
    chamber(530, 200, 140, 90, COL.rich, 'LA', 'Left atrium', 4);
    chamber(530, 300, 140, 110, COL.rich, 'LV', 'Left ventricle', 14);
    svgEl('text', { x: 400, y: 190, 'text-anchor': 'middle', 'font-size': 13, fill: '#5f6675', text: 'RIGHT HEART' }, svg);
    svgEl('text', { x: 600, y: 190, 'text-anchor': 'middle', 'font-size': 13, fill: '#5f6675', text: 'LEFT HEART' }, svg);
    svgEl('text', { x: 500, y: 438, 'text-anchor': 'middle', 'font-size': 11, fill: '#5f6675', text: 'drawn as if facing the person: their right is on your left' }, svg);
    // flowing dots along each vessel, speed ∝ model flow in that vessel
    const flows = [];
    for (const [k, qKey] of [['cava', 'ven'], ['trunk', 'pulmonary'], ['pv', 'pulVen'], ['aorta', 'aortic']]) {
      const path = V[k].path, L = path.getTotalLength(), dots = [];
      for (let i = 0; i < 9; i++) dots.push({ u: i / 9, el: svgEl('circle', { r: 3.5, fill: '#fff', opacity: 0.85, 'pointer-events': 'none' }, svg) });
      flows.push({ path, L, dots, qKey });
    }
    const bodyDots = [], lungDots = [];
    for (let i = 0; i < 12; i++) bodyDots.push({ u: i / 12, el: svgEl('circle', { r: 3, fill: '#fff', opacity: 0.7, 'pointer-events': 'none' }, svg) });
    for (let i = 0; i < 12; i++) lungDots.push({ u: i / 12, el: svgEl('circle', { r: 3, fill: '#fff', opacity: 0.7, 'pointer-events': 'none' }, svg) });
    // the student's red blood cell
    const token = svgEl('g', { 'pointer-events': 'none', opacity: 0 }, svg);
    const tokenDisc = svgEl('ellipse', { rx: 13, ry: 9, fill: COL.poor, stroke: '#fff', 'stroke-width': 3 }, token);
    const STOP_POS = { body: [380, 470], cava: [210, 360], RA: [400, 218], RV: [400, 322], trunk: [500, 200], lungs: [380, 48], pv: [750, 160], LA: [600, 218], LV: [600, 322], aorta: [800, 420] };
    const STOP_O2 = { body: 'poor', cava: 'poor', RA: 'poor', RV: 'poor', trunk: 'poor', lungs: 'rich', pv: 'rich', LA: 'rich', LV: 'rich', aorta: 'rich' };
    let tok = { x: 500, y: 470, tx: 500, ty: 470 };
    const view = {
      svg, parts, onStop: null,
      showToken(stop) { token.setAttribute('opacity', 1); const p = STOP_POS[stop]; tok.tx = p[0]; tok.ty = p[1]; tokenDisc.setAttribute('fill', STOP_O2[stop] === 'rich' ? COL.rich : COL.poor); },
      highlight(stop) {
        for (const k in parts) parts[k].style.filter = '';
        if (stop && parts[stop]) parts[stop].style.filter = 'drop-shadow(0 0 6px #f0b429) drop-shadow(0 0 2px #f0b429)';
      },
      update(dtReal, dtSim) {
        for (const f of flows) {
          const Q = sim.Q[f.qKey];
          for (const d of f.dots) {
            d.u = (d.u + Q * 0.9 * dtSim / 1000 / f.L + 1) % 1;
            const p = f.path.getPointAtLength(d.u * f.L);
            setAttrs(d.el, { cx: p.x, cy: p.y });
          }
        }
        const qb = sim.Q.sys, ql = sim.Q.pul;
        bodyDots.forEach((d, i) => { d.u = (d.u + qb * 0.9 * dtSim / 1000 / 400 + 1) % 1; setAttrs(d.el, { cx: 690 - d.u * 380, cy: i % 2 ? 459 : 521 }); });
        lungDots.forEach((d, i) => { d.u = (d.u + ql * 0.9 * dtSim / 1000 / 340 + 1) % 1; setAttrs(d.el, { cx: 340 + d.u * 320, cy: i % 2 ? 39 : 101 }); });
        const k = 1 - Math.exp(-dtReal / 120);
        tok.x += (tok.tx - tok.x) * k; tok.y += (tok.ty - tok.y) * k;
        token.setAttribute('transform', `translate(${tok.x},${tok.y})`);
      },
      narrate() {
        const L = sim.stats.L, R = sim.stats.R;
        if (!L || !R) return null;
        return {
          html: `Each beat the <b>right</b> ventricle sends <b>${r0(R.sv)} mL</b> to the lungs and the <b>left</b> ventricle sends <b>${r0(L.sv)} mL</b> to the body: two pumps in one loop. The white dots move with the model's blood flow.`,
          key: 'circuit',
        };
      },
    };
    return view;
  };

  // ------------------------------------------------------------- left heart strip (scenes 2–5)
  views.heart = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 420', role: 'img', 'aria-label': 'Left heart: pulmonary veins, left atrium, bicuspid valve, left ventricle, aortic valve, aorta' }, stage);
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
      const ghostLbl = svgEl('text', { 'font-size': 11, fill: '#7a8190' }, g);
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
            const top = app.ghost.loop.reduce((a, p) => p.P > a.P ? p : a, app.ghost.loop[0]);
            setAttrs(ghostLbl, { x: X(top.V) + 6, y: Yp(top.P) - 8 }); ghostLbl.textContent = app.ghost.label || 'before';
          } else { ghost.setAttribute('d', ''); ghostLbl.textContent = ''; }
        },
        refresh() { lastLoopN = -1; },
        highlight(ph, color) { for (const k in segs) { segs[k].vis.setAttribute('stroke', k === ph ? (color || '#f0b429') : COL.LV); segs[k].vis.setAttribute('stroke-width', k === ph ? 6 : 3); } },
      };
    }

    let lastT = 0;
    const view = {
      svg, mitral, aortic, pv: pvPlot, onSegment: null, markersOn: false,
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
    ['RA', 'Blood returning from the body (through the venae cavae) first enters this chamber. Click it.', 'The <b>right atrium</b> collects oxygen-poor blood from the whole body.'],
    ['RV', 'Next the blood passes the tricuspid valve into the chamber that pumps it to the lungs. Click it.', 'The <b>right ventricle</b> pumps blood to the lungs only.'],
    ['trunk', 'This vessel carries blood away from the heart toward the lungs. Click it.', 'The <b>pulmonary trunk</b> and its branches, the pulmonary arteries. Vessels that carry blood <i>away</i> from the heart are arteries, even when the blood in them is oxygen-poor.'],
    ['lungs', 'Here the blood picks up O₂ and gets rid of CO₂. Click it.', 'In the <b>lung capillaries</b> the blood is oxygenated. Watch the cell change colour.'],
    ['pv', 'These vessels bring the blood back to the heart from the lungs. Click them.', 'The <b>pulmonary veins</b>. Vessels that carry blood <i>toward</i> the heart are veins, even when the blood in them is oxygen-rich.'],
    ['LA', 'The chamber that receives blood from the lungs. Click it.', 'The <b>left atrium</b>.'],
    ['LV', 'Through the bicuspid valve into the thick-walled chamber that pumps blood to the whole body. Click it.', 'The <b>left ventricle</b>: notice its much thicker wall.'],
    ['aorta', 'The large artery that carries blood from the left ventricle to the body. Click it.', 'The <b>aorta</b>. From here the blood goes to every organ, gives up O₂ in the tissues and returns through the venae cavae: one complete loop.'],
  ];
  const STOP_NAME = { RA: 'the right atrium', RV: 'the right ventricle', trunk: 'the pulmonary trunk', lungs: 'the lungs', pv: 'the pulmonary veins', LA: 'the left atrium', LV: 'the left ventricle', aorta: 'the aorta', body: 'the body tissues', cava: 'the venae cavae' };

  const LESSON = [
    // ------------------------------------------------------------- 1. two pumps, one loop
    {
      id: 'loop', title: 'Two pumps, one loop', speed: 1,
      steps: [
        ...CIRCUIT_STOPS.map(([stop, prompt, explain], i) => ({
          view: 'circuit', viewOpts: { caption: 'Follow one red blood cell around the circulation. Click the next stop.' }, mode: 'sinus', reset: i === 0,
          traces: { pressures: ['aorta', 'pulTrunk'], volume: false, valves: false },
          title: `Follow a red blood cell (${i + 1} of ${CIRCUIT_STOPS.length})`,
          text: (i === 0 ? `<p>The heart is two pumps side by side. We will follow one red blood cell, starting in the tissues of the body, where it has just given up its oxygen.</p>` : '') + `<p>${prompt}</p>`,
          enter: (c) => {
            const v = c.view();
            v.showToken(i === 0 ? 'body' : CIRCUIT_STOPS[i - 1][0]);
            v.highlight(null);
            v.onStop = (s) => {
              if (s === stop) { v.highlight(stop); v.showToken(stop); c.status(`<b>Yes: ${STOP_NAME[stop]}.</b> ${explain}`, true); c.complete(); }
              else c.status(`That is ${STOP_NAME[s] || s}. Try again.`, false);
            };
          },
          waitFor: () => false, waitHint: 'Click the next stop on the diagram',
        })),
        {
          view: 'circuit', title: 'Arteries, veins and oxygen',
          enter: (c) => { c.view().highlight('pv'); c.view().onStop = null; },
          text: `<p>Your cell went body → right heart → lungs → left heart → body.</p>`,
          question: { prompt: 'Compared with blood in the venae cavae, blood in the pulmonary veins carries…', options: [
            { t: 'much more oxygen', ok: true, fb: 'The pulmonary veins carry the most oxygen-rich blood in the body; it has just left the lungs. "Vein" means the vessel carries blood <i>toward</i> the heart. It says nothing about oxygen.' },
            { t: 'less oxygen, because veins carry deoxygenated blood', fb: 'A common rule of thumb that fails here. Veins are defined by direction (toward the heart), not by oxygen. Where has this blood just been?' },
            { t: 'about the same amount of oxygen', fb: 'Between the venae cavae and the pulmonary veins the blood passes through the lungs. What happens there?' },
          ] },
        },
        {
          view: 'circuit', title: 'Which side pumps more?',
          meters: () => [['Right ventricle → lungs', `${fmt((sim.stats.R || {}).co, 1)} L/min`], ['Left ventricle → body', `${fmt((sim.stats.L || {}).co, 1)} L/min`]],
          text: `<p>The two sides are pumps <b>in series</b>: everything the right ventricle pumps out must, a few seconds later, arrive at the left ventricle.</p>`,
          question: { prompt: 'Over a minute, which side pumps more blood?', options: [
            { t: 'Both pump the same volume', ok: true, fb: 'Look at the meters. If one side pumped even 1 mL more per beat, about 75 mL a minute would pile up in the lungs or the body. In scene 5 you will see what stops that from happening.' },
            { t: 'The left side, because it is bigger and stronger', fb: 'Its wall is thicker, but look at the meters on the diagram: the volumes match. What would happen to the lungs if the right side pumped less than the left for an hour?' },
            { t: 'The right side, because it has to fill the lungs', fb: 'Look at the meters on the diagram. Any mismatch would steadily empty or flood one circuit.' },
          ] },
        },
        {
          view: 'circuit', title: 'Same volume, different job',
          meters: () => [['Pulmonary trunk', `${r0((sim.stats.R || {}).sys || 0)}/${r0((sim.stats.R || {}).dia || 0)} mmHg`], ['Aorta', `${r0((sim.stats.L || {}).sys || 0)}/${r0((sim.stats.L || {}).dia || 0)} mmHg`]],
          text: `<p>The trace at the bottom shows the pressure in the two arteries leaving the heart: the <b>aorta</b> and the <b>pulmonary trunk</b>.</p>`,
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
          view: 'heart', viewOpts: { caption: 'The left side of the heart, opened out in a line. The heartbeat is switched off: you are the heart muscle.' }, reset: true, mode: 'manual', remount: true,
          traces: { pressures: ['LA', 'LV', 'aorta'], volume: true, valves: true },
          title: 'You are the heart muscle',
          text: `<p>Blood arrives from the lungs on the left, passes the <b>left atrium</b>, the <b>bicuspid valve</b>, the <b>left ventricle</b> and the <b>aortic valve</b>, and leaves through the aorta on the right.</p>
                 <p>The bars on the right show the pressure in each space. Right now the ventricle is completely relaxed.</p>`,
          question: { prompt: 'With the ventricle relaxed, what is holding the bicuspid valve open?', options: [
            { t: 'Pressure in the atrium is slightly higher than in the ventricle, so blood pushes the flaps open', ok: true, fb: 'Valves have no muscle of their own. They are flaps that blood pushes open or shut. Look at the bars: LA is a little higher than LV, and the arrow between them points forward.' },
            { t: 'The papillary muscles and chordae tendineae pull the flaps open', fb: 'The chordae only stop the flaps from blowing back into the atrium when the ventricle squeezes. They do not open the valve. Look at the pressure bars.' },
            { t: 'The atrium is contracting and pushing it open', fb: 'Nothing is contracting right now; the heartbeat is off. Yet the valve is open. Look at the pressure bars for the reason.' },
            { t: 'A nerve signal holds it open', fb: 'Valves have no nerves or muscle that move them. Look at the pressure bars.' },
          ] },
        },
        {
          view: 'heart', title: 'Predict, then squeeze',
          text: `<p>You are about to make the ventricle wall contract. Its pressure will rise.</p>`,
          question: { prompt: 'As LV pressure starts to rise, what happens first?', options: [
            { t: 'The bicuspid valve is pushed shut', ok: true, fb: 'As soon as LV pressure rises above LA pressure, blood is pushed backward and slams the bicuspid flaps shut. Now hold the button and watch.' },
            { t: 'Blood immediately starts to flow into the aorta', fb: 'The aortic valve is held shut by aortic pressure of around 80 mmHg. How high is the LV now?' },
            { t: 'The aortic valve opens', fb: 'Only when LV pressure exceeds aortic pressure. Look at the bars: how far apart are LV and aorta now?' },
            { t: 'Both valves open', fb: 'Squeezing raises LV pressure. Compare it with the pressure on each side.' },
          ] },
          actions: [{ label: 'Hold to squeeze the ventricle', cls: 'blood', hold: true, down: () => sim.squeeze(1), up: () => sim.squeeze(0) }],
          tick: (c, events) => {
            const d = c.stepState().data; d.seq = d.seq || [];
            for (const e of events) if (e.type === 'valve' && e.side === 'left') d.seq.push(`${e.valve}${e.open ? '+' : '-'}`);
          },
          waitFor: (c) => { const s = (c.stepState().data.seq || []).join(' '); return s.includes('mitral- aortic+'); },
          waitHint: 'Hold the squeeze button until blood leaves the ventricle',
          status: (c) => c.stepState().done ? '<b>Observed:</b> the bicuspid valve shut first; the aortic valve opened only when LV pressure passed aortic pressure. Then blood left.' : `LV ${r0(sim.P.LV)} mmHg · aorta ${r0(sim.P.sysArt)} mmHg. Hold the button.`,
        },
        {
          view: 'heart', title: 'Both valves shut',
          text: `<p>Between the bicuspid valve shutting and the aortic valve opening there was a moment with <b>both valves shut</b>. Squeeze again and watch the LV size and the volume trace during that moment.</p>`,
          actions: [{ label: 'Hold to squeeze the ventricle', cls: 'blood', hold: true, down: () => sim.squeeze(1), up: () => sim.squeeze(0) }],
          question: { prompt: 'While both valves are shut and the muscle squeezes, the LV…', options: [
            { t: 'keeps the same volume while its pressure climbs', ok: true, fb: 'Blood cannot be compressed and has nowhere to go, so the squeeze turns entirely into pressure. This is <b>isovolumetric contraction</b> ("same volume").' },
            { t: 'gets smaller as blood leaves', fb: 'Where could the blood go? Both exits are shut. Look at the volume trace during that moment.' },
            { t: 'loses pressure', fb: 'The muscle is squeezing on a fixed amount of blood. Look at the LV pressure trace.' },
          ] },
        },
        {
          view: 'heart', title: 'Let go',
          text: `<p>Squeeze until blood is leaving, then <b>let go</b> and watch which valve moves.</p>`,
          actions: [{ label: 'Hold to squeeze the ventricle', cls: 'blood', hold: true, down: () => sim.squeeze(1), up: () => sim.squeeze(0) }],
          question: { prompt: 'When the muscle relaxes, which valve shuts first?', options: [
            { t: 'The aortic valve, because LV pressure falls below aortic pressure', ok: true, fb: 'The aorta is stretched full of blood at high pressure. As the LV relaxes its pressure drops below that, blood starts back toward the ventricle and snaps the aortic valve shut. Test it.' },
            { t: 'The bicuspid valve', fb: 'It is already shut. What has to happen before it can open again?' },
            { t: 'Neither: both stay open', fb: 'Check the pressure bars when you let go.' },
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
            { t: 'The bicuspid valve shuts', ok: true, fb: 'Exactly as when you squeezed by hand. Press Beat and watch.' },
            { t: 'The aortic valve opens', fb: 'Remember scene 2: LV pressure first has to pass the atrium, then the aorta.' },
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
            { t: 'LV pressure climbs at constant volume until it passes aortic pressure', ok: true, fb: 'Isovolumetric contraction, as you felt by hand. Resume to see it.' },
            { t: 'LV volume falls as blood is ejected', fb: 'Not yet: the aortic valve is still shut. Look at the aortic pressure the LV has to beat.' },
            { t: 'The atrium refills the ventricle', fb: 'The bicuspid valve is shut now; nothing more can enter.' },
          ] },
          actions: [{ label: 'Resume', cls: 'primary', run: (c) => c.resume() }],
          tick: (c, events) => { if (!c.stepState().done && events.some(e => e.type === 'valve' && e.valve === 'aortic' && e.open)) { c.pause(); c.mark('aortic opens'); c.complete(); } },
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
          tick: (c, events) => { if (!c.stepState().done && events.some(e => e.type === 'valve' && e.valve === 'aortic' && !e.open)) { c.pause(); c.mark('aortic shuts (S2)'); c.complete(); } },
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
          tick: (c, events) => { if (!c.stepState().done && events.some(e => e.type === 'valve' && e.valve === 'mitral' && e.open)) { c.pause(); c.mark('bicuspid opens'); c.complete(); } },
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
          text: `<p>Each beat you heard two sounds: <b>S1</b> ("lub") and <b>S2</b> ("dub"). They are marked under the valve bars at the bottom.</p>`,
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
          view: 'heart', viewOpts: { pv: true, caption: 'A heart attack has just damaged part of the left ventricle.' }, title: 'When one side weakens', reset: true, remount: true,
          meters: () => {
            const L = sim.stats.L || {}, R = sim.stats.R || {}, d = lvFail;
            const diff = L.sv && R.sv ? Math.abs(R.sv - L.sv) / L.sv : 0;
            return [['Right ventricle', `${fmt(R.sv, 1)} mL/beat`, diff > 0.02], ['Left ventricle', `${fmt(L.sv, 1)} mL/beat`, diff > 0.02], ['Lung vein pressure', `${fmt(d.pv, 1)} mmHg`, d.pv0 != null && d.pv > d.pv0 + 1.5], ['LV EDV', `${fmt(L.edv)} mL`]];
          },
          enter: (c) => { const d = lvFail = c.stepState().data; d.armedAt = null; d.pvAcc = 0; d.pvT = 0; d.pv = sim.P.pulVen; d.pv0 = null; },
          tick: (c, events, dtSim) => {
            // mean pulmonary venous pressure over each beat-length of simulated time
            const d = c.stepState().data; d.pvAcc += sim.P.pulVen * dtSim; d.pvT += dtSim;
            if (d.pvT >= sim.rr) { d.pv = d.pvAcc / d.pvT; d.pvAcc = 0; d.pvT = 0; }
          },
          text: `<p>A heart attack kills part of the left ventricle's muscle: it now squeezes 60 % less hard. The right ventricle is unharmed.</p>`,
          question: { prompt: 'For the first beat after the damage, the right ventricle still pumps its usual ~70 mL but the left pumps much less. Where does the difference go?', options: [
            { t: 'It backs up in the lungs (and the left atrium)', ok: true, fb: 'The right ventricle keeps delivering blood that the weakened left ventricle does not pass on. Weaken the LV and watch the meters.' },
            { t: 'Into the body tissues', fb: 'The body gets blood only from the left ventricle, which is now pumping less. Follow the extra blood from the right ventricle.' },
            { t: 'Nowhere: the right ventricle slows down to match', fb: 'Nothing tells the right ventricle about the damage; nerves are off in this model. Where does its output go next?' },
          ] },
          actions: [{ label: 'Weaken the left ventricle', cls: 'blood', run: (c) => { const d = c.stepState().data; if (d.armedAt != null) return; saveBaseline(c, 'before the heart attack'); d.edv0 = statsL().edv; d.pv0 = d.pv; sim.p.chambers.LV.Emax *= 0.4; d.armedAt = sim.beats; } }],
          waitFor: (c) => {
            const d = c.stepState().data, L = sim.stats.L, R = sim.stats.R;
            if (d.armedAt == null) return false;
            if (L && R && R.sv > L.sv * 1.05) d.sawMismatch = true;
            return d.sawMismatch && sim.beats - d.armedAt >= 10 && Math.abs(R.sv - L.sv) / L.sv < 0.02;
          },
          onDone: (c) => { const d = c.stepState().data; c.recordValue('lvFailure', { pv0: d.pv0, pv1: d.pv, edv0: d.edv0, edv1: statsL().edv }); },
          waitHint: 'Weaken the left ventricle and watch until the two sides match again',
          status: (c) => { const d = c.stepState().data; if (d.armedAt == null) return ''; return c.stepState().done ? `<b>Observed:</b> for a few beats the right side out-pumped the left and blood built up in the lungs; lung vein pressure rose from ${fmt(d.pv0, 1)} to ${fmt(d.pv, 1)} mmHg. Then the outputs matched again.` : 'Watch the two outputs and the lung vein pressure.'; },
        },
        {
          view: 'heart', title: 'What rebalanced the two sides?',
          question: { prompt: 'Within a few beats both sides pumped the same volume again, with no nerves or hormones involved. What made the weak left ventricle pump more?', options: [
            { t: 'The blood backing up stretched it (bigger EDV), and stretched muscle squeezes harder: Frank–Starling', ok: true, fb: 'The same law as with the IV fluid, now keeping the two pumps matched beat by beat. But the price is a permanently higher pressure in the lungs. In <b>left heart failure</b> this pressure pushes fluid out of the lung capillaries, and patients become short of breath.' },
            { t: 'The right ventricle slowed down', fb: 'The heart rate is the same for both sides. Look at what happened to LV EDV.' },
            { t: 'The damaged muscle healed', fb: 'The weakening is still in place. Look at what happened to LV EDV and the loop.' },
          ] },
        },
        {
          view: 'heart', title: 'Lab record', continueLabel: 'Done',
          text: `<p><b>Part A complete.</b> Type your name, then copy your lab record and paste it into the Canvas assignment (or download it and upload the file).</p>
                 <p>The record lists your first answer to each prediction, your measurements and your experiments, with a check code your instructor can verify.</p>`,
          extra: (el, c) => renderRecordBox(el, c),
        },
      ],
    },
  ];

  // =========================================================================
  // Lab record (pasted into Canvas) and the instructor's check
  // =========================================================================
  const RECORD_SALT = 'heartsim-partA-v1';
  function recordText(name) {
    const r = runner.runner.record, lines = [];
    const now = new Date();
    lines.push('HeartSim · Part A: The heart as a pump · lab record');
    lines.push(`Student: ${name || '(no name entered)'}`);
    lines.push(`Finished: ${now.toLocaleString()}`);
    lines.push('');
    lines.push('Predictions and questions (✓ = right first time; otherwise your first answer and the number of tries)');
    const keys = Object.keys(r.answers).sort((a, b) => {
      const sa = LESSON.findIndex(s => s.id === a.split('.')[0]), sb = LESSON.findIndex(s => s.id === b.split('.')[0]);
      return sa - sb || (+a.split('.')[1]) - (+b.split('.')[1]);
    });
    let n = 0, firstRight = 0;
    for (const k of keys) {
      const a = r.answers[k]; n++; if (a.firstCorrect) firstRight++;
      lines.push(`${String(n).padStart(2)}. [Scene ${a.scene}] ${a.prompt}`);
      lines.push(a.firstCorrect ? `    ✓ ${a.first}` : `    first answer: ${a.first} · ${a.done ? `right after ${a.attempts} tries` : 'not yet answered correctly'}`);
    }
    const total = LESSON.reduce((s, sc) => s + sc.steps.filter(st => st.question).length, 0);
    lines.push(`Answered ${n} of ${total} questions; ${firstRight} right first time.`);
    lines.push('');
    lines.push('Measurements');
    const v = r.values;
    if (v.SV) lines.push(`  Stroke volume read from your PV loop: ${v.SV.entered} mL (model ${fmt(v.SV.model, 1)} mL)`);
    if (v.EF) lines.push(`  Ejection fraction: ${v.EF.entered} % (model ${fmt(v.EF.model, 1)} %)`);
    lines.push('Experiments');
    if (v.preload) lines.push(`  +500 mL IV fluid: EDV ${r0(v.preload.edv0)} → ${r0(v.preload.edv1)} mL, SV ${r0(v.preload.sv0)} → ${r0(v.preload.sv1)} mL`);
    if (v.afterload) lines.push(`  Arterioles constricted: ESV ${r0(v.afterload.esv0)} → ${r0(v.afterload.esv1)} mL, SV ${r0(v.afterload.sv0)} → ${r0(v.afterload.sv1)} mL, mean aortic ${r0(v.afterload.map0)} → ${r0(v.afterload.map1)} mmHg`);
    if (v.lvFailure) lines.push(`  Weakened LV: lung vein pressure ${fmt(v.lvFailure.pv0, 1)} → ${fmt(v.lvFailure.pv1, 1)} mmHg, LV EDV ${r0(v.lvFailure.edv0)} → ${r0(v.lvFailure.edv1)} mL`);
    if (!v.preload && !v.afterload && !v.lvFailure) lines.push('  (none completed)');
    const body = lines.join('\n');
    return body + '\n\nCheck code: ' + Lesson.checkCode(body, RECORD_SALT);
  }
  function renderRecordBox(el, c) {
    el.className = 'extra record';
    el.innerHTML = '';
    const lab = htmlEl('label', { for: 'rec-name' }, 'Your name');
    const name = htmlEl('input', { type: 'text', id: 'rec-name', autocomplete: 'name' });
    name.value = c.record.name || '';
    const ta = htmlEl('textarea', { readonly: 'readonly', 'aria-label': 'Your lab record' });
    const update = () => { c.record.name = name.value.trim(); ta.value = recordText(c.record.name); };
    name.addEventListener('input', update);
    const row = htmlEl('div', { class: 'row' });
    const copy = htmlEl('button', { type: 'button', class: 'primary' }, 'Copy lab record');
    copy.addEventListener('click', async () => {
      update();
      try { await navigator.clipboard.writeText(ta.value); c.status('<b>Copied.</b> Paste it into the Canvas assignment.', true); }
      catch (e) { ta.focus(); ta.select(); c.status('Select-all is done: press Ctrl+C (⌘C on a Mac) to copy.', false); }
    });
    const dl = htmlEl('button', { type: 'button' }, 'Download as .txt');
    dl.addEventListener('click', () => {
      update();
      const blob = new Blob([ta.value], { type: 'text/plain' });
      const a = htmlEl('a', { href: URL.createObjectURL(blob), download: `heartsim-partA-${(c.record.name || 'record').replace(/\W+/g, '_')}.txt` });
      document.body.appendChild(a); a.click(); a.remove();
    });
    row.appendChild(copy); row.appendChild(dl);
    el.appendChild(lab); el.appendChild(name); el.appendChild(ta); el.appendChild(row);
    update();
  }
  function verifyRecord(text) {
    const m = text.replace(/\r\n/g, '\n').match(/^([\s\S]*?)\n\s*\nCheck code:\s*([A-Z0-9]{5}-[A-Z0-9]{5})\s*$/m);
    if (!m) return { ok: false, msg: 'No check code found. Paste the whole record, including the last line.' };
    const ok = Lesson.checkCode(m[1], RECORD_SALT) === m[2];
    return { ok, msg: ok ? '✓ The record matches its check code (not edited after it was made).' : '✗ The check code does not match: the record was edited, or is incomplete.' };
  }
  function openVerify() {
    $('#verify').classList.add('on'); $('#verify-text').focus();
  }
  $('#verify-check').addEventListener('click', () => { const r = verifyRecord($('#verify-text').value); $('#verify-result').textContent = r.msg; $('#verify-result').style.color = r.ok ? 'var(--good)' : 'var(--bad)'; });
  $('#verify-close').addEventListener('click', () => $('#verify').classList.remove('on'));
  window.__heartsim.verifyRecord = verifyRecord;
  window.__heartsim.recordText = (n) => recordText(n);

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
