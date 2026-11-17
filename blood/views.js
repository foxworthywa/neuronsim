/* BloodSim views. Each view draws on the shared canvas from the model's state:
 *   field    a blood smear at low power: red cells, platelets and a few white cells to find
 *   lineup   the five white cells side by side at high power
 *   bench    a patch of tissue beside a small vessel, with one problem and the cells sent to it
 *   flow     reserve → blood → tissues for the five cells, with the count as a lab report
 *   scope    one white cell at a time under oil, for the count of 100
 *   reports  lab reports to read
 * Cells are painted as they look after Wright's stain, to scale with a red cell. */
(function () {
  'use strict';
  const { app, clamp, fmt, perUL, pct1, cap, hotspots, setSide, reportHTML, clockText } = BL;
  const { Blood, Bench, rng, TYPES, NAMES, CELL, RBC_PER_UL, DAY } = BloodSim;
  const TAU = Math.PI * 2;

  // =========================================================================
  // Painting cells. R is the radius of a red cell in pixels; every cell is drawn to that scale.
  // =========================================================================
  const SIZE = { rbc: 1, neut: 1.7, eos: 1.75, baso: 1.5, lymph: 1.18, mono: 2.15, macro: 2.9 };
  const NUC = '#4b2d85';
  function blob(c, r, rand, wob) {
    const p1 = rand() * TAU, p2 = rand() * TAU;
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * TAU, rr = r * (1 + wob * Math.sin(3 * a + p1) + 0.6 * wob * Math.sin(5 * a + p2));
      if (i) c.lineTo(rr * Math.cos(a), rr * Math.sin(a)); else c.moveTo(rr * Math.cos(a), rr * Math.sin(a));
    }
    c.closePath();
  }
  function granules(c, n, r, size, colors, rand) {
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, d = Math.sqrt(rand()) * (r - size);
      c.fillStyle = colors[Math.floor(rand() * colors.length)];
      c.beginPath(); c.arc(d * Math.cos(a), d * Math.sin(a), size * (0.8 + 0.4 * rand()), 0, TAU); c.fill();
    }
  }
  // Lobes of a nucleus strung along an arc, joined by thin strands.
  function lobes(c, r, k, rand, fill) {
    const ring = k === 2 ? 0.36 * r : 0.43 * r, step = k === 2 ? Math.PI : (1.05 + 0.25 * rand()), a0 = rand() * TAU, pts = [];
    for (let i = 0; i < k; i++) pts.push([ring * Math.cos(a0 + i * step), ring * Math.sin(a0 + i * step)]);
    c.strokeStyle = fill; c.lineWidth = Math.max(1, 0.075 * r); c.lineCap = 'round';
    c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
    c.fillStyle = fill;
    for (const p of pts) { c.beginPath(); c.ellipse(p[0], p[1], r * (k === 2 ? 0.36 : 0.27 + 0.06 * rand()), r * (k === 2 ? 0.3 : 0.23 + 0.05 * rand()), rand() * TAU, 0, TAU); c.fill(); }
  }
  function paintCell(c, type, R, seed) {
    const rand = rng((seed * 2654435761 + type.length * 97 + type.charCodeAt(0)) >>> 0), r = SIZE[type] * R;
    c.save();
    c.rotate(rand() * TAU);
    c.lineWidth = Math.max(0.6, R * 0.04);
    if (type === 'rbc') {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, '#f8e0d9'); g.addColorStop(0.36, '#f1c0b6'); g.addColorStop(0.74, '#e8978c'); g.addColorStop(1, '#df8479');
      blob(c, r * 0.97, rand, 0.025); c.fillStyle = g; c.fill(); c.strokeStyle = 'rgba(186,98,92,.55)'; c.stroke();
    } else if (type === 'neut') {
      blob(c, r, rand, 0.03); c.fillStyle = '#f8e6e6'; c.fill(); c.strokeStyle = 'rgba(160,110,135,.6)'; c.stroke();
      c.save(); c.clip(); granules(c, Math.round(70), r, r * 0.032, ['rgba(178,118,170,.55)', 'rgba(200,140,170,.5)'], rand); c.restore();
      lobes(c, r, 3 + Math.floor(rand() * 3), rand, NUC);
    } else if (type === 'eos') {
      blob(c, r, rand, 0.03); c.fillStyle = '#f5c9ae'; c.fill(); c.strokeStyle = 'rgba(170,95,60,.6)'; c.stroke();
      c.save(); c.clip(); granules(c, 95, r, r * 0.085, ['#e2552b', '#d9481f', '#ec6a3a'], rand); c.restore();
      lobes(c, r, 2, rand, NUC);
      granules(c, 7, r * 0.8, r * 0.08, ['#e2552b', '#ec6a3a'], rand);
    } else if (type === 'baso') {
      blob(c, r, rand, 0.03); c.fillStyle = '#eadcf1'; c.fill(); c.strokeStyle = 'rgba(90,60,130,.6)'; c.stroke();
      lobes(c, r, 2, rand, '#8367b3');
      c.save(); blob(c, r, rand, 0.03); c.clip(); granules(c, 46, r, r * 0.125, ['#2a1a63', '#3a2380', '#241456'], rand); c.restore();
    } else if (type === 'lymph') {
      blob(c, r, rand, 0.025); c.fillStyle = '#9ec0ec'; c.fill(); c.strokeStyle = 'rgba(70,100,160,.6)'; c.stroke();
      c.fillStyle = '#3f2672'; c.beginPath(); c.arc(r * 0.09, 0, r * 0.83, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.arc(r * 0.09, 0, r * 0.83, 0, TAU); c.clip(); granules(c, 14, r * 0.8, r * 0.1, ['rgba(40,20,80,.5)', 'rgba(95,70,150,.35)'], rand); c.restore();
    } else {          // monocyte, and the macrophage it grows into
      const macro = type === 'macro';
      blob(c, r, rand, macro ? 0.09 : 0.045); c.fillStyle = macro ? '#c3cbdc' : '#b6c1d8'; c.fill(); c.strokeStyle = 'rgba(85,100,135,.65)'; c.stroke();
      c.save(); c.clip();
      granules(c, 40, r, r * 0.02, ['rgba(110,120,160,.35)'], rand);
      granules(c, macro ? 9 : 4, r, r * (macro ? 0.1 : 0.075), ['rgba(250,250,255,.85)'], rand);
      c.restore();
      const a0 = rand() * TAU;
      c.strokeStyle = '#7a5fb0'; c.lineCap = 'round'; c.lineWidth = r * (macro ? 0.42 : 0.6);
      c.beginPath(); c.arc(r * 0.06, 0, r * (macro ? 0.3 : 0.34), a0, a0 + 3.75); c.stroke();
      c.strokeStyle = 'rgba(60,40,110,.35)'; c.lineWidth = r * 0.08;
      c.beginPath(); c.arc(r * 0.06, 0, r * 0.34, a0 + 0.3, a0 + 3.4); c.stroke();
    }
    c.restore();
  }
  // Cells are painted once into small off-screen pictures and stamped from there.
  const sprites = new Map();
  function sprite(type, R, seed) {
    const dpr = window.devicePixelRatio || 1, key = `${type}|${R}|${seed}|${dpr}`;
    let s = sprites.get(key);
    if (!s) {
      if (sprites.size > 900) sprites.clear();
      const half = Math.ceil(SIZE[type] * R * 1.12 + 2), cv = document.createElement('canvas');
      cv.width = cv.height = Math.ceil(2 * half * dpr);
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, half * dpr, half * dpr);
      paintCell(c, type, R, seed);
      s = { cv, half }; sprites.set(key, s);
    }
    return s;
  }
  function stamp(c, type, x, y, R, seed, alpha) {
    const s = sprite(type, R, seed);
    if (alpha != null && alpha < 1) { c.globalAlpha = Math.max(0, alpha); c.drawImage(s.cv, x - s.half, y - s.half, 2 * s.half, 2 * s.half); c.globalAlpha = 1; }
    else c.drawImage(s.cv, x - s.half, y - s.half, 2 * s.half, 2 * s.half);
  }
  // A small picture of a cell for buttons and tables.
  const icons = {};
  BL.icon = (type, px) => {
    px = px || 26;
    const key = type + px;
    if (!icons[key]) {
      const cv = document.createElement('canvas'); cv.width = cv.height = px * 2;
      const c = cv.getContext('2d'); c.setTransform(2, 0, 0, 2, px, px);
      paintCell(c, type, (px / 2 - 1) / SIZE[type], 3);
      icons[key] = cv.toDataURL();
    }
    return `<img src="${icons[key]}" width="${px}" height="${px}" alt="">`;
  };
  const label = (c, text, x, y, o) => { o = o || {}; c.font = `${o.weight || 400} ${o.size || 12}px system-ui, sans-serif`; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle'; if (o.halo) { c.lineWidth = 3; c.strokeStyle = o.halo; c.strokeText(text, x, y); } c.fillStyle = o.color || '#5f6675'; c.fillText(text, x, y); };
  const poisson = (mean, rand) => { const L = Math.exp(-mean); let k = 0, p = 1; do { k++; p *= rand(); } while (p > L); return k - 1; };

  // =========================================================================
  // field: a smear at low power. Find the cells that have a nucleus.
  // =========================================================================
  BL.views.field = function () {
    const R = 6, found = new Set();
    let built = null, picture = null, msg = null, types = null;
    const self = { cells: [], found, misses: 0, rbcCount: 0 };
    function build(W, H) {
      const rand = rng(app.seed * 7919 + 13), rbcs = [], sx = 2.16 * R, sy = sx * 0.87;
      for (let j = 0, y = R + 2; y < H - R; j++, y += sy) for (let x = R + 2 + (j % 2) * sx / 2; x < W - R; x += sx) {
        if (rand() < 0.1) { rand(); rand(); continue; }
        rbcs.push({ x: x + (rand() - 0.5) * 0.3 * R, y: y + (rand() - 0.5) * 0.3 * R, v: Math.floor(rand() * 4) });
      }
      // how many white cells: what the blood gives for this many red cells (a field that holds 3 to 5)
      const blood = new Blood(), mean = rbcs.length * blood.total / RBC_PER_UL;
      if (!types) { let n; do { n = poisson(mean, rand); } while (n < 3 || n > 5); types = blood.cells(n, rand); }
      const cells = [];
      for (const type of types) {
        let x, y, tries = 0;
        do { x = 60 + rand() * (W - 120); y = 50 + rand() * (H - 100); } while (tries++ < 200 && cells.some(k => Math.hypot(k.x - x, k.y - y) < 110));
        cells.push({ type, x, y, seed: Math.floor(rand() * 1e6), r: SIZE[type] * R });
      }
      const keep = rbcs.filter(b => !cells.some(k => Math.hypot(k.x - b.x, k.y - b.y) < k.r + R * 0.75));
      const platelets = [];
      for (let i = 0; i < keep.length / 20; i++) platelets.push({ x: rand() * W, y: rand() * H, n: 1 + Math.floor(rand() * 3) });
      const dpr = window.devicePixelRatio || 1;
      picture = document.createElement('canvas'); picture.width = W * dpr; picture.height = H * dpr;
      const c = picture.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#fbf7f1'; c.fillRect(0, 0, W, H);
      for (const b of keep) stamp(c, 'rbc', b.x, b.y, R, b.v);
      c.fillStyle = 'rgba(120,80,170,.8)';
      for (const p of platelets) for (let i = 0; i < p.n; i++) { c.beginPath(); c.arc(p.x + i * 2.4, p.y + (i % 2) * 2, 1.5, 0, TAU); c.fill(); }
      for (const k of cells) stamp(c, k.type, k.x, k.y, R, k.seed);
      self.cells = cells; self.rbcs = keep; self.rbcCount = keep.length; self.platelets = platelets;
      built = `${W}x${H}`;
      hotspots(cells.map((k, i) => ({ x: k.x, y: k.y, r: k.r + 7, label: 'A cell with a nucleus', run: () => self.onCell(i) }))
        .concat(keep.filter((b, i) => i % 577 === 5).map(b => ({ x: b.x, y: b.y, r: R + 2, label: 'A cell with no nucleus', run: () => self.onOther('rbc') }))));
    }
    self.onCell = (i) => { found.add(i); msg = null; };
    self.onOther = (what) => { self.misses++; msg = what === 'platelet' ? 'Those purple specks are <b>platelets</b>: fragments of a cell, with no nucleus. Look for something larger than a red cell.' : 'That is a <b>red blood cell</b>: a pink disc with a pale center and no nucleus. Look for a cell with something purple inside.'; };
    self.click = (x, y) => {
      const i = self.cells.findIndex(k => Math.hypot(k.x - x, k.y - y) < k.r + 7);
      if (i >= 0) return self.onCell(i);
      if (self.platelets.some(p => Math.hypot(p.x - x, p.y - y) < 6) && !self.rbcs.some(b => Math.hypot(b.x - x, b.y - y) < R * 0.8)) return self.onOther('platelet');
      if (self.rbcs.some(b => Math.hypot(b.x - x, b.y - y) < R * 1.1)) self.onOther('rbc');
    };
    self.draw = (c, W, H) => {
      if (built !== `${W}x${H}`) build(W, H);
      c.drawImage(picture, 0, 0, W, H);
      for (const i of found) { const k = self.cells[i]; c.strokeStyle = '#1e7a45'; c.lineWidth = 2.5; c.beginPath(); c.arc(k.x, k.y, k.r + 7, 0, TAU); c.stroke(); }
    };
    self.narrate = () => {
      const n = self.cells.length;
      if (msg) return { key: 'miss' + self.misses, html: msg };
      if (found.size === n) return { key: 'all', html: `All ${n} found, among about ${fmt(Math.round(self.rbcCount / 100) * 100)} red cells. Blood holds roughly <b>700 red cells for every white cell</b>.` };
      return { key: 'f' + found.size, html: `Cells with a nucleus found: <b>${found.size} of ${n}</b>.` };
    };
    return self;
  };

  // =========================================================================
  // lineup: the five white cells at high power, lettered, each beside a red cell for scale
  // =========================================================================
  BL.views.lineup = function (o) {
    const rand = rng(app.seed * 31 + 7), order = TYPES.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const self = { order, named: (o && o.named) || {} };
    self.draw = (c, W, H) => {
      c.fillStyle = '#fbf7f1'; c.fillRect(0, 0, W, H);
      const R = clamp(Math.floor(W / 30), 16, 30), gap = W / 5, y = H * 0.44;
      order.forEach((t, i) => {
        const x = gap * (i + 0.5) - R * 0.6;
        stamp(c, 'rbc', x + SIZE[t] * R + R * 0.9, y + R * 1.5, R, i);
        stamp(c, t, x - R * 0.3, y, R, 11 + i);
        const L = 'ABCDE'[i];
        label(c, L, x - R * 0.3, y + R * 3.1, { size: 20, weight: 700, color: '#1f2430' });
        if (self.named[t]) label(c, cap(NAMES[t]), x - R * 0.3, y + R * 3.1 + 24, { size: 14, weight: 600, color: '#1e7a45' });
      });
      label(c, 'The pink disc beside each one is a red blood cell, for scale (about 7.5 µm across).', W / 2, H - 22, { size: 13 });
    };
    self.letter = (t) => 'ABCDE'[order.indexOf(t)];
    return self;
  };

  // =========================================================================
  // bench: tissue beside a vessel; one problem; the cells the student sends
  // =========================================================================
  const DRAWN_PER = { neut: 300, mono: 150, macro: 200, eos: 100, baso: 6, lymph: 400 };
  BL.views.bench = function (o) {
    const problem = o.problem, R = 5.5, rand = rng(app.seed + 101);
    const stream = [], agents = [], props = [], specks = [], puffs = [];
    let W = 0, H = 0, vh = 64, lining = null, wormPhase = 0, lastSim = null;
    const self = { problem, agents, props };
    const vTop = 22;
    const wbcType = () => { let u = rand() * 7000; for (const k of TYPES) { if (u < CELL[k].n0) return k; u -= CELL[k].n0; } return 'neut'; };
    const centre = () => ({ x: W / 2, y: vTop + vh + (H - vTop - vh) * (problem === 'virus' ? 0.4 : 0.52) });
    const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
    function wormPoint(u) { const cx = centre(); return { x: cx.x + (u - 0.5) * Math.min(460, W - 120), y: cx.y + 22 * Math.sin(u * 7 + wormPhase) }; }
    function target(a) {
      const cx = centre(), b = app.sim;
      if (problem === 'worm' && a.slot != null) { const p = wormPoint(a.slot); return { x: p.x, y: p.y + (a.below ? 15 : -15) }; }
      if (problem === 'virus' && a.type === 'lymph' && a.clone && lining) { const inf = lining.filter(k => k.infected); if (inf.length) { const k = inf[Math.floor(rand() * inf.length)]; return { x: k.x, y: k.y - 4 }; } }
      if ((problem === 'bacteria' || problem === 'debris') && props.length && (a.type === 'neut' || a.type === 'macro' || a.type === 'mono')) { const p = props[Math.floor(rand() * props.length)]; return { x: p.x + gauss() * 12, y: p.y + gauss() * 12 }; }
      if (problem === 'pollen') { const g = self.grains[Math.floor(rand() * self.grains.length)]; return { x: g.x + gauss() * 26, y: g.y + gauss() * 22 }; }
      void b;
      return { x: cx.x + gauss() * Math.min(190, W * 0.24), y: cx.y + gauss() * 46 };
    }
    function reconcile(type, want) {
      const mine = agents.filter(a => a.type === type && !a.dying && !a.clone);
      want = Math.min(55, want);
      for (let i = mine.length; i < want; i++) {
        const a = { type, seed: Math.floor(rand() * 5), x: 0, y: vTop + vh - 6, age: 0, fade: 0, think: 0 };
        if (problem === 'worm' && type !== 'lymph' && type !== 'baso') { a.slot = rand(); a.below = rand() < 0.5; }
        const t = target(a); a.tx = t.x; a.ty = t.y; a.x = clamp(t.x + gauss() * 70, 20, W - 20);
        agents.push(a);
      }
      for (let i = want; i < mine.length; i++) mine[i - want].dying = true;
    }
    function ensureProps(want, spread) {
      const cx = centre();
      while (props.length < want) props.push({ x: cx.x + gauss() * spread, y: cx.y + gauss() * 52, a: rand() * TAU, s: rand() });
      while (props.length > want) {
        // the one that goes is the one nearest a phagocyte
        const eaters = agents.filter(a => !a.dying && (a.type === 'neut' || a.type === 'macro'));
        let best = Math.floor(rand() * props.length);
        if (eaters.length) { const e = eaters[Math.floor(rand() * eaters.length)]; let d = 1e9; props.forEach((p, i) => { const q = Math.hypot(p.x - e.x, p.y - e.y); if (q < d) { d = q; best = i; } }); }
        props.splice(best, 1);
      }
    }
    self.draw = (c, w, h, dt) => {
      const b = app.sim instanceof Bench ? app.sim : null;
      W = w; H = h;
      const s = dt / 1000;
      vh = 64 + 34 * (b ? b.leak : 0);
      if (!self.grains || (b && lastSim !== b)) {            // a new run: start the picture again
        agents.length = 0; props.length = 0; specks.length = 0; puffs.length = 0; lining = null; lastSim = b;
        const cx = centre();
        self.grains = Array.from({ length: 9 }, (_, i) => ({ x: cx.x + (i - 4) * Math.min(56, W / 14) + gauss() * 10, y: cx.y + gauss() * 34, a: rand() * TAU }));
      }
      // tissue
      c.fillStyle = '#fbf1e4'; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(201,169,131,.11)';
      const tr = rng(4);       // the tissue's own cells, faint, in the same places every frame
      for (let i = 0; i < 34; i++) { const x = tr() * W, y = vTop + 98 + 30 + tr() * Math.max(40, H - vTop - 98 - 50); c.beginPath(); c.ellipse(x, y, 30 + tr() * 14, 17 + tr() * 8, tr() * 3, 0, TAU); c.fill(); }
      if (b && b.leak > 0.01) { c.fillStyle = `rgba(120,170,225,${0.3 * b.leak})`; c.fillRect(0, vTop + vh, W, H); }
      // the vessel, with blood moving through it
      c.fillStyle = '#f6dcd8'; c.fillRect(0, vTop, W, vh);
      if (!stream.length) { for (let i = 0; i < 70; i++) stream.push({ type: 'rbc', x: rand() * 1400, lane: rand(), v: 55 + rand() * 30, seed: i % 4 }); for (let i = 0; i < 10; i++) stream.push({ type: wbcType(), x: rand() * 1400, lane: rand() < 0.5 ? 0.12 : 0.88, v: 20 + rand() * 12, seed: i % 5 }); }
      for (const p of stream) {
        p.x += p.v * s;
        if (p.x > W + 30) { p.x = -30; if (p.type !== 'rbc') p.type = wbcType(); }
        stamp(c, p.type, p.x, vTop + 9 + p.lane * (vh - 18), R, p.seed);
      }
      c.strokeStyle = '#d08d86'; c.lineWidth = 4; c.setLineDash(b && b.leak > 0.25 ? [26, 9] : []);
      c.beginPath(); c.moveTo(0, vTop); c.lineTo(W, vTop); c.moveTo(0, vTop + vh); c.lineTo(W, vTop + vh); c.stroke(); c.setLineDash([]);
      label(c, 'a small blood vessel', 12, vTop - 10, { align: 'left', size: 12 });
      label(c, 'tissue', 12, vTop + vh + 16, { align: 'left', size: 12 });
      const cx = centre();
      // ----- the problem
      if (problem === 'bacteria' || problem === 'debris') {
        if (b) ensureProps(problem === 'bacteria' ? (b.bacteria >= 1 ? Math.round(14 * Math.log10(b.bacteria + 1)) : 0) : 0, Math.min(170, W * 0.22));
        for (const p of props) { c.save(); c.translate(p.x + Math.sin(p.a + performance.now() / 600) * 1.2, p.y); c.rotate(p.a); c.fillStyle = '#b8322a'; c.beginPath(); c.roundRect(-4, -1.6, 8, 3.2, 1.6); c.fill(); c.restore(); }
      }
      // dead cells: wherever the model has debris
      if (b) {
        const want = Math.min(150, Math.round(b.debris / 380));
        while (specks.length < want) specks.push({ x: cx.x + gauss() * Math.min(190, W * 0.24), y: cx.y + gauss() * 55, r: 3 + rand() * 3, a: rand() * TAU });
        while (specks.length > want) {
          const eaters = agents.filter(a => a.type === 'macro' && !a.dying); let best = Math.floor(rand() * specks.length);
          if (eaters.length) { const e = eaters[Math.floor(rand() * eaters.length)]; let d = 1e9; specks.forEach((p, i) => { const q = Math.hypot(p.x - e.x, p.y - e.y); if (q < d) { d = q; best = i; } }); }
          specks.splice(best, 1);
        }
        for (const p of specks) { c.fillStyle = 'rgba(150,138,122,.85)'; c.beginPath(); c.ellipse(p.x, p.y, p.r * 1.3, p.r * 0.8, p.a, 0, TAU); c.fill(); c.fillStyle = 'rgba(95,70,140,.55)'; c.beginPath(); c.arc(p.x, p.y, p.r * 0.4, 0, TAU); c.fill(); }
      }
      if (problem === 'worm') {
        const alive = !b || b.worm > 0;
        if (alive) wormPhase += s * 1.4;
        const health = b ? b.worm : 1;
        c.lineCap = 'round'; c.lineJoin = 'round';
        for (const [wd, col] of [[19, alive ? '#a9794f' : '#8d8a84'], [15, alive ? `rgb(${226 - 40 * (1 - health)},${180 - 30 * (1 - health)},${138 - 10 * (1 - health)})` : '#bdb9b1']]) {
          c.strokeStyle = col; c.lineWidth = wd; c.beginPath();
          for (let i = 0; i <= 60; i++) { const p = wormPoint(i / 60); if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y); }
          c.stroke();
        }
        c.strokeStyle = 'rgba(120,80,40,.35)'; c.lineWidth = 1;
        for (let i = 2; i < 60; i += 2) { const p = wormPoint(i / 60); c.beginPath(); c.moveTo(p.x, p.y - 7); c.lineTo(p.x, p.y + 7); c.stroke(); }
        // damage to its surface, as the model's "intact" falls
        const holes = Math.round((1 - health) * 46), hr = rng(77);
        c.fillStyle = '#5b2a16';
        for (let i = 0; i < holes; i++) { const p = wormPoint(0.03 + 0.94 * hr()); c.beginPath(); c.arc(p.x + (hr() - 0.5) * 6, p.y + (hr() - 0.5) * 12, 2 + hr() * 2.4, 0, TAU); c.fill(); }
        label(c, alive ? 'the larva of a parasitic worm, about 1 mm long (a white cell is about 0.015 mm)' : 'the larva is dead', cx.x, cx.y + 62, { size: 12, halo: '#fbf1e4' });
        if (b && b.degranulating && rand() < 0.5) { const at = agents.filter(a => a.type === 'eos' && a.slot != null && Math.hypot(a.x - a.tx, a.y - a.ty) < 6); if (at.length) { const a = at[Math.floor(rand() * at.length)]; puffs.push({ x: a.x, y: a.y, vx: gauss() * 8, vy: (a.below ? -1 : 1) * (8 + rand() * 8), life: 1, col: '#e2552b' }); } }
      }
      if (problem === 'pollen') {
        for (const g of self.grains) {
          c.save(); c.translate(g.x, g.y); c.rotate(g.a);
          c.fillStyle = '#e5b92e'; c.strokeStyle = '#a57d0d'; c.lineWidth = 1;
          c.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, rr = i % 2 ? 11 : 7.5; if (i) c.lineTo(rr * Math.cos(a), rr * Math.sin(a)); else c.moveTo(rr * Math.cos(a), rr * Math.sin(a)); } c.closePath(); c.fill(); c.stroke();
          c.restore();
        }
        label(c, 'grass pollen on the lining of the nose', cx.x, cx.y + 70, { size: 12, halo: '#fbf1e4' });
        if (b && b.histamine > 0.02) { const src = agents.filter(a => a.type === 'baso'); if (src.length && rand() < Math.min(1, b.histamine)) { const a = src[Math.floor(rand() * src.length)]; puffs.push({ x: a.x, y: a.y, vx: gauss() * 26, vy: -14 - rand() * 26, life: 1, col: '#d63c8a' }); } }
      }
      if (problem === 'virus') {
        const cols = Math.max(8, Math.min(16, Math.floor((W - 80) / 46))), rows = 3, cw = (W - 80) / cols, ch = 30, y0 = H - 22 - rows * ch;
        if (!lining || lining.length !== cols * rows) {
          lining = [];
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) lining.push({ x: 40 + (i + 0.5) * cw, y: y0 + (j + 0.5) * ch, i, j, rank: 0 });
          const start = lining[Math.floor(cols / 2) + cols];
          lining.forEach(k => { k.rank = Math.hypot(k.i - start.i, (k.j - start.j) * 1.4) + rand() * 1.6; });
          lining.slice().sort((a, b2) => a.rank - b2.rank).forEach((k, n) => { k.order = n; });
        }
        const nInf = b ? Math.round(b.infected / 1000 * lining.length) + (b.infected >= 1 && b.infected < 1000 / lining.length / 2 ? 1 : 0) : 1;
        for (const k of lining) {
          k.infected = k.order < nInf;
          c.fillStyle = k.infected ? '#f3c58a' : '#f6e2c8'; c.strokeStyle = k.infected ? '#c56a12' : '#c9a983'; c.lineWidth = 1.2;
          c.beginPath(); c.roundRect(k.x - cw / 2 + 2, k.y - ch / 2 + 2, cw - 4, ch - 4, 6); c.fill(); c.stroke();
          c.fillStyle = 'rgba(120,90,150,.5)'; c.beginPath(); c.ellipse(k.x, k.y, 6, 4.5, 0, 0, TAU); c.fill();
          if (k.infected) { c.fillStyle = '#b8322a'; for (let n = 0; n < 5; n++) { c.beginPath(); c.arc(k.x - 12 + n * 6, k.y + (n % 2 ? 7 : -7), 1.7, 0, TAU); c.fill(); } }
        }
        label(c, 'cells lining the airway (each drawn cell stands for about ' + Math.round(1000 / lining.length) + '); red dots: virus being made inside', W / 2, y0 - 10, { size: 12, halo: '#fbf1e4' });
      }
      // ----- the cells that were sent
      if (b) {
        for (const t of ['neut', 'mono', 'eos', 'baso']) reconcile(t, Math.round(b.site[t] / DRAWN_PER[t] + (b.site[t] > 0.5 ? 0.5 : 0)));
        reconcile('macro', Math.round(b.macrophages / DRAWN_PER.macro + (b.macrophages > 20 ? 0.5 : 0)));
        reconcile('lymph', Math.round(b.site.lymph / DRAWN_PER.lymph));
        if (problem === 'virus') { const want = b.clone >= 1 ? Math.round(1 + 4.5 * Math.log10(b.clone)) : 0; const have = agents.filter(a => a.clone && !a.dying); for (let i = have.length; i < want; i++) { const a = { type: 'lymph', clone: true, seed: i % 5, x: cx.x + gauss() * 150, y: vTop + vh - 6, age: 0, fade: 0, think: 0 }; const t = target(a); a.tx = t.x; a.ty = t.y; agents.push(a); } }
      }
      for (let i = agents.length - 1; i >= 0; i--) {
        const a = agents[i];
        a.age += s; a.think -= s;
        if (a.dying) { a.fade -= s * 1.5; if (a.fade <= 0) { agents.splice(i, 1); continue; } } else a.fade = Math.min(1, a.fade + s * 2.5);
        if (a.think <= 0 && !(a.slot != null)) { a.think = 1.5 + rand() * 2.5; if (a.type === 'lymph' && !a.clone) { a.tx = a.x + 60 + rand() * 60; a.ty = cx.y + gauss() * 50; } else { const t = target(a); a.tx = t.x; a.ty = t.y; } }
        if (a.slot != null) { const t = target(a); a.tx = t.x; a.ty = t.y; }
        const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy), sp = 70 * s;
        if (d > 1) { a.x += dx / d * Math.min(sp, d); a.y += dy / d * Math.min(sp, d); }
        if (a.type === 'lymph' && !a.clone && a.x > W + 20) a.dying = true;
        stamp(c, a.type, a.x, a.y, R, a.seed, a.fade);
      }
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.life -= s * 0.8; if (p.life <= 0) { puffs.splice(i, 1); continue; } p.x += p.vx * s; p.y += p.vy * s; c.globalAlpha = p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, 2.2, 0, TAU); c.fill(); c.globalAlpha = 1; }
      if (b && b.leak > 0.3) label(c, 'the vessel has widened and is leaking fluid into the tissue: swelling', W - 14, vTop + vh + 16, { align: 'right', size: 12, color: '#23497f', halo: '#fbf1e4' });
    };
    self.narrate = () => {
      const b = app.sim instanceof Bench ? app.sim : null;
      if (!b || !b.sent) return { key: 'idle', html: 'Blood is moving through the vessel. No white cell has been called out yet.' };
      const t = b.sent, name = NAMES[t] + 's', when = clockText(b.t, b.hours > 100);
      const there = t === 'mono' ? `<b>${fmt(b.site.mono)}</b> monocytes and <b>${fmt(b.macrophages)}</b> macrophages grown from them` : t === 'lymph' && problem === 'virus' ? `<b>${fmt(b.clone)}</b> lymphocytes that can act against this virus` : `<b>${fmt(b.site[t])}</b> ${name}`;
      const m = b.measure, what = problem === 'worm' ? `the larva is <b>${Math.round(100 * m.value)} %</b> intact` : problem === 'pollen' ? `swelling <b>${Math.round(100 * m.value)} %</b> of the worst` : `${m.label.toLowerCase().replace(' (of 1,000)', '')}: <b>${fmt(m.value)}</b>`;
      return { key: `${problem}${t}${Math.floor(b.t / (b.hours / 6))}`, html: `${cap(when)}. At the site: ${there}; ${what}.` };
    };
    return self;
  };

  // =========================================================================
  // flow: where the cells in the blood come from and go to, and the count as a lab report
  // =========================================================================
  BL.views.flow = function () {
    const R = 4.6, rand = rng(app.seed + 55), agents = [], leaving = [];
    let lastT = null, lastSim = null, sideClock = 1e9, slots = null, slotKey = '';
    const self = { agents };
    const SIDE = 396;
    self.draw = (c, W, H, dt) => {
      const b = app.sim instanceof Blood ? app.sim : null;
      c.fillStyle = '#f6f5f0'; c.fillRect(0, 0, W, H);
      if (!b) return;
      const fresh = lastSim !== b;
      if (fresh) { agents.length = 0; leaving.length = 0; lastSim = b; lastT = b.t; }
      const simDt = Math.max(0, b.t - lastT); lastT = b.t;
      const x0 = 12, x3 = W - SIDE - 20, wide = x3 - x0, y0 = 34, y1 = H - 12;
      const A = { x: x0, w: wide * 0.25 }, B = { x: x0 + wide * 0.32, w: wide * 0.44 }, T = { x: x0 + wide * 0.83, w: wide * 0.17 };
      const box = (r, top, bot, fill, line) => { c.fillStyle = fill; c.strokeStyle = line; c.lineWidth = 1.5; c.beginPath(); c.roundRect(r.x, top, r.w, bot - top, 10); c.fill(); c.stroke(); };
      const split = y0 + (y1 - y0) * 0.72;
      box(A, y0, split - 8, '#fbf3e6', '#c9a983'); box(A, split, y1, '#eef3e2', '#9db579');
      box(B, y0, y1, '#f6dcd8', '#d08d86'); box(T, y0, y1, '#fbf1e4', '#c9a983');
      label(c, 'Bone marrow', A.x + A.w / 2, y0 - 12, { size: 12, weight: 600, color: '#1f2430' });
      label(c, 'Blood', B.x + B.w / 2, y0 - 12, { size: 12, weight: 600, color: '#1f2430' });
      label(c, 'Tissues', T.x + T.w / 2, y0 - 12, { size: 12, weight: 600, color: '#1f2430' });
      label(c, 'Lymph nodes', A.x + A.w / 2, split + 16, { size: 12, weight: 600, color: '#1f2430' });
      label(c, 'and spleen', A.x + A.w / 2, split + 31, { size: 12, weight: 600, color: '#1f2430' });
      if (y1 - split > 76) { label(c, 'where most', A.x + A.w / 2, split + 52, { size: 11.5 }); label(c, 'lymphocytes are', A.x + A.w / 2, split + 66, { size: 11.5 }); }
      // the marrow's reserve, drawn at a scale that leaves room for it to grow
      const cols = Math.max(4, Math.floor((A.w - 12) / 10.5)), rowsN = Math.max(4, Math.floor((split - 8 - y0 - 46) / 10.5));
      const per = Math.max(100, Math.ceil(CELL.neut.reserve * CELL.neut.n0 * 1.6 / (cols * rowsN) / 50) * 50);
      if (slotKey !== `${cols}x${rowsN}`) { slotKey = `${cols}x${rowsN}`; const r2 = rng(9); slots = []; for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) slots.push({ i, j, k: r2() }); slots.sort((p, q) => p.k - q.k); }
      let n = 0;
      for (const t of ['neut', 'mono', 'eos', 'baso']) {
        const want = Math.round(b.reserve[t] / per);
        for (let i = 0; i < want && n < slots.length; i++, n++) { const sl = slots[n]; stamp(c, t, A.x + 11 + sl.i * 10.5, y0 + 12 + sl.j * 10.5, 2.9, sl.i % 3); }
      }
      label(c, 'finished cells, waiting', A.x + A.w / 2, split - 34, { size: 11, halo: '#fbf3e6' });
      label(c, `1 drawn = ${fmt(per)} per µL`, A.x + A.w / 2, split - 20, { size: 11, halo: '#fbf3e6' });
      // the blood: each cell drawn is 100 per microliter; a cell crosses in the time it spends in the blood
      for (const t of TYPES) {
        const want = Math.round(b.n[t] / 100), mine = agents.filter(a => a.type === t);
        // on a fresh picture the cells are already spread along the road; after that, new ones enter at the left
        for (let i = mine.length; i < want; i++) agents.push({ type: t, age: fresh || simDt > CELL[t].tau / 2 ? rand() * CELL[t].tau * 0.6 : 0, lane: rand(), seed: Math.floor(rand() * 5) });
        for (let i = want; i < mine.length; i++) mine[mine.length - 1 - (i - want)].age = 1e9;
      }
      for (let i = agents.length - 1; i >= 0; i--) {
        const a = agents[i], tau = CELL[a.type].tau / (1 + CELL[a.type].gExit * b.call(a.type));
        a.age += simDt;
        if (simDt > tau / 2 && a.age < 1e8) a.age = rand() * tau;      // the clock jumped: the cells now on the road are spread along it
        if (a.age >= tau) { agents.splice(i, 1); if (a.age < 1e8) leaving.push({ type: a.type, x: T.x + 10 + rand() * (T.w - 20), y: y0 + 100 + a.lane * (y1 - y0 - 124), life: 1, seed: a.seed, back: a.type === 'lymph' }); continue; }
        stamp(c, a.type, B.x + 10 + (a.age / tau) * (B.w - 20), y0 + 16 + a.lane * (y1 - y0 - 32), R, a.seed);
      }
      for (let i = leaving.length - 1; i >= 0; i--) { const p = leaving[i]; p.life -= dt / 1600; if (p.life <= 0) { leaving.splice(i, 1); continue; } stamp(c, p.type, p.x, p.y, R, p.seed, p.life); }
      label(c, 'each cell drawn = 100 per µL', B.x + B.w / 2, y1 - 12, { size: 11, halo: '#f6dcd8' });
      // arrows, as wide as the flow is large
      const base = TYPES.filter(t => t !== 'lymph').reduce((s2, t) => s2 + CELL[t].n0 / CELL[t].tau, 0), rel = TYPES.filter(t => t !== 'lymph').reduce((s2, t) => s2 + b.flow.release[t], 0);
      const arrow = (xa, xb, y, wd, col) => { c.strokeStyle = col; c.fillStyle = col; c.lineWidth = wd; c.lineCap = 'butt'; c.beginPath(); c.moveTo(xa, y); c.lineTo(xb - 8, y); c.stroke(); c.beginPath(); c.moveTo(xb, y); c.lineTo(xb - 10, y - wd / 2 - 4); c.lineTo(xb - 10, y + wd / 2 + 4); c.closePath(); c.fill(); };
      arrow(A.x + A.w + 3, B.x - 3, y0 + (split - y0) * 0.45, clamp(5 * rel / base, 3, 26), '#b9895a');
      arrow(A.x + A.w + 3, B.x - 3, (split + y1) / 2, clamp(5 * b.flow.release.lymph / (CELL.lymph.n0 / CELL.lymph.tau), 3, 22), '#7fa257');
      const out = TYPES.reduce((s2, t) => s2 + b.flow.exit[t], 0), out0 = TYPES.reduce((s2, t) => s2 + CELL[t].n0 / CELL[t].tau, 0);
      arrow(B.x + B.w + 3, T.x - 3, (y0 + y1) / 2, clamp(5 * out / out0, 3, 26), '#b9895a');
      // who the tissues are calling for
      const calling = TYPES.filter(t => b.call(t) > 0.08 && t !== 'baso' && t !== 'mono').concat(b.expansion() > 0.15 ? ['lymph'] : []);
      if (calling.length) {
        const ph = (performance.now() / 900) % 1;
        c.strokeStyle = `rgba(224,164,0,${1 - ph})`; c.lineWidth = 2.5; c.beginPath(); c.arc(T.x + T.w / 2, y0 + 30, 6 + 20 * ph, 0, TAU); c.stroke();
        label(c, calling[0] === 'lymph' ? 'a virus' : 'calling for', T.x + T.w / 2, y0 + 66, { size: 11.5, weight: 600, color: '#8a5a00' });
        if (calling[0] !== 'lymph') label(c, NAMES[calling[0]] + 's', T.x + T.w / 2, y0 + 81, { size: 11.5, weight: 600, color: '#8a5a00' });
      }
      sideClock += dt;
      if (sideClock > 250) {
        sideClock = 0;
        const days = b.t >= 72;
        setSide(reportHTML(b.report(), { title: 'White cell count', when: app.reportClock === false ? '' : clockText(b.t - (app.zero || 0), days), before: app.before, icons: !app.before, tight: true, note: 'Flags: <b style="color:#b0352b">H</b> above and <b style="color:#2457a6">L</b> below the reference range. Reference, %: neutrophils 40–60, lymphocytes 20–40, monocytes 2–8, eosinophils 0–4, basophils 0–1.' }) + (app.flowNote ? `<div class="name" style="margin:0">${app.flowNote}</div>` : ''), 'wide');
      }
    };
    return self;
  };

  // =========================================================================
  // scope: one white cell in view at a time, as under the oil-immersion lens
  // =========================================================================
  BL.views.scope = function () {
    let cur = null, around = [], shown = 0;
    const self = {};
    self.show = (type, seed) => {
      const rand = rng(seed * 131 + 9);
      cur = { type, seed }; around = []; shown = 0;
      for (let i = 0; i < 26; i++) { const a = rand() * TAU, d = 3.4 + rand() * 9; const p = { x: d * Math.cos(a), y: d * Math.sin(a), v: Math.floor(rand() * 4) }; if (!around.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 2.05)) around.push(p); }
    };
    self.current = () => cur;
    self.draw = (c, W, H, dt) => {
      const SIDE = 330, cx = (W - SIDE) / 2, cy = H / 2, rad = Math.min((W - SIDE) / 2, H / 2) - 8, R = rad / 9.5;
      c.fillStyle = '#16181d'; c.fillRect(0, 0, W, H);
      c.save(); c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.clip();
      c.fillStyle = '#fbf7f1'; c.fillRect(0, 0, W, H);
      if (cur) {
        shown = Math.min(1, shown + dt / 220);
        for (const p of around) stamp(c, 'rbc', cx + p.x * R, cy + p.y * R, R, p.v, shown);
        stamp(c, cur.type, cx, cy, R, 1000 + cur.seed, shown);
      }
      c.restore();
      c.strokeStyle = '#000'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, rad, 0, TAU); c.stroke();
    };
    return self;
  };

  // reports: nothing to draw; the lesson fills the stage with lab reports
  BL.views.reports = function () {
    return { draw(c, W, H) { c.fillStyle = '#f6f5f0'; c.fillRect(0, 0, W, H); } };
  };

  Object.assign(BL, { paintCell, stamp, SIZE });
})();
