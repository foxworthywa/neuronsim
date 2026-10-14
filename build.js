// Bundle each model into one self-contained HTML file in dist/, plus the landing page.
//   dist/index.html   landing page listing the models
//   dist/neuron.html  NeuronSim   (neuron/index.html + its scripts)
//   dist/heart.html   HeartSim    (heart/index.html + lib/ + its scripts)
// Usage: node build.js
const fs = require('fs'), path = require('path');
const root = __dirname;
const MODULES = ['neuron', 'heart'];

function inline(htmlFile) {
  const dir = path.dirname(htmlFile);
  let html = fs.readFileSync(htmlFile, 'utf8');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    const code = fs.readFileSync(path.join(dir, src), 'utf8').replace(/<\/script>/g, '<\\/script>');
    return `<script>\n${code}\n</script>`;
  });
  html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
    if (/^https?:/.test(href)) return m;
    return `<style>\n${fs.readFileSync(path.join(dir, href), 'utf8')}\n</style>`;
  });
  // Links between models: source tree uses folders (heart/), the bundle uses files (heart.html).
  html = html.replace(/href="(?:\.\.\/)?(neuron|heart)\/"/g, 'href="$1.html"').replace(/href="\.\.\/"/g, 'href="index.html"');
  return html;
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
for (const m of MODULES) {
  const html = inline(path.join(root, m, 'index.html'));
  fs.writeFileSync(path.join(root, 'dist', m + '.html'), html);
  console.log(`wrote dist/${m}.html`, (html.length / 1024).toFixed(0), 'KB');
}
const landing = inline(path.join(root, 'index.html'));
fs.writeFileSync(path.join(root, 'dist', 'index.html'), landing);
console.log('wrote dist/index.html', (landing.length / 1024).toFixed(0), 'KB');
