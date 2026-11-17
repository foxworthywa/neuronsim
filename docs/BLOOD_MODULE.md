# BLOOD_MODULE.md — the white blood cell differential

**Status:** first draft, built in one sitting for the blood lab (Nov 2026); not yet reviewed by the
instructor. `blood/` (engine, app, views, lesson), published as `blood.html`;
`tests/blood.test.js` (22 tests of the biology) and `npm run test:blood` (performs every step in
Chromium); Canvas text in `assignments/blood.md`.

A short pre-lab (about 20 minutes, five scenes, 21 steps) done at the start of the wet lab in
which students stain a smear of their own blood, count 100 white cells and interpret the count
against a questionnaire about allergies and recent infections. It follows `PEDAGOGY.md`. **It
comes before ImmuneSim in the course and stands on its own**; it introduces the cells ImmuneSim
later follows in depth, and deliberately does not say how lymphocytes come to fit a pathogen
(ImmuneSim scene 5 asks students to work that out).

## What the lab handout asks, and what students lack

The handout lists associations (neutrophils and bacterial infection, lymphocytes and viruses,
eosinophils and allergy or parasites) and then asks four things of the student's own count: was it
accurate, is anything outside the reference range, could the questionnaire explain it, and what
would improve the technique. Students can look the associations up. What they do not have is a
reason for them, or any sense of how far a count of 100 cells strays by chance.

## The mental model: three claims

1. **Blood is the road, not the workplace.** White cells work in the tissues. The ones on a smear
   are in transit, so a differential is a traffic count.
2. **Five cells, five jobs.** Each kind answers a different problem, which is why each is called
   by a different condition.
3. **The count is a balance, read from a sample.** More of the called cell is released, so its
   number rises and every other *percentage* falls; and 100 cells is a small sample, so the rare
   cells in particular stray widely with nothing wrong.

Those three give the student three questions to ask of their own count (the last screen lists
them): which cell is high and what calls it; is it a number or only a share; could it be chance.

## Scenes

