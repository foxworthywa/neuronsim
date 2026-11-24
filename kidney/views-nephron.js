/* KidneySim views, part 2: the filter close-up, and the nephron strip (filter, tubule drawn
 * straightened, return line, urine, ledger) that stays on screen from scene 4 to the end. The
 * width of the stream is the model's flow at that point; every particle's fate is drawn from the
 * model's fractions for its substance. */
(function () {
  'use strict';
  const { app, views, COL, $, clamp, svgEl, setAttrs, fx, flow, big, urineColour, colourWord, SEG, nephronShape } = KD;
  const { Kidney, DAY } = KidneySim;
  const stage = $('#stage');
  const label = (parent, x, y, text, o) => svgEl('text', Object.assign({ x, y, 'font-size': 16, fill: COL.ink, text }, o || {}), parent);
  const small = (parent, x, y, text, o) => label(parent, x, y, text, Object.assign({ 'font-size': 14, fill: COL.muted }, o || {}));
  const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
  const numbered = KD.numbered;

  // What is drawn for each substance. `size` orders them (a red cell is about a thousand times
  // wider than albumin, which is about ten times wider than glucose); the drawing is not to scale.
  const KIND = {
    rbc: { name: 'red blood cell', col: COL.rbc, small: false },
    alb: { name: 'blood protein (albumin)', col: COL.alb, small: false },
    drug: { name: 'penicillin', col: COL.drug, small: true },
    glucose: { name: 'glucose', col: COL.glucose, small: true },
    cr: { name: 'creatinine', col: COL.cr, small: true },
    urea: { name: 'urea', col: COL.urea, small: true },
    na: { name: 'salt', col: COL.na, small: true },
    k: { name: 'potassium', col: COL.k, small: true },
    water: { name: 'water', col: COL.water, small: true },
  };
  function mark(g, kind, s) {
    s = s || 1;
    const c = KIND[kind].col;
    switch (kind) {
      case 'rbc': { const e = svgEl('g', {}, g); svgEl('ellipse', { rx: 11 * s, ry: 8 * s, fill: c, stroke: '#8f2620', 'stroke-width': 1 }, e); svgEl('ellipse', { rx: 5 * s, ry: 3.2 * s, fill: '#a52e22' }, e); return e; }
      case 'alb': return svgEl('path', { d: `M${-6 * s},${-3 * s} Q${-2 * s},${-8 * s} ${3 * s},${-5 * s} Q${8 * s},${-2 * s} ${5 * s},${3 * s} Q${1 * s},${7 * s} ${-4 * s},${5 * s} Q${-8 * s},${2 * s} ${-6 * s},${-3 * s} Z`, fill: c, stroke: '#7d2f62', 'stroke-width': 0.8 }, g);
      case 'glucose': return svgEl('path', { d: `M0,${-4.4 * s} L${3.8 * s},${-2.2 * s} L${3.8 * s},${2.2 * s} L0,${4.4 * s} L${-3.8 * s},${2.2 * s} L${-3.8 * s},${-2.2 * s} Z`, fill: c }, g);
      case 'urea': return svgEl('path', { d: `M0,${-3.6 * s} L${3.4 * s},${2.6 * s} L${-3.4 * s},${2.6 * s} Z`, fill: c }, g);
      case 'cr': return svgEl('rect', { x: -3 * s, y: -3 * s, width: 6 * s, height: 6 * s, fill: c }, g);
      case 'drug': return svgEl('path', { d: 'M0,-5 L1.5,-1.5 L5,-1.5 L2.2,1 L3.2,5 L0,2.6 L-3.2,5 L-2.2,1 L-5,-1.5 L-1.5,-1.5 Z', fill: c, transform: `scale(${s})` }, g);
      case 'na': return svgEl('circle', { r: 2.8 * s, fill: c }, g);
      case 'k': return svgEl('circle', { r: 2.8 * s, fill: c }, g);
      default: return svgEl('circle', { r: 1.9 * s, fill: c }, g);
    }
  }
  KD.KIND = KIND; KD.kindMark = mark;

  // ---- the filter's shape, shared by the strip and by the close-up, so that they are one picture
  // at two scales. Coordinates are the strip's.
  const G = {
    TY: 206, RY: 62, FULL: 46, X0: 140, CX: 104.7, CY: 206,
    AFF: 'M4,96 C40,96 52,150 70,178',
    TUFT: 'M70,178 C52,196 62,226 84,222 C104,218 92,196 104,190 C120,184 128,212 112,228 C98,242 76,236 80,214 C82,198 100,196 108,176',
    EP: [[108, 176], [116, 120], [130, 62], [190, 62]],
    CUP: 'M140,155 A62,62 0 1,0 140,257',
  };
  const mapPath = (d, f) => d.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g, (m, x, y) => { const q = f(+x, +y); return `${q[0].toFixed(1)},${q[1].toFixed(1)}`; });
  const bezAt = (P, t) => { const u = 1 - t, f = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [0, 1].map(i => P.reduce((a, pt, j) => a + f[j] * pt[i], 0)); };
  // The efferent arteriole as a ribbon that widens from an arteriole to the full return line.
  function efferentRibbon(P, extra, k) {
    const L = [], R = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, p0 = bezAt(P, Math.max(0, t - 0.01)), p1 = bezAt(P, Math.min(1, t + 0.01)), q = bezAt(P, t);
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], n = Math.hypot(dx, dy) || 1, w = (5.5 + 7.5 * t * t * (3 - 2 * t)) * (k || 1) + extra;
      L.push(`${(q[0] - dy / n * w).toFixed(1)},${(q[1] + dx / n * w).toFixed(1)}`); R.push(`${(q[0] + dy / n * w).toFixed(1)},${(q[1] - dx / n * w).toFixed(1)}`);
    }
    return `M${L.join(' L')} L${R.reverse().join(' L')} Z`;
  }
  // Blood in, the knot of capillaries in its cup, blood out: drawn as one continuous vessel.
  function drawFilter(svg) {
    svgEl('path', { d: G.CUP, fill: COL.tubule, stroke: SEG.filter, 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
    const tube = (d, w, col) => svgEl('path', { d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    // outlines first, then the blood inside, so that the joins between the parts do not show
    tube(G.AFF, 17, COL.bloodLine); tube(G.TUFT, 14, COL.bloodLine);
    svgEl('path', { d: efferentRibbon(G.EP, 2.5), fill: COL.bloodLine }, svg);
    tube(G.AFF, 12, COL.blood); tube(G.TUFT, 9, COL.blood);
    svgEl('path', { d: efferentRibbon(G.EP, 0), fill: COL.blood }, svg);
  }

  // =========================================================================
  // The filter (scene 5): the strip's filter, enlarged
  // =========================================================================
  views.filter = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'The filter of one nephron, enlarged: blood comes in by the afferent arteriole, runs through a knot of capillaries inside a cup, and leaves by the efferent arteriole; what passes through the capillary walls collects in the cup and runs on into the tubule' }, stage);
    const view = { svg, open: false, points: { fixed: [], auto: [] }, shown: opts.kinds || ['rbc', 'alb', 'glucose', 'urea', 'na', 'water'] };
    const body = () => app.sim;
    const K = 2.5, CX = 285, CY = 262;
    const M = (x, y) => [CX + K * (x - G.CX), CY + K * (y - G.CY)];
    // ---- the cup, and the start of the tubule leading away to the right
    const mouth = M(G.X0, 0)[0], top = M(0, 155)[1], bot = M(0, 257)[1];
    svgEl('path', { d: `M${mouth},${top} L760,${CY - 68} L760,${CY + 68} L${mouth},${bot} Z`, fill: COL.tubule }, svg);
    svgEl('path', { d: `M${mouth},${top} L760,${CY - 68} M${mouth},${bot} L760,${CY + 68}`, fill: 'none', stroke: COL.tubuleLine, 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
    svgEl('path', { d: `M${mouth},${top} A${62 * K},${62 * K} 0 1,0 ${mouth},${bot}`, fill: COL.tubule, stroke: SEG.filter, 'stroke-width': 7, 'stroke-linecap': 'round' }, svg);
    label(svg, 640, CY + 5, 'into the tubule →', { 'font-size': 14.5, 'text-anchor': 'middle', fill: '#7a5a10', 'font-weight': 600 });
    label(svg, CX, CY + 122, 'the cup: what comes', { 'font-size': 13.5, fill: '#7a5a10', 'text-anchor': 'middle' }); label(svg, CX, CY + 138, 'through collects here', { 'font-size': 13.5, fill: '#7a5a10', 'text-anchor': 'middle' });
    // ---- the blood: afferent arteriole, the knot of capillaries, efferent arteriole
    const AFF = mapPath(G.AFF, M), TUFT = mapPath(G.TUFT, M), EP = G.EP.map(p => M(p[0], p[1]));
    const tube = (d, w, col, o) => svgEl('path', Object.assign({ d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, o || {}), svg);
    const affOut = tube(AFF, 36, COL.bloodLine); tube(TUFT, 36, COL.bloodLine);
    svgEl('path', { d: efferentRibbon(EP, 4, K * 0.86), fill: COL.bloodLine }, svg);
    // pores: gaps in the capillary wall, drawn when the filter is open
    const pores = tube(TUFT, 38, COL.tubule, { 'stroke-dasharray': '5 19', 'stroke-linecap': 'butt', opacity: 0 });
    const affIn = tube(AFF, 29, COL.blood); tube(TUFT, 29, COL.blood);
    svgEl('path', { d: efferentRibbon(EP, 0, K * 0.86), fill: COL.blood }, svg);
    const holes = svgEl('g', { opacity: 0 }, svg);
    for (const [x, y] of [M(122, 200), M(116, 234), M(66, 208)]) svgEl('path', { d: 'M-9,-9 L9,9 M-9,9 L9,-9', stroke: '#b0352b', 'stroke-width': 4, 'stroke-linecap': 'round', transform: `translate(${x},${y})` }, holes);
    // the path the blood follows, for the particles
    const guide = svgEl('path', { d: `${AFF} ${TUFT.replace(/^M[^C]*/, '')} C${EP[1]} ${EP[2]} ${EP[3]}`, fill: 'none', stroke: 'none' }, svg);
    const lenAff = svgEl('path', { d: AFF, fill: 'none', stroke: 'none' }, svg).getTotalLength(), lenTuft = svgEl('path', { d: TUFT, fill: 'none', stroke: 'none' }, svg).getTotalLength();
    const lenAll = Math.min(guide.getTotalLength(), lenAff + lenTuft + 230);        // the vessel leaves the picture at the top
    // ---- labels
    label(svg, 14, 92, 'blood in:', { 'font-size': 14, fill: '#8f2620' }); label(svg, 14, 109, 'afferent arteriole', { 'font-size': 14, fill: '#8f2620', 'font-weight': 700 });
    const pArt = [label(svg, 14, 134, 'mean pressure in', { 'font-size': 13.5 }), label(svg, 14, 150, 'her arteries:', { 'font-size': 13.5 }), label(svg, 14, 169, '', { 'font-size': 15.5, 'font-weight': 700 })];
    const artNote = small(svg, 14, 192, '', { 'font-size': 13 }), artNote2 = label(svg, 14, 208, '', { 'font-size': 13, 'font-weight': 650 });
    label(svg, 348, 36, 'blood out:', { 'font-size': 14, fill: '#8f2620' }); label(svg, 418, 36, 'efferent arteriole', { 'font-size': 14, fill: '#8f2620', 'font-weight': 700 });
    label(svg, 348, 62, "pressure in the filter's", { 'font-size': 13.5 }); const pCap = label(svg, 348, 79, '', { 'font-size': 13.5 });
    label(svg, 14, 330, 'the walls of the', { 'font-size': 13.5, fill: '#7d1f19' }); const wallNote = label(svg, 14, 346, '', { 'font-size': 13.5, fill: '#7d1f19' });
    svgEl('path', { d: `M118,334 L${M(60, 214)[0] - 18},${M(60, 214)[1]}`, stroke: '#7d1f19', 'stroke-width': 1 }, svg);
    void pArt;
    // ---- where this is: the strip's filter, with a frame round what is enlarged here
    {
      const box = svgEl('g', {}, svg);
      svgEl('rect', { x: 588, y: 10, width: 176, height: 124, rx: 8, fill: '#fff', stroke: '#d9d6cc' }, box);
      const mini = svgEl('svg', { x: 592, y: 14, width: 168, height: 100, viewBox: '0 40 420 250' }, box);
      svgEl('path', { d: `M140,155 L420,186 L420,226 L140,257 Z`, fill: '#cfe3f6', stroke: COL.tubuleLine, 'stroke-width': 3 }, mini);
      svgEl('path', { d: `M186,${G.RY} L420,${G.RY}`, stroke: COL.bloodLine, 'stroke-width': 31 }, mini); svgEl('path', { d: `M186,${G.RY} L420,${G.RY}`, stroke: COL.blood, 'stroke-width': 26 }, mini);
      drawFilter(mini);
      svgEl('rect', { x: 14, y: 110, width: 160, height: 172, rx: 10, fill: 'none', stroke: '#2f6fd6', 'stroke-width': 5, 'stroke-dasharray': '12 8' }, mini);
      small(box, 676, 128, 'the framed part, enlarged', { 'font-size': 12, 'text-anchor': 'middle', fill: '#2f6fd6' });
    }
    // ---- the things in the blood
    const pg = svgEl('g', { 'pointer-events': 'none' }, svg);
    const COUNT = { rbc: 7, alb: 8, glucose: 9, urea: 9, na: 24, water: 50 }, SIZE = { rbc: 10, alb: 7 };
    const parts = [];
    for (const k of view.shown) for (let i = 0; i < COUNT[k]; i++) { const e = svgEl('g', {}, pg); mark(e, k, k === 'rbc' ? 0.85 : 1); parts.push({ k, e, s: Math.random() * lenAll, lane: Math.random() * 2 - 1, v: 0.85 + Math.random() * 0.3, st: 'blood', x: 0, y: 0, t: 0 }); }
    // legend
    const lg = svgEl('g', { transform: 'translate(30,452)' }, svg);
    small(lg, 0, 0, 'In her blood, in order of size (the drawing is not to scale):', { 'font-size': 13 });
    view.shown.forEach((k, i) => { const g = svgEl('g', { transform: `translate(${14 + i * 122},26)` }, lg); mark(g, k); small(g, 18, 5, KIND[k].name.replace('blood protein (albumin)', 'blood protein').replace('red blood cell', 'red cell'), { 'font-size': 13 }); });
    // the meter and the chart
    svgEl('rect', { x: 776, y: 18, width: 208, height: 416, rx: 12, fill: '#fff', stroke: '#d9d6cc' }, svg);
    label(svg, 790, 42, 'Filtered, both kidneys', { 'font-size': 14.5, 'font-weight': 650 });
    const gfrT = label(svg, 790, 80, '', { 'font-size': 30, 'font-weight': 700 }), gfrU = small(svg, 790, 100, '', { 'font-size': 13.5 }), gfrD = small(svg, 790, 118, '', { 'font-size': 13.5 });
    const ch = svgEl('g', { transform: 'translate(820,170)', opacity: 0 }, svg);
    const CW = 150, CH = 190, PX = (m) => (m - 40) / 160 * CW, PY = (g) => CH - clamp(g, 0, 400) / 400 * CH;
    svgEl('rect', { x: 0, y: 0, width: CW, height: CH, fill: '#fbfaf6', stroke: '#e6e3da' }, ch);
    svgEl('rect', { x: PX(80), y: 0, width: PX(180) - PX(80), height: CH, fill: 'rgba(47,158,91,0.10)' }, ch);
    for (const g of [0, 125, 250, 375]) { svgEl('path', { d: `M0,${PY(g)} L${CW},${PY(g)}`, stroke: '#e6e3da' }, ch); small(ch, -5, PY(g) + 4, String(g), { 'font-size': 11.5, 'text-anchor': 'end' }); }
    for (const m of [40, 80, 120, 160, 200]) small(ch, PX(m), CH + 14, String(m), { 'font-size': 11.5, 'text-anchor': 'middle' });
    small(ch, CW / 2, CH + 30, 'mean arterial pressure (mmHg)', { 'font-size': 11.5, 'text-anchor': 'middle' });
    small(ch, -34, -8, 'filtered (mL/min)', { 'font-size': 11.5 });
    const curveF = svgEl('path', { fill: 'none', stroke: '#9aa0ad', 'stroke-width': 2 }, ch), curveA = svgEl('path', { fill: 'none', stroke: '#2f6fd6', 'stroke-width': 2.4 }, ch);
    const dotsF = svgEl('g', {}, ch), dotsA = svgEl('g', {}, ch);
    const now = svgEl('circle', { r: 5.5, fill: '#fff', stroke: COL.ink, 'stroke-width': 2 }, ch);
    const lgF = small(svg, 790, 408, '', { 'font-size': 12 }), lgA = small(svg, 790, 424, '', { 'font-size': 12, fill: '#2f6fd6' });
    const marks = numbered(svg, opts.marksAt || []);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);
    view.setOpen = (o) => { view.open = !!o; };
    view.showChart = (on) => ch.setAttribute('opacity', on ? 1 : 0);
    // Record the present pressure and filtering rate as a point on the chart.
    view.plot = () => {
      const b = body(), list = view.points[b.s.autoreg ? 'auto' : 'fixed'], m = Math.round(b.f.map);
      const i = list.findIndex(p => p.m === m); if (i >= 0) list.splice(i, 1);
      list.push({ m, g: b.f.gfr }); list.sort((p, q) => p.m - q.m);
      const draw = (pts, path, dots, col) => {
        path.setAttribute('d', pts.map((p, j) => `${j ? 'L' : 'M'}${PX(p.m).toFixed(1)},${PY(p.g).toFixed(1)}`).join(' '));
        dots.innerHTML = ''; for (const p of pts) svgEl('circle', { cx: PX(p.m), cy: PY(p.g), r: 3, fill: col }, dots);
      };
      draw(view.points.fixed, curveF, dotsF, '#9aa0ad'); draw(view.points.auto, curveA, dotsA, '#2f6fd6');
      setText(lgF, view.points.fixed.length ? '● grey: arteriole fixed' : ''); setText(lgA, view.points.auto.length ? '● blue: arteriole adjusts itself' : '');
    };
    view.update = (dtReal) => {
      const b = body(); if (!(b instanceof Kidney)) return;
      const f = b.f, k = Math.min(0.05, dtReal / 1000);
      // the afferent arteriole is drawn as wide as the model has it
      const wide = clamp(Math.pow(f.arteriole, 1.4), 0.42, 1.45);
      affOut.setAttribute('stroke-width', 7 + 29 * wide); affIn.setAttribute('stroke-width', 29 * wide);
      setText(pArt[2], `${fx(f.map, 0)} mmHg`); setText(pCap, `capillaries: ${fx(f.pgc, 0)} mmHg`); pCap.setAttribute('font-weight', 700);
      const adj = !b.s.autoreg ? ['the afferent arteriole is', 'held at a fixed width'] : f.arteriole < 0.94 ? ['the afferent arteriole', 'has narrowed itself'] : f.arteriole > 1.06 ? ['the afferent arteriole', 'has widened itself'] : ['the afferent arteriole', 'adjusts its own width'];
      setText(artNote, view.showArteriole ? adj[0] : ''); setText(artNote2, view.showArteriole ? adj[1] : '');
      pores.setAttribute('opacity', view.open ? 1 : 0);
      setText(wallNote, view.open ? 'capillaries: pores' : 'capillaries (closed)');
      holes.setAttribute('opacity', b.s.filterDamage > 0 ? 1 : 0);
      const g = f.gfr / 125, haz = view.open ? -Math.log(1 - clamp(0.2 * g, 0, 0.9)) / (lenTuft / 62) : 0;
      for (const p of parts) {
        if (p.st === 'blood') {
          p.s += 62 * p.v * k;
          if (p.s >= lenAll) { p.s = 0; p.lane = Math.random() * 2 - 1; }
          const q = guide.getPointAtLength(p.s), q2 = guide.getPointAtLength(Math.min(lenAll, p.s + 2)), dx = q2.x - q.x, dy = q2.y - q.y, n = Math.hypot(dx, dy) || 1;
          const inTuft = p.s > lenAff && p.s < lenAff + lenTuft, half = (p.s <= lenAff ? 14.5 * wide : 14.5) - (SIZE[p.k] || 3);
          p.nx = -dy / n; p.ny = dx / n;
          p.x = q.x + p.nx * p.lane * Math.max(0, half); p.y = q.y + p.ny * p.lane * Math.max(0, half);
          if (inTuft) {
            const pass = KIND[p.k].small ? 1 : b.s.filterDamage * (p.k === 'alb' ? 0.12 : 0.05);
            if (pass > 0 && Math.random() < haz * pass * k) { p.st = 'out'; p.t = 0; p.dir = p.lane >= 0 ? 1 : -1; p.aim = CY + (Math.random() * 2 - 1) * 50; }
          }
        } else if (p.st === 'out') {
          // through the capillary wall and into the cup
          p.t += k; p.x += p.nx * p.dir * 70 * k; p.y += p.ny * p.dir * 70 * k;
          if (p.t > 0.45) p.st = 'cup';
        } else {
          // across the cup and away down the tubule
          p.x += 34 * k; p.y += (p.aim - p.y) * Math.min(1, 0.9 * k);
          if (p.x > 762) { p.st = 'blood'; p.s = Math.random() * lenAff * 0.5; p.lane = Math.random() * 2 - 1; }
        }
        p.e.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
      setText(gfrT, view.open ? fx(f.gfr, 0) : '0'); setText(gfrU, 'mL every minute'); setText(gfrD, view.open && view.showDay ? `= ${big(f.gfr * 1.44)} L a day` : '');
      setAttrs(now, { cx: PX(clamp(f.map, 40, 200)), cy: PY(f.gfr) });
    };
    view.narrate = () => {
      const b = body(); if (!(b instanceof Kidney)) return null;
      const f = b.f;
      if (!view.open) return { key: 'shut', html: 'Blood comes in by the afferent arteriole, runs through the knot of capillaries inside the cup, and leaves by the efferent arteriole. The capillary walls are closed for now.' };
      const how = !view.showArteriole ? '' : !b.s.autoreg ? ' The afferent arteriole is held at a fixed width, so the pressure in the capillaries follows the pressure in her arteries.' : f.map < 80 ? ' The afferent arteriole is as wide as it can go and the pressure in the capillaries still cannot be held.' : ' The afferent arteriole has adjusted its width, so the pressure in the capillaries has hardly moved.';
      return { key: 'f' + Math.round(f.map) + b.s.autoreg + b.s.filterDamage, html: `Blood pressure pushes fluid out through the pores in the capillary walls and into the cup. Water, salt, glucose and urea pass; red cells and protein are too large${b.s.filterDamage ? ' (but this filter is damaged, and some are getting through)' : ''}. Filtered: <b>${fx(f.gfr, 0)} mL a minute</b>.${how}` };
    };
    return view;
  };

  // =========================================================================
  // The nephron strip
  // =========================================================================
  // opts: {kinds: [...], ledger: [...], names, urineDetail, lastDials, tank, inset, marksAt}
  const LEDGER = {
    water: { name: 'water', unit: 'L', dp: 1, k: 1 },
    na: { name: 'salt', unit: 'g', dp: 0, k: 0.05844 },              // mmol of sodium → grams of table salt
    glucose: { name: 'glucose', unit: 'g', dp: 0, k: 1 },
    urea: { name: 'urea', unit: 'g', dp: 0, k: 1 },
    cr: { name: 'creatinine', unit: 'g', dp: 1, k: 1 },
    alb: { name: 'blood protein', unit: 'g', dp: 1, k: 1 },
    drug: { name: 'penicillin', unit: 'mg', dp: 0, k: 1 },
    k: { name: 'potassium', unit: 'mmol', dp: 0, k: 1 },
  };
  KD.LEDGER = LEDGER;
  views.strip = function (opts) {
    const ledKeys = opts.ledger || [], inset = opts.inset !== false && !opts.short;
    const repY = (ledKeys.length ? 384 + ledKeys.length * 26 : 356) + 14;
    const H = Math.max(inset ? 540 : ledKeys.length ? 372 + 22 + ledKeys.length * 26 : 356, opts.report ? repY + 80 : 0);
    const svg = svgEl('svg', { viewBox: `0 0 1000 ${H}`, role: 'img', 'aria-label': 'One nephron drawn straightened: the filter at the left, the tubule running to the right, the return line above it carrying back what is taken back, and the urine at the right' }, stage);
    const view = { svg, kinds: (opts.kinds || ['water']).slice(), revealed: new Set(opts.revealed || []), names: opts.names !== false };      // each part carries its plain name and its anatomical name, unless a step is testing the names
    const body = () => app.sim;
    const TY = 206, GX = 92, X = [140, 440, 600, 860], RY = 62;         // tubule centre line; filter; segment ends; return line
    const FULL = 46;                                                    // half-height of the stream at 125 mL/min
    // ---- blood: one continuous vessel. In by the afferent arteriole, through the knot of
    // capillaries inside the cup, out by the efferent arteriole, which widens into the return line.
    svgEl('path', { d: `M188,${RY} L944,${RY}`, fill: 'none', stroke: COL.bloodLine, 'stroke-width': 31 }, svg);
    svgEl('path', { d: `M186,${RY} L944,${RY}`, fill: 'none', stroke: COL.blood, 'stroke-width': 26 }, svg);
    drawFilter(svg);
    svgEl('path', { d: `M186,${RY} L200,${RY}`, fill: 'none', stroke: COL.blood, 'stroke-width': 26 }, svg);
    svgEl('path', { d: `M944,${RY - 22} L972,${RY} L944,${RY + 22} Z`, fill: COL.bloodLine }, svg);
    const AFF = G.AFF, TUFT = G.TUFT;
    // unseen guides that the particles follow
    const affPath = svgEl('path', { d: AFF, fill: 'none', stroke: 'none' }, svg), tuft = svgEl('path', { d: TUFT, fill: 'none', stroke: 'none' }, svg);
    const retLine = svgEl('path', { d: `M108,176 C116,120 130,${RY} 190,${RY} L944,${RY}`, fill: 'none', stroke: 'none' }, svg);
    label(svg, 6, 62, 'blood in:', { 'font-size': 13.5, fill: '#8f2620' });
    const affT = label(svg, 6, 78, 'afferent arteriole', { 'font-size': 13, fill: '#8f2620', 'font-weight': 650 }), effT = label(svg, 138, 142, 'efferent arteriole', { 'font-size': 13, fill: '#8f2620', 'font-weight': 650 });
    const retName = label(svg, 560, RY - 22, 'the return line: back to the body', { 'font-size': 13.5, fill: '#8f2620', 'text-anchor': 'middle' });
    // ---- the filter
    const damageG = svgEl('g', { opacity: 0 }, svg);
    for (const [x, y] of [[124, 196], [118, 236]]) svgEl('path', { d: 'M-7,-7 L7,7 M-7,7 L7,-7', stroke: '#b0352b', 'stroke-width': 3, 'stroke-linecap': 'round', transform: `translate(${x},${y})` }, damageG);
    const filtName = label(svg, 78, 296, 'the filter', { 'font-size': 13.5, 'font-weight': 650, fill: '#8f3a2c', 'text-anchor': 'middle' }), filtTerm = small(svg, 78, 313, '', { 'font-size': 12.5, 'text-anchor': 'middle', fill: '#8f3a2c' });
    const faultF = label(svg, 78, 330, '', { 'font-size': 12.5, 'font-weight': 700, fill: '#b0352b', 'text-anchor': 'middle' });
    // ---- the tubule: a ribbon whose width is the flow
    const wall = svgEl('path', { fill: COL.tubule, stroke: COL.tubuleLine, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, svg);
    const stream = svgEl('path', { fill: '#cfe3f6', opacity: 0.95 }, svg);
    const segBars = [], segNames = [], segTerms = [], segNotes = [];
    const SEGS = [['first', 'first stretch', 'proximal convoluted tubule (PCT)'], ['loop', 'the loop', 'nephron loop'], ['last', 'last stretch', 'distal convoluted tubule, then collecting duct']];
    SEGS.forEach(([id, plain, term], i) => {
      const x0 = X[i] + 3, x1 = X[i + 1] - 3, mid = (x0 + x1) / 2;
      segBars.push(svgEl('rect', { x: x0, y: TY + FULL + 14, width: x1 - x0, height: 6, rx: 3, fill: SEG[id] }, svg));
      segNames.push(label(svg, mid, TY + FULL + 38, plain, { 'font-size': 13.5, 'font-weight': 650, 'text-anchor': 'middle', fill: { first: '#8a6a12', loop: '#5e6d2c', last: '#1f6f6c' }[id] }));
      segTerms.push(small(svg, mid, TY + FULL + 55, '', { 'font-size': 12.5, 'text-anchor': 'middle', fill: { first: '#8a6a12', loop: '#5e6d2c', last: '#1f6f6c' }[id] }));
      segNotes.push(label(svg, mid, TY + FULL + (i === 2 ? 89 : 72), '', { 'font-size': 12.5, 'font-weight': 700, 'text-anchor': 'middle', fill: '#b0352b' }));
    });
    const lastW = small(svg, (X[2] + X[3]) / 2, TY + FULL + 72, '', { 'font-size': 12.5, 'text-anchor': 'middle', fill: COL.adh, 'font-weight': 650 });
    // ---- taken back: arrows from the tubule up to the return line, as wide as what they carry
    const backs = [0, 1, 2].map(() => svgEl('path', { fill: '#b9d4ee', stroke: '#7fa9d2', 'stroke-width': 1.2, opacity: 0.9 }, svg));
    const backT = [0, 1, 2].map(() => small(svg, 0, 0, '', { 'font-size': 12.5, fill: '#2f5f8f', 'font-weight': 600 }));
    const backHead = label(svg, 262, 124, 'taken back', { 'font-size': 13.5, 'font-weight': 650, fill: '#2f5f8f', 'text-anchor': 'end' });
    const pushG = svgEl('g', { opacity: 0 }, svg);
    svgEl('path', { d: `M388,${RY + 16} L388,${TY - 36} M380,${TY - 46} L388,${TY - 32} L396,${TY - 46}`, fill: 'none', stroke: COL.drug, 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, pushG);
    label(pushG, 398, 122, 'pushed in', { 'font-size': 13, 'font-weight': 650, fill: COL.drug });
    // ---- flow numbers
    const flowT = [0, 1, 2, 3].map((i) => label(svg, X[i] + (i === 0 ? 12 : 0), 0, '', { 'font-size': 13.5, 'font-weight': 650, 'text-anchor': i === 0 ? 'start' : 'middle' }));
    // ---- the urine
    const cupG = svgEl('g', { transform: `translate(${X[3] + 34},${TY - 6})` }, svg);
    const urFill = svgEl('rect', { x: 2, y: 22, width: 56, height: 46, rx: 3 }, cupG);
    svgEl('path', { d: 'M0,0 L0,62 Q0,70 8,70 L52,70 Q60,70 60,62 L60,0', fill: 'none', stroke: '#8a90a0', 'stroke-width': 2.6 }, cupG);
    const drip = svgEl('circle', { r: 3.4, cx: 8 }, cupG);
    label(svg, X[3] + 64, TY + 84, 'urine', { 'font-size': 14.5, 'font-weight': 650, 'text-anchor': 'middle', fill: '#8a6d00' });
    const urT = [0, 1, 2].map((i) => small(svg, X[3] + 64, TY + 101 + i * 16, '', { 'font-size': 12.5, 'text-anchor': 'middle' }));
    const outlet = svgEl('path', { fill: 'none', stroke: COL.tubuleLine, 'stroke-width': 2.5 }, svg);
    // ---- the plasma she has left (only for the run with nothing taken back)
    const tank = svgEl('g', { transform: 'translate(170,268)', opacity: 0 }, svg);
    // ---- a real nephron, small, with its stretches in the strip's colours
    if (inset) {
      const ig = svgEl('g', {}, svg);
      svgEl('rect', { x: 8, y: 344, width: 150, height: 150, rx: 10, fill: '#fff', stroke: '#d9d6cc' }, ig);
      nephronShape(ig, { x: 16, y: 352, scale: 0.285 });
      small(ig, 83, 510, 'the same nephron,', { 'font-size': 12, 'text-anchor': 'middle' }); small(ig, 83, 524, 'in its real shape', { 'font-size': 12, 'text-anchor': 'middle' });
    }
    // ---- the ledger
    const led = svgEl('g', { transform: `translate(${inset ? 176 : 110},372)` }, svg);
    const LW = [150, 150, 150, 150, 170], LX = LW.map((_, i) => LW.slice(0, i).reduce((a, x) => a + x, 0));
    const ledRows = {};
    if (ledKeys.length) {
      svgEl('rect', { x: -8, y: -18, width: 786, height: 30 + ledKeys.length * 26, rx: 10, fill: '#fff', stroke: '#d9d6cc' }, led);
      ['each day', '1 · filtered', '2 · taken back', '3 · pushed in', 'left in the urine'].forEach((h, i) => label(led, LX[i] + (i ? LW[i] - 14 : 4), 2, h, { 'font-size': 12.5, 'font-weight': 650, fill: COL.muted, 'text-anchor': i ? 'end' : 'start' }));
      ledKeys.forEach((key, r) => {
        const y = 28 + r * 26, g = svgEl('g', {}, led);
        svgEl('path', { d: `M-2,${y - 18} L772,${y - 18}`, stroke: '#eceae3' }, g);
        mark(svgEl('g', { transform: `translate(10,${y - 5})` }, g), key === 'k' ? 'k' : key, 1.2);
        label(g, 26, y, LEDGER[key].name, { 'font-size': 14, 'font-weight': 600 });
        ledRows[key] = [1, 2, 3, 4].map((i) => label(g, LX[i] + LW[i] - 14, y, '', { 'font-size': 14, 'text-anchor': 'end', 'font-weight': i === 4 ? 700 : 400 }));
      });
    }
    // ---- the urine as a test strip and a measuring jug would report it
    let rep = null;
    if (opts.report) {
      rep = svgEl('g', { transform: `translate(${inset ? 168 : 102},${repY})` }, svg);
      label(rep, 2, 8, 'THE URINE, TESTED', { 'font-size': 12, 'font-weight': 700, fill: COL.muted });
      label(rep, 6 * 113 + 2, 8, 'AND THE BLOOD', { 'font-size': 12, 'font-weight': 700, fill: COL.muted });
      rep.cells = ['Volume', 'Colour', 'Concentration', 'Protein', 'Glucose', 'Blood', 'Glucose'].map((nm, i) => {
        const g = svgEl('g', { transform: `translate(${i * 113},16)` }, rep);
        const box = svgEl('rect', { width: 107, height: 50, rx: 8, fill: i === 6 ? '#fbeeec' : '#fff', stroke: '#d9d6cc', 'stroke-width': 1.5 }, g);
        small(g, 53.5, 18, nm, { 'font-size': 12.5, 'text-anchor': 'middle' });
        return { box, val: label(g, 53.5, 39, '', { 'font-size': i === 1 ? 12.5 : 14.5, 'font-weight': 700, 'text-anchor': 'middle' }) };
      });
    }
    // ---- particles
    const pg = svgEl('g', { 'pointer-events': 'none' }, svg);
    const parts = [];
    const RATE = { water: 9, na: 5, glucose: 3.4, urea: 3.4, cr: 3.4, alb: 1.6, drug: 3.4, k: 3.4, rbc: 1.2 };       // particles a second at normal plasma levels
    const marks = numbered(svg, opts.marksAt || []);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);
    view.show = (kinds) => { view.kinds = kinds.slice(); for (const p of parts) if (!view.kinds.includes(p.k)) p.dead = true; };
    view.reveal = (key) => { view.revealed.add(key); };
    view.setNames = (on) => { view.names = !!on; };

    const hw = (frac) => Math.max(1.3, FULL * frac);
    // half-height of the stream at x, from the model's flow at the four places
    function halfAt(x, fr) {
      if (x <= X[0]) return hw(fr[0]);
      for (let i = 0; i < 3; i++) if (x <= X[i + 1]) { const u = (x - X[i]) / (X[i + 1] - X[i]); const e = i === 0 ? 1 - Math.pow(1 - u, 1.6) : u; return hw(fr[i] + (fr[i + 1] - fr[i]) * e); }
      return hw(fr[3]);
    }
    function ribbon(fr, pad) {
      const top = [], bot = [];
      for (let x = X[0]; x <= X[3] + 0.1; x += 10) { const h = halfAt(x, fr) + pad; top.push(`${x},${(TY - h).toFixed(1)}`); bot.push(`${x},${(TY + h).toFixed(1)}`); }
      return `M${top.join(' L')} L${bot.reverse().join(' L')} Z`;
    }
    let acc = {}, dripT = 0;
    view.update = (dtReal) => {
      const b = body(); if (!(b instanceof Kidney)) return;
      const f = b.f, k = Math.min(0.05, dtReal / 1000), g = f.gfr / 125, noBack = !b.s.takeBack;
      const fw = f.frac.water.map(v => v * clamp(g, 0, 1.3));
      wall.setAttribute('d', ribbon(fw, 6)); stream.setAttribute('d', ribbon(fw, 0));
      const hEnd = halfAt(X[3], fw);
      outlet.setAttribute('d', `M${X[3]},${TY - hEnd - 6} L${X[3] + 30},${TY - hEnd - 6} M${X[3]},${TY + hEnd + 6} L${X[3] + 30},${TY + hEnd + 6}`);
      // names
      affT.setAttribute('opacity', view.names ? 1 : 0); effT.setAttribute('opacity', view.names ? 1 : 0);
      setText(filtTerm, view.names ? 'glomerulus + capsule' : ''); SEGS.forEach((s, i) => setText(segTerms[i], view.names ? s[2] : ''));
      setText(retName, view.names ? 'the return line (peritubular capillaries): back to the body' : 'the return line: back to the body');
      // flow at the four places
      const at = [f.gfr, f.gfr * f.frac.water[1], f.gfr * f.frac.water[2], f.urine.flow];
      flowT.forEach((t, i) => { setText(t, i === 0 ? `${flow(at[i])} mL/min filtered` : i === 3 ? '' : `${flow(at[i])}`); t.setAttribute('y', i === 0 ? TY + 5 : TY - halfAt(X[i], fw) - 14); });
      // taken back
      const taken = [at[0] - at[1], at[1] - at[2], at[2] - at[3]];
      [290, 520, 730].forEach((x, i) => {
        const wv = noBack ? 0 : clamp(Math.sqrt(Math.max(0, taken[i])) * 4.2, 0, 44), y0 = TY - halfAt(x, fw) - 8, y1 = RY + 16;
        backs[i].setAttribute('d', wv < 1 ? '' : `M${x - wv / 2},${y0} L${x - wv / 2},${y1 + 12} L${x - wv / 2 - 7},${y1 + 12} L${x},${y1} L${x + wv / 2 + 7},${y1 + 12} L${x + wv / 2},${y1 + 12} L${x + wv / 2},${y0} Z`);
        setAttrs(backT[i], { x: x + wv / 2 + 12, y: (y0 + y1) / 2 + 12 }); setText(backT[i], noBack ? '' : `${flow(taken[i])} mL/min`);
      });
      setText(backHead, noBack ? 'nothing taken back' : 'taken back'); backHead.setAttribute('fill', noBack ? '#b0352b' : '#2f5f8f');
      pushG.setAttribute('opacity', view.kinds.includes('drug') && f.sec.drug > 0 ? 1 : 0);
      // faults
      damageG.setAttribute('opacity', b.s.filterDamage > 0 ? 1 : 0); setText(faultF, b.s.filterDamage > 0 ? 'damaged' : '');
      const blockL = 1 - (1 - b.s.loopBlock) * (1 - b.diureticBlock());
      setText(segNotes[0], noBack ? '' : b.s.glucoseCarrier < 1 ? `glucose carriers ${Math.round(100 * (1 - b.s.glucoseCarrier))} % blocked` : (f.ex.glucose > 0.5 ? 'glucose carriers full' : ''));
      setText(segNotes[1], !noBack && blockL > 0.03 ? `salt carriers ${Math.round(100 * blockL)} % blocked` : '');
      if (opts.lastDials) {
        const wPct = at[2] > 0 ? 100 * (1 - at[3] / at[2]) : 0, naPct = f.reachNa > 0 ? 100 * (1 - f.ex.na / f.reachNa) : 0;
        setText(lastW, `takes back ${fx(wPct, wPct > 99 ? 1 : 0)} % of its water, ${fx(naPct, naPct > 99 ? 1 : 0)} % of its salt`);
      } else setText(lastW, '');
      // the urine
      const u = b.urineReport();
      setAttrs(urFill, { fill: urineColour(u.colour) }); drip.setAttribute('fill', urineColour(Math.max(0.25, u.colour)));
      dripT += k * clamp(f.urine.flow, 0, 30) * 0.7; const ph = dripT % 1;
      setAttrs(drip, { cy: -hEnd + ph * 24, opacity: f.urine.flow > 0.02 ? 1 : 0, cx: 4 });
      setText(urT[0], f.urine.flow > 0.02 ? `${flow(f.urine.flow)} mL/min` : 'almost none');
      setText(urT[1], f.urine.flow > 20 ? '' : `= ${fx(u.perDay, 1)} L a day`);
      setText(urT[2], opts.urineDetail && f.urine.flow > 0.02 && f.urine.flow < 20 ? `${big(Math.round(u.osm / 10) * 10)} mOsm/L · ${colourWord(u.colour)}` : '');
      if (rep) {
        const vals = [`${fx(u.perDay, 1)} L/day`, colourWord(u.colour), `${big(Math.round(u.osm / 10) * 10)} mOsm/L`, u.protein, u.glucose, u.blood, `${big(b.glucose)} mg/dL`];
        const bad = [u.perDay > 3 || u.perDay < 0.5, false, false, u.protein !== 'negative', u.glucose !== 'negative', u.blood !== 'negative', b.glucose > 140];
        rep.cells.forEach((cell, i) => {
          setText(cell.val, vals[i]); cell.val.setAttribute('fill', bad[i] ? '#b0352b' : COL.ink);
          cell.box.setAttribute('stroke', bad[i] ? '#d24b3f' : '#d9d6cc'); if (i === 1) cell.box.setAttribute('fill', urineColour(u.colour));
        });
      }
      // the ledger
      for (const key of ledKeys) {
        const L = b.ledger(key), U = LEDGER[key], shown = view.revealed.has(key), n = (v) => `${v * U.k < 0.05 && U.dp ? '0' : (U.dp ? fx(v * U.k, U.dp) : big(v * U.k))} ${U.unit}`;
        const cells = shown ? [n(L.filtered), n(L.reabsorbed), L.secreted * U.k > 0.05 ? n(L.secreted) : '0', n(L.excreted)] : ['?', '?', '?', '?'];
        if (key === 'alb' && shown && L.filtered < 0.01) { cells[0] = 'none'; cells[1] = '—'; cells[2] = '0'; cells[3] = 'none'; }
        ledRows[key].forEach((t, i) => { setText(t, cells[i]); t.setAttribute('fill', shown ? COL.ink : '#b3ad9b'); });
      }
      // particles: each enters with the blood and meets the three questions
      const plasma = { water: 1, na: b.sodium / 140, glucose: b.glucose / 90, urea: b.bun / 12, cr: b.creatinine / 0.9, alb: 1, drug: b.drug > 0 ? 1 : 0, k: b.potassium / 4.2, rbc: 1 };
      for (const kind of view.kinds) {
        acc[kind] = (acc[kind] || 0) + RATE[kind] * clamp(plasma[kind], 0, 4) * k * (kind === 'rbc' && !b.s.filterDamage ? 0 : 1);
        while (acc[kind] >= 1 && parts.length < 420) {
          acc[kind] -= 1;
          const e = svgEl('g', {}, pg); mark(e, kind, kind === 'rbc' ? 0.55 : kind === 'alb' ? 0.8 : 1);
          parts.push({ k: kind, e, st: 'in', u: 0, lane: Math.random() * 2 - 1, x: 4, y: 96 });
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i], fr = f.frac[p.k] || f.frac.water, sp = 62;
        if (p.st === 'in') {                    // arriving in the blood, then through the filter's capillaries
          p.u += k * 0.9;
          const len = tuft.getTotalLength(), q = p.u < 0.35 ? affPath.getPointAtLength(p.u / 0.35 * affPath.getTotalLength()) : tuft.getPointAtLength(clamp((p.u - 0.35) / 0.65, 0, 1) * len);
          p.x = q.x; p.y = q.y + p.lane * 3;
          if (p.u >= 1) {
            // question 1: did it get through the filter?
            const through = KIND[p.k].small ? 0.2 * clamp(g, 0, 2) : b.s.filterDamage * (p.k === 'alb' ? 0.3 : 0.25);
            if (Math.random() < Math.min(0.9, through)) {
              p.st = 'tube'; p.x = 118; p.lane = Math.random() * 2 - 1;
              // question 2: where, if anywhere, is it taken back?
              p.leave = null;
              for (let s = 0; s < 3 && p.leave == null; s++) { const keep = fr[s] > 1e-9 ? clamp(fr[s + 1] / fr[s], 0, 1) : 0; if (Math.random() > keep) p.leave = X[s] + (0.08 + 0.84 * (s === 0 ? Math.pow(Math.random(), 1.5) : Math.random())) * (X[s + 1] - X[s]); }
              if (noBack) p.leave = null;
            } else {
              p.st = 'ret'; p.u = 0;
              // question 3: is it pushed in from the return line?
              const filtK = f.filt[p.k] || 0, secK = (f.sec[p.k] || 0);
              p.drop = (p.k === 'drug' && filtK > 0 && Math.random() < clamp((secK / filtK) * 0.2 / 0.8, 0, 1)) ? 250 + Math.random() * 150 : null;
            }
          }
        } else if (p.st === 'tube') {
          p.x += sp * k;
          const h = Math.max(0, halfAt(Math.max(p.x, X[0]), fw) - 2.5);
          p.y = TY + p.lane * (p.x < X[0] ? 30 : h);
          if (p.leave != null && p.x >= p.leave) p.st = 'up';
          if (p.x > X[3] + 36) { p.dead = true; }
        } else if (p.st === 'up') {             // carried across to the return line
          p.y -= 90 * k; if (p.y <= RY + p.lane * 8) { p.st = 'ret'; p.u = 1; p.drop = null; }
        } else if (p.st === 'down') {           // pushed from the return line into the tubule
          p.y += 90 * k; if (p.y >= TY + p.lane * 6) { p.st = 'tube'; p.leave = null; }
        } else {                                // in the return line
          if (p.u < 1) { p.u += k * 1.4; const q = retLine.getPointAtLength(clamp(p.u, 0, 1) * 150); p.x = q.x + p.lane * 3; p.y = q.y + p.lane * (2 + 6 * p.u * p.u); if (p.u >= 1) p.x = Math.max(p.x, 190); }
          else { p.x += sp * 1.25 * k; p.y = RY + p.lane * 8; }
          if (p.drop != null && p.x >= p.drop) { p.st = 'down'; p.drop = null; }
          if (p.x > 944) p.dead = true;
        }
        if (p.dead) { p.e.remove(); parts.splice(i, 1); continue; }
        p.e.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
    };
    view.narrate = () => {
      const b = body(); if (!(b instanceof Kidney)) return null;
      const f = b.f, at = [f.gfr, f.gfr * f.frac.water[1], f.gfr * f.frac.water[2], f.urine.flow];
      if (!b.s.takeBack) return { key: 'drain' + Math.round(b.t), html: `Nothing is being taken back. All <b>${fx(f.gfr, 0)} mL</b> filtered each minute is leaving as urine. She has lost <b>${fx(70 - b.weight, 1)} kg</b>; blood pressure <b>${b.bp.sys}/${b.bp.dia}</b>.` };
      if (f.gfr < 3) return { key: 'nogfr', html: 'Almost nothing is being filtered, so almost no urine is being made.' };
      const notes = [];
      if (b.s.filterDamage > 0) notes.push('The damaged filter is letting protein and red cells through; nothing in the tubule takes them back.');
      if (f.ex.glucose > 0.5) notes.push(`The glucose carriers are working at their limit: <b>${fx(f.ex.glucose, 0)} mg</b> of glucose a minute stays in the tubule and holds water with it.`);
      const blockL = 1 - (1 - b.s.loopBlock) * (1 - b.diureticBlock());
      if (blockL > 0.03) notes.push('Salt that the loop would have taken back stays in the tubule and holds water with it.');
      return { key: 's' + Math.round(at[3] * 4) + notes.length + Math.round(f.gfr / 5), html: `<b>${fx(at[0], 0)} mL</b> a minute is filtered. The first stretch takes back ${fx(at[0] - at[1], 0)}, the loop ${fx(at[1] - at[2], 0)}, the last stretch ${fx(at[2] - at[3], at[2] - at[3] < 10 ? 1 : 0)}. What is left, <b>${flow(at[3])} mL</b> a minute, is urine. ${notes.join(' ')}` };
    };
    void tank; void DAY;
    return view;
  };
})();
