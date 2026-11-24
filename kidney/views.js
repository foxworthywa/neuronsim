/* KidneySim views, part 1: the person (ways in, ways out, the blood panel, the dialysis machine),
 * the anatomy, the design bench, and cards of reports. Each view reads the model every frame;
 * nothing here is a canned animation. See docs/KIDNEY_MODULE.md ("Three things stay on screen"). */
(function () {
  'use strict';
  const { app, views, COL, $, clamp, htmlEl, svgEl, setAttrs, fx, signed, flow, big, clockTime, urineColour, colourWord } = KD;
  const { Kidney, Bench, BENCH, HOUR, DAY, SALT } = KidneySim;
  const stage = $('#stage');
  const label = (parent, x, y, text, o) => svgEl('text', Object.assign({ x, y, 'font-size': 16, fill: COL.ink, text }, o || {}), parent);
  const small = (parent, x, y, text, o) => label(parent, x, y, text, Object.assign({ 'font-size': 14, fill: COL.muted }, o || {}));
  const SEG = { filter: '#c96a5a', first: '#d3a743', loop: '#8fa04e', last: '#3f9f9b', ret: '#c9837b' };

  // Numbered markers for a "how to read this picture" step. list: [[x, y], ...]
  function numbered(parent, list) {
    const g = svgEl('g', { opacity: 0, 'pointer-events': 'none' }, parent);
    list.forEach(([x, y], i) => {
      svgEl('circle', { cx: x, cy: y, r: 13, fill: '#f0b429', stroke: '#fff', 'stroke-width': 2 }, g);
      svgEl('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 15.5, 'font-weight': 700, fill: '#1f2430', text: String(i + 1) }, g);
    });
    return g;
  }
  // Make an SVG element act as a button for mouse and keyboard.
  function clickable(el, name, fn) {
    setAttrs(el, { tabindex: 0, role: 'button', 'aria-label': name, style: 'cursor:pointer' });
    el.addEventListener('click', fn);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }
  function arrowHead(svg, id, color) {
    let defs = svg.querySelector('defs'); if (!defs) defs = svgEl('defs', {}, svg);
    const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 4.2, markerHeight: 4.2, orient: 'auto' }, defs);
    svgEl('path', { d: 'M0,0 L10,5 L0,10 Z', fill: color }, m);
    return `url(#${id})`;
  }
  // A kidney-shaped outline with its notch (the hilum) facing right; flip with a negative w.
  function bean(w, h) {
    return `M0,${-h} C${-w * 1.15},${-h} ${-w * 1.15},${h} 0,${h} C${w * 0.95},${h} ${w * 0.8},${h * 0.38} ${w * 0.38},${h * 0.2} C${w * 0.14},${h * 0.09} ${w * 0.14},${-h * 0.09} ${w * 0.38},${-h * 0.2} C${w * 0.8},${-h * 0.38} ${w * 0.95},${-h} 0,${-h} Z`;
  }

  // ---------------------------------------------------------------- gauges (the blood panel)
  const GAUGES = {
    weight: { label: 'Weight', unit: 'kg', dp: 1, get: (b) => b.weight, range: (b) => [b.weight0 - 1.5, b.weight0 + 3.5], band: (b) => [b.weight0 - 0.5, b.weight0 + 0.5], bandName: 'his target weight' },
    water: { label: 'Water in the body', unit: 'L', dp: 2, signed: true, get: (b) => b.waterExcess, range: () => [-1.5, 1.5], band: () => [-0.75, 0.75], note: 'compared with normal (42 L)' },
    salt: { label: 'Salt in the body', unit: 'g', dp: 1, signed: true, get: (b) => b.saltExcess, range: () => [-6, 6], band: () => [-3, 3], note: 'compared with normal' },
    osm: { label: 'Concentration of the blood', unit: 'mOsm/L', dp: 0, get: (b) => b.osmolarity, range: () => [275, 305], band: () => [285, 295] },
    na: { label: 'Sodium', unit: 'mmol/L', dp: 0, get: (b) => b.sodium, range: () => [128, 152], band: () => [135, 145] },
    k: { label: 'Potassium', unit: 'mmol/L', dp: 1, get: (b) => b.potassium, range: () => [3, 6.5], band: () => [3.5, 5.0] },
    bun: { label: 'Urea (BUN)', unit: 'mg/dL', dp: 0, get: (b) => b.bun, range: () => [0, 80], band: () => [7, 20] },
    cr: { label: 'Creatinine', unit: 'mg/dL', dp: 1, get: (b) => b.creatinine, range: () => [0, 8], band: () => [0.6, 1.2] },
  };
  function gauge(parent, x, y, w, key) {
    const G = GAUGES[key], g = svgEl('g', { transform: `translate(${x},${y})` }, parent);
    label(g, 0, 0, G.label, { 'font-size': 14.5, 'font-weight': 650 });
    const val = label(g, w, 0, '', { 'text-anchor': 'end', 'font-size': 17, 'font-weight': 700 });
    svgEl('rect', { x: 0, y: 9, width: w, height: 13, rx: 6.5, fill: '#e9e6dc' }, g);
    const band = svgEl('rect', { y: 9, height: 13, fill: '#a9d8b9' }, g);
    const ptr = svgEl('path', { d: 'M0,5 L-6,-5 L6,-5 Z', fill: COL.ink }, g);
    const line = svgEl('rect', { y: 7, width: 2.4, height: 17, fill: COL.ink }, g);
    const note = small(g, 0, 38, '', { 'font-size': 13 });
    const flagT = small(g, w, 38, '', { 'font-size': 13, 'text-anchor': 'end', 'font-weight': 700 });
    return (b) => {
      const v = G.get(b), [lo, hi] = G.range(b), [b0, b1] = G.band(b);
      const X = (u) => clamp((u - lo) / (hi - lo), 0, 1) * w;
      setAttrs(band, { x: X(b0), width: Math.max(2, X(b1) - X(b0)) });
      ptr.setAttribute('transform', `translate(${X(v)},3)`); line.setAttribute('x', X(v) - 1.2);
      const txt = `${G.signed ? signed(v, G.dp) : fx(v, G.dp)} ${G.unit}`;
      if (val.textContent !== txt) val.textContent = txt;
      const rounded = +v.toFixed(G.dp), st = rounded < +b0.toFixed(G.dp) ? 'LOW' : rounded > +b1.toFixed(G.dp) ? 'HIGH' : '';
      const nt = G.note || `normal ${fx(b0, G.dp)}–${fx(b1, G.dp)}${G.bandName ? ' (' + G.bandName + ')' : ''}`;
      if (note.textContent !== nt) note.textContent = nt;
      if (flagT.textContent !== st) { flagT.textContent = st; flagT.setAttribute('fill', st ? '#b0352b' : COL.muted); val.setAttribute('fill', st ? '#b0352b' : COL.ink); }
    };
  }

  // =========================================================================
  // The person: what goes in, the ways out, and the blood panel
  // =========================================================================
  // opts: {gauges: [...], machine, marksAt, who}
  views.person = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 450', role: 'img', 'aria-label': 'A person: what goes in at the mouth, the ways out (lungs and skin, gut, kidneys), and measurements of the blood' }, stage);
    const head = arrowHead(svg, 'ar-in', '#4b5563'), headOut = arrowHead(svg, 'ar-out', '#6b7280'), headU = arrowHead(svg, 'ar-u', '#b08900');
    const view = { svg };
    const body = () => app.sim;
    // ---------------- the figure (drawn in its own 500 × 500 box, then placed)
    const fig = svgEl('g', { transform: 'translate(62,6) scale(0.87)' }, svg);
    const FX = (x) => 62 + 0.87 * x, FY = (y) => 6 + 0.87 * y;
    const skin = { fill: COL.skin, stroke: COL.skinLine, 'stroke-width': 2, 'stroke-linejoin': 'round' };
    svgEl('path', Object.assign({ d: 'M204,330 L246,330 L243,470 Q243,480 233,480 L219,480 Q210,480 210,470 Z' }, skin), fig);
    svgEl('path', Object.assign({ d: 'M254,330 L296,330 L290,470 Q290,480 281,480 L267,480 Q257,480 257,470 Z' }, skin), fig);
    svgEl('path', Object.assign({ d: 'M198,118 Q172,120 166,150 L150,262 Q148,276 160,278 Q171,279 173,266 L192,170 Z' }, skin), fig);
    svgEl('path', Object.assign({ d: 'M302,118 Q328,120 334,150 L350,262 Q352,276 340,278 Q329,279 327,266 L308,170 Z' }, skin), fig);
    svgEl('path', Object.assign({ d: 'M196,114 Q250,100 304,114 Q312,180 310,250 Q310,320 300,338 L200,338 Q190,320 190,250 Q188,180 196,114 Z' }, skin), fig);
    svgEl('rect', Object.assign({ x: 238, y: 88, width: 24, height: 22 }, skin), fig);
    svgEl('circle', Object.assign({ cx: 250, cy: 62, r: 31 }, skin), fig);
    svgEl('path', { d: 'M222,70 Q228,76 236,72', fill: 'none', stroke: '#9c7a5b', 'stroke-width': 2, 'stroke-linecap': 'round' }, fig);   // the mouth, on the side food comes from
    // kidneys, ureters and bladder inside the trunk
    const kidL = svgEl('path', { d: bean(15, 25), transform: 'translate(222,226)', stroke: COL.kidneyDark, 'stroke-width': 1.6 }, fig);
    const kidR = svgEl('path', { d: bean(-15, 25), transform: 'translate(278,220)', stroke: COL.kidneyDark, 'stroke-width': 1.6 }, fig);
    const ureters = svgEl('path', { d: 'M228,232 Q236,280 244,306 M272,226 Q264,280 256,306', fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' }, fig);
    const bladder = svgEl('ellipse', { cx: 250, cy: 314, rx: 19, ry: 13, stroke: '#b08900', 'stroke-width': 1.5 }, fig);
    const kidNote = label(svg, FX(250), FY(186), '', { 'text-anchor': 'middle', 'font-size': 13.5, 'font-weight': 700 });
    // ---------------- the way in
    label(svg, 14, 34, 'IN', { 'font-size': 16, 'font-weight': 700 }); small(svg, 44, 34, 'what is eaten and drunk', { 'font-size': 14 });
    svgEl('path', { d: `M16,${FY(70)} L${FX(212)},${FY(70)}`, stroke: '#4b5563', 'stroke-width': 5, 'marker-end': head, 'stroke-linecap': 'round' }, svg);
    const gutT = small(svg, 14, 96, '', { 'font-size': 13.5 }), gutT2 = label(svg, 14, 114, '', { 'font-size': 13.5, 'font-weight': 600 }), gutT3 = label(svg, 14, 131, '', { 'font-size': 13.5, 'font-weight': 600 });
    small(svg, 14, 160, 'and made by the body:', { 'font-size': 13.5 }); small(svg, 14, 177, 'urea, other wastes', { 'font-size': 13.5 });
    // ---------------- the ways out
    const OX = 398;
    label(svg, OX, 34, 'OUT', { 'font-size': 16, 'font-weight': 700 });
    const outSkin = svgEl('path', { d: `M${FX(314)},${FY(140)} L${OX - 14},88`, stroke: '#6b7280', 'marker-end': headOut, 'stroke-linecap': 'round', fill: 'none' }, svg);
    const skinT = label(svg, OX, 84, 'lungs and skin', { 'font-size': 15, 'font-weight': 650 }), skinT2 = small(svg, OX, 102, '', { 'font-size': 13.5 }), skinT3 = small(svg, OX, 119, '', { 'font-size': 13, 'font-style': 'italic' });
    svgEl('path', { d: `M${FX(312)},${FY(286)} L${OX - 14},196`, stroke: '#6b7280', 'stroke-width': 1.5, 'marker-end': headOut, 'stroke-linecap': 'round', fill: 'none' }, svg);
    label(svg, OX, 190, 'gut', { 'font-size': 15, 'font-weight': 650 }); small(svg, OX, 208, 'a little water, potassium', { 'font-size': 13.5 }); small(svg, OX, 225, 'set by digestion', { 'font-size': 13, 'font-style': 'italic' });
    const outKid = svgEl('path', { d: `M${FX(250)},${FY(328)} Q${FX(250)},${FY(392)} ${OX - 40},332 L${OX - 12},326`, stroke: '#b08900', 'marker-end': headU, 'stroke-linecap': 'round', fill: 'none' }, svg);
    label(svg, OX, 288, 'kidneys', { 'font-size': 15, 'font-weight': 650 });
    const kidT2 = label(svg, OX + 66, 322, '', { 'font-size': 14, 'font-weight': 650 }), kidT3 = small(svg, OX + 66, 340, '', { 'font-size': 13.5 }), kidT4 = small(svg, OX + 66, 357, '', { 'font-size': 13, 'font-style': 'italic' });
    // the jug of urine collected in this run
    const jug = svgEl('g', { transform: `translate(${OX},300)` }, svg);
    const jugFill = svgEl('rect', { x: 2, width: 52, rx: 3, y: 70, height: 0 }, jug);
    svgEl('path', { d: 'M0,0 L0,66 Q0,72 6,72 L50,72 Q56,72 56,66 L56,0', fill: 'none', stroke: '#8a90a0', 'stroke-width': 2.4 }, jug);
    for (const y of [49, 26]) svgEl('path', { d: `M56,${y} L48,${y}`, stroke: '#8a90a0', 'stroke-width': 1.5 }, jug);
    const jugT = small(svg, OX, 392, '', { 'font-size': 13.5 });
    // ---------------- the dialysis machine
    let mach = null;
    if (opts.machine) {
      mach = svgEl('g', {}, svg);
      svgEl('rect', { x: 10, y: 196, width: 124, height: 148, rx: 10, fill: COL.machine, stroke: COL.machineLine, 'stroke-width': 2 }, mach);
      label(mach, 72, 216, 'dialysis machine', { 'font-size': 13.5, 'text-anchor': 'middle', 'font-weight': 650, fill: '#45536b' });
      // the filter: blood runs down one side of a membrane, cleaning fluid up the other
      svgEl('rect', { x: 46, y: 226, width: 24, height: 86, rx: 4, fill: '#f6dcd8', stroke: COL.bloodLine, 'stroke-width': 1.5 }, mach);
      svgEl('rect', { x: 72, y: 226, width: 24, height: 86, rx: 4, fill: '#e3effa', stroke: '#8fb4da', 'stroke-width': 1.5 }, mach);
      svgEl('path', { d: 'M71,228 L71,310', stroke: '#45536b', 'stroke-width': 1.6, 'stroke-dasharray': '2 3' }, mach);
      small(mach, 72, 332, 'filter', { 'font-size': 13, 'text-anchor': 'middle' });
      mach.out = svgEl('path', { d: `M${FX(160)},${FY(250)} Q150,170 90,178 Q58,184 58,226`, fill: 'none', stroke: COL.bloodDark, 'stroke-width': 4, 'stroke-linecap': 'round' }, mach);
      mach.back = svgEl('path', { d: `M58,312 Q58,372 120,372 Q176,372 ${FX(164)},${FY(268)}`, fill: 'none', stroke: COL.bloodDark, 'stroke-width': 4, 'stroke-linecap': 'round' }, mach);
      mach.waste = svgEl('path', { d: 'M84,312 L84,392', fill: 'none', stroke: '#8fb4da', 'stroke-width': 4, 'stroke-linecap': 'round' }, mach);
      svgEl('path', { d: 'M68,392 L100,392 L96,424 L72,424 Z', fill: '#f2e7b4', stroke: '#b08900', 'stroke-width': 1.5 }, mach);
      small(mach, 106, 414, 'used fluid', { 'font-size': 13 });
      small(mach, 96, 168, 'blood out', { 'font-size': 13 }); small(mach, 122, 390, 'blood back', { 'font-size': 13 });
      mach.status = label(mach, 14, 444, '', { 'font-size': 13.5, 'font-weight': 650 });
      mach.dots = [];
      for (let i = 0; i < 14; i++) mach.dots.push({ e: svgEl('circle', { r: 2.6, fill: '#fff', opacity: 0.9 }, mach), u: i / 14 });
    }
    // ---------------- the blood panel
    const PX = 636, PW = 352, n = opts.gauges.length, panelH = 40 + 60 * n + (opts.bp ? 26 : 0);
    svgEl('rect', { x: PX - 14, y: 12, width: PW + 28, height: panelH, rx: 12, fill: '#fff', stroke: '#d9d6cc' }, svg);
    label(svg, PX, 36, opts.panelTitle || 'The blood panel', { 'font-size': 15.5, 'font-weight': 650 });
    const upd = opts.gauges.map((k, i) => gauge(svg, PX, 66 + 60 * i, PW, k));
    const bpT = opts.bp ? label(svg, PX, 66 + 60 * n + 2, '', { 'font-size': 15, 'font-weight': 650 }) : null;
    // ---------------- what is coming up
    const upG = svgEl('g', {}, svg), upY = 12 + panelH + 12;
    svgEl('rect', { x: PX - 14, y: upY, width: PW + 28, height: Math.min(112, 438 - upY), rx: 12, fill: '#fbfaf6', stroke: '#d9d6cc' }, upG);
    const upHead = label(upG, PX, upY + 22, '', { 'font-size': 13, 'font-weight': 700, fill: COL.muted });
    const upLines = [];
    for (let i = 0; i < 4; i++) upLines.push(label(upG, PX, upY + 42 + i * 20, '', { 'font-size': 13.5, opacity: upY + 42 + i * 20 < 436 ? 1 : 0 }));
    const marks = numbered(svg, opts.marksAt || []);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);

    let dotT = 0;
    view.update = (dtReal) => {
      const b = body(); if (!(b instanceof Kidney)) return;
      const f = b.f, works = b.s.nephrons > 0, hand = !!b.manualExit;
      const kcol = works ? COL.kidney : '#c9c5bb';
      kidL.setAttribute('fill', kcol); kidR.setAttribute('fill', kcol);
      const u = b.urineReport();
      ureters.setAttribute('stroke', works ? '#d9b54a' : '#c9c5bb'); bladder.setAttribute('fill', works ? urineColour(u.colour) : '#e4e1d8');
      const kn = works ? '' : 'not working';
      if (kidNote.textContent !== kn) { kidNote.textContent = kn; kidNote.setAttribute('fill', '#8a3d32'); }
      // in
      const g = b.gut, parts = [];
      if (g.water > 15) parts.push(`${big(g.water)} mL water`); if (g.na > 1.5) parts.push(`${fx(g.na / SALT, 1)} g salt`); if (g.k > 1) parts.push(`${big(g.k)} mmol K⁺`);
      const t1 = parts.length ? 'In the gut, being absorbed:' : (b.steady ? 'arriving evenly today' : 'Nothing in the gut just now');
      if (gutT.textContent !== t1) gutT.textContent = t1;
      const t2 = parts.slice(0, 1).join(''), t3 = parts.slice(1).join(' · ');
      if (gutT2.textContent !== t2) gutT2.textContent = t2; if (gutT3.textContent !== t3) gutT3.textContent = t3;
      // out: lungs and skin, and sweat
      const sweat = b.sweat ? b.sweat.rate : 0, skinRate = b.p.insensible + sweat;
      outSkin.setAttribute('stroke-width', clamp(1.5 + skinRate * 0.9, 1.5, 18));
      const st = sweat ? 'sweat' : 'lungs and skin'; if (skinT.textContent !== st) skinT.textContent = st;
      const s2 = sweat ? `water ${flow(skinRate)} mL/min, and salt` : `water ${flow(skinRate)} mL/min`; if (skinT2.textContent !== s2) skinT2.textContent = s2;
      const s3 = sweat ? 'set by body heat' : 'set by breathing, body heat'; if (skinT3.textContent !== s3) skinT3.textContent = s3;
      // out: the kidneys
      outKid.setAttribute('stroke-width', works ? clamp(1.2 + f.urine.flow * 1.5, 1.2, 18) : 0.01);
      outKid.setAttribute('opacity', works && f.urine.flow > 0.01 ? 1 : 0.15);
      const k2 = works ? `urine ${flow(f.urine.flow)} mL/min` : 'no urine';
      if (kidT2.textContent !== k2) kidT2.textContent = k2;
      const k3 = works ? `salt ${fx(f.ex.na * 60 / SALT, 2)} g/h · ${colourWord(u.colour)}` : '';
      if (kidT3.textContent !== k3) kidT3.textContent = k3;
      const k4 = hand ? 'set by YOU' : works ? 'set by what the blood needs' : '';
      if (kidT4.textContent !== k4) { kidT4.textContent = k4; kidT4.setAttribute('fill', hand ? '#1f4f9e' : COL.muted); kidT4.setAttribute('font-weight', hand ? 700 : 400); }
      const made = b.cum.urine - (view.urine0 || 0), fill = clamp(made / 3000, 0, 1) * 68;
      setAttrs(jugFill, { y: 70 - fill, height: fill, fill: urineColour(u.colour) });
      const jt = works ? `${fx(made / 1000, 2)} L of urine so far` : '';
      if (jugT.textContent !== jt) jugT.textContent = jt;
      upd.forEach(fn => fn(b));
      if (bpT) { const p = b.bp, t = `Blood pressure ${p.sys}/${p.dia} mmHg`; if (bpT.textContent !== t) bpT.textContent = t; }
      // coming up
      const next = (b.script || []).filter(e => !e.done).slice(0, 4);
      const hd = next.length ? 'COMING UP' : (b.script && b.script.length ? 'NOTHING MORE COMING UP' : '');
      if (upHead.textContent !== hd) upHead.textContent = hd;
      upG.setAttribute('opacity', b.script && b.script.length ? 1 : 0);
      upLines.forEach((ln, i) => {
        const e = next[i]; let t = '';
        if (e) { const a = []; if (e.take) { if (e.take.water) a.push(`${e.take.water} mL`); if (e.take.salt) a.push(`${e.take.salt} g salt`); } if (e.lose) a.push(`${(e.lose.sweat / 1000).toFixed(1)} L of sweat`); t = `${clockTime(e.at, app.days)}  ${e.label}${a.length ? ' (' + a.join(', ') + ')' : ''}`; }
        if (t.length > 50) t = t.slice(0, 49) + '…';
        if (ln.textContent !== t) ln.textContent = t;
      });
      // the machine
      if (mach) {
        const on = !!b.dialysis; dotT += dtReal / 1000 * (on ? 0.35 : 0);
        const ms = on ? `running: ${fx(b.dialysis.removed / 1000, 1)} L drawn off` : view.machineNote || 'not connected';
        if (mach.status.textContent !== ms) mach.status.textContent = ms;
        mach.status.setAttribute('fill', on ? '#1e7a45' : COL.muted);
        for (const p of [mach.out, mach.back, mach.waste]) p.setAttribute('opacity', on ? 1 : 0.25);
        mach.dots.forEach((d) => {
          const uu = (d.u + dotT) % 1, path = uu < 0.5 ? mach.out : mach.back, len = path.getTotalLength(), pt = path.getPointAtLength((uu < 0.5 ? uu * 2 : (uu - 0.5) * 2) * len);
          setAttrs(d.e, { cx: pt.x, cy: pt.y, opacity: on ? 0.9 : 0 });
        });
      }
    };
    view.narrate = () => {
      const b = body(); if (!(b instanceof Kidney)) return null;
      const now = clockTime(Math.round(b.t), app.days), f = b.f;
      if (b.dialysis) return { key: 'dial', html: `<b>${now}.</b> His blood is running past the machine's filter. Urea and potassium cross into the cleaning fluid, and <b>${fx(b.dialysis.removed / 1000, 1)} L</b> of water and salt has been drawn off so far. Weight <b>${fx(b.weight, 1)} kg</b>, potassium <b>${fx(b.potassium, 1)}</b>, urea (BUN) <b>${fx(b.bun, 0)}</b>.` };
      if (b.s.nephrons === 0) {
        const up = b.weight - b.weight0;
        return { key: 'anuric' + Math.round(up * 2), html: `<b>${now}.</b> Everything he eats and drinks is absorbed as usual. Lungs, skin and gut lose about a litre of water a day and almost none of the rest. He is <b>${signed(up, 1)} kg</b> from his target weight; potassium <b>${fx(b.potassium, 1)} mmol/L</b>; urea (BUN) <b>${fx(b.bun, 0)} mg/dL</b>.` };
      }
      const w = b.waterExcess, s = b.saltExcess;
      const wS = Math.abs(w) <= 0.75 ? 'in range' : w > 0 ? '<b>too much</b>' : '<b>too little</b>', sS = Math.abs(s) <= 3 ? 'in range' : s > 0 ? '<b>too much</b>' : '<b>too little</b>';
      const doing = b.sweat ? ` She is sweating ${flow(b.sweat.rate)} mL a minute.` : (b.gut.water > 40 ? ` ${big(b.gut.water)} mL of water is still being absorbed.` : '');
      const who = b.manualExit ? 'You are letting out' : 'Her kidneys are letting out';
      return { key: 'p' + wS + sS + !!b.sweat + (b.gut.water > 40) + !!b.manualExit, html: `<b>${now}.</b>${doing} Water in her body: ${signed(w, 2)} L (${wS}). Salt: ${signed(s, 1)} g (${sS}). ${who} <b>${flow(f.urine.flow)} mL</b> of water a minute and <b>${fx(f.ex.na * 60 / SALT, 2)} g</b> of salt an hour.` };
    };
    return view;
  };

  // =========================================================================
  // Anatomy: the kidneys in the body, one kidney cut open, one nephron
  // =========================================================================
  // The shape of a real nephron, with its parts as separate paths so each can be coloured and named.
  // Drawn in a 560 × 520 box; used large in scene 3 and small beside the strip.
  function nephronShape(parent, o) {
    o = o || {};
    const g = svgEl('g', { transform: `translate(${o.x || 0},${o.y || 0}) scale(${o.scale || 1})` }, parent);
    const tube = (d, col, name) => {
      const grp = svgEl('g', {}, g);
      svgEl('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': 22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0 }, grp);
      const outer = svgEl('path', { d, fill: 'none', stroke: col, 'stroke-width': 17, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, grp);
      svgEl('path', { d, fill: 'none', stroke: '#fff7df', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, grp);
      grp.outer = outer; grp.name = name;
      return grp;
    };
    const parts = {};
    // the second set of capillaries, wrapped round the tubule (drawn first, behind it)
    parts.ret = svgEl('path', { d: 'M96,128 C60,150 70,200 120,196 C170,192 150,110 210,104 C262,100 250,170 300,176 C342,180 332,120 372,150 C388,170 350,196 352,230 L352,430 C352,470 300,470 300,430 L300,250 C300,222 322,210 344,196 C380,176 392,120 432,120 C452,122 458,150 470,170', fill: 'none', stroke: SEG.ret, 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-dasharray': o.plain ? null : '1 0' }, g);
    parts.vein = svgEl('path', { d: 'M470,170 Q500,200 520,150', fill: 'none', stroke: '#b98a94', 'stroke-width': 6, 'stroke-linecap': 'round' }, g);
    // the tubule
    parts.first = tube('M150,104 C190,60 220,150 250,112 C280,74 300,160 322,150 C340,142 326,196 326,220', SEG.first, 'first');
    parts.loop = tube('M326,220 L326,440 C326,472 378,472 378,440 L378,250', SEG.loop, 'loop');
    parts.last = tube('M378,250 C378,214 410,214 410,186 C410,150 446,146 452,176 L452,470', SEG.last, 'last');
    // the filter: a knot of capillaries inside a cup
    parts.filter = svgEl('g', {}, g);
    svgEl('path', { d: 'M96,60 A48,48 0 1,0 150,104', fill: '#fff7df', stroke: SEG.filter, 'stroke-width': 6, 'stroke-linecap': 'round' }, parts.filter);
    svgEl('path', { d: 'M40,40 L82,74 C60,96 84,128 104,112 C124,96 96,78 112,66 C132,54 150,84 128,106 C112,124 92,130 96,128', fill: 'none', stroke: COL.bloodDark, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, parts.filter);
    parts.artery = svgEl('path', { d: 'M12,18 L40,40', fill: 'none', stroke: COL.bloodDark, 'stroke-width': 8, 'stroke-linecap': 'round' }, g);
    g.parts = parts;
    return g;
  }
  KD.nephronShape = nephronShape; KD.SEG = SEG; KD.numbered = numbered;

  views.anatomy = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'Where the kidneys are, what is inside one, and one nephron' }, stage);
    const view = { svg, onPart: null };
    const slides = [0, 1, 2].map(() => svgEl('g', { opacity: 0, 'pointer-events': 'none' }, svg));
    const hi = {}, names = [];
    const part = (g, id, name, el) => { clickable(el, name, () => view.onPart && view.onPart(id)); (hi[id] = hi[id] || []).push(el); el.dataset.part = id; return el; };
    const nameT = (g, x, y, text, o) => { const t = label(g, x, y, text, Object.assign({ 'font-size': 15, opacity: 0 }, o || {})); names.push(t); return t; };

    // ---- slide 0: the trunk seen from the front, with the organs in front of the kidneys removed
    {
      const g = slides[0];
      svgEl('path', { d: 'M330,40 Q500,10 670,40 Q700,200 690,330 Q680,470 640,540 L360,540 Q320,470 310,330 Q300,200 330,40 Z', fill: COL.skin, stroke: COL.skinLine, 'stroke-width': 2.5 }, g);
      svgEl('path', { d: 'M338,150 Q500,90 662,150', fill: 'none', stroke: '#c9a983', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, g);
      small(g, 588, 116, 'diaphragm', { 'font-size': 13 });
      for (const y of [176, 214, 252, 290, 328, 366, 404, 442]) svgEl('rect', { x: 478, y, width: 44, height: 30, rx: 6, fill: '#f6efe2', stroke: '#d8c9ae' }, g);       // backbone
      const aorta = part(g, 'aorta', 'A large artery running down the middle of the trunk', svgEl('path', { d: 'M512,60 L512,424', fill: 'none', stroke: COL.bloodDark, 'stroke-width': 13, 'stroke-linecap': 'round' }, g));
      const ivc = part(g, 'ivc', 'A large vein running up the middle of the trunk', svgEl('path', { d: 'M487,60 L487,424', fill: 'none', stroke: '#8e5a78', 'stroke-width': 13, 'stroke-linecap': 'round' }, g));
      void aorta; void ivc;
      // kidneys (the person's right kidney is on the viewer's left, and a little lower)
      part(g, 'kidney', 'The right kidney', svgEl('path', { d: bean(46, 74), transform: 'translate(398,262)', fill: COL.kidney, stroke: COL.kidneyDark, 'stroke-width': 2.5 }, g));
      part(g, 'kidney', 'The left kidney', svgEl('path', { d: bean(-46, 74), transform: 'translate(604,246)', fill: COL.kidney, stroke: COL.kidneyDark, 'stroke-width': 2.5 }, g));
      svgEl('path', { d: 'M388,176 q14,-22 30,0 z', fill: '#e2c07a', stroke: '#a8863a', 'stroke-width': 1.5 }, g); svgEl('path', { d: 'M586,160 q14,-22 30,0 z', fill: '#e2c07a', stroke: '#a8863a', 'stroke-width': 1.5 }, g);
      small(g, 380, 164, 'adrenal gland', { 'text-anchor': 'end', 'font-size': 12.5 });
      for (const [d, id, name, col, w] of [
        ['M506,236 L424,252', 'artery', 'A vessel from the large artery to the right kidney', COL.bloodDark, 9], ['M518,222 L580,236', 'artery', 'A vessel from the large artery to the left kidney', COL.bloodDark, 9],
        ['M420,272 L486,262', 'vein', 'A vessel from the right kidney to the large vein', '#8e5a78', 9], ['M582,258 L492,250', 'vein', 'A vessel from the left kidney to the large vein', '#8e5a78', 9],
        ['M418,284 Q444,380 474,468', 'ureter', 'A tube from the right kidney down to the pelvis', '#d9b54a', 7], ['M586,270 Q560,380 528,468', 'ureter', 'A tube from the left kidney down to the pelvis', '#d9b54a', 7],
      ]) part(g, id, name, svgEl('path', { d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round' }, g));
      part(g, 'bladder', 'A hollow organ low in the pelvis', svgEl('path', { d: 'M462,470 Q500,440 540,470 Q552,512 500,524 Q450,512 462,470 Z', fill: '#f3dc86', stroke: '#b08900', 'stroke-width': 2.5 }, g));
      svgEl('path', { d: 'M500,524 L500,548', stroke: '#b08900', 'stroke-width': 5, 'stroke-linecap': 'round' }, g);
      nameT(g, 300, 236, 'renal artery', { 'text-anchor': 'end', fill: '#8f2620' }); nameT(g, 300, 276, 'renal vein', { 'text-anchor': 'end', fill: '#6d3f5b' });
      nameT(g, 300, 380, 'ureter', { 'text-anchor': 'end', fill: '#8a6d00' }); nameT(g, 300, 500, 'urinary bladder', { 'text-anchor': 'end', fill: '#8a6d00' });
      nameT(g, 700, 250, 'kidney', { fill: COL.kidneyDark }); nameT(g, 556, 60, 'aorta', { fill: '#8f2620', 'font-size': 13.5 }); nameT(g, 446, 60, 'vena cava', { fill: '#6d3f5b', 'font-size': 13.5, 'text-anchor': 'end' });
      nameT(g, 560, 548, 'urethra', { fill: '#8a6d00', 'font-size': 13.5 });
      small(g, 30, 40, 'The trunk from the front, with the', { 'font-size': 13.5 }); small(g, 30, 58, 'gut and liver taken away. The', { 'font-size': 13.5 }); small(g, 30, 76, 'kidneys lie against the back wall,', { 'font-size': 13.5 }); small(g, 30, 94, 'under the lowest ribs.', { 'font-size': 13.5 });
      const fl = svgEl('g', {}, g);
      view.flowT = [label(fl, 716, 120, '', { 'font-size': 15, 'font-weight': 650 }), small(fl, 716, 140, '', { 'font-size': 13.5 }), small(fl, 716, 158, '', { 'font-size': 13.5 })];
    }
    // ---- slide 1: one kidney cut open
    {
      const g = slides[1], cx = 380, cy = 280;
      svgEl('path', { d: bean(210, 250), transform: `translate(${cx},${cy})`, fill: COL.cortex, stroke: COL.kidneyDark, 'stroke-width': 4 }, g);
      // the inner part: cone-shaped blocks pointing at the hollow in the middle
      const sinus = [cx + 70, cy];
      const angles = [100, 136, 172, 208, 244, 268].map(a => a * Math.PI / 180);
      const calyx = [];
      angles.forEach((a) => {
        const R1 = 150 + 30 * Math.abs(Math.sin(a)), R0 = 62, sp = 0.24;
        const bx = (r, d) => [cx + 20 + r * Math.cos(a + d) * 1.0, cy - r * Math.sin(a + d) * 1.18];
        const p1 = bx(R1, sp), p2 = bx(R1, -sp), apex = bx(R0, 0);
        svgEl('path', { d: `M${p1} Q${bx(R1 + 14, 0)} ${p2} L${apex} Z`, fill: COL.medulla, stroke: '#a85a4c', 'stroke-width': 1.5 }, g);
        for (let i = 1; i < 5; i++) { const f = i / 5, q = [p1[0] + (p2[0] - p1[0]) * f, p1[1] + (p2[1] - p1[1]) * f]; svgEl('path', { d: `M${q} L${apex}`, stroke: '#b9695a', 'stroke-width': 0.8, opacity: 0.6 }, g); }
        calyx.push(apex);
      });
      // the hollow that collects urine, and the tube that drains it
      let pel = `M${sinus[0] + 60},${sinus[1] + 6} `;
      svgEl('path', { d: calyx.map(p => `M${p[0]},${p[1]} L${sinus[0] + 34},${sinus[1] + 6}`).join(' '), stroke: '#e9d27a', 'stroke-width': 13, 'stroke-linecap': 'round', fill: 'none' }, g);
      svgEl('path', { d: `M${sinus[0] + 20},${sinus[1] - 26} Q${sinus[0] + 80},${sinus[1] - 10} ${sinus[0] + 96},${sinus[1] + 60} Q${sinus[0] + 104},${sinus[1] + 150} ${sinus[0] + 92},${sinus[1] + 262} L${sinus[0] + 76},${sinus[1] + 262} Q${sinus[0] + 84},${sinus[1] + 150} ${sinus[0] + 70},${sinus[1] + 80} Q${sinus[0] + 50},${sinus[1] + 40} ${sinus[0] + 14},${sinus[1] + 36} Z`, fill: '#e9d27a', stroke: '#b08900', 'stroke-width': 1.5 }, g);
      void pel;
      svgEl('path', { d: `M${cx + 300},${cy - 60} L${sinus[0] + 60},${cy - 44}`, stroke: COL.bloodDark, 'stroke-width': 12, 'stroke-linecap': 'round' }, g);
      svgEl('path', { d: `M${cx + 300},${cy - 22} L${sinus[0] + 66},${cy - 16}`, stroke: '#8e5a78', 'stroke-width': 12, 'stroke-linecap': 'round' }, g);
      small(g, cx + 310, cy - 62, 'blood in', { 'font-size': 14 }); small(g, cx + 310, cy - 18, 'blood out', { 'font-size': 14 }); small(g, sinus[0] + 106, sinus[1] + 240, 'urine out', { 'font-size': 14 });
      // one nephron, drawn far larger than life: its filter in the outer part, its loop dipping into a cone
      const neph = svgEl('g', {}, g);
      svgEl('path', { d: 'M236,112 C262,100 270,128 288,118 C306,108 308,134 300,150 L300,208 C300,222 316,222 316,208 L316,158 C316,140 338,140 338,160 L352,236', fill: 'none', stroke: '#fff', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, neph);
      svgEl('path', { d: 'M236,112 C262,100 270,128 288,118 C306,108 308,134 300,150 L300,208 C300,222 316,222 316,208 L316,158 C316,140 338,140 338,160 L352,236', fill: 'none', stroke: '#2f4f86', 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, neph);
      svgEl('circle', { cx: 228, cy: 112, r: 11, fill: '#fff', stroke: '#2f4f86', 'stroke-width': 4 }, neph); svgEl('circle', { cx: 228, cy: 112, r: 5, fill: COL.bloodDark }, neph);
      const hit = svgEl('rect', { x: 206, y: 92, width: 160, height: 150, rx: 14, fill: 'transparent' }, neph);
      part(g, 'nephron', 'A tiny structure that starts in the outer part and dips into a cone of the inner part', hit); hi.nephron.push(neph);
      part(g, 'cortex', 'The outer part of the kidney', svgEl('circle', { cx: 196, cy: 330, r: 24, fill: 'transparent' }, g));
      part(g, 'medulla', 'A cone of the inner part of the kidney', svgEl('circle', { cx: 290, cy: 350, r: 30, fill: 'transparent' }, g));
      part(g, 'pelvis', 'The hollow in the middle of the kidney', svgEl('circle', { cx: cx + 130, cy: cy + 40, r: 30, fill: 'transparent' }, g));
      small(g, 90, 330, 'outer part', { 'font-size': 14, 'text-anchor': 'end' }); svgEl('path', { d: 'M94,326 L180,330', stroke: COL.muted, 'stroke-width': 1 }, g);
      small(g, 90, 420, 'inner part', { 'font-size': 14, 'text-anchor': 'end' }); svgEl('path', { d: 'M94,416 L262,372', stroke: COL.muted, 'stroke-width': 1 }, g);
      small(g, 700, 330, 'hollow that collects urine', { 'font-size': 14 }); svgEl('path', { d: `M696,326 L${cx + 150},${cy + 44}`, stroke: COL.muted, 'stroke-width': 1 }, g);
      nameT(g, 90, 348, 'renal cortex', { 'text-anchor': 'end', fill: COL.kidneyDark, 'font-size': 14 }); nameT(g, 90, 438, 'renal medulla', { 'text-anchor': 'end', fill: COL.kidneyDark, 'font-size': 14 });
      nameT(g, 700, 348, 'renal pelvis', { fill: '#8a6d00', 'font-size': 14 }); nameT(g, 200, 78, 'a nephron (about a million in each kidney)', { fill: '#2f4f86', 'font-size': 14 });
    }
    // ---- slide 2: one nephron
    {
      const g = slides[2];
      svgEl('rect', { x: 180, y: 20, width: 640, height: 250, fill: '#fbeee9' }, g); svgEl('rect', { x: 180, y: 270, width: 640, height: 280, fill: '#f6e0d9' }, g);
      small(g, 808, 44, 'outer part of the kidney', { 'text-anchor': 'end', 'font-size': 13 }); small(g, 808, 294, 'inner part', { 'text-anchor': 'end', 'font-size': 13 });
      const n = nephronShape(g, { x: 240, y: 30, scale: 1 }), P = n.parts;
      view.neph = P;
      for (const [id, el, name] of [['filter', P.filter, 'A knot of capillaries inside a cup'], ['first', P.first, 'The first, coiled stretch of the tube'], ['loop', P.loop, 'A hairpin that dips into the inner part'], ['last', P.last, 'The last stretch of the tube'], ['ret', P.ret, 'Capillaries wrapped round the tube']]) part(g, id, name, el);
      const lead = (x1, y1, x2, y2) => svgEl('path', { d: `M${x1},${y1} L${x2},${y2}`, stroke: COL.muted, 'stroke-width': 1 }, g);
      label(g, 34, 60, 'blood in', { 'font-size': 14.5 }); lead(100, 56, 250, 46);
      label(g, 34, 150, 'a knot of capillaries', { 'font-size': 14.5 }); label(g, 34, 168, 'inside a cup', { 'font-size': 14.5 }); lead(150, 150, 300, 130);
      label(g, 34, 330, 'a long tube, in', { 'font-size': 14.5 }); label(g, 34, 348, 'three stretches', { 'font-size': 14.5 }); lead(140, 334, 556, 334);
      label(g, 34, 450, 'a second set of', { 'font-size': 14.5, fill: '#9e3a33' }); label(g, 34, 468, 'capillaries, wrapped', { 'font-size': 14.5, fill: '#9e3a33' }); label(g, 34, 486, 'round the tube', { 'font-size': 14.5, fill: '#9e3a33' }); lead(176, 462, 536, 440);
      label(g, 708, 516, 'to the hollow of', { 'font-size': 14 }); label(g, 708, 534, 'the kidney: urine', { 'font-size': 14 });
      label(g, 770, 190, 'blood back to', { 'font-size': 14 }); label(g, 770, 208, 'the body', { 'font-size': 14 }); lead(766, 192, 756, 186);
      nameT(g, 34, 190, 'glomerulus + glomerular capsule', { fill: SEG.filter, 'font-size': 13.5, 'font-weight': 650 });
      nameT(g, 468, 30, 'proximal convoluted tubule', { fill: '#8a6a12', 'font-size': 13.5, 'font-weight': 650, 'text-anchor': 'middle' });
      nameT(g, 592, 528, 'nephron loop', { fill: '#5e6d2c', 'font-size': 13.5, 'font-weight': 650, 'text-anchor': 'middle' });
      nameT(g, 704, 250, 'distal convoluted tubule,', { fill: '#1f6f6c', 'font-size': 13.5, 'font-weight': 650 }); nameT(g, 704, 268, 'then collecting duct', { fill: '#1f6f6c', 'font-size': 13.5, 'font-weight': 650 });
      nameT(g, 34, 506, 'peritubular capillaries', { fill: '#9e3a33', 'font-size': 13.5, 'font-weight': 650 });
    }
    const marks = numbered(svg, opts.marksAt || []);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);
    view.show = (i) => { slides.forEach((g, k) => { g.setAttribute('opacity', k === i ? 1 : 0); g.setAttribute('pointer-events', k === i ? 'auto' : 'none'); g.setAttribute('aria-hidden', k === i ? 'false' : 'true'); }); view.slide = i; };
    view.names = (on) => names.forEach(t => t.setAttribute('opacity', on ? 1 : 0));
    view.highlight = (ids) => {
      ids = [].concat(ids || []);
      for (const id in hi) for (const el of hi[id]) { el.style.filter = ids.includes(id) ? 'drop-shadow(0 0 5px #f0b429) drop-shadow(0 0 2px #f0b429)' : ''; }
    };
    view.update = () => {
      const b = app.sim; if (!(b instanceof Kidney) || !view.flowT) return;
      const show = !!view.showFlow, rbf = b.f.gfr / 0.2 / 0.55;
      const t = show ? [`Blood through the two kidneys:`, `${fx(rbf / 1000, 1)} L every minute,`, `about ${Math.round(rbf / 5300 * 100)} % of what the heart pumps`] : ['', '', ''];
      view.flowT.forEach((el, i) => { if (el.textContent !== t[i]) el.textContent = t[i]; });
    };
    view.show(opts.slide || 0);
    return view;
  };

  // =========================================================================
  // The design bench (scene 4)
  // =========================================================================
  const B_KIND = {
    water: { name: 'water', col: COL.water, r: 2.2, n: 46 }, salt: { name: 'salt', col: COL.na, r: 3.2, n: 26 }, glucose: { name: 'glucose', col: COL.glucose, r: 4.2, n: 12 },
    urea: { name: 'urea', col: COL.urea, r: 3.4, n: 12 }, potassium: { name: 'potassium', col: COL.k, r: 3.2, n: 8 }, acid: { name: 'acid', col: COL.acid, r: 3, n: 8 }, drug: { name: 'the new drug', col: COL.drug, r: 4.4, n: 5 },
  };
  function mark(g, kind) {
    const K = B_KIND[kind];
    if (kind === 'glucose') return svgEl('path', { d: 'M0,-4.4 L3.8,-2.2 L3.8,2.2 L0,4.4 L-3.8,2.2 L-3.8,-2.2 Z', fill: K.col }, g);
    if (kind === 'urea') return svgEl('path', { d: 'M0,-4 L3.8,3 L-3.8,3 Z', fill: K.col }, g);
    if (kind === 'drug') return svgEl('path', { d: 'M0,-5 L1.5,-1.5 L5,-1.5 L2.2,1 L3.2,5 L0,2.6 L-3.2,5 L-2.2,1 L-5,-1.5 L-1.5,-1.5 Z', fill: K.col }, g);
    if (kind === 'acid') return svgEl('rect', { x: -2.8, y: -2.8, width: 5.6, height: 5.6, fill: K.col, transform: 'rotate(45)' }, g);
    return svgEl('circle', { r: K.r, fill: K.col }, g);
  }
  KD.benchMark = mark; KD.B_KIND = B_KIND;
  views.bench = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 470', role: 'img', 'aria-label': 'A design bench: blood flowing past a machine that has to remove wastes and keep what the body needs' }, stage);
    const view = { svg, onSlot: null };
    const bench = () => app.sim;
    const VX = 30, VW = 656, VY = 40, VH = 100;
    svgEl('rect', { x: VX, y: VY, width: VW, height: VH, rx: 18, fill: COL.blood, stroke: COL.bloodLine, 'stroke-width': 3 }, svg);
    label(svg, VX + 10, VY - 12, 'her blood, flowing past', { 'font-size': 15, 'font-weight': 650, fill: '#8f2620' });
    // particles in the blood: how many of each follows the model's level
    const swarms = {};
    for (const k of Object.keys(B_KIND)) swarms[k] = { g: svgEl('g', { 'pointer-events': 'none' }, svg), items: [] };
    // the machine below
    const mg = svgEl('g', {}, svg);
    const slots = {}, flows = [];
    const outY = 344;
    const design = opts.design;
    label(svg, VX + VW, VY - 12, design === 1 ? 'DESIGN 1 · a pump for each waste' : 'DESIGN 2 · filter everything small, then take some back', { 'font-size': 15, 'font-weight': 700, 'text-anchor': 'end' });
    function slot(kind, x, title, up) {
      const g = svgEl('g', { transform: `translate(${x},${design === 1 ? 222 : 236})` }, mg);
      const box = svgEl('rect', { x: -52, y: -40, width: 104, height: 80, rx: 12, fill: '#fbfaf6', stroke: '#b9b3a2', 'stroke-width': 2, 'stroke-dasharray': '6 5' }, g);
      const t1 = label(g, 0, -6, 'empty slot', { 'text-anchor': 'middle', 'font-size': 13, fill: COL.muted }), t2 = label(g, 0, 12, title, { 'text-anchor': 'middle', 'font-size': 13, fill: COL.muted });
      const pump = svgEl('g', { opacity: 0 }, g);
      svgEl('circle', { r: 30, fill: '#fff', stroke: B_KIND[kind].col, 'stroke-width': 4 }, pump);
      const rotor = svgEl('g', {}, pump);
      for (const a of [0, 120, 240]) svgEl('path', { d: 'M0,0 L0,-22', stroke: B_KIND[kind].col, 'stroke-width': 5, 'stroke-linecap': 'round', transform: `rotate(${a})` }, rotor);
      mark(svgEl('g', { transform: 'scale(1.6)' }, pump), kind);
      const cap = label(g, 0, 58, '', { 'text-anchor': 'middle', 'font-size': 13.5, 'font-weight': 650, fill: B_KIND[kind].col });
      clickable(g, `Slot for a pump: ${title}`, () => view.onSlot && view.onSlot(kind));
      slots[kind] = { g, box, t1, t2, pump, rotor, cap, x, up, kind, spin: 0 };
    }
    if (design === 1) {
      slot('urea', 170, 'pump for urea'); slot('potassium', 360, 'pump for potassium'); slot('acid', 550, 'pump for acid');
      for (const k in slots) { const s = slots[k]; svgEl('path', { d: `M${s.x},${VY + VH} L${s.x},182 M${s.x},262 L${s.x},${outY - 10}`, stroke: '#cfc9b8', 'stroke-width': 10, 'stroke-linecap': 'round' }, mg).parentNode.insertBefore(mg.lastChild, mg.firstChild); }
    } else {
      // the filter and the tube
      svgEl('path', { d: `M96,${VY + VH - 4} L96,${outY - 26} Q96,${outY} 124,${outY} L640,${outY}`, fill: 'none', stroke: COL.tubuleLine, 'stroke-width': 30, 'stroke-linecap': 'round' }, mg);
      svgEl('path', { d: `M96,${VY + VH - 4} L96,${outY - 26} Q96,${outY} 124,${outY} L640,${outY}`, fill: 'none', stroke: COL.tubule, 'stroke-width': 24, 'stroke-linecap': 'round' }, mg);
      for (let i = 0; i < 5; i++) svgEl('rect', { x: 82 + i * 7, y: VY + VH - 5, width: 3, height: 9, fill: '#7d1f19' }, mg);
      label(mg, 120, VY + VH + 24, 'filter', { 'font-size': 14.5, 'font-weight': 650, fill: '#7a5a10' });
      small(mg, 120, VY + VH + 41, 'everything', { 'font-size': 13 }); small(mg, 120, VY + VH + 57, 'small passes', { 'font-size': 13 });
      slot('water', 290, 'take back water', true); slot('salt', 430, 'take back salt', true); slot('glucose', 570, 'take back glucose', true);
      for (const k in slots) { const s = slots[k]; const p = svgEl('path', { d: `M${s.x},${outY - 14} L${s.x},276 M${s.x},196 L${s.x},${VY + VH}`, stroke: '#cfc9b8', 'stroke-width': 10, 'stroke-linecap': 'round' }, mg); mg.insertBefore(p, mg.firstChild); }
    }
    // out of the body
    svgEl('path', { d: design === 1 ? `M150,${outY} L664,${outY}` : `M640,${outY} L664,${outY}`, stroke: design === 1 ? '#e2d9b8' : COL.tubule, 'stroke-width': design === 1 ? 22 : 24, 'stroke-linecap': 'round' }, mg);
    label(svg, 664, outY + 40, 'OUT of the body', { 'font-size': 15, 'font-weight': 650, fill: '#8a6d00', 'text-anchor': 'end' });
    const outNote = small(svg, 664, outY + 58, '', { 'font-size': 13.5, 'text-anchor': 'end' });
    const counter = label(svg, VX, outY + 100, '', { 'font-size': 15, 'font-weight': 600 });
    const dead = svgEl('g', { opacity: 0 }, svg);
    svgEl('rect', { x: 130, y: 390, width: 500, height: 62, rx: 12, fill: '#fdeeec', stroke: COL.bloodDark, 'stroke-width': 2 }, dead);
    const deadT = label(dead, 380, 415, '', { 'text-anchor': 'middle', 'font-size': 15.5, 'font-weight': 700, fill: '#8f2620' }), deadT2 = label(dead, 380, 437, '', { 'text-anchor': 'middle', 'font-size': 14.5, fill: '#8f2620' });
    // levels, at the right
    svgEl('rect', { x: 716, y: 10, width: 274, height: 452, rx: 12, fill: '#fff', stroke: '#d9d6cc' }, svg);
    label(svg, 732, 34, 'In her body', { 'font-size': 15.5, 'font-weight': 650 }); small(svg, 974, 34, 'normal = 1', { 'text-anchor': 'end', 'font-size': 13 });
    const bars = {};
    const order = ['water', 'salt', 'glucose', 'urea', 'potassium', 'acid', 'drug'];
    order.forEach((k, i) => {
      const y = 64 + i * 58, g = svgEl('g', { transform: `translate(732,${y})` }, svg);
      mark(svgEl('g', { transform: 'translate(7,-5) scale(1.5)' }, g), k);
      label(g, 22, 0, B_KIND[k].name, { 'font-size': 14.5, 'font-weight': 600 });
      small(g, 242, 0, k === 'drug' ? 'never met before' : BENCH.kept.includes(k) ? 'must be kept' : 'must leave', { 'text-anchor': 'end', 'font-size': 13 });
      svgEl('rect', { x: 0, y: 8, width: 242, height: 13, rx: 6.5, fill: '#e9e6dc' }, g);
      if (k !== 'drug') svgEl('rect', { x: 242 * 0.9 / 3, y: 8, width: 242 * 0.2 / 3, height: 13, fill: '#a9d8b9' }, g);
      const fill = svgEl('rect', { x: 0, y: 10, height: 9, rx: 4.5, fill: B_KIND[k].col }, g);
      const val = small(g, 0, 36, '', { 'font-size': 13 });
      bars[k] = { fill, val };
      if (i === 2 || i === 5) svgEl('path', { d: 'M-4,44 L246,44', stroke: '#eceae3' }, g);
    });
    const marks = numbered(svg, opts.marksAt || []);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);

    function setSwarm(k, n, dt) {
      const S = swarms[k], box = { x: VX + 12, y: VY + 12, w: VW - 24, h: VH - 24 };
      n = Math.max(0, Math.round(n));
      while (S.items.length < n) { const e = svgEl('g', {}, S.g); mark(e, k); S.items.push({ x: box.x + Math.random() * box.w, y: box.y + Math.random() * box.h, vy: 0, e }); }
      while (S.items.length > n) S.items.pop().e.remove();
      const kk = Math.min(1, dt / 1000);
      for (const p of S.items) {
        p.x += (26 + (p.e.id ? 0 : 6)) * kk; p.vy += (Math.random() - 0.5) * 40 * kk; p.vy *= 0.9; p.y += p.vy * kk * 8;
        if (p.x > box.x + box.w) p.x = box.x; if (p.y < box.y) { p.y = box.y; p.vy = Math.abs(p.vy); } if (p.y > box.y + box.h) { p.y = box.y + box.h; p.vy = -Math.abs(p.vy); }
        p.e.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
      }
    }
    // particles moving through the machine while it runs
    function flowDot(kind, path) { const e = svgEl('g', { 'pointer-events': 'none' }, svg); mark(e, kind); flows.push({ e, path, u: 0, v: 0.5 + Math.random() * 0.3 }); }
    let spawn = 0;
    view.update = (dtReal) => {
      const b = bench(); if (!(b instanceof Bench)) return;
      const running = !!app.run && !app.paused, L = b.level;
      for (const k of Object.keys(B_KIND)) setSwarm(k, B_KIND[k].n * (k === 'drug' ? Math.min(L.drug, 8) : L[k]), running ? dtReal : dtReal * 0.25);
      for (const k in slots) {
        const s = slots[k], on = b.pumps.has(k);
        s.pump.setAttribute('opacity', on ? 1 : 0); s.box.setAttribute('opacity', on ? 0 : 1); s.t1.setAttribute('opacity', on ? 0 : 1); s.t2.setAttribute('opacity', on ? 0 : 1);
        const c = on ? (s.up ? `takes back ${B_KIND[k].name}` : `pumps out ${B_KIND[k].name}`) : '';
        if (s.cap.textContent !== c) s.cap.textContent = c;
        if (on && running) { s.spin += dtReal * 0.2; s.rotor.setAttribute('transform', `rotate(${s.spin % 360})`); }
      }
      // moving dots: what is leaving, and what is coming back
      spawn += running ? dtReal : 0;
      if (spawn > 110 && flows.length < 90) {
        spawn = 0;
        if (b.design === 1) { for (const k in slots) if (b.pumps.has(k) && Math.random() < 0.5) flowDot(k, [[slots[k].x, VY + VH - 8], [slots[k].x, outY], [650, outY]]); }
        else {
          const kinds = Object.keys(B_KIND).filter(k => (k === 'drug' ? L.drug > 0.05 : L[k] > 0.05));
          const k = kinds[Math.floor(Math.random() * kinds.length)];
          if (k) { const s = slots[k]; flowDot(k, s && b.pumps.has(k) ? [[96, VY + VH], [96, outY - 6], [s.x, outY], [s.x, VY + VH - 10]] : [[96, VY + VH], [96, outY - 6], [650, outY]]); }
        }
      }
      for (let i = flows.length - 1; i >= 0; i--) {
        const fdot = flows[i]; fdot.u += dtReal / 1000 * fdot.v * (running ? 1 : 0.15);
        const pts = fdot.path, segs = pts.length - 1, s = Math.min(segs - 1e-6, fdot.u * segs), j = Math.floor(s), fr = s - j;
        fdot.e.setAttribute('transform', `translate(${(pts[j][0] + (pts[j + 1][0] - pts[j][0]) * fr).toFixed(1)},${(pts[j][1] + (pts[j + 1][1] - pts[j][1]) * fr).toFixed(1)})`);
        if (fdot.u >= 1) { fdot.e.remove(); flows.splice(i, 1); }
      }
      order.forEach((k) => {
        const v = L[k], B = bars[k];
        B.fill.setAttribute('width', clamp(v / (k === 'drug' ? 7 : 3), 0, 1) * 242);
        const t = k === 'drug' ? (v < 0.05 ? 'none' : `${fx(v, 1)} dose${v > 0.95 && v < 1.05 ? '' : 's'} in her body`) : `${fx(v, 2)} × normal${v > 1.25 ? ' · HIGH' : v < 0.75 ? ' · LOW' : ''}`;
        if (B.val.textContent !== t) { B.val.textContent = t; B.val.setAttribute('fill', k !== 'drug' && (v > 1.25 || v < 0.75) ? '#b0352b' : COL.muted); B.val.setAttribute('font-weight', k !== 'drug' && (v > 1.25 || v < 0.75) ? 700 : 400); }
      });
      const ct = b.design === 2 ? `Filtered so far: ${fx(b.filtered, 0)} L · taken back: ${fx(b.returned, 0)} L` : '';
      if (counter.textContent !== ct) counter.textContent = ct;
      const on = b.design === 1 ? `what the pumps move, and nothing else` : `whatever was not taken back`;
      if (outNote.textContent !== on) outNote.textContent = on;
      dead.setAttribute('opacity', b.dead ? 1 : 0);
      if (b.dead) { deadT.textContent = `Stopped after ${Math.round(b.dead.t)} minutes`; deadT2.textContent = 'Half of her water, salt and glucose have gone out with the wastes.'; }
    };
    view.narrate = () => {
      const b = bench(); if (!(b instanceof Bench)) return null;
      const h = b.t / HOUR, when = h < 2 ? `${Math.round(b.t)} min` : `Hour ${Math.floor(h)}`;
      if (b.dead) return { key: 'dead', html: `<b>${Math.round(b.dead.t)} minutes.</b> The filter passes everything small, and nothing brought any of it back. Half of her water, salt and glucose are already gone.` };
      const hi = BENCH.wastes.filter(w => b.level[w] > 1.25).map(w => B_KIND[w].name);
      const drug = b.level.drug > 0.05 ? ` The new drug: <b>${fx(b.level.drug, 1)} doses</b> in her body.` : '';
      if (b.design === 1) return { key: 'd1' + hi.join() + Math.floor(b.level.drug), html: `<b>${when}.</b> ${b.pumps.size ? `${b.pumps.size} pump${b.pumps.size > 1 ? 's' : ''} fitted; each moves only its own substance.` : 'No pumps fitted yet.'}${hi.length ? ` Building up: <b>${hi.join(', ')}</b>.` : (b.t > 0 && b.pumps.size ? ' Wastes steady.' : '')}${drug}` };
      return { key: 'd2' + b.pumps.size + Math.floor(b.level.drug * 2), html: `<b>${when}.</b> Everything small is pushed out through the filter, ${fx(BENCH.filterRate * 1000, 0)} mL a minute. ${b.pumps.size === 3 ? 'Water, salt and glucose are taken back; whatever is left goes out.' : `Taken back: ${b.pumps.size ? [...b.pumps].join(', ') : 'nothing'}.`}${drug}` };
    };
    return view;
  };

  // =========================================================================
  // Cards on the stage: urine reports and patient charts
  // =========================================================================
  // A urine report as a test strip and a measuring jug would give it. o: {title, blood: lab rows, bp, hourly}
  function urineHTML(u, o) {
    o = o || {};
    const pos = (s) => (s !== 'negative' ? 'pos' : '');
    const vol = o.hourly ? `${u.perHour < 9.5 ? fx(u.perHour, 0) : big(Math.round(u.perHour / 5) * 5)} mL/hour` : `${fx(u.perDay, 1)} L/day`;
    const volFlag = u.perDay > 3 ? 'H' : u.perDay < 0.5 ? 'L' : '';
    return `<div class="labrep"><div class="lh"><span>${o.title || 'Urine'}</span><span style="font-weight:400;color:var(--muted)">usual</span></div><table>
      <tr class="${volFlag}"><td>Volume</td><td class="v">${vol}</td><td class="f">${volFlag}</td><td class="r">${o.hourly ? '40–80' : '1–2'}</td></tr>
      <tr><td>Colour</td><td class="v" style="font-weight:400"><span class="sw" style="background:${urineColour(u.colour)}"></span>${colourWord(u.colour)}</td><td class="f"></td><td class="r">yellow</td></tr>
      <tr><td>Concentration</td><td class="v">${big(Math.round(u.osm / 10) * 10)} mOsm/L</td><td class="f"></td><td class="r">50–1,200</td></tr>
      <tr class="${pos(u.protein)}"><td>Protein</td><td class="v">${u.protein}</td><td class="f"></td><td class="r">negative</td></tr>
      <tr class="${pos(u.glucose)}"><td>Glucose</td><td class="v">${u.glucose}</td><td class="f"></td><td class="r">negative</td></tr>
      <tr class="${pos(u.blood)}"><td>Blood</td><td class="v">${u.blood}</td><td class="f"></td><td class="r">negative</td></tr>
      ${o.bloodGlucose != null ? `<tr class="${o.bloodGlucose > 140 ? 'H' : ''}"><td style="border-top:2px solid #d9d6cc">Blood glucose</td><td class="v" style="border-top:2px solid #d9d6cc">${big(o.bloodGlucose)} mg/dL</td><td class="f" style="border-top:2px solid #d9d6cc">${o.bloodGlucose > 140 ? 'H' : ''}</td><td class="r" style="border-top:2px solid #d9d6cc">70–140</td></tr>` : ''}</table></div>`;
  }
  function labHTML(rows, title) {
    return `<div class="labrep"><div class="lh"><span>${title || 'Blood'}</span><span style="font-weight:400;color:var(--muted)">ref. range</span></div><table>` +
      rows.map(r => `<tr class="${r.flag || ''}"><td>${r.name}</td><td class="v">${typeof r.value === 'number' ? fx(r.value, r.dp) : r.value} <span style="font-weight:400;color:var(--muted)">${r.unit || ''}</span></td><td class="f">${r.flag || ''}</td><td class="r">${r.lo != null ? `${r.lo}–${r.hi}` : (r.ref || '')}</td></tr>`).join('') + '</table></div>';
  }
  KD.urineHTML = urineHTML; KD.labHTML = labHTML;
  views.cards = function (opts) {
    const wrap = htmlEl('div', { class: 'cards' + (opts.four ? ' four' : '') });
    stage.appendChild(wrap);
    const view = { wrap, cards: [] };
    view.set = (list) => {
      wrap.innerHTML = ''; view.cards = [];
      for (const c of list) {
        const el = htmlEl('div', { class: 'card' + (c.right ? ' right' : '') }, `<h3>${c.title}<span>${c.sub || ''}</span></h3>${c.html}`);
        wrap.appendChild(el); view.cards.push(el);
      }
    };
    view.mark = (i, right) => { if (view.cards[i]) view.cards[i].classList.toggle('right', !!right); };
    if (opts.cards) view.set(typeof opts.cards === 'function' ? opts.cards() : opts.cards);
    return view;
  };
})();
