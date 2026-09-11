# MUSCLE_MODULE.md — scene sequence (planned, Prototype 0.3)

**MuscleSim: from a shock to a twitch.** The second module of the simulator: one skeletal
muscle fibre, from the resting membrane to a fused tetanus, then the neuromuscular junction
that normally delivers the command.

Every scene lists: the view, what the student does, the prediction(s), and the acceptance
condition, in the same format as `NEURON_MODULE.md`. Sections after the table give the questions
and misconception feedback, the on-stage explanation, the lab scenarios, the shared-scene
refactor and the engine additions.

## Constraints this module is designed around

- **Taught before the neuron module.** In this course muscle physiology comes first, so this
  module cannot assume anything from `NEURON_MODULE.md`. It introduces the resting membrane
  potential, threshold, the action potential and the refractory period *for the first time*, on
  the sarcolemma. Depolarize, repolarize, threshold, all-or-none and refractory are defined here.
- **The motor neuron is a black box.** The fibre is triggered with a stimulating electrode first
  (as in a frog-muscle or PhysioEx lab). The nerve appears only in scene 13 as "how the body
  delivers that shock", and it does nothing but release acetylcholine (ACh) on command. How the
  neuron itself fires is the neuron module's job.
- **Audience: pre-nursing anatomy and physiology.** The causal chain matters because drugs and
  diseases break specific links in it. Every lab scenario is one nurses meet: neuromuscular
  blockers, myasthenia gravis, potassium and calcium imbalance, magnesium, organophosphates,
  malignant hyperthermia.
- **All principles in `PEDAGOGY.md` apply unchanged.** Predict → observe → explain; nothing on
  screen is canned; Continue only after the question is right and the activity is done.

## The big ideas the module must leave behind

1. **Four gates, one chain.** ACh receptor (opened by a chemical) → voltage-gated Na⁺ channel
   (opened by voltage) → T-tubule voltage sensor + SR release channel (opened by voltage, lets
   Ca²⁺ out of the store) → troponin (switched by Ca²⁺). Each gate is a place a drug or disease
   acts. The lab is organised around breaking one gate at a time.
2. **Na⁺ in = up, K⁺ out = down.** The action potential is not a curve to memorise; it is the
   result of Na⁺ channels opening fast and inactivating, and K⁺ channels opening late.
3. **Three calciums.** Ca²⁺ that enters the *nerve terminal* (triggers ACh release), Ca²⁺ released
   from the *sarcoplasmic reticulum* (triggers contraction), and *extracellular* Ca²⁺ (which
   skeletal contraction does not need, but excitability does). They are drawn in three distinct
   places and can be manipulated separately.
4. **The impulse is short, the twitch is long.** Milliseconds of action potential, tens of
   milliseconds of Ca²⁺, about a hundred milliseconds of force. Because the impulse is over long
   before the force is, impulses cannot add up (refractory period) but twitches can (summation,
   tetanus).
5. **One impulse, one twitch.** At the neuromuscular junction one nerve impulse always fires the
   fibre, with a wide safety margin. Weakness and paralysis appear only when that margin is eroded
   (myasthenia gravis, neuromuscular blockers) or removed (botulinum toxin).

## Scene table

