/*
 * MuscleViews: the SVG views of the skeletal muscle page (see docs/MUSCLE_VIEWS.md).
 *
 *   window.MuscleViews = (kit) => ({ drawCell, views })
 *
 * Every visual is rendered from MuscleFibre state each frame: segment colours from V,
 * channel glyphs from the state helpers, Ca²⁺ dots from the cytosolic concentration, the store
 * level from caSR, cross-bridges from xb, the fibre's length and the gauge from force.
 * Classic script (no modules) so the page opens from file://.
 */
(function () {
  'use strict';

  const FORCE = '#a0442a', TUBULE = '#8a7a50', COVER = '#6b7280', SR_BLUE = '#2d8fd5';

  let sim, app, profile, svgEl, setAttrs, htmlEl, $, clamp, lerp, rand, ION_COLOR, ION_LABEL, CH, vColor, insideFill,
    drawChannel, setChannelState, makeIonPool, makeParticles, fluxCounter, drawBilayer, drawInset, chip, IN, OUT, fmtV, setCaption;
  let boundKit = null;
  function bind(kit) {
    if (boundKit === kit) return;
    boundKit = kit;
    ({ sim, app, profile, svgEl, setAttrs, htmlEl, $, clamp, lerp, rand, ION_COLOR, ION_LABEL, CH, vColor, insideFill,
      drawChannel, setChannelState, makeIonPool, makeParticles, fluxCounter, drawBilayer, drawInset, chip, IN, OUT, fmtV, setCaption } = kit);
    if (!CH.nAChR) CH.nAChR = { color: ION_COLOR.Na, label: 'ACh receptor (Na⁺/K⁺ channel)', ion: 'Na', dir: -1, receptor: true };
  }

  // =========================================================================
  // Small shared pieces
  // =========================================================================
  function forceGauge(parent, x, y, h, label) {
    const g = svgEl('g', { transform: `translate(${x},${y})`, 'font-size': 11, fill: '#3a3f4a' }, parent);
    svgEl('text', { x: 0, y: -8, 'font-weight': 700, 'font-size': 12, text: label || 'Force' }, g);
    svgEl('rect', { x: 0, y: 0, width: 16, height: h, rx: 4, fill: '#eee9dc', stroke: '#c9c4b4' }, g);
    const bar = svgEl('rect', { x: 2, y: h - 2, width: 12, height: 0, rx: 3, fill: FORCE }, g);
    [[0, '0'], [0.25, 'twitch'], [1, 'tetanus']].forEach(([f, t]) => { svgEl('line', { x1: 16, y1: h - f * h, x2: 21, y2: h - f * h, stroke: '#9ca3af' }, g); svgEl('text', { x: 24, y: h - f * h + 4, fill: '#6b7280', text: t }, g); });
    const val = svgEl('text', { x: 0, y: h + 14, 'font-weight': 700, text: '0.00' }, g);
    return { update(F) { const hh = clamp(F, 0, 1.05) * h; bar.setAttribute('y', h - hh); bar.setAttribute('height', hh); val.textContent = F.toFixed(2); } };
  }

  // A causal checklist: rows light while their test is true, tick afterwards, reset when quiet.
  function checklist(parent, x, y, title, rows) {
    const g = svgEl('g', { transform: `translate(${x},${y})`, 'font-size': 11.5, fill: '#3a3f4a' }, parent);
    svgEl('text', { x: 0, y: 0, 'font-weight': 700, 'font-size': 12, text: title }, g);
    const els = rows.map((r, i) => {
      const yy = 22 + i * 18;
      const dot = svgEl('circle', { cx: 7, cy: yy - 4, r: 6, fill: '#fff', stroke: '#c9c4b4', 'stroke-width': 1.5 }, g);
      const tick = svgEl('path', { d: `M3,${yy - 4} l3,3 l6,-6`, stroke: '#fff', 'stroke-width': 2, fill: 'none', opacity: 0 }, g);
      const txt = svgEl('text', { x: 20, y: yy, text: r.label }, g);
      return { dot, tick, txt, done: false };
    });
    let quietFor = 0;
    return {
      update(dtReal) {
        const anyActive = rows.some(r => r.test());
        quietFor = anyActive ? 0 : quietFor + dtReal;
        if (quietFor > 1500) els.forEach(e => { e.done = false; });
        rows.forEach((r, i) => {
          const active = r.test(), e = els[i];
          if (active) e.done = true;
          const color = active ? '#2f6fd6' : (e.done ? '#2f9e5b' : '#c9c4b4');
          e.dot.setAttribute('fill', active ? '#2f6fd6' : (e.done ? '#2f9e5b' : '#fff'));
          e.dot.setAttribute('stroke', color);
          e.tick.setAttribute('opacity', e.done && !active ? 1 : 0);
          e.txt.setAttribute('font-weight', active ? 700 : 400);
          e.txt.setAttribute('fill', active ? '#1f2430' : (e.done ? '#2f9e5b' : '#6b7280'));
        });
      },
      reset() { els.forEach(e => { e.done = false; }); },
    };
  }

  const R3 = () => sim.byName.R3;
  function ecRows() {
    const c = () => R3();
    return [
      { label: 'impulse reaches the T-tubule', test: () => c().V > -40 },
      { label: 'voltage sensor moves', test: () => sim.sensorState(c()) === 'active' },
      { label: 'SR release channel opens', test: () => sim.ryrState(c()) === 'open' },
      { label: 'Ca²⁺ floods the cytosol', test: () => c().ca > 1 && c().ryr > 0.1 },
      { label: 'Ca²⁺ binds troponin', test: () => c().tn > 0.4 && c().ca > 0.6 },
      { label: 'tropomyosin cover moves aside', test: () => c().tn > 0.4 },
      { label: 'cross-bridges cycle (ATP)', test: () => c().xb > 0.1 && sim.atp > 0 && c().tn > 0.3 },
      { label: 'force rises', test: () => sim.force > 0.05 && c().xb > c().force - 0.02 && c().tn > 0.3 },
      { label: 'SERCA pumps Ca²⁺ back (ATP)', test: () => sim.atp > 0 && c().ca > 0.4 && c().ryr < 0.1 },
      { label: 'troponin lets go', test: () => c().tn < 0.4 && c().tn > 0.1 && c().ryr < 0.1 },
      { label: 'force falls', test: () => sim.force > 0.03 && c().force > c().xb + 0.01 },
    ];
  }

  // =========================================================================
  // Whole fibre (full size, zoom slide, and inset)
  // =========================================================================
  // h leaves a 25 px band inside each face for the T-tubules and the terminal cisternae they meet.
  const FIB = { x0: 70, x1: 860, cy: 262, h: 110, epX: 465 };
  const MYO_Y = (k) => FIB.cy - 24 + k * 24;   // three myofibril stripes, centred

  function drawFibre(parent, opts) {
    opts = opts || {};
    const g = svgEl('g', { class: 'fibre' }, parent);
    const parts = {};
    const n = sim.comps.length, W = FIB.x1 - FIB.x0, segW = W / n;
    const yTop = FIB.cy - FIB.h / 2, yBot = FIB.cy + FIB.h / 2;
    // tendons
    parts.tendonL = svgEl('path', { d: `M10,${FIB.cy - 14} L${FIB.x0},${yTop + 10} L${FIB.x0},${yBot - 10} L10,${FIB.cy + 14} Z`, fill: '#e6e2d6', stroke: '#8b8778', 'stroke-width': 2 }, g);
    parts.tendonR = svgEl('path', { d: `M920,${FIB.cy - 14} L${FIB.x1},${yTop + 10} L${FIB.x1},${yBot - 10} L920,${FIB.cy + 14} Z`, fill: '#e6e2d6', stroke: '#8b8778', 'stroke-width': 2 }, g);
    // the fibre body scales about its centre with force
    parts.body = svgEl('g', {}, g);
    const body = parts.body;
    // sarcolemma segments (fill = membrane potential)
    parts.segs = [];
    const segLayer = svgEl('g', { 'data-part': 'sarcolemma' }, body);
    for (let i = 0; i < n; i++) parts.segs.push(svgEl('rect', { x: FIB.x0 + i * segW, y: yTop, width: segW + 0.6, height: FIB.h, fill: '#7d8aa5' }, segLayer));
    // myofibrils: three stripes with striations
    parts.myofibril = svgEl('g', { 'data-part': 'myofibril' }, body);
    parts.striations = [];
    for (let k = 0; k < 3; k++) {
      const y = MYO_Y(k);
      svgEl('rect', { x: FIB.x0 + 4, y: y - 6, width: W - 8, height: 12, rx: 3, fill: 'rgba(255,255,255,.55)', stroke: 'rgba(42,47,58,.35)' }, parts.myofibril);
      const st = svgEl('g', { stroke: 'rgba(42,47,58,.45)', 'stroke-width': 1.2 }, parts.myofibril);
      parts.striations.push(st);
    }
    // membrane outline (clickable sarcolemma; drawn before the tubules so their mouths sit on top of it)
    parts.outline = svgEl('rect', { 'data-part': 'sarcolemma', x: FIB.x0, y: yTop, width: W, height: FIB.h, rx: 6, fill: 'none', stroke: '#2a2f3a', 'stroke-width': 3 }, body);
    // Sarcoplasmic reticulum: a longitudinal sleeve inside each face that swells into a pair of
    // terminal cisternae beside every T-tubule — the calcium store students are asked to find,
    // drawn as something they can actually see and click rather than a faint stripe.
    parts.sr = svgEl('g', { 'data-part': 'sr' }, body);
    parts.cisternae = [];
    const TUBE_IN = 26, CIS_H = 17;                       // how far a tubule dives, cistern height
    const faces = [{ sign: 1, edge: yTop }, { sign: -1, edge: yBot }];
    for (const f of faces) {
      const cy = f.edge + f.sign * (TUBE_IN / 2 + 1);
      svgEl('rect', { x: FIB.x0 + 3, y: cy - 3, width: W - 6, height: 6, rx: 3, fill: SR_BLUE, opacity: 0.35 }, parts.sr);
      for (let i = 0; i < n; i++) {
        const x = FIB.x0 + (i + 0.5) * segW;
        for (const dx of [-13, 4]) parts.cisternae.push(svgEl('rect', { x: x + dx, y: cy - CIS_H / 2, width: 9, height: CIS_H, rx: 4, fill: SR_BLUE, stroke: '#1c6fa8', 'stroke-width': 1 }, parts.sr));
      }
    }
    // T-tubules: inward tunnels of the sarcolemma, on BOTH faces of the fibre (they are folds of
    // the surface, so every face has them), each with an open mouth so the tunnel reads as a tunnel.
    parts.ttubule = svgEl('g', { 'data-part': 'ttubule' }, body);
    parts.tubes = [];
    parts.tubeX = [];
    for (const f of faces) {
      for (let i = 0; i < n; i++) {
        const x = FIB.x0 + (i + 0.5) * segW;
        if (f.sign > 0) parts.tubeX.push(x);
        const d = `M${x},${f.edge - f.sign * 5} l0,${f.sign * (TUBE_IN + 5)}`;
        parts.tubes.push(svgEl('path', { d, stroke: TUBULE, 'stroke-width': 7, 'stroke-linecap': 'round' }, parts.ttubule));
        svgEl('path', { d, stroke: '#f4f1e6', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, parts.ttubule);   // lumen: it is a tunnel, not a peg
        svgEl('ellipse', { cx: x, cy: f.edge, rx: 7, ry: 4, fill: '#f4f1e6', stroke: TUBULE, 'stroke-width': 2 }, parts.ttubule);
      }
    }
    parts.faces = faces; parts.TUBE_IN = TUBE_IN;
    // motor end plate: a nerve ending stub pressed on the middle of the fibre
    parts.endplate = svgEl('g', { 'data-part': 'endplate' }, body);
    svgEl('path', { d: `M${FIB.epX - 60},40 C${FIB.epX - 30},60 ${FIB.epX - 10},90 ${FIB.epX},${yTop - 26}`, fill: 'none', stroke: '#4a4f5a', 'stroke-width': 5, 'stroke-linecap': 'round' }, parts.endplate);
    parts.terminalBulb = svgEl('ellipse', { cx: FIB.epX, cy: yTop - 14, rx: 22, ry: 12, fill: '#7d8aa5', stroke: '#2a2f3a', 'stroke-width': 2.5 }, parts.endplate);
    svgEl('path', { d: `M${FIB.epX - 22},${yTop - 4} l6,6 l6,-6 l6,6 l6,-6 l6,6 l6,-6 l6,6`, fill: 'none', stroke: '#2a2f3a', 'stroke-width': 1.5 }, parts.endplate);
    svgEl('text', { x: FIB.epX - 70, y: 36, 'font-size': 11, fill: '#6b6b60', text: 'from the motor nerve' }, parts.endplate);
    // stimulating electrodes at the end plate
    parts.stimulator = svgEl('g', { opacity: opts.stimulator ? 1 : 0 }, body);
    for (const dx of [-42, 42]) {
      svgEl('line', { x1: FIB.epX + dx, y1: yBot + 6, x2: FIB.epX + dx, y2: yBot + 70, stroke: '#4a4f5a', 'stroke-width': 3 }, parts.stimulator);
      svgEl('rect', { x: FIB.epX + dx - 8, y: yBot + 70, width: 16, height: 16, fill: '#4a4f5a' }, parts.stimulator);
    }
    parts.stimFlash = svgEl('circle', { cx: FIB.epX, cy: yBot + 6, r: 14, fill: ION_COLOR.Na, opacity: 0 }, parts.stimulator);
    svgEl('text', { x: FIB.epX, y: yBot + 100, 'font-size': 11, fill: '#4a4f5a', 'text-anchor': 'middle', text: 'stimulating electrodes' }, parts.stimulator);
    // recording electrode (hidden until the electrode scene)
    const eIdx = sim.byName[opts.electrodeAt || 'R3'].index, ex = FIB.x0 + (eIdx + 0.5) * segW;
    parts.electrode = svgEl('g', { class: 'electrode', opacity: 0, 'pointer-events': 'none' }, g);
    svgEl('path', { d: `M${ex - 4},${yTop + 30} L${ex + 40},${yTop - 130} L${ex + 54},${yTop - 130} L${ex + 2},${yTop + 32} Z`, fill: '#dfe6f2', stroke: '#2a2f3a', 'stroke-width': 1.5 }, parts.electrode);
    svgEl('rect', { x: ex + 36, y: yTop - 155, width: 22, height: 26, fill: '#4a4f5a' }, parts.electrode);
    svgEl('text', { x: ex + 66, y: yTop - 136, 'font-size': 12, fill: '#4a4f5a', text: 'recording electrode' }, parts.electrode);
    svgEl('line', { x1: 800, y1: 120, x2: 800, y2: 60, stroke: '#4a4f5a', 'stroke-width': 3 }, parts.electrode);
    svgEl('rect', { x: 790, y: 40, width: 20, height: 22, fill: '#4a4f5a' }, parts.electrode);
    svgEl('text', { x: 816, y: 58, 'font-size': 12, fill: '#4a4f5a', text: 'reference (outside)' }, parts.electrode);
    // Highlight marks: each structure gets shapes drawn over the structure itself, so "these are
    // the T-tubules" points at the tubules rather than sweeping an ellipse over part of the membrane.
    parts.markLayer = svgEl('g', { class: 'marks', 'pointer-events': 'none' }, g);
    parts.marks = {};
    const MARK = { stroke: '#2f6fd6', fill: 'none', 'stroke-width': 2.5, 'stroke-dasharray': '7 5' };
    const mark = (name, tag, attrs) => {
      const el = svgEl(tag, Object.assign({}, MARK, attrs), parts.markLayer);
      (parts.marks[name] = parts.marks[name] || []).push(el);
      return el;
    };
    mark('sarcolemma', 'rect', { x: FIB.x0 - 5, y: yTop - 5, width: W + 10, height: FIB.h + 10, rx: 9 });
    mark('sarcolemma', 'rect', { x: FIB.x0 + 5, y: yTop + 5, width: W - 10, height: FIB.h - 10, rx: 4, 'stroke-width': 1.5, opacity: 0.6 });
    for (const f of faces) {
      // a tint down each tunnel, and one dashed band round the row of them
      for (const x of parts.tubeX)
        mark('ttubule', 'line', { x1: x, y1: f.edge - f.sign * 8, x2: x, y2: f.edge + f.sign * (TUBE_IN + 5), stroke: '#2f6fd6', 'stroke-width': 13, 'stroke-linecap': 'round', 'stroke-dasharray': 'none', opacity: 0.3 });
      const tTop = Math.min(f.edge - 9, f.edge + f.sign * (TUBE_IN + 6));
      mark('ttubule', 'rect', { x: FIB.x0 - 3, y: tTop, width: W + 6, height: TUBE_IN + 15, rx: 9 });
      const cy = f.edge + f.sign * (TUBE_IN / 2 + 1);
      for (const x of parts.tubeX)
        mark('sr', 'rect', { x: x - 15, y: cy - CIS_H / 2 - 3, width: 30, height: CIS_H + 6, rx: 6, fill: '#2f6fd6', stroke: 'none', 'stroke-dasharray': 'none', opacity: 0.22 });
      mark('sr', 'rect', { x: FIB.x0 - 2, y: cy - CIS_H / 2 - 5, width: W + 4, height: CIS_H + 10, rx: 8 });
    }
    for (let k = 0; k < 3; k++) mark('myofibril', 'rect', { x: FIB.x0 + 1, y: MYO_Y(k) - 9, width: W - 2, height: 18, rx: 6 });
    mark('endplate', 'ellipse', { cx: FIB.epX, cy: yTop - 14, rx: 34, ry: 22 });
    Object.values(parts.marks).forEach(list => list.forEach(el => el.setAttribute('visibility', 'hidden')));
    // labels
    parts.labels = svgEl('g', { class: 'labels', 'pointer-events': 'none', 'font-size': 13, fill: '#3a3f4a' }, g);
    // Each label carries a leader line to the structure it names; the inner structures are small
    // enough that a floating word near the fibre is not enough to identify them.
    [['Sarcolemma (membrane)', 160, yBot + 40, 160, yBot + 2],
     ['T-tubules', 250, yTop - 32, 233, yTop - 9],
     ['Sarcoplasmic reticulum (Ca²⁺ store)', 690, yTop - 32, 703, yTop + 13],
     ['Myofibrils', 700, yBot + 40, 720, MYO_Y(2)],
     ['Motor end plate', FIB.epX - 132, yTop - 58, FIB.epX - 22, yTop - 18]]
      .forEach(([t, x, y, lx, ly]) => {
        const y0 = ly > y ? y + 6 : y - 14;
        for (const w of [{ stroke: '#f6f5f0', 'stroke-width': 3.5 }, { stroke: '#8b8778', 'stroke-width': 1.2 }])
          svgEl('line', Object.assign({ x1: x, y1: y0, x2: lx, y2: ly }, w), parts.labels);
        svgEl('circle', { cx: lx, cy: ly, r: 2.6, fill: '#8b8778' }, parts.labels);
        for (const w of [{ stroke: '#f6f5f0', 'stroke-width': 4, 'stroke-linejoin': 'round' }, { fill: '#3a3f4a' }])
          svgEl('text', Object.assign({ x, y, 'text-anchor': 'middle', text: t }, w), parts.labels);
      });
    // force gauge
    parts.gauge = opts.showForce === false ? null : forceGauge(g, 880, 340, 120, 'Force');
    parts.scale = svgEl('text', { x: FIB.x0, y: 500, 'font-size': 11, fill: '#6b7280', text: 'about 3 cm long, 50 µm thick (not to scale)' }, g);
    return { g, parts };
  }

  function updateFibre(parts, opts) {
    opts = opts || {};
    const n = sim.comps.length;
    for (let i = 0; i < n; i++) parts.segs[i].setAttribute('fill', vColor(sim.comps[i].V));
    parts.terminalBulb.setAttribute('fill', vColor(sim.nerveV));
    // shortening: scale the body about the fibre's centre; striations tighten
    const F = clamp(sim.force, 0, 1.05), s = 1 - 0.1 * F;
    const cx = (FIB.x0 + FIB.x1) / 2;
    parts.body.setAttribute('transform', `translate(${cx},0) scale(${s.toFixed(4)},1) translate(${-cx},0)`);
    const period = 22 - 3 * F;
    if (parts._lastPeriod == null || Math.abs(parts._lastPeriod - period) > 0.4) {
      parts._lastPeriod = period;
      parts.striations.forEach((st, k) => {
        const y = MYO_Y(k);
        let d = '';
        for (let x = FIB.x0 + 8; x < FIB.x1 - 4; x += period) d += `M${x.toFixed(1)},${y - 5} l0,10 `;
        if (!st.firstChild) svgEl('path', { d, fill: 'none' }, st); else st.firstChild.setAttribute('d', d);
      });
    }
    const nc = sim.comps.length;
    parts.tubes.forEach((t, i) => t.setAttribute('stroke', sim.sensorState(sim.comps[i % nc]) === 'active' ? ION_COLOR.Na : TUBULE));
    parts.sr.setAttribute('opacity', (0.3 + 0.7 * sim.srLevel).toFixed(3));
    if (parts.gauge) parts.gauge.update(sim.force);
    if (parts.stimFlash) { const st = sim.stim; const on = Object.keys(st).length > 0; parts.stimFlash.setAttribute('opacity', on ? 0.8 : 0); }
    if (app.electrode && !parts._electrodeShown) {
      parts._electrodeShown = true; parts.electrode.setAttribute('opacity', 1);
      if (!opts.hideLabels) parts.electrode.animate([{ transform: 'translate(40px,-260px)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1 }], { duration: 1400, easing: 'cubic-bezier(.2,.7,.2,1)' });
    } else if (!app.electrode) { parts._electrodeShown = false; parts.electrode.setAttribute('opacity', 0); }
    parts.labels.setAttribute('opacity', app.labels && !opts.hideLabels ? 1 : 0);
  }

  function drawCell(parent, opts, kit) {
    bind(kit);
    opts = opts || {};
    const d = drawFibre(parent, Object.assign({ showForce: !opts.inset }, opts));
    if (opts.inset) { d.parts.labels.setAttribute('opacity', 0); d.parts.electrode.setAttribute('opacity', 0); d.parts.stimulator.setAttribute('opacity', 0); d.parts.scale.setAttribute('opacity', 0); }
    return { g: d.g, parts: d.parts, update: (o) => updateFibre(d.parts, o) };
  }

  // =========================================================================
  // Views
  // =========================================================================
  const views = {};

  // ---------------------------------------------------------------- zoom intro
  views.zoomMuscle = function () {
    let svg, slides = [], idx = 0, fib, miniTrace, miniGauge, shocked = false;
    const captions = [
      'A person lifting a cup. Every movement is muscle fibres pulling on bones.',
      'The upper arm: the biceps shortens and the elbow bends.',
      'A muscle is a bundle of bundles: fascicles wrapped in connective tissue.',
      'One fascicle: dozens of long cylindrical cells, the muscle fibres, side by side.',
      'One fibre. The brief spike on the small trace is the impulse; the bump on the gauge is the twitch it caused.',
    ];
    function build() {
      svg = svgEl('svg', { viewBox: '0 0 930 520' });
      const bg = (s) => svgEl('rect', { x: 0, y: 0, width: 930, height: 520, fill: '#f6f5f0' }, s);
      // slide 0: person lifting a cup
      const s0 = svgEl('g', {}, svg); bg(s0);
      const hx = 450, hy = 92, skin = '#d9b99b', cloth = '#5b7fb3', sleeve = '#43648f', ink = '#2f3a4d';
      svgEl('path', { d: `M${hx - 46},${hy + 210} L${hx - 40},${hy + 388} L${hx - 10},${hy + 388} L${hx - 4},${hy + 250} L${hx + 4},${hy + 250} L${hx + 10},${hy + 388} L${hx + 40},${hy + 388} L${hx + 46},${hy + 210} Z`, fill: '#3f4d66', stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      svgEl('path', { d: `M${hx - 62},${hy + 75} C${hx - 30},${hy + 52} ${hx + 30},${hy + 52} ${hx + 62},${hy + 75} L${hx + 52},${hy + 215} L${hx - 52},${hy + 215} Z`, fill: cloth, stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      // left arm down, right arm bent up holding a cup
      svgEl('path', { d: `M${hx - 62},${hy + 78} L${hx - 92},${hy + 220} L${hx - 70},${hy + 226} L${hx - 44},${hy + 110} Z`, fill: sleeve, stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      // The elbow is held open so the upper arm stays visible: the circle below marks the biceps,
      // which is what slide 1 zooms into, and a folded-shut forearm would hide it.
      svgEl('path', { d: `M${hx + 62},${hy + 78} L${hx + 116},${hy + 200} L${hx + 92},${hy + 210} L${hx + 40},${hy + 108} Z`, fill: sleeve, stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      svgEl('path', { d: `M${hx + 116},${hy + 200} L${hx + 152},${hy + 72} L${hx + 128},${hy + 66} L${hx + 92},${hy + 210} Z`, fill: skin, stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      svgEl('circle', { cx: hx - 82, cy: hy + 232, r: 11, fill: skin, stroke: ink, 'stroke-width': 2 }, s0);
      svgEl('circle', { cx: hx + 143, cy: hy + 60, r: 11, fill: skin, stroke: ink, 'stroke-width': 2 }, s0);
      svgEl('path', { d: `M${hx + 130},${hy + 32} l30,0 l-4,26 l-22,0 Z`, fill: '#fff', stroke: ink, 'stroke-width': 2 }, s0);
      svgEl('rect', { x: hx - 12, y: hy + 30, width: 24, height: 34, fill: skin, stroke: ink, 'stroke-width': 2 }, s0);
      svgEl('ellipse', { cx: hx, cy: hy, rx: 34, ry: 40, fill: skin, stroke: ink, 'stroke-width': 2.5 }, s0);
      svgEl('path', { d: `M${hx - 34},${hy - 6} C${hx - 30},${hy - 50} ${hx + 30},${hy - 50} ${hx + 34},${hy - 6} C${hx + 20},${hy - 22} ${hx - 20},${hy - 22} ${hx - 34},${hy - 6} Z`, fill: '#4a3a2e' }, s0);
      svgEl('ellipse', { cx: hx + 70, cy: hy + 146, rx: 28, ry: 76, transform: `rotate(-24, ${hx + 70}, ${hy + 146})`, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, s0);
      svgEl('text', { x: hx + 96, y: hy + 250, 'font-size': 13, fill: '#2f6fd6', text: 'the upper arm' }, s0);
      slides.push(s0);
      // slide 1: the same flexed arm as slide 0, turned side-on. The forearm points UP, the way
      // it does in slide 0, so the biceps is seen pulling it towards the shoulder, not away.
      const s1 = svgEl('g', {}, svg); bg(s1);
      const a1 = svgEl('g', { transform: 'translate(-40,100)' }, s1);
      svgEl('circle', { cx: 168, cy: 211, r: 40, fill: skin, stroke: ink, 'stroke-width': 2.5 }, a1);      // shoulder
      svgEl('path', { d: 'M180,160 L688,160 L722,210 L688,262 L180,262 Z', fill: skin, stroke: ink, 'stroke-width': 3, 'stroke-linejoin': 'round' }, a1);   // upper arm
      svgEl('path', { d: 'M668,199 L733,41 L797,67 L732,225 Z', fill: skin, stroke: ink, 'stroke-width': 3, 'stroke-linejoin': 'round' }, a1);              // forearm, flexed up
      svgEl('circle', { cx: 768, cy: 50, r: 16, fill: skin, stroke: ink, 'stroke-width': 2.5 }, a1);       // hand
      svgEl('rect', { x: 206, y: 197, width: 446, height: 26, rx: 7, fill: '#efe7d3', stroke: '#8b8778', 'stroke-width': 2 }, a1);   // humerus
      svgEl('circle', { cx: 700, cy: 211, r: 15, fill: '#efe7d3', stroke: '#8b8778', 'stroke-width': 2 }, a1);                       // elbow joint
      svgEl('path', { d: 'M232,192 L196,202 M668,176 C692,168 700,150 709,126', stroke: '#e6e2d6', 'stroke-width': 9, 'stroke-linecap': 'round' }, a1);   // tendons
      svgEl('path', { d: 'M232,192 C330,104 566,104 668,176 C566,150 330,152 232,200 Z', fill: '#c9605a', stroke: '#7a2e2a', 'stroke-width': 3, 'stroke-linejoin': 'round' }, a1);
      svgEl('path', { d: 'M812,176 C852,146 862,106 856,72', fill: 'none', stroke: '#2f6fd6', 'stroke-width': 3, 'stroke-linecap': 'round' }, a1);
      svgEl('path', { d: 'M856,64 l-9,18 l18,0 Z', fill: '#2f6fd6' }, a1);
      svgEl('text', { x: 828, y: 214, 'font-size': 13, 'text-anchor': 'middle', fill: '#2f6fd6', text: 'the elbow bends' }, a1);
      svgEl('text', { x: 440, y: 66, 'font-size': 15, 'font-weight': 700, 'text-anchor': 'middle', fill: '#7a2e2a', text: 'biceps (it shortens)' }, a1);
      svgEl('text', { x: 420, y: 246, 'font-size': 12, 'text-anchor': 'middle', fill: '#6b6b60', text: 'bone (humerus)' }, a1);
      svgEl('text', { x: 168, y: 274, 'font-size': 12, 'text-anchor': 'middle', fill: '#6b6b60', text: 'shoulder' }, a1);
      svgEl('ellipse', { cx: 448, cy: 146, rx: 244, ry: 60, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, a1);
      slides.push(s1);
      // slide 2: muscle of fascicles
      const s2 = svgEl('g', {}, svg); bg(s2);
      svgEl('path', { d: 'M120,260 C200,120 730,120 810,260 C730,400 200,400 120,260 Z', fill: '#e8b3ae', stroke: '#7a2e2a', 'stroke-width': 3 }, s2);
      for (let i = 0; i < 7; i++) { const y = 200 + i * 20; svgEl('path', { d: `M${150 + Math.abs(i - 3) * 40},${y} L${780 - Math.abs(i - 3) * 40},${y}`, stroke: '#c9605a', 'stroke-width': 12, 'stroke-linecap': 'round', opacity: 0.85 }, s2); }
      svgEl('text', { x: 465, y: 440, 'font-size': 13, 'text-anchor': 'middle', fill: '#7a2e2a', text: 'fascicles (bundles of fibres) wrapped in connective tissue' }, s2);
      svgEl('circle', { cx: 465, cy: 260, r: 40, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, s2);
      slides.push(s2);
      // slide 3: one fascicle, many fibres
      const s3 = svgEl('g', {}, svg); bg(s3);
      svgEl('rect', { x: 100, y: 100, width: 730, height: 320, rx: 60, fill: '#f1d9d6', stroke: '#7a2e2a', 'stroke-width': 3 }, s3);
      for (let i = 0; i < 9; i++) { const y = 125 + i * 32; svgEl('rect', { x: 120, y, width: 690, height: 22, rx: 11, fill: i === 4 ? '#e8772e' : '#c9605a', stroke: '#7a2e2a', 'stroke-width': 1.5, opacity: i === 4 ? 1 : 0.8 }, s3); for (let x = 140; x < 800; x += 14) svgEl('line', { x1: x, y1: y + 4, x2: x, y2: y + 18, stroke: 'rgba(60,20,20,.35)' }, s3); }
      svgEl('ellipse', { cx: 465, cy: 264, rx: 380, ry: 20, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, s3);
      svgEl('text', { x: 465, y: 450, 'font-size': 13, 'text-anchor': 'middle', fill: '#7a2e2a', text: 'each stripe is one cell: a muscle fibre' }, s3);
      slides.push(s3);
      // slide 4: one fibre, with a small trace and gauge driven by the model
      const s4 = svgEl('g', {}, svg); bg(s4);
      fib = drawFibre(s4, { stimulator: false, showForce: true });
      fib.parts.labels.setAttribute('opacity', 0); fib.parts.scale.setAttribute('opacity', 0);
      const tg = svgEl('g', { transform: 'translate(70,380)', 'font-size': 11, fill: '#3a3f4a' }, s4);
      svgEl('text', { x: 0, y: -8, 'font-weight': 700, 'font-size': 12, text: 'Voltage inside the fibre (last 60 ms)' }, tg);
      svgEl('rect', { x: 0, y: 0, width: 500, height: 100, fill: '#fff', stroke: '#d9d6cc' }, tg);
      miniTrace = svgEl('polyline', { fill: 'none', stroke: '#1f2430', 'stroke-width': 2 }, tg);
      svgEl('text', { x: 4, y: 96, fill: '#6b7280', text: 'rest' }, tg);
      svgEl('text', { x: 4, y: 12, fill: '#6b7280', text: '+50 mV' }, tg);
      slides.push(s4);
      slides.forEach((s, i) => { s.style.transition = 'opacity .7s ease, transform .9s ease'; s.style.transformOrigin = '50% 40%'; s.style.opacity = i === 0 ? 1 : 0; s.style.transform = i === 0 ? 'scale(1)' : 'scale(0.4)'; });
    }
    function show(i) {
      idx = clamp(i, 0, slides.length - 1);
      slides.forEach((s, k) => {
        if (k < idx) { s.style.opacity = 0; s.style.transform = 'scale(3)'; }
        else if (k === idx) { s.style.opacity = 1; s.style.transform = 'scale(1)'; }
        else { s.style.opacity = 0; s.style.transform = 'scale(0.4)'; }
      });
      setCaption(`Zoom level ${idx + 1} of ${slides.length}`);
      if (idx === slides.length - 1 && !shocked) { shocked = true; app.paused = false; setTimeout(() => sim.shock(1.5), 600); }
    }
    return {
      mount(el) { build(); el.appendChild(svg); show(0); },
      update() {
        if (idx !== slides.length - 1) return;
        updateFibre(fib.parts, { hideLabels: true });
        const t1 = sim.t, t0 = t1 - 60, pts = [];
        for (const s of app.history) { if (s.t < t0) continue; const V = s.V.R3; if (V == null) continue; pts.push(`${((s.t - t0) / 60 * 500).toFixed(1)},${(100 - (clamp(V, -100, 50) + 100) / 150 * 100).toFixed(1)}`); }
        miniTrace.setAttribute('points', pts.join(' '));
      },
      narrate() { return captions[idx]; },
      next() { show(idx + 1); return idx; },
      get index() { return idx; },
      get last() { return idx === slides.length - 1; },
    };
  };

  // ---------------------------------------------------------------- whole fibre
  views.fibre = function (opts) {
    let svg, d, onPart = null, ghost = null, shown = 'none';
    function showMarks(part) {
      shown = part || 'none';
      for (const [name, list] of Object.entries(d.parts.marks))
        list.forEach(el => el.setAttribute('visibility', name === part ? 'visible' : 'hidden'));
    }
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 930 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 930, height: 520, fill: '#f6f5f0' }, svg);
        d = drawFibre(svg, opts);
        for (const el2 of d.g.querySelectorAll('[data-part]')) {
          el2.style.cursor = 'pointer';
          el2.addEventListener('click', (e) => { e.stopPropagation(); if (onPart) onPart(el2.getAttribute('data-part')); });
        }
        setCaption(opts.caption || '');
      },
      update() { updateFibre(d.parts, opts); },
      set onPart(fn) { onPart = fn; },
      highlight(part) { showMarks(part); },
      // A ghost of the structure: it appears, pulses, and fades again, so a student who cannot find
      // a small structure is shown where it is without the outline sitting over the model afterwards.
      hint(part) {
        if (!d.parts.marks[part]) return;
        showMarks(part);
        if (ghost) clearTimeout(ghost);
        d.parts.marks[part].forEach(el => {
          if (el.animate) el.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0.25 }, { opacity: 1 }, { opacity: 0 }],
            { duration: 2600, easing: 'ease-in-out' });
        });
        ghost = setTimeout(() => { if (shown !== 'locked') showMarks('none'); ghost = null; }, 2600);
      },
      parts: () => d.parts,
      narrate() {
        const ep = sim.endplate, r3 = R3(), F = sim.force;
        const lead = sim.comps.find(c => c.V > -20 && c.dVdt > 0);
        if (sim.atp === 0 && F > 0.3) return `<b>Rigor:</b> with no ATP the cross-bridges cannot let go and Ca²⁺ cannot be pumped back, so the fibre stays contracted with no impulses at all.`;
        if (sim.isFused) return `<b>Fused tetanus:</b> impulses arrive faster than Ca²⁺ can be pumped back, troponin stays switched on, force is smooth and maximal (${F.toFixed(2)}).`;
        if (lead) return `<b>Impulse spreading</b> (segment ${lead.name}): Na⁺ entering here depolarizes the next patch of membrane, whose Na⁺ channels open in turn.`;
        if (r3.ca > 0.6 && F < 0.1) return `Ca²⁺ has been released from the store into the cytosol (${sim.ca.toFixed(1)} µM) → it is binding troponin → force is about to rise.`;
        if (F > 0.05 && r3.force <= r3.xb) return `<b>Force rising</b> (${F.toFixed(2)}): cross-bridges are pulling and the fibre shortens. The impulse is already over.`;
        if (F > 0.05) return `<b>Relaxing</b> (${F.toFixed(2)}): SERCA is pumping Ca²⁺ back into the store, troponin lets go, bridges stop forming.`;
        if (Math.abs(sim.receptor.g) > 0.5) return `The end plate is depolarizing: receptor channels at the end plate are open.`;
        if (ep.V > -60 && ep.dVdt > 0 && Object.keys(sim.stim).length) return `A shock is pushing positive charge into the fibre at the end plate.`;
        return `<b>At rest:</b> ${fmtV(r3.V)} mV inside, no force. The fibre is a charged battery waiting for a trigger.`;
      },
    };
  };

  // ---------------------------------------------------------------- unrolled fibre with channel states
  views.fibreWave = function (opts) {
    const X0 = 40, X1 = 860, Y_TOP = 190, Y_BOT = 290;
    let svg, segs = [], naChans = [], kChans = [], tubes = [], particles, counters = [], vProfile, arrows, insetParts;
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 900 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, svg);
        svgEl('rect', { x: 20, y: 60, width: 860, height: Y_TOP - 60, fill: '#eef2fa', rx: 10 }, svg);
        svgEl('text', { x: 30, y: 80, 'font-size': 13, fill: '#4a5468', 'font-weight': 600, text: 'OUTSIDE' }, svg);
        const cs = sim.comps, n = cs.length;
        const segLayer = svgEl('g', {}, svg);
        for (let i = 0; i < n; i++) {
          const x0 = lerp(X0, X1, i / n), x1 = lerp(X0, X1, (i + 1) / n);
          segs.push(svgEl('rect', { x: x0, y: Y_TOP + 6, width: x1 - x0 + 0.5, height: Y_BOT - Y_TOP - 12, fill: '#fbf3e6' }, segLayer));
          svgEl('text', { x: (x0 + x1) / 2, y: Y_BOT + 60, 'font-size': 10, 'text-anchor': 'middle', fill: '#6b7280', text: cs[i].kind === 'endplate' ? 'end plate' : cs[i].name }, svg);
          counters.push(fluxCounter(0.25));
          // T-tubule opening below each segment
          const xc = (x0 + x1) / 2;
          tubes.push(svgEl('path', { d: `M${xc - 5},${Y_BOT - 8} l0,22 l10,0 l0,-22`, fill: 'none', stroke: TUBULE, 'stroke-width': 3 }, svg));
        }
        svgEl('text', { x: X0 + 10, y: Y_BOT - 18, 'font-size': 13, fill: '#6b5a3a', 'font-weight': 600, text: 'INSIDE the fibre' }, svg);
        svgEl('text', { x: X0 + 10, y: Y_BOT + 42, 'font-size': 11, fill: TUBULE, text: 'T-tubule openings (the membrane folds inward here)' }, svg);
        svgEl('rect', { x: X0, y: Y_TOP, width: X1 - X0, height: 8, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg);
        svgEl('rect', { x: X0, y: Y_BOT - 8, width: X1 - X0, height: 8, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg);
        const chLayer = svgEl('g', {}, svg);
        for (let i = 0; i < n; i++) {
          const xc = lerp(X0, X1, (i + 0.5) / n), w = (X1 - X0) / n;
          naChans.push(drawChannel(chLayer, xc - w * 0.22, Y_TOP - 10, Y_TOP + 18, 'Na_v', 0.5));
          kChans.push(drawChannel(chLayer, xc + w * 0.22, Y_TOP - 10, Y_TOP + 18, 'K_v', 0.5));
        }
        // stimulating electrode mark at the end plate
        const epx = lerp(X0, X1, (sim.endplate.index + 0.5) / n);
        svgEl('path', { d: `M${epx},${Y_TOP - 60} l0,30 m-8,-8 l8,8 l8,-8`, fill: 'none', stroke: '#4a4f5a', 'stroke-width': 3 }, svg);
        svgEl('text', { x: epx, y: Y_TOP - 66, 'font-size': 11, 'text-anchor': 'middle', fill: '#4a4f5a', text: 'shock here' }, svg);
        // Where the trace below comes from, drawn in the trace's own colour, and the two ends
        // named the way the trace's marks name them.
        const rec = app.recordComp || (profile && profile.comp);
        const recIdx = sim.byName[rec] ? sim.byName[rec].index : -1;
        if (recIdx >= 0) {
          const rx = lerp(X0, X1, (recIdx + 0.5) / n);
          const col = (profile && profile.traceColors && profile.traceColors[rec]) || '#1f2430';
          svgEl('rect', { x: rx - 9, y: 140, width: 18, height: 14, rx: 3, fill: col }, svg);
          svgEl('line', { x1: rx, y1: 154, x2: rx, y2: Y_TOP + 10, stroke: col, 'stroke-width': 2.5 }, svg);
          svgEl('text', { x: rx, y: 132, 'font-size': 11, 'text-anchor': 'middle', 'font-weight': 700, fill: col, text: 'recording electrode' }, svg);
          svgEl('text', { x: rx, y: 120, 'font-size': 10, 'text-anchor': 'middle', fill: col, text: '(the trace below is from here)' }, svg);
        }
        svgEl('text', { x: lerp(X0, X1, 0.5 / n), y: Y_BOT + 74, 'font-size': 10, 'text-anchor': 'middle', fill: '#6b7280', text: 'other end' }, svg);
        svgEl('text', { x: lerp(X0, X1, (n - 0.5) / n), y: Y_BOT + 74, 'font-size': 10, 'text-anchor': 'middle', fill: '#6b7280', text: 'far end' }, svg);
        arrows = svgEl('g', {}, svg);
        particles = makeParticles(svgEl('g', {}, svg));
        const lg = svgEl('g', { transform: 'translate(56,98)', 'font-size': 12, fill: '#3a3f4a' }, svg);
        const mk = (x, y, type, state, label) => { const gg = svgEl('g', { transform: `translate(${x},${y})` }, lg); const c = drawChannel(gg, 0, 0, 26, type, 0.55); setChannelState(c, state); svgEl('text', { x: 16, y: 17, text: label }, gg); };
        mk(0, 0, 'Na_v', 'closed', 'Na⁺ closed'); mk(100, 0, 'Na_v', 'open', 'Na⁺ open'); mk(190, 0, 'Na_v', 'inactivated', 'Na⁺ inactivated (refractory)');
        mk(0, 38, 'K_v', 'closed', 'K⁺ closed'); mk(100, 38, 'K_v', 'open', 'K⁺ open');
        const pg = svgEl('g', {}, svg);
        svgEl('text', { x: X0, y: 388, 'font-size': 12, fill: '#4a4f5a', 'font-weight': 600, text: 'Membrane potential along the fibre (snapshot)' }, pg);
        svgEl('line', { x1: X0, y1: 500, x2: X1, y2: 500, stroke: '#9ca3af' }, pg);
        svgEl('line', { x1: X0, y1: 430, x2: X1, y2: 430, stroke: '#d1d5db', 'stroke-dasharray': '4 4' }, pg);
        svgEl('text', { x: X0 - 4, y: 504, 'font-size': 10, 'text-anchor': 'end', fill: '#6b7280', text: '−85' }, pg);
        svgEl('text', { x: X0 - 4, y: 434, 'font-size': 10, 'text-anchor': 'end', fill: '#6b7280', text: '0' }, pg);
        svgEl('text', { x: X0 - 4, y: 400, 'font-size': 10, 'text-anchor': 'end', fill: '#6b7280', text: '+40' }, pg);
        vProfile = svgEl('polyline', { fill: 'none', stroke: '#1f2430', 'stroke-width': 2.5 }, pg);
        insetParts = drawInset(svg, 'fibre');
        setCaption(opts.caption || '');
      },
      update(dtReal, dtSim) {
        const cs = sim.comps, n = cs.length, E = sim.E;
        arrows.innerHTML = '';
        const pts = [];
        for (let i = 0; i < n; i++) {
          const c = cs[i];
          segs[i].setAttribute('fill', insideFill(c.V));
          setChannelState(naChans[i], sim.naState(c));
          setChannelState(kChans[i], sim.kState(c));
          tubes[i].setAttribute('stroke', sim.sensorState(c) === 'active' ? ION_COLOR.Na : TUBULE);
          tubes[i].setAttribute('stroke-width', sim.sensorState(c) === 'active' ? 4.5 : 3);
          if (!app.paused) {
            if (naChans[i].state === 'open') { const m = Math.min(2, counters[i](c.gNa * (c.V - E.Na), dtSim)); for (let j = 0; j < m; j++) particles.spawn('Na', naChans[i].x + rand(-5, 5), Y_TOP - 40 - rand(0, 40), naChans[i].x + rand(-25, 25), Y_TOP + 40 + rand(0, 30), rand(500, 750), { r: 6 }); }
            if (kChans[i].state === 'open') { const m = Math.min(2, counters[i](c.gK * (c.V - E.K) * 0.6, dtSim)); for (let j = 0; j < m; j++) particles.spawn('K', kChans[i].x + rand(-5, 5), Y_TOP + 40 + rand(0, 20), kChans[i].x + rand(-25, 25), Y_TOP - 50 - rand(0, 40), rand(500, 750), { r: 6 }); }
          }
          for (const j of [i - 1, i + 1]) {
            if (j < 0 || j >= n) continue;
            if (c.V - cs[j].V > 15 && c.V > -40) {
              const x = lerp(X0, X1, (Math.max(i, j)) / n), dir = j > i ? 1 : -1;
              svgEl('path', { d: `M${x - dir * 15},${(Y_TOP + Y_BOT) / 2} l${dir * 30},0 l${-dir * 8},-7 m${dir * 8},7 l${-dir * 8},7`, stroke: '#b45309', 'stroke-width': 3, fill: 'none', opacity: clamp((c.V - cs[j].V) / 60, 0.3, 1) }, arrows);
            }
          }
          pts.push(`${lerp(X0, X1, (i + 0.5) / n).toFixed(1)},${(500 - (c.V + 85) * 0.82).toFixed(1)}`);
        }
        vProfile.setAttribute('points', pts.join(' '));
        particles.update(dtReal);
        insetParts.update({ hideLabels: true });
      },
      narrate() {
        const cs = sim.comps, n = cs.length;
        let lead = -1, leadV = -40;
        for (let i = 0; i < n; i++) if (cs[i].V > leadV && cs[i].dVdt > 0) { leadV = cs[i].V; lead = i; }
        const refractory = cs.filter(c => sim.naState(c) === 'inactivated').length;
        const tubesOn = cs.filter(c => sim.sensorState(c) === 'active').length;
        if (lead >= 0) return `<b>Segment ${cs[lead].name} is firing:</b> ${chip('Na')} rushes ${IN} there, positive charge spreads along the inside (arrows) both ways and depolarizes the neighbours → their Na⁺ channels open next.${refractory ? ` Behind the wave, ${refractory} segment${refractory > 1 ? 's have' : ' has'} plugged (inactivated) Na⁺ channels, so it cannot turn back.` : ''}${tubesOn ? ` The impulse is also running down ${tubesOn} T-tubule${tubesOn > 1 ? 's' : ''} (orange).` : ''}`;
        if (refractory > 0) return `Wave passed. ${chip('K')} flows ${OUT} to repolarize each segment; Na⁺ channels recover from inactivation in the order they fired.`;
        return `All segments at rest (−85 mV). Every patch of sarcolemma has its own voltage-gated Na⁺ and K⁺ channels, so the impulse is regenerated at full size as it travels, and every T-tubule opening carries it inward.`;
      },
    };
  };

  // ---------------------------------------------------------------- triad: T-tubule, SR, cytosol
  views.triad = function (opts) {
    let svg, tubuleFill, tubuleWalls, sensor, ryrCh, srFill, srLevel, serca, sercaAtp, caDots = [], caLayer, myo, striations, list, gauge, insetParts, particles, counter;
    const TX0 = 250, TX1 = 310, TY0 = 40, TY1 = 250;          // tubule lumen
    const SX0 = 340, SX1 = 600, SY0 = 120, SY1 = 300;         // SR
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 900 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, svg);
        // cytosol (the inside of the fibre) fills the left area; the tubule brings the outside in
        svgEl('rect', { x: 20, y: 20, width: 600, height: 480, fill: '#fbf3e6', rx: 10 }, svg);
        svgEl('rect', { x: 20, y: 20, width: 600, height: 24, fill: '#eef2fa' }, svg);
        svgEl('text', { x: 30, y: 37, 'font-size': 12, fill: '#4a5468', 'font-weight': 600, text: 'OUTSIDE the fibre (surface)' }, svg);
        svgEl('text', { x: 30, y: 490, 'font-size': 13, fill: '#6b5a3a', 'font-weight': 600, text: 'INSIDE the fibre (cytosol)' }, svg);
        tubuleFill = svgEl('rect', { x: TX0, y: TY0, width: TX1 - TX0, height: TY1 - TY0, fill: '#eef2fa' }, svg);
        svgEl('text', { x: (TX0 + TX1) / 2, y: 100, 'font-size': 11, 'text-anchor': 'middle', fill: '#4a5468', text: 'T-tubule' }, svg);
        svgEl('text', { x: (TX0 + TX1) / 2, y: 114, 'font-size': 10, 'text-anchor': 'middle', fill: '#4a5468', text: '(outside fluid)' }, svg);
        tubuleWalls = [svgEl('rect', { x: TX0 - 8, y: TY0, width: 8, height: TY1 - TY0 + 8, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg), svgEl('rect', { x: TX1, y: TY0, width: 8, height: TY1 - TY0 + 8, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg), svgEl('rect', { x: TX0 - 8, y: TY1, width: TX1 - TX0 + 16, height: 8, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg)];
        // voltage sensor in the tubule wall, touching the SR release channel
        sensor = svgEl('g', { transform: `translate(${TX1 + 4},200)` }, svg);
        svgEl('rect', { x: -6, y: -16, width: 12, height: 32, rx: 3, fill: ION_COLOR.Na, stroke: '#7a3a12', 'stroke-width': 1.5 }, sensor);
        svgEl('text', { x: 0, y: 4, 'font-size': 10, 'font-weight': 700, 'text-anchor': 'middle', fill: '#fff', text: 'V' }, sensor);
        const sensorArm = svgEl('rect', { x: 6, y: -4, width: 22, height: 8, rx: 2, fill: ION_COLOR.Na }, sensor);
        svgEl('text', { x: TX1 + 8, y: 236, 'font-size': 10, fill: '#7a3a12', text: 'voltage sensor' }, svg);
        // SR with its store level, release channel and SERCA
        svgEl('rect', { x: SX0, y: SY0, width: SX1 - SX0, height: SY1 - SY0, rx: 14, fill: '#fff', stroke: '#8a7a50', 'stroke-width': 3 }, svg);
        srFill = svgEl('rect', { x: SX0 + 3, y: SY0 + 3, width: SX1 - SX0 - 6, height: SY1 - SY0 - 6, rx: 12, fill: SR_BLUE, opacity: 0.4 }, svg);
        svgEl('text', { x: (SX0 + SX1) / 2, y: 150, 'font-size': 13, 'font-weight': 600, 'text-anchor': 'middle', fill: '#1c5f92', text: 'Sarcoplasmic reticulum' }, svg);
        svgEl('text', { x: (SX0 + SX1) / 2, y: 166, 'font-size': 11, 'text-anchor': 'middle', fill: '#1c5f92', text: 'Ca²⁺ store (thousands × the cytosol)' }, svg);
        srLevel = svgEl('text', { x: (SX0 + SX1) / 2, y: 190, 'font-size': 11, 'text-anchor': 'middle', fill: '#1c5f92', text: 'store: 100 %' }, svg);
        ryrCh = { g: svgEl('g', {}, svg) };
        ryrCh.left = svgEl('rect', { x: SX0 - 3, y: 184, width: 10, height: 12, fill: '#fff', stroke: SR_BLUE, 'stroke-width': 2.5, rx: 3 }, ryrCh.g);
        ryrCh.right = svgEl('rect', { x: SX0 - 3, y: 206, width: 10, height: 12, fill: '#fff', stroke: SR_BLUE, 'stroke-width': 2.5, rx: 3 }, ryrCh.g);
        ryrCh.gate = svgEl('rect', { x: SX0 - 2, y: 195, width: 8, height: 12, fill: SR_BLUE, opacity: 0.9 }, ryrCh.g);
        svgEl('text', { x: SX0 + 12, y: 224, 'font-size': 10, fill: '#1c5f92', text: 'release channel' }, svg);
        serca = svgEl('g', { transform: `translate(${SX1 - 60},${SY1 - 10})` }, svg);
        svgEl('rect', { x: -24, y: -8, width: 48, height: 26, rx: 8, fill: '#e5e7eb', stroke: '#374151', 'stroke-width': 2 }, serca);
        sercaAtp = svgEl('text', { x: 0, y: 10, 'font-size': 11, 'font-weight': 700, 'text-anchor': 'middle', fill: '#374151', text: 'SERCA · ATP' }, serca);
        svgEl('path', { d: 'M0,36 l0,-18 m-5,6 l5,-6 l5,6', fill: 'none', stroke: SR_BLUE, 'stroke-width': 2.5 }, serca);
        svgEl('text', { x: SX1 - 60, y: SY1 + 44, 'font-size': 10, 'text-anchor': 'middle', fill: '#374151', text: 'pumps Ca²⁺ back in' }, svg);
        // myofibril edge at the bottom
        myo = svgEl('g', {}, svg);
        svgEl('rect', { x: 40, y: 400, width: 560, height: 60, rx: 6, fill: 'rgba(255,255,255,.7)', stroke: 'rgba(42,47,58,.4)' }, myo);
        striations = svgEl('path', { d: '', stroke: 'rgba(42,47,58,.5)', 'stroke-width': 1.5, fill: 'none' }, myo);
        svgEl('text', { x: 46, y: 476, 'font-size': 11, fill: '#6b5a3a', text: 'myofibril (the pulling machinery, next scene)' }, svg);
        caLayer = svgEl('g', {}, svg);
        particles = makeParticles(svgEl('g', {}, svg));
        counter = fluxCounter(1);
        list = checklist(svg, 640, 168, 'What has to happen, in order', ecRows());
        gauge = forceGauge(svg, 660, 410, 80);
        insetParts = drawInset(svg, 'triad');
        setCaption(opts.caption || '');
      },
      update(dtReal, dtSim) {
        const c = R3();
        for (const w of tubuleWalls) w.setAttribute('fill', c.V > -60 ? '#e9c07a' : '#c9b98f');
        tubuleFill.setAttribute('fill', c.V > -60 ? '#dfe8fb' : '#eef2fa');
        const active = sim.sensorState(c) === 'active';
        sensor.setAttribute('transform', `translate(${TX1 + 4},200) rotate(${active ? -25 : 0})`);
        const ryrOpen = sim.ryrState(c) === 'open';
        ryrCh.gate.setAttribute('opacity', ryrOpen ? 0 : 0.9);
        ryrCh.gate.setAttribute('fill', sim.ryrLeak > 0 && sim.dantrolene < 0.5 ? '#d24b3f' : SR_BLUE);
        srFill.setAttribute('opacity', 0.1 + 0.5 * c.caSR);
        srLevel.textContent = `store: ${Math.round(c.caSR * 100)} %`;
        sercaAtp.textContent = sim.atp > 0 ? 'SERCA · ATP' : 'SERCA · no ATP';
        serca.setAttribute('opacity', sim.atp > 0 ? 1 : 0.4);
        // cytosolic Ca²⁺ as dots: count follows concentration
        const want = Math.min(60, Math.round(c.ca * 8));
        while (caDots.length < want) { const g = svgEl('g', { transform: `translate(${rand(40, 600)},${rand(310, 395)})` }, caLayer); svgEl('circle', { r: 6, fill: ION_COLOR.Ca, opacity: 0.9 }, g); svgEl('text', { y: 3, 'font-size': 7, 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700, text: 'Ca²⁺' }, g); caDots.push({ g, x: rand(40, 600), y: rand(310, 395), vx: 0, vy: 0 }); }
        while (caDots.length > want) { const d = caDots.pop(); d.g.remove(); }
        if (!app.paused) {
          const k = dtReal / 16;
          for (const d of caDots) { d.vx = d.vx * 0.9 + rand(-0.8, 0.8); d.vy = d.vy * 0.9 + rand(-0.8, 0.8); d.x = clamp(d.x + d.vx * k, 40, 600); d.y = clamp(d.y + d.vy * k, 310, 395); d.g.setAttribute('transform', `translate(${d.x.toFixed(1)},${d.y.toFixed(1)})`); }
          if (ryrOpen) { const m = Math.min(3, counter(c.ryr * c.caSR * 40, dtSim)); for (let j = 0; j < m; j++) particles.spawn('Ca', SX0 + 2, 200 + rand(-6, 6), rand(60, 560), rand(320, 390), rand(500, 800), { r: 6 }); }
          if (sim.atp > 0 && c.ca > 0.4 && !ryrOpen) { const m = Math.min(2, counter(c.ca * 3, dtSim)); for (let j = 0; j < m; j++) particles.spawn('Ca', rand(400, 580), rand(320, 390), SX1 - 60, SY1 - 10, rand(500, 800), { r: 6 }); }
        }
        particles.update(dtReal);
        const period = 20 - 3 * clamp(sim.force, 0, 1);
        let d = ''; for (let x = 50; x < 596; x += period) d += `M${x.toFixed(1)},404 l0,52 `;
        striations.setAttribute('d', d);
        list.update(dtReal);
        gauge.update(sim.force);
        insetParts.update({ hideLabels: true });
      },
      checklist: () => list,
      narrate() {
        const c = R3();
        if (sim.ryrLeak > 0 && sim.dantrolene < 0.5) return `The SR release channel is <b>stuck open</b>: Ca²⁺ leaks into the cytosol continuously, so the fibre contracts with no impulse at all (malignant hyperthermia).`;
        if (sim.sensorState(c) === 'active' && sim.ryrState(c) === 'open') return `The T-tubule wall depolarized → the <b>voltage sensor</b> moved and pulled the SR <b>release channel</b> open → ${chip('Ca')} pours out of the store into the cytosol. No Ca²⁺ crossed the surface membrane.`;
        if (c.ca > 0.6 && sim.atp > 0) return `Cytosolic Ca²⁺ is high (${c.ca.toFixed(1)} µM) → it binds troponin on the myofibril → force. Meanwhile <b>SERCA</b> is already pumping it back into the store (store ${Math.round(c.caSR * 100)} %).`;
        if (c.ca > 0.6 && sim.atp === 0) return `Cytosolic Ca²⁺ is high and <b>stays</b> high: SERCA needs ATP and there is none, so nothing returns Ca²⁺ to the store.`;
        if (c.V > -40) return `The impulse is in the T-tubule: the tubule wall is depolarizing and the voltage sensor is about to move.`;
        return `<b>At rest:</b> the store is full (${Math.round(c.caSR * 100)} %), cytosolic Ca²⁺ is almost nil (${c.ca.toFixed(2)} µM), the release channel is shut. Only a voltage change in the tubule wall opens it.`;
      },
    };
  };

  // ---------------------------------------------------------------- sarcomere
  views.sarcomere = function (opts) {
    let svg, zL, zR, thinL, thinR, thick, heads = [], covers = [], troponins = [], gauge, atpBar, atpText, list, insetParts, phase = 0, lenText;
    const CY = 250, L0 = 560, NH = 7;
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 900 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, svg);
        svgEl('rect', { x: 20, y: 20, width: 600, height: 480, fill: '#fbf3e6', rx: 10 }, svg);
        svgEl('text', { x: 30, y: 44, 'font-size': 13, fill: '#6b5a3a', 'font-weight': 600, text: 'One sarcomere (Z line to Z line), inside a myofibril' }, svg);
        zL = svgEl('rect', { x: 0, y: CY - 90, width: 6, height: 180, fill: '#2a2f3a' }, svg);
        zR = svgEl('rect', { x: 0, y: CY - 90, width: 6, height: 180, fill: '#2a2f3a' }, svg);
        thinL = svgEl('g', {}, svg); thinR = svgEl('g', {}, svg);
        for (const [grp, dir] of [[thinL, 1], [thinR, -1]]) {
          for (const dy of [-46, 46]) {
            svgEl('rect', { x: 0, y: CY + dy - 3, width: 220, height: 6, fill: '#9ca3af', rx: 3, 'data-thin': 1 }, grp);
            for (let k = 0; k < 8; k++) svgEl('circle', { cx: 14 + k * 26, cy: CY + dy, r: 3.2, fill: '#4b5563', 'data-site': 1 }, grp);
            const cov = svgEl('rect', { x: 4, y: CY + dy - 7, width: 214, height: 5, rx: 2.5, fill: COVER, opacity: 0.95 }, grp);
            covers.push({ el: cov, dy });
            for (let k = 0; k < 3; k++) { const tp = svgEl('circle', { cx: 40 + k * 70, cy: CY + dy - 8, r: 5, fill: '#cbd5e1', stroke: '#475569', 'stroke-width': 1.5 }, grp); troponins.push(tp); }
          }
          grp._dir = dir;
        }
        thick = svgEl('g', {}, svg);
        svgEl('rect', { x: -150, y: CY - 10, width: 300, height: 20, rx: 10, fill: '#6b5a3a' }, thick);
        svgEl('rect', { x: -6, y: CY - 26, width: 12, height: 52, fill: '#8a7a50', rx: 3 }, thick);   // M line
        for (let i = 0; i < NH; i++) for (const side of [-1, 1]) for (const dy of [-1, 1]) {
          const bx = side * (40 + i * 15);
          const st = svgEl('path', { d: '', stroke: FORCE, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }, thick);
          const hd = svgEl('circle', { cx: bx, cy: CY + dy * 30, r: 5, fill: FORCE }, thick);
          heads.push({ st, hd, bx, dy, side, order: i });
        }
        svgEl('text', { x: 300, y: 130, 'font-size': 11, 'text-anchor': 'middle', fill: '#6b7280', text: 'thin filament (actin) with its tropomyosin cover and troponin knobs' }, svg);
        svgEl('text', { x: 300, y: 380, 'font-size': 11, 'text-anchor': 'middle', fill: '#6b5a3a', text: 'thick filament (myosin) with cross-bridge heads' }, svg);
        lenText = svgEl('text', { x: 300, y: 410, 'font-size': 12, 'text-anchor': 'middle', 'font-weight': 600, fill: '#3a3f4a', text: '' }, svg);
        // ATP meter
        const ag = svgEl('g', { transform: 'translate(60,440)', 'font-size': 11, fill: '#3a3f4a' }, svg);
        svgEl('text', { x: 0, y: -6, 'font-weight': 700, text: 'ATP' }, ag);
        svgEl('rect', { x: 0, y: 0, width: 160, height: 12, rx: 4, fill: '#eee9dc', stroke: '#c9c4b4' }, ag);
        atpBar = svgEl('rect', { x: 1, y: 1, width: 158, height: 10, rx: 3, fill: '#2f9e5b' }, ag);
        atpText = svgEl('text', { x: 170, y: 10, text: 'available' }, ag);
        list = checklist(svg, 640, 168, 'What has to happen, in order', ecRows());
        gauge = forceGauge(svg, 660, 410, 80);
        insetParts = drawInset(svg, 'sarcomere');
        setCaption(opts.caption || '');
      },
      update(dtReal) {
        const c = R3(), F = clamp(sim.force, 0, 1.05);
        const L = L0 * (1 - 0.12 * F), x0 = 300 - L / 2, x1 = 300 + L / 2;
        zL.setAttribute('x', x0 - 3); zR.setAttribute('x', x1 - 3);
        thinL.setAttribute('transform', `translate(${x0 + 3},0)`);
        thinR.setAttribute('transform', `translate(${x1 - 3},0) scale(-1,1)`);
        thick.setAttribute('transform', 'translate(300,0)');
        lenText.textContent = `sarcomere length: ${(100 * (1 - 0.12 * F)).toFixed(0)} % of resting`;
        // tropomyosin slides aside with troponin occupancy; troponin knobs turn blue when bound
        const tn = c.tn, bound = sim.troponinState(c) === 'bound';
        for (const cv of covers) { cv.el.setAttribute('y', CY + cv.dy - 7 - 9 * clamp(tn * 1.4, 0, 1)); cv.el.setAttribute('opacity', 0.95 - 0.5 * clamp(tn * 1.4, 0, 1)); }
        for (const tp of troponins) tp.setAttribute('fill', bound ? ION_COLOR.Ca : '#cbd5e1');
        // cross-bridges: attached fraction from xb; cycling animation only with ATP
        if (!app.paused && sim.atp > 0) phase += dtReal / 400;
        const nAttached = Math.round(clamp(c.xb / 0.6, 0, 1) * heads.length);
        heads.forEach((h, i) => {
          const attached = i < nAttached || (nAttached > 0 && ((h.order + i) % heads.length) < nAttached && false);
          const on = (heads.length - 1 - i) < nAttached;
          const stroke = Math.sin(phase * 6 + i) * (on && sim.atp > 0 ? 6 : 0);
          const hx = h.bx + (on ? -h.side * (10 + stroke) : 0), hy = on ? CY + h.dy * 46 : CY + h.dy * 30;
          h.hd.setAttribute('cx', hx); h.hd.setAttribute('cy', hy);
          h.st.setAttribute('d', `M${h.bx},${CY + h.dy * 10} L${hx},${hy}`);
          h.hd.setAttribute('fill', on ? FORCE : '#c07a62');
          void attached;
        });
        atpBar.setAttribute('width', 158 * clamp(sim.atp, 0, 1)); atpBar.setAttribute('fill', sim.atp > 0.2 ? '#2f9e5b' : '#d24b3f');
        atpText.textContent = sim.atp > 0 ? 'available' : 'none: heads cannot let go';
        list.update(dtReal);
        gauge.update(sim.force);
        insetParts.update({ hideLabels: true });
      },
      narrate() {
        const c = R3();
        if (sim.atp === 0 && c.xb > 0.2) return `<b>Rigor:</b> the heads pulled once and are now stuck to actin. Detaching needs a fresh ATP, and there is none, so the sarcomere cannot lengthen.`;
        if (c.xb > 0.15 && c.tn > 0.3) return `Ca²⁺ is on troponin → tropomyosin has slid off the binding sites → myosin heads attach, pull (power stroke), detach with ATP and re-cock: the filaments slide and the sarcomere <b>shortens</b>.`;
        if (c.xb > 0.15) return `Ca²⁺ is leaving troponin and the cover is sliding back: heads that detach cannot re-attach, so force <b>falls</b>.`;
        if (c.tn > 0.4) return `${chip('Ca')} has bound <b>troponin</b> → the <b>tropomyosin</b> cover moves aside → the binding sites on actin are exposed → heads are about to attach.`;
        return `<b>Relaxed:</b> tropomyosin covers the binding sites on actin; the cocked myosin heads cannot grab. Nothing happens until Ca²⁺ arrives.`;
      },
    };
  };

  // ---------------------------------------------------------------- neuromuscular junction
  views.nmj = function (opts) {
    const PRE_X0 = 300, PRE_X1 = 600, PRE_Y = 178, POST_Y_TOP = 300, POST_Y_BOT = 356, CLEFT_Y0 = PRE_Y + 14, CLEFT_Y1 = POST_Y_TOP;
    let svg, preFill, postFill, caChans = [], recChans = [], plugs = [], vesicleLayer, docked = [], particles, ntParticles, pool, caCounter, recCounter, insetParts, apArrow, list, ache = [], agonistDots;
    const nt = [];
    let acheT = 0;
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 900 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, svg);
        svgEl('rect', { x: 20, y: 20, width: 600, height: 480, fill: '#eef2fa', rx: 10 }, svg);
        preFill = svgEl('path', { d: `M${PRE_X0},20 L${PRE_X1},20 C${PRE_X1},110 ${PRE_X1 - 40},${PRE_Y} ${(PRE_X0 + PRE_X1) / 2},${PRE_Y} C${PRE_X0 + 40},${PRE_Y} ${PRE_X0},110 ${PRE_X0},20 Z`, fill: '#fbf3e6', stroke: '#8a7a50', 'stroke-width': 12 }, svg);
        svgEl('text', { x: (PRE_X0 + PRE_X1) / 2, y: 66, 'font-size': 13, 'font-weight': 600, 'text-anchor': 'middle', fill: '#6b5a3a', text: 'Motor nerve ending (the terminal)' }, svg);
        apArrow = svgEl('g', { opacity: 0 }, svg);
        svgEl('path', { d: `M${(PRE_X0 + PRE_X1) / 2 - 140},24 l0,14 l-8,0 l12,12 l12,-12 l-8,0 l0,-14 z`, fill: '#e5482e' }, apArrow);
        svgEl('text', { x: (PRE_X0 + PRE_X1) / 2 - 118, y: 42, 'font-size': 12, 'font-weight': 700, fill: '#e5482e', text: 'command arriving' }, apArrow);
        const chLayer = svgEl('g', {}, svg);
        caChans = [380, 520].map(x => drawChannel(chLayer, x, PRE_Y - 34, PRE_Y + 8, 'Ca_v', 0.9));
        svgEl('text', { x: 450, y: PRE_Y + 30, 'font-size': 11, 'text-anchor': 'middle', fill: '#1c5f92', text: 'voltage-gated Ca²⁺ channels' }, chLayer);
        vesicleLayer = svgEl('g', {}, svg);
        svgEl('text', { x: 30, y: CLEFT_Y0 + 16, 'font-size': 12, fill: '#4a5468', 'font-weight': 600, text: 'the gap (outside)' }, svg);
        postFill = svgEl('rect', { x: 20, y: POST_Y_BOT, width: 600, height: 500 - POST_Y_BOT, fill: '#fbf3e6', rx: 10 }, svg);
        // folded end plate: bilayer with fold notches
        drawBilayer(svg, 20, 620, POST_Y_TOP, POST_Y_BOT, [[352, 408], [412, 468], [472, 528], [532, 588]]);
        for (const fx of [120, 200, 280]) svgEl('path', { d: `M${fx - 14},${POST_Y_TOP} L${fx - 8},${POST_Y_BOT + 40} L${fx + 8},${POST_Y_BOT + 40} L${fx + 14},${POST_Y_TOP}`, fill: '#f0ead8', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg);
        svgEl('text', { x: 200, y: POST_Y_BOT + 58, 'font-size': 10, 'text-anchor': 'middle', fill: '#8a7a50', text: 'junctional folds' }, svg);
        recChans = [380, 440, 500, 560].map(x => drawChannel(chLayer, x, POST_Y_TOP, POST_Y_BOT, 'nAChR', 0.9));
        plugs = recChans.map(ch => svgEl('rect', { x: ch.x - 7, y: POST_Y_TOP - 12, width: 14, height: 12, rx: 3, fill: '#6b7280', opacity: 0 }, chLayer));
        svgEl('text', { x: 470, y: POST_Y_BOT + 22, 'font-size': 11, 'text-anchor': 'middle', fill: '#4a4f5a', text: 'ACh receptors (channels that pass Na⁺ in, some K⁺ out)' }, chLayer);
        svgEl('text', { x: 30, y: 492, 'font-size': 13, 'font-weight': 600, fill: '#6b5a3a', text: 'INSIDE the muscle fibre (the end plate)' }, svg);
        // Acetylcholinesterase in the cleft. Drawn as a body with a notch cut out of the top — the
        // active site the ACh has to drop into — because a plain blob is read as decoration, and a
        // leader line to one of them, because the label used to be printed across the whole row.
        const acheY = 248;
        for (const x of [90, 170, 250, 330, 470, 560]) {
          const g = svgEl('g', { transform: `translate(${x},${acheY})` }, svg);
          g._x = x; g._y = acheY;
          svgEl('title', { text: 'acetylcholinesterase: it breaks ACh down in the gap' }, g);
          svgEl('path', { d: 'M-5,-12 L0,-3 L5,-12 A13,13 0 1 1 -5,-12 Z', fill: '#c98a1b', stroke: '#7a5410', 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, g);
          svgEl('circle', { cx: 0, cy: 2, r: 3, fill: '#7a5410', opacity: 0.35 }, g);
          ache.push(g);
        }
        svgEl('path', { d: `M86,${acheY + 20} L90,${acheY + 14}`, stroke: '#7a5410', 'stroke-width': 1.2, fill: 'none' }, svg);
        svgEl('text', { x: 26, y: acheY + 32, 'font-size': 11, 'font-weight': 600, fill: '#7a5410', text: 'acetylcholinesterase' }, svg);
        svgEl('text', { x: 26, y: acheY + 44, 'font-size': 10, fill: '#7a5410', text: 'the enzyme that breaks ACh down' }, svg);
        const ionLayer = svgEl('g', {}, svg);
        pool = {
          cleft: makeIonPool(ionLayer, { x0: 30, x1: 610, y0: CLEFT_Y0 - 4, y1: CLEFT_Y1 - 4 }, { Na: 14, Ca: 8, Cl: 4 }, { r: 7 }),
          outsidePre: makeIonPool(ionLayer, { x0: 30, x1: 290, y0: 60, y1: PRE_Y - 30 }, { Na: 8, Ca: 4, Cl: 5 }, { r: 7 }),
          insidePre: makeIonPool(ionLayer, { x0: PRE_X0 + 30, x1: PRE_X1 - 30, y0: 60, y1: 110 }, { K: 8, A: 4 }, { r: 7 }),
          insidePost: makeIonPool(ionLayer, { x0: 30, x1: 610, y0: POST_Y_BOT + 60, y1: 480 }, { K: 16, A: 10, Na: 2 }, { r: 7 }),
        };
        particles = makeParticles(svgEl('g', {}, svg));
        ntParticles = svgEl('g', {}, svg);
        agonistDots = svgEl('g', {}, svg);
        caCounter = fluxCounter(1.2); recCounter = fluxCounter(0.6);
        list = checklist(svg, 640, 168, 'What has to happen, in order', [
          { label: 'command arrives at the terminal', test: () => sim.nerveV > -35 },
          { label: 'Ca²⁺ channels open', test: () => sim.terminal.s > 0.3 },
          { label: 'Ca²⁺ flows into the terminal', test: () => sim.terminal.iCa < -0.01 && sim.terminal.s > 0.3 },
          { label: 'vesicles fuse and empty', test: () => sim.terminal.releaseRate > 0.05 },
          { label: 'ACh crosses the gap', test: () => sim.terminal.nt > 0.02 },
          { label: 'receptors open', test: () => sim.receptor.r > 0.06 },
          { label: 'Na⁺ flows in → end-plate potential', test: () => sim.receptor.i < -0.5 },
          { label: 'threshold → Na⁺ channels open → impulse', test: () => sim.endplate.V > -40 && sim.naState(sim.endplate) === 'open' },
          { label: 'AChE removes ACh; receptors close', test: () => sim.terminal.nt < 0.05 && sim.receptor.r > 0.02 && sim.receptor.r < 0.06 },
        ]);
        const lg = svgEl('g', { transform: 'translate(640,360)', 'font-size': 11, fill: '#3a3f4a' }, svg);
        [['NT', 'acetylcholine (ACh)'], ['Ca', 'Ca²⁺ (2 mM out · 0.0001 mM in)'], ['Na', 'Na⁺'], ['K', 'K⁺']].forEach(([k, lab], i) => { const y = 14 + i * 18; svgEl('circle', { cx: 7, cy: y - 4, r: 6, fill: ION_COLOR[k] }, lg); svgEl('text', { x: 20, y, text: lab }, lg); });
        insetParts = drawInset(svg, 'nmj');
        setCaption(opts.caption || '');
        this._buildVesicles();
      },
      _buildVesicles() {
        vesicleLayer.innerHTML = ''; docked = [];
        for (const [x, y] of [[362, 112], [420, 100], [480, 102], [538, 114], [400, 134], [500, 136]]) {
          const g = svgEl('g', { transform: `translate(${x},${y})` }, vesicleLayer);
          svgEl('circle', { r: 12, fill: '#fff', stroke: '#8a7a50', 'stroke-width': 2 }, g);
          for (let i = 0; i < 4; i++) svgEl('circle', { cx: rand(-5, 5), cy: rand(-5, 5), r: 2.2, fill: ION_COLOR.NT }, g);
        }
        for (const x of [420, 450, 480, 360, 540]) {
          const g = svgEl('g', { transform: `translate(${x},${PRE_Y - 22})` }, vesicleLayer);
          svgEl('circle', { r: 12, fill: '#fff', stroke: '#8a7a50', 'stroke-width': 2 }, g);
          for (let i = 0; i < 4; i++) svgEl('circle', { cx: rand(-5, 5), cy: rand(-5, 5), r: 2.2, fill: ION_COLOR.NT }, g);
          docked.push({ g, x, used: false });
        }
        svgEl('text', { x: 450, y: 82, 'font-size': 11, 'text-anchor': 'middle', fill: '#6b5a3a', text: 'vesicles filled with acetylcholine (ACh)' }, vesicleLayer);
      },
      _release() {
        const v = docked.find(d => !d.used);
        if (v) {
          v.used = true;
          v.g.animate([{ transform: `translate(${v.x}px, ${PRE_Y - 22}px) scale(1)` }, { transform: `translate(${v.x}px, ${PRE_Y - 6}px) scale(1.2, 0.5)`, opacity: 0.2 }], { duration: 500, fill: 'forwards' });
          setTimeout(() => { v.g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' }); v.used = false; }, 2500 / Math.max(app.speed * 100, 0.15));
        }
        const x = v ? v.x : 450;
        for (let i = 0; i < 12; i++) {
          const g = svgEl('circle', { cx: x, cy: PRE_Y + 8, r: 4, fill: ION_COLOR.NT }, ntParticles);
          nt.push({ g, x: x + rand(-4, 4), y: PRE_Y + 8, vx: rand(-1.5, 1.5), vy: rand(0.5, 1.5), t: 0 });
        }
      },
      update(dtReal, dtSim, events) {
        const term = sim.terminal, rec = sim.receptor, Vp = sim.nerveV, Vq = sim.endplate.V;
        preFill.setAttribute('fill', insideFill(Vp));
        postFill.setAttribute('fill', insideFill(Vq));
        apArrow.setAttribute('opacity', clamp((Vp + 60) / 60, 0, 1));
        for (const ch of caChans) setChannelState(ch, sim.caState(term));
        const open = sim.receptorState() === 'open';
        const nVisible = Math.max(1, Math.round(recChans.length * clamp(sim.receptorDensity, 0, 1)));
        const nPlugged = Math.round(recChans.length * clamp(rec.block, 0, 1));
        recChans.forEach((ch, i) => {
          ch.g.setAttribute('opacity', i < nVisible ? 1 : 0.12);
          const plugged = i >= recChans.length - nPlugged;
          plugs[i].setAttribute('opacity', plugged ? 1 : 0);
          setChannelState(ch, open && !plugged && i < nVisible ? 'open' : 'closed');
        });
        for (const e of events) if (e.type === 'release') this._release();
        const acheOn = sim.acheActivity;
        // They visibly work: while there is ACh in the gap and the enzyme is active, they pulse.
        acheT += dtReal;
        const acheBusy = acheOn > 0.05 && sim.terminal.nt > 0.03;
        ache.forEach((g, i) => {
          g.setAttribute('opacity', 0.3 + 0.7 * clamp(acheOn, 0, 1));
          const k = acheBusy ? 1 + 0.16 * Math.sin(acheT / 90 + i * 1.1) : 1;
          g.setAttribute('transform', `translate(${g._x},${g._y}) scale(${k.toFixed(3)})`);
        });
        if (!app.paused) {
          if (term.s > 0.3) { const n = Math.min(3, caCounter(term.iCa * 40, dtSim)); for (let i = 0; i < n; i++) { const ch = caChans[i % 2]; particles.spawn('Ca', ch.x + rand(-6, 6), PRE_Y + 30 + rand(0, 20), ch.x + rand(-40, 40), PRE_Y - 60 - rand(0, 40), rand(650, 900), { r: 7 }); } }
          if (open) { const n = Math.min(3, recCounter(rec.i, dtSim)); for (let i = 0; i < n; i++) { const ch = recChans[i % nVisible]; particles.spawn('Na', ch.x + rand(-6, 6), POST_Y_TOP - 30 - rand(0, 40), ch.x + rand(-60, 60), POST_Y_BOT + 60 + rand(0, 60), rand(700, 1000), { r: 7 }); } }
          const k = dtReal / 16;
          // ACh dots: drift across the gap; destroyed near AChE (faster the more enzyme), or bind receptors
          const life = (900 + 6000 * (1 - clamp(acheOn, 0, 1))) / Math.max(app.speed * 100, 0.15);
          for (let i = nt.length - 1; i >= 0; i--) {
            const p = nt[i]; p.t += dtReal;
            p.vx += rand(-0.4, 0.4); p.vy += rand(-0.3, 0.4); p.vx *= 0.92; p.vy *= 0.92;
            p.x = clamp(p.x + p.vx * k, 30, 610); p.y += p.vy * k;
            if (p.y > POST_Y_TOP - 12) { const near = recChans.find(ch => Math.abs(ch.x - p.x) < 26); if (near) { p.g.remove(); nt.splice(i, 1); continue; } p.y = POST_Y_TOP - 12; p.vy = -Math.abs(p.vy); }
            if (p.y < CLEFT_Y0) { p.y = CLEFT_Y0; p.vy = Math.abs(p.vy); }
            p.g.setAttribute('cx', p.x.toFixed(1)); p.g.setAttribute('cy', p.y.toFixed(1));
            if (p.t > life) { p.g.setAttribute('opacity', clamp(1 - (p.t - life) / 400, 0, 1)); if (p.t > life + 400) { p.g.remove(); nt.splice(i, 1); } }
          }
          for (const key in pool) pool[key].update(dtReal);
        }
        // a persistent agonist sits on the receptors and never leaves
        const wantAg = sim._agonistNow > 0.05 ? 10 : 0;
        while (agonistDots.childNodes.length < wantAg) svgEl('circle', { cx: rand(360, 580), cy: rand(POST_Y_TOP - 40, POST_Y_TOP - 12), r: 4, fill: ION_COLOR.NT }, agonistDots);
        while (agonistDots.childNodes.length > wantAg) agonistDots.lastChild.remove();
        particles.update(dtReal);
        list.update(dtReal);
        insetParts.update({ hideLabels: true });
      },
      checklist: () => list,
      narrate() {
        const term = sim.terminal, rec = sim.receptor, Vp = sim.nerveV, ep = sim.endplate;
        if (sim._agonistNow > 0.05) return `A drug that looks like ACh is sitting on the receptors and the enzyme cannot destroy it: the end plate is held depolarized (${fmtV(ep.V)} mV), its Na⁺ channels inactivate, and no command can fire the fibre.`;
        if (sim.releaseBlock > 0.5 && term.s > 0.3) return `Ca²⁺ enters the terminal, but the machinery that fuses vesicles is cut: <b>nothing is released</b>.`;
        if (ep.V > -40 && sim.naState(ep) === 'open') return `The end-plate potential reached threshold → the fibre's own voltage-gated ${chip('Na')} channels opened → <b>impulse</b>, which now spreads along the whole fibre.`;
        if (rec.i < -0.5 && rec.r > 0.06) return `Receptor channels open → ${chip('Na')} flows ${IN} to the end plate → the <b>end-plate potential</b>: a large depolarization, far more than threshold needs.`;
        if (term.nt > 0.02) return `${chip('NT')} <b>ACh</b> crosses the gap and binds receptor channels on the end plate; the enzyme in the gap is already destroying it.`;
        if (term.releaseRate > 0.05) return `Cytosolic Ca²⁺ in the terminal is high → <b>vesicles fuse</b> with the membrane and dump ACh into the gap.`;
        if (term.s > 0.3) return `The command depolarized the terminal → voltage-gated ${chip('Ca')} channels opened → Ca²⁺ flows ${IN} (2 mM outside vs 0.0001 mM inside).`;
        if (Vp > -35) return `<b>A command arrives</b>: the nerve ending depolarizes to about +40 mV.`;
        if (rec.r > 0.03) return `Receptors are closing as ACh is destroyed; the end plate drifts back to rest.`;
        if (rec.block > 0.5) return `${Math.round(rec.block * 100)} % of the receptors are blocked (grey plugs). Send a command and see whether what is left is enough.`;
        return `Quiet junction. Send a command and the chain on the right will run.`;
      },
    };
  };

  window.MuscleViews = (kit) => { bind(kit); return { drawCell, views }; };
})();
