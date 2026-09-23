// Checks that the course list, the model and the quiz agree with each other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SECTIONS, ITEMS, ITEM_BY_ID, itemFunction, itemSection } from '../public/js/catalog.js';

const index = JSON.parse(fs.readFileSync(new URL('../public/model/parts.json', import.meta.url)));
const parts = index.parts;

test('every catalog mesh is in the model and is soft tissue', () => {
  for (const it of ITEMS) for (const m of it.meshes || []) {
    assert.ok(parts[m], `${it.id}: ${m} missing from parts.json`);
    assert.notEqual(parts[m].kind, 'bone', `${it.id}: ${m} is a bone`);
  }
});

test('no mesh belongs to two items', () => {
  const seen = new Map();
  for (const it of ITEMS) for (const m of it.meshes || []) {
    assert.ok(!seen.has(m), `${m} is in ${seen.get(m)} and ${it.id}`);
    seen.set(m, it.id);
  }
});

test('paired structures have a left and a right side', () => {
  for (const it of ITEMS.filter((i) => i.meshes)) {
    const sides = new Set(it.meshes.map((m) => parts[m].side));
    if (sides.has('M') && sides.size === 1) continue; // midline structures (diaphragm, orbicularis oris, intercostal sheets)
    assert.ok(sides.has('L') && sides.has('R'), `${it.id} has sides ${[...sides]}`);
  }
});

test('sections and groups reference real items, and every item is reachable from the list', () => {
  const reachable = new Set();
  for (const s of SECTIONS) for (const id of s.entries) {
    assert.ok(ITEM_BY_ID[id], `section ${s.id} lists unknown item ${id}`);
    reachable.add(id);
    for (const m of ITEM_BY_ID[id].members || []) reachable.add(m);
  }
  for (const it of ITEMS) {
    assert.ok(reachable.has(it.id), `${it.id} is not listed in any section`);
    if (it.kind === 'group') for (const m of it.members) assert.equal(ITEM_BY_ID[m].group, it.id, `${m} should point back to ${it.id}`);
    if (it.group) assert.ok(ITEM_BY_ID[it.group].members.includes(it.id), `${it.group} should include ${it.id}`);
    assert.ok(itemSection(it), `${it.id} has no section`);
  }
});

test('every muscle and group has a function to show (own or its group’s)', () => {
  for (const it of ITEMS.filter((i) => i.kind === 'muscle' || i.kind === 'group')) assert.ok(itemFunction(it), `${it.id} has no function`);
});

test('the handout list is complete', () => {
  const names = ITEMS.map((i) => i.name.toLowerCase());
  const handout = ['frontal belly of occipitofrontalis', 'orbicularis oculi', 'orbicularis oris', 'temporalis', 'masseter',
    'sternocleidomastoid', 'diaphragm', 'external intercostals', 'internal intercostals', 'external oblique', 'internal oblique',
    'transversus abdominis', 'rectus abdominis', 'erector spinae group', 'iliocostalis', 'longissimus', 'spinalis',
    'pectoralis minor', 'serratus anterior', 'trapezius', 'pectoralis major', 'latissimus dorsi', 'deltoid', 'supraspinatus',
    'infraspinatus', 'teres minor', 'subscapularis', 'brachialis', 'biceps brachii', 'triceps brachii', 'brachioradialis',
    'iliacus', 'psoas major', 'tensor fasciae latae', 'gluteus maximus', 'biceps femoris', 'semitendinosus', 'semimembranosus',
    'quadriceps femoris', 'rectus femoris', 'vastus lateralis', 'vastus medialis', 'vastus intermedius', 'sartorius', 'hamstrings',
    'extensor digitorum longus', 'tibialis anterior', 'gastrocnemius', 'soleus', 'fibularis longus'];
  for (const n of handout) assert.ok(names.includes(n), `missing ${n}`);
});

test('model index is consistent', () => {
  assert.ok(index.layers >= 2);
  assert.equal(index.viewDirs.length, 24);
  assert.ok(fs.statSync(new URL('../public/model/body.glb', import.meta.url)).size < 15e6, 'model should stay small');
});
