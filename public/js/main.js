// App controller: wires the 3D viewer to the study list, the info card and the quiz.

import { Viewer, COLORS } from './viewer.js';
import { SECTIONS, ITEMS, ITEM_BY_ID, itemMeshes, itemFunction, itemSection } from './catalog.js';
import { searchMatches } from './match.js';
import { Quiz } from './quiz.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const app = {
  mode: 'explore',
  selection: null, // { kind: 'item', id } | { kind: 'part', id }
  focusSide: null, // side the camera is centred on for the current selection
  seeThrough: true,
  revealed: new Set(),
  tagAnchor: null,
};

const viewer = new Viewer($('#stage'), {
  onPick: (part, point) => (app.mode === 'quiz' ? quiz.onPick(part, point) : onModelPick(part, point)),
  onHover: (part, e) => showTooltip(part, e),
  onCameraRest: () => { refreshGhosts(); },
  onRender: () => placeTag(),
  onInteract: () => { $('#hint').classList.add('gone'); },
});
app.viewer = viewer;

// ── Helpers shared with the quiz ─────────────────────────────────────────────────────────────
/** Mesh ids of an item that exist in the model. */
app.partsOf = (id) => itemMeshes(ITEM_BY_ID[id]).filter((m) => viewer.parts.has(m));
/** The item's parts on one side (midline parts are always included). */
app.sideParts = (ids, side) => ids.filter((m) => { const s = viewer.parts.get(m).side; return s === side || s === 'M'; });
app.itemOfPart = (part) => (part && part.item && viewer.isListed(part) ? ITEM_BY_ID[part.item] : null);

/** Fly to an item: nearest side, best angle; then make whatever covers it see-through. */
app.flyTo = async (id, { ghost = true } = {}) => {
  const ids = app.partsOf(id);
  const side = viewer.nearestSide(ids.filter((m) => viewer.parts.get(m).side !== 'M')) || 'M';
  app.focusSide = side;
  const focus = app.sideParts(ids, side);
  await viewer.frame(focus.length ? focus : ids);
  if (ghost) refreshGhosts();
};

