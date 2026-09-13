# MUSCLE_MODULE.md — scene sequence (Prototype 0.3)

**MuscleSim: from a shock to a twitch.** The second module of the simulator: one skeletal
muscle fibre, from the resting membrane to a fused tetanus, then the neuromuscular junction
that normally delivers the command. Implemented in `muscle.js` (model), `views/muscle.js`,
`lessons/muscle.js` and `muscle.html`; the model's behaviour is asserted by `tests/muscle.test.js`.
Numbers below are the calibrated model's.

Every scene lists: the view, what the student does, the prediction(s), and the acceptance
condition, in the same format as `NEURON_MODULE.md`. Sections after the table give the questions
and misconception feedback, the on-stage explanation, the lab scenarios, the shared-scene
refactor and the engine additions. Spelling follows the repo convention: British nouns (fibre,
colour, behaviour) with -ize verbs (depolarize, repolarize), as in `BIOLOGY.md` and `app.js`.

## Constraints this module is designed around

- **Taught before the neuron module.** In this course muscle physiology comes first, so this
  module cannot assume anything from `NEURON_MODULE.md`. It introduces the resting membrane
  potential, threshold, the action potential and the refractory period *for the first time*, on
  the sarcolemma. Polarized, depolarize, repolarize, threshold, all-or-none and refractory are
  defined here. No student-facing text may use a term the sequence has not built (in particular
  "acetylcholine", "transmitter", "synapse" and "motor unit" do not appear before scene 13).
- **The motor neuron is a black box.** The fibre is triggered with a stimulating electrode first
  (as in a frog-muscle or PhysioEx lab). The nerve appears only in scene 13 as "how the body
  delivers that shock", and it does nothing but release acetylcholine (ACh) on command. How the
  neuron itself fires is the neuron module's job.
- **Audience: pre-nursing anatomy and physiology.** The causal chain matters because drugs and
  diseases break specific links in it. Every lab scenario card is one nurses meet: neuromuscular
  blockers, myasthenia gravis, potassium and calcium imbalance, magnesium, organophosphates,
  malignant hyperthermia.
- **All principles in `PEDAGOGY.md` apply unchanged.** Predict → observe → explain; nothing on
  screen is canned; Continue only after the question is right and the activity is done.

## The big ideas the module must leave behind

1. **Four gates, one chain.** ACh receptor (opened by a chemical) → voltage-gated Na⁺ channel
   (opened by voltage) → T-tubule voltage sensor + SR release channel (opened by voltage, lets
   Ca²⁺ out of the store) → troponin (switched by Ca²⁺). Each gate is a place a drug or disease
   acts. The lab is organized around breaking one gate at a time.
2. **Na⁺ in = up, K⁺ out = down.** The action potential is not a curve to memorize; it is the
   result of Na⁺ channels opening fast and inactivating, and K⁺ channels opening late.
3. **Three calciums.** Ca²⁺ that enters the *nerve terminal* (triggers ACh release), Ca²⁺ released
   from the *sarcoplasmic reticulum* (triggers contraction), and *extracellular* Ca²⁺ (which
   skeletal contraction does not need, but which steadies the Na⁺ channels). They are drawn in
   three distinct places and can be manipulated separately.
4. **The impulse is short, the twitch is long.** A millisecond or two of action potential, tens
   of milliseconds of raised Ca²⁺, about a hundred milliseconds of force. Because the impulse is
   over long before the force is, impulses cannot add up (refractory period) but twitches can
   (summation, tetanus).
5. **One impulse, one twitch.** At the neuromuscular junction one nerve impulse always fires the
   fibre, with a wide safety margin. Weakness and paralysis appear only when that margin is eroded
   (myasthenia gravis, neuromuscular blockers) or removed (botulinum toxin).

## Scene table

| # | Scene | View | Student does | Predict | Done when |
|---|-------|------|--------------|---------|-----------|
| 1 | Where are we? | zoom slides: person lifting a cup → arm → muscle → fascicle → one fibre; final slide has a trace inset (one blip) and a force gauge (one twitch) | clicks "Zoom in" | – | last slide reached |
| 2 | Parts of a muscle fibre | whole fibre, labels hidden | clicks the structure matching a **functional** description (sarcolemma, T-tubules, sarcoplasmic reticulum, myofibrils, motor end plate) | – | all five found |
| 3 | The resting membrane | membrane strip of the sarcolemma with K⁺ leak, Na⁺ leak, pump (shared scene) | reads gradients; answers; holds "open Na⁺ channels" and "open K⁺ channels" | which ion is high inside; pump vs permeability; K⁺ direction; Na⁺ direction; Vm change for Na⁺; Vm change for K⁺ | Vm rose ≥ 8 mV above rest / fell ≥ 3 mV below rest |
| 4 | Recording from inside | whole fibre with recording electrode; trace becomes persistent (shared scene) | answers | meaning of −85 mV | answered |
| 5 | Shock the fibre: threshold | sarcolemma strip with voltage-gated channels + stimulating electrodes; stimulus-strength slider (0–250 % of threshold strength) | answers what will open the new channels; raises the shock in steps; sim pauses when Vm first crosses the profile threshold (≈ −60 mV); doubles the shock | what a small shock does; what will open a voltage-gated channel; what Na⁺ entry does to the neighbouring channels (positive feedback); what a stronger shock does to the spike (all-or-none) | first spike; a stronger shock has produced the same spike (peak within 2 mV) |
| 6 | Building the action potential | sarcolemma strip + conductance traces; sim pauses at rise, peak, dip, recovery (shared scene) + muscle-only refractory step ("Shock twice, 3 ms apart" button) | triggers; answers at each pause; fires the paired shock | Vm heading (rise); K⁺ direction (peak); Vm change (fall); why the dip below rest; whether the second shock fires | membrane recovered; a shock 3 ms after a spike produced no spike (4 ms would) |
| 7 | Along the fibre and down the tubes | unrolled 3 cm fibre with per-segment channel states and V-vs-position profile; T-tubule openings drawn at each segment's own voltage | shocks the middle of the fibre; watches the wave go both ways and into the tubules | which way the wave travels; what opens the next segment; why it does not turn back; where the tubules carry it | spike event in both end segments; `sensorState` active in every segment |
| 8 | Voltage to calcium | triad: T-tubule wall with voltage sensor, SR with release channel and Ca²⁺ store, myofibril | fires; watches sensor → release channel → Ca²⁺ flood; then repeats in a Ca²⁺-free bath (Ca²⁺ replaced by Mg²⁺) | where the Ca²⁺ comes from; what happens with no Ca²⁺ outside | cytosolic Ca²⁺ peak seen; Ca²⁺-free run seen |
| 9 | Calcium to force | sarcomere: thin filament with its cover, thick filament with cross-bridges, force gauge | fires; watches Ca²⁺ bind, the cover move, bridges cycle, sarcomere shorten | what has to change before a bridge can form; what the bridge needs to let go; what shortens | force peak seen |
| 10 | Relaxation | triad + sarcomere side by side with SERCA pump and ATP meter | watches Ca²⁺ pumped back, force fall; then runs with ATP switched off | what removes Ca²⁺; what happens with no ATP (rigor) | force back to baseline; rigor run seen |
| 11 | The twitch on one time axis | three-trace plot: Vm, cytosolic Ca²⁺, force, same time axis; fibre inset | predicts the order, shocks once, reads off the three durations | order of the three events; which lasts longest | one clean twitch recorded (spike → Ca²⁺ peak → force peak → relaxed, no other shock in between) |
| 12 | Summation and tetanus | same plot + "Shock twice, 20 ms apart" button + stimulus-rate slider + force gauge | fires the pair; raises the rate until force fuses | second shock before force falls; why force adds when impulses cannot; what happens at high rate | pair: two spikes, peak > 1.3× a twitch; fused tetanus (force > 3× twitch, ripple < 10 %) |
| 13 | How the body delivers the shock | neuromuscular junction: motor terminal, cleft with AChE, folded end plate with receptors; then whole fibre | predicts, then "sends a command" with pauses at Ca²⁺ entry and at receptor opening; sees the end-plate potential alone (fibre Na⁺ channels temporarily off); then the full chain; then blocks half the receptors | which way Ca²⁺ moves at the terminal; ACh's effect on the end plate; will one command fire the fibre; what stops the signal; will half the receptors do | `epp_peak` with Na⁺ blocked; spike + twitch after a command; twitch at 50 % block with peak within 5 % of control |
| 14 | Grading force (optional; not yet built: needs the `motorUnit` view) | whole muscle with three motor units of different size; force gauge | reads the one-line motor-unit intro; recruits units; raises rate | what differs between a gentle and a strong pull | three units recruited and rate raised → Lab |

