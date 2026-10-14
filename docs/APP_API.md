# APP_API.md — building a lesson page on `app.js`

`app.js` is a page-agnostic library: it draws membranes, runs the lesson (questions, activities,
navigation), records the trace and drives the frame loop, but knows nothing about the cell. A page
supplies a **model**, a **profile**, a **whole-cell drawing**, extra **views**, a **lesson** and a
**lab**. `index.html` is the reference page; `muscle.html` is built the same way.

```
engine.js          model classes (NeuronSim.Neuron; muscle.js adds MuscleFibre)
app.js             SimApp.init(config) — generic renderer + lesson engine
scenes/shared.js   SharedScenes: resting membrane, recording electrode, action potential
lessons/neuron.js  NeuronLesson: profile, drawCell, views, lesson, lab for the neuron page
style.css          page styles (shared by every page)
index.html         loads the four scripts and boots: SimApp.init({ model, ...NeuronLesson })
build.js           inlines scripts and stylesheets into dist/<page>.html
tests/ui/smoke.js  Playwright walk of every scene, step and lab view
```

All files are classic scripts (no ES modules): pages must open from `file://`. Load order:
`engine.js` (+ `muscle.js`), `app.js`, `scenes/shared.js`, `lessons/<page>.js`, then the boot
script. The page HTML must contain the same elements as `index.html`: `#stage`, `#stage-caption`,
`#vm-label`, `#vm-value`, `#narrator`, `#paused-badge`, `#panel`, `#progress`, `#speed` (a select;
`setSpeed` adds a missing option), `#btn-pause`, `#btn-lab`, `#trace`, `#trace-title`,
`#trace-legend`, `#show-g`, `#sim-clock`.

## `SimApp.init(config)`

```js
window.__musclesim = SimApp.init({
  model:    new MuscleSim.MuscleFibre(),
  profile:  {...},                       // landmarks and words (below)
  drawCell: (parent, opts, kit) => ({ g, parts, update(opts) }),
  views:    (kit) => ({ fibre: (opts) => view, triad: ..., ... }),
  lesson:   (kit) => [scene, scene, ...],
  lab:      (kit) => { /* render the lab panel */ },
});
```

`init` wires the page controls, merges `views(kit)` into the registry (the generic `membrane`
view is built in), builds the lesson, shows step 0 and starts the frame loop. It returns the
debug handle `{ sim, app, profile, kit, gotoStep(scene, step), runner(), enterLab(), mountView(name, opts), lesson() }`
and also stores it as `window.__simapp` (the smoke test looks for `__simapp`, `__neuronsim` or
`__musclesim`).

### Model interface

Everything the generic code reads from `config.model`:

| member | used for |
|---|---|
| `comps[]` with `{ name, kind, V, m, h, n, gNa, gK, gL, gNaMax, gKLeak, gNaLeak, iNa, iK, iL, dVdt }` | trace samples, membrane view, ladder |
| `byName[name]` | resolving compartments (`profile.comp`, `apComp`, `record` keys) |
| `manual { gNa, gK, gCl }` | "hold to open" channels on `profile.comp` |
| `naBlock`, `kBlock`, `pumpOn`, `pumpRundownRate` | lab controls and the resting-membrane scene (`naBlock = 1`) |
| `conc { Na, K, Cl, Ca }` (each `{ out, in }`), `E` getter | concentration table, ladder ticks, copy |
| `t`, `advance(ms)`, `reset()`, `takeEvents()` | frame loop; events `{ type: 'spike', name }`, `'release'`, `'shock'` |
| `setStim(comp, nA)`, `pulse(comp, nA, ms)` | `kit.stimPulse` (the pulse stops itself) |
| `naState(c)`, `kState(c)`, `caState(term)` | channel drawings (`'closed' | 'open' | 'inactivated'`) |
| `terminal` (optional) | `Ca_v` channels in the membrane view |
| `sampleExtras()` (optional) | extra scalar series for trace bands: returns `{ key: value }` |

### Profile

