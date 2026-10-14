# A&P models: interactive physiology simulations

Model-driven lessons for intro-college anatomy & physiology (BIO 141/142). Students predict,
then test their prediction against a running simulation, then explain. Every picture is drawn
from the model's state; nothing is a canned animation.

| Model | Course | Status |
|---|---|---|
| **NeuronSim**: how a neuron signals (`neuron/`) | BIO 141 | complete: 10 scenes + lab |
| **HeartSim**: heart and circulation (`heart/`) | BIO 142 | Part A (the pump) built; Parts B–C planned |

**Live version:** https://foxworthywa.github.io/neuronsim/ (rebuilt automatically on every push
to the deploy branches; see `.github/workflows/pages.yml`).

No build step for development. Open `index.html`, `neuron/index.html` or `heart/index.html` in a
browser, or serve the folder with any static server.

```
npm test          # physiology unit tests for every model (Node 18+)
npm start         # optional: serve on http://localhost:8080
node build.js     # bundle each model into one self-contained file in dist/
```

`dist/` holds the single-file versions: `index.html` (landing page), `neuron.html`, `heart.html`.
Copy any of them anywhere, double-click it, or upload it to a course site. Regenerate with
`node build.js`.

## Layout

```
index.html            landing page
lib/lesson.js         shared lesson runner: scenes, questions + targeted feedback, gating, answer record
lib/base.css          shared layout and styles
neuron/               NeuronSim: engine.js (model), app.js (views + lesson), index.html
heart/                HeartSim:  engine.js (model), app.js (views + lesson), index.html
tests/                neuron.test.js, heart.test.js: the physiology each model must obey
docs/                 PRODUCT, PEDAGOGY, BIOLOGY, VISUAL_STYLE, NEURON_MODULE, HEART_MODULE
assignments/          Canvas assignment text (student-facing; answer keys are kept out of this public repo)
```

## HeartSim Part A: the heart as a pump (~40–45 min)

Six scenes, each **predict → observe → explain**:

1. **The real heart.** A beating frontal section (its four valves driven by the model): orient
   (whose left?), then find the chambers and valves by their function.
2. **Two pumps, one loop.** Follow a red blood cell through the real heart, lungs and body; then
   watch the anatomy slide apart into the box diagram (and back) to see that it is the same
   heart. Arteries vs. veins; both sides pump the same volume, against very different pressures.
3. **Pressure moves blood.** The left side is straightened out of the real heart into a line
   (a small inset keeps showing where it came from), with a guided key to reading it. The
   heartbeat is off and the student squeezes the ventricle by hand, discovering that pressure
   alone opens and shuts the valves.
4. **Building the cardiac cycle.** One beat at a time, pausing at each valve event; heart sounds
   S1/S2 are heard when the model's valves shut; the four phases.
5. **How much per beat?** The pressure–volume loop: identify its sides, measure stroke volume
   and ejection fraction.
6. **More in, more out.** Preload (IV fluid), afterload (constricted arterioles), and a heart
   attack weakening the left ventricle: blood dams in the lungs until Frank–Starling rebalances
   the two sides; then Dana's fluid retention and her diuretic.

A fictional patient, Dana (two weeks after a heart attack), runs through the lab: her case opens
it, and her heart attack, fluid retention and diuretic are the last experiments. Part A ends with
the student's results and a completion code (checked at `heart/index.html#verify`); the graded
work is a reasoning worksheet (`assignments/heart-part-A.md`).

The model (`heart/engine.js`) is a closed-loop lumped circulation: four time-varying-elastance
chambers (exponential passive filling curve for the ventricles), one-way valves (the semilunar
valves with inertia, so the aortic trace shows the dicrotic notch), systemic and pulmonary arteries
and veins as compliances, and exactly conserved blood volume. Defaults give a resting adult:
≈ 126/81 mmHg, EDV 118 mL, SV 71 mL, EF 60 %, CO 5.3 L/min. Details: `docs/HEART_MODULE.md`.

Keyboard: **P** pauses/resumes; every control, question and diagram target is keyboard-operable.

## NeuronSim: how a neuron signals

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

- `neuron/engine.js`: the simulation. A simplified Hodgkin–Huxley conductance model
  (`I = g·(V − E)` for Na⁺, K⁺, leak, synaptic and Ca²⁺ currents) with Nernst reversal
  potentials computed from concentrations, in 16 coupled compartments (dendrite, soma, hillock,
  12 axon segments, terminal). Presynaptic terminals model Ca²⁺ channel gating, cytosolic Ca²⁺,
  vesicle release and transmitter clearance; receptors bind transmitter and open. Works in the
  browser and in Node.
- `neuron/app.js`: the lesson engine, the SVG views (neuron, membrane strip, synapse, axon) and
  the canvas voltage trace.

Keyboard: **space** pauses/resumes the simulation clock. The speed menu sets how much simulated
time passes per real second (default 1 %: a 2 ms action potential takes ~0.2 s; scenes 7–10 use
0.3 %).

### Model notes (for instructors)

- Units: mV, ms, µS, nF, nA. Compartment areas set capacitance and channel numbers.
- Resting potential is calibrated to exactly −70 mV by the leak reversal; E_K ≈ −95 mV, E_Na ≈ +67 mV.
- Threshold at the hillock is about −55 mV; a single EPSP is ≈ 6 mV at the soma; two EPSPs within
  a few ms stay subthreshold, three fire the cell; input C (Cl⁻, E ≈ −78 mV) can veto that.
- Gating kinetics are the classic squid-axon rates, so the action potential is ~2 ms wide.
- The axon is unmyelinated (12 × 100 µm segments, 1 µm diameter); conduction takes ~3.5 ms end to end.
- Ion drawings are not to scale; leak-channel traffic is exaggerated so it is visible.
