# NEURON_MODULE.md — scene sequence (Prototype 0.1 + 0.2)

Every scene lists: the view, what the student does, the prediction(s), and the acceptance condition.
Implemented in `app.js` (`LESSON`).

| # | Scene | View | Student does | Predict | Done when |
|---|-------|------|--------------|---------|-----------|
| 1 | Where are we? | zoom slides: person → head → network → neurons → one neuron | clicks "Zoom in" | – | last slide reached |
| 2 | Parts of a neuron | whole neuron, labels hidden | clicks the structure matching a **functional** description (dendrites, soma, hillock, axon, terminals) | – | all five found |
| 3 | Resting membrane | membrane strip of the soma with K⁺ leak, Na⁺ leak, pump | reads gradients; answers; holds "open Na⁺ channels" and "open K⁺ channels" | which ion is high inside; pump vs permeability; K⁺ direction; Na⁺ direction; Vm change for Na⁺; Vm change for K⁺ | Vm rose above −62 / fell below −73 |
| 4 | Recording from inside | whole neuron with electrode; trace becomes persistent | answers | meaning of −70 mV | answered |
| 5 | Receiving a signal | synapse of input A (excitatory), then input C (inhibitory) | fires A, watches Ca²⁺ → vesicles → transmitter → receptors → EPSP; fires C | Ca²⁺ direction; Vm change (EPSP); Cl⁻ direction and effect | release seen; EPSP > 4 mV; IPSP receptor opened |
| 6 | Adding up the inputs | whole neuron, three inputs | "make it fire" with A/B; then again while C fires repeatedly | why several inputs; why inhibition makes it harder | hillock spike; 6 attempts or spike |
| 7 | The axon hillock | hillock membrane, dense V-gated channels | depolarizes to threshold; sim pauses at ≈ −55 mV | what opens a V-gated channel; what Na⁺ channels do at −55; what Na⁺ entry does to neighbours (positive feedback) | hillock fires; loop diagram lights up |
| 8 | Building the action potential | hillock membrane + conductance traces; sim pauses at rise, peak, undershoot | triggers; answers at each pause | Vm heading (rise); K⁺ direction (peak); Vm change (fall); why undershoot; why refractory | membrane recovered |
| 9 | Down the axon | unrolled axon with per-segment channel states and V-vs-position profile; three electrodes | fires; watches wave and channel states | what opens the next segment; why not backward | terminal spike |
| 10 | Passing it on | our terminal facing the next neuron; then whole neuron | sends an AP; watches Ca²⁺ → release → next-neuron EPSP | which channel responds to voltage; what the next neuron does | release event; loop closed → Lab |

## Free-play lab

Same model, all controls: fire inputs (single or repeated), synapse strengths, current injection,
hold-to-open Na⁺/K⁺/Cl⁻ channels, TTX (Na⁺ block), TEA (K⁺ block), Ca²⁺ channel block,
receptor antagonist, extracellular K⁺ and Na⁺, pump on/off (accelerated rundown), recording site,
and any of the views.

## Feedback rules

- Wrong option → its own targeted feedback, options stay enabled.
- Right option → explanation, options lock, Continue enabled (once the activity is also done).
- Activity status line shows live Vm and what was observed once done.

## Physiological assumptions

See `BIOLOGY.md`. Model details: `engine.js` header comment and `README.md`.

## Acceptance tests

`tests/biology.test.js` (run `npm test`): gradients and Nernst signs; stable rest at −70 mV;
Na⁺ conductance → inward current and depolarization; K⁺ conductance → outward current and
repolarization; single EPSP subthreshold; summation to threshold; inhibition prevents firing;
overshoot and undershoot; Na⁺ inactivation; ordered propagation with delay; terminal Ca²⁺ entry
and release; next-neuron EPSP; no AP → no release; TTX blocks AP; Ca²⁺ block prevents release;
high extracellular K⁺ depolarizes; pump off does not change Vm immediately.