| # | Scene | View | Student does | Predict | Done when |
|---|-------|------|--------------|---------|-----------|
| 1 | Where are we? | zoom slides: person lifting a cup → arm → muscle → fascicle → one fibre | clicks "Zoom in"; sees the whole fibre twitch once at the end | – | last slide reached |
| 2 | Parts of a muscle fibre | whole fibre, labels hidden | clicks the structure matching a **functional** description (sarcolemma, T-tubules, sarcoplasmic reticulum, myofibrils, motor end plate) | – | all five found |
| 3 | The resting membrane | membrane strip of the sarcolemma with K⁺ leak, Na⁺ leak, pump (shared scene) | reads gradients; answers; holds "open Na⁺ channels" and "open K⁺ channels" | which ion is high inside; pump vs permeability; K⁺ direction; Na⁺ direction; Vm change for Na⁺; Vm change for K⁺ | Vm rose above −77 / fell below −88 |
| 4 | Recording from inside | whole fibre with recording electrode; trace becomes persistent (shared scene) | answers | meaning of −85 mV | answered |
| 5 | Shock the fibre: threshold | sarcolemma strip with voltage-gated channels + stimulating electrodes; stimulus-strength slider | delivers shocks of increasing strength; sim pauses at ≈ −55 mV on the first suprathreshold shock | what a small shock does; what opens a voltage-gated channel; what Na⁺ entry does to the neighbouring channels (positive feedback); what a stronger shock does to the spike (all-or-none) | first spike; a stronger shock has produced the same spike |
| 6 | Building the action potential | sarcolemma strip + conductance traces; sim pauses at rise, peak, undershoot, and during a second shock in the refractory period (shared scene) | triggers; answers at each pause; delivers a second shock 1 ms after the first | Vm heading (rise); K⁺ direction (peak); Vm change (fall); why undershoot; whether the second shock fires | membrane recovered; refractory shock observed |
| 7 | Along the fibre and down the tubes | unrolled fibre with per-segment channel states and V-vs-position profile; T-tubule openings drawn | shocks the middle of the fibre; watches the wave go both ways and into the tubules | which way the wave travels; what opens the next segment; why it does not turn back; where the tubules carry it | both ends spike; tubule depolarisation seen |
| 8 | Voltage to calcium | triad: T-tubule wall with voltage sensor, SR with release channel and Ca²⁺ store, myofibril | fires; watches sensor → release channel → Ca²⁺ flood; then tries with zero extracellular Ca²⁺ | where the Ca²⁺ comes from; what happens with no Ca²⁺ outside | cytosolic Ca²⁺ peak seen; zero-outside run seen |
| 9 | Calcium to force | sarcomere: thin filament with troponin/tropomyosin, thick filament with cross-bridges, force gauge | fires; watches Ca²⁺ bind, tropomyosin move, bridges cycle, sarcomere shorten | what Ca²⁺ binds to; what the cross-bridge needs to detach; what shortens | force peak seen |
| 10 | Relaxation | triad + sarcomere side by side with SERCA pump and ATP meter | watches Ca²⁺ pumped back, force fall; then runs with ATP switched off | what removes Ca²⁺; what happens with no ATP (rigor) | force back to zero; rigor run seen |
| 11 | The twitch on one time axis | three-trace plot: Vm, cytosolic Ca²⁺, force, same time axis; fibre inset | fires once; reads off the three durations | order of the three events; which lasts longest | one clean twitch recorded |
| 12 | Summation and tetanus | same plot + stimulus-rate slider + force gauge | raises the rate until force fuses | second shock before force falls; why force adds when impulses cannot; what happens at high rate | fused tetanus reached (force > 3× twitch, ripple < 10 %) |
| 13 | How the body delivers the shock | neuromuscular junction: motor terminal, cleft with AChE, folded end plate with receptors; then whole fibre | "sends a command"; watches Ca²⁺ → vesicles → ACh → receptors → end-plate potential → spike → twitch; blocks half the receptors and tries again | which way Ca²⁺ moves at the terminal; ACh's effect on the end plate; will one command fire the fibre; what stops the signal; will half the receptors do | end-plate potential seen; spike seen; half-block still twitches |
| 14 | Grading force (optional) | whole muscle with three motor units of different size; force gauge | recruits units; raises rate | how a muscle produces a gentle vs strong pull | three units recruited, rate raised → Lab |

Scenes 3, 4, 6 are the shared scenes described under *Shared scene library*; scene 5 is
muscle-only because the fibre is triggered by a shock, not by a synapse.

A natural break for a two-session course is after scene 7 ("the fibre fires") with 8–14
("the fibre contracts, and who tells it to") in the second session.

## Questions and misconception feedback, scene by scene

Wrong options carry the feedback for that specific misconception (`PEDAGOGY.md` rule 5). Text
here is the content, not final copy.

### 1. Where are we?
No question. The final slide shows one isolated fibre twitching once: "That was one twitch. By
the end you will know every step that produced it, and every place it can go wrong."

### 2. Parts of a muscle fibre
Click-by-function prompts (correct → explanation, wrong → "That is the X. It does Y. Try again."):
- **Sarcolemma**: "The electrical signal travels over this surface. Click it." → "The sarcolemma
  is the fibre's membrane. Like every cell membrane it is charged, and it can carry an impulse."
- **T-tubules**: "These carry the surface signal deep into the fibre so the whole thing contracts
  at once. Click one." → "Transverse tubules are inward folds of the sarcolemma. Without them the
  inside of a thick fibre would never hear the signal."
- **Sarcoplasmic reticulum**: "This is the calcium store. Click it." → "The SR wraps every
  myofibril and holds Ca²⁺ at thousands of times the concentration in the cytosol."
- **Myofibrils**: "These do the pulling. Click one." → "Myofibrils are chains of sarcomeres, the
  contractile units. Everything else exists to switch them on and off."
- **Motor end plate**: "The nerve delivers its command here. Click it." → "The motor end plate is
  where the motor neuron meets the fibre. We will leave the nerve out until the end: first we
  learn what the fibre does when it is triggered."
Closing step, "The plan": rest → shock → impulse → spread → Ca²⁺ → force → relax, and at the end,
the nerve.

### 3. The resting membrane (shared scene, staged on the sarcolemma)
Same six questions as the neuron module's scene 3, with the copy re-staged (cell body → muscle
fibre; −70 → −85). The muscle fibre rests nearer E_K than the neuron, which makes the point
"at rest the membrane is almost all K⁺ permeability" more vivid. Additional muscle-specific
feedback on the pump question:
- Wrong: "The pump directly generates the −85 mV" → "The pump keeps the *gradients*. If it
  stopped, Vm would barely change for many seconds. In the Lab you can switch it off and watch."
Activity thresholds are relative to rest: Na⁺ hold must lift Vm by ≥ 8 mV, K⁺ hold must lower it
by ≥ 3 mV.

### 4. Recording from inside (shared scene)
- **Q** "The trace reads −85 mV. What does that mean?"
  - ✔ "The inside of the fibre is 85 mV more negative than the outside." → "Charges line the two
    faces of the membrane; the fibre is a charged battery waiting to be used."
  - ✘ "The fibre is damaged." → "A steady negative reading is a *healthy* resting fibre. A damaged
    one drifts toward 0 mV."
  - ✘ "There is more charge inside than outside." → "The separation is only along the membrane;
    the bulk fluids are neutral. Vm measures that thin layer of separated charge."

