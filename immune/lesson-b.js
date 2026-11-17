/* ImmuneSim lesson, Part B: inside the cells (a virus), scenes 10–13; the results and completion
 * code; and the start of the app. See docs/IMMUNE_MODULE.md. */
(function () {
  'use strict';
  const { app, $, htmlEl, fmt, fmtAb, pct, person, setSim, snapshot, restore, startRun, skip, mark, keepGhost, mountView } = IM;
  const { Immune, Patch, DAY } = ImmuneSim;
  const { ALL, TL, data, bar, predict, afterPrediction, guess, nameBox, caseNote, METERS, track, peakOf, experiment, busy, clearedDay, markerDay, selectTable, labTable, cache, firstInfection, clearedOf, PRIYA, PRIYA_Q, ELENA, HALL, ADEYEMI } = IM.L;

  const VT = ['pathogen', 'infected', 'lymph', 'ab'];
  const VTL = (window) => ({ window, traces: VT, lead: 0 });
  const rowAt = (days) => app.history.find(r => r.t - app.zero >= days * DAY - 1e-6) || app.history[app.history.length - 1];

  // Elena's infection with no vaccine, for comparison curves.
  function elenaRows() { if (!cache.elena) cache.elena = track(person((b) => b.infect('virus')), 14 * DAY, 'virus', 'A'); return cache.elena; }
  const elenaGhost = () => ({ label: 'Elena (no vaccine)', zero: elenaRows()[0].t, rows: elenaRows(), keys: ['infected'], color: '#b98a4a' });
  // Priya two weeks after her vaccine.
  function vaccinated14() { if (!cache.vax) { const b = person((x) => x.vaccinate('virus')); b.advance(14 * DAY); b.takeEvents(); cache.vax = b; } return cache.vax.copy(); }

  // ---------------------------------------------------------------- scene 12: take one piece away
  const KO = [
    ['neutrophils', 'Neutrophils', (b) => b.set('neutrophils', 0.05)],
    ['bcells', 'B-lymphocytes (no antibody)', (b) => b.set('bcells', 0)],
    ['tcells', 'Cytotoxic T', (b) => b.set('tcells', 0)],
    ['helperT', 'Helper T', (b) => b.set('helperT', 0)],
  ];
  const KINDS = [['bacterium', 'Bacteria in a wound'], ['virus', 'Virus in the airway']];
  function healthyRows(kind) { const k = 'healthy_' + kind; if (!cache[k]) cache[k] = track(person((b) => b.infect(kind)), 21 * DAY, kind, 'A', 2); return cache[k]; }
  function showKind(kind) {
    mountView('places', { kind, caption: kind === 'virus' ? 'A virus in the airway (21 days).' : 'Bacteria in a wound (21 days).' });
    app.timeline = kind === 'virus' ? VTL(21) : TL(21);
    app.meters = kind === 'virus' ? METERS.virus : METERS.full;
    app.sampleDt = 1;
  }
  function knockTable(el, c) {
    el.className = 'extra';
    const store = (c.record.tables = c.record.tables || {});
    const st = (store.knock = store.knock || {});
    const d = data(c);
    const render = () => {
      el.innerHTML = '';
      const tbl = htmlEl('table', { class: 'ptable knock' });
      tbl.appendChild(htmlEl('tr', {}, '<th>Take away</th><th>Bacteria (wound)</th><th>Virus (airway)</th><th></th>'));
      const h = htmlEl('tr', {}, `<td><b>Nothing</b></td><td>cleared, day ${clearedOf(healthyRows('bacterium')).toFixed(0)}</td><td>cleared, day ${clearedOf(healthyRows('virus')).toFixed(0)}</td><td></td>`);
      tbl.appendChild(h);
      for (const [key, name] of KO) {
        const tr = htmlEl('tr', {}, `<td><b>${name}</b></td>`);
        let ready = true;
        for (const [kind] of KINDS) {
          const k = `${key}.${kind}`, td = htmlEl('td', {});
          const sel = htmlEl('select', { 'aria-label': `Prediction: without ${name}, ${kind}` });
          for (const [v, t] of [['', 'predict…'], ['cleared', 'cleared'], ['not', 'not cleared']]) sel.appendChild(htmlEl('option', { value: v }, t));
          if (st[k + ':pred']) sel.value = st[k + ':pred']; else ready = false;
          if (st[k] != null || d.running) sel.disabled = true;
          sel.addEventListener('change', () => { st[k + ':pred'] = sel.value; render(); });
          td.appendChild(sel);
          if (st[k] != null) {
            const right = (st[k] === 'not') === (st[k + ':pred'] === 'not');
            td.appendChild(htmlEl('div', { class: right ? 'ok' : 'no' }, `${st[k] === 'not' ? 'not cleared' : 'cleared, day ' + st[k]} ${right ? '✓' : '✗'}`));
          }
          tr.appendChild(td);
        }
        const td = htmlEl('td', { class: 'c' });
        const done = KINDS.every(([kind]) => st[`${key}.${kind}`] != null);
        const btn = htmlEl('button', { type: 'button', 'data-ko': key }, done ? 'Done' : 'Run');
        btn.disabled = done || !ready || !!d.running;
        btn.addEventListener('click', () => runRow(key));
        td.appendChild(btn); tr.appendChild(td); tbl.appendChild(tr);
      }
      el.appendChild(tbl);
      const all = KO.every(([key]) => KINDS.every(([kind]) => st[`${key}.${kind}`] != null));
      if (all) { el.appendChild(htmlEl('div', { class: 'feedback good' }, 'Look down each column, then along the last row. ✓ marks the predictions you got right; a ✗ is worth talking about before you go on.')); c.complete(); }
      else el.appendChild(htmlEl('div', { style: 'font-size:13px;color:var(--muted);margin-top:4px' }, 'For each row, choose both predictions, then press Run. The grey curve is the healthy person.'));
    };
    function runRow(key) {
      const apply = KO.find(k => k[0] === key)[2];
      d.running = true; render();
      const one = (i) => {
        if (i >= KINDS.length) { d.running = false; c.recordValue('knock', Object.assign({}, st)); render(); return; }
        const kind = KINDS[i][0];
        showKind(kind);
        setSim(person((b) => { apply(b); }), { kind });
        const rows = healthyRows(kind);
        app.ghosts = [{ label: 'healthy', zero: rows[0].t, rows, keys: [kind === 'virus' ? 'infected' : 'pathogen'] }];
        app.sim.infect(kind);
        startRun({ duration: 21 * DAY, speed: 120, onDone: () => { const cl = clearedDay(); st[`${key}.${kind}`] = cl == null ? 'not' : cl.toFixed(0); one(i + 1); } });
      };
      one(0);
    }
    render();
  }

  // =========================================================================
  // Part B
  // =========================================================================
  const PART_B = [
    // ------------------------------------------------------------- 10. hiding inside
    {
      id: 'inside', title: 'Hiding inside', speed: 12,
      steps: [
        {
          view: 'places', viewOpts: { kind: 'virus', caption: 'The site is now the lining of Elena\'s airway, seen from above.', marksAt: [[1, 60, 130], [2, 60, 290], [3, 60, 470]] }, remount: true,
          timeline: VTL(10), meters: METERS.virus,
          title: 'A new patient, a new problem',
          setup: () => setSim(person(), { kind: 'virus' }),
          enter: (c) => c.view().setMarks(true),
          text: `<div class="case"><div class="case-h">Elena's case</div>${ELENA}</div>
                 <ol style="margin:0 0 6px 18px;padding:0"><li>The <b>air</b> in the airway, where free virus particles drift.</li><li>The <b>lining of the airway</b>: a sheet of cells, drawn as squares.</li><li>The <b>blood vessel</b> beneath.</li></ol>
                 <p>A virus cannot multiply by itself. It gets into a cell and turns the cell into a factory for more virus. The timeline has a new orange curve: <b>infected cells</b>.</p>`,
          actions: [{ label: 'Elena breathes in the virus (run 3 days)', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('virus'), hours: 3 * DAY, speed: 12, after: (b, c) => { c.view().setMarks(false); c.recordValue('flu3', { virus: b.site.virus, infected: b.infected }); } }) }],
          question: { prompt: 'Priya\'s bacteria lived in the fluid between her cells. Where is this virus being made?', options: [
            { t: 'Inside Elena\'s own cells', ok: true, fb: 'Free virus in the air and fluid is only the virus in transit. The factories are inside her cells, behind their membranes.' },
            { t: 'In the air of the airway', fb: 'A virus particle outside a cell can do nothing: it has no machinery to copy itself. Where do the new particles come from in the picture?' },
            { t: 'In the blood', fb: 'Look at the picture: where do the new virus particles appear from?' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run three days',
        },
        {
          view: 'places', title: 'Try antibody',
          setup: () => { setSim(person((b) => { b.set('adaptive', 0); b.infect('virus'); }), { kind: 'virus' }); skip(3 * DAY); cache.fluDay3 = snapshot(); },
          text: () => `<p>Day 3: <b>${fmt(app.sim.site.virus)}</b> free virus particles and <b>${fmt(app.sim.infected)}</b> infected cells. Antibody worked well against Priya's bacteria, so try it here: a large dose of ready-made antibody that fits this virus. (For this experiment Elena's own lymphocytes are switched off in the model, so you see the antibody's effect alone.)</p>`,
          question: predict({ prompt: 'Predict what the antibody will do over the next two days.', options: [
            { t: 'Free virus falls, but the infected cells stay infected', ok: true, fb: 'Run it, and watch the red and orange curves separately.' },
            { t: 'The infection is cleared: antibody destroys the infected cells too', fb: 'Antibody is a large protein in the fluid outside cells. Can it get through a cell membrane to the virus inside?' },
            { t: 'Nothing: antibody works only on bacteria', fb: 'Antibody can bind any antigen its tips fit, including proteins on the surface of a virus particle. The question is which virus it can reach.' },
          ] }),
          actions: [{ label: 'Give antibody and run two days', cls: 'lym', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => { const before = { virus: app.sim.site.virus, infected: app.sim.infected }; mark('antibody given'); experiment(c, { before: (b) => b.giveAntibody('virus', { amount: 2000 }), hours: 2 * DAY, speed: 8, zero: false, after: (b, c) => c.recordValue('abLate', { before, virus: b.site.virus, infected: b.infected }) }); } }],
          status: (c) => { const v = c.record.values.abLate; return data(c).ran && v ? `Free virus: ${fmt(v.before.virus)} → <b>${fmt(v.virus)}</b> · infected cells: ${fmt(v.before.infected)} → <b>${fmt(v.infected)}</b>` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Predict, then give the antibody',
        },
        {
          view: 'places', title: 'Antibody first',
          setup: () => setSim(person((b) => b.set('adaptive', 0)), { kind: 'virus' }),
          text: `<p>Now the other way round: a fresh, healthy airway, with the same antibody given <b>before</b> the virus arrives.</p>`,
          actions: [{ label: 'Give antibody, then the virus (run 3 days)', cls: 'lym', disabled: (c) => busy(c) || data(c).ran, run: (c) => { mark('antibody given'); experiment(c, { before: (b) => { b.giveAntibody('virus', { amount: 2000 }); b.infect('virus'); }, hours: 3 * DAY, speed: 12, after: (b, c) => c.recordValue('abFirst', { peak: peakOf(app.history, 'infected') }) }); } }],
          status: (c) => { const v = c.record.values.abFirst; return data(c).ran && v ? `Most cells infected at any time: <b>${fmt(v.peak)}</b>.` : ''; },
          question: { prompt: 'The same antibody failed on day 3 but worked when it was there first. Why?', options: [
            { t: 'It coated the virus particles before any had entered a cell', ok: true, fb: 'A coated virus particle cannot attach to a cell (<b>neutralization</b>). Antibody reaches whatever is <i>outside</i> cells. Remember this result: it is how a vaccine protects.' },
            { t: 'There was more antibody the second time', fb: 'The dose was the same. What was different about where the virus was?' },
            { t: 'The virus was weaker at the start', fb: 'It was the same virus. What was different about where it was when the antibody met it?' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run the experiment',
        },
        {
          view: 'places', title: 'What would it take?',
          text: `<p>Elena had no antibody ready, and by the time she could make any, the virus was inside thousands of her cells.</p>`,
          question: { prompt: 'What will it take to clear a virus that is already inside cells?', options: [
            { t: 'Finding the infected cells and destroying them, virus and all', ok: true, fb: 'It sounds drastic: the body kills its own cells. It works because one dead cell stops thousands of new virus particles, and the lining grows back. But from outside, an infected cell looks like any other. How can it be found?' },
            { t: 'Much more antibody', fb: 'You gave a very large dose on day 3 and the infected cells were untouched. Antibody cannot cross a cell membrane.' },
            { t: 'Waiting for the virus to come out', fb: 'The virus that comes out infects the next cells, and (in this model as in the airway) it also passes straight from cell to neighbouring cell. Something has to deal with the factories.' },
          ] },
        },
      ],
    },
    // ------------------------------------------------------------- 11. every cell shows what it is making
    {
      id: 'windows', title: 'Every cell shows what it is making', speed: 24,
      steps: [
        {
          view: 'windows', viewOpts: { caption: 'Twelve cells from the lining of the airway, each with MHC class I molecules on its surface. Two of the cells are infected.' }, remount: true,
          timeline: { window: 14, traces: [], note: 'The timeline returns when you run Elena\'s infection.' }, meters: null,
          title: 'How to read this picture',
          setup: () => { setSim(person(), { kind: 'virus' }); cache.patch = new Patch({ n: 12, infected: [[3, 2], [8, 0.3]] }); },
          enter: (c) => { const v = c.view(); v.setPatch(cache.patch); v.setMarks(true); v.onCell = null; },
          text: `<ol style="margin:0 0 6px 18px;padding:0"><li>One <b>cell</b>, with its nucleus.</li><li>On its surface, <b>MHC class I molecules</b>. These are <b>not</b> the MHC class II molecules of scene 7. Class II is found only on antigen-presenting cells, and shows fragments of what the cell has <i>swallowed</i>. <b>Class I is on nearly every cell of the body</b>, and shows fragments of the proteins the cell is <i>making inside itself</i>: every cell with a nucleus constantly chops up samples of them and displays the pieces, like goods in a shop window.</li><li>The key: grey shapes are fragments of the cell's own proteins.</li></ol>`,
          question: { prompt: 'A cell was infected an hour ago and has started making viral proteins. What will appear in its MHC class I molecules?', options: [
            { t: 'Fragments of viral protein, alongside fragments of its own', ok: true, fb: nameBox('Nearly every cell in the body has <b>MHC class I molecules</b> (only antigen-presenting cells also have class II). They show the outside world what the cell is making <i>inside</i>, so an infected cell cannot help giving itself away.') },
            { t: 'Nothing different: the virus is hidden inside', fb: 'The cell samples <i>whatever</i> proteins it is making. If it is making viral proteins, what will be among the samples?' },
            { t: 'Whole virus particles', fb: 'MHC molecules carry short fragments of protein, not whole particles. Which proteins is this cell now making?' },
          ] },
        },
        {
          view: 'windows', title: 'You are the cytotoxic T-lymphocyte',
          setup: () => { cache.patch = new Patch({ n: 12, infected: [[3, 2], [8, 0.3]] }); },
          enter: (c) => {
            const v = c.view(); v.setPatch(cache.patch); v.setMarks(false);
            v.onCell = (i) => {
              const p = cache.patch, shown = p.shows(i), was = p.kill(i);
              if (!was) return;
              data(c).msg = (was === 'healthy' ? '<b>That cell was healthy.</b> Its MHC class I molecules showed only its own proteins. A killer that does not read them destroys healthy tissue.' : shown ? '<b>Infected cell destroyed</b> before it could release more virus.' : '<b>That cell was infected</b>, but its MHC class I molecules did not show it yet. You could not have known: a lucky hit.');
              c.recordValue('byHand', { hours: p.t, healthyKilled: p.killedHealthy, healthyLeft: p.healthy, lost: p.lost });
            };
          },
          text: `<p>Two of these twelve cells are infected. An infected cell starts to release virus about 6 hours after it was infected, and its neighbours are infected soon after.</p>
                 <p><b>Read each cell's MHC class I molecules. Click a cell to kill it.</b> Then let time pass and read them again. Stop the infection while losing as few cells as you can.</p>`,
          actions: [
            { label: 'Let 2 hours pass', cls: 'germ', run: (c) => { cache.patch.advance(2); c.recordValue('byHand', { hours: cache.patch.t, healthyKilled: cache.patch.killedHealthy, healthyLeft: cache.patch.healthy, lost: cache.patch.lost }); } },
            { label: 'Start again', run: (c) => { cache.patch = new Patch({ n: 12, infected: [[3, 2], [8, 0.3]] }); c.view().setPatch(cache.patch); data(c).msg = ''; } },
          ],
          status: (c) => {
            const p = cache.patch, msg = data(c).msg || ''; if (!p) return msg;
            const showing = p.cells.some((x, i) => p.shows(i));
            const next = p.infected === 0 && p.t >= 2 ? '<b>The infection is over.</b>' : showing ? '<span class="warn" style="display:block"><b>Next:</b> a cell is showing a viral fragment (red triangle). Click that cell to kill it.</span>' : '<span class="warn" style="display:block"><b>Next:</b> no cell is showing a viral fragment right now, but one may be infected too recently to show it. Press <b>Let 2 hours pass</b> and read the cells again.</span>';
            return (msg ? msg + ' ' : '') + next;
          },
          waitFor: () => cache.patch && cache.patch.infected === 0 && cache.patch.t >= 2, waitHint: 'Kill the infected cells; let time pass to check for more',
        },
        {
          view: 'windows', title: 'What did you destroy?',
          text: () => `<p>You stopped the infection with <b>${cache.patch ? cache.patch.healthy : '—'}</b> of 12 cells still healthy${cache.patch && cache.patch.killedHealthy ? ` (and ${cache.patch.killedHealthy} healthy cell${cache.patch.killedHealthy > 1 ? 's' : ''} killed by mistake)` : ''}.</p>`,
          question: { prompt: 'What exactly did you destroy?', options: [
            { t: 'Elena\'s own cells: the ones whose MHC class I molecules showed a viral fragment', ok: true, fb: nameBox('That is the job of a <b>cytotoxic T-lymphocyte</b> (a CD8 cell). Its receptor fits one viral fragment held in an MHC class I molecule. When it finds that, it makes the cell destroy itself. It never touches free virus.') },
            { t: 'Virus particles', fb: 'You clicked on cells. The free virus particles above them were never your target.' },
            { t: 'Any cell near the infection', fb: 'If you killed a cell without the red fragment in an MHC class I molecule, the sim told you it was healthy. What marked the cells that needed to die?' },
          ] },
        },
        {
          view: 'places', viewOpts: { kind: 'virus', caption: 'Elena\'s infection, with her whole immune system.' }, remount: true,
          timeline: VTL(14), meters: METERS.virus,
          title: 'Where do they come from?',
          setup: () => setSim(person(), { kind: 'virus' }),
          text: () => `<p>Elena has never met this virus. Among her millions of cytotoxic T-lymphocytes, <b>${fmt(app.sim.specific('virus', 'A', 'Tc').total)}</b> have a receptor that fits its fragment.</p>`,
          question: predict({ prompt: 'Predict how she gets enough of them to clear thousands of infected cells.', options: [
            { t: 'As in scenes 5 to 7: a dendritic cell shows the fragment in the lymph node, the few that fit are selected, helper T-lymphocytes give the go-ahead, and the clone divides for about a week', ok: true, fb: 'The same rules, a different lymphocyte. Run her infection and watch for the day they arrive.' },
            { t: 'The red bone marrow makes more of that kind on demand', fb: 'The bone marrow cannot know which receptor is needed. How did Priya get enough B-lymphocytes of the right kind?' },
            { t: 'The few she has are enough', fb: 'A handful of cells against thousands of infected ones, with more being infected every hour. How did Priya get from a handful of B-lymphocytes to tens of thousands?' },
          ] }),
          actions: [{ label: 'Run Elena\'s infection (14 days)', cls: 'germ', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('virus'), hours: 14 * DAY, speed: 24, after: (b, c) => { cache.elena = app.history.slice(); c.recordValue('elena', { ctlDay: markerDay('cytotoxic T cells arrive'), firstAb: markerDay('first antibody'), cleared: clearedDay(), peak: peakOf(app.history, 'infected'), fever: peakOf(app.history, 'fever') }); } }) }],
          status: (c) => { const v = c.record.values.elena; return data(c).ran && v ? `Cytotoxic T-lymphocytes reach the airway in numbers: <b>day ${v.ctlDay != null ? v.ctlDay.toFixed(1) : '—'}</b> · virus cleared: <b>day ${v.cleared != null ? v.cleared.toFixed(1) : '—'}</b> · most cells infected: ${fmt(v.peak)}` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Predict, then run the infection',
        },
        {
          view: 'places', title: 'MHC class I and class II',
          text: `<p>You have now met both classes of MHC molecule. Fill in the table (scene 7 for one column, this scene for the other).</p>`,
          extra: (el, c) => selectTable(el, c, {
            key: 'mhc', head: ['', 'MHC class I', 'MHC class II'],
            rows: [
              { label: 'Found on', cells: [{ options: ['antigen-presenting cells only', 'nearly every cell of the body'], answer: 'nearly every cell of the body' }, { options: ['antigen-presenting cells only', 'nearly every cell of the body'], answer: 'antigen-presenting cells only' }] },
              { label: 'Shows fragments of', cells: [{ options: ['what the cell swallowed from outside', 'what the cell is making inside'], answer: 'what the cell is making inside' }, { options: ['what the cell swallowed from outside', 'what the cell is making inside'], answer: 'what the cell swallowed from outside' }] },
              { label: 'Read by', cells: [{ options: ['helper T-lymphocytes', 'cytotoxic T-lymphocytes'], answer: 'cytotoxic T-lymphocytes' }, { options: ['helper T-lymphocytes', 'cytotoxic T-lymphocytes'], answer: 'helper T-lymphocytes' }] },
              { label: 'What follows', cells: [{ options: ['the go-ahead for other lymphocytes', 'the cell is killed'], answer: 'the cell is killed' }, { options: ['the go-ahead for other lymphocytes', 'the cell is killed'], answer: 'the go-ahead for other lymphocytes' }] },
            ],
            done: 'Class I says "this is what I am making": if it is viral, kill me. Class II says "this is what I found": if you recognise it, help. B-lymphocytes need no MHC molecule to recognise antigen: their receptors, and antibody, bind whole antigen directly.',
          }),
          waitFor: () => false, waitHint: 'Complete the table',
        },
      ],
    },
    // ------------------------------------------------------------- 12. take one piece away
    {
      id: 'knock', title: 'Take one piece away', speed: 120,
      steps: [
        {
          view: 'places', viewOpts: { kind: 'bacterium', caption: 'Bacteria in a wound (21 days).' }, remount: true,
          timeline: TL(21), meters: METERS.full,
          title: 'What is each cell for?',
          setup: () => { setSim(person(), { kind: 'bacterium' }); app.ghosts = []; },
          text: `<p>The surest way to find out what a part does is to remove it. For each row, <b>predict</b> whether each infection will be cleared within three weeks, then run both.</p>`,
          extra: (el, c) => knockTable(el, c),
          waitFor: () => false, waitHint: 'Predict and run all four rows',
        },
        {
          view: 'places', title: 'The hub',
          text: `<p>Look at your table.</p>`,
          question: { prompt: 'Which single loss left <b>both</b> infections uncleared, and why?', options: [
            { t: 'Helper T-lymphocytes: both B-lymphocytes and cytotoxic T-lymphocytes need their go-ahead', ok: true, fb: 'The helper T-lymphocyte kills nothing and makes no antibody, yet without it neither arm of adaptive immunity gets going.' },
            { t: 'Neutrophils: they are the most numerous white blood cells', fb: 'Check the neutrophil row: was the virus cleared without them?' },
            { t: 'B-lymphocytes: antibody is needed against everything', fb: 'Check the B-lymphocyte row: was the virus cleared without antibody?' },
          ] },
        },
        {
          view: 'places', title: 'Who needs whom?',
          text: `<p>Summarise your table.</p>`,
          extra: (el, c) => selectTable(el, c, {
            key: 'wiring', head: ['', 'Needs the go-ahead from', 'Deals with pathogens that are'],
            rows: [
              { label: 'Neutrophil', cells: [{ options: ['helper T-lymphocytes', 'no lymphocyte: the alarm is enough'], answer: 'no lymphocyte: the alarm is enough' }, { options: ['inside cells', 'outside cells'], answer: 'outside cells' }] },
              { label: 'B-lymphocyte (antibody)', cells: [{ options: ['helper T-lymphocytes', 'no lymphocyte: the alarm is enough'], answer: 'helper T-lymphocytes' }, { options: ['inside cells', 'outside cells'], answer: 'outside cells' }] },
              { label: 'Cytotoxic T-lymphocyte', cells: [{ options: ['helper T-lymphocytes', 'no lymphocyte: the alarm is enough'], answer: 'helper T-lymphocytes' }, { options: ['inside cells', 'outside cells'], answer: 'inside cells' }] },
            ],
            done: 'Where the pathogen is decides the weapon: outside cells, antibody and phagocytes; inside cells, cytotoxic T-lymphocytes. Both adaptive weapons wait for the helper T-lymphocyte.',
          }),
          waitFor: () => false, waitHint: 'Complete the table',
        },
        {
          view: 'places', viewOpts: { kind: 'bacterium', caption: 'Mr. Hall\'s wound.' }, remount: true,
          timeline: TL(5, ['pathogen', 'phago']), meters: METERS.innate, speed: 12,
          title: 'A patient: Mr. Hall',
          setup: () => { setSim(person((b) => b.set('neutrophils', 0.075)), { kind: 'bacterium' }); const rows = track(person((b) => b.infect('bacterium')), 5 * DAY, 'bacterium', 'A'); cache.hallHealthy = rows; cache.hallLab = app.sim.labPanel().slice(0, 1); app.ghosts = [{ label: 'a healthy person', zero: rows[0].t, rows, keys: ['pathogen', 'phago'] }]; },
          text: () => `<div class="case"><div class="case-h">Mr. Hall</div>${HALL}</div>${labTable(cache.hallLab, 'Complete blood count (part)')}
                 <p>Chemotherapy kills dividing cells, and that includes the cells in the bone marrow that make neutrophils. Run five days of his wound infection. The grey curves are a healthy person.</p>`,
          actions: [{ label: 'Run Mr. Hall\'s wound (5 days)', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('bacterium'), hours: 5 * DAY, speed: 15, after: (b, c) => c.recordValue('hall', { bacteria: b.site.bacteria, healthy: cache.hallHealthy[cache.hallHealthy.length - 1].pathogen, swelling: peakOf(app.history, 'swelling'), swellingHealthy: peakOf(cache.hallHealthy, 'swelling'), neut: peakOf(app.history, 'phago') }) }) }],
          status: (c) => { const v = c.record.values.hall; return data(c).ran && v ? `Day 5: <b>${fmt(v.bacteria)}</b> bacteria (healthy person: ${fmt(v.healthy)}) · most swelling: <b>${pct(v.swelling)}</b> (healthy: ${pct(v.swellingHealthy)})` : ''; },
          question: { prompt: 'Mr. Hall\'s wound shows little redness or swelling and no pus. Is that reassuring?', options: [
            { t: 'No: those signs are made by neutrophils and the vessel response, and he has almost no neutrophils. The bacteria are unopposed', ok: true, fb: 'In a patient with very few neutrophils, a fever may be the only sign of a serious infection, which is why it is treated as an emergency. The signs of inflammation measure the <i>response</i>, not the bacteria.' },
            { t: 'Yes: a wound without redness or pus is not infected', fb: 'Compare his bacteria with the healthy person\'s on the timeline. Then think back to scene 3: what produced the redness, the swelling and the pus?' },
            { t: 'Yes: the chemotherapy is killing the bacteria too', fb: 'Look at the red curve: the bacteria are doing better than in a healthy person. What normally produces redness, swelling and pus?' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run his infection',
        },
        {
          view: 'places', viewOpts: { kind: 'virus', caption: 'Ms. Adeyemi\'s airway, lymph node and blood: the same influenza virus as Elena.' }, remount: true,
          timeline: VTL(21), meters: METERS.virus, speed: 48,
          title: 'A patient: Ms. Adeyemi',
          setup: () => { setSim(person((b) => b.set('helperT', 0.15)), { kind: 'virus' }); const rows = healthyRows('virus'); cache.adeyemiLab = app.sim.labPanel().slice(1, 2); app.ghosts = [{ label: 'a healthy person', zero: rows[0].t, rows, keys: ['infected'] }]; },
          text: () => `<div class="case"><div class="case-h">Ms. Adeyemi</div>${ADEYEMI}</div>${labTable(cache.adeyemiLab, 'Lymphocyte subsets (part)')}
                 <p>HIV infects helper T-lymphocytes and, over years, destroys them. Her count is far below the normal range. Run her influenza from the day she caught it and follow the three weeks since. The grey curve is a healthy person with the same virus.</p>`,
          actions: [{ label: 'Run her influenza (21 days)', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('virus'), hours: 21 * DAY, speed: 60, after: (b, c) => c.recordValue('adeyemi', { cleared: clearedDay(), infected: b.infected, ab: b.antibodyTo('virus', 'A'), ctl: b.site.ctl }) }) }],
          status: (c) => { const v = c.record.values.adeyemi; return data(c).ran && v ? `Day 21: <b>${v.cleared != null ? 'cleared on day ' + v.cleared.toFixed(0) : 'not cleared'}</b>, ${fmt(v.infected)} cells still infected · antibody ${fmtAb(v.ab)} · cytotoxic T-lymphocytes at the site: ${fmt(v.ctl)}` : ''; },
          question: { prompt: 'Why is Ms. Adeyemi still ill with an infection that Elena cleared in about ten days?', options: [
            { t: 'With so few helper T-lymphocytes, neither her antibody nor her cytotoxic T-lymphocytes get the go-ahead, so the virus is not cleared', ok: true, fb: 'The danger of HIV is not direct damage but the loss of the one cell that both arms of adaptive immunity depend on. A CD4 count below 200 per µL defines <b>AIDS</b>. The same loss explains the <b>opportunistic infections</b> of AIDS: microbes that healthy people meet every day and never notice, such as the fungus that causes <i>Pneumocystis</i> pneumonia, cause serious disease. Treatment that stops HIV multiplying lets the count recover.' },
            { t: 'HIV itself is damaging her airway', fb: 'HIV infects helper T-lymphocytes, not the cells lining the airway. Those are being lost to influenza. Look at her antibody and her cytotoxic T-lymphocytes on day 21: what is missing that would normally clear it?' },
            { t: 'Her neutrophils no longer work', fb: 'Her innate defenses are intact (and in scene 12\'s table the virus was cleared even without neutrophils). Look at her antibody and her cytotoxic T-lymphocytes on day 21.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run her infection',
        },
      ],
    },
    // ------------------------------------------------------------- 13. teaching without the disease
    {
      id: 'vaccine', title: 'Teaching without the disease', speed: 36,
      steps: [
        {
          view: 'places', viewOpts: { kind: 'virus', caption: 'Priya\'s airway, lymph node and blood, in October.' }, remount: true,
          timeline: VTL(15), meters: METERS.virus,
          title: 'A vaccine',
          setup: () => { setSim(person(), { kind: 'virus' }); app.ghosts = []; },
          text: `<p>In October Priya had the flu vaccine: an injection of <b>viral protein that cannot multiply</b>, with nothing that can infect a cell.</p>`,
          question: predict({ prompt: 'Predict the timeline for the two weeks after the injection.', options: [
            { t: 'No virus and no infected cells; lymphocytes and antibody rise over about two weeks', ok: true, fb: 'Run it. The antigen is real, so selection and expansion happen as before. The disease is missing.' },
            { t: 'A small infection (a mild case of flu), then antibody', fb: 'The vaccine contains protein, not virus that can enter cells and multiply. What will the red and orange curves do?' },
            { t: 'Antibody appears the same day', fb: 'The vaccine supplies antigen, not antibody. How long did Priya\'s B-lymphocytes take to respond to an antigen they had never met?' },
          ] }),
          actions: [{ label: 'Give the vaccine (run 14 days)', cls: 'lym', disabled: (c) => afterPrediction(c) || busy(c) || data(c).ran, run: (c) => { mark('vaccine'); experiment(c, { before: (b) => b.vaccinate('virus'), hours: 14 * DAY, speed: 36, after: (b, c) => c.recordValue('vaccine', { ab14: b.antibodyTo('virus', 'A'), ab3: rowAt(3).ab, lymph: b.specific('virus', 'A').total, virus: peakOf(app.history, 'pathogen') + peakOf(app.history, 'infected'), fever: peakOf(app.history, 'fever') }) }); } }],
          status: (c) => { const v = c.record.values.vaccine; return data(c).ran && v ? `Antibody on day 3: <b>${fmtAb(v.ab3)}</b> · on day 14: <b>${fmtAb(v.ab14)} units</b> · lymphocytes that fit: ${fmt(v.lymph)} · virus at any time: ${fmt(v.virus)}` : ''; },
          waitFor: (c) => data(c).ran, waitHint: 'Predict, then give the vaccine',
        },
        {
          view: 'places', title: 'Exposed',
          setup: () => { setSim(vaccinated14(), { kind: 'virus' }); app.ghosts = [elenaGhost()]; },
          text: `<p>Two weeks after her vaccine, Priya breathes in the same virus that put Elena in bed for a week. The grey-brown curve is Elena's infected cells.</p>`,
          actions: [{ label: 'Priya breathes in the virus (run 10 days)', cls: 'germ', disabled: (c) => busy(c) || data(c).ran, run: (c) => experiment(c, { before: (b) => b.infect('virus'), hours: 10 * DAY, speed: 36, after: (b, c) => c.recordValue('vaxExposed', { peak: peakOf(app.history, 'infected'), elena: peakOf(elenaRows(), 'infected'), fever: peakOf(app.history, 'fever'), elenaFever: peakOf(elenaRows(), 'fever') }) }) }],
          status: (c) => { const v = c.record.values.vaxExposed; return data(c).ran && v ? `Most cells infected: <b>${fmt(v.peak)}</b> (Elena: ${fmt(v.elena)}) · fever and aching at worst: <b>${pct(v.fever)}</b> (Elena: ${pct(v.elenaFever)})` : ''; },
          question: { prompt: 'Priya met the same virus as Elena. What protected her?', options: [
            { t: 'Antibody already in her blood and airway coated the virus before it could enter cells, and the thousands of lymphocytes that now fit it stood ready', ok: true, fb: 'This is scene 10\'s "antibody first" experiment, except that Priya made the antibody herself, and has memory cells to make more.' },
            { t: 'The vaccine was still in her body, killing the virus', fb: 'A vaccine contains nothing that can kill a virus: it is antigen. What did her own body make in response to it?' },
            { t: 'The vaccine strengthened her immune system in general', fb: 'Test that idea in the next step, with a virus the vaccine did not match.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run the exposure',
        },
        {
          view: 'places', title: 'Two ways a vaccine can fail',
          setup: () => { setSim(person(), { kind: 'virus' }); app.ghosts = [elenaGhost()]; },
          text: `<p>Run both.</p><ol style="margin:0 0 6px 18px;padding:0"><li>Priya is exposed only <b>3 days</b> after her vaccine.</li><li>Two weeks after her vaccine, she meets a <b>changed strain</b> of influenza, with a differently shaped antigen.</li></ol>`,
          actions: [
            { label: '1. Exposed on day 3', cls: 'germ', disabled: (c) => busy(c) || data(c).early, run: (c) => { app.ghosts = [elenaGhost()]; experiment(c, { sim: () => { const b = person((x) => x.vaccinate('virus')); b.advance(3 * DAY); b.takeEvents(); return b; }, kind: 'virus', strain: 'A', before: (b) => b.infect('virus'), hours: 10 * DAY, speed: 36, key: 'early', after: (b, c) => c.recordValue('vaxEarly', { peak: peakOf(app.history, 'infected') }) }); } },
            { label: '2. A changed strain', cls: 'germ', disabled: (c) => busy(c) || data(c).drift, run: (c) => { app.ghosts = [elenaGhost()]; experiment(c, { sim: () => vaccinated14(), kind: 'virus', strain: 'B', before: (b) => b.infect('virus', { strain: 'B' }), hours: 10 * DAY, speed: 36, key: 'drift', after: (b, c) => c.recordValue('vaxDrift', { peak: peakOf(app.history, 'infected') }) }); } },
          ],
          status: (c) => { const v = c.record.values, d = data(c); return (d.early && v.vaxEarly ? `Exposed on day 3: most cells infected <b>${fmt(v.vaxEarly.peak)}</b>.` : '') + (d.drift && v.vaxDrift ? `<br>Changed strain: most cells infected <b>${fmt(v.vaxDrift.peak)}</b>.` : ''); },
          question: { prompt: 'The flu vaccine is given every autumn, a few weeks before the flu season. Which pair of reasons fits your two runs?', options: [
            { t: 'The response to a vaccine takes about two weeks to build; and it protects only against the antigen shapes it contained, which change from year to year', ok: true, fb: 'A vaccine does not "boost the immune system". It changes the library for particular antigens, and that takes as long as any primary response.' },
            { t: 'The vaccine wears off within days; and newer strains are stronger', fb: 'On day 3 the response had not started yet, rather than worn off: look at the antibody curve from the last step. And the changed strain was no stronger: what was different about it?' },
            { t: 'The vaccine works only in cold weather; and only against one virus particle at a time', fb: 'Neither. Look at how long the antibody took to appear after the vaccine, and at what was different about the changed strain.' },
          ] },
          waitFor: (c) => data(c).early && data(c).drift, waitHint: 'Run both',
        },
        {
          view: 'places', title: 'Borrowed protection',
          setup: () => { setSim(person(), { kind: 'virus' }); app.ghosts = []; },
          timeline: VTL(90), speed: 168,
          text: `<p>Elena's newborn nephew has never been vaccinated or infected. But before he was born, antibody made by his mother crossed the placenta into his blood. In the model: give a person ready-made antibody, then follow twelve weeks.</p>`,
          actions: [{ label: 'Give ready-made antibody (run 12 weeks)', cls: 'lym', disabled: (c) => busy(c) || data(c).ran, run: (c) => { mark('antibody received'); experiment(c, { before: (b) => b.giveAntibody('virus', { amount: 400 }), hours: 84 * DAY, speed: 168, after: (b, c) => c.recordValue('borrowed', { start: 400, ab21: rowAt(21).ab, ab84: b.antibodyTo('virus', 'A'), lymph: b.specific('virus', 'A').total, memory: b.specific('virus', 'A').memory }) }); } }],
          status: (c) => { const v = c.record.values.borrowed; return data(c).ran && v ? `Antibody: 400 → week 3 <b>${fmtAb(v.ab21)}</b> → week 12 <b>${fmtAb(v.ab84)}</b> units · lymphocytes that fit: ${fmt(v.lymph)} · memory cells: <b>${fmt(v.memory)}</b>` : ''; },
          question: { prompt: 'Twelve weeks on, what is left of his protection?', options: [
            { t: 'A little antibody and no memory cells: nothing in his own library changed', ok: true, fb: nameBox('Protection from antibody made by someone else is <b>passive immunity</b>: immediate, but it fades as the antibody is broken down, and it leaves no memory. Protection from the person\'s own response, to an infection or a vaccine, is <b>active immunity</b>: slow to start, but remembered. This is why infant vaccines begin in the first months of life.') },
            { t: 'Memory cells that will protect him for years', fb: 'Look at the lymph node and the status line: did any of his own lymphocytes respond? There was antibody, but no antigen to select them.' },
            { t: 'As much antibody as at the start', fb: 'Look at the gold dashed curve: antibody is a protein, and proteins are broken down. Its half-life is about three weeks.' },
          ] },
          waitFor: (c) => data(c).ran, waitHint: 'Run twelve weeks',
        },
        {
          view: 'places', title: 'Reading a titer',
          text: () => {
            const pri = vaccinated14(); pri.advance(76 * DAY);
            const rows = [
              { name: 'Elena, before her infection', value: 'not detected', unit: 'units', flag: '' },
              { name: 'Priya, 3 months after her vaccine', value: fmtAb(pri.antibodyTo('virus', 'A')), unit: 'units', flag: '' },
              { name: 'The baby, at 2 weeks old', value: fmtAb(400 * Math.pow(0.5, 14 / 21)), unit: 'units', flag: '' },
            ];
            return `<p>A <b>titer</b> is a blood test for the amount of antibody against one antigen. Nursing students usually have titers checked (for measles or hepatitis B, for example) before clinical placements.</p>${labTable(rows, 'Antibody to influenza A (this strain)')}`;
          },
          question: { prompt: 'Priya\'s titer will fall slowly over the coming year. Does that mean her immunity is going?', options: [
            { t: 'Not entirely: a titer measures antibody, but her memory cells remain and can respond within days', ok: true, fb: 'A blood test cannot easily count memory cells, so antibody is used as a stand-in. Look at the baby: a good titer, and no memory at all. For some vaccines a low titer is the reason for a <b>booster</b>, a second dose that sets off a secondary response.' },
            { t: 'Yes: immunity <i>is</i> the antibody in the blood', fb: 'In scene 9 Priya\'s antibody had fallen a long way after six months, yet she cleared the second infection in a day or two. What else had the first infection left behind?' },
            { t: 'No: antibody levels never fall', fb: 'Antibody is a protein with a half-life of about three weeks; you watched it fall in the last step. What lasts longer?' },
          ] },
        },
        {
          view: 'places', title: 'Your results',
          text: `${caseNote('Back to the patients', '<p>You can now answer every question on your handout about Priya, Elena, Mr. Hall and Ms. Adeyemi.</p>')}
                 <p>Copy your results onto the handout (or attach them), then type your name. If you worked as a group, type everyone's names. Write the completion code on the handout.</p>`,
          extra: (el, c) => renderCompletion(el, c),
          waitFor: () => false, waitHint: 'Type your name(s) to see your completion code',
        },
      ],
    },
  ];

  const LESSON = IM.PART_A.concat(PART_B);
  // Where the right answer sits. The options are written with the right answer first, so each
  // question's order is set here: across the lab the right answer falls equally often in each
  // position, and never in the same position twice running. (Opening guesses, which have no
  // right answer, keep the runner's own shuffle.)
  (function placeAnswers() {
    const rand = ImmuneSim.rng(20261117), bags = {}, last = {};
    for (const sc of LESSON) for (const st of sc.steps) {
      const q = st.question;
      if (!q || !q.options || q.options.some(o => o.neutral)) continue;
      const n = q.options.length, right = q.options.find(o => o.ok), wrong = q.options.filter(o => !o.ok);
      if (!right || n < 2) continue;
      if (!bags[n] || !bags[n].length) {
        const bag = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
        if (bag[bag.length - 1] === last[n]) bag.unshift(bag.pop());    // the next one drawn is the last element
        bags[n] = bag;
      }
      const pos = bags[n].pop(); last[n] = pos;
      if (rand() < 0.5) wrong.reverse();
      q.options = wrong.slice(0, pos).concat([right], wrong.slice(pos));
      q.fixedOrder = true;
    }
  })();
  const FIRST_B = IM.PART_A.length;

  // =========================================================================
  // Completion: results for the handout, and a completion code
  // =========================================================================
  // The code comes from the names typed (in any order) and is shown only once every question has
  // been answered. It shows the lab was finished; the handout carries the grade. It deters casual
  // sharing but is not security (anyone can read this page's source).
  const CODE_SALT = 'immunesim-complete-v1';
  const normNames = (n) => String(n || '').toLowerCase().split(/,|;|&|\n|\band\b/).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean).sort().join(', ');
  const completionCode = (names) => 'IM-' + Lesson.checkCode(normNames(names), CODE_SALT);
  function questionsLeft() {
    const r = IM.runner.runner.record, left = [];
    LESSON.forEach((sc, si) => sc.steps.forEach((st, ki) => {
      const a = r.answers[`${sc.id}.${ki}`];
      const last = si === LESSON.length - 1 && ki === sc.steps.length - 1;
      if ((st.question && !(a && a.done)) || (st.waitFor && !last && !r.completed.has(`${sc.id}.${ki}`))) left.push(si + 1);
    }));
    return [...new Set(left)];
  }
  const d1 = (x) => (x == null || !isFinite(x) ? '—' : x.toFixed(1));
  function resultsLines() {
    const rec = IM.runner.runner.record, v = rec.values, t = rec.tables || {}, L = [];
    L.push(`ImmuneSim: our results (person ${app.seed} of 12)`);
    L.push('Scene 2 · A race');
    if (v.race24 != null) L.push(`  1,000 bacteria, no defenses, after 24 h: ${fmt(v.race24)}`);
    L.push('Scene 3 · The guards already there');
    if (v.alarmByHand) L.push(`  By hand: bacteria began to fall when neutrophils at the site passed about ${fmt(Math.round(v.alarmByHand.neutrophils / 100) * 100)}`);
    if (v.innate48) L.push(`  At 48 h: ${fmt(v.innate48.bacteria)} bacteria, ${fmt(v.innate48.neut)} neutrophils, swelling ${pct(v.innate48.swelling)}`);
    if (v.pred48) L.push(`  With prednisone, at 48 h: ${fmt(v.pred48.bacteria)} bacteria, ${fmt(v.pred48.neut)} neutrophils, swelling ${pct(v.pred48.swelling)}`);
    L.push('Scene 4 · The same every time');
    if (v.plateau) L.push(`  Innate defenses only, day 4: ${fmt(v.plateau.bacteria)} bacteria (not cleared)${v.plateau2 ? `; second time: ${fmt(v.plateau2.bacteria)}` : ''}`);
    L.push('Scene 5 · The library');
    if (v.hunt) L.push(`  Tested by hand: ${v.hunt.tested} of 1,296; best fit found ${pct(v.hunt.best)}`);
    if (v.fitting != null) L.push(`  B-lymphocytes whose receptor fits the antigen: ${v.fitting} of 1,296${v.fittingB != null ? `; for the other strain: ${v.fittingB} (different cells)` : ''}`);
    L.push('Scene 6 · One cell is not enough');
    if (v.clone) L.push(`  B-lymphocytes that fit: day 2: ${fmt(v.clone[2])}; day 4: ${fmt(v.clone[4])}; day 6: ${fmt(v.clone[6])}`);
    L.push('Scene 7 · Two keys');
    if (v.noHelp) L.push(`  Day 8 without helper T: ${fmt(v.noHelp.b)} B-lymphocytes that fit, antibody ${fmtAb(v.noHelp.ab)}`);
    if (v.withHelp) L.push(`  Day 8 with helper T: ${fmt(v.withHelp.b)} B-lymphocytes that fit, antibody ${fmtAb(v.withHelp.ab)} units`);
    if (v.twoKeys) L.push(`  A B-lymphocyte that fits Priya's own protein, day 10, two keys needed: ${fmt(v.twoKeys.b)} cells, antibody ${fmtAb(v.twoKeys.ab)}`);
    if (v.oneKey) L.push(`  The same if one key were enough: ${fmt(v.oneKey.b)} cells, antibody against her own cells ${fmtAb(v.oneKey.ab)} units`);
    L.push('Scene 8 · What antibody does');
    if (v.dish) L.push(`  Dish after 6 h (start 100 thousand): alone ${fmt(v.dish.plain)}; + antibody ${fmt(v.dish.ab)}; + phagocytes ${fmt(v.dish.phag)}; + both ${fmt(v.dish.both)}`);
    if (v.first) L.push(`  Priya's first infection: first antibody day ${d1(v.first.firstAb)}; cleared day ${d1(v.first.cleared)}; most bacteria ${fmt(v.first.peak)}; antibody on day 3: ${fmtAb(v.first.abDay3)}`);
    L.push('Scene 9 · The second time');
    if (v.memory) L.push(`  Lymphocytes that fit: before ${fmt(v.memory.start)}; peak ${fmt(v.memory.peak)}; day 42: ${fmt(v.memory.day42)}`);
    if (v.second) L.push(`  Second infection: cleared day ${d1(v.second.cleared)}; most bacteria ${fmt(v.second.peak)}; antibody on day 3: ${fmtAb(v.second.abDay3)}; most swelling ${pct(v.second.swelling)} (first time ${pct(v.second.swelling1)})`);
    if (v.otherStrain) L.push(`  A different strain: ${v.otherStrain.cleared != null ? 'cleared day ' + d1(v.otherStrain.cleared) : 'not cleared in 14 days'}; most bacteria ${fmt(v.otherStrain.peak)}`);
    L.push('Scene 10 · Hiding inside');
    if (v.abLate) L.push(`  Antibody given on day 3: free virus ${fmt(v.abLate.before.virus)} → ${fmt(v.abLate.virus)}; infected cells ${fmt(v.abLate.before.infected)} → ${fmt(v.abLate.infected)}`);
    if (v.abFirst) L.push(`  Antibody given first: most cells infected ${fmt(v.abFirst.peak)}`);
    L.push('Scene 11 · Every cell shows what it is making');
    if (v.byHand) L.push(`  By hand: ${v.byHand.healthyLeft} of 12 cells still healthy; healthy cells killed by mistake: ${v.byHand.healthyKilled}`);
    if (v.elena) L.push(`  Elena: cytotoxic T-lymphocytes arrive day ${d1(v.elena.ctlDay)}; first antibody day ${d1(v.elena.firstAb)}; cleared day ${d1(v.elena.cleared)}; most cells infected ${fmt(v.elena.peak)}`);
    L.push('Scene 12 · Take one piece away (bacteria / virus)');
    if (t.knock) for (const [key, name] of KO) { const r = (k) => (t.knock[`${key}.${k}`] == null ? '—' : t.knock[`${key}.${k}`] === 'not' ? 'not cleared' : `cleared day ${t.knock[`${key}.${k}`]}`); L.push(`  Without ${name.replace(/ \(.*/, '')}: ${r('bacterium')} / ${r('virus')}`); }
    if (v.hall) L.push(`  Mr. Hall, day 5: ${fmt(v.hall.bacteria)} bacteria (healthy ${fmt(v.hall.healthy)}); most swelling ${pct(v.hall.swelling)} (healthy ${pct(v.hall.swellingHealthy)})`);
    if (v.adeyemi) L.push(`  Ms. Adeyemi, day 21: ${v.adeyemi.cleared != null ? 'cleared' : 'not cleared'}; ${fmt(v.adeyemi.infected)} cells infected; antibody ${fmtAb(v.adeyemi.ab)}`);
    L.push('Scene 13 · Teaching without the disease');
    if (v.vaccine) L.push(`  Vaccine: antibody day 3: ${fmtAb(v.vaccine.ab3)}; day 14: ${fmtAb(v.vaccine.ab14)} units; virus at any time: ${fmt(v.vaccine.virus)}`);
    if (v.vaxExposed) L.push(`  Exposed 2 weeks after the vaccine: most cells infected ${fmt(v.vaxExposed.peak)} (Elena ${fmt(v.vaxExposed.elena)}); fever at worst ${pct(v.vaxExposed.fever)} (Elena ${pct(v.vaxExposed.elenaFever)})`);
    if (v.vaxEarly) L.push(`  Exposed 3 days after the vaccine: most cells infected ${fmt(v.vaxEarly.peak)}`);
    if (v.vaxDrift) L.push(`  A changed strain: most cells infected ${fmt(v.vaxDrift.peak)}`);
    if (v.borrowed) L.push(`  Borrowed antibody: 400 → week 3: ${fmtAb(v.borrowed.ab21)} → week 12: ${fmtAb(v.borrowed.ab84)} units; memory cells ${fmt(v.borrowed.memory)}`);
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
  $('#case-body').innerHTML = `<p style="margin:0 0 2px"><b>Part A</b></p>${PRIYA}<p style="margin:8px 0 2px"><b>Questions about Priya on your handout:</b></p>${PRIYA_Q}<p style="margin:12px 0 2px"><b>Part B</b></p>${ELENA}${HALL}${ADEYEMI}`;
  $('#btn-case').addEventListener('click', () => { $('#case').classList.add('on'); $('#case-close').focus(); });
  $('#case-close').addEventListener('click', () => $('#case').classList.remove('on'));
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
  const SAVE_KEY = 'immunesim-progress-v2';
  let runner = null;
  function readSaved() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.answers && Object.keys(s.answers).length ? s : null; } catch (e) { return null; }
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
    runner = IM.start(LESSON, {});
    if (saved) {
      const r = runner.runner.record;
      Object.assign(r.answers, saved.answers); Object.assign(r.values, saved.values); r.tables = saved.tables || {}; r.name = saved.name || '';
      for (const k of saved.completed || []) r.completed.add(k);
      for (const k of saved.visited || []) r.visited.add(k);
      runner.goto(Math.min(saved.scene || 0, LESSON.length - 1), 0);
    }
    // the header says which Part the current scene belongs to
    const label = () => { $('#part-label').textContent = runner.runner.scene < FIRST_B ? 'Part A · outside the cells' : 'Part B · inside the cells'; };
    new MutationObserver(label).observe($('#progress'), { childList: true });
    label();
    setInterval(save, 3000);
    window.addEventListener('pagehide', save);
  }
  const saved = /[?&]seed=/.test(location.search) ? null : readSaved();
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
  Object.assign(window.__immunesim, { lesson: () => LESSON, completionCode, results: () => resultsLines().join('\n'), ORDER: IM.L.ORDER, KO, cache });
})();