app.toast = (html, ms = 2600) => {
  const t = $('#toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(app._toastTimer);
  app._toastTimer = setTimeout(() => (t.hidden = true), ms);
};

// ── Selection (explore mode) ─────────────────────────────────────────────────────────────────
function highlightFor(id) {
  const map = new Map();
  const item = ITEM_BY_ID[id];
  if (item.group) for (const m of app.partsOf(item.group)) map.set(m, 'groupmate');
  for (const m of app.partsOf(id)) map.set(m, 'selected');
  return map;
}

function selectItem(id, { source = 'list', part = null } = {}) {
  const item = ITEM_BY_ID[id];
  if (!item) return;
  if (item.kind === 'think' && !app.revealed.has(id)) reveal(id, false);
  app.selection = { kind: 'item', id };
  viewer.clearGhosts();
  viewer.setHighlight(highlightFor(id));
  renderCard();
  markCurrentRow(source !== 'list');
  history.replaceState(null, '', `#${id}`);
  if (source === 'list') {
    if (window.innerWidth <= 820) window.scrollTo({ top: 0, behavior: 'smooth' }); // phones: the model is above the list
    app.flyTo(id);
  } else if (part) {
    // Rotate around the side that was clicked, not the midpoint between left and right.
    app.focusSide = part.side;
    const ids = app.sideParts(app.partsOf(id), part.side);
    viewer.pivotTo(viewer.boxOf(ids).getCenter(part.center.clone()));
  }
  updateTag();
}

function selectPart(part) {
  app.selection = { kind: 'part', id: part.id };
  app.focusSide = part.side;
  viewer.clearGhosts();
  viewer.setHighlight(new Map([[part.id, 'selected']]));
  renderCard();
  markCurrentRow();
  history.replaceState(null, '', location.pathname + location.search);
  updateTag();
}

function clearSelection() {
  app.selection = null;
  viewer.clearGhosts();
  viewer.setHighlight(new Map());
  renderCard();
  markCurrentRow();
  history.replaceState(null, '', location.pathname + location.search);
  updateTag();
}

function onModelPick(part) {
  if (!part) return clearSelection();
  const item = app.itemOfPart(part);
  if (item) selectItem(item.id, { source: 'model', part });
  else selectPart(part);
}

function selectedPartIds() {
  if (!app.selection) return [];
  return app.selection.kind === 'item' ? app.partsOf(app.selection.id) : [app.selection.id];
}

/** Keep the selection visible: ghost what covers the side being looked at. */
function refreshGhosts() {
  if (app.mode === 'quiz') return app.quizGhost?.();
  if (!app.selection || !app.seeThrough) return viewer.clearGhosts();
  const ids = selectedPartIds();
  if (app.selection.kind === 'item') {
    const lateral = ids.filter((m) => viewer.parts.get(m).side !== 'M');
    if (lateral.length) app.focusSide = viewer.sideInView(lateral);
  }
  viewer.ghostOccluders(app.sideParts(ids, app.focusSide || 'M').length ? app.sideParts(ids, app.focusSide || 'M') : ids);
  updateTag();
}

// ── Info card ────────────────────────────────────────────────────────────────────────────────
function depthOf(ids) {
  const layers = ids.map((m) => viewer.parts.get(m)?.layer || 1);
  return Math.min(...layers);
}

function depthHtml(ids) {
  const d = depthOf(ids), n = viewer.layers || 3;
  const bars = Array.from({ length: n }, (_, i) => `<i class="${i < d ? 'on' : ''}"></i>`).join('');
  const words = d === 1 ? 'Superficial' : d === n ? 'Deep' : 'Intermediate';
  const more = d === 1 ? '' : ` — ${d - 1} muscle layer${d > 2 ? 's' : ''} above it`;
  return `<span class="depth" aria-hidden="true">${bars}</span>${words}${more}`;
}

function renderCard() {
  const card = $('#card');
  const sel = app.selection;
  if (!sel || app.mode !== 'explore') { card.hidden = true; return; }
  card.hidden = false;
  card.classList.toggle('context', sel.kind === 'part');

  if (sel.kind === 'part') {
    const p = viewer.parts.get(sel.id);
    const isBone = p.kind === 'bone';
    card.innerHTML = `
      <div class="card-top"><div>
        <div class="card-sec">${isBone ? 'Bone' : 'Not on the course list'}</div>
        <h2>${isBone ? esc(cap(p.name)) : 'Other muscle'}</h2>
      </div><button class="close" data-act="close" aria-label="Clear selection">×</button></div>
      <p style="margin:0;color:var(--muted);font-size:14px">${isBone ? 'Shown for landmarks.' : 'Grey muscles are shown for context — you don’t need to know them.'}</p>
      <div class="card-actions"><button class="btn small" data-act="hide">Hide it</button></div>`;
    return;
  }

  const item = ITEM_BY_ID[sel.id];
  const ids = app.partsOf(item.id);
  const sec = itemSection(item);
  let body = '';
  if (item.kind === 'think') {
    body = `<dl><dt>Question</dt><dd>${esc(item.question)}</dd><dt>Answer</dt><dd><b>${esc(item.answer)}</b></dd></dl>
      <p style="margin:8px 0 0;color:var(--muted);font-size:13px">These muscles aren’t on the list individually — know where the group is.</p>`;
  } else {
    const parts = [];
    if (item.group) {
      const g = ITEM_BY_ID[item.group];
      parts.push(`<dt>Part of</dt><dd><button class="chip" data-select="${g.id}">${esc(g.name)}</button></dd>`);
    }
    const fn = itemFunction(item);
    if (fn) {
      const from = fn.from !== item ? `<span style="color:var(--muted)">${esc(fn.from.name)}: </span>` : '';
      parts.push(`<dt>Function</dt><dd>${from}${esc(fn.text)}</dd>`);
    }
    if (item.note) parts.push(`<dt>Note</dt><dd class="note">${esc(item.note)}</dd>`);
    if (item.kind === 'group') {
      parts.push(`<dt>Includes</dt><dd class="chips">${item.members.map((m) => `<button class="chip" data-select="${m}">${esc(ITEM_BY_ID[m].name)}</button>`).join('')}</dd>`);
    }
    parts.push(`<dt>Depth</dt><dd>${depthHtml(ids)}</dd>`);
    body = `<dl>${parts.join('')}</dl>`;
  }
  const isolated = viewer.state.isolate && ids.every((m) => viewer.state.isolate.has(m));
  card.innerHTML = `
    <div class="card-top"><div>
      <div class="card-sec">${esc(sec ? sec.title : '')}</div>
      <h2>${esc(item.name)}</h2>
    </div><button class="close" data-act="close" aria-label="Clear selection">×</button></div>
    ${body}
    <div class="card-actions">
      <button class="btn small" data-act="zoom">Zoom to</button>
      <button class="btn small" data-act="hide">Hide</button>
      <button class="btn small" data-act="isolate" aria-pressed="${isolated}">Isolate</button>
      <button class="btn small" data-act="see" aria-pressed="${app.seeThrough}" title="Make muscles covering it see-through">See-through</button>
    </div>`;
}

$('#card').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.select) return selectItem(b.dataset.select);
  const sel = app.selection;
  if (!sel) return;
  const ids = selectedPartIds();
  switch (b.dataset.act) {
    case 'close': clearSelection(); break;
    case 'zoom': if (sel.kind === 'item') app.flyTo(sel.id); else viewer.frame([sel.id]); break;
    case 'hide':
      viewer.hide(ids);
      clearSelection();
      app.toast('Hidden. Use <b>Show everything</b> to bring it back.');
      updateLayerControls();
      break;
    case 'isolate': {
      const on = b.getAttribute('aria-pressed') !== 'true';
      viewer.setIsolate(on ? ids : null);
      if (on) refreshGhosts();
      renderCard();
      updateLayerControls();
      break;
    }
    case 'see':
      app.seeThrough = !app.seeThrough;
      refreshGhosts();
      renderCard();
      break;
  }
});

