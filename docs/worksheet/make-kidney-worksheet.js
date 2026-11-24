// Builds the handout that accompanies kidney.html, KidneySim, in two clearly labelled versions with
// the same questions, numbering and points (50: A 4, B 16 + 2, C 28):
//   KidneySim-handout.docx        PRINT version: four pages, lines and boxes to write and draw in.
//   KidneySim-handout-typed.docx  TYPE-IN version: yellow spaces to type in and answer boxes that
//                                 grow; made to be uploaded to Google Drive as a Google Doc. Its two
//                                 drawing places carry a note for the instructor, who inserts an
//                                 empty drawing there (Insert > Drawing > New) before sharing it.
// Both come from the one list of questions below, so they cannot drift apart. Three parts: before
// the sim (draw what you think happens; a prediction), during (boxes keyed to the sim's scene
// numbers, predictions written before each run, and a table of plain words and their terms), after
// (the five problems the lab is built around, set on the patients and answered with the student's
// own numbers, and the first drawing redrawn). TALK FIRST items require every person to answer
// aloud before anyone writes. The answer key and grading rubric are kept outside this public
// repository.
// Usage: node docs/worksheet/make-kidney-worksheet.js   (then convert the print version to PDF:
//        soffice --headless --convert-to pdf --outdir docs/worksheet docs/worksheet/KidneySim-handout.docx)
'use strict';
const fs = require('fs'), path = require('path');
function loadDocx() { try { return require('docx'); } catch (e) { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'docx')); } }
const D = loadDocx();
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, HeightRule, VerticalAlign } = D;

const FONT = 'Calibri', SIZE = 20;            // 10 pt
const GREY = '8a8a8a', LINE = 'b0b0b0', INK = '1f2430', ACCENT = '9c4a3c', TALK = '7a4a00';
const IN = 1440, LETTER = { width: 12240, height: 15840 }, MARGIN = 0.5 * IN;
const TEXT_W = LETTER.width - 2 * MARGIN;   // 10800 DXA

let TYPE = false;      // true while the type-in version is being built
const v = (print, typed) => (TYPE ? typed : print);
const run = (text, o) => new TextRun(Object.assign({ text, font: FONT, size: SIZE, color: INK }, o || {}));
const p = (children, o) => new Paragraph(Object.assign({ spacing: { after: 40, line: 252 } }, o || {}, { children: Array.isArray(children) ? children : [children] }));
const text = (t, o) => p(run(t, o));
const spacer = (after) => new Paragraph({ spacing: { after: after || 40 }, children: [run('')] });
const TALK_TAG = () => run('TALK FIRST  ', { bold: true, size: 17, color: TALK, shading: { type: ShadingType.CLEAR, fill: 'fff1dc' } });
const pts = (n) => run(`  (${n} point${n === 1 ? '' : 's'})`, { color: GREY, size: 18 });

