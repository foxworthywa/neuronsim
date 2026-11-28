// Bundle each page into one self-contained file under dist/: every <script src="..."> and
// <link rel="stylesheet" href="..."> that points at a local file is inlined (nested paths such
// as scenes/shared.js included).
// WHAT is published comes from catalog.js, the one list of simulations: the home page
// (index.html) draws its cards from it and this script builds exactly its pages, so a page
// cannot be published without also being listed on the home page. Every page must also link
// back to the home page (<a class="home" ...>); the build stops if one does not.
// Pages in their own folder (heart/, endo/, ...) resolve their files relative to that folder.
// Frozen releases (v1/) are copied through untouched so their URLs keep working forever.
// Usage: node build.js            → dist/index.html (home), dist/<page> for each catalog entry, dist/v1/*
const fs = require('fs'), path = require('path');
const root = __dirname;
const { SIMS } = require('./catalog.js');
const HOME = 'index.html';
const FROZEN = ['v1'];   // already-bundled snapshots: copied verbatim, never rebuilt
const isLocal = (p) => !/^(https?:)?\/\//.test(p) && !p.startsWith('data:');

function inline(html, base = root) {
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    if (!isLocal(src)) return m;
    const js = fs.readFileSync(path.join(base, src), 'utf8').replace(/<\/script>/g, '<\\/script>');
    return `<script>\n${js}\n</script>`;
  });
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
    if (!isLocal(href)) return m;
    const css = fs.readFileSync(path.join(base, href), 'utf8').replace(/<\/style>/g, '<\\/style>');
    return `<style>\n${css}\n</style>`;
  });
  return html;
}

const write = (out, html) => {
  fs.writeFileSync(path.join(root, 'dist', out), html);
  console.log(`wrote dist/${out}`, (html.length / 1024).toFixed(0), 'KB');
};

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });

// The home page: links go to the published (flat) page names.
{
  const html = inline(fs.readFileSync(path.join(root, HOME), 'utf8'));
  if (!html.includes('window.CATALOG_BUILT = false;')) throw new Error(`${HOME}: the CATALOG_BUILT marker is missing`);
  write(HOME, html.replace('window.CATALOG_BUILT = false;', 'window.CATALOG_BUILT = true;'));
}

for (const sim of SIMS) {
  const src = path.join(root, sim.src);
  if (sim.page === HOME) throw new Error(`${sim.id}: ${HOME} is the home page; publish under another name`);
  const nested = path.dirname(sim.src) !== '.';
  const homeLink = `<a class="home" href="${nested ? '../' : ''}${HOME}"`;
  const raw = fs.readFileSync(src, 'utf8');
  if (!raw.includes(homeLink)) throw new Error(`${sim.src}: no link back to the home page (expected ${homeLink} ...> in the header)`);
  // a page in its own folder reaches the home page with ../ in the repository, but sits beside it once published
  write(sim.page, inline(raw, path.dirname(src)).split(homeLink).join(`<a class="home" href="${HOME}"`));
}

for (const dir of FROZEN) {
  const from = path.join(root, dir);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.join(root, 'dist', dir), { recursive: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(root, 'dist', dir, f));
  console.log(`copied ${dir}/ (frozen release)`);
}