// ── 3D tag and hover tooltip ─────────────────────────────────────────────────────────────────
function updateTag() {
  const sel = app.selection;
  if (!sel || app.mode !== 'explore') { app.tagAnchor = null; $('#tag3d').hidden = true; return; }
  let ids = selectedPartIds();
  const side = app.sideParts(ids, app.focusSide || 'M');
  if (side.length) ids = side;
  const box = viewer.boxOf(ids);
  app.tagAnchor = box.getCenter(viewer.parts.get(ids[0]).center.clone());
  $('#tag3d').textContent = sel.kind === 'item' ? ITEM_BY_ID[sel.id].name : viewer.parts.get(sel.id).kind === 'bone' ? cap(viewer.parts.get(sel.id).name) : 'Not on the list';
  placeTag();
}

function placeTag() {
  const tag = $('#tag3d');
  if (!app.tagAnchor) return;
  const p = viewer.project(app.tagAnchor);
  const r = $('#stage').getBoundingClientRect();
  const off = p.behind || p.x < 0 || p.y < 0 || p.x > r.width || p.y > r.height;
  tag.hidden = off;
  if (!off) tag.style.left = `${p.x}px`, tag.style.top = `${p.y}px`;
}

function showTooltip(part, e) {
  const tip = $('#tooltip');
  const hoverIds = [];
  if (!part || !e || app.mode === 'quiz') {
    tip.hidden = true;
    viewer.setHover([]);
    $('#stage').style.cursor = '';
    return;
  }
  const item = app.itemOfPart(part);
  let html;
  if (item) {
    const g = item.group ? ITEM_BY_ID[item.group] : null;
    html = `${esc(item.name)}${g ? ` <span class="dim">· ${esc(g.name)}</span>` : ''}`;
    hoverIds.push(...app.partsOf(item.id));
  } else if (part.kind === 'bone') {
    html = `${esc(cap(part.name))} <span class="dim">· bone</span>`;
    hoverIds.push(part.id);
  } else {
    html = '<span class="dim">Not on the list</span>';
    hoverIds.push(part.id);
  }
  const r = $('#stage').getBoundingClientRect();
  tip.innerHTML = html;
  tip.hidden = false;
  tip.style.left = `${e.clientX - r.left}px`;
  tip.style.top = `${e.clientY - r.top}px`;
  viewer.setHover(hoverIds);
  $('#stage').style.cursor = 'pointer';
}