### 5. Shock the fibre: threshold and all-or-none
The stimulating electrodes inject a brief current pulse into the sarcolemma. Voltage-gated
channels are drawn for the first time (small "V" on the gate).
- **Q1** (before the first small shock) "A small shock pushes a little positive charge in. What
  will Vm do?"
  - ✔ "Rise a little, then fall back to −85." → "Just like opening a few Na⁺ channels by hand:
    K⁺ leak drags it back. Try it."
  - ✘ "Rise and stay up." → "Nothing is holding it up; K⁺ keeps leaking out. Watch."
  - ✘ "Fire an impulse." → "Not yet. Something has to open the voltage-gated channels first, and a
    small push does not reach them. Try it and see how far it gets."
- **Activity**: slider for stimulus strength; shocks at 20 %, 40 %, 60 %... The sim pauses the
  first time Vm crosses ≈ −55 mV with the Na⁺ channels just opening.
- **Q2** (at the pause) "These Na⁺ channels have a voltage sensor. What opened them?"
  - ✔ "The membrane depolarising to about −55 mV." → "This voltage is the **threshold**. Below it
    the channels stay shut; at it they start to open."
  - ✘ "The shock hit them directly." → "The shock only moved charge. The channels respond to the
    *voltage* across the membrane, not to the electrode."
  - ✘ "ACh from the nerve." → "There is no nerve in this experiment. These channels have no
    binding site; they respond only to voltage."
- **Q3** "Na⁺ rushes in through the open channels. What does that do to the Na⁺ channels next
  door?"
  - ✔ "Depolarises the membrane further and opens them too." → "Positive feedback: Na⁺ in →
    more depolarisation → more Na⁺ channels open. Once it starts it runs to completion."
  - ✘ "Closes them, to balance things out." → "That is what happens later with K⁺. Na⁺ entry makes
    the inside *more* positive, which is exactly what these channels respond to."
  - ✘ "Nothing; each channel acts alone." → "They share the same membrane and the same voltage.
    What one channel does to Vm, every neighbour feels."
- **Activity 2**: "Now double the shock strength." **Q4** "Will the impulse be bigger?"
  - ✔ "No, the same size." → "**All-or-none.** The shock only has to reach threshold; the Na⁺
    channels and the gradient do the rest, the same way every time."
  - ✘ "Yes, twice as big." → "Look at the trace: identical. The shock's job ends at threshold; the
    channels set the size."
  - ✘ "Yes, a little bigger." → "Compare the two peaks on the trace. The gradients, not the shock,
    decide how far Vm goes."

### 6. Building the action potential (shared scene with a muscle-only refractory step)
Pauses at rise, peak, undershoot, recovery. Conductance sub-plot under the trace.
- **Rise** "Where is Vm heading?" ✔ "Toward the Na⁺ equilibrium potential, about +67 mV." ✘
  "To 0 mV and no further" → "Zero is not special; Na⁺ pulls Vm toward +67 and Vm overshoots 0."
  ✘ "Back toward −85" → "Na⁺ channels are open and Na⁺ is flooding in. Which way does that push?"
- **Peak** "The Na⁺ channels have shut themselves (inactivated) and the K⁺ channels have opened.
  Which way does K⁺ move?" ✔ "Out." ✘ "In" → "K⁺ is 140 mM inside; and the inside is now
  *positive*, pushing K⁺ out even harder."
- **Fall** "What will Vm do?" ✔ "Fall back toward −85 (repolarise)." ✘ "Stay at +30" → "Nothing
  is holding it there: Na⁺ channels are inactivated and K⁺ is leaving."
- **Undershoot** "Why does Vm dip *below* rest?" ✔ "Extra K⁺ channels are still open, so Vm
  approaches E_K (−95)." ✘ "Too much Na⁺ left" → "Na⁺ hardly changed concentration. This is a
  permeability effect: the membrane is briefly even more K⁺-selective than at rest."
- **Refractory (muscle-only step)** "A second shock 1 ms after the first. Will it fire?"
  ✔ "No: the Na⁺ channels are inactivated and cannot open again yet." → "The **refractory
  period**. It lasts a few ms. Remember it: it is why impulses cannot pile up, even though, as
  you will see, twitches can." ✘ "Yes, the same impulse" → "Try it. The channels have a second
  gate that is shut after a spike; voltage cannot open them until it resets." ✘ "Yes, a smaller
  one" → "There is no small version. Either the loop runs or it does not, and right now it cannot."

### 7. Along the fibre and down the tubes
- **Q1** "The shock is in the middle of a 3 cm fibre. Which way does the impulse travel?" ✔ "Both
  ways, to both ends." ✘ "Toward the tendon only" → "Nothing about the membrane knows which way
  the tendon is. Local currents spread in both directions from the active spot." ✘ "It stays
  where the shock was" → "Watch: Na⁺ entering here depolarises the next patch, whose channels
  open, and so on."
- **Q2** "What opens the Na⁺ channels in the next segment?" ✔ "Local current from the active
  segment depolarises it to threshold." ✘ "The shock reaches it" → "The electrode's current dies
  away within a fraction of a millimetre. The impulse regenerates itself, full size, all the way."
- **Q3** "Why does the wave not turn around?" ✔ "Behind it the Na⁺ channels are inactivated
  (refractory)." ✘ "It has used up the Na⁺" → "Concentrations barely change. It is the channels'
  inactivation gate, not the supply."
