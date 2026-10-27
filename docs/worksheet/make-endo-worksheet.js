// Builds the group worksheet that accompanies endo.html, EndoSim Part A
// (docs/worksheet/EndoSim-partA-worksheet.docx). One sheet per group. Three parts: before the sim
// (draw the axis, reason about where receptors are), during (boxes keyed to the sim's scene
// numbers, predictions written before each run), after (Maria's three questions, Daniel, and a
// transfer question), 40 points in all. TALK FIRST items require every person to answer aloud
// before anyone writes. The answer key and grading rubric are kept outside this public repository.
// Usage: node docs/worksheet/make-endo-worksheet.js   (then convert to PDF with LibreOffice:
//        soffice --headless --convert-to pdf --outdir docs/worksheet docs/worksheet/EndoSim-partA-worksheet.docx)
'use strict';
const fs = require('fs'), path = require('path');
function loadDocx() { try { return require('docx'); } catch (e) { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'docx')); } }
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, HeightRule, VerticalAlign } = loadDocx();

const FONT = 'Calibri', SIZE = 20;            // 10 pt
const GREY = '8a8a8a', LINE = 'b0b0b0', INK = '1f2430', ACCENT = '7b3f99', TALK = '7a4a00';
const IN = 1440, LETTER = { width: 12240, height: 15840 }, MARGIN = 0.5 * IN;
const TEXT_W = LETTER.width - 2 * MARGIN;   // 10800 DXA

const run = (text, o) => new TextRun(Object.assign({ text, font: FONT, size: SIZE, color: INK }, o || {}));
const p = (children, o) => new Paragraph(Object.assign({ spacing: { after: 40, line: 252 } }, o || {}, { children: Array.isArray(children) ? children : [children] }));
const text = (t, o) => p(run(t, o));
const spacer = (after) => new Paragraph({ spacing: { after: after || 40 }, children: [run('')] });
const TALK_TAG = () => run('TALK FIRST  ', { bold: true, size: 17, color: TALK, shading: { type: ShadingType.CLEAR, fill: 'fff1dc' } });
const pts = (n) => run(`  (${n} point${n === 1 ? '' : 's'})`, { color: GREY, size: 18 });

const part = (label, note) => new Paragraph({
  spacing: { before: 200, after: 60 }, keepNext: true,
  shading: { type: ShadingType.CLEAR, fill: 'f1e9f6' },
  children: [run(`  ${label}`, { bold: true, size: 22, color: '4f2465' }), run(note ? `   ${note}` : '', { color: '4a5468', size: 19 })],
});
const scene = (n, title, step, points) => new Paragraph({
  spacing: { before: 130, after: 40 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 2 } },
  children: [
    run(` ${n} `, { bold: true, color: 'ffffff', shading: { type: ShadingType.CLEAR, fill: ACCENT } }),
    run(`  ${title}`, { bold: true, size: 23 }),
    step ? run(`   ·   on screen: “${step}”`, { color: GREY, italics: true }) : run(''),
    points ? pts(points) : run(''),
  ],
});
const q = (t, talk, points) => p([].concat(talk ? [TALK_TAG()] : [], [run(t)], points ? [pts(points)] : []), { keepNext: true });
const lines = (n) => Array.from({ length: n }, () => new Paragraph({
  spacing: { before: 80, after: 0 }, children: [run('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 1 } },
}));
const b = () => ({ style: BorderStyle.SINGLE, size: 4, color: LINE });
const cell = (content, w, o) => new TableCell(Object.assign({
  width: { size: w, type: WidthType.DXA }, margins: { top: 30, bottom: 30, left: 90, right: 90 },
  borders: { top: b(), bottom: b(), left: b(), right: b() },
  children: (Array.isArray(content) ? content : [content]).map(c => typeof c === 'string' ? text(c, { size: 20, spacing: { after: 0, line: 240 } }) : c),
}, o || {}));
const head = (t, w) => cell(text(t, { bold: true, size: 19, color: '444444' }), w, { shading: { type: ShadingType.CLEAR, fill: 'f1efe8' } });
const table = (widths, rows, noHead) => new Table({
  width: { size: widths.reduce((a, x) => a + x, 0), type: WidthType.DXA }, columnWidths: widths,
  rows: rows.map(r => new TableRow({ children: r.map((c, i) => typeof c === 'string' && r === rows[0] && !noHead ? head(c, widths[i]) : cell(c, widths[i])) })),
});
const blankRow = (widths, first) => [first].concat(widths.slice(1).map(() => ''));
const box = (height, label) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
  rows: [new TableRow({ height: { value: height, rule: HeightRule.ATLEAST }, children: [new TableCell({
    width: { size: TEXT_W, type: WidthType.DXA }, borders: { top: b(), bottom: b(), left: b(), right: b() }, margins: { top: 60, left: 120 },
    verticalAlign: VerticalAlign.TOP, children: [text(label || '', { color: GREY, size: 17, italics: true })],
  })] })],
});