// ── Study list ───────────────────────────────────────────────────────────────────────────────
function rowHtml(id, cls = '') {
  const it = ITEM_BY_ID[id];
  const tag = it.group && !cls.includes('member') ? `<span class="tag">${esc(ITEM_BY_ID[it.group].name)}</span>` : it.kind === 'group' ? '<span class="tag">group</span>' : '';
  return `<button class="row ${cls}" data-item="${id}">${esc(it.name)}${tag}</button>`;
}

function thinkHtml(id) {
  const it = ITEM_BY_ID[id];
  const open = app.revealed.has(id);
  const color = '#' + COLORS.think[id].toString(16).padStart(6, '0');
  return `<div class="think" data-think="${id}">
    <div class="think-q">${esc(it.question)}</div>
    ${open ? `<div class="think-a"><span class="swatch" style="background:${color}"></span>${esc(it.answer)}</div>` : ''}
    <div class="think-actions">
      ${open ? `<button class="btn small" data-item="${id}">Show on model</button>` : `<button class="btn small primary" data-reveal="${id}">Reveal answer</button>`}
    </div></div>`;
}

function renderList() {
  $('#list').innerHTML = SECTIONS.map((s) => {
    const rows = s.entries.map((id) => {
      const it = ITEM_BY_ID[id];
      if (it.kind === 'think') return thinkHtml(id);
      if (it.kind === 'group') return rowHtml(id, 'group') + it.members.map((m) => rowHtml(m, 'member')).join('');
      return rowHtml(id);
    }).join('');
    return `<section class="sec" data-sec="${s.id}">
      <button class="sec-head" aria-expanded="true">${esc(s.title)}</button>
      <div class="sec-body">${rows}</div></section>`;
  }).join('');
  markCurrentRow();
  applySearch();
}

function markCurrentRow(scroll = false) {
  const id = app.selection?.kind === 'item' ? app.selection.id : null;
  let first = null;
  for (const b of document.querySelectorAll('.row')) {
    const on = b.dataset.item === id;
    b.setAttribute('aria-current', on ? 'true' : 'false');
    if (on && !first) first = b;
  }
  if (scroll && first && window.innerWidth > 820) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

$('#list').addEventListener('click', (e) => {
  const head = e.target.closest('.sec-head');
  if (head) {
    const open = head.getAttribute('aria-expanded') === 'true';
    head.setAttribute('aria-expanded', String(!open));
    head.nextElementSibling.hidden = open;
    return;
  }
  const rev = e.target.closest('[data-reveal]');
  if (rev) return reveal(rev.dataset.reveal, true);
  const row = e.target.closest('[data-item]');
  if (row) selectItem(row.dataset.item);
});

function reveal(id, andSelect) {
  app.revealed.add(id);
  viewer.setRevealed(app.revealed);
  renderList();
  if (andSelect) selectItem(id);
}

function applySearch() {
  const q = $('#search').value;
  for (const sec of document.querySelectorAll('.sec')) {
    let any = false;
    for (const row of sec.querySelectorAll('.row')) {
      const it = ITEM_BY_ID[row.dataset.item];
      const hit = searchMatches(q, it) || (it.kind === 'group' && it.members.some((m) => searchMatches(q, ITEM_BY_ID[m]))) || (it.group && searchMatches(q, ITEM_BY_ID[it.group]));
      row.hidden = !hit;
      any ||= hit;
    }
    for (const t of sec.querySelectorAll('.think')) t.hidden = !!q.trim();
    sec.hidden = !!q.trim() && !any;
    if (q.trim() && any) { sec.querySelector('.sec-head').setAttribute('aria-expanded', 'true'); sec.querySelector('.sec-body').hidden = false; }
  }
}
$('#search').addEventListener('input', applySearch);
$('#search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const first = [...document.querySelectorAll('.row')].find((r) => !r.hidden && !r.closest('.sec').hidden);
  if (first) selectItem(first.dataset.item);
});