- **Q4** "The fibre is 50 µm thick. How does the inside hear about a signal on the surface?" ✔
  "The T-tubules carry the surface membrane, and the impulse, deep inside." ✘ "Na⁺ diffuses to
  the middle" → "Far too slow, and the concentration change is tiny. The *membrane itself*
  folds inward as T-tubules, so every myofibril has a piece of the excited surface next to it."

### 8. Voltage to calcium
- **Q1** "The T-tubule wall has depolarised. Where does the Ca²⁺ that floods the cytosol come
  from?" ✔ "From the sarcoplasmic reticulum store." → "The voltage sensor in the tubule wall
  physically opens the release channel in the SR next to it. No Ca²⁺ needs to cross the
  sarcolemma." ✘ "From outside the fibre, through the T-tubule" → "Common mix-up. In skeletal
  muscle the voltage sensor pulls the SR channel open directly; the Ca²⁺ is already inside, in
  the store. Try the next activity." ✘ "From the mitochondria" → "Mitochondria can buffer Ca²⁺,
  but the store that empties within a millisecond is the SR."
- **Activity**: set extracellular Ca²⁺ to zero, shock again. **Q2** "Will it still contract?" ✔
  "Yes: the SR store is inside." ✘ "No: no calcium, no contraction" → "Watch. The sarcolemma
  still fires, the sensor still opens the SR, the store still releases. (Cardiac muscle is
  different, and needs extracellular Ca²⁺; that is a later module.)"

### 9. Calcium to force
- **Q1** "Ca²⁺ has arrived at the myofibril. What does it bind to?" ✔ "Troponin, on the thin
  filament." → "Troponin pulls tropomyosin aside and uncovers the myosin-binding sites on actin."
  ✘ "The myosin heads" → "Myosin is ready all along; it is *actin* that is covered. Ca²⁺ works on
  the cover." ✘ "The sarcolemma" → "The sarcolemma's part ended when it opened the SR. Ca²⁺ acts
  on the filaments."
- **Q2** "A cross-bridge has pulled and is still stuck to actin. What does it need to let go?" ✔
  "A fresh ATP." → "ATP binding detaches the head; splitting the ATP re-cocks it. Keep this for
  the relaxation scene." ✘ "Ca²⁺ leaving" → "Ca²⁺ leaving stops *new* attachments. A head that
  is already attached needs ATP to release."
- **Q3** "What actually gets shorter?" ✔ "The sarcomere: the filaments slide past each other." ✘
  "The filaments themselves" → "Neither filament changes length. They overlap more."

### 10. Relaxation
- **Q1** "The impulse is long over, but the fibre is still pulling. What has to happen for it to
  relax?" ✔ "Ca²⁺ must be pumped back into the SR." → "The SERCA pump uses ATP to return Ca²⁺.
  Troponin lets go, tropomyosin covers actin, cross-bridges stop forming." ✘ "The Na⁺/K⁺ pump
  resets the membrane" → "Vm was back at rest within milliseconds. Force is about Ca²⁺, not
  voltage, now." ✘ "Ca²⁺ leaves the fibre" → "Almost none leaves. It goes back into the store,
  ready for the next twitch."
- **Activity**: switch ATP off, shock. **Q2** "With no ATP, what happens after the twitch?" ✔ "The
  fibre stays contracted: heads cannot detach and Ca²⁺ cannot be pumped back." → "**Rigor.** Rigor
  mortis is exactly this, hours after death when ATP runs out." ✘ "It cannot contract at all" →
  "Watch: it contracts once (the stored ATP on the heads is enough for one stroke) and then
  locks." ✘ "It relaxes normally; ATP is only for contracting" → "ATP is needed to *let go* and
  to *pump Ca²⁺ back*. No ATP means no relaxation."

### 11. The twitch on one time axis
- **Q1** "Put these in order: force peaks, Vm spikes, Ca²⁺ peaks." ✔ "Vm → Ca²⁺ → force." with
  feedback pointing at the three peaks on the shared axis. Wrong orders get "Look at the traces:
  each one *causes* the next, so each must come after it."
- **Q2** "Which lasts longest?" ✔ "Force (about a hundred milliseconds)." ✘ "The impulse" → "The
  spike is over in about 3 ms; the force it launched lasts thirty times longer. This gap is the
  key to the next scene."

### 12. Summation and tetanus
- **Q1** "Shock again 20 ms after the first, while force is still rising. Will there be a second
  impulse?" ✔ "Yes: 20 ms is well past the refractory period." ✘ "No, it is still contracting" →
  "Contracting is about Ca²⁺ and cross-bridges; the *membrane* recovered long ago."
- **Q2** "Will the second twitch add to the first?" ✔ "Yes: the second Ca²⁺ release lands on top
  of what is left of the first." → "**Summation.** The pump had not finished clearing the first
  release." ✘ "No: all-or-none" → "All-or-none is a rule about the *impulse*. Force is not
  all-or-none; it depends on how much Ca²⁺ is on the filaments right now."
- **Activity**: raise the rate slider; watch the force gauge and the Ca²⁺ trace. **Q3** "At a
  high enough rate the force becomes smooth and maximal. Why?" ✔ "Ca²⁺ never gets pumped back
  between impulses, so troponin stays saturated." → "**Tetanus** (fused). Every ordinary
  movement you make is built from short tetanic contractions, not single twitches." ✘ "The
  impulses have summed into one big impulse" → "Look at the Vm trace: the spikes are still separate
  and the same size. It is the Ca²⁺ and the force that fuse."

