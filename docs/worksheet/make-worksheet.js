// Builds the group worksheet that accompanies muscle.html (docs/worksheet/MuscleSim-worksheet.docx).
// Three parts — before the sim (draw the cell, reason about channels and the pump), during
// (boxes keyed to the sim's scene numbers), after (the EMG demo) — and an instructor key on the
// last page. Concepts over numbers: the only number asked for is threshold; everything else is a
// contrast to circle or a reason to write. TALK FIRST items require every person to answer aloud
// before anyone writes.
// Usage: node docs/worksheet/make-worksheet.js
'use strict';
const fs = require('fs'), path = require('path');
function loadDocx() { try { return require('docx'); } catch (e) { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'docx')); } }
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, HeightRule, VerticalAlign } = loadDocx();

const FONT = 'Calibri', SIZE = 20;            // 10 pt
const GREY = '8a8a8a', LINE = 'b0b0b0', INK = '1f2430', ACCENT = '2f6fd6', TALK = '7a4a00';
const IN = 1440, LETTER = { width: 12240, height: 15840 }, MARGIN = 0.5 * IN;
const TEXT_W = LETTER.width - 2 * MARGIN;   // 10800 DXA

const run = (text, o) => new TextRun(Object.assign({ text, font: FONT, size: SIZE, color: INK }, o || {}));
const p = (children, o) => new Paragraph(Object.assign({ spacing: { after: 40, line: 252 } }, o || {}, { children: Array.isArray(children) ? children : [children] }));
const text = (t, o) => p(run(t, o));
const spacer = (after) => new Paragraph({ spacing: { after: after || 40 }, children: [run('')] });
const TALK_TAG = () => run('TALK FIRST  ', { bold: true, size: 17, color: TALK, shading: { type: ShadingType.CLEAR, fill: 'fff1dc' } });

// Part heading (Before / During / After).
const part = (label, note) => new Paragraph({
  spacing: { before: 200, after: 60 }, keepNext: true,
  shading: { type: ShadingType.CLEAR, fill: 'e9eef8' },
  children: [run(`  ${label}`, { bold: true, size: 22, color: '1d3f7a' }), run(note ? `   ${note}` : '', { color: '4a5468', size: 19 })],
});
// A scene heading: number badge + the step name as it appears in the sim's panel.
const scene = (n, title, step) => new Paragraph({
  spacing: { before: 130, after: 40 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 2 } },
  children: [
    run(` ${n} `, { bold: true, color: 'ffffff', shading: { type: ShadingType.CLEAR, fill: ACCENT } }),
    run(`  ${title}`, { bold: true, size: 23 }),
    step ? run(`   ·   on screen: “${step}”`, { color: GREY, italics: true }) : run(''),
  ],
});
// A question. `talk` marks the ones where everyone speaks before anyone writes.
const q = (t, talk) => p(talk ? [TALK_TAG(), run(t)] : [run(t)], { keepNext: true });
// Ruled answer lines.
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

