// Builds the handout that accompanies immune.html, ImmuneSim, in two clearly labelled versions with
// the same questions, numbering and points (50: A 4, B 16 + 2, C 28):
//   ImmuneSim-handout.docx        PRINT version: eight pages (four sheets, both sides). Every place
//                                 a student writes is shaded yellow and sized for large handwriting:
//                                 tall blanks, open boxes for written answers, tall table rows.
//                                 Its page breaks are fixed, so no answer space is split.
//   ImmuneSim-handout-typed.docx  TYPE-IN version: yellow spaces to type in and answer boxes that
//                                 grow; made to be uploaded to Google Drive as a Google Doc. Its two
//                                 drawing places carry a note for the instructor, who inserts an
//                                 empty drawing there (Insert > Drawing > New) before sharing it.
// Both come from the one list of questions below, so they cannot drift apart. Three parts: before
// the sim (draw what you think happens; a prediction), during (boxes keyed to the sim's scene
// numbers, predictions written before each run), after (questions about the four patients,
// answered with the student's own numbers, and a redrawn timeline). TALK FIRST items require every
// person to answer aloud before anyone writes. The answer key and grading rubric are kept outside
// this public repository.
// Usage: node docs/worksheet/make-immune-worksheet.js   (then convert the print version to PDF:
//        soffice --headless --convert-to pdf --outdir docs/worksheet docs/worksheet/ImmuneSim-handout.docx)
'use strict';
const fs = require('fs'), path = require('path');
function loadDocx() { try { return require('docx'); } catch (e) { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'docx')); } }
const D = loadDocx();
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, HeightRule, VerticalAlign } = D;

const FONT = 'Calibri', SIZE = 20;            // 10 pt
const GREY = '8a8a8a', LINE = 'b0b0b0', INK = '1f2430', ACCENT = '12877f', TALK = '7a4a00';
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

