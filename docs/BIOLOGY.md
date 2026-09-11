# BIOLOGY.md — physiological constraints the simulations must respect

These are treated as immutable. Each model must keep its own section true: `engine.js`
(the neuron) the sections up to *Propagation*, checked by `tests/biology.test.js`;
`muscle.js` the *Skeletal muscle* section, checked by `tests/muscle.test.js`. The ion table
applies to both.

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

## Resting membrane (neuron)

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

## Integration (neuron)

- EPSPs are a few mV and last ~10–20 ms.
- EPSPs and IPSPs sum (temporal and spatial summation) in the dendrites and soma.
- Threshold ≈ −55 mV at the axon hillock. Subthreshold summation does not fire; sufficient
  summed excitation does. Concurrent inhibition can prevent firing.

## Action potential (neuron)

- The hillock / initial segment has the highest density of voltage-gated Na⁺ and K⁺ channels,
  so the action potential starts there.
- Depolarization opens voltage-gated Na⁺ channels (positive feedback); Vm overshoots 0 mV heading
  toward E_Na.
- Na⁺ channels **inactivate** rapidly; voltage-gated K⁺ channels activate with a delay.
- K⁺ efflux repolarizes; slow K⁺ channel closure causes an undershoot toward E_K.
- Inactivated Na⁺ channels make the membrane refractory.

## Propagation (neuron)

- Inward Na⁺ current in one segment spreads as local current and depolarizes the next segment,
  opening its Na⁺ channels; the AP is regenerated full-size along the axon.
- Na⁺ channels behind the wave are inactivated, so propagation is one-way.
- The prototype axon is unmyelinated; myelin / saltatory conduction is a later extension.

## Skeletal muscle

- Skeletal muscle fibres rest at about −85 mV (textbooks give −85 to −90), closer to E_K than a
  neuron because relatively less Na⁺ leaks in (lower P_Na/P_K). Same gradients as the neuron.
  Skeletal muscle also has a large resting Cl⁻ conductance near the resting potential that
  stabilizes it; the model leaves it out.
- The action potential is produced by the same voltage-gated Na⁺ and K⁺ channels, lasts a couple
  of milliseconds, is all-or-none, and is followed by a refractory period of a few ms. It spreads
  in both directions from the end plate at a few m/s and into the T-tubules. (The model fibre is
  3 cm in 17 segments and conducts end to end in ≈ 3 ms.)
- T-tubule depolarization opens SR Ca²⁺ release channels through a direct mechanical link to the
  tubule voltage sensor. Skeletal excitation–contraction coupling does not require Ca²⁺ entry
  from outside the fibre; cardiac muscle does.
- Cytosolic free Ca²⁺ rises from ≈ 0.1 µM into the micromolar range within a few ms of the spike
  and is returned to the SR by SERCA (ATP-dependent) over tens of ms. One spike releases a
  fraction of the store.
- Ca²⁺ binds troponin; tropomyosin uncovers actin; cross-bridges cycle using ATP; heads are
  pre-cocked, so attachment and the power stroke need no new ATP, but detachment does. Without ATP
  the fibre contracts once and cannot relax (rigor).
- Force lags and outlasts the action potential (twitch ≈ 100 ms vs spike ≈ 1–2 ms), so twitches
  summate and fuse into tetanus at rates of tens of Hz while action potentials never summate.
  Voluntary movement uses unfused or partly fused tetani.
- One motor neuron action potential releases enough ACh for an end-plate potential about twice
  the threshold depolarization; the fibre fires once per nerve impulse. ACh is removed within a
  millisecond by acetylcholinesterase; without the enzyme it is still cleared by diffusion, more
  slowly.
- Because the receptor channels drive Vm toward 0 mV, the end-plate potential shrinks much less
  than proportionally as receptors are lost; twitch depression appears only past ≈ 80 % receptor
  block or loss. Reduced receptor density (myasthenia gravis) produces failure during repetitive
  activation as the end-plate potential runs down, corrected by acetylcholinesterase inhibition;
  excess inhibition produces depolarizing block (cholinergic crisis). A persistent agonist
  produces brief repetitive firing, then depolarizing block confined to the end-plate region
  through Na⁺ channel inactivation; the rest of the fibre remains directly excitable.
- Raised extracellular K⁺ depolarizes the resting membrane: moderately raised K⁺ increases
  excitability, strongly raised K⁺ inactivates Na⁺ channels and blocks firing (the K⁺ needed to
  silence the model fibre, ≈ 11–12 mM, is higher than what endangers a patient's heart). Raised
  extracellular Ca²⁺ shifts Na⁺ channel gating back toward normal and restores firing. Lowered K⁺
  hyperpolarizes and reduces excitability (a simplification; real hypokalaemic weakness is more
  complex).
- Lowered extracellular Ca²⁺ (or Mg²⁺) shifts Na⁺ channel gating toward rest and increases
  excitability by a few mV per halving; in the patient the resulting spontaneous firing (tetany)
  starts in the motor nerves. Raised Ca²⁺ or Mg²⁺ reduces excitability. Raised Mg²⁺ also reduces
  transmitter release by competing with Ca²⁺ at the terminal, and raised Ca²⁺ reverses that.
- Botulinum toxin blocks vesicle fusion; dantrolene reduces SR Ca²⁺ release; organophosphates
  inhibit acetylcholinesterase, and the inhibition becomes irreversible (aging) unless an oxime
  reactivates the enzyme first.
