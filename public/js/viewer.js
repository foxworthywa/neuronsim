// The 3D view: loads the body model, draws it, and handles picking, camera moves, highlighting, peeling and
// see-through. It knows nothing about the course list beyond the `item` tag on each part; main.js drives it.

import * as THREE from '../vendor/three-bundle.js';

const { OrbitControls, GLTFLoader, MeshoptDecoder, computeBoundsTree, acceleratedRaycast } = THREE;

// Raycasts use a per-mesh BVH, built the first time a ray reaches the mesh's bounding sphere.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
const _sphere = new THREE.Sphere();
THREE.Mesh.prototype.raycast = function (raycaster, intersects) {
  const g = this.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  _sphere.copy(g.boundingSphere).applyMatrix4(this.matrixWorld);
  if (!raycaster.ray.intersectsSphere(_sphere)) return;
  if (!g.boundsTree) g.computeBoundsTree();
  acceleratedRaycast.call(this, raycaster, intersects);
};

export const COLORS = {
  context: 0x9c9895,
  contextTendon: 0xcfc9bf,
  bone: 0xe8e1cf,
  tendon: 0xe2c690,
  selected: 0xffb300,
  groupmate: 0xf7d98b,
  correct: 0x2eb35a,
  wrong: 0x8c5cf0,
  think: { 'think-forearm-flexors': 0x5b8ad6, 'think-forearm-extensors': 0x3fa592, 'think-adductors': 0x9476d0 },
};

