/* KidneySim lesson, scenes 1–5, and the helpers both halves use. See docs/KIDNEY_MODULE.md.
 * Plain words first; each term is named once the student has seen what the thing does. Terms
 * follow McKinley, Anatomy & Physiology: An Integrative Approach (glomerular capsule, nephron
 * loop), and should be checked against the edition in use. */
(function () {
  'use strict';
  const { app, $, clamp, htmlEl, fx, signed, flow, big, clockTime, setSim, startRun, skip, urineHTML, labHTML } = KD;
  const { Kidney, Bench, herrera, STUDENT_DAY, HERRERA_DAYS, HOUR, DAY, SALT, BENCH } = KidneySim;

  // ---------------------------------------------------------------- small helpers
  const data = (c) => c.stepState().data;
  // A prediction must be made before the experiment can be run.
  const predict = (q) => Object.assign(q, { onCorrect: (c) => c.refresh() });
  const afterPrediction = (c) => !c.stepState().answered;
  // An opening guess: every option is accepted and recorded, and none is called right.
  const guess = (prompt, options, fb) => ({ prompt, options: options.map(t => ({ t, ok: true, neutral: true, fb })) });
  const nameBox = (html) => `<div class="name"><span class="t">The names</span>${html}</div>`;
  const caseNote = (who, html) => `<div class="case"><div class="case-h">${who}</div>${html}</div>`;
  const isBody = () => app.sim instanceof Kidney;
  const bar = (x) => `<span style="display:inline-block;height:8px;width:54px;background:#eceae3;border-radius:4px;overflow:hidden;vertical-align:middle"><i style="display:block;height:100%;width:${Math.round(100 * clamp(x, 0, 1))}%;background:#5b8fd0"></i></span>`;
  // Start an experiment on the stage. o: {sim, before, minutes, speed, key, after}
  function experiment(c, o) {
    if (o.sim) setSim(o.sim());
    if (o.before) o.before(app.sim);
    const d = data(c);
    d.running = true;
    c.refresh();
    startRun({ duration: o.minutes, speed: o.speed, onDone: () => { d.running = false; d[o.key || 'ran'] = true; if (o.after) o.after(app.sim, c); c.refresh(); } });
  }
  const busy = (c) => !!data(c).running;

  // A slider with its value shown large. o: {cls, id, label, min, max, step, value, show(v), ends: [left, right], onInput(v)}
  function dial(el, o) {
    const box = htmlEl('div', { class: 'dial ' + (o.cls || '') });
    box.appendChild(htmlEl('label', { for: o.id }, o.label));
    const big_ = htmlEl('div', { class: 'big' }, o.show(o.value));
    const s = htmlEl('input', { type: 'range', id: o.id, min: o.min, max: o.max, step: o.step });
    s.value = o.value;
    s.addEventListener('input', () => { const v = parseFloat(s.value); o.onInput(v); big_.innerHTML = o.show(v); });
    box.appendChild(big_); box.appendChild(s);
    if (o.ends) box.appendChild(htmlEl('div', { class: 'ends' }, `<span>${o.ends[0]}</span><span>${o.ends[1]}</span>`));
    el.appendChild(box);
    return { input: s, set(v) { s.value = v; big_.innerHTML = o.show(v); } };
  }

  // A table the student completes: each cell is a choice; the step is done when every cell is
  // right. spec: {key, head: [...], rows: [{label, cells: [{options, answer}]}], done, hint, onChange}
  function selectTable(el, c, spec) {
    el.className = 'extra';
    const store = (c.record.tables = c.record.tables || {});
    const st = (store[spec.key] = store[spec.key] || {});
    const tbl = htmlEl('table', { class: 'ptable' });
    tbl.appendChild(htmlEl('tr', {}, spec.head.map(h => `<th>${h}</th>`).join('')));
    const note = htmlEl('div', {});
    const check = () => {
      let all = true;
      spec.rows.forEach((r, ri) => r.cells.forEach((cell, ci) => { if (st[`${ri}.${ci}`] !== cell.answer) all = false; }));
      note.innerHTML = all ? `<div class="feedback good">${spec.done || '<b>Complete.</b>'}</div>` : '';
      if (spec.onChange) spec.onChange(st);
      if (all) c.complete();
    };
    spec.rows.forEach((r, ri) => {
      const tr = htmlEl('tr', {}, `<td><b>${r.label}</b></td>`);
      r.cells.forEach((cell, ci) => {
        const td = htmlEl('td', {});
        const sel = htmlEl('select', { 'aria-label': `${r.label}: ${spec.head[ci + 1]}` });
        sel.appendChild(htmlEl('option', { value: '' }, 'choose…'));
        cell.options.forEach((o) => sel.appendChild(htmlEl('option', { value: o }, o)));
        const k = `${ri}.${ci}`;
        const paint = () => { td.className = !st[k] ? '' : st[k] === cell.answer ? 'right' : 'wrong'; };
        if (st[k]) sel.value = st[k];
        sel.addEventListener('change', () => { if (st[k + ':first'] == null && sel.value) st[k + ':first'] = sel.value; st[k] = sel.value; paint(); check(); });
        paint(); td.appendChild(sel); tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    el.appendChild(tbl); el.appendChild(note);
    if (spec.hint) el.appendChild(htmlEl('div', { style: 'font-size:13px;color:var(--muted);margin-top:4px' }, spec.hint));
    check();
  }
  // Predictions written down before a run, then marked against what the model did. Nothing is
  // judged until the run has been made. spec: {key, head, rows: [{label, cells: [{options, answer}]}], runLabel, run(c), ran(c)}
  function predictTable(el, c, spec) {
    el.className = 'extra';
    const store = (c.record.tables = c.record.tables || {});
    const st = (store[spec.key] = store[spec.key] || {});
    const ran = spec.ran(c);
    const tbl = htmlEl('table', { class: 'ptable' });
    tbl.appendChild(htmlEl('tr', {}, spec.head.map(h => `<th>${h}</th>`).join('')));
    const all = () => spec.rows.every((r, ri) => r.cells.every((_, ci) => st[`${ri}.${ci}`]));
    const btn = htmlEl('button', { type: 'button', class: 'go' }, spec.runLabel);
    spec.rows.forEach((r, ri) => {
      const tr = htmlEl('tr', {}, `<td><b>${r.label}</b></td>`);
      r.cells.forEach((cell, ci) => {
        const td = htmlEl('td', {}), k = `${ri}.${ci}`;
        if (ran) {
          const ok = st[k] === cell.answer;
          td.innerHTML = `${cell.answer} <span class="mark ${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'}</span>${ok ? '' : `<span class="was">you predicted: ${st[k] || '—'}</span>`}`;
        } else {
          const sel = htmlEl('select', { 'aria-label': `${r.label}: ${spec.head[ci + 1]}` });
          sel.appendChild(htmlEl('option', { value: '' }, 'choose…'));
          cell.options.forEach((o) => sel.appendChild(htmlEl('option', { value: o }, o)));
          if (st[k]) sel.value = st[k];
          sel.addEventListener('change', () => { st[k] = sel.value; btn.disabled = !all() || busy(c); });
          td.appendChild(sel);
        }
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    el.appendChild(tbl);
    if (!ran) {
      btn.disabled = !all() || busy(c);
      btn.addEventListener('click', () => { btn.disabled = true; spec.run(c); });
      const row = htmlEl('div', { class: 'actions', style: 'margin-top:8px' }); row.appendChild(btn); el.appendChild(row);
      el.appendChild(htmlEl('div', { style: 'font-size:13px;color:var(--muted);margin-top:4px' }, 'Choose every prediction first. They are not graded.'));
    } else {
      const right = spec.rows.reduce((n, r, ri) => n + r.cells.filter((cell, ci) => st[`${ri}.${ci}`] === cell.answer).length, 0), total = spec.rows.reduce((n, r) => n + r.cells.length, 0);
      el.appendChild(htmlEl('div', { class: 'feedback ' + (right === total ? 'good' : 'note'), style: 'margin-top:8px' }, `${right === total ? '<b>All as you predicted.</b>' : `<b>${right} of ${total} as you predicted.</b>`} ${spec.after || ''}`));
    }
  }
  const tableScore = (c, key, spec) => { const st = (c.record.tables || {})[key] || {}; let n = 0, t = 0; spec.forEach((r, ri) => r.cells.forEach((cell, ci) => { t++; if (st[`${ri}.${ci}`] === cell.answer) n++; })); return `${n} of ${t}`; };

  // ---------------------------------------------------------------- the patients (fictional)
  const HERRERA = `<p><b>Luis Herrera, 56.</b> His kidneys failed two years ago, after many years of diabetes and high blood pressure. They now make no urine at all. Three times a week, on Monday, Wednesday and Friday, he spends four hours connected to a <b>dialysis machine</b>.</p>
    <p>It is <b>noon on Monday</b> and he has just come off the machine. His next session is at <b>8 am on Wednesday</b>, 44 hours away. Until then he will eat and drink much as you do.</p>`;
  const HERRERA_Q = `<ol><li>What does the machine do for him?</li><li>Why does the nurse weigh him before every session?</li><li>Why does his diet sheet limit fluids, salt, and foods such as bananas and potatoes?</li></ol>`;
  const SAM = `<p><b>Sam Reyes, 19</b> (from EndoSim) has type 1 diabetes. He missed his insulin yesterday. This morning his blood glucose is <b>300 mg/dL</b>, he is very thirsty, and he has been passing large amounts of urine all night.</p>`;
  const DANA = `<p><b>Dana Brooks, 62</b> (from HeartSim) had a heart attack two weeks ago. Since then she has held on to about <b>2 litres</b> of extra salt and water: her ankles are swollen and she is breathless lying down. Her doctor starts <b>furosemide</b>, a tablet she calls her "water pill".</p>`;
  const RUNNER = `<p><b>Maya Okonkwo, 24,</b> has just finished a half-marathon on a hot day. She drank almost nothing during the race.</p>`;
  const BLED = `<p><b>Tom Bradley, 41,</b> was brought to the emergency department half an hour ago after a motorcycle accident, with heavy bleeding from a broken thigh.</p>`;
  const LIN = `<p><b>Mrs. Lin, 61,</b> has had diabetes for twenty years. She feels well, apart from being tired. Her doctor has been watching her blood tests for some time.</p>`;

  // ---------------------------------------------------------------- bodies used in more than one scene
  const herreraStart = () => herrera().follow(HERRERA_DAYS);
  function herreraWednesday() { setSim(herreraStart()); skip(44 * HOUR); }
  const isHerreraWed = () => isBody() && app.sim.s.nephrons === 0 && Math.abs(app.sim.t - 56 * HOUR) < 2;
  function studentStart(byHand) {
    const b = new Kidney({ start: 7 * HOUR }).follow(STUDENT_DAY);
    if (byHand) { b.manual({ exit: { water: 1, na: 0.105 } }); b.tag = 'hand'; }
    return b;
  }
  const inBand = (b) => Math.abs(b.waterExcess) <= 0.75 && Math.abs(b.saltExcess) <= 3;
  // A stand-in for the student's own day, for a student who jumps straight to a later step: the
  // dials are turned as an attentive student would turn them.
  function standInDay() {
    const b = studentStart(true); setSim(b);
    for (let t = 0; t < 16 * HOUR; t += 10) {
      b.manual({ exit: { water: clamp(1 + 9 * b.waterExcess + b.gut.water / 250, 0.3, 12), na: clamp(0.105 + 0.03 * b.saltExcess, 0, 0.55) } }); b.tag = 'hand';
      skip(10);
    }
    b.tag = 'handDone';
  }

  const GRAPH = {
    herrera: { window: 46 * HOUR, rows: ['weight', 'k', 'bun'], clock: true, over: { weight: { lo: 81, hi: 85.5, band: [81.5, 82.5] }, bun: { hi: 80 } } },
    hand: { window: 16 * HOUR, rows: ['water', 'salt', 'flow'], clock: true, over: { flow: { hi: 10, label: 'urine: the water you let out' } } },
    bench: { window: 2 * DAY, rows: ['drug', 'urea'], title: 'In her body', over: { drug: { hi: 6.5 } } },
    bench2: { window: 2 * DAY, rows: ['drug', 'kept'], title: 'In her body', over: { drug: { hi: 6.5 } } },
  };
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu'];
  const NO_GRAPH = { rows: [] }, NO_METERS = () => [];
  const METERS = {
    bench: () => { const b = app.sim; return b instanceof Bench ? [['Time', b.t < 2 * HOUR ? `${Math.round(b.t)} min` : `${Math.floor(b.t / HOUR)} h`], ['New drug in her body', `${fx(b.level.drug, 1)} doses`, b.level.drug > 2 ? 'bad' : '']] : []; },
    filter: () => { if (!isBody()) return []; const f = app.sim.f; return [['Pressure in her arteries', `${fx(f.map, 0)} mmHg`], ['Filtered', `${fx(f.gfr, 0)} mL/min`, f.gfr < 60 || f.gfr > 190 ? 'bad' : 'good']]; },
  };

  const FIND = (part, slide, prompt, explain, wrong, o) => Object.assign({
    view: 'anatomy', findPart: part,
    enter: (c) => {
      const v = c.view(); v.show(slide); v.names(!!(o && o.names)); v.highlight(c.stepState().done ? [].concat(part)[0] : null); v.showFlow = !!(o && o.flow);
      v.onPart = (p) => {
        if ([].concat(part).includes(p)) { v.highlight(p); if (o && o.namesAfter) v.names(true); c.status(`<b>Yes.</b> ${explain}`, true); c.complete(); }
        else c.status((wrong && wrong[p]) || 'Not that one. Read the description again.', false);
      };
      if (c.stepState().done && o && o.namesAfter) v.names(true);
    },
    text: `<p>${prompt}</p>`,
    waitFor: () => false, waitHint: 'Click the structure described',
  }, o && o.title ? { title: o.title } : {});

  const TRAY1 = ['urea', 'potassium', 'acid'], TRAY2 = ['water', 'salt', 'glucose'];
  const benchWith = (design, pumps) => { const b = new Bench(design); (pumps || []).forEach(p => b.add(p)); return b; };
  const slots = (c, tray) => { const v = c.view(); v.onSlot = (k) => { if (busy(c) || !tray.includes(k)) return; app.sim.add(k); c.refresh(); }; };

  // =========================================================================
  // Scenes 1–5
  // =========================================================================
  const PART_A = [
    // ------------------------------------------------------------- 1. two days without kidneys
    {
      id: 'without', title: 'Two days without kidneys', speed: 180,
      steps: [
        {
          view: 'person', viewOpts: { gauges: ['weight', 'k', 'bun'], bp: true, panelTitle: "Mr. Herrera's blood, and his weight", marksAt: [[222, 29], [446, 29], [279, 142], [608, 24]] },
          graph: GRAPH.herrera, days: DAYS,
          title: 'Why this matters: a patient',
          setup: () => setSim(herreraStart()),
          enter: (c) => c.view().setMarks(false),
          text: `<div class="case"><div class="case-h">Mr. Herrera's case</div>${HERRERA}</div>
                 <p>By the end of this lab you will be able to answer three questions about him (they are on your handout):</p>${HERRERA_Q}
                 <p style="margin-top:8px">You can reopen the cases with <b>The patients</b> button at the top, and jump to any scene with the numbered circles.</p>`,
          question: guess('Before you start, a guess: what did his kidneys do for him when they worked?', ['Took poisons out of his blood', 'Got rid of extra water', 'Kept the make-up of his blood steady'], 'Keep your guess in mind. The next few minutes test it.'),
        },
        {
          view: 'person', title: 'Monday noon to Wednesday morning',
          setup: () => setSim(herreraStart()),
          enter: (c) => c.view().setMarks(true),
          text: `<p>How to read the picture:</p>
                 <ol><li><b>In:</b> everything he eats and drinks. His body also makes wastes of its own, such as <b>urea</b>, from the protein it uses.</li>
                 <li><b>Out:</b> lungs, skin and gut go on losing about a litre of water a day.</li>
                 <li>His <b>kidneys</b>, in grey: no longer working.</li>
                 <li>Three measurements, each with a green normal band: his <b>weight</b> (the band is his target, 82 kg), and the <b>potassium</b> and <b>urea</b> in his blood. The graph below will follow the same three.</li></ol>
                 <p>Over the 44 hours he will drink about 3.5 litres, eat about 14 g of salt, and eat ordinary amounts of potassium (it is in nearly all food) and protein.</p>`,
          question: predict({ prompt: 'Predict: by Wednesday morning, what will have happened to his weight, his potassium and his urea?', options: [
            { t: 'All three will have risen', ok: true, fb: 'Run the 44 hours and see how far.' },
            { t: 'Urea will have risen; weight and potassium will be about the same', fb: 'That would be so if the kidneys removed only wastes. Ask what else he took in during those two days, and where it could go.' },
            { t: 'None will have changed much: two days is too short', fb: 'He will take in litres of water and grams of salt in that time. With no urine, where can they go?' },
          ] }),
          actions: [{ label: 'Run the 44 hours', cls: 'go', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { minutes: 44 * HOUR, speed: 180, after: (b, c) => c.recordValue('herrera', { weight: b.weight, gain: b.weight - 82, k: b.potassium, bun: b.bun, bp: b.bp, water: (b.cum.waterIn - b.p.metabolic * 44 * 60) / 1000, salt: b.cum.naIn / SALT, kIn: b.cum.kIn }) }) }],
          status: (c) => { const v = c.record.values.herrera; return data(c).ran && v ? `Wednesday 8 am: weight <b>${fx(v.weight, 1)} kg</b> (${signed(v.gain, 1)} kg) · potassium <b>${fx(v.k, 1)}</b> mmol/L · urea (BUN) <b>${fx(v.bun, 0)}</b> mg/dL · blood pressure ${v.bp.sys}/${v.bp.dia}` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Run the 44 hours',
        },
        {
          view: 'person', title: 'Nothing unusual went in',
          setup: () => { if (!isHerreraWed()) herreraWednesday(); },
          enter: (c) => c.view().setMarks(false),
          text: () => {
            const b = app.sim, c = b.cum;
            const made = b.p.metabolic * 44 * 60 / 1000;
            return `<p>In 44 hours he took in <b>${fx(c.waterIn / 1000 - made, 1)} L</b> of water (his body made another ${fx(made, 1)} L), <b>${fx(c.naIn / SALT, 0)} g</b> of salt and <b>${big(c.kIn)} mmol</b> of potassium, and his body made its usual urea. Lungs, skin and gut lost <b>${fx(c.waterOut / 1000, 1)} L</b> of the water and almost none of the rest.</p>
                    <p>Each one matters. The extra salt and water raise his blood pressure and can flood his lungs. Potassium at this level disturbs the heartbeat: in MuscleSim you saw raised K⁺ depolarize a muscle fibre's membrane. Urea and the other wastes cause nausea and confusion.</p>`;
          },
          question: { prompt: 'He ate and drank ordinary things. Why did his blood change?', options: [
            { t: 'What goes in each day has to come out, and the one way out that can be adjusted to match is gone', ok: true, fb: 'Hold on to that. It is a statement about <b>balance</b>, and it applies to water, salt and potassium as much as to wastes.' },
            { t: 'His diet over those two days was an unhealthy one', fb: 'It was an ordinary diet: you will see a healthy student take in more water and salt than this in scene 2, with no change in her blood. What does she have that he lacks?' },
            { t: 'His body made too much potassium and salt', fb: 'The body makes neither: both came from his food. The question is why they did not leave again.' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 2. you are the exit
    {
      id: 'exit', title: 'You are the exit', speed: 8,
      steps: [
        {
          view: 'person', viewOpts: { gauges: ['water', 'salt'], panelTitle: 'Her body, compared with normal', marksAt: [[608, 60], [608, 120]] },
          graph: GRAPH.hand,
          title: 'A healthy day',
          setup: () => setSim(studentStart(true)),
          enter: (c) => c.view().setMarks(true),
          text: `<p>Now a healthy nursing student on an ordinary day. What she will eat, drink and sweat is listed under <b>Coming up</b>. For today, <b>you are her kidneys</b>.</p>
                 <p>You will have two dials: how much <b>water</b> leaves in her urine each minute, and how much <b>salt</b> leaves each hour. Your job is to keep</p>
                 <ol><li>the <b>water in her body</b> and</li><li>the <b>salt in her body</b></li></ol>
                 <p>inside their green bands. Her body holds about 42 L of water; the band is ¾ L either side of that. (Her potassium, urea and the rest will be looked after for you today.)</p>`,
          question: { prompt: 'At 9:30 she will drink a big bottle of water. What will you need to do with the water dial?', options: [
            { t: 'Turn it up for an hour or two, then back down', ok: true, fb: 'The water has to leave again, and only for as long as there is too much of it.' },
            { t: 'Leave it where it is: her body will use the water up', fb: 'Water is not used up. Whatever she drinks has to leave again by some route, or stay.' },
            { t: 'Turn it down, to hold on to the water', fb: 'She already has enough: the gauge starts in the middle of its band. More water in, with less out, would push it over the top.' },
          ] },
        },
        {
          view: 'person', title: 'Hold her steady for a day',
          keepRange: true,
          setup: () => { if (!(isBody() && app.sim.tag === 'hand' && app.run)) setSim(studentStart(true)); },
          enter: (c) => { c.view().setMarks(false); c.view().urine0 = 0; },
          text: `<p>Press <b>Start her day</b>, then work the dials. Watch the two gauges and the graph, and read <b>Coming up</b> so that you are ready.</p>
                 <p>The day runs from 7 am to 11 pm in about two minutes. You can pause it (P), or slow it with the Speed menu.</p>`,
          extra: (el, c) => handDials(el, c),
          waitFor: (c) => data(c).ok, waitHint: 'Keep water and salt in range for most of the day',
        },
        {
          view: 'person', title: 'Read your own day',
          setup: () => { if (!(isBody() && app.sim.tag === 'handDone')) standInDay(); },
          text: () => {
            const b = app.sim, c = b.cum;
            return `<p>The graph shows the day you just ran. Over the 16 hours she took in <b>${fx(c.waterIn / 1000, 1)} L</b> of water and <b>${fx(c.naIn / SALT, 1)} g</b> of salt. Lungs, skin and sweat took <b>${fx((c.waterOut - c.urine) / 1000, 1)} L</b> and <b>${fx((c.naOut - c.urineNa) / SALT, 1)} g</b>. You let out the rest: <b>${fx(c.urine / 1000, 1)} L</b> of urine carrying <b>${fx(c.urineNa / SALT, 1)} g</b> of salt.</p>
                    <p>Look at the three rows of the graph together.</p>`;
          },
          question: { prompt: 'Which line had to swing up and down so that the other two could stay nearly flat?', options: [
            { t: 'The urine: what you let out', ok: true, fb: '<b>That is what the kidneys are for.</b> The urine is whatever has to leave to keep the body steady. It changes from hour to hour so that the blood does not.' },
            { t: 'The water in her body', fb: 'That is the line you were holding flat. Look at the bottom row, which you controlled.' },
            { t: 'None: all three stayed flat', fb: 'Look at the bottom row: the urine went from a trickle during her run to a flood after the bottle of water.' },
          ] },
        },
        {
          view: 'person', title: 'What an exit cannot do',
          setup: () => { if (!(isBody() && app.sim.tag === 'handDone')) standInDay(); },
          text: `<p>During her run she sweated out a litre of water, and for a while the water gauge was <b>below</b> its band whatever you did.</p>`,
          question: { prompt: 'She was a litre short of water. What could you, the exit, do about it?', options: [
            { t: 'Only stop losing more: turn the water dial right down. Putting water back takes a drink', ok: true, fb: 'Kidneys can save water; they cannot make it. That is the job of <b>thirst</b>. You will see the kidney do exactly what you did: a trickle of dark urine until she drinks.' },
            { t: 'Add water to her blood', fb: 'An exit has nothing to add. Look at the dials you had: both only let things out.' },
            { t: 'Turn the salt dial up', fb: 'She had lost salt in her sweat too. Losing more salt would not bring back any water.' },
          ] },
        },
        {
          view: 'person', title: 'Could another exit do this job?',
          setup: () => { if (!(isBody() && app.sim.tag === 'handDone')) standInDay(); },
          text: `<p>Her lungs, skin and gut lose water too, and sweat carries salt. In her run, sweat removed water faster than the kidneys ever do.</p>`,
          question: { prompt: 'Why can\'t those exits do the kidneys\' job?', options: [
            { t: 'What they lose is set by other needs (breathing, cooling, digestion), not by what the blood has too much of', ok: true, fb: `She sweated because she was hot, not because she had water to spare.${nameBox('Keeping the fluid around the cells steady is <b>homeostasis</b>; for water and salts it is called <b>fluid and electrolyte balance</b>. Getting rid of something in the urine is <b>excretion</b>. The kidneys are the body\'s <b>adjustable exit</b>: you managed water and salt by hand; they also handle potassium, urea, acid, calcium, phosphate and every drug, each with its own setting, all at once.')}` },
            { t: 'They lose too little to matter', fb: 'Sweat can exceed a litre an hour, more than the kidneys usually pass in a day. Amount is not the difficulty. What decides how much she sweats?' },
            { t: 'They cannot carry salt', fb: 'Sweat is salty: she lost about 2.5 g of salt on her run. What decides how much she sweats?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 3. where it happens
    {
      id: 'where', title: 'Where it happens', speed: 8,
      steps: [
        Object.assign(FIND('artery', 0, 'So where is the adjustable exit? Each kidney is about the size of a fist. The picture shows three kinds of pipe joined to each kidney. <b>Click a pipe that brings blood to a kidney.</b>', 'It branches straight off the body\'s largest artery, so blood reaches the kidney at high pressure. That will matter in scene 5.', { vein: 'That one carries blood away from the kidney, to the large vein. Which pipe comes off the large red artery?', ureter: 'That one carries urine, not blood. Which pipe comes off the large red artery?', aorta: 'That is the large artery itself. Click the branch that runs from it to a kidney.', ivc: 'That is the large vein. Blood arrives from the artery.', kidney: 'That is a kidney. Click a pipe that brings blood to it.', bladder: 'That is where urine is stored. Click a pipe that brings blood to a kidney.' }, { title: 'Three pipes' }),
          { setup: () => setSim(new Kidney()), graph: NO_GRAPH, meters: NO_METERS, viewOpts: { slide: 0, caption: 'Where the kidneys are, and what is inside one.' } }),
        FIND('ureter', 0, 'Blood comes in by the artery and leaves by the vein beside it. <b>Now click a pipe that carries urine away from a kidney.</b>', 'Urine runs down this tube to the bladder, where it is stored, and leaves the body by a single tube. Nothing is added to it or taken from it on the way: the urine is finished when it leaves the kidney.' + nameBox('Blood in: <b>renal artery</b>. Blood out: <b>renal vein</b>. Urine out: <b>ureter</b>, to the <b>urinary bladder</b>, then the <b>urethra</b>. ("Renal" means "of the kidney".)'), { artery: 'That one carries blood in. Which pipe runs down to the pelvis?', vein: 'That one carries blood out. Which pipe runs down to the pelvis?', bladder: 'That is where the urine is stored. Click a tube that carries it there.', kidney: 'That is a kidney. Click the tube that carries urine away from it.', aorta: 'That is the large artery. Which pipe runs from a kidney down to the pelvis?', ivc: 'That is the large vein. Which pipe runs from a kidney down to the pelvis?' }, { title: 'Three pipes', namesAfter: true }),
        {
          view: 'anatomy', title: 'How much blood?',
          enter: (c) => { const v = c.view(); v.show(0); v.names(true); v.highlight(c.stepState().answered ? 'artery' : null); v.onPart = null; v.showFlow = c.stepState().answered; },
          text: `<p>The two kidneys together weigh about 300 g: less than half of one percent of the body.</p>`,
          question: { prompt: 'What share of all the blood the heart pumps goes through the kidneys?', onCorrect: (c) => { c.view().showFlow = true; c.view().highlight('artery'); }, options: [
            { t: 'About a fifth', ok: true, fb: 'More than a litre a minute, far more than they need for their own oxygen. Why would two small organs be given a fifth of the blood? <b>Keep that question.</b> Scene 6 answers it.' },
            { t: 'About 5 %', fb: 'Still too low. They receive more blood for their weight than the brain or the heart muscle does.' },
            { t: 'About 0.5 %, in line with their weight', fb: 'That is what their size suggests, and it is wrong by a factor of forty.' },
          ] },
        },
        FIND('nephron', 1, 'A kidney cut open. The paler <b>outer part</b> surrounds a darker <b>inner part</b> made of cone-shaped blocks, which point at a hollow where urine collects. The work is done by tiny structures, far too small to see, each lying partly in the outer part and partly in a cone. One is drawn here, enormously enlarged. <b>Click it.</b>', 'Each kidney has about a million of these. Everything in the rest of this lab happens in one of them.' + nameBox('Outer part: <b>renal cortex</b>. Inner part: <b>renal medulla</b>. The hollow: <b>renal pelvis</b>. The working unit: a <b>nephron</b>.'), { cortex: 'That is the outer part of the kidney. Look for the blue structure drawn across it.', medulla: 'That is one of the cones of the inner part. Look for the blue structure near the top.', pelvis: 'That is the hollow where urine collects. Look for the blue structure near the top.' }, { title: 'Inside a kidney', namesAfter: true }),
        {
          view: 'anatomy', title: 'One nephron',
          enter: (c) => { const v = c.view(); v.show(2); v.names(c.stepState().answered); v.highlight(null); v.onPart = null; },
          text: `<p>One nephron has two parts. First, a <b>knot of capillaries inside a cup</b>. Second, a <b>long tube</b> leading away from the cup: it coils, dips down into the inner part of the kidney and back, coils again, and ends in a duct that many nephrons share.</p>
                 <p>Blood that leaves the knot of capillaries does not go straight back to the body. It first runs through a <b>second set of capillaries</b>, wrapped round the tube along its whole length.</p>`,
          question: Object.assign(guess('A guess, before you find out: why would the tube be wrapped in a second set of capillaries?', ['To bring oxygen to the cells of the tube', 'To carry away whatever the tube takes out of the fluid inside it', 'To filter the blood a second time'], 'Keep your guess. Scene 6 shows what those capillaries carry.'), { onCorrect: (c) => c.view().names(true) }),
        },
      ],
    },
    // ------------------------------------------------------------- 4. design the exit
    {
      id: 'design', title: 'Design the exit', speed: 240,
      steps: [
        {
          view: 'bench', viewOpts: { design: 1, caption: 'A design bench. Each empty slot will take one pump.' }, remount: true,
          graph: GRAPH.bench, meters: METERS.bench,
          title: 'Your job: build it',
          setup: () => setSim(benchWith(1, [])),
          enter: (c) => slots(c, TRAY1),
          text: `<p>Before looking inside a nephron, try to design one. Her blood carries things that must <b>leave</b> (urea, extra potassium, acid) mixed in with things that must <b>stay</b> (water, salt, glucose).</p>
                 <p><b>Design 1</b> is the obvious one: a pump for each waste. Each pump recognises one substance and moves only that. <b>Click the three empty slots</b> to fit the pumps, then run two days.</p>`,
          actions: [
            { label: 'Run two days', cls: 'go', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { minutes: 2 * DAY, speed: 360, after: (b, c) => { const d = data(c); d.high = TRAY1.filter(w => b.level[w] > 1.25); d.ok = !d.high.length; c.recordValue('design1', { pumps: b.pumps.size, urea: b.level.urea, potassium: b.level.potassium, acid: b.level.acid }); } }) },
            { label: 'Start again', disabled: (c) => busy(c) || !data(c).ran || data(c).ok, run: (c) => { const keep = [...app.sim.pumps]; setSim(benchWith(1, keep)); data(c).ran = false; c.refresh(); } },
          ],
          status: (c) => { const d = data(c); return !d.ran ? `Pumps fitted: <b>${app.sim.pumps ? app.sim.pumps.size : 0} of 3</b>` : d.ok ? '<b>All three wastes held steady for two days.</b> Design 1 works, for these three.' : `<b>${d.high.join(' and ')}</b> built up: nothing was moving ${d.high.length > 1 ? 'them' : 'it'} out. Press <b>Start again</b>, fit the missing pump${d.high.length > 1 ? 's' : ''}, and run it once more.`; },
          waitFor: (c) => data(c).ok, waitHint: 'Fit all three pumps and run two days',
        },
        {
          view: 'bench', title: 'Something new arrives',
          setup: () => setSim(benchWith(1, TRAY1)),
          enter: (c) => { c.view().onSlot = null; },
          text: `<p>She starts a new medicine, one tablet every eight hours. It is a molecule that no human body had met before chemists made it. (The same goes for a poison in a plant she has never eaten.)</p>`,
          question: predict({ prompt: 'Design 1 has no pump for it. What will happen to the amount of the drug in her body?', options: [
            { t: 'It will build up, dose after dose', ok: true, fb: 'Run it and count the doses.' },
            { t: 'It will leave through whichever pump fits it best', fb: 'In this design each pump moves one substance only. Something no pump was built for has no way out.' },
            { t: 'It will fade away by itself', fb: 'Some drugs are broken down by the liver, but many are not, and the breakdown products still have to leave. With no pump, by what route?' },
          ] }),
          actions: [{ label: 'Give the drug and run two days', cls: 'go', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.startDrug(), minutes: 2 * DAY - 2, speed: 360, after: (b, c) => c.recordValue('drug1', b.level.drug) }) }],
          status: (c) => (data(c).ran ? `After two days: <b>${fx(c.record.values.drug1, 0)} doses</b> of the drug are in her body. None has left.` : ''),
          waitFor: (c) => data(c).ran, waitHint: 'Run the two days',
        },
        {
          view: 'bench', viewOpts: { design: 2, caption: 'Design 2. The filter passes everything small. The three slots are for pumps that take things back.' }, remount: true,
          graph: GRAPH.bench2, speed: 4,
          title: 'Design 2: throw everything out',
          setup: () => setSim(benchWith(2, [])),
          enter: (c) => { c.view().onSlot = null; },
          text: `<p>A body built like design 1 would need a pump ready for every substance it might ever meet. So turn the problem round.</p>
                 <p><b>Design 2:</b> do not try to pick out what must go. Push <b>everything small</b> out of the blood through a filter, at the rate real kidneys do. Run it as it stands, with nothing else fitted.</p>`,
          actions: [{ label: 'Run design 2 (filter only)', cls: 'go', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { minutes: 3 * HOUR, speed: 4, after: (b, c) => c.recordValue('filterOnly', b.dead ? b.dead.t : null) }) }],
          status: (c) => (data(c).ran ? `Stopped after <b>${fx(c.record.values.filterOnly, 0)} minutes</b>: half of her water, salt and glucose had gone out with the wastes.` : ''),
          question: { prompt: 'Everything is leaving, wastes and all. What does design 2 need next?', options: [
            { t: 'Pumps that take back the things worth keeping', ok: true, fb: 'Fit them in the next step.' },
            { t: 'A finer filter, which holds back glucose and salt but lets wastes through', fb: 'Tempting, but a filter sorts only by size, and the molecules to keep are no bigger than the ones to lose: glucose is about the size of many drugs, and salt is smaller than urea.' },
            { t: 'A slower filter', fb: 'A slower filter loses water, salt and glucose more slowly, and clears wastes more slowly too. It does not tell them apart.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run design 2',
        },
        {
          view: 'bench', title: 'Take back what you want to keep', speed: 360,
          setup: () => setSim(benchWith(2, [])),
          enter: (c) => slots(c, TRAY2),
          text: `<p><b>Click the three slots</b> to fit pumps that take back water, salt and glucose from the fluid that came through the filter. Then give her the new drug again and run two days.</p>`,
          actions: [
            { label: 'Give the drug and run two days', cls: 'go', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.startDrug(), minutes: 2 * DAY - 2, speed: 360, after: (b, c) => { const d = data(c); d.ok = !b.dead; c.recordValue('design2', { drug: b.level.drug, filtered: b.filtered, returned: b.returned, dead: b.dead ? b.dead.t : null }); } }) },
            { label: 'Start again', disabled: (c) => busy(c) || !data(c).ran || data(c).ok, run: (c) => { const keep = [...app.sim.pumps]; setSim(benchWith(2, keep)); data(c).ran = false; c.refresh(); } },
          ],
          status: (c) => { const d = data(c), v = c.record.values.design2; return !d.ran ? `Take-back pumps fitted: <b>${app.sim.pumps ? app.sim.pumps.size : 0} of 3</b>` : d.ok ? `Two days: filtered <b>${big(v.filtered)} L</b>, taken back <b>${big(v.returned)} L</b>. The drug never built up: <b>${fx(v.drug, 1)} dose</b> left just before the next tablet.` : `It stopped after ${fx(v.dead, 0)} minutes: something worth keeping was not being taken back. Press <b>Start again</b>, fit the missing pump, and run it once more.`; },
          question: { prompt: 'Design 2 got rid of a drug it has no pump for. Why did that work?', options: [
            { t: 'Whatever is not taken back leaves. The design only has to know what to keep, and that list is short', ok: true, fb: 'The list of things worth keeping is short and never changes. The list of things that might need removing has no end.' },
            { t: 'The filter recognised the drug as foreign', fb: 'The filter passed the drug for the same reason it passed glucose and salt: it is small. It recognises nothing.' },
            { t: 'The take-back pumps pushed the drug out', fb: 'The take-back pumps never touched the drug: they move water, salt and glucose back into the blood. What happened to everything they did not move?' },
          ] },
          waitFor: (c) => data(c).ok, waitHint: 'Fit all three take-back pumps and run two days',
        },
        {
          view: 'strip', viewOpts: { kinds: ['water', 'na', 'glucose', 'urea'], caption: 'Design 2 is a nephron. Here is one, drawn straightened.', marksAt: [[30, 200], [330, 262], [640, 100], [960, 190]] }, remount: true,
          graph: NO_GRAPH, meters: NO_METERS,
          title: 'Design 2 is a nephron',
          setup: () => setSim(new Kidney()),
          enter: (c) => c.view().setMarks(true),
          text: `<p>Your kidneys are built like design 2. This picture stays on screen for the rest of the lab: one nephron, with its tube pulled out straight.</p>
                 <ol><li><b>The filter:</b> the knot of capillaries in its cup. Everything small is pushed out of the blood here.</li>
                 <li><b>The tubule:</b> the long tube, lined with take-back pumps. <b>Its width in this picture is the flow:</b> watch it narrow.</li>
                 <li><b>The return line:</b> the second set of capillaries. Whatever is taken back goes into it, and back to the body.</li>
                 <li><b>The urine:</b> whatever was not taken back.</li></ol>
                 <p>The price of this design: your kidneys filter about <b>180 litres</b> a day and take nearly all of it back. They are half a percent of your weight and use about a tenth of your resting energy doing it.</p>`,
          question: { prompt: 'In this design, which part decides what ends up in the urine?', options: [
            { t: 'The tubule, by what it takes back and what it leaves', ok: true, fb: 'The filter makes no choices. Scene 5 looks at the filter; scenes 6 to 9 at the tubule.' },
            { t: 'The filter, by what it lets through', fb: 'The filter lets through everything small, wanted or not. Where were the choices made in design 2?' },
            { t: 'The bladder, by what it stores', fb: 'The bladder only stores what the kidneys send it. Where were the choices made in design 2?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 5. the filter
    {
      id: 'filter', title: 'The filter', speed: 8,
      steps: [
        {
          view: 'filter', viewOpts: { caption: 'The filter of one nephron, close up. Blood flows from left to right.' }, remount: true,
          graph: NO_GRAPH, meters: NO_METERS,
          title: 'What gets through?',
          setup: () => setSim(new Kidney()),
          enter: (c) => { const v = c.view(); v.setOpen(c.stepState().done); v.showChart(false); v.showArteriole = false; v.showDay = false; },
          text: `<p>Zoom in on the filter: capillaries carrying blood under pressure, a wall with pores, and the cup that catches whatever comes through. Six things in her blood are drawn, in order of size.</p>
                 <p>Predict what will happen to each when the filter is opened.</p>`,
          extra: (el, c) => predictTable(el, c, {
            key: 'sieve', head: ['In her blood', 'Your prediction'], rows: SIEVE, runLabel: 'Open the filter', ran: (c) => c.stepState().done,
            run: (c) => { c.view().setOpen(true); experiment(c, { minutes: 80, speed: 8, after: (b, c) => c.complete() }); },
            after: 'What decided it was size, and nothing else.',
          }),
          waitFor: () => false, waitHint: 'Make your predictions and open the filter',
        },
        {
          view: 'filter', title: 'The rule',
          enter: (c) => { const v = c.view(); v.setOpen(true); v.showChart(false); v.showArteriole = false; v.showDay = false; },
          text: `<p>Glucose is a fuel her body needs. Urea is a waste. Watch a green glucose and a brown urea as they pass along the capillary.</p>`,
          question: { prompt: 'Which of the two did the filter let through more readily?', options: [
            { t: 'Neither: both passed as freely as water. The filter sorts by size and does not know what is waste', ok: true, fb: `So the fluid in the cup is blood plasma without its proteins, with glucose, salts and wastes all in it at the same concentrations as in the blood.${nameBox('The knot of capillaries: the <b>glomerulus</b>. The cup: the <b>glomerular capsule</b> (Bowman\'s capsule). Together: a <b>renal corpuscle</b>. The fluid that comes through: <b>filtrate</b>. The process: <b>glomerular filtration</b>. (Your textbook describes the three layers of the wall, the <b>filtration membrane</b>.)')}` },
            { t: 'Urea: the filter takes out wastes', fb: 'Count them: glucose comes through as often as urea does. The filter has no way to tell a waste from a fuel.' },
            { t: 'Glucose was held back, because the body needs it', fb: 'Watch a green glucose: it goes through the pores like everything else its size. Keeping it is a job for later.' },
          ] },
        },
        {
          view: 'filter', title: 'How much?', meters: NO_METERS,
          enter: (c) => { const v = c.view(); v.setOpen(true); v.showChart(false); v.showArteriole = false; v.showDay = c.stepState().answered; },
          text: `<p>All her nephrons together filter about <b>125 mL</b> of fluid every minute, all day and all night. (About a fifth of the plasma that flows through the filter comes through it; the rest carries on.)</p>`,
          question: { type: 'number', prompt: 'How many litres is that in a day? (There are 1,440 minutes in a day.)', unit: 'L a day', answer: () => 180, tol: 6, recordAs: 'perDay',
            onCorrect: (c) => { c.view().showDay = true; },
            hint: (c, v) => (v > 1000 ? 'That is in millilitres. Divide by 1,000 for litres.' : '125 mL × 1,440 minutes, then divide by 1,000 to turn millilitres into litres.'),
            explain: () => `About <b>180 litres</b> a day, from a body that holds only about 3 litres of plasma.${nameBox('The volume filtered each minute by all the nephrons together is the <b>glomerular filtration rate (GFR)</b>: about 125 mL/min, or 180 L/day. It is the single most used measure of how well kidneys are working.')}` },
        },
        {
          view: 'filter', title: 'What pushes it through?', meters: METERS.filter,
          setup: () => setSim(new Kidney().set('autoreg', 0)),
          enter: (c) => { const v = c.view(); v.setOpen(true); v.showChart(true); v.showArteriole = true; v.showDay = true; v.plot(); },
          text: `<p>Nothing here is pumped. <b>Blood pressure</b> pushes the fluid through the pores. Her resting pressure is about 93 mmHg (120/80).</p>
                 <p>For this step the small artery that feeds the filter is held at a <b>fixed width</b>. Move her blood pressure up to <b>120</b> or more (climbing stairs) and down to <b>80</b> or less (standing up quickly). Each setting is plotted on the chart.</p>`,
          extra: (el, c) => pressureDial(el, c, 'fixed'),
          question: { prompt: 'With a fixed arteriole, what would an ordinary day of standing, sitting and climbing stairs do to her filtering?', options: [
            { t: 'Swing it between a trickle and a flood', ok: true, fb: 'And the tubule would have to cope with a load that kept changing several-fold. The next step shows what a real kidney does about it.' },
            { t: 'Nothing much: filtering hardly depends on pressure', fb: 'Look at the grey curve you just drew. How does filtering at 120 mmHg compare with filtering at 80?' },
            { t: 'Raise it steadily through the day', fb: 'Blood pressure goes down as well as up. Look at what happened to filtering at 80 mmHg.' },
          ] },
          waitFor: (c) => data(c).hi && data(c).lo, waitHint: 'Try a pressure of 120 or more, and one of 80 or less',
        },
        {
          view: 'filter', title: 'Holding it steady', meters: METERS.filter,
          setup: () => setSim(new Kidney()),
          enter: (c) => { const v = c.view(); v.setOpen(true); v.showChart(true); v.showArteriole = true; v.showDay = true; if (!v.points.fixed.length) for (const m of [70, 80, 93, 105, 120, 135]) { app.sim.set('autoreg', 0).set('map', m); v.plot(); } app.sim.set('autoreg', 1).set('map', null); v.plot(); },
          text: `<p>Now the arteriole is free to <b>adjust itself</b>: when her blood pressure rises it narrows, and when the pressure falls it widens. Watch its width as you move the pressure.</p>
                 <p>Try <b>150</b> or more, then go down to <b>60</b> or less. The new points are plotted in blue.</p>`,
          extra: (el, c) => pressureDial(el, c, 'auto'),
          question: { prompt: 'The blue line is nearly flat from 80 to 180 mmHg, then drops. What does that mean for a patient whose blood pressure falls to 60 and stays there?', options: [
            { t: 'Filtering nearly stops, so wastes, water and potassium build up as they did in Mr. Herrera', ok: true, fb: `This is one common way for kidneys to fail suddenly: after heavy bleeding, in shock, or in severe dehydration. It is called <b>acute kidney injury</b>, and falling urine output is the early warning.${nameBox('The small artery feeding the glomerulus is the <b>afferent arteriole</b>; the one leaving it is the <b>efferent arteriole</b>. The kidney\'s ability to hold its own filtering steady is <b>autoregulation</b>. (Your textbook breaks the push through the filter into three pressures, the <b>net filtration pressure</b>.)')}` },
            { t: 'Nothing: the arteriole keeps filtering steady at any pressure', fb: 'Look at the blue points below 80 mmHg. Once the arteriole is fully open, there is nothing more it can do.' },
            { t: 'Filtering rises, to make up for the low pressure', fb: 'Pressure is what does the filtering. Look at the blue points below 80 mmHg.' },
          ] },
          waitFor: (c) => data(c).hi && data(c).lo, waitHint: 'Try a pressure of 150 or more, and one of 60 or less',
        },
      ],
    },
  ];

  // Scene 5's sorting table (also used for the results).
  const PASS = 'gets through', HELD = 'held back';
  var SIEVE = [
    ['red blood cell', HELD], ['blood protein (albumin)', HELD], ['glucose', PASS], ['urea', PASS], ['salt', PASS], ['water', PASS],
  ].map(([label, answer]) => ({ label, cells: [{ options: [PASS, HELD], answer }] }));

  // The two dials of scene 2, the start button and the time-in-range meter.
  function handDials(el, c) {
    el.className = 'extra';
    const d = data(c), b = app.sim;
    const cur = b.manualExit || { water: 1, na: 0.105 };
    const toFlow = (s) => +(0.3 * Math.pow(40, s / 100)).toFixed(2), fromFlow = (v) => Math.log(v / 0.3) / Math.log(40) * 100;
    const wd = dial(el, { cls: 'water', id: 'dial-water', label: 'Water out, in the urine (drag, or use the arrow keys)', min: 0, max: 100, step: 1, value: fromFlow(cur.water), show: (s) => `${flow(toFlow(s))} mL a minute`, ends: ['0.3: a trickle', '12: a flood'],
      onInput: (s) => { if (app.sim.manualExit) { app.sim.manualExit.water = toFlow(s); app.sim.compute(); } } });
    const sd = dial(el, { cls: 'salt', id: 'dial-salt', label: 'Salt out, in the urine', min: 0, max: 2, step: 0.05, value: cur.na * 60 / SALT, show: (v) => `${fx(v, 2)} g an hour`, ends: ['0', '2 g an hour'],
      onInput: (v) => { if (app.sim.manualExit) { app.sim.manualExit.na = v * SALT / 60; app.sim.compute(); } } });
    void wd; void sd;
    const row = htmlEl('div', { class: 'actions', style: 'margin-top:8px' });
    const go = htmlEl('button', { type: 'button', class: 'go' }, d.attempts ? 'Start her day again' : 'Start her day (7 am)');
    go.disabled = busy(c);
    go.addEventListener('click', () => {
      const keep = { water: toFlow(parseFloat($('#dial-water').value)), na: parseFloat($('#dial-salt').value) * SALT / 60 };
      setSim(studentStart(true)); app.sim.manual({ exit: keep }); app.sim.tag = 'hand';
      c.view().urine0 = 0;
      app.range = { T: 0, inT: 0, test: inBand };
      d.attempts = (d.attempts || 0) + 1; d.running = true; c.refresh();
      startRun({ duration: 16 * HOUR, speed: 8, onDone: () => {
        const R = app.range, pct = R && R.T > 0 ? 100 * R.inT / R.T : 0, x = app.sim;
        d.running = false; d.ran = true; d.pct = pct; d.ok = pct >= 70 || d.attempts >= 2;
        x.tag = 'handDone';
        c.recordValue('hand', { pct, urine: x.cum.urine / 1000, salt: x.cum.urineNa / SALT, attempts: d.attempts });
        c.refresh();
      } });
    });
    row.appendChild(go); el.appendChild(row);
    const meter = htmlEl('div', { style: 'margin-top:8px' });
    el.appendChild(meter);
    const paint = () => {
      const R = app.range, pct = d.running && R && R.T > 0 ? 100 * R.inT / R.T : d.ran ? d.pct : null;
      meter.innerHTML = pct == null ? '<span style="font-size:13px;color:var(--muted)">Time with water and salt both in range: —</span>' : `<div style="font-size:13px">Time with water and salt both in range: <b>${Math.round(pct)} %</b></div><div class="meterbar"><i style="width:${pct.toFixed(0)}%"></i></div>`;
      if (meter.isConnected) setTimeout(paint, 400);
    };
    setTimeout(paint, 0);
    if (d.ran && !d.running) el.appendChild(htmlEl('div', { class: 'feedback ' + (d.pct >= 70 ? 'good' : 'note'), style: 'margin-top:8px' },
      d.pct >= 70 ? `<b>${Math.round(d.pct)} % of the day in range.</b> You passed ${fx(c.record.values.hand.urine, 1)} L of urine carrying ${fx(c.record.values.hand.salt, 1)} g of salt, and no two hours of it were the same.`
        : d.ok ? `<b>${Math.round(d.pct)} % of the day in range.</b> It is a relentless job, and real kidneys do it for dozens of substances at once. You have seen the problem; carry on.`
          : `<b>${Math.round(d.pct)} % of the day in range.</b> Try once more. Read <b>Coming up</b>, and move the dial as soon as a gauge starts to drift: turn water out <b>up</b> after a drink, and <b>right down</b> while she is sweating.`));
  }
  // Scene 5: her blood pressure, by hand. mode: 'fixed' (arteriole held) or 'auto'.
  function pressureDial(el, c, mode) {
    el.className = 'extra';
    const d = data(c), need = mode === 'fixed' ? [120, 80] : [150, 60];
    const cur = app.sim.s.map == null ? 93 : app.sim.s.map;
    const checks = htmlEl('div', { class: 'checks' });
    const paint = () => { checks.innerHTML = `<div class="${d.hi ? 'done' : ''}">${d.hi ? '☑' : '☐'} a pressure of ${need[0]} or more</div><div class="${d.lo ? 'done' : ''}">${d.lo ? '☑' : '☐'} a pressure of ${need[1]} or less</div>`; };
    dial(el, { cls: '', id: 'dial-map', label: 'Pressure in her arteries (mean)', min: 50, max: 180, step: 5, value: cur, show: (v) => `${v} mmHg`, ends: ['50', '180'],
      onInput: (v) => {
        app.sim.set('map', v); c.view().plot();
        if (v >= need[0]) { d.hi = true; d.gHi = app.sim.f.gfr; } if (v <= need[1]) { d.lo = true; d.gLo = app.sim.f.gfr; }
        if (d.hi && d.lo) { c.recordValue(mode === 'fixed' ? 'gfrFixed' : 'gfrAuto', { hi: need[0], lo: need[1], gHi: gfrAt(need[0], mode), gLo: gfrAt(need[1], mode) }); c.complete(); }
        paint();
      } });
    el.appendChild(checks); paint();
  }
  const gfrAt = (map, mode) => new Kidney().set('autoreg', mode === 'fixed' ? 0 : 1).set('map', map).f.gfr;

  KD.L = { data, predict, afterPrediction, guess, nameBox, caseNote, isBody, bar, experiment, busy, dial, selectTable, predictTable, tableScore, studentStart, herreraStart, herreraWednesday, isHerreraWed, inBand, SIEVE, gfrAt,
    HERRERA, HERRERA_Q, SAM, DANA, RUNNER, BLED, LIN, DAYS, NO_GRAPH, NO_METERS };
  KD.PART_A = PART_A;
  void labHTML; void urineHTML; void clockTime; void BENCH;
})();
