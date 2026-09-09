# NeuronSim — how a neuron signals

An interactive, model-driven lesson that helps students build an intuitive, *causal*
understanding of neuronal signaling: receive → integrate → decide → propagate → transmit.

No build step. Open `index.html` in a browser (or serve the folder with any static server).

```
npm test          # biology unit tests (Node 18+)
npm start         # optional: serve on http://localhost:8080
node build.js     # bundle everything into dist/index.html (one self-contained file)
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

Then a **free-play lab**: block Na⁺/K⁺/Ca²⁺ channels, change extracellular K⁺, switch off
the pump, inject current, fire inputs repeatedly, and record from any compartment.

## How it works

- `engine.js` — the simulation. A simplified Hodgkin–Huxley conductance model
  (`I = g·(V − E)` for Na⁺, K⁺, leak, synaptic and Ca²⁺ currents) with Nernst reversal
  potentials computed from concentrations, in 16 coupled compartments (dendrite, soma, hillock,
  12 axon segments, terminal). Presynaptic terminals model Ca²⁺ channel gating, cytosolic Ca²⁺,
  vesicle release and transmitter clearance; receptors bind transmitter and open. Works in the
  browser and in Node.
- `app.js` — the lesson engine (scenes, questions, feedback, activity gating), the SVG views
  (neuron, membrane strip, synapse, axon) and the canvas voltage trace. Every visual is rendered
  from engine state; nothing is a pre-baked animation.
- `tests/biology.test.js` — "scientific unit tests" asserting the physiology.
- `docs/` — `PRODUCT.md`, `BIOLOGY.md`, `PEDAGOGY.md`, `VISUAL_STYLE.md`, `NEURON_MODULE.md`.

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