// Listed muscles: a family of muscle reds with enough variation that neighbours read as separate muscles.
const MUSCLE_TONES = [0xb8453b, 0xc9594a, 0xa83a36, 0xd06a55, 0xb24f45, 0xc04a3f, 0x9f3f3a, 0xcc5f50];
function toneFor(itemId) {
  let h = 0;
  for (const ch of itemId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MUSCLE_TONES[h % MUSCLE_TONES.length];
}

const GHOST_OPACITY = 0.12;

export class Viewer {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.cb = callbacks; // onHover(part|null, event), onPick(part|null, point), onCameraRest()
    this.parts = new Map(); // id -> part
    this.meshes = [];
    this.state = {
      bones: true, context: true, peel: 0, hidden: new Set(), isolate: null, revealed: new Set(),
      highlight: new Map(), ghost: new Set(), hover: new Set(),
    };

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.prepend(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.01, 30);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5450, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(-1.2, 1.6, 2.2); // follows the camera, lighting what the student is looking at
    this.camera.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.55);
    rim.position.set(1.5, -0.4, -1);
    this.camera.add(rim);

    const controls = (this.controls = new OrbitControls(this.camera, renderer.domElement));
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 0.12;
    controls.maxDistance = 7;
    controls.zoomToCursor = true;
    controls.addEventListener('change', () => this.requestRender());
    controls.addEventListener('start', () => { this.anim = null; this.cb.onInteract?.(); });
    controls.addEventListener('end', () => this._scheduleRest());

    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.pointer = new THREE.Vector2();
    this._bindPointer();

    this.needsRender = true;
    this.anim = null;
    new ResizeObserver(() => this._resize()).observe(container);
    this._resize();
    const loop = (t) => {
      requestAnimationFrame(loop);
      this._tick(t);
    };
    requestAnimationFrame(loop);
  }

  // ── Loading ────────────────────────────────────────────────────────────────────────────────
  async load(glbUrl, index, onProgress) {
    this.index = index;
    this.layers = index.layers;
    this.viewDirs = index.viewDirs.map((d) => ({ v: new THREE.Vector3(...d.v), w: d.w }));
    const buf = await fetchWithProgress(glbUrl, onProgress);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(buf, '');
    const root = gltf.scene;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const id = o.name;
      const info = index.parts[id];
      if (!info) return;
      o.material = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
      const box = new THREE.Box3().setFromObject(o);
      const part = { id, ...info, mesh: o, box, center: box.getCenter(new THREE.Vector3()), base: 0 };
      o.userData.part = part;
      this.parts.set(id, part);
      this.meshes.push(o);
    });
    this.bodyBox = new THREE.Box3();
    for (const p of this.parts.values()) if (p.kind === 'bone') this.bodyBox.union(p.box);
    this.refresh();
    this.home();
    this.cameraTo(this.homePose, 0);
  }

  // ── Appearance ─────────────────────────────────────────────────────────────────────────────
  /** Which think-regions have been revealed (their muscles then show in colour and become selectable). */
  setRevealed(ids) { this.state.revealed = new Set(ids); this.refresh(); }

  isListed(part) {
    if (!part.item) return false;
    if (part.item.startsWith('think-')) return this.state.revealed.has(part.item);
    return true;
  }

  baseColor(part) {
    if (part.kind === 'bone') return COLORS.bone;
    if (this.isListed(part)) {
      if (part.item.startsWith('think-')) return COLORS.think[part.item];
      if (part.kind === 'tendon') return COLORS.tendon;
      return toneFor(part.item);
    }
    return part.kind === 'tendon' ? COLORS.contextTendon : COLORS.context;
  }

  isVisible(part) {
    const s = this.state;
    if (s.highlight.has(part.id)) return true;
    if (s.isolate) return s.isolate.has(part.id) || (part.kind === 'bone' && s.bones);
    if (s.hidden.has(part.id)) return false;
    if (part.kind === 'bone') return s.bones;
    if (!this.isListed(part) && !s.context) return false;
    if (s.peel && part.layer <= s.peel) return false;
    return true;
  }

  refresh() {
    const s = this.state;
    for (const p of this.parts.values()) {
      const m = p.mesh.material;
      p.mesh.visible = this.isVisible(p);
      const hl = s.highlight.get(p.id);
      m.color.setHex(hl ? COLORS[hl] : this.baseColor(p));
      m.emissive.setHex(hl ? COLORS[hl] : 0x000000);
      m.emissiveIntensity = hl ? 0.22 : 0;
      if (s.hover.has(p.id)) { m.emissive.setHex(0xffffff); m.emissiveIntensity = hl ? 0.28 : 0.16; }
      // The target itself never fades; its group-mates and a wrong quiz pick may, if they are in the way.
      const ghost = s.ghost.has(p.id) && hl !== 'selected' && hl !== 'correct';
      if (m.transparent !== ghost) { m.transparent = ghost; m.depthWrite = !ghost; m.needsUpdate = true; }
      m.opacity = ghost ? GHOST_OPACITY : 1;
    }
    this.requestRender();
  }

  setHighlight(map) { this.state.highlight = map; this.refresh(); }
  setHover(ids) { this.state.hover = new Set(ids); this.refresh(); }
  setBones(on) { this.state.bones = on; this.refresh(); }
  setContext(on) { this.state.context = on; this.refresh(); }
  setPeel(level) { this.state.peel = level; this.refresh(); }
  hide(ids) { for (const id of ids) this.state.hidden.add(id); this.refresh(); }
  setIsolate(ids) { this.state.isolate = ids ? new Set(ids) : null; this.refresh(); }
  showAll() { this.state.hidden.clear(); this.state.isolate = null; this.state.peel = 0; this.state.ghost.clear(); this.refresh(); }
  clearGhosts() { if (this.state.ghost.size) { this.state.ghost.clear(); this.refresh(); } }

  /**
   * Make whatever blocks the view of `ids` from the current camera position see-through. Nothing changes unless at
   * least `minHidden` of the target's surface samples are covered, so clicking a muscle you can see leaves the scene alone.
   */
  ghostOccluders(ids, minHidden = 0.3) {
    const targets = ids.map((id) => this.parts.get(id)).filter((p) => p && p.mesh.visible);
    const targetMeshes = new Set(targets.map((p) => p.mesh));
    const candidates = this.meshes.filter((m) => m.visible && !targetMeshes.has(m));
    const counts = new Map();
    const eye = this.camera.position;
    const v = new THREE.Vector3(), dir = new THREE.Vector3();
    let samples = 0, blocked = 0;
    for (const p of targets) {
      const pos = p.mesh.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 36));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i).applyMatrix4(p.mesh.matrixWorld);
        dir.subVectors(v, eye);
        const dist = dir.length();
        this.raycaster.set(eye, dir.normalize());
        this.raycaster.far = dist - 0.004;
        samples++;
        const hits = this.raycaster.intersectObjects(candidates, false);
        if (hits.length) blocked++;
        for (const h of hits) {
          const id = h.object.userData.part.id;
          counts.set(id, (counts.get(id) || 0) + 1);
        }
      }
    }
    this.raycaster.far = Infinity;
    const min = Math.max(1, samples * 0.03);
    this.state.ghost = blocked >= samples * minHidden ? new Set([...counts].filter(([, c]) => c >= min).map(([id]) => id)) : new Set();
    this.refresh();
    return this.state.ghost;
  }

  // ── Camera ─────────────────────────────────────────────────────────────────────────────────
  home() {
    const c = this.bodyBox.getCenter(new THREE.Vector3());
    const h = this.bodyBox.max.y - this.bodyBox.min.y;
    const dist = (h * 0.62) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.homePose = { target: c.clone(), position: c.clone().add(new THREE.Vector3(0, 0.05, 1).normalize().multiplyScalar(dist)) };
  }

  /** Preset views. Names are anatomical: "right" shows the body's right side. */
  view(name, duration = 650) {
    const t = this.controls.target.clone();
    const d = this.camera.position.distanceTo(t);
    const dirs = {
      anterior: [0, 0.08, 1], posterior: [0, 0.08, -1], right: [-1, 0.08, 0], left: [1, 0.08, 0],
      superior: [0, 1, 0.0001], inferior: [0, -1, 0.0001],
    };
    const v = new THREE.Vector3(...dirs[name]).normalize();
    this.cameraTo({ target: t, position: t.clone().addScaledVector(v, d) }, duration);
  }

  reset(duration = 700) { this.cameraTo(this.homePose, duration); }

  cameraTo({ target, position }, duration = 650) {
    if (!duration) {
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.controls.update();
      this.requestRender();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.anim = {
        t0: performance.now(), duration, resolve,
        fromT: this.controls.target.clone(), toT: target.clone(),
        fromP: this.camera.position.clone(), toP: position.clone(),
      };
      this.requestRender();
    });
  }

  /** Recentre rotation on a point without changing the viewing angle or distance. */
  pivotTo(point, duration = 450) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    return this.cameraTo({ target: point, position: point.clone().add(offset) }, duration);
  }

  boxOf(ids) {
    const b = new THREE.Box3();
    for (const id of ids) { const p = this.parts.get(id); if (p) b.union(p.box); }
    return b;
  }

  /** Fly to show `ids` from their best viewing direction (keeping the current angle if it is nearly as good). */
  frame(ids, duration = 800) {
    const box = this.boxOf(ids);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.05);
    const dir = this.bestDirection(ids);
    const fit = Math.min(this.camera.fov, this.camera.fov * this.camera.aspect) / 2; // the narrower of the two view angles
    const dist = THREE.MathUtils.clamp((radius / Math.sin(THREE.MathUtils.degToRad(fit))) * 1.45, 0.45, 4.5);
    return this.cameraTo({ target: center, position: center.clone().addScaledVector(dir, dist) }, duration);
  }

  bestDirection(ids) {
    const score = new Array(this.viewDirs.length).fill(0);
    for (const id of ids) {
      const vis = this.parts.get(id)?.vis;
      if (vis) vis.forEach((n, i) => (score[i] += n));
    }
    // A left or right structure is looked at from its own side (or front/back), never across the body's midline.
    const cx = this.boxOf(ids).getCenter(new THREE.Vector3()).x;
    const across = (d) => Math.abs(cx) > 0.04 && d.v.x * Math.sign(cx) < -0.3;
    const weighted = score.map((s, i) => s * this.viewDirs[i].w * (across(this.viewDirs[i]) ? 0.3 : 1));
    if (!weighted.some((s) => s > 0)) {
      // No precomputed scores (a part added to the list after the model was built): look at it from outside the body.
      const c = this.boxOf(ids).getCenter(new THREE.Vector3());
      const out = new THREE.Vector3(c.x, 0, c.z - this.bodyBox.getCenter(new THREE.Vector3()).z);
      if (out.lengthSq() < 0.0009) out.set(0, 0, 1);
      return out.normalize().setY(0.27).normalize();
    }
    let best = 0;
    weighted.forEach((s, i) => { if (s > weighted[best]) best = i; });
    // Stay put if the current viewing direction is almost as good: flying around is disorienting.
    const cur = this.camera.position.clone().sub(this.controls.target).normalize();
    let near = 0, nearDot = -2;
    this.viewDirs.forEach((d, i) => { const dot = d.v.dot(cur); if (dot > nearDot) { nearDot = dot; near = i; } });
    if (weighted[best] > 0 && weighted[near] >= weighted[best] * 0.85 && nearDot > 0.9) return cur;
    return this.viewDirs[best].v.clone().normalize();
  }

  /** Which side of a set of parts is nearest the centre of the view ('L' | 'R' | 'M'). */
  sideInView(ids) {
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const v = new THREE.Vector3();
    let bestSide = null, bestAngle = Infinity;
    for (const id of ids) {
      const p = this.parts.get(id);
      if (!p) continue;
      const a = v.subVectors(p.center, this.camera.position).angleTo(fwd);
      if (a < bestAngle) { bestAngle = a; bestSide = p.side; }
    }
    return bestSide;
  }

  /** Which of a set of parts is closest to the camera, by side ('L' | 'R' | 'M'). */
  nearestSide(ids) {
    let bestSide = null, bestD = Infinity;
    for (const id of ids) {
      const p = this.parts.get(id);
      if (!p) continue;
      const d = p.center.distanceTo(this.camera.position);
      if (d < bestD) { bestD = d; bestSide = p.side; }
    }
    return bestSide;
  }

  project(point) {
    const v = point.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, behind: v.z > 1 };
  }

  // ── Picking ────────────────────────────────────────────────────────────────────────────────
  pick(clientX, clientY) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const pickable = this.meshes.filter((m) => m.visible && !(m.material.transparent));
    const hit = this.raycaster.intersectObjects(pickable, false)[0];
    return hit ? { part: hit.object.userData.part, point: hit.point } : null;
  }

  _bindPointer() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointerup', (e) => {
      if (!down || e.button !== 0) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 6) return;
      const hit = this.pick(e.clientX, e.clientY);
      this.cb.onPick?.(hit?.part || null, hit?.point || null, e);
    });
    el.addEventListener('dblclick', (e) => {
      const hit = this.pick(e.clientX, e.clientY);
      if (hit) this.pivotTo(hit.point);
    });
    let pending = null;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      pending = e;
      if (this._hoverQueued) return;
      this._hoverQueued = true;
      requestAnimationFrame(() => {
        this._hoverQueued = false;
        const hit = this.pick(pending.clientX, pending.clientY);
        this.cb.onHover?.(hit?.part || null, pending);
      });
    });
    el.addEventListener('pointerleave', () => this.cb.onHover?.(null, null));
  }

  // ── Frame loop ─────────────────────────────────────────────────────────────────────────────
  requestRender() { this.needsRender = true; }

  _scheduleRest() {
    clearTimeout(this._restTimer);
    this._restTimer = setTimeout(() => this.cb.onCameraRest?.(), 250);
  }

  _tick(now) {
    if (this.anim) {
      const a = this.anim;
      const k = Math.min(1, (now - a.t0) / a.duration);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.controls.target.lerpVectors(a.fromT, a.toT, e);
      this.camera.position.lerpVectors(a.fromP, a.toP, e);
      this.needsRender = true;
      if (k >= 1) { this.anim = null; a.resolve(); this._scheduleRest(); }
    }
    if (this.controls.update()) this.needsRender = true;
    if (this.needsRender) {
      this.needsRender = false;
      this.renderer.render(this.scene, this.camera);
      this.cb.onRender?.();
    }
  }

  _resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress?.(Math.min(1, got / total));
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}