const part = (label, note) => new Paragraph({
  spacing: { before: 200, after: 60 }, keepNext: true,
  shading: { type: ShadingType.CLEAR, fill: 'f6e7e3' },
  children: [run(`  ${label}`, { bold: true, size: 22, color: '7a3226' }), run(note ? `   ${note}` : '', { color: '4a5468', size: 19 })],
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
// In the type-in version every blank (a run of underscores) becomes a yellow space to type in. The
// brackets keep it visible where it falls at the end of a line, and show where to click.
const BLANK = (n) => run('[' + '\u00a0'.repeat(n || 10) + ']', { highlight: 'yellow' });
function rich(t, o) {
  if (!TYPE) return [run(t, o)];
  const parts = t.split(/_{3,}/), out = [];
  parts.forEach((part, i) => { if (part) out.push(run(part, o)); if (i < parts.length - 1) out.push(BLANK()); });
  return out;
}
const q = (t, talk, points) => p([].concat(talk ? [TALK_TAG()] : [], rich(t), points ? [pts(points)] : []), { keepNext: true });
// Space for a written answer: ruled lines to write on, or (type-in) a pale yellow box that grows.
const answerBox = (n) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
  rows: [new TableRow({ height: { value: 250 * n + 150, rule: HeightRule.ATLEAST }, children: [new TableCell({
    width: { size: TEXT_W, type: WidthType.DXA }, borders: { top: b(), bottom: b(), left: b(), right: b() }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: { type: ShadingType.CLEAR, fill: 'fffbe0' }, verticalAlign: VerticalAlign.TOP, children: [text('')],
  })] })],
});
const lines = (n) => (TYPE ? [answerBox(n), spacer(60)] : ruled(n));
const ruled = (n) => Array.from({ length: n }, () => new Paragraph({
  spacing: { before: 60, after: 0 }, children: [run('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 1 } },
}));
const b = () => ({ style: BorderStyle.SINGLE, size: 4, color: LINE });
const cell = (content, w, o) => new TableCell(Object.assign({
  width: { size: w, type: WidthType.DXA }, margins: { top: 30, bottom: 30, left: 90, right: 90 },
  shading: TYPE && content === '' ? { type: ShadingType.CLEAR, fill: 'fffbe0' } : undefined,
  borders: { top: b(), bottom: b(), left: b(), right: b() },
  children: (Array.isArray(content) ? content : [content]).map(c => typeof c === 'string' ? text(c, { size: 20, spacing: { after: 0, line: 240 } }) : c),
}, o || {}));
const head = (t, w) => cell(text(t, { bold: true, size: 19, color: '444444' }), w, { shading: { type: ShadingType.CLEAR, fill: 'f1efe8' } });
const table = (widths, rows, noHead) => new Table({
  width: { size: widths.reduce((a, x) => a + x, 0), type: WidthType.DXA }, columnWidths: widths,
  rows: rows.map(r => new TableRow({ children: r.map((c, i) => typeof c === 'string' && r === rows[0] && !noHead ? head(c, widths[i]) : cell(c, widths[i])) })),
});
const blankRow = (widths, first) => [first].concat(widths.slice(1).map(() => ''));
// A place to draw. Print: an empty box. Type-in: instructions for the student, and a note telling
// the instructor to insert an empty drawing there before sharing the document.
const box = (height, label, setup) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
  rows: [new TableRow({ height: { value: TYPE ? 1500 : height, rule: HeightRule.ATLEAST }, children: [new TableCell({
    width: { size: TEXT_W, type: WidthType.DXA }, borders: { top: b(), bottom: b(), left: b(), right: b() }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: TYPE ? { type: ShadingType.CLEAR, fill: 'fffbe0' } : undefined,
    verticalAlign: VerticalAlign.TOP,
    children: !TYPE ? [text(label || '', { color: GREY, size: 17, italics: true })] : [
      p([run('To draw here, either: ', { bold: true }), run('double-click the drawing below and use the shapes, arrows, text boxes and the “scribble” line; '), run('or ', { bold: true }), run('draw on paper, take a photo, and put it here with Insert → Image. Either way is fine.')]),
      p([run(`INSTRUCTOR, BEFORE SHARING: click on this line, choose Insert → Drawing → New, ${setup}, press “Save and close”, then delete this red note.`, { bold: true, color: 'b0352b' })]),
    ],
  })] })],
});

const W2 = [5400, 5400], W4 = [3000, 2600, 2600, 2600], W5 = [2400, 2100, 2100, 2100, 2100];
const TERMS = [
  ['2', 'keeping the body’s fluid steady'], ['2', 'removal in the urine'],
  ['3', 'blood in · blood out · urine out'], ['3', 'urine store · its exit tube'], ['3', 'outer part · inner part · hollow'], ['3', 'one filter with its tubule'],
  ['5', 'the filter (capillaries in a cup)'], ['5', 'what comes through the filter'], ['5', 'how fast the kidneys filter'], ['5', 'arteriole into · out of the filter'], ['5', 'holding filtering steady'],
  ['6', 'taking back'], ['6', 'the first stretch of the tubule'], ['6', 'the return line'],
  ['7', 'pushing extra in'], ['7', 'waste that measures filtering'],
  ['8', 'protein · blood · glucose in urine'], ['8', 'the most a carrier can take back'], ['8', 'a large volume of urine'], ['8', 'drug that increases urine volume'],
  ['9', 'the hormone for water'], ['9', 'hormone for salt (and potassium)'], ['9', 'the last stretch of the tubule'], ['9', 'the hairpin between them'],
  ['10', 'the machine'], ['10', 'long-term loss of nephrons'],
];
const termRows = () => { const half = Math.ceil(TERMS.length / 2), rows = [['#', 'Plain words in the sim', 'The term', '#', 'Plain words in the sim', 'The term']]; for (let i = 0; i < half; i++) { const a = TERMS[i], b = TERMS[i + half] || ['', '']; rows.push([a[0], a[1], '', b[0], b[1], '']); } return rows; };
const WT = [460, 2900, 2040, 460, 2900, 2040];

