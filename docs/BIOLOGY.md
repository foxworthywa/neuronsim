# BIOLOGY.md — physiological constraints the simulation must respect

These are treated as immutable. Any change to `engine.js` must keep every
statement below true, and `tests/biology.test.js` checks most of them.

## Ion gradients (mammalian neuron, 37 °C)

| Ion  | Outside (mM) | Inside (mM) | Nernst potential |
|------|-------------:|------------:|-----------------:|
| Na⁺  | 145 | 12     | ≈ +67 mV |
| K⁺   | 4   | 140    | ≈ −95 mV |
| Cl⁻  | 110 | 6      | ≈ −78 mV |
| Ca²⁺ | 2   | 0.0001 | ≈ +132 mV |

- Intracellular K⁺ ≫ extracellular K⁺.
- Extracellular Na⁺ ≫ intracellular Na⁺.
- Extracellular Ca²⁺ ≫ cytosolic free Ca²⁺ (about 20,000-fold).
- Large intracellular anions (proteins, A⁻) cannot cross the membrane.

## Resting membrane

- Resting Vm ≈ −70 mV, inside negative relative to outside.
- The Na⁺/K⁺ ATPase **maintains the concentration gradients** (3 Na⁺ out, 2 K⁺ in per ATP).
- The resting potential arises mainly from **selective permeability**, dominated by K⁺ leak
  channels; a small Na⁺ leak keeps Vm positive to E_K.
- Switching the pump off does not change Vm immediately; Vm drifts only as the gradients run down.
- Raising extracellular K⁺ depolarizes the resting membrane.

## Ion movement

- Ions move down their electrochemical gradient (concentration gradient + electrical force).
- Opening Na⁺ channels at rest produces inward Na⁺ current → depolarization.
- Opening K⁺ channels produces outward K⁺ current → hyperpolarization / repolarization.
- Opening Cl⁻ channels moves Vm toward E_Cl (near or just below rest): a small IPSP plus
  shunting that opposes depolarization.
- Only a minute fraction of the ions cross during a signal; concentrations are essentially unchanged.

## Synaptic transmission

- A presynaptic action potential opens **voltage-gated Ca²⁺ channels**; Ca²⁺ enters.
- Ca²⁺ triggers vesicle fusion and transmitter release into the cleft.
- Transmitter binds **ligand-gated receptor channels** on the postsynaptic membrane.
- Excitatory receptors are non-selective cation channels with reversal ≈ 0 mV; at resting
  potential the net current is inward and carried mainly by Na⁺.
- Inhibitory receptors open Cl⁻ (or K⁺) channels with reversal near or below rest.
- A transmitter is not intrinsically excitatory or inhibitory; the receptor and the ions it passes decide.
- Blocking terminal Ca²⁺ channels prevents release even though the action potential arrives.

## Integration

- EPSPs are a few mV and last ~10–20 ms.
- EPSPs and IPSPs sum (temporal and spatial summation) in the dendrites and soma.
- Threshold ≈ −55 mV at the axon hillock. Subthreshold summation does not fire; sufficient
  summed excitation does. Concurrent inhibition can prevent firing.

## Action potential

- The hillock / initial segment has the highest density of voltage-gated Na⁺ and K⁺ channels,
  so the action potential starts there.
- Depolarization opens voltage-gated Na⁺ channels (positive feedback); Vm overshoots 0 mV heading
  toward E_Na.
- Na⁺ channels **inactivate** rapidly; voltage-gated K⁺ channels activate with a delay.
- K⁺ efflux repolarizes; slow K⁺ channel closure causes an undershoot toward E_K.
- Inactivated Na⁺ channels make the membrane refractory.

## Propagation

- Inward Na⁺ current in one segment spreads as local current and depolarizes the next segment,
  opening its Na⁺ channels; the AP is regenerated full-size along the axon.
- Na⁺ channels behind the wave are inactivated, so propagation is one-way.
- The prototype axon is unmyelinated; myelin / saltatory conduction is a later extension.
