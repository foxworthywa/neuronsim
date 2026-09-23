// Quiz mode: "Find it" (click it on the model), "Name it" (type or choose the name) and "What does it do?"
// (choose the function). Questions come from the sections the student picks; missed ones can be retried.

import { SECTIONS, ITEMS, ITEM_BY_ID, itemSection } from './catalog.js';
import { nameMatches, normalize } from './match.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const TYPES = {
  find: { label: 'Find it', help: 'Click the named muscle on the model' },
  name: { label: 'Name it', help: 'Type or choose the name of the highlighted muscle' },
  fn: { label: 'What does it do?', help: 'Pick the function of the highlighted muscle' },
};

/** Items that can be asked about, by question type. */
export function questionPool(type, sectionIds) {
  const inSections = (it) => { const s = itemSection(it); return s && sectionIds.includes(s.id); };
  return ITEMS.filter((it) => {
    if (it.kind === 'think' || !inSections(it)) return false;
    if (type === 'fn') return it.kind !== 'tendon' && !!it.fn;
    return true;
  });
}

/** Function-question distractors must read differently from the right answer. */
export function functionChoices(target, count = 4) {
  const want = normalize(target.fn);
  const seen = new Set([want]);
  const others = [];
  for (const it of shuffle(ITEMS.filter((i) => i.fn && i.kind !== 'think'))) {
    const n = normalize(it.fn);
    if (seen.has(n)) continue;
    seen.add(n);
    others.push(it.fn);
    if (others.length === count - 1) break;
  }
  return shuffle([target.fn, ...others]);
}

/** Name-question distractors: not the target, its group or its members; prefer the same section. */
export function nameChoices(target, count = 4) {
  const related = new Set([target.id, target.group, ...(target.members || [])]);
  const sec = itemSection(target);
  const ok = ITEMS.filter((i) => i.kind !== 'think' && !related.has(i.id) && !(i.group && i.group === target.id) && i.name !== target.name);
  const same = shuffle(ok.filter((i) => itemSection(i) === sec)).slice(0, 2);
  const rest = shuffle(ok.filter((i) => !same.includes(i)));
  return shuffle([target, ...same, ...rest].slice(0, count)).map((i) => i.id);
}

const STORE_KEY = 'muscle-explorer.quiz';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch { /* private mode: fine */ }
}

