// The catalog is the one list of simulations: the home page draws it and build.js publishes it.
// These tests keep the repository and the list from drifting apart (see CLAUDE.md).
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const { GROUPS, SIMS } = require('../catalog.js');

// Folders that hold no simulation pages of their own.
const NOT_PAGES = new Set(['dist', 'v1', 'node_modules', 'docs', 'tests', 'assignments']);

function pagesInRepo() {
  const found = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.isFile() && e.name.endsWith('.html') && e.name !== 'index.html') found.push(e.name);
    if (e.isDirectory() && !NOT_PAGES.has(e.name)) {
      for (const f of fs.readdirSync(path.join(root, e.name))) if (f.endsWith('.html')) found.push(e.name + '/' + f);
    }
  }
  return found.sort();
}

test('every simulation page in the repository is listed in catalog.js', () => {
  const listed = new Set(SIMS.map(s => s.src));
  const missing = pagesInRepo().filter(p => !listed.has(p));
  assert.deepStrictEqual(missing, [], `not in catalog.js, so not on the home page and not published: ${missing.join(', ')}`);
});

test('every catalog entry is complete and points at a page that exists', () => {
  for (const s of SIMS) {
    for (const k of ['id', 'title', 'subtitle', 'group', 'src', 'page', 'summary', 'color']) assert.ok(s[k], `${s.id || s.title}: ${k} is missing`);
    assert.ok(Number.isInteger(s.scenes) && s.scenes > 0, `${s.id}: scenes`);
    assert.ok(fs.existsSync(path.join(root, s.src)), `${s.id}: ${s.src} does not exist`);
    assert.match(s.page, /^[a-z0-9-]+\.html$/, `${s.id}: page must be a flat file name`);
    assert.notStrictEqual(s.page, 'index.html', `${s.id}: index.html is the home page`);
    if (s.frozen) assert.ok(fs.existsSync(path.join(root, s.frozen.href)), `${s.id}: frozen copy ${s.frozen.href} does not exist`);
  }
  for (const k of ['id', 'page', 'src']) assert.strictEqual(new Set(SIMS.map(s => s[k])).size, SIMS.length, `duplicate ${k}`);
  assert.ok(GROUPS.every(g => g.name));
});

test('every simulation links back to the home page', () => {
  for (const s of SIMS) {
    const up = path.dirname(s.src) === '.' ? '' : '../';
    assert.ok(fs.readFileSync(path.join(root, s.src), 'utf8').includes(`<a class="home" href="${up}index.html"`), `${s.src}: no <a class="home" href="${up}index.html"> in the header`);
  }
});

test('the home page draws its cards from catalog.js', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('<script src="catalog.js"></script>'));
  assert.ok(html.includes('window.CATALOG_BUILT = false;'));
});
