// "Scientific unit tests" for the immune response: they assert the biology, not the code.
// Targets: docs/IMMUNE_MODULE.md (Physiological targets, Acceptance tests). Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { Immune, Dish, Patch, antigenShape, fitAt, dist, GOOD_FIT, DAY, rng, SELF, SIGMA } = require('../immune/engine.js');

const between = (x, lo, hi, what) => assert.ok(x >= lo && x <= hi, `${what} = ${Number(x).toPrecision(4)}, expected ${lo}–${hi}`);
const person = (setup, seed = 7) => { const b = new Immune({ seed }); if (setup) setup(b); return b; };
// Run for `days`, sampling every `every` hours; returns the samples and the events.
function follow(b, days, every = 2, kind = 'bacterium', strain = 'A') {
  const rows = [], events = [], t0 = b.t;
  for (let h = 0; h <= days * DAY + 1e-6; h += every) {
    rows.push({ t: b.t, bacteria: b.site.bacteria, virus: b.site.virus, infected: b.infected, neutrophils: b.site.neutrophils, ab: b.antibodyTo(kind, strain), spec: b.specific(kind, strain).total, signs: b.signs, node: b.nodeCells });
    b.advance(every);
    events.push(...b.takeEvents());
  }
  const when = (type) => { const e = events.find(e => e.type === type); return e ? (e.t - t0) / DAY : null; };
  return { rows, events, when, max: (k) => Math.max(...rows.map(r => r[k])), maxSign: (k) => Math.max(...rows.map(r => r.signs[k])) };
}

// ------------------------------------------------------------------ the race, and the innate response
test('with no defences, bacteria double every 90 minutes and fill the tissue within two days', () => {
  const b = person(b => { b.set('macrophages', 0); b.set('neutrophils', 0); b.set('adaptive', 0); b.infect('bacterium', { dose: 1000 }); });
  b.advance(10);
  between(b.site.bacteria / 1000, 80, 125, 'growth in 10 h (fold)');
  b.advance(38);
  assert.ok(b.site.bacteria > 0.5e9, 'bacteria near the ceiling at 48 h');
});

test('a small dose is cleared by the resident macrophages, with no inflammation', () => {
  const r = follow(person(b => { b.set('adaptive', 0); b.infect('bacterium', { dose: 300 }); }), 2, 0.5);
  assert.ok(r.when('cleared') != null && r.when('cleared') < 1, 'cleared within a day');
  assert.ok(r.maxSign('redness') < 0.02 && r.maxSign('swelling') < 0.02, 'no redness or swelling');
  assert.ok(r.max('neutrophils') < 5, 'no neutrophils called');
});

test('the innate response alone holds a larger dose but does not clear it', () => {
  const r = follow(person(b => { b.set('adaptive', 0); b.infect('bacterium'); }), 9);
  const late = r.rows.filter(x => x.t >= 2.5 * DAY).map(x => x.bacteria);
  assert.ok(Math.min(...late) > 1e5, 'never cleared');
  assert.ok(Math.max(...late) / Math.min(...late) < 10, 'held within a tenfold band from day 2.5 to day 9');
  between(r.when('neutrophilsArrive') * 24, 2, 14, 'first neutrophils (h)');
  const peakN = r.rows.reduce((a, x) => (x.neutrophils > a.neutrophils ? x : a));
  between(peakN.t / 24, 1, 3, 'neutrophil peak (day)');
  assert.ok(r.maxSign('redness') > 0.5 && r.maxSign('swelling') > 0.4, 'red and swollen');
});

test('bacteria fall only when neutrophils at the site exceed a critical number', () => {
  const p = person().p;
  for (const [n, falls] of [[0.6 * p.critN, false], [1.6 * p.critN, true]]) {
    const b = person(b => { b.set('macrophages', 0); b.set('adaptive', 0); b.set('recruit', 0); b.infect('bacterium', { dose: 1e6 }); });
    b.site.neutrophils = n; b.p.tauN = 1e9;
    b.advance(6);
    assert.equal(b.site.bacteria < 1e6, falls, `${n} neutrophils: bacteria ${falls ? 'fall' : 'rise'}`);
  }
});

test('with the alarm turned down (prednisone) the bacteria escape', () => {
  const r = follow(person(b => { b.set('adaptive', 0); b.set('alarm', 0.3); b.infect('bacterium'); }), 4);
  assert.ok(r.rows[r.rows.length - 1].bacteria > 3e8, 'bacteria near the ceiling');
});