### 13. How the body delivers the shock (the neuromuscular junction)
Reuses the synapse view and causal checklist. The motor neuron is drawn as a terminal only, with
a "Send command" button; the checklist starts at "command arrives at the terminal".
- **Q1** "The command arrives and Ca²⁺ channels in the *terminal* open. Which way does Ca²⁺
  move?" ✔ "Into the terminal." → "This is a different Ca²⁺ from the SR store: it is outside
  the nerve, and it triggers vesicle fusion." ✘ "Out of the terminal" → "Ca²⁺ is 2 mM outside
  and almost absent inside. Down the gradient means in."
- **Q2** "ACh binds receptor channels on the end plate; they pass Na⁺ in (and some K⁺ out). What
  will Vm do?" ✔ "Depolarise, a lot." → "The **end-plate potential**. Watch how large it is."
- **Q3** (predict before sending) "Will one command fire the fibre?" ✔ "Yes, every time." →
  "The end-plate potential is about two to three times what threshold needs. The junction is
  built with a wide safety margin." ✘ "Only if several commands add up" → "That is how *neurons*
  decide (next module). The muscle fibre is built to obey a single command: watch."
- **Q4** "What stops the signal, so the fibre can be commanded again a few ms later?" ✔
  "Acetylcholinesterase in the cleft breaks ACh down." ✘ "The receptors get tired" → "They
  close within a millisecond of ACh leaving. Something has to remove the ACh: an enzyme does."
  ✘ "ACh diffuses back into the terminal" → "Some choline is taken back up, but the fast removal
  is enzymatic destruction in the cleft."
- **Activity**: block half the receptors. **Q5** "Will the fibre still twitch?" ✔ "Yes: the
  end-plate potential shrinks but stays above threshold." → "This safety margin is why myasthenia
  gravis and neuromuscular blockers show nothing at first and then weakness: it takes losing about
  three quarters of the receptors to fail. Explore this in the Lab." ✘ "No: half the signal is
  gone" → "Half the *end-plate potential* is gone; the impulse only needs threshold. Watch."

### 14. Grading force (optional)
- **Q** "This muscle has three motor units: small, medium, large. To lift a pencil, which is
  recruited first?" ✔ "The small one, then larger ones as more force is needed." (size principle)
- **Activity**: recruit units and raise rate; force gauge reads the sum. Feedback ties rate coding
  (scene 12) and recruitment together: "two dials: how many units, how fast each fires".

## On-stage explanation (the sim explains itself)

Everything in `NEURON_MODULE.md` under this heading carries over (narrator bar, voltage ladder,
causal checklist, conductance sub-plot). Muscle adds:

- **Three-trace twitch plot** (scenes 11–12, Lab): Vm, cytosolic Ca²⁺ and force on one shared
  time axis, colour-coded (Vm ink, Ca²⁺ blue `#2d8fd5`, force a new red-brown). The narrator
  reads it: "impulse over; Ca²⁺ still high; force rising".
- **Excitation–contraction checklist** (scenes 8–10): impulse in the T-tubule → voltage sensor
  moves → SR release channel opens → Ca²⁺ floods cytosol → Ca²⁺ binds troponin → tropomyosin
  moves → cross-bridges cycle (ATP) → force → SERCA pumps Ca²⁺ back → troponin releases → force
  falls. Each row lights while the model is in that state.
- **Force gauge** on every view from scene 9 on: a bar reading the model's force, next to a
  sarcomere glyph whose overlap follows the model.
- **Ca²⁺ pools drawn distinctly**: terminal Ca²⁺ (scene 13), SR store level (a fill level that
  visibly drops on release and refills during relaxation), cytosolic Ca²⁺ (dots that appear at
  the release channel and vanish at SERCA), and extracellular Ca²⁺ (background jitter). Same
  blue everywhere, different places; the narrator names the pool.
- **Stimulus marks** on the trace: a tick at every shock so the student can see which shocks fired
  and which did not (threshold, refractory, block scenarios).
- The neuron module's rule stands: threshold is not drawn until scene 5 introduces it, and scene 3
  runs with voltage-gated Na⁺ channels absent so opening a channel by hand cannot fire the fibre.

## Free-play lab and clinical scenarios

Same model, all controls: shock (single, train at a set rate, strength), send nerve command
(single, train), receptor block fraction, receptor density, AChE activity, persistent agonist
on/off, terminal Ca²⁺ channel block, SR release channel leak, dantrolene, ATP on/off,
extracellular K⁺, Na⁺, Ca²⁺ and Mg²⁺, TTX, pump on/off, hold-to-open Na⁺/K⁺ channels, recording
site, and any of the views plus the three-trace plot.

Each **scenario** is a card: a one-line patient or lab situation, a prediction question, a
"Run" button that sets the controls, and an explanation. The student predicts before running.
Scenarios are grouped by the gate they break.

