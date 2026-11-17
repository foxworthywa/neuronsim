/* ImmuneSim views: the pictures on the stage. Each view reads the model every frame; nothing here
 * is a canned animation. See docs/IMMUNE_MODULE.md ("Three things stay on screen"). */
(function () {
  'use strict';
  const { app, views, COL, $, clamp, svgEl, setAttrs, fmt, fmtAb, pct } = IM;
  const { Immune, antigenShape, fitAt, GOOD_FIT, SIGMA, GRID, DAY, rng } = ImmuneSim;
  const stage = $('#stage');
  const sat = (x, K) => (x <= 0 ? 0 : x / (x + K));
  const log10 = (x) => Math.log10(Math.max(1, x));
  const label = (parent, x, y, text, o) => svgEl('text', Object.assign({ x, y, 'font-size': 16.5, fill: COL.ink, text }, o || {}), parent);
  const small = (parent, x, y, text, o) => label(parent, x, y, text, Object.assign({ 'font-size': 14.5, fill: COL.muted }, o || {}));

  // A cloud of moving marks inside a rectangle; the number shown follows the model.
  function swarm(parent, box, make) {
    const g = svgEl('g', { 'pointer-events': 'none' }, parent);
    const items = [];
    return {
      g, items,
      set(n, dtReal, o) {
        o = o || {};
        n = Math.max(0, Math.round(n));
        while (items.length < n) { const p = { x: (o.from ? o.from.x : box.x + Math.random() * box.w), y: (o.from ? o.from.y : box.y + Math.random() * box.h), vx: 0, vy: 0, el: make(g, items.length) }; items.push(p); }
        while (items.length > n) items.pop().el.remove();
        const k = Math.min(1, dtReal / 1000), jig = o.jitter == null ? 60 : o.jitter;
        items.forEach((p, i) => {
          p.vx += (Math.random() - 0.5) * jig * k + (o.dx || 0) * k; p.vy += (Math.random() - 0.5) * jig * k + (o.dy || 0) * k;
          if (o.toward) { if (!p.target) p.target = typeof o.toward === 'function' ? o.toward() : o.toward; p.vx += (p.target.x - p.x) * 0.5 * k; p.vy += (p.target.y - p.y) * 0.5 * k; }
          p.vx *= 0.9; p.vy *= 0.9;
          p.x += p.vx * k * 10; p.y += p.vy * k * 10;
          if (o.wrap) { if (p.x > box.x + box.w) p.x = box.x; if (p.x < box.x) p.x = box.x + box.w; }
          else { if (p.x < box.x) { p.x = box.x; p.vx = Math.abs(p.vx); } if (p.x > box.x + box.w) { p.x = box.x + box.w; p.vx = -Math.abs(p.vx); } }
          if (p.y < box.y) { p.y = box.y; p.vy = Math.abs(p.vy); } if (p.y > box.y + box.h) { p.y = box.y + box.h; p.vy = -Math.abs(p.vy); }
          p.el.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
          if (o.each) o.each(p, i);
        });
      },
    };
  }
  // Marks: a bacterium (with an antibody coat that can be switched on), a virus particle, cells.
  function bacterium(g) {
    const e = svgEl('g', {}, g);
    svgEl('ellipse', { rx: 6.5, ry: 4, fill: COL.pathogen, stroke: '#7d1f19', 'stroke-width': 1 }, e);
    const coat = svgEl('g', { stroke: COL.ab, 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round', opacity: 0 }, e);
    for (const [x, y, r] of [[-5, -5, -30], [5, -5, 30], [0, 6.5, 180]]) svgEl('path', { d: 'M0,0 L0,-4 M0,-4 L-3,-7 M0,-4 L3,-7', transform: `translate(${x},${y}) rotate(${r})` }, coat);
    e.coat = coat;
    return e;
  }
  function virion(g) {
    const e = svgEl('g', {}, g);
    svgEl('path', { d: 'M0,-5 L4.3,-2.5 L4.3,2.5 L0,5 L-4.3,2.5 L-4.3,-2.5 Z', fill: COL.pathogen, stroke: '#7d1f19', 'stroke-width': 0.8 }, e);
    const coat = svgEl('g', { stroke: COL.ab, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round', opacity: 0 }, e);
    for (const r of [0, 120, 240]) svgEl('path', { d: 'M0,-6 L0,-9 M0,-9 L-2.5,-11.5 M0,-9 L2.5,-11.5', transform: `rotate(${r})` }, coat);
    e.coat = coat;
    return e;
  }
  const antibodyY = (g, scale) => svgEl('path', { d: 'M0,6 L0,0 M0,0 L-4,-5 M0,0 L4,-5', stroke: COL.ab, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round', transform: `scale(${scale || 1})` }, g);
  function neutrophil(g) {
    const e = svgEl('g', {}, g);
    svgEl('circle', { r: 7.5, fill: '#dbe7f6', stroke: COL.phago, 'stroke-width': 1.5 }, e);
    svgEl('path', { d: 'M-3.5,-1 a2,2 0 1,0 3,0 a2,2 0 1,0 3,0 a2,2 0 1,0 -1,3', fill: 'none', stroke: COL.phago, 'stroke-width': 2, 'stroke-linecap': 'round' }, e);
    return e;
  }
  const lymphocyte = (kind) => (g) => { const e = svgEl('g', {}, g); svgEl('circle', { r: 6, fill: '#fff', stroke: COL[kind], 'stroke-width': 1.5 }, e); svgEl('circle', { r: 3.6, fill: COL[kind] }, e); return e; };
  const dot = (color, r) => (g) => svgEl('circle', { r: r || 3, fill: color }, g);
  // A dendritic cell: the same purple star wherever it appears (site, lymph vessel, scene 7).
  const DC_STAR = 'M0,-11 L3,-4 L11,-6 L6,1 L11,8 L3,6 L0,13 L-3,6 L-11,8 L-6,1 L-11,-6 L-3,-4 Z';
  function dendritic(parent, scale) {
    const e = svgEl('g', {}, parent), k = svgEl('g', { transform: `scale(${scale || 1})` }, e);
    svgEl('path', { d: DC_STAR, fill: '#dcd9f3', stroke: COL.dc, 'stroke-width': 1.5 / (scale || 1) * 1.6, 'stroke-linejoin': 'round' }, k);
    svgEl('ellipse', { rx: 3.2, ry: 2.6, fill: COL.dc, opacity: 0.55 }, k);
    // pieces of what it has swallowed
    e.cargo = svgEl('g', { opacity: 0 }, k);
    for (const [x, y] of [[-4, 3], [4, -2], [1, 5]]) svgEl('circle', { cx: x, cy: y, r: 1.5, fill: COL.pathogen }, e.cargo);
    return e;
  }
  function numbered(parent, list) {
    const g = svgEl('g', { opacity: 0, 'pointer-events': 'none' }, parent);
    for (const [n, x, y] of list) {
      svgEl('circle', { cx: x, cy: y, r: 13, fill: '#f0b429', stroke: '#fff', 'stroke-width': 2 }, g);
      svgEl('text', { x, y: y + 5, 'text-anchor': 'middle', 'font-size': 15.5, 'font-weight': 700, fill: '#1f2430', text: String(n) }, g);
    }
    return g;
  }
  // Make an SVG element act as a button for mouse and keyboard.
  function clickable(el, name, fn) {
    setAttrs(el, { tabindex: 0, role: 'button', 'aria-label': name, style: 'cursor:pointer' });
    el.addEventListener('click', fn);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }

  // ---------------------------------------------------------------- shapes for recognition
  // An antigen is drawn as a knob; a receptor as the cleft it would fit. The cleft is drawn from
  // the same two numbers the model uses for binding, so a receptor that looks like a fit is one.
  function knobParams(pt) { return { a: ((pt.x * 7) % 1) * 1.2 - 0.6, h: 0.75 + 0.5 * ((pt.y * 5) % 1) }; }
  function wrapDiff(a, b) { let d = a - b; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return d; }
  function cleftParams(clone, pt) {
    const k = knobParams(pt);
    // mismatch grows slowly while the receptor still binds, then quickly
    const off = (d) => { const u = d / SIGMA; return Math.sign(u) * Math.tanh(u * u / 4); };
    return { a: k.a + 1.1 * off(wrapDiff(clone.x, pt.x)), h: k.h + 0.55 * off(wrapDiff(clone.y, pt.y)) };
  }
  // The outline of a knob (or of the cleft that fits it) of half-width w and height H·h, peak shifted by a.
  function knobPath(k, w, H) {
    const px = k.a * w * 0.55, py = -k.h * H;
    return `M${-w},0 C${-w * 0.55},0 ${px - w * 0.5},${py} ${px},${py} C${px + w * 0.5},${py} ${w * 0.55},0 ${w},0`;
  }
  // A receptor drawn as a block with the cleft for a knob cut into its lower edge.
  function cleftBlock(c, w, H, top) {
    const px = c.a * w * 0.55, py = -c.h * H, m = w * 0.17;
    return `M${-w - m},${-top} L${w + m},${-top} L${w + m},0 L${w},0 C${w * 0.55},0 ${px + w * 0.5},${py} ${px},${py} C${px - w * 0.5},${py} ${-w * 0.55},0 ${-w},0 L${-w - m},0 Z`;
  }
  // Points along a knob (or cleft) outline, and its height at any x, for seating one on the other.
  function profile(k, w, H) {
    const px = k.a * w * 0.55, py = -k.h * H, pts = [];
    const cubic = (p0, p1, p2, p3) => { for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } };
    cubic([-w, 0], [-w * 0.55, 0], [px - w * 0.5, py], [px, py]);
    cubic([px, py], [px + w * 0.5, py], [w * 0.55, 0], [w, 0]);
    return pts;
  }
  function heightAt(pts, x) {
    for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const a = pts[i - 1], b = pts[i], f = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]); return a[1] + f * (b[1] - a[1]); }
    return 0;
  }
  // How far a receptor has to stay off the surface before its cleft clears the knob (0 = it sits right down).
  function seat(k, c, w, H) {
    const kp = profile(k, w, H), cp = profile(c, w, H);
    let d = 0;
    for (let i = 0; i <= 60; i++) { const x = -w + 2 * w * i / 60; d = Math.max(d, heightAt(cp, x) - heightAt(kp, x)); }
    return { d, kp, cp };
  }
  // The close-up: an antigen on the bacterium's surface (below) and one receptor of a lymphocyte
  // (above), brought together until they touch. A gap between them is shaded.
  function dockPicture(parent, x, y, o) {
    o = o || {};
    const w = o.w || 60, H = o.H || 56, top = H * 1.55, stem = 22;
    const g = svgEl('g', { transform: `translate(${x},${y})` }, parent);
    // the bacterium: its surface, with the antigen standing on it
    svgEl('path', { d: `M${-w - 78},4 Q0,-10 ${w + 78},4 L${w + 78},46 L${-w - 78},46 Z`, fill: COL.pathogen, stroke: '#7d1f19', 'stroke-width': 1.5 }, g);
    label(g, 0, 32, 'bacterium', { 'text-anchor': 'middle', fill: '#fff', 'font-size': 14.5, 'font-weight': 600 });
    const gap = svgEl('path', { fill: '#ffe08a', stroke: 'none', opacity: 0 }, g);
    const knob = svgEl('path', { fill: COL.pathogen, stroke: '#7d1f19', 'stroke-width': 1.5 }, g);
    const agLabel = small(g, w + 14, -6, 'antigen', { fill: '#7d1f19', 'font-size': 13.5 });
    // the lymphocyte: its membrane, a stalk, and the receptor's binding end
    const lym = svgEl('g', { opacity: 0 }, g);
    const mem = svgEl('path', { d: `M${-w - 78},${-top - stem - 34} L${w + 78},${-top - stem - 34} L${w + 78},${-top - stem - 6} Q0,${-top - stem + 10} ${-w - 78},${-top - stem - 6} Z`, fill: '#e3f3f1', stroke: COL.B, 'stroke-width': 2 }, lym);
    const lymLabel = label(lym, 0, -top - stem - 14, 'B-lymphocyte', { 'text-anchor': 'middle', 'font-size': 14.5, 'font-weight': 600, fill: '#0b5f59' });
    const stalk = svgEl('rect', { x: -9, y: -top - stem + 2, width: 18, height: stem, fill: '#fff', stroke: COL.B, 'stroke-width': 2.5 }, lym);
    const rec = svgEl('path', { fill: '#fff', stroke: COL.B, 'stroke-width': 3, 'stroke-linejoin': 'round' }, lym);
    const recLabel = small(lym, w + 18, -top * 0.62, 'receptor', { fill: '#0b5f59', 'font-size': 13.5 });
    const NAME = { B: 'B-lymphocyte', Th: 'helper T-lymphocyte', Tc: 'cytotoxic T-lymphocyte' };
    return {
      g, height: top + stem + 34,
      set(pt, clone, kind) {
        const k = knobParams(pt);
        knob.setAttribute('d', knobPath(k, w, H) + ' Z');
        if (!clone) { lym.setAttribute('opacity', 0); gap.setAttribute('opacity', 0); return 0; }
        const c = cleftParams(clone, pt), st = seat(k, c, w, H), col = COL[kind || clone.kind];
        rec.setAttribute('d', cleftBlock(c, w, H, top));
        for (const e of [rec, stalk, mem]) e.setAttribute('stroke', col);
        lymLabel.textContent = NAME[kind || clone.kind];
        setAttrs(lym, { opacity: 1, transform: `translate(0,${(-st.d).toFixed(1)})` });
        // the space left between the cleft (lifted by d) and the knob
        const up = st.cp.map(([px, py]) => `${px.toFixed(1)},${(py - st.d).toFixed(1)}`), down = st.kp.slice().reverse().map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`);
        setAttrs(gap, { d: `M${-w},${(-st.d).toFixed(1)} L${up.join(' L')} L${w},0 L${down.join(' L')} Z`, opacity: 1 });
        return st.d;
      },
    };
  }

  // =========================================================================
  // Scene 1: where the immune system is
  // =========================================================================
  views.body = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'Where the immune system is in the body' }, stage);
    const view = { svg, onPart: null };
    const slides = [];
    const part = (g, name, el) => { clickable(el, name, () => view.onPart && view.onPart(name)); el.dataset.part = name; return el; };

    // ---- slide 0: the anatomy (a textbook figure) beside the lab's own diagram of the body
    {
      const g = svgEl('g', {}, svg); slides.push(g);
      // left: the lymphatic system as an anatomy text draws it (OpenStax; see immune/img/CREDITS.md)
      const A = window.IM_ANATOMY;
      if (A) {
        const h = 486, w = h * A.width / A.height, x0 = 14, y0 = 36;
        label(g, x0 + w / 2, 24, 'The lymphatic system: the anatomy', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16 });
        svgEl('rect', { x: x0 - 1, y: y0 - 1, width: w + 2, height: h + 2, fill: '#fff', stroke: '#d9d6cc' }, g);
        const img = svgEl('image', { x: x0, y: y0, width: w, height: h, href: A.src, preserveAspectRatio: 'xMidYMid meet' }, g);
        svgEl('title', { text: 'Anatomical figure of the lymphatic system: lymph vessels and lymph nodes throughout the body, the tonsils, thymus, spleen and bone marrow, with close-ups of a lymph node and of lymphatic capillaries among tissue cells' }, img);
        clickable(img, 'Open a larger view of the anatomical figure', () => view.onFigure && view.onFigure());
        small(g, x0 + w / 2, y0 + h + 15, 'Figure: OpenStax College, Anatomy & Physiology (CC BY 3.0).', { 'text-anchor': 'middle', 'font-size': 11.5 });
        const zoom = svgEl('g', { transform: `translate(${x0 + w - 104},${y0 + 8})`, 'pointer-events': 'none' }, g);
        svgEl('rect', { width: 96, height: 24, rx: 12, fill: '#fff', stroke: '#b8b4a6', opacity: 0.95 }, zoom);
        label(zoom, 48, 17, 'larger view', { 'text-anchor': 'middle', 'font-size': 12.5, fill: COL.muted });
      }
      // right: the same body as this lab draws it
      const PX = 742, PY = 22;
      label(g, PX, 24, "The same body, as this lab draws it", { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16 });
      const P = svgEl('g', { transform: `translate(${PX},${PY + 14})` }, g);
      const skin = '#e6c3a5', line = '#b98d66';
      svgEl('ellipse', { cx: 0, cy: 50, rx: 34, ry: 42, fill: skin, stroke: line }, P);
      svgEl('rect', { x: -12, y: 88, width: 24, height: 22, fill: skin, stroke: line }, P);
      svgEl('path', { d: 'M-62,108 C-30,96 30,96 62,108 L52,300 L-52,300 Z', fill: skin, stroke: line }, P);
      svgEl('path', { d: 'M-62,110 L-96,290 L-78,294 L-48,150 Z M62,110 L96,290 L78,294 L48,150 Z', fill: skin, stroke: line }, P);
      svgEl('path', { d: 'M-52,296 L-46,500 L-8,500 L-2,300 Z M52,296 L46,500 L8,500 L2,300 Z', fill: skin, stroke: line }, P);
      // lymph vessels (green) from the knee to the groin node, then up to a vein near the heart
      svgEl('path', { d: 'M-26,408 C-30,380 -28,350 -24,320', fill: 'none', stroke: COL.lymphLine, 'stroke-width': 4, 'stroke-linecap': 'round' }, P);
      svgEl('path', { d: 'M-24,316 C-10,280 2,220 10,150 C12,140 18,134 26,132', fill: 'none', stroke: COL.lymphLine, 'stroke-width': 3, 'stroke-dasharray': '2 5', 'stroke-linecap': 'round' }, P);
      // bone marrow in the thigh bone
      svgEl('rect', { x: 18, y: 320, width: 10, height: 78, rx: 5, fill: '#fff', stroke: '#9c8f7a' }, P);
      svgEl('rect', { x: 21, y: 326, width: 4, height: 66, rx: 2, fill: '#c2463c' }, P);
      // heart
      svgEl('path', { d: 'M8,150 C-4,138 -18,156 8,180 C34,156 20,138 8,150 Z', fill: '#d9a19a', stroke: '#b0352b' }, P);
      // the scrape
      svgEl('ellipse', { cx: -26, cy: 412, rx: 11, ry: 8, fill: '#b0352b', stroke: '#7d1f19' }, P);
      // lymph nodes
      const NODES = [['groin-right', -24, 316], ['groin-left', 24, 316], ['armpit-right', -54, 150], ['armpit-left', 54, 150], ['neck-right', -16, 100], ['neck-left', 16, 100]];
      view.nodeEls = {};
      for (const [name, x, y] of NODES) {
        const e = part(g, name, svgEl('ellipse', { cx: x, cy: y, rx: 9, ry: 6.5, fill: COL.node, stroke: COL.lymphLine, 'stroke-width': 2.5 }, P));
        view.nodeEls[name] = e;
      }
      const names = svgEl('g', {}, g); view.names0 = names;
      const oy = PY + 14;
      const lead = (x1, y1, x2, y2, text, sub) => { svgEl('path', { d: `M${PX + x1},${oy + y1} L${PX + x2},${oy + y2}`, stroke: '#9aa0ad', 'stroke-width': 1 }, names); const right = x2 > x1; label(names, PX + x2 + (right ? 6 : -6), oy + y2 + 4, text, { 'text-anchor': right ? 'start' : 'end', 'font-weight': 600, 'font-size': 15.5 }); if (sub) small(names, PX + x2 + (right ? 6 : -6), oy + y2 + 21, sub, { 'text-anchor': right ? 'start' : 'end', 'font-size': 13.5 }); };
      lead(-26, 412, -112, 430, 'The scrape', 'broken skin');
      lead(-10, 250, -112, 240, 'Lymph vessels', 'drain the tissues');
      lead(-16, 100, -112, 88, 'Lymph nodes', 'filter the lymph');
      lead(8, 162, 108, 112, 'Heart and blood', 'carry the cells');
      lead(24, 360, 108, 380, 'Red bone marrow', 'makes blood cells');
      view.ring = svgEl('ellipse', { cx: PX - 24, cy: oy + 316, rx: 18, ry: 14, fill: 'none', stroke: '#f0b429', 'stroke-width': 4, opacity: 0 }, g);
    }
    // ---- slide 1: the skin as a barrier
    {
      const g = svgEl('g', {}, svg); slides.push(g);
      const half = (x0, broken) => {
        const h = svgEl('g', {}, g);
        svgEl('rect', { x: x0, y: 210, width: 430, height: 300, fill: COL.tissue, stroke: '#d9d6cc' }, h);
        label(h, x0 + 215, 60, broken ? 'Scraped skin' : 'Intact skin', { 'text-anchor': 'middle', 'font-size': 18.5, 'font-weight': 650 });
        // epidermis: tightly joined layers of cells, the top ones dead and dry
        for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i++) {
          const x = x0 + i * 36 + (r % 2 ? 0 : -6), y = 130 + r * 20;
          if (broken && i >= 4 && i <= 7 && r < 4) continue;
          svgEl('rect', { x: Math.max(x0, x), y, width: Math.min(34, x0 + 430 - Math.max(x0, x)), height: 18, rx: 4, fill: r === 0 ? '#d8b58f' : COL.skin, stroke: COL.skinDark }, h);
        }
        const skinPart = part(g, broken ? 'gap' : 'skin', svgEl('rect', { x: broken ? x0 + 138 : x0, y: 126, width: broken ? 150 : 430, height: 88, fill: 'transparent' }, h));
        skinPart.classList.add('hit');
        // bacteria: sitting on top of intact skin; in the tissue under the scrape
        const r = rng(broken ? 5 : 9);
        for (let i = 0; i < 14; i++) {
          const b = bacterium(h), x = x0 + 30 + r() * 370, deep = broken && x > x0 + 140 && x < x0 + 290;
          b.setAttribute('transform', `translate(${x},${deep ? 160 + r() * 150 : 116 + r() * 8}) rotate(${r() * 180})`);
        }
        for (let i = 0; i < 7; i++) svgEl('rect', { x: x0 + 20 + i * 60, y: 340 + (i % 2) * 60, width: 46, height: 30, rx: 12, fill: COL.cell, stroke: COL.cellLine, opacity: 0.7 }, h);
        svgEl('rect', { x: x0 + 20, y: 448, width: 390, height: 40, rx: 20, fill: COL.blood, stroke: COL.bloodLine, 'stroke-width': 2 }, h);
        small(h, x0 + 30, 232, 'tissue under the skin');
        small(h, x0 + 34, 473, 'blood vessel', { fill: '#9e3a33' });
        small(h, x0 + 8, 108, 'bacteria on the surface', { fill: '#7d1f19' });
      };
      half(40, false); half(530, true);
    }
    // ---- slide 2: the three places
    {
      const g = svgEl('g', {}, svg); slides.push(g);
      const box = (x, title, sub, fill, stroke) => { svgEl('rect', { x, y: 150, width: 250, height: 230, rx: 16, fill, stroke, 'stroke-width': 2.5 }, g); label(g, x + 125, 186, title, { 'text-anchor': 'middle', 'font-size': 18.5, 'font-weight': 650 }); sub.forEach((t, i) => small(g, x + 125, 214 + i * 19, t, { 'text-anchor': 'middle', 'font-size': 14.5 })); };
      box(50, '1  The site', ['the wound in the knee:', 'bacteria between the cells,', 'and the cells that live there'], COL.tissue, COL.cellLine);
      box(375, '2  The lymph node', ['in the groin: fluid from the', 'wound drains here, and', 'lymphocytes wait here'], COL.node, COL.lymphLine);
      box(700, '3  The blood', ['carries cells and antibody', 'to the site, and back', 'around the body'], COL.blood, COL.bloodLine);
      const arrow = (d, color, text, tx, ty) => { svgEl('path', { d, fill: 'none', stroke: color, 'stroke-width': 5, 'stroke-linecap': 'round', 'marker-end': 'url(#arr-' + color.slice(1) + ')' }, g); label(g, tx, ty, text, { 'text-anchor': 'middle', fill: color, 'font-weight': 600 }); };
      const defs = svgEl('defs', {}, svg);
      for (const col of [COL.lymphLine, COL.bloodLine]) { const m = svgEl('marker', { id: 'arr-' + col.slice(1), viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs); svgEl('path', { d: 'M0,0 L10,5 L0,10 Z', fill: col }, m); }
      arrow('M305,265 L368,265', COL.lymphLine, 'lymph', 337, 252);
      arrow('M630,265 L693,265', COL.lymphLine, 'lymph', 662, 252);
      arrow('M825,385 C825,470 175,470 175,388', COL.bloodLine, 'blood flows to the site', 500, 492);
      label(g, 500, 96, 'Three places to watch', { 'text-anchor': 'middle', 'font-size': 21, 'font-weight': 650 });
    }
    view.show = (i) => slides.forEach((g, j) => g.setAttribute('display', i === j ? 'inline' : 'none'));
    view.onFigure = () => IM.openFigure && IM.openFigure();
    view.names = (on) => view.names0.setAttribute('opacity', on ? 1 : 0.25);
    view.highlight = (name) => {
      for (const k in view.nodeEls) setAttrs(view.nodeEls[k], { fill: k === name ? '#f7d774' : COL.node });
      svg.querySelectorAll('.hit').forEach(e => setAttrs(e, { fill: e.dataset.part === name ? 'rgba(240,180,41,0.35)' : 'transparent', stroke: e.dataset.part === name ? '#f0b429' : 'none', 'stroke-width': 3 }));
    };
    view.show(opts.slide || 0);
    return view;
  };

  // =========================================================================
  // The three places: the site (a wound, or the lining of the airway), the node and the blood
  // =========================================================================
  views.places = function (opts) {
    const virus = opts.kind === 'virus', wide = opts.node === false;
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': virus ? 'The lining of the airway, the lymph node and the blood' : 'The wound, the lymph node and the blood' }, stage);
    const view = { svg };
    const SW = wide ? 960 : 600;      // width of the site panel
    const body = () => app.sim;

    // ---------------- the site
    const site = svgEl('g', {}, svg);
    svgEl('rect', { x: 20, y: 20, width: SW, height: 520, rx: 12, fill: virus ? '#eef4fb' : COL.tissue, stroke: '#d9d6cc' }, site);
    label(site, 34, 44, virus ? '1  The site: the lining of the airway' : '1  The site: the wound', { 'font-weight': 650, 'font-size': 15.5 });
    const fluid = svgEl('rect', { x: 20, y: 96, width: SW, height: 320, fill: '#a9d3f5', opacity: 0 }, site);
    const fluidNote = small(site, 20 + SW - 14, 116, 'fluid leaking in from the vessel', { 'text-anchor': 'end', fill: '#2b6ea6', opacity: 0 });
    let bacteria, virions, neut, pus, alarmDots, abSite, ctl, squares = [], vesselRect, vesselWall, macs = [], dcMark, dcHome = [], coatedShare = 0;
    const vesselY = 440;
    if (!virus) {
      // skin with a gap, tissue cells, resident macrophages
      for (let i = 0; i < Math.ceil(SW / 36); i++) { if (Math.abs(20 + i * 36 + 17 - (20 + SW / 2)) < 60) continue; svgEl('rect', { x: 20 + i * 36, y: 58, width: Math.min(34, SW - i * 36), height: 34, rx: 5, fill: COL.skin, stroke: COL.skinDark }, site); }
      small(site, 20 + SW / 2, 78, 'the scrape', { 'text-anchor': 'middle', fill: '#7d1f19' });
      const r = rng(11);
      for (let i = 0; i < (wide ? 16 : 10); i++) svgEl('rect', { x: 40 + r() * (SW - 110), y: 110 + r() * 250, width: 54, height: 30, rx: 13, fill: COL.cell, stroke: COL.cellLine, opacity: 0.55 }, site);
      const MAC = wide ? [[230, 230], [500, 300], [760, 220]] : [[150, 240], [330, 310], [500, 220]];
      for (const [x, y] of MAC) {
        const m = svgEl('g', { transform: `translate(${x},${y})` }, site);
        svgEl('path', { d: 'M-26,-6 C-34,-24 -8,-30 2,-22 C14,-34 34,-20 26,-4 C40,6 26,26 8,20 C-4,32 -30,24 -24,8 C-38,6 -36,-6 -26,-6 Z', fill: '#cfe0f5', stroke: COL.macro, 'stroke-width': 2 }, m);
        svgEl('ellipse', { cx: -2, cy: -2, rx: 9, ry: 7, fill: COL.macro, opacity: 0.6 }, m);
        macs.push(m);
      }
      view.macLabel = small(site, MAC[0][0], MAC[0][1] + 44, 'macrophage', { 'text-anchor': 'middle', fill: COL.phago });
    } else {
      // the airway lining as a sheet of cells seen from above; each square stands for many cells
      const COLS = 30, ROWS = 12, sz = (SW - 40) / COLS;
      small(site, 34, 112, 'air', {});
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const e = svgEl('rect', { x: 40 + c * sz, y: 180 + r * sz, width: sz - 1.5, height: sz - 1.5, rx: 3, fill: COL.cell, stroke: COL.cellLine, 'stroke-width': 0.8 }, site);
        squares.push({ e, state: 'healthy' });
      }
      view.perSquare = () => body().p.cells / squares.length;
      view.squareNote = small(site, 40, 180 + ROWS * sz + 16, '');
      const lg = svgEl('g', { transform: `translate(${SW - 330},${180 + ROWS * sz + 6})` }, site);
      [['healthy', COL.cell], ['infected', COL.infected], ['lost', '#c9c9c4']].forEach(([t, col], i) => { svgEl('rect', { x: i * 110, y: 0, width: 12, height: 12, rx: 2, fill: col, stroke: COL.cellLine }, lg); small(lg, i * 110 + 17, 11, t); });
    }
    // the blood vessel under the site
    vesselRect = svgEl('rect', { x: 20, y: vesselY, width: SW, height: 60, fill: COL.blood }, site);
    vesselWall = svgEl('path', { fill: 'none', stroke: COL.bloodLine, 'stroke-width': 3 }, site);
    view.vesselLabel = small(site, 34, vesselY + 84, 'blood vessel', { fill: '#9e3a33' });
    const bloodNeut = swarm(site, { x: 26, y: vesselY + 10, w: SW - 12, h: 40 }, neutrophil);
    const midX = 20 + SW / 2;
    if (!virus) {
      pus = swarm(site, { x: midX - 110, y: 96, w: 220, h: 50 }, dot('#a9b3c4', 4));
      alarmDots = swarm(site, { x: 40, y: 110, w: SW - 60, h: 300 }, dot(COL.alarm, 2.6));
      bacteria = swarm(site, { x: midX - (wide ? 300 : 210), y: 104, w: wide ? 600 : 420, h: 270 }, bacterium);
      neut = swarm(site, { x: 40, y: 100, w: SW - 60, h: 320 }, neutrophil);
      abSite = swarm(site, { x: 40, y: 100, w: SW - 60, h: 320 }, (g) => antibodyY(g, 1));
    } else {
      virions = swarm(site, { x: 40, y: 96, w: SW - 60, h: 76 }, virion);
      ctl = swarm(site, { x: 40, y: 180, w: SW - 60, h: 12 * (SW - 40) / 30 - 8 }, lymphocyte('Tc'));
      alarmDots = swarm(site, { x: 40, y: 180, w: SW - 60, h: 200 }, dot(COL.alarm, 2.6));
    }
    // dendritic cell leaving for the node along a lymph vessel
    if (!wide) {
    }
    const marks = numbered(svg, opts.marksAt || []);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);

    // ---------------- the node and the blood
    let nodeShape, nodeCells = {}, nodeText, nodeText2, bloodAb, bloodText, bloodText2;
    if (!wide) {
      svgEl('rect', { x: 640, y: 20, width: 340, height: 300, rx: 12, fill: '#f7f9f1', stroke: '#d9d6cc' }, svg);
      label(svg, 654, 44, '2  The lymph node', { 'font-weight': 650, 'font-size': 15.5 });
      nodeShape = svgEl('ellipse', { cx: 810, cy: 170, rx: 70, ry: 54, fill: COL.node, stroke: COL.lymphLine, 'stroke-width': 3 }, svg);
      for (const k of ['Th', 'B', 'Tc']) nodeCells[k] = swarm(svg, { x: 760, y: 135, w: 100, h: 70 }, lymphocyte(k));
      nodeText = label(svg, 810, 276, '', { 'text-anchor': 'middle', 'font-size': 14.5, 'font-weight': 600 });
      nodeText2 = small(svg, 810, 296, '', { 'text-anchor': 'middle' });
      const lg = svgEl('g', { transform: 'translate(654,60)' }, svg);
      [['B', 'B'], ['Th', 'helper T'], ['Tc', 'cytotoxic T']].forEach(([k, t], i) => { lymphocyte(k)(lg).setAttribute('transform', `translate(${8 + i * 92},4)`); small(lg, 18 + i * 92, 8, t); });
      svgEl('rect', { x: 640, y: 340, width: 340, height: 200, rx: 12, fill: '#fdf6f4', stroke: '#d9d6cc' }, svg);
      label(svg, 654, 364, '3  The blood', { 'font-weight': 650, 'font-size': 15.5 });
      svgEl('rect', { x: 654, y: 384, width: 312, height: 76, rx: 38, fill: COL.blood, stroke: COL.bloodLine, 'stroke-width': 2 }, svg);
      bloodAb = swarm(svg, { x: 676, y: 398, w: 268, h: 48 }, (g) => antibodyY(g, 1.2));
      bloodText = label(svg, 810, 488, '', { 'text-anchor': 'middle', 'font-size': 14.5, 'font-weight': 600 });
      bloodText2 = small(svg, 810, 508, '', { 'text-anchor': 'middle' });
      // the lymph vessel from the site to the node, and a dendritic cell that travels along it
      svgEl('path', { d: `M${SW + 8},330 C${SW + 44},330 ${SW + 30},190 742,172`, fill: 'none', stroke: COL.lymphLine, 'stroke-width': 9, 'stroke-linecap': 'round', opacity: 0.6 }, svg);
      small(svg, SW + 30, 350, 'lymph', { 'text-anchor': 'middle', fill: '#5f7a3a', 'font-size': 12.5 });
      small(svg, SW + 30, 364, 'vessel', { 'text-anchor': 'middle', fill: '#5f7a3a', 'font-size': 12.5 });
      // dendritic cells that live at the site (a different cell from the macrophages) ...
      const HOME = virus ? [[SW - 60, 150], [150, 150]] : [[455, 352], [250, 150]];
      HOME.forEach(([x, y], i) => { const d = dendritic(svg, 2.3); d.setAttribute('transform', `translate(${x},${y})`); dcHome.push(d); if (i === 0) small(svg, x, y + 46, 'dendritic cell', { 'text-anchor': 'middle', fill: COL.dc }); });
      // ... and one on its way to the node, carrying pieces of what it swallowed
      dcMark = dendritic(svg, 1.6); dcMark.setAttribute('opacity', 0); dcMark.cargo.setAttribute('opacity', 1);
    }
    svg.appendChild(marks);   // numbered markers stay on top of everything drawn since

    let phase = 0;
    view.update = (dtReal) => {
      const b = body();
      if (!(b instanceof Immune)) return;
      const s = b.site, sg = b.signs;
      phase += dtReal / 1000;
      // the vessel: wider with more flow; gaps in its wall where it leaks
      const hgt = 44 + 16 * s.flow;
      setAttrs(vesselRect, { y: vesselY + 30 - hgt / 2, height: hgt });
      const top = vesselY + 30 - hgt / 2, bot = top + hgt;
      vesselWall.setAttribute('d', `M20,${top} L${20 + SW},${top} M20,${bot} L${20 + SW},${bot}`);
      vesselWall.setAttribute('stroke-dasharray', s.leak > 0.08 ? `${Math.round(26 - 16 * clamp(s.leak, 0, 1))} ${Math.round(4 + 10 * clamp(s.leak, 0, 1))}` : 'none');
      fluid.setAttribute('opacity', virus ? 0 : 0.6 * clamp(s.leak, 0, 1));
      fluidNote.setAttribute('opacity', !virus && s.leak > 0.2 ? 1 : 0);
      bloodNeut.set(clamp(b.blood.neutrophils / 500, 0, 24), dtReal, { dx: 40 * s.flow, wrap: true, jitter: 20 });
      if (!virus) {
        coatedShare = sat(s.antibody, b.p.opsK);
        const nb = s.bacteria <= 0 ? 0 : clamp(8 * log10(s.bacteria) - 8, 2, 64);
        bacteria.set(nb, dtReal, { jitter: 30, each: (p, i) => p.el.coat.setAttribute('opacity', i < Math.round(coatedShare * nb) ? 1 : 0) });
        neut.set(clamp(s.neutrophils / 55, 0, 60), dtReal, { from: { x: 60 + Math.random() * (SW - 100), y: vesselY - 6 }, toward: () => ({ x: midX + (Math.random() - 0.5) * (wide ? 560 : 400), y: 120 + Math.random() * 250 }), jitter: 70 });
        pus.set(clamp(s.pus / 160, 0, 40), dtReal, { jitter: 8 });
        alarmDots.set(clamp(60 * s.alarm, 0, 60), dtReal, { jitter: 120 });
        abSite.set(clamp(5 * log10(s.antibody + 1), 0, 22), dtReal, { jitter: 70 });
        macs.forEach((m) => m.firstChild.setAttribute('fill', s.alarm > 0.05 ? '#f6e7b4' : '#cfe0f5'));
        if (b.p.macrophages <= 0) macs.forEach(m => m.setAttribute('opacity', 0.12)); else macs.forEach(m => m.setAttribute('opacity', 1));
      } else {
        const aV = b.antibodyTo('virus', s.vStrain || app.strain), share = sat(aV, b.p.neutK);
        const nv = s.virus <= 0 ? 0 : clamp(9 * log10(s.virus) + 2, 2, 60);
        virions.set(nv, dtReal, { jitter: 70, each: (p, i) => p.el.coat.setAttribute('opacity', i < Math.round(share * nv) ? 1 : 0) });
        ctl.set(s.ctl < 20 ? 0 : clamp(4 * log10(s.ctl) - 3, 1, 26), dtReal, { jitter: 60 });
        alarmDots.set(clamp(50 * b.fever, 0, 40), dtReal, { jitter: 120 });
        // squares: move just enough of them between states to match the model's counts
        const per = view.perSquare();
        const want = { infected: Math.round(b.infected / per), lost: Math.round(Math.max(0, b.p.cells - s.healthy - b.infected) / per) };
        if (b.infected >= 1 && want.infected < 1) want.infected = 1;
        const count = (st) => squares.filter(q => q.state === st).length;
        const move = (from, to) => { const pool = squares.filter(q => q.state === from); if (!pool.length) return false; const q = pool[Math.floor(Math.random() * pool.length)]; q.state = to; q.e.setAttribute('fill', to === 'healthy' ? COL.cell : to === 'infected' ? COL.infected : '#c9c9c4'); return true; };
        for (let guard = 0; guard < 40; guard++) {
          const ni = count('infected'), nl = count('lost');
          if (nl < want.lost) { if (!move(ni > want.infected ? 'infected' : 'healthy', 'lost')) break; }
          else if (ni < want.infected) { if (!move('healthy', 'infected')) break; }
          else if (ni > want.infected) { if (!move('infected', nl < want.lost ? 'lost' : 'healthy')) break; }
          else if (nl > want.lost) { if (!move('lost', 'healthy')) break; }
          else break;
        }
        view.squareNote.textContent = `each square: about ${fmt(Math.round(per / 100) * 100)} cells`;
      }
      if (wide) return;
      // dendritic cells on the way to the node while there is antigen to carry
      const an = Object.values(b.antigens).reduce((m, a) => Math.max(m, a.d1 > a.A + 0.01 || a.depot > 0.01 ? Math.max(a.d1, 0.3) : 0), 0);
      if (an > 0.02) {
        const u = (phase * 0.25) % 1, x = (1 - u) * (SW + 8) + u * 742 + 26 * Math.sin(Math.PI * u), y = 330 - 158 * u;
        setAttrs(dcMark, { opacity: 1, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` });
      } else dcMark.setAttribute('opacity', 0);
      // the dendritic cells at the site show what they have swallowed while there is anything to swallow
      const fed = (virus ? b.infected + s.virus : s.bacteria) > 50 || an > 0.02;
      dcHome.forEach(d => d.cargo.setAttribute('opacity', fed ? 1 : 0));
      const cells = b.nodeCells, grow = 1 + 0.16 * log10(cells / 20);
      setAttrs(nodeShape, { rx: 70 * grow, ry: 54 * grow });
      let eff = { B: 0, Th: 0, Tc: 0 };
      for (const r of b.responders()) eff[r.c.kind] += r.c.E + (r.c.mem > 1 ? r.c.mem : 0);
      for (const k of ['Th', 'B', 'Tc']) nodeCells[k].set(eff[k] < 3 ? 0 : clamp(5 * log10(eff[k]), 1, 26), dtReal, { jitter: 40 });
      const sp = b.specific(app.kind, app.strain);
      nodeText.textContent = `${fmt(sp.total)} lymphocytes fit this antigen`;
      nodeText2.textContent = sp.effector > 20 ? 'the selected clones are dividing' : sp.memory > 20 ? `${fmt(sp.memory)} of them are memory cells` : 'waiting';
      const ab = b.antibodyTo(app.kind, app.strain);
      bloodAb.set(clamp(6 * log10(ab + 1), 0, 30), dtReal, { dx: 30, wrap: true, jitter: 30 });
      bloodText.textContent = `Antibody to this antigen: ${fmtAb(ab)}${ab >= 0.05 ? ' units' : ''}`;
      const bl = b.blood;
      bloodText2.textContent = `neutrophils ${fmt(bl.neutrophils)} /µL · helper T ${fmt(bl.cd4)} /µL`;
    };

    // The narrator describes the state of the model in causal terms.
    view.narrate = () => {
      const b = body();
      if (!(b instanceof Immune)) return null;
      const s = b.site, d = IM.dayNow(), when = app.timeline && app.timeline.window <= 2.5 ? `${Math.round(d * 24)} h` : `Day ${d.toFixed(1)}`;
      const sp = b.specific(app.kind, app.strain), ab = b.antibodyTo(app.kind, app.strain);
      let key, text;
      if (!virus) {
        const crit = b.p.critN;
        if (s.bacteria <= 0 && s.neutrophils < 20 && s.alarm < 0.02) { key = sp.effector > 200 ? 'quietBusy' : 'quiet'; text = sp.effector > 200 ? `No bacteria. <b>${fmt(sp.total)}</b> lymphocytes that fit this antigen are still in the lymph node, and the blood carries ${fmtAb(ab)} units of antibody. Most of those cells will die over the next few weeks.` : sp.memory > 50 ? `No bacteria. In the lymph node, <b>${fmt(sp.memory)} memory cells</b> remain from the last infection, and the blood carries ${fmtAb(ab)} units of antibody.` : 'No bacteria at the site. The macrophages are at rest and the vessel is its normal width.'; }
        else if (s.bacteria <= 0) { key = 'after'; text = `The bacteria are gone. The alarm fades, the vessel narrows, and the ${fmt(s.neutrophils)} neutrophils left at the site die off within a day.`; }
        else if (b.p.manualAlarm != null) { key = 'manual'; text = `<b>You are holding the alarm at ${pct(b.p.manualAlarm)}.</b> The vessel is ${s.flow > 1.5 ? 'wide and leaky' : 'widening'}; ${fmt(s.neutrophils)} neutrophils are at the site. Bacteria fall only when there are more than about ${fmt(crit)}.`; }
        else if (s.neutrophils < 30 && s.alarm < 0.05) { key = 'early'; text = `${fmt(s.bacteria)} bacteria${b.p.macrophages > 0 ? '. The resident macrophages are eating them, but there are only a few macrophages' : ', doubling every 90 minutes, with nothing to stop them'}.`; }
        else if (s.antibody > 3) { key = 'ab'; text = `Antibody is arriving through the leaky vessel and coating the bacteria (${pct(sat(s.antibody, b.p.opsK))} coated). Coated bacteria are eaten many times faster: ${fmt(s.bacteria)} left.`; }
        else if (s.neutrophils < crit * 0.9) { key = 'rising'; text = `The macrophages have released <b>alarm signals</b> (yellow). The vessel has widened and become leaky, and neutrophils are leaving the blood: ${fmt(s.neutrophils)} at the site so far, not yet enough. ${fmt(s.bacteria)} bacteria.`; }
        else { key = 'held'; text = `${fmt(s.neutrophils)} neutrophils are killing bacteria about as fast as they divide, so the count is roughly level at ${fmt(s.bacteria)}.${b.p.adaptive > 0 ? ` In the lymph node, ${fmt(sp.total)} lymphocytes fit this antigen${ab < 1 ? '; no antibody yet' : ''}.` : ''}`; }
      } else {
        const inf = b.infected;
        if (inf < 1 && s.virus < 1) { key = sp.effector > 200 ? 'vquietBusy' : 'vquiet'; text = sp.effector > 200 ? `No virus. <b>${fmt(sp.total)}</b> lymphocytes that fit this antigen are in the lymph node (the selected clones), and the blood carries ${fmtAb(ab)} units of antibody.` : sp.memory > 50 || ab > 1 ? `No virus. The blood carries ${fmtAb(ab)} units of antibody to it, and ${fmt(sp.memory)} memory cells wait in the lymph node.` : 'No virus. The cells lining the airway are healthy.'; }
        else if (s.ctl > 300) { key = 'ctl'; text = `<b>${fmt(s.ctl)} cytotoxic T-lymphocytes</b> have reached the airway and are killing infected cells: ${fmt(inf)} left.`; }
        else if (ab > 5 && inf > 100) { key = 'vab'; text = `Antibody is coating the free virus (${fmt(s.virus)} left), but ${fmt(inf)} cells are still infected. Antibody cannot get inside a cell.`; }
        else { key = 'vspread'; text = `${fmt(inf)} cells are infected and releasing virus; ${fmt(s.virus)} free virus particles. Infected cells have warned their neighbours, which slows the spread but does not stop it.`; }
      }
      return { key, html: `<b>${when}.</b> ${text}` };
    };
    return view;
  };

  // =========================================================================
  // The library in the lymph node (scenes 5 and 6)
  // =========================================================================
  views.node = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'The lymph node: a library of lymphocytes, each with a different receptor' }, stage);
    const view = { svg, onPick: null, selected: null, lib: opts.lib || 'B', revealed: false, showSelf: !!opts.showSelf, tested: new Set() };
    const body = () => app.sim;
    svgEl('rect', { x: 52, y: 38, width: 556, height: 500, rx: 110, fill: COL.node, stroke: COL.lymphLine, 'stroke-width': 3 }, svg);
    const title = label(svg, 330, 26, '', { 'font-weight': 650, 'font-size': 16.5, 'text-anchor': 'middle' });
    const gridG = svgEl('g', {}, svg);
    // where each clone is drawn has nothing to do with its shape: neighbours on screen are not alike
    const order = Array.from({ length: GRID * GRID }, (_, i) => i);
    const r = rng(app.seed * 31 + 5);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const cellsEl = [];
    const SP = 12.6, X0 = 110, Y0 = 68;
    function posOf(slot) { return { x: X0 + (slot % GRID) * SP, y: Y0 + Math.floor(slot / GRID) * SP }; }
    function build() {
      gridG.innerHTML = ''; clusterG.innerHTML = ''; cellsEl.length = 0; markKey = '?';
      const lib = body().lib[view.lib];
      lib.forEach((c, i) => {
        const p = posOf(order[i]);
        const e = svgEl('circle', { cx: p.x, cy: p.y, r: 4.4, fill: '#fff', stroke: COL[view.lib], 'stroke-width': 1.4, style: 'cursor:pointer' }, gridG);
        e.addEventListener('click', () => view.pick(c));
        cellsEl.push({ e, c, p });
      });
      title.textContent = `${fmt(lib.length)} ${view.lib === 'B' ? 'B-lymphocytes' : view.lib === 'Th' ? 'helper T-lymphocytes' : 'cytotoxic T-lymphocytes'}, each with a differently shaped receptor`;
    }
    // A clone that has multiplied is drawn as a cluster of more cells, each the same size as before
    // (never as one bigger cell), with the number of cells written beside it.
    const clusterG = svgEl('g', { 'pointer-events': 'none' }, svg);
    function drawCluster(ce, cells) {
      const want = cells > 6 && ce.c.present ? clamp(Math.round(7 * Math.pow(Math.log10(cells), 1.5)), 4, 70) : 0;
      if (!ce.kids) { if (!want) return; ce.kids = []; ce.kg = svgEl('g', {}, clusterG); ce.kt = svgEl('text', { 'text-anchor': 'middle', 'font-size': 13.5, 'font-weight': 650, fill: '#0b3f3b', stroke: '#eef3e2', 'stroke-width': 3.5, 'paint-order': 'stroke' }, clusterG); }
      const cx = clamp(ce.p.x, 104, 556), cy = clamp(ce.p.y, 92, 470);
      while (ce.kids.length < want) { const i = ce.kids.length, rr = 5.1 * Math.sqrt(i + 0.6), th = i * 2.39996; ce.kids.push(svgEl('circle', { cx: (cx + rr * Math.cos(th)).toFixed(1), cy: (cy + rr * Math.sin(th)).toFixed(1), r: 4.4, fill: COL[view.lib], stroke: '#0b4f4a', 'stroke-width': 1 }, ce.kg)); }
      while (ce.kids.length > want) ce.kids.pop().remove();
      const text = want ? `${fmt(cells)} cells` : '';
      if (ce.kt.textContent !== text) ce.kt.textContent = text;
      if (want) setAttrs(ce.kt, { x: cx, y: cy + 5.1 * Math.sqrt(want) + 17 });
    }
    // Cells the antigen has marked get a pulsing ring and a click target much larger than the cell.
    const markG = svgEl('g', {}, svg);
    let markKey = null, markRings = [];
    function drawMarks(t) {
      const key = view.revealed ? `${view.lib}|${app.kind}|${app.strain}` : null;
      if (key !== markKey) {
        markKey = key; markG.innerHTML = ''; markRings = [];
        if (key) for (const ce of cellsEl) {
          if (!ce.c.present || body().fit(ce.c, app.kind, app.strain) < GOOD_FIT) continue;
          markRings.push(svgEl('circle', { cx: ce.p.x, cy: ce.p.y, r: 12, fill: 'none', stroke: '#f0b429', 'stroke-width': 3, 'pointer-events': 'none' }, markG));
          const hit = svgEl('circle', { cx: ce.p.x, cy: ce.p.y, r: 17, fill: 'transparent' }, markG);
          clickable(hit, 'A lymphocyte the antigen has marked', () => view.pick(ce.c));
        }
      }
      markRings.forEach((r, i) => r.setAttribute('r', (12 + 2.5 * Math.sin(t * 4 + i)).toFixed(1)));
    }
    const sel = svgEl('circle', { r: 10, fill: 'none', stroke: '#f0b429', 'stroke-width': 3.5, opacity: 0, 'pointer-events': 'none' }, svg);
    const antigenDots = swarm(svg, { x: 70, y: 60, w: 500, h: 440 }, dot(COL.pathogen, 3));
    small(svg, 330, 555, 'Shown: about a thousand cells, standing in for hundreds of millions.', { 'text-anchor': 'middle' });

    // the close-up: the antigen and the receptor under test
    svgEl('rect', { x: 640, y: 20, width: 340, height: 520, rx: 12, fill: '#fff', stroke: '#d9d6cc' }, svg);
    label(svg, 656, 46, 'Close-up: does this receptor fit?', { 'font-weight': 650, 'font-size': 15.5 });
    small(svg, 656, 65, 'one receptor of the cell you pick, against one antigen');
    const dock = dockPicture(svg, 810, 268, { w: 60, H: 56 });
    const fitText = label(svg, 810, 346, 'Pick a lymphocyte to test its receptor.', { 'text-anchor': 'middle', 'font-size': 16.5, 'font-weight': 650 });
    const fitSub = small(svg, 810, 366, '', { 'text-anchor': 'middle' });
    svgEl('rect', { x: 670, y: 378, width: 280, height: 12, rx: 6, fill: '#eceae3' }, svg);
    const fitBar = svgEl('rect', { x: 670, y: 378, width: 0, height: 12, rx: 6, fill: COL.lymph }, svg);
    const tally = [0, 1, 2, 3].map(i => small(svg, 656, 418 + i * 20, '', { 'font-size': 14.5, fill: COL.ink }));
    const marks = numbered(svg, [[1, 80, 280], [2, 666, 262], [3, 666, 160], [4, 656, 346]]);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);
    const pt = () => antigenShape(app.kind, app.strain);
    view.best = 0;
    view.pick = (c) => {
      view.selected = c; view.tested.add(c.id);
      const f = body().fit(c, app.kind, app.strain);
      view.best = Math.max(view.best, f);
      dock.set(pt(), c, view.lib);
      const ce = cellsEl.find(x => x.c === c);
      setAttrs(sel, { cx: ce.p.x, cy: ce.p.y, opacity: 1 });
      fitText.textContent = f >= GOOD_FIT ? `Fit ${pct(f)}: it binds` : `Fit ${pct(f)}: it does not bind`;
      fitText.setAttribute('fill', f >= GOOD_FIT ? '#1e7a45' : COL.ink);
      fitSub.textContent = f >= GOOD_FIT ? 'The receptor sits snugly on the antigen.' : 'It cannot sit down on the antigen: see the gap (yellow).';
      setAttrs(fitBar, { width: 280 * f, fill: f >= GOOD_FIT ? '#2f9e5b' : '#9aa0ad' });
      if (view.onPick) view.onPick(c, f);
    };
    view.pickRandom = () => { const pool = cellsEl.filter(x => x.c.present && !view.tested.has(x.c.id)); if (pool.length) view.pick(pool[Math.floor(Math.random() * pool.length)].c); };
    view.fitting = () => body().lib[view.lib].filter(c => c.present && body().fit(c, app.kind, app.strain) >= GOOD_FIT);
    view.reveal = (on) => { view.revealed = on; };
    view.setLib = (k) => { view.lib = k; view.selected = null; view.tested = new Set(); view.best = 0; sel.setAttribute('opacity', 0); build(); view.reset(); };
    view.reset = () => { view.tested = new Set(); view.best = 0; view.selected = null; sel.setAttribute('opacity', 0); dock.set(pt(), null); fitText.textContent = 'Pick a lymphocyte to test its receptor.'; fitText.setAttribute('fill', COL.ink); fitSub.textContent = ''; fitBar.setAttribute('width', 0); };
    view.setSelf = (mode) => { view.showSelf = mode; };   // 'made': show the cells that fit self; 'screened': show them removed
    build(); view.reset();
    let nodeClock = 0;
    view.update = (dtReal) => {
      const b = body();
      if (!(b instanceof Immune)) return;
      const lib = b.lib[view.lib], P = pt();
      let nFit = 0;
      for (const ce of cellsEl) {
        const c = ce.c, f = b.fit(c, app.kind, app.strain), cells = c.R + c.E;
        const good = f >= GOOD_FIT;
        if (good && c.present) nFit++;
        let rad = 4.4, fill = '#fff', stroke = COL[view.lib], sw = 1.4, op = 1;
        if (c.self && view.showSelf === 'made') { fill = '#f3c9c4'; stroke = '#b0352b'; sw = 2.2; }
        else if (!c.present) op = c.self && view.showSelf ? 0.12 : (c.self ? 0 : 0.15);
        if (view.revealed && good && c.present) { fill = COL[view.lib]; sw = 2.5; stroke = '#0b4f4a'; rad = 7.5; }
        if (cells > 6 && c.present) { fill = COL[view.lib]; rad = 4.4; }
        else if (view.tested.has(c.id) && !good) { fill = '#e3e1da'; }
        setAttrs(ce.e, { r: rad.toFixed(1), fill, stroke, 'stroke-width': sw, opacity: op });
        if (cells > 6 || ce.kids) drawCluster(ce, cells);
      }
      nodeClock += dtReal / 1000; drawMarks(nodeClock);
      const A = b.antigens[P.key] ? b.antigens[P.key].A : 0;
      antigenDots.set(view.revealed || A > 0.02 ? clamp(6 + 40 * A, 6, 46) : 0, dtReal, { jitter: 80 });
      const sp = b.specific(app.kind, app.strain, view.lib);
      tally[0].textContent = `Tested by hand: ${view.tested.size} of ${fmt(lib.length)}`;
      tally[1].textContent = view.tested.size ? `Best fit found so far: ${pct(view.best)}` : '';
      tally[2].textContent = view.revealed || sp.total > 30 ? `Cells whose receptor fits: ${nFit} clone${nFit === 1 ? '' : 's'}, ${fmt(sp.total)} cells` : '';
      tally[3].textContent = sp.memory > 5 ? `of which memory cells: ${fmt(sp.memory)}` : '';
      if (view.selected && cellsEl.length) { const ce = cellsEl.find(x => x.c === view.selected); if (ce) setAttrs(sel, { r: parseFloat(ce.e.getAttribute('r')) + 5 }); }
    };
    view.narrate = () => {
      const b = body(); if (!(b instanceof Immune)) return null;
      const sp = b.specific(app.kind, app.strain, view.lib), d = IM.dayNow();
      const an = b.antigens[antigenShape(app.kind, app.strain).key], dividing = an && an.A > 0.1;
      if (sp.effector > 5 && dividing) return { key: 'expand', html: `<b>Day ${d.toFixed(1)}.</b> The cells that fit are dividing: there are <b>${fmt(sp.total)}</b> of them now. The cells stay the same size; there are more of them. Every one carries the same receptor as the cell it came from: they are a <b>clone</b>.` };
      if (sp.effector > 50) return { key: 'contract', html: `<b>Day ${d.toFixed(1)}.</b> The antigen is gone, so the cells of the clone have stopped dividing and most are dying: <b>${fmt(sp.total)}</b> left, of which ${fmt(sp.memory)} are long-lived memory cells.` };
      if (sp.memory > 5) return { key: 'memory', html: `The infection is over. Most of the cells of the clone have died, but <b>${fmt(sp.memory)} memory cells</b> remain where there were only a few cells before.` };
      if (view.revealed) return { key: 'revealed', html: `Antigen carried in from the wound has drifted through the node. It stuck only to the cells whose receptor fits: <b>${view.fitting().length} of ${fmt(b.lib[view.lib].length)}</b>.` };
      return { key: 'library', html: 'Every circle is one lymphocyte. Each was made with a receptor of a different shape, before this infection began.' };
    };
    return view;
  };

  // =========================================================================
  // Whole cells: a bacterium and B-lymphocytes (scene 5). What "a receptor that fits" means.
  // =========================================================================
  views.meet = function (opts) {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'A bacterium with antigen on its surface, and B-lymphocytes with receptors on theirs' }, stage);
    const view = { svg, onTry: null, docked: null };
    const body = () => app.sim;
    const P = antigenShape(app.kind, app.strain), k = knobParams(P);
    const KW = 15, KH = 18, TOP = 27, STEM = 12, R = 44;
    label(svg, 500, 30, 'Inside the lymph node: a bacterium and three B-lymphocytes', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    // ---- the bacterium, with the same surface protein (the antigen) all over it
    const BX = 235, BY = 290, RX = 150, RY = 100;
    const bact = svgEl('g', {}, svg);
    for (let i = 0; i < 12; i++) {
      const th = i * Math.PI / 6, x = BX + RX * Math.cos(th), y = BY + RY * Math.sin(th);
      const nu = Math.atan2(Math.sin(th) / RY, Math.cos(th) / RX) * 180 / Math.PI;
      svgEl('path', { d: knobPath(k, KW, KH) + ' Z', transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(nu + 90).toFixed(1)})`, fill: COL.pathogen, stroke: '#7d1f19', 'stroke-width': 1.2 }, bact);
    }
    svgEl('ellipse', { cx: BX, cy: BY, rx: RX, ry: RY, fill: '#cf5a50', stroke: '#7d1f19', 'stroke-width': 2 }, bact);
    label(svg, BX, BY - 4, 'bacterium', { 'text-anchor': 'middle', fill: '#fff', 'font-size': 18.5, 'font-weight': 650 });
    small(svg, BX, BY + 18, 'Streptococcus pyogenes', { 'text-anchor': 'middle', fill: '#fbe9e7', 'font-style': 'italic' });
    svgEl('path', { d: `M${BX - 60},${BY - RY - 22} L${BX - 100},${BY - RY - 58}`, stroke: '#9aa0ad' }, svg);
    label(svg, BX - 104, BY - RY - 78, 'antigen', { 'text-anchor': 'end', 'font-weight': 650, fill: '#7d1f19' });
    small(svg, BX - 104, BY - RY - 60, 'a protein on its surface', { 'text-anchor': 'end' });
    small(svg, BX - 40, BY + RY + 44, 'Every copy of this protein', { 'text-anchor': 'middle' });
    small(svg, BX - 40, BY + RY + 62, 'has the same shape.', { 'text-anchor': 'middle' });
    // ---- three B-lymphocytes: one whose receptor fits (the model's best), two that do not
    const lib = body().lib.B.filter(c => c.present).map(c => ({ c, f: body().fit(c, app.kind, app.strain) })).sort((a, b) => b.f - a.f);
    const rr = rng(app.seed * 13 + 3);
    const others = []; while (others.length < 2) { const q = lib[40 + Math.floor(rr() * (lib.length - 40))]; if (!others.includes(q)) others.push(q); }
    const order = [others[0], lib[0], others[1]];
    if (rr() < 0.5) order.reverse(); if (rr() < 0.34) order.push(order.shift());
    const HOME = [[790, 132], [850, 296], [790, 460]];
    const cells = order.map((q, i) => {
      const c = cleftParams(q.c, P), st = seat(k, c, KW, KH);
      const g = svgEl('g', {}, svg);
      for (let j = 0; j < 8; j++) {
        const ph = Math.PI + j * Math.PI / 4, deg = ph * 180 / Math.PI;
        const m = R + STEM + TOP, x = m * Math.cos(ph), y = m * Math.sin(ph);
        svgEl('path', { d: `M${(R * Math.cos(ph)).toFixed(1)},${(R * Math.sin(ph)).toFixed(1)} L${((R + STEM + 2) * Math.cos(ph)).toFixed(1)},${((R + STEM + 2) * Math.sin(ph)).toFixed(1)}`, stroke: COL.B, 'stroke-width': 5 }, g);
        svgEl('path', { d: cleftBlock(c, KW, KH, TOP), transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(deg - 90).toFixed(1)})`, fill: '#fff', stroke: COL.B, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      }
      const disc = svgEl('circle', { r: R, fill: '#e3f3f1', stroke: COL.B, 'stroke-width': 3 }, g);
      svgEl('circle', { r: R * 0.55, fill: COL.B, opacity: 0.4 }, g);
      label(g, 0, 6, String.fromCharCode(65 + i), { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 700, fill: '#0b5f59' });
      const cell = { g, disc, q, st, pos: HOME[i].slice(), home: HOME[i], target: HOME[i], wait: 0, name: String.fromCharCode(65 + i) };
      clickable(g, `B-lymphocyte ${cell.name}`, () => view.tryCell(i));
      return cell;
    });
    small(svg, 640, 96, 'receptor', { 'text-anchor': 'end', fill: '#0b5f59', 'font-size': 14.5, 'font-weight': 600 });
    small(svg, 640, 114, 'thousands of copies, all alike', { 'text-anchor': 'end' });
    svgEl('path', { d: 'M646,102 L704,122', stroke: '#9aa0ad' }, svg);
    const verdict = label(svg, 560, 300, '', { 'text-anchor': 'middle', 'font-size': 16.5, 'font-weight': 650 });
    const zoom = svgEl('g', { opacity: 0 }, svg);
    svgEl('circle', { cx: BX + RX + 16, cy: BY, r: 40, fill: 'none', stroke: '#f0b429', 'stroke-width': 3, 'stroke-dasharray': '6 5' }, zoom);
    svgEl('path', { d: `M${BX + RX + 16},${BY + 40} L${BX + RX + 16},${BY + 108}`, stroke: '#f0b429', 'stroke-width': 2, 'stroke-dasharray': '4 4' }, zoom);
    small(zoom, BX + RX + 16, BY + 126, 'one receptor on one antigen:', { 'text-anchor': 'middle', fill: COL.ink });
    small(zoom, BX + RX + 16, BY + 144, 'the close-up in the next picture', { 'text-anchor': 'middle', fill: COL.ink });
    // where a cell's centre sits when its receptor is on the antigen at the bacterium's right-hand end
    const dockAt = (cell) => [BX + RX + cell.st.d + TOP + STEM + R, BY];
    view.cells = cells;
    view.fits = (i) => cells[i].q.f >= GOOD_FIT;
    view.tryCell = (i) => {
      const cell = cells[i];
      if (cells.some(c => c.busy)) return;
      cells.forEach(c => { if (c !== cell) { c.target = c.home; } });
      view.docked = null; zoom.setAttribute('opacity', 0); verdict.textContent = '';
      cell.target = dockAt(cell); cell.busy = true; cell.arrived = false;
    };
    view.showFit = () => { const i = cells.findIndex(c => c.q.f >= GOOD_FIT); if (view.docked !== i) view.tryCell(i); };
    view.update = (dtReal) => {
      const kf = Math.min(1, dtReal / 1000 * 5);
      cells.forEach((cell, i) => {
        cell.pos[0] += (cell.target[0] - cell.pos[0]) * kf; cell.pos[1] += (cell.target[1] - cell.pos[1]) * kf;
        cell.g.setAttribute('transform', `translate(${cell.pos[0].toFixed(1)},${cell.pos[1].toFixed(1)})`);
        if (cell.busy && !cell.arrived && Math.hypot(cell.target[0] - cell.pos[0], cell.target[1] - cell.pos[1]) < 1.5) {
          cell.arrived = true;
          const ok = cell.q.f >= GOOD_FIT;
          setAttrs(verdict, { x: cell.target[0] + 4, y: BY - R - TOP - 34, fill: ok ? '#1e7a45' : '#8a4b0f' });
          verdict.textContent = ok ? `${cell.name} binds` : `${cell.name} does not bind`;
          if (ok) { cell.busy = false; view.docked = i; zoom.setAttribute('opacity', 1); }
          else cell.wait = 1300;
          if (view.onTry) view.onTry(i, ok, cell.q.f);
        } else if (cell.busy && cell.arrived && cell.wait > 0) {
          cell.wait -= dtReal;
          if (cell.wait <= 0) { cell.target = cell.home; cell.busy = false; }
        }
        cell.disc.setAttribute('fill', view.docked === i ? '#bfe6e1' : '#e3f3f1');
      });
    };
    view.narrate = () => {
      if (view.docked != null) return { key: 'meetDocked', html: `B-lymphocyte ${cells[view.docked].name}'s receptor sits snugly on the antigen, so it <b>binds</b>: this lymphocyte can recognise this bacterium. The others cannot, however many times they meet it.` };
      return { key: 'meet', html: 'Lymph from the wound carries bacteria, and pieces of them, into the lymph node, where they drift past the lymphocytes. A lymphocyte can recognise the bacterium only if its receptor fits the antigen.' };
    };
    return view;
  };

  // =========================================================================
  // Two keys: the dendritic cell, the helper T-lymphocyte and the B-lymphocyte (scene 7)
  // =========================================================================
  views.handshake = function (opts) {
    opts = opts || {};
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'A dendritic cell shows a fragment of the bacterium to helper T-lymphocytes; a helper T-lymphocyte then helps a B-lymphocyte' }, stage);
    const view = { svg, onTh: null, onB: null, stage: 0, chosen: null };
    const body = () => app.sim;
    const P = antigenShape(app.kind, app.strain), k = knobParams(P);
    // One scale for every molecule in this picture: an antigen on the bacterium, a receptor's
    // binding end, and a fragment in an MHC class II molecule are all about the same size, and all
    // far smaller than the bacterium or the cells (though still drawn much larger than life).
    const MW = 12, MH = 16, BW = 13, BH = 17;
    // An MHC class II molecule: a cradle on a short stalk, holding a fragment of the antigen.
    // (x, y) is where it leaves the cell; rot turns "up" to point out of the cell.
    function holder(parent, x, y, rot) {
      const g = svgEl('g', { transform: `translate(${x},${y}) rotate(${rot})` }, parent);
      svgEl('path', { d: 'M0,8 L0,-4', stroke: COL.dc, 'stroke-width': 6 }, g);
      svgEl('path', { d: 'M-17,-4 L-17,-20 M17,-4 L17,-20 M-17,-8 L17,-8', fill: 'none', stroke: COL.dc, 'stroke-width': 4.5, 'stroke-linecap': 'round' }, g);
      svgEl('path', { d: knobPath(k, MW, MH) + ' Z', transform: 'translate(0,-11)', fill: COL.pathogen, stroke: '#7d1f19' }, g);
      return g;
    }
    // dendritic cell
    const dc = svgEl('g', { transform: 'translate(170,250)' }, svg);
    svgEl('path', { d: 'M0,-120 L26,-52 L104,-86 L58,-18 L128,36 L48,40 L40,124 L-6,58 L-78,112 L-52,30 L-128,10 L-58,-28 L-84,-100 L-22,-56 Z', fill: '#dcd9f3', stroke: COL.dc, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }, dc);
    svgEl('ellipse', { rx: 26, ry: 20, fill: COL.dc, opacity: 0.45 }, dc);
    label(svg, 170, 420, 'Dendritic cell', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    small(svg, 170, 440, 'ate bacteria at the wound, then', { 'text-anchor': 'middle' });
    small(svg, 170, 456, 'carried the pieces here', { 'text-anchor': 'middle' });
    for (const [x, y, r] of [[262, 176, 62], [290, 284, 90], [218, 316, 118]]) holder(svg, x, y, r);
    label(svg, 300, 96, 'MHC class II molecules', { 'text-anchor': 'middle', fill: COL.dc, 'font-weight': 650, 'font-size': 14.5 });
    small(svg, 300, 114, 'each holding a fragment', { 'text-anchor': 'middle', fill: COL.dc });
    svgEl('path', { d: 'M292,120 L280,162', stroke: '#9aa0ad' }, svg);
    // ---- helper T-lymphocytes: each can be brought to the dendritic cell to try its receptor on the fragment
    const thG = svgEl('g', {}, svg);
    label(svg, 480, 46, 'Helper T-lymphocytes', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    const thNote = small(svg, 480, 66, 'each has a different receptor', { 'text-anchor': 'middle' });
    const cand = [];
    const DOCK = [290 + 11 + 60, 284];      // a helper's centre when its receptor is on the fragment in the middle MHC molecule
    // a helper T-lymphocyte with its receptor; side = -1: receptor on its left, +1: on its right
    function helperCell(parent, c, side) {
      const g = svgEl('g', {}, parent);
      svgEl('path', { d: `M${26 * side},0 L${40 * side},0`, stroke: COL.Th, 'stroke-width': 6 }, g);
      svgEl('path', { d: cleftBlock(c, MW, MH, 22), transform: `translate(${60 * side},0) rotate(${side < 0 ? 90 : -90})`, fill: '#fff', stroke: COL.Th, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
      const cell = svgEl('circle', { r: 28, fill: '#f2e8f7', stroke: COL.Th, 'stroke-width': 2.5 }, g);
      svgEl('circle', { r: 15, fill: COL.Th, opacity: 0.5 }, g);
      return { g, cell };
    }
    function buildTh(o) {
      o = o || {};
      thG.innerHTML = ''; cand.length = 0; view.chosen = null;
      const lib = body().lib.Th.filter(c => c.present);
      if (!lib.length) { thNote.textContent = 'none: this person has no helper T-lymphocytes'; return; }
      thNote.textContent = 'each has a different receptor';
      const ranked = lib.map(c => ({ c, f: body().fit(c, app.kind, app.strain) })).sort((a, b) => b.f - a.f);
      const rr = rng(app.seed + 77);
      const picks = [ranked[0]]; while (picks.length < Math.min(5, ranked.length)) { const q = ranked[10 + Math.floor(rr() * (ranked.length - 10))]; if (!picks.includes(q)) picks.push(q); }
      for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }
      picks.forEach((q, i) => {
        const cl = cleftParams(q.c, P), st = seat(k, cl, MW, MH), h = helperCell(thG, cl, -1);
        const home = [480, 110 + i * 86];
        const t = { g: h.g, cell: h.cell, c: q.c, f: q.f, d: st.d, home, pos: home.slice(), target: home, wait: 0, name: String(i + 1) };
        small(h.g, 0, 5, t.name, { 'text-anchor': 'middle', fill: '#fff', 'font-weight': 700, 'font-size': 14.5 });
        clickable(h.g, `Helper T-lymphocyte ${i + 1}`, () => view.tryTh(i));
        cand.push(t);
      });
      // on later steps the helper that fits is already at the dendritic cell
      if (o.docked) { const t = cand.find(x => x.f >= GOOD_FIT); if (t) { t.pos = [DOCK[0] + t.d, DOCK[1]]; t.target = t.pos; view.chosen = t.c; } }
    }
    view.tryTh = (i) => {
      const t = cand[i];
      if (!t || view.chosen || cand.some(x => x.busy)) return;
      t.target = [DOCK[0] + t.d, DOCK[1]]; t.busy = true; t.arrived = false;
    };
    // the clone that grows from the selected helper, and one of its cells at the B-lymphocyte
    const cloneBox = { x: 420, y: 112, w: 180, h: 96 };
    const clones = swarm(svg, cloneBox, lymphocyte('Th'));
    const cloneText = label(svg, 512, 232, '', { 'text-anchor': 'middle', fill: COL.Th, 'font-weight': 650, 'font-size': 14.5 });
    const selText = label(svg, DOCK[0] + 6, DOCK[1] + 52, '', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 14.5 });
    // ---- the B-lymphocyte, holding a whole bacterium by one of its receptors
    const CX = 810, CY = 322, CR = 58, BSTEM = 10, BTOP = 24;
    const bestB = body().lib.B.filter(c => c.present).map(c => ({ c, f: body().fit(c, app.kind, app.strain) })).sort((a, b) => b.f - a.f)[0];
    const bc = cleftParams(bestB.c, P);
    // the bacterium: large beside any molecule, covered with copies of its surface antigen
    const RX = 80, RY = 46, BX2 = CX, BY2 = CY - CR - BSTEM - BTOP - RY;
    const bactG = svgEl('g', {}, svg);
    for (let i = 0; i < 10; i++) {
      const th = Math.PI / 2 + i * Math.PI / 5, x = BX2 + RX * Math.cos(th), y = BY2 + RY * Math.sin(th);
      const nu = Math.atan2(Math.sin(th) / RY, Math.cos(th) / RX) * 180 / Math.PI;
      svgEl('path', { d: knobPath(k, BW, BH) + ' Z', transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(nu + 90).toFixed(1)})`, fill: COL.pathogen, stroke: '#7d1f19', 'stroke-width': 1.2 }, bactG);
    }
    svgEl('ellipse', { cx: BX2, cy: BY2, rx: RX, ry: RY, fill: '#cf5a50', stroke: '#7d1f19', 'stroke-width': 2 }, bactG);
    label(svg, BX2, BY2 + 5, 'whole bacterium', { 'text-anchor': 'middle', fill: '#fff', 'font-size': 15.5, 'font-weight': 650 });
    const bG = svgEl('g', { transform: `translate(${CX},${CY})` }, svg);
    // its receptors point outward; the one at the top is sitting on an antigen of the bacterium
    for (const deg of [-90, -150, -30, 30, 90]) {
      const ph = deg * Math.PI / 180, m = CR + BSTEM + BTOP;
      svgEl('path', { d: `M${(CR * Math.cos(ph)).toFixed(1)},${(CR * Math.sin(ph)).toFixed(1)} L${((CR + BSTEM + 2) * Math.cos(ph)).toFixed(1)},${((CR + BSTEM + 2) * Math.sin(ph)).toFixed(1)}`, stroke: COL.B, 'stroke-width': 6 }, bG);
      svgEl('path', { d: cleftBlock(bc, BW, BH, BTOP), transform: `translate(${(m * Math.cos(ph)).toFixed(1)},${(m * Math.sin(ph)).toFixed(1)}) rotate(${deg - 90})`, fill: '#fff', stroke: COL.B, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, bG);
    }
    const bCell = svgEl('circle', { r: CR, fill: '#e3f3f1', stroke: COL.B, 'stroke-width': 3 }, bG);
    svgEl('circle', { r: CR * 0.55, fill: COL.B, opacity: 0.4 }, bG);
    // its own MHC class II molecule, on the side facing the helper T-lymphocytes
    holder(svg, CX - CR - 6, CY, -90);
    small(svg, CX - CR - 18, CY + 44, 'MHC class II', { 'text-anchor': 'end', fill: COL.dc, 'font-weight': 600 });
    small(svg, CX + CR + 18, CY - 46, 'receptor', { fill: '#0b5f59', 'font-weight': 600 });
    label(svg, CX, 446, 'B-lymphocyte', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    small(svg, CX, 465, 'one receptor has caught a whole bacterium; it shows', { 'text-anchor': 'middle' });
    small(svg, CX, 481, 'a fragment of it in an MHC class II molecule', { 'text-anchor': 'middle' });
    clickable(bG, 'B-lymphocyte', () => view.onB && view.onB());
    const bCount = label(svg, CX, 510, '', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 15.5 });
    const abCount = small(svg, CX, 529, '', { 'text-anchor': 'middle', 'font-size': 14.5 });
    small(svg, 300, 548, 'Receptors, antigens and MHC molecules are drawn far larger than life, but all to the same scale as each other.', { 'text-anchor': 'middle', 'font-size': 12.5 });
    // a helper from the clone, at the B-lymphocyte's MHC class II molecule (drawn when the model has helpers to send)
    const atB = svgEl('g', { opacity: 0 }, svg);
    let atBKey = null;
    const helpText = label(svg, CX - CR - 6 - 11 - 60, CY - 44, 'go-ahead', { 'text-anchor': 'middle', fill: COL.Th, 'font-weight': 650, opacity: 0 });
    const marks = numbered(svg, [[1, 60, 150], [2, 196, 92], [3, 372, 40], [4, 706, 196], [5, 760, 392]]);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);
    view.rebuild = (o) => buildTh(o);
    view.candidates = cand;
    buildTh(opts);
    let ph = 0;
    view.update = (dtReal) => {
      const b = body(); if (!(b instanceof Immune)) return;
      ph += dtReal / 1000;
      const kf = Math.min(1, dtReal / 1000 * 5);
      // helpers on the move: one that fits stays on the fragment; one that does not drifts back
      for (const t of cand) {
        t.pos[0] += (t.target[0] - t.pos[0]) * kf; t.pos[1] += (t.target[1] - t.pos[1]) * kf;
        t.g.setAttribute('transform', `translate(${t.pos[0].toFixed(1)},${t.pos[1].toFixed(1)})`);
        if (t.busy && !t.arrived && Math.hypot(t.target[0] - t.pos[0], t.target[1] - t.pos[1]) < 1.5) {
          t.arrived = true;
          const ok = t.f >= GOOD_FIT;
          if (ok) { t.busy = false; view.chosen = t.c; } else t.wait = 1300;
          setAttrs(selText, { fill: ok ? '#1e7a45' : '#8a4b0f' }); selText.textContent = ok ? `${t.name} binds: selected` : `${t.name} does not bind`;
          if (view.onTh) view.onTh(t.c, t.f, cand.indexOf(t));
        } else if (t.busy && t.arrived && t.wait > 0) { t.wait -= dtReal; if (t.wait <= 0) { t.target = t.home; t.busy = false; selText.textContent = ''; } }
        const mine = t.c === view.chosen;
        t.cell.setAttribute('fill', mine ? '#e3c8f1' : '#f2e8f7');
        t.g.setAttribute('opacity', view.chosen && !mine ? 0.1 : 1);
      }
      if (view.chosen && !cand.some(t => t.busy)) { selText.setAttribute('fill', '#1e7a45'); selText.textContent = 'selected'; }
      if (!cand.length) selText.textContent = '';
      // its clone, counted by the model
      const h = view.chosen ? b.helpers : 0;
      clones.set(h < 8 ? 0 : clamp(5 * log10(h) - 2, 2, 22), dtReal, { jitter: 30 });
      cloneText.textContent = h >= 8 ? `its clone: ${fmt(h)} helper T-lymphocytes, all alike` : '';
      // one of the clone at the B-lymphocyte, reading the fragment in its MHC class II molecule
      const help = view.chosen ? sat(b.helpers, b.p.KH) : 0;
      const key = help > 0.2 ? view.chosen.id : null;
      if (key !== atBKey) {
        atBKey = key; atB.innerHTML = '';
        if (key) { const cl = cleftParams(view.chosen, P), st = seat(k, cl, MW, MH); helperCell(atB, cl, 1).g.setAttribute('transform', `translate(${CX - CR - 6 - 11 - 60 - st.d},${CY})`); }
      }
      atB.setAttribute('opacity', key ? 1 : 0);
      helpText.setAttribute('opacity', key ? 0.6 + 0.4 * Math.sin(ph * 4) : 0);
      const sp = b.specific(app.kind, app.strain, 'B');
      bCount.textContent = sp.total > 12 ? `clone of ${fmt(sp.total)} B-lymphocytes` : 'waiting for the go-ahead';
      const ab = b.antibodyTo(app.kind, app.strain);
      abCount.textContent = ab >= 0.05 ? `antibody ${fmtAb(ab)} units` : 'no antibody';
      bCell.setAttribute('fill', sp.effector > 5 ? '#bfe6e1' : '#e3f3f1');
    };
    view.narrate = () => {
      const b = body(); if (!(b instanceof Immune)) return null;
      const h = b.helpers, sp = b.specific(app.kind, app.strain, 'B'), d = IM.dayNow();
      if (!b.lib.Th.some(c => c.present)) return { key: 'noTh', html: `<b>Day ${d.toFixed(1)}.</b> There are no helper T-lymphocytes. The B-lymphocyte has caught its antigen, but nothing gives it the go-ahead: ${fmt(sp.total)} B-lymphocytes that fit, no antibody.` };
      if (!view.chosen) return { key: 'wait', html: 'The dendritic cell holds out a fragment of the bacterium in each MHC class II molecule. A helper T-lymphocyte can recognise it only if its receptor fits the fragment.' };
      if (h < 8) return { key: 'sel', html: 'One helper T-lymphocyte has a receptor that fits the fragment. It has been <b>selected</b>, and being selected switches it on.' };
      if (sp.total < 50) return { key: 'th', html: `<b>Day ${d.toFixed(1)}.</b> The selected helper has divided into a clone of <b>${fmt(h)}</b>, every one with the same receptor. One of them has found the same fragment on the B-lymphocyte.` };
      return { key: 'b', html: `<b>Day ${d.toFixed(1)}.</b> With the go-ahead from the helper T-lymphocytes (${fmt(h)} of them), the B-lymphocyte clone has reached <b>${fmt(sp.total)}</b> cells and is turning into antibody-making <b>plasma cells</b>.` };
    };
    return view;
  };

  // =========================================================================
  // Why two keys (scene 7): a B-lymphocyte whose receptor fits one of the body's own proteins
  // =========================================================================
  views.stray = function () {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': "One of Priya's own cells, and a B-lymphocyte whose receptor fits a protein on it" }, stage);
    const view = { svg };
    const body = () => app.sim;
    const pt = body().selfAntigen(0), k = knobParams(pt);
    const KW = 15, KH = 18, TOP = 27, STEM = 12, R = 44, SELFCOL = '#6f86b3';
    label(svg, 500, 30, "One of Priya's own cells, and a B-lymphocyte that should not exist", { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    // the body's own cell, with one of its normal surface proteins
    const BX = 235, BY = 290, RX = 150, RY = 100;
    for (let i = 0; i < 12; i++) {
      const th = i * Math.PI / 6, x = BX + RX * Math.cos(th), y = BY + RY * Math.sin(th);
      const nu = Math.atan2(Math.sin(th) / RY, Math.cos(th) / RX) * 180 / Math.PI;
      svgEl('path', { d: knobPath(k, KW, KH) + ' Z', transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(nu + 90).toFixed(1)})`, fill: SELFCOL, stroke: '#44597f', 'stroke-width': 1.2 }, svg);
    }
    const own = svgEl('ellipse', { cx: BX, cy: BY, rx: RX, ry: RY, fill: COL.cell, stroke: COL.cellLine, 'stroke-width': 2.5 }, svg);
    svgEl('ellipse', { cx: BX - 20, cy: BY + 6, rx: 46, ry: 34, fill: '#e9d2b0', stroke: COL.cellLine }, svg);
    label(svg, BX, BY - 50, "one of Priya's own cells", { 'text-anchor': 'middle', 'font-size': 15.5, 'font-weight': 650 });
    svgEl('path', { d: `M${BX - 60},${BY - RY - 22} L${BX - 100},${BY - RY - 58}`, stroke: '#9aa0ad' }, svg);
    label(svg, BX - 104, BY - RY - 78, 'one of her own proteins', { 'text-anchor': 'end', 'font-weight': 650, fill: '#44597f' });
    small(svg, BX - 104, BY - RY - 60, 'always there, on healthy cells', { 'text-anchor': 'end' });
    const abOn = swarm(svg, { x: BX - RX - 6, y: BY - RY - 6, w: 2 * RX + 12, h: 2 * RY + 12 }, (g) => antibodyY(g, 1.5));
    // the stray B-lymphocyte, its receptor on that protein
    const clone = body().lib.B.find(c => c.stray) || body().lib.B.filter(c => c.self)[0];
    const c = cleftParams(clone, pt), st = seat(k, c, KW, KH);
    const g = svgEl('g', { transform: `translate(${BX + RX + st.d + TOP + STEM + R},${BY})` }, svg);
    for (let j = 0; j < 8; j++) {
      const ph = Math.PI + j * Math.PI / 4, m = R + STEM + TOP;
      svgEl('path', { d: `M${(R * Math.cos(ph)).toFixed(1)},${(R * Math.sin(ph)).toFixed(1)} L${((R + STEM + 2) * Math.cos(ph)).toFixed(1)},${((R + STEM + 2) * Math.sin(ph)).toFixed(1)}`, stroke: COL.B, 'stroke-width': 5 }, g);
      svgEl('path', { d: cleftBlock(c, KW, KH, TOP), transform: `translate(${(m * Math.cos(ph)).toFixed(1)},${(m * Math.sin(ph)).toFixed(1)}) rotate(${(ph * 180 / Math.PI - 90).toFixed(1)})`, fill: '#fff', stroke: COL.B, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
    }
    const disc = svgEl('circle', { r: R, fill: '#e3f3f1', stroke: COL.B, 'stroke-width': 3 }, g);
    svgEl('circle', { r: R * 0.55, fill: COL.B, opacity: 0.4 }, g);
    small(svg, BX + RX + 130, BY + 108, 'a B-lymphocyte whose receptor', { 'text-anchor': 'middle', fill: '#0b5f59', 'font-weight': 600 });
    small(svg, BX + RX + 130, BY + 126, "fits Priya's own protein", { 'text-anchor': 'middle', fill: '#0b5f59', 'font-weight': 600 });
    // where the helper T-lymphocyte would be
    const hx = 760, hy = 180;
    const empty = svgEl('circle', { cx: hx, cy: hy, r: 34, fill: 'none', stroke: COL.Th, 'stroke-width': 2.5, 'stroke-dasharray': '6 6' }, svg);
    const helpTitle = label(svg, hx, hy + 60, '', { 'text-anchor': 'middle', fill: COL.Th, 'font-weight': 650, 'font-size': 15.5 });
    const helpSub = [0, 1].map(i => small(svg, hx, hy + 80 + i * 18, '', { 'text-anchor': 'middle' }));
    const kids = swarm(svg, { x: 620, y: 300, w: 330, h: 150 }, lymphocyte('B'));
    const count = label(svg, 785, 486, '', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 15.5 });
    const abText = label(svg, 785, 510, '', { 'text-anchor': 'middle', 'font-size': 15.5 });
    view.update = (dtReal) => {
      const b = body(); if (!(b instanceof Immune)) return;
      const sp = b.specificAt(pt, 'B'), ab = b.antibodyAt(pt), one = !b.p.needHelp;
      helpTitle.textContent = one ? 'Imagined: no go-ahead needed' : 'No helper T-lymphocyte fits';
      helpSub[0].textContent = one ? 'the B-lymphocyte may act alone' : "Priya's own protein: those that did";
      helpSub[1].textContent = one ? '' : 'were removed in the thymus';
      empty.setAttribute('opacity', one ? 0.25 : 1);
      kids.set(sp.total < 4 ? 0 : clamp(6 * log10(sp.total), 2, 36), dtReal, { jitter: 40 });
      abOn.set(clamp(8 * log10(ab + 1), 0, 34), dtReal, { jitter: 25 });
      own.setAttribute('fill', ab > 5 ? '#f3cfc4' : COL.cell);
      disc.setAttribute('fill', sp.effector > 5 ? '#bfe6e1' : '#e3f3f1');
      count.textContent = `B-lymphocytes that fit her own protein: ${fmt(sp.total)}`;
      abText.textContent = `Antibody against her own protein: ${fmtAb(ab)}${ab >= 0.05 ? ' units' : ''}`;
      abText.setAttribute('fill', ab > 5 ? '#b0352b' : COL.ink);
    };
    view.narrate = () => {
      const b = body(); if (!(b instanceof Immune)) return null;
      const sp = b.specificAt(pt, 'B'), ab = b.antibodyAt(pt), d = IM.dayNow();
      if (b.p.needHelp) return { key: 'two' + (d > 1), html: `<b>Day ${d.toFixed(1)}.</b> The B-lymphocyte has bound Priya's own protein, and is waiting for a go-ahead. No helper T-lymphocyte can give it: none has a receptor for this protein. ${fmt(sp.total)} cells, no antibody.` };
      if (ab < 1) return { key: 'one0', html: `<b>Day ${d.toFixed(1)}.</b> With no go-ahead needed, binding is enough. The B-lymphocyte has begun to divide: ${fmt(sp.total)} cells.` };
      return { key: 'one1', html: `<b>Day ${d.toFixed(1)}.</b> A clone of <b>${fmt(sp.total)}</b> B-lymphocytes is making antibody against Priya's own cells (<b>${fmtAb(ab)} units</b>). Her own phagocytes will now attack whatever it coats. This is an autoimmune disease.` };
    };
    return view;
  };

  // =========================================================================
  // From B-lymphocyte to plasma cell to antibody (scene 8)
  // =========================================================================
  views.plasma = function () {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'A B-lymphocyte divides into a clone; most of the clone become plasma cells, which release antibody' }, stage);
    const view = { svg };
    const P = antigenShape(app.kind, app.strain), k = knobParams(P);
    const best = app.sim.lib.B.filter(c => c.present).map(c => ({ c, f: app.sim.fit(c, app.kind, app.strain) })).sort((a, b) => b.f - a.f)[0].c;
    const c = cleftParams(best, P);
    const W = 11, H = 14, TOP = 20;
    const defs = svgEl('defs', {}, svg);
    const mk = svgEl('marker', { id: 'arr-plasma', viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs); svgEl('path', { d: 'M0,0 L10,5 L0,10 Z', fill: '#8a90a0' }, mk);
    const arrow = (x1, x2, y, text) => { svgEl('path', { d: `M${x1},${y} L${x2},${y}`, stroke: '#8a90a0', 'stroke-width': 4, 'marker-end': 'url(#arr-plasma)' }, svg); small(svg, (x1 + x2) / 2, y - 12, text, { 'text-anchor': 'middle' }); };
    // a B-lymphocyte drawn with its receptors out
    function bCell(x, y, r, n) {
      const g = svgEl('g', { transform: `translate(${x},${y})` }, svg);
      for (let j = 0; j < n; j++) {
        const ph = -Math.PI / 2 + j * 2 * Math.PI / n, m = r + 8 + TOP * r / 40;
        const sc = r / 40;
        svgEl('path', { d: `M${(r * Math.cos(ph)).toFixed(1)},${(r * Math.sin(ph)).toFixed(1)} L${((r + 9 * sc) * Math.cos(ph)).toFixed(1)},${((r + 9 * sc) * Math.sin(ph)).toFixed(1)}`, stroke: COL.B, 'stroke-width': 4.5 * sc }, g);
        svgEl('path', { d: cleftBlock(c, W, H, TOP), transform: `translate(${((r + (8 + TOP) * sc) * Math.cos(ph)).toFixed(1)},${((r + (8 + TOP) * sc) * Math.sin(ph)).toFixed(1)}) rotate(${(ph * 180 / Math.PI - 90).toFixed(1)}) scale(${sc})`, fill: '#fff', stroke: COL.B, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
        void m;
      }
      svgEl('circle', { r, fill: '#e3f3f1', stroke: COL.B, 'stroke-width': 3 * r / 40 + 1 }, g);
      svgEl('circle', { r: r * 0.58, fill: COL.B, opacity: 0.4 }, g);
      return g;
    }
    // an antibody molecule: a Y whose two tips are the same binding end as the receptor
    function antibody(parent, x, y, sc, rot, withAntigen) {
      const g = svgEl('g', { transform: `translate(${x},${y}) rotate(${rot || 0}) scale(${sc})` }, parent);
      svgEl('path', { d: 'M0,34 L0,6 M0,6 L-17,-12 M0,6 L17,-12', stroke: COL.ab, 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' }, g);
      for (const s of [-1, 1]) {
        const tr = `translate(${s * 31},${-27}) rotate(${s * 43 + 180})`;
        // with an antigen in each binding end, drawn in the same place and direction as the cleft
        if (withAntigen) svgEl('path', { d: knobPath(k, W, H) + ' Z', transform: tr, fill: COL.pathogen, stroke: '#7d1f19' }, g);
        svgEl('path', { d: cleftBlock(c, W, H, TOP), transform: tr, fill: withAntigen ? 'none' : '#fff', stroke: COL.ab, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g);
      }
      return g;
    }
    label(svg, 500, 30, 'What the go-ahead sets off', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    // 1. the selected B-lymphocyte
    bCell(105, 200, 40, 8);
    label(svg, 105, 300, '1  B-lymphocyte', { 'text-anchor': 'middle', 'font-weight': 650 });
    small(svg, 105, 320, 'selected by its antigen,', { 'text-anchor': 'middle' }); small(svg, 105, 338, 'given the go-ahead', { 'text-anchor': 'middle' });
    arrow(190, 262, 200, 'divides');
    // 2. its clone
    for (const [x, y] of [[330, 150], [400, 150], [330, 222], [400, 222], [365, 290]]) bCell(x, y, 19, 6);
    label(svg, 365, 356, '2  A clone', { 'text-anchor': 'middle', 'font-weight': 650 });
    small(svg, 365, 376, 'thousands of cells with', { 'text-anchor': 'middle' }); small(svg, 365, 394, 'the same receptor', { 'text-anchor': 'middle' });
    arrow(458, 530, 200, 'most become');
    // 3. a plasma cell: bigger, packed with protein-making machinery, no receptors on its surface
    const pc = svgEl('g', { transform: 'translate(640,200)' }, svg);
    svgEl('ellipse', { rx: 82, ry: 60, fill: '#d9efec', stroke: COL.B, 'stroke-width': 3 }, pc);
    for (let i = 0; i < 5; i++) svgEl('path', { d: `M${-10 + i * 2},${-40 + i * 19} C${14},${-48 + i * 19} ${44},${-30 + i * 19} ${66 - Math.abs(i - 2) * 8},${-38 + i * 19}`, fill: 'none', stroke: '#5fa8a1', 'stroke-width': 3 }, pc);
    svgEl('circle', { cx: -42, cy: 4, r: 26, fill: COL.B, opacity: 0.45 }, pc);
    label(svg, 640, 300, '3  Plasma cell', { 'text-anchor': 'middle', 'font-weight': 650 });
    small(svg, 640, 320, 'an antibody factory: no longer', { 'text-anchor': 'middle' }); small(svg, 640, 338, 'divides, lives a few days', { 'text-anchor': 'middle' });
    arrow(734, 800, 200, 'releases');
    // 4. antibody
    for (const [x, y, r] of [[850, 120, -20], [915, 160, 25], [860, 215, 10], [935, 255, -30], [870, 300, 35]]) antibody(svg, x, y, 0.62, r);
    label(svg, 890, 356, '4  Antibody', { 'text-anchor': 'middle', 'font-weight': 650, fill: COL.ab });
    small(svg, 890, 376, 'thousands of molecules', { 'text-anchor': 'middle' }); small(svg, 890, 394, 'every second', { 'text-anchor': 'middle' });
    // the point: an antibody is the receptor, set free, with two binding ends
    svgEl('rect', { x: 150, y: 420, width: 700, height: 122, rx: 12, fill: '#fff', stroke: '#d9d6cc' }, svg);
    const rg = svgEl('g', { transform: 'translate(250,512)' }, svg);
    svgEl('path', { d: 'M-60,14 L60,14', stroke: COL.B, 'stroke-width': 5 }, rg); svgEl('path', { d: 'M0,14 L0,-6', stroke: COL.B, 'stroke-width': 6 }, rg);
    svgEl('path', { d: cleftBlock(c, W, H, TOP), transform: 'translate(0,-26) rotate(180)', fill: '#fff', stroke: COL.B, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, rg);
    small(svg, 250, 444, 'receptor: fixed in the', { 'text-anchor': 'middle', fill: '#0b5f59', 'font-weight': 600 }); small(svg, 250, 460, "B-lymphocyte's membrane", { 'text-anchor': 'middle', fill: '#0b5f59', 'font-weight': 600 });
    antibody(svg, 500, 498, 0.9, 0, true);
    label(svg, 690, 470, 'antibody: the same binding end,', { 'text-anchor': 'middle', 'font-size': 14.5, fill: COL.ab, 'font-weight': 600 });
    label(svg, 690, 490, 'twice over, released into the fluid', { 'text-anchor': 'middle', 'font-size': 14.5, fill: COL.ab, 'font-weight': 600 });
    small(svg, 690, 512, 'each tip fits the same antigen (red)', { 'text-anchor': 'middle' });
    return view;
  };

  // =========================================================================
  // A dish: bacteria, antibody, phagocytes (scene 8)
  // =========================================================================
  views.dish = function () {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'Bacteria in a dish, with or without antibody and phagocytes' }, stage);
    const view = { svg };
    svgEl('ellipse', { cx: 400, cy: 290, rx: 340, ry: 230, fill: '#f4f7fb', stroke: '#aab4c6', 'stroke-width': 6 }, svg);
    svgEl('ellipse', { cx: 400, cy: 290, rx: 318, ry: 208, fill: '#fdf8ee', stroke: '#d9d6cc' }, svg);
    const box = { x: 190, y: 150, w: 420, h: 280 };
    const bact = swarm(svg, box, bacterium), phag = swarm(svg, box, neutrophil);
    label(svg, 400, 46, 'A dish of bacteria in warm broth', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    svgEl('rect', { x: 760, y: 120, width: 220, height: 300, rx: 12, fill: '#fff', stroke: '#d9d6cc' }, svg);
    const rows = ['Bacteria', 'Antibody', 'Coated', 'Phagocytes'].map((t, i) => { small(svg, 776, 154 + i * 68, t, { 'font-size': 14.5 }); return label(svg, 776, 180 + i * 68, '', { 'font-size': 20, 'font-weight': 650 }); });
    view.update = (dtReal) => {
      const d = app.sim; if (d instanceof Immune || !d) return;
      const nb = d.bacteria <= 0 ? 0 : clamp(9 * log10(d.bacteria) - 14, 2, 70);
      bact.set(nb, dtReal, { jitter: 40, each: (p, i) => p.el.coat.setAttribute('opacity', i < Math.round(d.coated * nb) ? 1 : 0) });
      phag.set(clamp(d.phagocytes / 40, 0, 30), dtReal, { jitter: 90 });
      rows[0].textContent = fmt(d.bacteria); rows[1].textContent = d.antibody > 0 ? `${fmt(d.antibody)} units` : 'none';
      rows[2].textContent = pct(d.coated); rows[3].textContent = d.phagocytes > 0 ? fmt(d.phagocytes) : 'none';
    };
    view.narrate = () => {
      const d = app.sim; if (d instanceof Immune || !d) return null;
      const h = Math.round(d.t - app.zero);
      if (d.bacteria <= 0) return { key: 'gone', html: `<b>${h} h.</b> No bacteria left. The phagocytes swallowed the coated bacteria far faster than the bacteria could divide.` };
      if (d.phagocytes > 0 && d.antibody > 0) return { key: 'both', html: `<b>${h} h.</b> The phagocytes have receptors for the stem of the antibody, so a coated bacterium is easy to grip and swallow: ${fmt(d.bacteria)} left.` };
      if (d.phagocytes > 0) return { key: 'phag', html: `<b>${h} h.</b> The phagocytes are eating bacteria, but this bacterium is slippery and they catch few: ${fmt(d.bacteria)} and rising.` };
      if (d.antibody > 0) return { key: 'ab', html: `<b>${h} h.</b> ${pct(d.coated)} of the bacteria are coated with antibody. They are still alive and still dividing: ${fmt(d.bacteria)}.` };
      return { key: 'plain', html: `<b>${h} h.</b> ${fmt(d.bacteria)} bacteria, doubling every 90 minutes.` };
    };
    return view;
  };

  // =========================================================================
  // Reading MHC class I windows by hand (scene 11)
  // =========================================================================
  views.windows = function () {
    const svg = svgEl('svg', { viewBox: '0 0 1000 560', role: 'img', 'aria-label': 'A row of airway cells, each showing fragments of the proteins it is making' }, stage);
    const view = { svg, onCell: null, patch: null, reveal: false };
    label(svg, 500, 44, 'A row of cells lining the airway, seen from the side', { 'text-anchor': 'middle', 'font-weight': 650, 'font-size': 16.5 });
    label(svg, 500, 92, 'MHC class I molecules: every cell shows fragments of the proteins it is making', { 'text-anchor': 'middle', fill: '#4a5468', 'font-size': 14.5, 'font-weight': 600 });
    svgEl('path', { d: 'M500,100 L500,184', stroke: '#9aa0ad' }, svg);
    const lg = svgEl('g', { transform: 'translate(250,470)' }, svg);
    svgEl('rect', { x: 0, y: 0, width: 500, height: 70, rx: 10, fill: '#fff', stroke: '#d9d6cc' }, lg);
    svgEl('circle', { cx: 24, cy: 22, r: 6, fill: '#8a93a6' }, lg); svgEl('rect', { x: 44, y: 16, width: 12, height: 12, fill: '#8a93a6' }, lg);
    small(lg, 68, 27, "fragments of the cell's own proteins", { 'font-size': 14.5, fill: COL.ink });
    svgEl('path', { d: 'M24,42 L31,56 L17,56 Z', fill: COL.pathogen, stroke: '#7d1f19' }, lg);
    small(lg, 68, 54, 'a fragment of a viral protein', { 'font-size': 14.5, fill: COL.ink });
    const cellsG = svgEl('g', {}, svg);
    const marks = numbered(svg, [[1, 30, 300], [2, 30, 208], [3, 232, 505]]);
    view.setMarks = (on) => marks.setAttribute('opacity', on ? 1 : 0);
    let els = [];
    view.setPatch = (patch) => {
      view.patch = patch; cellsG.innerHTML = ''; els = [];
      const n = patch.cells.length, w = 900 / n;
      patch.cells.forEach((c, i) => {
        const x = 50 + i * w, g = svgEl('g', { transform: `translate(${x + w / 2},0)` }, cellsG);
        const bodyEl = svgEl('rect', { x: -w / 2 + 3, y: 230, width: w - 6, height: 170, rx: 12, fill: COL.cell, stroke: COL.cellLine, 'stroke-width': 2 }, g);
        const nuc = svgEl('ellipse', { cx: 0, cy: 340, rx: w * 0.24, ry: 26, fill: '#e9d2b0', stroke: COL.cellLine }, g);
        // three windows (MHC class I holders) on the cell's upper surface
        const frags = [];
        for (let j = 0; j < 3; j++) {
          const hx = (j - 1) * (w * 0.3);
          svgEl('path', { d: `M${hx - 9.5},230 L${hx - 9.5},198 M${hx + 9.5},230 L${hx + 9.5},198 M${hx - 9.5},220 L${hx + 9.5},220`, fill: 'none', stroke: '#6b7385', 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
          frags.push(svgEl('g', { transform: `translate(${hx},208)` }, g));
        }
        const cross = svgEl('path', { d: 'M-22,290 L22,340 M22,290 L-22,340', stroke: '#6b7385', 'stroke-width': 6, 'stroke-linecap': 'round', opacity: 0 }, g);
        const out = swarm(g, { x: -w / 2 + 6, y: 120, w: w - 12, h: 60 }, virion);
        const tag = small(g, 0, 424, '', { 'text-anchor': 'middle', 'font-size': 13.5 });
        clickable(g, `Cell ${i + 1}`, () => view.onCell && view.onCell(i));
        els.push({ g, bodyEl, nuc, frags, cross, out, tag, shown: null });
      });
    };
    view.update = (dtReal) => {
      const p = view.patch; if (!p) return;
      p.cells.forEach((c, i) => {
        const e = els[i], viral = p.shows(i), key = c.state + viral;
        e.out.set(c.state === 'releasing' ? 4 : 0, dtReal, { jitter: 60 });
        if (e.shown === key) return;
        e.shown = key;
        e.frags.forEach((f, j) => {
          f.innerHTML = '';
          if (c.state === 'dead' || c.state === 'killed') return;
          if (viral && j === 1) svgEl('path', { d: 'M0,-10 L8.5,6 L-8.5,6 Z', fill: COL.pathogen, stroke: '#7d1f19' }, f);
          else if ((i + j) % 2) svgEl('circle', { r: 6.5, fill: '#8a93a6' }, f); else svgEl('rect', { x: -6, y: -6, width: 12, height: 12, fill: '#8a93a6' }, f);
        });
        const gone = c.state === 'dead' || c.state === 'killed';
        setAttrs(e.bodyEl, { fill: gone ? '#e4e2dc' : COL.cell, 'stroke-dasharray': gone ? '5 4' : 'none', opacity: gone ? 0.7 : 1 });
        e.nuc.setAttribute('opacity', gone ? 0.2 : 1);
        e.cross.setAttribute('opacity', c.state === 'killed' ? 1 : 0);
        e.tag.textContent = c.state === 'killed' ? (c.was === 'healthy' ? 'killed (was healthy)' : 'killed') : c.state === 'dead' ? 'died after releasing' : c.state === 'releasing' ? 'releasing virus' : '';
        e.tag.setAttribute('fill', c.was === 'healthy' ? '#b0352b' : COL.muted);
      });
    };
    view.narrate = () => {
      const p = view.patch; if (!p) return null;
      return { key: 'patch' + p.t + p.infected + p.healthy, html: `<b>${p.t.toFixed(0)} h.</b> ${p.healthy} healthy cells, ${p.infected} infected, ${p.lost} lost. From outside, an infected cell looks like any other: the only sign is the fragment in its MHC class I molecule.` };
    };
    return view;
  };

  IM.shapes = { knobParams, cleftParams, knobPath, cleftBlock, dockPicture, seat };
})();