Scenes 3, 4, 6 are the shared scenes described under *Shared scene library*; scene 5 is
muscle-only because the fibre is triggered by a shock, not by a synapse.

**Speeds** (simulated ms per real second; the speed menu convention of `app.js`): scenes 3–4
0.01, scenes 5–7 0.003 (a 1.5 ms spike takes half a second), scenes 8–10 0.03, scenes 11–14 and
the Lab 0.1–0.2 so a 120 ms twitch fills about a second and a 500 ms train fits on screen. The
trace history buffer and visible window are per-scene (2 s buffer, 300–1000 ms window from
scene 11 on; see *Shared scene library*).

A natural break for a two-session course is after scene 7 ("the fibre fires") with 8–14
("the fibre contracts, and who tells it to") in the second session.

## Questions and misconception feedback, scene by scene

Wrong options carry the feedback for that specific misconception (`PEDAGOGY.md` rule 5). House
style is three options per question. Text here is the content, not final copy.

### 1. Where are we?
No question. The final slide shows one isolated fibre with a small trace and a force gauge:
one blip, then one twitch. Copy: "A muscle fibre is an electrically excitable cell. That brief
spike on the trace is the **impulse**; the bump on the gauge is the **twitch** it caused. By the
end you will know every step from the one to the other, and every place it can go wrong."

### 2. Parts of a muscle fibre
Click-by-function prompts (correct → explanation, wrong → "That is the X. It does Y. Try again."):
- **Sarcolemma**: "The impulse travels over this surface. Click it." → "The sarcolemma is the
  fibre's membrane. Like every cell membrane it is charged, and it can carry an impulse."
- **T-tubules**: "These carry the surface impulse deep into the fibre so the whole thing
  contracts at once. Click one." → "Transverse tubules are inward folds of the sarcolemma. Without
  them the inside of a thick fibre would never hear the signal."
- **Sarcoplasmic reticulum**: "This is the calcium store. Click it." → "The SR wraps every
  myofibril and holds Ca²⁺ at thousands of times the concentration in the cytosol."
- **Myofibrils**: "These do the pulling. Click one." → "Myofibrils are chains of sarcomeres, the
  contractile units. Everything else exists to switch them on and off."
- **Motor end plate**: "The nerve delivers its command here. Click it." → "The motor end plate is
  where the motor nerve meets the fibre. We will leave the nerve out until the end: first we
  learn what the fibre does when it is triggered."
Closing step, "The plan": rest → shock → impulse → spread → Ca²⁺ → force → relax, and at the end,
the nerve.

### 3. The resting membrane (shared scene, staged on the sarcolemma)
Same six questions as the neuron module's scene 3, with the copy re-staged (cell body → muscle
fibre; −70 → −85). Muscle-specific feedback on the pump question:
- Wrong: "The pump directly generates the −85 mV" → "The pump keeps the *gradients*. If it
  stopped, Vm would barely change for many seconds. In the Lab you can switch it off and watch."
Muscle-specific feedback on the K⁺-direction question: "…It stops short of −95 mV because a
little Na⁺ leaks in: less than in a nerve cell, which is why a muscle fibre rests nearer −95."
Activity thresholds are relative to rest: Na⁺ hold must lift Vm by ≥ 8 mV, K⁺ hold must lower it
by ≥ 3 mV.

### 4. Recording from inside (shared scene)
- **Q** "The trace reads −85 mV. What does that mean?"
  - ✔ "The inside of the fibre is 85 mV more negative than the outside." → "Charges line the two
    faces of the membrane; the fibre is a charged battery waiting to be used."
  - ✘ "The outside is 85 mV more negative than the inside." → "By convention the outside is the
    reference (0 mV) and the inside is measured against it: negative."
  - ✘ "The fibre is damaged." → "A steady negative reading is a *healthy* resting fibre. A damaged
    one drifts toward 0 mV."

### 5. Shock the fibre: threshold and all-or-none
The stimulating electrodes inject a brief current pulse into the sarcolemma. Voltage-gated
channels are drawn for the first time, with a small "V" above the channel as in the neuron views.
Threshold is drawn on the trace and ladder from the first pause onward (not before).
- **Q1** (before the first small shock) "A small shock pushes a little positive charge in. What
  will Vm do?"
  - ✔ "Rise a little, then fall back to −85." → "Just like opening a few Na⁺ channels by hand:
    K⁺ leak drags it back. Try it."
  - ✘ "Rise and stay up." → "Nothing is holding it up; K⁺ keeps leaking out. Watch."
  - ✘ "Fire an impulse." → "Not yet. Something has to open the new channels first, and a small
    push does not reach them. Try it and see how far it gets."
- **Q2** (before the strength ramp) "These new channels are marked V: they have a voltage sensor.
  As you turn the shock up, what will make them open?"
  - ✔ "The membrane depolarizing far enough." → "Watch for the moment it happens; the sim will
    pause there."
  - ✘ "The shock hitting them directly." → "The shock only moves charge. The channels respond to
    the *voltage* across the membrane, not to the electrode."
  - ✘ "A signal from the nerve telling them to open." → "There is no nerve in this experiment:
    only an electrode. These channels have no place for a chemical to bind; they respond only to
    the voltage across the membrane. (How the nerve does it comes at the end.)"
- **Activity**: slider for stimulus strength, steps of 20 %; the sim pauses the first time Vm
  crosses the profile threshold (about −60 mV, read from the model's threshold readout) with the
  Na⁺ channels just opening: "Paused: the first Na⁺ channels have just opened. This voltage is
  the **threshold**."
- **Q3** "Na⁺ rushes in through the open channels. What does that do to the Na⁺ channels next
  door?"
  - ✔ "Depolarizes the membrane further and opens them too." → "Positive feedback: Na⁺ in →
    more depolarization → more Na⁺ channels open. Once it starts it runs to completion."
  - ✘ "Closes them, to balance things out." → "That is what happens later with K⁺. Na⁺ entry makes
    the inside *more* positive, which is exactly what these channels respond to."
  - ✘ "Nothing; each channel acts alone." → "They share the same membrane and the same voltage.
    What one channel does to Vm, every neighbour feels."
- **Activity 2**: "Now double the shock strength." **Q4** "Will the impulse be bigger?"
  - ✔ "No, the same size." → "**All-or-none.** The shock only has to reach threshold; the Na⁺
    channels and the gradient do the rest, the same way every time."
  - ✘ "Yes, twice as big." → "Look at the trace: identical. The shock's job ends at threshold; the
    channels set the size."
  - ✘ "Yes: a stronger shock, a stronger contraction, like the frog muscle in lab." → "In a whole
    muscle a stronger shock recruits more *fibres*, so the muscle pulls harder. This is one fibre:
    once its threshold is reached, its impulse is the same size every time. Compare the two
    peaks."

### 6. Building the action potential (shared scene with a muscle-only refractory step)
Pauses at rise, peak, dip, recovery. Conductance sub-plot under the trace.
- **Rise** "Where is Vm heading?" ✔ "Toward the Na⁺ equilibrium potential, about +67 mV." ✘
  "To 0 mV and no further" → "Zero is not special; Na⁺ pulls Vm toward +67 and Vm overshoots 0."
  ✘ "Back toward −85" → "Na⁺ channels are open and Na⁺ is flooding in. Which way does that push?"
- **Peak** "The Na⁺ channels have shut themselves (inactivated) and the K⁺ channels have opened.
  Which way does K⁺ move?" ✔ "Out." ✘ "In" → "K⁺ is 140 mM inside; and the inside is now
  *positive*, pushing K⁺ out even harder." ✘ "It stops moving" → "The channels are open and both
  forces now push the same way. Watch the arrow on the ladder."
- **Fall** "What will Vm do?" ✔ "Fall back toward −85 (repolarize)." ✘ "Stay up at the peak" →
  "Nothing is holding it there: Na⁺ channels are inactivated and K⁺ is leaving." ✘ "Keep rising
  to +67" → "The Na⁺ channels have shut themselves; the pull toward +67 is gone."
- **Dip** "Why does Vm dip a little *below* rest?" ✔ "Extra K⁺ channels are still open, so Vm
  heads toward E_K (−95) before settling." ✘ "Too much Na⁺ left" → "Na⁺ hardly changed
  concentration. This is a permeability effect: the membrane is briefly even more K⁺-selective
  than at rest." ✘ "The pump is pushing it down" → "The pump is far too slow to do anything in a
  millisecond. Look at the K⁺ trace." (Instructor note: in a real fibre this dip is small and is
  followed by a slow after-depolarization from K⁺ accumulating in the tubules; the model does not
  include that and the copy says "a little".)
