/* BloodSim app core: shared state, the simulation clock, the canvas the views draw on, and the
 * wiring to the lesson runner. The models live in engine.js, the pictures in views.js, the lesson
 * in lesson.js. Everything drawn is read from the model. */
(function () {
  'use strict';

  const { rng, TYPES, NAMES, DAY } = BloodSim;
  const $ = (sel) => document.querySelector(sel);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const htmlEl = Lesson.htmlEl;
  const fmt = (n) => (n == null || !isFinite(n) ? '—' : n < 0.5 ? '0' : n < 9999.5 ? Math.round(n).toLocaleString('en-US') : n < 999500 ? `${Math.round(n / 1e3)} thousand` : n < 999.5e6 ? `${(n / 1e6).toFixed(n < 9.95e6 ? 1 : 0)} million` : `${(n / 1e9).toFixed(1)} billion`);
  const perUL = (n) => (Math.round(n / 10) * 10).toLocaleString('en-US');      // counts per microliter, to the nearest 10
  const pct1 = (x) => (x < 9.95 ? x.toFixed(1) : String(Math.round(x)));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const clockText = (h, days) => (days ? `day ${(h / DAY).toFixed(1)}` : `${h < 9.95 ? h.toFixed(1) : Math.round(h)} h`);

  // =========================================================================
  // Shared state
  // =========================================================================
  const urlSeed = parseInt((location.search.match(/[?&]seed=(\d+)/) || [])[1], 10);
  const app = {
    seed: urlSeed >= 1 ? urlSeed : 1 + Math.floor(Math.random() * 9000),   // which slide this group gets
    sim: null,                  // what the clock advances: a Bench or a Blood
    speed: 1, mult: 1, paused: false,
    clock: 'idle',              // 'free': time runs; 'idle': time runs only during an experiment
    run: null,                  // {until, onDone}
    view: null, viewName: null, viewOpts: null, meters: null,
    lastFrame: null,
  };
  const pendingEvents = [];
  function setSim(sim) { app.sim = sim; app.run = null; }
  function advanceSim(dt) {
    const s = app.sim; if (!s) return;
    const h = app.run ? Math.min(dt, app.run.until - s.t) : dt;
    if (h > 1e-9) s.advance(h);
    if (s.takeEvents) for (const e of s.takeEvents()) pendingEvents.push(e);
    if (app.run && s.t >= app.run.until - 1e-6) finishRun();
  }
  // Run an experiment: the clock runs for `hours`, at `speed` simulated hours per second.
  function startRun(o) {
    app.run = { until: app.sim.t + o.hours, onDone: o.onDone };
    if (o.speed) app.speed = o.speed;
    setPaused(false);
  }
  function finishRun() { const r = app.run; app.run = null; narrClock = 1e9; if (r && r.onDone) r.onDone(); }
  // Jump to the end of the current experiment at once (used by the automated walkthrough).
  function fastFinish() { if (app.run) advanceSim(app.run.until - app.sim.t + 1e-3); }

  // =========================================================================
  // The stage: one canvas, a layer of invisible buttons over the things that can be clicked
  // (so the keyboard reaches them), and an optional panel of HTML at the right
  // =========================================================================
  const stage = $('#stage'), canvas = $('#cv'), hot = $('#hot'), side = $('#side');
  const views = {};
  function mountView(name, opts) {
    hot.innerHTML = ''; side.innerHTML = ''; side.className = '';
    app.viewOpts = opts || {}; app.viewOptsGiven = opts || null;
    app.view = views[name](opts || {});
    app.viewName = name;
    $('#stage-caption').textContent = (opts && opts.caption) || '';
  }
  // list: [{x, y, r, label, run}] in canvas coordinates
  function hotspots(list) {
    hot.innerHTML = '';
    for (const h of list) {
      const b = htmlEl('button', { type: 'button', 'aria-label': h.label, style: `left:${h.x - h.r}px;top:${h.y - h.r}px;width:${2 * h.r}px;height:${2 * h.r}px` });
      b.addEventListener('click', (e) => { e.stopPropagation(); h.run(); });
      hot.appendChild(b);
    }
  }
  function setSide(html, cls) { side.className = html == null ? '' : 'on' + (cls ? ' ' + cls : ''); if (html != null && side.innerHTML !== html) side.innerHTML = html; }
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    if (app.view && app.view.click) app.view.click(e.clientX - r.left, e.clientY - r.top);
  });

  // A report as a hospital analyser prints it. o: {title, before (an earlier report), note, icons}
  function reportHTML(rep, o) {
    o = o || {};
    const was = o.before, f = (x) => `<td class="f ${x}">${x}</td>`;
    const rows = rep.rows.map((r, i) => `<tr><td>${o.icons ? BL.icon(r.type, 22) : ''}${cap(NAMES[r.type])}s</td>${was ? `<td class="was">${pct1(was.rows[i].pct)}</td>` : ''}<td class="v ${r.pctFlag}">${pct1(r.pct)}</td>${f(r.pctFlag)}${was ? `<td class="was">${perUL(was.rows[i].abs)}</td>` : ''}<td class="v ${r.absFlag}">${perUL(r.abs)}</td>${f(r.absFlag)}</tr>`).join('');
    const head = was ? '<tr><th></th><th style="text-align:right">% before</th><th colspan="2" style="text-align:right">% now</th><th style="text-align:right">per µL before</th><th colspan="2" style="text-align:right">per µL now</th></tr>' : '<tr><th></th><th colspan="2" style="text-align:right">%</th><th colspan="2" style="text-align:right">per µL</th></tr>';
    const total = `<tr><td><b>All white cells</b></td>${was ? '<td class="was"></td>' : ''}<td class="v">100</td><td class="f"></td>${was ? `<td class="was">${perUL(was.wbc.value)}</td>` : ''}<td class="v ${rep.wbc.flag}">${perUL(rep.wbc.value)}</td>${f(rep.wbc.flag)}</tr>`;
    return `<div class="labrep${o.tight ? ' tight' : ''}"><div class="lh"><span>${o.title || 'White cell count'}</span><span>${o.when || ''}</span></div><table>${head}${rows}${total}</table>${o.note ? `<div class="foot">${o.note}</div>` : ''}</div>`;
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
  const host = {
    ctx: { app, view: () => app.view },
    applyStep({ step, eff, sceneChanged }) {
      app.run = null;
      if (step.setup) step.setup();           // build the model state before the picture is drawn
      if (eff.view && (eff.view !== app.viewName || step.remount || sceneChanged || (eff.viewOpts || null) !== app.viewOptsGiven)) mountView(eff.view, eff.viewOpts || {});
      if (eff.speed) app.speed = eff.speed;
      app.clock = eff.clock || 'idle';
      app.meters = eff.meters || null;
      renderMeters(true);
      setPaused(false);
    },
  };
  let meterClock = 0;
  function renderMeters(force) {
    const el = $('#meters');
    if (!app.meters) { el.classList.remove('on'); el.innerHTML = ''; return; }
    if (!force && meterClock < 200) return;
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
      if (app.sim && !app.paused && (app.run || app.clock === 'free')) advanceSim(dtReal / 1000 * app.speed * app.mult);
      const dpr = window.devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
      if (w && h && app.view && app.view.draw) {
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
        const c = canvas.getContext('2d');
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, w, h);
        app.view.draw(c, w, h, app.paused ? 0 : dtReal);
      }
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
    } catch (e) { if (!frame.failed) { frame.failed = true; console.error(e); } }
    requestAnimationFrame(frame);
  }
  $('#speed').addEventListener('change', (e) => { app.mult = parseFloat(e.target.value); });
  $('#btn-pause').addEventListener('click', () => setPaused(!app.paused));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'p' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLSelectElement)) setPaused(!app.paused);
  });

  function start(lesson, opts) {
    runner = Lesson.createRunner(Object.assign({ lesson, panel, progress: $('#progress'), host, inheritKeys: ['view', 'viewOpts', 'speed', 'meters', 'clock'] }, opts || {}));
    BL.runner = runner;
    runner.goto(0, 0);
    requestAnimationFrame(frame);
    return runner;
  }

  const BL = window.BL = {
    app, views, $, clamp, htmlEl, fmt, perUL, pct1, cap, clockText, rng, TYPES, NAMES,
    setSim, startRun, finishRun, fastFinish, mountView, hotspots, setSide, reportHTML, setPaused, start,
    runner: null,
  };
  window.__bloodsim = { app, BL, goto: (s, k) => runner.goto(s, k), runner: () => runner, finishRun: () => fastFinish() };
})();
