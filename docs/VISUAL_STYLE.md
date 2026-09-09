# VISUAL_STYLE.md

Diagrammatic textbook + animated scientific visualization. Not a cartoon, not realistic anatomy.

- Pale neutral background (`#f6f5f0`); white panels; dark membrane strokes.
- Extracellular fluid: pale blue. Cytosol: cream, warming to orange as it depolarizes and cooling
  to blue when hyperpolarized (`insideFill`).
- Ion colours are fixed everywhere: Na⁺ orange `#e8772e`, K⁺ violet `#8e5cf0`, Cl⁻ green
  `#3cae6c`, Ca²⁺ blue `#2d8fd5`, intracellular anions grey, neurotransmitter magenta `#d63c8a`.
- Whole-neuron colour encodes membrane potential (blue → slate at rest → orange → red).
- Channels: two subunits, a coloured gate that disappears when open, a dark ball in the inner
  mouth when inactivated. Voltage-gated channels carry a small "V"; receptors have binding cups.
- Ions are not decorative: background ions jitter to show concentration; discrete ions cross
  the membrane only when the model says current is flowing, from the side they came from to
  the side they went to.
- Slow motion by default (0.2 %–1 % of real time) so a 2 ms action potential takes seconds.
- The voltage trace is always visible with the threshold (dashed orange) and rest (dotted blue) lines.
- Zoomed views keep a whole-neuron inset with the current region ringed.
- Minimal labels; the currently causal structure is highlighted.