// The print version sets its own page breaks (brk), so that it paginates the same way in Word,
// LibreOffice and Google Docs and no answer space is split across pages. The type-in version flows.
const part = (label, note, brk) => new Paragraph({
  spacing: { before: 200, after: 60 }, keepNext: true, pageBreakBefore: (!TYPE && !!brk) || undefined,
  shading: { type: ShadingType.CLEAR, fill: 'e3f3f1' },
  children: [run(`  ${label}`, { bold: true, size: 22, color: '0b5f59' }), run(note ? `   ${note}` : '', { color: '4a5468', size: 19 })],
});
const scene = (n, title, step, points, brk) => new Paragraph({
  spacing: { before: 130, after: 40 }, keepNext: true, pageBreakBefore: (!TYPE && !!brk) || undefined,
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
// In the print version every place a student writes is shaded yellow and sized for large
// handwriting. A blank is a run of 18 pt underscores, so it is a tall yellow space with a line to
// write on, at least 80 pt (1.1 in) wide and half as wide again as the blank in the source text.
// It also sets the height of its line of text, which gives sentences with blanks room to write in.
const FILL = 'fffbe0', FILL_INLINE = 'fff2a8';     // large areas; blanks and choices within a sentence
const WRITE = (len) => run('_'.repeat(Math.max(9, Math.ceil(len * 5 * 1.5 / 9))), { size: 36, color: '8a8a8a', shading: { type: ShadingType.CLEAR, fill: FILL_INLINE } });
// A choice to circle, written {{yes / no}} in the text: each option is its own yellow chip.
const CHOICE = (c) => c.split(' / ').reduce((out, opt, i) => out.concat(i ? [run(' / ')] : [], [run('\u00a0' + opt + '\u00a0', { size: 22, shading: { type: ShadingType.CLEAR, fill: FILL_INLINE } })]), []);
function rich(t, o) {
  const out = [];
  t.split(/(_{3,}|\{\{.*?\}\})/).forEach((part) => {
    if (!part) return;
    if (/^_{3,}$/.test(part)) out.push(TYPE ? BLANK() : WRITE(part.length));
    else if (part.startsWith('{{')) { const c = part.slice(2, -2); if (TYPE) out.push(run(c, o)); else out.push(...CHOICE(c)); }
    else out.push(run(part, o));
  });
  return out;
}
// A sentence with blanks is set with single line spacing in print: LibreOffice otherwise lets the
// tall yellow blanks cover the line above.
// END marks the last paragraph before a page break: it must not be kept with the next paragraph,
// or Google Docs carries it over and leaves it alone on a page of its own.
const q = (t, talk, points, brk, end) => p([].concat(talk ? [TALK_TAG()] : [], rich(t), points ? [pts(points)] : []), Object.assign({ keepNext: TYPE || !end || undefined, pageBreakBefore: (!TYPE && !!brk) || undefined }, !TYPE && /_{3,}/.test(t) ? { spacing: { after: 40 } } : {}));
// Space for a written answer. Print: one open pale yellow box with no ruled lines, so that students
// write at whatever size suits them; its height allows the given number of lines of large
// handwriting (about wide-ruled spacing). Type-in: a pale yellow box that grows.
const answerBox = (n) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
  rows: [new TableRow({ height: { value: 250 * n + 150, rule: HeightRule.ATLEAST }, children: [new TableCell({
    width: { size: TEXT_W, type: WidthType.DXA }, borders: { top: b(), bottom: b(), left: b(), right: b() }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: { type: ShadingType.CLEAR, fill: 'fffbe0' }, verticalAlign: VerticalAlign.TOP, children: [text('')],
  })] })],
});
const LINE_H = 490;      // 24.5 pt for each line of handwriting the space is sized for
const lines = (typed, print) => (TYPE ? [answerBox(typed), spacer(60)] : [openSpace(print), spacer(80)]);
const openSpace = (n) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
  rows: [new TableRow({ height: { value: LINE_H * n, rule: HeightRule.ATLEAST }, cantSplit: true, children: [new TableCell({
    width: { size: TEXT_W, type: WidthType.DXA }, borders: { top: b(), bottom: b(), left: b(), right: b() }, margins: { top: 0, bottom: 0, left: 120, right: 120 },
    shading: { type: ShadingType.CLEAR, fill: FILL }, verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ spacing: { after: 0 }, children: [run('', { size: 16 })] })],
  })] })],
});
const b = () => ({ style: BorderStyle.SINGLE, size: 4, color: LINE });
const cell = (content, w, o) => new TableCell(Object.assign({
  width: { size: w, type: WidthType.DXA }, margins: { top: 30, bottom: 30, left: 90, right: 90 },
  shading: content === '' ? { type: ShadingType.CLEAR, fill: 'fffbe0' } : undefined,
  verticalAlign: TYPE ? undefined : VerticalAlign.CENTER,
  borders: { top: b(), bottom: b(), left: b(), right: b() },
  children: (Array.isArray(content) ? content : [content]).map(c => typeof c === 'string' ? text(c, { size: 20, spacing: { after: 0, line: 240 } }) : c),
}, o || {}));
const head = (t, w) => cell(text(t, { bold: true, size: 19, color: '444444' }), w, { shading: { type: ShadingType.CLEAR, fill: 'f1efe8' } });
// In the print version a row with cells to write in is at least rowH tall (default 28 pt).
const table = (widths, rows, noHead, rowH) => new Table({
  width: { size: widths.reduce((a, x) => a + x, 0), type: WidthType.DXA }, columnWidths: widths,
  rows: rows.map(r => new TableRow({ height: !TYPE && r !== rows[0] && r.includes('') ? { value: rowH || 560, rule: HeightRule.ATLEAST } : undefined, children: r.map((c, i) => typeof c === 'string' && r === rows[0] && !noHead ? head(c, widths[i]) : cell(c, widths[i])) })),
});
const blankRow = (widths, first) => [first].concat(widths.slice(1).map(() => ''));
// A place to draw. Print: an empty box. Type-in: instructions for the student, and a note telling
// the instructor to insert an empty drawing there before sharing the document.
const box = (height, label, setup) => new Table({
  width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
  rows: [new TableRow({ height: { value: TYPE ? 1500 : height, rule: HeightRule.ATLEAST }, children: [new TableCell({
    width: { size: TEXT_W, type: WidthType.DXA }, borders: { top: b(), bottom: b(), left: b(), right: b() }, margins: { top: 60, bottom: 60, left: 120, right: 120 },
    shading: { type: ShadingType.CLEAR, fill: 'fffbe0' },
    verticalAlign: VerticalAlign.TOP,
    children: !TYPE ? [text(label || '', { color: GREY, size: 17, italics: true })] : [
      p([run('To draw here, either: ', { bold: true }), run('double-click the drawing below and use the shapes, arrows, text boxes and the “scribble” line; '), run('or ', { bold: true }), run('draw on paper, take a photo, and put it here with Insert → Image. Either way is fine.')]),
      p([run(`INSTRUCTOR, BEFORE SHARING: click on this line, choose Insert → Drawing → New, ${setup}, press “Save and close”, then delete this red note.`, { bold: true, color: 'b0352b' })]),
    ],
  })] })],
});