// ---------------------------------------------------------------- the student sheet
const student = [
  new Paragraph({ spacing: { after: 20 }, children: [run('MuscleSim — from a shock to a twitch', { bold: true, size: 32 })] }),
  p([run('Group worksheet', { color: GREY, size: 22 }), run('     foxworthywa.github.io/neuronsim/muscle.html', { color: ACCENT, size: 20 })]),
  spacer(40),
  p([run('Names: ', { bold: true }), run('______________________________________________________________________________')]),
  spacer(30),
  table([TEXT_W], [[[
    p([run('The whole story in one line: ', { bold: true, size: 20 }), run('a command arrives at the end plate → an impulse runs over the sarcolemma and down the T-tubules → the SR lets Ca²⁺ out → Ca²⁺ lets the myofibrils pull → the SR pumps Ca²⁺ back and the fibre relaxes. Keep a finger on this line; every scene is one step of it.', { size: 20 })]),
    p([run('How to use this sheet. ', { bold: true, size: 20 }), run('Part A before you open the sim. In Part B the numbers match the circles across the top of the sim: when a box names a scene, stop there and answer together before pressing Continue. ', { size: 20 }), TALK_TAG(), run('means every person says their answer out loud before anyone writes — disagree first, then write what you agreed. One sheet per group.', { size: 20 })]),
  ]]]),

  part('A · Before you open the sim', 'from the introduction, and what you already know'),
  q('Draw a resting muscle fibre. The ions are Na⁺, K⁺, Ca²⁺, Cl⁻, and the large proteins (A⁻) that are stuck inside. Write each one on the side where it is more concentrated (bigger letters = more of it). Mark the inside + or −.'),
  new Table({
    width: { size: TEXT_W, type: WidthType.DXA }, columnWidths: [TEXT_W],
    rows: [new TableRow({ height: { value: 4300, rule: HeightRule.ATLEAST }, children: [new TableCell({
      width: { size: TEXT_W, type: WidthType.DXA }, borders: { top: b(), bottom: b(), left: b(), right: b() }, margins: { top: 60, left: 120 },
      verticalAlign: VerticalAlign.TOP, children: [text('outside the fibre', { color: GREY, size: 17, italics: true })],
    })] })],
  }),
  q('If only K⁺ channels open, which way does K⁺ move — in or out? Does the inside become more + or more −?  If only Na⁺ channels open?', true),
  ...lines(1),
  q('The Na⁺/K⁺ pump uses ATP to push Na⁺ out and pull K⁺ in. Is its job to make the charge right now, or to keep the gradients that the channels use? What would your drawing look like if the pump had been off for an hour?', true),
  ...lines(1),

  part('B · Working through the sim'),

  scene(2, 'Parts of a muscle fibre', 'Find the structure'),
  q('For each part, its job in a few words (what it is for, not what it looks like), then number them in the order the signal reaches them.'),
  table([3000, 6000, 1800], [
    ['Structure', 'Its job', 'Order (1–5)'],
    blankRow([3000, 6000, 1800], 'Sarcolemma'),
    blankRow([3000, 6000, 1800], 'T-tubules'),
    blankRow([3000, 6000, 1800], 'Sarcoplasmic reticulum (cisternae)'),
    blankRow([3000, 6000, 1800], 'Myofibrils'),
    blankRow([3000, 6000, 1800], 'Motor end plate'),
  ]),

  scene(3, 'The resting membrane', 'the concentration table on screen'),
  q('Check your Part A drawing against the concentrations on screen. Correct it in a different colour. What, if anything, did you have the wrong way round? ______________________________________________'),

  scene(5, 'Threshold and all-or-none', 'Channels with a voltage sensor · Double the shock'),
  q('Shocks of 20, 40, 60 and 80 % each pushed Vm up, and each time it fell straight back. The 100 % shock fired a full impulse. Vm at the moment the sim paused — when the first Na⁺ channels opened — is the threshold: ________ mV.'),
  q('What was the membrane doing at 100 % that it was not doing at 80 %? (Hint: what does Na⁺ coming in do to the other Na⁺ channels?)', true),
  ...lines(1),
  q('Complete the loop:  Na⁺ channels open → Na⁺ comes ______ → the inside becomes more ______ → ______ Na⁺ channels open → …   What pulls Vm back down after a small shock, before this loop can get going? ____________________'),
  q('Shock at 100 % and at 200 %: the two impulses were (circle one)   the same size   /   different.   Why does a bigger shock not make a bigger impulse?'),
  ...lines(1),
  q('Which everyday thing is threshold most like — a dimmer switch, a sneeze, or a ball pushed up a hill? Say why. In the fibre, what is the push, and what is the falling back?', true),
  ...lines(1),

  scene(6, 'Building the action potential', 'Predict: what happens next? … Two shocks'),
  q('The sim pauses at each phase. Fill in the table as it stops.'),
  table([2500, 4100, 4200], [
    ['Phase', 'Which gated channel is open', 'Which ion moves, and which way'],
    blankRow([2500, 4100, 4200], 'Rising phase'),
    blankRow([2500, 4100, 4200], 'At the peak'),
    blankRow([2500, 4100, 4200], 'Falling phase'),
    blankRow([2500, 4100, 4200], 'Undershoot'),
  ]),
  q('Two shocks 3 ms apart: the second shock produced ____________________.   What state were the Na⁺ channels in?', true),
  ...lines(1),

  scene(7, 'Along the fibre and down the tubes', 'Shock the middle of the fibre'),
  q('The impulse ran to both ends. Why does it never turn round and travel back the way it came?', true),
  ...lines(1),

  scene(8, 'Voltage to calcium', 'The classic experiment: no Ca²⁺ outside'),
  q('VOTE before you run the Ca²⁺-free bath — with no Ca²⁺ outside the fibre, will it still twitch?   Yes  [ ] [ ] [ ] [ ]     No  [ ] [ ] [ ] [ ]   (one tick per person)', true),
  q('Result (circle one):  full twitch   /   weaker twitch   /   nothing.   So where does the Ca²⁺ for a contraction come from? ______________________________'),

  scene('9–10', 'Calcium to force, and letting go', 'Letting go · No ATP'),
  q('When someone dies, their cells stop making ATP. Using this scene, explain why the body stiffens a few hours later — and why it goes stiff rather than limp.'),
  ...lines(1),
  q('Is a stiff muscle after death contracting? What is it actually doing? (Two things need ATP here; name both.)', true),
  ...lines(1),

  scene(11, 'One twitch, phase by phase', 'The same twitch, one phase at a time'),
  q('The sim stops at each phase. Number these 1–8 in the order they happen:'),
  table([5400, 5400], [
    ['____  Ca²⁺ floods out of the store', '____  SERCA pumps Ca²⁺ back into the store'],
    ['____  Relaxed', '____  Troponin catches Ca²⁺, tropomyosin moves'],
    ['____  The impulse: Na⁺ channels open', '____  The impulse runs down the T-tubules'],
    ['____  Cross-bridges cycle; force rises', '____  Peak force'],
  ], true),
  q('Which lasts longest (circle one):  the impulse   /   the Ca²⁺   /   the force.   Why does that gap matter for the next scene?', true),
  ...lines(1),

  scene(12, 'Summation and tetanus', 'Summation · Raise the rate'),
  q('Two shocks 20 ms apart. The second impulse was (circle)  bigger / smaller / the same.   The force was (circle)  bigger / smaller / the same.'),
  q('So what adds up, and what does not? When you raised the rate until the force went smooth, what ran out of time between impulses?', true),
  ...lines(1),
  q('When you hold a cup steady, are the fibres in your arm twitching, or in tetanus? ____________________  (needed in Part C)'),

  scene(13, 'The neuromuscular junction', 'The end-plate potential by itself · Block half'),
  q('With the Na⁺ channels switched off, the receptors alone pushed Vm (circle one)   short of threshold   /   just to threshold   /   well past threshold.'),
  q('With half the receptors blocked, the twitch was (circle one)   smaller   /   the same.   So what would have to happen for a command from the nerve to fail?', true),
  ...lines(1),

  part('C · After the sim: your own muscle', 'the EMG demo — write each prediction before you look'),
  q('Look back at your cup answer in scene 12. Your instructor will contract a muscle once, briefly. The sim showed one impulse for one twitch. How many impulses will the EMG show — one, or many? ______________'),
  q('Gentle squeeze, then hard squeeze. Will the signal get taller, busier, or both? ______________'),
  q('Afterwards: what did you actually see, and which scene of the sim explains it?'),
  ...lines(1),
];

