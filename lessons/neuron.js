/*
 * NeuronLesson: everything neuron-specific for index.html (see docs/APP_API.md).
 *
 *   window.NeuronLesson = { profile, drawCell, views, lesson, lab }
 *
 * The profile names the neuron's landmarks and words; drawCell draws the whole neuron (used
 * full-size, by the zoom slides and as the inset); views adds the zoom, neuron, synapse and axon
 * views to SimApp's registry; lesson assembles the ten scenes from SharedScenes and the
 * neuron-specific ones (docs/NEURON_MODULE.md); lab renders the free-play controls.
 * Classic script (no modules) so the page opens from file://.
 */
(function () {
  'use strict';

  const profile = {
    id: 'neuron',
    cellWord: 'neuron',
    regionWord: 'cell body',
    rest: -70,
    threshold: -55,
    comp: 'soma',          // manual channels live here; default recording site
    apComp: 'hillock',     // the action-potential scene records here
    stimComp: 'soma',
    stimPulse: { nA: 0.45, ms: 3 },
    manualG: { gNa: 0.0007, gK: 0.006, gCl: 0.01 },   // "hold to open" conductances (µS) on `comp`
    defaultView: 'neuron',
    traceColors: { soma: '#1f2430', hillock: '#b45309', axon6: '#0f766e', terminal: '#7c3aed', next: '#db2777', dendrite: '#4b5563' },
    traceTitle: (comp) => `Membrane potential recorded inside the ${comp}`,
    probeV: (sim, name) => name === 'next' ? sim.next.V : undefined,
    extraVoltages: (sim) => ({ next: sim.next.V }),
    insetRegions: { dendrite: [165, 200, 130, 150], soma: [300, 260, 85, 75], hillock: [382, 260, 45, 40], axon: [600, 260, 200, 35], terminal: [850, 260, 70, 70], synapse: [130, 200, 80, 80], default: [300, 260, 80, 70] },
  };

  // Kit members used below; filled in by bind(kit) before any drawing or lesson code runs.
  let sim, app, runner, panel, svgEl, setAttrs, htmlEl, $, clamp, lerp, rand, ION_COLOR, ION_LABEL, CH, vColor, insideFill,
    drawChannel, setChannelState, makeIonPool, makeParticles, fluxCounter, drawBilayer, drawInset, chip, IN, OUT, I, FB_GRADIENT,
    fmtV, spikeIn, setPaused, setSpeed, mountView, enterLab, stimPulse, refire, since, LOOP_HTML, loopHighlight, labNav;
  let boundKit = null;
  function bind(kit) {
    if (boundKit === kit) return;
    boundKit = kit;
    ({ sim, app, runner, panel, svgEl, setAttrs, htmlEl, $, clamp, lerp, rand, ION_COLOR, ION_LABEL, CH, vColor, insideFill,
      drawChannel, setChannelState, makeIonPool, makeParticles, fluxCounter, drawBilayer, drawInset, chip, IN, OUT, I, FB_GRADIENT,
      fmtV, spikeIn, setPaused, setSpeed, mountView, enterLab, stimPulse, refire, since, LOOP_HTML, loopHighlight, labNav } = kit);
  }

  // =========================================================================
  // Whole-neuron drawing (used full-size, in the zoom slides and as an inset)
  // =========================================================================
  const NEURON = {
    soma: { cx: 300, cy: 260, rx: 58, ry: 50 },
    hillock: { x0: 352, x1: 412, y: 260 },
    axon: { x0: 412, x1: 790, y: 260, w: 9 },
    terminal: { x: 790, y: 260 },
    dendrites: [
      'M250,238 C210,215 190,190 165,150 M190,190 C170,185 150,175 130,165 M165,150 C160,130 158,110 150,90',
      'M244,262 C200,262 165,255 110,250 M165,255 C145,240 130,235 100,225 M140,253 C120,268 100,275 70,285',
      'M252,290 C220,315 195,335 160,370 M195,335 C175,335 160,340 130,340 M160,370 C155,390 150,405 140,430',
      'M300,212 C300,180 285,150 275,110 M285,150 C265,140 250,130 225,120',
      'M296,308 C290,345 280,370 265,410 M280,370 C255,380 240,395 215,420',
    ],
    inputs: {
      A: { x: 150, y: 90, label: 'A' },
      B: { x: 100, y: 225, label: 'B' },
      C: { x: 262, y: 200, label: 'C' },
    },
    next: { x: 900, y: 260 },
  };

  function drawNeuron(parent, opts) {
    opts = opts || {};
    const g = svgEl('g', { class: 'neuron' }, parent);
    const parts = {};
    // dendrites
    parts.dendrite = svgEl('g', { 'data-part': 'dendrites' }, g);
    for (const d of NEURON.dendrites) {
      svgEl('path', { d, fill: 'none', stroke: '#7d8aa5', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parts.dendrite);
    }
    parts.dendriteStrokes = Array.from(parts.dendrite.children);
    for (const d of NEURON.dendrites) {
      svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 26, 'stroke-linecap': 'round', 'pointer-events': 'stroke' }, parts.dendrite);
    }
    // soma
    parts.soma = svgEl('ellipse', { 'data-part': 'soma', cx: NEURON.soma.cx, cy: NEURON.soma.cy, rx: NEURON.soma.rx, ry: NEURON.soma.ry, fill: '#7d8aa5', stroke: '#2a2f3a', 'stroke-width': 3 }, g);
    parts.nucleus = svgEl('circle', { cx: NEURON.soma.cx - 8, cy: NEURON.soma.cy - 4, r: 16, fill: 'rgba(255,255,255,.35)', stroke: 'rgba(42,47,58,.5)', 'stroke-width': 1.5, 'pointer-events': 'none' }, g);
    // hillock (tapered)
    const h = NEURON.hillock;
    parts.hillock = svgEl('path', { 'data-part': 'hillock', d: `M${h.x0},${h.y - 22} C${h.x0 + 30},${h.y - 12} ${h.x1 - 10},${h.y - 6} ${h.x1},${h.y - 5} L${h.x1},${h.y + 5} C${h.x1 - 10},${h.y + 6} ${h.x0 + 30},${h.y + 12} ${h.x0},${h.y + 22} Z`, fill: '#7d8aa5', stroke: '#2a2f3a', 'stroke-width': 2.5 }, g);
    // hillock channel density dots
    parts.hillockDots = svgEl('g', { 'pointer-events': 'none' }, g);
    for (let i = 0; i < 26; i++) {
      const t = i / 26, x = lerp(h.x0 + 6, h.x1 - 4, t), spread = lerp(16, 4, t);
      svgEl('circle', { cx: x, cy: h.y + (i % 2 ? spread : -spread), r: 1.8, fill: i % 3 === 0 ? ION_COLOR.K : ION_COLOR.Na }, parts.hillockDots);
    }
    // axon segments
    const a = NEURON.axon, n = sim.axon.length;
    parts.axonSegs = [];
    parts.axon = svgEl('g', { 'data-part': 'axon' }, g);
    for (let i = 0; i < n; i++) {
      const x0 = lerp(a.x0, a.x1, i / n), x1 = lerp(a.x0, a.x1, (i + 1) / n);
      parts.axonSegs.push(svgEl('rect', { x: x0, y: a.y - a.w / 2, width: x1 - x0 + 0.8, height: a.w, fill: '#7d8aa5' }, parts.axon));
    }
    svgEl('rect', { x: a.x0, y: a.y - a.w / 2, width: a.x1 - a.x0, height: a.w, fill: 'none', stroke: '#2a2f3a', 'stroke-width': 2 }, parts.axon);
    // terminals
    const t = NEURON.terminal;
    parts.terminal = svgEl('g', { 'data-part': 'terminal' }, g);
    svgEl('path', { d: `M${t.x},${t.y} C${t.x + 25},${t.y} ${t.x + 30},${t.y - 30} ${t.x + 52},${t.y - 34} M${t.x},${t.y} L${t.x + 55},${t.y} M${t.x},${t.y} C${t.x + 25},${t.y} ${t.x + 30},${t.y + 30} ${t.x + 52},${t.y + 34}`, fill: 'none', stroke: '#2a2f3a', 'stroke-width': 6, 'stroke-linecap': 'round' }, parts.terminal);
    parts.boutons = [];
    for (const [bx, by] of [[t.x + 60, t.y - 36], [t.x + 64, t.y], [t.x + 60, t.y + 36]]) {
      parts.boutons.push(svgEl('circle', { cx: bx, cy: by, r: 11, fill: '#7d8aa5', stroke: '#2a2f3a', 'stroke-width': 2.5 }, parts.terminal));
    }
    // next neuron (dendrite stub) to the right
    parts.next = svgEl('g', { 'data-part': 'next' }, g);
    svgEl('path', { d: `M${t.x + 78},${t.y - 40} C${t.x + 90},${t.y - 10} ${t.x + 90},${t.y + 10} ${t.x + 78},${t.y + 40} L${t.x + 110},${t.y + 60} L${t.x + 110},${t.y - 60} Z`, fill: '#e6e2d6', stroke: '#8b8778', 'stroke-width': 2, 'stroke-dasharray': '4 3' }, parts.next);
    parts.nextFill = parts.next.firstChild;
    svgEl('text', { x: t.x + 96, y: t.y + 78, 'font-size': 11, fill: '#6b6b60', 'text-anchor': 'middle', text: 'next' }, parts.next);
    svgEl('text', { x: t.x + 96, y: t.y + 91, 'font-size': 11, fill: '#6b6b60', 'text-anchor': 'middle', text: 'neuron' }, parts.next);
    // presynaptic input boutons
    parts.inputs = {};
    for (const id in NEURON.inputs) {
      const p = NEURON.inputs[id];
      const ig = svgEl('g', { 'data-input': id, class: 'input', cursor: 'pointer' }, g);
      svgEl('line', { x1: p.x - 22, y1: p.y - 22, x2: p.x - 6, y2: p.y - 6, stroke: '#4a4f5a', 'stroke-width': 4, 'stroke-linecap': 'round' }, ig);
      const bouton = svgEl('circle', { cx: p.x, cy: p.y, r: 12, fill: '#7d8aa5', stroke: '#2a2f3a', 'stroke-width': 2.5 }, ig);
      const ring = svgEl('circle', { cx: p.x, cy: p.y, r: 15, fill: 'none', stroke: id === 'C' ? ION_COLOR.Cl : ION_COLOR.Na, 'stroke-width': 2.5, opacity: 0.85 }, ig);
      const label = svgEl('text', { x: p.x, y: p.y + 4, 'font-size': 12, 'font-weight': 700, fill: '#fff', 'text-anchor': 'middle', 'pointer-events': 'none', text: id }, ig);
      parts.inputs[id] = { g: ig, bouton, ring, label };
    }
    // electrode (hidden until scene 4)
    parts.electrode = svgEl('g', { class: 'electrode', opacity: 0, 'pointer-events': 'none' }, g);
    svgEl('path', { d: `M${NEURON.soma.cx + 16},${NEURON.soma.cy - 8} L${NEURON.soma.cx + 60},${NEURON.soma.cy - 150} L${NEURON.soma.cx + 74},${NEURON.soma.cy - 150} L${NEURON.soma.cx + 20},${NEURON.soma.cy - 6} Z`, fill: '#dfe6f2', stroke: '#2a2f3a', 'stroke-width': 1.5 }, parts.electrode);
    svgEl('rect', { x: NEURON.soma.cx + 56, y: NEURON.soma.cy - 175, width: 22, height: 26, fill: '#4a4f5a' }, parts.electrode);
    svgEl('text', { x: NEURON.soma.cx + 90, y: NEURON.soma.cy - 155, 'font-size': 12, fill: '#4a4f5a', text: 'recording electrode' }, parts.electrode);
    // reference electrode
    svgEl('line', { x1: 700, y1: 120, x2: 700, y2: 60, stroke: '#4a4f5a', 'stroke-width': 3 }, parts.electrode);
    svgEl('rect', { x: 690, y: 40, width: 20, height: 22, fill: '#4a4f5a' }, parts.electrode);
    svgEl('text', { x: 716, y: 58, 'font-size': 12, fill: '#4a4f5a', text: 'reference (outside)' }, parts.electrode);

    // labels
    parts.labels = svgEl('g', { class: 'labels', 'pointer-events': 'none', 'font-size': 13, fill: '#3a3f4a' }, g);
    const L = [
      ['Dendrites', 120, 130], ['Cell body (soma)', 300, 345], ['Axon hillock', 382, 300], ['Axon', 600, 240], ['Synaptic terminals', 815, 198],
    ];
    parts.labelEls = {};
    for (const [txt, x, y] of L) parts.labelEls[txt] = svgEl('text', { x, y, 'text-anchor': 'middle', text: txt }, parts.labels);

    return { g, parts };
  }

  function updateNeuronColors(parts, opts) {
    opts = opts || {};
    const dend = vColor(sim.byName.dendrite.V);
    for (const s of parts.dendriteStrokes) s.setAttribute('stroke', dend);
    parts.soma.setAttribute('fill', vColor(sim.soma.V));
    parts.hillock.setAttribute('fill', vColor(sim.hillock.V));
    sim.axon.forEach((c, i) => parts.axonSegs[i].setAttribute('fill', vColor(c.V)));
    const tc = vColor(sim.term.V);
    for (const b of parts.boutons) b.setAttribute('fill', tc);
    parts.nextFill.setAttribute('fill', sim.next.V > -69 ? vColor(sim.next.V) : '#e6e2d6');
    for (const id in parts.inputs) {
      const inp = sim.input(id), pi = parts.inputs[id];
      pi.bouton.setAttribute('fill', vColor(inp.V));
      pi.ring.setAttribute('stroke-width', inp.active ? 4.5 : 2.5);
      pi.ring.setAttribute('opacity', inp.active ? 1 : 0.85);
    }
    if (app.electrode && !parts._electrodeShown) {
      parts._electrodeShown = true;
      parts.electrode.setAttribute('opacity', 1);
      if (!opts.hideLabels) parts.electrode.animate([{ transform: 'translate(40px,-260px)', opacity: 0 }, { transform: 'translate(0,0)', opacity: 1 }], { duration: 1400, easing: 'cubic-bezier(.2,.7,.2,1)' });
    } else if (!app.electrode && parts._electrodeShown) { parts._electrodeShown = false; parts.electrode.setAttribute('opacity', 0); }
    else if (!app.electrode) parts.electrode.setAttribute('opacity', 0);
    parts.labels.setAttribute('opacity', app.labels && !opts.hideLabels ? 1 : 0);
  }

  // config.drawCell: the whole cell as an SVG group plus a colour updater.
  function drawCell(parent, opts, kit) {
    bind(kit);
    opts = opts || {};
    const d = drawNeuron(parent, opts);
    if (opts.inset) {
      d.parts.labels.setAttribute('opacity', 0);
      d.parts.electrode.setAttribute('opacity', 0);
      d.parts.next.setAttribute('opacity', 0.5);
    }
    return { g: d.g, parts: d.parts, update: (o) => updateNeuronColors(d.parts, o) };
  }

  // =========================================================================
  // Views (merged into SimApp's registry; `membrane` is generic and lives in app.js)
  // =========================================================================
  const views = {};

  // ---------------------------------------------------------------- zoom intro
  views.zoom = function () {
    let svg, slides = [], idx = 0, stageEl;
    const captions = [
      'A person. Everything they sense, decide and do runs on cells that signal electrically.',
      'Inside the head, the brain.',
      'The brain is a dense network of neurons — roughly 86 billion of them, each connected to thousands of others.',
      'Zooming in: individual neurons, each one receiving signals from many neighbours and sending signals onward.',
      'One neuron. We will follow a single signal through it: how it is received, integrated, fired, sent down the axon and passed on.',
    ];
    function build() {
      svg = svgEl('svg', { viewBox: '0 0 900 520' });
      // slide 0: human
      const s0 = svgEl('g', {}, svg);
      svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, s0);
      const hx = 450, hy = 92;
      const skin = '#d9b99b', cloth = '#5b7fb3', ink = '#2f3a4d';
      // legs, torso, arms, neck, head (a simple standing figure)
      svgEl('path', { d: `M${hx - 46},${hy + 210} L${hx - 40},${hy + 388} L${hx - 10},${hy + 388} L${hx - 4},${hy + 250} L${hx + 4},${hy + 250} L${hx + 10},${hy + 388} L${hx + 40},${hy + 388} L${hx + 46},${hy + 210} Z`, fill: '#3f4d66', stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      svgEl('path', { d: `M${hx - 62},${hy + 75} C${hx - 30},${hy + 52} ${hx + 30},${hy + 52} ${hx + 62},${hy + 75} L${hx + 52},${hy + 215} L${hx - 52},${hy + 215} Z`, fill: cloth, stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      svgEl('path', { d: `M${hx - 62},${hy + 78} L${hx - 92},${hy + 220} L${hx - 70},${hy + 226} L${hx - 44},${hy + 110} Z M${hx + 62},${hy + 78} L${hx + 92},${hy + 220} L${hx + 70},${hy + 226} L${hx + 44},${hy + 110} Z`, fill: cloth, stroke: ink, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, s0);
      svgEl('circle', { cx: hx - 82, cy: hy + 232, r: 11, fill: skin, stroke: ink, 'stroke-width': 2 }, s0);
      svgEl('circle', { cx: hx + 82, cy: hy + 232, r: 11, fill: skin, stroke: ink, 'stroke-width': 2 }, s0);
      svgEl('rect', { x: hx - 12, y: hy + 30, width: 24, height: 34, fill: skin, stroke: ink, 'stroke-width': 2 }, s0);
      svgEl('ellipse', { cx: hx, cy: hy, rx: 34, ry: 40, fill: skin, stroke: ink, 'stroke-width': 2.5 }, s0);
      svgEl('path', { d: `M${hx - 34},${hy - 6} C${hx - 30},${hy - 50} ${hx + 30},${hy - 50} ${hx + 34},${hy - 6} C${hx + 20},${hy - 22} ${hx - 20},${hy - 22} ${hx - 34},${hy - 6} Z`, fill: '#4a3a2e' }, s0);
      svgEl('circle', { cx: hx, cy: hy, r: 62, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, s0);
      slides.push(s0);
      // slide 1: head + brain
      const s1 = svgEl('g', {}, svg);
      svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, s1);
      // head in profile (facing right), skull removed to reveal the brain
      svgEl('path', { d: 'M330,500 C300,420 285,330 300,250 C315,150 400,80 500,80 C590,80 650,150 640,240 C636,275 622,300 612,320 C626,332 634,346 636,360 C640,385 626,400 604,404 C598,430 585,455 560,468 L565,500 Z', fill: '#d9b99b', stroke: '#2f3a4d', 'stroke-width': 3, 'stroke-linejoin': 'round' }, s1);
      svgEl('path', { d: 'M366,300 C352,290 350,270 362,262 C374,256 386,270 384,286 C382,300 374,306 366,300 Z', fill: '#c9a488', stroke: '#2f3a4d', 'stroke-width': 2 }, s1);
      svgEl('path', { d: 'M612,320 C600,330 586,334 574,332', fill: 'none', stroke: '#2f3a4d', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, s1);
      svgEl('path', { d: 'M598,262 C606,262 612,268 610,276', fill: 'none', stroke: '#2f3a4d', 'stroke-width': 2.5, 'stroke-linecap': 'round' }, s1);
      // brain (cerebrum + cerebellum + brainstem)
      svgEl('path', { d: 'M340,250 C330,180 390,120 470,116 C550,112 610,160 604,230 C600,280 560,310 512,312 C480,314 460,300 440,296 C400,290 350,290 340,250 Z', fill: '#e9a9a9', stroke: '#8a4c4c', 'stroke-width': 3 }, s1);
      svgEl('path', { d: 'M418,304 C400,330 420,352 452,346 C480,340 486,320 470,302', fill: '#e2938f', stroke: '#8a4c4c', 'stroke-width': 2.5 }, s1);
      svgEl('path', { d: 'M470,302 L474,352 L458,352', fill: 'none', stroke: '#8a4c4c', 'stroke-width': 5, 'stroke-linecap': 'round' }, s1);
      for (const d of ['M470,118 C452,150 470,190 450,220', 'M372,180 C400,190 420,180 430,160', 'M540,130 C520,160 550,190 530,220', 'M580,180 C560,210 585,240 560,270', 'M360,250 C390,240 410,260 440,250', 'M480,240 C510,232 530,258 560,250', 'M430,290 C450,270 470,290 500,280']) svgEl('path', { d, fill: 'none', stroke: '#8a4c4c', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: .8 }, s1);
      svgEl('circle', { cx: 470, cy: 215, r: 78, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, s1);
      slides.push(s1);
      // slide 2: network
      const s2 = svgEl('g', {}, svg);
      svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, s2);
      const nodes = [];
      let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 60; i++) nodes.push([60 + rnd() * 780, 40 + rnd() * 440]);
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1];
        if (dx * dx + dy * dy < 150 * 150 && rnd() < 0.5) svgEl('line', { x1: nodes[i][0], y1: nodes[i][1], x2: nodes[j][0], y2: nodes[j][1], stroke: '#9aa3b5', 'stroke-width': 1.5 }, s2);
      }
      nodes.forEach(([x, y], i) => svgEl('circle', { cx: x, cy: y, r: i === 31 ? 9 : 6, fill: i === 31 ? '#e8772e' : '#7d8aa5', stroke: '#2a2f3a', 'stroke-width': 1.5 }, s2));
      svgEl('circle', { cx: nodes[31][0], cy: nodes[31][1], r: 40, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, s2);
      slides.push(s2);
      // slide 3: several neurons
      const s3 = svgEl('g', {}, svg);
      svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, s3);
      const mini = (x, y, sc, hot) => {
        const g = svgEl('g', { transform: `translate(${x},${y}) scale(${sc})`, opacity: hot ? 1 : 0.55 }, s3);
        const d = drawNeuron(g);
        d.parts.labels.setAttribute('opacity', 0);
        d.parts.electrode.setAttribute('opacity', 0);
        for (const id in d.parts.inputs) d.parts.inputs[id].g.setAttribute('opacity', 0);
        d.parts.next.setAttribute('opacity', 0);
        if (hot) d.parts.soma.setAttribute('fill', '#e8772e');
        return g;
      };
      mini(-40, -120, 0.42, false); mini(380, -100, 0.4, false); mini(-60, 180, 0.38, false); mini(420, 220, 0.4, false); mini(150, 40, 0.5, true);
      svgEl('circle', { cx: 300, cy: 170, r: 110, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, s3);
      slides.push(s3);
      // slide 4: single neuron
      const s4 = svgEl('g', {}, svg);
      svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, s4);
      const d4 = drawNeuron(s4);
      d4.parts.labels.setAttribute('opacity', 0);
      for (const id in d4.parts.inputs) d4.parts.inputs[id].g.setAttribute('opacity', 0.9);
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
      $('#stage-caption').textContent = `Zoom level ${idx + 1} of ${slides.length}`;
    }
    return {
      mount(el) { stageEl = el; build(); el.appendChild(svg); show(0); },
      update() {},
      narrate() { return captions[idx]; },
      next() { show(idx + 1); return idx; },
      get index() { return idx; },
      get last() { return idx === slides.length - 1; },
    };
  };

  // ---------------------------------------------------------------- whole neuron
  views.neuron = function (opts) {
    let svg, d, halo, onPart = null, onInput = null, ntDots = null;
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 930 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 930, height: 520, fill: '#f6f5f0' }, svg);
        halo = svgEl('ellipse', { cx: 0, cy: 0, rx: 0, ry: 0, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 3, 'stroke-dasharray': '7 5', opacity: 0 }, svg);
        d = drawNeuron(svg);
        ntDots = svgEl('g', { 'pointer-events': 'none' }, svg);
        for (const el2 of d.g.querySelectorAll('[data-part]')) {
          el2.style.cursor = 'pointer';
          el2.addEventListener('click', () => { if (onPart) onPart(el2.getAttribute('data-part')); });
        }
        for (const id in d.parts.inputs) {
          d.parts.inputs[id].g.addEventListener('click', () => { if (onInput) onInput(id); else sim.fireInput(id); });
        }
        $('#stage-caption').textContent = opts.caption || '';
      },
      update() {
        updateNeuronColors(d.parts, opts);
        // transmitter puffs at our own terminal when it releases
        ntDots.innerHTML = '';
        const rel = sim.terminal.nt;
        if (rel > 0.02) {
          const n = Math.min(14, Math.round(rel * 40));
          for (let i = 0; i < n; i++) svgEl('circle', { cx: NEURON.terminal.x + 72 + rand(-6, 10), cy: NEURON.terminal.y + rand(-45, 45), r: 3, fill: ION_COLOR.NT, opacity: clamp(rel * 3, 0.2, 1) }, ntDots);
        }
      },
      set onPart(fn) { onPart = fn; }, set onInput(fn) { onInput = fn; },
      highlight(part) {
        const pos = { dendrites: [165, 230, 130, 150], soma: [300, 260, 80, 70], hillock: [382, 260, 42, 36], axon: [600, 260, 200, 30], terminal: [850, 260, 60, 60], none: [0, 0, 0, 0] }[part] || [0, 0, 0, 0];
        setAttrs(halo, { cx: pos[0], cy: pos[1], rx: pos[2], ry: pos[3], opacity: part && part !== 'none' ? 1 : 0 });
      },
      flashPart(part, color) {
        const el2 = { dendrites: d.parts.dendrite, soma: d.parts.soma, hillock: d.parts.hillock, axon: d.parts.axon, terminal: d.parts.terminal }[part];
        if (!el2) return;
        el2.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 400 });
      },
      parts: () => d.parts,
      narrate() {
        const h = sim.hillock, so = sim.soma;
        const active = sim.inputs.filter(i => i.active);
        const lead = sim.axon.find(c => c.V > -20 && c.dVdt > 0);
        if (sim.terminal.nt > 0.03) return `<b>Terminal:</b> ${chip('Ca')} entered → transmitter released → the next neuron's receptors open → it gets an EPSP (its dendrite warms up on the right).`;
        if (sim.term.V > -20) return `The action potential has reached the <b>terminal</b>; its voltage-gated Ca²⁺ channels are opening.`;
        if (lead) return `<b>Action potential travelling down the axon</b> (segment ${sim.axon.indexOf(lead) + 1} of ${sim.axon.length}): each segment's Na⁺ channels open as the one before it depolarizes it.`;
        if (h.V > -56 && h.dVdt > 20) return `<b>Threshold reached at the axon hillock</b> → its voltage-gated Na⁺ channels open → action potential!`;
        if (h.V > -30) return `The hillock is firing: Na⁺ in (up), then Na⁺ channels inactivate and K⁺ channels open (down).`;
        if (so.V < -72 && sim.kState(h) === 'open') return `After-hyperpolarization: K⁺ channels are still open, so Vm dips below rest before recovering.`;
        if (active.length) {
          const exc = active.filter(i => i.type === 'excitatory').map(i => i.id), inh = active.filter(i => i.type === 'inhibitory').map(i => i.id);
          const parts = [];
          if (exc.length) parts.push(`EPSP from ${exc.join(' + ')} pushing Vm up`);
          if (inh.length) parts.push(`IPSP from ${inh.join(' + ')} holding Vm near rest`);
          return `<b>Integrating:</b> ${parts.join('; ')}. Soma Vm = ${fmtV(so.V)} mV${app.showThreshold ? ' (threshold ≈ −55)' : ''}. Only the sum at the hillock matters.`;
        }
        if (so.V > -68) return `The EPSPs are fading: transmitter is cleared, receptor channels close, and K⁺ leak pulls Vm back to −70.`;
        return `<b>At rest:</b> −70 mV everywhere. Inputs A and B are excitatory (orange), C is inhibitory (green). Click a bouton to make it fire.`;
      },
    };
  };


  // ---------------------------------------------------------------- synapse (pre terminal + cleft + post membrane)
  // opts: { input: 'A' | 'C' | 'output', caption }
  views.synapse = function (opts) {
    const PRE_X0 = 300, PRE_X1 = 600, PRE_Y = 178;       // presynaptic membrane bottom edge
    const POST_Y_TOP = 300, POST_Y_BOT = 356;              // postsynaptic bilayer
    const CLEFT_Y0 = PRE_Y + 14, CLEFT_Y1 = POST_Y_TOP;
    let svg, preFill, postFill, caChans = [], recChans = [], vesicleLayer, docked = [], particles, ntParticles, pool, caCounter, recCounter, insetParts, apArrow, stageRows = [];
    const isOutput = opts.input === 'output';
    const inp = () => isOutput ? null : sim.input(opts.input);
    const preTerm = () => isOutput ? sim.terminal : inp().terminal;
    const preV = () => isOutput ? sim.term.V : inp().V;
    const receptor = () => isOutput ? sim.nextReceptor : inp().receptor;
    const postV = () => isOutput ? sim.next.V : sim.comps[inp().target].V;
    const recType = () => receptor().type === 'excitatory' ? 'AMPA' : 'GABA';
    const nt = [];
    const STAGES = [
      { key: 'ap', label: 'action potential arrives', test: () => preV() > -35 },
      { key: 'ca_open', label: 'voltage-gated Ca²⁺ channels open', test: () => preTerm().s > 0.3 },
      { key: 'ca_in', label: 'Ca²⁺ flows in (down a huge gradient)', test: () => preTerm().iCa < -0.4 },
      { key: 'fuse', label: 'Ca²⁺ makes vesicles fuse and empty', test: () => preTerm().releaseRate > 0.05 },
      { key: 'nt', label: 'transmitter crosses the cleft', test: () => preTerm().nt > 0.02 },
      { key: 'bind', label: 'transmitter binds → receptors open', test: () => receptor().r > 0.06 },
      { key: 'ion', label: '', test: () => Math.abs(receptor().i) > 0.02 },
    ];
    const done = STAGES.map(() => false);
    let quietFor = 0;
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 900 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, svg);
        svgEl('rect', { x: 20, y: 20, width: 600, height: 480, fill: '#eef2fa', rx: 10 }, svg);
        // presynaptic terminal bulb
        preFill = svgEl('path', { d: `M${PRE_X0},20 L${PRE_X1},20 C${PRE_X1},110 ${PRE_X1 - 40},${PRE_Y} ${(PRE_X0 + PRE_X1) / 2},${PRE_Y} C${PRE_X0 + 40},${PRE_Y} ${PRE_X0},110 ${PRE_X0},20 Z`, fill: '#fbf3e6', stroke: '#8a7a50', 'stroke-width': 12 }, svg);
        svgEl('text', { x: (PRE_X0 + PRE_X1) / 2, y: 66, 'font-size': 13, 'font-weight': 600, 'text-anchor': 'middle', fill: '#6b5a3a', text: isOutput ? 'OUR synaptic terminal (presynaptic)' : `Presynaptic terminal of input ${opts.input}` }, svg);
        // arriving action potential indicator (the axon enters from above)
        apArrow = svgEl('g', { opacity: 0 }, svg);
        svgEl('path', { d: `M${(PRE_X0 + PRE_X1) / 2 - 140},24 l0,14 l-8,0 l12,12 l12,-12 l-8,0 l0,-14 z`, fill: '#e5482e' }, apArrow);
        svgEl('text', { x: (PRE_X0 + PRE_X1) / 2 - 118, y: 42, 'font-size': 12, 'font-weight': 700, fill: '#e5482e', text: 'action potential arriving' }, apArrow);
        const chLayer = svgEl('g', {}, svg);
        caChans = [380, 520].map(x => drawChannel(chLayer, x, PRE_Y - 34, PRE_Y + 8, 'Ca_v', 0.9));
        svgEl('text', { x: 450, y: PRE_Y + 30, 'font-size': 11, 'text-anchor': 'middle', fill: '#1c5f92', text: 'voltage-gated Ca²⁺ channels' }, chLayer);
        vesicleLayer = svgEl('g', {}, svg);
        svgEl('text', { x: 30, y: CLEFT_Y1 - 18, 'font-size': 12, fill: '#4a5468', 'font-weight': 600, text: 'synaptic cleft (outside)' }, svg);
        postFill = svgEl('rect', { x: 20, y: POST_Y_BOT, width: 600, height: 500 - POST_Y_BOT, fill: '#fbf3e6', rx: 10 }, svg);
        drawBilayer(svg, 20, 620, POST_Y_TOP, POST_Y_BOT, [[372, 428], [472, 528]]);
        recChans = [400, 500].map(x => drawChannel(chLayer, x, POST_Y_TOP, POST_Y_BOT, recType()));
        svgEl('text', { x: 450, y: POST_Y_BOT + 22, 'font-size': 11, 'text-anchor': 'middle', fill: '#4a4f5a', text: CH[recType()].label }, chLayer);
        svgEl('text', { x: 30, y: 492, 'font-size': 13, 'font-weight': 600, fill: '#6b5a3a', text: isOutput ? 'INSIDE the next neuron (postsynaptic)' : `INSIDE our neuron (postsynaptic ${sim.comps[inp().target].name})` }, svg);
        const ionLayer = svgEl('g', {}, svg);
        pool = {
          cleft: makeIonPool(ionLayer, { x0: 30, x1: 610, y0: CLEFT_Y0 - 4, y1: CLEFT_Y1 - 4 }, recType() === 'GABA' ? { Na: 8, Ca: 8, Cl: 12 } : { Na: 16, Ca: 8, Cl: 4 }, { r: 7 }),
          outsidePre: makeIonPool(ionLayer, { x0: 30, x1: 290, y0: 60, y1: PRE_Y - 30 }, { Na: 8, Ca: 4, Cl: 5 }, { r: 7 }),
          insidePre: makeIonPool(ionLayer, { x0: PRE_X0 + 30, x1: PRE_X1 - 30, y0: 60, y1: 110 }, { K: 8, A: 4 }, { r: 7 }),
          insidePost: makeIonPool(ionLayer, { x0: 30, x1: 610, y0: POST_Y_BOT + 40, y1: 480 }, { K: 16, A: 10, Na: 2 }, { r: 7 }),
        };
        particles = makeParticles(svgEl('g', {}, svg));
        ntParticles = svgEl('g', {}, svg);
        caCounter = fluxCounter(1.2); recCounter = fluxCounter(3);
        // causal checklist
        const cl = svgEl('g', { transform: 'translate(640,170)', 'font-size': 11.5, fill: '#3a3f4a' }, svg);
        svgEl('text', { x: 0, y: 0, 'font-weight': 700, 'font-size': 12, text: 'What has to happen, in order' }, cl);
        STAGES.forEach((st, i) => {
          const y = 22 + i * 21;
          const dot = svgEl('circle', { cx: 7, cy: y - 4, r: 6, fill: '#fff', stroke: '#c9c4b4', 'stroke-width': 1.5 }, cl);
          const tick = svgEl('path', { d: `M3,${y - 4} l3,3 l6,-6`, stroke: '#fff', 'stroke-width': 2, fill: 'none', opacity: 0 }, cl);
          const txt = svgEl('text', { x: 20, y, text: st.label }, cl);
          stageRows.push({ dot, tick, txt });
        });
        const lg = svgEl('g', { transform: 'translate(640,350)', 'font-size': 11, fill: '#3a3f4a' }, svg);
        [['NT', 'neurotransmitter'], ['Ca', 'Ca²⁺ (2 mM out · 0.0001 mM in)'], ['Na', 'Na⁺'], ['K', 'K⁺'], ['Cl', 'Cl⁻']].forEach(([k, lab], i) => {
          const y = 14 + i * 18;
          svgEl('circle', { cx: 7, cy: y - 4, r: 6, fill: ION_COLOR[k] }, lg);
          svgEl('text', { x: 20, y, text: lab }, lg);
        });
        insetParts = drawInset(svg, isOutput ? 'terminal' : 'synapse');
        $('#stage-caption').textContent = opts.caption || '';
        this._buildVesicles();
      },
      _buildVesicles() {
        vesicleLayer.innerHTML = ''; docked = [];
        const reserve = [[362, 112], [420, 100], [480, 102], [538, 114], [400, 134], [500, 136]];
        for (const [x, y] of reserve) {
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
        svgEl('text', { x: 450, y: 82, 'font-size': 11, 'text-anchor': 'middle', fill: '#6b5a3a', text: 'vesicles filled with neurotransmitter' }, vesicleLayer);
      },
      _release() {
        const v = docked.find(d => !d.used);
        if (v) {
          v.used = true;
          v.g.animate([{ transform: `translate(${v.x}px, ${PRE_Y - 22}px) scale(1)` }, { transform: `translate(${v.x}px, ${PRE_Y - 6}px) scale(1.2, 0.5)`, opacity: 0.2 }], { duration: 500, fill: 'forwards' });
          setTimeout(() => { v.g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' }); v.used = false; }, 2500 / Math.max(app.speed * 100, 0.15));
        }
        const x = v ? v.x : 450;
        for (let i = 0; i < 10; i++) {
          const g = svgEl('circle', { cx: x, cy: PRE_Y + 8, r: 4, fill: ION_COLOR.NT }, ntParticles);
          nt.push({ g, x: x + rand(-4, 4), y: PRE_Y + 8, vx: rand(-1.5, 1.5), vy: rand(0.5, 1.5), t: 0 });
        }
      },
      update(dtReal, dtSim, events) {
        const term = preTerm(), rec = receptor(), Vp = preV(), Vq = postV();
        preFill.setAttribute('fill', insideFill(Vp));
        postFill.setAttribute('fill', insideFill(Vq));
        apArrow.setAttribute('opacity', clamp((Vp + 60) / 60, 0, 1));
        for (const ch of caChans) setChannelState(ch, sim.caState(term));
        for (const ch of recChans) setChannelState(ch, rec.r > 0.06 ? 'open' : 'closed');
        for (const e of events) if (e.type === 'release' && ((isOutput && e.input === 'output') || (!isOutput && e.input === opts.input))) this._release();
        // checklist state
        const quiet = Vp < -65 && term.s < 0.1 && term.nt < 0.01 && rec.r < 0.03;
        quietFor = quiet ? quietFor + dtReal : 0;
        if (STAGES[0].test() && quietFor === 0 && done.slice(1).every(Boolean) === false && done[0] && done[5]) { /* an event still in progress */ }
        if (STAGES[0].test() && this._wasQuiet) { for (let i = 0; i < done.length; i++) done[i] = false; }
        this._wasQuiet = quiet && quietFor > 400;
        STAGES.forEach((st, i) => {
          const active = st.test();
          if (active) done[i] = true;
          const r = stageRows[i];
          const color = active ? '#2f6fd6' : (done[i] ? '#2f9e5b' : '#c9c4b4');
          r.dot.setAttribute('fill', active ? '#2f6fd6' : (done[i] ? '#2f9e5b' : '#fff'));
          r.dot.setAttribute('stroke', color);
          r.tick.setAttribute('opacity', done[i] && !active ? 1 : 0);
          r.txt.setAttribute('font-weight', active ? 700 : 400);
          r.txt.setAttribute('fill', active ? '#1f2430' : (done[i] ? '#2f9e5b' : '#6b7280'));
        });
        stageRows[6].txt.textContent = rec.type === 'excitatory' ? 'Na⁺ flows in → EPSP (Vm rises a few mV)' : 'Cl⁻ flows in → IPSP (Vm held near rest)';
        if (!app.paused) {
          if (term.s > 0.3) {
            const n = Math.min(3, caCounter(term.iCa, dtSim));
            for (let i = 0; i < n; i++) { const ch = caChans[i % 2]; particles.spawn('Ca', ch.x + rand(-6, 6), PRE_Y + 30 + rand(0, 20), ch.x + rand(-40, 40), PRE_Y - 60 - rand(0, 40), rand(650, 900), { r: 7 }); }
          }
          if (rec.r > 0.06) {
            const n = Math.min(3, recCounter(rec.i, dtSim)), ion = rec.type === 'excitatory' ? 'Na' : 'Cl';
            for (let i = 0; i < n; i++) { const ch = recChans[i % 2]; particles.spawn(ion, ch.x + rand(-6, 6), POST_Y_TOP - 30 - rand(0, 40), ch.x + rand(-60, 60), POST_Y_BOT + 50 + rand(0, 60), rand(700, 1000), { r: 7 }); }
          }
          const k = dtReal / 16;
          for (let i = nt.length - 1; i >= 0; i--) {
            const p = nt[i]; p.t += dtReal;
            p.vx += rand(-0.4, 0.4); p.vy += rand(-0.3, 0.4); p.vx *= 0.92; p.vy *= 0.92;
            p.x = clamp(p.x + p.vx * k, 30, 610); p.y += p.vy * k;
            if (p.y > POST_Y_TOP - 12) {
              const near = recChans.find(ch => Math.abs(ch.x - p.x) < 26);
              if (near) { p.g.remove(); nt.splice(i, 1); continue; }
              p.y = POST_Y_TOP - 12; p.vy = -Math.abs(p.vy);
            }
            if (p.y < CLEFT_Y0) { p.y = CLEFT_Y0; p.vy = Math.abs(p.vy); }
            p.g.setAttribute('cx', p.x.toFixed(1)); p.g.setAttribute('cy', p.y.toFixed(1));
            const life = 2600 / Math.max(app.speed * 100, 0.15);
            if (p.t > life) { p.g.setAttribute('opacity', clamp(1 - (p.t - life) / 600, 0, 1)); if (p.t > life + 600) { p.g.remove(); nt.splice(i, 1); } }
          }
          for (const key in pool) pool[key].update(dtReal);
        }
        particles.update(dtReal);
        insetParts.update({ hideLabels: true });
      },
      narrate() {
        const term = preTerm(), rec = receptor(), Vp = preV();
        const who = isOutput ? 'the next neuron' : 'our neuron';
        if (Math.abs(rec.i) > 0.02 && rec.r > 0.06) return rec.type === 'excitatory'
          ? `Receptor channels open → ${chip('Na')} flows ${IN} to ${who} → <b>EPSP</b>: Vm rises a few millivolts, then fades as the transmitter is cleared.`
          : `Receptor channels open → ${chip('Cl')} flows ${IN} → <b>IPSP</b>: Vm is pulled toward E_Cl and held near rest, so excitation has a harder time reaching threshold.`;
        if (term.nt > 0.02) return `${chip('NT')} <b>Neurotransmitter</b> crosses the cleft and binds receptor channels on the other side.`;
        if (term.releaseRate > 0.05) return `Cytosolic Ca²⁺ is high → <b>vesicles fuse</b> with the membrane and dump transmitter into the cleft.`;
        if (term.s > 0.3) return `Depolarization opened voltage-gated ${chip('Ca')} channels → Ca²⁺ flows ${IN} (2 mM outside vs 0.0001 mM inside).`;
        if (Vp > -35) return `<b>Action potential arrives</b>: the terminal membrane depolarizes to about +40 mV.`;
        if (rec.r > 0.03) return `Receptors are closing as transmitter unbinds and is cleared; Vm drifts back to rest.`;
        return isOutput ? `Quiet. When an action potential reaches this terminal, the chain on the right will run.` : `Quiet synapse. Fire input ${opts.input} to send an action potential into this terminal.`;
      },
    };
  };

  // ---------------------------------------------------------------- axon (propagation)
  views.axon = function (opts) {
    const X0 = 40, X1 = 860, Y_TOP = 200, Y_BOT = 300;
    let svg, segs = [], naChans = [], kChans = [], particles, counters = [], profile, arrows, insetParts;
    const comps = () => [sim.hillock].concat(sim.axon).concat([sim.term]);
    return {
      mount(el) {
        svg = svgEl('svg', { viewBox: '0 0 900 520' });
        el.appendChild(svg);
        svgEl('rect', { x: 0, y: 0, width: 900, height: 520, fill: '#f6f5f0' }, svg);
        svgEl('rect', { x: 20, y: 60, width: 860, height: Y_TOP - 60, fill: '#eef2fa', rx: 10 }, svg);
        svgEl('text', { x: 30, y: 80, 'font-size': 13, fill: '#4a5468', 'font-weight': 600, text: 'OUTSIDE' }, svg);
        const cs = comps(), n = cs.length;
        const segLayer = svgEl('g', {}, svg);
        for (let i = 0; i < n; i++) {
          const x0 = lerp(X0, X1, i / n), x1 = lerp(X0, X1, (i + 1) / n);
          segs.push(svgEl('rect', { x: x0, y: Y_TOP + 6, width: x1 - x0 + 0.5, height: Y_BOT - Y_TOP - 12, fill: '#fbf3e6' }, segLayer));
          svgEl('text', { x: (x0 + x1) / 2, y: Y_BOT + 28, 'font-size': 10, 'text-anchor': 'middle', fill: '#6b7280', text: cs[i].kind === 'hillock' ? 'hillock' : cs[i].kind === 'terminal' ? 'terminal' : (i) }, svg);
          counters.push(fluxCounter(2.5));
        }
        svgEl('text', { x: X0 + 10, y: Y_BOT - 16, 'font-size': 13, fill: '#6b5a3a', 'font-weight': 600, text: 'INSIDE the axon' }, svg);
        svgEl('rect', { x: X0, y: Y_TOP, width: X1 - X0, height: 8, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg);
        svgEl('rect', { x: X0, y: Y_BOT - 8, width: X1 - X0, height: 8, fill: '#c9b98f', stroke: '#8a7a50', 'stroke-width': 1.5 }, svg);
        const chLayer = svgEl('g', {}, svg);
        for (let i = 0; i < n; i++) {
          const xc = lerp(X0, X1, (i + 0.5) / n), w = (X1 - X0) / n;
          naChans.push(drawChannel(chLayer, xc - w * 0.22, Y_TOP - 10, Y_TOP + 18, 'Na_v', 0.55));
          kChans.push(drawChannel(chLayer, xc + w * 0.22, Y_TOP - 10, Y_TOP + 18, 'K_v', 0.55));
        }
        arrows = svgEl('g', {}, svg);
        particles = makeParticles(svgEl('g', {}, svg));
        const lg = svgEl('g', { transform: 'translate(150,84)', 'font-size': 12, fill: '#3a3f4a' }, svg);
        const mk = (x, y, type, state, label) => { const gg = svgEl('g', { transform: `translate(${x},${y})` }, lg); const c = drawChannel(gg, 0, 0, 26, type, 0.55); setChannelState(c, state); svgEl('text', { x: 16, y: 17, text: label }, gg); };
        mk(0, 0, 'Na_v', 'closed', 'Na⁺ closed'); mk(100, 0, 'Na_v', 'open', 'Na⁺ open'); mk(190, 0, 'Na_v', 'inactivated', 'Na⁺ inactivated (refractory)');
        mk(0, 38, 'K_v', 'closed', 'K⁺ closed'); mk(100, 38, 'K_v', 'open', 'K⁺ open');
        const pg = svgEl('g', {}, svg);
        svgEl('text', { x: X0, y: 368, 'font-size': 12, fill: '#4a4f5a', 'font-weight': 600, text: 'Membrane potential along the axon (snapshot)' }, pg);
        svgEl('line', { x1: X0, y1: 490, x2: X1, y2: 490, stroke: '#9ca3af' }, pg);
        svgEl('line', { x1: X0, y1: 420, x2: X1, y2: 420, stroke: '#d1d5db', 'stroke-dasharray': '4 4' }, pg);
        svgEl('text', { x: X0 - 4, y: 494, 'font-size': 10, 'text-anchor': 'end', fill: '#6b7280', text: '−70' }, pg);
        svgEl('text', { x: X0 - 4, y: 424, 'font-size': 10, 'text-anchor': 'end', fill: '#6b7280', text: '0' }, pg);
        svgEl('text', { x: X0 - 4, y: 384, 'font-size': 10, 'text-anchor': 'end', fill: '#6b7280', text: '+40' }, pg);
        profile = svgEl('polyline', { fill: 'none', stroke: '#1f2430', 'stroke-width': 2.5 }, pg);
        insetParts = drawInset(svg, 'axon');
        $('#stage-caption').textContent = opts.caption || '';
      },
      update(dtReal, dtSim) {
        const cs = comps(), n = cs.length, E = sim.E;
        arrows.innerHTML = '';
        const pts = [];
        for (let i = 0; i < n; i++) {
          const c = cs[i];
          segs[i].setAttribute('fill', insideFill(c.V));
          setChannelState(naChans[i], sim.naState(c));
          setChannelState(kChans[i], sim.kState(c));
          if (!app.paused) {
            if (naChans[i].state === 'open') { const m = Math.min(2, counters[i](c.gNa * (c.V - E.Na), dtSim)); for (let j = 0; j < m; j++) particles.spawn('Na', naChans[i].x + rand(-5, 5), Y_TOP - 40 - rand(0, 40), naChans[i].x + rand(-25, 25), Y_TOP + 40 + rand(0, 40), rand(500, 750), { r: 6 }); }
            if (kChans[i].state === 'open') { const m = Math.min(2, counters[i](c.gK * (c.V - E.K) * 0.6, dtSim)); for (let j = 0; j < m; j++) particles.spawn('K', kChans[i].x + rand(-5, 5), Y_TOP + 40 + rand(0, 30), kChans[i].x + rand(-25, 25), Y_TOP - 50 - rand(0, 40), rand(500, 750), { r: 6 }); }
          }
          if (i < n - 1 && c.V - cs[i + 1].V > 15) {
            const x = lerp(X0, X1, (i + 1) / n);
            svgEl('path', { d: `M${x - 22},${(Y_TOP + Y_BOT) / 2} l30,0 l-8,-7 m8,7 l-8,7`, stroke: '#b45309', 'stroke-width': 3, fill: 'none', opacity: clamp((c.V - cs[i + 1].V) / 60, 0.3, 1) }, arrows);
          }
          pts.push(`${lerp(X0, X1, (i + 0.5) / n).toFixed(1)},${(490 - (c.V + 70) * 1).toFixed(1)}`);
        }
        profile.setAttribute('points', pts.join(' '));
        particles.update(dtReal);
        insetParts.update({ hideLabels: true });
      },
      narrate() {
        const cs = comps(), n = cs.length;
        let lead = -1, leadV = -40;
        for (let i = 0; i < n; i++) if (cs[i].V > leadV && cs[i].dVdt > 0) { leadV = cs[i].V; lead = i; }
        const name = (i) => cs[i].kind === 'hillock' ? 'the hillock' : cs[i].kind === 'terminal' ? 'the terminal' : `segment ${i}`;
        const refractory = cs.filter(c => sim.naState(c) === 'inactivated').length;
        if (lead >= 0 && lead < n - 1) return `<b>${name(lead)} is firing:</b> ${chip('Na')} rushes ${IN} there, positive charge spreads along the inside (arrow) and depolarizes ${name(lead + 1)} → its Na⁺ channels open next.${refractory ? ` Behind the wave, ${refractory} segment${refractory > 1 ? 's have' : ' has'} plugged (inactivated) Na⁺ channels, so the wave cannot turn back.` : ''}`;
        if (lead === n - 1) return `<b>The wave has reached the terminal.</b> Behind it, Na⁺ channels are inactivated and K⁺ channels are restoring rest.`;
        if (refractory > 0) return `Wave passed. ${chip('K')} flows ${OUT} to repolarize each segment; Na⁺ channels recover from inactivation in order, hillock first.`;
        return `All segments at rest (−70 mV). Every segment has its own voltage-gated Na⁺ and K⁺ channels, so the signal is regenerated at full size as it travels.`;
      },
    };
  };


  // =========================================================================
  // Lesson content (see docs/NEURON_MODULE.md)
  // =========================================================================
  function lesson(kit) {
    bind(kit);
    const S = window.SharedScenes;
    return [
    // ------------------------------------------------------------- 1. where are we
    {
      id: 'zoom', title: 'Where are we?', speed: 0.01,
      steps: [
        {
          view: 'zoom', title: 'From a person to a single neuron', remount: true, electrode: false, record: 'soma',
          text: `<p>Thinking, sensing and moving all run on electrical signals carried by nerve cells: <b>neurons</b>.</p>
                 <p>Zoom in step by step until we reach one neuron. Then we will follow one signal through it.</p>`,
          actions: [{ label: 'Zoom in →', cls: 'primary', run: (c) => { c.view().next(); if (c.view().last) c.complete(); c.refresh(); }, disabled: (c) => c.view().last }],
          waitFor: (c) => c.view().last, waitHint: 'Keep zooming in until you reach one neuron',
        },
      ],
    },
    // ------------------------------------------------------------- 2. anatomy
    {
      id: 'anatomy', title: 'Parts of a neuron', speed: 0.01,
      steps: (function () {
        const parts = [
          ['dendrites', 'Signals from other neurons usually arrive here. Click that structure.', 'Dendrites branch widely, giving a large surface for thousands of synaptic inputs. The boutons marked A, B and C are inputs from other neurons.'],
          ['soma', 'This region holds the nucleus, and it is where all incoming signals get added together. Click it.', 'The cell body (soma) integrates the inputs: excitatory ones push the voltage up, inhibitory ones hold it down.'],
          ['hillock', 'Where the axon leaves the cell body there is a small cone packed with voltage-sensitive channels. It decides whether the neuron fires. Click it.', 'The axon hillock (initial segment) has the highest density of voltage-gated Na⁺ and K⁺ channels, so the action potential normally starts here.'],
          ['axon', 'This long cable carries the signal away from the cell body without losing strength. Click it.', 'The axon can be shorter than a millimetre or longer than a metre. The signal is regenerated all along it, so it arrives full-size.'],
          ['terminal', 'At the far end, the signal is handed to the next cell by releasing a chemical. Click that structure.', 'The synaptic terminals release neurotransmitter onto the next neuron. We will end our journey there.'],
        ];
        const names = { dendrites: 'the dendrites', soma: 'the cell body (soma)', hillock: 'the axon hillock', axon: 'the axon', terminal: 'the synaptic terminals' };
        const steps = parts.map(([part, prompt, explain], i) => ({
          view: 'neuron', viewOpts: { caption: 'Click the structure described in the panel.' }, labels: false, electrode: false, record: 'soma', title: `Find the structure (${i + 1} of 5)`,
          text: `<p>${prompt}</p>`,
          enter: (c) => { c.view().highlight('none'); c.view().onPart = (p) => {
            if (p === part) { c.view().highlight(part); c.status(`<b>Yes — ${names[part]}.</b> ${explain}`, true); c.complete(); }
            else c.status(`That is ${names[p]}. ${p === 'dendrites' ? 'Dendrites receive inputs.' : p === 'soma' ? 'The soma integrates inputs.' : p === 'hillock' ? 'The hillock decides whether to fire.' : p === 'axon' ? 'The axon carries the signal.' : 'The terminals pass the signal on.'} Try again.`, false);
          }; },
          waitFor: () => false, waitHint: 'Click the correct part of the neuron',
          status: '',
        }));
        steps.push({
          view: 'neuron', viewOpts: { caption: 'One neuron among billions.' }, labels: true, title: 'The plan',
          text: `<p>Now you know the map. Here is the journey of one signal:</p>
                 <p><b>receive</b> (dendrites) → <b>integrate</b> (soma) → <b>decide</b> (hillock) → <b>propagate</b> (axon) → <b>transmit</b> (terminals) → the next neuron receives.</p>
                 <p>First, though, we need to understand why a resting neuron is electrically charged at all.</p>`,
          enter: (c) => { c.view().highlight('none'); },
        });
        return steps;
      })(),
    },
    // ------------------------------------------------------------- 3. resting membrane
    S.restingMembrane(profile, kit),
    // ------------------------------------------------------------- 4. electrode
    S.recordingElectrode(profile, kit),
    // ------------------------------------------------------------- 5. receiving a signal
    {
      id: 'synapse', title: 'Receiving a signal', speed: 0.002,
      steps: [
        {
          view: 'synapse', viewOpts: { input: 'A', caption: 'Zoom: the synapse where input A contacts one of our dendrites.' }, reset: true, record: 'soma', electrode: true, remount: true,
          title: 'A signal arrives at the synapse',
          text: `<p>Input A is the terminal of another neuron, pressed against one of our dendrites with a tiny gap between: the <b>synaptic cleft</b>.</p>
                 <p>An action potential is about to arrive in that terminal and depolarize it. Its membrane holds <b>voltage-gated ${I('Ca')} channels</b>, and Ca²⁺ is about 20,000× more concentrated outside than inside.</p>
                 <p>The list on the right ticks off each step as it happens. Everything runs in slow motion (1 s ≈ 2 ms).</p>`,
          question: { prompt: 'The Ca²⁺ channels open. Which way does Ca²⁺ move?', options: [
            { t: 'Into the terminal', ok: true, fb: 'Down a huge gradient and toward the negative inside. Now fire input A and watch what the Ca²⁺ does.' },
            { t: 'Out of the terminal', fb: 'Ca²⁺ is scarce inside (0.0001 mM) and plentiful outside (2 mM).' },
            { t: 'It stays put', fb: 'Open channel + gradient = movement.' },
          ] },
          actions: [{ label: 'Fire input A', cls: 'ca', run: () => sim.fireInput('A') }],
          waitFor: (c, ev) => ev.some(e => e.type === 'release' && e.input === 'A'), waitHint: 'Fire input A and watch',
          status: (c) => runner.state.done ? '<b>Observed:</b> Ca²⁺ entered → vesicles fused with the membrane → neurotransmitter spilled into the cleft → it bound receptors on our dendrite, which opened.' : '',
        },
        {
          view: 'synapse', title: 'Predict: the receptor channels open',
          text: `<p>The transmitter binds <b>receptor channels</b> on our dendrite. These are <b>excitatory receptors</b>: when open they let <b>net positive charge flow in</b>. At resting potential that inward current is carried mostly by ${I('Na')} (some K⁺ flows out at the same time, but less).</p>`,
          question: { prompt: 'Predict what happens to our neuron\'s membrane potential.', options: [
            { t: 'It depolarizes (becomes more positive) for a few milliseconds', ok: true, fb: 'This small, brief depolarization is an <b>excitatory postsynaptic potential (EPSP)</b>. Fire input A again and watch the trace.' },
            { t: 'It hyperpolarizes', fb: 'Positive charge is coming in. Recall the rule from the resting membrane: Na⁺ in = up.' },
            { t: 'It fires an action potential immediately', fb: 'One synapse is far too weak for that: it moves Vm only a few millivolts. Watch how big the change is.' },
          ] },
          actions: [{ label: 'Fire input A', cls: 'na', run: (c) => { sim.fireInput('A'); } }],
          waitFor: () => sim.soma.V > -66.5, waitHint: 'Fire input A and watch the trace',
          status: (c) => `Vm (soma) = ${fmtV(sim.soma.V)} mV` + (runner.state.done ? ' — an EPSP of a few mV that fades within ~20 ms. Not enough to fire the cell on its own.' : ''),
        },
        {
          view: 'synapse', viewOpts: { input: 'C', caption: 'A different synapse: input C contacts the cell body.' }, record: 'soma', remount: true,
          title: 'An inhibitory synapse',
          text: `<p>Input C uses a different transmitter and, more importantly, a different <b>receptor</b>: one that opens a ${I('Cl')} channel. Cl⁻ is about 110 mM outside and 6 mM inside, and it is <b>negative</b>.</p>
                 <p>Note: a transmitter is not excitatory or inhibitory by itself. What matters is which channel the receptor opens and which ions flow.</p>`,
          question: { prompt: 'The Cl⁻ channels open. Which way does Cl⁻ move, and what does that do to Vm?', options: [
            { t: 'Cl⁻ flows in; Vm becomes slightly more negative and is held near rest', ok: true, fb: 'Negative charge entering makes the inside more negative (an <b>inhibitory postsynaptic potential, IPSP</b>). Even more important: the open channels clamp Vm near the Cl⁻ equilibrium potential (about −75 mV), making it harder for excitation to reach threshold. Fire C and watch.' },
            { t: 'Cl⁻ flows out; Vm becomes more positive', fb: 'Cl⁻ is concentrated outside, so it flows in. And it is negative, so entering makes the inside more negative.' },
            { t: 'Cl⁻ flows in; Vm becomes more positive', fb: 'Cl⁻ carries negative charge. Adding negative charge inside makes Vm more negative, not more positive.' },
          ] },
          actions: [{ label: 'Fire input C', cls: 'cl', run: () => sim.fireInput('C') }],
          waitFor: () => sim.input('C').receptor.r > 0.1, waitHint: 'Fire input C and watch',
          status: (c) => `Vm (soma) = ${fmtV(sim.soma.V)} mV` + (runner.state.done ? ' — a small IPSP. The visible dip is small because Vm was already close to the Cl⁻ equilibrium potential; the stabilizing effect is what counts.' : ''),
        },
      ],
    },
    // ------------------------------------------------------------- 6. integration
    {
      id: 'integrate', title: 'Adding up the inputs', speed: 0.004, showThreshold: true,
      steps: [
        {
          view: 'neuron', viewOpts: { caption: 'Click the input boutons (A, B, C) or use the buttons. Watch the trace.' }, reset: true, record: 'soma', electrode: true, labels: true, remount: true,
          title: 'Challenge: make this neuron fire',
          text: `<p>Back to the whole cell, with three inputs: <b>A</b> and <b>B</b> are excitatory, <b>C</b> is inhibitory. The recording electrode is in the soma.</p>
                 <p>The dashed orange line on the trace is the <b>threshold</b> (about −55 mV). Get the soma above it. Time is running at 1 s ≈ 4 ms, so inputs a second apart are close together for the neuron.</p>`,
          enter: (c) => { c.view().onInput = (id) => sim.fireInput(id); },
          actions: [
            { label: 'Fire A', cls: 'na', run: () => sim.fireInput('A') },
            { label: 'Fire B', cls: 'na', run: () => sim.fireInput('B') },
            { label: 'Fire C', cls: 'cl', run: () => sim.fireInput('C') },
          ],
          tick: (c, ev) => { const d = c.stepState().data; d.max = Math.max(d.max == null ? -70 : d.max, sim.soma.V); },
          waitFor: (c, ev) => spikeIn(ev, 'hillock'), waitHint: 'Make the neuron fire',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? '<b>It fired!</b> The EPSPs added up, crossed threshold, and the axon hillock produced an action potential that swept down the axon.' : `Vm = ${fmtV(sim.soma.V)} mV · highest so far ${fmtV(d.max == null ? -70 : d.max)} mV. Hint: one input alone is not enough — inputs arriving close together add up.`; },
        },
        {
          view: 'neuron', title: 'Why did it take several inputs?',
          text: `<p>Each excitatory input moved Vm only about 5–6 mV. The threshold is about 15 mV above rest.</p>`,
          question: { prompt: 'Why did the neuron fire only when inputs arrived close together?', options: [
            { t: 'Each EPSP fades within tens of milliseconds, so they only add up if they overlap in time (temporal summation) or come from several synapses at once (spatial summation).', ok: true, fb: 'This is integration: the soma continuously sums all the EPSPs and IPSPs reaching it, and only the combined voltage at the hillock matters.' },
            { t: 'The first inputs were used up and the later ones were stronger.', fb: 'Each input produced a similar EPSP. What changed was that the later ones started from an already-depolarized membrane.' },
            { t: 'The neuron counts inputs and fires on the third one.', fb: 'The neuron does not count. It is the voltage at the hillock that matters; three inputs 50 ms apart would not fire it. Try that in the Lab.' },
          ] },
        },
        {
          view: 'neuron', viewOpts: { caption: 'Input C is now firing repeatedly. Try to fire the neuron with A and B.' }, reset: true, record: 'soma', electrode: true,
          title: 'Challenge: now with inhibition',
          text: `<p>Input C (inhibitory) is now firing over and over. Try to make the neuron fire using A and B.</p>`,
          enter: (c) => { sim.input('C').autoFire = true; sim.input('C').autoInterval = 6; c.stepState().data.tries = 0; c.view().onInput = (id) => { if (id !== 'C') sim.fireInput(id); c.stepState().data.tries++; }; },
          actions: [
            { label: 'Fire A', cls: 'na', run: (c) => { sim.fireInput('A'); c.stepState().data.tries++; } },
            { label: 'Fire B', cls: 'na', run: (c) => { sim.fireInput('B'); c.stepState().data.tries++; } },
            { label: 'Give up: switch C off', cls: '', run: (c) => { sim.input('C').autoFire = false; c.stepState().data.gaveUp = true; } },
          ],
          waitFor: (c, ev) => spikeIn(ev, 'hillock') || (c.stepState().data.tries >= 6 && sim.t > 40), waitHint: 'Try firing A and B several times',
          onDone: (c) => { sim.input('C').autoFire = false; },
          status: (c) => { const d = c.stepState().data; return runner.state.done ? (d.gaveUp || d.tries >= 6 ? '<b>Much harder, isn\'t it?</b> With C active the soma is held near −70 mV and A + B can no longer reach threshold.' : '<b>It fired</b> — but it took very precisely timed inputs. Inhibition raised the bar.') : `Vm = ${fmtV(sim.soma.V)} mV · attempts: ${d.tries}`; },
        },
        {
          view: 'neuron', title: 'Why is it harder with C active?',
          question: { prompt: 'Why did input C make it so much harder to fire the neuron?', options: [
            { t: 'Its open Cl⁻ channels pull Vm toward the Cl⁻ equilibrium potential (near rest) and away from threshold, cancelling much of the EPSPs.', ok: true, fb: 'Excitation and inhibition are added together by the soma. What reaches the hillock is their sum. This is how neurons compute: they weigh many inputs and fire only when excitation wins by enough.' },
            { t: 'C blocks the axon so the action potential cannot leave.', fb: 'C acts on the membrane potential of the soma, not on the axon. Look at where the C bouton sits.' },
            { t: 'C uses up the neurotransmitter of A and B.', fb: 'Each synapse has its own transmitter and receptors. C works through its own Cl⁻ channels.' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 7. axon hillock
    {
      id: 'hillock', title: 'The axon hillock decides', speed: 0.003, showThreshold: true,
      steps: [
        {
          view: 'membrane', viewOpts: { comp: 'hillock', inset: 'hillock', channels: ['Na_v', 'K_v', 'Na_v', 'K_v', 'Na_v'], ions: { outside: { Ca: 0 } }, caption: 'The membrane of the axon hillock, packed with voltage-gated channels.' }, reset: true, record: 'hillock', electrode: true, remount: true,
          title: 'A membrane full of voltage sensors',
          text: `<p>This is the membrane of the axon hillock. It is crowded with two kinds of channel, both marked <b>V</b>: <b>voltage-gated ${I('Na')} channels</b> and <b>voltage-gated ${I('K')} channels</b>. At rest both are closed.</p>`,
          question: { prompt: 'What determines whether a voltage-gated channel opens?', options: [
            { t: 'The membrane potential: depolarization opens it', ok: true, fb: 'These channels carry a charged "voltage sensor" in the membrane. When Vm becomes less negative, the sensor shifts and the gate opens.' },
            { t: 'Whether neurotransmitter binds to it', fb: 'That describes the receptor channels at the synapse (ligand-gated). Voltage-gated channels have no transmitter binding site.' },
            { t: 'Whether ATP is available', fb: 'ATP powers the pump, not these channels. Channels open and close by changing shape in response to voltage.' },
          ] },
        },
        {
          view: 'membrane', title: 'Predict: the summed inputs arrive',
          text: `<p>The EPSPs from the soma have just depolarized this membrane from −70 mV to about <b>−55 mV</b>.</p>`,
          question: { prompt: 'Predict what the voltage-gated Na⁺ channels will do.', options: [
            { t: 'Open, letting Na⁺ rush in', ok: true, fb: 'Now press the button. It injects a small current into the soma (as if several EPSPs arrived). The simulation pauses the moment the hillock reaches about −55 mV.' },
            { t: 'Stay closed until the cell reaches 0 mV', fb: 'Their sensors respond well before 0 mV: around −55 mV a significant fraction open, and that is enough to start the chain reaction.' },
            { t: 'Close more tightly', fb: 'Depolarization is exactly what opens them.' },
          ] },
          actions: [{ label: 'Depolarize the cell to threshold', cls: 'na', run: (c) => { setPaused(false); stimPulse(); } }],
          tick: (c) => { if (!runner.state.done && sim.hillock.V > -56) { c.complete(); setPaused(true); } },
          waitFor: () => false, waitHint: 'Depolarize the cell',
          status: (c) => runner.state.done ? '<b>Paused at threshold.</b> Vm (hillock) = ' + fmtV(sim.hillock.V) + ' mV. Some Na⁺ channels have just opened.' : `Vm (hillock) = ${fmtV(sim.hillock.V)} mV`,
        },
        {
          view: 'membrane', title: 'Predict: what happens next?', pause: true,
          text: `<p>Paused at threshold. A few Na⁺ channels have opened and ${I('Na')} is starting to enter.</p>`,
          question: { prompt: 'Na⁺ entering makes the membrane more positive. What does that do to the neighbouring Na⁺ channels?', options: [
            { t: 'Opens more of them, which lets in more Na⁺, which opens still more: a runaway positive feedback', ok: true, fb: 'This loop is the heart of the action potential. Once it starts it cannot be stopped: the cell fires "all or none". Press Continue to let it run and watch the loop below light up.' },
            { t: 'Nothing; each channel acts independently of the others', fb: 'Each channel responds to the shared membrane voltage. When one lets Na⁺ in, the voltage all its neighbours feel changes.' },
            { t: 'Closes them, to stop the cell from overshooting', fb: 'Closing (inactivation) does come, but later. The immediate effect of depolarization is to open more Na⁺ channels.' },
          ] },
          extraHtml: LOOP_HTML,
          tick: (c) => loopHighlight(c),
          onContinue: (c) => { setPaused(false); },
        },
        {
          view: 'membrane', title: 'Watch the chain reaction',
          text: `<p>The loop runs until almost every Na⁺ channel is open and Vm shoots toward the Na⁺ equilibrium potential (+67 mV). Then two things stop it, which we will build next.</p>`,
          actions: [refire],
          extraHtml: LOOP_HTML,
          tick: (c) => { loopHighlight(c); },
          waitFor: () => sim.hillock.V > 0 || (app.history.length && app.history.some(s => s.V.hillock > 0)), waitHint: 'Watch the membrane fire',
          status: (c) => runner.state.done ? '<b>Observed:</b> the hillock fired.' : `Vm (hillock) = ${fmtV(sim.hillock.V)} mV`,
        },
      ],
    },
    // ------------------------------------------------------------- 8. build the AP graph
    Object.assign(S.actionPotential(profile, kit), { showThreshold: true }),
    // ------------------------------------------------------------- 9. propagation
    {
      id: 'propagate', title: 'Down the axon', speed: 0.003, showThreshold: true,
      steps: [
        {
          view: 'axon', viewOpts: { caption: 'The axon, unrolled: hillock on the left, terminal on the right.' }, reset: true, record: 'hillock', extra: ['axon6', 'terminal'], electrode: true, showG: false, remount: true,
          title: 'The action potential travels',
          text: `<p>Here is the axon laid out as a series of segments, each with its own voltage-gated Na⁺ and K⁺ channels. Three electrodes record from the hillock, the middle of the axon and the terminal.</p>
                 <p>When one segment fires, its inward Na⁺ current spreads as a <b>local current</b> along the inside of the axon and depolarizes the next segment.</p>`,
          actions: [{ label: 'Fire the neuron', cls: 'na', run: (c) => { stimPulse(); } }],
          waitFor: (c, ev) => spikeIn(ev, 'terminal'), waitHint: 'Fire the neuron and watch the wave travel',
          status: (c) => runner.state.done ? '<b>Observed:</b> the wave reached the terminal. Look at the three traces: the same full-size action potential, delayed at each electrode.' : 'Watch the channels change state from left to right.',
        },
        {
          view: 'axon', title: 'What opens the next segment\'s channels?',
          question: { prompt: 'What triggers the voltage-gated Na⁺ channels in the next segment?', options: [
            { t: 'Depolarization spreading from the active segment as local current', ok: true, fb: 'Each segment re-generates the action potential in full, so the signal never fades however long the axon is.' },
            { t: 'Na⁺ ions travelling down the axon from the hillock', fb: 'The ions themselves barely move along the axon. It is the change in voltage (charge redistributing) that spreads, much faster than any ion diffuses.' },
            { t: 'Neurotransmitter released inside the axon', fb: 'Transmitter is released only at the terminal, onto the next cell.' },
          ] },
        },
        {
          view: 'axon', title: 'Why only forward?',
          text: `<p>Fire it again and watch the channels <b>behind</b> the wave.</p>`,
          actions: [{ label: 'Fire the neuron', cls: 'na', run: (c) => { stimPulse(); } }],
          question: { prompt: 'The segment that just fired is also depolarized by its neighbour. Why doesn\'t the action potential travel backward?', options: [
            { t: 'Behind the wave, the Na⁺ channels are inactivated (refractory) and cannot reopen', ok: true, fb: 'The inactivated channels (plug in the pore) leave the wave only one way to go. In myelinated axons the same idea applies, but the wave jumps between nodes; a topic for later.' },
            { t: 'The axon has a valve that lets current flow one way', fb: 'There is no valve. Current spreads both ways; what differs is the state of the channels on either side.' },
            { t: 'The membrane behind is already at +40 mV so nothing more can happen', fb: 'By the time the next segment fires, the previous one is already repolarizing. What stops it re-firing is its Na⁺ channels being inactivated.' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 10. terminal
    {
      id: 'terminal', title: 'Passing it on', speed: 0.003, showThreshold: true,
      steps: [
        {
          view: 'synapse', viewOpts: { input: 'output', caption: 'Our own terminal, facing the next neuron.' }, reset: true, record: 'terminal', extra: ['next'], electrode: true, remount: true,
          title: 'The action potential reaches the terminal',
          text: `<p>We have followed the wave to our own synaptic terminal. Its membrane has depolarized to about +40 mV.</p>`,
          question: { prompt: 'Which kind of channel responds directly to this voltage change and starts transmitter release?', options: [
            { t: 'Voltage-gated Ca²⁺ channels', ok: true, fb: 'Ca²⁺ entering the terminal is the signal for vesicles to fuse. Send an action potential and watch: Ca²⁺ in → vesicle fusion → transmitter → the next neuron\'s receptors open.' },
            { t: 'Ligand-gated receptor channels', fb: 'Those sit on the receiving side and need transmitter to open. We are on the sending side, and nothing has been released yet.' },
            { t: 'K⁺ leak channels', fb: 'Leak channels are always open and do not respond to voltage.' },
          ] },
          actions: [{ label: 'Send an action potential', cls: 'ca', run: (c) => { stimPulse(); } }],
          waitFor: (c, ev) => ev.some(e => e.type === 'release' && e.input === 'output'), waitHint: 'Send an action potential and watch the terminal',
          status: (c) => runner.state.done ? '<b>Observed:</b> Ca²⁺ entered, vesicles fused, transmitter crossed the cleft and the next neuron produced an EPSP (pink trace).' : `Vm (terminal) = ${fmtV(sim.term.V)} mV`,
        },
        {
          view: 'neuron', viewOpts: { caption: 'The loop closes: our output is the next neuron\'s input.' }, record: 'soma', extra: ['terminal', 'next'], electrode: true, labels: true, remount: true,
          title: 'The loop closes',
          text: `<p>Look at the right edge: the next neuron has just received an EPSP, exactly like the one input A gave us at the start.</p>
                 <p><b>receive → integrate → decide → propagate → transmit → the next neuron receives.</b></p>`,
          actions: [{ label: 'Fire A', cls: 'na', run: () => sim.fireInput('A') }, { label: 'Fire B', cls: 'na', run: () => sim.fireInput('B') }, { label: 'Fire C', cls: 'cl', run: () => sim.fireInput('C') }],
          enter: (c) => { c.view().onInput = (id) => sim.fireInput(id); },
          question: { prompt: 'What will the next neuron do with this EPSP?', options: [
            { t: 'Add it to all its other inputs and fire only if the sum at its hillock crosses threshold', ok: true, fb: 'Every neuron in the brain is running this same computation, billions of times a second. You now have the causal model. Head to the Lab to break it: block Na⁺ channels, raise extracellular K⁺, switch off the pump, and predict what happens before you look.' },
            { t: 'Fire an action potential immediately', fb: 'One EPSP is a few millivolts. Remember how many it took to fire our neuron.' },
            { t: 'Pass the transmitter along its axon', fb: 'Transmitter never enters the receiving cell. It opens channels; what travels on is a change in voltage.' },
          ] },
          continueLabel: 'Open the Lab →', continueTo: () => enterLab(),
        },
      ],
    },
    ];
  }

  // =========================================================================
  // Free-play lab (config.lab: the generic shell in app.js resets the sim and calls this)
  // =========================================================================
  function lab(kit) {
    bind(kit);
    app.electrode = true; app.labels = true; app.recordComp = 'soma'; app.extraTraces = ['terminal', 'next'];
    setSpeed(0.005); setPaused(false);
    mountView('neuron', { caption: 'Lab: click an input bouton to fire it, or use the controls.' });
    renderLab();
  }
  function renderLab() {
    panel.innerHTML = '';
    panel.appendChild(htmlEl('div', { class: 'scene-label' }, 'Free-play lab'));
    panel.appendChild(htmlEl('h2', {}, 'Experiment with the neuron'));
    panel.appendChild(htmlEl('div', { class: 'text' }, '<p>Everything here is the same simulation the lesson used. Change one thing at a time and watch the trace.</p>'));
    const lab = htmlEl('div', { class: 'lab' });
    const row = (label, input, valEl) => { const r = htmlEl('div', { class: 'row' }); r.appendChild(htmlEl('label', {}, label)); r.appendChild(input); if (valEl) r.appendChild(valEl); lab.appendChild(r); return r; };
    const slider = (label, min, max, step, get, set, fmt) => {
      const inp = htmlEl('input', { type: 'range', min, max, step }); inp.value = get();
      const val = htmlEl('span', { class: 'val' }, fmt(get()));
      inp.addEventListener('input', () => { set(parseFloat(inp.value)); val.textContent = fmt(parseFloat(inp.value)); });
      row(label, inp, val);
      return inp;
    };
    lab.appendChild(htmlEl('h3', {}, 'View'));
    const sel = htmlEl('select');
    [['neuron', 'Whole neuron'], ['membrane-soma', 'Membrane (soma)'], ['membrane-hillock', 'Membrane (axon hillock)'], ['synapse-A', 'Synapse: input A (excitatory)'], ['synapse-C', 'Synapse: input C (inhibitory)'], ['axon', 'Axon propagation'], ['synapse-output', 'Our terminal → next neuron']].forEach(([v, t]) => { const o = htmlEl('option', { value: v }, t); sel.appendChild(o); });
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (v === 'neuron') mountView('neuron', { caption: 'Lab' });
      else if (v.startsWith('membrane-')) { const c = v.split('-')[1]; mountView('membrane', { comp: c, inset: c, channels: c === 'soma' ? ['K_leak', 'Na_leak', 'pump', 'Na_v', 'K_v', 'Na_manual', 'K_manual', 'Cl_manual'] : ['Na_v', 'K_v', 'Na_v', 'K_v', 'Na_v', 'K_leak'], caption: 'Lab: membrane of the ' + c }); app.recordComp = c; }
      else if (v.startsWith('synapse-')) { const i = v.split('-')[1]; mountView('synapse', { input: i, caption: 'Lab: synapse' }); app.recordComp = i === 'output' ? 'terminal' : (i === 'C' ? 'soma' : 'dendrite'); }
      else if (v === 'axon') { mountView('axon', { caption: 'Lab: axon' }); app.recordComp = 'hillock'; app.extraTraces = ['axon6', 'terminal']; }
      $('#trace-title').textContent = profile.traceTitle(app.recordComp);
    });
    row('Show', sel);
    lab.appendChild(htmlEl('h3', {}, 'Inputs'));
    const fireRow = htmlEl('div', { class: 'actions' });
    for (const id of ['A', 'B', 'C']) { const b = htmlEl('button', { class: id === 'C' ? 'cl' : 'na' }, `Fire ${id}`); b.addEventListener('click', () => sim.fireInput(id)); fireRow.appendChild(b); }
    lab.appendChild(fireRow);
    for (const id of ['A', 'B', 'C']) {
      const cb = htmlEl('input', { type: 'checkbox' }); cb.addEventListener('change', () => { sim.input(id).autoFire = cb.checked; sim.input(id).lastAuto = -1e9; });
      row(`Input ${id} fires repeatedly`, cb);
    }
    slider('Repeat interval (ms)', 4, 40, 1, () => 20, (v) => sim.inputs.forEach(i => { i.autoInterval = v; }), (v) => v + ' ms');
    slider('Excitatory synapse strength', 0, 3, 0.05, () => 1, (v) => sim.inputs.forEach(i => { if (i.type === 'excitatory') i.receptor.gmax = 0.004 * v; }), (v) => '×' + v.toFixed(2));
    slider('Inhibitory synapse strength', 0, 3, 0.05, () => 1, (v) => { sim.input('C').receptor.gmax = 0.012 * v; }, (v) => '×' + v.toFixed(2));
    lab.appendChild(htmlEl('h3', {}, 'Current injection (electrode)'));
    slider('Current into soma (nA)', -0.3, 0.6, 0.01, () => 0, (v) => sim.setStim('soma', v), (v) => v.toFixed(2) + ' nA');
    lab.appendChild(htmlEl('h3', {}, 'Open channels yourself (soma)'));
    const manual = htmlEl('div', { class: 'actions' });
    for (const [key, cls, label, g] of [['gNa', 'na', 'Hold: open Na⁺ channels', 0.0015], ['gK', 'k', 'Hold: open K⁺ channels', 0.006], ['gCl', 'cl', 'Hold: open Cl⁻ channels', 0.01]]) {
      const b = htmlEl('button', { class: cls }, label);
      const down = (e) => { e.preventDefault(); sim.manual[key] = g; b.classList.add('held'); }, up = () => { sim.manual[key] = 0; b.classList.remove('held'); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up);
      manual.appendChild(b);
    }
    lab.appendChild(manual);
    lab.appendChild(htmlEl('h3', {}, 'Drugs and conditions'));
    slider('Block voltage-gated Na⁺ channels (TTX)', 0, 100, 1, () => 0, (v) => { sim.naBlock = v / 100; }, (v) => v + '%');
    slider('Block voltage-gated K⁺ channels (TEA)', 0, 100, 1, () => 0, (v) => { sim.kBlock = v / 100; }, (v) => v + '%');
    slider('Block terminal Ca²⁺ channels', 0, 100, 1, () => 0, (v) => { sim.terminal.caBlock = v / 100; }, (v) => v + '%');
    slider('Block receptors of input A (antagonist)', 0, 100, 1, () => 0, (v) => { sim.input('A').receptor.block = v / 100; }, (v) => v + '%');
    slider('Extracellular K⁺ (mM)', 2, 30, 0.5, () => 4, (v) => { sim.conc.K.out = v; }, (v) => v.toFixed(1) + ' mM');
    slider('Extracellular Na⁺ (mM)', 20, 200, 5, () => 145, (v) => { sim.conc.Na.out = v; }, (v) => v.toFixed(0) + ' mM');
    const pump = htmlEl('input', { type: 'checkbox' }); pump.checked = true;
    pump.addEventListener('change', () => { sim.pumpOn = pump.checked; sim.pumpRundownRate = pump.checked ? 0 : 0.02; });
    row('Na⁺/K⁺ pump running (off = gradients slowly run down, accelerated)', pump);
    lab.appendChild(htmlEl('h3', {}, 'Recording'));
    const rec = htmlEl('select');
    ['dendrite', 'soma', 'hillock', 'axon6', 'terminal', 'next'].forEach(n => rec.appendChild(htmlEl('option', { value: n }, n)));
    rec.value = app.recordComp; rec.addEventListener('change', () => { app.recordComp = rec.value; $('#trace-title').textContent = profile.traceTitle(app.recordComp); });
    row('Electrode in', rec);
    const resetB = htmlEl('button', {}, 'Reset neuron'); resetB.addEventListener('click', () => { sim.reset(); app.history = []; app.markers = []; renderLab(); });
    lab.appendChild(resetB);
    panel.appendChild(lab);
    panel.appendChild(labNav());
  }


  window.NeuronLesson = { profile, drawCell, views: (kit) => { bind(kit); return views; }, lesson, lab };
})();
