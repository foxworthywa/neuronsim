// Minimal binary-STL reader + exact-position welder.
import fs from 'node:fs';

/** Read a binary STL file. Returns { positions: Float32Array (xyz per vertex), indices: Uint32Array }, welded. */
export function readStlWelded(file) {
  const buf = fs.readFileSync(file);
  const n = buf.readUInt32LE(80);
  if (84 + n * 50 !== buf.length) throw new Error(`${file}: not a binary STL (size mismatch)`);
  const map = new Map();
  const pos = [];
  const idx = new Uint32Array(n * 3);
  let k = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12;
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(o + v * 12), y = buf.readFloatLE(o + v * 12 + 4), z = buf.readFloatLE(o + v * 12 + 8);
      const key = `${x},${y},${z}`;
      let id = map.get(key);
      if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(x, y, z); }
      idx[k++] = id;
    }
  }
  // drop degenerate triangles
  const out = [];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(out) };
}

export function bbox(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let a = 0; a < 3; a++) { const v = positions[i + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
  return { min, max };
}