export class Quiz {
  constructor(app, el) {
    this.app = app;
    this.el = el;
    const p = loadPrefs();
    this.prefs = {
      sections: Array.isArray(p.sections) ? p.sections.filter((s) => SECTIONS.some((x) => x.id === s)) : SECTIONS.map((s) => s.id),
      types: Array.isArray(p.types) && p.types.length ? p.types.filter((t) => TYPES[t]) : Object.keys(TYPES),
      length: p.length ?? 10,
    };
    this.run = null;
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => this.onChange(e));
    el.addEventListener('submit', (e) => { e.preventDefault(); this.checkTyped(); });
    app.quizGhost = () => this.ghost();
  }

  open() { if (this.run && !this.run.done) this.renderQuestion(); else this.renderSetup(); }
  close() { this.app.viewer.setHighlight(new Map()); this.app.viewer.clearGhosts(); }

  // ── Setup ──────────────────────────────────────────────────────────────────────────────────
  buildQuestions(sections = this.prefs.sections, types = this.prefs.types) {
    const qs = [];
    for (const t of types) for (const it of questionPool(t, sections)) qs.push({ type: t, id: it.id });
    shuffle(qs);
    // avoid the same muscle twice in a row
    for (let i = 1; i < qs.length; i++) if (qs[i].id === qs[i - 1].id) {
      const j = qs.findIndex((q, k) => k > i && q.id !== qs[i].id);
      if (j > 0) [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs;
  }

  renderSetup() {
    const { prefs } = this;
    const total = this.buildQuestions().length;
    const n = prefs.length === 'all' ? total : Math.min(prefs.length, total);
    this.el.innerHTML = `<div class="quiz-wrap">
      <h2>Quiz yourself</h2>
      <p class="lead">Pick what you're studying. Hover names are turned off while you quiz.</p>
      <fieldset class="fieldset"><legend>Sections</legend>
        <div class="row-actions"><button type="button" class="link-btn" data-sec="all">Select all</button><button type="button" class="link-btn" data-sec="none">Clear</button></div>
        ${SECTIONS.filter((s) => questionPool('find', [s.id]).length).map((s) => `<label class="check"><input type="checkbox" name="sec" value="${s.id}" ${prefs.sections.includes(s.id) ? 'checked' : ''}> ${esc(s.title)}</label>`).join('')}
      </fieldset>
      <fieldset class="fieldset"><legend>Question types</legend>
        ${Object.entries(TYPES).map(([k, t]) => `<label class="check"><input type="checkbox" name="type" value="${k}" ${prefs.types.includes(k) ? 'checked' : ''}><span>${t.label}<small>${t.help}</small></span></label>`).join('')}
      </fieldset>
      <fieldset class="fieldset"><legend>Length</legend>
        <div class="seg" role="group" aria-label="Number of questions">
          ${[10, 20, 'all'].map((v) => `<button type="button" data-len="${v}" aria-pressed="${prefs.length === v}">${v === 'all' ? `All (${total})` : v}</button>`).join('')}
        </div>
      </fieldset>
      <button type="button" class="btn primary" data-start ${n ? '' : 'disabled'}>${n ? `Start — ${n} question${n === 1 ? '' : 's'}` : 'Choose a section and a question type'}</button>
    </div>`;
  }

  onChange(e) {
    if (e.target.name === 'sec') this.prefs.sections = [...this.el.querySelectorAll('input[name=sec]:checked')].map((i) => i.value);
    else if (e.target.name === 'type') this.prefs.types = [...this.el.querySelectorAll('input[name=type]:checked')].map((i) => i.value);
    else return;
    savePrefs(this.prefs);
    this.renderSetup();
  }

  onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.sec) {
      this.prefs.sections = d.sec === 'all' ? SECTIONS.map((s) => s.id) : [];
      savePrefs(this.prefs);
      this.renderSetup();
    } else if (d.len) {
      this.prefs.length = d.len === 'all' ? 'all' : +d.len;
      savePrefs(this.prefs);
      this.renderSetup();
    } else if ('start' in d) {
      const qs = this.buildQuestions();
      this.start(this.prefs.length === 'all' ? qs : qs.slice(0, this.prefs.length));
    } else if ('next' in d) this.next();
    else if ('showme' in d) this.reveal(true);
    else if ('choices' in d) { this.q.showChoices = true; this.renderQuestion(); }
    else if (d.pickName) this.checkName(d.pickName, true);
    else if (d.pickFn !== undefined) this.checkFn(+d.pickFn);
    else if ('retry' in d) this.start(shuffle(this.run.missed.slice()));
    else if ('setup' in d) { this.run = null; this.close(); this.renderSetup(); }
    else if (d.review) this.app.review(d.review);
    else if ('quit' in d) this.finish();
  }

  // ── Running ────────────────────────────────────────────────────────────────────────────────
  start(questions) {
    this.run = { questions, i: -1, score: 0, missed: [], done: false };
    this.next();
  }

  get q() { return this.run.questions[this.run.i]; }

  next() {
    const run = this.run;
    run.i++;
    if (run.i >= run.questions.length) return this.finish();
    const q = this.q;
    Object.assign(q, { answered: false, attempts: 0, showChoices: false, feedback: null, typed: '' });
    const { viewer } = this.app;
    viewer.setHighlight(new Map());
    viewer.clearGhosts();
    this.showTarget = q.type !== 'find';
    if (q.type === 'find') viewer.reset();
    else {
      viewer.setHighlight(this.targetMap('selected'));
      this.app.flyTo(q.id);
    }
    if (q.type === 'name') q.choices = nameChoices(ITEM_BY_ID[q.id]);
    if (q.type === 'fn') q.choices = functionChoices(ITEM_BY_ID[q.id]);
    this.renderQuestion();
    if (q.type === 'name') this.el.querySelector('input[name=answer]')?.focus({ preventScroll: true });
  }

  targetMap(style, extra) {
    const map = new Map(extra || []);
    for (const m of this.app.partsOf(this.q.id)) map.set(m, style);
    return map;
  }

  /** Keep the highlighted target visible when the camera stops. */
  ghost() {
    if (!this.run || this.run.done || !this.showTarget) return this.app.viewer.clearGhosts();
    const ids = this.app.partsOf(this.q.id);
    const lateral = ids.filter((m) => this.app.viewer.parts.get(m).side !== 'M');
    const side = lateral.length ? this.app.viewer.sideInView(lateral) : 'M';
    this.app.viewer.ghostOccluders(this.app.sideParts(ids, side));
  }

  renderQuestion() {
    const run = this.run, q = this.q, it = ITEM_BY_ID[q.id];
    const pct = (run.i / run.questions.length) * 100;
    let body = '';
    if (q.type === 'find') {
      const what = it.kind === 'group' ? `any muscle of the <b>${esc(it.name)}</b>` : `the <b>${esc(it.name)}</b>`;
      body = `<div class="q-prompt">Click ${what} on the model.</div>
        <p class="lead">Either side counts. Rotate, zoom, or use <i>Peel away</i> if it's deep.</p>`;
    } else if (q.type === 'name') {
      body = `<div class="q-prompt">Name the highlighted ${it.kind === 'group' ? 'group' : it.kind === 'tendon' ? 'structure' : 'muscle'}.</div>`;
      if (!q.showChoices) {
        body += `<form class="answer-row" autocomplete="off"><input name="answer" placeholder="Type the name…" aria-label="Your answer" value="${esc(q.typed)}" ${q.answered ? 'disabled' : ''} autocapitalize="off" spellcheck="false">
          <button class="btn primary" ${q.answered ? 'disabled' : ''}>Check</button></form>
          ${q.answered ? '' : '<p style="margin:8px 0 0"><button type="button" class="link-btn" data-choices>Show choices instead</button></p>'}`;
      } else {
        body += `<div class="choices">${q.choices.map((id) => `<button class="choice ${this.choiceClass(id === q.id, q.pick === id)}" data-pick-name="${id}" ${q.answered ? 'disabled' : ''}>${esc(ITEM_BY_ID[id].name)}</button>`).join('')}</div>`;
      }
    } else {
      body = `<div class="q-prompt">What does the <b>${esc(it.name)}</b> do?</div>
        <div class="choices">${q.choices.map((fn, k) => `<button class="choice ${this.choiceClass(fn === it.fn, q.pick === k)}" data-pick-fn="${k}" ${q.answered ? 'disabled' : ''}>${esc(fn)}</button>`).join('')}</div>`;
    }
    const fb = q.feedback ? `<div class="feedback ${q.feedback.cls}" role="status">${q.feedback.html}</div>` : '';
    const actions = q.answered
      ? `<button type="button" class="btn primary" data-next>${run.i + 1 < run.questions.length ? 'Next question →' : 'See results'}</button>`
      : `<button type="button" class="btn" data-showme>Show me</button>`;
    const legend = q.type === 'find' && q.answered && q.attempts
      ? '<div class="legend-inline"><span class="swatch" style="background:#2eb35a"></span>answer<span class="swatch" style="background:#8c5cf0"></span>your pick</div>' : '';
    this.el.innerHTML = `<div class="quiz-wrap">
      <div class="q-progress"><span>Question ${run.i + 1} of ${run.questions.length}</span><span>Score ${run.score}</span></div>
      <div class="q-bar"><div style="width:${pct}%"></div></div>
      <div class="q-kind">${TYPES[q.type].label}</div>
      ${body}${fb}${legend}
      <div class="q-actions">${actions}<button type="button" class="btn" data-quit style="margin-left:auto">End quiz</button></div>
    </div>`;
  }

  choiceClass(isRight, isPicked) {
    if (!this.q.answered) return '';
    if (isRight) return 'correct';
    return isPicked ? 'wrong' : '';
  }

  // ── Answers ────────────────────────────────────────────────────────────────────────────────
  right(html) {
    const q = this.q;
    q.answered = true;
    if (!q.attempts) this.run.score++;
    else this.run.missed.push({ type: q.type, id: q.id });
    q.feedback = { cls: 'good', html };
    this.showTarget = true;
    this.renderQuestion();
  }

  wrongFinal(html) {
    const q = this.q;
    q.answered = true;
    q.attempts++;
    this.run.missed.push({ type: q.type, id: q.id });
    q.feedback = { cls: 'bad', html };
    this.showTarget = true;
    this.renderQuestion();
  }

  /** Show the answer on the model (after a miss or "Show me"). */
  reveal(gaveUp) {
    const q = this.q, it = ITEM_BY_ID[q.id];
    const { viewer } = this.app;
    if (q.type === 'find') {
      viewer.setHighlight(this.targetMap('correct', [...viewer.state.highlight].filter(([, s]) => s === 'wrong')));
      this.app.flyTo(q.id);
      if (gaveUp) q.attempts++;
      this.wrongFinal(`Here it is: the <b>${esc(it.name)}</b>.`);
    } else if (q.type === 'name') {
      q.showChoices = true;
      q.attempts++;
      this.wrongFinal(`It's the <b>${esc(it.name)}</b>.`);
    } else {
      q.attempts++;
      this.wrongFinal(`The <b>${esc(it.name)}</b>: ${esc(it.fn)}`);
    }
  }

  onPick(part) {
    if (!this.run || this.run.done || !part) return;
    const q = this.q;
    if (q.answered || q.type !== 'find') return;
    const target = ITEM_BY_ID[q.id];
    const { viewer } = this.app;
    const item = this.app.itemOfPart(part);
    const hit = item && (item.id === target.id || (target.kind === 'group' && item.group === target.id));
    if (hit) {
      viewer.setHighlight(this.targetMap('correct'));
      return this.right(`Correct — that's the <b>${esc(target.name)}</b>.`);
    }
    q.attempts++;
    const what = item ? `the <b>${esc(item.name)}</b>` : part.kind === 'bone' ? `a bone (${esc(part.name.replace(/^(left|right) /, ''))})` : 'a muscle that isn’t on the list';
    const wrongIds = item ? this.app.partsOf(item.id) : [part.id];
    viewer.setHighlight(new Map(wrongIds.map((m) => [m, 'wrong'])));
    if (q.attempts >= 2) {
      viewer.setHighlight(this.targetMap('correct', wrongIds.map((m) => [m, 'wrong'])));
      this.app.flyTo(q.id);
      return this.wrongFinal(`That's ${what}. Here is the <b>${esc(target.name)}</b>.`);
    }
    q.feedback = { cls: 'bad', html: `That's ${what}. Try again.` };
    this.renderQuestion();
  }

  checkTyped() {
    const q = this.q;
    if (!q || q.answered || q.type !== 'name') return;
    const input = this.el.querySelector('input[name=answer]');
    const typed = input ? input.value : '';
    q.typed = typed;
    if (!typed.trim()) return;
    this.checkName(typed, false);
  }

  checkName(answer, fromChoice) {
    const q = this.q, it = ITEM_BY_ID[q.id];
    if (q.answered) return;
    if (fromChoice) q.pick = answer;
    const ok = fromChoice ? answer === q.id : nameMatches(answer, it, ITEMS);
    if (ok) return this.right(`Correct — the <b>${esc(it.name)}</b>.`);
    if (!fromChoice) {
      const g = it.group && ITEM_BY_ID[it.group];
      if (g && nameMatches(answer, g, ITEMS)) {
        q.feedback = { cls: 'info', html: `That's the group it belongs to. Which muscle of the ${esc(g.name)} is it?` };
        return this.renderQuestion();
      }
      if (it.kind === 'group' && it.members.some((m) => nameMatches(answer, ITEM_BY_ID[m], ITEMS))) {
        q.feedback = { cls: 'info', html: 'That’s one muscle of this group. What is the whole group called?' };
        return this.renderQuestion();
      }
      if (!q.attempts) {
        q.attempts++;
        q.feedback = { cls: 'bad', html: 'Not quite. Try again, or show the choices.' };
        return this.renderQuestion();
      }
    }
    q.attempts++;
    q.showChoices = true;
    this.wrongFinal(`It's the <b>${esc(it.name)}</b>.`);
  }

  checkFn(k) {
    const q = this.q, it = ITEM_BY_ID[q.id];
    if (q.answered) return;
    q.pick = k;
    if (q.choices[k] === it.fn) return this.right('Correct.');
    q.attempts++;
    this.wrongFinal(`The <b>${esc(it.name)}</b>: ${esc(it.fn)}`);
  }

  finish() {
    const run = this.run;
    run.done = true;
    const asked = Math.min(run.questions.length, run.i + (this.q && this.q.answered ? 1 : 0));
    this.app.viewer.setHighlight(new Map());
    this.app.viewer.clearGhosts();
    this.showTarget = false;
    const pct = asked ? Math.round((run.score / asked) * 100) : 0;
    const missed = [...new Map(run.missed.map((m) => [`${m.type}:${m.id}`, m])).values()];
    run.missed = missed;
    this.el.innerHTML = `<div class="quiz-wrap">
      <h2>Results</h2>
      <p class="score-big">${run.score} / ${asked}</p>
      <p class="lead">${asked ? `${pct}% right on the first try.` : 'No questions answered.'}</p>
      ${missed.length ? `<h3 style="margin:14px 0 0;font-size:15px">To review</h3><ul class="missed">${missed.map((m) => `<li><span>${esc(ITEM_BY_ID[m.id].name)} <small>· ${TYPES[m.type].label}</small></span><button class="btn small" data-review="${m.id}">Review</button></li>`).join('')}</ul>` : ''}
      <div class="q-actions">
        ${missed.length ? '<button type="button" class="btn primary" data-retry>Retry the ones I missed</button>' : ''}
        <button type="button" class="btn" data-setup>New quiz</button>
      </div></div>`;
  }
}
