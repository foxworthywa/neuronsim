/*
 * MuscleLesson: everything lesson-side for muscle.html (see docs/MUSCLE_MODULE.md,
 * docs/APP_API.md and docs/MUSCLE_VIEWS.md).
 *
 *   window.MuscleLesson = { profile, drawCell, views, lesson, lab }
 *
 * The profile names the fibre's landmarks and words; drawCell and views delegate to
 * views/muscle.js (window.MuscleViews); lesson assembles the scenes from SharedScenes and the
 * muscle-specific ones; lab renders the free-play controls and the clinical scenario cards.
 * Every "done when" reads model state or model events; nothing is timed or canned.
 * Classic script (no modules) so the page opens from file://.
 */
(function () {
  'use strict';

  // Kit members used below; filled in by bind(kit) before any lesson code runs.
  let sim, app, runner, panel, htmlEl, $, clamp, ION_COLOR, CH, chip, I, fmtV, fmtE, spikeIn, questionOrder,
    setPaused, setSpeed, mountView, enterLab, refire, since, LOOP_HTML, loopHighlight, labNav;
  let boundKit = null;
  function bind(kit) {
    if (boundKit === kit) return;
    boundKit = kit;
    ({ sim, app, runner, panel, htmlEl, $, clamp, ION_COLOR, CH, chip, I, fmtV, fmtE, spikeIn, questionOrder,
      setPaused, setSpeed, mountView, enterLab, refire, since, LOOP_HTML, loopHighlight, labNav } = kit);
    app.listeners.push(onModelEvent);
  }

  // Colours shared with the views (docs/MUSCLE_VIEWS.md).
  const FORCE_COLOR = '#a0442a', CA_COLOR = '#2d8fd5';
  const BANDS = [
    { key: 'ca', label: 'Ca²⁺\n(µM)', color: CA_COLOR, max: 8 },
    { key: 'force', label: 'force', color: FORCE_COLOR, max: 1.05 },
  ];
  const FORCE_BAND = [BANDS[1]];

  const profile = {
    id: 'muscle',
    cellWord: 'muscle fibre',
    regionWord: 'muscle fibre',
    rest: -85,
    threshold: -60,
    comp: 'endplate',            // manual channels and the default recording site (scenes 3–4)
    apComp: 'R3',                // scenes 5–6 record 5 mm from the stimulator (no stimulus artefact)
    stimComp: 'endplate',
    // The shared scenes' trigger: 1.5 × the model's reference shock, read from the model at
    // run time (the profile object is built before the model exists).
    get stimPulse() { return { nA: sim ? 1.5 * sim.refShockNA : 580, ms: 0.5 }; },
    manualG: { gNa: 0.9, gK: 6, gCl: 6 },      // µS (a fibre segment is ~200× a soma)
    fluxScale: 0.006,            // ion-traffic particles per nA in the membrane view (a segment carries ~150× a soma's leak current)
    defaultView: 'fibre',
    traceColors: { endplate: '#1f2430', R3: '#b45309', R8: '#0f766e', L8: '#7c3aed', mid: '#0f766e', nerve: '#d63c8a' },
    // Where each recording site is, in words a student can read off the legend. Segment names
    // (R3, R8) mean nothing to them, and a second unexplained curve looks like a second event.
    traceLabel: (c) => ({ endplate: 'at the end plate', R3: '5 mm along', mid: 'half way along', R8: 'far end, 2.5 cm', L8: 'other end, 2.5 cm', nerve: 'motor terminal' }[c] || c),
    traceTitle: (comp, extras) => {
      const where = { endplate: 'the end plate', R3: '5 mm from the end plate', mid: 'half way along', R8: 'the far end, 2.5 cm away', L8: 'the other end, 2.5 cm away', nerve: 'the motor terminal' };
      const at = [comp].concat(extras || []).filter(c => c !== 'nerve' || comp === 'nerve').map(c => where[c] || c);
      if (at.length < 2) return `Membrane potential recorded inside the fibre (${(at[0] || comp).replace(/^the /, '')})`;
      const last = at.pop();
      return `Membrane potential recorded inside the fibre at two electrodes: ${at.join(', ')} and ${last}`;
    },
    probeV: (s, name) => name === 'nerve' ? s.nerveV : undefined,
    extraVoltages: (s) => ({ nerve: s.nerveV }),
    // Dashed highlight on the whole-fibre inset (930 × 520, fibre horizontal, end plate centred;
    // ≈ 50 px per segment). Refine against views/muscle.js at integration.
    insetRegions: {
      endplate: [465, 260, 70, 70], R3: [617, 260, 55, 60], R8: [860, 260, 55, 60], L8: [70, 260, 55, 60],
      fibre: [465, 260, 430, 80], triad: [617, 260, 60, 60], sarcomere: [617, 260, 60, 60], nmj: [465, 260, 70, 70],
      default: [465, 260, 200, 60],
    },
  };

  // ---------------------------------------------------------------- views (views/muscle.js)
  let mv = null;
  function MV(kit) {
    if (!mv || mv.kit !== kit) mv = { kit, v: window.MuscleViews(kit) };
    return mv.v;
  }
  function drawCell(parent, opts, kit) { bind(kit); return MV(kit).drawCell(parent, opts || {}, kit); }
  function views(kit) { bind(kit); return MV(kit).views; }

  // ---------------------------------------------------------------- live references measured from the model
  // ref.twitch: the force peak of the last single twitch in normal conditions (one shock or
  // command, nothing else within 300 ms, normal bath, ATP on, receptors intact). Scenes 8, 12
  // and 13 compare against it; it is measured, never asserted.
  const ref = { twitch: null, thr: null };
  let lastStimT = -1e9, prevStimT = -1e9, lastMarkT = -1e9;
  function onModelEvent(e) {
    if (e.type === 'shock' || e.type === 'command' || e.type === 'spontaneous_command') {
      if (e.t < lastStimT) { lastStimT = -1e9; prevStimT = -1e9; lastMarkT = -1e9; }   // the model clock was reset
      prevStimT = lastStimT; lastStimT = e.t;
      // stimulus marks on the trace (the first of a burst carries the label)
      const burst = e.t - lastMarkT < 40;
      app.markers.push({ t: e.t, label: burst ? '' : (e.type === 'shock' ? 'shock' : 'command') });
      lastMarkT = e.t;
      if (app.markers.length > 400) app.markers.splice(0, app.markers.length - 400);
    }
    if (e.type === 'twitch_peak') {
      const normal = sim.conc.Ca.out === 2 && sim.conc.Mg.out === 1 && sim.atp === 1 && sim.ryrLeak === 0 && sim.receptor.block === 0 && sim.receptorDensity === 1 && sim.conc.K.out === 4;
      if (normal && e.t - lastStimT < 80 && lastStimT - prevStimT > 300) ref.twitch = e.force;
    }
  }

  const REST = -85, THR = -60;
  const R3 = () => sim.byName.R3;
  // Refuse a new shock while the last impulse has left the fibre refractory (a student cannot click
  // that fast at lesson speeds, but the button should never fire a wave that cannot propagate).
  const readyToShock = (c) => { if (sim.comps.some(k => sim.naState(k) === 'inactivated') || R3().V > REST + 8) { c.status('The fibre is still recovering from the last impulse (Na⁺ channels inactivated). Wait a moment, then shock again.', false); return false; } return true; };
  const vm = (name) => `Vm (${name === 'endplate' ? 'end plate' : name}) = ${fmtV(sim.byName[name].V)} mV`;
  const live = (name) => `${vm(name)} · Ca²⁺ ${sim.ca.toFixed(1)} µM · force ${sim.force.toFixed(2)}`;
  const pct = (x) => `${Math.round(x * 100)} %`;
  // Measurements that only exist once the activity has actually been done. A status line must
  // never throw on a missing one: an exception in a step callback used to stop the animation
  // loop for good, which looked like the whole page freezing mid-scene.
  const num = (v, dp) => (typeof v === 'number' && isFinite(v)) ? v.toFixed(dp == null ? 2 : dp) : '—';
  const ratio = (a, b, dp) => (typeof a === 'number' && typeof b === 'number' && b) ? (a / b).toFixed(dp == null ? 1 : dp) : '—';

  // Spike peaks at R3 attributed to the last shock (scene 5's all-or-none comparison).
  function spikePeakTracker() {
    let strength = null, cur = -100, active = false;
    const peaks = [];
    return {
      peaks,
      reset() { peaks.length = 0; strength = null; cur = -100; active = false; },
      tick(events) {
        for (const e of events) if (e.type === 'shock') strength = e.strength;
        const V = R3().V;
        if (V > -20) { if (!active) { this._soon = sim.t - (this._lastEnd == null ? -1e9 : this._lastEnd) < 10; } cur = Math.max(cur, V); active = true; }
        else if (active) { peaks.push({ strength, peak: cur, soon: !!this._soon }); this._lastEnd = sim.t; active = false; cur = -100; }
      },
      samePeakPair() {
        for (const a of peaks) for (const b of peaks) if (!a.soon && !b.soon && b.strength >= 1.8 * a.strength && Math.abs(b.peak - a.peak) < 5) return [a, b];
        return null;
      },
    };
  }

  // =========================================================================
  // Lesson (docs/MUSCLE_MODULE.md, scene table)
  // =========================================================================
  function lesson(kit) {
    bind(kit);
    const S = window.SharedScenes;
    const E = sim.E;
    const scenes = [];

    // ------------------------------------------------------------- 1. where are we
    scenes.push({
      id: 'zoom', title: 'Where are we?', speed: 0.01,
      steps: [{
        view: 'zoomMuscle', remount: true, electrode: false, record: 'endplate',
        title: 'From a person to one muscle fibre',
        text: `<p>Lifting a cup, breathing, standing still: all of it is muscle fibres being switched on and off by electrical signals.</p>
               <p>Zoom in step by step until we reach one fibre.</p>`,
        actions: [{ label: 'Zoom in →', cls: 'primary', run: (c) => { c.view().next(); if (c.view().last) c.complete(); c.refresh(); }, disabled: (c) => c.view().last }],
        waitFor: (c) => c.view().last, waitHint: 'Keep zooming in until you reach one fibre',
        status: (c) => c.view().last ? 'A muscle fibre is an electrically excitable cell. That brief spike on the trace is the <b>impulse</b>; the bump on the gauge is the <b>twitch</b> it caused. By the end you will know every step from the one to the other, and every place it can go wrong.' : '',
      }],
    });

    // ------------------------------------------------------------- 2. anatomy (click by function)
    scenes.push({
      id: 'anatomy', title: 'Parts of a muscle fibre', speed: 0.01,
      steps: (function () {
        const parts = [
          ['sarcolemma', 'The impulse travels over this surface. Click it.', 'The sarcolemma is the fibre\'s membrane. Like every cell membrane it is charged, and it can carry an impulse.'],
          ['ttubule', 'These tunnels dive inward from the surface — top and bottom — and carry the impulse deep into the fibre so the whole thing contracts at once. Click one.', 'Transverse tubules are inward folds of the sarcolemma. Without them the inside of a thick fibre would never hear the signal.'],
          ['sr', 'This is the calcium store: the blue sacs lying just inside each surface, on either side of every tunnel. Click one.', 'The sarcoplasmic reticulum wraps every myofibril and holds Ca²⁺ at thousands of times the concentration in the cytosol. The swollen ends pressed against the T-tubules are the terminal cisternae — that is where the Ca²⁺ comes out.'],
          ['myofibril', 'These do the pulling. Click one.', 'Myofibrils are chains of sarcomeres, the contractile units. Everything else exists to switch them on and off.'],
          ['endplate', 'The nerve delivers its command here. Click it.', 'The motor end plate is where the motor nerve meets the fibre. We will leave the nerve out until the end: first we learn what the fibre does when it is triggered.'],
        ];
        const names = { sarcolemma: 'the sarcolemma', ttubule: 'a T-tubule', sr: 'the sarcoplasmic reticulum', myofibril: 'a myofibril', endplate: 'the motor end plate' };
        const does = { sarcolemma: 'It carries the impulse over the surface.', ttubule: 'It carries the impulse inward.', sr: 'It stores calcium.', myofibril: 'It does the pulling.', endplate: 'It is where the nerve delivers its command.' };
        // A student who cannot see a small structure is shown a ghost of it: the outline appears,
        // pulses and fades, so nothing is left sitting over the model afterwards. It comes on
        // request, after a wrong guess, or after a while of looking.
        let ghostTimer = null;
        const ghost = (c, part) => { const v = c.view(); if (v && typeof v.hint === 'function') v.hint(part); };
        const armGhost = (c, part, ms) => {
          if (ghostTimer) clearTimeout(ghostTimer);
          const v = c.view();
          ghostTimer = setTimeout(() => { ghostTimer = null; if (c.view() === v && !c.stepState().done) ghost(c, part); }, ms);
        };
        const steps = parts.map(([part, prompt, explain], i) => ({
          view: 'fibre', viewOpts: { caption: 'Click the structure described in the panel.', labels: false }, labels: false, electrode: false, record: 'endplate', title: `Find the structure (${i + 1} of 5)`,
          text: `<p>${prompt}</p>`,
          actions: [{ label: 'Show me where', run: (c) => { ghost(c, part); c.status(`Watch the outline: that is ${names[part]}. Now click it.`, false); } }],
          enter: (c) => {
            if (ghostTimer) { clearTimeout(ghostTimer); ghostTimer = null; }
            c.view().highlight('none');
            armGhost(c, part, 20000);
            c.view().onPart = (p) => {
              if (p === part) {
                if (ghostTimer) { clearTimeout(ghostTimer); ghostTimer = null; }
                c.view().highlight(part); c.status(`<b>Yes: ${names[part]}.</b> ${explain}`, true); c.complete();
              } else {
                c.status(`That is ${names[p] || p}. ${does[p] || ''} Try again.`, false);
                armGhost(c, part, 2500);
              }
            };
          },
          waitFor: () => false, waitHint: 'Click the correct part of the fibre',
          status: '',
        }));
        steps.push({
          view: 'fibre', viewOpts: { caption: 'One fibre, labelled.', labels: true }, labels: true, title: 'The plan',
          text: `<p>Now you know the map. Here is the journey:</p>
                 <p><b>rest</b> → <b>shock</b> → <b>impulse</b> → <b>spread</b> → <b>Ca²⁺</b> → <b>force</b> → <b>relax</b>, and at the end, the nerve.</p>
                 <p>First: why is a resting fibre electrically charged at all?</p>`,
          enter: (c) => { c.view().highlight('none'); },
        });
        return steps;
      })(),
    });

    // ------------------------------------------------------------- 3. resting membrane (shared)
    const rest = S.restingMembrane(profile, kit, {
      channelsForRest: ['K_leak', 'K_leak', 'Na_leak', 'pump'],
      copy: {
        'pump.fb1': 'The pump keeps the <i>gradients</i>. If it stopped, Vm would barely change for many seconds. In the Lab you can switch it off and watch.',
        'kLeak.fb0': `Down its gradient: from 140 mM inside toward 4 mM outside. Each K⁺ that leaves carries positive charge out, leaving the inside more negative. That is the main source of the resting potential. It stops short of ${fmtE(E.K)} mV because a little Na⁺ leaks in: less than in a nerve cell, which is why a muscle fibre rests nearer ${fmtE(E.K)}.`,
      },
    });
    // Activity thresholds relative to rest, as the spec says: Na⁺ hold ≥ 8 mV up, K⁺ hold ≥ 3 mV down.
    rest.steps[4].waitFor = () => sim.endplate.V > REST + 8;
    scenes.push(rest);

    // ------------------------------------------------------------- 4. recording electrode (shared)
    const electrode = S.recordingElectrode(profile, kit, {
      copy: {
        'electrode.prompt': `The trace reads ${fmtE(REST)} mV. What does that mean?`,
        'electrode.opt0': 'The inside of the fibre is 85 mV more negative than the outside.',
        'electrode.fb0': 'Charges line the two faces of the membrane; the fibre is a charged battery waiting to be used.',
        'electrode.opt1': 'The outside is 85 mV more negative than the inside.',
        'electrode.fb1': 'By convention the outside is the reference (0 mV) and the inside is measured against it: negative.',
        'electrode.opt2': 'The fibre is damaged.',
        'electrode.fb2': 'A steady negative reading is a <i>healthy</i> resting fibre. A damaged one drifts toward 0 mV.',
      },
    });
    Object.assign(electrode.steps[0].viewOpts, { electrodeAt: 'endplate', labels: true });
    scenes.push(electrode);

    // ------------------------------------------------------------- 5. shock the fibre: threshold and all-or-none
    scenes.push((function () {
      let thr = null;                                     // threshold strength (× reference) measured by the model at scene entry
      const T = () => (thr == null ? (thr = sim.thresholdStrength()) : thr);
      const pk = spikePeakTracker();
      // "100 %" is the model's measured threshold strength (plus 3 % so the knife edge always fires).
      const shockAt = (p) => ({ label: p === 20 ? 'Shock 20 %' : `${p} %`, cls: 'na', run: (c) => { setPaused(false); sim.shock(p / 100 * T() * 1.03); const d = c.stepState().data; d.shocks = (d.shocks || 0) + 1; d.lastPct = p; } });
      const thrLine = () => ref.thr == null ? '' : ` · threshold strength (measured): ${pct(ref.thr)} of the reference shock`;
      return {
        id: 'threshold', title: 'Shock the fibre: threshold', speed: 0.002, showThreshold: true,
        steps: [
          {
            view: 'fibre', viewOpts: { caption: 'Stimulating electrodes at the end plate; recording electrode at the end plate.', labels: false, stimulator: true, electrodeAt: 'endplate' }, reset: true, remount: true, record: 'endplate', electrode: true, labels: false,
            enter: () => { app.showThreshold = false; thr = null; ref.thr = T(); pk.reset(); },
            title: 'Shock the fibre',
            text: `<p>A pair of <b>stimulating electrodes</b> now touches the fibre at the end plate. A shock pushes a little positive charge in for half a millisecond.</p>`,
            question: { prompt: 'A small shock pushes a little positive charge in. What will Vm do?', options: [
              { t: 'Rise a little, then fall back to −85.', ok: true, fb: 'Just like opening a few Na⁺ channels by hand: K⁺ leak drags it back. Try it.' },
              { t: 'Rise and stay up.', fb: 'Nothing is holding it up; K⁺ keeps leaking out. Watch.' },
              { t: 'Fire an impulse.', fb: 'Not yet. Something has to open the new channels first, and a small push does not reach them. Try it and see how far it gets.' },
            ] },
            actions: [shockAt(20)],
            tick: (c) => { const d = c.stepState().data; if (d.shocks) d.max = Math.max(d.max == null ? REST : d.max, sim.endplate.V); },
            waitFor: (c) => { const d = c.stepState().data; return d.shocks > 0 && d.max > REST + 3 && Math.abs(sim.endplate.V - REST) < 1; },
            waitHint: 'Give a 20 % shock and watch Vm rise and fall back',
            status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>Observed:</b> Vm rose to ${fmtV(d.max)} mV and fell straight back. The shock moved charge; nothing kept it there.` : `${vm('endplate')}${d.max != null ? ` · highest so far ${fmtV(d.max)} mV` : ''}`; },
          },
          {
            view: 'membrane', viewOpts: { comp: 'R3', inset: 'R3', channels: ['Na_v', 'K_v', 'Na_v', 'K_v', 'K_leak'], caption: 'The sarcolemma 5 mm from the electrodes. New channels, marked V.' }, remount: true, record: 'R3', electrode: true,
            enter: () => { app.showThreshold = false; },
            title: 'Channels with a voltage sensor',
            text: `<p>We now record <b>5 mm from the shock</b>, where the shock's own charge cannot reach. This patch of membrane has two new kinds of channel, marked <b>V</b>. At rest both are shut.</p>
                   <p>Raise the shock in steps.</p>`,
            question: { prompt: 'These new channels are marked V: they have a voltage sensor. As you turn the shock up, what will make them open?', options: [
              { t: 'The membrane depolarizing far enough.', ok: true, fb: 'Watch for the moment it happens; the sim will pause there.' },
              { t: 'The shock hitting them directly.', fb: 'The shock only moves charge. The channels respond to the <i>voltage</i> across the membrane, not to the electrode.' },
              { t: 'A signal from the nerve telling them to open.', fb: 'There is no nerve in this experiment: only an electrode. These channels have no place for a chemical to bind; they respond only to the voltage across the membrane. (How the nerve does it comes at the end.)' },
            ] },
            actions: [20, 40, 60, 80, 100, 120].map(shockAt),
            tick: (c, ev) => { pk.tick(ev); const d = c.stepState().data, V = R3().V; const crossed = d.prevV != null && d.prevV <= THR && V > THR; d.prevV = V; if (!runner.state.done && ((V > THR && R3().dVdt > 0) || crossed)) { c.complete(); setPaused(true); app.showThreshold = true; c.mark('threshold'); } },
            waitFor: () => false, waitHint: 'Raise the shock until the fibre fires',
            status: (c) => { const d = c.stepState().data; return runner.state.done ? '<b>Paused: the first Na⁺ channels have just opened.</b> This voltage is the <b>threshold</b>.' : `${vm('R3')}${d.lastPct ? ` · last shock ${d.lastPct} %` : ''}`; },
          },
          {
            view: 'membrane', title: 'Predict: what happens next?', pause: true,
            text: (c) => `<p>Paused at threshold: Vm (R3) = ${fmtV(R3().V)} mV. A few Na⁺ channels have opened and ${I('Na')} is starting to enter.</p>`,
            question: { prompt: 'Na⁺ rushes in through the open channels. What does that do to the Na⁺ channels next door?', options: [
              { t: 'Depolarizes the membrane further and opens them too.', ok: true, fb: 'Positive feedback: Na⁺ in → more depolarization → more Na⁺ channels open. Once it starts it runs to completion. Continue and watch the loop below light up.' },
              { t: 'Closes them, to balance things out.', fb: 'That is what happens later with K⁺. Na⁺ entry makes the inside <i>more</i> positive, which is exactly what these channels respond to.' },
              { t: 'Nothing; each channel acts alone.', fb: 'They share the same membrane and the same voltage. What one channel does to Vm, every neighbour feels.' },
            ] },
            extraHtml: LOOP_HTML,
            tick: (c, ev) => { pk.tick(ev); loopHighlight(c); },
            onContinue: () => { setPaused(false); },
          },
          {
            view: 'membrane', title: 'Double the shock',
            text: `<p>Let the impulse finish. Then fire again at <b>twice</b> the strength and compare the two peaks.</p>`,
            question: { prompt: 'Will the impulse be bigger?', options: [
              { t: 'No, the same size.', ok: true, fb: '<b>All-or-none.</b> The shock only has to reach threshold; the Na⁺ channels and the gradient do the rest, the same way every time.' },
              { t: 'Yes, twice as big.', fb: 'Look at the trace: identical. The shock\'s job ends at threshold; the channels set the size.' },
              { t: 'Yes: a stronger shock, a stronger contraction, like the frog muscle in lab.', fb: 'In a whole muscle a stronger shock recruits more <i>fibres</i>, so the muscle pulls harder. This is one fibre: once its threshold is reached, its impulse is the same size every time. Compare the two peaks.' },
            ] },
            actions: [shockAt(100), shockAt(200)],
            extraHtml: LOOP_HTML,
            tick: (c, ev) => { pk.tick(ev); loopHighlight(c); },
            waitFor: () => !!pk.samePeakPair(), waitHint: 'Shock at 100 %, then at 200 %',
            status: () => {
              const pair = pk.samePeakPair();
              const list = pk.peaks.map(p => `${Math.round(p.strength / (T() * 1.03) * 100)} % → ${fmtV(p.peak)} mV${p.soon ? ' (too soon after the last impulse: wait for the trace to settle)' : ''}`).join(' · ');
              return (pair ? `<b>Same peak within a few mV</b> (${fmtV(pair[0].peak)} vs ${fmtV(pair[1].peak)} mV). ` : '') + (list ? `Peaks: ${list}` : vm('R3')) + thrLine();
            },
          },
        ],
      };
    })());

    // ------------------------------------------------------------- 6. building the action potential (shared + refractory step)
    scenes.push((function () {
      const ap = S.actionPotential(profile, kit, {
        copy: {
          'rise.caption': 'Building the impulse one phase at a time (recording 5 mm from the shock).',
          'rise.text': `<p>Instead of memorizing the famous curve, we will build it from what the channels do. The lower band of the trace shows how many Na⁺ channels (<span style="color:#e8772e">orange</span>) and K⁺ channels (<span style="color:#8e5cf0">purple</span>) are open.</p>
                        <p>Trigger an impulse. The simulation will pause during the rising phase.</p>`,
          'rising.opt0': `Toward the Na⁺ equilibrium potential, about ${fmtE(E.Na)} mV.`,
          'rising.opt1': 'To 0 mV and no further.', 'rising.fb1': `Zero is not special; Na⁺ pulls Vm toward ${fmtE(E.Na)} and Vm overshoots 0.`,
          'rising.opt2': `Back toward ${fmtE(REST)}.`, 'rising.fb2': 'Na⁺ channels are open and Na⁺ is flooding in. Which way does that push?',
          'undershoot.title': 'Phase 4: the dip',
          'undershoot.text': `<p>Vm has dipped a little <b>below</b> ${fmtE(REST)} mV.</p>`,
          'undershoot.prompt': 'Why does Vm dip a little <i>below</i> rest?',
          'undershoot.opt0': `Extra K⁺ channels are still open, so Vm heads toward E_K (${fmtE(E.K)}) before settling.`,
          'undershoot.fb0': `As those K⁺ channels close, Vm relaxes back to ${fmtE(REST)} mV. Continue and watch it recover. Note the Na⁺ channels: still inactivated for a while.`,
          'undershoot.opt1': 'Too much Na⁺ left.', 'undershoot.fb1': 'Na⁺ hardly changed concentration. This is a permeability effect: the membrane is briefly even more K⁺-selective than at rest.',
          'undershoot.opt2': 'The pump is pushing it down.', 'undershoot.fb2': 'The pump is far too slow to do anything in a millisecond. Look at the K⁺ trace.',
          'falling.waitHint': 'Wait for the trace to dip below rest (or fire again)',
          'falling.statusMissed': 'The dip went by. Press <b>Fire again</b> to see it, or continue.',
        },
        replaceSteps: {
          3: {
            view: 'membrane', title: 'Phase 2: at the peak', pause: true,
            text: `<p>Paused at the peak. The Na⁺ channels have shut themselves (<b>inactivated</b>: a plug swings into the pore) and the voltage-gated K⁺ channels have opened. ${I('K')} is far more concentrated inside, and the inside is now <b>positive</b>.</p>`,
            question: { prompt: 'Which way does K⁺ move?', options: [
              { t: 'Out.', ok: true, fb: 'Both the concentration gradient and the electrical force (positive inside repelling a positive ion) now push K⁺ out.' },
              { t: 'In.', fb: 'K⁺ is 140 mM inside; and the inside is now <i>positive</i>, pushing K⁺ out even harder.' },
              { t: 'It stops moving.', fb: 'The channels are open and both forces now push the same way. Watch the arrow on the ladder.' },
            ] },
          },
          4: {
            view: 'membrane', title: 'Predict the falling phase', pause: true,
            question: { prompt: 'Positive charge is leaving the fibre. What will Vm do?', options: [
              { t: `Fall back toward ${fmtE(REST)} (repolarize).`, ok: true, fb: 'K⁺ out = down. Continue and watch the trace fall; the simulation will pause once more when Vm dips below rest.' },
              { t: 'Stay up at the peak.', fb: 'Nothing is holding it there: Na⁺ channels are inactivated and K⁺ is leaving.' },
              { t: `Keep rising to ${fmtE(E.Na)}.`, fb: `The Na⁺ channels have shut themselves; the pull toward ${fmtE(E.Na)} is gone.` },
            ] },
            onContinue: () => { setPaused(false); },
          },
          7: {
            view: 'membrane', title: 'You built the curve',
            text: `<p>Rising (Na⁺ in) → peak (Na⁺ inactivates, K⁺ opens) → falling (K⁺ out) → dip (K⁺ still open) → rest. Every phase is a consequence of which channels are open.</p>
                   <p>Wait for the membrane to recover; fire again if you like.</p>`,
            actions: [refire],
            waitFor: () => R3().V > REST - 2 && R3().h > 0.4, waitHint: 'Wait for the membrane to recover',
            status: () => runner.state.done ? '<b>Recovered:</b> back at rest, and the Na⁺ channels have reset from inactivated to closed.' : `${vm('R3')} · Na⁺ channels ${sim.naState(R3())}`,
          },
        },
        extraSteps: [{
          view: 'membrane', title: 'Two shocks, 3 ms apart',
          text: `<p>The button fires two shocks 3 ms apart: the second one lands just after the first impulse.</p>`,
          question: { prompt: 'The button fires two shocks 3 ms apart. Will the second one fire an impulse?', options: [
            { t: 'No: the Na⁺ channels are inactivated and cannot open again yet.', ok: true, fb: 'The <b>refractory period</b>. It lasts a few ms. Remember it: it is why impulses cannot pile up, even though, as you will see, twitches can.' },
            { t: 'Yes, the same impulse.', fb: 'Try it. The channels have a second gate that is shut after a spike; voltage cannot open them until it resets.' },
            { t: 'Yes, a smaller one.', fb: 'There is no small version. Either the loop runs or it does not, and right now it cannot.' },
          ] },
          actions: [{ label: 'Shock twice, 3 ms apart', cls: 'na', run: (c) => { if (!readyToShock(c)) return; setPaused(false); sim.pair(3, 2); const d = c.stepState().data; d.t0 = sim.t; d.spikes = 0; d.shocks = 0; d.armed = true; } }],
          tick: (c, ev) => { const d = c.stepState().data; if (!d.armed) return; d.spikes += ev.filter(e => e.type === 'spike' && e.name === 'R3').length; d.shocks += ev.filter(e => e.type === 'shock').length; },
          waitFor: (c) => { const d = c.stepState().data; return !!d.armed && d.shocks >= 2 && sim.t > d.t0 + 10 && d.spikes === 1; },
          waitHint: 'Fire the pair and watch the second shock',
          status: (c) => { const d = c.stepState().data; if (runner.state.done) return '<b>Observed:</b> the first shock fired an impulse; the second, 3 ms later, produced nothing. The Na⁺ channels were still plugged.'; if (d.armed && d.shocks >= 2 && sim.t > d.t0 + 10) return d.spikes === 0 ? 'No impulse at all: the fibre was still recovering from the last one. Wait a moment and fire the pair again.' : 'Two impulses: the pair landed on a recovered membrane twice. Fire the pair again.'; return `${vm('R3')} · Na⁺ channels ${sim.naState(R3())}`; },
        }],
      });
      return Object.assign(ap, { showThreshold: true });
    })());

    // ------------------------------------------------------------- 7. along the fibre and down the tubes
    scenes.push({
      id: 'spread', title: 'Along the fibre and down the tubes', speed: 0.003, showThreshold: true,
      steps: [
        {
          view: 'fibreWave', viewOpts: { caption: 'The 3 cm fibre unrolled: end plate in the middle, T-tubule openings under every segment.', showTubules: true }, reset: true, remount: true, record: 'R3', electrode: true,
          title: 'Shock the middle of the fibre',
          text: `<p>The fibre is laid out as segments, each with its own voltage-gated Na⁺ and K⁺ channels. The recording electrode is still 5 mm from the shock, marked on the picture; the trace below comes from there.</p>`,
          question: { prompt: 'The shock is in the middle of a 3 cm fibre. Which way does the impulse travel?', options: [
            { t: 'Both ways, to both ends.', ok: true, fb: 'Shock it and watch both ends.' },
            { t: 'Toward the tendon only.', fb: 'Nothing about the membrane knows which way the tendon is. Local currents spread in both directions from the active spot.' },
            { t: 'It stays where the shock was.', fb: 'Watch: Na⁺ entering here depolarizes the next patch, whose channels open, and so on.' },
          ] },
          actions: [{ label: 'Shock the middle', cls: 'na', run: (c) => { if (!readyToShock(c)) return; setPaused(false); sim.shock(1.5); c.stepState().data.shocked = true; } }],
          // The far end's arrival is marked on the one trace rather than drawn as a second curve:
          // students have read a single trace for six scenes, and a second rise and fall reads as
          // a second event. The dashed mark says "this is when the far end fired" with no new
          // grammar to learn, and the delay between the two is measured for them below.
          tick: (c, ev) => {
            const d = c.stepState().data; if (!d.shocked) return;
            for (const e of ev) {
              if (e.type !== 'spike') continue;
              if (e.name === 'R3' && d.tNear == null) d.tNear = e.t;
              if (e.name === 'R8' && d.tFar == null) { d.tFar = e.t; c.mark('far end fires'); }
              if (e.name === 'L8') d.l8 = true;
            }
            d.r8 = d.tFar != null;
          },
          waitFor: (c) => !!(c.stepState().data.l8 && c.stepState().data.r8), waitHint: 'Shock the fibre and watch the wave reach both ends',
          status: (c) => {
            const d = c.stepState().data;
            if (!runner.state.done) return `${vm('R3')} · Vm (far end) = ${fmtV(sim.end.V)} mV`;
            const dt = (d.tFar != null && d.tNear != null) ? d.tFar - d.tNear : null;
            const mm = 5 * (sim.p.segLen / 1000);                       // R3 → R8 is five segments
            return `<b>Observed:</b> the impulse reached both ends, at full size. It passed the electrode first and the far end ${dt ? `${dt.toFixed(1)} ms` : 'a few ms'} later (the dashed mark on the trace)${dt ? `: ${mm.toFixed(1)} mm in ${dt.toFixed(1)} ms, about ${(mm / dt).toFixed(1)} m/s` : ''}.`;
          },
        },
        {
          view: 'fibreWave', title: 'What opens the next segment?',
          question: { prompt: 'What opens the Na⁺ channels in the next segment?', options: [
            { t: 'Local current from the active segment depolarizes it to threshold.', ok: true, fb: 'Each segment regenerates the impulse at full size, so it arrives at the ends as big as it started.' },
            { t: 'The shock reaches it.', fb: 'The electrode\'s current fades within a millimetre or two. The impulse regenerates itself, full size, for the remaining centimetres.' },
            { t: 'Na⁺ ions travel along inside the fibre to the next patch.', fb: 'The ions themselves barely move along; it is the voltage change that spreads, far faster than any ion.' },
          ] },
        },
        {
          view: 'fibreWave', title: 'Why only outward?',
          text: `<p>Shock again and watch the channels <b>behind</b> the wave.</p>`,
          actions: [{ label: 'Shock the middle', cls: 'na', run: (c) => { if (!readyToShock(c)) return; setPaused(false); sim.shock(1.5); } }],
          question: { prompt: 'Why does the wave not turn around?', options: [
            { t: 'Behind it the Na⁺ channels are inactivated (refractory).', ok: true, fb: 'The plugged channels leave the wave only one way to go: onward.' },
            { t: 'It has used up the Na⁺.', fb: 'Concentrations barely change. It is the channels\' inactivation gate, not the supply.' },
            { t: 'The K⁺ channels behind it block the way.', fb: 'Open K⁺ channels do pull Vm down, but what stops a second spike is that the Na⁺ channels cannot reopen yet. Watch the channel states behind the wave.' },
          ] },
        },
        {
          view: 'fibreWave', title: 'Down the tubes',
          text: `<p>The fibre is 50 µm thick. The openings drawn under each segment are the <b>T-tubules</b>: they light when the tubule wall has depolarized. Shock once more.</p>`,
          question: { prompt: 'The fibre is 50 µm thick. How does the inside hear about an impulse on the surface?', options: [
            { t: 'The T-tubules carry the surface membrane, and the impulse, deep inside.', ok: true, fb: 'Watch every tubule opening light up as the wave passes over it.' },
            { t: 'Na⁺ diffuses to the middle.', fb: 'Far too slow, and the concentration change is tiny. The <i>membrane itself</i> folds inward as T-tubules, so every myofibril has a piece of the excited surface next to it.' },
            { t: 'The impulse runs through the middle of the fibre like current in a wire.', fb: 'The impulse lives only in the membrane; the middle has no channels. The membrane has to come to it.' },
          ] },
          actions: [{ label: 'Shock the middle', cls: 'na', run: (c) => { if (!readyToShock(c)) return; setPaused(false); sim.resetPeaks(); sim.shock(1.5); c.stepState().data.seen = new Set(); } }],
          tick: (c) => { const d = c.stepState().data; if (!d.seen) return; for (const s of sim.comps) if (s.dPeak > 0.3) d.seen.add(s.name); },
          waitFor: (c) => { const d = c.stepState().data; return !!d.seen && d.seen.size === sim.comps.length; }, waitHint: 'Shock and watch every tubule light up',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? '<b>Observed:</b> the tubule wall depolarized in every segment. Next: what that does inside.' : `Tubules reached: ${d.seen ? d.seen.size : 0} of ${sim.comps.length} · ${vm('R3')}`; },
        },
      ],
    });

    // ------------------------------------------------------------- 8. voltage to calcium (triad)
    scenes.push({
      id: 'triad', title: 'Voltage to calcium', speed: 0.03, showThreshold: true,
      steps: [
        {
          view: 'triad', viewOpts: { caption: 'The triad: a T-tubule wall, the SR beside it with its Ca²⁺ store, and the edge of a myofibril.' }, reset: true, remount: true, record: 'R3', electrode: true,
          enter: () => { sim.setCaFreeBath(false); },
          title: 'Voltage to calcium',
          text: `<p>Inside the fibre the tubule wall runs right past the <b>sarcoplasmic reticulum (SR)</b>, the calcium store. A <b>voltage sensor</b> sits in the tubule wall; a <b>release channel</b> sits in the SR facing it.</p>`,
          question: { prompt: 'The T-tubule wall has depolarized. Where does the Ca²⁺ that floods the cytosol come from?', options: [
            { t: 'From the sarcoplasmic reticulum store.', ok: true, fb: 'The voltage sensor in the tubule wall physically opens the release channel in the SR next to it. No Ca²⁺ needs to cross the sarcolemma. Shock and watch the checklist.' },
            { t: 'From outside the fibre, through the T-tubule.', fb: 'Common mix-up. In skeletal muscle the voltage sensor pulls the SR channel open directly; the Ca²⁺ is already inside, in the store. Try the next activity.' },
            { t: 'From the mitochondria.', fb: 'Mitochondria can soak up Ca²⁺, but the store that releases within a couple of milliseconds is the SR.' },
          ] },
          actions: [{ label: 'Shock', cls: 'na', run: (c) => { setPaused(false); sim.shock(1.5); const d = c.stepState().data; d.shocked = true; d.caMax = 0; } }],
          tick: (c) => { const d = c.stepState().data; if (d.shocked) d.caMax = Math.max(d.caMax, sim.ca); },
          waitFor: (c) => { const d = c.stepState().data; return !!d.shocked && d.caMax > 1 && sim.ca < 0.8 * d.caMax; }, waitHint: 'Shock and watch the Ca²⁺ rise and fall',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>Observed:</b> cytosolic Ca²⁺ peaked at ${num(d.caMax, 1)} µM a few ms after the impulse, straight out of the store (store level now ${pct(sim.srLevel)}).` : `${vm('R3')} · Ca²⁺ ${sim.ca.toFixed(1)} µM · store ${pct(sim.srLevel)}`; },
        },
        {
          view: 'triad', title: 'The classic experiment: no Ca²⁺ outside',
          enter: () => { sim.setCaFreeBath(true); },
          text: `<p>We replace the Ca²⁺ in the fluid outside with Mg²⁺, the classic experiment (the Mg²⁺ keeps the Na⁺ channels behaving normally, so the only thing that has changed is where Ca²⁺ can come from). Shock again.</p>`,
          question: { prompt: 'Will it still contract?', options: [
            { t: 'Yes: the SR store is inside.', ok: true, fb: 'Shock and compare the force peak with the one before.' },
            { t: 'No: no calcium, no contraction.', fb: 'Watch. The sarcolemma still fires, the sensor still opens the SR, the store still releases. (Cardiac muscle is different, and needs extracellular Ca²⁺; that is a later module.)' },
            { t: 'Yes, but weaker: some Ca²⁺ normally comes in from outside.', fb: 'Compare the force peaks: identical. In skeletal muscle the twitch is fed entirely from the store.' },
          ] },
          actions: [{ label: 'Shock (Ca²⁺-free bath)', cls: 'na', run: (c) => { setPaused(false); sim.setCaFreeBath(true); sim.shock(1.5); c.stepState().data.shocked = true; } }],
          tick: (c, ev) => { const d = c.stepState().data; if (!d.shocked) return; for (const e of ev) if (e.type === 'twitch_peak') d.peak = e.force; },
          waitFor: (c) => c.stepState().data.peak != null, waitHint: 'Shock in the Ca²⁺-free bath',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>Observed:</b> force peak ${num(d.peak)} with no Ca²⁺ outside${ref.twitch ? ` (normal fluid: ${num(ref.twitch)})` : ''}. The store did it all.` : `Ca²⁺ outside: ${sim.conc.Ca.out} mM · ${live('R3')}`; },
        },
      ],
    });

    // ------------------------------------------------------------- 9. calcium to force (sarcomere)
    scenes.push({
      id: 'sarcomere', title: 'Calcium to force', speed: 0.03, showThreshold: true, bands: FORCE_BAND, historyMs: 600, window: 200,
      steps: [
        {
          view: 'sarcomere', viewOpts: { caption: 'One sarcomere: thin filaments with their cover, a thick filament with cross-bridges, and the force gauge.' }, reset: true, remount: true, record: 'R3', electrode: true,
          title: 'Calcium to force',
          text: `<p>The pulling is done by <b>myosin heads</b> on the thick filament grabbing <b>actin</b> on the thin filament and pulling: cross-bridges. At rest they cannot grab.</p>`,
          question: { prompt: 'At rest the myosin heads cannot grab actin. Ca²⁺ arrives. What has to change before a cross-bridge can form?', options: [
            { t: 'Something covering the binding sites on actin has to move aside.', ok: true, fb: 'Ca²⁺ binds <b>troponin</b>, which pulls <b>tropomyosin</b> off the sites. Shock and watch the cover slide.' },
            { t: 'Ca²⁺ has to switch the myosin heads on.', fb: 'The heads are ready all along; it is <i>actin</i> that is covered. Ca²⁺ works on the cover.' },
            { t: 'Ca²⁺ has to bind actin to make it sticky.', fb: 'Ca²⁺ never touches actin. It works on the switch (troponin) that holds the cover (tropomyosin).' },
          ] },
          actions: [{ label: 'Shock', cls: 'na', run: (c) => { setPaused(false); sim.shock(1.5); c.stepState().data.shocked = true; } }],
          tick: (c, ev) => { const d = c.stepState().data; if (!d.shocked) return; for (const e of ev) if (e.type === 'twitch_peak') d.peak = e.force; },
          waitFor: (c) => c.stepState().data.peak != null, waitHint: 'Shock and watch the bridges cycle',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>Observed:</b> Ca²⁺ bound troponin, the cover moved, bridges cycled; force peaked at ${num(d.peak)} about 35 ms after the impulse.` : live('R3'); },
        },
        {
          view: 'sarcomere', title: 'Letting go',
          actions: [{ label: 'Shock again', cls: 'na', run: () => { setPaused(false); sim.shock(1.5); } }],
          question: { prompt: 'A cross-bridge has pulled and is still stuck to actin. What does it need to let go?', options: [
            { t: 'A fresh ATP.', ok: true, fb: 'ATP binding detaches the head; splitting the ATP re-cocks it. Keep this for the relaxation scene.' },
            { t: 'Ca²⁺ leaving.', fb: 'Ca²⁺ leaving stops <i>new</i> attachments. A head that is already attached needs ATP to release.' },
            { t: 'Nothing: it lets go by itself after pulling.', fb: 'A head that has pulled stays bound until ATP arrives. That is why a fibre with no ATP locks.' },
          ] },
          status: () => live('R3'),
        },
        {
          view: 'sarcomere', title: 'What shortens?',
          actions: [{ label: 'Shock again', cls: 'na', run: () => { setPaused(false); sim.shock(1.5); } }],
          question: { prompt: 'What actually gets shorter?', options: [
            { t: 'The sarcomere: the filaments slide past each other.', ok: true, fb: 'Watch the Z lines move in while each filament keeps its length.' },
            { t: 'The filaments themselves.', fb: 'Neither filament changes length. They overlap more.' },
            { t: 'The whole fibre gets thinner and longer.', fb: 'The fibre gets <i>shorter</i> and fatter: every sarcomere in every myofibril shortens at once.' },
          ] },
          status: () => live('R3'),
        },
      ],
    });

    // ------------------------------------------------------------- 10. relaxation
    scenes.push({
      id: 'relax', title: 'Relaxation', speed: 0.03, showThreshold: true, bands: FORCE_BAND, historyMs: 600, window: 200,
      steps: [
        {
          view: 'triad', viewOpts: { caption: 'Back at the triad: the SERCA pump on the SR returns Ca²⁺ to the store.' }, reset: true, remount: true, record: 'R3', electrode: true,
          enter: () => { sim.atp = 1; },
          title: 'Relaxation',
          text: `<p>The impulse is long over, but the fibre is still pulling.</p>`,
          question: { prompt: 'What has to happen for it to relax?', options: [
            { t: 'Ca²⁺ must be pumped back into the SR.', ok: true, fb: 'The SERCA pump uses ATP to return Ca²⁺. Troponin lets go, tropomyosin covers actin, cross-bridges stop forming. Shock and watch the whole twitch.' },
            { t: 'The nerve (or the electrode) sends a \'stop\' signal.', fb: 'No signal is needed to relax. The command simply stops coming, and the fibre relaxes on its own as Ca²⁺ is pumped away. A muscle that cannot relax (rigor, malignant hyperthermia) is one where Ca²⁺ stays.' },
            { t: 'Ca²⁺ leaves the fibre.', fb: 'Almost none leaves. It goes back into the store, ready for the next twitch.' },
          ] },
          actions: [{ label: 'Shock', cls: 'na', run: (c) => { setPaused(false); sim.shock(1.5); const d = c.stepState().data; d.shocked = true; d.peak = null; d.relaxed = false; } }],
          tick: (c, ev) => { const d = c.stepState().data; if (!d.shocked) return; for (const e of ev) { if (e.type === 'twitch_peak') d.peak = e.force; if (e.type === 'relaxed' && d.peak != null) d.relaxed = true; } },
          waitFor: (c) => !!c.stepState().data.relaxed, waitHint: 'Shock and wait for the force to return to baseline',
          status: (c) => runner.state.done ? `<b>Observed:</b> force back to baseline, Ca²⁺ back in the store (level ${pct(sim.srLevel)}). No stop signal was needed.` : `${live('R3')} · store ${pct(sim.srLevel)} · ATP ${pct(sim.atp)}`,
        },
        {
          view: 'sarcomere', viewOpts: { caption: 'The same sarcomere with the ATP switched off.' }, remount: true, record: 'R3',
          enter: () => { sim.atp = 0; },
          title: 'No ATP',
          text: `<p>We switch the ATP off. The heads are already cocked from before.</p>`,
          question: { prompt: 'With no ATP, what happens after the twitch?', options: [
            { t: 'The fibre stays contracted: heads cannot detach and Ca²⁺ cannot be pumped back.', ok: true, fb: '<b>Rigor.</b> Rigor mortis is exactly this, hours after death when ATP runs out.' },
            { t: 'It cannot contract at all.', fb: 'Watch: it contracts once (the heads are already cocked, so attaching and pulling needs no new ATP) and then locks.' },
            { t: 'It relaxes normally; ATP is only for contracting.', fb: 'ATP is needed to <i>let go</i> and to <i>pump Ca²⁺ back</i>. No ATP means no relaxation.' },
          ] },
          actions: [{ label: 'Shock (no ATP)', cls: 'na', run: (c) => { setPaused(false); sim.atp = 0; sim.shock(1.5); c.stepState().data.t0 = sim.t; } }],
          waitFor: (c) => { const d = c.stepState().data; return d.t0 != null && sim.t > d.t0 + 100 && sim.force > 0.5 && sim.ca > 1; }, waitHint: 'Shock and watch what happens after the twitch',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>Rigor:</b> ${Math.round(sim.t - d.t0)} ms after the shock the force is still ${sim.force.toFixed(2)} and Ca²⁺ is still ${sim.ca.toFixed(1)} µM. Nothing can let go.` : `${live('R3')} · ATP ${pct(sim.atp)}${d.t0 != null ? ` · ${Math.round(sim.t - d.t0)} ms since the shock` : ''}`; },
        },
      ],
    });

    // ------------------------------------------------------------- 11. the twitch on one time axis
    const narrateTwitch = () => {
      const h = app.history, prev = h.length > 6 ? h[h.length - 6].x.force : 0, F = sim.force;
      const parts = [R3().V > -30 ? 'impulse' : 'impulse over', sim.ca > 0.5 ? 'Ca²⁺ still high' : 'Ca²⁺ back down', F > 0.03 ? (F >= prev ? 'force rising' : 'force falling') : 'relaxed'];
      return `${parts.join('; ')} · ${live('R3')}`;
    };
    // A stepped walk through a sequence that is over too quickly to read at full speed. The
    // simulation runs until the next phase has happened, then pauses and says what it was; the
    // student presses on for the next one. The full-speed run (the step before this) stays,
    // because seeing the phases overlap is the point of it — this is for reading them one at a
    // time. Phases are tested against the model's own per-integration-step peak records rather
    // than instantaneous state, so a phase that lasts a millisecond cannot be stepped over
    // between two animation frames however fast the clock is set.
    const phaseWalk = (phases, start) => ({
      speed: 0.004,
      enter: (c) => { app.userSpeed = null; setSpeed(0.004); c.stepState().data.m = freshMax(); },
      actions: [
        { label: 'Start', cls: 'na', run: (c) => { const d = c.stepState().data; d.i = 0; d.log = []; d.m = freshMax(); setPaused(false); start(c); c.refresh(); }, disabled: (c) => { const d = c.stepState().data; return d.i != null && d.i < phases.length; } },
        { label: 'Next phase →', cls: 'primary', run: (c) => { setPaused(false); c.refresh(); }, disabled: (c) => { const d = c.stepState().data; return d.i == null || d.i >= phases.length || !app.paused; } },
        { label: 'Start over', run: (c) => { const d = c.stepState().data; d.i = null; d.log = []; d.m = freshMax(); sim.cancelScheduled(); setPaused(true); c.refresh(); } },
      ],
      tick: (c, ev) => {
        const d = c.stepState().data;
        const m = d.m || (d.m = freshMax());
        // Every fast quantity comes from the model's own per-integration-step peak records, so no
        // phase can be stepped over between two animation frames however fast the clock is set.
        const r = R3();
        m.epV = sim.endplate.vPeak; m.v = r.vPeak; m.d = r.dPeak;
        m.ryr = r.ryrPeak; m.ca = r.caPeak; m.tn = r.tnPeak; m.force = Math.max(m.force, r.forcePeak, sim.force);
        for (const e of ev) if (e.type === 'twitch_peak') m.peaked = true;
        if (d.i == null || d.i >= phases.length || app.paused) return;
        if (!phases[d.i].test(m)) return;
        d.log.push(phases[d.i].say);
        c.mark(phases[d.i].mark || '');
        d.i++;
        setPaused(true);
        c.refresh();
      },
      waitFor: (c) => { const d = c.stepState().data; return d.i != null && d.i >= phases.length; },
      waitHint: 'Step through every phase',
      status: (c) => {
        const d = c.stepState().data;
        if (d.i == null) return 'Press <b>Start</b>: the fibre will run to the first phase and stop there.';
        const done = d.i >= phases.length;
        const head = done ? `<b>All ${phases.length} phases.</b> That whole chain is what "one shock, one twitch" means.`
          : `<b>Phase ${d.i} of ${phases.length}.</b> ${app.paused ? 'Press <b>Next phase</b> when you have read it.' : 'Running to the next phase…'}`;
        return `${head}<ol class="phases">${d.log.map((t, i) => `<li${i === d.log.length - 1 && !done ? ' class="now"' : ''}>${t}</li>`).join('')}</ol>`;
      },
    });
    const freshMax = () => ({ epV: -1e9, v: -1e9, d: 0, ryr: 0, ca: 0, tn: 0, force: 0, peaked: false });

    scenes.push({
      id: 'twitch', title: 'The twitch on one time axis', speed: 0.1, showThreshold: true, bands: BANDS, historyMs: 2000, window: 300,
      steps: [
        {
          view: 'fibre', viewOpts: { caption: 'The whole fibre with its force gauge. Below: Vm, cytosolic Ca²⁺ and force on one time axis.', labels: false, stimulator: true, showForce: true, electrodeAt: 'R3' }, reset: true, remount: true, record: 'R3', electrode: true, labels: false,
          title: 'One shock, three traces',
          text: `<p>You have built the chain. The three traces below now share one time axis: Vm, cytosolic Ca²⁺ and force. Time runs faster now (1 s ≈ 100 ms).</p>`,
          question: { prompt: 'In what order will the three traces move?', options: [
            { t: 'Vm → Ca²⁺ → force.', ok: true, fb: 'Shock once and check.' },
            { t: 'Ca²⁺ → Vm → force.', fb: 'Ca²⁺ is released because the tubule depolarized (scene 8); the spike has to come first.' },
            { t: 'Vm → force → Ca²⁺.', fb: 'Force needs Ca²⁺ on troponin (scene 9). Nothing pulls until Ca²⁺ is there.' },
          ] },
          actions: [{ label: 'Shock once', cls: 'na', run: () => { setPaused(false); sim.shock(1.5); } }],
          tick: (c, ev) => {
            const d = c.stepState().data;
            for (const e of ev) {
              if (e.type === 'shock') { if (d.seq && !d.seq.relaxed) d.seq.shocks++; else d.seq = { shocks: 1 }; }
              if (!d.seq) continue;
              if (e.type === 'spike' && e.name === 'R3') d.seq.spike = true;
              if (e.type === 'ca_release') d.seq.ca = true;
              if (e.type === 'twitch_peak') d.seq.peak = true;
              if (e.type === 'relaxed') d.seq.relaxed = true;
            }
          },
          waitFor: (c) => { const s = c.stepState().data.seq; return !!(s && s.shocks === 1 && s.spike && s.ca && s.peak && s.relaxed); }, waitHint: 'Shock once and let the twitch finish',
          status: (c) => { const s = c.stepState().data.seq; return runner.state.done ? '<b>One clean twitch:</b> impulse → Ca²⁺ → force → relaxed. Read the three durations off the traces.' : (s && s.shocks > 1 ? 'Two shocks overlapped; wait for the fibre to relax and shock once.' : narrateTwitch()); },
        },
        Object.assign({
          view: 'fibre', title: 'The same twitch, one phase at a time',
          text: `<p>That was the whole chain in about a second. Now walk it: the fibre stops at each
                 phase and waits for you. Watch which trace moves at each stop.</p>`,
        }, phaseWalk([
          { say: '<b>The shock.</b> Charge was pushed into the fibre at the end plate and Vm is climbing towards threshold.', test: (m) => m.epV > REST + 12, mark: 'shock' },
          { say: '<b>The impulse.</b> Voltage-gated Na⁺ channels opened; the spike is running along the sarcolemma in both directions.', test: (m) => m.v > -20, mark: 'impulse' },
          { say: '<b>Into the tubules.</b> The impulse has run down the T-tubules and the voltage sensors in the tubule wall have moved.', test: (m) => m.d > 0.5 },
          { say: '<b>The store opens.</b> The moved sensors have pulled open the release channels in the terminal cisternae next to them.', test: (m) => m.ryr > 0.3 },
          { say: '<b>Ca²⁺ floods out.</b> Cytosolic Ca²⁺ is climbing far above its resting level — look at the Ca²⁺ trace, not the Vm trace.', test: (m) => m.ca > 1.5, mark: 'Ca²⁺' },
          { say: '<b>Troponin catches it.</b> Ca²⁺ has bound troponin and tropomyosin has slid off the binding sites on actin.', test: (m) => m.tn > 0.55 },
          { say: '<b>Cross-bridges cycle.</b> Myosin heads are attaching, pulling, and letting go again with ATP. Force is rising.', test: (m) => m.force > 0.06 },
          { say: '<b>Peak force.</b> The impulse ended long ago; this is happening entirely because Ca²⁺ is still on troponin.', test: (m) => m.peaked || (m.force > 0.1 && sim.force < 0.94 * m.force), mark: 'peak' },
          { say: '<b>SERCA clears up.</b> The pumps are putting Ca²⁺ back in the store, and cytosolic Ca²⁺ is falling.', test: (m) => sim.ca < 0.6 && m.force > 0.08 },
          { say: '<b>Relaxed.</b> Troponin has let go, tropomyosin covers actin again, the bridges have stopped forming and the fibre is back where it started.', test: () => sim.force < 0.03 && sim.ca < 0.3, mark: 'relaxed' },
        ], () => { sim.resetPeaks(); sim.shock(1.5); })),
        {
          view: 'fibre', title: 'Which lasts longest?',
          actions: [{ label: 'Shock once', cls: 'na', run: () => { setPaused(false); sim.shock(1.5); } }],
          question: { prompt: 'Which lasts longest?', options: [
            { t: 'Force (about a hundred milliseconds).', ok: true, fb: 'The impulse is over in a millisecond or two; the force it launched lasts about a hundred. That gap is the key to the next scene.' },
            { t: 'The impulse.', fb: 'The spike is over in a millisecond or two; the force it launched lasts fifty times longer. This gap is the key to the next scene.' },
            { t: 'Ca²⁺.', fb: 'Ca²⁺ is back near baseline in a few tens of milliseconds; the bridges it launched keep cycling after it has gone.' },
          ] },
          status: () => {
            const h = app.history; if (h.length < 3) return live('R3');
            const dt = (h[h.length - 1].t - h[0].t) / (h.length - 1);
            const ms = (f) => Math.round(h.filter(f).length * dt);
            return `Measured on the trace: impulse ${ms(s => s.V.R3 > -30)} ms · Ca²⁺ above 0.5 µM ${ms(s => s.x.ca > 0.5)} ms · force above 0.03 ${ms(s => s.x.force > 0.03)} ms`;
          },
        },
      ],
    });

    // ------------------------------------------------------------- 12. summation and tetanus
    const rateOf = () => { const r = panel.querySelector('[data-role=rate]'); return r ? parseFloat(r.value) : 30; };
    const RATE_HTML = `<div class="row"><label>Stimulus rate <b data-role="rate-val">30 Hz</b></label><input type="range" data-role="rate" min="5" max="100" step="5" value="30" style="width:100%"></div>`;
    scenes.push({
      id: 'tetanus', title: 'Summation and tetanus', speed: 0.15, showThreshold: true, bands: BANDS, historyMs: 2000, window: 800,
      steps: [
        {
          view: 'fibre', viewOpts: { caption: 'Same fibre, same three traces, a longer time window.', labels: false, stimulator: true, showForce: true, electrodeAt: 'R3' }, reset: true, remount: true, record: 'R3', electrode: true, labels: false,
          title: 'A second shock during the twitch',
          text: `<p>Next you will fire two shocks <b>20 ms apart</b>: the second one lands while force from the first is still rising.</p>`,
          question: { prompt: 'Will there be a second impulse?', options: [
            { t: 'Yes: 20 ms is well past the refractory period.', ok: true, fb: 'Continue and fire the pair.' },
            { t: 'No, it is still contracting.', fb: 'Contracting is about Ca²⁺ and cross-bridges; the <i>membrane</i> recovered long ago.' },
            { t: 'No: it is refractory until the twitch is over.', fb: 'The refractory period is a few milliseconds, the twitch a hundred. Watch the Vm trace: two full spikes.' },
          ] },
        },
        {
          view: 'fibre', title: 'Summation',
          text: `<p>Fire the pair. If you want a single twitch to compare against, shock once first.</p>`,
          question: { prompt: 'Will the second twitch add to the first?', options: [
            { t: 'Yes: the second Ca²⁺ release lands on top of what is left of the first.', ok: true, fb: '<b>Summation.</b> The pump had not finished clearing the first release.' },
            { t: 'No: all-or-none.', fb: 'All-or-none is a rule about the <i>impulse</i>. Force is not all-or-none; it depends on how much Ca²⁺ is on the filaments right now.' },
            { t: 'No: the store was emptied by the first impulse.', fb: 'Each impulse releases only a fraction of the store, and SERCA is refilling it. Watch the SR level: it never runs dry.' },
          ] },
          actions: [
            { label: 'Shock once', cls: 'na', run: () => { setPaused(false); sim.shock(1.5); } },
            { label: 'Shock twice, 20 ms apart', cls: 'na', run: (c) => { setPaused(false); sim.pair(20, 1.5); const d = c.stepState().data; d.pairT = sim.t; d.spikes = 0; d.peak = null; } },
          ],
          tick: (c, ev) => { const d = c.stepState().data; if (d.pairT == null) return; for (const e of ev) { if (e.type === 'spike' && e.name === 'R3') d.spikes++; if (e.type === 'twitch_peak' && d.spikes >= 2) d.peak = Math.max(d.peak || 0, e.force); } },
          waitFor: (c) => { const d = c.stepState().data; return d.pairT != null && d.spikes >= 2 && ref.twitch != null && d.peak != null && d.peak > 1.3 * ref.twitch; }, waitHint: 'Fire the pair (and a single twitch to compare)',
          status: (c) => { const d = c.stepState().data; const tw = ref.twitch ? `single twitch ${num(ref.twitch)}` : 'shock once first to measure a single twitch'; return runner.state.done ? `<b>Observed:</b> two full impulses, and the force peaked at ${num(d.peak)}: ${ratio(d.peak, ref.twitch)}× a single twitch.` : `${tw}${d.spikes ? ` · impulses since the pair: ${d.spikes}` : ''} · ${live('R3')}`; },
        },
        {
          view: 'fibre', title: 'Raise the rate',
          text: `<p>Set a stimulus rate and fire a train for half a second. Watch the force gauge and the Ca²⁺ trace as you raise the rate.</p>`,
          extraHtml: RATE_HTML,
          question: { prompt: 'At a high enough rate the force becomes smooth and maximal. Why?', options: [
            { t: 'Ca²⁺ never gets pumped back between impulses, so troponin stays saturated.', ok: true, fb: '<b>Tetanus</b> (fused). Every ordinary movement you make is built from unfused or partly fused tetani, not single twitches; a fully fused tetanus like this one is the ceiling.' },
            { t: 'The impulses have summed into one big impulse.', fb: 'Look at the Vm trace: the spikes are still separate and the same size. It is the Ca²⁺ and the force that fuse.' },
            { t: 'The fibre has gone into rigor.', fb: 'Stop the shocks and it relaxes: ATP is fine. Rigor is force with <i>no</i> impulses; this is force from too many.' },
          ] },
          actions: [
            { label: 'Shock once', cls: 'na', run: () => { setPaused(false); sim.shock(1.5); } },
            { label: 'Train at this rate for 0.5 s', cls: 'na', run: (c) => { setPaused(false); const hz = rateOf(); sim.cancelScheduled(); sim.train(hz, Math.max(2, Math.round(hz * 0.5)), 1.5); c.stepState().data.hz = hz; } },
            { label: 'Stop', run: () => { sim.cancelScheduled(); } },
          ],
          tick: (c, ev) => { const d = c.stepState().data; for (const e of ev) if (e.type === 'tetanus_fused') { d.fusedAt = e.force; d.fusedHz = d.hz; } },
          waitFor: (c) => { const d = c.stepState().data; return d.fusedAt != null && (ref.twitch == null || d.fusedAt > 2.2 * ref.twitch); }, waitHint: 'Raise the rate until the force fuses',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>Fused tetanus</b> at ${d.fusedHz || '—'} Hz: force ${num(d.fusedAt)}${ref.twitch ? ` (${ratio(d.fusedAt, ref.twitch)}× a twitch)` : ''}, ripple under 10 %, spikes still separate.` : `${d.hz ? `last train ${d.hz} Hz · ` : ''}${sim.isFused ? 'fused · ' : ''}${live('R3')} · store ${pct(sim.srLevel)}`; },
        },
      ],
    });

    // ------------------------------------------------------------- 13. how the body delivers the shock (neuromuscular junction)
    const send = (c) => {
      if (sim.endplate.V > REST + 5 || sim.receptor.r > 0.05) { c.status('The end plate is still recovering from the last command. Wait for it to return to rest, then send again.', false); return; }
      setPaused(false); sim.terminal.vesicles = 1; sim.command(); const d = c.stepState().data; d.sent = true; d.sentT = sim.t;
    };
    scenes.push({
      id: 'nmj', title: 'How the body delivers the shock', speed: 0.003, showThreshold: true, bands: FORCE_BAND, historyMs: 600, window: 60,
      steps: [
        {
          view: 'nmj', viewOpts: { caption: 'The neuromuscular junction: the motor nerve\'s terminal above, the gap, the folded end plate below.' }, reset: true, remount: true, record: 'endplate', electrode: true,
          enter: () => { sim.naBlock = 0; sim.receptor.block = 0; },
          title: 'The nerve ending on the end plate',
          text: `<p>In the body nobody holds an electrode. A motor nerve ends in a <b>terminal</b> pressed against the end plate, with a narrow gap between. Its own impulse (a <b>command</b>) arrives from the left. The terminal membrane has voltage-gated ${I('Ca')} channels; Ca²⁺ is 2 mM outside and almost absent inside.</p>`,
          question: { prompt: 'When the command arrives, Ca²⁺ channels in the terminal open. Which way will Ca²⁺ move?', options: [
            { t: 'Into the terminal.', ok: true, fb: 'This is a different Ca²⁺ from the SR store: it is outside the nerve, and it triggers the release of packets of <b>acetylcholine (ACh)</b> into the gap. Send a command; the sim pauses as the Ca²⁺ enters.' },
            { t: 'Out of the terminal.', fb: 'Ca²⁺ is 2 mM outside and almost absent inside. Down the gradient means in.' },
            { t: 'It does not move; the terminal is not part of the fibre.', fb: 'It is not, but it has its own channels and its own gradient. Watch.' },
          ] },
          actions: [{ label: 'Send command', cls: 'ca', run: send }],
          tick: (c) => { const d = c.stepState().data; if (d.sent && !runner.state.done && sim.caState(sim.terminal) === 'open' && sim.terminal.iCa < -0.2) { c.complete(); setPaused(true); c.mark('Ca²⁺ in'); } },
          waitFor: () => false, waitHint: 'Send a command',
          status: () => runner.state.done ? `<b>Paused:</b> the terminal's Ca²⁺ channels are open and Ca²⁺ is entering (terminal Ca²⁺ ${sim.terminal.ca.toFixed(1)} µM). Continue to watch what it does.` : `Terminal Vm = ${fmtV(sim.nerveV)} mV · ${vm('endplate')}`,
        },
        {
          view: 'nmj', title: 'Packets of ACh',
          text: `<p>Ca²⁺ inside the terminal makes packets (<b>vesicles</b>) of <b>acetylcholine (ACh)</b> fuse with its membrane and spill into the gap. ACh crosses the gap and binds <b>receptors</b> on the end plate. The sim pauses again when the receptors have bound it.</p>`,
          actions: [{ label: 'Send command', cls: 'ca', run: send }],
          tick: (c) => { if (!runner.state.done && sim.receptorState() === 'open') { c.complete(); setPaused(true); c.mark('ACh bound'); } },
          waitFor: () => false, waitHint: 'Watch the ACh cross the gap',
          status: () => runner.state.done ? '<b>Paused:</b> ACh has bound the receptors; they are opening.' : `Cleft ACh ${sim.terminal.nt.toFixed(2)} · receptors ${sim.receptorState()} · ${vm('endplate')}`,
        },
        {
          view: 'nmj', title: 'Predict: the receptors open', pause: true,
          enter: () => { sim.naBlock = 0; },
          text: `<p>Paused. ACh is bound.</p>`,
          question: { prompt: 'The receptors are channels that let Na⁺ in and some K⁺ out. What will the end plate\'s Vm do?', options: [
            { t: 'Depolarize.', ok: true, fb: 'Net positive charge in = up. This depolarization is the <b>end-plate potential</b>.' },
            { t: 'Hyperpolarize: K⁺ is leaving.', fb: 'More Na⁺ comes in than K⁺ goes out; the channel\'s balance point is near 0 mV, far above −85.' },
            { t: 'No change: Na⁺ in and K⁺ out cancel.', fb: 'At −85 mV the pull on Na⁺ is far stronger than on K⁺. Watch the ladder.' },
          ] },
          onContinue: () => { setPaused(false); },
        },
        {
          view: 'nmj', title: 'The end-plate potential by itself',
          enter: () => { sim.naBlock = 1; },
          text: `<p>To see what the receptors do on their own we have temporarily switched off the fibre's Na⁺ channels. Send a command.</p>`,
          actions: [{ label: 'Send command', cls: 'ca', run: (c) => { sim.naBlock = 1; send(c); } }],
          tick: (c, ev) => { const d = c.stepState().data; if (!d.sent) return; for (const e of ev) if (e.type === 'epp_peak' && sim.naBlock === 1) d.epp = e.V; },
          waitFor: (c) => c.stepState().data.epp != null, waitHint: 'Send a command with the Na⁺ channels off',
          onContinue: () => { sim.naBlock = 0; },
          status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>End-plate potential:</b> the receptors alone pushed Vm to ${d.epp == null ? '—' : fmtV(d.epp)} mV, about ${ratio(d.epp - REST, THR - REST)}× as far as threshold needs.` : `Na⁺ channels off · ${vm('endplate')}`; },
        },
        {
          view: 'nmj', title: 'One command', speed: 0.1, window: 300,
          enter: () => { sim.naBlock = 0; },
          text: `<p>The fibre's Na⁺ channels are back on.</p>`,
          question: { prompt: 'Will one command fire the fibre?', options: [
            { t: 'Yes, every time.', ok: true, fb: 'The end-plate potential is about twice what threshold needs. The junction is built with a wide safety margin.' },
            { t: 'Only if several commands add up.', fb: 'That is how <i>nerve cells</i> decide (next module). The muscle fibre is built to obey a single command: watch.' },
            { t: 'Only if the command is strong enough.', fb: 'Commands are all-or-none impulses too; every one releases the same big dose of ACh.' },
          ] },
          actions: [{ label: 'Send command', cls: 'ca', run: (c) => { sim.naBlock = 0; send(c); } }],
          tick: (c, ev) => { const d = c.stepState().data; if (!d.sent) return; for (const e of ev) { if (e.type === 'spike' && e.name === 'R3') d.spike = true; if (e.type === 'twitch_peak' && d.spike) d.peak = e.force; } },
          waitFor: (c) => { const d = c.stepState().data; return !!d.spike && d.peak != null; }, waitHint: 'Send a command and watch the fibre',
          status: (c) => { const d = c.stepState().data; return runner.state.done ? `<b>Observed:</b> command → end-plate potential → impulse → twitch (peak ${num(d.peak)}). One command, one twitch.` : live('endplate'); },
        },
        {
          view: 'nmj', title: 'Switching it off',
          actions: [{ label: 'Send command', cls: 'ca', run: (c) => send(c) }],
          question: { prompt: 'What stops the signal, so the fibre can be commanded again a few ms later?', options: [
            { t: 'An enzyme in the gap (acetylcholinesterase) breaks ACh down.', ok: true, fb: 'Within a millisecond the ACh is gone and the receptors close. Watch the enzyme glyphs in the gap.' },
            { t: 'The receptors get tired.', fb: 'They close within a millisecond of ACh leaving. Something has to remove the ACh: an enzyme does.' },
            { t: 'ACh diffuses back into the terminal.', fb: 'Some of the pieces are taken back up, but the fast removal is destruction in the gap.' },
          ] },
          status: () => `Cleft ACh ${sim.terminal.nt.toFixed(2)} · ${live('endplate')}`,
        },
        {
          view: 'nmj', title: 'Block half the receptors',
          enter: () => { sim.receptor.block = 0.5; },
          text: `<p>We block half the receptors (a grey plug on half the glyphs).</p>`,
          question: { prompt: 'Will the fibre still twitch?', options: [
            { t: 'Yes, a full-size twitch.', ok: true, fb: 'Half the receptors are gone, but the end-plate potential shrinks by much less than half: the open receptors were already pulling Vm most of the way toward 0 mV, so losing some of them costs little. That is why it takes losing about three quarters before the impulse fails. This margin is why myasthenia gravis and neuromuscular blockers show nothing at first and then weakness. Explore this in the Lab.' },
            { t: 'No: half the signal is gone.', fb: 'Half the receptors, but not half the end-plate potential (watch the ladder), and the impulse only needs threshold.' },
            { t: 'Yes, but a half-size twitch.', fb: 'The end-plate potential is smaller, but the impulse is all-or-none and the Ca²⁺ release and force follow the impulse, not the end-plate potential. Compare the two force peaks: identical.' },
          ] },
          actions: [
            { label: 'Send command (half blocked)', cls: 'ca', run: (c) => { if (sim.force > 0.03) { c.status('Wait for the fibre to relax first (force must be back to zero), so the two twitches can be compared.', false); return; } sim.receptor.block = 0.5; send(c); c.stepState().data.pending = 'blocked'; } },
            { label: 'Control: all receptors', cls: 'ca', run: (c) => { if (sim.force > 0.03) { c.status('Wait for the fibre to relax first (force must be back to zero), so the two twitches can be compared.', false); return; } sim.receptor.block = 0; setPaused(false); sim.terminal.vesicles = 1; sim.command(); const d = c.stepState().data; d.pending = 'control'; d.restoreAt = sim.t + 150; } },
          ],
          tick: (c, ev) => {
            const d = c.stepState().data;
            if (d.restoreAt != null && sim.t > d.restoreAt) { sim.receptor.block = 0.5; d.restoreAt = null; }
            for (const e of ev) if (e.type === 'twitch_peak') { if (d.pending === 'blocked') d.blocked = e.force; else if (d.pending === 'control') d.control = e.force; }
          },
          waitFor: (c) => { const d = c.stepState().data; const ctl = d.control != null ? d.control : ref.twitch; return d.blocked != null && ctl != null && Math.abs(d.blocked - ctl) < 0.05 * ctl; }, waitHint: 'Send a command with half the receptors blocked',
          status: (c) => { const d = c.stepState().data; const ctl = d.control != null ? d.control : ref.twitch; return runner.state.done ? `<b>Observed:</b> twitch peak ${num(d.blocked)} with half the receptors blocked, ${num(ctl)} with all of them: within 5 %.` : `Receptors blocked: ${pct(sim.receptor.block)} · ${ctl != null ? `control twitch ${num(ctl)} · ` : 'no control twitch yet: press Control first · '}${live('endplate')}`; },
        },
      ],
    });

    // ------------------------------------------------------------- 14. grading force (optional: needs the motorUnit view)
    // NOTE: written against the optional `motorUnit` view contract (recruit(n), rate(hz)); it is only
    // added when views/muscle.js provides that view, and must be checked live at integration.
    if (kit.views.motorUnit) {
      scenes.push({
        id: 'motorunit', title: 'Grading force', speed: 0.15, showThreshold: true, bands: FORCE_BAND, historyMs: 2000, window: 1000,
        steps: [{
          view: 'motorUnit', viewOpts: { caption: 'One muscle, three motor units of different size.' }, reset: true, remount: true, record: 'R3', electrode: false,
          title: 'Motor units',
          text: `<p>One motor nerve cell branches to many fibres, and they always fire together: a <b>motor unit</b>. This muscle has three, of different sizes.</p>`,
          question: { prompt: 'A gentle pull and a strong pull from the same muscle. What is different?', options: [
            { t: 'More units are switched on, and each fires faster.', ok: true, fb: 'Two dials: how many units, how fast each fires. Try both.' },
            { t: 'Each fibre contracts harder.', fb: 'A fibre\'s impulse is all-or-none. Its force rises only with rate (scene 12); the rest comes from adding units.' },
            { t: 'The impulses get bigger.', fb: 'Look at the Vm trace as you raise force: same spike every time.' },
          ] },
          extraHtml: RATE_HTML.replace('value="30"', 'value="10"').replace('30 Hz', '10 Hz'),
          actions: [1, 2, 3].map(n => ({ label: `Recruit ${n} unit${n > 1 ? 's' : ''}`, cls: 'na', run: (c) => { const d = c.stepState().data; d.units = n; c.view().recruit(n); const hz = rateOf(); if (c.view().rate) c.view().rate(hz); sim.cancelScheduled(); sim.commandTrain(hz, Math.round(hz)); d.maxHz = Math.max(d.maxHz || 0, hz); } })).concat([{ label: 'Stop', run: (c) => { sim.cancelScheduled(); c.view().recruit(0); } }]),
          waitFor: (c) => { const d = c.stepState().data; return d.units === 3 && d.maxHz >= 30; }, waitHint: 'Recruit all three units and raise the rate to 30 Hz or more',
          status: (c) => { const d = c.stepState().data; return d.units ? `Small units are recruited first, large ones last (the size principle), so fine control comes before brute force. · units ${d.units} · ${live('R3')}` : live('R3'); },
        }],
      });
    }
    // The last scene opens the Lab.
    const lastScene = scenes[scenes.length - 1], lastStep = lastScene.steps[lastScene.steps.length - 1];
    lastStep.continueLabel = 'Open the Lab →'; lastStep.continueTo = () => enterLab();
    return scenes;
  }

  // =========================================================================
  // Free-play lab (config.lab: the generic shell resets the sim, then calls this)
  // =========================================================================
  const labSchedule = [];               // { at: sim time, fn } run by the lab loop
  let labToken = 0;
  const controls = [];                  // { sync() } to refresh widgets from the model
  const syncControls = () => { for (const c of controls) c.sync(); };
  const later = (ms, fn) => { labSchedule.push({ at: sim.t + ms, fn }); };
  let thrTimer = null, thrEl = null, thrDirty = true, thrLast = 0;

  function lab(kit) {
    bind(kit);
    app.electrode = true; app.labels = true; app.recordComp = 'endplate'; app.extraTraces = ['R3'];
    app.bands = BANDS; app.historyMs = 2400; app.historyWindow = 800;
    $('#trace').classList.add('with-bands'); $('#trace').style.setProperty('--bands', '2');
    setSpeed(0.1); setPaused(false);
    labSchedule.length = 0; controls.length = 0; thrDirty = true;
    mountView('fibre', { caption: 'Lab: every control of the model. Change one thing, predict, then look.', labels: true, stimulator: true, showForce: true, electrodeAt: 'R3' });
    renderLab();
    const token = ++labToken;
    (function loop() {
      if (!runner.labMode || token !== labToken) return;
      for (let i = labSchedule.length - 1; i >= 0; i--) if (labSchedule[i].at <= sim.t) { const s = labSchedule.splice(i, 1)[0]; s.fn(); }
      const drifting = !sim.pumpOn || sim.agonist > 0;
      const now = performance.now();
      if (thrEl && (thrDirty || (drifting && now - thrLast > 2500)) && now - thrLast > 500) { thrDirty = false; thrLast = now; const v = sim.thresholdStrength(); thrEl.textContent = v > 10 ? 'no shock fires the fibre' : `${Math.round(v * 100)} % of the reference shock`; }
      for (const c of controls) if (c.live) c.live();
      requestAnimationFrame(loop);
    })();
  }
  const markThr = () => { thrDirty = true; };

  function renderLab() {
    panel.innerHTML = '';
    panel.appendChild(htmlEl('div', { class: 'scene-label' }, 'Free-play lab'));
    panel.appendChild(htmlEl('h2', {}, 'Experiment with the fibre'));
    panel.appendChild(htmlEl('div', { class: 'text' }, '<p>The same simulation the lesson used. Change one thing at a time and watch the three traces. The scenario cards at the bottom set the controls for you: predict before you press Run.</p>'));
    const lab = htmlEl('div', { class: 'lab' });
    controls.length = 0;
    const row = (label, input, valEl) => { const r = htmlEl('div', { class: 'row' }); r.appendChild(htmlEl('label', {}, label)); r.appendChild(input); if (valEl) r.appendChild(valEl); lab.appendChild(r); return r; };
    const slider = (label, min, max, step, get, set, fmt, onChange) => {
      const inp = htmlEl('input', { type: 'range', min, max, step }); inp.value = get();
      const val = htmlEl('span', { class: 'val' }, fmt(get()));
      inp.addEventListener('input', () => { set(parseFloat(inp.value)); val.textContent = fmt(parseFloat(inp.value)); if (onChange) onChange(); });
      controls.push({ sync: () => { inp.value = get(); val.textContent = fmt(get()); } });
      row(label, inp, val);
      return inp;
    };
    const check = (label, get, set, onChange) => {
      const cb = htmlEl('input', { type: 'checkbox' }); cb.checked = get();
      cb.addEventListener('change', () => { set(cb.checked); if (onChange) onChange(); });
      controls.push({ sync: () => { cb.checked = get(); } });
      row(label, cb);
      return cb;
    };
    const buttons = (list) => { const a = htmlEl('div', { class: 'actions' }); for (const [label, cls, fn] of list) { const b = htmlEl('button', { class: cls || '' }, label); b.addEventListener('click', fn); a.appendChild(b); } lab.appendChild(a); return a; };
    const setView = (v) => {
      if (v === 'fibre') { mountView('fibre', { caption: 'Lab: whole fibre', labels: true, stimulator: true, showForce: true, electrodeAt: 'R3' }); }
      else if (v === 'fibreWave') { mountView('fibreWave', { caption: 'Lab: the fibre unrolled', showTubules: true }); }
      else if (v.startsWith('membrane-')) { const c = v.split('-')[1]; mountView('membrane', { comp: c, inset: c, channels: c === 'endplate' ? ['K_leak', 'Na_leak', 'pump', 'Na_v', 'K_v', 'Na_manual', 'K_manual', 'Cl_manual'] : ['Na_v', 'K_v', 'Na_v', 'K_v', 'K_leak'], caption: 'Lab: sarcolemma at the ' + (c === 'endplate' ? 'end plate' : c) }); }
      else if (v === 'triad') mountView('triad', { caption: 'Lab: triad' });
      else if (v === 'sarcomere') mountView('sarcomere', { caption: 'Lab: sarcomere' });
      else if (v === 'nmj') mountView('nmj', { caption: 'Lab: neuromuscular junction' });
      viewSel.value = v;
    };

    // ---- view (the smoke test drives the first select in .lab)
    lab.appendChild(htmlEl('h3', {}, 'View'));
    const viewSel = htmlEl('select');
    [['fibre', 'Whole fibre'], ['fibreWave', 'Fibre unrolled (propagation)'], ['membrane-endplate', 'Membrane (end plate)'], ['membrane-R3', 'Membrane (5 mm away)'], ['triad', 'Triad (tubule + SR)'], ['sarcomere', 'Sarcomere'], ['nmj', 'Neuromuscular junction']].forEach(([v, t]) => viewSel.appendChild(htmlEl('option', { value: v }, t)));
    viewSel.addEventListener('change', () => setView(viewSel.value));
    row('Show', viewSel);

    // ---- shocks
    lab.appendChild(htmlEl('h3', {}, 'Shock (stimulating electrode)'));
    const st = { strength: 1.5, site: 'endplate', interval: 20, rate: 30, cmdRate: 10 };
    slider('Shock strength (% of reference)', 10, 300, 10, () => st.strength * 100, (v) => { st.strength = v / 100; }, (v) => v + ' %');
    const site = htmlEl('select'); [['endplate', 'end plate'], ['end', 'far end of the fibre']].forEach(([v, t]) => site.appendChild(htmlEl('option', { value: v }, t))); site.addEventListener('change', () => { st.site = site.value; }); row('Shock site', site);
    slider('Pair interval (ms)', 2, 60, 1, () => st.interval, (v) => { st.interval = v; }, (v) => v + ' ms');
    slider('Train rate (Hz)', 5, 100, 5, () => st.rate, (v) => { st.rate = v; }, (v) => v + ' Hz');
    buttons([
      ['Shock once', 'na', () => sim.shock(st.strength, 0.5, st.site)],
      ['Shock twice', 'na', () => sim.pair(st.interval, st.strength, st.site)],
      ['Train 0.5 s', 'na', () => sim.train(st.rate, Math.max(2, Math.round(st.rate * 0.5)), st.strength, st.site)],
      ['Stop', '', () => sim.cancelScheduled()],
    ]);

    // ---- nerve
    lab.appendChild(htmlEl('h3', {}, 'Nerve command'));
    slider('Command rate (Hz)', 1, 50, 1, () => st.cmdRate, (v) => { st.cmdRate = v; }, (v) => v + ' Hz');
    buttons([
      ['Send command', 'ca', () => sim.command()],
      ['Command train 1 s', 'ca', () => sim.commandTrain(st.cmdRate, Math.max(2, Math.round(st.cmdRate)))],
      ['Stop', '', () => sim.cancelScheduled()],
    ]);
    check('Motor nerve connected (fires on its own when Ca²⁺ or Mg²⁺ outside is low)', () => sim.nerveEnabled, (v) => { sim.nerveEnabled = v; });

    // ---- junction
    lab.appendChild(htmlEl('h3', {}, 'The junction'));
    slider('Receptors blocked (rocuronium; 0 = sugammadex)', 0, 100, 5, () => sim.receptor.block * 100, (v) => { sim.receptor.block = v / 100; }, (v) => v + ' %');
    slider('Receptor density (myasthenia)', 5, 100, 5, () => sim.receptorDensity * 100, (v) => { sim.receptorDensity = v / 100; }, (v) => v + ' %');
    slider('AChE activity (1 normal · 0.3 neostigmine · 0.05 overdose · 0 organophosphate)', 0, 1, 0.05, () => sim.acheActivity, (v) => { sim.acheActivity = v; }, (v) => v.toFixed(2));
    check('Persistent agonist (succinylcholine)', () => sim.agonist > 0, (v) => { sim.agonist = v ? 0.6 : 0; }, markThr);
    slider('Terminal Ca²⁺ channels blocked', 0, 100, 5, () => sim.terminal.caBlock * 100, (v) => { sim.terminal.caBlock = v / 100; }, (v) => v + ' %');
    check('Release blocked (botulinum toxin)', () => sim.releaseBlock >= 1, (v) => { sim.releaseBlock = v ? 1 : 0; });

    // ---- store and filaments
    lab.appendChild(htmlEl('h3', {}, 'Store and filaments'));
    slider('SR release channel leak (malignant hyperthermia)', 0, 1, 0.05, () => sim.ryrLeak, (v) => { sim.ryrLeak = v; }, (v) => v.toFixed(2));
    slider('Dantrolene', 0, 1, 0.05, () => sim.dantrolene, (v) => { sim.dantrolene = v; }, (v) => v.toFixed(2));
    check('ATP available (off = rigor)', () => sim.atp > 0, (v) => { sim.atp = v ? 1 : 0; sim.atpDecline = 0; });

    // ---- bath
    lab.appendChild(htmlEl('h3', {}, 'Fluid outside (bath / plasma)'));
    slider('Extracellular K⁺ (mM)', 2, 14, 0.5, () => sim.conc.K.out, (v) => { sim.conc.K.out = v; }, (v) => v.toFixed(1) + ' mM', markThr);
    slider('Extracellular Na⁺ (mM)', 60, 200, 5, () => sim.conc.Na.out, (v) => { sim.conc.Na.out = v; }, (v) => v.toFixed(0) + ' mM', markThr);
    slider('Extracellular Ca²⁺ (mM)', 0, 4, 0.1, () => sim.conc.Ca.out, (v) => { sim.conc.Ca.out = v; }, (v) => v.toFixed(1) + ' mM', markThr);
    slider('Extracellular Mg²⁺ (mM)', 0, 8, 0.5, () => sim.conc.Mg.out, (v) => { sim.conc.Mg.out = v; }, (v) => v.toFixed(1) + ' mM', markThr);
    check('Ca²⁺-free bath (Ca²⁺ replaced by Mg²⁺)', () => sim.conc.Ca.out === 0 && sim.conc.Mg.out > 1, (v) => { sim.setCaFreeBath(v); syncControls(); }, markThr);

    // ---- membrane
    lab.appendChild(htmlEl('h3', {}, 'Membrane'));
    slider('Block voltage-gated Na⁺ channels (TTX)', 0, 100, 5, () => sim.naBlock * 100, (v) => { sim.naBlock = v / 100; }, (v) => v + ' %', markThr);
    check('Na⁺/K⁺ pump running (off = gradients run down, accelerated)', () => sim.pumpOn, (v) => { sim.pumpOn = v; sim.pumpRundownRate = v ? 0 : 0.02; }, markThr);
    const manual = htmlEl('div', { class: 'actions' });
    for (const [key, cls, label, g] of [['gNa', 'na', 'Hold: open Na⁺ channels', 0.9], ['gK', 'k', 'Hold: open K⁺ channels', 6], ['gCl', 'cl', 'Hold: open Cl⁻ channels', 6]]) {
      const b = htmlEl('button', { class: cls }, label);
      const down = (e) => { e.preventDefault(); sim.manual[key] = g; b.classList.add('held'); }, up = () => { sim.manual[key] = 0; b.classList.remove('held'); };
      b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      manual.appendChild(b);
    }
    lab.appendChild(manual);

    // ---- recording and readouts
    lab.appendChild(htmlEl('h3', {}, 'Recording'));
    const rec = htmlEl('select');
    [['endplate', 'end plate'], ['R3', '5 mm from the end plate (R3)'], ['mid', 'half way (R4)'], ['R8', 'far end (R8)'], ['L8', 'other end (L8)'], ['nerve', 'motor terminal']].forEach(([v, t]) => rec.appendChild(htmlEl('option', { value: v }, t)));
    rec.value = app.recordComp; rec.addEventListener('change', () => { app.recordComp = rec.value; $('#trace-title').textContent = profile.traceTitle(app.recordComp, app.extraTraces); });
    controls.push({ sync: () => { rec.value = app.recordComp; } });
    row('Electrode in', rec);
    const thrRow = htmlEl('div', { class: 'row' }); thrRow.appendChild(htmlEl('label', {}, 'Threshold strength (measured by the model)')); thrEl = htmlEl('span', { class: 'val', style: 'width:auto' }, 'measuring…'); thrRow.appendChild(thrEl); lab.appendChild(thrRow);
    const readout = htmlEl('div', { class: 'status' }, '');
    controls.push({ sync() {}, live: () => { const s = `Force ${sim.force.toFixed(2)} · Ca²⁺ ${sim.ca.toFixed(1)} µM · store ${pct(sim.srLevel)} · ATP ${pct(sim.atp)} · K⁺ out ${sim.conc.K.out.toFixed(1)} mM${sim.heat > 2 ? ` · heat ${sim.heat.toFixed(0)}` : ''}`; if (readout.textContent !== s) readout.textContent = s; } });
    lab.appendChild(readout);

    // ---- scenarios
    lab.appendChild(htmlEl('h3', {}, 'Clinical scenarios'));
    lab.appendChild(htmlEl('div', { class: 'text' }, '<p>Grouped by the gate each one breaks. Open a card, answer the prediction, then Run.</p>'));
    const h = {
      reset: () => { sim.cancelScheduled(); sim.reset(); app.history = []; app.markers = []; labSchedule.length = 0; lastStimT = prevStimT = -1e9; syncControls(); markThr(); },
      view: setView, later, sync: syncControls, thr: markThr,
    };
    for (const sc of SCENARIOS) lab.appendChild(renderCard(sc, h));

    const resetB = htmlEl('button', {}, 'Reset fibre'); resetB.addEventListener('click', () => { h.reset(); renderLab(); });
    lab.appendChild(resetB);
    panel.appendChild(lab);
    panel.appendChild(labNav());
    syncControls();
  }

  // =========================================================================
  // Clinical scenario cards (docs/MUSCLE_MODULE.md, "Free-play lab and clinical scenarios")
  // Each card: a situation, a prediction (answered before Run), one or more Run steps that set
  // the model's controls and fire it, and the explanation shown once it has run.
  // =========================================================================
  const FIBRE_VIEW = 'fibre';
  const SCENARIOS = [
    {
      gate: 'Release', title: 'Botulinum toxin', situation: 'Wound botulism, or a therapeutic Botox dose: the machinery that fuses vesicles to the terminal membrane has been cut.',
      predict: { prompt: 'The nerve is fine and the muscle is fine. Will a command work? Will a shock?', options: [
        { t: 'The command fails; a direct shock still twitches.', ok: true, fb: 'The break is at the release step. Everything downstream of it is intact, so bypassing the junction with a shock still works.' },
        { t: 'Both fail: the toxin paralyses the muscle.', fb: 'The toxin never touches the fibre. It acts inside the nerve ending, on the vesicles. Run it and shock the fibre directly.' },
        { t: 'Both work: Ca²⁺ still enters the terminal.', fb: 'Ca²⁺ does enter, but entering is not enough: the vesicles must fuse, and that is exactly what the toxin prevents.' },
      ] },
      steps: [{ label: 'Run: command, then a direct shock', run: (h) => { h.reset(); h.view('nmj'); sim.releaseBlock = 1; h.sync(); sim.command(); h.later(250, () => { h.view(FIBRE_VIEW); sim.shock(1.5); }); } }],
      explain: 'The command arrived, Ca²⁺ entered the terminal, and nothing was released: flaccid paralysis. The fibre itself answered a direct shock normally. Every gate downstream of release is intact, which is why the paralysis is "flaccid" and why a therapeutic dose can be aimed at one muscle.',
    },
    {
      gate: 'Release', title: 'Magnesium sulfate', situation: 'A pre-eclampsia infusion; the nurse checks the patellar reflex, breathing rate and urine output every hour. Extracellular Mg²⁺ rises from 1 to 5 mM.',
      predict: { prompt: 'Why does the nurse check the patellar reflex?', options: [
        { t: 'Mg²⁺ competes with Ca²⁺ at the nerve terminal, so as it rises less ACh is released; the reflex fails first, breathing muscles next.', ok: true, fb: 'Run it: the command shrinks and then fails while the fibre itself still answers a shock.' },
        { t: 'Mg²⁺ relaxes the muscle fibres directly.', fb: 'The fibre is fine: a direct shock still twitches. Mg²⁺ acts on the terminal, competing with Ca²⁺ for its channel.' },
        { t: 'Mg²⁺ blocks the receptors like rocuronium.', fb: 'Different gate. Mg²⁺ reduces what is released, not what the receptors can bind. Watch the terminal.' },
      ] },
      steps: [
        { label: 'Run: Mg²⁺ 5 mM, command then shock', run: (h) => { h.reset(); h.view('nmj'); sim.conc.Mg.out = 5; h.sync(); h.thr(); sim.command(); h.later(250, () => { h.view(FIBRE_VIEW); sim.shock(1.5); }); } },
        { label: 'Give calcium gluconate (Ca²⁺ 2 → 3 mM), command', ask: { prompt: 'The reflex is gone and breathing is slow. The nurse gives calcium gluconate. Will the commands come back?', options: [
          { t: 'Yes: more Ca²⁺ out-competes the Mg²⁺ at the terminal.', ok: true, fb: 'Ca²⁺ and Mg²⁺ compete for the same channel; more Ca²⁺ wins the competition back. That is why calcium gluconate is the antidote.' },
          { t: 'No: the Mg²⁺ is still there.', fb: 'It is, but the channel takes whichever ion is winning the competition. Raise Ca²⁺ and watch release recover.' },
          { t: 'No: calcium makes the fibre less excitable.', fb: 'It does raise the shock threshold a little, but the end-plate potential grows far more than that. Try it.' },
        ] }, run: (h) => { sim.conc.Ca.out = 3; h.sync(); h.thr(); h.view('nmj'); sim.command(); } },
      ],
      explain: 'At 5 mM Mg²⁺ the terminal admits too little Ca²⁺ per command, release collapses and the end-plate potential falls below threshold: the command fails while a shock still twitches. Loss of the patellar reflex is the first warning; breathing muscles fail next. Calcium gluconate reverses it by winning the competition at the terminal.',
    },
    {
      gate: 'Receptor', title: 'Rocuronium / vecuronium', situation: 'A non-depolarizing blocker in the operating theatre: the drug sits on the ACh receptors without opening them.',
      predict: { prompt: 'At what fraction of blocked receptors does the twitch fail?', options: [
        { t: 'Only past about four fifths: the end-plate potential has a wide margin and shrinks less than proportionally.', ok: true, fb: 'Run the steps: 75 % still twitches, 85 % fails.' },
        { t: 'At about half: half the receptors, half the signal.', fb: 'The open receptors pull Vm toward 0 mV so hard that losing half of them costs only a quarter of the end-plate potential. Run it.' },
        { t: 'At any block: the impulse needs every receptor.', fb: 'The junction is built with a safety margin of about two. Run it and see how far you can go.' },
      ] },
      steps: [
        { label: 'Block 75 %, command', run: (h) => { h.reset(); h.view('nmj'); sim.receptor.block = 0.75; h.sync(); sim.command(); } },
        { label: 'Block 85 %, command', run: (h) => { sim.receptor.block = 0.85; sim.acheActivity = 1; h.sync(); h.view('nmj'); sim.command(); } },
        { label: 'Neostigmine at 85 %', run: (h) => { sim.receptor.block = 0.85; sim.acheActivity = 0.3; h.sync(); h.view('nmj'); sim.command(); } },
        { label: 'Block 95 % + neostigmine', ask: { prompt: 'Push the block to 95 %. Will more ACh beat a nearly complete block?', options: [
          { t: 'No: with almost no free receptors left, extra ACh has nothing to bind.', ok: true, fb: 'Neostigmine works by piling up ACh to compete for the receptors that are left; at 95 % there are too few. Sugammadex removes the drug itself instead.' },
          { t: 'Yes: enough ACh always wins the competition.', fb: 'Competition needs something to compete for. Run it and compare with sugammadex.' },
          { t: 'Yes, but the twitch is smaller.', fb: 'A twitch is all-or-none; the question is whether threshold is reached at all. Run it.' },
        ] }, run: (h) => { sim.receptor.block = 0.95; sim.acheActivity = 0.3; h.sync(); h.view('nmj'); sim.command(); } },
        { label: 'Sugammadex (block removed)', run: (h) => { sim.receptor.block = 0; sim.acheActivity = 1; h.sync(); h.view('nmj'); sim.command(); } },
      ],
      explain: 'Only the receptor gate is blocked. The nerve still fires and ACh is still released; the patient hears and feels everything, and the diaphragm is as paralysed as the thumb: a blocked patient must be ventilated and sedated. Neostigmine works by piling up ACh to compete for the receptors that are left; with almost none left it has nothing to work with, which is why sugammadex, which removes the drug itself, exists.',
    },
    {
      gate: 'Receptor', title: 'Myasthenia gravis', situation: 'Antibodies have destroyed most of the ACh receptors (density 20 %). The nerve sends a train of commands at 3 Hz, as in a repetitive-stimulation test.',
      predict: { prompt: 'Why does the patient\'s eyelid droop later in the day?', options: [
        { t: 'The safety margin is gone: the first commands just make it, and as ACh output runs down over repeated use the later ones fail.', ok: true, fb: 'Run the train: the first command fires, later ones fail (fatigable weakness).' },
        { t: 'The muscle runs out of ATP.', fb: 'ATP is fine: this is a junction disease. Watch the end-plate potential shrink over the train.' },
        { t: 'The nerve stops sending commands.', fb: 'The nerve is sending every command; the trace of the terminal shows them all. It is the end plate that stops answering.' },
      ] },
      steps: [
        { label: 'Run: 20 % receptors, 3 Hz train', run: (h) => { h.reset(); h.view('nmj'); sim.receptorDensity = 0.2; h.sync(); setSpeed(0.2); sim.commandTrain(3, 6); } },
        { label: 'Pyridostigmine (AChE 0.3), same train', run: (h) => { sim.acheActivity = 0.3; h.sync(); h.view('nmj'); setSpeed(0.2); sim.commandTrain(3, 6); } },
        { label: 'Too much pyridostigmine (AChE 0.05), 20 Hz train', ask: { prompt: 'Now push the dose too far and let the nerve drive a sustained contraction. Stronger or weaker?', options: [
          { t: 'Weaker again: ACh lingers, the end plate stays depolarized and its Na⁺ channels inactivate.', ok: true, fb: 'Cholinergic crisis and myasthenic crisis look the same at the bedside: weakness, trouble breathing. The difference is which way the ACh gate is broken.' },
          { t: 'Stronger: more ACh, more force.', fb: 'Up to a point. Past it the end plate never repolarizes and nothing more can fire. Run it.' },
          { t: 'The same: the dose does not matter once the receptors are rescued.', fb: 'It matters: an end plate held depolarized cannot fire again. Watch the later commands.' },
        ] }, run: (h) => { sim.acheActivity = 0.05; h.sync(); h.view('nmj'); setSpeed(0.2); sim.commandTrain(20, 30); } },
      ],
      explain: 'Antibodies have destroyed most of the receptors, so the safety margin is gone: the first command just makes it, and as the terminal\'s ACh output runs down over a train the later ones fail. Pyridostigmine lets ACh linger and restores the margin. Too much of it and the end plate stays depolarized: cholinergic crisis looks the same at the bedside as myasthenic crisis (weakness, trouble breathing); the difference is which way the ACh gate is broken.',
    },
    {
      gate: 'Receptor', title: 'Succinylcholine', situation: 'A depolarizing blocker for rapid-sequence intubation: an ACh look-alike that the enzyme in the gap cannot destroy.',
      predict: { prompt: 'Why does the patient twitch before going limp?', options: [
        { t: 'The drug opens the receptors and holds the end plate depolarized: an impulse or two at first, then the Na⁺ channels near the end plate inactivate and nothing can fire.', ok: true, fb: 'Run it: a fasciculation, then a held depolarization, then commands and end-plate shocks fail while a shock at the far end still fires.' },
        { t: 'It blocks the receptors like rocuronium, just faster.', fb: 'Then there would be no twitching first. This drug <i>opens</i> the receptors; the block comes from what a held depolarization does to the Na⁺ channels.' },
        { t: 'It triggers Ca²⁺ release directly from the SR.', fb: 'It never enters the fibre. Watch the end plate: it depolarizes and stays there.' },
      ] },
      steps: [{ label: 'Run: drug arrives; then command, end-plate shock, far shock', run: (h) => { h.reset(); h.view('nmj'); sim.agonist = 0.6; h.sync(); h.thr(); h.later(700, () => { sim.command(); }); h.later(900, () => { h.view(FIBRE_VIEW); sim.shock(2); }); h.later(1100, () => { sim.shock(2, 0.5, 'end'); }); } }],
      explain: 'It is an ACh look-alike that the cleft enzyme cannot destroy, so the end plate is held depolarized: a burst of impulses (fasciculations), then the nearby Na⁺ channels inactivate and nothing more can fire there. The rest of the fibre is still excitable: a shock at the far end fires. It is cleared by an enzyme in the plasma, so it wears off in minutes; people who lack that enzyme stay paralysed for hours. The K⁺ it lets out of the fibres is dangerous in burns, crush injury and prolonged immobility, and in a susceptible patient it can trigger malignant hyperthermia (a rigid jaw after the dose is the warning).',
    },
    {
      gate: 'Cleft', title: 'Organophosphate poisoning', situation: 'Insecticide or nerve agent: acetylcholinesterase is inhibited (activity 0). The nerve drives a sustained contraction at 20 Hz.',
      predict: { prompt: 'Too much ACh: stronger or weaker?', options: [
        { t: 'Briefly stronger, then weaker: ACh piles up, the end plate stays depolarized and later commands fail.', ok: true, fb: 'Run it: a long end-plate potential and an impulse, then depolarizing block.' },
        { t: 'Stronger and stronger: more ACh, more force.', fb: 'For one command, yes. Over a train the ACh never clears and the end plate never repolarizes. Run it.' },
        { t: 'No change: the receptors set the response, not the enzyme.', fb: 'Without the enzyme each command\'s ACh lasts four times longer. Watch what that does to the next command.' },
      ] },
      steps: [
        { label: 'Run: AChE 0, 20 Hz train', run: (h) => { h.reset(); h.view('nmj'); sim.acheActivity = 0; h.sync(); setSpeed(0.2); sim.commandTrain(20, 30); } },
        { label: 'Pralidoxime (AChE restored), train again', run: (h) => { sim.acheActivity = 1; h.sync(); h.view('nmj'); setSpeed(0.2); sim.commandTrain(20, 20); } },
      ],
      explain: 'This card shows the skeletal-muscle half: twitching, then paralysis of the breathing muscles. The wet symptoms (drooling, wheeze, slow heart) are ACh acting on glands and the heart and are treated with atropine; pralidoxime reactivates the enzyme only if given before it has aged (hours for most insecticides, minutes for some nerve agents), which is why it is given early.',
    },
    {
      gate: 'Membrane', title: 'Hyperkalaemia', situation: 'Renal failure: extracellular K⁺ climbs from 4 to 7, then 11 mM.',
      predict: { prompt: 'At 7 mM the resting membrane is closer to threshold. Stronger or weaker?', options: [
        { t: 'At first easier to fire; as K⁺ climbs further the Na⁺ channels inactivate and the fibre goes weak, then silent.', ok: true, fb: 'Run the steps and watch the threshold readout and the commands.' },
        { t: 'Weaker straight away: K⁺ poisons the fibre.', fb: 'Nothing is poisoned. Rest moves toward threshold, which at first helps. Run it.' },
        { t: 'Stronger and stronger: closer to threshold means more excitable.', fb: 'Only for a while. A depolarized rest also inactivates Na⁺ channels, and with enough of them plugged nothing can fire. Run all the steps.' },
      ] },
      steps: [
        { label: 'K⁺ 7 mM: command', run: (h) => { h.reset(); h.view(FIBRE_VIEW); sim.conc.K.out = 7; h.sync(); h.thr(); h.later(150, () => sim.command()); } },
        { label: 'K⁺ 11 mM: command, then a 2× shock', run: (h) => { sim.conc.K.out = 11; h.sync(); h.thr(); h.later(150, () => sim.command()); h.later(350, () => sim.shock(2)); } },
        { label: 'Give IV calcium (Ca²⁺ 2 → 3 mM): command', ask: { prompt: 'The K⁺ has not changed. Will calcium make the fibre answer its nerve again?', options: [
          { t: 'Yes: calcium shifts the Na⁺ channels back toward normal, restoring the gap between rest and threshold.', ok: true, fb: 'That is why calcium is the first drug given; then the K⁺ itself is driven into cells or removed.' },
          { t: 'No: only lowering K⁺ can help.', fb: 'Lowering K⁺ is the cure, but it takes time. Calcium buys that time by steadying the Na⁺ channels. Run it.' },
          { t: 'No: calcium is for the heart, not the muscle.', fb: 'It steadies every excitable membrane the same way; the heart just matters most. Run it.' },
        ] }, run: (h) => { sim.conc.Ca.out = 3; h.sync(); h.thr(); h.later(150, () => sim.command()); } },
        { label: 'K⁺ 12 mM (Ca²⁺ back to 2): shock and command', run: (h) => { sim.conc.K.out = 12; sim.conc.Ca.out = 2; h.sync(); h.thr(); h.later(150, () => sim.shock(2)); h.later(350, () => sim.command()); } },
      ],
      explain: 'Heart muscle cells rest on the same K⁺ gradient and depolarize the same way, which is why K⁺ this high is a cardiac emergency (peaked T waves, then arrest) long before the skeletal muscles fail. Calcium is the first drug given because it moves threshold away from the depolarized rest; then the K⁺ itself is driven into cells or removed. (The model exaggerates the K⁺ needed to silence a skeletal fibre; a patient is in danger well below it.)',
    },
    {
      gate: 'Membrane', title: 'Hypokalaemia', situation: 'Diuretics or vomiting: extracellular K⁺ falls from 4 to 2.5 mM.',
      predict: { prompt: 'Which way does Vm move, and is threshold nearer or farther?', options: [
        { t: 'Rest hyperpolarizes (E_K moves from −95 toward −107), so threshold is farther: a stronger shock is needed, though a nerve command still makes it.', ok: true, fb: 'Run it and read the threshold strength.' },
        { t: 'Rest depolarizes: less K⁺ outside means less negative inside.', fb: 'Less K⁺ outside steepens the gradient, so K⁺ leaves more readily and the inside gets <i>more</i> negative. Run it.' },
        { t: 'Nothing changes: the pump keeps Vm fixed.', fb: 'The pump keeps the gradients, not the voltage; the voltage follows E_K. Run it.' },
      ] },
      steps: [{ label: 'Run: K⁺ 2.5 mM, command, then a 100 % and a 150 % shock', run: (h) => { h.reset(); h.view(FIBRE_VIEW); sim.conc.K.out = 2.5; h.sync(); h.thr(); h.later(150, () => sim.command()); h.later(400, () => sim.shock(1.0)); h.later(600, () => sim.shock(1.5)); } }],
      explain: 'The patient is weak, may cramp, and is prone to arrhythmias. The direction shown here (harder to excite) is the textbook one; much of the real weakness comes from a mechanism this model leaves out, in which the resting K⁺ channels shut and the fibre paradoxically depolarizes.',
    },
    {
      gate: 'Membrane', title: 'Hypocalcaemia', situation: 'Tetany after thyroid surgery: Chvostek\'s and Trousseau\'s signs, stridor. Extracellular Ca²⁺ falls from 2 to 1 mM (the model\'s 2 mM is the textbook value; a patient\'s ionized Ca²⁺ is normally about 1.2 mmol/L and tetany appears below about 0.8).',
      predict: { prompt: 'Less calcium: more contraction or less? Why?', options: [
        { t: 'More: low Ca²⁺ outside lets Na⁺ channels open more easily, and the motor nerve, which rests closer to threshold, starts firing on its own.', ok: true, fb: 'Run it: the threshold drops and the fibre starts twitching with nobody asking.' },
        { t: 'Less: no calcium, no contraction.', fb: 'Contraction uses the Ca²⁺ in the <i>store</i>, which is full. Blood Ca²⁺ acts on the Na⁺ channels instead. Run it.' },
        { t: 'No change: extracellular Ca²⁺ is not used by skeletal muscle.', fb: 'Not for contraction, but it steadies every Na⁺ channel in the body. Take it away and they fire too easily. Run it.' },
      ] },
      steps: [{ label: 'Run: Ca²⁺ 1 mM, nerve connected, and wait', run: (h) => { h.reset(); h.view(FIBRE_VIEW); sim.conc.Ca.out = 1; sim.nerveEnabled = true; h.sync(); h.thr(); } }],
      explain: 'You are watching the fibre fire by itself, and an isolated fibre in a very low-calcium bath really does. In the patient the first thing to fire is the motor nerve: its membrane has the same Na⁺ channels and its threshold moves the same way, and the fibre then obeys every impulse it is sent. Chvostek\'s sign is a tap on the facial nerve; Trousseau\'s is squeezing the arm\'s nerves with a cuff. After thyroid surgery the same thing in the muscles of the larynx causes stridor: calcium gluconate is kept at the bedside. The paradox to remember: contraction needs Ca²⁺ from the store, but low Ca²⁺ in the blood causes more firing.',
    },
    {
      gate: 'Membrane', title: 'Hypercalcaemia', situation: 'Extracellular Ca²⁺ rises from 2 to 3.5 mM.',
      predict: { prompt: 'Now the opposite. What happens to excitability?', options: [
        { t: 'Threshold rises: the Na⁺ channels are steadied, the nerve is quiet, the response is sluggish.', ok: true, fb: 'Run it and compare the threshold strength with normal.' },
        { t: 'More contraction: more calcium, more force.', fb: 'The store, not the blood, supplies the contraction. Extra Ca²⁺ outside steadies the Na⁺ channels. Run it.' },
        { t: 'The fibre fires on its own.', fb: 'That is <i>low</i> Ca²⁺. High Ca²⁺ does the reverse. Run it.' },
      ] },
      steps: [{ label: 'Run: Ca²⁺ 3.5 mM, command, then 100 % and 150 % shocks', run: (h) => { h.reset(); h.view(FIBRE_VIEW); sim.conc.Ca.out = 3.5; h.sync(); h.thr(); h.later(150, () => sim.command()); h.later(400, () => sim.shock(1.0)); h.later(600, () => sim.shock(1.5)); } }],
      explain: 'High blood Ca²⁺ (and high Mg²⁺) steadies the Na⁺ channels: a reference-strength shock no longer fires and the patient is weak and lethargic. The nerve command still works because of the junction\'s safety margin.',
    },
    {
      gate: 'Store', title: 'Malignant hyperthermia', situation: 'A volatile anaesthetic or succinylcholine in a susceptible patient: the SR release channel is held open.',
      predict: { prompt: 'Minutes after induction: rigid jaw, then rigid body, rising heart rate and exhaled CO₂, no nerve activity. Which gate?', options: [
        { t: 'The store: the SR release channel is leaking Ca²⁺ continuously, so the fibre contracts with no impulses at all.', ok: true, fb: 'Run it: sustained force with a flat voltage trace, then dantrolene.' },
        { t: 'The receptor: too much ACh.', fb: 'There is no nerve activity and no impulse in the trace. The Ca²⁺ is coming from inside the fibre. Run it.' },
        { t: 'The filaments: ATP has run out.', fb: 'ATP runs low <i>because</i> the fibre is burning it on a contraction it was never told to make. The first fault is upstream, at the store. Run it.' },
      ] },
      steps: [
        { label: 'Run: leaky release channel', run: (h) => { h.reset(); h.view('triad'); sim.ryrLeak = 0.3; sim.atpDecline = 0.00003; h.sync(); } },
        { label: 'Dantrolene', run: (h) => { sim.dantrolene = 1; sim.atpDecline = 0; h.sync(); h.view('triad'); } },
      ],
      explain: 'The susceptibility is inherited, usually a variant of this very SR release channel (the ryanodine receptor, RYR1) that lets the anaesthetic hold it open. The first signs are rising exhaled CO₂ and heart rate and rigid muscles (jaw first if succinylcholine was given); the temperature rise comes late. Dantrolene closes the channel.',
    },
    {
      gate: 'Filaments', title: 'Rigor mortis', situation: 'No ATP (rigor mortis, or an ischaemic contracture). One shock.',
      predict: { prompt: 'Is a rigid muscle receiving impulses?', options: [
        { t: 'No: rigor has no impulses at all; the heads simply cannot let go.', ok: true, fb: 'Run it: one contraction that never relaxes, with a silent voltage trace after the shock.' },
        { t: 'Yes: something must be driving the contraction.', fb: 'Nothing drives it. Detaching needs ATP, and there is none, so the heads stay bound. Run it and watch the trace go quiet.' },
        { t: 'Yes, at high rate, like a cramp.', fb: 'That is a cramp (next card). Rigor is the opposite case: no impulses, no ATP. Run both.' },
      ] },
      steps: [{ label: 'Run: ATP off, one shock', run: (h) => { h.reset(); h.view('sarcomere'); sim.atp = 0; h.sync(); h.later(100, () => sim.shock(1.5)); } }],
      explain: 'Rigor has no impulses at all; the heads simply cannot let go. Ca²⁺ stays in the cytosol too, because SERCA needs ATP. Rigor mortis sets in hours after death as ATP runs out, and passes only when the proteins break down.',
    },
    {
      gate: 'Whole chain', title: 'Cramp', situation: 'A painful, rigid calf at night: the nerve is driving the fibre at 40 Hz with nothing else wrong.',
      predict: { prompt: 'Rigid and painful. Is this muscle receiving impulses?', options: [
        { t: 'Yes, at high rate: a cramp is a tetanus the patient did not ask for, and it stops when the commands stop.', ok: true, fb: 'Run it: a fused contraction with a busy voltage trace, ending as soon as the train ends.' },
        { t: 'No: it is a small rigor.', fb: 'ATP is fine. Look at the voltage trace during the cramp: full of impulses. Run it.' },
        { t: 'No: Ca²⁺ is leaking from the store.', fb: 'That is malignant hyperthermia. An everyday cramp is neural: the nerve is firing. Run it.' },
      ] },
      steps: [{ label: 'Run: 40 Hz command train for 1 s', run: (h) => { h.reset(); h.view(FIBRE_VIEW); h.sync(); setSpeed(0.2); sim.commandTrain(40, 40); } }],
      explain: 'Rigor has no impulses at all; the heads simply cannot let go. An everyday cramp is the opposite: the nerve is firing the fibre at high rate, a tetanus you did not ask for, which is why stretching and rest end it.',
    },
    {
      gate: 'Contrast', title: 'Which Ca²⁺?', situation: 'A Ca²⁺-free bath (Ca²⁺ replaced by Mg²⁺, so Na⁺ channel behaviour is unchanged). A command, then a shock.',
      predict: { prompt: 'No calcium in the bath. Does a command work? Does a shock?', options: [
        { t: 'The command fails (no Ca²⁺ can enter the terminal to trigger release); the shock still twitches (the store is inside).', ok: true, fb: 'Two of the three calciums, told apart in one run.' },
        { t: 'Both fail: no calcium, no contraction.', fb: 'The contraction\'s Ca²⁺ is inside the fibre, in the SR. Only the terminal needs Ca²⁺ from outside. Run it.' },
        { t: 'Both work: the fibre has its own store.', fb: 'The fibre does; the nerve terminal does not. Its Ca²⁺ must come in from outside at each command. Run it.' },
      ] },
      steps: [{ label: 'Run: Ca²⁺-free bath, command, then shock', run: (h) => { h.reset(); h.view('nmj'); sim.setCaFreeBath(true); h.sync(); h.thr(); sim.command(); h.later(250, () => { h.view(FIBRE_VIEW); sim.shock(1.5); }); } }],
      explain: 'Three calciums: the Ca²⁺ that enters the nerve terminal (needed for release, so the command failed), the Ca²⁺ released from the SR store (needed for contraction, so the shock still twitched), and the Ca²⁺ in the fluid outside (which skeletal contraction does not need, but which steadies the Na⁺ channels; the Mg²⁺ stood in for it here). Cardiac muscle is different: it needs Ca²⁺ from outside on every beat.',
    },
  ];

  function renderCard(sc, h) {
    const card = htmlEl('div', { class: 'card' });
    const head = htmlEl('button', { class: 'card-head' }, `<span class="gate">${sc.gate}</span> <b>${sc.title}</b>`);
    const body = htmlEl('div', { class: 'card-body' }); body.style.display = 'none';
    head.addEventListener('click', () => { body.style.display = body.style.display === 'none' ? 'block' : 'none'; });
    body.appendChild(htmlEl('div', { class: 'text' }, `<p>${sc.situation}</p>`));
    const state = { answered: false };
    const runRow = htmlEl('div', { class: 'actions' });
    const explain = htmlEl('div', { class: 'feedback good' }, sc.explain); explain.style.display = 'none';
    const buildQuestion = (q, onAnswered) => {
      const box = htmlEl('div', { class: 'question' });
      box.appendChild(htmlEl('div', { class: 'prompt' }, q.prompt));
      const opts = htmlEl('div', { class: 'options' }), fb = htmlEl('div', { class: 'feedback' }); fb.style.display = 'none';
      questionOrder(q).map(i => q.options[i]).forEach(o => {
        const b = htmlEl('button', {}, o.t);
        b.addEventListener('click', () => {
          Array.from(opts.children).forEach(c => c.classList.remove('wrong'));
          if (o.ok) { b.classList.add('correct'); Array.from(opts.children).forEach(c => { c.disabled = true; }); fb.className = 'feedback good'; fb.innerHTML = '<b>Right.</b> ' + o.fb; onAnswered(); }
          else { b.classList.add('wrong'); fb.className = 'feedback bad'; fb.innerHTML = '<b>Not quite.</b> ' + o.fb; }
          fb.style.display = 'block';
        });
        opts.appendChild(b);
      });
      box.appendChild(opts); box.appendChild(fb);
      return box;
    };
    const stepButtons = [];
    body.appendChild(buildQuestion(sc.predict, () => { state.answered = true; stepButtons.forEach((b, i) => { if (i === 0 || !sc.steps[i].ask) b.disabled = false; }); }));
    sc.steps.forEach((step, i) => {
      const b = htmlEl('button', { class: i === 0 ? 'primary' : 'na' }, step.label); b.disabled = true;
      stepButtons.push(b);
      let ask = null;
      if (step.ask) {
        ask = buildQuestion(step.ask, () => { b.disabled = false; });
        ask.style.display = 'none';
      }
      b.addEventListener('click', () => {
        if (step.ask && ask.style.display === 'none' && !ask.dataset.done) { ask.style.display = 'block'; ask.dataset.done = '1'; b.disabled = true; body.insertBefore(ask, runRow); return; }
        step.run(h); explain.style.display = 'block';
        stepButtons.forEach((nb, j) => { if (j === i + 1) { if (sc.steps[j].ask) { nb.disabled = false; } else nb.disabled = false; } });
      });
      runRow.appendChild(b);
    });
    body.appendChild(runRow);
    body.appendChild(explain);
    card.appendChild(head); card.appendChild(body);
    return card;
  }

  window.MuscleLesson = { profile, drawCell, views, lesson, lab };
})();