test('the innate response is the same the second time, and for a different bacterium', () => {
  const run = (strain) => { const b = person(b => { b.set('adaptive', 0); b.infect('bacterium', { strain }); }); const first = follow(b, 3).rows.map(x => x.bacteria); b.clearPathogen(); b.advance(30 * DAY); b.takeEvents(); b.infect('bacterium', { strain }); return [first, follow(b, 3).rows.map(x => x.bacteria)]; };
  const [a1, a2] = run('A'), [c1] = run('C');
  a1.forEach((v, i) => { if (v > 100) between(a2[i] / v, 0.95, 1.05, `second/first at sample ${i}`); });
  a1.forEach((v, i) => { if (v > 100) between(c1[i] / v, 0.95, 1.05, `other strain/first at sample ${i}`); });
});

// ------------------------------------------------------------------ the library and selection
test('the library is built before the pathogen is chosen, and any antigen finds a fitting clone', () => {
  const b = person();
  const picks = [], rand = rng(99);
  for (let i = 0; i < 100; i++) {
    // any shape at all, as long as it is not one of the body's own
    let pt; do { pt = { x: rand(), y: rand() }; } while (SELF.some(([x, y]) => dist(pt.x, pt.y, x, y) < 4 * SIGMA));
    for (const kind of ['B', 'Th', 'Tc']) {
      const fits = b.lib[kind].filter(c => c.present).map(c => [fitAt(dist(c.x, c.y, pt.x, pt.y)), c.id]).sort((x, y) => y[0] - x[0]);
      assert.ok(fits[0][0] >= GOOD_FIT, `${kind} library: best fit for antigen ${i} is ${fits[0][0].toFixed(2)}`);
      const good = fits.filter(f => f[0] >= GOOD_FIT).length;
      assert.ok(good >= 1 && good <= 8, `${kind}: ${good} good fits (rare, but never none)`);
      if (kind === 'B') picks.push(fits[0][1]);
    }
  }
  assert.ok(new Set(picks).size > 90, 'different antigens are fitted by different clones');
});

test('the strains used in the lesson are different shapes (no antibody to one fits another)', () => {
  const pts = [['bacterium', 'A'], ['bacterium', 'B'], ['bacterium', 'C'], ['virus', 'A'], ['virus', 'B']].map(([k, s]) => antigenShape(k, s));
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(dist(pts[i].x, pts[i].y, pts[j].x, pts[j].y) > 6 * SIGMA, `${pts[i].key} and ${pts[j].key} are too alike`);
});

test('no clone that is released fits the body\'s own shapes', () => {
  const b = person();
  for (const kind of ['B', 'Th', 'Tc']) for (const c of b.lib[kind]) if (c.present) for (const [x, y] of SELF) assert.ok(fitAt(dist(c.x, c.y, x, y)) < GOOD_FIT, 'released clone fits self');
  assert.ok(b.lib.B.some(c => c.self), 'some clones were made that fit self, and were removed');
});

test('the clone that expands most is the one whose receptor fits best', () => {
  const b = person(b => b.infect('bacterium'));
  b.advance(7 * DAY);
  for (const kind of ['B', 'Th']) {
    const ranked = b.lib[kind].filter(c => c.present).map(c => ({ c, fit: b.fit(c, 'bacterium', 'A') })).sort((x, y) => y.fit - x.fit);
    const biggest = b.lib[kind].reduce((a, c) => (c.E > a.E ? c : a));
    assert.equal(biggest.id, ranked[0].c.id, `${kind}: best-fitting clone is the largest`);
    assert.ok(ranked[40].c.E < 1, 'a clone that does not fit has not expanded');
  }
});

// ------------------------------------------------------------------ a first infection
test('first bacterial infection: a lag of days, then antibody, then clearance', () => {
  const b = person(b => b.infect('bacterium'));
  const r = follow(b, 16);
  between(r.when('firstAntibody'), 4, 7, 'first antibody (day)');
  between(r.when('cleared'), 7, 10.5, 'cleared (day)');
  const d3 = r.rows.find(x => x.t >= 3 * DAY), d7 = r.rows.find(x => x.t >= 7 * DAY);
  assert.ok(d3.spec < 500, `only ${d3.spec.toFixed(0)} specific lymphocytes on day 3`);
  assert.ok(d7.spec / r.rows[0].spec > 1000, 'the selected clones have expanded more than 1000-fold by day 7');
  assert.ok(r.max('node') > 1e4, 'the node has swollen');
});

