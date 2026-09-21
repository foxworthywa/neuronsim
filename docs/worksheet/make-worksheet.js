// Builds the group worksheet that accompanies muscle.html (docs/worksheet/MuscleSim-worksheet.docx).
// Pages 1–2 go to students; page 3 is the instructor key with the numbers the model produces.
// Usage: node docs/worksheet/make-worksheet.js
'use strict';
const fs = require('fs'), path = require('path');
function loadDocx() { try { return require('docx'); } catch (e) { const g = require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(); return require(path.join(g, 'docx')); } }
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } = loadDocx();

const FONT = 'Calibri', SIZE = 20;            // 10 pt
const GREY = '8a8a8a', LINE = 'b0b0b0', INK = '1f2430', ACCENT = '2f6fd6', TALK = '7a4a00';
const IN = 1440, LETTER = { width: 12240, height: 15840 }, MARGIN = 0.5 * IN;
const TEXT_W = LETTER.width - 2 * MARGIN;   // 10800 DXA

const run = (text, o) => new TextRun(Object.assign({ text, font: FONT, size: SIZE, color: INK }, o || {}));
const p = (children, o) => new Paragraph(Object.assign({ spacing: { after: 40, line: 252 } }, o || {}, { children: Array.isArray(children) ? children : [children] }));
const text = (t, o) => p(run(t, o));
const spacer = (after) => new Paragraph({ spacing: { after: after || 40 }, children: [run('')] });

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
const q = (t, talk) => p(talk
  ? [run('TALK FIRST  ', { bold: true, size: 17, color: TALK, shading: { type: ShadingType.CLEAR, fill: 'fff1dc' } }), run(t)]
  : [run(t)]);
// Ruled answer lines.
const lines = (n) => Array.from({ length: n }, () => new Paragraph({
  spacing: { before: 80, after: 0 }, children: [run('')],
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 1 } },
}));

const cell = (content, w, o) => new TableCell(Object.assign({
  width: { size: w, type: WidthType.DXA }, margins: { top: 30, bottom: 30, left: 90, right: 90 },
  borders: { top: b(), bottom: b(), left: b(), right: b() },
  children: (Array.isArray(content) ? content : [content]).map(c => typeof c === 'string' ? text(c, { size: 20, spacing: { after: 0, line: 240 } }) : c),
}, o || {}));
const b = () => ({ style: BorderStyle.SINGLE, size: 4, color: LINE });
const head = (t, w) => cell(text(t, { bold: true, size: 19, color: '444444' }), w, { shading: { type: ShadingType.CLEAR, fill: 'f1efe8' } });
const table = (widths, rows, noHead) => new Table({
  width: { size: widths.reduce((a, x) => a + x, 0), type: WidthType.DXA }, columnWidths: widths,
  rows: rows.map(r => new TableRow({ children: r.map((c, i) => typeof c === 'string' && r === rows[0] && !noHead ? head(c, widths[i]) : cell(c, widths[i])) })),
});
const blankRow = (widths, first) => [first].concat(widths.slice(1).map(() => ''));