| Gate | Scenario | What the controls do | What the student sees | Predict prompt |
|---|---|---|---|---|
| Release | **Botulinum toxin** (wound botulism, or a therapeutic Botox dose) | release blocked (SNARE cleaved) | command arrives, Ca²⁺ enters, no vesicles fuse, no twitch; direct shock still works | "The nerve is fine and the muscle is fine. Will a command work? Will a shock?" |
| Release | **Magnesium sulfate** (pre-eclampsia infusion; reflexes checked every hour) | terminal Ca²⁺ channels partly blocked (Mg²⁺ competes with Ca²⁺) | smaller release, smaller end-plate potential; at high dose commands fail; direct shock works | "Why does the nurse check the patellar reflex?" |
| Receptor | **Rocuronium / vecuronium** (non-depolarising blocker in the OR) | receptor block fraction rises 0 → 90 % | twitches unchanged until ~75 % block, then fail; add **neostigmine** (AChE activity down) or **sugammadex** (block removed) and they return | "At what fraction of blocked receptors does the twitch fail?" |
| Receptor | **Myasthenia gravis** | receptor density 100 → 30 %; command train at 3 Hz | first commands fire, later ones fail as the end-plate potential runs down (fatigable weakness); **pyridostigmine** (AChE down) restores them | "Why does the patient's eyelid droop *later in the day*?" |
| Receptor | **Succinylcholine** (depolarising blocker, rapid-sequence intubation) | persistent agonist on (not cleared by AChE) | end plate depolarises and stays; a burst of spikes (fasciculations), then the Na⁺ channels inactivate and nothing fires; commands and shocks both fail while it lasts; K⁺ leaks out | "Why does the patient twitch *before* going limp?" |
| Cleft | **Organophosphate poisoning** (insecticide, nerve agent) | AChE activity → 0 | each command produces a long end-plate potential and repeated spikes, then depolarising block; **pralidoxime** restores AChE | "Too much ACh: stronger or weaker?" |
| Membrane | **Hyperkalaemia** (renal failure, K⁺ 7 mM) | extracellular K⁺ 4 → 7 → 9 mM | rest drifts from −85 toward −60; at first easier to fire, then Na⁺ channels inactivate and neither shock nor command fires (weakness → paralysis); the neuron module will connect this to the ECG | "The membrane is *closer* to threshold. Stronger or weaker?" |
| Membrane | **Hypokalaemia** (diuretics, vomiting, K⁺ 2.5 mM) | extracellular K⁺ 4 → 2.5 mM | rest hyperpolarises toward −95; a normal command may fail, a stronger shock is needed (weakness, cramps) | "Which way does Vm move, and is threshold nearer or farther?" |
| Membrane | **Hypocalcaemia** (post-thyroidectomy tetany, Chvostek's and Trousseau's signs) | extracellular Ca²⁺ 2 → 1 mM | Na⁺ channels open at a less depolarised voltage (threshold moves toward rest); spontaneous impulses and twitches with no command | "Less calcium: more contraction or less? Why?" |
| Membrane | **Hypercalcaemia** | extracellular Ca²⁺ 2 → 3.5 mM | threshold moves away; sluggish, weak response | "Now the opposite." |
| Store | **Malignant hyperthermia** (volatile anaesthetic in a susceptible patient) | SR release channel leak on | Ca²⁺ leaks continuously; sustained force with no impulses; ATP meter falls, heat rises; **dantrolene** closes the leak | "Rigid muscles, rising temperature, no nerve activity. Which gate?" |
| Filaments | **Rigor mortis / ischaemic cramp** | ATP off | one twitch then locked force; Ca²⁺ stays high | "Is a rigid muscle *receiving* impulses?" |
| Whole chain | **Tetanus (the disease) is not here** | – | note only: tetanus toxin acts on inhibitory neurons in the spinal cord, so the muscle chain is intact; the neuron module covers it | – |
| Contrast | **Which Ca²⁺?** | extracellular Ca²⁺ → 0; then command vs shock | commands fail (no release), shocks still twitch (SR store intact) | "Zero calcium in the bath. Does a *command* work? Does a *shock*?" |

Nursing-relevant numbers surfaced in the explanations: twitch depression begins at about 75 %
receptor occupancy, so a patient can look normal with most receptors blocked; succinylcholine
raises plasma K⁺ (dangerous in burns, crush injury, prolonged immobility); magnesium toxicity is
watched by reflexes and respiration; hypocalcaemia is tested with Chvostek's and Trousseau's
signs; malignant hyperthermia is treated with dantrolene.

Deliberately out of scope: cardiac and smooth muscle, fibre types and fatigue metabolism,
muscarinic effects of organophosphates, Lambert–Eaton syndrome (needs facilitation modelling;
possible later addition as the mirror image of myasthenia).

## Shared scene library

The neuron lesson's scenes 3 (resting membrane), 4 (recording electrode) and 8 (building the
action potential) are re-staged in this module with the same questions, feedback and activities.
Rather than copy them:

- Move the scene builders out of `app.js` into `scenes/shared.js` as functions of a **cell
  profile**: `restingMembrane(profile)`, `recordingElectrode(profile)`, `actionPotential(profile)`.
  A profile supplies: the compartment name to record and manipulate, the resting potential, the
  words for the cell and its region ("cell body" / "muscle fibre"), the view name for the whole
  cell, which manual channels exist, the activity thresholds (expressed relative to rest), and any
  extra steps to append (the muscle refractory step in scene 6).
