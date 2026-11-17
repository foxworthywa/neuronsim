// Builds the handout that accompanies immune.html, ImmuneSim (docs/worksheet/ImmuneSim-handout.docx).
// One sheet per group, or per student for those working alone (online sections). Three parts:
// before the sim (draw what you think happens; a prediction), during (boxes keyed to the sim's
// scene numbers, predictions written before each run), after (questions about the four patients,
// answered with the group's own numbers, and a redrawn timeline), 50 points in all (A 4, B 16 + 2, C 28). TALK FIRST
// items require every person to answer aloud before anyone writes. The answer key and grading
// rubric are kept outside this public repository.
// Usage: node docs/worksheet/make-immune-worksheet.js   (then convert to PDF with LibreOffice:
//        soffice --headless --convert-to pdf --outdir docs/worksheet docs/worksheet/ImmuneSim-handout.docx)
'use strict';
const fs = require('fs'), path = require('path');
function loadDocx() { try { return require('docx'); } catch (e) { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'docx')); } }
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, HeightRule, VerticalAlign } = loadDocx();

const FONT = 'Calibri', SIZE = 20;            // 10 pt
const GREY = '8a8a8a', LINE = 'b0b0b0', INK = '1f2430', ACCENT = '12877f', TALK = '7a4a00';
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
  shading: { type: ShadingType.CLEAR, fill: 'e3f3f1' },
  children: [run(`  ${label}`, { bold: true, size: 22, color: '0b5f59' }), run(note ? `   ${note}` : '', { color: '4a5468', size: 19 })],
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