// ---------------------------------------------------------------- page 1–2: the student sheet
const student = [
  new Paragraph({ spacing: { after: 20 }, children: [run('MuscleSim — from a shock to a twitch', { bold: true, size: 32 })] }),
  p([run('Group worksheet', { color: GREY, size: 22 }), run('     foxworthywa.github.io/neuronsim/muscle.html', { color: ACCENT, size: 20 })]),
  spacer(60),
  p([run('Names: ', { bold: true }), run('______________________________________________________________________________')]),
  spacer(40),
  table([TEXT_W], [[[
    text('How to use this sheet', { bold: true, size: 20 }),
    text('The numbers below match the numbered circles across the top of the sim. When a box names a scene, stop there and answer it together before pressing Continue. The sim gives you the numbers; you give the reasons, in your own words.', { size: 20 }),
    p([run('TALK FIRST', { bold: true, size: 17, color: TALK, shading: { type: ShadingType.CLEAR, fill: 'fff1dc' } }), run(' means every person in the group says their answer out loud before anyone writes. Disagree first; then write what you agreed on. One sheet per group.', { size: 20 })]),
  ]]]),

  scene(2, 'Parts of a muscle fibre', 'Find the structure'),
  q('For each part, write its job in a few words — what it is for, not what it looks like.'),
  table([2900, 5600, 2300], [
    ['Structure', 'Its job', 'Hardest to find? (tick)'],
    blankRow([2900, 5600, 2300], 'Sarcolemma'),
    blankRow([2900, 5600, 2300], 'T-tubules'),
    blankRow([2900, 5600, 2300], 'Sarcoplasmic reticulum (cisternae)'),
    blankRow([2900, 5600, 2300], 'Myofibrils'),
    blankRow([2900, 5600, 2300], 'Motor end plate'),
  ]),

  scene(5, 'Threshold and all-or-none', 'Channels with a voltage sensor · Double the shock'),
  q('The sim paused the moment the first Na⁺ channels opened. Vm at that moment: ________ mV — the threshold.  Which shock finally fired it? ________ %'),
  q('Shock at 100 % and at 200 %: peaks ________ mV and ________ mV.   Why does a bigger shock not make a bigger impulse?', true),
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
  q('The far end fired ________ ms after the electrode 5 mm along: ________ mm in ________ ms, about ________ m/s.'),
  q('Why does the impulse never turn round and travel back the way it came?', true),
  ...lines(1),

  scene(8, 'Voltage to calcium', 'The classic experiment: no Ca²⁺ outside'),
  q('After one shock, cytosolic Ca²⁺ peaked at ________ µM.'),
  q('VOTE before you run the Ca²⁺-free bath — will the fibre still twitch?   Yes  [ ] [ ] [ ] [ ]     No  [ ] [ ] [ ] [ ]   (one tick per person)', true),
  q('Result: peak force ________ .  So where did the Ca²⁺ for the twitch come from? ______________________________________'),

  scene('9–10', 'Calcium to force, and letting go', 'Letting go · No ATP'),
  q('Two different jobs in these scenes need ATP. Name both:  1. ____________  2. ____________'),
  q('With no ATP, force after the twitch stays at ________ and never comes down. The name for this state: ______________________'),

  scene(11, 'One twitch, phase by phase', 'The same twitch, one phase at a time'),
  q('The sim stops at each phase. Number these 1–8 in the order they happen:'),
  table([5400, 5400], [
    ['____  Ca²⁺ floods out of the store', '____  SERCA pumps Ca²⁺ back into the store'],
    ['____  Relaxed', '____  Troponin catches Ca²⁺, tropomyosin moves'],
    ['____  The impulse: Na⁺ channels open', '____  The impulse runs down the T-tubules'],
    ['____  Cross-bridges cycle; force rises', '____  Peak force'],
  ], true),
  q('“Which lasts longest?” — measured on the trace: impulse ________ ms · Ca²⁺ up ________ ms · force ________ ms.'),
  q('Which lasts longest, and why does that gap matter for the next scene?', true),
  ...lines(1),

  scene(12, 'Summation and tetanus', 'Summation · Raise the rate'),
  q('Single twitch peak ________.  Two shocks 20 ms apart: peak ________ (________ × a twitch).  Force fused at ________ Hz: peak ________.'),
  q('Look at the Vm trace during the tetanus. Did the impulses get bigger, merge into one, or stay the same? So what actually fused?', true),
  ...lines(1),
  q('When you hold a cup steady, are the fibres in your arm twitching or in tetanus? ____________ (for the demo)'),

  scene(13, 'The neuromuscular junction', 'The end-plate potential by itself'),
  q('With the Na⁺ channels switched off, the receptors alone pushed Vm to ________ mV — about ________ × what threshold needs. This spare capacity is the safety margin.'),
  q('With half the receptors blocked, the twitch was ______________________ compared with control.   What would have to happen for a command to fail? (Think: myasthenia, or a muscle relaxant.)', true),
  ...lines(1),

  scene('Lab', 'One patient each', 'the scenario cards'),
  q('Each person takes one card: Rocuronium · Hyperkalaemia · Myasthenia gravis · Malignant hyperthermia. Run it, then explain to the patient (or their family), in plain words, what has gone wrong at the level of the fibre and what the treatment does. Read each other’s.'),
  ...lines(2),

  scene('Demo', 'Your own muscle: the EMG', 'write each prediction before you look'),
  q('The sim showed one spike for one twitch. Your instructor will contract a muscle once, briefly. How many spikes will the EMG show? ______________'),
  q('Gentle squeeze, then hard squeeze. Will the signal get taller, busier, or both? ______________'),
  q('Afterwards: what did you actually see, and which scene of the sim explains it?'),
  ...lines(1),
];

