// Bundle each page into one self-contained file under dist/: every <script src="..."> and
// <link rel="stylesheet" href="..."> that points at a local file is inlined (nested paths such
// as scenes/shared.js included). Pages that do not exist yet are skipped with a note.
// Usage: node build.js            → dist/index.html, dist/muscle.html
const fs = require('fs'), path = require('path');
const root = __dirname;
const PAGES = ['index.html', 'muscle.html'];
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