| field | neuron value | meaning |
|---|---|---|
| `id` | `'neuron'` | page id |
| `cellWord`, `regionWord` | `'neuron'`, `'cell body'` | words in shared-scene copy |
| `rest`, `threshold` | `-70`, `-55` | mV; colour stops, cytosol tint, ladder/trace lines, narrator branches and copy are all relative to these |
| `comp` | `'soma'` | compartment for manual channels and the default recording |
| `apComp` | `'hillock'` | compartment the action-potential scene records; fallback for the conductance sub-plot |
| `stimComp`, `stimPulse` | `'soma'`, `{ nA: 0.45, ms: 3 }` | `kit.stimPulse()` defaults |
| `manualG` | `{ gNa: 0.0007, gK: 0.006, gCl: 0.01 }` | µS opened by the "hold to open" buttons of the resting-membrane scene (the lab may use its own values) |
| `defaultView` | `'neuron'` | whole-cell view name (recording-electrode scene) |
| `traceColors` | `{ soma: '#1f2430', ... }` | colour per recorded compartment |
| `traceTitle(comp)` | `` `Membrane potential recorded inside the ${comp}` `` | trace heading |
| `probeV(sim, name)` | `name === 'next' ? sim.next.V : undefined` | voltage of a pseudo-compartment for the Vm badge |
| `extraVoltages(sim)` | `{ next: sim.next.V }` | merged into every trace sample's `s.V` |
| `insetRegions` | `{ soma: [cx, cy, rx, ry], ..., default: [...] }` | dashed highlight drawn by `drawInset(parent, region)` |
| `fluxScale` (optional) | `1` | multiplies channel currents before they become ion-traffic particles in the membrane view (a page whose compartments carry much larger currents sets it lower) |
| `insetFrame` (optional) | `{ transform: 'translate(640,6) scale(0.27)', x: -10, y: -10, width: 960, height: 520 }` | inset box geometry |

Every absolute conductance or current a shared scene sets comes from the profile (`manualG`,
`stimPulse`); a page with a different membrane area only changes these numbers.

### `drawCell(parent, opts, kit)`

Draws the whole cell into `parent` and returns `{ g, parts, update(opts) }`. `update` recolours
the parts from the model each frame (`kit.vColor`, `kit.app.electrode`, `kit.app.labels`).
`opts.inset` is true when `drawInset` draws the thumbnail (hide labels, dim what is not needed);
`update({ hideLabels: true })` is what the inset calls. `kit.drawCell(parent, opts)` calls it with
the kit filled in.

### Views

`views(kit)` returns `{ name: (opts) => view }`. A view is `{ mount(el), update(dtReal, dtSim, events),
narrate() → html | '', unmount() }` plus whatever the lesson needs (`highlight`, `hint`, `onPart`, ...).
It draws into `el` (an SVG with `viewBox` 0 0 900 520 fits the stage), sets the caption with
`kit.setCaption(opts.caption)` and keeps a whole-cell inset via `kit.drawInset(svg, region)` →
`{ g, parts, update() }`. The built-in `membrane` view takes
`{ comp, channels: ['K_leak', 'Na_leak', 'pump', 'Na_v', 'K_v', 'Na_manual', ...], inset, ions: { outside, inside }, caption }`;
new channel types can be added with `Object.assign(kit.CH, { X: { color, label, ion, dir, gated, current(c, V, E, sim), state(c, sim) } })`.

### Lesson

`lesson(kit)` returns an array of scenes `{ id, title, speed, showThreshold, bands, historyMs, window, steps: [...] }`.
Step keys (inherited by later steps of the same scene: `view`, `viewOpts`, `record`, `electrode`,
`labels`, `showG`, `gComp`, `extra`, `speed`, `bands`, `historyMs`, `window`):

