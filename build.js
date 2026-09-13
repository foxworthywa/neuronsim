// Bundle each page into one self-contained file under dist/: every <script src="..."> and
// <link rel="stylesheet" href="..."> that points at a local file is inlined (nested paths such
// as scenes/shared.js included). Pages that do not exist yet are skipped with a note.
// Frozen releases (v1/) are copied through untouched so their URLs keep working forever.
// Usage: node build.js            → dist/index.html, dist/muscle.html, dist/v1/*
const fs = require('fs'), path = require('path');
const root = __dirname;
const PAGES = ['index.html', 'muscle.html'];
const FROZEN = ['v1'];   // already-bundled snapshots: copied verbatim, never rebuilt
const isLocal = (p) => !/^(https?:)?\/\//.test(p) && !p.startsWith('data:');

function inline(html) {
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    if (!isLocal(src)) return m;
    const js = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script>/g, '<\\/script>');
    return `<script>\n${js}\n</script>`;
  });
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
    if (!isLocal(href)) return m;
    const css = fs.readFileSync(path.join(root, href), 'utf8').replace(/<\/style>/g, '<\\/style>');
    return `<style>\n${css}\n</style>`;
  });
  return html;
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const page of PAGES) {
  const src = path.join(root, page);
  if (!fs.existsSync(src)) { console.log(`skip ${page}: not found (not built yet)`); continue; }
  const html = inline(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(path.join(root, 'dist', page), html);
  console.log(`wrote dist/${page}`, (html.length / 1024).toFixed(0), 'KB');
}

for (const dir of FROZEN) {
  const from = path.join(root, dir);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.join(root, 'dist', dir), { recursive: true });
  for (const f of fs.readdirSync(from)) fs.copyFileSync(path.join(from, f), path.join(root, 'dist', dir, f));
  console.log(`copied ${dir}/ (frozen release)`);
}
