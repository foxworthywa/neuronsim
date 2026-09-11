/*
 * SharedScenes: lesson scenes that every excitable cell re-stages (see docs/APP_API.md).
 *
 *   SharedScenes.restingMembrane(profile, kit, opts)    → scene object
 *   SharedScenes.recordingElectrode(profile, kit, opts) → scene object
 *   SharedScenes.actionPotential(profile, kit, opts)    → scene object
 *
 * Each builder returns a scene ({ id, title, speed, steps: [...] }) exactly as a lesson array
 * holds it. Only what differs between cells is parametrized: numbers come from the profile
 * (rest, threshold, the recorded compartment, the manual conductances, the stimulus pulse)
 * and from the model's equilibrium potentials; words come from profile.cellWord and
 * profile.regionWord; `opts` can append steps, replace steps and override any string by key.
 * Called with the neuron profile and no opts, the scenes are the neuron lesson's originals.
 *
 * opts: {
 *   extraSteps:   [step, ...]        appended after the built-in steps
 *   replaceSteps: { index: step }    replaces the built-in step at that index (0-based)
 *   copy:         { key: string }    overrides a string; keys are '<step>.title', '<step>.text',
 *                                    '<step>.prompt', '<step>.opt<i>', '<step>.fb<i>',
 *                                    '<step>.status', '<step>.statusDone', '<step>.caption',
 *                                    '<step>.waitHint' (step keys are listed in each builder)
 *   channelsForRest: [...]           channel types drawn in the first resting-membrane step
 *   insetRegion:  'name'             inset highlight region (default: the recorded compartment)
 * }
 * Classic script (no modules) so the pages open from file://.
 */
