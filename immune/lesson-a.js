/* ImmuneSim lesson, Part A: outside the cells (bacteria in a wound), scenes 1–9, and the helpers
 * both Parts use. See docs/IMMUNE_MODULE.md. Terms follow McKinley, Anatomy & Physiology: An
 * Integrative Approach (B-lymphocyte, helper T-lymphocyte, cytotoxic T-lymphocyte, MHC class I/II). */
(function () {
  'use strict';
  const { app, $, clamp, htmlEl, fmt, fmtAb, pct, person, setSim, sampleOf, snapshot, restore, startRun, skip, mark, keepGhost, dayNow } = IM;
  const { Immune, Dish, DAY, GOOD_FIT } = ImmuneSim;

  // ---------------------------------------------------------------- small helpers
  const ALL = ['pathogen', 'phago', 'lymph', 'ab'];
  const TL = (window, traces, lead) => ({ window, traces: traces || ALL, lead: lead || 0 });
  const data = (c) => c.stepState().data;
  const isPerson = () => app.sim instanceof Immune;
  const bar = (x) => `<span class="bar"><i style="width:${Math.round(100 * clamp(x, 0, 1))}%"></i></span>`;
  const day1 = (h) => (h / DAY).toFixed(1);
  // A prediction must be made before the experiment can be run.
  const predict = (q) => Object.assign(q, { onCorrect: (c) => c.refresh() });
  const afterPrediction = (c) => !c.stepState().answered;
  const guess = (prompt, options, fb) => ({ prompt, options: options.map(t => ({ t, ok: true, fb })) });
  const nameBox = (html) => `<div class="name">${html}</div>`;
  const caseNote = (who, html) => `<div class="case"><div class="case-h">${who}</div>${html}</div>`;

  const METERS = {
    race: () => (isPerson() ? [['Bacteria', fmt(app.sim.site.bacteria)]] : []),
    innate: () => {
      if (!isPerson()) return [];
      const b = app.sim, s = b.site, g = b.signs;
      return [['Bacteria', fmt(s.bacteria)], ['Neutrophils at the site', fmt(s.neutrophils), s.neutrophils > b.p.critN ? 'good' : ''], ['Redness and heat', bar(g.redness)], ['Swelling', bar(g.swelling)], ['Pus', bar(g.pus)]];
    },
    full: () => {
      if (!isPerson()) return [];
      const b = app.sim, s = b.site, g = b.signs;
      return [['Bacteria', fmt(s.bacteria)], ['Neutrophils at the site', fmt(s.neutrophils)], ['Lymphocytes that fit', fmt(b.specific(app.kind, app.strain).total)], ['Antibody', fmtAb(b.antibodyTo(app.kind, app.strain))], ['Redness and swelling', bar(Math.max(g.redness, g.swelling))]];
    },
    virus: () => {
      if (!isPerson()) return [];
      const b = app.sim, s = b.site;
      return [['Free virus', fmt(s.virus)], ['Infected cells', fmt(b.infected)], ['Cytotoxic T at the site', fmt(s.ctl)], ['Antibody', fmtAb(b.antibodyTo(app.kind, app.strain))], ['Fever and aching', bar(b.fever)]];
    },
  };

  // Follow a person for some hours without drawing, returning timeline rows (for grey comparison curves).
  function track(b, hours, kind, strain, every) {
    const rows = [sampleOf(b, kind, strain)];
    for (let h = 0; h < hours - 1e-6; h += every || 1) { b.advance(every || 1); rows.push(sampleOf(b, kind, strain)); }
    b.takeEvents();
    return rows;
  }
  const peakOf = (rows, key) => rows.reduce((m, r) => Math.max(m, r[key] || 0), 0);
  // Start an experiment on the stage. o: {sim, kind, strain, before, hours, speed, schedule, key, after, zero}
  function experiment(c, o) {
    if (o.sim) setSim(o.sim(), { kind: o.kind || app.kind, strain: o.strain || app.strain, keepGhosts: true });
    if (o.before) o.before(app.sim);
    const d = data(c);
    d.running = true;
    c.refresh();
    startRun({
      duration: o.hours, speed: o.speed, zero: o.zero, schedule: o.schedule,
      onDone: () => { d.running = false; d[o.key || 'ran'] = true; if (o.after) o.after(app.sim, c); c.refresh(); },
    });
  }
  const busy = (c) => !!data(c).running;
  // When the pathogen was cleared in the run now on screen (days since the experiment began), or null.
  function clearedDay() { const m = app.markers.filter(m => m.label === 'cleared').pop(); return m ? (m.t - app.zero) / DAY : null; }
  function markerDay(label) { const m = app.markers.filter(m => m.label === label).pop(); return m ? (m.t - app.zero) / DAY : null; }

  // Events to put in order (the student clicks them in sequence).
  function orderTask(el, c, items, hints, doneHtml, key) {
    el.className = 'extra';
    const d = data(c);
    if (d.next == null) d.next = c.stepState().done ? items.length : 0;
    // a fixed shuffle of the cards
    const order = items.map((_, i) => i).sort((a, b) => ((a * 7 + 3) % items.length) - ((b * 7 + 3) % items.length));
    const render = () => {
      el.innerHTML = '';
      const built = htmlEl('ol', { style: 'margin:0 0 8px 18px;padding:0;font-size:14px' });
      for (let i = 0; i < d.next; i++) built.appendChild(htmlEl('li', { style: 'margin-bottom:3px' }, items[i]));
      if (d.next) el.appendChild(built);
      if (d.next >= items.length) { el.appendChild(htmlEl('div', { class: 'feedback good' }, doneHtml)); return; }
      const cards = htmlEl('div', { class: 'options' });
      const fb = htmlEl('div', { class: 'feedback bad', style: 'display:none' });
      for (const i of order) {
        if (i < d.next) continue;
        const b = htmlEl('button', { type: 'button' }, items[i]);
        b.addEventListener('click', () => {
          if (i === d.next) { d.next++; if (d.next >= items.length) { c.recordValue(key, d.wrong || 0); c.complete(); } render(); }
          else { d.wrong = (d.wrong || 0) + 1; b.classList.add('wrong'); fb.style.display = 'block'; fb.innerHTML = `<b>Not yet.</b> ${hints[d.next]}`; }
        });
        cards.appendChild(b);
      }
      el.appendChild(htmlEl('div', { style: 'font-size:13px;color:var(--muted);margin-bottom:4px' }, d.next ? 'What happens next?' : 'What happens first?'));
      el.appendChild(cards); el.appendChild(fb);
    };
    render();
  }

  // A table the student completes from their own runs: each cell is a choice; the step is done
  // when every cell is right. spec: {key, head: [...], rows: [{label, cells: [{options, answer}]}]}
  function selectTable(el, c, spec) {
    el.className = 'extra';
    const store = (c.record.tables = c.record.tables || {});
    const st = (store[spec.key] = store[spec.key] || {});
    const tbl = htmlEl('table', { class: 'ptable' });
    tbl.appendChild(htmlEl('tr', {}, spec.head.map(h => `<th>${h}</th>`).join('')));
    const check = () => {
      let all = true;
      spec.rows.forEach((r, ri) => r.cells.forEach((cell, ci) => { const v = st[`${ri}.${ci}`]; if (v !== cell.answer) all = false; }));
      note.innerHTML = all ? `<div class="feedback good">${spec.done || '<b>Complete.</b>'}</div>` : '';
      if (all) c.complete();
    };
    const note = htmlEl('div', {});
    spec.rows.forEach((r, ri) => {
      const tr = htmlEl('tr', {}, `<td><b>${r.label}</b></td>`);
      r.cells.forEach((cell, ci) => {
        const td = htmlEl('td', {});
        const sel = htmlEl('select', { 'aria-label': `${r.label}: ${spec.head[ci + 1]}` });
        sel.appendChild(htmlEl('option', { value: '' }, 'choose…'));
        // options in a fixed order that does not give the answer away
        cell.options.forEach((o) => sel.appendChild(htmlEl('option', { value: o }, o)));
        const k = `${ri}.${ci}`;
        const paint = () => { td.className = !st[k] ? '' : st[k] === cell.answer ? 'right' : 'wrong'; };
        if (st[k]) sel.value = st[k];
        sel.addEventListener('change', () => {
          if (st[k + ':first'] == null && sel.value) st[k + ':first'] = sel.value;
          st[k] = sel.value; paint(); check();
        });
        paint(); td.appendChild(sel); tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    el.appendChild(tbl); el.appendChild(note);
    if (spec.hint) el.appendChild(htmlEl('div', { style: 'font-size:13px;color:var(--muted);margin-top:4px' }, spec.hint));
    check();
  }
  function labTable(rows, title) {
    return `<div class="labrep"><div class="lh"><span>${title || 'Lab report'}</span><span style="font-weight:400;color:var(--muted)">ref. range</span></div><table>` +
      rows.map(r => `<tr class="${r.flag || ''}"><td>${r.name}</td><td class="v">${typeof r.value === 'number' ? fmt(r.value) : r.value}</td><td class="f">${r.flag || ''}</td><td class="r">${r.unit}${r.lo != null ? ` · ${fmt(r.lo)}–${fmt(r.hi)}` : ''}</td></tr>`).join('') + '</table></div>';
  }

  // ---------------------------------------------------------------- the patients (fictional)
  const PRIYA = `<p><b>Priya Nair, 20,</b> a nursing student, trips on a trail run and scrapes her right knee on the gravel. She rinses it and carries on.</p>
    <p>By the next evening the skin around the scrape is <b>red, warm, swollen and sore</b>. On day 3 she finds a <b>tender lump in her right groin</b>. She feels tired and a little feverish. By day 9 or 10 the knee is healing and she feels well.</p>
    <p>Six months later she falls on the same trail and scrapes the same knee. This time it barely reddens.</p>`;
  const PRIYA_Q = `<ol style="margin:4px 0 0 18px;padding:0"><li>What made her knee red, warm and swollen: the bacteria, or Priya?</li><li>What was the lump in her groin, and why did it appear on day 3 and not on day 1?</li><li>Why did it take more than a week the first time, and almost no time the second?</li></ol>`;
  const ELENA = `<p><b>Elena Cruz, 21,</b> Priya's roommate, comes down with <b>influenza</b> in January: fever, aching muscles, a dry cough. She is ill for about a week.</p>
    <p>Priya shares the apartment and is exposed to the same virus, but she had the <b>flu vaccine</b> in October and stays well. Elena's sister has a <b>newborn</b> son who has had no vaccines yet.</p>`;
  const HALL = `<p><b>Mr. Hall, 58,</b> is having chemotherapy for lymphoma. He has a fever of 38.6 °C. A small wound on his shin shows little redness or swelling and no pus.</p>`;
  const ADEYEMI = `<p><b>Ms. Adeyemi, 34,</b> has untreated HIV infection. She is admitted with a lung infection caused by a fungus that healthy people breathe in every day without becoming ill.</p>`;

  // ---------------------------------------------------------------- saved moments, worked out once
  const cache = {};
  // Priya's first infection, followed to day 12.
  function firstInfection() {
    if (!cache.first) {
      const b = person((x) => x.infect('bacterium'));
      const rows = track(b, 12 * DAY, 'bacterium', 'A');
      cache.first = { sim: b, rows, markers: [], zero: 0 };
    }
    return cache.first;
  }
  // The same person six months after that infection.
  function sixMonthsOn() {
    if (!cache.six) { const b = firstInfection().sim.copy(); b.advance(168 * DAY); b.takeEvents(); b.flags = {}; cache.six = b; }
    return cache.six.copy();
  }
  const firstGhost = () => ({ label: 'first infection', zero: 0, rows: firstInfection().rows, keys: ['pathogen', 'ab'] });
  // A person with only the innate response, for scenes 3 and 4.
  const innateOnly = (setup) => person((b) => { b.set('adaptive', 0); if (setup) setup(b); });

  const FIND = (part, slide, prompt, explain, wrong) => ({
    view: 'body', findPart: part,
    enter: (c) => {
      const v = c.view(); v.show(slide); v.names(true); v.highlight(c.stepState().done ? part : null);
      v.onPart = (p) => {
        if (p === part) { v.highlight(part); c.status(`<b>Yes.</b> ${explain}`, true); c.complete(); }
        else c.status((wrong && wrong[p]) || 'Not that one. Read the description again.', false);
      };
    },
    text: `<p>${prompt}</p>`,
    waitFor: () => false, waitHint: 'Click the structure described',
  });

  const ORDER = [
    'Macrophages in the tissue recognise the bacteria and release alarm signals',
    'The vessel widens and leaks; neutrophils arrive and hold the bacteria level',
    'A dendritic cell carries pieces of the bacteria to the lymph node',
    'The few lymphocytes whose receptors fit are selected, and divide for days',
    'Plasma cells release antibody, which coats the bacteria',
    'Phagocytes swallow the coated bacteria, and the infection is cleared',
  ];
  const ORDER_HINT = [
    'Which cells were already at the wound when the bacteria arrived?',
    'What did the alarm signals do to the blood vessel, and which cells came out of it?',
    'The neutrophils are holding the line. How does the lymph node find out there is an infection?',
    'What happens in the lymph node once the antigen arrives?',
    'What do the B-lymphocytes of the expanded clone turn into, and what do those cells make?',
    'Antibody does not kill. What finishes the job?',
  ];

  // =========================================================================
  // Part A
  // =========================================================================
  const PART_A = [
    // ------------------------------------------------------------- 1. where is the immune system?
    {
      id: 'where', title: 'Where is the immune system?', speed: 6,
      steps: [
        {
          view: 'body', viewOpts: { slide: 0, caption: 'Priya, with a scraped right knee.' }, remount: true,
          timeline: { window: 2, traces: [], note: 'The infection timeline will be drawn here from scene 2 on.' },
          title: 'Why this matters: a patient',
          setup: () => setSim(person(), { kind: 'bacterium' }),
          enter: (c) => { const v = c.view(); v.show(0); v.names(true); v.highlight(null); v.onPart = null; },
          text: `<div class="case"><div class="case-h">Priya's case</div>${PRIYA}</div>
                 <p>By the end of Part A you will be able to answer three questions about Priya (they are on your handout):</p>${PRIYA_Q}
                 <p style="margin-top:8px">You can reopen the cases at any time with <b>The patients</b> button at the top, and jump to any scene with the numbered circles.</p>`,
          question: guess('Before you start, make a guess: what makes a scraped knee go red, warm and swollen a day later?', ['Chemicals made by the bacteria', 'Something the body does on purpose', 'Dirt left in the wound'], 'Keep your guess in mind. You will test it in scene 3.'),
        },
        Object.assign(FIND('skin', 1, 'Two pieces of skin, cut through and seen from the side. Bacteria live on everyone\'s skin all the time. On the left they are sitting on the surface and getting nowhere. <b>Click the structure that is keeping them out.</b>', 'The <b>epidermis</b>: layers of tightly joined cells, the outer ones dead, dry and full of keratin. Skin and mucous membranes are the body\'s first line of defense, and most microbes never get past them.', { gap: 'That is where the barrier has been scraped away. Click the barrier itself, on the left.' }),
          { viewOpts: { slide: 1, caption: 'Skin in section: intact on the left, scraped on the right.' }, title: 'The barrier' }),
        {
          view: 'body', title: 'A breach',
          enter: (c) => { c.view().show(1); c.view().onPart = null; },
          text: `<p>On the right the epidermis has been scraped away, and bacteria are in the warm, wet tissue underneath, where there is plenty to feed on.</p>`,
          question: { prompt: 'Everything in the rest of this lab is about what happens on the right. Which statement fits both pictures?', options: [
            { t: 'The same bacteria are harmless on intact skin and a threat once they are in the tissue', ok: true, fb: 'Nothing about the bacteria changed. What changed is where they are. Defenses inside the body exist for the times the barrier fails.' },
            { t: 'Bacteria on intact skin are slowly working their way through it', fb: 'Look at the left-hand picture: the bacteria stay on the surface. Intact skin is a real barrier.' },
            { t: 'The bacteria on the right are a more dangerous kind', fb: 'They are the same bacteria in both pictures. Look at where they are.' },
          ] },
        },
        Object.assign(FIND('groin-right', 0, 'Back to the whole body. Fluid is always leaking out of blood vessels into the tissues. <b>Lymph vessels</b> (green) collect it and return it to the blood, and on the way it passes through <b>lymph nodes</b>. <b>Click the lymph node that fluid from Priya\'s scraped right knee reaches first.</b>', 'The <b>inguinal lymph nodes</b> in the right groin drain the right leg. Whatever is in the fluid around the wound will arrive here. Remember this node: it is where Priya\'s lump appears on day 3.', { 'groin-left': 'That node drains the left leg. Follow the green vessel up from the scraped knee.', 'armpit-right': 'Those nodes drain the arm and chest wall. Follow the green vessel up from the knee.', 'armpit-left': 'Those nodes drain the arm and chest wall. Follow the green vessel up from the knee.', 'neck-right': 'Those nodes drain the head and neck. Follow the green vessel up from the knee.', 'neck-left': 'Those nodes drain the head and neck. Follow the green vessel up from the knee.' }),
          { viewOpts: { slide: 0, caption: 'Lymph vessels and lymph nodes.' }, title: 'Where the fluid goes' }),
        {
          view: 'body', viewOpts: { slide: 2, caption: 'The three places this lab follows.' }, title: 'Three places to watch',
          enter: (c) => { c.view().show(2); c.view().onPart = null; },
          text: `<p>From here on the screen shows three places at once: the <b>site</b> of infection, the <b>lymph node</b> that drains it, and the <b>blood</b>. Whenever something happens, ask: <i>where</i> is it happening?</p>`,
          question: guess('Make a prediction: where will the bacteria first meet a cell of the immune system?', ['At the site: in the tissue of the knee', 'In the lymph node in the groin', 'In the blood'], 'Keep your prediction in mind. Scene 3 starts at the site.'),
        },
      ],
    },
    // ------------------------------------------------------------- 2. a race
    {
      id: 'race', title: 'A race', speed: 3,
      steps: [
        {
          view: 'places', viewOpts: { node: false, kind: 'bacterium', caption: 'The site: the tissue under Priya\'s scrape.', marksAt: [[1, 500, 44], [2, 500, 250], [3, 60, 470]] }, remount: true,
          timeline: TL(1.05, ['pathogen']), meters: METERS.race,
          title: 'How to read the picture and the graph',
          setup: () => setSim(person((b) => { b.set('macrophages', 0); b.set('neutrophils', 0); b.set('adaptive', 0); }), { kind: 'bacterium' }),
          enter: (c) => c.view().setMarks(true),
          text: `<ol style="margin:0 0 6px 18px;padding:0"><li>The <b>scrape</b>: the gap in the skin.</li><li>The <b>tissue</b> under it, where the bacteria will be drawn.</li><li>A <b>blood vessel</b> running through the tissue.</li></ol>
                 <p>Below is the <b>infection timeline</b>, the graph you will use for the whole lab. Time runs left to right. Height is <i>how many</i>. Because the numbers range from one to a billion, the scale is squeezed: <b>each line is 100 times the line below it</b>.</p>
                 <p>In this scene every defense in the model is switched off, to see what the bacteria would do if nothing stopped them.</p>`,
          question: { prompt: 'On this graph a curve climbs from one line to the next line up. How has the number changed?', options: [
            { t: 'It is 100 times larger', ok: true, fb: 'Each line is 100 times the one below. A curve that rises steadily on this graph is multiplying, not just adding.' },
            { t: 'It is 100 larger', fb: 'Read the labels on the lines: 1, 100, 10 thousand, 1 million. Each is the one below <i>multiplied</i> by something.' },
            { t: 'It has doubled', fb: 'Read the labels on the lines: 1, 100, 10 thousand. How many times larger is each than the one below?' },
          ] },
        },
        {
          view: 'places', title: 'Predict',
          enter: (c) => c.view().setMarks(false),
          text: `<p>About <b>1,000</b> bacteria got in through the scrape. In warm tissue fluid this bacterium divides in two about every <b>90 minutes</b>.</p>`,
          question: predict({ prompt: 'Predict: if nothing stops them, about how many will there be after 24 hours?', options: [
            { t: 'About 65 million', ok: true, fb: '24 hours is 16 doublings, and 1,000 doubled 16 times is about 65 million. Run it and check.' },
            { t: 'About 17,000', fb: 'That would be adding 1,000 every 90 minutes. Each division <i>doubles</i> the number: 1,000, 2,000, 4,000, 8,000 … How many doublings fit into 24 hours?' },
            { t: 'About 1 million', fb: 'Closer, but count the doublings: 24 hours ÷ 1.5 hours = 16. Ten doublings is already a thousandfold.' },
          ] }),
          actions: [{ label: 'Let 24 hours pass', cls: 'germ', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium', { dose: 1000 }), hours: 24, speed: 3, after: (b, c) => c.recordValue('race24', b.site.bacteria) }) }],
          status: (c) => (data(c).ran ? `<b>After 24 hours: ${fmt(app.sim.site.bacteria)} bacteria.</b>` : ''),
          waitFor: (c) => data(c).ran, waitHint: 'Make your prediction, then let 24 hours pass',
        },
        {
          view: 'places', title: 'What a defense has to do',
          text: `<p>Look at the shape of the curve: a straight climb on this graph, which means multiplying by the same amount every hour.</p>`,
          question: { prompt: 'Suppose the body had a superb defense that took a week to get ready. What does this graph say about relying on that alone?', options: [
            { t: 'The bacteria would fill the tissue long before it was ready; something faster has to hold them first', ok: true, fb: 'A defense is judged by <b>when it arrives</b>. The rest of Part A is about two kinds of defense: one that is ready within hours, and one that takes days but is far more exact.' },
            { t: 'A week is fine, because infections start slowly', fb: 'Look at the first hours of the curve: the number is already multiplying. There is no slow start.' },
            { t: 'The slow defense only needs to be made stronger', fb: 'However strong it is, it arrives after a day of doubling has produced tens of millions of bacteria. What would have to be different about it?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 3. the guards already there
    {
      id: 'guards', title: 'The guards already there', speed: 2,
      steps: [
        {
          view: 'places', viewOpts: { node: false, kind: 'bacterium', caption: 'The site, now with the cells that live there.', marksAt: [[1, 230, 180], [2, 60, 470], [3, 500, 44]] }, remount: true,
          timeline: TL(2, ['pathogen', 'phago']), meters: METERS.innate,
          title: 'How to read this picture',
          setup: () => setSim(innateOnly(), { kind: 'bacterium' }),
          enter: (c) => c.view().setMarks(true),
          text: `<ol style="margin:0 0 6px 18px;padding:0"><li><b>Macrophages</b> ("big eaters"): large cells that live in the tissue all the time. They swallow and digest microbes, which is called <b>phagocytosis</b>.</li><li>The <b>blood vessel</b>. The small blue cells in it are <b>neutrophils</b>, the most numerous white blood cells.</li><li>The <b>scrape</b>.</li></ol>
                 <p>A macrophage has receptors that fit molecules found in the walls of thousands of kinds of bacteria, and never on the body's own cells. Every macrophage has the same set.</p>`,
          question: { prompt: 'What do receptors like that let a macrophage do?', options: [
            { t: 'Recognise almost any bacterium at once, even one the body has never met', ok: true, fb: 'The recognition is built in and general: "this is a bacterium", not "this is <i>which</i> bacterium". That is why it needs no time to get ready.' },
            { t: 'Tell exactly which species of bacterium this is', fb: 'The molecule the receptor fits is shared by thousands of species, so the macrophage cannot tell them apart. What <i>can</i> it tell?' },
            { t: 'Recognise only bacteria the body has met before', fb: 'These receptors are built into every macrophage from the start. They do not depend on earlier infections.' },
          ] },
        },
        {
          view: 'places', title: 'A small breach',
          setup: () => setSim(innateOnly(), { kind: 'bacterium' }),
          enter: (c) => c.view().setMarks(false),
          text: `<p>Most breaks in the skin let in only a few bacteria. Try it: let in <b>300</b> and watch the macrophages, the vessel and the meters for 12 hours.</p>`,
          actions: [{ label: 'Let in 300 bacteria', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium', { dose: 300 }), hours: 12, speed: 2, after: (b, c) => c.recordValue('small', { cleared: clearedDay() != null ? clearedDay() * 24 : null, redness: b.signs.redness }) }) }],
          question: { prompt: 'The macrophages dealt with 300 bacteria. Did the wound become red or swollen?', options: [
            { t: 'No: they were eaten quietly, with no alarm', ok: true, fb: 'Most small breaches end like this, and you never know they happened. Now see what happens when more bacteria get in than the macrophages can eat.' },
            { t: 'Yes: it became red and swollen', fb: 'Run the experiment and watch the meters for redness and swelling above the picture.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Let in the bacteria',
        },
        {
          view: 'places', title: 'A larger breach',
          setup: () => setSim(innateOnly((b) => b.set('manualAlarm', 0)), { kind: 'bacterium' }),
          text: `<p>Priya's scrape let in about <b>10,000</b> bacteria. For this run the macrophages can eat but cannot call for help.</p>`,
          actions: [{ label: 'Let in 10,000 bacteria', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium'), hours: 12, speed: 2 }) }],
          status: (c) => (data(c).ran ? `<b>After 12 hours: ${fmt(app.sim.site.bacteria)} bacteria</b>, and rising.` : ''),
          question: { prompt: 'Each macrophage can swallow only so many bacteria an hour, and there are only a few macrophages. What do they need?', options: [
            { t: 'Reinforcements: many more phagocytes, brought in from the blood', ok: true, fb: 'The blood carries billions of neutrophils. The problem is getting them out of the vessel at the right place. Next you will do that by hand.' },
            { t: 'More time', fb: 'Look at the graph: every hour they fall further behind. Time is on the side of the bacteria.' },
            { t: 'Better receptors, to recognise the bacteria', fb: 'They recognise the bacteria perfectly well, and are eating them. The problem is numbers.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Let in the bacteria',
        },
        {
          view: 'places', title: 'You are the alarm', speed: 2,
          setup: () => { setSim(innateOnly((b) => { b.set('manualAlarm', 0); b.infect('bacterium'); }), { kind: 'bacterium' }); skip(8); },
          enter: (c) => { data(c).peak = 0; },
          text: `<p>A macrophage that detects bacteria releases <b>alarm signals</b>: chemicals (cytokines) that act on the nearby blood vessel. Here you release them yourself.</p>
                 <p><b>Hold the button</b> and watch three things: the vessel gets <b>wider</b>, its wall gets <b>leaky</b>, and <b>neutrophils</b> stick to the wall and squeeze out into the tissue. Time runs only while you hold. Keep holding until the bacteria are clearly falling.</p>`,
          actions: [{ label: 'Hold: sound the alarm', cls: 'cell', hold: true, down: () => { app.sim.set('manualAlarm', 1); app.clock = 'free'; }, up: () => { app.clock = 'idle'; } }],
          tick: (c) => { const d = data(c), s = app.sim.site; d.peak = Math.max(d.peak || 0, s.bacteria); if (!d.crossed && s.neutrophils > app.sim.p.critN && s.bacteria < d.peak * 0.97) { d.crossed = s.neutrophils; d.at = s.bacteria; c.recordValue('alarmByHand', { neutrophils: s.neutrophils, peak: d.peak }); mark('bacteria start to fall'); } },
          status: (c) => { const s = app.sim.site, d = data(c); return `Neutrophils at the site: <b>${fmt(s.neutrophils)}</b> · bacteria: <b>${fmt(s.bacteria)}</b>${d.crossed ? ` · they began to fall when the neutrophils passed about ${fmt(Math.round(d.crossed / 100) * 100)}` : ''}`; },
          waitFor: (c) => { const d = data(c); return d.crossed && app.sim.site.bacteria < d.peak * 0.4; },
          waitHint: 'Hold the alarm until the bacteria have clearly fallen',
          question: { prompt: 'Watch the two curves. When did the bacteria stop rising and start to fall?', options: [
            { t: 'When the number of neutrophils at the site passed about 2,000', ok: true, fb: 'Below that number the bacteria divide faster than they are eaten; above it they fall. What matters is having <b>enough neutrophils at the site</b>. This has been measured in real tissue.' },
            { t: 'As soon as the vessel widened', fb: 'The vessel widened within the first hour, but the bacteria kept climbing for hours after that. Look at where the blue curve was when the red curve turned.' },
            { t: 'When the alarm signals reached the bacteria', fb: 'The alarm signals act on Priya\'s own blood vessel and cells, not on the bacteria. Look at where the blue curve was when the red curve turned.' },
          ] },
        },
        {
          view: 'places', title: 'What Priya sees',
          setup: () => { setSim(innateOnly((b) => b.infect('bacterium')), { kind: 'bacterium' }); skip(30); },
          text: `<p>This is the same infection 30 hours in, with the macrophages sounding the alarm themselves. Look at the meters above the picture, and at the vessel.</p>
                 <ul style="margin:0 0 6px 18px;padding:0"><li><b>Redness and heat</b> follow the extra blood flowing through the widened vessel.</li><li><b>Swelling</b> follows the fluid leaking out through its wall.</li><li><b>Pus</b> is mostly dead neutrophils.</li></ul>`,
          question: { prompt: 'Priya\'s knee is red, warm and swollen. What is causing that?', options: [
            { t: 'Her own blood vessels: more flow and a leaky wall, which is how the neutrophils get there', ok: true, fb: 'Redness, heat, swelling and pain are the signs of <b>inflammation</b>, and inflammation is the body\'s response, not the bacteria\'s attack.' },
            { t: 'The bacteria are damaging her blood vessels', fb: 'In the last step <i>you</i> widened the vessel and made it leak, with the alarm button. The bacteria did not.' },
            { t: 'Toxins from the bacteria are irritating her skin', fb: 'In the last step <i>you</i> produced the redness and swelling, with the alarm button. What does that tell you about where they come from?' },
          ] },
        },
        {
          view: 'places', title: 'Turn the alarm down',
          setup: () => setSim(innateOnly(), { kind: 'bacterium' }),
          text: `<p>Run the first two days of Priya's infection as it really goes. Then repeat it with <b>prednisone</b>, the anti-inflammatory drug Daniel took in EndoSim, which turns the alarm down to about a third.</p>`,
          question: predict({ prompt: 'Predict what prednisone will do.', options: [
            { t: 'Less redness and swelling, and more bacteria', ok: true, fb: 'Run both and compare. If inflammation is the defense, turning it down should cost something.' },
            { t: 'Less redness and swelling, and fewer bacteria: the wound heals faster', fb: 'Think about what the redness and swelling are <i>for</i>. What arrived through the widened, leaky vessel?' },
            { t: 'No change in the bacteria: the drug acts on Priya, not on them', fb: 'The drug does act on Priya. But what was Priya\'s response doing to the bacteria?' },
          ] }),
          actions: [
            { label: '1. Run two days', cls: 'germ', disabled: (c) => afterPrediction(c) || busy(c) || data(c).plain, run: (c) => experiment(c, { sim: () => innateOnly(), before: (b) => b.infect('bacterium'), hours: 48, speed: 6, key: 'plain', after: (b, c) => { data(c).plainVals = { bacteria: b.site.bacteria, swelling: b.signs.swelling, neut: b.site.neutrophils, first: markerDay('first neutrophils') }; c.recordValue('innate48', data(c).plainVals); } }) },
            { label: '2. Repeat with prednisone', cls: 'drug', disabled: (c) => !data(c).plain || busy(c) || data(c).pred, run: (c) => { keepGhost('without prednisone'); experiment(c, { sim: () => innateOnly((b) => b.set('alarm', 0.3)), before: (b) => b.infect('bacterium'), hours: 48, speed: 6, key: 'pred', after: (b, c) => c.recordValue('pred48', { bacteria: b.site.bacteria, swelling: b.signs.swelling, neut: b.site.neutrophils }) }); } },
          ],
          status: (c) => { const d = data(c), v = c.record.values; return (d.plain && v.innate48 ? `Without the drug, at 48 h: <b>${fmt(v.innate48.bacteria)}</b> bacteria, ${fmt(v.innate48.neut)} neutrophils, swelling ${pct(v.innate48.swelling)}.` : '') + (d.pred && v.pred48 ? `<br>With prednisone: <b>${fmt(v.pred48.bacteria)}</b> bacteria, ${fmt(v.pred48.neut)} neutrophils, swelling ${pct(v.pred48.swelling)}.` : ''); },
          waitFor: (c) => data(c).plain && data(c).pred, waitHint: 'Predict, then run both experiments',
        },
        {
          view: 'places', title: 'Why so fast?',
          text: `<p>In your first run the neutrophils began to arrive within hours of the scrape.</p>`,
          question: { prompt: 'How can thousands of neutrophils reach the wound within hours?', options: [
            { t: 'They were already made and circulating in the blood, ready to leave wherever the alarm sounds', ok: true, fb: 'The bone marrow keeps tens of billions of neutrophils in circulation. Nothing has to be built or chosen: the alarm only has to open the door.' + nameBox('<b>Names for what you have seen.</b> Macrophages and neutrophils are <b>phagocytes</b>. The vessel response is <b>inflammation</b>. Leaving the blood by squeezing through the vessel wall is <b>diapedesis</b>, and following the chemical trail to the bacteria is <b>chemotaxis</b>.') },
            { t: 'They are made at the wound when they are needed', fb: 'Blood cells are made in the red bone marrow, and making a neutrophil takes days. Where were the small blue cells before you sounded the alarm?' },
            { t: 'They travel from the lymph node in the groin', fb: 'Look at the picture: where were the small blue cells before the alarm sounded?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 4. the same every time
    {
      id: 'same', title: 'The same every time', speed: 12,
      steps: [
        {
          view: 'places', viewOpts: { node: false, kind: 'bacterium', caption: 'The site. In this scene the model has macrophages and neutrophils, and nothing else.' }, remount: true,
          timeline: TL(4, ['pathogen', 'phago']), meters: METERS.innate,
          title: 'If this were all you had',
          setup: () => setSim(innateOnly(), { kind: 'bacterium' }),
          text: `<p>So far you have followed two days. In this scene the model has <b>only</b> what you have met so far: skin, macrophages, inflammation and neutrophils.</p>`,
          question: predict({ prompt: 'Predict the bacteria over four days with only these defenses.', options: [
            { t: 'Held roughly level, but not cleared', ok: true, fb: 'Run it and see. This particular bacterium (<i>Streptococcus pyogenes</i>) has a coat that makes it hard for a phagocyte to grip.' },
            { t: 'Cleared by about day 2', fb: 'In scene 3 the neutrophils stopped the rise. Did the count go on falling to zero while you watched?' },
            { t: 'Still doubling until they fill the tissue', fb: 'In scene 3, once enough neutrophils arrived, the bacteria stopped rising. So not this.' },
          ] }),
          actions: [{ label: 'Run four days', cls: 'germ', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium'), hours: 96, speed: 12, after: (b, c) => { cache.innate1 = app.history.slice(); c.recordValue('plateau', { bacteria: b.site.bacteria, neut: b.site.neutrophils }); } }) }],
          status: (c) => (data(c).ran ? `<b>Day 4: ${fmt(app.sim.site.bacteria)} bacteria</b>, held there by ${fmt(app.sim.site.neutrophils)} neutrophils. Not rising, not cleared.` : ''),
          waitFor: (c) => data(c).ran, waitHint: 'Predict, then run four days',
        },
        {
          view: 'places', title: 'The second time',
          setup: () => { setSim(innateOnly(), { kind: 'bacterium' }); if (!cache.innate1) cache.innate1 = track(innateOnly((b) => b.infect('bacterium')), 96, 'bacterium', 'A'); app.ghosts = [{ label: 'first time', zero: cache.innate1[0].t, rows: cache.innate1, keys: ['pathogen', 'phago'] }]; },
          text: `<p>Suppose an antibiotic clears the infection, and a month later the same bacterium gets into the same knee. The grey curves are the first time.</p>`,
          question: predict({ prompt: 'Predict: with only these defenses, how will the second response compare with the first?', options: [
            { t: 'The same', ok: true, fb: 'Run it and compare the new curves with the grey ones.' },
            { t: 'Faster and stronger: the cells have had practice', fb: 'That is what most people expect. Ask what would have to have <i>changed</i> in the macrophages or neutrophils for that to be true. Their receptors are built in, and these neutrophils are new ones: a neutrophil lives only a day or so.' },
            { t: 'Weaker: the neutrophils were used up', fb: 'The bone marrow replaces neutrophils continuously, so a month later the supply is back to normal. Would the new ones be any different from the old?' },
          ] }),
          actions: [{ label: 'Run the second infection', cls: 'germ', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium'), hours: 96, speed: 12, after: (b, c) => c.recordValue('plateau2', { bacteria: b.site.bacteria }) }) }],
          status: (c) => (data(c).ran ? 'The new curves lie exactly on top of the grey ones.' : ''),
          waitFor: (c) => data(c).ran, waitHint: 'Predict, then run the second infection',
        },
        {
          view: 'places', title: 'A bacterium she has never met',
          setup: () => { setSim(innateOnly(), { kind: 'bacterium', strain: 'C' }); if (!cache.innate1) cache.innate1 = track(innateOnly((b) => b.infect('bacterium')), 96, 'bacterium', 'A'); app.ghosts = [{ label: 'the first bacterium', zero: cache.innate1[0].t, rows: cache.innate1, keys: ['pathogen', 'phago'] }]; },
          text: `<p>Now a <b>different strain</b> of the bacterium, with different proteins on its surface, which Priya has never met.</p>`,
          actions: [{ label: 'Run the new strain', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium', { strain: 'C' }), hours: 96, speed: 12 }) }],
          question: { prompt: 'The response to a strain she had never met was the same as to one she had met twice. Why?', options: [
            { t: 'These cells recognise features that nearly all bacteria share, and an infection does not change them', ok: true, fb: nameBox('<b>Innate immunity.</b> Barriers, phagocytes and inflammation: <b>fast</b> (hours), <b>nonspecific</b> (the same for any bacterium) and with <b>no memory</b> (the same every time). You are born with it.') + '<p style="margin:6px 0 0">It held Priya\'s infection but could not clear it. To finish the job she needs something that can pick out <i>this</i> bacterium exactly.</p>' },
            { t: 'The two strains happened to be the same size', fb: 'Size is not what the macrophage recognises. Think back to its receptors in scene 3: what do they fit?' },
            { t: 'Her body remembered the first strain and used that memory', fb: 'If memory were at work, the second infection with the <i>same</i> strain would have gone better than the first. Did it?' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run the new strain',
        },
      ],
    },
    // ------------------------------------------------------------- 5. the library in the lymph node
    {
      id: 'library', title: 'The library in the lymph node', speed: 6,
      steps: [
        {
          view: 'places', viewOpts: { kind: 'bacterium', caption: 'All three places: the site, the lymph node that drains it, and the blood.' }, remount: true,
          timeline: TL(10), meters: METERS.full,
          title: 'A messenger leaves the wound',
          setup: () => setSim(person(), { kind: 'bacterium' }),
          text: `<p>From now on the picture shows all three places, and the model has everything switched on.</p>
                 <p>Among the cells at the wound are <b>dendritic cells</b>. A dendritic cell swallows bacteria, cuts their proteins into pieces, then leaves the tissue through a lymph vessel, carrying the pieces to the lymph node. Any molecule (usually a piece of a protein) that a lymphocyte's receptor can bind is called an <b>antigen</b>.</p>`,
          actions: [{ label: 'Follow the first day', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium'), hours: 24, speed: 4, after: (b, c) => c.recordValue('antigenNode', markerDay('antigen reaches the node')) }) }],
          question: guess('Make a prediction: why carry pieces of the bacterium all the way to the lymph node?', ['The cells that could recognise this exact bacterium are waiting there', 'So that the node can filter the bacteria out and destroy them', 'To warn the rest of the body that there is an infection'], 'Go into the lymph node and see what is there.'),
          waitFor: (c) => data(c).ran, waitHint: 'Follow the first day',
        },
        {
          view: 'node', viewOpts: { lib: 'B', caption: 'Inside the lymph node in Priya\'s groin.' }, remount: true,
          title: 'How to read this picture',
          setup: () => setSim(person(), { kind: 'bacterium' }),
          enter: (c) => { const v = c.view(); v.setMarks(true); v.reveal(false); v.setSelf(false); v.reset(); },
          text: `<ol style="margin:0 0 6px 18px;padding:0"><li>Each circle is one <b>lymphocyte</b>. These are <b>B-lymphocytes</b>.</li><li>The red shape is the <b>antigen</b> from Priya's bacterium.</li><li>Above it will be the <b>receptor</b> of whichever lymphocyte you pick. Every receptor on one lymphocyte is the same shape; different lymphocytes have different shapes.</li><li>The <b>fit</b>: how well that receptor's cleft matches the antigen's knob. It binds only if the fit is good.</li></ol>`,
          question: guess('Priya has never met this bacterium. Predict: how will her body come to have a lymphocyte whose receptor fits its antigen?', ['One already exists: lymphocytes are made with millions of different receptors before any infection', 'A lymphocyte will examine the antigen and build a receptor to match it', 'The dendritic cell will pass the shape on, and lymphocytes will copy it'], 'Keep your prediction in mind. The next three steps test it.'),
        },
        {
          view: 'node', title: 'Hunt by hand',
          enter: (c) => { const v = c.view(); v.setMarks(false); v.reveal(false); v.reset(); v.onPick = () => { c.recordValue('hunt', { tested: v.tested.size, best: v.best }); }; },
          text: `<p>Somewhere in this node there may be a B-lymphocyte whose receptor fits. <b>Click circles to test their receptors</b> (or use the button), and look at the close-up each time.</p><p>Test at least <b>8</b>.</p>`,
          actions: [{ label: 'Test another lymphocyte at random', cls: 'lym', run: (c) => c.view().pickRandom() }],
          status: (c) => { const v = c.view(); return v && v.tested ? `Tested: <b>${v.tested.size}</b> of ${fmt(app.sim.lib.B.length)} · best fit so far: <b>${pct(v.best)}</b>${v.tested.size >= 8 && v.best < GOOD_FIT ? '. At this rate, finding one could take hundreds of tries.' : ''}` : ''; },
          waitFor: (c) => c.view() && c.view().tested && c.view().tested.size >= 8, waitHint: 'Test at least 8 lymphocytes',
        },
        {
          view: 'node', title: 'Let the antigen find it',
          enter: (c) => { const v = c.view(); v.reveal(false); v.onPick = (cl, f) => { if (f >= GOOD_FIT && v.revealed) { data(c).found = true; } }; },
          text: `<p>You do not have to search. Antigen carried in from the wound drifts through the whole node, past every lymphocyte, and <b>sticks only where it fits</b>.</p><p>Release it. Then click one of the cells it has marked, and check its fit in the close-up.</p>`,
          actions: [{ label: 'Let the antigen drift through the node', cls: 'germ', run: (c) => { c.view().reveal(true); data(c).released = true; c.recordValue('fitting', c.view().fitting().length); } }],
          question: { type: 'number', prompt: 'Of the 1,296 B-lymphocytes shown, how many have a receptor that fits this antigen? (Release the antigen and count the filled circles.)', unit: 'cells', answer: (c) => c.view().fitting().length, tol: 0, hint: () => 'Count the dark, filled circles after you release the antigen. The tally at the bottom right also gives the number.', explain: () => 'A handful out of more than a thousand here; in a real person, of the order of one lymphocyte in a hundred thousand.' },
          waitFor: (c) => data(c).found, waitHint: 'Release the antigen, then click a marked cell',
        },
        {
          view: 'node', title: 'A different pathogen',
          setup: () => { app.strain = 'A'; },
          enter: (c) => { const v = c.view(); v.reveal(true); v.reset(); v.onPick = (cl, f) => { if (f >= GOOD_FIT && data(c).swapped) data(c).found = true; }; },
          text: `<p>Now swap in the antigen of a <b>different strain</b>. Nothing else changes: watch the library as you press the button. Then click a cell the new antigen has marked.</p>`,
          actions: [{ label: 'Swap in a different strain', cls: 'germ', disabled: (c) => data(c).swapped, run: (c) => { app.strain = 'B'; const v = c.view(); v.reset(); v.reveal(true); data(c).swapped = true; c.recordValue('fittingB', v.fitting().length); c.refresh(); } }],
          question: { prompt: 'The library did not change when the pathogen did, yet a fitting cell was there both times. What does that tell you?', options: [
            { t: 'The receptors are made first, in enormous variety; the antigen only picks out the cells that happen to fit', ok: true, fb: 'The body does not design a receptor for a new microbe. It makes hundreds of millions of different lymphocytes in advance, and the microbe <b>selects</b> the few that fit it. That is why Priya can respond to a bacterium no one in her family has ever met.' },
            { t: 'The lymphocytes changed their receptors to match the new antigen', fb: 'Watch the library when you press the button: every circle stays where it was, and no receptor changes. Different cells are marked, that is all.' },
            { t: 'Most receptors fit most antigens loosely', fb: 'You tested receptors by hand in the last step. What were their fits?' },
          ] },
          waitFor: (c) => data(c).found, waitHint: 'Swap the strain, then click a marked cell',
        },
        {
          view: 'node', title: 'Why doesn\'t the library attack Priya?',
          setup: () => { app.strain = 'A'; },
          enter: (c) => { const v = c.view(); v.reset(); v.reveal(false); v.setSelf('made'); v.onPick = null; },
          text: `<p>Receptors made in such variety will sometimes, by chance, fit one of the body's <b>own</b> molecules. The red circles are lymphocytes like that, shown here as they were first made.</p>`,
          question: { prompt: 'What has to happen to those cells before they are let out into the body?', options: [
            { t: 'They are destroyed while still immature, before they are released', ok: true, fb: 'Every new lymphocyte is tested against the body\'s own molecules (B-lymphocytes in the red bone marrow, T-lymphocytes in the thymus), and those that fit are eliminated. What is left tolerates "self". When this screening fails, the result is an <b>autoimmune disease</b>, like Maria\'s Hashimoto\'s thyroiditis in EndoSim.' },
            { t: 'Nothing: they are needed to fight infections inside the body\'s own cells', fb: 'A lymphocyte whose receptor fits a normal body molecule would attack healthy tissue. Infected cells are dealt with another way (Part B).' },
            { t: 'They are kept, but are too few to matter', fb: 'You are about to see how a single lymphocyte becomes tens of thousands. One would be enough.' },
          ], onCorrect: (c) => c.view().setSelf('screened') },
        },
      ],
    },
    // ------------------------------------------------------------- 6. one cell is not enough
    {
      id: 'expand', title: 'One cell is not enough', speed: 12,
      steps: [
        {
          view: 'node', viewOpts: { lib: 'B', caption: 'The lymph node, one day after the scrape.' }, remount: true,
          timeline: TL(10), meters: METERS.full,
          title: 'A handful of cells against millions',
          setup: () => { setSim(person((b) => b.infect('bacterium')), { kind: 'bacterium' }); skip(24); },
          enter: (c) => { const v = c.view(); v.reveal(true); v.setSelf(false); },
          text: () => `<p>One day in. At the knee there are <b>${fmt(app.sim.site.bacteria)}</b> bacteria. In the node, the B-lymphocytes whose receptor fits number <b>${fmt(app.sim.specific('bacterium', 'A', 'B').total)}</b>.</p>`,
          question: { prompt: 'A handful of cells cannot make enough antibody to matter. What has to happen first?', options: [
            { t: 'The cells that fit must divide, again and again, making copies with the same receptor', ok: true, fb: 'Each daughter cell inherits the same receptor. The question is how long that takes.' },
            { t: 'The bone marrow must make more cells with this receptor', fb: 'The bone marrow makes receptors in huge variety, without knowing which will be needed. The chance of it making this one again is tiny. Where else could more cells with <i>this</i> receptor come from?' },
            { t: 'Other lymphocytes must change their receptors to match', fb: 'In scene 5 no lymphocyte changed its receptor. Where else could more cells with <i>this</i> receptor come from?' },
          ] },
        },
        {
          view: 'node', title: 'Predict the delay',
          text: `<p>A lymphocyte that has been selected needs a day or two to get started, and then divides about once every <b>8 to 10 hours</b> at best. Going from 3 cells to 10,000 takes about 12 doublings.</p>`,
          question: { prompt: 'So about how long will it be before there are ten thousand?', options: [
            { t: 'About a week', ok: true, fb: '12 doublings × 9 hours is four and a half days, plus the time to get started. Run it and see.' },
            { t: 'About a day', fb: 'In a day there is time for only two or three doublings: 3 cells become about 20. Multiply 12 doublings by 9 hours.' },
            { t: 'About a month', fb: 'Too long. Multiply 12 doublings by 9 hours, and add a day or two.' },
          ] },
        },
        {
          view: 'node', title: 'Watch the clone grow',
          setup: () => { setSim(person((b) => b.infect('bacterium')), { kind: 'bacterium' }); skip(24); },
          enter: (c) => c.view().reveal(true),
          text: `<p>Run to day 7. Watch the node, and the green curve on the timeline. The count of B-lymphocytes that fit will be noted on days 2, 4 and 6.</p>`,
          actions: [{ label: 'Run to day 7', cls: 'lym', disabled: (c) => busy(c) || data(c).ran, run: (c) => {
            const note = (d) => ({ at: (d - 1) * DAY, fn: () => { const n = app.sim.specific('bacterium', 'A', 'B').total; (data(c).counts = data(c).counts || {})[d] = n; mark(`day ${d}: ${fmt(n)}`); } });
            experiment(c, { hours: 6 * DAY, speed: 12, zero: false, schedule: [note(2), note(4), note(6)], after: (b, c) => c.recordValue('clone', Object.assign({ firstAb: markerDay('first antibody'), bact5: null }, data(c).counts)) });
          } }],
          status: (c) => { const k = data(c).counts; return k ? `B-lymphocytes that fit: ${[2, 4, 6].filter(d => k[d] != null).map(d => `day ${d}: <b>${fmt(k[d])}</b>`).join(' · ')}` : ''; },
          question: { prompt: 'Priya is still unwell on day 5. Why is this defense so slow to arrive?', options: [
            { t: 'It starts from a handful of cells, and every doubling takes hours', ok: true, fb: nameBox('<b>Clonal selection.</b> All the descendants of one selected lymphocyte carry the same receptor: they are a <b>clone</b>. The antigen selects the clone; the clone then expands. The days this takes are the <b>lag</b> before the response is felt.') },
            { t: 'The lymphocytes have a long way to travel to the wound', fb: 'Travel in the blood takes about a minute. Look at the counts on days 2, 4 and 6: what were the cells doing all that time?' },
            { t: 'The cells need days to work out what the bacterium is', fb: 'Recognition took no time at all: the antigen stuck to the cells that fit as soon as it arrived. Look at the counts on days 2, 4 and 6.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run to day 7',
        },
        {
          view: 'places', viewOpts: { kind: 'bacterium', caption: 'Day 3 of Priya\'s infection.' }, remount: true, title: 'The lump in her groin',
          setup: () => { setSim(person((b) => b.infect('bacterium')), { kind: 'bacterium' }); skip(3 * DAY); },
          text: () => `<p>Back to all three places, on day 3. Priya has found a tender lump in her right groin. In the model, the lymph node now holds <b>${fmt(app.sim.nodeCells)}</b> lymphocytes of the selected clones, and the number is doubling several times a day.</p>`,
          question: { prompt: 'What is the lump?', options: [
            { t: 'The lymph node, swollen with dividing lymphocytes', ok: true, fb: '"Swollen glands" near an infection are lymph nodes in which clones are expanding. They are a sign that the second kind of defense is under way, and where they are tells you where the infection is draining from.' },
            { t: 'The lymph node, infected and filling with pus', fb: 'Look at the node in the picture: what is it filling with? (A node can become infected, but that is not what usually makes it swell.)' },
            { t: 'A lymph vessel blocked by bacteria', fb: 'Look at the node in the picture: what is it filling with?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 7. two keys
    {
      id: 'help', title: 'Two keys', speed: 12,
      steps: [
        {
          view: 'handshake', viewOpts: { caption: 'Three cells in the lymph node, about a day after the scrape.' }, remount: true,
          timeline: TL(10), meters: null,
          title: 'How to read this picture',
          setup: () => { setSim(person((b) => b.infect('bacterium')), { kind: 'bacterium' }); skip(30); },
          enter: (c) => { const v = c.view(); v.setMarks(true); v.quiet = true; v.onTh = null; v.onB = null; },
          text: `<ol style="margin:0 0 6px 18px;padding:0"><li>The <b>dendritic cell</b> that came from the wound.</li><li>On its surface, <b>holders</b>, each showing a fragment of the bacterium's protein.</li><li>Five <b>helper T-lymphocytes</b>, each with a different receptor.</li><li>A <b>B-lymphocyte</b> whose receptor fits: it has caught a whole bacterium.</li><li>The B-lymphocyte's own holder, showing a fragment of what it caught.</li></ol>
                 <p>A T-lymphocyte's receptor cannot bind a whole bacterium, or anything floating free. It fits only a <b>fragment held in a holder</b> on another cell.</p>`,
          question: { prompt: 'The dendritic cell swallowed bacteria at the wound. What is it showing in its holders?', options: [
            { t: 'Fragments of what it swallowed', ok: true, fb: nameBox('The holder is an <b>MHC class II molecule</b>. Cells that show fragments of what they have swallowed this way are <b>antigen-presenting cells</b>: dendritic cells, macrophages and B-lymphocytes.') },
            { t: 'Whole bacteria', fb: 'Look at the size of what is in the holders: small pieces. The dendritic cell digested the bacteria first.' },
            { t: 'Its own receptors', fb: 'The red pieces are the same colour as the bacterium. Where did they come from?' },
          ] },
        },
        {
          view: 'handshake', title: 'Find the helper that fits',
          setup: () => { setSim(person((b) => b.infect('bacterium')), { kind: 'bacterium' }); skip(30); },
          enter: (c) => {
            const v = c.view(); v.setMarks(false); v.rebuild(); v.quiet = !data(c).found;
            v.onTh = (cl, f) => {
              if (f >= GOOD_FIT) { v.choose(cl); v.quiet = false; data(c).found = true; c.status(`<b>That one fits</b> (${pct(f)}). Its receptor matches the fragment in the holder. It has been selected, exactly as the B-lymphocyte was in scene 5.`, true); c.refresh(); }
              else c.status(`Fit ${pct(f)}: its receptor does not match the fragment. Try another.`, false);
            };
          },
          text: `<p>The dendritic cell shows its fragments to every helper T-lymphocyte that passes. <b>Click the helper T-lymphocyte whose receptor fits</b> the fragment (compare the cleft on its left side with the red fragment). Then let two days pass.</p>`,
          actions: [{ label: 'Let two days pass', cls: 'lym', disabled: (c) => !data(c).found || busy(c) || data(c).ran, run: (c) => experiment(c, { hours: 48, speed: 8, zero: false, after: (b, c) => c.recordValue('helpers', b.helpers) }) }],
          status: (c) => (data(c).ran ? `<b>${fmt(app.sim.helpers)}</b> helper T-lymphocytes with that receptor now: a clone.` : (data(c).found ? 'Selected. Now let two days pass.' : '')),
          waitFor: (c) => data(c).ran, waitHint: 'Find the helper that fits, then let two days pass',
        },
        {
          view: 'handshake', title: 'Can the B-lymphocyte go ahead alone?',
          setup: () => { setSim(person((b) => b.infect('bacterium')), { kind: 'bacterium' }); skip(78); cache.day3 = snapshot(); },
          enter: (c) => { const v = c.view(); v.rebuild(); v.quiet = false; v.onTh = null; },
          text: `<p>Day 3. The B-lymphocyte bound its antigen days ago, directly, with no holder needed. Run the next five days twice from this moment: once with the helper T-lymphocytes removed, and once with them.</p>`,
          question: predict(guess('Predict: with no helper T-lymphocytes, what will the B-lymphocyte do?', ['Divide and make antibody anyway: it has found its antigen', 'Nothing: it waits', 'Divide, but more slowly'], 'Run both and compare.')),
          actions: [
            { label: '1. Five days without helper T', cls: 'drug', disabled: (c) => afterPrediction(c) || busy(c) || data(c).without, run: (c) => { restore(cache.day3); app.sim.set('helperT', 0); c.view().rebuild(); experiment(c, { hours: 5 * DAY, speed: 12, zero: false, key: 'without', after: (b, c) => { c.recordValue('noHelp', { b: b.specific('bacterium', 'A', 'B').total, ab: b.antibodyTo('bacterium', 'A') }); } }); } },
            { label: '2. Five days with helper T', cls: 'lym', disabled: (c) => !data(c).without || busy(c) || data(c).withHelp, run: (c) => { keepGhost('without helper T', { keys: ['pathogen', 'lymph', 'ab'] }); const g = app.ghosts.slice(); restore(cache.day3); app.ghosts = g; c.view().rebuild(); experiment(c, { hours: 5 * DAY, speed: 12, zero: false, key: 'withHelp', after: (b, c) => { c.recordValue('withHelp', { b: b.specific('bacterium', 'A', 'B').total, ab: b.antibodyTo('bacterium', 'A') }); } }); } },
          ],
          status: (c) => { const v = c.record.values, d = data(c); return (d.without && v.noHelp ? `Without helper T, day 8: <b>${fmt(v.noHelp.b)}</b> B-lymphocytes that fit, antibody ${fmtAb(v.noHelp.ab)}.` : '') + (d.withHelp && v.withHelp ? `<br>With helper T, day 8: <b>${fmt(v.withHelp.b)}</b> B-lymphocytes, antibody <b>${fmtAb(v.withHelp.ab)}</b> units.` : ''); },
          waitFor: (c) => data(c).without && data(c).withHelp, waitHint: 'Predict, then run both',
        },
        {
          view: 'handshake', title: 'Why two keys?',
          text: `<p>The B-lymphocyte had found its antigen, yet it did nothing until a helper T-lymphocyte that recognised a fragment of the <b>same</b> antigen gave it the go-ahead. Then it divided, and its clone turned into <b>plasma cells</b>, which make antibody.</p>`,
          question: { prompt: 'Why might it be safer for the body to require two different cells to recognise the same invader before antibody is made?', options: [
            { t: 'If one cell makes a mistake (say, a B-lymphocyte that binds one of the body\'s own molecules), nothing happens unless a second cell agrees', ok: true, fb: nameBox('<b>Helper T-lymphocytes</b> (also called CD4 cells, after a protein on their surface) do not kill anything and make no antibody. They give the go-ahead. Antibody is a soluble copy of the B-lymphocyte\'s receptor, released by <b>plasma cells</b>.') },
            { t: 'It makes the response faster', fb: 'Waiting for a second cell makes it slower, as you saw. What does a second opinion protect against?' },
            { t: 'The helper T-lymphocytes make the antibody; the B-lymphocytes only carry it', fb: 'In your runs, antibody appeared only once the <i>B-lymphocyte</i> clone had expanded. What did the helpers contribute?' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 8. antibodies tag, phagocytes kill
    {
      id: 'antibody', title: 'Antibodies tag, phagocytes kill', speed: 1,
      steps: [
        {
          view: 'dish', viewOpts: { caption: 'A laboratory dish: no body, no cells except the ones you add.' }, remount: true,
          timeline: TL(0.3, ['pathogen']), meters: null,
          title: 'What does antibody do?',
          setup: () => { setSim(new Dish({ bacteria: 1e5 }), { kind: 'bacterium' }); cache.dish = {}; },
          text: `<p>Antibody molecules are Y-shaped proteins. The two tips of the Y are the binding sites, the same shape as the receptor of the B-lymphocyte that the plasma cell came from.</p><p>To see what antibody does by itself, take it out of the body: a dish of 100,000 bacteria in warm broth.</p>`,
          question: guess('Predict: antibody against this bacterium is added to the dish. Six hours later, the bacteria are…', ['Dead: antibody kills them', 'Coated with antibody, but alive and still dividing', 'Unchanged: antibody does nothing outside the body'], 'Test it: run all four dishes.'),
        },
        {
          view: 'dish', title: 'Four dishes',
          setup: () => { setSim(new Dish({ bacteria: 1e5 }), { kind: 'bacterium' }); },
          text: `<p>Run each dish for six hours. The phagocytes are neutrophils taken from blood: 500 of them, fewer than the number that could keep up with these bacteria unaided.</p>`,
          actions: [['plain', 'Bacteria alone', {}], ['ab', '+ antibody', { antibody: 500 }], ['phag', '+ phagocytes', { phagocytes: 500 }], ['both', '+ antibody + phagocytes', { antibody: 500, phagocytes: 500 }]].map(([key, label2, o]) => ({
            label: label2, cls: key === 'plain' ? 'germ' : key === 'phag' ? 'cell' : 'lym',
            disabled: (c) => busy(c) || (c.record.values.dish || {})[key] != null,
            run: (c) => {
              if (app.history.length > 2) keepGhost('');
              experiment(c, { sim: () => new Dish(Object.assign({ bacteria: 1e5 }, o)), hours: 6, speed: 1, key, after: (d, c) => { const v = Object.assign({}, c.record.values.dish || {}); v[key] = d.bacteria; c.recordValue('dish', v); } });
            },
          })),
          extra: (el, c) => {
            const v = c.record.values.dish || {}, cell = (k) => (v[k] == null ? '—' : `<b>${fmt(v[k])}</b>`);
            el.innerHTML = `<table class="ptable"><tr><th>After 6 hours (start: 100 thousand)</th><th>no phagocytes</th><th>with phagocytes</th></tr><tr><td><b>no antibody</b></td><td class="c">${cell('plain')}</td><td class="c">${cell('phag')}</td></tr><tr><td><b>with antibody</b></td><td class="c">${cell('ab')}</td><td class="c">${cell('both')}</td></tr></table>`;
          },
          waitFor: (c) => { const v = c.record.values.dish || {}; return ['plain', 'ab', 'phag', 'both'].every(k => v[k] != null); }, waitHint: 'Run all four dishes',
        },
        {
          view: 'dish', title: 'What antibody does',
          text: `<p>Look at your table. With antibody alone, the bacteria grew as if nothing had been added. With phagocytes alone, they still grew. Together, they were wiped out.</p>`,
          question: { prompt: 'So what does antibody do to a bacterium?', options: [
            { t: 'It coats it, which lets phagocytes grip and swallow it', ok: true, fb: 'Antibody is a <b>tag</b>, not a weapon. Phagocytes have receptors for the stem of the Y, so a coated bacterium is easy to seize. Your textbook calls this <b>opsonization</b>. (Antibody can also block a toxin or a virus from attaching to a cell, called neutralization: more on that in Part B.)' },
            { t: 'It kills it directly', fb: 'Look at the dish with antibody and no phagocytes: how many bacteria were there after six hours?' },
            { t: 'It stops it dividing', fb: 'Look at the dish with antibody and no phagocytes: did the number stop rising?' },
          ] },
        },
        {
          view: 'places', viewOpts: { kind: 'bacterium', caption: 'Priya\'s infection, from the scrape to the end.' }, remount: true,
          timeline: TL(12), meters: METERS.full, speed: 24,
          title: 'Back at the wound',
          setup: () => setSim(person(), { kind: 'bacterium' }),
          text: `<p>Now the whole of Priya's infection, with everything you have met: macrophages, inflammation, neutrophils, the lymph node, helper T-lymphocytes, B-lymphocytes, plasma cells and antibody.</p>`,
          actions: [{ label: 'Run Priya\'s infection (12 days)', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium'), hours: 12 * DAY, speed: 24, after: (b, c) => c.recordValue('first', { firstAb: markerDay('first antibody'), cleared: clearedDay(), peak: peakOf(app.history, 'pathogen'), abDay3: (app.history.find(r => r.t - app.zero >= 3 * DAY) || {}).ab, abDay12: b.antibodyTo('bacterium', 'A') }) }) }],
          status: (c) => { const v = c.record.values.first; return data(c).ran && v ? `First antibody: <b>day ${v.firstAb != null ? v.firstAb.toFixed(1) : '—'}</b> · bacteria cleared: <b>day ${v.cleared != null ? v.cleared.toFixed(1) : '—'}</b> · most bacteria at any time: ${fmt(v.peak)}` : ''; },
          question: { prompt: 'The plasma cells are in the lymph node in the groin. How does their antibody reach bacteria in the knee?', options: [
            { t: 'In the blood, leaving through the leaky vessel wall at the inflamed site', ok: true, fb: 'Antibody is released into the lymph and blood and goes everywhere. It gets out fastest where the vessel is leaky, which is exactly where the inflammation is. The two kinds of defense work together: inflammation delivers the antibody, and the antibody makes the phagocytes effective.' },
            { t: 'The plasma cells travel to the wound and release it there', fb: 'In the picture the antibody (the gold Y shapes) appears in the blood first. How does something in the blood get out at the knee?' },
            { t: 'It does not: the bacteria are carried to the lymph node', fb: 'Watch the site as the gold Y shapes appear there. How did they get in?' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run the infection',
        },
        {
          view: 'places', title: 'Put the whole response in order',
          text: `<p>Six events from Priya's infection. Click them in the order they happened. Use the labels on your timeline.</p>`,
          extra: (el, c) => orderTask(el, c, ORDER, ORDER_HINT, '<b>That is the whole first response.</b> Steps 1 and 2 took hours. Steps 3 to 5 took most of a week. Step 6 needed both.', 'orderTries'),
          waitFor: () => false, waitHint: 'Put the six events in order',
        },
      ],
    },
    // ------------------------------------------------------------- 9. the second time
    {
      id: 'memory', title: 'The second time', speed: 24,
      steps: [
        {
          view: 'node', viewOpts: { lib: 'B', caption: 'The lymph node at the end of the infection.' }, remount: true,
          timeline: TL(42), meters: METERS.full,
          title: 'After the fight',
          setup: () => { const f = firstInfection(); setSim(f.sim.copy(), { kind: 'bacterium' }); app.history = f.rows.slice(); app.zero = 0; app.lastSample = app.sim.t; },
          enter: (c) => { const v = c.view(); v.reveal(true); v.setSelf(false); },
          text: () => `<p>Day 12. The bacteria are gone, and the node holds <b>${fmt(firstInfection().sim.specific('bacterium', 'A', 'B').total)}</b> B-lymphocytes that fit this antigen. Keeping that many cells for every microbe ever met would be impossible. Let four more weeks pass and watch the big clones in the node.</p>`,
          actions: [{ label: 'Let four more weeks pass', cls: 'lym', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { hours: 30 * DAY, speed: 96, zero: false, after: (b, c) => { const sp = b.specific('bacterium', 'A'), start = firstInfection().rows[0].lymph; c.recordValue('memory', { peak: peakOf(app.history, 'lymph'), day42: sp.total, memory: sp.memory, start, ab42: b.antibodyTo('bacterium', 'A') }); } }) }],
          status: (c) => { const v = c.record.values.memory; return data(c).ran && v ? `Lymphocytes that fit this antigen: before the infection <b>${fmt(v.start)}</b> · at the peak <b>${fmt(v.peak)}</b> · day 42 <b>${fmt(v.day42)}</b>` : ''; },
          question: { prompt: 'Compare the library now with the library before the infection. What is different?', options: [
            { t: 'The clones that fit this bacterium are hundreds of times larger than they were', ok: true, fb: nameBox('Most of the clone has died, but the survivors are long-lived <b>memory cells</b>. The library has changed: for this one antigen, Priya now starts with thousands of cells instead of a handful. A little antibody remains in her blood as well.') },
            { t: 'Nothing: it has gone back to how it was', fb: 'Compare the numbers under the buttons: how many lymphocytes fit this antigen before the infection, and how many now?' },
            { t: 'Every lymphocyte now has the receptor for this bacterium', fb: 'Look at the node: most circles are unchanged. Only the clones that fit grew.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Let four weeks pass',
        },
        {
          view: 'places', viewOpts: { kind: 'bacterium', caption: 'Six months later: the same knee, the same bacterium.' }, remount: true,
          timeline: TL(10), meters: METERS.full,
          title: 'Six months later',
          setup: () => { setSim(sixMonthsOn(), { kind: 'bacterium' }); app.ghosts = [firstGhost()]; },
          text: `<p>Priya falls on the same trail, and the same strain gets into the same knee: 10,000 bacteria again. The grey curves are her first infection (bacteria dotted, antibody dashed).</p>`,
          question: predict({ prompt: 'Predict the second infection.', options: [
            { t: 'Cleared within a day or two, with little or no illness', ok: true, fb: 'Run it, and compare each curve with its grey twin.' },
            { t: 'The same as the first: about nine days', fb: 'That was the result in scene 4, where only macrophages and neutrophils were at work. What is different about Priya now?' },
            { t: 'No bacteria will get in this time', fb: 'The skin is scraped again, so they get in. The question is what happens next.' },
          ] }),
          actions: [{ label: 'Scrape the same knee (run 8 days)', cls: 'germ', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium'), hours: 8 * DAY, speed: 24, after: (b, c) => c.recordValue('second', { cleared: clearedDay(), peak: peakOf(app.history, 'pathogen'), abDay3: (app.history.find(r => r.t - app.zero >= 3 * DAY) || {}).ab, abDay8: b.antibodyTo('bacterium', 'A'), swelling: peakOf(app.history, 'swelling'), swelling1: peakOf(firstInfection().rows, 'swelling') }) }) }],
          status: (c) => { const v = c.record.values.second, f = c.record.values.first || { cleared: clearedOf(firstInfection().rows), peak: peakOf(firstInfection().rows, 'pathogen'), abDay3: firstInfection().rows[72].ab }; return data(c).ran && v ? `Cleared: <b>day ${v.cleared != null ? v.cleared.toFixed(1) : '—'}</b> (first time: day ${f.cleared.toFixed(1)}) · most bacteria: <b>${fmt(v.peak)}</b> (first time: ${fmt(f.peak)}) · antibody on day 3: <b>${fmtAb(v.abDay3)}</b> (first time: ${fmtAb(f.abDay3)})` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Predict, then run the second infection',
        },
        {
          view: 'places', title: 'Was she infected?',
          text: `<p>Look at the red curve for the second infection.</p>`,
          question: { prompt: 'People say Priya is now "immune" to this bacterium. Was she infected the second time?', options: [
            { t: 'Yes: the bacteria got in and multiplied for some hours, but the response cleared them before she felt ill', ok: true, fb: nameBox('The first response is the <b>primary response</b>; the faster, larger one from memory cells is the <b>secondary response</b>. Being immune does not mean the microbe cannot get in. It means the response is already days ahead.') },
            { t: 'No: memory cells keep the bacteria out', fb: 'Look at the start of the red curve: the bacteria were there, and their number rose. What stopped them so soon?' },
            { t: 'No: they were killed the moment they arrived', fb: 'Look at the first hours of the red curve: it rises before it falls.' },
          ] },
        },
        {
          view: 'places', viewOpts: { kind: 'bacterium', caption: 'The same person, a different strain.' }, title: 'A different strain', timeline: TL(14),
          setup: () => { setSim(sixMonthsOn(), { kind: 'bacterium', strain: 'B' }); app.ghosts = [firstGhost()]; },
          text: `<p>Same Priya, same six months later, but this time a <b>different strain</b> of the bacterium gets in, one with a differently shaped antigen.</p>`,
          question: predict({ prompt: 'Predict this infection.', options: [
            { t: 'Like her first infection: more than a week', ok: true, fb: 'Run it and compare with the grey curve.' },
            { t: 'Like her second: cleared in a day or two', fb: 'Her memory cells were selected by the first strain\'s antigen. Will their receptors fit this one? (Think back to swapping the strain in scene 5.)' },
            { t: 'In between: partly protected', fb: 'A receptor either fits an antigen or it does not. In scene 5, did the cells that fit one strain fit the other?' },
          ] }),
          actions: [{ label: 'Let in the different strain (run 14 days)', cls: 'germ', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium', { strain: 'B' }), hours: 14 * DAY, speed: 42, after: (b, c) => c.recordValue('otherStrain', { cleared: clearedDay(), peak: peakOf(app.history, 'pathogen') }) }) }],
          status: (c) => { const v = c.record.values.otherStrain; return data(c).ran && v ? `Cleared: <b>${v.cleared != null ? 'day ' + v.cleared.toFixed(1) : 'not within 14 days'}</b> · most bacteria: <b>${fmt(v.peak)}</b>. A first response all over again.` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Predict, then run it',
        },
        {
          view: 'places', title: 'Two kinds of defense', timeline: TL(14),
          text: `<p>Fill in the table from your own runs: scene 4 for the first column, scenes 6 to 9 for the second.</p>`,
          extra: (el, c) => selectTable(el, c, {
            key: 'innateAdaptive', head: ['', 'Macrophages, neutrophils, inflammation', 'Lymphocytes and antibody'],
            rows: [
              { label: 'Starts working', cells: [{ options: ['within hours', 'after several days'], answer: 'within hours' }, { options: ['within hours', 'after several days'], answer: 'after several days' }] },
              { label: 'Recognises', cells: [{ options: ['one antigen exactly', 'features shared by many microbes'], answer: 'features shared by many microbes' }, { options: ['one antigen exactly', 'features shared by many microbes'], answer: 'one antigen exactly' }] },
              { label: 'Second exposure', cells: [{ options: ['faster and larger', 'the same as the first'], answer: 'the same as the first' }, { options: ['faster and larger', 'the same as the first'], answer: 'faster and larger' }] },
            ],
            done: '<b>Innate immunity</b> (left) and <b>adaptive immunity</b> (right). Adaptive immunity is specific and has memory, and pays for both with a slow start. Innate immunity holds the line while it gets ready.',
          }),
          waitFor: () => false, waitHint: 'Complete the table',
        },
        {
          view: 'places', title: 'End of Part A',
          text: `<div class="part-break"><b>End of Part A.</b> This is a good place for a short break. Part B (scenes 10 to 13) asks what happens when the invader is not between the cells but <b>inside</b> them.</div>
                 ${caseNote('Back to Priya', '<p>You can now answer the three questions about Priya on your handout. Use your own numbers from scenes 3, 6, 8 and 9.</p>')}`,
        },
      ],
    },
  ];
  function clearedOf(rows) { const i = rows.findIndex((r, j) => j > 0 && r.pathogen <= 0); return i < 0 ? NaN : (rows[i].t - rows[0].t) / DAY; }

  IM.L = { ORDER, ALL, TL, data, isPerson, bar, predict, afterPrediction, guess, nameBox, caseNote, METERS, track, peakOf, experiment, busy, clearedDay, markerDay, orderTask, selectTable, labTable, cache, firstInfection, sixMonthsOn, clearedOf, PRIYA, PRIYA_Q, ELENA, HALL, ADEYEMI };
  IM.PART_A = PART_A;
})();
