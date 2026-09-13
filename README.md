# NeuronSim and MuscleSim — how excitable cells signal

Two interactive, model-driven lessons on one engine. **NeuronSim** builds a causal
understanding of neuronal signaling: receive → integrate → decide → propagate → transmit.
**MuscleSim** does the same for a skeletal muscle fibre: rest → shock → impulse → spread → Ca²⁺ →
force → relax → tetanus, then the neuromuscular junction, with a lab of clinical scenarios. The
muscle module is self-contained (it is taught first in the course it was built for) and
introduces the resting membrane and the action potential from scratch.

**Live versions:** https://foxworthywa.github.io/neuronsim/ (neuron) and
https://foxworthywa.github.io/neuronsim/muscle.html (muscle), rebuilt automatically on every push.

No build step. Open `index.html` in a browser (or serve the folder with any static server).

```
npm test          # biology unit tests (Node 18+)
npm start         # optional: serve on http://localhost:8080
node build.js     # bundle each page into dist/<page>.html (one self-contained file each)
```

`dist/index.html` is the single-file version: copy it anywhere, double-click it, or drop it on
GitHub Pages / a course site. It is regenerated from the source files by `node build.js`.

## What the student does

Ten scenes, each following **predict → observe → explain**:

1. Zoom from a person to one neuron.
2. Identify the parts of a neuron by their *function*.
3. The resting membrane: gradients, pump vs. permeability, open a Na⁺ / K⁺ channel yourself.
4. Insert a recording electrode; the voltage trace becomes persistent.
5. Receive a signal: Ca²⁺ → vesicles → transmitter → receptor → EPSP; then an inhibitory synapse.
6. Challenge: make the neuron fire (summation); then try again with inhibition active.
7. The axon hillock: voltage-gated channels and the Na⁺ positive-feedback loop.
8. Build the action potential curve phase by phase from channel behaviour.
9. Propagation along the axon; why it is one-way.
10. The terminal: Ca²⁺ entry and release onto the next neuron. The loop closes.

The stage explains itself as it runs: a narrator line describes the current state in causal
terms, a voltage ladder shows Na⁺ pulling Vm up toward +67 mV and K⁺ pulling it down toward
−95 mV in proportion to open channels, and the synapse view ticks off each step of transmission
as the model reaches it.

Then a **free-play lab**: block Na⁺/K⁺/Ca²⁺ channels, change extracellular K⁺, switch off
the pump, inject current, fire inputs repeatedly, and record from any compartment.

## MuscleSim (`muscle.html`)

Thirteen scenes on one skeletal muscle fibre, same predict → observe → explain rhythm:

1. Zoom from a person lifting a cup to one fibre; one impulse, one twitch.
2. Parts of a muscle fibre by *function* (sarcolemma, T-tubules, SR, myofibrils, end plate).
3. The resting membrane (−85 mV): gradients, pump vs. permeability, open a channel yourself.
4. Insert a recording electrode.
5. Shock the fibre: threshold, the Na⁺ positive-feedback loop, all-or-none.
6. Build the action potential phase by phase; the refractory period.
7. The impulse spreads both ways along the fibre and down the T-tubules.
8. Voltage to calcium: the tubule sensor opens the SR store (a Ca²⁺-free bath still twitches).
9. Calcium to force: troponin, tropomyosin, cross-bridges, ATP.
10. Relaxation: SERCA pumps Ca²⁺ back; with no ATP the fibre locks (rigor).
11. The twitch on one time axis: milliseconds of impulse, tens of ms of Ca²⁺, ~100 ms of force.
12. Summation and tetanus, discovered by raising the stimulation rate.
13. How the body delivers the shock: the neuromuscular junction, ACh, the end-plate potential
    and its safety margin.
(A fourteenth scene on motor units and grading force is specified but not yet built.)