const BRK = true;      // start a new page here in the print version
const END = true;      // the last paragraph before such a break
const W3 = [3600, 2400, 2400, 2400], W5 = [2800, 2000, 2000, 2000, 2000];
const sheet = () => [
  new Paragraph({ spacing: { after: 20 }, children: [run('ImmuneSim: the immune response', { bold: true, size: 32 })] }),
  p([run(v('Lab handout · PRINT version · 50 points', 'Lab handout · TYPE-IN version · 50 points'), { color: GREY, size: 22 }), run('     ', { size: 20 }), new D.ExternalHyperlink({ link: 'https://foxworthywa.github.io/neuronsim/immune.html', children: [run('foxworthywa.github.io/neuronsim/immune.html', { color: ACCENT, size: 20 })] })]),
  spacer(40),
  p([run('Name(s): ', { bold: true })].concat(TYPE ? [BLANK(70)] : [run('_'.repeat(50), { size: 36, color: '8a8a8a', shading: { type: ShadingType.CLEAR, fill: FILL_INLINE } })])),
  spacer(30),
  table([TEXT_W], [[[
    p([run('The idea in one line: ', { bold: true, size: 20 }), run('an infection is a race. A fast, general defense holds the line within hours; a slow, exact one is selected from cells that already exist, takes days to multiply, and is remembered.', { size: 20 })]),
    TYPE
      ? p([run('How to use this document. ', { bold: true, size: 20 }), run('First make your own copy (File → Make a copy) if you were not given one. Type between the yellow brackets [   ] and in the pale yellow boxes; they grow as you type. Where there is a choice (yes / no), delete the choices that do not apply. Do Part A before you open the sim. In Part B the numbers match the circles across the top of the sim: when a box names a scene, stop there and fill it in. Write predictions BEFORE you press the run button. ', { size: 20 }), TALK_TAG(), run('means every person says their answer out loud before anyone types. Working alone? Type your own first answer before you run the experiment, then add what changed. Part C is answered after the sim, in full sentences, using your own numbers. The sim takes about 90 minutes, with a natural break after scene 9. You can return to any scene with the numbered circles. There is also a print version of this handout with the same questions.', { size: 20 })])
      : p([run('How to use this sheet. ', { bold: true, size: 20 }), run('Everything shaded yellow is yours to fill in: write on the yellow blanks and in the yellow boxes and table cells, draw in the two large yellow boxes, and where there are choices, circle one. Do Part A before you open the sim. In Part B the numbers match the circles across the top of the sim: when a box names a scene, stop there and fill it in. Write predictions BEFORE you press the run button. ', { size: 20 }), TALK_TAG(), run('means every person says their answer out loud before anyone writes. Working alone? Write your own first answer before you run the experiment, then add what changed. Part C is answered after the sim, in full sentences, using your own numbers. The sim takes about 90 minutes, with a natural break after scene 9. You can return to any scene with the numbered circles. There is also a type-in version of this handout (a Google Doc) with the same questions.', { size: 20 })]),
  ]]]),

  part('A · Before you open the sim', 'what you think now; there are no wrong answers here (4 points)'),
  q('Bacteria get into a scrape on your knee. Draw what you think happens over the next two weeks, and where in the body it happens. Label any cells or structures you know.', false, 2),
  box(4300, 'your drawing', 'draw one large empty rectangle (about the width of the page and a third of its height)'),
  q('If you have had chickenpox (or the vaccine), you will probably never have it again. What do you think your body kept, and where?', true, 2),
  ...lines(2, 4),

  part('B · Working through the sim', 'keyed to the scene numbers (16 points, plus 2 for your results and completion code)', BRK),

  scene(1, 'Where is the immune system?', 'Find your way around · The barrier · Where the fluid goes', 1),
  q('In the anatomical figure, lymph nodes are clustered in the neck (cervical nodes), the ______________ (axillary nodes) and the ______________ (inguinal nodes). A lymph node is packed with ______________________________.'),
  q('The body’s first line of defense is ______________. Fluid from the right knee drains first to lymph nodes in the ______________. The three places the sim follows: ______________, ______________ and ______________.'),

  scene(2, 'A race', 'Predict', 1),
  q('1,000 bacteria, doubling every 90 minutes, nothing to stop them. Our prediction for 24 hours: ____________   The model: ____________   Each line on the timeline is ______ times the line below.'),

  scene(3, 'The guards already there', 'A small breach · You are the alarm · Turn the alarm down', 1),
  q('A macrophage’s pattern recognition receptors (such as the __________-like receptors) fit molecules shared by many microbes, called ______________________________ (PAMPs), for example ______________.     300 bacteria: cleared?  {{yes / no}}    red or swollen?  {{yes / no}}'),
  q('By hand: the bacteria began to fall when the neutrophils at the site passed about ____________.'),
  table(W3, [
    ['At 48 hours', 'Bacteria', 'Neutrophils at the site', 'Swelling (%)'],
    blankRow(W3, 'No drug'),
    blankRow(W3, 'With prednisone'),
  ]),
  q('What are the redness, heat and swelling of inflammation for?', true),
  ...lines(1, 3),

  scene(4, 'The same every time', 'If this were all you had · The second time', 1),
  q('Macrophages and neutrophils only, day 4: ____________ bacteria.  Cleared?  {{yes / no}}    A month later, same bacterium: ____________.    A strain never met before:  {{the same / different}}', false, 0, false, END),

  scene(5, 'The library in the lymph node', 'Hunt by hand · Let the antigen find it · A different pathogen', 2, BRK),
  q('Both swallow bacteria. The ______________ stays at the wound to kill them and raise the alarm; the ______________ cell carries pieces of them (antigen) to the lymph node.'),
  q(v('Our prediction (circle one): a lymphocyte that fits   {{already exists / will be built to match / will be copied from the dendritic cell}}', 'Our prediction (keep one, delete the others): a lymphocyte that fits   already exists  /  will be built to match  /  will be copied from the dendritic cell')),
  q('By hand we tested ______ of 1,296; best fit ______ %.   B-lymphocytes whose receptor fits: ______ of 1,296.   For the other strain: ______  {{the same cells / different cells}}'),
  q('Did the library change when the pathogen changed? What does that tell you about where a fitting receptor comes from?', true),
  ...lines(1, 3),

  scene(6, 'One cell is not enough', 'Watch the clone multiply · The lump in her groin', 1),
  q('B-lymphocytes that fit:  day 2 ________   day 4 ________   day 6 ________.     The lump in Priya’s groin is ____________________________.'),

  scene(7, 'Two keys', 'Steps 1 to 3 · Why insist on two cells?', 1),
  q('A T-lymphocyte’s receptor fits only a ______________ of antigen held in an ______________ molecule on another cell.'),
  q('Day 8 without helper T-lymphocytes: ________ B-lymphocytes that fit, antibody ________.    With them: ________ B-lymphocytes, antibody ________ units.'),
  q('A B-lymphocyte that fits Priya’s OWN protein, day 10. Two keys needed: ______ cells, antibody ______.   If one key were enough: ______ cells, antibody ______.'),

  scene(8, 'What antibody does', 'From B-lymphocyte to plasma cell · Four dishes · Back at the wound', 2),
  q('Cells that make antibody: ______________ cells. Besides marking microbes for phagocytes, antibody can ______________ toxins and viruses and ______________ (clump) microbes.'),
  table([3600, 3600, 3600], [
    ['Bacteria after 6 hours (start: 100 thousand)', 'No phagocytes', 'With phagocytes'],
    blankRow([3600, 3600, 3600], 'No antibody'),
    blankRow([3600, 3600, 3600], 'With antibody'),
  ]),
  q('Priya’s first infection:  first antibody on day ________;  bacteria cleared on day ________.', false, 0, false, END),

  scene(9, 'The second time', 'After the fight · Six months later · A different strain', 1, BRK),
  q('Lymphocytes that fit this antigen:  before the infection ________   at the peak ________   on day 42 ________'),
  table(W5, [
    ['', 'Cleared on day', 'Most bacteria', 'Antibody on day 3', 'Most swelling (%)'],
    blankRow(W5, 'First infection'),
    blankRow(W5, 'Second, same strain'),
    ['Second, different strain', '', '', '(leave blank)', '(leave blank)'],
  ]),

  scene(10, 'Hiding inside', 'Try antibody · Antibody first', 1),
  q('Antibody given on day 3:  free virus ________ → ________;  infected cells ________ → ________.     Antibody given first: most cells infected ________.'),

  scene(11, 'Every cell shows what it is making', 'You are the cytotoxic T-lymphocyte · Where do they come from? · MHC class I and class II', 2),
  q('By hand: ______ of 12 cells still healthy; healthy cells killed by mistake ______.    Elena: cytotoxic T-lymphocytes arrive on day ______; virus cleared on day ______.'),
  table([2800, 4000, 4000], [
    ['Copy from the sim', 'MHC class I', 'MHC class II'],
    blankRow([2800, 4000, 4000], 'Found on'),
    blankRow([2800, 4000, 4000], 'Shows fragments of'),
    blankRow([2800, 4000, 4000], 'Read by'),
    blankRow([2800, 4000, 4000], 'What follows'),
  ], false, 820),

  scene(12, 'Take one piece away', 'What is each cell for? · Mr. Hall · Ms. Adeyemi', 1, BRK),
  q(v('Write each prediction (C = cleared, N = not cleared) BEFORE you press Run, then what happened. Circle any prediction that was wrong.', 'Type each prediction (C = cleared, N = not cleared) BEFORE you press Run, then what happened. Put a * after any prediction that was wrong.')),
  table(W5, [
    ['Take away', 'Bacteria: predicted', 'Bacteria: observed', 'Virus: predicted', 'Virus: observed'],
    blankRow(W5, 'Neutrophils'),
    blankRow(W5, 'B-lymphocytes (no antibody)'),
    blankRow(W5, 'Cytotoxic T-lymphocytes'),
    blankRow(W5, 'Helper T-lymphocytes'),
  ]),

  scene(13, 'Teaching without the disease', 'A vaccine · Exposed · Two ways a vaccine can fail · Borrowed protection', 1),
  q('Vaccine:  antibody on day 3 ________;  on day 14 ________ units;  virus at any time ________.'),
  q('Most cells infected:  exposed 2 weeks after the vaccine ________  (Elena, no vaccine: ________);   exposed on day 3 ________;   a changed strain ________.'),
  q('Borrowed antibody:  400 units → week 3 ________ → week 12 ________;   memory cells ________.'),
  ...(TYPE
    ? [q('Completion code:  ____________________     Paste the results text from the last screen of the sim in the box below.', false, 2), answerBox(6), spacer(60)]
    : [q('Paste the results text from the last screen of the sim on the back of this sheet (or attach it), and write your completion code here:  ____________________', false, 2)]),

  part('C · After the sim', 'full sentences, your own numbers; explain why, not just what (28 points)'),
  q('1. Priya’s knee. What made her knee red, warm and swollen: the bacteria, or Priya? Explain what each sign is and what it achieves. Use your prednisone result as evidence.', false, 3),
  ...lines(4, 6),
  q('2. Selection, not instruction. A classmate says: “The immune system studies a new germ and then builds an antibody to fit it.” Use what you did in scene 5 (the hunt, letting the antigen find the cells, and swapping the strain) to explain what really happens. Use the term clonal selection.', true, 5, BRK),
  ...lines(5, 9),
  q('3. The lump and the lag. What was the lump in Priya’s groin, and why did it appear on day 3 and not on day 1? Using your counts for days 2, 4 and 6, explain why she was ill for more than a week before the bacteria were cleared, and what held them in check until then.', false, 4),
  ...lines(4, 8),
  q('4. The second time. Compare Priya’s first and second infections using your table from scene 9. Was she infected the second time? What had the first infection left behind, and why did it not help against the different strain?', false, 3, BRK),
  ...lines(4, 6),
  q('5. Elena’s flu. Why could antibody not clear Elena’s infection once it was established, although it prevented infection when it was there first? What does a cytotoxic T-lymphocyte destroy, and how does it tell which cells to destroy?', false, 4),
  ...lines(4, 7),
  q('6. Two patients. (a) Mr. Hall’s wound showed little redness or swelling and no pus. Why is that not reassuring? (b) Ms. Adeyemi has lost most of one kind of cell. Explain why that one loss left her unable to make antibody AND unable to clear a virus. Use your scene 12 table.', true, 4),
  ...lines(5, 7),
  q('7. Transfer: two things people say. “I had my flu shot yesterday, so I’m covered for the party tonight.” “The flu shot gave me the flu.” Respond to each, using your scene 13 results. Then explain why a newborn is protected for a few months without ever having been vaccinated, and why that protection does not last.', true, 3, BRK),
  ...lines(5, 6),
  q('Now redraw your Part A picture as a timeline. Sketch four curves for a FIRST infection (bacteria, neutrophils at the site, lymphocytes that fit, antibody), from day 0 to day 12. Then add, in another colour or as dashed lines, the bacteria and antibody for a SECOND infection with the same strain. Label three events. Under it, write one thing in your Part A drawing that you would now change.', false, 2),
  box(5000, 'your timeline: how many (up the page) against time in days (across)', 'draw two axes for the students to use: time across, marked day 0 to day 12, and “how many” up the side, marked 1, 100, 10 thousand, 1 million and 100 million'),
  ...lines(2, 3),
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
build(false, 'ImmuneSim-handout.docx').then(() => build(true, 'ImmuneSim-handout-typed.docx'));