const W3 = [3600, 2400, 2400, 2400], W5 = [2800, 2000, 2000, 2000, 2000];
const student = [
  new Paragraph({ spacing: { after: 20 }, children: [run('ImmuneSim: the immune response', { bold: true, size: 32 })] }),
  p([run('Lab handout · 50 points', { color: GREY, size: 22 }), run('     foxworthywa.github.io/neuronsim/immune.html', { color: ACCENT, size: 20 })]),
  spacer(40),
  p([run('Name(s): ', { bold: true }), run('____________________________________________________________________________')]),
  spacer(30),
  table([TEXT_W], [[[
    p([run('The idea in one line: ', { bold: true, size: 20 }), run('an infection is a race. A fast, general defense holds the line within hours; a slow, exact one is selected from cells that already exist, takes days to multiply, and is remembered.', { size: 20 })]),
    p([run('How to use this sheet. ', { bold: true, size: 20 }), run('Part A before you open the sim. In Part B the numbers match the circles across the top of the sim: when a box names a scene, stop there and fill it in. Write predictions BEFORE you press the run button. ', { size: 20 }), TALK_TAG(), run('means every person says their answer out loud before anyone writes. Working alone? Write your own first answer before you run the experiment, then add what changed. Part C is answered after the sim, in full sentences, using your own numbers. The sim takes about 90 minutes, with a natural break after scene 9. You can return to any scene with the numbered circles.', { size: 20 })]),
  ]]]),

  part('A · Before you open the sim', 'what you think now; there are no wrong answers here (4 points)'),
  q('Bacteria get into a scrape on your knee. Draw what you think happens over the next two weeks, and where in the body it happens. Label any cells or structures you know.', false, 2),
  box(2100, 'your drawing'),
  q('If you have had chickenpox (or the vaccine), you will probably never have it again. What do you think your body kept, and where?', true, 2),
  ...lines(2),

  part('B · Working through the sim', 'keyed to the scene numbers (16 points, plus 2 for your results and completion code)'),

  scene(1, 'Where is the immune system?', 'Find your way around · The barrier · Where the fluid goes', 1),
  q('In the anatomical figure, lymph nodes are clustered in the neck (cervical nodes), the ______________ (axillary nodes) and the ______________ (inguinal nodes). A lymph node is packed with ______________________________.'),
  q('The body’s first line of defense is ______________. Fluid from the right knee drains first to lymph nodes in the ______________. The three places the sim follows: ______________, ______________ and ______________.'),

  scene(2, 'A race', 'Predict', 1),
  q('1,000 bacteria, doubling every 90 minutes, nothing to stop them. Our prediction for 24 hours: ____________   The model: ____________   Each line on the timeline is ______ times the line below.'),

  scene(3, 'The guards already there', 'A small breach · You are the alarm · Turn the alarm down', 1),
  q('A macrophage’s pattern recognition receptors (such as the __________-like receptors) fit molecules shared by many microbes, called ______________________________ (PAMPs), for example ______________.     300 bacteria: cleared?  yes / no    red or swollen?  yes / no'),
  q('By hand: the bacteria began to fall when the neutrophils at the site passed about ____________.'),
  table(W3, [
    ['At 48 hours', 'Bacteria', 'Neutrophils at the site', 'Swelling (%)'],
    blankRow(W3, 'No drug'),
    blankRow(W3, 'With prednisone'),
  ]),
  q('What are the redness, heat and swelling of inflammation for?', true),
  ...lines(1),

  scene(4, 'The same every time', 'If this were all you had · The second time', 1),
  q('Macrophages and neutrophils only, day 4: ____________ bacteria.  Cleared?  yes / no    A month later, same bacterium: ____________.    A strain never met before:  the same / different'),

  scene(5, 'The library in the lymph node', 'Hunt by hand · Let the antigen find it · A different pathogen', 2),
  q('Both swallow bacteria. The ______________ stays at the wound to kill them and raise the alarm; the ______________ cell carries pieces of them (antigen) to the lymph node.'),
  q('Our prediction (circle one): a lymphocyte that fits   already exists  /  will be built to match  /  will be copied from the dendritic cell'),
  q('By hand we tested ______ of 1,296; best fit ______ %.   B-lymphocytes whose receptor fits: ______ of 1,296.   For the other strain: ______  (the same cells / different cells).'),
  q('Did the library change when the pathogen changed? What does that tell you about where a fitting receptor comes from?', true),
  ...lines(1),

  scene(6, 'One cell is not enough', 'Watch the clone grow · The lump in her groin', 1),
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
  q('Priya’s first infection:  first antibody on day ________;  bacteria cleared on day ________.'),

  scene(9, 'The second time', 'After the fight · Six months later · A different strain', 1),
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
  ]),

  scene(12, 'Take one piece away', 'What is each cell for? · Mr. Hall · Ms. Adeyemi', 1),
  q('Write each prediction (C = cleared, N = not cleared) BEFORE you press Run, then what happened. Circle any prediction that was wrong.'),
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
  q('Paste the results text from the last screen of the sim on the back of this sheet (or attach it), and write your completion code here:  ____________________', false, 2),

  part('C · After the sim', 'full sentences, your own numbers; explain why, not just what (28 points)'),
  q('1. Priya’s knee. What made her knee red, warm and swollen: the bacteria, or Priya? Explain what each sign is and what it achieves. Use your prednisone result as evidence.', false, 3),
  ...lines(4),
  q('2. Selection, not instruction. A classmate says: “The immune system studies a new germ and then builds an antibody to fit it.” Use what you did in scene 5 (the hunt, letting the antigen find the cells, and swapping the strain) to explain what really happens. Use the term clonal selection.', true, 5),
  ...lines(5),
  q('3. The lump and the lag. What was the lump in Priya’s groin, and why did it appear on day 3 and not on day 1? Using your counts for days 2, 4 and 6, explain why she was ill for more than a week before the bacteria were cleared, and what held them in check until then.', false, 4),
  ...lines(4),
  q('4. The second time. Compare Priya’s first and second infections using your table from scene 9. Was she infected the second time? What had the first infection left behind, and why did it not help against the different strain?', false, 3),
  ...lines(4),
  q('5. Elena’s flu. Why could antibody not clear Elena’s infection once it was established, although it prevented infection when it was there first? What does a cytotoxic T-lymphocyte destroy, and how does it tell which cells to destroy?', false, 4),
  ...lines(4),
  q('6. Two patients. (a) Mr. Hall’s wound showed little redness or swelling and no pus. Why is that not reassuring? (b) Ms. Adeyemi has lost most of one kind of cell. Explain why that one loss left her unable to make antibody AND unable to clear a virus. Use your scene 12 table.', true, 4),
  ...lines(5),
  q('7. Transfer: two things people say. “I had my flu shot yesterday, so I’m covered for the party tonight.” “The flu shot gave me the flu.” Respond to each, using your scene 13 results. Then explain why a newborn is protected for a few months without ever having been vaccinated, and why that protection does not last.', true, 3),
  ...lines(5),
  q('Now redraw your Part A picture as a timeline. Sketch four curves for a FIRST infection (bacteria, neutrophils at the site, lymphocytes that fit, antibody), from day 0 to day 12. Then add, in another colour or as dashed lines, the bacteria and antibody for a SECOND infection with the same strain. Label three events. Under it, write one thing in your Part A drawing that you would now change.', false, 2),
  box(2300, 'your timeline: how many (up the page) against time in days (across)'),
  ...lines(2),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: SIZE, color: INK } } } },
  sections: [{ properties: { page: { size: LETTER, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children: student }],
});
const out = path.join(__dirname, 'ImmuneSim-handout.docx');
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(out, buf); console.log('wrote', out, (buf.length / 1024).toFixed(0), 'KB'); });