const student = [
  new Paragraph({ spacing: { after: 20 }, children: [run('EndoSim Part A: hormones and feedback', { bold: true, size: 32 })] }),
  p([run('Group worksheet · 40 points', { color: GREY, size: 22 }), run('     foxworthywa.github.io/neuronsim/endo.html', { color: ACCENT, size: 20 })]),
  spacer(40),
  p([run('Names: ', { bold: true }), run('______________________________________________________________________________')]),
  spacer(30),
  table([TEXT_W], [[[
    p([run('The idea in one line: ', { bold: true, size: 20 }), run('a gland’s hormone travels to every cell, acts only where there is a receptor, and holds back the glands that told it to work. Read the levels above and below a problem, and you can find the broken link.', { size: 20 })]),
    p([run('How to use this sheet. ', { bold: true, size: 20 }), run('Part A before you open the sim. In Part B the numbers match the circles across the top of the sim: when a box names a scene, stop there and answer together. Write predictions BEFORE you press the run button. ', { size: 20 }), TALK_TAG(), run('means every person says their answer out loud before anyone writes: disagree first, then write what you agreed. Part C is answered after the sim, in full sentences, using your own numbers. One sheet per group.', { size: 20 })]),
  ]]]),

  part('A · Before you open the sim', 'from the textbook or lecture, and what you already know (4 points)'),
  q('Draw the thyroid axis: boxes for the hypothalamus, the anterior pituitary, the thyroid and the body’s cells. Name the hormone on each arrow. Then draw the feedback arrow(s) from thyroid hormone, marked with a “−”, to wherever you think they go.', false, 2),
  box(3300, 'your diagram'),
  q('TSH is a protein (water-soluble). T4 is made from the amino acid tyrosine plus iodine, and is fat-soluble. Predict, for each hormone: is its receptor on the cell surface or inside the cell? Which would you expect to last longer in the blood? Why?', true, 2),
  ...lines(3),

  part('B · Working through the sim', 'keyed to the scene numbers (14 points)'),

  scene(1, 'Where are the glands?', 'Endocrine glands · From brain to blood', 1),
  q('The hypothalamus is ____________ tissue; the pituitary hangs below it on a ____________. In one sentence: how does TSH get from the pituitary to the thyroid in the neck?'),
  ...lines(1),

  scene(2, 'A message for every cell', 'How to read this picture · Which cells respond?', 1),
  q('TSH reached ______ of the four cells. ______ of them responded. What decides whether a cell responds to a hormone? Half-life of TSH ________; of T4 ________.'),
  ...lines(1),

  scene(3, 'You are the pituitary', 'Learn the controls · Keep free T4 in range · Build the loop', 2),
  q('Practice (no medicine): after you raised TSH, about how many days did free T4 take to level off? ______'),
  q('With the medicine (days 8–22): our best time in range ______ %;  the automatic pituitary ______ %.'),
  q('What made it hard for you? Then write the feedback loop from the sim in your own words, starting with “the medicine makes T4 break down faster”.', true),
  ...lines(3),

  scene(4, 'Pull the levers', 'Experiments 1–3', 3),
  q('Before each run, write your group’s prediction (↑, ↓ or –). After the run, write what happened. Circle any prediction that was wrong.'),
  table([3300, 1250, 1250, 1250, 1250, 1250, 1250], [
    ['Experiment', 'TRH predicted', 'TRH observed', 'TSH predicted', 'TSH observed', 'Free T4 predicted', 'Free T4 observed'],
    blankRow([3300, 1250, 1250, 1250, 1250, 1250, 1250], '1. Thyroid removed'),
    blankRow([3300, 1250, 1250, 1250, 1250, 1250, 1250], '2. T4 tablets, healthy person'),
    blankRow([3300, 1250, 1250, 1250, 1250, 1250, 1250], '3. Pituitary blocked'),
  ]),
  q('Our rule, in our own words: when one level of the chain fails, the hormone it makes ________, and the hormone above it ________, because ____________________________________________.'),
  ...lines(1),

  scene(5, 'Glands grow on command', 'No iodine · T4 tablets for 6 months · Maria starts levothyroxine', 2),
  q('Iodine-poor diet, 6 months: thyroid ______ → ______ g;  TSH ______ mIU/L;  free T4 ______ ng/dL.'),
  q('T4 tablets, 6 months: thyroid ______ → ______ g;  the thyroid’s own T4 output ______ → ______ µg/day.'),
  q('Maria on levothyroxine:  TSH at start ______, week 1 ______, week 6 ______ mIU/L;  free T4 at start ______, week 1 ______ ng/dL.'),
  q('In one sentence, using the word trophic: why did the thyroid grow in one experiment and shrink in the other?', true),
  ...lines(1),

  scene(6, 'A second axis, a daily rhythm', 'When was the blood drawn? · Stress', 2),
  q('Cortisol at 8 am ______ µg/dL;  at midnight ______ µg/dL.  With 6 hours of stress, cortisol at 6 pm ______ (without stress ______).'),
  q('A nurse draws blood for cortisol at 9 pm and the result is 4 µg/dL. Is that low? What would you want to know before deciding?', true),
  ...lines(1),

  scene(7, 'The steroid taper', 'Eight weeks of prednisone · Daniel stops all at once · A taper', 2),
  q('Adrenal size at the start ______ g; after 8 weeks of prednisone ______ g.'),
  q('Stopped abruptly: lowest daily cortisol effect ______ µg/dL, ______ crisis days.   Tapered: lowest ______ µg/dL, ______ crisis days.'),

  scene(8, 'Tests that push the loop', 'A suppression test · A stimulation test · Patients 1 and 2', 1),
  table([2200, 1500, 1500, 2600, 3000], [
    ['Person', '8 am cortisol', '8 am ACTH', 'Test and result', 'Where is the problem?'],
    ['Healthy', '', '', 'Dexamethasone 1 mg → 8 am cortisol ______', 'none'],
    ['Healthy', '', '', 'Cosyntropin → ______ to ______ µg/dL', 'none'],
    blankRow([2200, 1500, 1500, 2600, 3000], 'Patient 1, Ms. Rivera'),
    blankRow([2200, 1500, 1500, 2600, 3000], 'Patient 2, Mr. Tran'),
  ]),
  q('Paste the results text from the last screen of the sim on the back of this sheet (or attach it), and write your completion code here:  ____________________'),

  part('C · After the sim', 'full sentences, your own numbers; explain why, not just what (18 points)'),
  q('1. Maria’s TSH. Maria’s thyroid is failing, so why is her TSH high? Use the term negative feedback. Then predict what her TSH and free T4 would have been if the problem had been in her pituitary instead, and explain why.', false, 4),
  ...lines(5),
  q('2. Why six weeks? Using your week-1 and week-6 numbers for Maria, explain why her doctor rechecks TSH after six weeks rather than one. Include the half-life of T4 and what happened to TSH. What could go wrong if the dose were changed at week 1?', false, 4),
  ...lines(5),
  q('3. Maria’s sister. Her sister wants to take thyroid pills to lose weight. Predict what would happen to her sister’s TSH, her thyroid’s own T4 output and the size of her thyroid. What might happen if she then stopped suddenly? Use your scene 4 and 5 results, and what you saw with Daniel.', true, 3),
  ...lines(4),
  q('4. Daniel’s crisis. Explain, as a chain of at least four causes and effects, why stopping prednisone suddenly made Daniel ill. Then explain why the taper prevented it, using your numbers. Finish with one thing a nurse should teach a patient starting a long course of prednisone.', false, 4),
  ...lines(6),
  q('5. Transfer: Graves’ disease. In Graves’ disease the immune system makes an antibody that switches on the TSH receptor, like TSH does, but nothing holds it back. Predict this patient’s TSH, free T4 and thyroid size, and explain why TSH is low even though the thyroid is overactive. A radioactive iodine uptake scan measures how hard the thyroid is working. How would it tell Graves’ disease apart from someone secretly taking thyroid pills?', true, 3),
  ...lines(5),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: SIZE, color: INK } } } },
  sections: [{ properties: { page: { size: LETTER, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children: student }],
});
const out = path.join(__dirname, 'EndoSim-partA-worksheet.docx');
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(out, buf); console.log('wrote', out, (buf.length / 1024).toFixed(0), 'KB'); });
