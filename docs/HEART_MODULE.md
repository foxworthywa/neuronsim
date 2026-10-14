# HEART_MODULE.md — heart and circulation

**Status:** Part A (six scenes; see "Part A as built") is built: `heart/` (engine, app), `lib/` (shared lesson runner),
`tests/heart.test.js`. Parts B and C, the lab and the case mode are still design.

The second module, aimed at BIO 142 (A&P II), especially the online-only sections. It follows
`PEDAGOGY.md` unchanged: predict → observe → explain, causes before names, nothing drawn that the
model did not compute, Continue only when the question is answered and the activity done.

One engine, one continuous causal journey, delivered as three short lessons that line up with
the heart and blood-vessel chapters:

- **Part A: the pump.** Pressure, valves, the cardiac cycle, stroke volume (scenes 1–5).
- **Part B: the beat.** Pacemaker, conduction and ECG, contractile cell, autonomic control (scenes 6–9).
- **Part C: the vessels.** Blood pressure and the baroreceptor reflex (scenes 10–11).

Then a free-play lab and a mystery-patient case mode that the graded assignments are built on.

## Why mechanical before electrical

Textbooks usually teach conduction first. Here the student **is the pacemaker** first: in scene 2
they squeeze the ventricle by hand and discover that pressure alone opens and closes the valves.
By scene 5 they have been squeezing every beat, which sets up the question Part B answers: what
times this automatically, and why doesn't the heart need the brain to do it?

## Scene sequence

| # | Scene | View | Student does | Predict | Done when |
|---|-------|------|--------------|---------|-----------|
| 1 | Two pumps, one loop | zoom: person → thorax → heart; then a circuit schematic (right heart → lungs → left heart → body → back) | follows one red blood cell by clicking the next stop from a **functional** description ("receives blood returning from the lungs") | O₂ content in the pulmonary veins; which side pumps more blood per minute | full loop traced |
| 2 | Pressure moves blood | left-heart strip: pulmonary veins → LA → bicuspid → LV → aortic valve → aorta, with the pressure ladder; heartbeat off (manual mode) | holds **Squeeze** to stiffen the LV wall, releases, and repeats | what opens the bicuspid valve; which valve moves first when the LV squeezes; when blood starts to leave | student has produced ≥ 2 ejections and seen a phase with both valves shut |
| 3 | Building the cardiac cycle | same strip + live traces (LA, LV, aortic pressure; LV volume; valve bar) drawn beat by beat; sim pauses at each of the four valve events | presses **Beat** for each squeeze and answers at the pauses; hears S1/S2 when they happen | next valve event; LV volume while both valves are shut; what closes the aortic valve; which event makes each heart sound | all four valve events annotated |
| 4 | How much per beat? | pressure–volume loop drawn live next to the traces | clicks each side of the loop from its description; reads EDV and ESV off the loop | why pressure barely rises during filling; SV and EF from their own loop | SV within ±5 mL of the model |
| 5 | More in, more out | PV loop + left and right output meters | raises filling (infuse, raise legs), then raises afterload (constrict arterioles); then sets RV output 5 % above LV | SV with more filling; SV against higher aortic pressure; where the extra right-heart blood goes and what the left heart does about it | both manipulations done; left and right outputs seen to re-converge |
| 6 | The heart beats itself | SA node cell: membrane strip with funny (HCN), Ca²⁺ and K⁺ channels, voltage ladder, voltage trace; auto-beating switches on | watches three spontaneous beats; cuts the cardiac nerves | does a heart removed from the body keep beating; which ion carries the upstroke (vs. the neuron); why there is no stable resting potential | three beats seen; denervated rate ≈ 100 bpm observed |
| 7 | Spreading the signal | heart outline with conduction pathway coloured by membrane potential; ECG builds underneath; sim pauses at P, PR segment, QRS, T | steps through one beat; then overlays the ECG on scene 3's traces | what the AV-node pause is for; which wave is atrial depolarization; whether atrial repolarization shows; whether the ECG shows contraction; which comes first: QRS or the bicuspid valve closing | ECG annotated; overlay ordering answered |
| 8 | The contractile cell | ventricular myocyte membrane strip (fast Na⁺, L-type Ca²⁺, K⁺) + Ca²⁺ → tension trace | stimulates once; then tries to stimulate again mid-contraction; then blocks Ca²⁺ channels partially | what holds Vm near 0 for ~250 ms; what the entering Ca²⁺ does; whether a second stimulus during contraction adds a second contraction (compare skeletal muscle from BIO 141) | early stimulus attempted and refused; weaker beat seen under Ca²⁺ block |
| 9 | The nervous system adjusts | SA cell trace + PV loop + HR, SV, CO readouts; sympathetic and vagal sliders | **Challenge:** double cardiac output; first by heart rate alone (pacing to 180), then with sympathetic drive | vagal effect on the pacemaker drift; sympathetic effect on contractility; why pacing alone stops paying off at high rates | CO ≥ 10 L/min reached, and the high-rate plateau seen |
| 10 | Into the vessels | whole-circulation schematic: heart, elastic aorta, arterioles (drawn diameter = resistance), capillaries, veins as a reservoir; MAP gauge; arterial pressure trace | constricts or dilates arterioles; stiffens the aorta | MAP and CO after arteriolar constriction; where most of the blood is; pulse pressure with a stiff aorta | answered and both manipulated |
| 11 | Holding pressure steady | schematic + reflex loop (baroreceptors → medulla → vagal/sympathetic → heart and vessels) lighting as a causal checklist; 60 s MAP/HR/TPR traces | stands up; then loses 10 % of blood volume; then repeats the loss with the reflex blocked | direction of HR and TPR after the loss; what happens without the reflex | compensation seen with the reflex and failure seen without → Lab |