const sheet = () => [
  new Paragraph({ spacing: { after: 20 }, children: [run('KidneySim: the kidney', { bold: true, size: 32 })] }),
  p([run(v('Lab handout · PRINT version · 50 points', 'Lab handout · TYPE-IN version · 50 points'), { color: GREY, size: 22 }), run('     ', { size: 20 }), new D.ExternalHyperlink({ link: 'https://foxworthywa.github.io/neuronsim/kidney.html', children: [run('foxworthywa.github.io/neuronsim/kidney.html', { color: ACCENT, size: 20 })] })]),
  spacer(40),
  p([run('Name(s): ', { bold: true })].concat(TYPE ? [BLANK(70)] : [run('____________________________________________________________________________')])),
  spacer(30),
  table([TEXT_W], [[[
    p([run('The idea in one line: ', { bold: true, size: 20 }), run('the kidneys are the body’s adjustable exit. They push everything small out of the blood through a filter, take back what must be kept, and let the rest go. The urine changes from hour to hour so that the blood does not.', { size: 20 })]),
    TYPE
      ? p([run('How to use this document. ', { bold: true, size: 20 }), run('First make your own copy (File → Make a copy) if you were not given one. Type between the yellow brackets [   ] and in the pale yellow boxes; they grow as you type. Where there is a choice, delete the choices that do not apply. Do Part A before you open the sim. In Part B the numbers match the circles across the top of the sim: when a box names a scene, stop there and fill it in. Write predictions BEFORE you press the run button. The sim explains each thing in plain words and then names it: copy each name into the table of terms as it appears (the Terms button in the sim lists them all). ', { size: 20 }), TALK_TAG(), run('means every person says their answer out loud before anyone types. Working alone? Type your own first answer before you run the experiment, then add what changed. Part C is answered after the sim, in full sentences, using your own numbers. The sim takes about an hour. You can return to any scene with the numbered circles. There is also a print version of this handout with the same questions.', { size: 20 })])
      : p([run('How to use this sheet. ', { bold: true, size: 20 }), run('Part A before you open the sim. In Part B the numbers match the circles across the top of the sim: when a box names a scene, stop there and fill it in. Write predictions BEFORE you press the run button. The sim explains each thing in plain words and then names it: copy each name into the table of terms as it appears (the Terms button in the sim lists them). ', { size: 20 }), TALK_TAG(), run('means every person says their answer out loud before anyone writes. Working alone? Write your own first answer before you run the experiment, then add what changed. Part C is answered after the sim, in full sentences, using your own numbers. The sim takes about an hour. You can return to any scene with the numbered circles. There is also a type-in version of this handout (a Google Doc) with the same questions.', { size: 20 })]),
  ]]]),

  part('A · Before you open the sim', 'what you think now; there are no wrong answers here (4 points)'),
  q('You drink a litre of water and eat a bag of salted chips. Draw what you think happens between your mouth and the toilet, and say what your kidneys did. Label anything you know.', false, 2),
  box(1700, 'your drawing', 'draw one large empty rectangle (about the width of the page and a third of its height)'),
  q('A person whose kidneys have stopped working is kept alive by a dialysis machine, three times a week. What do you think the machine has to do?', true, 2),
  ...lines(2),

  part('B · Working through the sim', 'keyed to the scene numbers (16 points, plus 2 for your results and completion code)'),

  scene(1, 'Two days without kidneys', 'Monday noon to Wednesday morning', 1),
  q(v('Our prediction (circle one):   all three will rise   /   only urea will rise   /   nothing much will change', 'Our prediction (keep one, delete the others):   all three will rise   /   only urea will rise   /   nothing much will change')),
  q('Mr. Herrera, Monday noon → Wednesday 8 am:   weight 82.0 → ________ kg     potassium 4.0 → ________ mmol/L     urea (BUN) 25 → ________ mg/dL'),
  q('In those 44 hours he took in ________ L of water and ________ g of salt. Was any of it unusual?  yes / no'),

  scene(2, 'You are the exit', 'Hold her steady for a day · Read your own day', 2),
  q('By hand: water and salt both in range ________ % of the day. We let out ________ L of urine carrying ________ g of salt.'),
  q('Which line on the graph had to swing so that the other two could stay nearly flat? What does that tell you the urine is for?', true),
  ...lines(2),
  q('Sweat removes water and salt too. Why can it not do the kidneys’ job?'),
  ...lines(1),

  scene(3, 'Where it happens', 'Three pipes · How much blood? · Inside a kidney · One nephron', 1),
  q('Blood reaches each kidney by the ______________ and leaves by the ______________. Urine leaves by the ______________ and is stored in the ______________. Share of the heart’s output that goes through the kidneys: about ____________.'),

  scene(4, 'Design the exit', 'Something new arrives · Design 2: throw everything out · Take back what you want to keep', 2),
  table(W4, [
    ['After two days', 'The new drug in her body', 'Wastes (urea, potassium, acid)', 'Water, salt and glucose'],
    blankRow(W4, 'Design 1: a pump for each waste'),
    ['Design 2: filter only', 'stopped after ________ minutes', '', ''],
    blankRow(W4, 'Design 2: filter, then take back'),
  ]),
  q('Design 2 with take-back, two days: filtered ________ L, taken back ________ L.'),
  q('Design 2 cleared a drug it had never met. Why did that work, when design 1 could not do it?', true),
  ...lines(2),

  scene(5, 'The filter', 'What gets through? · How much? · What pushes it through? · Holding it steady', 2),
  table([2600, 1500, 1500, 2600, 1300, 1300], [
    ['In her blood', 'Predicted', 'Observed', 'In her blood', 'Predicted', 'Observed'],
    ['red blood cell', '', '', 'urea', '', ''],
    ['blood protein (albumin)', '', '', 'salt', '', ''],
    ['glucose', '', '', 'water', '', ''],
  ]),
  q('(Write T for “gets through” or H for “held back”.)  The filter sorts by ______________ and nothing else.   Filtered: ________ mL a minute = ________ L a day.'),
  q('Arteriole fixed:  ________ mL/min at 80 mmHg;  ________ at 120.      Arteriole adjusting itself:  ________ mL/min at 60 mmHg;  ________ at 150.'),

  scene(6, 'Taking it back', 'If nothing came back · With the return on · How does it get back?', 1),
  q('Return switched off for 30 minutes: ________ L lost; blood pressure ________.   Return on: of every 125 mL filtered, ________ mL is left as urine.'),
  q('Water is not pumped. It follows ______________.   A volume equal to all her plasma is filtered about ________ times a day.'),

  scene(7, 'Four substances, three questions', 'A blood protein · Glucose · Creatinine · A drug · The sum', 2),
  table(W5, [
    ['Each day (with units)', '1 · Filtered', '2 · Taken back', '3 · Pushed in', 'Left in the urine'],
    blankRow(W5, 'water'),
    blankRow(W5, 'blood protein (albumin)'),
    blankRow(W5, 'glucose'),
    blankRow(W5, 'creatinine'),
    blankRow(W5, 'penicillin'),
  ]),
  q('In words: what is left in the urine = what is ______________ − what is ______________ + what is ______________.'),

  scene(8, 'Break a step, read the urine', 'Damage the filter · Too much to take back · A drug that blocks a salt carrier', 2),
  table([3600, 3600, 3600], [
    ['What was changed', 'What appeared or changed in the urine', 'Which step of the nephron is responsible'],
    blankRow([3600, 3600, 3600], 'The filter was damaged'),
    blankRow([3600, 3600, 3600], 'Blood glucose raised to 400 mg/dL (Sam)'),
    blankRow([3600, 3600, 3600], 'Glucose carriers blocked by a drug'),
    blankRow([3600, 3600, 3600], 'Salt carriers in the loop blocked (furosemide)'),
  ]),
  q('Highest blood glucose with a negative urine test: ________ mg/dL.     Mrs. Brooks, 8 hours after one tablet: ________ L of urine; weight ________ → ________ kg; filtering (GFR) ________ to ________ mL/min.'),

  scene(9, 'The adjustable part', 'The last few percent · Morning · Lunch · A run in the heat · A bleed · Four events', 2),
  q('If the last stretch took back 1 % less of the 180 L filtered, she would pass ________ L more urine a day.'),
  q(v('Write each prediction BEFORE you press Run. Circle any prediction that was wrong.', 'Type each prediction BEFORE you press Run. Put a * after any prediction that was wrong.')),
  table(W5, [
    ['Event (compare with her usual urine)', 'Urine volume: predicted', 'Urine volume: observed', 'Urine concentration', 'The kidney is…'],
    blankRow(W5, 'A big bottle of water'),
    blankRow(W5, 'A salty lunch'),
    blankRow(W5, 'An hour of sweating'),
    blankRow(W5, 'A heavy bleed'),
  ]),
  q('Her whole day: urine flow from ________ to ________ mL/min; concentration of her blood only from ________ to ________ mOsm/L.     Tom Bradley, 30 minutes after his bleed: BP ________; filtering ________ mL/min; urine ________ mL an hour.'),

  scene(10, 'Back to the patients', 'Wednesday, 8 am · Losing nephrons slowly · Four patients, four charts', 1),
  q('Dialysis session:  weight ________ → ________ kg;  potassium ________ → ________;  urea (BUN) ________ → ________.'),
  q('Creatinine:  normal filtering 0.9;   filtering halved ________;   halved again ________ mg/dL.        Charts:  A = ______________   B = ______________   C = ______________   D = ______________'),

  new Paragraph({ spacing: { before: 130, after: 40 }, keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 2 } }, children: [run('  Plain words and their terms', { bold: true, size: 23 }), run('   ·   fill in as the sim names each one', { color: GREY, italics: true }), pts(2)] }),
  table(WT, termRows()),
  spacer(40),
  ...(TYPE
    ? [q('Completion code:  ____________________     Paste the results text from the last screen of the sim in the box below.', false, 2), answerBox(6), spacer(60)]
    : [q('Paste the results text from the last screen of the sim on the back of this sheet (or attach it), and write your completion code here:  ____________________', false, 2)]),

  part('C · After the sim', 'full sentences, your own numbers; explain why, not just what (28 points)'),
  q('1. Mr. Herrera. (a) What does the dialysis machine do for him? (b) Why does the nurse weigh him before every session? (c) Why does his diet sheet limit fluids, salt, and foods such as bananas and potatoes, when a healthy person can eat and drink them freely? Use your numbers from scenes 1 and 10.', false, 5),
  ...lines(5),
  q('2. Intake changes. For each of these, say how the urine changes (its volume, its concentration, the salt in it) and why, naming the hormone involved: (a) a litre of water; (b) a salty meal; (c) a hot day’s sweating with nothing to drink. Then respond to this: “Drink more water, it makes your kidneys filter more.” Use your filtering (GFR) numbers from scene 9.', true, 5),
  ...lines(5),
  q('3. Urine findings. A test strip shows: (a) protein 3+; (b) glucose 4+, in a patient whose blood glucose is 400 mg/dL; (c) glucose 4+, in a patient whose blood glucose is 90 mg/dL. For each, which step of the nephron explains it (the filter, taking back, or pushing in), and does it mean the kidney is damaged?', false, 5),
  ...lines(4),
  q('4. A drug. Furosemide blocks carriers that take back salt. Starting from the rule “water follows salt”, explain what it does to urine volume, to body weight, and to the filtering rate. A classmate says diuretics “make the kidneys filter more”. Respond, using Mrs. Brooks’s numbers.', false, 4),
  ...lines(4),
  q('5. Failing kidneys. Mrs. Lin has a quarter of her filtering left and still passes a normal volume of urine. What builds up in her blood, and why? Why is blood creatinine the test used to follow her? Predict her creatinine if her filtering halves once more, and explain your reasoning.', false, 4),
  ...lines(4),
  q('6. Low blood pressure. After his bleed, Tom Bradley passed almost no urine. Explain why, starting from what pushes fluid through the filter. Why is hourly urine output charted in seriously ill patients?', true, 3),
  ...lines(3),
  q('7. Now redraw your Part A picture: a litre of water and a bag of salted chips, from mouth to toilet. Show the filter, what is taken back, and what is left. Under it, write one thing in your Part A drawing that you would now change.', false, 2),
  box(2300, 'your drawing', 'draw one large empty rectangle (about the width of the page and a third of its height)'),
  ...lines(2),
];

async function build(typed, file) {
  TYPE = typed;
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: SIZE, color: INK } } } },
    sections: [{ properties: { page: { size: LETTER, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children: sheet() }],
  });
  const out = path.join(__dirname, file), buf = await Packer.toBuffer(doc);
  fs.writeFileSync(out, buf);
  console.log('wrote', out, (buf.length / 1024).toFixed(0), 'KB');
}
build(false, 'KidneySim-handout.docx').then(() => build(true, 'KidneySim-handout-typed.docx'));