- **Refractory (muscle-only step)** "The button fires two shocks 3 ms apart. Will the second one
  fire an impulse?" ✔ "No: the Na⁺ channels are inactivated and cannot open again yet." → "The
  **refractory period**. It lasts a few ms. Remember it: it is why impulses cannot pile up, even
  though, as you will see, twitches can." ✘ "Yes, the same impulse" → "Try it. The channels have a
  second gate that is shut after a spike; voltage cannot open them until it resets." ✘ "Yes, a
  smaller one" → "There is no small version. Either the loop runs or it does not, and right now it
  cannot."

### 7. Along the fibre and down the tubes
- **Q1** "The shock is in the middle of a 3 cm fibre. Which way does the impulse travel?" ✔ "Both
  ways, to both ends." ✘ "Toward the tendon only" → "Nothing about the membrane knows which way
  the tendon is. Local currents spread in both directions from the active spot." ✘ "It stays
  where the shock was" → "Watch: Na⁺ entering here depolarizes the next patch, whose channels
  open, and so on."
- **Q2** "What opens the Na⁺ channels in the next segment?" ✔ "Local current from the active
  segment depolarizes it to threshold." ✘ "The shock reaches it" → "The electrode's current fades
  within a millimetre or two. The impulse regenerates itself, full size, for the remaining
  centimetres." ✘ "Na⁺ ions travel along inside the fibre to the next patch" → "The ions
  themselves barely move along; it is the voltage change that spreads, far faster than any ion."
- **Q3** "Why does the wave not turn around?" ✔ "Behind it the Na⁺ channels are inactivated
  (refractory)." ✘ "It has used up the Na⁺" → "Concentrations barely change. It is the channels'
  inactivation gate, not the supply." ✘ "The K⁺ channels behind it block the way" → "Open K⁺
  channels do pull Vm down, but what stops a second spike is that the Na⁺ channels cannot reopen
  yet. Watch the channel states behind the wave."
- **Q4** "The fibre is 50 µm thick. How does the inside hear about an impulse on the surface?" ✔
  "The T-tubules carry the surface membrane, and the impulse, deep inside." ✘ "Na⁺ diffuses to
  the middle" → "Far too slow, and the concentration change is tiny. The *membrane itself*
  folds inward as T-tubules, so every myofibril has a piece of the excited surface next to it."
  ✘ "The impulse runs through the middle of the fibre like current in a wire" → "The impulse
  lives only in the membrane; the middle has no channels. The membrane has to come to it."

### 8. Voltage to calcium
- **Q1** "The T-tubule wall has depolarized. Where does the Ca²⁺ that floods the cytosol come
  from?" ✔ "From the sarcoplasmic reticulum store." → "The voltage sensor in the tubule wall
  physically opens the release channel in the SR next to it. No Ca²⁺ needs to cross the
  sarcolemma." ✘ "From outside the fibre, through the T-tubule" → "Common mix-up. In skeletal
  muscle the voltage sensor pulls the SR channel open directly; the Ca²⁺ is already inside, in
  the store. Try the next activity." ✘ "From the mitochondria" → "Mitochondria can soak up Ca²⁺,
  but the store that releases within a couple of milliseconds is the SR."
- **Activity**: "We replace the Ca²⁺ in the fluid outside with Mg²⁺, the classic experiment (the
  Mg²⁺ keeps the Na⁺ channels behaving normally, so the only thing that has changed is where
  Ca²⁺ can come from). Shock again." **Q2** "Will it still contract?" ✔ "Yes: the SR store is
  inside." ✘ "No: no calcium, no contraction" → "Watch. The sarcolemma still fires, the sensor
  still opens the SR, the store still releases. (Cardiac muscle is different, and needs
  extracellular Ca²⁺; that is a later module.)" ✘ "Yes, but weaker: some Ca²⁺ normally comes in
  from outside" → "Compare the force peaks: identical. In skeletal muscle the twitch is fed
  entirely from the store."

### 9. Calcium to force
- **Q1** "At rest the myosin heads cannot grab actin. Ca²⁺ arrives. What has to change before a
  cross-bridge can form?" ✔ "Something covering the binding sites on actin has to move aside." →
  "Ca²⁺ binds **troponin**, which pulls **tropomyosin** off the sites. Watch the cover slide." ✘
  "Ca²⁺ has to switch the myosin heads on" → "The heads are ready all along; it is *actin* that
  is covered. Ca²⁺ works on the cover." ✘ "Ca²⁺ has to bind actin to make it sticky" → "Ca²⁺
  never touches actin. It works on the switch (troponin) that holds the cover (tropomyosin)."
- **Q2** "A cross-bridge has pulled and is still stuck to actin. What does it need to let go?" ✔
  "A fresh ATP." → "ATP binding detaches the head; splitting the ATP re-cocks it. Keep this for
  the relaxation scene." ✘ "Ca²⁺ leaving" → "Ca²⁺ leaving stops *new* attachments. A head that
  is already attached needs ATP to release." ✘ "Nothing: it lets go by itself after pulling" → "A
  head that has pulled stays bound until ATP arrives. That is why a fibre with no ATP locks."
- **Q3** "What actually gets shorter?" ✔ "The sarcomere: the filaments slide past each other." ✘
  "The filaments themselves" → "Neither filament changes length. They overlap more." ✘ "The
  whole fibre gets thinner and longer" → "The fibre gets *shorter* and fatter: every sarcomere in
  every myofibril shortens at once."

### 10. Relaxation
- **Q1** "The impulse is long over, but the fibre is still pulling. What has to happen for it to
  relax?" ✔ "Ca²⁺ must be pumped back into the SR." → "The SERCA pump uses ATP to return Ca²⁺.
  Troponin lets go, tropomyosin covers actin, cross-bridges stop forming." ✘ "The nerve (or the
  electrode) sends a 'stop' signal" → "No signal is needed to relax. The command simply stops
  coming, and the fibre relaxes on its own as Ca²⁺ is pumped away. A muscle that cannot relax
  (rigor, malignant hyperthermia) is one where Ca²⁺ stays." ✘ "Ca²⁺ leaves the fibre" → "Almost
  none leaves. It goes back into the store, ready for the next twitch."
- **Activity**: switch ATP off, shock. **Q2** "With no ATP, what happens after the twitch?" ✔ "The
  fibre stays contracted: heads cannot detach and Ca²⁺ cannot be pumped back." → "**Rigor.** Rigor
  mortis is exactly this, hours after death when ATP runs out." ✘ "It cannot contract at all" →
  "Watch: it contracts once (the heads are already cocked, so attaching and pulling needs no new
  ATP) and then locks." ✘ "It relaxes normally; ATP is only for contracting" → "ATP is needed to
  *let go* and to *pump Ca²⁺ back*. No ATP means no relaxation."

### 11. The twitch on one time axis
- **Q1** (before the shock) "You have built the chain. In what order will the three traces move?"
  ✔ "Vm → Ca²⁺ → force." → "Shock once and check." ✘ "Ca²⁺ → Vm → force" → "Ca²⁺ is released
  because the tubule depolarized (scene 8); the spike has to come first." ✘ "Vm → force → Ca²⁺" →
  "Force needs Ca²⁺ on troponin (scene 9). Nothing pulls until Ca²⁺ is there."
- **Q2** "Which lasts longest?" ✔ "Force (about a hundred milliseconds)." ✘ "The impulse" → "The
  spike is over in a millisecond or two; the force it launched lasts fifty times longer. This gap
  is the key to the next scene." ✘ "Ca²⁺" → "Ca²⁺ is back near baseline in a few tens of
  milliseconds; the bridges it launched keep cycling after it has gone."

### 12. Summation and tetanus
- **Q1** "The button fires two shocks 20 ms apart, the second while force is still rising. Will
  there be a second impulse?" ✔ "Yes: 20 ms is well past the refractory period." ✘ "No, it is
  still contracting" → "Contracting is about Ca²⁺ and cross-bridges; the *membrane* recovered long
  ago." ✘ "No: it is refractory until the twitch is over" → "The refractory period is a few
  milliseconds, the twitch a hundred. Watch the Vm trace: two full spikes."