| key | meaning |
|---|---|
| `view`, `viewOpts`, `remount` | which view to mount; `remount` forces a fresh mount |
| `record`, `extra` | recorded compartment and extra traces (names in `s.V`) |
| `electrode`, `labels` | show the electrode / the anatomy labels in the whole-cell drawing |
| `showG`, `gComp` | conductance sub-plot (of `gComp`, else the recorded compartment, else `profile.apComp`) |
| `bands` | `[{ key, label, color, max, min }]` — one sub-plot per entry of `s.x[key]` (from `model.sampleExtras()`) |
| `historyMs`, `window` | ms of history kept (default 400) and ms visible (default 60) |
| `reset`, `speed`, `pause` | reset the model on entry; scene speed override; enter paused |
| `title`, `text`, `question`, `actions`, `status`, `extraHtml`, `waitHint`, `continueLabel` | panel content (`text`/`status`/`extraHtml` may be functions of `ctx`) |
| `enter(ctx)`, `tick(ctx, events, dtSim)`, `waitFor(ctx, events)`, `onDone`, `onContinue`, `continueTo` | behaviour |

`question: { prompt, options: [{ t, ok, fb }], explain, onCorrect, keepOrder }`; an action is
`{ label, cls, run(ctx), disabled(ctx) }` or `{ label, cls, hold: true, down(ctx), up(ctx) }`. `ctx` is
`{ sim, app, profile, view(), complete(), status(html, ok), pause(), resume(), next(), mark(label), stepState(), refresh() }`.
A scene with `showThreshold: true` draws the threshold line on the trace and the ladder.

**Write questions with the correct answer first** — it is easy to author and impossible to
mis-flag. `kit.questionOrder(q)` permutes the options for display, so students do not see the
answer in the same place every time. The permutation is derived from the question's own text: it
is unpredictable but stable, so returning to a question (or discussing "the second option" with a
class) does not reshuffle it, and a test can still find the answer with `options.findIndex(o => o.ok)`.
Set `keepOrder: true` on a question whose options read as a sequence. Any renderer of questions
outside `app.js` (a lab card, say) should go through `kit.questionOrder` too.

**Nothing a step does can stop the page.** Every `enter`/`tick`/`waitFor`/`status`/`narrate` call
is isolated: if one throws it is logged once and skipped, and the animation frame is scheduled
again regardless. Before this, a throw inside a step callback skipped `requestAnimationFrame` and
froze the clock, the trace and every control until the page was reloaded. `npm run test:robust`
checks both halves of that: that no step callback throws in any state the runner can produce
(notably "done" before the activity that produces the measurement its status line wants to
report — format those with a fallback, never `d.peak.toFixed(2)`), and that a deliberately
throwing callback does not stop the loop.

**Name the recording sites.** `profile.traceLabel(comp)` gives the legend a phrase a student can
read ("far end, 2.5 cm") instead of the compartment's internal id ("R8"), and
`profile.traceTitle(comp, extras)` receives every site on the plot so a second curve is never
unexplained. A step's inherited `extra` list is filtered against its own `record`, so a site is
never drawn twice. Only put a second trace in a scene that is *about* two places — an unexplained
second rise reads as a second event, not the same impulse arriving later.

**Narration is paced, not dropped.** `view.narrate()` is still called every frame, but lines are
queued and each is held about 1.3 s so a burst reads as a short slideshow; a line whose only
change is its live numbers is updated in place rather than counting as a new line. `#narrator`
gets `.fresh` for one animation as each line lands and `.more` while others are still queued.

### Lab

`lab(kit)` is called after the generic shell has reset the model, cleared history/markers, set
`app.showThreshold = true` and restored the default trace layout. It sets `app.recordComp`,
`app.extraTraces`, speed, mounts a view and renders the panel; `kit.labNav()` gives the
"← Back to lesson" row.

## The kit

Passed to `views`, `lesson`, `lab`, `drawCell` and the shared-scene builders.