test('antibody does not kill: coated bacteria in a dish keep growing until phagocytes are added', () => {
  const plain = new Dish({ bacteria: 1e5 }), coated = new Dish({ bacteria: 1e5, antibody: 500 });
  plain.advance(6); coated.advance(6);
  between(coated.bacteria / plain.bacteria, 0.95, 1.05, 'coated/plain after 6 h without phagocytes');
  const few = new Dish({ bacteria: 1e5, phagocytes: 500 }), fewCoated = new Dish({ bacteria: 1e5, antibody: 500, phagocytes: 500 });
  few.advance(6); fewCoated.advance(6);
  assert.ok(few.bacteria > 1e5, 'a few phagocytes alone lose');
  assert.equal(fewCoated.bacteria, 0, 'the same phagocytes clear coated bacteria');
});

test('contraction and memory: most of the clone dies, and what is left stays', () => {
  const b = person(b => b.infect('bacterium'));
  const r = follow(b, 20);
  const peak = r.max('spec');
  b.advance(40 * DAY);
  const m60 = b.specific('bacterium', 'A');
  between(m60.total / peak, 0.03, 0.15, 'fraction of the peak left at day 60');
  b.advance(120 * DAY);
  const m180 = b.specific('bacterium', 'A');
  between(m180.total / m60.total, 0.9, 1.05, 'memory stable from day 60 to day 180');
  assert.ok(m180.memory / r.rows[0].spec > 100, 'hundreds of memory cells for every cell there was at the start');
  const ab60 = r.max('ab'), ab180 = b.antibodyTo('bacterium', 'A');
  assert.ok(ab180 < 0.1 * ab60 && ab180 > 1, `antibody has fallen (${ab180.toFixed(1)} from ${ab60.toFixed(0)}) but is still detectable`);
});

// ------------------------------------------------------------------ the second time
function secondExposure(strain2) {
  const b = person(b => b.infect('bacterium'));
  const first = follow(b, 20);
  b.advance(160 * DAY); b.takeEvents(); b.flags = {};
  b.infect('bacterium', { strain: strain2 });
  return { first, second: follow(b, 16, 2, 'bacterium', strain2) };
}
test('second exposure to the same strain: faster, bigger, and without the illness', () => {
  const { first, second } = secondExposure('A');
  assert.ok(second.when('cleared') < 3, `cleared in ${second.when('cleared').toFixed(1)} days`);
  assert.ok(first.max('bacteria') / second.max('bacteria') > 50, 'peak load at least 50-fold lower');
  assert.ok(second.maxSign('fever') < 0.15, 'no fever to speak of');
  assert.ok(second.maxSign('swelling') < 0.3 * first.maxSign('swelling'), 'much less swelling');
  const at = (r, d) => r.rows.find(x => x.t - r.rows[0].t >= d * DAY).ab;
  assert.ok(at(second, 3) > 100 * at(first, 3), 'far more antibody on day 3 than on day 3 of the first infection');
  assert.ok(second.max('ab') > 1.5 * first.max('ab'), 'a higher antibody peak');
});

test('second exposure to a different strain: a first response again', () => {
  const { first, second } = secondExposure('B');
  between(second.when('cleared') / first.when('cleared'), 0.7, 1.5, 'time to clear, relative to the first infection');
  between(second.max('bacteria') / first.max('bacteria'), 0.8, 1.2, 'peak load, relative to the first infection');
});

// ------------------------------------------------------------------ the virus
test('antibody cannot reach virus inside cells', () => {
  const b = person(b => { b.set('adaptive', 0); b.infect('virus'); });
  b.advance(3 * DAY);
  const v0 = b.site.virus, i0 = b.infected;
  b.giveAntibody('virus', { amount: 2000 });
  b.advance(2 * DAY);
  assert.ok(b.site.virus < v0 / 10, `free virus fell ${(v0 / b.site.virus).toFixed(0)}-fold`);
  assert.ok(b.infected > 1000, `${b.infected.toFixed(0)} infected cells remain`);
  // the same antibody given first prevents the infection
  const c = person(b => { b.set('adaptive', 0); b.giveAntibody('virus', { amount: 2000 }); b.infect('virus'); });
  c.advance(3 * DAY);
  assert.ok(c.infected < 1 && c.site.virus < 1, 'no infection when the antibody is there first');
});

test('influenza in a healthy adult: cytotoxic T cells arrive after about a week and clear it', () => {
  const b = person(b => b.infect('virus'));
  const r = follow(b, 16, 2, 'virus');
  between(r.when('cleared'), 7.5, 11, 'cleared (day)');
  const peakV = r.rows.reduce((a, x) => (x.virus > a.virus ? x : a));
  between(peakV.t / DAY, 1.5, 5, 'virus peak (day)');
  assert.ok(r.maxSign('fever') > 0.4, 'fever');
  assert.ok(b.site.healthy > 0.85e6, 'most of the airway lining survives');
});