- **Q2** "Will the second twitch add to the first?" ✔ "Yes: the second Ca²⁺ release lands on top
  of what is left of the first." → "**Summation.** The pump had not finished clearing the first
  release." ✘ "No: all-or-none" → "All-or-none is a rule about the *impulse*. Force is not
  all-or-none; it depends on how much Ca²⁺ is on the filaments right now." ✘ "No: the store was
  emptied by the first impulse" → "Each impulse releases only a fraction of the store, and SERCA
  is refilling it. Watch the SR level: it never runs dry."
- **Activity**: raise the rate slider; watch the force gauge and the Ca²⁺ trace. **Q3** "At a
  high enough rate the force becomes smooth and maximal. Why?" ✔ "Ca²⁺ never gets pumped back
  between impulses, so troponin stays saturated." → "**Tetanus** (fused). Every ordinary movement
  you make is built from unfused or partly fused tetani, not single twitches; a fully fused
  tetanus like this one is the ceiling." ✘ "The impulses have summed into one big impulse" →
  "Look at the Vm trace: the spikes are still separate and the same size. It is the Ca²⁺ and the
  force that fuse." ✘ "The fibre has gone into rigor" → "Stop the shocks and it relaxes: ATP is
  fine. Rigor is force with *no* impulses; this is force from too many."

