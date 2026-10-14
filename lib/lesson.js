/*
 * Lesson runner shared by the models (see docs/PEDAGOGY.md).
 *
 * A lesson is a list of scenes; each scene a list of steps. A step can show text, ask a question
 * (multiple choice with targeted feedback, or a number read off the model), offer actions
 * (click or hold), and wait for an activity to be done in the simulation. Continue is enabled only
 * when the question is answered correctly and the activity is done.
 *
 * The runner also keeps a record of what the student did: their first answer to every question
 * (their prediction), how many tries it took, and values they measured. Models turn that into a
 * lab record for the LMS.
 *
 * Stage, traces and simulation belong to each model; the model passes a `host` with
 * applyStep(), which the runner calls whenever a step is entered.
 */
(function (root) {
  'use strict';

  function htmlEl(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (attrs[k] == null) continue;
      if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }

  // A button that acts while held: pointer, or Space/Enter on the keyboard.
  function makeHoldButton(b, down, up) {
    let held = false;
    const start = (e) => { if (held) return; held = true; if (e) e.preventDefault(); b.classList.add('held'); down(); };
    const stop = () => { if (!held) return; held = false; b.classList.remove('held'); up(); };
    b.addEventListener('pointerdown', start);
    b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
    b.addEventListener('keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) start(e); });
    b.addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); stop(); } });
    b.addEventListener('blur', stop);
    b.addEventListener('click', (e) => e.preventDefault());
  }

  function createRunner(opts) {
    const { lesson, panel, progress, host } = opts;
    const inheritKeys = opts.inheritKeys || ['view', 'viewOpts', 'speed'];
    const runner = {
      scene: 0, step: 0, state: null, freeMode: false,
      record: { started: new Date(), answers: {}, values: {}, notes: [], visited: new Set(), completed: new Set() },
    };

    const ctx = Object.assign({
      complete() { if (runner.state && !runner.state.done) { runner.state.done = true; markCompleted(); refreshNav(); } },
      status(msg, ok) { const s = panel.querySelector('.status'); if (s) { s.innerHTML = msg; s.classList.toggle('ok', !!ok); } },
      next() { goto(runner.scene, runner.step + 1); },
      refresh() { renderPanel(); },
      stepState: () => runner.state,
      recordValue(key, value) { runner.record.values[key] = value; },
      note(text) { runner.record.notes.push(text); },
      record: runner.record,
    }, host.ctx || {});

    function currentStep() { return lesson[runner.scene].steps[runner.step]; }
    function markCompleted() { runner.record.completed.add(stepKey(runner.scene, runner.step)); }
    function stepKey(si, ki) { return `${lesson[si].id}.${ki}`; }

    function goto(si, ki) {
      if (si >= lesson.length) si = lesson.length - 1;
      if (ki >= lesson[si].steps.length) { if (si + 1 < lesson.length) { si++; ki = 0; } else ki = lesson[si].steps.length - 1; }
      if (ki < 0) { if (si > 0) { si--; ki = lesson[si].steps.length - 1; } else ki = 0; }
      runner.freeMode = false;
      const sceneChanged = si !== runner.scene || runner.state == null;
      runner.scene = si; runner.step = ki;
      runner.record.visited.add(stepKey(si, ki));
      const scene = lesson[si], step = scene.steps[ki];
      // A step finished once stays finished: going Back must never trap a student in an activity
      // whose moment has passed (e.g. a valve event that already happened).
      runner.state = { done: !step.waitFor || runner.record.completed.has(stepKey(si, ki)), answered: !step.question, attempts: 0, data: {} };
      // Steps inherit view settings from earlier steps of the same scene, so jumping into the
      // middle of a scene (or stepping back into it) shows the right picture.
      const eff = {};
      for (let j = 0; j <= ki; j++) for (const k of inheritKeys) if (scene.steps[j][k] != null) eff[k] = scene.steps[j][k];
      if (eff.speed == null && scene.speed != null) eff.speed = scene.speed;
      host.applyStep({ scene, step, eff, sceneChanged, si, ki });
      if (step.enter) step.enter(ctx);
      renderPanel();
      renderProgress();
    }

    function renderProgress() {
      if (!progress) return;
      progress.innerHTML = '';
      lesson.forEach((s, i) => {
        const b = htmlEl('button', { title: s.title, 'aria-label': `Scene ${i + 1}: ${s.title}` }, String(i + 1));
        b.className = runner.freeMode ? '' : (i < runner.scene ? 'done' : i === runner.scene ? 'current' : '');
        if (i === runner.scene && !runner.freeMode) b.setAttribute('aria-current', 'step');
        b.addEventListener('click', () => goto(i, 0));
        progress.appendChild(b);
      });
    }

    function renderPanel() {
      const scene = lesson[runner.scene], step = currentStep(), st = runner.state;
      panel.innerHTML = '';
      panel.appendChild(htmlEl('div', { class: 'scene-label' }, `${opts.partLabel ? opts.partLabel + ' · ' : ''}Scene ${runner.scene + 1} of ${lesson.length} · ${scene.title}`));
      panel.appendChild(htmlEl('h2', {}, step.title || scene.title));
      const text = typeof step.text === 'function' ? step.text(ctx) : step.text;
      if (text) panel.appendChild(htmlEl('div', { class: 'text' }, text));
      if (step.question) panel.appendChild(renderQuestion(step.question, st));
      if (step.actions && step.actions.length) {
        const a = htmlEl('div', { class: 'actions' });
        for (const act of step.actions) {
          const b = htmlEl('button', { class: act.cls || '', type: 'button' }, act.label);
          if (act.hold) makeHoldButton(b, () => act.down(ctx), () => act.up(ctx));
          else b.addEventListener('click', () => { act.run(ctx); });
          if (act.disabled && act.disabled(ctx)) b.disabled = true;
          a.appendChild(b);
        }
        panel.appendChild(a);
      }
      panel.appendChild(htmlEl('div', { class: 'status', role: 'status' }, step.status ? (typeof step.status === 'function' ? step.status(ctx) : step.status) : ''));
      if (step.extra) { const ex = htmlEl('div', { class: 'extra' }); step.extra(ex, ctx); panel.appendChild(ex); }
      const nav = htmlEl('div', { class: 'nav' });
      const back = htmlEl('button', { type: 'button' }, '← Back');
      back.addEventListener('click', () => goto(runner.scene, runner.step - 1));
      if (runner.scene === 0 && runner.step === 0) back.disabled = true;
      const hint = htmlEl('span', { class: 'hint' }, '');
      const last = runner.scene === lesson.length - 1 && runner.step === scene.steps.length - 1;
      const cont = htmlEl('button', { class: 'primary', id: 'btn-continue', type: 'button' }, step.continueLabel || 'Continue →');
      cont.addEventListener('click', () => {
        if (step.onContinue) step.onContinue(ctx);
        if (step.continueTo) step.continueTo(ctx); else if (!last) goto(runner.scene, runner.step + 1);
      });
      if (last && !step.continueTo) cont.style.display = 'none';
      nav.appendChild(back); nav.appendChild(hint); nav.appendChild(cont);
      panel.appendChild(nav);
      refreshNav();
    }

    function refreshNav() {
      const st = runner.state, step = currentStep(), b = panel.querySelector('#btn-continue'), hint = panel.querySelector('.nav .hint');
      if (!b || !st) return;
      const ok = st.answered && st.done;
      b.disabled = !ok;
      if (hint) hint.textContent = ok ? '' : (!st.answered ? 'Answer the question to continue' : (step.waitHint || 'Complete the activity to continue'));
    }

    // Records the student's first answer (their prediction) and how many tries it took.
    function noteAnswer(q, given, correct) {
      const key = stepKey(runner.scene, runner.step);
      let r = runner.record.answers[key];
      if (!r) r = runner.record.answers[key] = { scene: runner.scene + 1, prompt: stripHtml(q.prompt), first: given, firstCorrect: correct, attempts: 0, done: false };
      if (!r.done) { r.attempts++; if (correct) { r.done = true; r.final = given; } }
    }

    function renderQuestion(q, st) {
      const box = htmlEl('div', { class: 'question' });
      const promptId = 'q-' + Math.random().toString(36).slice(2, 8);
      box.appendChild(htmlEl('div', { class: 'prompt', id: promptId }, q.prompt));
      const fb = htmlEl('div', { class: 'feedback', style: 'display:none', role: 'status' });
      const prior = runner.record.answers[stepKey(runner.scene, runner.step)];
      if (q.type === 'number') {
        const row = htmlEl('div', { class: 'numrow' });
        const inp = htmlEl('input', { type: 'number', inputmode: 'decimal', step: 'any', 'aria-labelledby': promptId });
        const unit = htmlEl('span', { class: 'unit' }, q.unit || '');
        const check = htmlEl('button', { type: 'button' }, 'Check');
        const submit = () => {
          const v = parseFloat(inp.value);
          if (!isFinite(v)) { fb.className = 'feedback bad'; fb.innerHTML = 'Type a number first.'; fb.style.display = 'block'; return; }
          st.attempts++;
          const target = q.answer(ctx), tol = typeof q.tol === 'function' ? q.tol(ctx) : q.tol;
          const ok = Math.abs(v - target) <= tol;
          noteAnswer(q, `${v} ${q.unit || ''}`.trim(), ok);
          if (q.recordAs) ctx.recordValue(q.recordAs, { entered: v, model: target });
          if (ok) {
            fb.className = 'feedback good'; fb.innerHTML = '<b>Right.</b> ' + (typeof q.explain === 'function' ? q.explain(ctx, v) : (q.explain || ''));
            inp.disabled = true; check.disabled = true; st.answered = true;
            if (q.onCorrect) q.onCorrect(ctx, v);
            refreshNav();
          } else {
            fb.className = 'feedback bad'; fb.innerHTML = '<b>Not quite.</b> ' + (q.hint ? q.hint(ctx, v, target) : 'Read the value again from the graph.');
          }
          fb.style.display = 'block';
        };
        check.addEventListener('click', submit);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
        row.appendChild(inp); row.appendChild(unit); row.appendChild(check);
        box.appendChild(row); box.appendChild(fb);
        if (prior && prior.done) { inp.value = parseFloat(prior.final); inp.disabled = true; check.disabled = true; st.answered = true; fb.className = 'feedback good'; fb.innerHTML = '<b>Answered.</b>'; fb.style.display = 'block'; }
        return box;
      }
      const opts = htmlEl('div', { class: 'options', role: 'group', 'aria-labelledby': promptId });
      displayOrder(q).forEach((o) => {
        const b = htmlEl('button', { type: 'button' }, o.t);
        b.addEventListener('click', () => {
          st.attempts++;
          noteAnswer(q, stripHtml(o.t), !!o.ok);
          Array.from(opts.children).forEach(c => c.classList.remove('wrong'));
          if (o.ok) {
            b.classList.add('correct');
            Array.from(opts.children).forEach(c => { c.disabled = true; });
            fb.className = 'feedback good'; fb.innerHTML = '<b>Right.</b> ' + (o.fb || q.explain || '');
            st.answered = true;
            if (q.onCorrect) q.onCorrect(ctx);
            refreshNav();
          } else {
            b.classList.add('wrong');
            fb.className = 'feedback bad'; fb.innerHTML = '<b>Not quite.</b> ' + (o.fb || '');
          }
          fb.style.display = 'block';
        });
        opts.appendChild(b);
      });
      box.appendChild(opts); box.appendChild(fb);
      if (prior && prior.done) {
        st.answered = true;
        Array.from(opts.children).forEach(c => { c.disabled = true; if (stripHtml(c.innerHTML) === prior.final) c.classList.add('correct'); });
        const right = q.options.find(o => o.ok);
        fb.className = 'feedback good'; fb.innerHTML = '<b>Right.</b> ' + ((right && right.fb) || q.explain || ''); fb.style.display = 'block';
      }
      return box;
    }

    // Called every animation frame by the model with the simulation events since the last frame.
    function tick(events, dtSim) {
      if (runner.freeMode || !runner.state) return;
      const step = currentStep();
      if (step.tick) step.tick(ctx, events, dtSim);
      if (step.waitFor && !runner.state.done && step.waitFor(ctx, events)) {
        runner.state.done = true;
        markCompleted();
        if (step.onDone) step.onDone(ctx);
        refreshNav();
      }
      if (typeof step.status === 'function') {
        const s = panel.querySelector('.status');
        if (s) { const html = step.status(ctx); if (s.innerHTML !== html) s.innerHTML = html; }
      }
    }

    function enterFreeMode() { runner.freeMode = true; renderProgress(); }

    return { goto, tick, ctx, runner, currentStep, refreshNav, renderPanel, renderProgress, enterFreeMode };
  }

  // Answer options in a shuffled order that is the same every time a question is shown (seeded
  // by its prompt), so the right answer is not always in the same place. q.fixedOrder keeps the
  // authored order (e.g. options that form a scale).
  function displayOrder(q) {
    const opts = q.options.slice();
    if (q.fixedOrder) return opts;
    let h = 2166136261;
    for (const ch of q.prompt) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    for (let i = opts.length - 1; i > 0; i--) {
      h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
      const j = h % (i + 1); [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return opts;
  }

  function stripHtml(s) { return String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }

  // Short check code over the text of a lab record (FNV-1a). It deters casual editing of a pasted
  // record; it is not security.
  function checkCode(text, salt) {
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    const s = (salt || '') + '|' + text.replace(/\r\n/g, '\n').trim();
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    }
    const a = h1.toString(36).toUpperCase().padStart(7, '0').slice(-5), b = h2.toString(36).toUpperCase().padStart(7, '0').slice(-5);
    return `${a}-${b}`;
  }

  root.Lesson = { createRunner, htmlEl, makeHoldButton, stripHtml, checkCode };
})(typeof self !== 'undefined' ? self : this);
