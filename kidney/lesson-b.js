/* KidneySim lesson, scenes 6–10; the table of terms; results, completion code and saved progress.
 * See docs/KIDNEY_MODULE.md. */
(function () {
  'use strict';
  const { app, $, clamp, htmlEl, fx, signed, flow, big, setSim, startRun, skip, urineHTML, labHTML, LEDGER } = KD;
  const { Kidney, HOUR, DAY, SALT } = KidneySim;
  const { data, predict, afterPrediction, guess, nameBox, caseNote, isBody, bar, experiment, busy, dial, selectTable, predictTable, tableScore, studentStart, herreraWednesday, isHerreraWed, SIEVE,
    HERRERA, HERRERA_Q, SAM, DANA, RUNNER, BLED, LIN, DAYS, NO_GRAPH, NO_METERS } = KD.L;

  // ---------------------------------------------------------------- bodies and saved moments
  const rest = () => new Kidney();
  const hist = (key) => app.history.map(s => s[key]).filter(v => v != null);
  const maxOf = (key) => Math.max(...hist(key)), minOf = (key) => Math.min(...hist(key));
  // Her day left to her own kidneys, brought to a given time of day (minutes after midnight).
  function autoDayAt(t) {
    if (isBody() && app.sim.tag === 'auto' && Math.abs(app.sim.t - t) < 1.5 && app.history.length > 1) return;
    const b = studentStart(false); b.tag = 'auto'; setSim(b);
    if (t > b.t) skip(t - b.t);
  }
  function dana() {
    return new Kidney({ weight: 74, setup(b) { b.retain(2); b.s.volumeSet = b.volume; b.compute(); } });
  }
  function herreraAfterSession() {
    herreraWednesday();
    app.sim.dialyse({ hours: 4, removeWater: (app.sim.weight - 82) * 1000 }); skip(4 * HOUR);
  }
  const isAfterSession = () => isBody() && app.sim.s.nephrons === 0 && Math.abs(app.sim.t - 60 * HOUR) < 2;
  // The highest blood glucose (to the nearest 10) at which a urine test strip still reads negative.
  function threshold() { let last = 90; for (let g = 90; g <= 400; g += 10) { if (new Kidney().set('glucose', g).urineReport().glucose === 'negative') last = g; else break; } return last; }
  const cache = {};
  // Four urine reports for scene 8, each from the model with one thing changed.
  const FAULTS = [
    ['damage', 'A damaged filter', (b) => b.set('filterDamage', 1)],
    ['sugar', 'Blood glucose too high for the carriers', (b) => b.set('glucose', 400)],
    ['carrier', 'A drug blocking the glucose carriers', (b) => b.set('glucoseCarrier', 0.15)],
    ['salt', 'A drug blocking salt carriers in the loop', (b) => b.set('loopBlock', 0.25)],
  ];
  function faultCards() {
    if (!cache.faults) {
      const order = [2, 0, 3, 1];
      cache.faults = order.map((i, n) => { const b = rest(); FAULTS[i][2](b); return { key: FAULTS[i][0], answer: FAULTS[i][1], title: `Urine ${'ABCD'[n]}`, html: urineHTML(b.urineReport(), { title: 'Urine', bloodGlucose: b.glucose }) }; });
    }
    return cache.faults;
  }
  // Four patients for scene 10, each a body from the model.
  const WHO = [
    ['runner', 'Maya, after a half-marathon in the heat', () => { const b = rest(); b.steady = false; b.lose({ sweat: 2200, over: 120 }); b.advance(150); return b; }],
    ['bled', 'Tom, half an hour after heavy bleeding', () => { const b = rest(); b.steady = false; b.bleed(1500); b.advance(30); return b; }],
    ['sam', 'Sam, who missed his insulin', () => { const b = rest().set('glucose', 400).set('thirst', 1); b.advance(8 * HOUR); return b; }],
    ['lin', 'Mrs. Lin, with a quarter of her filtering left', () => { const b = rest().set('nephrons', 0.25).set('filterDamage', 0.6).set('thirst', 1); b.advance(12 * DAY); return b; }],
  ];
  function patientCards() {
    if (!cache.patients) {
      const order = [3, 1, 0, 2];
      cache.patients = order.map((i, n) => {
        const b = WHO[i][2](), bp = b.bp, lab = b.labPanel(['creatinine', 'BUN', 'K', 'glucose']);
        return { key: WHO[i][0], answer: WHO[i][1], title: `Chart ${'ABCD'[n]}`, sub: `BP ${bp.sys}/${bp.dia}`, body: b, html: `<div class="pair"><div>${urineHTML(b.urineReport(), { title: 'Urine', hourly: true, compact: true })}</div><div>${labHTML(lab, 'Blood')}</div></div>` };
      });
    }
    return cache.patients;
  }
  function matchTable(el, c, key, cards, done) {
    const names = cards.map(x => x.answer).slice().sort();
    selectTable(el, c, {
      key, head: ['', 'Whose is it?'], rows: cards.map((x) => ({ label: x.title, cells: [{ options: names, answer: x.answer }] })), done,
      onChange: (st) => { const v = c.view(); if (v && v.mark) cards.forEach((x, i) => v.mark(i, st[`${i}.0`] === x.answer)); },
    });
  }

  const GRAPH = {
    day: { window: 16 * HOUR, rows: ['osm', 'flow', 'uosm'], clock: true, over: { flow: { hi: 8 } } },
    dana: { window: 8 * HOUR, rows: ['flow', 'weight', 'gfr'], title: 'Mrs. Brooks, after one tablet', over: { flow: { hi: 12 }, weight: { lo: 73.5, hi: 76.5 } } },
    bleed: { window: 45, rows: ['gfr', 'flow'], title: 'Tom Bradley', over: { flow: { hi: 1.2 } } },
    herrera: { window: 50 * HOUR, rows: ['weight', 'k', 'bun'], clock: true, over: { weight: { lo: 81, hi: 85.5, band: [81.5, 82.5] }, bun: { hi: 80 } } },
    loss: { window: 20 * DAY, rows: ['gfr', 'cr'], title: 'Losing nephrons', over: { cr: { hi: 4.2 } } },
  };
  const METERS = {
    drain: () => { if (!isBody()) return []; const b = app.sim, p = b.bp; return [['Time', `${Math.round(b.t)} min`], ['Fluid lost', `${fx(70 - b.weight, 1)} L`, 70 - b.weight > 1 ? 'bad' : ''], ['Blood pressure', `${p.sys}/${p.dia}`, p.sys < 100 ? 'bad' : '']]; },
    hormones: () => { if (!isBody()) return []; const b = app.sim, w = b.manualLate ? b.manualLate.w : b.w, a = b.manualLate ? b.manualLate.a : b.a; return [['Filtered (GFR)', `${fx(b.f.gfr, 0)} mL/min`], [b.manualLate ? 'Water taken back (you)' : 'ADH', bar(w)], [b.manualLate ? 'Salt taken back (you)' : 'Aldosterone', bar(a)]]; },
    bleed: () => { if (!isBody()) return []; const b = app.sim, p = b.bp; return [['Blood pressure', `${p.sys}/${p.dia}`, p.sys < 100 ? 'bad' : ''], ['Filtered (GFR)', `${fx(b.f.gfr, 0)} mL/min`, b.f.gfr < 60 ? 'bad' : ''], ['Urine', `${fx(b.f.urine.flow * 60, 0)} mL/hour`, b.f.urine.flow * 60 < 30 ? 'bad' : '']]; },
    loss: () => { if (!isBody()) return []; const b = app.sim; return [['Working nephrons', `${Math.round(100 * b.s.nephrons)} %`], ['Filtered (GFR)', `${fx(b.f.gfr, 0)} mL/min`], ['Creatinine', `${fx(b.creatinine, 1)} mg/dL`, b.creatinine > 1.25 ? 'bad' : 'good']]; },
  };
  const STRIP = (o) => Object.assign({ kinds: ['water'], ledger: [] }, o);

  // Scene 7: one substance at a time, with the three questions.
  const Q1 = '1. Does it get through the filter?', Q2 = '2. Is it taken back from the tubule?', Q3 = '3. Is extra pushed in from the return line?', Q4 = 'So, in the urine there is…';
  const O2 = ['all of it', 'about half', 'none of it', 'it never reached the tubule'], O4 = ['none', 'less than was filtered', 'exactly what was filtered', 'more than was filtered'];
  const fate = (a1, a2, a3, a4) => [{ label: Q1, cells: [{ options: ['yes', 'no'], answer: a1 }] }, { label: Q2, cells: [{ options: O2, answer: a2 }] }, { label: Q3, cells: [{ options: ['yes', 'no'], answer: a3 }] }, { label: Q4, cells: [{ options: O4, answer: a4 }] }];
  const FATES = {
    alb: fate('no', 'it never reached the tubule', 'no', 'none'),
    glucose: fate('yes', 'all of it', 'no', 'none'),
    cr: fate('yes', 'none of it', 'no', 'exactly what was filtered'),
    drug: fate('yes', 'none of it', 'yes', 'more than was filtered'),
  };
  const SENT = ['water'];
  const substance = (kind, title, text, after, kinds) => ({
    view: 'strip', title,
    setup: () => setSim(kind === 'drug' ? rest().set('drugHold', 500) : rest()),
    enter: (c) => { const v = c.view(), done = c.stepState().done; v.show(done ? (kinds || [kind]) : ['water']); for (const k of SENT) v.reveal(k); if (done) v.reveal(kind); },
    text,
    extra: (el, c) => predictTable(el, c, {
      key: 'fate-' + kind, head: ['', 'Your prediction'], rows: FATES[kind], runLabel: `Send ${LEDGER[kind].name} through`, ran: (c) => c.stepState().done, after,
      run: (c) => { c.view().show(kinds || [kind]); experiment(c, { minutes: 14, speed: 1.6, after: (b, c) => { c.view().reveal(kind); c.recordValue('ledger-' + kind, b.ledger(kind)); c.complete(); } }); },
    }),
    waitFor: () => false, waitHint: 'Make your predictions and send it through',
  });

  // =========================================================================
  // Scenes 6–10
  // =========================================================================
  const PART_B = [
    // ------------------------------------------------------------- 6. taking it back
    {
      id: 'back', title: 'Taking it back', speed: 2,
      steps: [
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['water'], ledger: ['water'], caption: 'One nephron, straightened. The width of the pale blue stream is the flow.' }), remount: true,
          graph: NO_GRAPH, meters: METERS.drain,
          title: 'If nothing came back',
          setup: () => setSim(rest()),
          enter: (c) => { c.view().show(['water']); },
          text: `<p>The filter passes 125 mL a minute. Her blood holds about <b>3 litres</b> (3,000 mL) of plasma.</p>`,
          question: { type: 'number', prompt: 'If nothing were taken back, how many minutes would it take to filter a volume equal to all of her plasma?', unit: 'minutes', answer: () => 24, tol: 1.5, recordAs: 'plasmaMinutes',
            hint: () => '3,000 mL of plasma ÷ 125 mL a minute.', onCorrect: (c) => c.refresh(),
            explain: () => 'Now see what the model makes of it: switch the return off.' },
          actions: [{ label: 'Switch the return off (run 30 minutes)', cls: 'warnb', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { sim: () => { const b = rest().set('takeBack', 0); b.steady = false; return b; }, minutes: 30, speed: 2, after: (b, c) => c.recordValue('drain', { lost: 70 - b.weight, bp: b.bp, plasma: b.plasma }) }) }],
          status: (c) => { const v = c.record.values.drain; return data(c).ran && v ? `In 30 minutes she lost <b>${fx(v.lost, 1)} L</b> of fluid as urine, and her blood pressure fell to <b>${v.bp.sys}/${v.bp.dia}</b>. (Fluid from around her cells refills the plasma for a while, or it would already be gone.)` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Run it with the return switched off',
        },
        {
          view: 'strip', title: 'With the return on', meters: NO_METERS,
          setup: () => setSim(rest()),
          enter: (c) => { const v = c.view(); v.show(['water']); if (c.stepState().answered) v.reveal('water'); },
          text: `<p>The return is back on, as in life. Follow the pale blue stream from the filter to the urine and read the numbers written along it. The blue arrows show the water being taken back.</p>`,
          question: { type: 'number', prompt: 'Of every 125 mL filtered, how many millilitres are left as urine?', unit: 'mL', answer: () => app.sim.f.urine.flow, tol: 0.35, recordAs: 'urineFlow',
            onCorrect: (c) => c.view().reveal('water'),
            hint: () => 'Read the number at the right-hand end of the stream, where it drips into the urine.',
            explain: (c) => { const L = app.sim.ledger('water'); return `About 1 mL: more than <b>99 %</b> of the water that is filtered is taken back. Over a day (the table under the picture): <b>${big(L.filtered)} L</b> filtered, <b>${fx(L.reabsorbed, 1)} L</b> taken back, <b>${fx(L.excreted, 1)} L</b> of urine.`; } },
        },
        {
          view: 'strip', title: 'How does it get back?',
          setup: () => setSim(rest()),
          enter: (c) => { const v = c.view(); v.show(['na', 'water']); v.reveal('water'); v.setNames(c.stepState().answered); },
          text: `<p>Now salt (orange) is drawn as well as water. The cells of the tubule's wall <b>pump salt</b> out of the fluid and across to the return line, using energy. There is no pump for water anywhere in the body.</p>
                 <p>Most of this happens in the <b>first stretch</b>, which takes back about two-thirds of the salt and water, every minute of every day, whatever the body happens to need.</p>`,
          question: { prompt: 'There are no water pumps. So what moves 124 mL of water a minute back into the blood?', onCorrect: (c) => c.view().setNames(true), options: [
            { t: 'It follows the salt: where salt is carried across, water moves after it by osmosis', ok: true, fb: `<b>Water follows salt.</b> Keep that rule: it explains diuretics and the thirst of diabetes in scene 8.${nameBox('Taking substances back from the filtrate into the blood: <b>tubular reabsorption</b>. The tube: the <b>renal tubule</b>. Its first stretch: the <b>proximal convoluted tubule</b>. The return line: the <b>peritubular capillaries</b> (that is what the second set of capillaries in scene 3 was for).')}` },
            { t: 'Blood pressure pushes it back', fb: 'Pressure pushed it out of the blood at the filter. Along the tubule the pressure is low. What is being carried across that water could follow?' },
            { t: 'The return line sucks it across', fb: 'The return line does carry the water away once it is across. But what moves it out of the tubule in the first place? Think of osmosis: what is being carried across that water could follow?' },
          ] },
        },
        {
          view: 'strip', title: 'Why so much blood?',
          setup: () => setSim(rest()),
          enter: (c) => { const v = c.view(); v.show(['water']); v.reveal('water'); v.setNames(true); },
          text: `<p>Back to the question from scene 3: why do the kidneys take a fifth of the heart's output? They filter 180 L a day, and she has 3 L of plasma.</p>`,
          question: { type: 'number', prompt: 'How many times a day is a volume equal to all her plasma filtered and taken back?', unit: 'times a day', answer: () => 60, tol: 3, recordAs: 'timesPerDay',
            hint: () => '180 L filtered a day ÷ 3 L of plasma.',
            explain: () => 'About <b>60 times a day</b>. A volume equal to all her plasma passes the tubule about every 24 minutes, so the kidney can start correcting any change within minutes and finish within hours. That takes a great deal of blood flow.' },
        },
      ],
    },
    // ------------------------------------------------------------- 7. four substances, three questions
    {
      id: 'four', title: 'Four substances, three questions', speed: 1.6,
      steps: [
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['water'], ledger: ['water', 'alb', 'glucose', 'cr', 'drug'], revealed: ['water'], names: true, caption: 'The table under the picture is a ledger: what is filtered, taken back, pushed in, and left in the urine each day.' }), remount: true,
          graph: NO_GRAPH, meters: NO_METERS,
          title: 'Three questions',
          setup: () => setSim(rest()),
          enter: (c) => { c.view().show(['water']); for (const k of SENT) c.view().reveal(k); },
          text: `<p>You can now work out what the kidney does with anything in the blood, by asking three questions in order:</p>
                 <ol><li>Does it get <b>through the filter</b>?</li><li>Is it <b>taken back</b> from the tubule?</li><li>Is any extra <b>pushed in</b> from the return line?</li></ol>
                 <p>Whatever is left is in the urine. You have done it for water: the first row of the ledger. Now four more, predicting each before you send it through.</p>`,
          question: { prompt: 'For water, which of the three questions has the answer "yes"?', options: [
            { t: 'The first two: it is filtered, and nearly all of it is taken back', ok: true, fb: 'And nothing is pushed in. 180 L − 178.6 L leaves about 1.4 L.' },
            { t: 'Only the first: it is filtered', fb: 'Then all 180 L would leave as urine. Look at the second column of the ledger.' },
            { t: 'All three', fb: 'Look at the third column of the ledger for water: nothing is pushed in.' },
          ] },
        },
        substance('alb', 'A blood protein', `<p><b>Albumin</b> is the commonest protein in her blood: about 4 g in every 100 mL. It is far larger than anything that passed the filter in scene 5.</p>`, 'It never left the blood. A healthy person\'s urine contains almost no protein.'),
        substance('glucose', 'Glucose', `<p>Her blood glucose is 90 mg/dL, and glucose is small. The first stretch of the tubule is lined with carriers that fit it.</p>`, 'About 160 g of glucose is filtered every day, and every gram is carried back. None is wasted.'),
        substance('cr', 'Creatinine', `<p><b>Creatinine</b> is a waste her muscles make at a steady rate, about 1.6 g a day. It is small, and the tubule does not take it back.</p>`, `Everything filtered leaves, and almost nothing else does. So the amount of creatinine leaving each minute = the filtering rate × the level in the blood. Measure the level in the blood and you can work out the filtering rate.${nameBox('That is why <b>creatinine</b> is on every blood panel: it is how filtering (GFR) is estimated without measuring it directly. You will use it in scene 10.')}`),
        substance('drug', 'A drug', `<p><b>Penicillin</b> is small. The tubule has no carrier to take it back. But its cells do have carriers that pick up certain molecules from the <b>return line</b> and push them into the tubule.</p>`, `More leaves than was ever filtered, because it is pushed in as well. Half of a dose of penicillin is gone in about half an hour, which is why it is given several times a day.${nameBox('Moving a substance from the blood of the return line into the tubule: <b>tubular secretion</b>. Many drugs, and some of the body\'s own wastes and potassium, leave partly this way.')}`, ['drug']),
        {
          view: 'strip', title: 'The sum',
          setup: () => setSim(rest().set('drugHold', 500)),
          enter: (c) => { const v = c.view(); v.show(['glucose', 'cr', 'drug']); for (const k of ['water', 'alb', 'glucose', 'cr', 'drug']) v.reveal(k); },
          text: `<p>The ledger is complete. Read across any row: the last column is the first, minus the second, plus the third.</p>`,
          question: { prompt: 'A new substance is small, is not taken back, and is not pushed in. How much of it will be in the urine each day?', options: [
            { t: 'Exactly as much as is filtered', ok: true, fb: `Like creatinine. You answered without knowing what the substance is: that is what the three questions are for.${nameBox('<b>Excreted = filtered − reabsorbed + secreted.</b> Your textbook lists, for each stretch of the tubule, which substances are reabsorbed and secreted there. Every item on those lists is an answer to question 2 or question 3.')}` },
            { t: 'None: the kidney only excretes wastes it recognises', fb: 'Think of design 2 in scene 4. What happens to anything small that nothing takes back?' },
            { t: 'It cannot be known without knowing the substance', fb: 'You have been told the answers to all three questions. Filtered: yes. Taken back: no. Pushed in: no. What is left?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 8. break a step, read the urine
    {
      id: 'break', title: 'Break a step, read the urine', speed: 30,
      steps: [
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['alb', 'glucose', 'water'], ledger: ['water', 'na', 'glucose', 'alb'], revealed: ['water', 'na', 'glucose', 'alb'], names: true, urineDetail: true, report: true, caption: 'The same nephron, with a report on its urine underneath. From here on, one step at a time will be broken.' }), remount: true,
          graph: NO_GRAPH, meters: NO_METERS,
          title: 'A urine report',
          setup: () => setSim(rest()),
          enter: (c) => c.view().show(['alb', 'glucose', 'water']),
          text: `<p>Urine is easy to collect, and it is evidence of what the nephron did. Under the picture is the healthy student's urine as a <b>test strip</b> (protein, glucose, blood) and a measuring jug would report it. Her blood contains 90 mg/dL of glucose and 4 g/dL of albumin, its main protein; her urine has neither.</p>
                 <p><b>Concentration</b> is how much is dissolved in each litre. On this scale blood is about 290, and urine can be anywhere from 50 (nearly water) to 1,200.</p>`,
          question: { prompt: 'Is glucose missing from her urine for the same reason that protein is?', options: [
            { t: 'No: protein never got through the filter; glucose got through and was all taken back', ok: true, fb: 'Two different steps. So each can fail by itself, and the urine will show which one did.' },
            { t: 'Yes: the filter holds both back', fb: 'In scene 5 glucose passed the filter as freely as water. What happened to it afterwards?' },
            { t: 'Yes: the tubule takes both back', fb: 'Protein never reaches the tubule: it is too large for the filter.' },
          ] },
        },
        {
          view: 'strip', title: 'Damage the filter',
          setup: () => setSim(rest()),
          enter: (c) => c.view().show(data(c).ran ? ['alb', 'rbc', 'water'] : ['alb', 'water']),
          text: `<p>Years of high blood glucose or high blood pressure can damage the wall of the filter, leaving gaps wider than its pores. That is how Mr. Herrera's kidney disease began.</p>`,
          question: predict({ prompt: 'Predict: what will a damaged filter put in the urine?', options: [
            { t: 'Protein, and perhaps red blood cells', ok: true, fb: 'Damage it and read the report.' },
            { t: 'Glucose', fb: 'Glucose already passes an intact filter, and the tubule takes it back as usual. What is normally too large to pass?' },
            { t: 'Nothing new: the tubule will take back whatever leaks through', fb: 'The tubule has carriers for a short list of things. Are large proteins and red cells on it?' },
          ] }),
          actions: [{ label: 'Damage the filter', cls: 'warnb', disabled: (c) => afterPrediction(c) || data(c).ran, run: (c) => { app.sim.set('filterDamage', 1); c.view().show(['alb', 'rbc', 'water']); data(c).ran = true; c.recordValue('damage', app.sim.urineReport()); c.refresh(); } }],
          status: (c) => (data(c).ran ? `The report now shows protein <b>${c.record.values.damage.protein}</b> and blood <b>${c.record.values.damage.blood}</b>; glucose is still negative.${nameBox('Protein in the urine: <b>proteinuria</b>. It points to the filter: blood proteins are too large to get in anywhere else. Blood in the urine: <b>hematuria</b>. Blood can come from a damaged filter, but more often it comes from further down (a stone, an infection, the bladder), so it always needs explaining.')}` : ''),
          waitFor: (c) => data(c).ran, waitHint: 'Damage the filter',
        },
        {
          view: 'strip', title: 'Too much to take back',
          setup: () => setSim(rest()),
          enter: (c) => c.view().show(['glucose', 'water']),
          text: `${caseNote('Sam Reyes', SAM)}
                 <p>Sam's filter and tubule are healthy. Raise the blood glucose step by step. Watch the green glucose in the first stretch, and the report under the picture.</p>`,
          extra: (el, c) => glucoseDial(el, c),
          question: { type: 'number', prompt: 'To the nearest 10: what is the highest blood glucose at which the urine test for glucose is still negative?', unit: 'mg/dL', answer: () => threshold(), tol: 10, recordAs: 'threshold',
            hint: () => 'Start at 90 and go up 10 at a time, reading the Glucose line of the report each time.',
            explain: () => `The carriers can take back only so much each minute. Up to about 180 mg/dL they take back everything that is filtered. Above that, some stays in the tubule and leaves in the urine, and the higher the blood glucose, the more.${nameBox('The most a carrier system can move: its <b>transport maximum</b> (for glucose, about 375 mg a minute). The blood level at which a substance first appears in the urine: its <b>renal threshold</b> (for glucose, about 180 mg/dL). Glucose starts to escape before every carrier is full, because some nephrons reach their limit before others. Glucose in the urine: <b>glucosuria</b>.')}` },
          waitFor: (c) => data(c).high, waitHint: "Set the blood glucose to Sam's 400 mg/dL",
        },
        {
          view: 'strip', title: 'Why so much urine?',
          setup: () => setSim(rest().set('glucose', 400)),
          enter: (c) => c.view().show(['glucose', 'water']),
          text: () => { const b = app.sim, u = b.urineReport(); return `<p>At 400 mg/dL Sam is losing <b>${fx(b.ledger('glucose').excreted, 0)} g</b> of glucose a day in <b>${fx(u.perDay, 1)} L</b> of urine: nearly three times the usual volume. Look at the stream in the last stretch: it is wider than before. His filtering rate has not changed.</p>`; },
          question: { prompt: 'Why does glucose left in the tubule increase the volume of urine?', options: [
            { t: 'Glucose that is not taken back holds water in the tubule with it', ok: true, fb: `Water follows what is carried across, and stays with what is not. Sam's thirst is his body replacing the water. And his kidneys are <b>not</b> damaged: they are doing exactly what they always do.${nameBox('A large volume of urine: <b>polyuria</b>. Polyuria with thirst is often the first sign of diabetes mellitus.')}` },
            { t: 'High glucose makes the kidneys filter more', fb: 'Compare the "mL/min filtered" at the start of the stream with the healthy student\'s 125. What has changed is further along.' },
            { t: 'He drinks more, so he passes more', fb: 'It is the other way round: he drinks because he is losing water. What is holding the water in the tubule?' },
          ] },
        },
        {
          view: 'strip', title: 'A drug that blocks the glucose carrier',
          setup: () => setSim(rest()),
          enter: (c) => c.view().show(['glucose', 'water']),
          text: `<p>A healthy person, blood glucose 90 mg/dL. A newer group of diabetes drugs (their names end in <i>-gliflozin</i>) block most of the glucose carriers in the first stretch.</p>`,
          question: predict({ prompt: 'Her blood glucose is normal. With most of the carriers blocked, will there be glucose in her urine?', options: [
            { t: 'Yes: the carriers that are left cannot take back even a normal load', ok: true, fb: 'Give the drug and read the report.' },
            { t: 'No: glucose appears in urine only when blood glucose is high', fb: 'It appears whenever more is filtered than the carriers can take back. What has the drug done to the carriers?' },
            { t: 'No: the filter will hold the glucose back', fb: 'The filter passes glucose whatever happens downstream.' },
          ] }),
          actions: [{ label: 'Give the drug', cls: 'drugb', disabled: (c) => afterPrediction(c) || data(c).ran, run: (c) => { app.sim.set('glucoseCarrier', 0.15); data(c).ran = true; c.recordValue('carrier', { g: app.sim.ledger('glucose').excreted, report: app.sim.urineReport().glucose }); c.refresh(); } }],
          status: (c) => (data(c).ran ? `<div class="feedback note">About <b>${fx(c.record.values.carrier.g, 0)} g</b> of glucose a day now leaves in the urine. That is the point of the drug: in diabetes it lowers blood glucose by letting the kidneys spill it. A positive urine glucose in someone taking it is expected.</div>` : ''),
          waitFor: (c) => data(c).ran, waitHint: 'Give the drug',
        },
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['na', 'water'], ledger: ['water', 'na'], revealed: ['water', 'na'], names: true, urineDetail: true, short: true, caption: 'Mrs. Brooks. Time is running: 30 minutes a second.' }), remount: true,
          graph: GRAPH.dana, speed: 30,
          title: 'A drug that blocks a salt carrier',
          setup: () => setSim(dana()),
          enter: (c) => c.view().show(['na', 'water']),
          text: `${caseNote('Dana Brooks', DANA)}
                 <p>Furosemide blocks carriers that take back <b>salt</b> in the loop. The graph will show her urine, her weight, and her filtering rate.</p>`,
          question: predict({ prompt: 'Predict her urine over the next few hours.', options: [
            { t: 'Much more salt, and much more water with it', ok: true, fb: 'Give the tablet and watch all three rows of the graph.' },
            { t: 'More salt, in the same volume of water', fb: 'Remember the rule from scene 6: what does water do when salt is left behind in the tubule?' },
            { t: 'Less urine: blocking a carrier slows the kidney down', fb: 'The carrier takes salt <i>back</i>. If it is blocked, where does that salt go, and what goes with it?' },
          ] }),
          actions: [{ label: 'Give the tablet (run 8 hours)', cls: 'drugb', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => { const w0 = app.sim.weight; experiment(c, { before: (b) => { b.take({ diuretic: 1 }); KD.mark('furosemide'); }, minutes: 8 * HOUR, speed: 30, after: (b, c) => c.recordValue('dana', { urine: b.cum.urine / 1000, salt: b.cum.urineNa / SALT, w0, w1: b.weight, peak: maxOf('flow'), gfrLo: minOf('gfr'), gfrHi: maxOf('gfr') }) }); } }],
          status: (c) => { const v = c.record.values.dana; return data(c).ran && v ? `In 8 hours: <b>${fx(v.urine, 1)} L</b> of urine carrying <b>${fx(v.salt, 0)} g</b> of salt; weight ${fx(v.w0, 1)} → <b>${fx(v.w1, 1)} kg</b>. Fastest flow ${fx(v.peak, 0)} mL/min. Filtering stayed between ${fx(v.gfrLo, 0)} and ${fx(v.gfrHi, 0)} mL/min.` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Give the tablet',
        },
        {
          view: 'strip', title: 'What a diuretic does',
          setup: () => { if (!(isBody() && app.sim.weight0 === 74 && app.sim.t > 7 * HOUR)) { setSim(dana()); app.sim.take({ diuretic: 1 }); skip(8 * HOUR); } },
          text: `<p>Mrs. Brooks lost about two litres in a few hours, which is what her swollen ankles and wet lungs needed. Look at the bottom row of the graph.</p>`,
          question: { prompt: 'Did the drug work by making her kidneys filter more?', options: [
            { t: 'No: filtering hardly changed. Less salt was taken back, so less water was', ok: true, fb: `Nearly every drug that increases urine volume works on taking-back, and none works on the filter.${nameBox('A drug that increases urine volume: a <b>diuretic</b>. Furosemide is a <b>loop diuretic</b>, named for where it acts. More salt reaching the last stretch also means more potassium pushed out there, which is why potassium is checked in patients on these drugs. After the dose wears off, notice how little urine she makes: the kidney is holding on to salt again.')}` },
            { t: 'Yes: more was filtered, so more urine was made', fb: 'Read the bottom row of the graph: the filtering rate (GFR) through the eight hours.' },
            { t: 'It pumped water into the tubule', fb: 'There are no water pumps, in the body or in a tablet. The drug blocked a salt carrier. What does water do when salt stays in the tubule?' },
          ] },
        },
        {
          view: 'cards', viewOpts: { cards: () => faultCards(), caption: 'Four urine reports. Each came from the model with one thing changed.' }, remount: true,
          graph: NO_GRAPH,
          title: 'Whose urine?',
          setup: () => setSim(rest()),
          text: `<p>Four reports, A to D, each from the model with one step broken or blocked. Match each to its cause. The line at the bottom of each report gives the blood glucose.</p>`,
          extra: (el, c) => matchTable(el, c, 'faults', faultCards(), '<b>All four matched.</b> Notice which line of the report you used for each: protein (with or without blood) for the filter; glucose, read together with the blood glucose, for the carriers; volume for the salt carrier.'),
          waitFor: () => false, waitHint: 'Match all four reports',
        },
      ],
    },
    // ------------------------------------------------------------- 9. the adjustable part
    {
      id: 'adjust', title: 'The adjustable part', speed: 15,
      steps: [
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['na', 'water'], ledger: ['water', 'na'], revealed: ['water', 'na'], names: true, urineDetail: true, lastDials: true, short: true, caption: 'The last stretch is where the amounts are adjusted.' }), remount: true,
          graph: NO_GRAPH, meters: NO_METERS,
          title: 'The last few percent',
          setup: () => setSim(rest()),
          enter: (c) => c.view().show(['na', 'water']),
          text: `<p>So far, everything the tubule did was the same from hour to hour. The first stretch and the loop take back about 92 % of the filtered salt and 82 % of the water, whatever the body needs.</p>
                 <p>What is left reaches the <b>last stretch</b>, and there the amounts taken back <b>can be changed</b>. It sounds like fine-tuning. Work out how fine.</p>`,
          question: { type: 'number', prompt: 'She filters 180 L a day. If the last stretch took back just 1 % less of that, how many more litres of urine would she pass a day?', unit: 'L more a day', answer: () => 1.8, tol: 0.15, recordAs: 'onePercent',
            hint: () => '1 % of 180 L.',
            explain: () => 'About <b>1.8 L</b> more: her urine volume would more than double. Because so much is filtered, a tiny change in what is taken back is a large change in the urine.' },
        },
        {
          view: 'strip', title: 'Try the two dials', meters: METERS.hormones,
          setup: () => { const b = rest(); b.manual({ late: { w: b.w, a: 0.5 } }); setSim(b); },
          enter: (c) => c.view().show(['na', 'water']),
          text: `<p>In scene 2 you set what left the body without knowing how. These are the real dials: how much <b>water</b> and how much <b>salt</b> the last stretch takes back. Watch the end of the stream, the urine, and the line under "last stretch".</p>`,
          extra: (el, c) => lateDials(el, c),
          waitFor: (c) => data(c).flood && data(c).trickle && data(c).nosalt, waitHint: 'Make all three kinds of urine',
        },
        {
          view: 'strip', title: 'Morning: a big bottle of water',
          graph: GRAPH.day, meters: METERS.hormones, speed: 15,
          setup: () => autoDayAt(7 * HOUR),
          enter: (c) => c.view().show(['na', 'water']),
          text: `<p>The same day as scene 2, but now her kidneys run themselves. Two meters at the top show two <b>hormones</b>. The graph shows the concentration of her blood (the top row; the band is the same ¾ L of water you defended), and her urine.</p>
                 <p>At 9:30 she drinks 800 mL of water.</p>`,
          question: predict({ prompt: 'Predict her urine over the following two hours.', options: [
            { t: 'More of it, and more dilute', ok: true, fb: 'Run the morning and watch which meter moves.' },
            { t: 'More of it, and more concentrated', fb: 'She has taken in water with nothing dissolved in it. What needs to leave?' },
            { t: 'No change: the kidneys filter at a steady rate', fb: 'They do filter at a steady rate. But filtering is not what sets the urine: think of the dial you turned in the last step.' },
          ] }),
          actions: [{ label: 'Run the morning (to 12:30)', cls: 'go', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { minutes: 5.5 * HOUR, speed: 15, after: (b, c) => c.recordValue('morning', { peak: maxOf('flow'), dilute: minOf('uosm'), gfrLo: minOf('gfr'), gfrHi: maxOf('gfr'), osmLo: minOf('osm') }) }) }],
          status: (c) => { const v = c.record.values.morning; return data(c).ran && v ? `Urine flow rose to <b>${fx(v.peak, 1)} mL/min</b> and its concentration fell to <b>${big(v.dilute)} mOsm/L</b>. Her blood never went below ${big(v.osmLo)}. Filtering stayed at ${fx(v.gfrLo, 0)}–${fx(v.gfrHi, 0)} mL/min.` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Run the morning',
        },
        {
          view: 'strip', title: 'What turned the dial?',
          setup: () => autoDayAt(12.5 * HOUR),
          text: `<p>Look at the graph. The water diluted her blood a little; within the hour her urine was a flood of nearly clear water; then everything returned to where it started.</p>`,
          question: { prompt: 'The filtering rate did not change. What did?', options: [
            { t: 'One hormone fell, and the last stretch took back less water', ok: true, fb: `Cells in the brain sense the concentration of the blood. When it falls, they release less of this hormone.${nameBox('The hormone is <b>antidiuretic hormone (ADH)</b>, released from the posterior pituitary (the gland you met in EndoSim). ADH makes the wall of the last stretch let water through, so water can follow salt back to the blood. More ADH, less urine: "anti-diuretic".')}` },
            { t: 'She filtered more', fb: 'Read the status line of the last step, or the Filtered meter: it stayed at about 125 mL/min all morning.' },
            { t: 'The first stretch took back less', fb: 'The first stretch takes back the same two-thirds whatever happens. Which stretch can be adjusted?' },
          ] },
        },
        {
          view: 'strip', title: 'Lunch: 5 g of salt',
          setup: () => autoDayAt(12.5 * HOUR),
          text: `<p>At 12:30 she eats a salty lunch: about 5 g of salt, a teaspoonful, with a small drink.</p>`,
          question: predict({ prompt: 'Predict her urine this afternoon.', options: [
            { t: 'More salt in it, and no more water than usual', ok: true, fb: 'Run the afternoon and watch the other meter.' },
            { t: 'More salt, carried out in a large volume of water', fb: 'She has too much salt, not too much water. Losing a lot of water with it would leave her blood even more concentrated.' },
            { t: 'No extra salt: the tubule always takes back the same amount', fb: 'The first stretch and the loop do. Think of the second dial on the last stretch.' },
          ] }),
          actions: [{ label: 'Run the afternoon (to 3:30)', cls: 'go', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => { const na0 = app.sim.f.ex.na; experiment(c, { minutes: 3 * HOUR, speed: 15, after: (b, c) => c.recordValue('lunch', { before: na0 * 60 / SALT, after: b.f.ex.na * 60 / SALT, osm: b.f.urine.osm, flow: b.f.urine.flow }) }); } }],
          status: (c) => { const v = c.record.values.lunch; return data(c).ran && v ? `Salt in her urine: ${fx(v.before, 2)} → <b>${fx(v.after, 2)} g an hour</b> (her usual is about 0.4). Urine flow ${fx(v.flow, 1)} mL/min, about her usual 1, and more concentrated: <b>${big(v.osm)} mOsm/L</b>.${nameBox('The second hormone is <b>aldosterone</b>, from the adrenal cortex. Aldosterone makes the last stretch take back more salt (and push out more potassium). After a salty meal it falls, so more salt is left in the urine.')}` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Run the afternoon',
        },
        {
          view: 'strip', title: 'A run in the heat',
          setup: () => autoDayAt(15.5 * HOUR),
          text: `<p>At 3:30 she goes for a run and sweats out a litre of water, with some salt, in an hour. She drinks nothing until she gets home.</p>`,
          question: predict({ prompt: 'Predict her urine at the end of the run.', options: [
            { t: 'A trickle, dark and concentrated', ok: true, fb: 'Run it, then finish her day.' },
            { t: 'The usual amount: the kidneys cannot tell she is sweating', fb: 'They do not need to know why. Her blood has become more concentrated and her blood volume smaller, and both are sensed.' },
            { t: 'None at all', fb: 'Close, but wastes still have to leave, and they need some water to carry them. How little can she get away with?' },
          ] }),
          actions: [
            { label: 'Run the hour of the run', cls: 'go', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { minutes: 68, speed: 8, after: (b, c) => c.recordValue('heat', { flow: b.f.urine.flow, osm: b.f.urine.osm, salt: b.f.ex.na * 60 / SALT, water: b.waterExcess, adh: b.w, aldo: b.a }) }) },
            { label: 'Finish her day (to 11 pm)', disabled: (c) => busy(c) || !data(c).ran || data(c).day, run: (c) => experiment(c, { minutes: 23 * HOUR - app.sim.t, speed: 30, key: 'day', after: (b, c) => c.recordValue('autoDay', { urine: b.cum.urine / 1000, flowLo: minOf('flow'), flowHi: maxOf('flow'), osmLo: minOf('osm'), osmHi: maxOf('osm') }) }) },
          ],
          status: (c) => { const v = c.record.values.heat, a = c.record.values.autoDay, d = data(c); return (d.ran && v ? `End of the run: urine <b>${fx(v.flow, 1)} mL/min</b> at <b>${big(v.osm)} mOsm/L</b>, and the salt in it is falling (${fx(v.salt, 2)} g an hour). Both hormones are rising. She is still ${fx(-v.water, 1)} L short of water: the kidneys can only slow the loss.` : '') + (d.day && a ? `<br>The whole day: urine flow ranged from <b>${fx(a.flowLo, 1)} to ${fx(a.flowHi, 1)} mL/min</b>; the concentration of her blood only from <b>${big(a.osmLo)} to ${big(a.osmHi)}</b>.` : ''); },
          waitFor: (c) => data(c).ran && data(c).day, waitHint: 'Run the hour, then finish her day',
        },
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['na', 'water'], ledger: ['water', 'na'], revealed: ['water', 'na'], names: true, urineDetail: true, lastDials: true, short: true, caption: 'Tom Bradley. Time is running: 2 minutes a second.' }), remount: true,
          graph: GRAPH.bleed, meters: METERS.bleed, speed: 2,
          title: 'A bleed',
          setup: () => setSim(rest()),
          enter: (c) => c.view().show(['na', 'water']),
          text: `${caseNote('Tom Bradley', BLED)}
                 <p>He has lost about 1.5 L of blood, nearly a third of all he has. Think back to the filter in scene 5.</p>`,
          question: predict({ prompt: 'Predict his urine in the half hour after the bleed.', options: [
            { t: 'Almost none: the pressure is too low to filter much, and nearly all of that is taken back', ok: true, fb: 'Run the half hour.' },
            { t: 'More than usual, because he is stressed', fb: 'Stress does not make urine. What drives filtering, and what has happened to it?' },
            { t: 'About the usual amount: the arteriole holds filtering steady', fb: 'It does, down to a mean pressure of about 80 mmHg. Below that it is fully open and can do no more. (A blood pressure of 80/52 is a mean of only about 60.)' },
          ] }),
          actions: [{ label: 'He loses 1.5 L of blood (run 30 minutes)', cls: 'warnb', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => { b.steady = false; b.bleed(1500); KD.mark('bleed'); }, minutes: 30, speed: 2, after: (b, c) => c.recordValue('bleed', { bp: b.bp, gfr: b.f.gfr, perHour: b.f.urine.flow * 60, osm: b.f.urine.osm }) }) }],
          status: (c) => { const v = c.record.values.bleed; return data(c).ran && v ? `Half an hour on: blood pressure <b>${v.bp.sys}/${v.bp.dia}</b>, filtering <b>${fx(v.gfr, 0)} mL/min</b>, urine <b>${fx(v.perHour, 0)} mL an hour</b>. This is why nurses chart urine output every hour in a seriously ill patient: it is the cheapest sign of whether the kidneys, and the other organs, are getting enough blood. In a seriously ill patient, less than about 30 mL an hour that does not pick up with fluids is an alarm.` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Run the half hour',
        },
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['na', 'water'], ledger: ['water', 'na'], revealed: ['water', 'na'], names: true, urineDetail: true, lastDials: true, short: true, caption: 'Her kidney on an ordinary morning: her usual urine.' }), title: 'Four events',
          graph: NO_GRAPH, meters: NO_METERS,
          setup: () => setSim(rest()),
          text: `<p>Fill in the table from your four runs. Compare the urine after each event with her <b>usual</b> urine: about 1 mL a minute at about 680 mOsm/L. (Your numbers are in the results on the last screen, and each run can be repeated with the numbered circles.)</p>`,
          extra: (el, c) => selectTable(el, c, {
            key: 'events', stack: true, head: ['', 'Urine volume', 'Concentration', 'The kidney is…'], rows: EVENTS,
            done: `<b>Complete.</b> In every row the urine changed so that the blood would not. ADH fell after the water and rose in the other three. Aldosterone fell after the salt and rose after the sweat and the bleed.${nameBox('The last stretch is the <b>distal convoluted tubule</b> and the <b>collecting duct</b>. Between it and the first stretch is the hairpin called the <b>nephron loop</b> (loop of Henle). How the loop lets urine become <i>more</i> concentrated than blood is a story for another lab; here, note only that the last stretch does the adjusting.')}`,
          }),
          waitFor: () => false, waitHint: 'Complete the table',
        },
        {
          view: 'strip', title: 'What dark urine means',
          setup: () => { const b = rest(); b.steady = false; b.lose({ sweat: 1500, over: 90 }); setSim(b); skip(120); },
          graph: NO_GRAPH, meters: METERS.hormones,
          text: `<p>A friend finishes a long shift on a hot ward having drunk almost nothing, notices that her urine is dark, and worries that her kidneys are struggling.</p>`,
          question: { prompt: 'What does the colour tell you?', options: [
            { t: 'Her kidneys are working: they are keeping water, so the same wastes are in less of it', ok: true, fb: 'Dark, scanty urine in someone short of water is the kidney doing its job. The cure is a drink. (Urine that is red or brown, or stays dark however much she drinks, is a different matter.)' },
            { t: 'Her kidneys are failing to clear wastes', fb: 'The wastes are being cleared: that is what colours the urine. What has changed is the amount of water they are dissolved in.' },
            { t: 'She is losing too much salt', fb: 'Look at the line under "last stretch": nearly all the salt is being taken back. The colour comes from less water, not more salt.' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 10. back to the patients
    {
      id: 'patients', title: 'Back to the patients', speed: 30,
      steps: [
        {
          view: 'person', viewOpts: { gauges: ['weight', 'k', 'bun'], bp: true, machine: true, panelTitle: "Mr. Herrera's blood, and his weight" }, remount: true,
          graph: GRAPH.herrera, days: DAYS, meters: NO_METERS,
          title: 'Wednesday, 8 am',
          setup: () => herreraWednesday(),
          enter: (c) => { c.view().urine0 = 0; },
          text: `${caseNote('Mr. Herrera', '<p>It is Wednesday morning. He is back at the dialysis unit, and the nurse weighs him.</p>')}
                 <p>In the machine his blood runs along one side of a thin membrane with pores, and a cleaning fluid runs along the other. Whatever is small and more concentrated in his blood crosses into the fluid, which is thrown away. The machine can also draw off a set volume of water and salt.</p>`,
          question: predict({ prompt: 'What does today\'s session have to remove?', options: [
            { t: 'Urea and other wastes, the extra potassium, and the water and salt he has gained', ok: true, fb: 'Everything an adjustable exit would have let out, little by little, over the last two days. Connect him.' },
            { t: 'Only wastes such as urea', fb: 'Look at his weight and his potassium. Neither is a waste, and both are out of range.' },
            { t: 'Only the extra water', fb: 'Look at his potassium and his urea as well.' },
          ] }),
          actions: [{ label: 'Connect him and run the four-hour session', cls: 'go', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => { const pre = { w: app.sim.weight, k: app.sim.potassium, bun: app.sim.bun }; experiment(c, { before: (b) => { b.dialyse({ hours: 4, removeWater: (b.weight - 82) * 1000 }); KD.mark('dialysis'); }, minutes: 4 * HOUR, speed: 30, after: (b, c) => { c.view().machineNote = 'session finished'; c.recordValue('session', { pre, post: { w: b.weight, k: b.potassium, bun: b.bun } }); } }); } }],
          status: (c) => { const v = c.record.values.session; return data(c).ran && v ? `Weight ${fx(v.pre.w, 1)} → <b>${fx(v.post.w, 1)} kg</b> · potassium ${fx(v.pre.k, 1)} → <b>${fx(v.post.k, 1)}</b> · urea (BUN) ${fx(v.pre.bun, 0)} → <b>${fx(v.post.bun, 0)}</b>.${nameBox('Cleaning the blood through an artificial membrane: <b>hemodialysis</b>. The machine has a filter but no tubule, so it cannot take things back. Instead its cleaning fluid already contains the right amounts of what he should keep.')}` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Run the session',
        },
        {
          view: 'person', title: 'His diet sheet',
          setup: () => { if (!isAfterSession()) herreraAfterSession(); },
          text: `<p>He is weighed before every session because the weight he has gained since the last one is water (and the salt that holds it): that is how the nurse knows how much to draw off.</p>
                 <p>His diet sheet tells him to limit fluids and salt, and to go easy on bananas, potatoes, oranges and tomatoes, which are rich in potassium.</p>`,
          question: { prompt: 'You ate and drank all of those freely in scene 2 with no harm. Why can\'t he?', options: [
            { t: 'He has no adjustable exit, so he has to adjust what goes in: whatever he takes in stays until the next session', ok: true, fb: 'With working kidneys, intake can be almost anything and the exit matches it. Without them it is the other way round.' },
            { t: 'Those foods damage the kidneys', fb: 'They are harmless to healthy kidneys. Think about where the potassium in a banana goes in someone who makes no urine.' },
            { t: 'The machine cannot remove potassium', fb: 'It can: look at his potassium before and after the session. But it runs for 12 hours a week, and he eats every day.' },
          ] },
        },
        {
          view: 'strip', viewOpts: STRIP({ kinds: ['cr', 'water'], ledger: ['cr', 'water'], revealed: ['cr', 'water'], names: true, short: true, caption: 'Losing nephrons. Time is running: a day a second.' }), remount: true,
          graph: GRAPH.loss, meters: METERS.loss, speed: 1440,
          title: 'Losing nephrons slowly',
          setup: () => setSim(rest().set('thirst', 1)),
          enter: (c) => c.view().show(['cr', 'water']),
          text: `<p>Mr. Herrera did not lose his kidneys overnight. In long-standing diabetes or high blood pressure, nephrons are lost a few at a time, over years. The nephrons that are left work harder, so at first filtering falls by less than the number lost, and nothing is noticed.</p>
                 <p>Her muscles go on making creatinine at the same rate, and it leaves only by being filtered (scene 7).</p>`,
          question: predict({ prompt: 'Suppose enough nephrons are gone that her filtering has halved. Once things settle, what will her blood creatinine be? (It is 0.9 mg/dL now.)', options: [
            { t: 'About double: 1.8', ok: true, fb: 'Run it, then halve the filtering again.' },
            { t: 'Slightly up: about 1.0', fb: 'The same amount is made each day and must be filtered out through half the filters. What must the blood level be for that to balance?' },
            { t: 'Unchanged, until nearly all the nephrons are gone', fb: 'Many things do stay normal for a long time, as you will see. But creatinine leaves only by filtering. If filtering halves, what must happen?' },
          ] }),
          actions: [
            { label: 'Filtering halves (run 8 days)', cls: 'warnb', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => { b.set('nephrons', 0.5); KD.mark('filtering halved'); }, minutes: 8 * DAY, speed: 1440, after: (b, c) => c.recordValue('half', { cr: b.creatinine, gfr: b.f.gfr, k: b.potassium, bun: b.bun, urine: b.urineReport().perDay }) }) },
            { label: 'Filtering halves again (run 10 days)', cls: 'warnb', disabled: (c) => busy(c) || !data(c).ran || data(c).quarter, run: (c) => experiment(c, { before: (b) => { b.set('nephrons', 0.25); KD.mark('halved again'); }, minutes: 10 * DAY, speed: 1440, key: 'quarter', after: (b, c) => c.recordValue('quarter', { cr: b.creatinine, gfr: b.f.gfr, k: b.potassium, bun: b.bun, urine: b.urineReport().perDay }) }) },
          ],
          extra: (el, c) => {
            const h = c.record.values.half, q = c.record.values.quarter, d = data(c);
            if (!(d.ran && h)) return;
            el.className = 'extra';
            el.innerHTML = labHTML([
              { name: 'Normal filtering', value: '0.9', unit: 'mg/dL · GFR 125', flag: '' },
              { name: 'Half', value: fx(h.cr, 1), unit: `mg/dL · GFR ${fx(h.gfr, 0)}`, flag: 'H' },
            ].concat(d.quarter && q ? [{ name: 'A quarter', value: fx(q.cr, 1), unit: `mg/dL · GFR ${fx(q.gfr, 0)}`, flag: 'H' }] : []), 'Creatinine') +
              (d.quarter && q ? `<div class="feedback note">Each halving of filtering doubles the creatinine. It is balance again: the amount made each day has to equal the filtering rate × the blood level. With a quarter of her filtering she still passes <b>${fx(q.urine, 1)} L</b> of urine a day and may feel well, but her urea (BUN) is <b>${fx(q.bun, 0)}</b> and her potassium, at <b>${fx(q.k, 1)}</b>, is creeping toward the top of its range.${nameBox('Lab reports give an <b>estimated GFR (eGFR)</b> worked out from the blood creatinine. <b>Blood urea nitrogen (BUN)</b> rises for the same reason. Long-term loss of nephrons is <b>chronic kidney disease</b>.')}</div>` : '');
          },
          waitFor: (c) => data(c).ran && data(c).quarter, waitHint: 'Run both',
        },
        {
          view: 'cards', viewOpts: { four: true, cards: () => patientCards(), caption: 'Four charts. Each is a body from the model.' }, remount: true,
          graph: NO_GRAPH, meters: NO_METERS,
          title: 'Four patients, four charts',
          setup: () => setSim(rest()),
          text: `${caseNote('Four patients', RUNNER + BLED + SAM.replace(' (from EndoSim)', '') + LIN)}
                 <p>Match each chart to its patient. Use the urine and the blood together. (A healthy adult at rest passes about 40 to 80 mL of urine an hour.)</p>`,
          extra: (el, c) => matchTable(el, c, 'charts', patientCards(), '<b>All four matched.</b> Two of these patients pass little urine, and it is concentrated: Maya about half the usual amount, Tom almost none. In Maya the kidneys are saving water; in Tom they are barely being supplied with blood. The blood pressure tells them apart.'),
          waitFor: () => false, waitHint: 'Match all four charts',
        },
        {
          view: 'cards', title: 'Your results',
          text: `${caseNote('Back to Mr. Herrera', '<p>You can now answer the three questions about him on your handout, and the questions about the other patients.</p>')}
                 <p>Copy your results onto the handout (or attach them), then type your name. If you worked as a group, type everyone's names. Write the completion code on the handout.</p>`,
          extra: (el, c) => renderCompletion(el, c),
          waitFor: () => false, waitHint: 'Type your name(s) to see your completion code',
        },
      ],
    },
  ];

  // Scene 9's table.
  var EVENTS = (function () {
    const V = ['more', 'about the same', 'less'], C = ['more dilute', 'more concentrated'];
    const W = ['getting rid of water', 'getting rid of salt, with no extra water', 'filtering normally, and keeping water and salt', 'filtering much less, and keeping nearly all of that'];
    return [
      ['A big bottle of water', 'more', 'more dilute', W[0]],
      ['A salty lunch', 'about the same', 'more concentrated', W[1]],
      ['An hour of sweating', 'less', 'more concentrated', W[2]],
      ['A heavy bleed', 'less', 'more concentrated', W[3]],
    ].map(([label, v, cn, why]) => ({ label, cells: [{ options: V, answer: v }, { options: C, answer: cn }, { options: W, answer: why }] }));
  })();

  // Scene 8: blood glucose by hand.
  function glucoseDial(el, c) {
    el.className = 'extra';
    const d = data(c);
    dial(el, { cls: '', id: 'dial-glucose', label: 'Blood glucose', min: 90, max: 500, step: 10, value: app.sim.glucose, show: (v) => `${v} mg/dL`, ends: ['90: normal', '500'],
      onInput: (v) => { app.sim.set('glucose', v); if (v >= 400 && !d.high) { d.high = true; c.recordValue('sam', { g: app.sim.ledger('glucose').excreted, urine: app.sim.urineReport().perDay }); c.complete(); } } });
  }
  // Scene 9: the last stretch, by hand.
  function lateDials(el, c) {
    el.className = 'extra';
    const d = data(c), b = app.sim, cur = b.manualLate || { w: 0.82, a: 0.5 };
    const checks = htmlEl('div', { class: 'checks' });
    const paint = () => {
      const f = app.sim.f, u = f.urine.flow, salt = f.ex.na * 60 / SALT;
      if (u >= 8) d.flood = true; if (u <= 0.6) d.trickle = true; if (salt <= 0.05) d.nosalt = true;
      checks.innerHTML = `<div class="${d.flood ? 'done' : ''}">${d.flood ? '☑' : '☐'} a flood: more than 8 mL a minute</div><div class="${d.trickle ? 'done' : ''}">${d.trickle ? '☑' : '☐'} a trickle: less than 0.6 mL a minute</div><div class="${d.nosalt ? 'done' : ''}">${d.nosalt ? '☑' : '☐'} almost no salt: less than 0.05 g an hour</div>
        <div style="margin-top:4px;color:var(--muted)">Now: urine ${flow(u)} mL/min, ${big(Math.round(f.urine.osm / 10) * 10)} mOsm/L, salt ${fx(salt, 2)} g an hour</div>`;
      if (d.flood && d.trickle && d.nosalt) { c.recordValue('lateDials', true); c.complete(); }
    };
    const pcts = () => { const f = app.sim.f, reach = f.gfr * f.frac.water[2]; return [reach > 0 ? 100 * (1 - f.urine.flow / reach) : 0, f.reachNa > 0 ? 100 * (1 - f.ex.na / f.reachNa) : 0]; };
    dial(el, { cls: 'water', id: 'dial-w', label: 'Water taken back by the last stretch', min: 0, max: 100, step: 1, value: cur.w * 100, show: () => `${fx(pcts()[0], pcts()[0] > 99 ? 1 : 0)} % of what reaches it`, ends: ['less', 'more'],
      onInput: (v) => { app.sim.manualLate.w = v / 100; app.sim.compute(); paint(); } });
    dial(el, { cls: 'salt', id: 'dial-a', label: 'Salt taken back by the last stretch', min: 0, max: 100, step: 1, value: cur.a * 100, show: () => `${fx(pcts()[1], pcts()[1] > 99 ? 1 : 0)} % of what reaches it`, ends: ['less', 'more'],
      onInput: (v) => { app.sim.manualLate.a = v / 100; app.sim.compute(); paint(); } });
    el.appendChild(checks); paint();
  }

  const LESSON = KD.PART_A.concat(PART_B);
  // Where the right answer sits. The options are written with the right answer first, so each
  // question's order is set here: across the lab the right answer falls equally often in each
  // position, and never in the same position twice running. (Opening guesses keep the runner's
  // own shuffle.)
  (function placeAnswers() {
    let a = 20261124;
    const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const bags = {}, last = {};
    for (const sc of LESSON) for (const st of sc.steps) {
      const q = st.question;
      if (!q || !q.options || q.options.some(o => o.neutral)) continue;
      const n = q.options.length, right = q.options.find(o => o.ok), wrong = q.options.filter(o => !o.ok);
      if (!right || n < 2) continue;
      if (!bags[n] || !bags[n].length) {
        const bag = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
        if (bag[bag.length - 1] === last[n]) bag.unshift(bag.pop());
        bags[n] = bag;
      }
      const pos = bags[n].pop(); last[n] = pos;
      if (rand() < 0.5) wrong.reverse();
      q.options = wrong.slice(0, pos).concat([right], wrong.slice(pos));
      q.fixedOrder = true;
    }
  })();

  // =========================================================================
  // Plain words and their terms (the Terms button; the same table is on the handout)
  // =========================================================================
  const TERMS = [
    [2, 'keeping the body\'s fluid steady', 'homeostasis; fluid and electrolyte balance'],
    [2, 'removal in the urine', 'excretion'],
    [3, 'blood in · blood out · urine out', 'renal artery · renal vein · ureter'],
    [3, 'urine store · its exit tube', 'urinary bladder · urethra'],
    [3, 'outer part · inner part · hollow', 'renal cortex · renal medulla · renal pelvis'],
    [3, 'one filter with its tubule', 'nephron'],
    [5, 'the filter (capillaries in a cup)', 'glomerulus + glomerular capsule = renal corpuscle'],
    [5, 'what comes through the filter', 'filtrate (the process: glomerular filtration)'],
    [5, 'how fast the kidneys filter', 'glomerular filtration rate (GFR): about 125 mL/min'],
    [5, 'arteriole into · out of the filter', 'afferent arteriole · efferent arteriole'],
    [5, 'holding filtering steady', 'autoregulation'],
    [6, 'taking back', 'tubular reabsorption'],
    [6, 'the first stretch of the tubule', 'proximal convoluted tubule'],
    [6, 'the return line', 'peritubular capillaries'],
    [7, 'pushing extra in', 'tubular secretion'],
    [7, 'waste that measures filtering', 'creatinine'],
    [8, 'protein · blood · glucose in urine', 'proteinuria · hematuria · glucosuria'],
    [8, 'the most a carrier can take back', 'transport maximum (and the renal threshold: for glucose, about 180 mg/dL)'],
    [8, 'a large volume of urine', 'polyuria'],
    [8, 'drug that increases urine volume', 'diuretic'],
    [9, 'the hormone for water', 'antidiuretic hormone (ADH)'],
    [9, 'hormone for salt (and potassium)', 'aldosterone'],
    [9, 'the last stretch of the tubule', 'distal convoluted tubule and collecting duct'],
    [9, 'the hairpin between them', 'nephron loop (loop of Henle)'],
    [10, 'the machine', 'hemodialysis'],
    [10, 'long-term loss of nephrons', 'chronic kidney disease (followed by the estimated GFR, eGFR)'],
  ];
  function renderTerms() {
    const r = KD.runner.runner, reached = Math.max(r.scene + 1, ...[...r.record.visited].map(k => LESSON.findIndex(s => s.id === k.split('.')[0]) + 1));
    const rows = TERMS.filter(t => t[0] <= reached);
    $('#terms-body').innerHTML = rows.length ? `<table class="ptable"><tr><th>Scene</th><th>Plain words in this lab</th><th>The term</th></tr>${rows.map(t => `<tr><td>${t[0]}</td><td>${t[1]}</td><td><b>${t[2]}</b></td></tr>`).join('')}</table>` + (rows.length < TERMS.length ? `<p style="color:var(--muted);margin-top:8px">${TERMS.length - rows.length} more to come in later scenes.</p>` : '') : '<p>No terms yet: the first names come in scene 2.</p>';
  }

  // =========================================================================
  // Completion: results for the handout, and a completion code
  // =========================================================================
  // The code comes from the names typed (in any order) and is shown only once every question has
  // been answered. It shows the lab was finished; the handout carries the grade. It deters casual
  // sharing but is not security (anyone can read this page's source).
  const CODE_SALT = 'kidneysim-complete-v1';
  const normNames = (n) => String(n || '').toLowerCase().split(/,|;|&|\n|\band\b/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).sort().join(', ');
  const completionCode = (names) => 'KD-' + Lesson.checkCode(normNames(names), CODE_SALT);
  function questionsLeft() {
    const r = KD.runner.runner.record, left = [];
    LESSON.forEach((sc, si) => sc.steps.forEach((st, ki) => {
      const a = r.answers[`${sc.id}.${ki}`];
      const last = si === LESSON.length - 1 && ki === sc.steps.length - 1;
      if ((st.question && !(a && a.done)) || (st.waitFor && !last && !r.completed.has(`${sc.id}.${ki}`))) left.push(si + 1);
    }));
    return [...new Set(left)];
  }
  function resultsLines() {
    const rec = KD.runner.runner.record, v = rec.values, L = [];
    const led = (k) => { const x = v['ledger-' + k], U = LEDGER[k]; return x ? `filtered ${fx(x.filtered * U.k, U.dp)} ${U.unit}, taken back ${fx(x.reabsorbed * U.k, U.dp)}, pushed in ${fx(x.secreted * U.k, U.dp)}, in urine ${fx(x.excreted * U.k, U.dp)} ${U.unit}` : null; };
    L.push('KidneySim: our results');
    L.push('Scene 1 · Two days without kidneys');
    if (v.herrera) L.push(`  Mr. Herrera, Monday noon → Wednesday 8 am: weight 82.0 → ${fx(v.herrera.weight, 1)} kg; potassium 4.0 → ${fx(v.herrera.k, 1)} mmol/L; urea (BUN) 25 → ${fx(v.herrera.bun, 0)} mg/dL; BP ${v.herrera.bp.sys}/${v.herrera.bp.dia}`);
    if (v.herrera) L.push(`  He took in ${fx(v.herrera.water, 1)} L of water, ${fx(v.herrera.salt, 0)} g of salt, ${big(v.herrera.kIn)} mmol of potassium`);
    L.push('Scene 2 · You are the exit');
    if (v.hand) L.push(`  By hand: water and salt in range ${Math.round(v.hand.pct)} % of the day (try ${v.hand.attempts}); we let out ${fx(v.hand.urine, 1)} L of urine carrying ${fx(v.hand.salt, 1)} g of salt`);
    L.push('Scene 4 · Design the exit');
    if (v.drug1 != null) L.push(`  Design 1 (a pump for each waste): the new drug after two days: ${fx(v.drug1, 0)} doses in her body`);
    if (v.filterOnly != null) L.push(`  Design 2, filter only: stopped after ${fx(v.filterOnly, 0)} minutes`);
    if (v.design2) L.push(`  Design 2 with take-back: filtered ${big(v.design2.filtered)} L, taken back ${big(v.design2.returned)} L in two days; the new drug: ${fx(v.design2.drug, 1)} dose left`);
    L.push('Scene 5 · The filter');
    L.push(`  Our predictions of what gets through: ${tableScore(KD.runner.ctx, 'sieve', SIEVE)} right`);
    if (v.gfrFixed) L.push(`  Arteriole fixed: ${fx(v.gfrFixed.gLo, 0)} mL/min at ${v.gfrFixed.lo} mmHg; ${fx(v.gfrFixed.gHi, 0)} at ${v.gfrFixed.hi} mmHg`);
    if (v.gfrAuto) L.push(`  Arteriole adjusting: ${fx(v.gfrAuto.gLo, 0)} mL/min at ${v.gfrAuto.lo} mmHg; ${fx(v.gfrAuto.gHi, 0)} at ${v.gfrAuto.hi} mmHg`);
    L.push('Scene 6 · Taking it back');
    if (v.drain) L.push(`  Return off for 30 minutes: ${fx(v.drain.lost, 1)} L lost; BP ${v.drain.bp.sys}/${v.drain.bp.dia}`);
    if (v.urineFlow) L.push(`  Return on: of 125 mL filtered a minute, ${fx(v.urineFlow.model, 1)} mL left as urine`);
    L.push('Scene 7 · Four substances (each day)');
    for (const k of ['alb', 'glucose', 'cr', 'drug']) { const s = led(k); if (s) L.push(`  ${LEDGER[k].name}: ${s}`); }
    L.push('Scene 8 · Break a step, read the urine');
    if (v.damage) L.push(`  Damaged filter: protein ${v.damage.protein}, blood ${v.damage.blood}, glucose ${v.damage.glucose}`);
    if (v.threshold) L.push(`  Highest blood glucose with a negative urine test: ${v.threshold.model} mg/dL`);
    if (v.sam) L.push(`  At 400 mg/dL: ${fx(v.sam.g, 0)} g of glucose a day in ${fx(v.sam.urine, 1)} L of urine`);
    if (v.carrier) L.push(`  Most glucose carriers blocked, blood glucose 90: ${fx(v.carrier.g, 0)} g a day in the urine (test: ${v.carrier.report})`);
    if (v.dana) L.push(`  Mrs. Brooks, 8 h after furosemide: ${fx(v.dana.urine, 1)} L of urine, ${fx(v.dana.salt, 0)} g of salt; weight ${fx(v.dana.w0, 1)} → ${fx(v.dana.w1, 1)} kg; GFR ${fx(v.dana.gfrLo, 0)}–${fx(v.dana.gfrHi, 0)} mL/min`);
    L.push('Scene 9 · The adjustable part');
    if (v.morning) L.push(`  800 mL of water: urine up to ${fx(v.morning.peak, 1)} mL/min, down to ${big(v.morning.dilute)} mOsm/L; GFR ${fx(v.morning.gfrLo, 0)}–${fx(v.morning.gfrHi, 0)}`);
    if (v.lunch) L.push(`  5 g of salt: salt in urine ${fx(v.lunch.before, 2)} → ${fx(v.lunch.after, 2)} g/h; urine ${fx(v.lunch.flow, 1)} mL/min at ${big(v.lunch.osm)} mOsm/L`);
    if (v.heat) L.push(`  A litre of sweat: urine ${fx(v.heat.flow, 1)} mL/min at ${big(v.heat.osm)} mOsm/L; salt ${fx(v.heat.salt, 2)} g/h`);
    if (v.autoDay) L.push(`  Her whole day: urine flow ${fx(v.autoDay.flowLo, 1)}–${fx(v.autoDay.flowHi, 1)} mL/min; blood concentration ${big(v.autoDay.osmLo)}–${big(v.autoDay.osmHi)} mOsm/L`);
    if (v.bleed) L.push(`  Tom Bradley, 30 min after losing 1.5 L of blood: BP ${v.bleed.bp.sys}/${v.bleed.bp.dia}; GFR ${fx(v.bleed.gfr, 0)} mL/min; urine ${fx(v.bleed.perHour, 0)} mL/hour`);
    L.push('Scene 10 · Back to the patients');
    if (v.session) L.push(`  Dialysis session: weight ${fx(v.session.pre.w, 1)} → ${fx(v.session.post.w, 1)} kg; potassium ${fx(v.session.pre.k, 1)} → ${fx(v.session.post.k, 1)}; BUN ${fx(v.session.pre.bun, 0)} → ${fx(v.session.post.bun, 0)}`);
    if (v.half) L.push(`  Filtering halved: GFR ${fx(v.half.gfr, 0)}, creatinine ${fx(v.half.cr, 1)} mg/dL, potassium ${fx(v.half.k, 1)}`);
    if (v.quarter) L.push(`  Halved again: GFR ${fx(v.quarter.gfr, 0)}, creatinine ${fx(v.quarter.cr, 1)} mg/dL, potassium ${fx(v.quarter.k, 1)}, BUN ${fx(v.quarter.bun, 0)}, urine ${fx(v.quarter.urine, 1)} L/day`);
    return L;
  }
  function renderCompletion(el, c) {
    el.className = 'extra record';
    el.innerHTML = '';
    const ta = htmlEl('textarea', { readonly: 'readonly', 'aria-label': 'Your results' });
    ta.value = resultsLines().join('\n');
    const row = htmlEl('div', { class: 'row' });
    const copy = htmlEl('button', { type: 'button' }, 'Copy our results');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value); c.status('<b>Copied.</b> Paste them into your handout.', true); }
      catch (e) { ta.focus(); ta.select(); c.status('Selected: press Ctrl+C (⌘C on a Mac) to copy.', false); }
    });
    row.appendChild(copy);
    el.appendChild(ta); el.appendChild(row);
    const left = questionsLeft();
    if (left.length) {
      el.appendChild(htmlEl('p', { class: 'warn' }, `<b>Not finished yet:</b> scene${left.length > 1 ? 's' : ''} ${left.join(', ')} still ${left.length > 1 ? 'have' : 'has'} a question or an activity to finish before the completion code appears. (Use the numbered circles at the top.)`));
      return;
    }
    el.appendChild(htmlEl('label', { for: 'rec-name' }, 'Your name as in Canvas. In a group: everyone\'s names, separated by commas'));
    const name = htmlEl('input', { type: 'text', id: 'rec-name', autocomplete: 'off' });
    name.value = c.record.name || '';
    const code = htmlEl('div', { class: 'code', 'aria-live': 'polite' });
    const update = () => { c.record.name = name.value.trim(); code.innerHTML = c.record.name ? `Completion code: <b>${completionCode(c.record.name)}</b>` : 'Type your name(s) to see your completion code.'; if (c.record.name) c.complete(); };
    name.addEventListener('input', update);
    el.appendChild(name); el.appendChild(code);
    update();
  }

  // ---------------------------------------------------------------- dialogs
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelectorAll('.dialog.on:not(#resume)').forEach(d => d.classList.remove('on')); });
  $('#case-body').innerHTML = `${HERRERA}<p style="margin:8px 0 2px"><b>Questions about Mr. Herrera on your handout:</b></p>${HERRERA_Q}<p style="margin:12px 0 2px"><b>Scene 8</b></p>${SAM}${DANA}<p style="margin:12px 0 2px"><b>Scenes 9 and 10</b></p>${BLED}${RUNNER}${LIN}`;
  $('#btn-case').addEventListener('click', () => { $('#case').classList.add('on'); $('#case-close').focus(); });
  $('#case-close').addEventListener('click', () => $('#case').classList.remove('on'));
  $('#btn-terms').addEventListener('click', () => { renderTerms(); $('#terms').classList.add('on'); $('#terms-close').focus(); });
  $('#terms-close').addEventListener('click', () => $('#terms').classList.remove('on'));
  for (const id of ['case', 'terms']) $('#' + id).addEventListener('click', (e) => { if (e.target.id === id) $('#' + id).classList.remove('on'); });
  function openVerify() { $('#verify').classList.add('on'); $('#verify-name').focus(); }
  $('#verify-check').addEventListener('click', () => {
    const ok = completionCode($('#verify-name').value) === $('#verify-code').value.trim().toUpperCase();
    $('#verify-result').textContent = ok ? '✓ This code matches these names.' : '✗ This code does not match these names (check the spelling).';
    $('#verify-result').style.color = ok ? 'var(--good)' : 'var(--bad)';
  });
  $('#verify-close').addEventListener('click', () => $('#verify').classList.remove('on'));

  // =========================================================================
  // Start (and saved progress)
  // =========================================================================
  // Progress is kept in this browser, so a closed tab or a break does not cost the group its work.
  // On a shared computer the next group is asked whether to continue or start again.
  const SAVE_KEY = 'kidneysim-progress-v1';
  let runner = null;
  function readSaved() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.answers && Object.keys(s.answers).length ? s : null; } catch (e) { return null; }
  }
  function save() {
    if (!runner) return;
    try {
      const r = runner.runner.record;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ when: Date.now(), scene: runner.runner.scene, answers: r.answers, values: r.values, tables: r.tables || {}, completed: [...r.completed], visited: [...r.visited], name: r.name || '' }));
    } catch (e) { /* private browsing or storage full: carry on without saving */ }
  }
  function begin(saved) {
    runner = KD.start(LESSON, {});
    if (saved) {
      const r = runner.runner.record;
      Object.assign(r.answers, saved.answers); Object.assign(r.values, saved.values); r.tables = saved.tables || {}; r.name = saved.name || '';
      for (const k of saved.completed || []) r.completed.add(k);
      for (const k of saved.visited || []) r.visited.add(k);
      runner.goto(Math.min(saved.scene || 0, LESSON.length - 1), 0);
    }
    setInterval(save, 3000);
    window.addEventListener('pagehide', save);
  }
  const saved = /[?&](seed|fresh)=/.test(location.search) ? null : readSaved();
  if (saved) {
    const scenes = [...new Set(Object.values(saved.answers).filter(a => a.done).map(a => a.scene))].sort((a, b) => a - b);
    $('#resume-info').textContent = `Saved ${new Date(saved.when).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}${saved.name ? ' by ' + saved.name : ''}: questions answered in scene${scenes.length === 1 ? '' : 's'} ${scenes.join(', ') || '1'}.`;
    $('#resume').classList.add('on');
    $('#resume-continue').addEventListener('click', () => { $('#resume').classList.remove('on'); begin(saved); });
    $('#resume-restart').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } $('#resume').classList.remove('on'); begin(null); });
    $('#resume-continue').focus();
  } else begin(null);
  if (location.hash === '#verify') openVerify();
  window.addEventListener('hashchange', () => { if (location.hash === '#verify') openVerify(); });
  Object.assign(window.__kidneysim, { lesson: () => LESSON, completionCode, results: () => resultsLines().join('\n'), TERMS, cache, faultCards, patientCards, EVENTS, threshold });
  void guess; void signed; void clamp; void isHerreraWed; void startRun;
})();