### 13. How the body delivers the shock (the neuromuscular junction)
Reuses the synapse view and causal checklist with muscle labels (see *Shared scene library*).
The motor neuron is drawn as a terminal only, with a "Send command" button. Predictions are asked
before the step that reveals them, and the sim pauses at terminal Ca²⁺ entry and at receptor
opening (house style from the neuron module's scene 5).
- **Q1** (before the first send) "When the command arrives, Ca²⁺ channels in the *terminal* open.
  Which way will Ca²⁺ move?" ✔ "Into the terminal." → "This is a different Ca²⁺ from the SR
  store: it is outside the nerve, and it triggers the release of packets of **acetylcholine
  (ACh)** into the gap." ✘ "Out of the terminal" → "Ca²⁺ is 2 mM outside and almost absent
  inside. Down the gradient means in." ✘ "It does not move; the terminal is not part of the
  fibre" → "It is not, but it has its own channels and its own gradient. Watch."
- **Q2** (at the pause, ACh bound, receptors about to open) "The receptors are channels that let
  Na⁺ in and some K⁺ out. What will the end plate's Vm do?" ✔ "Depolarize." → "Net positive
  charge in = up. This depolarization is the **end-plate potential**." ✘ "Hyperpolarize: K⁺ is
  leaving" → "More Na⁺ comes in than K⁺ goes out; the channel's balance point is near 0 mV, far
  above −85." ✘ "No change: Na⁺ in and K⁺ out cancel" → "At −85 mV the pull on Na⁺ is far
  stronger than on K⁺. Watch the ladder."
- **Step: the end-plate potential by itself.** "To see what the receptors do on their own we
  have temporarily switched off the fibre's Na⁺ channels. Send a command." The ladder shows the
  end-plate potential peaking well above the threshold line (about −30 mV). Status: "The
  receptors alone pushed Vm about twice as far as threshold needs."
- **Q3** (Na⁺ channels back on; before sending) "Will one command fire the fibre?" ✔ "Yes, every
  time." → "The end-plate potential is about twice what threshold needs. The junction is built
  with a wide safety margin." ✘ "Only if several commands add up" → "That is how *nerve cells*
  decide (next module). The muscle fibre is built to obey a single command: watch." ✘ "Only if
  the command is strong enough" → "Commands are all-or-none impulses too; every one releases
  the same big dose of ACh."
- **Q4** "What stops the signal, so the fibre can be commanded again a few ms later?" ✔
  "An enzyme in the gap (acetylcholinesterase) breaks ACh down." ✘ "The receptors get tired" →
  "They close within a millisecond of ACh leaving. Something has to remove the ACh: an enzyme
  does." ✘ "ACh diffuses back into the terminal" → "Some of the pieces are taken back up, but the
  fast removal is destruction in the gap."
- **Activity**: block half the receptors. **Q5** "Will the fibre still twitch?" ✔ "Yes, a
  full-size twitch." → "Half the receptors are gone, but the end-plate potential shrinks by much
  less than half: the open receptors were already pulling Vm most of the way toward 0 mV, so
  losing some of them costs little. That is why it takes losing about four fifths before the
  impulse fails. This margin is why myasthenia gravis and neuromuscular blockers show nothing at
  first and then weakness. Explore this in the Lab." ✘ "No: half the signal is gone" → "Half the
  receptors, but not half the end-plate potential (watch the ladder), and the impulse only needs
  threshold." ✘ "Yes, but a half-size twitch" → "The end-plate potential is smaller, but the
  impulse is all-or-none and the Ca²⁺ release and force follow the impulse, not the end-plate
  potential. Compare the two force peaks: identical."

### 14. Grading force (optional)
Intro step (one sentence): "One motor nerve cell branches to many fibres, and they always fire
together: a **motor unit**. This muscle has three, of different sizes."
- **Q** "A gentle pull and a strong pull from the same muscle. What is different?" ✔ "More units
  are switched on, and each fires faster." → "Two dials: how many units, how fast each fires. Try
  both." ✘ "Each fibre contracts harder" → "A fibre's impulse is all-or-none. Its force rises only
  with rate (scene 12); the rest comes from adding units." ✘ "The impulses get bigger" → "Look at
  the Vm trace as you raise force: same spike every time."
- **Activity**: recruit units and raise rate; force gauge reads the sum. Status line after the
  student recruits: "Small units are recruited first, large ones last (the size principle), so
  fine control comes before brute force."

## On-stage explanation (the sim explains itself)

Everything in `NEURON_MODULE.md` under this heading carries over (narrator bar, voltage ladder,
causal checklist, conductance sub-plot), driven by the cell profile so the ladder and narrator use
the muscle's rest and threshold lines. Muscle adds:

- **Three-trace twitch plot** (scenes 11–12, Lab): Vm, cytosolic Ca²⁺ and force on one shared
  time axis, colour-coded (Vm ink, Ca²⁺ blue `#2d8fd5`, force a new red-brown). The narrator
  reads it: "impulse over; Ca²⁺ still high; force rising".
- **Excitation–contraction checklist** (scenes 8–10): impulse in the T-tubule → voltage sensor
  moves → SR release channel opens → Ca²⁺ floods cytosol → Ca²⁺ binds troponin → tropomyosin
  moves → cross-bridges cycle (ATP) → force → SERCA pumps Ca²⁺ back → troponin releases → force
  falls. Each row lights while the model is in that state.
- **Junction checklist** (scene 13, Lab): command arrives → Ca²⁺ channels open → Ca²⁺ in →
  vesicles fuse → ACh crosses the gap → receptors open → Na⁺ in → end-plate potential → Na⁺
  channels open → impulse → AChE removes ACh.
- **Force gauge** on every view from scene 9 on: a bar reading the model's force, next to a
  sarcomere glyph whose overlap follows the model.
- **Ca²⁺ pools drawn distinctly**: terminal Ca²⁺ (scene 13), SR store level (a fill level that
  visibly drops on release and refills during relaxation), cytosolic Ca²⁺ (dots that appear at
  the release channel and vanish at SERCA), and extracellular Ca²⁺ (background jitter). Same
  blue everywhere, different places; the narrator names the pool.
- **Threshold readout** (scene 5 on, Lab): the shock strength that just fires the fibre, measured
  by the model, so the student can watch threshold move with K⁺ and Ca²⁺.
- **Stimulus marks** on the trace: a tick at every shock or command so the student can see which
  ones fired and which did not (threshold, refractory, block scenarios).
- The neuron module's rule stands: threshold is not drawn until scene 5 introduces it, and scene 3
  runs with voltage-gated Na⁺ channels absent so opening a channel by hand cannot fire the fibre.

## Feedback rules

As `NEURON_MODULE.md`: wrong option → its own targeted feedback, options stay enabled; right
option → explanation, options lock, Continue enabled once the activity is also done. The activity
status line shows live Vm, and from scene 9 on also force and cytosolic Ca²⁺.

## Free-play lab and clinical scenarios

Same model, all controls: shock (single, pair at a set interval, train at a set rate, strength,
site: end plate or far end of the fibre), send nerve command (single, train), receptor block
fraction, receptor density, AChE activity, persistent agonist on/off, terminal Ca²⁺ channel
block, SR release channel leak, dantrolene, ATP on/off, extracellular K⁺, Na⁺, Ca²⁺ and Mg²⁺,
Na⁺ channel block (TTX), pump on/off, hold-to-open Na⁺/K⁺ channels, recording site, and any of
the views plus the three-trace plot and the threshold readout.

Each **scenario** is a card: a one-line patient or lab situation, a prediction question, a
"Run" button that sets the controls, and an explanation. Some cards have a second or third
step. The student predicts before running. Scenarios are grouped by the gate they break.

| Gate | Scenario | What the controls do | What the student sees | Predict prompt |
|---|---|---|---|---|
| Release | **Botulinum toxin** (wound botulism, or a therapeutic Botox dose) | release blocked (the fusion machinery is cut) | command arrives, Ca²⁺ enters, no vesicles fuse, no twitch; direct shock still works | "The nerve is fine and the muscle is fine. Will a command work? Will a shock?" |
| Release | **Magnesium sulfate** (pre-eclampsia infusion; reflexes, breathing rate and urine output checked every hour) | Mg²⁺ 1 → 5 mM (terminal Ca²⁺ entry partly blocked: Mg²⁺ competes with Ca²⁺ for the channel); then **calcium gluconate** (extracellular Ca²⁺ 2 → 3 mM) | smaller release, smaller end-plate potential; at 5 mM commands fail; direct shock works; raising Ca²⁺ out-competes the Mg²⁺ and commands twitch again | "Why does the nurse check the patellar reflex?" then "The reflex is gone and breathing is slow. The nurse gives calcium gluconate. Will the commands come back?" |
| Receptor | **Rocuronium / vecuronium** (non-depolarizing blocker in the OR) | receptor block fraction rises 0 → 95 % | twitches unchanged until ~80 % block, then fail at 85 %; at 85 % **neostigmine** (AChE activity down) or **sugammadex** (block removed) restores them; at 95 % neostigmine does not, sugammadex does | "At what fraction of blocked receptors does the twitch fail?" then "Push the block to 95 %. Will more ACh beat a nearly complete block?" |
| Receptor | **Myasthenia gravis** | receptor density 100 % → 20 % (the first end-plate potential just clears threshold); command train at 3 Hz; then **pyridostigmine** (AChE 0.3); then too much pyridostigmine (AChE 0.05) with a 20 Hz train | the first command fires, later ones fail as the end-plate potential runs down (fatigable weakness); pyridostigmine restores the whole train; overdose: a long end-plate potential, an impulse or two, then depolarizing block and failure again | "Why does the patient's eyelid droop *later in the day*?" then, on the overdose step, "Stronger or weaker?" |
| Receptor | **Succinylcholine** (depolarizing blocker, rapid-sequence intubation) | persistent agonist on (not cleared by AChE) | end plate depolarizes and stays; a burst of spikes (fasciculations), then the Na⁺ channels near the end plate inactivate and commands fail; a shock at the end plate fails, a shock at the far end of the fibre still fires (the block is at the junction, not the whole membrane); K⁺ leaks out | "Why does the patient twitch *before* going limp?" |
| Cleft | **Organophosphate poisoning** (insecticide, nerve agent) | AChE activity → 0; a 20 Hz command train (the nerve driving a sustained contraction) | the first command produces an end-plate potential four times longer than normal and an impulse; ACh then piles up in the cleft, the end plate stays depolarized and later commands fail (depolarizing block); **pralidoxime** reactivates AChE only if given before the enzyme has "aged" (hours for most insecticides, minutes for some nerve agents) | "Too much ACh: stronger or weaker?" |
| Membrane | **Hyperkalaemia** (renal failure) | extracellular K⁺ 4 → 7 → 11 → 12 mM; then **IV calcium** (Ca²⁺ 2 → 3 mM) at 11 mM | at 7 mM rest drifts toward −74 and the fibre is *easier* to fire; at 11 mM enough Na⁺ channels are inactivated that nerve commands fail (weakness) though a strong shock still fires; at 12 mM nothing fires; raising Ca²⁺ at 11 mM shifts the Na⁺ channels back and commands work again | "The membrane is *closer* to threshold. Stronger or weaker?" then "The K⁺ has not changed. Will calcium make the fibre answer its nerve again?" |
| Membrane | **Hypokalaemia** (diuretics, vomiting, K⁺ 2.5 mM) | extracellular K⁺ 4 → 2.5 mM | rest hyperpolarizes by about 10 mV (E_K itself moves from −95 to about −107 mV); a nerve command still fires (the safety margin covers it) but a shock must be stronger | "Which way does Vm move, and is threshold nearer or farther?" |
| Membrane | **Hypocalcaemia** (post-thyroidectomy tetany, Chvostek's and Trousseau's signs, stridor) | extracellular Ca²⁺ 2 → 1 mM (the model's 2 mM is the textbook value; a patient's ionized Ca²⁺ is normally ≈ 1.2 mmol/L and tetany appears below ≈ 0.8) | shock threshold drops by about 10 % (threshold readout); the motor nerve, which rests closer to threshold, starts sending commands on its own (several a second), so the fibre twitches with nobody asking | "Less calcium: more contraction or less? Why?" |
| Membrane | **Hypercalcaemia** | extracellular Ca²⁺ 2 → 3.5 mM | threshold strength rises; the nerve is quiet; sluggish, weak response | "Now the opposite." |
| Store | **Malignant hyperthermia** (volatile anaesthetic or succinylcholine in a susceptible patient) | SR release channel leak on | Ca²⁺ leaks continuously; sustained force with no impulses; ATP meter falls, heat rises; **dantrolene** closes the leak | "Minutes after induction: rigid jaw, then rigid body, rising heart rate and exhaled CO₂, no nerve activity. Which gate?" |
| Filaments | **Rigor mortis** (and ischaemic contracture) | ATP off | one contraction that never relaxes (force locks at tetanic level); Ca²⁺ stays high | "Is a rigid muscle *receiving* impulses?" |
| Whole chain | **Cramp** | command train at 30–50 Hz with nothing else changed | an unfused tetanus the patient did not ask for; stops when the commands stop | "Rigid and painful. Is *this* muscle receiving impulses?" |
| Contrast | **Which Ca²⁺?** | Ca²⁺-free bath (Ca²⁺ replaced by Mg²⁺); then command vs shock | commands fail (no release), shocks still twitch (SR store intact) | "No calcium in the bath. Does a *command* work? Does a *shock*?" |

Explanation copy the cards must carry (in addition to the mechanism):

- **Magnesium sulfate**: "Ca²⁺ and Mg²⁺ compete for the same terminal channel; more Ca²⁺ wins
  the competition back, which is why calcium gluconate is the antidote. Loss of the patellar
  reflex is the first warning; breathing muscles fail next."
- **Rocuronium / vecuronium**: "Only the receptor gate is blocked. The nerve still fires and ACh
  is still released; the patient hears and feels everything, and the diaphragm is as paralysed as
  the thumb: a blocked patient must be ventilated and sedated. Neostigmine works by piling up ACh
  to compete for the receptors that are left; with almost none left it has nothing to work with,
  which is why sugammadex, which removes the drug itself, exists."
- **Myasthenia gravis**: "Antibodies have destroyed most of the receptors, so the safety margin is
  gone: the first command just makes it, and as the terminal's ACh output runs down over a train
  the later ones fail. Pyridostigmine lets ACh linger and restores the margin. Too much of it and
  the end plate stays depolarized: **cholinergic crisis** looks the same at the bedside as
  **myasthenic crisis** (weakness, trouble breathing); the difference is which way the ACh gate is
  broken."
- **Succinylcholine**: "It is an ACh look-alike that the cleft enzyme cannot destroy, so the end
  plate is held depolarized: a burst of impulses (fasciculations), then the nearby Na⁺ channels
  inactivate and nothing more can fire. It is cleared by an enzyme in the plasma, so it wears off
  in minutes; people who lack that enzyme stay paralysed for hours. The K⁺ it lets out of the
  fibres is dangerous in burns, crush injury and prolonged immobility, and in a susceptible patient
  it can trigger malignant hyperthermia (a rigid jaw after the dose is the warning)."
- **Organophosphate**: "This card shows the skeletal-muscle half: twitching, then paralysis of the
  breathing muscles. The wet symptoms (drooling, wheeze, slow heart) are ACh acting on glands and
  the heart and are treated with atropine; pralidoxime is given early because the enzyme cannot
  be rescued once it has aged."
- **Hyperkalaemia**: "Heart muscle cells rest on the same K⁺ gradient and depolarize the same
  way, which is why K⁺ this high is a cardiac emergency (peaked T waves, then arrest) long before
  the skeletal muscles fail. Calcium is the first drug given because it moves threshold away from
  the depolarized rest; then the K⁺ itself is driven into cells or removed. (The model exaggerates
  the K⁺ needed to silence a skeletal fibre; a patient is in danger well below it.)"
- **Hypokalaemia**: "The patient is weak, may cramp, and is prone to arrhythmias. The direction
  shown here (harder to excite) is the textbook one; much of the real weakness comes from a
  mechanism this model leaves out, in which the resting K⁺ channels shut and the fibre
  paradoxically depolarizes."
- **Hypocalcaemia**: "You are watching the fibre fire by itself, and an isolated fibre in a very
  low-calcium bath really does. In the patient the first thing to fire is the motor nerve: its
  membrane has the same Na⁺ channels and its threshold moves the same way, and the fibre then
  obeys every impulse it is sent. Chvostek's sign is a tap on the facial nerve; Trousseau's is
  squeezing the arm's nerves with a cuff. After thyroid surgery the same thing in the muscles of
  the larynx causes stridor: calcium gluconate is kept at the bedside. The paradox to remember:
  contraction needs Ca²⁺ from the *store*, but low Ca²⁺ in the *blood* causes *more* firing."
- **Malignant hyperthermia**: "The susceptibility is inherited, usually a variant of this very SR
  release channel (the ryanodine receptor, RYR1) that lets the anaesthetic hold it open. The first
  signs are rising exhaled CO₂ and heart rate and rigid muscles (jaw first if succinylcholine was
  given); the temperature rise comes late. Dantrolene closes the channel."
- **Rigor mortis / Cramp** (paired): "Rigor has no impulses at all; the heads simply cannot let
  go. An everyday cramp is the opposite: the nerve is firing the fibre at high rate, a tetanus you
  did not ask for, which is why stretching and rest end it."

Nursing-relevant numbers surfaced in the explanations: twitch depression begins at about 75 %
receptor occupancy, so a patient can look normal with most receptors blocked; magnesium toxicity
is watched by reflexes, respiration and urine output and reversed with calcium gluconate;
hypocalcaemia is tested with Chvostek's and Trousseau's signs; malignant hyperthermia is treated
with dantrolene; cholinergic and myasthenic crisis are told apart by history and the response to
a small anticholinesterase dose, not by how the patient looks.

Deliberately out of scope: cardiac and smooth muscle (a later cardiac module will connect the
K⁺ story to the ECG), fibre types and fatigue metabolism, muscarinic effects of organophosphates,
local anaesthetics, Lambert–Eaton syndrome (needs facilitation modelling; possible later addition
as the mirror image of myasthenia). Tetanus the disease acts on inhibitory neurons in the spinal
cord, so the muscle chain is intact; it is noted as a planned lab scenario in `NEURON_MODULE.md`.

## Shared scene library

The neuron lesson's scenes 3 (resting membrane), 4 (recording electrode) and 8 (building the
action potential) are re-staged in this module with the same questions, feedback and activities.
Rather than copy them:

- Move the scene builders out of `app.js` into `scenes/shared.js` as functions of a **cell
  profile** and a **kit**: `restingMembrane(profile, kit)`, `recordingElectrode(profile, kit)`,
  `actionPotential(profile, kit)`.
  - The **profile** supplies: the compartment name to record and manipulate, the resting
    potential, the threshold, the E-lines to draw, the words for the cell and its region ("cell
    body" / "muscle fibre"), the view name for the whole cell and for the inset, which manual
    channels exist, the activity thresholds (expressed relative to rest), the causal-checklist row
    labels, extra copy fragments (the muscle K⁺-direction sentence), and any extra steps to append
    (the muscle refractory step in scene 6) or omit.
  - The **kit** is what the scene closures in `app.js` currently reach for as module-private
    helpers: `sim`, `app`, `runner`, `setPaused`, `since`, `fmtV`, `I`, `FB_GRADIENT`, plus a
    `trigger()` that the *model* implements (`Neuron.stimPulse` / `MuscleFibre.shock`) so the
    scene never calls `setStim('soma')` itself. The `frame()` stimulus-end logic moves into the
    model too.
- Copy strings that differ are held in the profile, not branched with `if` inside the scene.
- `app.js` stops self-starting. It exposes `init({ model, lesson, profile, lab })`; each page's
  lesson file (`lessons/neuron.js`, `lessons/muscle.js`) assembles `LESSON` from shared and
  module-specific scenes and calls `init` after all classic scripts have loaded. All new browser
  files are classic scripts with the engine's UMD wrapper (no ES modules: the pages must open from
  `file://`), and `muscle.js` `require`s `./engine.js` under Node so `tests/muscle.test.js` runs
  against the same code as the page.
- The renderer becomes profile-driven where it now hard-codes the neuron: `V_STOPS`/`vColor` and
  `insideFill` take colour stops relative to `profile.rest` (so a −85 mV fibre renders slate at
  rest, per `VISUAL_STYLE.md`); `drawTrace` and `drawLadder` read rest, threshold and E-lines from
  the profile; the membrane narrator's numeric branches become `rest ± offsets`; the vm badge
  default comes from the profile; `app.showThreshold = si >= 5` becomes a per-scene
  `showThreshold` flag; `recordSample`/`drawTrace`/inset drawing take from the profile which
  compartment to record, which view draws the inset, which compartment feeds the conductance
  sub-plot, and which extra traces (Ca²⁺, force) to keep; history buffer length and visible window
  are per scene (2 s / 300–1000 ms for scenes 11–14 and the Lab). The membrane view keys manual
  channels on `profile.comp` rather than `kind === 'soma'`.
- **Model interface** the shared scenes and views rely on (both `Neuron` and `MuscleFibre`
  provide it): `comps[]` with `{name, kind, V, m, h, n, gNa, gK, gL, gNaMax, iNa, iK, iL, dVdt}`,
  `byName`, `manual {gNa, gK, gCl}` on the profile compartment, `naBlock`, `kBlock`, `pumpOn`,
  `pumpRundownRate`, `conc`, `E`, `t`, `advance`, `reset`, `setStim`, `trigger`, `takeEvents`,
  `naState`/`kState`/`caState`.
- The views gain `zoomMuscle`, `fibre`, `triad`, `sarcomere`, `twitchPlot`, `nmj`, `motorUnit`.
- Each module is its own page: `index.html` (neuron) and `muscle.html` (muscle). Both load
  `engine.js`, `app.js` and `scenes/shared.js`; `muscle.html` additionally loads `muscle.js`.
  `build.js` takes a page list, inlines every `<script src>` tag (including nested paths) and
  writes `dist/<page>`; both bundles are committed, as `dist/index.html` is today. The Pages
  workflow already runs `npm test` and uploads `dist/`, so it needs no change. Opening either page
  directly still needs no build step.
- When the muscle module ships, the neuron module's opening copy changes to "you fired a muscle
  fibre; now watch what a neuron adds", and its shared scenes can be offered as a review that the
  student may skip.

**Docs to update when this ships**: `PRODUCT.md` (architecture diagram → `lessons/*.js` +
`scenes/shared.js`; audience line to include pre-nursing A&P), `NEURON_MODULE.md` line
"Implemented in `app.js` (`LESSON`)", `README.md` (scene counts, file list including
`MUSCLE_MODULE.md` and `muscle.html`, build output), the `build.js` header comment, and
`BIOLOGY.md` as described under *Physiological assumptions*.

## Engine additions (`muscle.js`)

`muscle.js` exports `MuscleFibre`, reusing `hhRates`, `nernst`, `expEuler`, `Terminal` and
`Receptor` from `engine.js`. Engine changes this needs: export `expEuler`; factor the pump-off
rundown out of `Neuron._step` into an exported `pumpRundown(conc, k)` used by both models; give
`hhRates(V, opts)` optional `hShift` (shifts the inactivation curve only) and `phi` (divides all
three time constants), both defaulting to the current behaviour so the neuron tests stay green.
Units as in `engine.js`; force in arbitrary units normalized so a fused tetanus is ≈ 1 and a
single twitch ≈ 0.25.