- Copy strings that differ are held in the profile, not branched with `if` inside the scene.
- `LESSON` in each lesson file (`lessons/neuron.js`, `lessons/muscle.js`) is assembled from shared
  and module-specific scenes. `app.js` keeps the lesson engine, views and trace; the views gain
  `fibre`, `triad`, `sarcomere`, `twitchPlot`, `nmj`, `motorUnit`, `zoomMuscle`.
- The **narrator**, **voltage ladder**, **causal checklist** and **conductance sub-plot** already
  render from model state; they take the cell profile so the ladder shows the right rest line.
- Each module is its own page (`index.html` for the neuron, `muscle.html` for muscle) sharing
  `engine.js`, `muscle.js`, `app.js` and `scenes/shared.js`. `build.js` bundles each page to
  `dist/index.html` and `dist/muscle.html`; the Pages workflow deploys both. No build step is
  still true for development: open either page.
- When the muscle module ships, the neuron module's opening copy changes to "you fired a muscle
  fibre; now watch what a neuron adds", and its shared scenes can be offered as a review that the
  student may skip.

## Engine additions (`muscle.js`)

`muscle.js` exports `MuscleFiber`, reusing `hhRates`, `nernst`, `expEuler`, `Terminal` and
`Receptor` from `engine.js`. Units as in `engine.js`; force in arbitrary units normalised so a
single twitch peaks at ≈ 0.25 and a fused tetanus at ≈ 1.

**Compartments.** One end-plate segment in the middle of the fibre and `N` sarcolemma segments on
each side (default `N = 5`, 11 segments, segment length 200 µm; the fibre is drawn as if it were
much longer). Each segment carries voltage-gated Na⁺ and K⁺ (HH kinetics as the neuron; densities
tuned so the spike is ≈ 3 ms wide), leak calibrated to rest at −85 mV, axial coupling for
≈ 4 m/s conduction, and its own excitation–contraction unit. The end-plate segment also carries
the nicotinic receptor.

**Ion gradients.** `DEFAULT_CONC` from `engine.js` (E_K ≈ −95, E_Na ≈ +67, E_Ca ≈ +132); rest
is set by the leak reversal, as in the neuron. Extracellular K⁺, Na⁺, Ca²⁺ and Mg²⁺ are lab
controls; the pump-off rundown is reused.

**Excitation–contraction unit (per segment).**
- `d`: T-tubule voltage-sensor activation, sigmoid in V (half-activation ≈ −20 mV), τ ≈ 1 ms.
- `ryr`: SR release channel open fraction, follows `d` (plus `ryrLeak` for malignant
  hyperthermia, cleared by `dantrolene`).
- `caSR`: store content (starts at 1, in store units); release flux `kRel · ryr · caSR`.
- `ca`: cytosolic free Ca²⁺ (µM), rest 0.1; rises to ≈ 5–10 µM after one spike; uptake by SERCA,
  `vSerca · ca² / (ca² + kSerca²) · atp`; a fast buffer term keeps the transient ≈ 20–40 ms.
- `tn`: troponin occupancy, `kon · ca · (1 − tn) − koff · tn`, half-saturation ≈ 1 µM.
- `xb`: attached cross-bridge fraction, `(tn^2 − xb) / τxb · atp` for attachment; detachment
  requires `atp` (with `atp = 0`, `xb` cannot fall: rigor).
- `force` = mean `xb` over segments. Time to peak ≈ 40 ms, back to baseline ≈ 100–120 ms.
- `atp`: 1 normally; the Lab's "ATP off" sets it to 0 (with an accelerated decline option for the
  MH scenario, where heat is a derived readout).

**Extracellular Ca²⁺ and Mg²⁺ on excitability.** A gating shift `ΔV = k · log(Ca_out / 2)`
added to the Na⁺ activation curve (surface-charge screening): low Ca²⁺ lowers the effective
threshold, high Ca²⁺ raises it. Mg²⁺ contributes to the same shift and additionally blocks the
terminal's Ca²⁺ channel in proportion to `Mg_out / (Mg_out + K)`.

**Stimulator.** `shock(strength, durationMs = 0.5, segment = 'endplate')` injects a current
pulse; `train(rateHz, n)` schedules repeated shocks. Threshold strength is a readout so the lab
can show it move with K⁺ and Ca²⁺.

**Neuromuscular junction.** A `Terminal` driven by `templateAP` on `command()`, with a slower
vesicle refill (`tauRefill` ≈ 200 ms, pool large) so a 3 Hz train shows the normal rundown that
myasthenia turns into failure. A `Receptor` with `E ≈ 0 mV` (Na⁺ in, K⁺ out; the narrator says
"mostly Na⁺ in") and `gmax` set so the end-plate potential alone (Na⁺ channels blocked) is
≈ 2–3× the threshold depolarisation and twitches fail only past ≈ 75 % block. Parameters:
`block` (rocuronium; `sugammadex` clears it), `density` (myasthenia), `acheActivity` (1 normal;
neostigmine/pyridostigmine 0.3; organophosphate 0; pralidoxime restores), `agonist` (succinylcholine:
a cleft agonist not removed by AChE; receptor desensitisation optional), `releaseBlock` (botulinum).

**Events** for the renderer and lesson: `shock`, `spike` (per segment), `release`, `epp_peak`,
`ca_release`, `twitch_peak`, `relaxed`, `tetanus_fused`, `spontaneous_spike`.

