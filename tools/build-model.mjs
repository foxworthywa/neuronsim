// Build public/model/body.glb and public/model/parts.json from the BodyParts3D STL collection.
//
//   node tools/build-model.mjs [--data <BodyParts3D_data dir>] [--stats]
//
// Source data: https://github.com/Kevin-Mattheus-Moerman/BodyParts3D (assets/BodyParts3D_data), which is
// BodyParts3D release 3.0 converted to binary STL. BodyParts3D, (c) The Database Center for Life Science,
// licensed under CC Attribution-Share Alike 2.1 Japan. The generated model files carry the same license.
//
// Steps: pick muscles + skeleton (no organs, vessels, nerves, skin) -> weld + simplify each mesh ->
// rotate into three.js axes (Y up, anterior = +Z, body's right = -X) in metres -> compute smooth normals ->
// assign each muscle a depth layer by "onion peeling" -> write a meshopt-compressed GLB plus a parts index.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { readStlWelded } from './stl.mjs';
import { ITEMS } from '../public/js/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DATA = argVal('--data', process.env.BP3D_DATA || '/home/user/kevin-mattheus-moerman/bodyparts3d/assets/BodyParts3D_data');
const STATS_ONLY = args.includes('--stats');
const OUT_DIR = path.join(ROOT, 'public', 'model');

// Triangle budget: each part gets triangles in proportion to its surface area (per 100 mm^2), so detail is even
// across the body; listed muscles get the most. The simplifier stops early only if it would exceed MAX_ERROR_MM.
const DENSITY = { listed: 10, muscle: 6, tendon: 4, bone: 12 };
const MAX_ERROR_MM = { listed: 0.8, muscle: 1.2, tendon: 1.2, bone: 0.8 };
const MIN_TRIS = 80, MAX_TRIS = 40000;
const LAYERS = 5;

// ── 1. Choose parts ────────────────────────────────────────────────────────────────────────────
const readTsv = (f) => fs.readFileSync(path.join(DATA, f), 'utf8').trim().split('\n').slice(1).map((l) => l.split('\t'));
const names = new Map(readTsv('parts_list_e.txt').map(([id, n]) => [id, n]));
const composite = readTsv('composite_parts.txt');
const under = (c) => new Set(composite.filter((r) => r[0] === c).map((r) => r[2]));
const stlIds = new Set(fs.readdirSync(path.join(DATA, 'stl')).filter((f) => f.endsWith('.stl')).map((f) => f.slice(0, -4)));

const muscular = under('FMA72954');
const skeletal = under('FMA23881');
// Parts missing from those composite lists in release 3.0.
const EXTRA_MUSCLE = ['FMA13295', 'FMA13377', 'FMA13378', 'BP44', 'BP45', 'BP46', 'BP47', 'FMA11336'];
const EXTRA_BONE = /(vertebra$|^atlas$|^axis$|costal cartilage|tooth$|^eyeball$)/;
const EXCLUDE = /(gingiva)/;

const itemOf = new Map();
for (const it of ITEMS) for (const m of it.meshes || []) {
  if (itemOf.has(m)) throw new Error(`${m} is claimed by both ${itemOf.get(m)} and ${it.id}`);
  itemOf.set(m, it.id);
}
const thinkIds = new Set(ITEMS.filter((it) => it.kind === 'think').map((it) => it.id));

const parts = [];
for (const id of [...stlIds].sort()) {
  const name = names.get(id);
  if (!name || EXCLUDE.test(name)) continue;
  let kind = null;
  if (muscular.has(id) || EXTRA_MUSCLE.includes(id)) kind = /(tendon|aponeurosis|ligament|tract|retinaculum|linea alba|tendinous arch)/.test(name) ? 'tendon' : 'muscle';
  else if (skeletal.has(id) || EXTRA_BONE.test(name)) kind = 'bone';
  if (!kind) continue;
  const side = /(^|\s)left\s/.test(name) ? 'L' : /(^|\s)right\s/.test(name) ? 'R' : 'M';
  const item = itemOf.get(id);
  const tier = item && !thinkIds.has(item) ? 'listed' : kind;
  parts.push({ id, name, kind, side, item, tier });
}
const missing = [...itemOf.keys()].filter((m) => !parts.some((p) => p.id === m));
if (missing.length) throw new Error(`catalog meshes not found in dataset: ${missing.join(', ')}`);
console.log(`parts: ${parts.length} (${['muscle', 'tendon', 'bone'].map((k) => `${parts.filter((p) => p.kind === k).length} ${k}`).join(', ')}), ${itemOf.size} listed`);

