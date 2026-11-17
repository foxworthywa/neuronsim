/* ImmuneSim app core: shared state, the simulation clock, the infection timeline (the graph that
 * stays on screen for the whole lab) and the wiring to the lesson runner. The simulation lives in
 * engine.js, the pictures in views.js, the lesson in lesson.js. Everything drawn is read from the
 * model. */
(function () {
  'use strict';

  const { Immune, DAY } = ImmuneSim;
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

  // Counts in words a first-year student reads at a glance.
  function fmt(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n < 0.5) return '0';
    if (n < 9999.5) return Math.round(n).toLocaleString('en-US');
    if (n < 999500) return `${Math.round(n / 1e3)} thousand`;
    if (n < 999.5e6) return `${(n / 1e6).toFixed(n < 9.95e6 ? 1 : 0)} million`;
    return `${(n / 1e9).toFixed(1)} billion`;
  }
  const fmtAb = (a) => (a < 0.05 ? 'none' : a < 10 ? a.toFixed(1) : fmt(a));
  const pct = (x) => `${Math.round(100 * x)} %`;

  const COL = {
    pathogen: '#b8322a', infected: '#de7c1a', phago: '#2f6fb6', macro: '#5b8fd0', lymph: '#12877f', ab: '#9a6a00',
    B: '#12877f', Th: '#7b3f99', Tc: '#b5477f', dc: '#5a55a8', alarm: '#e0a400',
    tissue: '#fbf1e4', cell: '#f6e2c8', cellLine: '#c9a983', skin: '#e9c9a8', skinDark: '#b98d66',
    blood: '#f6dcd8', bloodLine: '#d08d86', lymphFluid: '#e7f1d8', lymphLine: '#9db579', node: '#eef3e2',
    ink: '#1f2430', muted: '#5f6675', ghost: '#9aa0ad',
  };

  // =========================================================================
  // Shared state
  // =========================================================================
  // Each group gets one of twelve people (libraries); all twelve are covered by the tests.
  const urlSeed = parseInt((location.search.match(/[?&]seed=(\d+)/) || [])[1], 10);
  const app = {
    seed: urlSeed >= 1 && urlSeed <= 12 ? urlSeed : 1 + Math.floor(Math.random() * 12),
    sim: null,                // what the clock advances: an Immune (a person) or a Dish
    kind: 'bacterium', strain: 'A',   // the pathogen the timeline follows
    speed: 6, userSpeed: null, paused: false,
    clock: 'idle',            // 'free': time runs; 'idle': time runs only during an experiment
    run: null,                // {until, schedule, onDone}
    history: [], sampleDt: 1, lastSample: -1e9, zero: 0,
    ghosts: [], markers: [], spans: [],
    timeline: null, meters: null, autoMark: true,
    view: null, viewName: null, viewOpts: null,
    lastFrame: null,
  };
  const person = (setup) => { const b = new Immune({ seed: app.seed }); if (setup) setup(b); return b; };

  function setSim(sim, o) {
    o = o || {};
    app.sim = sim; app.run = null;
    app.sampler = o.sampler || null;      // a step may graph something other than the pathogen (e.g. a self protein)
    if (o.kind) app.kind = o.kind;
    if (o.strain) app.strain = o.strain; else if (o.kind) app.strain = 'A';
    if (!o.keepGhosts) app.ghosts = [];
    clearHistory();
  }
  function clearHistory() { app.history = []; app.markers = []; app.spans = []; app.lastSample = -1e9; app.zero = app.sim ? app.sim.t : 0; recordSample(true); }
  // One row of the timeline for a person: what is at the site, in the node and in the blood.
  function sampleOf(b, kind, strain) {
    const s = b.site;
    return {
      t: b.t, pathogen: kind === 'virus' ? s.virus : s.bacteria, infected: b.infected, phago: s.neutrophils,
      lymph: b.specific(kind, strain).total, ab: b.antibodyTo(kind, strain),
      swelling: b.signs.swelling, fever: b.fever, ctl: s.ctl,
    };
  }
  function sample() {
    const b = app.sim;
    if (app.sampler) return app.sampler(b);
    return b instanceof Immune ? sampleOf(b, app.kind, app.strain) : { t: b.t, pathogen: b.bacteria };
  }
  // Put a saved moment back on screen: the person, and the history that led to it.
  function snapshot() { return { sim: app.sim.copy(), history: app.history.slice(), markers: app.markers.slice(), zero: app.zero, kind: app.kind, strain: app.strain }; }
  function restore(snap, o) {
    setSim(snap.sim.copy(), Object.assign({ kind: snap.kind, strain: snap.strain }, o || {}));
    app.history = snap.history.slice(); app.markers = snap.markers.slice(); app.zero = snap.zero; app.lastSample = app.sim.t;
  }
  function recordSample(force) {
    const b = app.sim;
    if (!b) return;
    if (!force && b.t - app.lastSample < app.sampleDt * 0.999) return;
    app.lastSample = b.t;
    app.history.push(sample());
  }
  const EVENT_LABEL = { neutrophilsArrive: 'first neutrophils', firstAntibody: 'first antibody', ctlArrive: 'cytotoxic T cells arrive', cleared: 'cleared' };
  const pendingEvents = [];
  function advanceSim(dt) {
    let left = dt, guard = 0;
    while (left > 1e-9 && guard++ < 200000) {
      const b = app.sim, r = app.run;
      let h = Math.min(left, app.sampleDt);
      if (r) {
        h = Math.min(h, r.until - b.t);
        const next = r.schedule.find(s => !s.done);
        if (next) h = Math.min(h, Math.max(0, next.t - b.t));
      }
      if (h > 1e-9) { b.advance(h); left -= h; }
      if (b.takeEvents) for (const e of b.takeEvents()) {
        pendingEvents.push(e);
        const label = e.type.startsWith('antigenInNode') ? 'antigen reaches the node' : EVENT_LABEL[e.type];
        if (app.autoMark && label) app.markers.push({ t: e.t, label });
      }
      if (r) for (const s of r.schedule) if (!s.done && b.t >= s.t - 1e-6) { s.done = true; s.fn(); }
      recordSample();
      if (r && b.t >= r.until - 1e-6) { finishRun(); break; }
      if (h <= 1e-9 && !r) break;
    }
  }
  // Run an experiment: the clock runs for `duration` hours, with scheduled events on the way.
  function startRun(o) {
    const t0 = app.sim.t;
    if (o.zero !== false) app.zero = o.zeroAt != null ? o.zeroAt : t0;
    app.run = { until: t0 + o.duration, onDone: o.onDone, schedule: (o.schedule || []).map(s => ({ t: t0 + s.at, fn: s.fn, done: false })) };
    if (o.speed && app.userSpeed == null) setSpeed(o.speed);
    setPaused(false);
  }
  function finishRun() { const r = app.run; app.run = null; narrClock = 1e9; recordSample(true); if (r && r.onDone) r.onDone(); }
  // Jump to the end of the current experiment at once (used by the automated walkthrough).
  function fastFinish() { if (app.run) advanceSim(app.run.until - app.sim.t + 1e-3); }
  // Advance without animation (e.g. the months between two infections).
  function skip(dt) { const keep = app.sampleDt; app.sampleDt = Math.max(keep, dt / 200); advanceSim(dt); app.sampleDt = keep; }
  const mark = (label, t) => app.markers.push({ t: t == null ? app.sim.t : t, label });
  // Keep the run just drawn as a grey curve, to compare the next one with.
  function keepGhost(label, o) {
    o = o || {};
    app.ghosts.push({ label, zero: app.zero, rows: app.history.slice(), keys: o.keys || ['pathogen'], color: o.color });
  }
  const dayNow = () => (app.sim.t - app.zero) / DAY;

  // =========================================================================
  // Views (registered by views.js)
  // =========================================================================
  const stage = $('#stage');
  const views = {};
  function mountView(name, opts) {
    stage.innerHTML = '';
    app.viewOpts = opts || {};
    app.view = views[name](opts || {});
    app.viewName = name;
    $('#stage-caption').textContent = (opts && opts.caption) || '';
  }

  // =========================================================================
  // The infection timeline: one graph, the same traces, for the whole lab
  // =========================================================================
  const TR = {
    pathogen: { label: () => (app.kind === 'virus' ? 'free virus' : 'bacteria'), color: COL.pathogen, width: 2.6 },
    infected: { label: () => 'infected cells', color: COL.infected, width: 2.2 },
    phago: { label: () => 'neutrophils at the site', color: COL.phago, width: 2 },
    lymph: { label: () => 'lymphocytes that fit this antigen', color: COL.lymph, width: 2 },
    ab: { label: () => 'antibody (units)', color: COL.ab, width: 2, dash: [7, 3] },
  };
  const Y_TICKS = [[1, '1'], [100, '100'], [1e4, '10 thousand'], [1e6, '1 million'], [1e8, '100 million']];
  const Y_MIN = 0.5, Y_MAX = 2e9;
  const canvas = $('#trace');
  function drawTimeline() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const cfg = app.timeline;
    if (!cfg) return;
    if (!cfg.traces.length) {
      c.fillStyle = '#8a90a0'; c.font = '13px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(cfg.note || '', w / 2, h / 2);
      $('#trace-legend').innerHTML = '';
      return;
    }
    const W = cfg.window * DAY, now = app.sim.t;
    const t0 = Math.max(app.zero - (cfg.lead || 0) * DAY, now - W), t1 = t0 + W;
    const padL = 94, padR = 14, padT = 4, padB = 18;
    c.font = '11px system-ui, sans-serif';
    const X = (t) => padL + (t - t0) / W * (w - padL - padR);
    // marker labels: stacked in rows above the plot
    const rowEnd = [], placed = [];
    for (const m of app.markers.filter(m => m.t >= t0 && m.t <= now + 1e-6).sort((a, b) => a.t - b.t)) {
      const x = X(m.t), tw = c.measureText(m.label).width, lx = Math.min(x + 2, w - padR - tw - 4);
      let row = 0; while (rowEnd[row] != null && rowEnd[row] > lx) row++;
      rowEnd[row] = lx + tw + 8; placed.push({ x, lx, row, label: m.label });
    }
    const top = padT + rowEnd.length * 13 + (rowEnd.length ? 2 : 0), bottom = h - padB;
    const lo = Math.log10(Y_MIN), hi = Math.log10(Y_MAX);
    const Y = (v) => bottom - (Math.log10(clamp(v, Y_MIN, Y_MAX)) - lo) / (hi - lo) * (bottom - top);
    c.fillStyle = '#fbfaf6'; c.fillRect(padL, top, w - padL - padR, bottom - top);
    for (const sp of app.spans) { const xa = Math.max(padL, X(sp.t0)), xb = Math.min(w - padR, X(sp.t1 == null ? now : sp.t1)); if (xb > xa) { c.fillStyle = sp.color || 'rgba(61,111,182,0.10)'; c.fillRect(xa, top, xb - xa, bottom - top); c.fillStyle = '#23497f'; c.textAlign = 'left'; c.textBaseline = 'top'; c.font = '600 11px system-ui, sans-serif'; c.fillText(sp.label, xa + 4, top + 2); c.font = '11px system-ui, sans-serif'; } }
    // y axis: each line is 100 times the one below
    c.save(); c.translate(11, (top + bottom) / 2); c.rotate(-Math.PI / 2); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#7b8190'; c.fillText('how many', 0, 0); c.restore();
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (const [v, label] of Y_TICKS) { c.strokeStyle = '#e6e3da'; c.beginPath(); c.moveTo(padL, Y(v)); c.lineTo(w - padR, Y(v)); c.stroke(); c.fillStyle = '#7b8190'; c.fillText(label, padL - 5, Y(v)); }
    // time axis, counted from the start of the experiment
    c.textAlign = 'center'; c.textBaseline = 'top'; c.fillStyle = '#7b8190';
    const hours = cfg.window <= 2.5;
    const step = hours ? (cfg.window <= 1.2 ? 4 : 12) : DAY * ([1, 2, 5, 7, 14, 30].find(s => cfg.window / s <= 12) || 30);
    for (let t = Math.ceil((t0 - app.zero) / step - 1e-9) * step + app.zero; t <= t1 + 1e-6; t += step) {
      c.strokeStyle = '#e6e3da'; c.beginPath(); c.moveTo(X(t), top); c.lineTo(X(t), bottom); c.stroke();
      const rel = Math.round((t - app.zero) / (hours ? 1 : DAY));
      if (X(t) < w - padR - 18) c.fillText(hours ? `${rel} h` : `day ${rel}`, X(t), bottom + 3);
    }
    const line = (rows, key, zero, color, width, dash) => {
      c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash || []); c.beginPath(); let first = true;
      for (const s of rows) {
        const t = s.t - zero + app.zero; if (t < t0 - 1e-6 || t > t1 + 1e-6 || s[key] == null) continue;
        const x = X(t), y = Y(s[key]); if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
      }
      c.stroke(); c.setLineDash([]);
    };
    // earlier runs, in grey
    c.font = '11px system-ui, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'bottom';
    app.ghosts.forEach((g) => {
      for (const k of g.keys) if (cfg.traces.includes(k)) line(g.rows, k, g.zero, g.color || COL.ghost, 1.6, k === 'ab' ? [7, 3] : [2, 2]);
      const peak = g.rows.reduce((a, s) => (s[g.keys[0]] > a[g.keys[0]] ? s : a), g.rows[0]);
      if (peak && g.label) { const x = clamp(X(peak.t - g.zero + app.zero), padL + 2, w - padR - 90), y = Math.max(top + 13, Y(peak[g.keys[0]]) - 3); c.lineWidth = 3; c.strokeStyle = '#fbfaf6'; c.strokeText(g.label, x + 3, y); c.fillStyle = g.color || '#6c7280'; c.fillText(g.label, x + 3, y); }
    });
    for (const k of cfg.traces) line(app.history, k, app.zero, TR[k].color, TR[k].width, TR[k].dash);
    // markers
    c.textAlign = 'left'; c.textBaseline = 'top'; c.lineWidth = 1;
    for (const m of placed) {
      const ly = padT + m.row * 13;
      c.strokeStyle = '#9ca3af'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(m.x, ly + 12); c.lineTo(m.x, bottom); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#374151'; c.fillText(m.label, m.lx + 2, ly);
    }
    const legend = $('#trace-legend');
    const html = cfg.traces.map(k => `<span><i style="background:${TR[k].color}${TR[k].dash ? ';height:2px;border-top:1px dashed #fff' : ''}"></i>${TR[k].label()}</span>`).join('') + (app.ghosts.length ? '<span><i style="background:#9aa0ad"></i>earlier run</span>' : '');
    if (legend.innerHTML !== html) legend.innerHTML = html;
  }
  function clockText() {
    const cfg = app.timeline, d = dayNow();
    if (cfg && cfg.window <= 2.5) return `${(d * 24).toFixed(0)} h`;
    return `day ${d.toFixed(1)}`;
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
    if (sel.value !== String(s)) { const o = document.createElement('option'); o.value = String(s); o.textContent = `${s} hours per second`; sel.appendChild(o); sel.value = String(s); }
  }
  const host = {
    ctx: { app, mark, view: () => app.view, pause() { setPaused(true); }, resume() { setPaused(false); } },
    applyStep({ step, eff, sceneChanged }) {
      app.run = null;
      const needView = eff.view && (eff.view !== app.viewName || step.remount || sceneChanged);
      if (step.setup) step.setup();           // build the model state before the picture is drawn
      if (needView) mountView(eff.view, eff.viewOpts || {});
      else if (eff.viewOpts && eff.viewOpts.caption != null) $('#stage-caption').textContent = eff.viewOpts.caption;
      if (sceneChanged) app.userSpeed = null;
      if (app.userSpeed == null && eff.speed) setSpeed(eff.speed);
      app.clock = eff.clock || 'idle';
      if (eff.timeline) { app.timeline = eff.timeline; app.sampleDt = Math.max(0.05, eff.timeline.window * DAY / 500); }
      const graphed = !!(app.timeline && app.timeline.traces.length);
      $('#trace-wrap').style.display = graphed ? '' : 'none';   // no graph in this step: the picture gets the room
      $('#vm-badge').style.visibility = graphed ? 'visible' : 'hidden';
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
      if (app.view && app.view.update) app.view.update(dtReal);
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
      drawTimeline();
      if (app.sim) {
        $('#badge-label').textContent = app.run ? 'Running:' : 'Clock:';
        $('#badge-value').textContent = clockText();
        $('#sim-clock').textContent = clockText();
      }
    } catch (e) { if (!frame.failed) { frame.failed = true; console.error(e); } }
    requestAnimationFrame(frame);
  }
  $('#speed').addEventListener('change', (e) => { app.speed = parseFloat(e.target.value); app.userSpeed = app.speed; });
  $('#btn-pause').addEventListener('click', () => setPaused(!app.paused));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) setPaused(!app.paused);
  });

  // The anatomical figure in a larger window (scene 1), with its full credit.
  function openFigure() {
    const A = window.IM_ANATOMY; if (!A) return;
    $('#figure-img').src = A.src;
    $('#figure-credit').innerHTML = `<i>${A.title}</i>. <a href="${A.source}" target="_blank" rel="noopener">${A.credit.replace(' CC BY 3.0.', '')}</a> Licensed <a href="${A.license}" target="_blank" rel="noopener">CC BY 3.0</a>. Recompressed; otherwise unaltered.`;
    $('#figure').classList.add('on'); $('#figure-close').focus();
  }
  $('#figure-close').addEventListener('click', () => $('#figure').classList.remove('on'));
  $('#figure').addEventListener('click', (e) => { if (e.target.id === 'figure') $('#figure').classList.remove('on'); });

  function start(lesson, opts) {
    runner = Lesson.createRunner(Object.assign({ lesson, panel, progress: $('#progress'), host, inheritKeys: ['view', 'viewOpts', 'speed', 'timeline', 'meters', 'clock'] }, opts || {}));
    IM.runner = runner;
    runner.goto(0, 0);
    requestAnimationFrame(frame);
    return runner;
  }

  const IM = window.IM = {
    app, views, COL, $, clamp, htmlEl, svgEl, setAttrs, fmt, fmtAb, pct, person,
    openFigure, setSim, sampleOf, snapshot, restore, clearHistory, startRun, finishRun, fastFinish, skip, mark, keepGhost, dayNow, mountView, setPaused, setSpeed, start,
    runner: null,
  };
  window.__immunesim = { app, IM, goto: (s, k) => runner.goto(s, k), runner: () => runner, finishRun: () => fastFinish() };
})();