**Renderer helpers**: `naState`, `kState` as in the neuron; `sensorState`, `ryrState`,
`troponinState`, `bridgeState` thresholds for drawing; `srLevel` for the store fill.

## Physiological assumptions

Add a **Skeletal muscle** section to `BIOLOGY.md` with these statements (the muscle model must
keep them true):

- Skeletal muscle fibres rest at about −85 mV (textbooks give −85 to −90), closer to E_K than a
  neuron because the resting membrane is even more K⁺-selective. Same gradients as the neuron.
- The action potential is produced by the same voltage-gated Na⁺ and K⁺ channels, lasts a few ms,
  is all-or-none, and is followed by a refractory period of a few ms. It spreads in both
  directions from the end plate at a few m/s and into the T-tubules.
- T-tubule depolarisation opens SR Ca²⁺ release channels through a direct mechanical link to the
  tubule voltage sensor. Skeletal excitation–contraction coupling does not require Ca²⁺ entry
  from outside the fibre; cardiac muscle does.
- Cytosolic Ca²⁺ rises from ≈ 0.1 µM to the micromolar range within a few ms and is returned to
  the SR by SERCA (ATP-dependent) over tens of ms.
- Ca²⁺ binds troponin; tropomyosin uncovers actin; cross-bridges cycle using ATP; ATP binding is
  required for detachment. Without ATP, force cannot relax (rigor).
- Force lags and outlasts the action potential (twitch ≈ 100 ms vs spike ≈ 3 ms), so twitches
  summate and fuse into tetanus at rates of tens of Hz while action potentials never summate.
- One motor neuron action potential releases enough ACh for an end-plate potential two to three
  times larger than needed for threshold; the fibre fires once per nerve impulse. ACh is removed
  within a millisecond by acetylcholinesterase.
- Nicotinic receptor block reduces twitch only past ≈ 75 % occupancy; reduced receptor density
  (myasthenia gravis) produces failure during repetitive activation, corrected by
  acetylcholinesterase inhibition. A persistent agonist produces brief repetitive firing, then
  depolarising block through Na⁺ channel inactivation.
- Raised extracellular K⁺ depolarises the resting membrane: slightly raised K⁺ increases
  excitability, strongly raised K⁺ inactivates Na⁺ channels and blocks firing. Lowered K⁺
  hyperpolarises and reduces excitability (a simplification; real hypokalaemic weakness is more
  complex).
- Lowered extracellular Ca²⁺ (or Mg²⁺) increases Na⁺ channel excitability and can produce
  spontaneous firing (tetany); raised Ca²⁺ or Mg²⁺ reduces it. Raised Mg²⁺ also reduces
  transmitter release.
- Botulinum toxin blocks vesicle fusion; dantrolene reduces SR Ca²⁺ release; organophosphates
  inhibit acetylcholinesterase irreversibly.

## Acceptance tests

`tests/muscle.test.js` (run by `npm test` alongside the neuron tests):

- Stable rest at −85 mV; same gradient and Nernst-sign checks as the neuron.
- Subthreshold shock: no spike, Vm returns to rest. Suprathreshold shock: spike with overshoot
  and undershoot; doubling the shock does not change spike amplitude (all-or-none).
- Second shock 1 ms after the first: no second spike. Second shock 20 ms after: second spike.
- Shock at the end plate: both ends of the fibre spike, in distance order, with a delay
  consistent with a few m/s.
- Spike precedes cytosolic Ca²⁺ peak precedes force peak; all three return to baseline; force
  duration > 20× spike duration.
- Twitch force ≈ 0.25 (normalised); two shocks 20 ms apart give a peak > 1.3× a single twitch;
  a 100 Hz train fuses (peak > 3× twitch, ripple < 10 %); a 10 Hz train is unfused.
- Extracellular Ca²⁺ = 0: a shock still produces a normal twitch; a nerve command produces no
  release and no twitch.
- ATP = 0: one twitch, then force does not fall and cytosolic Ca²⁺ does not fall (rigor).
- SR leak on: force rises with no shocks; dantrolene returns it to baseline.
- Nerve command: release → end-plate potential → spike → twitch. With Na⁺ channels blocked the
  end-plate potential alone is 2–3× the threshold depolarisation.
- Receptor block 50 %: command still twitches. Block 85 %: no twitch. Neostigmine at 85 % block
  restores the twitch. Sugammadex clears the block.
- Receptor density 30 %: first command in a 3 Hz train twitches, a later one fails; AChE
  inhibition makes the whole train succeed.
- Persistent agonist: at least two spontaneous spikes, then no response to a command; K⁺ efflux
  raises extracellular K⁺ in the accelerated model.
- AChE = 0: end-plate potential duration > 5× normal, repetitive spikes; pralidoxime restores.
- Release blocked: command gives Ca²⁺ entry but no release; shock still twitches.
- Extracellular K⁺ 7 mM: rest depolarised, lower shock threshold; K⁺ 9 mM: no spike to any shock
  or command. K⁺ 2.5 mM: rest hyperpolarised, higher shock threshold.
- Extracellular Ca²⁺ 1 mM: spontaneous spikes within 500 ms at rest; Ca²⁺ 3.5 mM: threshold
  strength higher than normal. Mg²⁺ raised: smaller release and higher threshold.
- TTX blocks the spike and the twitch from either shock or command.
- Pump off does not change Vm immediately.
