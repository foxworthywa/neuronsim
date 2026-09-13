/*
 * SimApp: page-agnostic renderer + lesson engine (see docs/APP_API.md).
 *
 * Nothing here knows which cell it is drawing. A page supplies a model (the simulation), a
 * profile (landmarks and words), a whole-cell drawing, extra views, the lesson and the lab:
 *
 *   window.__neuronsim = SimApp.init({ model, profile, drawCell, views, lesson, lab });
 *
 * The generic parts kept here: utilities and drawing helpers, the membrane view, the trace,
 * the step runner (questions, activities, navigation), the lab shell and the frame loop.
 * Classic script (no modules) so the pages open from file://.
 */
(function () {
  'use strict';

  // =========================================================================
  // Utilities
  // =========================================================================
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (sel) => document.querySelector(sel);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

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
  function htmlEl(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html != null) e.innerHTML = html;
    return e;
  }

  const ION_COLOR = { Na: '#e8772e', K: '#8e5cf0', Cl: '#3cae6c', Ca: '#2d8fd5', A: '#8f97a6', NT: '#d63c8a' };
  const ION_LABEL = { Na: 'Na⁺', K: 'K⁺', Cl: 'Cl⁻', Ca: 'Ca²⁺', A: 'A⁻', NT: '' };

  function fmtV(V) { return (V < 0 ? '−' : '+') + Math.abs(V).toFixed(1); }
  // A landmark voltage as a signed integer ("+67", "−70") for labels and copy.
  function fmtE(V) { return (V < 0 ? '−' : '+') + Math.abs(Math.round(V)); }

  // Channel catalogue for drawChannel / the membrane view. A page may add entries
  // (Object.assign(kit.CH, {...})); an entry may carry current(c, V, E, sim) and state(c, sim)
  // so the membrane view can animate channel types this file does not know about.
  const CH = {
    Na_leak: { color: ION_COLOR.Na, label: 'Na⁺ leak', ion: 'Na', dir: -1 },
    K_leak: { color: ION_COLOR.K, label: 'K⁺ leak', ion: 'K', dir: 1 },
    Na_v: { color: ION_COLOR.Na, label: 'voltage-gated Na⁺', ion: 'Na', dir: -1, gated: true },
    K_v: { color: ION_COLOR.K, label: 'voltage-gated K⁺', ion: 'K', dir: 1, gated: true },
    Ca_v: { color: ION_COLOR.Ca, label: 'voltage-gated Ca²⁺', ion: 'Ca', dir: -1, gated: true },
    Na_manual: { color: ION_COLOR.Na, label: 'Na⁺ channel (yours)', ion: 'Na', dir: -1 },
    K_manual: { color: ION_COLOR.K, label: 'K⁺ channel (yours)', ion: 'K', dir: 1 },
    Cl_manual: { color: ION_COLOR.Cl, label: 'Cl⁻ channel (yours)', ion: 'Cl', dir: -1 },
    AMPA: { color: ION_COLOR.Na, label: 'excitatory receptor (cation channel)', ion: 'Na', dir: -1, receptor: true },
    GABA: { color: ION_COLOR.Cl, label: 'inhibitory receptor (Cl⁻ channel)', ion: 'Cl', dir: -1, receptor: true },
    pump: { color: '#6b7280', label: 'Na⁺/K⁺ pump (ATP)' },
  };

  function drawChannel(parent, x, yTop, yBot, type, scale) {
    scale = scale || 1;
    const spec = CH[type];
    const g = svgEl('g', { transform: `translate(${x},0)` }, parent);
    const w = 16 * scale, gap = 6 * scale, h = yBot - yTop, ymid = (yTop + yBot) / 2;
    if (type === 'pump') {
      svgEl('rect', { x: -26 * scale, y: yTop - 2, width: 52 * scale, height: h + 4, rx: 8 * scale, fill: '#e5e7eb', stroke: '#374151', 'stroke-width': 2 }, g);
      svgEl('text', { x: 0, y: ymid + 4 * scale, 'font-size': 11 * scale, 'font-weight': 700, 'text-anchor': 'middle', fill: '#374151', text: 'ATP' }, g);
      const na = svgEl('g', {}, g), k = svgEl('g', {}, g);
      return { g, spec, pumpNa: na, pumpK: k, x, yTop, yBot };
    }
    const left = svgEl('rect', { x: -gap - w, y: yTop - 2, width: w, height: h + 4, rx: 5 * scale, fill: '#fff', stroke: spec.color, 'stroke-width': 2.5 }, g);
    const right = svgEl('rect', { x: gap, y: yTop - 2, width: w, height: h + 4, rx: 5 * scale, fill: '#fff', stroke: spec.color, 'stroke-width': 2.5 }, g);
    const gate = svgEl('rect', { x: -gap - 1, y: ymid - 7 * scale, width: 2 * gap + 2, height: 14 * scale, fill: spec.color, opacity: 0.9 }, g);
    const ball = svgEl('circle', { cx: 0, cy: yBot - 6 * scale, r: 7 * scale, fill: '#374151', opacity: 0 }, g);
    if (spec.gated) svgEl('text', { x: 0, y: yTop - 6 * scale, 'font-size': 9 * scale, 'text-anchor': 'middle', fill: spec.color, 'font-weight': 700, text: 'V' }, g);
    if (spec.receptor) {
      // binding site cups on the outside face
      svgEl('path', { d: `M${-gap - w},${yTop - 2} l-4,-8 M${gap + w},${yTop - 2} l4,-8`, stroke: spec.color, 'stroke-width': 2.5, fill: 'none' }, g);
    }
    return { g, spec, left, right, gate, ball, x, yTop, yBot, state: 'closed' };
  }
  function setChannelState(ch, state) {
    if (ch.state === state || !ch.gate) return;
    ch.state = state;
    if (state === 'open') { ch.gate.setAttribute('opacity', 0); ch.ball.setAttribute('opacity', 0); ch.left.setAttribute('fill', '#fff'); }
    else if (state === 'inactivated') { ch.gate.setAttribute('opacity', 0); ch.ball.setAttribute('opacity', 1); ch.left.setAttribute('fill', '#fff'); }
    else { ch.gate.setAttribute('opacity', 0.9); ch.ball.setAttribute('opacity', 0); }
  }

  // Ion pools (background) and flux particles.
  function makeIonPool(parent, region, counts, opts) {
    opts = opts || {};
    const ions = [];
    for (const ion in counts) {
      for (let i = 0; i < counts[ion]; i++) {
        const x = rand(region.x0 + 10, region.x1 - 10), y = rand(region.y0 + 10, region.y1 - 10);
        const g = svgEl('g', { transform: `translate(${x},${y})` }, parent);
        svgEl('circle', { r: opts.r || 8, fill: ION_COLOR[ion], opacity: 0.9 }, g);
        svgEl('text', { y: 3, 'font-size': (opts.r || 8) * 1.05, 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700, text: ION_LABEL[ion] }, g);
        ions.push({ g, ion, x, y, vx: 0, vy: 0 });
      }
    }
    return {
      ions,
      update(dtReal) {
        const k = dtReal / 16;
        for (const p of ions) {
          p.vx = p.vx * 0.9 + rand(-0.6, 0.6); p.vy = p.vy * 0.9 + rand(-0.6, 0.6);
          p.x = clamp(p.x + p.vx * k, region.x0 + 8, region.x1 - 8); p.y = clamp(p.y + p.vy * k, region.y0 + 8, region.y1 - 8);
          p.g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
        }
      },
    };
  }

  function makeParticles(parent) {
    const list = [];
    return {
      spawn(ion, x0, y0, x1, y1, duration, opts) {
        opts = opts || {};
        const g = svgEl('g', { transform: `translate(${x0},${y0})`, 'pointer-events': 'none' }, parent);
        svgEl('circle', { r: opts.r || 8, fill: ION_COLOR[ion], stroke: '#fff', 'stroke-width': 1.5 }, g);
        if (ION_LABEL[ion]) svgEl('text', { y: 3, 'font-size': 8.5, 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700, text: ION_LABEL[ion] }, g);
        list.push({ g, x0, y0, x1, y1, t: 0, duration: duration || 700, linger: opts.linger != null ? opts.linger : 500, wobble: opts.wobble || 0 });
      },
      update(dtReal) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]; p.t += dtReal;
          const u = clamp(p.t / p.duration, 0, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
          const x = lerp(p.x0, p.x1, e) + (p.wobble ? Math.sin(p.t / 60) * p.wobble * (1 - u) : 0), y = lerp(p.y0, p.y1, e);
          p.g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
          if (p.t > p.duration) {
            const f = 1 - (p.t - p.duration) / p.linger;
            p.g.setAttribute('opacity', clamp(f, 0, 1));
            if (f <= 0) { p.g.remove(); list.splice(i, 1); }
          }
        }
      },
      clear() { for (const p of list) p.g.remove(); list.length = 0; },
      get count() { return list.length; },
    };
  }

  // A flux accumulator: turns current (nA) × simulated time into discrete particles.
  function fluxCounter(scale) {
    let acc = 0;
    return (current_nA, dtSim) => {
      acc += Math.abs(current_nA) * dtSim * scale;
      let n = 0;
      while (acc >= 1 && n < 6) { acc -= 1; n++; }
      if (acc > 6) acc = 6;
      return n;
    };
  }

  // Option order for a multiple-choice question. Lessons are written with the correct answer
  // first, which is easy to author and impossible to miss as a student, so the order is permuted
  // here instead. The permutation is derived from the question's own text: it is unpredictable
  // but the same every time that question appears, so going back to a question (or discussing it
  // with the class) does not reshuffle it. Set `keepOrder: true` on a question whose options read
  // as a sequence.
  function questionOrder(q) {
    if (q._order) return q._order;
    const n = q.options.length;
    const idx = q.options.map((_, i) => i);
    if (!q.keepOrder && n > 1) {
      let h = 2166136261;
      const seed = String(q.prompt || '') + q.options.map(o => o.t).join('|');
      for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
      const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; h |= 0; return (h >>> 0) / 4294967296; };
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    }
    q._order = idx;
    return idx;
  }

  function drawBilayer(parent, x0, x1, yTop, yBot, holes, scale) {
    // two rows of phospholipid heads with tails; `holes` = list of [xa, xb] to leave empty
    scale = scale || 1;
    const g = svgEl('g', {}, parent);
    svgEl('rect', { x: x0, y: yTop, width: x1 - x0, height: yBot - yTop, fill: '#f0ead8' }, g);
    const step = 14 * scale, r = 6 * scale, tail = 12 * scale;
    for (let x = x0 + step / 2; x < x1; x += step) {
      if (holes.some(([a, b]) => x > a && x < b)) continue;
      for (const [cy, dir] of [[yTop + r + 1, 1], [yBot - r - 1, -1]]) {
        svgEl('circle', { cx: x, cy, r, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1 }, g);
        svgEl('path', { d: `M${x - r / 2},${cy + dir * r} l0,${dir * tail} M${x + r / 2},${cy + dir * r} l0,${dir * tail}`, stroke: '#8a7a50', 'stroke-width': 1.5, fill: 'none' }, g);
      }
    }
    return g;
  }

  function drawChargeRow(parent, x0, x1, y, sign, color, size) {
    size = size || 18;
    const g = svgEl('g', { 'font-size': size, 'font-weight': 700, fill: color, 'text-anchor': 'middle', 'pointer-events': 'none' }, parent);
    for (let x = x0 + 20; x < x1; x += size * 2.6) svgEl('text', { x, y, text: sign }, g);
    return g;
  }

  // ---------------------------------------------------------------- narration helpers
  const chip = (k) => `<span class="ion ${k.toLowerCase()}">${ION_LABEL[k]}</span>`;
  const IN = '<span class="dir">IN</span>', OUT = '<span class="dir">OUT</span>';
  const I = chip;
  const FB_GRADIENT = 'Ions move down their concentration gradient (from where they are concentrated to where they are scarce) and toward the side whose charge attracts them.';
  function spikeIn(events, name) { return events.some(e => e.type === 'spike' && e.name === name); }
  function anySpike(events) { return events.some(e => e.type === 'spike'); }

  const LOOP_HTML = `<div class="loop-diagram">
      <div class="node" data-loop="depol">membrane depolarizes</div><div class="arrow">↓</div>
      <div class="node" data-loop="open">voltage-gated Na⁺ channels open</div><div class="arrow">↓</div>
      <div class="node" data-loop="in">Na⁺ rushes in</div><div class="arrow">↓ (and back to the top)</div>
      <div class="node" data-loop="more">more depolarization → more Na⁺ channels open</div>
    </div>`;

  // Step keys inherited by later steps of the same scene (see gotoStep).
  const STEP_KEYS = ['view', 'viewOpts', 'record', 'electrode', 'labels', 'showG', 'gComp', 'extra', 'speed', 'bands', 'historyMs', 'window'];

  // =========================================================================
  // init(config): build the app for one page
  // =========================================================================
  function init(config) {
    const sim = config.model;
    const profile = config.profile;
    const REST = profile.rest, THR = profile.threshold;
    const setCaption = (text) => { $('#stage-caption').textContent = text == null ? '' : text; };

    // Voltage → colour (blue = hyperpolarized, slate = rest, orange/red = depolarized), relative to rest.
    const V_STOPS = [[REST - 25, [59, 111, 214]], [REST, [125, 138, 165]], [REST + 15, [190, 165, 110]], [REST + 50, [240, 160, 48]], [REST + 115, [229, 72, 46]]];
    function vColor(V) {
      V = clamp(V, REST - 25, REST + 115);
      for (let i = 0; i < V_STOPS.length - 1; i++) {
        const [v0, c0] = V_STOPS[i], [v1, c1] = V_STOPS[i + 1];
        if (V <= v1) {
          const t = (V - v0) / (v1 - v0);
          return `rgb(${Math.round(lerp(c0[0], c1[0], t))},${Math.round(lerp(c0[1], c1[1], t))},${Math.round(lerp(c0[2], c1[2], t))})`;
        }
      }
      return 'rgb(229,72,46)';
    }
    // Cytosol fill: cream at rest, warms toward orange when depolarized, cools toward blue when hyperpolarized.
    function insideFill(V) {
      const base = [251, 243, 230];
      let target = base, f = 0;
      if (V > REST + 1) { target = [240, 150, 40]; f = clamp((V - REST) / 100, 0, 0.75); }
      else if (V < REST - 1) { target = [120, 160, 230]; f = clamp((REST - V) / 30, 0, 0.6); }
      return `rgb(${Math.round(lerp(base[0], target[0], f))},${Math.round(lerp(base[1], target[1], f))},${Math.round(lerp(base[2], target[2], f))})`;
    }

    // =======================================================================
    // Shared state
    // =======================================================================
    const app = {
      speed: 0.01,          // simulated ms per real ms
      paused: false,
      view: null,           // current view object
      viewName: null,
      recordComp: profile.comp,   // compartment shown on the trace
      extraTraces: [],      // additional compartments to plot
      showG: false,
      gComp: null,          // compartment for the conductance sub-plot (default: recordComp)
      bands: [],            // extra sub-plots under the trace: {key, label, color, max, min}
      history: [],          // {t, V:{name:mV}, gNa:{}, gK:{}, x:{}}
      historyMs: 400,       // ms of history kept
      historyWindow: 60,    // ms visible
      electrode: false,
      labels: true,
      time: 0,
      lastFrame: null,
      markers: [],          // {t, label}
      showThreshold: false, // threshold line appears once the concept is introduced (scene.showThreshold)
      userSpeed: null,      // speed chosen by the user via the menu; cleared on scene change
      listeners: [],        // event listeners for sim events
      narrateQueue: [],     // narration lines waiting their turn (see pumpNarration)
      narrateHeld: 0,       // ms the current narration line has been on screen
      narrateShownKey: null,  // which beat is on screen, ignoring its live numbers
      narrateQueuedKey: null, // which beat was queued last, ignoring its live numbers
    };
    function fireEvent(ev) { for (const l of app.listeners) l(ev); }

    const stage = $('#stage');
    const panel = $('#panel');
    const traceCanvas = $('#trace');
    const views = {};
    const runner = { scene: 0, step: 0, state: null, ctx: null, labMode: false };
    let LESSON = [];

    function mountView(name, opts) {
      if (app.view && app.view.unmount) app.view.unmount();
      stage.innerHTML = '';
      app.viewName = name;
      app.view = views[name](opts || {});
      app.view.name = name;
      if (app.view.mount) app.view.mount(stage);
      return app.view;
    }

    // ---------------------------------------------------------------- whole-cell inset
    function drawCell(parent, opts) { return config.drawCell(parent, opts || {}, kit); }
    function drawInset(parent, region) {
      const fr = Object.assign({ transform: 'translate(672,4) scale(0.245)', x: -10, y: -10, width: 960, height: 520 }, profile.insetFrame || {});
      const g = svgEl('g', { transform: fr.transform }, parent);
      svgEl('rect', { x: fr.x, y: fr.y, width: fr.width, height: fr.height, fill: 'rgba(255,255,255,.85)', stroke: '#d9d6cc', 'stroke-width': 4, rx: 20 }, g);
      const d = drawCell(g, { inset: true });
      const regions = profile.insetRegions || {};
      const pos = regions[region] || regions.default || [0, 0, 0, 0];
      svgEl('ellipse', { cx: pos[0], cy: pos[1], rx: pos[2], ry: pos[3], fill: 'none', stroke: '#2f6fd6', 'stroke-width': 8, 'stroke-dasharray': '18 12' }, g);
      return { g, parts: d.parts, update: (o) => d.update(o || { hideLabels: true }) };
    }

    // Voltage ladder: where Vm is, and who is pulling it (Na⁺ up toward E_Na, K⁺ down toward E_K).
    function drawLadder(parent, x, y) {
      const g = svgEl('g', { transform: `translate(${x},${y})`, 'font-size': 12.5, fill: '#3a3f4a' }, parent);
      const H = 196, yOf = (V) => H - (clamp(V, -100, 70) + 100) * (H / 170);
      svgEl('text', { x: 0, y: -12, 'font-weight': 700, 'font-size': 14, text: 'Where is Vm being pulled?' }, g);
      svgEl('rect', { x: 0, y: 0, width: 14, height: H, rx: 4, fill: '#e9e6dc', stroke: '#c9c4b4' }, g);
      const ticks = {};
      const tick = (V, label, color, key) => {
        const t = svgEl('g', { 'data-tick': key || '' }, g);
        const line = svgEl('line', { x1: -4, y1: yOf(V), x2: 18, y2: yOf(V), stroke: color, 'stroke-width': 1.5 }, t);
        const text = svgEl('text', { x: 24, y: yOf(V) + 4, fill: color, text: label }, t);
        ticks[key] = { V, t, line, text };
        return t;
      };
      const move = (key, V, label) => {
        const tk = ticks[key];
        if (tk.V === V && tk.text.textContent === label) return;
        tk.V = V; tk.line.setAttribute('y1', yOf(V)); tk.line.setAttribute('y2', yOf(V)); tk.text.setAttribute('y', yOf(V) + 4); tk.text.textContent = label;
      };
      const E0 = sim.E;
      tick(E0.Na, `E_Na ${fmtE(E0.Na)}  (Na⁺ pulls up)`, ION_COLOR.Na, 'ena');
      tick(0, '0 mV', '#6b7280', 'zero');
      const thr = tick(THR, `threshold ${fmtE(THR)}`, '#d97706', 'thr');
      tick(REST, `rest ${fmtE(REST)}`, '#2563eb', 'rest');
      tick(E0.K, `E_K ${fmtE(E0.K)}  (K⁺ pulls down)`, ION_COLOR.K, 'ek');
      const naArrow = svgEl('path', { d: '', stroke: ION_COLOR.Na, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }, g);
      const naHead = svgEl('path', { d: '', fill: ION_COLOR.Na }, g);
      const kArrow = svgEl('path', { d: '', stroke: ION_COLOR.K, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round' }, g);
      const kHead = svgEl('path', { d: '', fill: ION_COLOR.K }, g);
      const pointer = svgEl('path', { d: '', fill: '#1f2430' }, g);
      const pline = svgEl('line', { x1: 0, y1: 0, x2: 14, y2: 0, stroke: '#1f2430', 'stroke-width': 3 }, g);
      const ptext = svgEl('text', { x: -8, y: 0, 'text-anchor': 'end', 'font-weight': 700, 'font-size': 14, fill: '#1f2430', text: '' }, g);
      return {
        update(V, gNaPull, gKPull) {
          const E = sim.E;
          move('ena', E.Na, `E_Na ${fmtE(E.Na)}  (Na⁺ pulls up)`);
          move('ek', E.K, `E_K ${fmtE(E.K)}  (K⁺ pulls down)`);
          const y = yOf(V);
          pline.setAttribute('y1', y); pline.setAttribute('y2', y);
          pointer.setAttribute('d', `M-8,${y} l-7,-5 l0,10 z`);
          ptext.setAttribute('y', y + 4); ptext.textContent = fmtV(V);
          const na = Math.min(y - 8, gNaPull * 104), k = Math.min(H - y - 8, gKPull * 104);
          naArrow.setAttribute('d', na > 3 ? `M7,${y - 2} L7,${y - na}` : '');
          naHead.setAttribute('d', na > 3 ? `M7,${y - na - 7} l-6,8 l12,0 z` : '');
          kArrow.setAttribute('d', k > 3 ? `M7,${y + 2} L7,${y + k}` : '');
          kHead.setAttribute('d', k > 3 ? `M7,${y + k + 7} l-6,-8 l12,0 z` : '');
          thr.setAttribute('opacity', app.showThreshold ? 1 : 0);
        },
      };
    }

    // Compact concentration / Nernst table.
    function drawConcTable(parent, x, y) {
      const lg = svgEl('g', { transform: `translate(${x},${y})`, 'font-size': 12.5, fill: '#3a3f4a' }, parent);
      svgEl('text', { x: 0, y: 0, 'font-weight': 700, 'font-size': 14, text: 'Concentrations (mM)' }, lg);
      svgEl('text', { x: 66, y: 20, 'font-weight': 700, text: 'out' }, lg); svgEl('text', { x: 114, y: 20, 'font-weight': 700, text: 'in' }, lg); svgEl('text', { x: 162, y: 20, 'font-weight': 700, text: 'E (mV)' }, lg);
      const rows = [['Na', 'Na⁺'], ['K', 'K⁺'], ['Cl', 'Cl⁻'], ['Ca', 'Ca²⁺']].filter(([k]) => sim.conc[k]).map(([k, lab], i) => {
        const yy = 40 + i * 19;
        svgEl('circle', { cx: 7, cy: yy - 4, r: 7, fill: ION_COLOR[k] }, lg);
        svgEl('text', { x: 20, y: yy, text: lab }, lg);
        return { k, out: svgEl('text', { x: 66, y: yy }, lg), inn: svgEl('text', { x: 114, y: yy }, lg), e: svgEl('text', { x: 162, y: yy }, lg) };
      });
      svgEl('text', { x: 0, y: 128, 'font-size': 11.5, fill: '#6b7280', text: 'E = the voltage at which that ion stops moving' }, lg);
      svgEl('text', { x: 0, y: 143, 'font-size': 11.5, fill: '#6b7280', text: '(its equilibrium potential). Drawings not to scale.' }, lg);
      return {
        update() {
          const E = sim.E;
          for (const r of rows) {
            const c = sim.conc[r.k];
            r.out.textContent = c.out < 1 ? String(c.out) : c.out.toFixed(0);
            r.inn.textContent = c.in < 1 ? String(c.in) : c.in.toFixed(0);
            r.e.textContent = fmtV(E[r.k]).replace('.0', '');
          }
        },
      };
    }

    // ---------------------------------------------------------------- membrane strip (generic)
    // opts: { comp, channels: ['K_leak', ...], inset, ions: {outside:{}, inside:{}}, caption }
    views.membrane = function (opts) {
      // A thicker membrane in a wider strip: the channels and their labels are what students
      // are reading here, so the strip takes the space and the side panels are pushed right.
      const X0 = 18, X1 = 644, Y_TOP = 212, Y_BOT = 300, CH_SCALE = 1.3;
      let svg, chans = [], pool, particles, chargePlus, chargeMinus, chargeFlipPlus, chargeFlipMinus, insideRect, inset, electrodeTip, pumpPhase = 0, ladder, table;
      const counters = [], typeCount = {};
      const comp = () => sim.byName[opts.comp || profile.comp];
      const channelTypes = opts.channels || ['K_leak', 'Na_leak', 'pump'];
      channelTypes.forEach(t => { typeCount[t] = (typeCount[t] || 0) + 1; });
      const isManualComp = (c) => c.name === profile.comp;
      function layout() {
        const n = channelTypes.length, spanX0 = X0 + 76, spanX1 = X1 - 78;
        return channelTypes.map((t, i) => n === 1 ? (spanX0 + spanX1) / 2 : lerp(spanX0, spanX1, i / (n - 1)));
      }
      // current through one drawn channel of a given type (nA; negative = inward)
      function channelCurrent(t, c, V, E) {
        const share = 1 / typeCount[t];
        const spec = CH[t];
        if (spec && spec.current) return spec.current(c, V, E, sim) * share;
        if (t === 'K_leak') return c.gKLeak * (V - E.K) * share;
        if (t === 'Na_leak') return c.gNaLeak * (V - E.Na) * share;
        if (t === 'Na_v') return c.gNa * (V - E.Na) * share;
        if (t === 'K_v') return c.gK * (V - E.K) * share;
        if (t === 'Na_manual') return sim.manual.gNa * (V - E.Na);
        if (t === 'K_manual') return sim.manual.gK * (V - E.K);
        if (t === 'Cl_manual') return sim.manual.gCl * (V - E.Cl);
        if (t === 'Ca_v') return sim.terminal ? sim.terminal.iCa : 0;
        return 0;
      }
      function channelState(t, c) {
        const spec = CH[t];
        if (spec && spec.state) return spec.state(c, sim);
        if (t === 'K_leak' || t === 'Na_leak') return 'open';
        if (t === 'Na_v') return sim.naState(c);
        if (t === 'K_v') return sim.kState(c);
        if (t === 'Na_manual') return sim.manual.gNa > 0 ? 'open' : 'closed';
        if (t === 'K_manual') return sim.manual.gK > 0 ? 'open' : 'closed';
        if (t === 'Cl_manual') return sim.manual.gCl > 0 ? 'open' : 'closed';
        if (t === 'Ca_v') return sim.terminal ? sim.caState(sim.terminal) : 'closed';
        return 'closed';
      }
      return {
        mount(el) {
          svg = svgEl('svg', { viewBox: '0 0 900 520' });
          el.appendChild(svg);
          svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, svg);
          svgEl('rect', { x: X0, y: 20, width: X1 - X0, height: Y_TOP - 20, fill: '#eef2fa', rx: 10 }, svg);
          insideRect = svgEl('rect', { x: X0, y: Y_BOT, width: X1 - X0, height: 500 - Y_BOT, fill: '#fbf3e6', rx: 10 }, svg);
          svgEl('text', { x: X0 + 12, y: 42, 'font-size': 16, fill: '#4a5468', 'font-weight': 600, text: 'OUTSIDE the cell' }, svg);
          svgEl('text', { x: X0 + 12, y: 494, 'font-size': 16, fill: '#6b5a3a', 'font-weight': 600, text: 'INSIDE the cell' }, svg);
          const xs = layout();
          const hole = 28 * CH_SCALE + 5;
          drawBilayer(svg, X0, X1, Y_TOP, Y_BOT, xs.map(x => [x - hole, x + hole]), CH_SCALE);
          const chLayer = svgEl('g', {}, svg);
          const dense = channelTypes.length > 5;
          chans = channelTypes.map((t, i) => {
            const ch = drawChannel(chLayer, xs[i], Y_TOP, Y_BOT, t, CH_SCALE);
            const label = dense ? CH[t].label.replace('voltage-gated ', 'V-gated ').replace(' (yours)', '') : CH[t].label;
            svgEl('text', { x: xs[i], y: Y_BOT + 24 + (dense && i % 2 ? 16 : 0), 'font-size': dense ? 12 : 14, 'text-anchor': 'middle', fill: '#4a4f5a', text: label }, chLayer);
            counters.push(fluxCounter(t.endsWith('leak') ? 9 : (t === 'pump' ? 0 : 2.2)));
            return ch;
          });
          chargePlus = drawChargeRow(svg, X0, X1, Y_TOP - 14, '+', '#b45309', 21);
          chargeMinus = drawChargeRow(svg, X0, X1, Y_BOT + 52, '−', '#1d4ed8', 21);
          chargeFlipPlus = drawChargeRow(svg, X0, X1, Y_BOT + 52, '+', '#b45309', 21);
          chargeFlipMinus = drawChargeRow(svg, X0, X1, Y_TOP - 14, '−', '#1d4ed8', 21);
          const ionLayer = svgEl('g', {}, svg);
          const ions = opts.ions || {};
          const out = Object.assign({ Na: 22, K: 3, Cl: 14, Ca: 6 }, ions.outside || {});
          const inn = Object.assign({ K: 22, Na: 3, Cl: 2, A: 14 }, ions.inside || {});
          pool = { outside: makeIonPool(ionLayer, { x0: X0, x1: X1, y0: 52, y1: Y_TOP - 26 }, out, { r: 10 }), inside: makeIonPool(ionLayer, { x0: X0, x1: X1, y0: Y_BOT + 62, y1: 480 }, inn, { r: 10 }) };
          particles = makeParticles(svgEl('g', {}, svg));
          electrodeTip = svgEl('g', { opacity: 0 }, svg);
          svgEl('path', { d: `M${X1 - 14},${Y_BOT + 100} L${X1 - 38},24 L${X1 - 26},24 L${X1 - 6},${Y_BOT + 98} Z`, fill: '#dfe6f2', stroke: '#2a2f3a', 'stroke-width': 1.5 }, electrodeTip);
          svgEl('text', { x: X1 - 42, y: 16, 'font-size': 13, fill: '#4a4f5a', 'text-anchor': 'end', text: 'recording electrode' }, electrodeTip);
          inset = drawInset(svg, opts.inset || opts.comp || profile.comp);
          ladder = drawLadder(svg, 706, 160);
          table = drawConcTable(svg, 682, 372);
          setCaption(opts.caption || '');
        },
        update(dtReal, dtSim) {
          const c = comp(), V = c.V, E = sim.E;
          insideRect.setAttribute('fill', insideFill(V));
          const neg = clamp(V / REST, 0, 1), pos = clamp(V / 35, 0, 1);
          chargePlus.setAttribute('opacity', neg); chargeMinus.setAttribute('opacity', neg);
          chargeFlipPlus.setAttribute('opacity', pos); chargeFlipMinus.setAttribute('opacity', pos);
          chans.forEach((ch, i) => {
            const t = channelTypes[i];
            if (t === 'pump') {
              if (sim.pumpOn && !app.paused) {
                pumpPhase += dtReal / 1400;
                if (pumpPhase >= 1) {
                  pumpPhase = 0;
                  for (let k = 0; k < 3; k++) particles.spawn('Na', ch.x + rand(-8, 8), Y_BOT + 40 + k * 10, ch.x + rand(-40, 40), Y_TOP - 40 - k * 8, 1100, { linger: 300 });
                  for (let k = 0; k < 2; k++) particles.spawn('K', ch.x + rand(-8, 8), Y_TOP - 40 - k * 10, ch.x + rand(-40, 40), Y_BOT + 40 + k * 8, 1100, { linger: 300 });
                }
              }
              return;
            }
            const state = channelState(t, c);
            setChannelState(ch, state);
            if (state === 'open' && !app.paused) {
              const I = channelCurrent(t, c, V, E) * (profile.fluxScale || 1);   // profile.fluxScale: per-page particle density (a fibre segment carries ~100× a soma's current)
              const n = Math.min(3, counters[i](I, dtSim));
              for (let k = 0; k < n; k++) {
                const ion = ch.spec.ion, jitter = rand(-6, 6), dur = rand(650, 1000);
                if (I < 0) particles.spawn(ion, ch.x + jitter, Y_TOP - 30 - rand(0, 40), ch.x + rand(-80, 80), Y_BOT + 50 + rand(0, 60), dur);
                else particles.spawn(ion, ch.x + jitter, Y_BOT + 30 + rand(0, 40), ch.x + rand(-80, 80), Y_TOP - 50 - rand(0, 60), dur);
              }
            }
          });
          if (!app.paused) { pool.outside.update(dtReal); pool.inside.update(dtReal); }
          particles.update(dtReal);
          // ladder: pulls are conductance shares
          const manual = isManualComp(c) ? sim.manual : { gNa: 0, gK: 0, gCl: 0 };
          const gNaTot = c.gNa + manual.gNa + c.gNaLeak;
          const gKTot = c.gK + manual.gK + c.gKLeak;
          const gAll = gNaTot + gKTot + (c.gL - c.gKLeak - c.gNaLeak) + manual.gCl + 1e-9;
          ladder.update(V, gNaTot / gAll, gKTot / gAll);
          table.update();
          electrodeTip.setAttribute('opacity', app.electrode ? 1 : 0);
          inset.update({ hideLabels: true });
        },
        narrate() {
          const c = comp(), V = c.V, d = c.dVdt, na = sim.naState(c), k = sim.kState(c), E = sim.E;
          const hasNaV = channelTypes.includes('Na_v');
          if (sim.manual.gNa > 0) return `You opened ${chip('Na')} channels → Na⁺ flows ${IN} (high outside, and the negative inside attracts it) → the inside gains positive charge → <b>Vm rises</b> toward E_Na.`;
          if (sim.manual.gK > 0) return `You opened extra ${chip('K')} channels → K⁺ flows ${OUT} (high inside) → the inside loses positive charge → <b>Vm falls</b> toward E_K.`;
          if (sim.manual.gCl > 0) return `You opened ${chip('Cl')} channels → Cl⁻ flows ${IN} → Vm is pulled toward E_Cl and <b>held near rest</b>.`;
          if (hasNaV && na === 'open' && d > 5 && V < 30) return `Voltage-gated ${chip('Na')} channels <b>OPEN</b> → Na⁺ rushes ${IN} → Vm shoots up toward E_Na (${fmtE(E.Na)}). Each bit of depolarization opens more Na⁺ channels.`;
          if (hasNaV && V > 0) return `<b>At the peak (${fmtV(V)} mV):</b> ${chip('Na')} channels are <b>inactivating</b> (plugs swing in) and the slower ${chip('K')} channels are opening. Na⁺ entry stops; K⁺ exit begins. Vm never reaches E_Na.`;
          if (hasNaV && (na === 'inactivated' || k === 'open') && d < -5) return `${chip('Na')} channels <b>INACTIVATED</b> (plugged, no more Na⁺ can enter). ${chip('K')} channels <b>OPEN</b> → K⁺ flows ${OUT} → Vm falls toward E_K (${fmtE(E.K)}).`;
          if (hasNaV && k === 'open' && V < REST - 2) return `<b>Undershoot:</b> ${chip('K')} channels are still open, so Vm sits below rest, close to E_K. ${chip('Na')} channels are recovering from inactivation.`;
          if (hasNaV && na === 'inactivated' && V > REST + 10) return `${chip('Na')} channels are inactivated; ${chip('K')} channels are opening. Na⁺ entry has stopped, K⁺ exit begins.`;
          if (d > 1 && V > REST + 2) return `Positive charge is entering (from the rest of the cell) → <b>depolarizing</b>: Vm = ${fmtV(V)} mV.`;
          if (d < -1 && V < REST + 4) return `Positive charge is leaving → <b>repolarizing</b> toward rest.`;
          if (V < REST - 2) return `Below rest: more ${chip('K')} is leaving than usual; Vm will drift back to ${fmtE(REST)} as K⁺ channels close.`;
          return `<b>At rest (≈ ${fmtE(REST)} mV):</b> ${chip('K')} trickles ${OUT} through leak channels (that is what makes the inside negative); a little ${chip('Na')} leaks ${IN}; the pump quietly restores the gradients.`;
        },
        channels: () => chans,
      };
    };

    // =======================================================================
    // Voltage trace
    // =======================================================================
    const TRACE_COLORS = profile.traceColors || {};
    const traceTitle = (comp) => profile.traceTitle ? profile.traceTitle(comp) : `Membrane potential recorded inside the ${comp}`;
    function recordSample() {
      const s = { t: sim.t, V: {}, gNa: {}, gK: {}, x: sim.sampleExtras ? sim.sampleExtras() : {} };
      for (const c of sim.comps) { s.V[c.name] = c.V; s.gNa[c.name] = c.gNa; s.gK[c.name] = c.gK; }
      if (profile.extraVoltages) Object.assign(s.V, profile.extraVoltages(sim));
      app.history.push(s);
      const tmin = sim.t - app.historyMs;
      while (app.history.length && app.history[0].t < tmin) app.history.shift();
    }
    function gCompName() {
      let gc = app.gComp || app.recordComp;
      const c = sim.byName[gc];
      if (!c || !(c.gNaMax > 0)) gc = profile.apComp;
      return gc;
    }
    function drawTrace() {
      const dpr = window.devicePixelRatio || 1;
      const w = traceCanvas.clientWidth, h = traceCanvas.clientHeight;
      if (traceCanvas.width !== Math.round(w * dpr) || traceCanvas.height !== Math.round(h * dpr)) { traceCanvas.width = Math.round(w * dpr); traceCanvas.height = Math.round(h * dpr); }
      const ctx = traceCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const padL = 74, padR = 14, padT = 8, padB = 20;
      const vmin = -100, vmax = 50;
      const BAND_H = 50;
      const gBand = app.showG ? 62 : 0, bandsH = app.bands.length * BAND_H, plotBottom = h - padB - gBand - bandsH;
      const W = app.historyWindow, t1 = Math.max(sim.t, W), t0 = t1 - W;
      const X = (t) => padL + (t - t0) / W * (w - padL - padR);
      const Y = (v) => padT + (vmax - v) / (vmax - vmin) * (plotBottom - padT);
      // grid
      ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const grid = [
        { v: 50, lab: '+50', color: '#9ca3af', dash: [] },
        { v: 0, lab: '0', color: '#6b7280', dash: [] },
        { v: THR, lab: 'threshold', color: '#d97706', dash: [4, 4], thr: true },
        { v: REST, lab: `rest ${fmtE(REST)}`, color: '#2563eb', dash: [2, 4] },
        { v: -100, lab: '−100', color: '#9ca3af', dash: [] },
      ];
      for (const { v, lab, color, dash, thr } of grid) {
        if (thr && !app.showThreshold) continue;
        ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, Y(v)); ctx.lineTo(w - padR, Y(v)); ctx.stroke();
        ctx.fillStyle = color; ctx.fillText(lab, padL - 4, Y(v));
      }
      ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = '#6b7280';
      const tickMs = W <= 100 ? 10 : (W <= 400 ? 50 : (W <= 1000 ? 100 : 200));
      for (let t = Math.ceil(t0 / tickMs) * tickMs; t <= t1 + 1e-6; t += tickMs) { ctx.fillText(t.toFixed(0), X(t), h - padB + 4); ctx.strokeStyle = '#eee'; ctx.beginPath(); ctx.moveTo(X(t), padT); ctx.lineTo(X(t), plotBottom); ctx.stroke(); }
      ctx.textAlign = 'left'; ctx.fillText('time (ms)', 4, h - padB + 4);
      // conductance sub-plot: how many Na⁺ / K⁺ channels are open
      if (app.showG) {
        const gc = gCompName();
        const gmax = Math.max(sim.byName[gc] ? sim.byName[gc].gNaMax : 0, 1e-9);
        const top = plotBottom + 10, bh = gBand - 16, base = top + bh;
        ctx.strokeStyle = '#d1d5db'; ctx.beginPath(); ctx.moveTo(padL, base); ctx.lineTo(w - padR, base); ctx.stroke();
        ctx.fillStyle = '#6b7280'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText('open', padL - 4, top + 4); ctx.fillText('channels', padL - 4, top + 16); ctx.fillText('none', padL - 4, base);
        for (const [key, color] of [['gNa', '#e8772e'], ['gK', '#8e5cf0']]) {
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); let first = true;
          for (const s of app.history) { if (s.t < t0 || s[key][gc] == null) continue; const y = base - clamp(s[key][gc] / gmax, 0, 1) * bh; if (first) { ctx.moveTo(X(s.t), y); first = false; } else ctx.lineTo(X(s.t), y); }
          ctx.stroke();
        }
      }
      // extra bands: model-specific scalar series recorded in s.x[key]
      app.bands.forEach((b, j) => {
        const top = plotBottom + gBand + 10 + j * BAND_H, bh = BAND_H - 16, base = top + bh;
        const lo = b.min || 0, hi = b.max == null ? 1 : b.max;
        ctx.strokeStyle = '#d1d5db'; ctx.beginPath(); ctx.moveTo(padL, base); ctx.lineTo(w - padR, base); ctx.stroke();
        ctx.fillStyle = '#6b7280'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const lines = String(b.label || b.key).split('\n');
        lines.forEach((ln, i) => ctx.fillText(ln, padL - 4, top + 4 + i * 12));
        ctx.strokeStyle = b.color || '#1f2430'; ctx.lineWidth = 2; ctx.beginPath(); let first = true;
        for (const s of app.history) { const v = s.x && s.x[b.key]; if (s.t < t0 || v == null) continue; const y = base - clamp((v - lo) / (hi - lo || 1), 0, 1) * bh; if (first) { ctx.moveTo(X(s.t), y); first = false; } else ctx.lineTo(X(s.t), y); }
        ctx.stroke();
      });
      // traces
      const series = [[app.recordComp, TRACE_COLORS[app.recordComp] || '#1f2430', 2.2]].concat(app.extraTraces.map(c => [c, TRACE_COLORS[c] || '#0f766e', 1.6]));
      for (const [comp, color, lw] of series) {
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath(); let first = true;
        for (const s of app.history) { if (s.t < t0 || s.V[comp] == null) continue; const x = X(s.t), y = Y(clamp(s.V[comp], vmin, vmax)); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
        ctx.stroke();
      }
      // markers
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const m of app.markers) { if (m.t < t0) continue; ctx.strokeStyle = '#9ca3af'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(m.t), padT); ctx.lineTo(X(m.t), plotBottom); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = '#374151'; ctx.fillText(m.label, X(m.t) + 3, padT + 2); }
      // legend
      const legend = $('#trace-legend');
      legend.innerHTML = series.map(([comp, color]) => `<span><i style="background:${color}"></i>${comp}</span>`).join('')
        + (app.showG ? `<span><i style="background:#e8772e"></i>gNa</span><span><i style="background:#8e5cf0"></i>gK</span>` : '')
        + app.bands.map(b => `<span><i style="background:${b.color || '#1f2430'}"></i>${String(b.label || b.key).split('\n')[0]}</span>`).join('');
    }
    function applyTraceLayout() {
      traceCanvas.classList.toggle('with-g', app.showG);
      traceCanvas.classList.toggle('with-bands', app.bands.length > 0);
      traceCanvas.style.setProperty('--bands', String(app.bands.length));
    }

    // =======================================================================
    // Side panel / lesson runner
    // =======================================================================
    const ctx = {
      sim, app, profile,
      view: () => app.view,
      complete() { if (runner.state && !runner.state.done) { runner.state.done = true; refreshNav(); } },
      status(msg, ok) { const s = panel.querySelector('.status'); if (s) { s.innerHTML = msg; s.classList.toggle('ok', !!ok); } },
      pause() { setPaused(true); },
      resume() { setPaused(false); },
      next() { gotoStep(runner.scene, runner.step + 1); },
      mark(label) { app.markers.push({ t: sim.t, label }); },
      stepState: () => runner.state,
      refresh() { renderPanel(); },
    };

    function setPaused(p) {
      app.paused = p;
      $('#btn-pause').textContent = p ? 'Resume' : 'Pause';
      $('#paused-badge').style.display = p ? 'block' : 'none';
    }
    function setSpeed(s) { app.speed = s; const sel = $('#speed'); sel.value = String(s); if (sel.value !== String(s)) { const o = document.createElement('option'); o.value = String(s); o.textContent = `1 s = ${(s * 1000) % 1 === 0 ? (s * 1000).toFixed(0) : (s * 1000).toFixed(1)} ms`; sel.appendChild(o); sel.value = String(s); } }

    function currentStep() { return LESSON[runner.scene].steps[runner.step]; }

    function gotoStep(si, ki) {
      if (si >= LESSON.length) si = LESSON.length - 1;
      if (ki >= LESSON[si].steps.length) { if (si + 1 < LESSON.length) { si++; ki = 0; } else { ki = LESSON[si].steps.length - 1; } }
      if (ki < 0) { if (si > 0) { si--; ki = LESSON[si].steps.length - 1; } else ki = 0; }
      runner.labMode = false;
      const sceneChanged = si !== runner.scene || runner.state == null;
      runner.scene = si; runner.step = ki;
      const scene = LESSON[si], step = scene.steps[ki];
      runner.state = { done: !step.waitFor, answered: !step.question, attempts: 0, data: {} };
      // Steps inherit view configuration from earlier steps of the same scene, so jumping
      // into the middle of a scene (or stepping back into it) shows the right picture.
      const eff = {};
      for (let j = 0; j <= ki; j++) for (const k of STEP_KEYS) if (scene.steps[j][k] != null) eff[k] = scene.steps[j][k];
      const needView = eff.view && (eff.view !== app.viewName || step.remount || sceneChanged || (step.viewOpts && step.view));
      if (needView) mountView(eff.view, eff.viewOpts || {});
      else if (eff.viewOpts && eff.viewOpts.caption != null) setCaption(eff.viewOpts.caption);
      if (sceneChanged) app.userSpeed = null;
      if (app.userSpeed == null) setSpeed(eff.speed || scene.speed || 0.01);
      app.showThreshold = !!scene.showThreshold;
      setPaused(!!step.pause);
      if (eff.record) app.recordComp = eff.record;
      app.extraTraces = eff.extra || [];
      app.showG = !!eff.showG; $('#show-g').checked = app.showG;
      app.gComp = eff.gComp || null;
      app.bands = eff.bands || scene.bands || [];
      app.historyMs = eff.historyMs || scene.historyMs || 400;
      app.historyWindow = eff.window || scene.window || 60;
      applyTraceLayout();
      if (eff.electrode != null) app.electrode = eff.electrode;
      if (eff.labels != null) app.labels = eff.labels;
      if (step.reset) { sim.reset(); app.history = []; app.markers = []; }
      app.narrateQueue.length = 0; app.narrateHeld = NARRATE_HOLD; app.narrateShownKey = null; app.narrateQueuedKey = null;
      if (step.enter) step.enter(ctx);
      renderPanel();
      renderProgress();
      $('#trace-title').textContent = traceTitle(app.recordComp);
    }

    function renderProgress() {
      const p = $('#progress'); p.innerHTML = '';
      LESSON.forEach((s, i) => {
        const b = document.createElement('button');
        b.textContent = i + 1; b.title = s.title;
        b.className = runner.labMode ? '' : (i < runner.scene ? 'done' : i === runner.scene ? 'current' : '');
        b.addEventListener('click', () => gotoStep(i, 0));
        p.appendChild(b);
      });
    }

    function renderPanel() {
      const scene = LESSON[runner.scene], step = currentStep(), st = runner.state;
      panel.innerHTML = '';
      panel.appendChild(htmlEl('div', { class: 'scene-label' }, `Scene ${runner.scene + 1} of ${LESSON.length} · ${scene.title}`));
      panel.appendChild(htmlEl('h2', {}, step.title || scene.title));
      const text = typeof step.text === 'function' ? step.text(ctx) : step.text;
      if (text) panel.appendChild(htmlEl('div', { class: 'text' }, text));
      if (step.question) panel.appendChild(renderQuestion(step.question, st));
      if (step.actions && step.actions.length) {
        const a = htmlEl('div', { class: 'actions' });
        for (const act of step.actions) {
          const b = htmlEl('button', { class: act.cls || '' }, act.label);
          if (act.hold) {
            const down = (e) => { e.preventDefault(); act.down(ctx); b.classList.add('held'); };
            const up = () => { act.up(ctx); b.classList.remove('held'); };
            b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
          } else b.addEventListener('click', () => act.run(ctx));
          if (act.disabled && act.disabled(ctx)) b.disabled = true;
          a.appendChild(b);
        }
        panel.appendChild(a);
      }
      panel.appendChild(htmlEl('div', { class: 'status' }, step.status ? (typeof step.status === 'function' ? step.status(ctx) : step.status) : ''));
      if (step.extraHtml) panel.appendChild(htmlEl('div', { class: 'extra' }, typeof step.extraHtml === 'function' ? step.extraHtml(ctx) : step.extraHtml));
      const nav = htmlEl('div', { class: 'nav' });
      const back = htmlEl('button', {}, '← Back'); back.addEventListener('click', () => gotoStep(runner.scene, runner.step - 1)); if (runner.scene === 0 && runner.step === 0) back.disabled = true;
      const hint = htmlEl('span', { class: 'hint' }, '');
      const cont = htmlEl('button', { class: 'primary', id: 'btn-continue' }, step.continueLabel || 'Continue →');
      cont.addEventListener('click', () => { if (step.onContinue) step.onContinue(ctx); if (step.continueTo) step.continueTo(ctx); else gotoStep(runner.scene, runner.step + 1); });
      nav.appendChild(back); nav.appendChild(hint); nav.appendChild(cont);
      panel.appendChild(nav);
      refreshNav();
    }

    function refreshNav() {
      const st = runner.state, step = currentStep(), b = $('#btn-continue'), hint = panel.querySelector('.nav .hint');
      if (!b) return;
      const ok = st.answered && st.done;
      b.disabled = !ok;
      if (hint) hint.textContent = ok ? '' : (!st.answered ? 'Answer the question to continue' : (step.waitHint || 'Complete the activity to continue'));
    }

    function renderQuestion(q, st) {
      const box = htmlEl('div', { class: 'question' });
      box.appendChild(htmlEl('div', { class: 'prompt' }, q.prompt));
      const opts = htmlEl('div', { class: 'options' });
      const fb = htmlEl('div', { class: 'feedback', style: 'display:none' });
      questionOrder(q).map(i => q.options[i]).forEach((o) => {
        const b = htmlEl('button', {}, o.t);
        b.addEventListener('click', () => {
          st.attempts++;
          Array.from(opts.children).forEach(c => c.classList.remove('wrong'));
          if (o.ok) {
            b.classList.add('correct');
            Array.from(opts.children).forEach(c => { c.disabled = true; });
            fb.className = 'feedback good'; fb.innerHTML = '<b>Right.</b> ' + (o.fb || q.explain || ''); fb.style.display = 'block';
            st.answered = true;
            if (q.onCorrect) q.onCorrect(ctx);
            refreshNav();
          } else {
            b.classList.add('wrong');
            fb.className = 'feedback bad'; fb.innerHTML = '<b>Not quite.</b> ' + (o.fb || 'Think about the concentration gradient and the charge of the ion.'); fb.style.display = 'block';
          }
        });
        opts.appendChild(b);
      });
      box.appendChild(opts); box.appendChild(fb);
      if (st.answered && q.explain) { fb.className = 'feedback good'; fb.innerHTML = '<b>Right.</b> ' + q.explain; fb.style.display = 'block'; Array.from(opts.children).forEach(c => { c.disabled = true; }); }
      return box;
    }

    // =======================================================================
    // Free-play lab (generic shell; config.lab(kit) renders the controls)
    // =======================================================================
    function enterLab() {
      runner.labMode = true;
      runner.state = { done: true, answered: true };
      renderProgress();
      sim.reset(); app.history = []; app.markers = [];
      app.showThreshold = true; app.userSpeed = null;
      app.gComp = null; app.bands = []; app.historyMs = 400; app.historyWindow = 60;
      applyTraceLayout();
      config.lab(kit);
      $('#trace-title').textContent = traceTitle(app.recordComp);
    }
    // "← Back to lesson" navigation row for the lab panel.
    function labNav() {
      const nav = htmlEl('div', { class: 'nav' });
      const back = htmlEl('button', {}, '← Back to lesson'); back.addEventListener('click', () => gotoStep(runner.scene, runner.step));
      nav.appendChild(back);
      return nav;
    }

    // =======================================================================
    // Lesson helpers exposed through the kit
    // =======================================================================
    // A brief current pulse into the stimulated compartment (model.pulse stops it by itself).
    const stimPulse = (nA, ms) => sim.pulse(profile.stimComp, nA == null ? profile.stimPulse.nA : nA, ms == null ? profile.stimPulse.ms : ms);
    // Samples recorded since this step began (or since the last re-arm).
    const since = (c) => { const d = c.stepState().data; if (d.t0 == null) d.t0 = sim.t; return app.history.filter(s => s.t >= d.t0); };
    const refire = { label: 'Fire again', cls: 'na', run: (c) => { setPaused(false); stimPulse(); c.stepState().data.armed = true; c.stepState().data.t0 = sim.t; } };
    function loopHighlight(c) {
      const h = sim.byName[profile.apComp];
      const set = (k, on) => { const e = panel.querySelector(`[data-loop="${k}"]`); if (e) e.classList.toggle('hot', !!on); };
      set('depol', h.dVdt > 5 && h.V < 0);
      set('open', sim.naState(h) === 'open');
      set('in', h.iNa < -0.5);
      set('more', h.dVdt > 50 && h.V < 20);
    }

    const kit = {
      // state
      sim, app, runner, profile, panel, stage, views, config,
      get lesson() { return LESSON; },
      // control
      setPaused, setSpeed, mountView, gotoStep, enterLab, renderProgress, setCaption, labNav,
      stimPulse, refire, since, spikeIn, anySpike, I, FB_GRADIENT, fmtV, fmtE, chip, IN, OUT, LOOP_HTML, loopHighlight, questionOrder,
      // drawing
      svgEl, setAttrs, htmlEl, $, clamp, lerp, rand, ION_COLOR, ION_LABEL, CH, vColor, insideFill,
      drawChannel, setChannelState, makeIonPool, makeParticles, fluxCounter, drawBilayer, drawChargeRow,
      drawInset, drawLadder, drawConcTable, drawCell,
    };

    // The running commentary under the stage. At the faster speeds several things happen inside a
    // second, and the text used to flick past faster than anyone could read it. Lines are now
    // queued and each is held long enough to read, so a burst is read as a short slideshow while
    // the traces and the animation carry on live. A line whose only change is its live numbers is
    // not a new line: it is updated in place, so the reading time is spent on real beats.
    const NARRATE_HOLD = 1300, NARRATE_QUEUE_MAX = 4;
    const narrateKey = (html) => String(html).replace(/[-+−]?[\d.,]+/g, '#').replace(/\s+/g, ' ');
    function pumpNarration(html, dtReal) {
      const el = $('#narrator');
      app.narrateHeld += dtReal;
      if (html != null) {
        const key = narrateKey(html);
        if (key === app.narrateShownKey) {
          if (html !== app._lastNarration) { app._lastNarration = html; el.innerHTML = html; }
        } else if (key !== app.narrateQueuedKey) {
          app.narrateQueuedKey = key;
          app.narrateQueue.push(html);
          while (app.narrateQueue.length > NARRATE_QUEUE_MAX) app.narrateQueue.shift();
        } else if (app.narrateQueue.length) {
          app.narrateQueue[app.narrateQueue.length - 1] = html;   // same beat, freshest wording
        }
      }
      if (!app.narrateQueue.length) { el.classList.remove('more'); return; }
      if (app.narrateShownKey != null && app.narrateHeld < NARRATE_HOLD) { el.classList.add('more'); return; }
      const next = app.narrateQueue.shift();
      app._lastNarration = next; app.narrateShownKey = narrateKey(next); app.narrateHeld = 0;
      el.innerHTML = next;
      el.classList.toggle('more', app.narrateQueue.length > 0);
      el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh');
    }

    // =======================================================================
    // Main loop
    // =======================================================================
    // A throw anywhere in the frame used to skip requestAnimationFrame, which stopped the clock,
    // the trace and every control until the page was reloaded. Each callback is now isolated: a
    // broken one is reported once and skipped, and the frame is always scheduled again.
    const reportedErrors = new Set();
    function guard(label, fn) {
      try { return fn(); } catch (err) {
        const key = label + ':' + (err && err.message);
        if (!reportedErrors.has(key)) { reportedErrors.add(key); console.error(`[SimApp] ${label} failed (skipping it from now on this frame):`, err); }
        app.lastError = { label, message: String(err && err.message || err) };
        return undefined;
      }
    }
    function frameBody(ts) {
      if (app.lastFrame == null) app.lastFrame = ts;
      const dtReal = Math.min(50, ts - app.lastFrame); app.lastFrame = ts;
      let dtSim = 0;
      if (!app.paused) {
        dtSim = dtReal * app.speed;
        let remaining = dtSim;
        while (remaining > 1e-9) { const h = Math.min(0.1, remaining); sim.advance(h); remaining -= h; recordSample(); }
      }
      const events = sim.takeEvents();
      if (app.view && app.view.update) guard('view.update', () => app.view.update(dtReal, dtSim, events));
      if (!runner.labMode) {
        const step = currentStep();
        if (step.tick) guard('step.tick', () => step.tick(ctx, events, dtSim));
        if (step.waitFor && !runner.state.done && guard('step.waitFor', () => step.waitFor(ctx, events))) { runner.state.done = true; if (step.onDone) guard('step.onDone', () => step.onDone(ctx)); refreshNav(); }
        if (step.status && typeof step.status === 'function') { const s = panel.querySelector('.status'); if (s) { const html = guard('step.status', () => step.status(ctx)); if (html != null && s.innerHTML !== html) s.innerHTML = html; } }
      }
      for (const e of events) fireEvent(e);
      if (app.view && app.view.narrate) pumpNarration(guard('view.narrate', () => app.view.narrate()), dtReal);
      else if (app._lastNarration !== '') { app._lastNarration = ''; app.narrateQueue.length = 0; app.narrateShownKey = null; app.narrateQueuedKey = null; $('#narrator').innerHTML = ''; }
      drawTrace();
      const rc = sim.byName[app.recordComp];
      const V = rc ? rc.V : (profile.probeV ? profile.probeV(sim, app.recordComp) : undefined);
      $('#vm-value').textContent = fmtV(V == null ? REST : V);
      $('#vm-label').textContent = 'Vm (' + app.recordComp + ')';
      $('#sim-clock').textContent = `t = ${sim.t.toFixed(1)} ms`;
    }
    function frame(ts) {
      guard('frame', () => frameBody(ts));
      requestAnimationFrame(frame);
    }

    // =======================================================================
    // Wiring
    // =======================================================================
    $('#speed').addEventListener('change', (e) => { app.speed = parseFloat(e.target.value); app.userSpeed = app.speed; });
    $('#btn-pause').addEventListener('click', () => setPaused(!app.paused));
    $('#btn-lab').addEventListener('click', enterLab);
    $('#show-g').addEventListener('change', (e) => { app.showG = e.target.checked; applyTraceLayout(); });
    document.addEventListener('keydown', (e) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setPaused(!app.paused); } });
    $('#vm-value').textContent = fmtV(REST);
    $('#vm-label').textContent = 'Vm (' + profile.comp + ')';
    $('#trace-title').textContent = traceTitle(profile.comp);

    // =======================================================================
    // Page content, then start
    // =======================================================================
    if (config.views) Object.assign(views, config.views(kit));
    LESSON = config.lesson(kit);
    const handle = { sim, app, profile, kit, gotoStep: (s, k) => gotoStep(s, k), runner: () => runner, enterLab: () => enterLab(), mountView: (n, o) => mountView(n, o), lesson: () => LESSON };
    window.__simapp = handle;
    gotoStep(0, 0);
    requestAnimationFrame(frame);
    return handle;
  }

  window.SimApp = { init, helpers: { svgEl, setAttrs, htmlEl, $, clamp, lerp, rand, fmtV, fmtE, ION_COLOR, ION_LABEL, CH } };
})();
