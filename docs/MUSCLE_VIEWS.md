# MUSCLE_VIEWS.md — contract between the muscle views and the muscle lesson

The muscle page (`muscle.html`) is built on `app.js` exactly as described in `APP_API.md`.
Two files divide the work:

- `views/muscle.js` defines `window.MuscleViews = (kit) => ({ drawCell, views })`, where
  `views` is the `{ name: (opts) => view }` object to pass to `SimApp.init` and `drawCell` is the
  whole-fibre drawing used for insets.
- `lessons/muscle.js` defines `window.MuscleLesson = { profile, drawCell, views, lesson, lab }`
  by calling `MuscleViews(kit)` from inside `views(kit)` / `drawCell(parent, opts, kit)`.

Load order in `muscle.html`: `engine.js`, `muscle.js`, `app.js`, `scenes/shared.js`,
`views/muscle.js`, `lessons/muscle.js`, then the boot script
`window.__musclesim = SimApp.init(Object.assign({ model: new MuscleSim.MuscleFibre() }, MuscleLesson))`.

## The model (`muscle.js`, `MuscleSim.MuscleFibre`)

Segments `sim.comps[0..16]`, names `L8 … L1, endplate, R1 … R8` (`sim.byName`, aliases
`sim.byName.end` = R8, `sim.byName.mid` = R4, getters `sim.endplate`, `sim.end`). Each segment has
the membrane fields the generic code expects (`V, m, h, n, gNa, gK, gL, gNaMax, gKLeak, gNaLeak, iNa, iK, iL, dVdt`)
plus excitation–contraction state: `d` (T-tubule voltage sensor 0..1), `ryr` (SR release channel
open fraction), `caSR` (store content 0..1), `ca` (cytosolic Ca²⁺, µM, rest 0.1, twitch peak a
few µM), `tn` (troponin occupancy 0..1), `xb` (attached cross-bridges 0..1), `cocked` (pre-cocked
heads), `force` (lagged xb).

Whole-fibre readouts: `sim.force` (0 rest … ≈ 0.3 twitch … 1 fused tetanus, 1.05 rigor),
`sim.ca` (mean cytosolic Ca²⁺ µM), `sim.srLevel` (mean store 0..1), `sim.heat`, `sim.isFused`,
`sim.gatingShift` (mV), `sim.terminalCaFactor`, `sim.spontaneousRate` (Hz), `sim.refShockNA`,
`sim.thresholdStrength()` (× reference; expensive: call at most a few times per second),
`sim.sampleExtras()` → `{ ca, force, sr, nerve, epp }` (the trace bands use `ca` and `force`).

