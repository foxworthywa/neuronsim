# PRODUCT.md

An interactive biology simulator for intro-college / AP-level and pre-nursing anatomy &
physiology students. Goal: students construct a correct causal model of how excitable cells
signal, by predicting and then observing a real (simplified) simulation rather than watching
animations.

Two modules share one lesson engine:

- **NeuronSim** (`index.html`): one neuron: anatomy, resting membrane, synaptic input (excitatory
  and inhibitory), integration and threshold, action potential built from channel behaviour,
  propagation along an unmyelinated axon, transmitter release onto the next neuron, plus a
  free-play lab.
- **MuscleSim** (`muscle.html`): one skeletal muscle fibre, taught *before* the neuron in this
  course, so it introduces the resting membrane and the action potential from scratch: shock the
  fibre, threshold and all-or-none, refractory period, spread along the fibre and into the
  T-tubules, Ca²⁺ release and force, relaxation, the twitch on one time axis, summation and
  tetanus, then the neuromuscular junction, plus a lab of clinical scenarios (neuromuscular
  blockers, myasthenia, K⁺/Ca²⁺/Mg²⁺ imbalance, organophosphates, malignant hyperthermia, rigor).
  See `MUSCLE_MODULE.md`.

Architecture:

```
LESSON CONTENT (lessons/neuron.js, lessons/muscle.js + scenes/shared.js: the scene arrays)
   ↓
LESSON ENGINE (app.js: SimApp.init, gotoStep, renderPanel)
   question system            simulation state (engine.js: Neuron; muscle.js: MuscleFibre)
                                  ions · channels · voltage · Ca²⁺ · force
                                          │
                RENDERER (app.js: membrane view, trace, bands; lessons/neuron.js, views/muscle.js)
                       neuron · membrane · synapse · axon · fibre · triad · sarcomere · junction
```

The lesson controls what problem the student is investigating. The simulation determines what
happens biologically. The renderer shows the consequences. This separation is meant to be
reused for later modules (cardiac muscle, kidney, endocrine, gene expression).

Deliberately out of scope for now: myelin and saltatory conduction, multiple neuron types,
realistic brain anatomy in the zoom-in, scoring / accounts.