**Compartments.** A 3 cm fibre in 15–21 segments of 1.5–2 mm with the end-plate segment in the
middle (the fibre length constant is a few mm, so a shock's passive spread covers only two or
three segments and the wave must regenerate to reach the ends). Axial conductance is chosen for a
teaching-scale end-to-end conduction time of ≈ 4–8 ms (real fibres conduct at a few m/s; the
slowing is deliberate, as in the neuron module's axon, and is noted in `BIOLOGY.md`). Each segment
carries voltage-gated Na⁺ and K⁺ with the neuron's HH kinetics run with `phi ≈ 2` (a spike ≈ 1.5
ms wide, absolute refractory period ≈ 4–5 ms; `phi` is a temperature correction, since the squid
rates are for 6 °C) and `hShift ≈ −20 mV` (mammalian muscle Na⁺ channels inactivate at more
negative voltages than squid; this is what lets high K⁺ silence the fibre), leak as below, and
its own excitation–contraction unit. The end-plate segment also carries the nicotinic receptor.
The model's threshold from a −85 mV rest comes out near −60 mV (≈ 25 mV of depolarization) and
is read from the model, not asserted; the spike peak sits nearer E_Na than a real fibre's +30 mV,
as in the neuron module.

**Leak and resting potential.** The sarcolemma leak is two Nernst-referenced conductances,
`gK_leak · (V − E_K) + gNa_leak · (V − E_Na)`, with `gNa_leak / gK_leak ≈ 0.07` so that rest is
−85 mV at K⁺ 4 mM. `MuscleFibre` does **not** reuse `Neuron.calibrateLeak` (a single fixed
reversal calibrated at −70 mV), because with a fixed reversal extracellular K⁺ would not move the
resting potential at all at −85 mV, and every K⁺ scenario would be inert. With the split leak rest
follows E_K automatically (≈ −97 at 2.5 mM, ≈ −75 at 7 mM, ≈ −68 at 9 mM) and the pump-off rundown
acts through E_K. Skeletal fibres also have a large resting Cl⁻ conductance sitting near rest
that stabilizes the membrane; it is left out of the model, and if the manual Cl⁻ channel is ever
exposed in the muscle Lab the profile sets the Cl⁻ gradient so E_Cl ≈ −85 mV.

**Ion gradients.** `DEFAULT_CONC` from `engine.js` (E_K ≈ −95, E_Na ≈ +67, E_Ca ≈ +132).
Extracellular K⁺, Na⁺, Ca²⁺ and Mg²⁺ are lab controls. Nernst inputs are clamped to a small
minimum (1e-4 mM) for display so a Ca²⁺-free bath never produces −Infinity on the ladder.

**Excitation–contraction unit (per segment).**
- `d`: T-tubule voltage-sensor activation, sigmoid in the segment's V (half-activation ≈ −20 mV),
  τ ≈ 1 ms. The tubule is drawn at the segment's own voltage with a short lag; `sensorState`
  (from `d`) is the model state the scene-7 "Done when" keys on.
- `ryr`: SR release channel open fraction, follows `d` (plus `ryrLeak` for malignant
  hyperthermia, cleared by `dantrolene`).
- `caSR`: store content (starts at 1, in store units); release flux `kRel · ryr · caSR`, converted
  to cytosolic µM by a stated factor σ (µM per store unit); one spike releases a fraction of the
  store, which refills as SERCA returns Ca²⁺.
- `ca`: cytosolic free Ca²⁺ (µM), rest 0.1; rises within a few ms of the spike and is returned to
  the SR by SERCA, `vSerca · ca² / (ca² + kSerca²) · atp`. SERCA is the only removal path (no
  separate buffer term), so that with ATP off Ca²⁺ genuinely stays up. Real free-Ca²⁺ transients
  peak at ≈ 10–20 µM with a half-width of ≈ 5–10 ms and are back near baseline within 20–30 ms;
  the model keeps that separation of time scales (ms spike, tens of ms Ca²⁺, ~100 ms force).
- `tn`: troponin occupancy, `kon · ca · (1 − tn) − koff · tn`. Choose the Ca²⁺ peak, `kon/koff`
  (half-saturation ≈ 1.5–2 µM, or a Hill exponent) and the cross-bridge time constants together
  so that a single twitch does not saturate the filaments and a fused tetanus is ≈ 4× a twitch.
- `xb`: attached cross-bridge fraction, with attachment and detachment as separate terms:
  `d(xb)/dt = kon_xb · tn² · cocked · (1 − xb) − koff_xb · atp · xb`. `cocked` is the pool of
  pre-cocked heads (starts at 1, consumed by attachment, refilled only when `atp > 0`).
  Attaching and pulling use energy already stored on the cocked heads; only detachment needs ATP.
  With `atp = 0` the heads attach once from the pre-loaded pool, cannot detach, and force locks
  (rigor); with `atp = 1` a single twitch peaks at ≈ 40 ms and returns to baseline at ≈ 100–120
  ms. Note the steady state under sustained Ca²⁺ is set by `kon_xb/koff_xb`, not by `tn²` alone,
  so the twitch-amplitude target is tuned with that in mind.
- `force` = mean `xb` over segments; "baseline" in tests means < 0.02 (resting troponin
  occupancy gives a small non-zero floor).
- `atp`: 1 normally; the Lab's "ATP off" sets it to 0 (with an accelerated decline option for the
  MH scenario, where heat is a derived readout).

**Extracellular Ca²⁺ and Mg²⁺ on excitability.** Divalent cations screen membrane surface charge,
so all Na⁺ channel gating (activation *and* inactivation) is shifted by
`ΔV = k · ln((Ca_out + α · Mg_out + c0) / (2 + c0))`, with `k` ≈ 9 mV per e-fold, `c0 ≈ 0.3 mM`
so the shift is bounded as `Ca_out → 0`, `α ≈ 1` so a Ca²⁺-free, Mg²⁺-substituted bath gives
ΔV ≈ 0 (this is how scene 8 and the "Which Ca²⁺?" card keep excitability constant), and the shift
clamped to ±15 mV. Halving Ca²⁺ therefore lowers threshold by ≈ 6 mV (the threshold readout
shows it) but does not by itself make the fibre fire spontaneously; the hypocalcaemia card's
spontaneous activity comes from the **black-box nerve**, which emits random commands at a rate
that rises as `Ca_out` falls below ≈ 1.2 mM (a motor axon rests closer to threshold than a
fibre). Raising Ca²⁺ shifts inactivation back to more depolarized voltages, which is what lets
IV calcium restore firing in the hyperkalaemic fibre.

**Terminal Ca²⁺ entry.** The muscle `Terminal` does not use the fixed `eCa = 130` of
`engine.js`; its Ca²⁺ current per command scales with a competitive (Dodge–Rahamimoff) factor
`(Ca_out / K1) / (1 + Ca_out / K1 + Mg_out / K2)`: it goes to 0 in a Ca²⁺-free bath, falls as
Mg²⁺ rises, and recovers when Ca²⁺ is raised, so calcium gluconate relieves a magnesium block.
`K1`, `K2` are tuned so Mg²⁺ 5 mM at normal Ca²⁺ fails the command and Mg²⁺ 5 mM + Ca²⁺ 3 mM
twitches despite the raised threshold from the surface-charge shift.

**Stimulator.** `shock(strength, durationMs = 0.5, segment = 'endplate')` injects a current
pulse (`segment = 'end'` for the far end of the fibre); `pair(intervalMs)` fires two shocks;
`train(rateHz, n)` schedules repeated shocks. `thresholdStrength()` is a model readout (a short
bracketing search on a copy of the state) so the Lab can show threshold move with K⁺ and Ca²⁺.
Strength is expressed as a fraction of the normal threshold strength, so the scene-5 slider's
"double the shock" is always possible.

