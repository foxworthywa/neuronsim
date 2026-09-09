// Bundle index.html + engine.js + app.js into one self-contained file: dist/index.html
// Usage: node build.js
const fs = require('fs'), path = require('path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const f of ['engine.js', 'app.js']) {
  const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/script>/g, '<\\/script>');
  html = html.replace(`<script src="${f}"></script>`, `<script>\n${src}\n</script>`);
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('wrote dist/index.html', (html.length / 1024).toFixed(0), 'KB');