Junction: `sim.terminal` (engine `Terminal`: `s` Ca²⁺ channel activation, `iCa`, `ca` µM,
`releaseRate`, `vesicles`, `nt` cleft ACh), `sim.receptor` (engine `Receptor`: `r` open fraction,
`g`, `i`, `E = 0`, `block`), `sim.nerveV` (the motor terminal's voltage), `sim.receptorState()`.

State helpers for drawing: `naState(c)`, `kState(c)` (`'closed'|'open'|'inactivated'`),
`caState(sim.terminal)`, `sensorState(c)` (`'resting'|'active'`), `ryrState(c)`
(`'closed'|'open'`), `troponinState(c)` (`'free'|'bound'`), `bridgeState(c)` (`'detached'|'attached'`).

Controls (all reset by `sim.reset()`): `shock(strength = 1.5, ms = 0.5, segment = 'endplate')`
(strength is × the reference threshold current; `segment` may be `'end'`), `pair(intervalMs, strength)`,
`train(rateHz, n, strength)`, `command()` (one nerve impulse), `commandTrain(rateHz, n)`,
`cancelScheduled()`, `pulse(comp, nA, ms)` / `setStim` (generic), `manual {gNa, gK, gCl}` (on the
end-plate segment), `naBlock`, `kBlock`, `pumpOn`, `pumpRundownRate`, `conc.K/Na/Ca/Mg .out`,
`setCaFreeBath(on)` (Ca²⁺ replaced by Mg²⁺), `atp` (1 or 0), `atpDecline`, `ryrLeak` (0..1),
`dantrolene` (0..1), `acheActivity` (1 normal, 0.3 pyridostigmine/neostigmine, 0.05 overdose, 0 organophosphate),
`agonist` (0.6 = succinylcholine), `releaseBlock` (1 = botulinum), `receptorDensity` (0.2 = myasthenia),
`receptor.block` (0..1 rocuronium; 0 = sugammadex), `nerveEnabled` (spontaneous commands when
extracellular Ca²⁺/Mg²⁺ is low).

Events from `takeEvents()`: `shock {name, strength}`, `command`, `spontaneous_command`,
`spike {name}` (per segment), `release`, `epp_peak {V}`, `ca_release {name}`, `twitch_peak {force}`,
`relaxed`, `tetanus_fused {force}`.

Calibrated behaviour the views and lesson can rely on: rest −85 mV; threshold ≈ −60 mV; a
0.5 ms shock of strength 1 just fires; the spike lasts ≈ 1 ms, peaks ≈ +50 mV, dips to −93; a shock
3 ms after a spike fails, 4 ms succeeds; the wave takes ≈ 3 ms from the end plate to either end;
one twitch peaks at ≈ 0.3 after ≈ 33 ms and is back near 0.03 by ≈ 200 ms; a 20 ms doublet is
1.7× a twitch; 10 Hz unfused, 50 Hz fused at ≈ 0.7, 100 Hz ≈ 1.0; the end-plate potential alone
(Na⁺ blocked) peaks near −30 mV; twitches survive 80 % receptor block and fail at 85 %; the stimulus
artefact at the end-plate segment is large, so scenes 5–6 record from `R3`.

## Profile (owned by the lesson)

```js
profile = {
  id: 'muscle', cellWord: 'muscle fibre', regionWord: 'muscle fibre',
  rest: -85, threshold: -60,
  comp: 'endplate',            // manual channels and default recording (scenes 3–4)
  apComp: 'R3',                // scenes 5–6 record here (5 mm from the stimulator)
  stimComp: 'endplate', stimPulse: { nA: <1.5 × sim.refShockNA>, ms: 0.5 },
  manualG: { gNa: 0.9, gK: 6, gCl: 6 },     // µS (a fibre segment is ~200× a soma)
  defaultView: 'fibre',
  traceColors: { endplate: '#1f2430', R3: '#b45309', R8: '#0f766e', L8: '#7c3aed', mid: '#0f766e' },
  traceTitle: (comp) => `Membrane potential recorded inside the fibre (${comp === 'endplate' ? 'end plate' : comp === 'R3' ? '5 mm from the end plate' : comp})`,
  probeV: () => undefined, extraVoltages: (sim) => ({ nerve: sim.nerveV }),
  insetRegions: { endplate: [...], R3: [...], fibre: [...], triad: [...], sarcomere: [...], nmj: [...], default: [...] },
}
```

## Views (owned by `views/muscle.js`)

All views draw an SVG with `viewBox="0 0 900 520"` into the stage, call `kit.setCaption(opts.caption)`,
keep a whole-fibre inset via `kit.drawInset(svg, region)` where the lesson asks for one, and return
`{ mount(el), update(dtReal, dtSim, events), narrate(), unmount?() }` plus the members listed.
Colours: ions as `kit.ION_COLOR`; force/cross-bridges red-brown `#a0442a`; SR store fill
`#2d8fd5` (cisternae solid, group opacity `0.3 + 0.7 × srLevel`); T-tubule `#8a7a50` with a
`#f4f1e6` lumen; troponin/tropomyosin cover `#6b7280`; highlight marks `#2f6fd6`.

| view | opts | extra members | what it shows |
|---|---|---|---|
| `zoomMuscle` | `{}` | `next()`, `index`, `last` | five slides: person lifting a cup → arm → muscle (fascicles) → one fascicle → one fibre with a small trace blip + force gauge bump on the last slide. Same shape as the neuron `zoom` view. Slides 1 and 2 show the **same flexed arm**: the person's elbow is held open so the upper arm the circle marks is visible, and slide 2 draws the forearm rising from the elbow, so the biceps is seen pulling the forearm towards it. |
| `fibre` | `{ caption, labels, stimulator, showForce }` | `onPart = fn(part)`, `highlight(part)`, `hint(part)`, `parts()` | whole fibre, horizontal, ≈ 3 cm drawn long; sarcolemma coloured per segment by `kit.vColor(c.V)`; **T-tubules on both faces** (one per segment, drawn as an open mouth on the sarcolemma and a tunnel with a pale lumen diving inward, since they are folds of the surface and a fibre has them all round); the **sarcoplasmic reticulum** as a longitudinal sleeve inside each face that swells into a pair of **terminal cisternae** flanking every tubule, the whole group fading with `sim.srLevel` so an emptying store is visible; myofibril stripes centred so both faces have room; the motor end plate in the middle (a small nerve ending stub; no nerve beyond it); parts clickable with `data-part` ∈ `sarcolemma, ttubule, sr, myofibril, endplate` (the tubule mouths hit `ttubule`, the cisternae hit `sr`); `highlight(part)` shows marks drawn **over the structure itself** — a tint down every tunnel, a band round the cisternae, a rect round each myofibril — rather than one ellipse swept over part of the membrane, and `hint(part)` pulses those marks for about 2.5 s and then hides them again, a ghost that shows a student where a small structure is without leaving an outline over the model; each label in `labels` carries a leader line to what it names; the recording electrode (`kit.app.electrode`) at `profile.comp`… actually at the compartment named by `opts.electrodeAt` (default `'R3'`); a stimulating electrode pair at the end plate when `opts.stimulator`; the whole fibre shortens visibly with `sim.force` (up to ≈ 10 %) and a **force gauge** (vertical bar, 0–1, labelled) when `opts.showForce`. `narrate()` describes the state (rest, impulse spreading, Ca²⁺ up, force rising/falling, tetanus, rigor). |
| `fibreWave` | `{ caption, showTubules }` | – | unrolled fibre like the neuron `axon` view: one box per segment coloured by `kit.insideFill(V)`, a Na⁺ and a K⁺ channel glyph per segment (`kit.drawChannel`, states from `sim.naState/kState`), T-tubule openings under each segment that light when `sensorState` is active, local-current arrows between segments, and a V-vs-position snapshot polyline below. Inset region `fibre`. |
| `triad` | `{ caption }` | `checklist()` | zoomed T-tubule wall (top, coloured by `endplate`… no: by the `R3` segment's V) with the voltage sensor glyph (moves when `sensorState` active), the SR beneath it with its release channel (`ryrState`) and a store fill level (`caSR`), the SERCA pump glyph with ATP label, cytosolic Ca²⁺ dots that appear at the release channel and vanish at SERCA (particle count from `ca`), the edge of a myofibril; an **EC checklist** on the right (rows: impulse in the tubule → sensor moves → release channel opens → Ca²⁺ floods → Ca²⁺ binds troponin → cover moves → bridges cycle (ATP) → force → SERCA pumps Ca²⁺ back → troponin releases → force falls) that lights rows from model state (`d, ryr, ca, tn, xb, force` of the R3 segment and `sim.atp`); a small force gauge; inset region `triad`. When `sim.ryrLeak > 0` the release channel is drawn stuck open; when `sim.atp === 0` the SERCA glyph is greyed. |
| `sarcomere` | `{ caption }` | – | one sarcomere: Z lines, thin filaments with the tropomyosin cover (slides aside when `troponinState` bound) and troponin knobs (blue when bound), thick filament with 6–8 cross-bridge heads that attach/pull/detach (`xb` sets how many are attached; cycle animation only while `sim.atp > 0`), sarcomere length shrinking with `force`; ATP meter (`sim.atp`); force gauge; the same EC checklist as `triad`; inset region `sarcomere`. |
| `nmj` | `{ caption }` | `checklist()` | the neuromuscular junction, modelled on the neuron `synapse` view: motor terminal bulb (top, tinted by `sim.nerveV`) with two `Ca_v` channels (`kit.drawChannel`, state `kit.sim.caState(sim.terminal)`), vesicles that fuse on `release` events, ACh dots (magenta `kit.ION_COLOR.NT`) crossing the cleft, **AChE** glyphs in the cleft that "eat" dots (draw more eating when `sim.acheActivity` is high, none when 0), the folded end plate (bilayer via `kit.drawBilayer`) with nicotinic receptor channels (add `kit.CH.nAChR = { color: ION_COLOR.Na, label: 'ACh receptor (Na⁺/K⁺ channel)', ion: 'Na', dir: -1, receptor: true }`) open when `sim.receptorState() === 'open'`, Na⁺ particles entering; a **junction checklist** (rows: command arrives → Ca²⁺ channels open → Ca²⁺ in → vesicles fuse → ACh crosses the gap → receptors open → Na⁺ in → end-plate potential → Na⁺ channels open → impulse → AChE removes ACh) lit from model state; the end-plate cytosol tinted by `insideFill(endplate.V)`; inset region `nmj`. `narrate()` describes the stage. Blocked receptors (`sim.receptor.block`) are drawn with a grey plug on a proportional share of the receptor glyphs; reduced density (`sim.receptorDensity`) hides a share of them; `sim.agonist > 0` shows magenta dots that never disappear. |
| `motorUnit` | `{ caption }` | `recruit(n)`, `rate(hz)` (optional; scene 14 is optional) | three fibre bundles of different size, each shading with force; the lesson drives them with `sim.commandTrain`; if not built, the lesson skips scene 14. |

`drawCell(parent, opts, kit)` draws the compact whole fibre (as in `fibre`, no interaction),
returns `{ g, parts, update(opts) }`; `update` recolours segments from `sim.comps[i].V`, sets the
force shortening, and shows the electrode when `kit.app.electrode`.

The generic `membrane` view is used for scenes 3–6 with `comp: 'endplate'` (3–4) and
`comp: 'R3'` (5–6), `inset: 'endplate' | 'R3'`, channels as in the neuron lesson; the membrane
view's manual channels act on the end-plate segment (`sim.manual`) regardless of `comp`, so
scenes 3–4 use `comp: 'endplate'`.

## Deviations (as built)

- `motorUnit` was not built; the lesson skips scene 14 (grading force) when the view is absent,
  so the page has 13 scenes. The scene's copy is kept in `lessons/muscle.js` for when it is added.
- `fibreWave` ignores `opts.showTubules` (the T-tubule openings are always drawn).
- The fibre is drawn 110 units deep (was 84) to leave a 25-unit band inside each face for the
  tubules and cisternae; `FIB.h` and `MYO_Y(k)` are the only geometry anything else needs.
- `zoomMuscle` fires one real shock (`sim.shock(1.5)`) when the last slide is reached, so the
  blip and the twitch on that slide come from the model.
- The `fibre` view's `electrodeAt` option places the recording electrode; `showForce: false`
  hides the gauge (insets use it).
- A new profile field, `fluxScale`, scales the membrane view's ion-traffic particles per nA
  (0.006 for the fibre, whose segments carry ~150× a soma's current); documented in APP_API.md.
- The model records each segment's peak value of every fast variable since the last
  `resetPeaks()` — `vPeak`, `dPeak`, `ryrPeak`, `caPeak`, `tnPeak`, `forcePeak`, sampled at each
  integration step — so a lesson can ask "did this happen?" without the answer depending on where
  the animation frames fell. Scene 7's "every tubule lit" check and scene 11's phase walk both
  read them; `tests/muscle.test.js` asserts they agree between a 0.1 ms and a 5 ms caller step.
  The `epp_peak` event reports the end plate's peak voltage while the receptors are open.
- Lesson shock buttons in scenes 6 and 7 refuse to fire while the fibre is refractory (status
  line explains); the half-block comparison in scene 13 refuses until the fibre has relaxed.