// ---------------------------------------------------------------- instructor key
const key = [
  new Paragraph({ pageBreakBefore: true, spacing: { after: 40 }, children: [run('Instructor key', { bold: true, size: 28 })] }),
  text('Answers in the terms the sim uses. The one number asked for is threshold; other model values are given only where a circle needs the fact behind it.', { color: GREY, size: 20 }),
  spacer(60),
  ...[
    ['A', 'Outside: Na⁺, Ca²⁺, Cl⁻ high. Inside: K⁺ high, A⁻ trapped, inside negative (≈ −85 mV). K⁺ channels open → K⁺ out → inside more negative. Na⁺ channels open → Na⁺ in → inside more positive. The pump keeps the gradients; it does not make the charge in the moment — switch it off and Vm barely changes for a long time (the sim lets them try this in the Lab). Off for an hour: the gradients run down, the drawing goes flat, nothing can fire.'],
    ['2', 'Sarcolemma carries the impulse over the surface; T-tubules carry it inward; SR (its cisternae beside each tubule) stores and releases Ca²⁺; myofibrils pull; the end plate is where the nerve delivers its command. Order: end plate 1, sarcolemma 2, T-tubules 3, SR 4, myofibrils 5.'],
    ['3', 'Na⁺ 145 out / 12 in; K⁺ 4 out / 140 in; Cl⁻ 110 out / 6 in; Ca²⁺ 2 out / 0.0001 in (mM). The commonest error is K⁺ on the wrong side.'],
    ['5', 'Threshold ≈ −60 mV. At 80 % a few Na⁺ channels open but the K⁺ leak pulls Vm back before more can join; at 100 % enough open that the Na⁺ coming in depolarizes the membrane further and opens more — the loop outruns the leak. Loop: in → positive → more. The K⁺ leak is what pulls it back. 100 % vs 200 %: the same size (both ≈ +49 mV) — once the loop has started the channels do the work, not the shock; the shock’s only job was getting Vm to threshold. Best analogy: a sneeze or a ball pushed over a hill (a dimmer is graded, which is exactly what an impulse is not). The push is the shock; the falling back is the K⁺ leak.'],
    ['6', 'Rising: voltage-gated Na⁺ open, Na⁺ in. Peak: Na⁺ inactivating, K⁺ opening. Falling: K⁺ open, K⁺ out. Undershoot: K⁺ still open. Second shock at 3 ms: nothing — Na⁺ channels inactivated (refractory).'],
    ['7', 'Behind the wave the Na⁺ channels are inactivated, so the membrane it has just left cannot be re-excited until they reset — by then the wave is gone.'],
    ['8', 'Full twitch (the model gives 0.27, identical to normal). All the Ca²⁺ for contraction comes from the SR; none from outside. (In the sim, Ca²⁺ outside matters at the nerve terminal, scene 13, not in the fibre.)'],
    ['9–10', 'Rigor mortis. ATP is needed (1) for myosin heads to let go of actin and re-cock, and (2) for SERCA to pump Ca²⁺ back into the store. With no ATP the leaked Ca²⁺ is never removed and the bridges that form can never release, so force climbs and stays: stiff, not limp. It is not contracting — nothing is cycling; the bridges are simply stuck.'],
    ['11', 'Impulse → down the tubules → Ca²⁺ floods out → troponin/tropomyosin → cross-bridges, force rises → peak force → SERCA pumps back → relaxed. Force lasts longest by far (≈ 100 ms vs ≈ 1 ms for the impulse); that is why a second impulse can land while force is still up.'],
    ['12', 'Second impulse the same; force bigger (≈ 1.8× a twitch). Impulses do not add — force does, because Ca²⁺ from the second release lands on top of what SERCA had not yet cleared. At a high rate it is Ca²⁺ removal that runs out of time, so troponin stays switched on: fused tetanus. Holding a cup: tetanus (unfused or partly fused). Nobody produces a single twitch voluntarily.'],
    ['13', 'Well past threshold (about 2× what is needed: the safety margin). Half block: the same. A command fails only when the end-plate potential falls short of threshold — most receptors gone (myasthenia), a deep enough block (rocuronium), or the terminal’s ACh running down.'],
    ['C', 'Many — a continuous barrage, not one spike: motor units firing at ~10–50 Hz; every voluntary movement is a tetanus (scene 12). Harder squeeze: both taller (more, larger units recruited) and busier (higher rate). Say explicitly that the EMG is the summed signal of thousands of fibres firing out of step, recorded from outside — not the single-fibre membrane potential on the sim’s trace.'],
  ].map(([n, t]) => p([run(`${n}  `, { bold: true, color: ACCENT }), run(t, { size: 20 })], { spacing: { after: 90, line: 252 } })),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: SIZE, color: INK } } } },
  sections: [{
    properties: { page: { size: LETTER, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
    children: student.concat(key),
  }],
});

const out = path.join(__dirname, 'MuscleSim-worksheet.docx');
Packer.toBuffer(doc).then(buf => { fs.writeFileSync(out, buf); console.log('wrote', out, (buf.length / 1024).toFixed(0), 'KB'); });