// ── View and layer controls ──────────────────────────────────────────────────────────────────
$('.views').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.action === 'reset') viewer.reset();
  else viewer.view(b.dataset.view);
});

const PEEL_WORDS = ['Superficial — nothing removed', 'Outer layer removed', 'Two layers removed', 'Three layers removed'];
$('#peel').addEventListener('input', (e) => {
  viewer.setPeel(+e.target.value);
  updateLayerControls();
  refreshGhosts();
});
$('#show-bones').addEventListener('change', (e) => { viewer.setBones(e.target.checked); refreshGhosts(); });
$('#show-context').addEventListener('change', (e) => { viewer.setContext(e.target.checked); refreshGhosts(); });
$('#btn-show-all').addEventListener('click', () => {
  viewer.showAll();
  $('#peel').value = 0;
  updateLayerControls();
  renderCard();
  refreshGhosts();
});

function updateLayerControls() {
  const s = viewer.state;
  $('#peel').value = s.peel;
  $('#peel-value').textContent = PEEL_WORDS[s.peel] || `${s.peel} layers removed`;
  $('#btn-show-all').hidden = !(s.hidden.size || s.isolate || s.peel);
}

// ── Modes ────────────────────────────────────────────────────────────────────────────────────
function setMode(mode) {
  app.mode = mode;
  $('#tab-explore').setAttribute('aria-selected', String(mode === 'explore'));
  $('#tab-quiz').setAttribute('aria-selected', String(mode === 'quiz'));
  $('#explore').hidden = mode !== 'explore';
  $('#quiz').hidden = mode !== 'quiz';
  showTooltip(null);
  if (mode === 'quiz') {
    app.selection = null;
    viewer.clearGhosts();
    viewer.setHighlight(new Map());
    updateTag();
    history.replaceState(null, '', location.pathname + location.search);
    quiz.open();
  } else {
    quiz.close();
    viewer.clearGhosts();
    viewer.setHighlight(new Map());
    renderCard();
    updateTag();
  }
}
$('#tab-explore').addEventListener('click', () => setMode('explore'));
$('#tab-quiz').addEventListener('click', () => setMode('quiz'));
app.review = (id) => { setMode('explore'); selectItem(id); };

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && app.mode === 'explore' && app.selection && !document.querySelector('dialog[open]')) clearSelection();
});
$('#btn-help').addEventListener('click', () => $('#help').showModal());

// ── Start ────────────────────────────────────────────────────────────────────────────────────
const quiz = new Quiz(app, $('#quiz'));

(async function start() {
  renderList();
  try {
    const index = await (await fetch('model/parts.json')).json();
    await viewer.load('model/body.glb', index, (f) => { $('#load-bar').style.width = `${Math.round(f * 100)}%`; });
    // The catalog, not the model file, decides what is on the list, so editing catalog.js needs no model rebuild.
    for (const p of viewer.parts.values()) delete p.item;
    for (const it of ITEMS) for (const m of it.meshes || []) { const p = viewer.parts.get(m); if (p) p.item = it.id; }
    viewer.refresh();
    $('#peel').max = Math.max(1, (viewer.layers || 3) - 1);
    updateLayerControls();
    $('#loading').hidden = true;
    setTimeout(() => $('#hint').classList.add('gone'), 9000);
    const hash = decodeURIComponent(location.hash.slice(1));
    if (ITEM_BY_ID[hash]) selectItem(hash);
    window.__app = app; // for tests
    window.__quiz = quiz;
    window.__catalog = { ITEM_BY_ID };
  } catch (err) {
    console.error(err);
    $('#load-note').textContent = `Sorry — the model failed to load (${err.message}). Try reloading the page.`;
  }
})();