// ---------------------------------------------------------------- page 3: instructor key
const key = [
  new Paragraph({ pageBreakBefore: true, spacing: { after: 40 }, children: [run('Instructor key', { bold: true, size: 28 })] }),
  text('Numbers are what the model produces with the sim’s default settings; students’ readings will be within a few percent. Where the sim measures live, a range is given.', { color: GREY, size: 20 }),
  spacer(60),
  ...[
    ['2', 'Sarcolemma carries the impulse over the surface; T-tubules carry it inward; SR stores Ca²⁺ (the cisternae beside each tubule release it); myofibrils do the pulling; the end plate is where the nerve delivers its command.'],
    ['5', 'Threshold ≈ −60 mV; threshold strength 100 % (the reference shock is the measured threshold). Peaks at 100 % and 200 % are the same within a few mV (≈ +49 mV): all-or-none — once the Na⁺ channels take over, the shock no longer matters.'],
    ['6', 'Rising: voltage-gated Na⁺ open, Na⁺ in. Peak: Na⁺ inactivating, K⁺ opening. Falling: K⁺ open, K⁺ out. Undershoot: K⁺ still open. Second shock at 3 ms: nothing — Na⁺ channels inactivated (refractory).'],
    ['7', '1.8 ms; 8.8 mm in 1.8 ms ≈ 4.9 m/s. Behind the wave the Na⁺ channels are inactivated, so it cannot re-excite the membrane it came from.'],
    ['8', 'Ca²⁺ peak ≈ 3.6 µM. In the Ca²⁺-free bath the twitch is full size (0.27): all the Ca²⁺ for contraction comes from the SR store, none from outside. (This is the point of the last card in the Lab, “Which Ca²⁺?”)'],
    ['9–10', 'ATP detaches (and re-cocks) the myosin heads, and powers SERCA. With no ATP force climbs to ≈ 1.0 and stays: rigor.'],
    ['11', 'Order: impulse → down the tubules → Ca²⁺ floods out → troponin/tropomyosin → cross-bridges, force rises → peak force → SERCA pumps back → relaxed. Durations ≈ impulse 1 ms · Ca²⁺ 13 ms · force 100 ms. Force lasts longest, by ~50×; that is why a second impulse lands while force is still up (scene 12).'],
    ['12', 'Twitch 0.27; pair at 20 ms 0.48 (≈ 1.8×); fuses at about 40 Hz and above, peak ≈ 0.7 (≈ 2.6×). The impulses stay separate and the same size — it is the Ca²⁺ and the force that fuse. Holding a cup: tetanus (unfused or partly fused). Nobody produces a single twitch voluntarily.'],
    ['13', 'EPP ≈ −35 to −40 mV, about 2× what threshold needs (live measurement; ~1.8–2.1×). Half block: twitch unchanged (0.27). A command fails only when the EPP falls below threshold — most receptors gone (myasthenia), a deep enough block (rocuronium), or a run-down terminal.'],
    ['Lab', 'Rocuronium: receptors occupied, EPP shrinks, past ~50 % block commands fail; neostigmine/sugammadex restore. Hyperkalaemia: rest depolarizes toward threshold, Na⁺ channels inactivate, fibre inexcitable; IV Ca²⁺ steadies the channels. Myasthenia: receptor density 20 %, safety margin gone, later commands in a train fail; pyridostigmine keeps ACh in the gap longer. Malignant hyperthermia: SR release channel leaks, Ca²⁺ up without impulses, sustained force and heat; dantrolene closes the channel.'],
    ['Demo', 'A brief voluntary contraction gives a continuous barrage, not one spike — motor units firing at ~10–50 Hz; every voluntary movement is a tetanus (scene 12). Harder squeeze: both taller (more, larger units recruited) and busier (higher rate). Say explicitly that the EMG is the summed, extracellular signal of thousands of fibres firing out of step — not the single-fibre membrane potential on the sim’s trace.'],
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