Scene 11 closes the loop back to BIO 141: neurons (NeuronSim) set the heart rate and vessel
diameter that keep blood flowing to those same neurons.

## Misconceptions each scene targets

Every wrong option gets its own feedback (`PEDAGOGY.md` §5). These are the ones the model is
built to catch:

| Misconception | Scene | What the model shows instead |
|---|---|---|
| Veins always carry deoxygenated blood | 1 | Pulmonary veins carry the most oxygen-rich blood in the body |
| The left side pumps more blood (it's bigger) | 1, 5 | Outputs must match; a mismatch dams blood in the lungs until Frank–Starling corrects it |
| Chordae tendineae / papillary muscles open the valves | 2 | Valves move only when the pressure across them reverses; chordae only stop eversion |
| Blood leaves the moment the ventricle squeezes | 2, 3 | Isovolumetric contraction: pressure must first exceed aortic pressure |
| Heart sounds are the muscle contracting | 3 | S1 and S2 occur at valve closures |
| The atria fill the ventricles | 3, 4 | Most filling is passive; the atrial kick adds roughly the last 10–20 % |
| The heart pumps what the brain tells it to | 5 | Frank–Starling: output follows filling with no nerves involved |
| The heart needs the brain to beat | 6 | The denervated SA node fires at ≈ 100 bpm; vagal tone slows it to ≈ 75 |
| Every action potential upstroke is Na⁺ | 6 | SA-node upstroke is Ca²⁺; TTX-like Na⁺ block does not stop it |
| The ECG shows contraction | 7 | The ECG is electrical and precedes each pressure rise |
| Heart muscle can be tetanized like skeletal muscle | 8 | The refractory period lasts almost the whole contraction |
| A faster heart rate always means more output | 9 | Diastole shortens most; filling and SV fall at high rates |
| Blood pressure is just the heart pushing | 10 | MAP = CO × TPR; arterioles set it as much as the heart |
| Arteries hold most of the blood | 10 | About two-thirds sits in systemic veins |
| Losing blood mostly lowers heart rate / the body can't compensate | 11 | Reflex tachycardia and vasoconstriction hold MAP after a 10 % loss |

## On-stage explanation (the sim explains itself)

Same devices as NeuronSim, adapted:

- **Narrator bar** generated from model state, e.g. *"LV pressure (14 mmHg) is now above LA
  pressure (10), so the bicuspid valve is pushed shut. The aorta is still at 80, so the aortic valve
  stays shut too. With both valves closed, LV volume cannot change."*
- **Pressure ladder** (the heart's version of the voltage ladder): a vertical mmHg scale with
  pointers for LA, LV and aorta and a valve symbol between each pair. A valve is drawn open only
  when the arrow between its two pointers runs downhill in the forward direction. "Valves follow
  pressure" can be read straight off it.
- **Valve bar** under the traces: bicuspid and aortic open/closed in time, with the four phases
  (filling, isovolumetric contraction, ejection, isovolumetric relaxation) shaded once named.
- **Causal checklist** for the reflex (scene 11): MAP falls → baroreceptors fire less → medulla
  → vagal ↓, sympathetic ↑ → HR ↑, contractility ↑, arterioles narrow, veins tighten → MAP
  recovers. Rows light while true in the model and tick off afterwards.
- **Heart sounds** are synthesized at valve-closure events the engine emits (Web Audio), and a
  phonocardiogram strip shows them visually, so sound is never the only cue. Murmurs in the lab
  are noise whose loudness follows the flow across a diseased valve, so their timing emerges.
- The ECG is not drawn until scene 7 and threshold lines not until scene 6, as NeuronSim hides
  threshold until it is introduced.

## Free-play lab

Same model, all controls:

- **Rhythm:** sinus / manual / paced rate; sympathetic and vagal tone; AV conduction (normal,
  first-degree delay, complete block).
- **Volume:** infuse, hemorrhage, standing vs. lying.
- **Vessels:** arteriolar resistance (TPR), aortic stiffness, venous tone.
- **Heart muscle:** contractility, diastolic stiffness.
- **Valves:** aortic stenosis or regurgitation; bicuspid stenosis or regurgitation; each graded.
- **Drugs:** β-blocker, atropine, L-type Ca²⁺-channel blocker, vasodilator, diuretic (volume ↓).
- **Reflex:** baroreflex on/off.
- **Views:** any; record any pressure, volume or cell voltage.

## Mystery-patient mode (for assignments)

The student enters a case code. The code seeds a hidden condition and its severity, so each
student's numbers differ and there is no shared answer key. Starting from a "patient at rest",
the student runs tests (listen, ECG, chamber pressures, PV loop, a standing test, a drug
challenge), records evidence, and submits a diagnosis with the reasoning. The app then prints a
summary with a short check code (a hash of the seed and the answers) for the student to paste into
the LMS. The code deters casual sharing; it is not security.

Initial case pool, chosen so each has a distinct signature in the model:

| Condition | Signature the student can find |
|---|---|
| Aortic stenosis | LV–aortic systolic gradient, systolic ejection murmur, narrow pulse pressure |
| Aortic regurgitation | Wide pulse pressure, low diastolic pressure, diastolic murmur, large EDV |
| Bicuspid (bicuspid) regurgitation | Holosystolic murmur, tall LA pressure wave, no true isovolumetric contraction on the PV loop |
| Bicuspid (bicuspid) stenosis | High LA pressure, LA–LV gradient in diastole, diastolic murmur |
| Systolic heart failure | Low EF, high EDV and EDP, PV loop shifted right |
| Complete AV block | P waves and QRS complexes unrelated, ventricular rate ≈ 35–45 |
| β-blocker excess | Slow rate, reduced contractility, normal valves, blunted response to standing |
| Compensated hemorrhage | Tachycardia, narrow pulse pressure, low venous pressure, MAP near normal |
| Hypertension (high TPR) | High MAP, narrower PV loop at higher pressure |

## Assignments built on the module

Each is predict-first. Predictions are locked before the student runs the model, and the
written explanation of any mismatch carries most of the grade.

1. **A1 · The pump** (Part A, ~40 min) — scenes 1–5 plus a short worksheet: sketch a predicted
   PV loop for a filling change and an afterload change, then compare with the model.
2. **A2 · The beat** (Part B, ~40 min) — scenes 6–9; worksheet aligns ECG waves with valve events.
3. **A3 · Blood pressure** (Part C, ~30 min) — scenes 10–11.
4. **A4 · Lab report: hemorrhage or exercise** — a protocol (e.g., remove 5 % steps to 30 %),
   a data table, graphs of MAP, HR and SV against blood loss, and a causal explanation.
   Optional at-home pairing: the student's own pulse lying vs. standing, compared with the model.
5. **A5 · Mystery patient** — case mode above; the graded answer is the evidence chain.

The model returns in later modules (kidney: MAP drives GFR, RAAS raises volume and TPR; acid–base
capstone), so exam questions can transfer from it all semester.

## The model

### Mechanics: closed-loop lumped circulation

- **Chambers:** LA, LV, RA, RV as time-varying elastances, `P = E(t)·(V − V₀)` (Suga–Sagawa).
  E(t) rises from E_min (diastole) to E_max (systole) along a smooth activation curve whose onset is
  set by the electrical model (below). Contractility = E_max. Diastolic stiffness = E_min (an
  exponential passive curve is an option if Frank–Starling needs a ceiling).
- **Valves:** one-way with forward resistance. Stenosis raises the forward resistance;
  regurgitation gives a finite backward resistance. Aortic and pulmonary valve flows carry a small
  inertance, so closure follows a brief backflow. That gives the dicrotic notch (incisura)
  without drawing one.
- **Vessels:** systemic and pulmonary arteries as three-element windkessels (characteristic
  impedance, compliance, peripheral resistance). Systemic and pulmonary veins as large compliant
  reservoirs with **unstressed volume**, so venous tone and hemorrhage act through stressed
  volume, as they do physiologically.
- **Closed loop, both sides.** Total blood volume is conserved except for explicit infusions and
  losses. Left and right outputs are not forced equal; they match because of Frank–Starling.

Starting parameters (to be tuned to the targets below, not treated as fixed): LV E_max ≈ 2.5,
E_min ≈ 0.08 mmHg/mL; RV E_max ≈ 0.7, E_min ≈ 0.05; atria E_max ≈ 0.3, E_min ≈ 0.15; systemic
R ≈ 1.05 mmHg·s/mL, C ≈ 1.6 mL/mmHg; pulmonary R ≈ 0.09 mmHg·s/mL; total volume 5000 mL.

### Electrics: conductance-based cells, as in `engine.js`

- **SA node cell:** funny current I_f (HCN, opened by hyperpolarization, Na⁺-dominated inward),
  T- and L-type Ca²⁺ currents (the upstroke), delayed-rectifier K⁺ (repolarization), no I_K1.
  Maximum diastolic potential ≈ −60 mV, threshold ≈ −40 mV.
- **Ventricular myocyte:** fast Na⁺ upstroke, I_K1 holding rest at ≈ −90 mV, L-type Ca²⁺
  plateau, delayed K⁺ repolarization; AP ≈ 250–300 ms. Ca²⁺ entry triggers a simplified
  Ca²⁺-induced Ca²⁺ release; the cytosolic Ca²⁺ transient sets E_max for that beat. That
  connects inotropy to Ca²⁺.
- **Conduction:** no 3-D tissue. A chain of regional cells (SA → atria → AV node → His/bundle
  branches/Purkinje → ventricular endocardium and epicardium) coupled with conduction delays. The
  AV node has slow conduction and a long refractory period, so AV block is a parameter change.
  The His/Purkinje cell has its own slow intrinsic rhythm, so complete block produces an escape
  rhythm without a special case.
- **ECG (lead II):** computed as a weighted sum of the regional cells' voltages. The P wave is
  atrial depolarization, QRS is ventricular depolarization, and the upright T wave arises because
  epicardial cells have a shorter AP than endocardial cells, so the waves are computed, not drawn.
- **Coupling:** atrial E(t) starts a short delay after atrial depolarization. Ventricular E(t)
  starts ≈ 20–40 ms after QRS onset and relaxes as repolarization completes.
- **Autonomic:** ACh opens I_K,ACh and reduces I_f (deeper, slower pacemaker drift; slower AV
  conduction). Norepinephrine increases I_f and L-type Ca²⁺ current (faster drift, bigger Ca²⁺
  transient, larger E_max, faster relaxation).

Reused from `engine.js`: units (mV, ms, mM), `nernst`, `expEuler`, the browser/CommonJS wrapper,
the event queue (`takeEvents`), and the test harness. The squid gating rates are **not** reused;
the cardiac cells get their own simplified rate functions.

### Blood pressure control (Part C)

Carotid/aortic baroreceptors sense arterial pressure through a sigmoid. Medullary output sets
vagal tone (fast, about one beat) and sympathetic tone (slower, roughly 5–15 s). Sympathetic tone
drives HR, E_max, TPR and venous unstressed volume. Long-term control (RAAS, ADH, renal volume) is
out of scope here; it is the kidney module's hook.

### Engine API (sketch)

```js
const h = new Heart();                 // healthy adult, supine, at rest
h.advance(dt);                         // ms; electrical cells sub-step internally
h.takeEvents();                        // [{type:'valve', valve:'mitral', open:false, t}, {type:'ecg', wave:'QRS', t}, {type:'beat', t}, …]
h.chambers.LV  // {P, V}     h.valves.aortic // {open, Q}     h.arteries.systemic // {P}
h.cells.SA     // {V, gates, Ca}         h.ecg // current lead-II value
h.setPacing('sinus' | 'manual' | {rate}); h.squeeze(level);   // manual mode for scene 2
h.setAutonomic({ symp, vagal }); h.hemorrhage(mL); h.infuse(mL);
h.setLesion('aorticStenosis', severity); h.setDrug('betaBlocker', dose);
```

Time is in ms throughout, as in NeuronSim. Pressures are mmHg, volumes mL, flows mL/s.

### Speed

A cardiac cycle is ~800 ms, so Part A runs at 20–25 % of real time (one beat ≈ 3–4 s). Cell
views run at about 10 %. The reflex scenes need ~60 s of physiology, so they run at 100–400 %.
At those speeds the electrical sub-steps are the cost to measure early. If needed, the fast mode
can coarsen the cell time step but must still pass the same tests.

## Physiological targets (become `BIOLOGY.md` § Heart and the tests)

Healthy adult, supine, at rest, default vagal tone:

| Quantity | Target |
|---|---|
| Heart rate | 70–80 bpm (denervated: 85–110) |
| Aortic pressure | ≈ 120/80 mmHg, MAP 85–100 |
| LV EDV / ESV | 110–130 mL / 40–60 mL; EF 55–65 % |
| Cardiac output | 4.5–6 L/min, equal left and right over 20 beats (±2 %) |
| LA mean / RA mean | 5–12 / 0–8 mmHg |
| RV / pulmonary artery | ≈ 25/0–5 / ≈ 25/10 mmHg |
| Atrial contribution to EDV | 10–30 % at rest |
| Timing at 75 bpm | systole ≈ 300 ms, diastole ≈ 500 ms; PR 120–200 ms; QRS < 120 ms; QT 350–430 ms |
| SA node | no stable rest; max diastolic ≈ −60 mV; threshold ≈ −40 mV |
| Ventricular myocyte | rest ≈ −90 mV; plateau ≥ 150 ms; refractory ≥ 200 ms |
| Blood distribution | ≥ 60 % of volume in systemic veins |

## Acceptance tests (`tests/heart.test.js`)

- Total blood volume conserved to < 0.1 % over 100 beats without interventions.
- Resting targets in the table above are met.
- Each valve is open only when its upstream pressure exceeds downstream (apart from the brief
  inertial backflow at semilunar closure); bicuspid and aortic are never open together (healthy).
- LV volume changes < 1 mL during isovolumetric phases.
- Event order every beat: P → QRS → bicuspid closes (S1) → aortic opens → T → aortic closes (S2)
  → bicuspid opens.
- Frank–Starling: + 500 mL infused → EDV ↑ and SV ↑ (reflex off).
- Afterload: TPR ↑ → ESV ↑, SV ↓ (reflex off).
- Contractility: E_max ↑ → ESV ↓, SV ↑, EF ↑.
- RV output set 5 % above LV → pulmonary volume rises, then outputs re-converge within ~30 beats.
- Pacing 75 → 150 bpm shortens diastole proportionally more than systole. Pacing to 180 without
  sympathetic drive gives a CO rise well below proportional.
- SA cell: Na⁺-channel block does not stop firing; L-type Ca²⁺ block abolishes it; I_f block slows it.
- Ventricular cell: a stimulus during the plateau produces no second AP or contraction.
- ACh slows the SA rate and lengthens PR; norepinephrine raises the rate, Ca²⁺ transient and E_max.
- Complete AV block: atrial rate unchanged; ventricular escape 30–50 bpm; P and QRS dissociated.
- Lesion signatures as in the case table (murmur timing, gradients, pulse pressure).
- MAP ≈ CO × TPR + CVP within 5 %.
- Stiffer aorta → wider pulse pressure at similar MAP.
- 10 % hemorrhage with reflex: MAP back within 10 % of baseline by 60 s, HR ↑, TPR ↑.
  Without reflex: a clearly larger and sustained fall.

## Visual style (extends `VISUAL_STYLE.md`)

- Same background, panels, ion colours and channel drawings; cell views look exactly like
  NeuronSim's membrane views, so students recognize them from BIO 141.
- Oxygen-rich blood bright red; oxygen-poor blood dark crimson-plum. **Never blue.** Blue is
  already Ca²⁺, and "deoxygenated blood is blue" is itself a misconception.
- Chamber walls thicken and the cavity shrinks as E(t) rises; the drawn volume is the model volume.
- Fixed trace colours: LA, LV, aorta, RV, pulmonary artery, ECG (to be chosen and listed here).
- Conduction view colours tissue by membrane potential with the same scale as the whole-neuron view.

## Accessibility (design in, not retrofit)

All controls keyboard-operable. The narrator line is an `aria-live` region (throttled) and acts
as a text alternative for the animation. Valve states and phases are labelled in text, not colour
alone. Audio always has a visual twin. Reduced-motion setting. Check current Reynolds and ESCC
requirements with their accessibility offices before Part A ships.

## Out of scope for this module

Coronary circulation, detailed 3-D anatomy, fetal circulation, capillary exchange (Starling forces
and edema, likely a small add-on tied to the lymphatic chapter), long-term BP control (kidney
module), respiratory sinus arrhythmia, arrhythmias beyond AV block, scoring and accounts.

## Build plan

Each milestone is usable in a course on its own.

- **M0 · Shared framework.** ✅ HeartSim lives in its own folder, `heart/` (engine, app, page),
  with a generic lesson runner and base styles in `lib/`. It is published as `dist/heart.html`
  alongside the existing pages, which `build.js` leaves byte-for-byte unchanged (NeuronSim at the
  site root, MuscleSim at `muscle.html`, frozen releases in `v1/`).
- **M1 · Mechanics + Part A.** ✅ Closed-loop engine with sinus, single-beat and manual activation;
  19 physiology tests; Part A scenes; results + completion code for Canvas. A1 can be assigned.
- **M2 · Electrics + Part B.** Cells, conduction, ECG, coupling, autonomic; scenes 6–9.
- **M3 · Vessels + Part C.** Venous reservoirs, baroreflex; scenes 10–11.
- **M4 · Lab and cases.** Lesions, drugs, sounds/murmurs, mystery-patient mode, check codes,
  assignment handouts.

## Decisions (instructor, Oct 2026)

1. **Vocabulary:** "bicuspid valve" in everything students see. Code identifiers still say `mitral`.
2. **Submission and grading:** through Canvas, graded by AI from a rubric. Part A ends with the
   student's **results** (copy button) and a **completion code** (from their name, shown only once
   every question is answered; instructors check it at `heart.html#verify`). The graded work is a
   **worksheet** of short-answer reasoning, synthesis and transfer questions (40 points) built
   around a patient case; the same questions are in `assignments/heart-part-A.md` for a Canvas
   text-entry assignment. The answer key and AI-grading rubric are kept outside this public repo.
   In-simulation predictions are never graded.
3. **Length:** about 30–40 min per Part; Parts A–C together make one lab.
4. **Naming:** the repo becomes a collection of models (done in the file layout; renaming the
   GitHub repository and Pages URL is still to do).
5. **Sound:** heart sounds on by default, with a toggle and a visual twin on the traces.

## Part A as built (differences from the plan above)

- **A patient case runs through Part A** (instructor feedback: students need to see why the graphs
  matter). Dana Brooks, 62, two weeks after a heart attack: breathless, crackles in both lungs,
  echo "EDV 180 mL, EF 40 %", started on a diuretic. Scene 1 opens with her case and three
  questions; a "Dana's case" button reopens it; short "Back to Dana" notes follow in scenes 2, 4
  and 5 (she computes Dana's stroke volume from the echo report); scene 6's heart attack is hers,
  followed by two weeks of fluid retention (+600 mL, fast-forwarded) and a diuretic (−400 mL).
  The model's numbers are her numbers: after the heart attack SV 58 mL, EF 40 %, BP 99/66; after
  retention SV 74 mL, BP 125/86, EDV 183 mL, lung vein pressure 22.6 mmHg (above the ~18 mmHg leak
  line); after the diuretic SV 64 mL, BP 110/74, lung vein pressure 14.5 mmHg.
- Every reset now restores the default physiology too (a bug let the constricted arterioles carry
  into the heart-attack experiment).

- **A new first scene, "The real heart"** (instructor feedback: the box diagram alone does not
  look like a heart). A beating frontal section (lungs either side, great vessels; the person's
  left on the viewer's right) whose four valves open and shut from the model and whose chambers
  swell with model volumes. Students answer an orientation question, then find the four chambers
  and four valves from functional descriptions, then compare how the valves move.
- **Scene 2 follows the red blood cell through the real heart**, then a "Simplify into a
  diagram" button morphs the anatomy into the box diagram (chambers slide and stretch into their
  boxes; the student can switch back and forth). The box diagram now shows each atrium sitting
  on its ventricle with the AV valve between them, and semilunar valves at the outflows.
- **Scene 3 opens by straightening the left side out of the real heart** (right side fades,
  LA/LV slide into a line and cross-fade into the line diagram), then a "How to read this
  picture" step with six numbered markers (chamber size = volume, muscle wall, valves, flow dots,
  pressure bars, the valve rule). The line view keeps a small real-heart inset in its corner.
- Steps the student has completed stay completed when revisited with Back, and one-beat steps
  start a fresh beat if the one they wait on has ended, so no step can deadlock.

- Scene 1 traces the loop in 8 clicks (RA → RV → pulmonary trunk → lungs → pulmonary veins → LA →
  LV → aorta); a token changes colour in the lungs. A third question (why the LV wall is thicker)
  uses the aortic vs. pulmonary-trunk pressure traces.
- Scene 5's "two sides" experiment weakens the **left** ventricle (a heart attack, contractility
  −60 %) instead of strengthening the right. Strengthening the RV barely moves any blood (it cannot
  pump more than venous return gives it), while a weak LV shows the damming, the rise in lung
  pressure and the Frank–Starling rebalancing clearly, and leads into left heart failure.
- The relaxed ventricles follow an exponential pressure–volume curve (not a constant E_min), so
  an over-filled ventricle stiffens and pressure backs up into the lungs.
- "Stiffen the aorta" lowers compliance and raises characteristic impedance together (∝ √stiffness).
- Until Part B, the beat is a clock: atria contract 105 ms after the beat, ventricles 190 ms after.
- Measured at rest (default model): 126/81 mmHg (MAP 97), EDV 118 mL, ESV 47 mL, SV 71 mL, EF 60 %,
  CO 5.3 L/min, PA 28/9, LA 6, RA 3 mmHg, systole ≈ 300 ms, atrial kick ≈ 11 % of EDV,
  70 % of blood volume in systemic veins.
