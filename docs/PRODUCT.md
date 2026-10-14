# PRODUCT.md

**NeuronSim** is the first vertical slice of an interactive biology simulator for intro-college /
AP-level students. Goal: students construct a correct causal model of how a neuron signals,
by predicting and then observing a real (simplified) simulation rather than watching animations.

Scope of this slice: one neuron: anatomy, resting membrane, synaptic input (excitatory and
inhibitory), integration and threshold, action potential built from channel behaviour,
propagation along an unmyelinated axon, transmitter release onto the next neuron, plus a
free-play lab.

Architecture:

```
LESSON ENGINE (app.js: LESSON, gotoStep, renderPanel)
   question system            simulation state (engine.js: Neuron)
                                  ions · channels · voltage
                                          │
                              RENDERER (app.js: views.*)
                       neuron · membrane · synapse · axon · trace
```

The lesson controls what problem the student is investigating. The simulation determines what
happens biologically. The renderer shows the consequences. This separation is meant to be
reused for later modules (muscle, kidney, endocrine, gene expression).

Planned BIO 142 (A&P II) modules, in build order: **heart and circulation** (design in
`HEART_MODULE.md`), kidney / fluid balance, respiratory + acid–base, reproductive hormone cycle,
immune response, digestive. Modules are meant to share state where the physiology does
(blood pressure drives GFR; ventilation sets pH) so later cases can involve several systems.

Deliberately out of scope for now: myelin and saltatory conduction, multiple neuron types,
realistic brain anatomy in the zoom-in, scoring / accounts.