test('each arm matters for its own kind of pathogen', () => {
  const outcome = (kind, knock) => { const b = person(b => { if (knock) b.set(knock[0], knock[1]); b.infect(kind); }); const r = follow(b, 21, 4, kind); return r.when('cleared'); };
  assert.ok(outcome('bacterium', null) != null && outcome('virus', null) != null, 'healthy: both cleared');
  assert.equal(outcome('bacterium', ['neutrophils', 0.07]) == null, true, 'few neutrophils: bacteria not cleared');
  assert.ok(outcome('virus', ['neutrophils', 0.07]) != null, 'few neutrophils: virus still cleared');
  assert.equal(outcome('bacterium', ['bcells', 0]), null, 'no B cells: bacteria not cleared');
  assert.ok(outcome('virus', ['bcells', 0]) != null, 'no B cells: virus cleared by cytotoxic T cells');
  assert.ok(outcome('bacterium', ['tcells', 0]) != null, 'no cytotoxic T cells: bacteria still cleared');
  assert.equal(outcome('virus', ['tcells', 0]), null, 'no cytotoxic T cells: virus not cleared');
  assert.equal(outcome('bacterium', ['helperT', 0]), null, 'no helper T cells: bacteria not cleared');
  assert.equal(outcome('virus', ['helperT', 0]), null, 'no helper T cells: virus not cleared');
});

test('without helper T cells there is no antibody and no cytotoxic T expansion; the innate response is unchanged', () => {
  const run = (h) => { const b = person(b => { b.set('helperT', h); b.infect('bacterium'); }); return follow(b, 4); };
  const none = run(0), full = run(1);
  none.rows.forEach((x, i) => { if (x.t < 3 * DAY && x.bacteria > 100) between(x.bacteria / full.rows[i].bacteria, 0.9, 1.1, 'bacteria, no helpers / healthy, first 3 days'); });
  const b = person(b => { b.set('helperT', 0); b.infect('virus'); });
  b.advance(12 * DAY);
  assert.ok(b.antibodyTo('virus', 'A') < 0.01, 'no antibody');
  assert.ok(b.site.ctl < 1, 'no cytotoxic T cells at the site');
});

test('few neutrophils: the bacteria escape and the wound shows little', () => {
  const healthy = follow(person(b => b.infect('bacterium')), 4), low = follow(person(b => { b.set('neutrophils', 0.07); b.infect('bacterium'); }), 4);
  assert.ok(low.rows[low.rows.length - 1].bacteria > 3e8, 'bacteria near the ceiling');
  for (const k of ['swelling', 'pus']) assert.ok(low.maxSign(k) < 0.5 * healthy.maxSign(k), `${k} less than half of normal (${low.maxSign(k).toFixed(2)} vs ${healthy.maxSign(k).toFixed(2)})`);
  assert.ok(low.maxSign('fever') >= healthy.maxSign('fever') * 0.8, 'but there is still a fever');
  between(person(b => b.set('neutrophils', 0.07)).labPanel()[0].value, 200, 400, 'absolute neutrophil count');
});

// ------------------------------------------------------------------ vaccines and borrowed antibody
test('a vaccine: no pathogen, but antibody and memory two weeks later', () => {
  const b = person(b => b.vaccinate('virus'));
  const r = follow(b, 14, 2, 'virus');
  assert.equal(r.max('virus'), 0); assert.equal(r.max('infected'), 0);
  assert.ok(b.antibodyTo('virus', 'A') > 20, `antibody ${b.antibodyTo('virus', 'A').toFixed(0)} units at two weeks`);
  assert.ok(b.specific('virus', 'A', 'B').total > 100, 'expanded B-cell clone');
  assert.ok(r.maxSign('fever') < 0.15, 'no illness');
});

test('exposure two weeks after the vaccine is a non-event; exposure on day 3 is an ordinary infection', () => {
  const naive = follow(person(b => b.infect('virus')), 14, 2, 'virus');
  const at = (day, strain) => { const b = person(b => b.vaccinate('virus')); b.advance(day * DAY); b.takeEvents(); b.flags = {}; b.infect('virus', { strain }); return follow(b, 14, 2, 'virus', strain); };
  const late = at(14, 'A'), early = at(3, 'A'), drift = at(14, 'B');
  assert.ok(late.max('infected') < 0.02 * naive.max('infected'), `protected: peak infected cells ${late.max('infected').toFixed(0)} vs ${naive.max('infected').toFixed(0)}`);
  assert.ok(late.maxSign('fever') < 0.1, 'no fever');
  assert.ok(early.max('infected') > 0.7 * naive.max('infected'), 'day 3: not yet protected');
  assert.ok(drift.max('infected') > 0.7 * naive.max('infected'), 'a changed strain: not protected');
});

