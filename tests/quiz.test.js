import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, ITEM_BY_ID, SECTIONS } from '../public/js/catalog.js';
import { nameMatches, normalize, searchMatches } from '../public/js/match.js';
import { questionPool, functionChoices, nameChoices } from '../public/js/quiz.js';

const ok = (typed, id) => nameMatches(typed, ITEM_BY_ID[id], ITEMS);

test('typed names: exact, alternative names and small misspellings are accepted', () => {
  assert.ok(ok('Sternocleidomastoid', 'sternocleidomastoid'));
  assert.ok(ok('sternocleidomastiod', 'sternocleidomastoid'));
  assert.ok(ok('SCM', 'sternocleidomastoid'));
  assert.ok(ok('semitendinosos', 'semitendinosus'));
  assert.ok(ok('peroneus longus', 'fibularis-longus'));
  assert.ok(ok('quads', 'quadriceps-femoris'));
  assert.ok(ok('frontalis', 'frontalis'));
  assert.ok(ok('the deltoid muscle', 'deltoid'));
  assert.ok(ok('achilles tendon', 'calcaneal-tendon'));
  assert.ok(ok('erector spinae', 'erector-spinae'));
  assert.ok(ok('gastrocnemeus', 'gastrocnemius'));
});

test('typed names: a different muscle is never accepted', () => {
  assert.ok(!ok('internal oblique', 'external-oblique'));
  assert.ok(!ok('external oblique', 'internal-oblique'));
  assert.ok(!ok('external intercostals', 'internal-intercostals'));
  assert.ok(!ok('rectus femoris', 'rectus-abdominis'));
  assert.ok(!ok('biceps femoris', 'biceps-brachii'));
  assert.ok(!ok('vastus medialis', 'vastus-lateralis'));
  assert.ok(!ok('pectoralis minor', 'pectoralis-major'));
  assert.ok(!ok('semimembranosus', 'semitendinosus'));
  assert.ok(!ok('iliacus', 'iliocostalis'));
  assert.ok(!ok('', 'deltoid'));
  assert.ok(!ok('muscle', 'deltoid'));
});

test('every name in the list is accepted for itself', () => {
  for (const it of ITEMS.filter((i) => i.kind !== 'think')) assert.ok(ok(it.name, it.id), it.name);
});

test('normalize and search', () => {
  assert.equal(normalize('Calcaneal (Achilles) tendon'), 'calcaneal tendon');
  assert.ok(searchMatches('vast', ITEM_BY_ID['vastus-medialis']));
  assert.ok(searchMatches('pec', ITEM_BY_ID['pectoralis-minor']));
  assert.ok(!searchMatches('pec', ITEM_BY_ID.deltoid));
});

test('question pools respect sections and types', () => {
  const all = SECTIONS.map((s) => s.id);
  assert.ok(questionPool('find', all).length >= 50);
  for (const it of questionPool('fn', all)) assert.ok(it.fn && it.kind !== 'tendon');
  assert.ok(questionPool('find', ['wrist-hand']).length === 0, 'think questions are not quizzed');
  const knee = questionPool('find', ['knee-leg']).map((i) => i.id);
  assert.ok(knee.includes('rectus-femoris') && knee.includes('hamstrings') && !knee.includes('biceps-femoris'));
});

test('function choices: four different statements, one of them right', () => {
  for (const it of ITEMS.filter((i) => i.fn && i.kind !== 'think')) {
    const c = functionChoices(it);
    assert.equal(c.length, 4);
    assert.equal(new Set(c.map(normalize)).size, 4);
    assert.equal(c.filter((f) => f === it.fn).length, 1);
  }
});

test('name choices never include the answer’s group or members', () => {
  for (const it of ITEMS.filter((i) => i.kind !== 'think')) {
    const c = nameChoices(it);
    assert.equal(c.length, 4);
    assert.ok(c.includes(it.id));
    for (const id of c) if (id !== it.id) {
      assert.notEqual(id, it.group);
      assert.ok(!(it.members || []).includes(id));
      assert.notEqual(ITEM_BY_ID[id].group ?? null, it.kind === 'group' ? it.id : '__');
    }
  }
});
