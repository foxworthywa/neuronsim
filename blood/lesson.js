/* BloodSim lesson: the white blood cell differential, in five short scenes (about 20 minutes),
 * done before students make and count their own smear. See docs/BLOOD_MODULE.md. It stands on
 * its own: it comes before ImmuneSim in the course and does not assume it. */
(function () {
  'use strict';
  const { app, $, htmlEl, fmt, perUL, pct1, cap, setSim, startRun, setSide, reportHTML, icon, clockText } = BL;
  const { Blood, Bench, tally, flags, binomAtLeast, binomRange, rng, TYPES, NAMES, CELL, REF, PROBLEMS, DAY } = BloodSim;

  // ---------------------------------------------------------------- small helpers
  const data = (c) => c.stepState().data;
  const rec = () => BL.runner.runner.record;
  const tables = () => (rec().tables = rec().tables || {});
  const plural = (k) => NAMES[k] + 's';
  const Plural = (k) => cap(NAMES[k]) + 's';
  const nameBox = (html) => `<div class="name">${html}</div>`;
  const bar = (x) => `<span class="bar"><i style="width:${Math.round(100 * Math.max(0, Math.min(1, x)))}%"></i></span>`;
  // A prediction must be made before the experiment can be run.
  const predict = (q) => Object.assign(q, { onCorrect: (c) => c.refresh() });
  const unanswered = (c) => !c.stepState().answered;
  // An opening guess: every option is accepted and recorded, and none is called right.
  const guess = (prompt, options, fb) => ({ prompt, options: options.map(t => ({ t, ok: true, neutral: true, fb })), fixedOrder: true });
  const oneIn = (p) => (p >= 0.4 ? 'about 1 count in 2' : `about 1 count in ${Math.round(1 / p)}`);

  // A table in which each row is matched to one choice. o: {head, rows: [{key, html}], options: [[value, label]], answer(key),
  // store (object kept with the record), onChange(key, right), hint(key, value)}
  function matchTable(el, c, o) {
    const t = htmlEl('table', { class: 'ptable' });
    t.appendChild(htmlEl('tr', {}, `<th>${o.head[0]}</th><th style="width:${o.width || 34}%">${o.head[1]}</th>`));
    const note = htmlEl('div', { class: 'status', role: 'status' });
    for (const row of o.rows) {
      const tr = htmlEl('tr', {}, `<td>${row.html}</td>`), td = htmlEl('td'), sel = htmlEl('select', { 'aria-label': row.label || row.key });
      sel.appendChild(htmlEl('option', { value: '' }, 'Choose…'));
      for (const [v, text] of o.options) sel.appendChild(htmlEl('option', { value: v }, text));
      const mark = () => { const v = o.store[row.key]; sel.value = v || ''; td.className = !v ? '' : v === o.answer(row.key) ? 'right' : 'wrong'; };
      sel.addEventListener('change', () => {
        o.store[row.key] = sel.value; o.tries = (o.store._tries = (o.store._tries || 0) + 1);
        mark();
        const right = sel.value === o.answer(row.key);
        note.innerHTML = right || !sel.value ? '' : (o.hint ? o.hint(row.key, sel.value) : 'Not that one. Look again.');
        if (o.onChange) o.onChange(row.key, right);
        if (o.rows.every(r => o.store[r.key] === o.answer(r.key))) c.complete();
      });
      mark();
      td.appendChild(sel); tr.appendChild(td); t.appendChild(tr);
    }
    el.appendChild(t); el.appendChild(note);
  }
  const matched = (o, rows, answer) => rows.every(k => o[k] === answer(k));

  // =========================================================================
  // Scene 1 · A drop of blood
  // =========================================================================
  const FIELD = { caption: 'A blood smear after Wright\'s stain, at low power.' };
  const LINEUP = { caption: 'The five kinds of white blood cell, at high power.', named: {} };
  const DESCRIBE = {
    neut: 'Nucleus in <b>3 to 5 lobes</b> joined by thin threads; pale pink cytoplasm with very fine granules',
    lymph: '<b>Small</b>, about the size of a red cell. A round, dark nucleus fills almost all of it, inside a thin rim of pale blue',
    mono: '<b>The largest.</b> Nucleus curved or folded, like a kidney bean; plenty of grey-blue cytoplasm',
    eos: 'Nucleus in <b>two lobes</b>; cytoplasm packed with large <b>orange-red</b> granules',
    baso: 'Large, <b>dark purple</b> granules that all but hide the nucleus',
  };
  const scene1 = {
    id: 'smear', title: 'A drop of blood',
    steps: [
      {
        title: 'What the stain shows', view: 'field', viewOpts: FIELD,
        text: '<p>You are about to make a blood smear and count the white cells in it. First, see what you will be looking at.</p><p>This is a smear after <b>Wright\'s stain</b>, at low power. The stain colors the nucleus of a cell purple. Almost everything here is a <b>red blood cell</b>: a pink disc with a pale center and no nucleus.</p><p><b>Click every cell that has a nucleus.</b></p>',
        status: (c) => { const v = c.view(); return v.cells && v.cells.length && v.found.size === v.cells.length ? `<b>All ${v.cells.length} found.</b> These are the white blood cells.` : 'They are larger than a red cell, with something purple inside. There are only a few.'; },
        waitFor: (c) => { const v = c.view(); return !!(v.cells && v.cells.length && v.found.size === v.cells.length); },
        onDone: (c) => { const v = c.view(); c.recordValue('field', { white: v.cells.length, red: Math.round(v.rbcCount / 100) * 100, misses: v.misses }); c.refresh(); },
        waitHint: 'Find every cell with a nucleus to continue',
      },
      {
        title: 'Few, and not at home',
        text: (c) => { const f = c.record.values.field || { white: 4, red: 2600 }; return `<p>You found <b>${f.white}</b> white cells among about <b>${fmt(f.red)}</b> red cells. That is typical: blood carries roughly 700 red cells for each white cell.</p><p>Red cells do their work, carrying oxygen, without ever leaving the blood.</p>`; },
        question: guess('Before you find out: where do you think <b>white</b> cells do most of their work?', ['In the blood, like red cells', 'In the tissues, outside the blood vessels', 'In the bone marrow, where they are made'], 'Keep your answer in mind. The next scene puts it to the test.'),
      },
      {
        title: 'Five kinds', view: 'lineup', viewOpts: LINEUP,
        text: '<p>At high power the white cells are not all alike. There are <b>five kinds</b>, and two things tell them apart: the <b>shape of the nucleus</b> and the <b>granules</b> (small packets) in the cytoplasm around it.</p><p>These are the descriptions from your lab handout. Find the cell each one describes.</p>',
        extra(el, c) {
          const store = (tables().lineup = tables().lineup || {}), v = c.view();
          const sync = () => { for (const t of TYPES) LINEUP.named[t] = store[t] === v.letter(t); };
          sync();
          matchTable(el, c, {
            head: ['Description', 'Cell'], width: 24, store, rows: TYPES.map(t => ({ key: t, label: Plural(t), html: `<b>${cap(NAMES[t])}.</b> ${DESCRIBE[t]}` })),
            options: ['A', 'B', 'C', 'D', 'E'].map(L => [L, L]), answer: (t) => v.letter(t), onChange: sync,
            hint: (t) => `Not that one. For the ${NAMES[t]}, look at ${t === 'lymph' || t === 'mono' ? 'the size of the cell and the shape of its nucleus' : t === 'neut' ? 'how many lobes the nucleus has' : 'the color and size of the granules'}.`,
          });
        },
        waitFor: (c) => { const s = tables().lineup, v = c.view(); return !!(s && v.letter && matched(s, TYPES, (t) => v.letter(t))); },
        waitHint: 'Match all five to continue',
      },
    ],
  };

  // =========================================================================
  // Scene 2 · Five cells, five jobs: the student decides which cell leaves the blood
  // =========================================================================
  const benchMeters = () => {
    const b = app.sim; if (!(b instanceof Bench)) return [];
    const m = b.measure, p = b.problem;
    const value = p === 'worm' ? `${Math.round(100 * m.value)} %` : p === 'pollen' ? bar(m.value) : fmt(m.value);
    const rows = [[m.label, value, b.solved && p !== 'pollen' ? 'good' : '']];
    if (b.sent) rows.push(b.sent === 'mono' ? ['Monocytes → macrophages', `${fmt(b.site.mono)} → ${fmt(b.macrophages)}`] : b.sent === 'lymph' && p === 'virus' ? ['Lymphocytes that can act against it', fmt(b.clone)] : [`${Plural(b.sent)} at the site`, fmt(b.site[b.sent])]);
    if (p === 'pollen') rows.push(['Histamine', bar(b.histamine / 4)]);
    rows.push(['Clock', clockText(b.t, b.hours > 100)]);
    return rows;
  };
  // What the model did, in a sentence, for each cell sent to each problem.
  const WHY = {
    bacteria: {
      neut: (r) => `<b>Neutrophils won.</b> They poured out of the vessel by the thousand and swallowed bacteria faster than the bacteria could divide. The last bacterium was gone at ${r.t} h.`,
      mono: (r) => `<b>Monocytes lost.</b> They do swallow bacteria, but the blood carries only about one monocyte for every nine neutrophils, and each takes most of a day to grow into a working macrophage. After 24 h: ${fmt(r.value)} bacteria.`,
      lymph: (r) => `<b>Lymphocytes did nothing here today.</b> They passed through the tissue and left again. After 24 h: ${fmt(r.value)} bacteria.`,
      eos: (r) => `<b>Eosinophils lost.</b> They swallow very little, and there are few of them. After 24 h: ${fmt(r.value)} bacteria.`,
      baso: (r) => `<b>Basophils lost.</b> They do not swallow anything. After 24 h: ${fmt(r.value)} bacteria.`,
    },
    debris: {
      mono: (r) => `<b>Monocytes did it.</b> They left the blood, grew into macrophages, and the macrophages swallowed the dead cells. Clear at ${r.t} h, and the macrophages are still there.`,
      neut: (r) => `<b>That made it worse.</b> More neutrophils arrived, lived about a day and died too: now there are ${fmt(r.value)} dead cells, up from 20,000.`,
      lymph: () => '<b>Nothing changed.</b> Lymphocytes do not swallow dead cells.',
      eos: () => '<b>Nothing changed.</b> Eosinophils do not clear dead cells.',
      baso: () => '<b>Nothing changed.</b> Basophils do not swallow anything.',
    },
    worm: {
      eos: (r) => `<b>Eosinophils did it.</b> They spread over the larva and emptied their granules onto its surface, which broke down. The larva was dead at ${r.t} h.`,
      neut: (r) => `<b>Neutrophils failed.</b> They covered the larva and tried to swallow it, but it is about 70 times their length. After three days it is still ${Math.round(100 * r.value)} % intact.`,
      mono: (r) => `<b>Macrophages failed.</b> Even a "big eater" cannot swallow something 50 times its own length. After three days the larva is ${Math.round(100 * r.value)} % intact.`,
      lymph: () => '<b>Nothing happened.</b> Lymphocytes passed through; the larva is unharmed.',
      baso: () => '<b>The larva is unharmed.</b> Basophils do not attack anything directly.',
    },
    pollen: {
      baso: (r) => `<b>That is the cell.</b> Within ${r.t} h, basophils that met pollen emptied their granules. The granules hold <b>histamine</b>, which widened the vessel and made it leak: swelling, a runny nose, sneezing.`,
      neut: () => '<b>Nothing happened.</b> Neutrophils arrived and found nothing to do: pollen does not multiply and does no damage. No swelling, no sneezing.',
      mono: () => '<b>Nothing happened.</b> No swelling, no sneezing. The pollen just sits there, harmless.',
      lymph: () => '<b>Nothing happened</b> in these six hours. No swelling, no sneezing.',
      eos: () => '<b>Nothing happened</b> in these six hours: eosinophils on their own did not set anything off.',
    },
    virus: {
      lymph: (r) => `<b>Lymphocytes did it, slowly.</b> For days there were far too few lymphocytes able to act against this virus. Their number doubled about every 10 hours, and on day ${(r.t / DAY).toFixed(0)} there were enough to destroy every infected cell.`,
      neut: (r) => `<b>Neutrophils failed.</b> They cannot tell an infected cell from a healthy one: the virus is inside. After 10 days, ${fmt(r.value)} of 1,000 cells are infected.`,
      mono: (r) => `<b>Macrophages failed.</b> They cannot pick out a living cell with virus inside it. After 10 days, ${fmt(r.value)} of 1,000 cells are infected.`,
      eos: (r) => `<b>Eosinophils failed.</b> After 10 days, ${fmt(r.value)} of 1,000 cells are infected.`,
      baso: (r) => `<b>Basophils failed.</b> After 10 days, ${fmt(r.value)} of 1,000 cells are infected.`,
    },
  };
  const JOBS = {
    bacteria: {
      title: 'Bacteria in a cut', speed: 2.4, needOther: true,
      caption: 'A cut in the skin with bacteria in it, beside a small blood vessel. White cells are drawn far more common in the vessel than they really are.',
      text: '<p><b>How to read this picture.</b> Across the top, blood flows through a small vessel. Below it is the tissue around a cut, where bacteria (red rods) are doubling every 90 minutes. The numbers above the picture come from the model.</p><p><b>You decide which white cell leaves the blood.</b> Choose one and watch 24 hours. Then try at least one other, to compare.</p>',
      won: nameBox('<b>Neutrophils</b> swallow bacteria (<i>phagocytosis</i>). They are the most numerous white cell and the first to arrive. A neutrophil lasts about a day in the tissue and dies there: <b>pus</b> is mostly dead neutrophils.'),
    },
    debris: {
      title: 'The next day: clearing up', speed: 7.2,
      caption: 'The same cut a day later. The bacteria are gone; grey specks are dead neutrophils.',
      text: '<p>The bacteria are gone. What is left is pus: about 20,000 dead neutrophils and scraps of damaged tissue. The cut cannot heal until that is cleared.</p><p><b>Which cell do you send?</b> Each run is three days.</p>',
      won: nameBox('<b>Monocytes</b> leave the blood and grow into <b>macrophages</b> ("big eaters"), which swallow dead cells and debris as well as microbes, and stay in the tissue for weeks. That is what the monocyte\'s large size and roomy cytoplasm are for.'),
    },
    worm: {
      title: 'Too big to swallow', speed: 7.2,
      caption: 'The larva of a parasitic worm in the tissue.',
      text: '<p>A different invader: the larva of a parasitic worm, about a millimeter long. That is some 70 times the width of a white cell, so <b>no cell can swallow it</b>.</p><p>Which cell can damage something it cannot swallow? Each run is three days.</p>',
      won: nameBox('<b>Eosinophils</b> press against a parasite and empty their granules onto it. The large orange granules you saw are packets of proteins that damage the parasite\'s surface.'),
    },
    pollen: {
      title: 'Hay fever', speed: 0.75,
      caption: 'The lining of the nose of a person who is allergic to grass pollen, in May.',
      text: '<p>The yellow grains are grass pollen. Pollen does not multiply in the body and does it no harm. But this person is <b>allergic</b>: some of their white cells carry, on their surface, antibody that sticks to pollen.</p><p><b>Find the cell that makes this person sneeze.</b> Each run is six hours.</p>',
      won: nameBox('<b>Basophils</b> release <b>histamine</b> from their granules. Histamine widens small vessels and makes them leak. (Mast cells, which live in the tissues, do the same job.) The chemicals they release also call <b>eosinophils</b> to the site, which is why eosinophils rise in the blood of someone with allergies.'),
    },
    virus: {
      title: 'Hidden inside cells', speed: 20,
      caption: 'The lining of the airway, with a virus multiplying inside some of its cells.',
      text: '<p>A virus is multiplying <b>inside</b> the cells that line the airway. From the outside, an infected cell looks almost like its neighbors.</p><p>Which white cell can single out the infected cells? Each run is ten days.</p>',
      won: nameBox('<b>Lymphocytes</b> are the only white cells that recognize one particular invader and no other. That exactness has a cost: the first time, it takes them about a week to build up their numbers. How they manage it is the subject of the immune lab.'),
    },
  };
  function jobStep(problem) {
    const J = JOBS[problem];
    const store = () => { const j = (tables().jobs = tables().jobs || {}); return (j[problem] = j[problem] || { tried: [], res: {} }); };
    const finished = () => { const s = store(), w = PROBLEMS[problem].winner; return !!s.res[w] && (!J.needOther || s.tried.length >= 2); };
    function send(c, type) {
      const d = data(c), b = new Bench({ problem }).send(type);
      setSim(b);
      d.running = type; d.last = null;
      c.refresh();
      startRun({
        hours: b.hours, speed: J.speed,
        onDone: () => {
          const s = store(); if (!s.tried.includes(type)) s.tried.push(type);
          const when = b.solvedAt;
          s.res[type] = { solved: b.solved, value: b.measure.value, t: when == null ? null : (when < 10 ? Math.round(when * 10) / 10 : Math.round(when)) };
          d.running = null; d.last = type;
          if (finished()) c.complete();
          c.refresh();
        },
      });
    }
    return {
      title: J.title, view: 'bench', viewOpts: { problem, caption: J.caption }, meters: benchMeters, speed: J.speed, remount: true,
      setup() { setSim(new Bench({ problem })); },
      text: () => J.text + (store().res[PROBLEMS[problem].winner] ? J.won : ''),
      get actions() {
        return TYPES.map(k => ({
          label: `${icon(k, 26)} ${Plural(k)}`, type: k,
          get cls() { const r = BL.runner ? store().res[k] : null; return 'cellbtn' + (r ? (r.solved ? ' won' : ' lost') : ''); },
          run: (c) => send(c, k), disabled: (c) => !!data(c).running,
        }));
      },
      status: (c) => {
        const d = data(c), s = store(), w = PROBLEMS[problem].winner;
        if (d.running) return `Sending ${plural(d.running)}…`;
        const last = d.last || s.tried[s.tried.length - 1];
        if (!last) return 'Choose a cell to send.';
        let html = WHY[problem][last](s.res[last]);
        if (s.res[w] && J.needOther && s.tried.length < 2) html += ' <b>Now send one other cell</b>, to see what it does instead.';
        else if (!s.res[w]) html += ' <b>Try another cell.</b>';
        return html;
      },
      waitFor: () => finished(),
      waitHint: 'Find the cell that works to continue',
    };
  }
  const JOB_TEXT = {
    neut: 'Swallows bacteria; first to arrive, in huge numbers; dies there (pus)',
    mono: 'Grows into a macrophage that swallows dead cells and debris, and stays',
    eos: 'Empties its granules onto a parasite too large to swallow',
    baso: 'Releases histamine, so vessels widen and leak (allergy)',
    lymph: 'Recognizes one particular invader; takes about a week the first time',
  };
  const scene2 = {
    id: 'jobs', title: 'Five cells, five jobs',
    steps: [
      jobStep('bacteria'),
      {
        title: 'Why neutrophils?',
        text: '<p>Monocytes swallow bacteria too, and each macrophage swallows more than a neutrophil does. Yet in your run the neutrophils held the infection and the monocytes did not.</p>',
        question: {
          prompt: 'What gave the neutrophils the advantage?',
          options: [
            { t: 'Numbers: the blood carries far more of them, so far more arrive in the first hours', ok: true, fb: 'About nine neutrophils for each monocyte. Bacteria double every 90 minutes, so what counts is how many cells arrive early. Notice what this means for a blood count: <b>the commonest white cell in a healthy smear is the one the body needs first, in bulk.</b>' },
            { t: 'Neutrophils recognize exactly which bacterium this is', fb: 'They do not. A neutrophil detects features that many bacteria share, and attacks any of them. Recognizing one particular invader is the lymphocyte\'s job.' },
            { t: 'Neutrophils live longer at the site than monocytes do', fb: 'The opposite: a neutrophil lasts about a day and dies there, while a macrophage stays for weeks. Look at how many of each arrived.' },
          ],
        },
      },
      jobStep('debris'),
      jobStep('worm'),
      jobStep('pollen'),
      {
        title: 'Harmless pollen, real symptoms',
        text: '<p>With every other cell, the pollen sat in the nose and nothing happened. With basophils, the vessel widened and leaked within a couple of hours.</p>',
        question: {
          prompt: 'So what causes the swelling, runny nose and sneezing of hay fever?',
          options: [
            { t: 'The person\'s own cells, releasing histamine in response to something harmless', ok: true, fb: 'Yes. That is also why an <b>antihistamine</b> helps: it blocks the signal, though the pollen is still there. The same response is useful against parasites; in allergy it is aimed at the wrong target.' },
            { t: 'The pollen, damaging the lining of the nose', fb: 'The pollen was there in every run, and with four of the five cells nothing happened at all. Something the basophils did made the difference.' },
            { t: 'Bacteria carried in on the pollen', fb: 'There are no bacteria in this model, and neutrophils found nothing to attack. Look at what the basophils released.' },
          ],
        },
      },
      jobStep('virus'),
      {
        title: 'Five cells, five jobs',
        view: 'lineup', viewOpts: { caption: 'The five white blood cells.', named: Object.fromEntries(TYPES.map(t => [t, true])) },
        text: '<p>You have now seen each cell at work, and each time it was <b>in the tissue</b>, not in the blood. Match each cell to what you saw it do.</p>',
        extra(el, c) {
          const store = (tables().summary = tables().summary || {});
          const order = ['eos', 'lymph', 'neut', 'baso', 'mono'];
          matchTable(el, c, {
            head: ['Cell', 'What it does'], width: 68, store, rows: TYPES.map(t => ({ key: t, label: Plural(t), html: `${icon(t, 26)}<b>${cap(NAMES[t])}</b>` })),
            options: order.map(t => [t, JOB_TEXT[t]]), answer: (t) => t,
            hint: (t) => `Not that one. Think back to the run in which ${plural(t)} were the cell that worked.`,
          });
        },
        waitFor: () => { const s = tables().summary; return !!(s && matched(s, TYPES, (t) => t)); },
        waitHint: 'Match all five to continue',
      },
    ],
  };

  // =========================================================================
  // Scene 3 · Why the count changes
  // =========================================================================
  const half = Math.round(Math.LN2 * CELL.neut.tau);          // hours for half the neutrophils to leave the blood
  const healthy = () => { const b = new Blood(); app.before = null; app.zero = 0; app.reportClock = false; app.flowNote = null; return b; };
  const infected48 = () => { const b = new Blood(); app.before = b.report(); app.zero = 0; app.reportClock = true; b.start('bacterial'); b.advance(48); return b; };
  const FLOW = { caption: 'Where the white cells in the blood come from, and where they go.' };
  const row = (rep, t) => rep.rows.find(r => r.type === t);
  // The first day on which a cell's percentage is outside the reference range.
  function firstFlagDay(cond, type) {
    const b = new Blood().start(cond);
    for (let d = 1; d <= 30; d++) { b.advance(DAY); if (row(b.report(), type).pctFlag) return d; }
    return null;
  }
  const CONDS = {
    allergy: { label: 'Three weeks of hay fever', days: 21, speed: 50, top: 'eos' },
    viral: { label: 'Two weeks into a virus such as mononucleosis', days: 14, speed: 36, top: 'lymph' },
  };
  const scene3 = {
    id: 'count', title: 'Why the count changes',
    steps: [
      {
        title: 'Blood is the road', view: 'flow', viewOpts: FLOW, clock: 'free', speed: 2, remount: true,
        setup() { setSim(healthy()); },
        text: `<p><b>How to read this picture.</b> On the left, finished white cells wait in the bone marrow. In the middle is the blood: each cell drawn stands for 100 in a microliter (µL), a drop the size of a pinhead. On the right are the tissues, where the work is done. The report beside it is what a lab would print for this blood.</p><p>Watch one neutrophil cross. It is in the blood for only about <b>${half} hours</b>, and it does not come back.</p>`,
        question: {
          prompt: `This healthy person has about ${perUL(CELL.neut.n0)} neutrophils in every microliter of blood, all day. If each one leaves within hours, how can the number stay the same?`,
          options: [
            { t: 'The marrow releases new ones as fast as the old ones leave', ok: true, fb: 'Yes. The count is a <b>balance</b> between supply from the marrow and exit to the tissues, like the level of water in a sink with the tap running and the drain open. Change either one and the count changes.' },
            { t: 'The same neutrophils go round and round in the blood for weeks', fb: 'Follow one across the picture: it reaches the tissues and is gone. Red cells circulate for months; a neutrophil is in the blood for hours.' },
            { t: 'Neutrophils divide in the blood to replace the ones that leave', fb: 'Finished neutrophils do not divide. Look at where the new ones enter the blood from.' },
          ],
        },
      },
      {
        title: 'A bacterial infection', clock: 'free', speed: 2, remount: true,
        setup() { setSim(healthy()); },
        text: '<p>This person develops an infected tooth: bacteria, multiplying. You saw which cell deals with bacteria.</p>',
        question: predict({
          prompt: 'Over the next two days, what will happen to the white cell count?',
          options: [
            { t: 'Neutrophils rise steeply; the others hardly change', ok: true, fb: 'Now run it, and watch where the extra neutrophils come from.' },
            { t: 'All five kinds rise together', fb: 'Each kind answers a different call. Which cell did the bacteria in the cut need?' },
            { t: 'Neutrophils fall, because they leave the blood to fight', fb: 'They do leave faster. But think about the reserve waiting in the marrow.' },
            { t: 'Lymphocytes rise steeply', fb: 'Lymphocytes took a week against the virus, and did nothing against bacteria in a day. Which cell did the bacteria need?' },
          ],
        }),
        actions: [{
          label: 'Start the infection and watch two days', cls: 'blood',
          disabled: (c) => unanswered(c) || !!data(c).running || !!data(c).ran,
          run: (c) => {
            const d = data(c), b = new Blood(), before = b.report(), res0 = b.reserve.neut;
            setSim(b); app.before = before; app.zero = 0; app.reportClock = true; app.flowNote = null;
            b.start('bacterial');
            d.running = true; c.refresh();
            startRun({ hours: 48, speed: 6, onDone: () => {
              app.clock = 'idle'; d.running = false; d.ran = true;
              const now = b.report();
              c.recordValue('bacterial', { neut0: row(before, 'neut').abs, neut: row(now, 'neut').abs, pctN0: row(before, 'neut').pct, pctN: row(now, 'neut').pct, lymph0: row(before, 'lymph').abs, lymph: row(now, 'lymph').abs, pctL0: row(before, 'lymph').pct, pctL: row(now, 'lymph').pct, wbc0: before.wbc.value, wbc: now.wbc.value, reserve0: res0, reserve: b.reserve.neut });
              c.complete(); c.refresh();
            } });
          },
        }],
        status: (c) => {
          const v = c.record.values.bacterial, d = data(c);
          if (d.running) return 'The tissues are calling for neutrophils. Watch the marrow and the report.';
          if (!v || !d.ran && !c.stepState().done) return unanswered(c) ? 'Predict first, then run it.' : '';
          return `<b>Day 2.</b> Neutrophils: ${perUL(v.neut0)} → <b>${perUL(v.neut)}</b> per µL. The marrow's reserve fell by ${Math.round(100 * (1 - v.reserve / v.reserve0))} %: the extra cells were already made and waiting.`;
        },
        waitFor: (c) => !!data(c).ran,
        waitHint: 'Run the infection to continue',
      },
      {
        title: 'A share is not a number', clock: 'idle',
        setup() { if (!(app.sim instanceof Blood) || !app.sim.active('bacterial') || Math.abs(app.sim.t - 48) > 0.5) setSim(infected48()); app.clock = 'idle'; },
        text: (c) => { const v = c.record.values.bacterial || {}; return `<p>The picture is stopped at day 2. Look at the <b>lymphocytes</b> on the report: before the infection they were ${pct1(v.pctL0 || 36)} % of the white cells, and now they are <b>${pct1(v.pctL || 16)} %</b>, flagged <b style="color:#2457a6">L</b> for low.</p><p>Now read the next column: lymphocytes <b>per µL</b>, before and now.</p>`; },
        question: {
          prompt: 'What happened to this person\'s lymphocytes?',
          options: [
            { t: 'Nothing: there are as many as before. They are a smaller share because the neutrophils tripled', ok: true, fb: 'Yes. A percentage is a share of the total, so when one cell rises, every other percentage falls. <b>Your own count in this lab gives percentages only.</b> Before you call one cell "low", ask whether another one is high.' },
            { t: 'They were used up fighting the bacteria', fb: 'Compare the two per-µL numbers for lymphocytes: the count has not moved. Something else changed the percentage.' },
            { t: 'The marrow stopped making them while it made neutrophils', fb: 'The number of lymphocytes per µL is the same as before. What happened to the total?' },
          ],
        },
      },
      {
        title: 'Two more calls', clock: 'idle', remount: true,
        setup() { setSim(healthy()); app.reportClock = true; },
        text: '<p>Now two conditions that call a different cell. For each one, <b>predict</b> which cell will rise most, then run it.</p>',
        extra(el, c) {
          const store = (tables().conds = tables().conds || {}), d = data(c);
          const t = htmlEl('table', { class: 'ptable' });
          t.appendChild(htmlEl('tr', {}, '<th>Condition</th><th style="width:31%">I predict this cell rises most</th><th style="width:22%"></th>'));
          for (const key of Object.keys(CONDS)) {
            const C = CONDS[key], s = (store[key] = store[key] || {});
            const tr = htmlEl('tr', {}, `<td><b>${C.label}</b>${s.done ? `<br>${Plural(C.top)}: ${perUL(s.from)} → <b>${perUL(s.to)}</b> per µL (${pct1(s.pct0)} % → ${pct1(s.pct)} %). Outside the reference range from day ${s.flagDay}.` : ''}</td>`);
            const td = htmlEl('td', { class: s.done ? (s.pred === C.top ? 'right' : 'wrong') : '' }), sel = htmlEl('select', { 'aria-label': 'Prediction for ' + C.label });
            sel.appendChild(htmlEl('option', { value: '' }, 'Choose…'));
            for (const k of TYPES) sel.appendChild(htmlEl('option', { value: k }, Plural(k)));
            sel.value = s.pred || ''; sel.disabled = !!s.done || !!d.running;
            sel.addEventListener('change', () => { s.pred = sel.value; c.refresh(); });
            td.appendChild(sel); tr.appendChild(td);
            const td2 = htmlEl('td'), btn = htmlEl('button', { type: 'button', 'data-cond': key }, s.done ? 'Run again' : 'Run');
            btn.disabled = !s.pred || !!d.running;
            btn.addEventListener('click', () => {
              const b = new Blood(), before = b.report();
              setSim(b); app.before = before; app.zero = 0; app.reportClock = true; app.flowNote = null;
              b.start(key); d.running = key; c.refresh();
              startRun({ hours: C.days * DAY, speed: C.speed, onDone: () => {
                const now = b.report();
                Object.assign(s, { done: true, from: row(before, C.top).abs, to: row(now, C.top).abs, pct0: row(before, C.top).pct, pct: row(now, C.top).pct, flagDay: firstFlagDay(key, C.top) });
                d.running = null;
                if (Object.keys(CONDS).every(k => store[k].done)) c.complete();
                c.refresh();
              } });
            });
            td2.appendChild(btn); tr.appendChild(td2); t.appendChild(tr);
          }
          el.appendChild(t);
        },
        status: (c) => { const d = data(c), s = tables().conds || {}; return d.running ? `Running: ${CONDS[d.running].label.toLowerCase()}…` : Object.keys(CONDS).every(k => s[k] && s[k].done) ? 'Both run. Each condition raised the cell whose job it calls for.' : 'Choose a prediction, then press Run.'; },
        waitFor: () => { const s = tables().conds; return !!(s && Object.keys(CONDS).every(k => s[k] && s[k].done)); },
        waitHint: 'Run both conditions to continue',
      },
      {
        title: 'Hours, or weeks',
        text: (c) => { const s = (tables().conds || {}), a = s.allergy || {}, v = s.viral || {}; return `<p>In the bacterial infection, neutrophils tripled within <b>a day</b>. In hay fever the eosinophils took until about <b>day ${a.flagDay || 2}</b> just to leave the reference range, and in the viral infection the lymphocytes took until about <b>day ${v.flagDay || 3}</b>.</p>`; },
        question: {
          prompt: 'Why can the neutrophil count rise so much faster than the others?',
          options: [
            { t: `The marrow holds a reserve of finished neutrophils, about ${CELL.neut.reserve} times the number in the blood, ready to release`, ok: true, fb: 'Yes. The other cells have little or no reserve: more must be made, or (for lymphocytes) the right ones must multiply, and that takes days. So <b>timing matters</b> when you read a count: an infection three days ago and an allergy three weeks ago leave different traces.' },
            { t: 'Neutrophils divide in the blood once an infection starts', fb: 'Finished neutrophils do not divide. Look at what happened to the marrow in your run.' },
            { t: 'Neutrophils travel faster than the other cells', fb: 'All the cells are carried at the speed of the blood. The difference is in how many were ready before the infection began.' },
          ],
        },
      },
    ],
  };

  // =========================================================================
  // Scene 4 · Counting 100 cells
  // =========================================================================
  const HAND = 20;
  // The slide: 100 white cells from a healthy person, in the order they are met. (One whose first
  // 20 cells include at least four of the five kinds, so that naming them is real practice.)
  let slideCache = null;
  function slide() {
    if (slideCache && slideCache.seed === app.seed) return slideCache.cells;
    const b = new Blood();
    for (let i = 0; i < 400; i++) {
      const cells = b.cells(100, rng(app.seed * 17 + 3 + i * 1009));
      if (new Set(cells.slice(0, HAND)).size >= 4 || i === 399) { slideCache = { seed: app.seed, cells }; break; }
    }
    return slideCache.cells;
  }
  const LOOK = {
    neut: 'Look again: the nucleus is in three or more lobes, and the granules are too fine to see one by one.',
    lymph: 'Look again: this cell is hardly bigger than a red cell, and a round, dark nucleus fills nearly all of it.',
    mono: 'Look again: this is a big cell, and its nucleus is one curved piece, like a kidney bean, in grey-blue cytoplasm.',
    eos: 'Look again: the granules are large and orange-red, and the nucleus has two lobes.',
    baso: 'Look again: the granules are large and so dark that they hide the nucleus.',
  };
  const ORDER_HANDOUT = ['baso', 'eos', 'lymph', 'mono', 'neut'];      // the order on the lab handout's table
  function tallyHTML(count, n, o) {
    o = o || {};
    const done = n >= 100, fl = done ? flags(count, n) : {};
    const rows = ORDER_HANDOUT.map(t => `<tr><td>${icon(t, 22)}${Plural(t)}</td><td class="v">${count[t]}</td><td class="v ${fl[t] || ''}">${done ? count[t] : ''}</td><td class="f ${fl[t] || ''}">${fl[t] || ''}</td><td class="r">${REF.pct[t][0]}–${REF.pct[t][1]}</td></tr>`).join('');
    return `<div class="labrep"><div class="lh"><span>${o.title || 'Your count'}</span><span>${n} of 100 cells</span></div><table><tr><th>Type of leukocyte</th><th style="text-align:right">Number</th><th style="text-align:right" colspan="2">%</th><th>Reference %</th></tr>${rows}<tr><td><b>Total</b></td><td class="v">${n}</td><td class="v">${done ? 100 : ''}</td><td></td><td></td></tr></table>${o.note ? `<div class="foot">${o.note}</div>` : ''}</div>`;
  }
  const AXIS = { neut: [30, 80], lymph: [10, 60], mono: [0, 20], eos: [0, 12], baso: [0, 6] };
  function dotsHTML(counts) {
    const rows = ORDER_HANDOUT.map(t => {
      const [lo, hi] = AXIS[t], pos = (v) => 3 + 94 * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo), seen = {};
      const dots = counts.map((cnt, i) => { const v = cnt[t], k = (seen[v] = (seen[v] || 0) + 1) - 1; const out = v < REF.pct[t][0] || v > REF.pct[t][1]; return `<i class="${i === 0 ? 'mine' : out ? 'out' : ''}" style="left:calc(${pos(v)}% + ${Math.floor(k / 4) * 3}px);top:${2 + (k % 4) * 8}px"></i>`; }).join('');
      const vals = counts.map(cnt => cnt[t]);
      return `<div class="row"><span>${Plural(t)}</span><div class="axis"><span class="ref" style="left:${pos(REF.pct[t][0])}%;width:${pos(REF.pct[t][1]) - pos(REF.pct[t][0])}%"></span>${dots}</div><span class="rng">${Math.min(...vals)}–${Math.max(...vals)}</span></div>`;
    }).join('');
    const flagged = counts.filter(cnt => Object.keys(flags(cnt, 100)).length).length;
    return `<div class="dots"><b>${counts.length} count${counts.length > 1 ? 's' : ''} of 100 cells, same slide</b>${rows}<div class="key">One dot per count; the blue dot is yours. Green band: the reference range. Red: outside it. At the right: lowest and highest count.</div><div class="key" style="color:var(--ink)"><b>${flagged} of ${counts.length}</b> count${counts.length > 1 ? 's have' : ' has'} at least one value outside the reference range.</div></div>`;
  }
  const SCOPE = { caption: 'One white cell at a time, at high power under oil, as you will see them when you count.' };
  const scene4 = {
    id: 'hundred', title: 'Counting 100 cells',
    steps: [
      {
        title: 'Name the cells', view: 'scope', viewOpts: SCOPE, remount: true,
        text: `<p>This slide is from a <b>healthy</b> 20-year-old. You move across it and name each white cell you meet, exactly as you will with your own slide.</p><p>Name the first <b>${HAND}</b> cells. Use the nucleus first, then the granules.</p>`,
        enter(c) {
          const d = data(c), t = tables();
          d.i = t.count ? HAND : 0; d.tally = tally(slide().slice(0, d.i)); d.firstTry = true;
          if (!t.count) c.view().show(slide()[0], 0);
          else c.view().show(slide()[99], 99);
          setSide(tallyHTML(t.count || d.tally, t.count ? 100 : d.i), null);
        },
        get actions() {
          const naming = TYPES.map(k => ({
            label: `${icon(k, 26)} ${cap(NAMES[k])}`, cls: 'cellbtn', type: k,
            disabled: (c) => data(c).i >= HAND,
            run: (c) => {
              const d = data(c), actual = slide()[d.i];
              if (k !== actual) { if (d.firstTry) { d.misses = (d.misses || 0) + 1; d.firstTry = false; } d.msg = `<b>Not a ${NAMES[k]}.</b> ${LOOK[actual]}`; c.refresh(); return; }
              d.tally[actual]++; d.i++; d.firstTry = true; d.msg = `<b>${cap(NAMES[actual])}.</b>`;
              if (d.i < HAND) c.view().show(slide()[d.i], d.i);
              setSide(tallyHTML(d.tally, d.i), null);
              c.refresh();
            },
          }));
          return naming.concat([{
            label: 'Count the other 80 cells', cls: 'primary',
            disabled: (c) => data(c).i < HAND || !!tables().count,
            run: (c) => {
              const d = data(c), count = tally(slide());
              tables().count = count; c.recordValue('hand', { misses: d.misses || 0 });
              c.view().show(slide()[99], 99);
              setSide(tallyHTML(count, 100, { note: 'Since you counted 100 cells, the percentage is the same as the number.' }), null);
              c.complete(); c.refresh();
            },
          }]);
        },
        status: (c) => {
          const d = data(c), t = tables();
          if (t.count) { const fl = flags(t.count, 100), out = Object.keys(fl); return `<b>100 cells counted.</b> ${out.length ? `Outside the reference range: ${out.map(k => `${plural(k)} (${t.count[k]} %, ${fl[k] === 'H' ? 'high' : 'low'})`).join(', ')}. Remember that this person is healthy.` : 'Every value is inside the reference range.'}`; }
          if (d.i >= HAND) return `<b>${HAND} named</b>${d.misses ? `, ${d.misses} of them not at the first try` : ', all at the first try'}. Naming 100 takes a while, so let the simulation name the rest of this slide.`;
          return (d.msg ? d.msg + ' ' : '') + `Cell ${d.i + 1} of ${HAND}: which is it?`;
        },
        waitFor: () => !!tables().count,
        waitHint: 'Count 100 cells to continue',
      },
      {
        title: 'Count it again',
        enter(c) { const t = tables(); if (t.count && !t.counts) t.counts = [t.count]; if (t.counts) setSide(dotsHTML(t.counts), 'wide'); c.view().show(slide()[99], 99); },
        text: '<p>Suppose you slide over to a fresh part of the <b>same smear</b> and count another 100 white cells. Same person, same blood, same day.</p>',
        question: predict({
          prompt: 'Will the second count match the first?',
          options: [
            { t: 'Roughly, for the common cells; the rare cells could easily double or vanish', ok: true, fb: 'Now try it: count again, then let twenty classmates count the same slide.' },
            { t: 'Yes, exactly, as long as every cell is named correctly', fb: 'Even with perfect naming, the next hundred cells are a different hundred cells. Think of drawing 100 marbles from a large bag, twice.' },
            { t: 'No: every number will be completely different', fb: 'Not completely. Over half the cells are neutrophils, so a hundred of them will always be mostly neutrophils. Which cells will be less steady?' },
          ],
        }),
        get actions() {
          const add = (c, n) => { const t = tables(); t.counts = t.counts || [t.count]; const b = new Blood(); for (let i = 0; i < n; i++) t.counts.push(b.differential(100, rng(app.seed * 29 + t.counts.length * 7919))); setSide(dotsHTML(t.counts), 'wide'); if (t.counts.length >= 21) c.complete(); c.refresh(); };
          return [
            { label: 'Count another 100 cells', disabled: (c) => unanswered(c) || (tables().counts || []).length >= 200, run: (c) => add(c, 1) },
            { label: 'Twenty classmates count this slide', disabled: (c) => unanswered(c) || (tables().counts || []).length >= 200, run: (c) => add(c, 20) },
          ];
        },
        status: (c) => {
          const t = tables(), n = (t.counts || []).length;
          if (unanswered(c)) return 'Predict first.';
          if (n < 21) return n > 1 ? `${n} counts so far. Now let twenty classmates count it.` : 'Count again.';
          const e = t.counts.map(x => x.eos), nn = t.counts.map(x => x.neut), flagged = t.counts.filter(x => Object.keys(flags(x, 100)).length).length;
          return `<b>${n} counts of one healthy slide.</b> Neutrophils ranged from ${Math.min(...nn)} to ${Math.max(...nn)}; eosinophils from ${Math.min(...e)} to ${Math.max(...e)}. <b>${flagged} of the ${n}</b> counts would be reported with at least one value out of range. Nobody misnamed a cell: this is chance alone.`;
        },
        waitFor: () => (tables().counts || []).length >= 21,
        waitHint: 'Let the twenty classmates count to continue',
      },
      {
        title: 'One count, one flag',
        enter() { const t = tables(); if (t.counts) setSide(dotsHTML(t.counts), 'wide'); },
        text: () => { const p = new Blood().percent.eos / 100; return `<p>The true share of eosinophils on this slide is ${pct1(100 * p)} %, well inside the reference range of 0–4 %. From the model: a count of 100 cells from it will show <b>5 or more</b> eosinophils ${oneIn(binomAtLeast(100, p, 5))}, and most single counts will land anywhere from ${binomRange(100, p)[0]} to ${binomRange(100, p)[1]}.</p>`; },
        question: {
          prompt: 'A classmate counts 100 cells on their own slide and finds 5 eosinophils (reference 0–4 %). They feel fine and have no allergies. What is the best conclusion?',
          options: [
            { t: 'It may well be chance. Count more cells, or count again, before concluding anything', ok: true, fb: 'Yes. A hospital analyzer counts thousands of cells for exactly this reason. With 100 cells, a value just outside the range is weak evidence on its own; a value far outside it (20 % eosinophils, say) is not chance. <b>Counting 200 cells, or pooling counts with lab mates, narrows the spread.</b>' },
            { t: 'They have an allergy or a parasite they do not know about', fb: 'Possible, but look at your dots: how many counts of a perfectly healthy slide had 5 or more eosinophils?' },
            { t: 'They must have misnamed some neutrophils as eosinophils', fb: 'Misnaming does happen, and it is worth checking. But in the simulation nobody misnamed anything, and counts like this still turned up.' },
          ],
        },
      },
    ],
  };

  // =========================================================================
  // Scene 5 · Whose slide is it?
  // =========================================================================
  const PEOPLE = {
    healthy: { who: 'Person 1', says: 'Allergy symptoms today: 0. In the last week: 0. Viral infection in the last 2 weeks: no. Bacterial infection in the last 2 weeks: no.', make: () => new Blood() },
    allergy: { who: 'Person 2', says: 'Allergy symptoms today: <b>5</b>. In the last week: <b>5</b> (hay fever, for about two weeks now). Viral infection: no. Bacterial infection: no.', make: () => new Blood().start('allergy').advance(14 * DAY) },
    viral: { who: 'Person 3', says: 'Allergy symptoms: 0. Viral infection in the last 2 weeks: <b>yes</b> (sore throat, swollen glands and very tired for ten days; the clinic said mononucleosis). Bacterial infection: no.', make: () => new Blood().start('viral').advance(10 * DAY) },
    bacterial: { who: 'Person 4', says: 'Allergy symptoms: 0. Viral infection: no. Bacterial infection in the last week: <b>yes</b> (an infected tooth, with a fever, for three days).', make: () => new Blood().start('bacterial').advance(3 * DAY) },
  };
  const KEYS = Object.keys(PEOPLE);
  function caseLetters() {
    const rand = rng(app.seed * 53 + 1), order = KEYS.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return Object.fromEntries(order.map((k, i) => [k, 'WXYZ'[i]]));
  }
  const WHY_CASE = {
    healthy: 'Nothing on this questionnaire calls for any cell. Which report has no flags?',
    allergy: 'Which cell did the allergy call for in scene 3? Find the report where that cell is high.',
    viral: 'Which cell deals with a virus? Find the report where that cell has become the commonest.',
    bacterial: 'Which cell deals with bacteria, and rises within a day? Find the report where it is high.',
  };
  const scene5 = {
    id: 'cases', title: 'Whose slide is it?',
    steps: [
      {
        title: 'Four reports, four people', view: 'reports', viewOpts: { caption: 'Four white cell counts from a hospital analyzer, which counts thousands of cells.' },
        enter() {
          const L = caseLetters();
          setSide(KEYS.slice().sort((a, b) => (L[a] < L[b] ? -1 : 1)).map(k => reportHTML(PEOPLE[k].make().report(), { title: 'Report ' + L[k], icons: true })).join(''), 'full');
        },
        text: '<p>Before your smear you fill in a questionnaire about allergies and recent infections. Here are four people\'s answers and, on the left, four reports. An analyzer made these counts, so chance is not the issue.</p><p><b>Whose report is whose?</b></p>',
        extra(el, c) {
          const store = (tables().cases = tables().cases || {}), L = caseLetters();
          matchTable(el, c, {
            head: ['Questionnaire', 'Report'], width: 22, store,
            rows: KEYS.map(k => ({ key: k, label: PEOPLE[k].who, html: `<b>${PEOPLE[k].who}.</b> ${PEOPLE[k].says}` })),
            options: ['W', 'X', 'Y', 'Z'].map(x => [x, x]), answer: (k) => L[k], hint: (k) => WHY_CASE[k],
          });
        },
        waitFor: () => { const s = tables().cases, L = caseLetters(); return !!(s && matched(s, KEYS, (k) => L[k])); },
        waitHint: 'Match all four to continue',
      },
      {
        title: 'Now count your own', view: 'lineup', viewOpts: { caption: 'The five white blood cells.', named: Object.fromEntries(TYPES.map(t => [t, true])) },
        text: '<p>When you have your own count, ask of it the three questions you used here:</p><p><b>1. Which cell is high, and what calls for that cell?</b> Check your questionnaire.<br><b>2. Is it a number or only a share?</b> One cell rising pushes every other percentage down.<br><b>3. Could it be chance?</b> A count of 100 cells strays, most of all for the rare cells.</p><p>Copy your results, then type your name to get your completion code.</p>',
        extra: (el, c) => renderCompletion(el, c),
        waitFor: (c) => !!c.record.name,
      },
    ],
  };

  const LESSON = [scene1, scene2, scene3, scene4, scene5];

  // Where the right answer falls in each question: equally often in each position, and never in
  // the same position twice running (as in ImmuneSim).
  (function placeAnswers() {
    const rand = rng(20261118), bags = {}, last = {};
    for (const sc of LESSON) for (const st of sc.steps) {
      const q = st.question;
      if (!q || !q.options || q.options.some(o => o.neutral)) continue;
      const n = q.options.length, right = q.options.find(o => o.ok), wrong = q.options.filter(o => !o.ok);
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
  // Completion: results to paste into the lab handout, and a completion code
  // =========================================================================
  // The code comes from the names typed (in any order) and is shown only once every question has
  // been answered. It shows the simulation was finished; it deters casual sharing but is not security.
  const CODE_SALT = 'bloodsim-complete-v1';
  const normNames = (n) => String(n || '').toLowerCase().split(/,|;|&|\n|\band\b/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).sort().join(', ');
  const completionCode = (names) => 'BL-' + Lesson.checkCode(normNames(names), CODE_SALT);
  function questionsLeft() {
    const r = rec(), left = [];
    LESSON.forEach((sc, si) => sc.steps.forEach((st, ki) => {
      const a = r.answers[`${sc.id}.${ki}`], last = si === LESSON.length - 1 && ki === sc.steps.length - 1;
      if ((st.question && !(a && a.done)) || (st.waitFor && !last && !r.completed.has(`${sc.id}.${ki}`))) left.push(si + 1);
    }));
    return [...new Set(left)];
  }
  const countLine = (cnt) => ORDER_HANDOUT.map(t => `${plural(t)} ${cnt[t]}`).join(', ');
  function resultsLines() {
    const r = rec(), v = r.values, t = r.tables || {}, L = [];
    L.push(`BloodSim: our results (slide ${app.seed})`);
    if (v.field) L.push(`Scene 1 · White cells found among about ${fmt(v.field.red)} red cells: ${v.field.white}`);
    if (t.jobs) {
      L.push('Scene 2 · Five cells, five jobs (cells we sent, in order)');
      for (const p of Object.keys(PROBLEMS)) { const j = t.jobs[p]; if (j && j.tried.length) L.push(`  ${JOBS[p].title}: ${j.tried.map(k => plural(k) + (j.res[k].solved ? ' ✓' : '')).join(', ')}`); }
    }
    if (v.bacterial) {
      const b = v.bacterial;
      L.push('Scene 3 · Why the count changes');
      L.push(`  Bacterial infection, day 2: neutrophils ${perUL(b.neut0)} → ${perUL(b.neut)} per µL (${pct1(b.pctN0)} % → ${pct1(b.pctN)} %)`);
      L.push(`    lymphocytes ${perUL(b.lymph0)} → ${perUL(b.lymph)} per µL (${pct1(b.pctL0)} % → ${pct1(b.pctL)} %); marrow reserve down ${Math.round(100 * (1 - b.reserve / b.reserve0))} %`);
    }
    if (t.conds) for (const k of Object.keys(CONDS)) { const s = t.conds[k]; if (s && s.done) L.push(`  ${CONDS[k].label}: ${plural(CONDS[k].top)} ${perUL(s.from)} → ${perUL(s.to)} per µL (${pct1(s.pct0)} % → ${pct1(s.pct)} %), out of range from day ${s.flagDay}; we predicted ${plural(s.pred)}`); }
    if (t.count) {
      L.push('Scene 4 · Counting 100 cells (a healthy person)');
      L.push(`  Our count: ${countLine(t.count)}${v.hand ? `; of the ${HAND} we named, ${v.hand.misses} not at the first try` : ''}`);
      if (t.counts && t.counts.length > 1) {
        const rng2 = (k) => { const a = t.counts.map(x => x[k]); return `${Math.min(...a)}–${Math.max(...a)}`; };
        L.push(`  ${t.counts.length} counts of the same slide, lowest–highest: ${ORDER_HANDOUT.map(k => `${plural(k)} ${rng2(k)}`).join(', ')}`);
        L.push(`  Counts with a value outside the reference range: ${t.counts.filter(x => Object.keys(flags(x, 100)).length).length} of ${t.counts.length}`);
      }
    }
    if (t.cases && t.cases._tries) L.push(`Scene 5 · Four reports matched to four people in ${t.cases._tries} choices`);
    return L;
  }
  function renderCompletion(el, c) {
    el.className = 'extra record';
    el.innerHTML = '';
    const ta = htmlEl('textarea', { readonly: 'readonly', 'aria-label': 'Your results' });
    ta.value = resultsLines().join('\n');
    const rowEl = htmlEl('div', { class: 'row' });
    const copy = htmlEl('button', { type: 'button' }, 'Copy our results');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(ta.value); c.status('<b>Copied.</b> Paste them into your lab handout.', true); }
      catch (e) { ta.focus(); ta.select(); c.status('Selected: press Ctrl+C (⌘C on a Mac) to copy.', false); }
    });
    rowEl.appendChild(copy);
    el.appendChild(ta); el.appendChild(rowEl);
    const left = questionsLeft();
    if (left.length) {
      el.appendChild(htmlEl('p', { class: 'warn' }, `<b>Not finished yet:</b> scene${left.length > 1 ? 's' : ''} ${left.join(', ')} still ${left.length > 1 ? 'have' : 'has'} a question or an activity to finish before the completion code appears. (Use the numbered circles at the top.)`));
      return;
    }
    el.appendChild(htmlEl('label', { for: 'rec-name' }, 'Your name. In a group: everyone\'s names, separated by commas'));
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
  // Progress is kept in this browser, so a closed tab does not cost the group its work. On a
  // shared computer the next group is asked whether to continue or start again.
  const SAVE_KEY = 'bloodsim-progress-v1';
  let runner = null;
  function readSaved() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.answers && (Object.keys(s.answers).length || (s.completed || []).length) ? s : null; } catch (e) { return null; }
  }
  function save() {
    if (!runner) return;
    try {
      const r = runner.runner.record;
      localStorage.setItem(SAVE_KEY, JSON.stringify({ seed: app.seed, when: Date.now(), scene: runner.runner.scene, answers: r.answers, values: r.values, tables: r.tables || {}, completed: [...r.completed], visited: [...r.visited], name: r.name || '' }));
    } catch (e) { /* private browsing or storage full: carry on without saving */ }
  }
  function begin(saved) {
    if (saved) app.seed = saved.seed;
    runner = BL.start(LESSON, {});
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
  const saved = /[?&]seed=/.test(location.search) ? null : readSaved();
  if (saved) {
    $('#resume-info').textContent = `Saved ${new Date(saved.when).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}${saved.name ? ' by ' + saved.name : ''}: reached scene ${(saved.scene || 0) + 1} of ${LESSON.length}.`;
    $('#resume').classList.add('on');
    $('#resume-continue').addEventListener('click', () => { $('#resume').classList.remove('on'); begin(saved); });
    $('#resume-restart').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } $('#resume').classList.remove('on'); begin(null); });
    $('#resume-continue').focus();
  } else begin(null);
  if (location.hash === '#verify') openVerify();
  window.addEventListener('hashchange', () => { if (location.hash === '#verify') openVerify(); });
  Object.assign(window.__bloodsim, { lesson: () => LESSON, completionCode, results: () => resultsLines().join('\n'), slide, caseLetters, PROBLEMS, CONDS });
})();