test('borrowed antibody protects at once, fades with a three-week half-life, and leaves no memory', () => {
  const b = person(b => b.giveAntibody('virus', { amount: 400 }));
  const before = b.specific('virus', 'A').total;
  between(b.antibodyTo('virus', 'A'), 395, 400, 'antibody at once');
  b.advance(21 * DAY);
  between(b.antibodyTo('virus', 'A'), 190, 210, 'antibody after three weeks');
  assert.equal(b.specific('virus', 'A').total, before, 'the library is unchanged');
  assert.equal(b.specific('virus', 'A').memory, 0, 'no memory cells');
});

test('the same seed gives the same run; another seed gives another library', () => {
  const run = (seed) => { const b = person(b => b.infect('bacterium'), seed); b.advance(8 * DAY); return [b.site.bacteria, b.antibodyTo('bacterium', 'A'), b.lib.B[0].x]; };
  assert.deepEqual(run(3), run(3));
  assert.notEqual(run(3)[2], run(4)[2]);
});

test('every seed a group might get gives the same story: timings in range, the vaccine protects, each knock-out has the same outcome', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = follow(person(b => b.infect('bacterium'), seed), 14);
    between(r.when('firstAntibody'), 3.5, 7.5, `seed ${seed}: first antibody (day)`);
    between(r.when('cleared'), 6.5, 11.5, `seed ${seed}: cleared (day)`);
    const v = follow(person(b => b.infect('virus'), seed), 16, 2, 'virus');
    between(v.when('cleared'), 7, 12.5, `seed ${seed}: virus cleared (day)`);
    const vx = person(b => b.vaccinate('virus'), seed); vx.advance(14 * DAY); vx.takeEvents(); vx.infect('virus');
    const prot = follow(vx, 10, 2, 'virus');
    assert.ok(prot.max('infected') < 0.25 * v.max('infected') && prot.maxSign('fever') < 0.25, `seed ${seed}: the vaccine protects (peak infected ${prot.max('infected').toFixed(0)} vs ${v.max('infected').toFixed(0)})`);
    for (const [knock, kind, cleared] of [[['neutrophils', 0.05], 'bacterium', false], [['neutrophils', 0.05], 'virus', true], [['bcells', 0], 'bacterium', false], [['bcells', 0], 'virus', true], [['tcells', 0], 'bacterium', true], [['tcells', 0], 'virus', false], [['helperT', 0], 'bacterium', false], [['helperT', 0], 'virus', false]]) {
      const k = follow(person(b => { b.set(knock[0], knock[1]); b.infect(kind); }, seed), 21, 6, kind);
      assert.equal(k.when('cleared') != null, cleared, `seed ${seed}: without ${knock[0]}, ${kind} ${cleared ? 'is' : 'is not'} cleared in 21 days`);
    }
  }
});

test('a copy of a person runs on independently of the original', () => {
  const a = person(b => b.infect('bacterium')); a.advance(3 * DAY);
  const b = a.copy(); b.set('helperT', 0);
  a.advance(8 * DAY); b.advance(8 * DAY);
  assert.equal(a.site.bacteria, 0, 'the original clears the infection');
  assert.ok(b.site.bacteria > 1e5 && b.antibodyTo('bacterium', 'A') < 1, 'the copy without helper T cells does not');
});

// ------------------------------------------------------------------ reading MHC class I by hand
test('a row of airway cells: untouched, the virus spreads; killing the infected cells in time stops it', () => {
  const left = new Patch(); left.advance(48);
  assert.ok(left.healthy <= 2, `left alone, ${left.healthy} of 12 cells are still healthy after two days`);
  const p = new Patch();
  assert.ok(p.shows(2) && p.shows(8) && !p.shows(3), 'only infected cells show viral fragments');
  assert.equal(p.kill(2), 'infected'); assert.equal(p.kill(8), 'infected');
  p.advance(48);
  assert.equal(p.healthy, 10, 'the ten healthy cells survive');
  const q = new Patch(); assert.equal(q.kill(5), 'healthy'); assert.equal(q.killedHealthy, 1);
  const late = new Patch(); late.advance(7); assert.ok(!late.cells.some((c, i) => c.state === 'healthy' && late.shows(i)));
  late.advance(2); late.kill(2); late.kill(8); late.advance(48);
  assert.ok(late.healthy < 10, 'killing them after they have released virus is too late for the neighbours');
});