| # | Scene | View | Student does | Done when |
|---|-------|------|--------------|-----------|
| 1 | A drop of blood | a smear at low power; then the five white cells at high power | clicks every cell with a nucleus (3 to 5 among a few thousand red cells); guesses where white cells work; matches the handout's five descriptions to five unlabelled cells | all found; all five matched |
| 2 | Five cells, five jobs | tissue beside a small vessel, with one problem in it | **decides which white cell leaves the blood**, for five problems in turn: bacteria in a cut (and one other cell, to compare), the dead neutrophils left behind, a parasitic larva too big to swallow, pollen in an allergic person, a virus inside cells. Two questions (why neutrophils win: numbers; what causes hay fever: the person's own histamine). Then matches cell to job | the cell that works is found for each; table complete |
| 3 | Why the count changes | marrow reserve → blood → tissues, with a lab report beside it | watches turnover; predicts and runs a bacterial infection; reads lymphocytes falling as a percentage while unchanged as a number; predicts and runs hay fever and a virus; explains why neutrophils rise in hours and the others in days | three conditions run |
| 4 | Counting 100 cells | one cell at a time under oil, with the handout's own table filling in | names 20 cells of a healthy person's slide, then lets the simulation count the other 80; predicts whether a second count will match; counts again; has twenty classmates count the same slide | 100 counted; at least 21 counts plotted |
| 5 | Whose slide is it? | four analyzer reports | matches four questionnaires (healthy, hay fever, mononucleosis, an infected tooth) to four reports | all matched; names typed for the completion code |

Names: the five cells are named in scene 1, because the handout students have in front of them
already names them. What each one *does* is found by experiment in scene 2.

## Misconceptions targeted

| Misconception | Scene | What the model shows instead |
|---|---|---|
| White cells work in the blood | 1, 2, 3 | Every job is done in the tissue; a neutrophil is in the blood for hours |
| "White blood cells fight infection" (one cell, one job) | 2 | Each problem is solved by one kind and not by the other four |
| The biggest eater should win against bacteria | 2 | Neutrophils win on numbers: nine for each monocyte, arriving in the first hours |
| Allergy symptoms are caused by the pollen | 2 | Pollen with four of the five cells does nothing; with basophils the vessel leaks |
| A low percentage means the body has lost that cell | 3 | Lymphocytes go from 36 % to 17 % with the same number per µL |
| All counts respond at the same speed | 3 | Neutrophils triple in a day from the reserve; eosinophils and lymphocytes take days |
| A careful count is an exact count | 4 | Twenty-one error-free counts of one slide: neutrophils 46 to 65, eosinophils 0 to 6 |
| A value outside the reference range means something is wrong | 4 | About half of the counts of a healthy slide have at least one flag |

## The model (`blood/engine.js`)

Semi-quantitative, equations invisible. Time in hours. Three parts:

- **`Blood`**: five pools, cells per µL. Each is a balance of release from a reserve and exit to
  the tissues after a mean time in the blood (neutrophils 10 h, so half are gone in about 7 h;
  monocytes 30 h; eosinophils 24 h; basophils 48 h; lymphocytes 24 h, standing in for their
  recirculation). A condition calls one cell, which raises its release and its exit and, after a
  lag, its production. Only neutrophils have a large reserve (15 times the number in the blood),
  which is why only they can rise within hours. Conditions: `bacterial` (resolves in six days),
  `allergy` and `parasite` (last while exposed; eosinophils), `viral` (lymphocytes from the nodes,
  peaking about day 12).
- **`Bench`**: one problem and one cell type called out of the blood, arriving in proportion to
  that cell's blood count. Bacteria use ImmuneSim's rule (growth against second-order killing,
  with a critical number of neutrophils), so the two modules agree.
- **A count is a sample**: `differential(n)` draws n cells from the blood; `binomAtLeast` and
  `binomRange` give the chance figures quoted in scene 4.

Healthy values: 7,000 white cells per µL: neutrophils 55 %, lymphocytes 36 %, monocytes 6 %,
eosinophils 2.5 %, basophils 0.5 %. Reference ranges are **the ones printed on the lab handout**
(40–60, 20–40, 2–8, 0–4, 0–1 %; El Brihi and Pathak, StatPearls, 2024).

**Measured with the model:** bacterial infection, day 2: neutrophils 3,850 → 11,500 per µL (55 →
78 %), lymphocytes 2,520 → 2,520 (36 → 17 %), white cells 14,600, marrow reserve down by half.
Hay fever, three weeks: eosinophils 180 → 540 per µL (2.5 → 7.3 %), out of range from day 3.
Mononucleosis, two weeks: lymphocytes 2,520 → 7,490 (36 → 63 %). Bench: neutrophils clear 100
thousand bacteria in 13 h (monocytes alone: 21 million at 24 h); macrophages clear 20,000 dead
cells in 39 h; eosinophils kill the larva in 44 h; basophils cause swelling within 2 h;
lymphocytes clear the virus on day 7. A 100-cell count of the healthy slide: 5 or more
eosinophils about 1 count in 9; at least one flagged value in about half of counts.

## Decisions made without the instructor (please check)

1. **Length and scope:** 20 minutes; the tonicity experiment in the same handout is not covered.
2. **Scene 4 was not asked for.** The request was a sim on what the cells do. Sampling error was
   added because the handout's first and last questions (accuracy, technique) turn on it.
3. **Left out of the model:** the fall in eosinophils and lymphocytes with stress and steroids,
   band forms and the left shift, reactive lymphocytes, the marginated pool, leukemias. The
   handout mentions several of these; the sim does not contradict them.
4. **Simplifications to confirm against McKinley:** eosinophils "kill" a helminth larva alone
   (in the body, antibody marks it first); basophils stand for basophils and mast cells; the
   antibody on a basophil is not named as IgE; monocytes are given the clean-up role, though
   macrophages also kill bacteria and present antigen.
5. **Values written from memory of standard texts**, not looked up: times in the blood, the size
   of the marrow reserve, the time courses of each condition. They are in the usual textbook
   range; check them against the edition in use before quoting them elsewhere.
6. **The slide in scene 4 is chosen** so that its first 20 cells include at least four of the
   five kinds (otherwise most groups would name only neutrophils and lymphocytes). The field in
   scene 1 is likewise one that holds 3 to 5 white cells.
7. **Graded work:** no separate handout. The lab's own handout (a Google Doc) opens with a page
   for the simulation, "Part 1. Before your smear: BloodSim", with one box per scene and a place
   for the completion code; `assignments/blood.md` lists what it asks.

## Files

`blood/engine.js` (the model), `blood/app.js` (state, clock, canvas, lab-report HTML),
`blood/views.js` (cells painted as after Wright's stain, to scale with a red cell; views `field`,
`lineup`, `bench`, `flow`, `scope`, `reports`), `blood/lesson.js` (the five scenes, results,
completion code `BL-…`, saved progress). `?seed=7` fixes the slide; instructors check a code at
`blood.html#verify`.