// ── 2. Weld + simplify ─────────────────────────────────────────────────────────────────────────
// Rectus sheath: in BodyParts3D the aponeuroses of the obliques and transversus abdominis wrap in front of rectus
// abdominis, hiding it completely. As in most textbook figures, the part of each lying in front of rectus
// abdominis (the anterior rectus sheath) is cut away: triangles from which a ray going straight back (+Y in
// BodyParts3D coordinates) hits rectus abdominis or the linea alba within TRIM_DEPTH_MM.
const TRIM_IN_FRONT_OF = ['FMA13377', 'FMA13378', 'FMA11336'];
const TRIM = new Set(['FMA13336', 'FMA13337', 'FMA13892', 'FMA13893', 'FMA22344', 'FMA22345']);
const TRIM_DEPTH_MM = 40;
let trimBVH = null;
function trimAnteriorSheath(positions, indices) {
  if (!trimBVH) {
    const src = TRIM_IN_FRONT_OF.map((id) => readStlWelded(path.join(DATA, 'stl', `${id}.stl`)));
    const g = new THREE.BufferGeometry();
    let vo = 0;
    const pos = new Float32Array(src.reduce((n, m) => n + m.positions.length, 0));
    const idx = new Uint32Array(src.reduce((n, m) => n + m.indices.length, 0));
    let io = 0;
    for (const m of src) { pos.set(m.positions, vo * 3); for (const i of m.indices) idx[io++] = i + vo; vo += m.positions.length / 3; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    trimBVH = new MeshBVH(g);
  }
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const keep = [];
  let removed = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    ray.origin.set((positions[a] + positions[b] + positions[c]) / 3, (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3,
      (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3);
    const hit = trimBVH.raycastFirst(ray, THREE.DoubleSide);
    if (hit && hit.distance < TRIM_DEPTH_MM) { removed++; continue; }
    keep.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  return { indices: new Uint32Array(keep), removed };
}

await MeshoptSimplifier.ready;
let srcTris = 0, outTris = 0;
const t0 = Date.now();
for (const [n, p] of parts.entries()) {
  let { positions, indices } = readStlWelded(path.join(DATA, 'stl', `${p.id}.stl`));
  srcTris += indices.length / 3;
  if (TRIM.has(p.id)) {
    const r = trimAnteriorSheath(positions, indices);
    console.log(`\n  ${p.name}: removed ${r.removed} of ${indices.length / 3} triangles in front of rectus abdominis`);
    indices = r.indices;
  }
  p.area = meshArea(positions, indices);
  const target = Math.round(Math.min(indices.length / 3, Math.max(MIN_TRIS, Math.min(MAX_TRIS, (p.area / 100) * DENSITY[p.tier])))) * 3;
  const [simp] = MeshoptSimplifier.simplify(indices, positions, 3, target, MAX_ERROR_MM[p.tier], ['ErrorAbsolute']);
  // compact: keep only referenced vertices
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const pos = [];
  const idx = new Uint32Array(simp.length);
  for (let i = 0; i < simp.length; i++) {
    const v = simp[i];
    if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    idx[i] = remap[v];
  }
  p.positions = new Float32Array(pos);
  p.indices = idx;
  p.srcTris = indices.length / 3;
  outTris += idx.length / 3;
  if (n % 50 === 0) process.stdout.write(`  simplified ${n}/${parts.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)\r`);
}
function meshArea(P, I) {
  let a = 0;
  for (let t = 0; t < I.length; t += 3) {
    const i = I[t] * 3, j = I[t + 1] * 3, k = I[t + 2] * 3;
    const ux = P[j] - P[i], uy = P[j + 1] - P[i + 1], uz = P[j + 2] - P[i + 2];
    const vx = P[k] - P[i], vy = P[k + 1] - P[i + 1], vz = P[k + 2] - P[i + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}
console.log(`\ntriangles: ${srcTris.toLocaleString()} -> ${outTris.toLocaleString()}`);
for (const tier of ['listed', 'muscle', 'tendon', 'bone']) {
  const ps = parts.filter((p) => p.tier === tier);
  console.log(`  ${tier.padEnd(7)} ${ps.length} parts, ${ps.reduce((s, p) => s + p.indices.length / 3, 0).toLocaleString()} tris, area ${(ps.reduce((s, p) => s + p.area, 0) / 1e6).toFixed(2)} m^2`);
}
if (STATS_ONLY) {
  const big = [...parts].sort((a, b) => b.indices.length - a.indices.length).slice(0, 12);
  for (const p of big) console.log(`  ${p.id.padEnd(10)} ${String(p.indices.length / 3).padStart(6)}  (${p.srcTris}, ${(p.area / 100).toFixed(0)} cm2)  ${p.name}`);
  process.exit(0);
}

// ── 3. Re-frame into three.js space (metres; feet at y=0; centred on the midline) ────────────
const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
for (const p of parts) for (let i = 0; i < p.positions.length; i += 3)
  for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], p.positions[i + a]); hi[a] = Math.max(hi[a], p.positions[i + a]); }
const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2, z0 = lo[2];
for (const p of parts) {
  const s = p.positions;
  for (let i = 0; i < s.length; i += 3) {
    const x = s[i], y = s[i + 1], z = s[i + 2];
    // BodyParts3D: +X = body's left, -Y = anterior, +Z = superior.  three.js: +Y up, +Z toward viewer.
    s[i] = (x - cx) / 1000; s[i + 1] = (z - z0) / 1000; s[i + 2] = -(y - cy) / 1000;
  }
  p.normals = vertexNormals(s, p.indices);
}
console.log(`body height ${((hi[2] - lo[2]) / 1000).toFixed(3)} m`);

function vertexNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
    const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x; // area-weighted
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

// ── 4. Depth layers by onion peeling ──────────────────────────────────────────────────────────
// A surface sample is "exposed" if enough rays from it escape without hitting another soft-tissue part that is still
// present. Parts with enough exposed samples form the current layer; they are removed and the process repeats.
// Bones are ignored so that the layers describe muscle-over-muscle depth.
{
  const soft = parts.filter((p) => p.kind !== 'bone');
  const rng = mulberry32(12345);
  const DIRS = fibonacciSphere(26);
  const SAMPLES = 96, ESCAPE_MIN = 3, EXPOSED_FRACTION = 0.2;
  for (const p of soft) p.samples = samplePoints(p, SAMPLES, rng);
  let remaining = soft.slice();
  const t1 = Date.now();
  for (let layer = 1; layer <= LAYERS && remaining.length; layer++) {
    if (layer === LAYERS) { for (const p of remaining) p.layer = layer; break; }
    const { bvh, owner } = mergedBVH(remaining);
    const ray = new THREE.Ray();
    const assigned = [];
    for (const p of remaining) {
      let exposed = 0;
      for (const s of p.samples) {
        let escapes = 0;
        for (const d of DIRS) {
          ray.origin.set(s[0] + d.x * 0.0015, s[1] + d.y * 0.0015, s[2] + d.z * 0.0015);
          ray.direction.copy(d);
          const hits = bvh.raycast(ray, THREE.DoubleSide);
          if (!hits.some((h) => owner[h.faceIndex] !== p)) escapes++;
          if (escapes >= ESCAPE_MIN) break;
        }
        if (escapes >= ESCAPE_MIN) exposed++;
      }
      p.exposure = exposed / p.samples.length;
      if (p.exposure >= EXPOSED_FRACTION) assigned.push(p);
    }
    for (const p of assigned) p.layer = layer;
    remaining = remaining.filter((p) => !p.layer);
    console.log(`layer ${layer}: ${assigned.length} parts (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
    if (!assigned.length) { for (const p of remaining) p.layer = layer; remaining = []; }
  }
  // Left and right copies of a part share the shallower of their two layers.
  const pairKey = (p) => p.name.replace(/(^|\s)(left|right)\s/, '$1');
  const byKey = new Map();
  for (const p of soft) byKey.set(pairKey(p), Math.min(byKey.get(pairKey(p)) ?? 99, p.layer));
  for (const p of soft) p.layer = byKey.get(pairKey(p));
}

// ── 4b. Best viewing directions ───────────────────────────────────────────────────────────────
// For every part that belongs to a catalog item, count how many surface samples can be seen from each candidate view
// direction, with the shallower layers peeled away (the app makes those see-through when a deep muscle is selected).
// The app sums these counts over an item's parts on one side and flies the camera to the best direction.
const VIEW_DIRS = [];
for (const [elev, w] of [[15, 1], [45, 0.85], [-30, 0.6]])
  for (let a = 0; a < 8; a++) {
    const az = (a * Math.PI) / 4, el = (elev * Math.PI) / 180;
    VIEW_DIRS.push({ v: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)].map((x) => +x.toFixed(4)), w });
  }
{
  const rng = mulberry32(777);
  const ray = new THREE.Ray();
  const itemParts = parts.filter((p) => p.item);
  const byLayer = new Map();
  const t2 = Date.now();
  for (const p of itemParts) {
    const L = p.layer || 1;
    if (!byLayer.has(L)) byLayer.set(L, mergedBVH(parts.filter((q) => q.kind === 'bone' || (q.layer || 1) >= L)).bvh);
    const bvh = byLayer.get(L);
    const samples = samplePoints(p, 64, rng);
    p.vis = VIEW_DIRS.map(({ v }) => {
      let seen = 0;
      for (const s of samples) {
        ray.origin.set(s[0] + v[0] * 0.0015, s[1] + v[1] * 0.0015, s[2] + v[2] * 0.0015);
        ray.direction.set(v[0], v[1], v[2]);
        if (!bvh.raycastFirst(ray, THREE.DoubleSide)) seen++;
      }
      return seen;
    });
  }
  console.log(`view directions for ${itemParts.length} parts (${((Date.now() - t2) / 1000).toFixed(0)}s)`);
}

function mergedBVH(list) {
  let nv = 0, nt = 0;
  for (const p of list) { nv += p.positions.length / 3; nt += p.indices.length / 3; }
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(nt * 3), owner = new Array(nt);
  let vo = 0, to = 0;
  for (const p of list) {
    pos.set(p.positions, vo * 3);
    for (let i = 0; i < p.indices.length; i++) idx[to * 3 + i] = p.indices[i] + vo;
    for (let t = 0; t < p.indices.length / 3; t++) owner[to + t] = p;
    vo += p.positions.length / 3; to += p.indices.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // indirect keeps the index buffer order so faceIndex maps straight back to `owner`
  return { bvh: new MeshBVH(g, { indirect: true }), owner };
}

function samplePoints(p, count, rng) {
  const { positions: P, indices: I } = p;
  const cdf = new Float64Array(I.length / 3);
  let total = 0;
  for (let t = 0; t < I.length / 3; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    total += Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]);
    cdf[t] = total;
  }
  const out = [];
  for (let k = 0; k < count; k++) {
    const r = rng() * total;
    let lo2 = 0, hi2 = cdf.length - 1;
    while (lo2 < hi2) { const m = (lo2 + hi2) >> 1; if (cdf[m] < r) lo2 = m + 1; else hi2 = m; }
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const a = I[lo2 * 3] * 3, b = I[lo2 * 3 + 1] * 3, c = I[lo2 * 3 + 2] * 3;
    out.push([0, 1, 2].map((i) => P[a + i] + u * (P[b + i] - P[a + i]) + v * (P[c + i] - P[a + i])));
  }
  return out;
}

function fibonacciSphere(n) {
  const out = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y);
    out.push(new THREE.Vector3(Math.cos(g * i) * r, y, Math.sin(g * i) * r));
  }
  return out;
}

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── 5. Write GLB + parts index ────────────────────────────────────────────────────────────────
await MeshoptEncoder.ready;
const doc = new Document();
doc.getRoot().getAsset().generator = 'muscle-explorer tools/build-model.mjs';
doc.getRoot().getAsset().copyright = 'BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 JP';
const buffer = doc.createBuffer();
const scene = doc.createScene('body');
for (const p of parts) {
  const nv = p.positions.length / 3;
  const indexArray = nv < 65536 ? Uint16Array.from(p.indices) : p.indices;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(p.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(p.normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(indexArray).setBuffer(buffer));
  scene.addChild(doc.createNode(p.id).setMesh(doc.createMesh(p.id).addPrimitive(prim)));
}
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
fs.mkdirSync(OUT_DIR, { recursive: true });
const glb = await io.writeBinary(doc);
fs.writeFileSync(path.join(OUT_DIR, 'body.glb'), glb);

const index = {
  source: 'BodyParts3D release 3.0 (via github.com/Kevin-Mattheus-Moerman/BodyParts3D)',
  license: 'CC BY-SA 2.1 JP',
  credit: 'BodyParts3D, (c) The Database Center for Life Science, licensed under CC Attribution-Share Alike 2.1 Japan',
  layers: Math.max(...parts.map((p) => p.layer || 0)),
  viewDirs: VIEW_DIRS,
  parts: Object.fromEntries(parts.map((p) => [p.id, {
    name: p.name, kind: p.kind, side: p.side, ...(p.item ? { item: p.item } : {}), ...(p.layer ? { layer: p.layer } : {}), ...(p.vis ? { vis: p.vis } : {}), tris: p.indices.length / 3,
  }])),
};
fs.writeFileSync(path.join(OUT_DIR, 'parts.json'), JSON.stringify(index));
console.log(`wrote body.glb ${(glb.byteLength / 1e6).toFixed(2)} MB, parts.json ${parts.length} parts`);
for (const it of ITEMS.filter((i) => i.meshes && i.kind !== 'think')) {
  const ls = it.meshes.map((m) => parts.find((p) => p.id === m)).map((p) => `${p.side}${p.layer}(${(p.exposure ?? 0).toFixed(2)})`);
  console.log(`  ${it.id.padEnd(26)} ${ls.join(' ')}`);
}
