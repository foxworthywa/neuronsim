/* KidneySim app core: shared state, the simulation clock, the day graph (the blood, which stays
 * nearly flat, over the urine, which swings) and the wiring to the lesson runner. The model lives
 * in engine.js, the pictures in views.js, the lesson in lesson.js. Everything drawn is read from
 * the model. */
(function () {
  'use strict';

  const { Kidney, Bench, HOUR, DAY } = KidneySim;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (sel) => document.querySelector(sel);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const htmlEl = Lesson.htmlEl;
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

  // Numbers as a first-year student reads them.
  const fx = (x, dp) => (x == null || !isFinite(x) ? '—' : x.toFixed(dp == null ? 1 : dp));
  const signed = (x, dp) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(dp == null ? 1 : dp)).replace(/^[+−](0(\.0+)?)$/, '$1');
  const flow = (x) => (x == null || !isFinite(x) ? '—' : x < 0.05 ? '0' : x < 9.95 ? x.toFixed(1) : String(Math.round(x)));
  const big = (x) => (x == null || !isFinite(x) ? '—' : Math.round(x).toLocaleString('en-US'));
  // Clock time of a simulation time (minutes after midnight on the first day).
  function clockTime(t, days) {
    const d = Math.floor(t / DAY + 1e-9), m = Math.round(t - d * DAY), h = Math.floor(m / 60), mm = m % 60;
    const s = `${((h + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
    return days ? `${days[d % days.length]} ${s}` : s;
  }

  const COL = {
    water: '#3b8fd9', na: '#e8772e', k: '#8e5cf0', glucose: '#2f9e5b', urea: '#8a6d3b', cr: '#5f6675', alb: '#b0478a', drug: '#d0372d', toxin: '#d0372d', acid: '#c98a1b',
    rbc: '#c0392b', blood: '#f4d5d0', bloodLine: '#c9837b', bloodDark: '#b8322a', vein: '#eecfd3',
    tubule: '#fdf4dc', tubuleLine: '#c9a54a', urine: '#e9c543', kidney: '#b96a5a', kidneyDark: '#8a4336', cortex: '#e3a898', medulla: '#c9796a',
    skin: '#f0dcc8', skinLine: '#c9a983', ink: '#1f2430', muted: '#5f6675', ghost: '#9aa0ad', good: '#2f9e5b', band: 'rgba(47,158,91,0.16)',
    adh: '#1f6fb5', aldo: '#b3560f', machine: '#dfe6ee', machineLine: '#7d8aa0',
  };
  // The colour of urine at a given dilution (0 colourless … 1 dark amber).
  function urineColour(c) {
    c = clamp(c, 0, 1);
    const a = [250, 246, 214], b = [226, 160, 22], m = [242, 214, 96];
    const mix = (p, q, f) => p.map((v, i) => Math.round(v + (q[i] - v) * f));
    const rgb = c < 0.5 ? mix(a, m, c / 0.5) : mix(m, b, (c - 0.5) / 0.5);
    return `rgb(${rgb.join(',')})`;
  }
  const colourWord = (c) => (c < 0.12 ? 'almost colourless' : c < 0.3 ? 'pale yellow' : c < 0.55 ? 'yellow' : c < 0.8 ? 'dark yellow' : 'amber');

  // =========================================================================
  // Shared state
  // =========================================================================
  const app = {
    sim: null,                // what the clock advances: a Kidney (a person) or a Bench
    speed: 8, userSpeed: null, paused: false,
    clock: 'idle',            // 'free': time runs; 'idle': time runs only during an experiment
    run: null,                // {until, onDone}
    history: [], sampleDt: 2, lastSample: -1e9, zero: 0,
    markers: [], autoMark: true,
    graph: null, meters: null, days: null,
    range: null,              // {T, inT, test}: time spent in range while the student is in control
    view: null, viewName: null, viewOpts: null,
    lastFrame: null,
  };

  function setSim(sim) { app.sim = sim; app.run = null; app.range = null; clearHistory(); }
  function clearHistory() { app.history = []; app.markers = []; app.lastSample = -1e9; app.zero = app.sim ? app.sim.t : 0; recordSample(true); }
  function sample() {
    const b = app.sim;
    if (b instanceof Kidney) {
      const u = b.f.urine;
      return { t: b.t, weight: b.weight, water: b.waterExcess, salt: b.saltExcess, k: b.potassium, bun: b.bun, cr: b.creatinine, osm: b.osmolarity, na: b.sodium, flow: u.flow, uosm: u.flow > 0.02 ? u.osm : null, gfr: b.f.gfr, map: b.f.map, adh: b.w, aldo: b.a, naOut: b.f.ex.na * 60 / KidneySim.SALT };
    }
    const L = b.level;
    return { t: b.t, drug: L.drug, urea: L.urea, potassium: L.potassium, kept: Math.min(L.water, L.salt, L.glucose) };
  }
  function recordSample(force) {
    const b = app.sim;
    if (!b) return;
    if (!force && b.t - app.lastSample < app.sampleDt * 0.999) return;
    app.lastSample = b.t;
    app.history.push(sample());
  }
  const pendingEvents = [];
  function advanceSim(dt) {
    let left = dt, guard = 0;
    while (left > 1e-9 && guard++ < 100000) {
      const b = app.sim, r = app.run;
      let h = Math.min(left, app.sampleDt);
      if (r) h = Math.min(h, r.until - b.t);
      if (!(h > 1e-9)) { if (r && b.t >= r.until - 1e-6) finishRun(); break; }
      {
        b.advance(h); left -= h;
        if (app.range) { app.range.T += h; if (app.range.test(b)) app.range.inT += h; }
      }
      if (b.takeEvents) for (const e of b.takeEvents()) {
        pendingEvents.push(e);
        if (app.autoMark && e.type === 'script') app.markers.push({ t: e.t, label: e.label });
      }
      recordSample();
      if (b.dead && r) { finishRun(); break; }
      if (r && b.t >= r.until - 1e-6) { finishRun(); break; }
      if (h <= 1e-9 && !r) break;
    }
  }
  // Run an experiment: the clock runs for `duration` minutes.
  function startRun(o) {
    app.run = { until: app.sim.t + o.duration, onDone: o.onDone };
    if (o.speed && app.userSpeed == null) setSpeed(o.speed);
    setPaused(false);
  }
  function finishRun() { const r = app.run; app.run = null; narrClock = 1e9; recordSample(true); if (r && r.onDone) r.onDone(); }
  // Jump to the end of the current experiment at once (used by the automated walkthrough).
  function fastFinish() { if (app.run) advanceSim(app.run.until - app.sim.t + 1e-3); }
  // Advance without animation (e.g. to rebuild a day that has already been watched).
  const skip = (dt) => { advanceSim(dt); pendingEvents.length = 0; };
  const mark = (label, t) => app.markers.push({ t: t == null ? app.sim.t : t, label });

  // =========================================================================
  // Views (registered by views.js)
  // =========================================================================
  const stage = $('#stage');
  const views = {};
  function mountView(name, opts) {
    stage.innerHTML = '';
    app.viewOpts = opts || {}; app.viewOptsGiven = opts || null;
    app.view = views[name](opts || {});
    app.viewName = name;
    $('#stage-caption').textContent = (opts && opts.caption) || '';
  }

  // =========================================================================
  // The day graph: a few rows, each with its own scale and (for blood values) its normal band
  // =========================================================================
  const ROWS = {
    weight: { label: 'weight', unit: 'kg', color: '#374151', dp: 1 },
    water: { label: 'water in the body, compared with normal', unit: 'L', color: COL.water, dp: 2, lo: -1.2, hi: 1.2, band: [-0.75, 0.75], signed: true },
    salt: { label: 'salt in the body, compared with normal', unit: 'g', color: COL.na, dp: 1, lo: -5, hi: 6, band: [-3, 3], signed: true },
    osm: { label: 'blood: concentration', unit: 'mOsm/L', color: COL.water, dp: 0, lo: 278, hi: 302, band: [285, 295] },
    k: { label: 'blood: potassium', unit: 'mmol/L', color: COL.k, dp: 1, lo: 3.2, hi: 5.6, band: [3.5, 5.0] },
    bun: { label: 'blood: urea (BUN)', unit: 'mg/dL', color: COL.urea, dp: 0, lo: 0, hi: 40, band: [7, 20] },
    cr: { label: 'blood: creatinine', unit: 'mg/dL', color: COL.cr, dp: 1, lo: 0, hi: 2, band: [0.6, 1.2] },
    gfr: { label: 'filtering rate (GFR)', unit: 'mL/min', color: '#374151', dp: 0, lo: 0, hi: 140 },
    flow: { label: 'urine: flow', unit: 'mL/min', color: COL.urine, dp: 1, lo: 0, hi: 4, dark: '#a37a00' },
    uosm: { label: 'urine: concentration', unit: 'mOsm/L', color: '#b0763a', dp: 0, lo: 0, hi: 1300, ref: [290, 'as concentrated as blood'] },
    naOut: { label: 'urine: salt leaving', unit: 'g/h', color: COL.na, dp: 2, lo: 0, hi: 1 },
    drug: { label: 'the new drug in her body', unit: 'doses', color: COL.drug, dp: 1, lo: 0, hi: 2 },
    kept: { label: 'water, salt and glucose left', unit: '× normal', color: COL.water, dp: 2, lo: 0, hi: 1.1, band: [0.9, 1.1] },
    urea: { label: 'urea in her body', unit: '× normal', color: COL.urea, dp: 2, lo: 0, hi: 2, band: [0.8, 1.2] },
  };
  const canvas = $('#trace');
  function drawGraph() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const cfg = app.graph;
    if (!cfg || !cfg.rows.length || !app.sim) return;
    const W = cfg.window, now = app.sim.t;
    const t0 = Math.max(app.zero, now - W), t1 = t0 + W;
    const padL = 58, padR = 74, padT = 15, padB = 17, gap = 7;
    c.font = '11px system-ui, sans-serif';
    const X = (t) => padL + (t - t0) / W * (w - padL - padR);
    const n = cfg.rows.length, rowH = (h - padT - padB - gap * (n - 1)) / n;
    // time axis
    const stepOpts = [30, 60, 120, 180, 240, 360, 720, 1440, 2880];
    const step = stepOpts.find(s => W / s <= 9) || 2880;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let t = Math.ceil(t0 / step - 1e-9) * step; t <= t1 + 1e-6; t += step) {
      c.strokeStyle = '#e6e3da'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(t), padT); c.lineTo(X(t), h - padB); c.stroke();
      c.fillStyle = '#7b8190';
      const label = cfg.clock ? clockTime(t, W > DAY ? app.days : null) : (W > 3 * DAY ? `day ${Math.round((t - app.zero) / DAY)}` : `${Math.round((t - app.zero) / HOUR)} h`);
      if (X(t) > padL + 14 && X(t) < w - padR - 14 || t === t0) c.fillText(label, X(t), h - padB + 3);
    }
    cfg.rows.forEach((key, i) => {
      const R = Object.assign({}, ROWS[key], (cfg.over && cfg.over[key]) || {});
      const top = padT + i * (rowH + gap), bottom = top + rowH;
      let lo = R.lo, hi = R.hi;
      for (const s of app.history) { const v = s[key]; if (v == null) continue; if (lo == null || v < lo) lo = v; if (hi == null || v > hi) hi = v; }
      if (lo == null) { lo = 0; hi = 1; }
      if (R.lo == null || R.hi == null) { const pad = Math.max(0.3, (hi - lo) * 0.25); lo -= pad; hi += pad; }
      else if (hi > R.hi) hi += (hi - lo) * 0.08;
      if (lo < (R.lo == null ? lo : R.lo)) lo -= (hi - lo) * 0.08;
      const Y = (v) => bottom - (clamp(v, lo, hi) - lo) / (hi - lo) * rowH;
      c.fillStyle = '#fbfaf6'; c.fillRect(padL, top, w - padL - padR, rowH);
      if (R.band) { c.fillStyle = COL.band; c.fillRect(padL, Y(Math.min(R.band[1], hi)), w - padL - padR, Y(Math.max(R.band[0], lo)) - Y(Math.min(R.band[1], hi))); }
      if (R.ref && R.ref[0] > lo && R.ref[0] < hi) { c.strokeStyle = '#b9b3a2'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(padL, Y(R.ref[0])); c.lineTo(w - padR, Y(R.ref[0])); c.stroke(); c.setLineDash([]); c.fillStyle = '#8a8676'; c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText(R.ref[1], w - padR - 4, Y(R.ref[0]) - 1); }
      // scale: bottom and top values
      c.fillStyle = '#7b8190'; c.textAlign = 'right'; c.textBaseline = 'alphabetic';
      const tick = (v) => (R.signed ? signed(v, Math.abs(v) < 10 && v % 1 ? 1 : 0) : fx(v, Math.abs(hi - lo) < 5 ? 1 : 0));
      if (R.band && R.band[0] > lo && R.band[1] < hi && Y(R.band[0]) - Y(R.band[1]) > 12) { c.fillStyle = '#4c8f66'; c.textBaseline = 'middle'; for (const v of R.band) c.fillText(tick(v), padL - 5, clamp(Y(v), top + 5, bottom - 5)); }
      else { c.fillText(tick(R.lo != null && lo <= R.lo ? R.lo : lo), padL - 5, bottom); c.textBaseline = 'top'; c.fillText(tick(hi), padL - 5, top); }
      // the trace
      c.strokeStyle = R.color; c.lineWidth = 2.2; c.beginPath(); let first = true, last = null;
      for (const s of app.history) {
        if (s.t < t0 - 1e-6 || s.t > t1 + 1e-6) continue;
        if (s[key] == null) { first = true; continue; }
        const x = X(s.t), y = Y(s[key]); if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); last = s;
      }
      c.stroke();
      // label and current value
      c.textAlign = 'left'; c.textBaseline = 'top'; c.font = '600 11.5px system-ui, sans-serif';
      c.lineWidth = 3; c.strokeStyle = '#fbfaf6'; c.strokeText(`${R.label} (${R.unit})`, padL + 6, top + 3);
      c.fillStyle = R.dark || R.color; c.fillText(`${R.label} (${R.unit})`, padL + 6, top + 3);
      if (last) {
        const v = last[key], out = R.band && (v < R.band[0] || v > R.band[1]);
        c.font = '700 13px system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillStyle = out ? '#b0352b' : (R.dark || R.color);
        c.fillText(R.signed ? signed(v, R.dp) : fx(v, R.dp), w - padR + 6, clamp(Y(v), top + 8, bottom - 8));
        c.font = '11px system-ui, sans-serif';
        if (out) { c.fillStyle = '#b0352b'; c.fillText(v > R.band[1] ? 'HIGH' : 'LOW', w - padR + 6, clamp(Y(v), top + 8, bottom - 8) + 13); }
      }
      c.font = '11px system-ui, sans-serif';
    });
    // events, along the top
    c.textAlign = 'left'; c.textBaseline = 'top'; c.lineWidth = 1;
    let endX = -1e9;
    for (const m of app.markers.filter(m => m.t >= t0 - 1e-6 && m.t <= now + 1e-6).sort((a, b) => a.t - b.t)) {
      const x = X(m.t), tw = c.measureText(m.label).width;
      c.strokeStyle = '#9ca3af'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, padT - 2); c.lineTo(x, h - padB); c.stroke(); c.setLineDash([]);
      const lx = Math.min(x + 3, w - padR - tw - 2);
      if (lx > endX) { c.fillStyle = '#374151'; c.fillText(m.label, lx, 1); endX = lx + tw + 10; }
    }
    const legend = $('#trace-legend');
    const html = cfg.rows.some(k => ROWS[k].band) ? '<span><i style="background:rgba(47,158,91,0.35);height:8px"></i>normal range</span>' : '';
    if (legend.innerHTML !== html) legend.innerHTML = html;
  }
  function clockText() {
    const b = app.sim, cfg = app.graph;
    if (!b) return '';
    if (b instanceof Bench) return `hour ${Math.floor(b.t / HOUR)}`;
    if (cfg && !cfg.clock) { const m = b.t - app.zero; return m < 3 * HOUR ? `${Math.round(m)} min` : m < 3 * DAY ? `${(m / HOUR).toFixed(1)} h` : `day ${(m / DAY).toFixed(1)}`; }
    return clockTime(Math.round(b.t), app.days);
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
    if (sel.value !== String(s)) { const o = document.createElement('option'); o.value = String(s); o.textContent = s < 60 ? `${s} minutes per second` : `${+(s / 60).toFixed(1)} hours per second`; sel.appendChild(o); sel.value = String(s); }
  }
  const host = {
    ctx: { app, mark, view: () => app.view, pause() { setPaused(true); }, resume() { setPaused(false); } },
    applyStep({ step, eff, sceneChanged }) {
      app.run = null;
      if (!step.keepRange) app.range = null;
      if (step.setup) step.setup();           // build the model state before the picture is drawn
      const needView = eff.view && (eff.view !== app.viewName || step.remount || sceneChanged || (eff.viewOpts || null) !== app.viewOptsGiven);
      if (needView) mountView(eff.view, eff.viewOpts || {});
      if (sceneChanged) app.userSpeed = null;
      if (app.userSpeed == null && eff.speed) setSpeed(eff.speed);
      app.clock = eff.clock || 'idle';
      app.graph = eff.graph || null;
      app.days = eff.days || null;
      app.sampleDt = app.graph && app.graph.window ? Math.max(0.5, app.graph.window / 480) : 2;
      const graphed = !!(app.graph && app.graph.rows.length);
      $('#trace-wrap').style.display = graphed ? '' : 'none';   // no graph in this step: the picture gets the room
      $('#trace-title').innerHTML = `<b style="color:var(--ink);font-weight:650">${(app.graph && app.graph.title) || 'The day graph'}</b>`;
      app.meters = eff.meters || null;
      renderMeters(true);
      setPaused(false);
    },
  };
  let meterClock = 0;
  function renderMeters(force) {
    const el = $('#meters');
    if (!app.meters) { el.classList.remove('on'); el.innerHTML = ''; return; }
    if (!force && meterClock < 250) return;
    meterClock = 0;
    el.classList.add('on');
    const html = app.meters().map(([label, value, cls]) => `<div class="m${cls ? ' ' + cls : ''}">${label}<b>${value}</b></div>`).join('');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // =========================================================================
  // Main loop
  // =========================================================================
  let srKey = null, narrClock = 1e9, runner = null;
  function frame(ts) {
    if (app.lastFrame == null) app.lastFrame = ts;
    const dtReal = Math.min(50, ts - app.lastFrame); app.lastFrame = ts;
    try {
      if (app.sim && !app.paused && (app.run || app.clock === 'free')) advanceSim(dtReal / 1000 * app.speed);
      if (app.view && app.view.update) app.view.update(app.paused ? 0 : dtReal);
      if (runner) runner.tick(pendingEvents.splice(0), dtReal);
      narrClock += dtReal;
      if (narrClock > 300) {
        narrClock = 0;
        const n = app.view && app.view.narrate ? app.view.narrate() : null;
        if (n) {
          if ($('#narrator').innerHTML !== n.html) $('#narrator').innerHTML = n.html;
          if (n.key !== srKey) { srKey = n.key; $('#sr-live').textContent = n.html.replace(/<[^>]*>/g, ''); }
        } else $('#narrator').innerHTML = '';
      }
      meterClock += dtReal; renderMeters(false);
      drawGraph();
      const ct = clockText();
      if ($('#sim-clock').textContent !== ct) $('#sim-clock').textContent = ct;
    } catch (e) { if (!frame.failed) { frame.failed = true; console.error(e); } }
    requestAnimationFrame(frame);
  }
  $('#speed').addEventListener('change', (e) => { app.speed = parseFloat(e.target.value); app.userSpeed = app.speed; });
  $('#btn-pause').addEventListener('click', () => setPaused(!app.paused));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) setPaused(!app.paused);
  });

  function start(lesson, opts) {
    runner = Lesson.createRunner(Object.assign({ lesson, panel, progress: $('#progress'), host, inheritKeys: ['view', 'viewOpts', 'speed', 'graph', 'meters', 'clock', 'days'] }, opts || {}));
    KD.runner = runner;
    runner.goto(0, 0);
    requestAnimationFrame(frame);
    return runner;
  }

  const KD = window.KD = {
    app, views, COL, ROWS, $, clamp, htmlEl, svgEl, setAttrs, fx, signed, flow, big, clockTime, urineColour, colourWord,
    setSim, clearHistory, startRun, finishRun, fastFinish, skip, mark, mountView, setPaused, setSpeed, start,
    runner: null,
  };
  window.__kidneysim = { app, KD, goto: (s, k) => runner.goto(s, k), runner: () => runner, finishRun: () => fastFinish() };
})();