**Neuromuscular junction.** A `Terminal` driven by `templateAP` on `command()`, with a slower
vesicle refill (`tauRefill` ≈ 500 ms) so a 3 Hz train shows ≈ 30 % end-plate-potential rundown;
the myasthenia card's receptor density is read from the model (the density at which the first
end-plate potential is ≈ 1.1× the threshold depolarization) rather than hard-coded. Transmitter
leaves the cleft by two paths, `d(nt)/dt = release − nt · (acheActivity / τAChE + 1 / τdiff)` with
`τAChE ≈ 0.8 ms` and `τdiff ≈ 6–8 ms`, so `acheActivity = 0` lengthens the end-plate potential
5–8× (repetitive spikes, then depolarizing block on a train) rather than forever. A `Receptor`
with `E ≈ 0 mV` (Na⁺ in, K⁺ out; the narrator says "mostly Na⁺ in"). Its `gmax` is sized against
the *whole fibre's* resting conductance (the segments are strongly coupled): about 2.5× it, so
that with Na⁺ channels blocked the end-plate potential peaks near −30 mV, roughly twice the
model's measured threshold depolarization, and single twitches fail only past ≈ 75 % block.
Because the receptor conductance drives Vm toward 0 mV, blocking half the receptors reduces the
end-plate potential by much less than half; this saturation is the mechanism behind the 75 %
figure and is what scene 13's Q5 feedback explains. Parameters: `block` (rocuronium; `sugammadex`
clears it), `density` (myasthenia), `acheActivity` (1 normal; neostigmine/pyridostigmine 0.3;
overdose 0.05; organophosphate 0; `pralidoxime` restores the fast path), `agonist`
(succinylcholine: a cleft agonist not removed by AChE; receptor desensitization optional),
`releaseBlock` (botulinum), `spontaneousRate` (the black-box nerve's own firing, driven by
`Ca_out`).

**Events** for the renderer and lesson: `shock`, `command`, `spike` (per segment), `release`,
`epp_peak`, `ca_release`, `twitch_peak`, `relaxed`, `tetanus_fused`, `spontaneous_command`.

**Renderer helpers**: `naState`, `kState` as in the neuron; `sensorState`, `ryrState`,
`troponinState`, `bridgeState` thresholds for drawing; `srLevel` for the store fill;
`thresholdStrength()` for the readout.

## Physiological assumptions

`BIOLOGY.md` currently states the neuron's rest (−70 mV) and threshold as immutable without
scoping them. When this module ships, re-head the existing sections as neuron-specific (or add
"Sections up to *Propagation* describe the neuron; skeletal muscle follows") and make the opening
sentence say each model must keep its own section true. Then add a **Skeletal muscle** section:

- Skeletal muscle fibres rest at about −85 mV (textbooks give −85 to −90), closer to E_K than a
  neuron because relatively less Na⁺ leaks in (lower P_Na/P_K). Same gradients as the neuron.
  Skeletal muscle also has a large resting Cl⁻ conductance near the resting potential that
  stabilizes it; the model leaves it out.
- The action potential is produced by the same voltage-gated Na⁺ and K⁺ channels, lasts a couple
  of milliseconds, is all-or-none, and is followed by a refractory period of a few ms. It spreads
  in both directions from the end plate at a few m/s (slowed in the model for teaching, as the
  neuron's axon is) and into the T-tubules.
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
  than proportionally as receptors are lost; twitch depression appears only past ≈ 75 % receptor
  block or loss. Reduced receptor density (myasthenia gravis) produces failure during repetitive
  activation as the end-plate potential runs down, corrected by acetylcholinesterase inhibition;
  excess inhibition produces depolarizing block (cholinergic crisis). A persistent agonist
  produces brief repetitive firing, then depolarizing block confined to the end-plate region
  through Na⁺ channel inactivation; the rest of the fibre remains directly excitable.
- Raised extracellular K⁺ depolarizes the resting membrane: moderately raised K⁺ increases
  excitability, strongly raised K⁺ inactivates Na⁺ channels and blocks firing (the K⁺ needed to
  silence the model fibre is higher than what endangers a patient's heart). Raised extracellular
  Ca²⁺ shifts Na⁺ channel gating back toward normal and restores firing. Lowered K⁺
  hyperpolarizes and reduces excitability (a simplification; real hypokalaemic weakness is more
  complex).
- Lowered extracellular Ca²⁺ (or Mg²⁺) shifts Na⁺ channel gating toward rest and increases
  excitability by a few mV per halving; in the patient the resulting spontaneous firing (tetany)
  starts in the motor nerves. Raised Ca²⁺ or Mg²⁺ reduces excitability. Raised Mg²⁺ also reduces
  transmitter release by competing with Ca²⁺ at the terminal, and raised Ca²⁺ reverses that.
- Botulinum toxin blocks vesicle fusion; dantrolene reduces SR Ca²⁺ release; organophosphates
  inhibit acetylcholinesterase, and the inhibition becomes irreversible (aging) unless an oxime
  reactivates the enzyme first.

## Acceptance tests

`tests/muscle.test.js` (run by `npm test` alongside the neuron tests; 22 tests, ≈ 35 s).
"Baseline" means force < 0.03 and Ca²⁺ < 0.15 µM; "threshold step" is the 25 mV from rest to
the model's ≈ −60 mV threshold; spikes are counted at `R3`, 5 mm from the stimulator, so the
stimulus artefact at the end-plate segment never counts as one.

- Stable rest at −85 mV in every segment; same gradient and Nernst-sign checks as the neuron;
  the K⁺ leak dominates; opening Na⁺ / K⁺ channels by hand moves Vm up / down.
- Subthreshold shock: no propagated spike, Vm returns to rest. Suprathreshold shock: overshoot and
  a dip below rest; doubling the shock changes the propagated spike amplitude by < 2 mV.
- The threshold readout is ≈ 1 in normal fluid.
- A 2× shock 3 ms after a spike produces no second spike; 20 ms after, it does.
- Shock at the end plate: every segment spikes, in distance order both ways, end to end in 2–10 ms.
- Spike precedes cytosolic Ca²⁺ peak precedes force peak; twitch ≈ 0.27, peak at 20–50 ms;
  force lasts > 20× the spike; all three return to baseline; `ca_release`, `twitch_peak` and
  `relaxed` events are emitted.
- Two shocks 20 ms apart peak > 1.3× a twitch; 10 Hz is unfused (ripple > 50 %); 50 Hz fuses
  (ripple < 10 %, `tetanus_fused`, > 2.2× a twitch); 100 Hz reads ≈ 1 with 50 separate spikes.
- Ca²⁺-free, Mg²⁺-substituted bath: excitability unchanged, a shock twitches within 5 % of
  control, a command releases nothing.
- ATP = 0 from before the shock: force rises once and never falls; Ca²⁺ stays up (rigor).
- SR leak on: force rises with no impulses; dantrolene returns it to baseline.
- Nerve command: release → spike → twitch, release before the spike. With Na⁺ channels blocked the
  end-plate potential alone is 1.7–2.5× the threshold step and emits `epp_peak`.
- Receptor block 50 %: a twitch within 5 % of control. 85 %: no twitch; neostigmine (AChE 0.3)
  restores it. 95 %: neostigmine does not; clearing the block (sugammadex) does.
- Receptor density 20 %: in a 3 Hz train the first command fires and at least one later one
  fails; AChE 0.3 makes all six fire; AChE 0.05 with a 20 Hz train fires at first and then fails.
- Persistent agonist: at least one spontaneous spike, the end plate held above −60 mV, commands
  and end-plate shocks fail, a shock at the far end still fires there, extracellular K⁺ rises.
- AChE = 0: end-plate potential > 3× longer but < 300 ms; a 20 Hz train fires and then blocks;
  restoring AChE (pralidoxime) lets every command fire.
- Release blocked: no release, no twitch to a command; a shock still twitches.
- K⁺ 7 mM: rest between −78 and −70, threshold lower, commands work. K⁺ 11 mM: commands fail;
  K⁺ 11 mM + Ca²⁺ 3 mM: commands work. K⁺ 12 mM: no spike to a 2× shock or a command.
  K⁺ 2.5 mM: rest between −100 and −92, threshold higher, commands still work.
- Ca²⁺ 1 mM: threshold lower, the fibre itself is silent for 2 s with the nerve disabled, the
  nerve's spontaneous rate is > 3 Hz and spontaneous commands appear with it enabled.
  Ca²⁺ 3.5 mM: threshold higher. Mg²⁺ 5 mM: commands fail, shocks twitch; Mg²⁺ 5 mM + Ca²⁺ 3 mM:
  commands work.
- TTX blocks spike and twitch from shock or command; the end-plate potential is still visible.
- Pump off does not change Vm immediately; with the accelerated rundown Vm drifts as E_K falls.