(function () {
  'use strict';

  function finish(steps, opts) {
    opts = opts || {};
    if (opts.replaceSteps) for (const i in opts.replaceSteps) steps[i] = opts.replaceSteps[i];
    if (opts.extraSteps) steps.push(...opts.extraSteps);
    return steps;
  }
  const copyOf = (opts) => { const copy = (opts && opts.copy) || {}; return (k, d) => (copy[k] != null ? copy[k] : d); };

  // ------------------------------------------------------------- resting membrane
  // step keys: solutions, pump, kLeak, naOpen, naObserve, kObserve
  function restingMembrane(profile, kit, opts) {
    const { sim, runner, I, FB_GRADIENT, fmtV, fmtE } = kit;
    const c = copyOf(opts);
    const REST = profile.rest, E = sim.E, comp = () => sim.byName[profile.comp];
    const region = (opts && opts.insetRegion) || profile.comp;
    const channels = (opts && opts.channelsForRest) || ['K_leak', 'Na_leak', 'pump'];
    const G = profile.manualG;
    const steps = [
      {
        view: 'membrane', viewOpts: { comp: profile.comp, inset: region, channels, caption: c('solutions.caption', `Zooming into the membrane of the ${profile.regionWord}.`) }, reset: true, record: profile.comp, electrode: false,
        enter: () => { sim.naBlock = 1; }, // voltage-gated Na⁺ channels are not part of the story yet
        title: c('solutions.title', 'Two very different solutions'),
        text: c('solutions.text', `<p>The membrane separates two solutions. <b>Outside</b>: lots of ${I('Na')}, ${I('Cl')} and ${I('Ca')}. <b>Inside</b>: lots of ${I('K')} and large negatively charged molecules (proteins, shown as A⁻) that cannot leave.</p>
                 <p>The inside is about <b>${Math.abs(REST)} mV more negative</b> than the outside: the resting membrane potential, Vm ≈ ${fmtE(REST)} mV. Notice the + and − charges lined up along the membrane.</p>`),
        question: { prompt: c('solutions.prompt', 'At rest, which ion is much more concentrated inside the cell than outside?'), options: [
          { t: c('solutions.opt0', 'K⁺ (potassium)'), ok: true, fb: c('solutions.fb0', 'K⁺ is about 140 mM inside and only 4 mM outside. Everything else in the list is higher outside.') },
          { t: c('solutions.opt1', 'Na⁺ (sodium)'), fb: c('solutions.fb1', 'Na⁺ is about 145 mM outside and only 12 mM inside — the other way round.') },
          { t: c('solutions.opt2', 'Ca²⁺ (calcium)'), fb: c('solutions.fb2', 'Free Ca²⁺ inside is astonishingly low (about 0.0001 mM) versus 2 mM outside: a 20,000-fold gradient.') },
          { t: c('solutions.opt3', 'Cl⁻ (chloride)'), fb: c('solutions.fb3', 'Cl⁻ is higher outside (about 110 mM) than inside (about 6 mM).') },
        ] },
      },
      {
        view: 'membrane', title: c('pump.title', 'Who does what: pump vs. permeability'),
        text: c('pump.text', `<p>The ${'Na⁺/K⁺ pump'} uses ATP to move 3 ${I('Na')} out and 2 ${I('K')} in on each cycle. Watch it work.</p>
                 <p>Two jobs are easy to mix up:</p>
                 <p>• The <b>pump maintains the concentration gradients</b>, working slowly in the background.<br>
                    • The <b>resting potential is set mainly by which ions the membrane lets through</b>. At rest the membrane is far more permeable to K⁺ (through K⁺ leak channels) than to anything else.</p>`),
        question: { prompt: c('pump.prompt', 'Which statement is correct?'), options: [
          { t: c('pump.opt0', `The pump maintains the gradients; the ${fmtE(REST)} mV comes mainly from the membrane being selectively permeable to K⁺.`), ok: true, fb: c('pump.fb0', 'If you switched the pump off, Vm would barely change for a while, because the gradients are still there. (You can try this in the Lab.)') },
          { t: c('pump.opt1', `The pump directly generates the ${fmtE(REST)} mV every moment; without it the voltage would vanish instantly.`), fb: c('pump.fb1', 'The pump does contribute a little charge separation (3 out, 2 in), but the gradients it built are what matter. Vm would fade only slowly as the gradients ran down.') },
          { t: c('pump.opt2', 'Na⁺ leaking in is what makes the inside negative.'), fb: c('pump.fb2', 'Na⁺ carries positive charge in, which makes the inside less negative, not more.') },
        ] },
      },
      {
        view: 'membrane', title: c('kLeak.title', 'Predict: K⁺ leak channels'),
        text: c('kLeak.text', `<p>K⁺ leak channels are open all the time. ${I('K')} is concentrated inside.</p>`),
        question: { prompt: c('kLeak.prompt', 'Which way does K⁺ tend to move through an open K⁺ channel at rest?'), options: [
          { t: c('kLeak.opt0', 'Out of the cell'), ok: true, fb: c('kLeak.fb0', `Down its gradient: from 140 mM inside toward 4 mM outside. Each K⁺ that leaves carries positive charge out, leaving the inside more negative. That is the main source of the resting potential. (It stops short of the K⁺ equilibrium potential of about ${fmtE(E.K)} mV because a little Na⁺ leaks in.)`) },
          { t: c('kLeak.opt1', 'Into the cell'), fb: c('kLeak.fb1', `K⁺ is far more concentrated inside, so the gradient pushes it out. (The negative inside pulls it back — at ${fmtE(E.K)} mV the two would balance exactly.)`) },
          { t: c('kLeak.opt2', 'It does not move'), fb: c('kLeak.fb2', 'The channel is open and there is a steep gradient, so K⁺ definitely moves. Which way?') },
        ] },
      },
      {
        view: 'membrane', viewOpts: { comp: profile.comp, inset: region, channels: ['K_leak', 'Na_leak', 'pump', 'Na_manual'], caption: c('naOpen.caption', 'A Na⁺ channel has been added. Predict first, then open it.') }, remount: true,
        title: c('naOpen.title', 'Predict: a Na⁺ channel opens'),
        text: c('naOpen.text', `<p>Suppose a ${I('Na')} channel in this membrane suddenly opens.</p>`),
        question: { prompt: c('naOpen.prompt', 'Which way will Na⁺ move?'), options: [
          { t: c('naOpen.opt0', 'Into the cell'), ok: true, fb: c('naOpen.fb0', 'Both forces agree: Na⁺ is 145 mM outside vs 12 mM inside, and the inside is negative, which attracts a positive ion.') },
          { t: c('naOpen.opt1', 'Out of the cell'), fb: c('naOpen.fb1', FB_GRADIENT + ' Na⁺ is concentrated outside and the inside is negative.') },
          { t: c('naOpen.opt2', 'Neither'), fb: c('naOpen.fb2', 'An open channel plus a gradient means movement. Na⁺ has both a concentration gradient and an electrical pull in the same direction.') },
        ] },
      },
      {
        view: 'membrane', title: c('naObserve.title', 'Predict, then observe'),
        text: c('naObserve.text', `<p>Positive ${I('Na')} is about to enter the cell.</p>`),
        question: { prompt: c('naObserve.prompt', 'What will happen to the membrane potential?'), options: [
          { t: c('naObserve.opt0', 'It will become more positive (depolarize)'), ok: true, fb: c('naObserve.fb0', 'Now test it: hold the button to open Na⁺ channels and watch the voltage trace.') },
          { t: c('naObserve.opt1', 'It will become more negative'), fb: c('naObserve.fb1', 'Positive charge is entering the inside. Would that make the inside more or less negative?') },
          { t: c('naObserve.opt2', `It will stay at ${fmtE(REST)} mV`), fb: c('naObserve.fb2', 'Adding positive charge to one side of the membrane must change the voltage across it.') },
        ] },
        actions: [{ label: 'Hold to open Na⁺ channels', cls: 'na', hold: true, down: () => { sim.manual.gNa = G.gNa; }, up: () => { sim.manual.gNa = 0; } }],
        waitFor: () => comp().V > REST + 7, waitHint: c('naObserve.waitHint', 'Hold the button and watch Vm rise'),
        status: () => runner.state.done ? c('naObserve.statusDone', `<b>Observed:</b> Na⁺ entered and Vm rose (watch the ladder: Na⁺ pulls Vm up toward ${fmtE(sim.E.Na)}). Let go and it drifts back as K⁺ leaks out again.`) : 'Vm is ' + fmtV(comp().V) + ' mV — hold the button.',
      },
      {
        view: 'membrane', viewOpts: { comp: profile.comp, inset: region, channels: ['K_leak', 'Na_leak', 'pump', 'K_manual'], caption: c('kObserve.caption', 'Now a K⁺ channel. Predict first.') }, remount: true,
        title: c('kObserve.title', 'Predict: extra K⁺ channels open'),
        text: c('kObserve.text', `<p>Now imagine <b>extra</b> ${I('K')} channels open, on top of the leak.</p>`),
        question: { prompt: c('kObserve.prompt', 'What will happen to Vm?'), options: [
          { t: c('kObserve.opt0', 'It becomes more negative (hyperpolarizes)'), ok: true, fb: c('kObserve.fb0', `More K⁺ leaves, taking positive charge out. Vm moves toward the K⁺ equilibrium potential (about ${fmtE(E.K)} mV). Try it.`) },
          { t: c('kObserve.opt1', 'It becomes more positive'), fb: c('kObserve.fb1', 'K⁺ is a positive ion leaving the cell. Which way does that push the inside charge?') },
          { t: c('kObserve.opt2', 'Nothing changes'), fb: c('kObserve.fb2', 'More open channels means more K⁺ crossing, so the balance shifts.') },
        ] },
        actions: [{ label: 'Hold to open K⁺ channels', cls: 'k', hold: true, down: () => { sim.manual.gK = G.gK; }, up: () => { sim.manual.gK = 0; } }],
        waitFor: () => comp().V < REST - 3, waitHint: c('kObserve.waitHint', 'Hold the button and watch Vm fall'),
        status: () => runner.state.done ? c('kObserve.statusDone', '<b>Observed:</b> K⁺ left and Vm became more negative. Remember this: <b>Na⁺ in = up, K⁺ out = down</b>. The whole story of the action potential follows from it.') : 'Vm is ' + fmtV(comp().V) + ' mV',
      },
    ];
    return { id: 'rest', title: c('scene.title', 'The resting membrane'), speed: 0.01, steps: finish(steps, opts) };
  }

  // ------------------------------------------------------------- recording electrode
  // step keys: electrode
  function recordingElectrode(profile, kit, opts) {
    const c = copyOf(opts);
    const REST = profile.rest, { fmtE } = kit;
    const steps = [
      {
        view: profile.defaultView, viewOpts: { caption: c('electrode.caption', `A microelectrode is lowered into the ${profile.regionWord}; a reference electrode sits outside.`) }, reset: true, electrode: true, labels: true, record: profile.comp, remount: true,
        title: c('electrode.title', 'Put in an electrode'),
        text: c('electrode.text', `<p>Watch the fine glass <b>microelectrode</b> slide into the ${profile.regionWord}. Its voltage is compared with a <b>reference electrode</b> in the fluid outside.</p>
                 <p>From now on the graph at the bottom is live: everything you see happen in the ${profile.cellWord} will show up on this trace, and vice versa.</p>`),
        question: { prompt: c('electrode.prompt', `The trace reads about ${fmtE(REST)} mV. What does that mean?`), options: [
          { t: c('electrode.opt0', `The inside of the cell is ${Math.abs(REST)} mV more negative than the outside`), ok: true, fb: c('electrode.fb0', 'Membrane potential is always inside relative to outside. Depolarization means moving up toward 0; hyperpolarization means moving further down.') },
          { t: c('electrode.opt1', `The outside is ${Math.abs(REST)} mV more negative than the inside`), fb: c('electrode.fb1', 'By convention the outside is the reference (0 mV), and the inside measured against it is negative.') },
          { t: c('electrode.opt2', 'The cell is switched off'), fb: c('electrode.fb2', `A resting ${profile.cellWord} is not off; it is charged and ready, like a stretched spring.`) },
        ] },
      },
    ];
    return { id: 'electrode', title: c('scene.title', 'Recording from inside'), speed: 0.01, steps: finish(steps, opts) };
  }

  // ------------------------------------------------------------- building the action potential
  // step keys: rise, rising, peakApproach, peak, fallPredict, falling, undershoot, built
  function actionPotential(profile, kit, opts) {
    const { sim, runner, setPaused, stimPulse, refire, since, I, fmtV, fmtE } = kit;
    const c = copyOf(opts);
    const REST = profile.rest, E = sim.E, AP = profile.apComp, ap = () => sim.byName[AP];
    const region = (opts && opts.insetRegion) || AP;
    const vm = () => `Vm (${AP}) = ${fmtV(ap().V)} mV`;
    const steps = [
      {
        view: 'membrane', viewOpts: { comp: AP, inset: region, channels: ['Na_v', 'K_v'], ions: { outside: { Ca: 0 } }, caption: c('rise.caption', 'Building the action potential curve one phase at a time.') }, reset: true, record: AP, electrode: true, showG: true, remount: true,
        title: c('rise.title', 'Phase 1: rising'),
        text: c('rise.text', `<p>Instead of memorizing the famous curve, we will build it from what the channels do. The lower band of the trace shows the Na⁺ conductance (<span style="color:#e8772e">orange</span>) and K⁺ conductance (<span style="color:#8e5cf0">purple</span>), i.e. how many of each channel are open.</p>
                 <p>Trigger an action potential. The simulation will pause during the rising phase.</p>`),
        actions: [{ label: 'Trigger', cls: 'na', run: (cx) => { setPaused(false); stimPulse(); cx.stepState().data.armed = true; } }],
        tick: (cx) => { const d = cx.stepState().data; if (d.armed && !runner.state.done && ap().V > -30 && ap().dVdt > 0) { cx.complete(); setPaused(true); cx.mark('rise'); } },
        waitFor: () => false, waitHint: c('rise.waitHint', 'Trigger the action potential'),
        status: () => runner.state.done ? c('rise.statusDone', '<b>Paused mid-rise.</b> gNa is large; K⁺ channels are only starting to open.') : vm(),
      },
      {
        view: 'membrane', title: c('rising.title', 'Rising phase'), pause: true,
        text: c('rising.text', `<p>Paused. The Na⁺ conductance is huge and ${I('Na')} is pouring in.</p>`),
        question: { prompt: c('rising.prompt', 'Where is Vm heading?'), options: [
          { t: c('rising.opt0', `Up toward the Na⁺ equilibrium potential (${fmtE(E.Na)} mV)`), ok: true, fb: c('rising.fb0', 'With Na⁺ channels dominating, Vm is pulled toward ENa. It will not quite get there, because of what happens next. Continue and the simulation will pause again at the peak.') },
          { t: c('rising.opt1', `Back down to ${fmtE(REST)} mV`), fb: c('rising.fb1', 'While Na⁺ is entering, the inside keeps getting more positive.') },
          { t: c('rising.opt2', 'It stays at 0 mV'), fb: c('rising.fb2', 'Nothing special happens at 0 mV. The relevant landmark is the equilibrium potential of the ion that dominates: Na⁺.') },
        ] },
        onContinue: () => { setPaused(false); },
      },
      {
        view: 'membrane', title: c('peakApproach.title', 'Approaching the peak'),
        text: c('peakApproach.text', `<p>Watch the two conductances. The Na⁺ channels begin to <b>inactivate</b> (a plug swings into the pore), and the slower K⁺ channels finally open. The simulation pauses at the peak.</p>`),
        enter: (cx) => { cx.stepState().data.t0 = sim.t; },
        actions: [refire],
        tick: (cx) => {
          if (runner.state.done) return;
          const h = ap();
          if (h.V > 10 && h.dVdt < 0) { cx.complete(); setPaused(true); cx.mark('peak'); return; }
          const hist = since(cx);
          if (hist.some(s => s.V[AP] > 10) && h.V < REST + 10) { cx.complete(); cx.stepState().data.missed = true; }
        },
        waitFor: () => false, waitHint: c('peakApproach.waitHint', 'Wait for the peak (or fire again)'),
        status: (cx) => runner.state.done ? (cx.stepState().data.missed ? c('peakApproach.statusMissed', 'The peak went by. Press <b>Fire again</b> to catch it, or continue.') : `<b>Paused at the peak:</b> ${fmtV(ap().V)} mV. Na⁺ channels are inactivating; K⁺ channels are open.`) : vm(),
      },
      {
        view: 'membrane', title: c('peak.title', 'Phase 2: at the peak'), pause: true,
        text: c('peak.text', `<p>Paused at the peak. Na⁺ channels are inactivated and no longer pass Na⁺. The voltage-gated K⁺ channels are now wide open. ${I('K')} is far more concentrated inside, and the inside is now <b>positive</b>.</p>`),
        question: { prompt: c('peak.prompt', 'Which way does K⁺ move now?'), options: [
          { t: c('peak.opt0', 'Out of the cell'), ok: true, fb: c('peak.fb0', 'Both the concentration gradient and the electrical force (positive inside repelling a positive ion) now push K⁺ out.') },
          { t: c('peak.opt1', 'Into the cell'), fb: c('peak.fb1', 'K⁺ is 140 mM inside, 4 mM outside, and the inside is now positive. Every force points outward.') },
        ] },
      },
      {
        view: 'membrane', title: c('fallPredict.title', 'Predict the falling phase'), pause: true,
        question: { prompt: c('fallPredict.prompt', 'Positive charge is leaving the cell. What happens to Vm?'), options: [
          { t: c('fallPredict.opt0', 'It falls back toward negative values (repolarization)'), ok: true, fb: c('fallPredict.fb0', 'K⁺ out = down. Continue and watch the trace fall; the simulation will pause once more when Vm dips below rest.') },
          { t: c('fallPredict.opt1', 'It keeps rising'), fb: c('fallPredict.fb1', 'Losing positive charge makes the inside less positive.') },
        ] },
        onContinue: () => { setPaused(false); },
      },
      {
        view: 'membrane', title: c('falling.title', 'Phase 3: falling'),
        text: c('falling.text', `<p>K⁺ leaves, Vm falls. Watch where it stops.</p>`),
        enter: (cx) => { cx.stepState().data.t0 = sim.t; },
        actions: [refire],
        tick: (cx) => {
          if (runner.state.done) return;
          const h = ap();
          if (h.V < REST - 6 && Math.abs(h.dVdt) < 30) { cx.complete(); setPaused(true); cx.mark('undershoot'); return; }
          const hist = since(cx);
          if (hist.some(s => s.V[AP] < REST - 4) && h.V > REST - 2) { cx.complete(); cx.stepState().data.missed = true; }
        },
        waitFor: () => false, waitHint: c('falling.waitHint', 'Wait for the trace to fall (or fire again)'),
        status: (cx) => runner.state.done ? (cx.stepState().data.missed ? c('falling.statusMissed', 'The undershoot went by. Press <b>Fire again</b> to see it, or continue.') : `<b>Paused at the undershoot:</b> ${fmtV(ap().V)} mV, below the resting potential.`) : vm(),
      },
      {
        view: 'membrane', title: c('undershoot.title', 'Phase 4: the undershoot'), pause: true,
        text: c('undershoot.text', `<p>Vm has dropped <b>below</b> ${fmtE(REST)} mV.</p>`),
        question: { prompt: c('undershoot.prompt', 'Why does the voltage overshoot below the resting potential?'), options: [
          { t: c('undershoot.opt0', `The voltage-gated K⁺ channels are slow to close, so the membrane is briefly even more K⁺-permeable than at rest and Vm approaches EK (about ${fmtE(E.K)} mV)`), ok: true, fb: c('undershoot.fb0', `As those K⁺ channels close, Vm relaxes back to ${fmtE(REST)} mV. Continue and watch it recover. Note the Na⁺ channels: still inactivated for a while.`) },
          { t: c('undershoot.opt1', 'Na⁺ is still entering'), fb: c('undershoot.fb1', 'Na⁺ entering would make Vm more positive, not more negative. And the Na⁺ channels are inactivated.') },
          { t: c('undershoot.opt2', 'The pump has pumped all the Na⁺ back out'), fb: c('undershoot.fb2', 'The pump is far too slow to act within a millisecond. Only a tiny fraction of the ions crossed anyway; the gradients are essentially unchanged.') },
        ] },
        onContinue: () => { setPaused(false); },
      },
      {
        view: 'membrane', title: c('built.title', 'You built the curve'),
        text: c('built.text', `<p>Rising (Na⁺ in) → peak (Na⁺ inactivates, K⁺ opens) → falling (K⁺ out) → undershoot (K⁺ still open) → rest. Every phase is a consequence of which channels are open. Fire again as often as you like and watch the ladder.</p>`),
        actions: [refire],
        question: { prompt: c('built.prompt', 'Right after an action potential the membrane cannot fire again for a moment (the refractory period). Why?'), options: [
          { t: c('built.opt0', 'The Na⁺ channels are inactivated and must return to the closed state before they can open again'), ok: true, fb: c('built.fb0', `The refractory period also limits how fast a ${profile.cellWord} can fire, and, as we will see next, it is why the action potential travels in one direction only.`) },
          { t: c('built.opt1', 'The cell has run out of Na⁺ outside'), fb: c('built.fb1', 'Only a tiny fraction of the ions moved. The gradients are practically unchanged.') },
          { t: c('built.opt2', 'The K⁺ channels are inactivated'), fb: c('built.fb2', 'The delayed K⁺ channels simply close; it is the Na⁺ channels that have an inactivated state (the plug).') },
        ] },
        waitFor: () => ap().V > REST - 2 && ap().h > 0.4, waitHint: c('built.waitHint', 'Wait for the membrane to recover'),
      },
    ];
    return { id: 'ap', title: c('scene.title', 'Building the action potential'), speed: 0.003, steps: finish(steps, opts) };
  }

  window.SharedScenes = { restingMembrane, recordingElectrode, actionPotential };
})();