The **lab** adds clinical scenario cards, each with a prediction: botulinum toxin, magnesium
sulfate and calcium gluconate, rocuronium with neostigmine or sugammadex, myasthenia gravis with
pyridostigmine and cholinergic crisis, succinylcholine, organophosphate poisoning, hyper- and
hypokalaemia (with IV calcium), hypo- and hypercalcaemia, malignant hyperthermia and dantrolene,
rigor mortis versus cramp, and "which calcium?". The design and every question are in
`docs/MUSCLE_MODULE.md`; the model is `muscle.js`, tested by `tests/muscle.test.js`.

## How it works

- `engine.js` — the simulation. A simplified Hodgkin–Huxley conductance model
  (`I = g·(V − E)` for Na⁺, K⁺, leak, synaptic and Ca²⁺ currents) with Nernst reversal
  potentials computed from concentrations, in 16 coupled compartments (dendrite, soma, hillock,
  12 axon segments, terminal). Presynaptic terminals model Ca²⁺ channel gating, cytosolic Ca²⁺,
  vesicle release and transmitter clearance; receptors bind transmitter and open. Works in the
  browser and in Node.
- `app.js` — the page-agnostic lesson engine (scenes, questions, feedback, activity gating),
  the generic membrane view and the canvas voltage trace (`SimApp.init`, see `docs/APP_API.md`).
  Every visual is rendered from engine state; nothing is a pre-baked animation.
- `scenes/shared.js` — the resting-membrane, recording-electrode and action-potential scenes,
  built from a cell profile so other modules (muscle) can re-stage them.
- `lessons/neuron.js` — everything neuron-specific: the neuron drawing, the zoom/neuron/synapse/axon
  views, the ten-scene lesson and the lab. `index.html` + `style.css` are the page.
- `muscle.js` — the skeletal muscle fibre: 17 coupled sarcolemma segments (3 cm) with the same
  channel kinetics, a split K⁺/Na⁺ leak resting at −85 mV, per-segment excitation–contraction
  coupling (T-tubule sensor → SR release channel → cytosolic Ca²⁺ → troponin → cross-bridges →
  force, SERCA return, ATP), a neuromuscular junction built from the engine's terminal and
  receptor classes, and the drug/ion controls behind the clinical scenarios.
- `views/muscle.js` — the fibre, fibre-wave, triad, sarcomere and junction views;
  `lessons/muscle.js` — the fourteen-scene lesson and the scenario lab; `muscle.html` is the page.
- `tests/biology.test.js`, `tests/muscle.test.js` — "scientific unit tests" asserting the physiology;
  `tests/ui/smoke.js` — a Playwright walk of every scene, step and lab view (`npm run test:ui`).
- `docs/` — `PRODUCT.md`, `BIOLOGY.md`, `PEDAGOGY.md`, `VISUAL_STYLE.md`, `NEURON_MODULE.md`,
  `MUSCLE_MODULE.md`, `MUSCLE_VIEWS.md`, `APP_API.md`.

Keyboard: **space** pauses/resumes the simulation clock. The speed menu sets how much simulated
time passes per real second (default 1 %: a 2 ms action potential takes ~0.2 s; scenes 7–10 use
0.3 %).

## Model notes (for instructors)

- Units: mV, ms, µS, nF, nA. Compartment areas set capacitance and channel numbers.
- Resting potential is calibrated to exactly −70 mV by the leak reversal; E_K ≈ −95 mV, E_Na ≈ +67 mV.
- Threshold at the hillock is about −55 mV; a single EPSP is ≈ 6 mV at the soma; two EPSPs within
  a few ms stay subthreshold, three fire the cell; input C (Cl⁻, E ≈ −78 mV) can veto that.
- Gating kinetics are the classic squid-axon rates, so the action potential is ~2 ms wide.
- The axon is unmyelinated (12 × 100 µm segments, 1 µm diameter); conduction takes ~3.5 ms end to end.
- Ion drawings are not to scale; leak-channel traffic is exaggerated so it is visible.