- **state**: `sim`, `app` (`speed, paused, view, recordComp, extraTraces, showG, gComp, bands, history, historyMs, historyWindow, electrode, labels, markers, showThreshold`), `runner` (`scene, step, state, labMode`), `profile`, `panel`, `stage`, `views`, `config`, `lesson` (getter).
- **control**: `setPaused(p)`, `setSpeed(s)`, `mountView(name, opts)`, `gotoStep(scene, step)`, `enterLab()`, `renderProgress()`, `setCaption(text)`, `labNav()`, `stimPulse(nA?, ms?)` (= `sim.pulse(profile.stimComp, ...)`), `refire` (a "Fire again" action), `since(ctx)` (samples since the step began), `spikeIn(events, name)`, `anySpike(events)`, `I(ion)`/`chip(ion)`, `IN`, `OUT`, `FB_GRADIENT`, `fmtV(V)` (`−70.4`), `fmtE(V)` (`−70`), `LOOP_HTML`, `loopHighlight(ctx)` (reads `profile.apComp`), `questionOrder(q)`.
- **drawing**: `svgEl`, `setAttrs`, `htmlEl`, `$`, `clamp`, `lerp`, `rand`, `ION_COLOR`, `ION_LABEL`, `CH`, `vColor(V)`, `insideFill(V)`, `drawChannel`, `setChannelState`, `makeIonPool`, `makeParticles`, `fluxCounter`, `drawBilayer`, `drawChargeRow`, `drawInset(parent, region)`, `drawLadder(parent, x, y)`, `drawConcTable(parent, x, y)`, `drawCell(parent, opts)`.

## Shared scenes (`scenes/shared.js`)

```js
SharedScenes.restingMembrane(profile, kit, opts)     // id 'rest',      6 steps
SharedScenes.recordingElectrode(profile, kit, opts)  // id 'electrode', 1 step
SharedScenes.actionPotential(profile, kit, opts)     // id 'ap',        8 steps (set showThreshold yourself)
```

Each returns a scene object to place in the lesson array. What is parametrized: `profile.rest`
and `threshold` (copy, activity thresholds `rest + 7` / `rest − 3`, AP pauses at `rest − 6`,
`rest − 4`, `rest − 2`, `rest + 10`), the model's `E.Na`/`E.K` in copy, `profile.cellWord` and
`regionWord`, `profile.comp` (rest, electrode) and `profile.apComp` (AP scene), `profile.defaultView`,
`profile.manualG`, `kit.stimPulse`. With the neuron profile and no `opts` the copy is the
neuron lesson's, byte for byte.

`opts`:

| option | effect |
|---|---|
| `extraSteps: [step, ...]` | appended after the built-in steps |
| `replaceSteps: { 2: step }` | replaces the step at that 0-based index |
| `copy: { 'kLeak.fb0': '...' }` | overrides one string; keys are `<step>.title`, `.text`, `.prompt`, `.opt<i>`, `.fb<i>`, `.caption`, `.waitHint`, `.statusDone`, `.statusMissed`, and `scene.title` |
| `channelsForRest: [...]` | channel types drawn in the first resting-membrane step (default `['K_leak', 'Na_leak', 'pump']`) |
| `insetRegion: 'name'` | inset highlight (default: the recorded compartment) |

Step keys: resting membrane `solutions, pump, kLeak, naOpen, naObserve, kObserve`; electrode
`electrode`; action potential `rise, rising, peakApproach, peak, fallPredict, falling, undershoot, built`.

## Build and test

- `node build.js` writes `dist/index.html` and, once `muscle.html` exists, `dist/muscle.html`
  (every local `<script src>` and `<link rel="stylesheet">` inlined).
- `npm run test:robust` checks that no step callback throws and that the animation loop survives
  one that does (see **Lesson** above). `npm run test:walk` performs every muscle scene's activity
  through the panel buttons and checks the completion conditions.
- `npm test` runs the model tests; `npm run test:ui` walks every scene, step and lab view of
  `index.html` and `dist/index.html` in headless Chromium, fails on any console/page error and
  writes one screenshot per scene. `node tests/ui/smoke.js muscle.html dist/muscle.html` checks
  another page; `--out=DIR`, `--compare=DIR` (pixel diff against earlier screenshots) and
  `--dwell=MS` are optional. Playwright must be installed globally (`NODE_PATH` may be needed).
