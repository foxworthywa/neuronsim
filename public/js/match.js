// Forgiving answer matching for typed quiz answers.

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|muscle|muscles|m)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Spelling tolerance grows with the length of the expected answer. */
function tolerance(expected) {
  const n = expected.replace(/ /g, '').length;
  return n <= 4 ? 0 : n <= 7 ? 1 : n <= 12 ? 2 : 3;
}

function distanceTo(n, item) {
  let best = Infinity, tol = 0;
  for (const c of [item.name, ...(item.aka || [])].map(normalize)) {
    if (!c) continue;
    const d = levenshtein(n, c);
    if (d < best) { best = d; tol = tolerance(c); }
  }
  return { d: best, tol };
}

/**
 * Does a typed answer name this item? Accepts the listed name, common alternatives and small misspellings — but only
 * if the answer is closer to this item than to any other item in `all` ("internal oblique" never passes for
 * "external oblique", even though they are two letters apart).
 */
export function nameMatches(input, item, all = []) {
  const n = normalize(input);
  if (!n) return false;
  const mine = distanceTo(n, item);
  if (mine.d > mine.tol) return false;
  return all.every((other) => other === item || other.name === item.name || distanceTo(n, other).d > mine.d);
}

/** Search filter: every word of the query appears at the start of a word in the name or an alternative. */
export function searchMatches(query, item) {
  const q = normalize(query).split(' ').filter(Boolean);
  if (!q.length) return true;
  const hay = [item.name, ...(item.aka || [])].map(normalize).join(' ').split(' ');
  return q.every((w) => hay.some((h) => h.startsWith(w)));
}
