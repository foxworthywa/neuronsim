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

Deliberately out of scope for now: myelin and saltatory conduction, multiple neuron types,
realistic brain anatomy in the zoom-in, scoring / accounts.
