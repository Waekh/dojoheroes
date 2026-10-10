// Volumetric sprite renderer: a character is modelled as signed-distance primitives
// (tapered capsules + ellipsoids) in its own space, ray-marched orthographically at a
// supersampled resolution, then reduced to pixel art:
//   material by majority vote -> light averaged -> quantized to hand-picked colour ramps
//   -> lines where a nearer part overlaps a farther one -> exterior outline -> face details.
// The output is a PixelCanvas (colour + height/normal data) ready for Sprite3D.
import { PixelCanvas, hex } from '../pixel/PixelCanvas.js';

// ---------- small vector helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
export const V = { sub, add, mul, dot, len, norm };

/** 3x3 rotation matrices (row-major arrays of rows) */
const rotY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rotX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
export const rotZ = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const mm = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
const mv = (M, v) => [dot(M[0], v), dot(M[1], v), dot(M[2], v)];
const tr = (M) => [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
export const M3 = { rotX, rotY, rotZ, mm, mv, tr };

// ---------- primitives (built in character space, converted to view space at render) ----------
/** tapered capsule from a (radius ra) to b (radius rb) */
export const cap = (a, b, ra, rb = ra) => ({ t: 'cap', a, b, ra, rb });
/** ellipsoid centred at c with radii r, optional rotation matrix (character space) */
export const ell = (c, r, rot = null) => ({ t: 'ell', c, r, rot });

function primDist(p, q) {
  if (q.t === 'cap') {
    const pa = sub(p, q.a), ba = q.ba;
    const h = Math.max(0, Math.min(1, dot(pa, ba) * q.il2));
    return len(sub(pa, mul(ba, h))) - (q.ra + (q.rb - q.ra) * h);
  }
  // ellipsoid (iq's bound)
  const l = mv(q.inv, sub(p, q.c));
  const r = q.r;
  const k0 = Math.hypot(l[0] / r[0], l[1] / r[1], l[2] / r[2]);
  const k1 = Math.hypot(l[0] / (r[0] * r[0]), l[1] / (r[1] * r[1]), l[2] / (r[2] * r[2]));
  return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1;
}

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * Render a character model.
 * @param {object} model { w, h, origin:[x,y] (pixel of the ground point under the hips),
 *   materials: { name: { ramp: ['#light', ..., '#dark'], line: '#outline' } },
 *   build(pose) -> { parts: [{ mat, prims, k, skin? (fn(pLocal)->mat|null) }], marks: [...] } }
 * @param {object} pose passed to model.build
 * @param {object} [o] { yaw, pitch, ss, light:[x,y,z] (view space) }
 */
export function renderSprite(model, pose, o = {}) {
  const { w, h } = model;
  const yaw = o.yaw ?? model.yaw ?? 0.6, pitch = o.pitch ?? model.pitch ?? 0.14;
  const SS = o.ss ?? 4;
  const SC = o.scale ?? model.scale ?? 1; // pixels per model unit
  const L = norm(o.light ?? model.light ?? [-0.35, 0.75, 0.6]);
  const [ox, oy] = model.origin;
  const R = mm(rotX(pitch), rotY(-yaw)); // character -> view
  const Rt = tr(R);
  const built = model.build(pose);
  const matNames = Object.keys(model.materials);
  const matIndex = Object.fromEntries(matNames.map((m, i) => [m, i]));
  const mats0 = matNames.map((m) => {
    const d = model.materials[m];
    return { ao: d.ao ?? 0.45, wrap: d.wrap ?? 0.3, spec: d.spec ?? 0, amb: d.amb ?? 0.18 };
  });
  const Hv = norm(add(L, [0, 0, 1])); // half vector for the view direction (camera looks down -z)

  // convert parts to view space and compute bounding spheres
  const parts = built.parts.map((part, pi) => {
    const prims = part.prims.map((q) => {
      if (q.t === 'cap') {
        const a = mv(R, q.a), b = mv(R, q.b), ba = sub(b, a);
        return { t: 'cap', a, b, ba, il2: 1 / Math.max(dot(ba, ba), 1e-6), ra: q.ra, rb: q.rb };
      }
      const rot = q.rot ? mm(R, q.rot) : R;
      return { t: 'ell', c: mv(R, q.c), r: q.r, inv: tr(rot) };
    });
    // bounding sphere
    const pts = [];
    for (const q of prims) {
      if (q.t === 'cap') pts.push([q.a, q.ra], [q.b, q.rb]);
      else pts.push([q.c, Math.max(...q.r)]);
    }
    const c = mul(pts.reduce((s, [p]) => add(s, p), [0, 0, 0]), 1 / pts.length);
    const rad = Math.max(...pts.map(([p, r]) => len(sub(p, c)) + r)) + (part.k || 0);
    return { ...part, prims, c, rad, id: pi, mi: matIndex[part.mat] };
  });

  // scene distance; returns distance and (optionally) the closest part
  let hitPart = -1;
  const dist = (p, wantPart) => {
    let best = 1e9, bp = -1;
    for (const part of parts) {
      const lb = len(sub(p, part.c)) - part.rad;
      if (lb > best) continue;
      let d = 1e9;
      for (const q of part.prims) d = smin(d, primDist(p, q), part.k || 0);
      if (part.wrinkle) d += part.wrinkle * Math.sin(p[1] * 1.25 + p[0] * 0.8 + p[2] * 0.3) * Math.sin(p[0] * 0.9 - p[2] * 1.1 + p[1] * 0.4);
      if (d < best) { best = d; bp = part.id; }
    }
    if (wantPart) hitPart = bp;
    return best;
  };

  // view-space bounds of the whole character
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, zMax = -1e9;
  for (const part of parts) {
    x0 = Math.min(x0, part.c[0] - part.rad); x1 = Math.max(x1, part.c[0] + part.rad);
    y0 = Math.min(y0, part.c[1] - part.rad); y1 = Math.max(y1, part.c[1] + part.rad);
    zMax = Math.max(zMax, part.c[2] + part.rad);
  }

  // ---- ray-march every supersample ----
  const N = w * h;
  const samples = SS * SS;
  const sMat = new Int16Array(N * samples).fill(-1);
  const sPart = new Int16Array(N * samples).fill(-1);
  const sLight = new Float32Array(N * samples);
  const sDepth = new Float32Array(N * samples);
  const sNorm = new Float32Array(N * samples * 3);
  const e = 0.04;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const vx = (px + (sx + 0.5) / SS - ox) / SC, vy = (oy - (py + (sy + 0.5) / SS)) / SC;
      if (vx < x0 || vx > x1 || vy < y0 || vy > y1) continue;
      let z = zMax + 1, hit = false;
      for (let it = 0; it < 90; it++) {
        const d = dist([vx, vy, z], false);
        if (d < 0.01) { hit = true; break; }
        z -= Math.max(d * 0.85, 0.01);
        if (z < -60) break;
      }
      if (!hit) continue;
      const p = [vx, vy, z];
      dist(p, true);
      const part = parts[hitPart];
      const n = norm([
        dist([vx + e, vy, z]) - dist([vx - e, vy, z]),
        dist([vx, vy + e, z]) - dist([vx, vy - e, z]),
        dist([vx, vy, z + e]) - dist([vx, vy, z - e]),
      ]);
      // ambient occlusion along the normal
      let ao = 0, wgt = 1;
      for (let i = 1; i <= 4; i++) {
        const hh = i * 0.7;
        ao += (hh - Math.max(dist(add(p, mul(n, hh))), 0)) * wgt;
        wgt *= 0.6;
      }
      ao = Math.max(0, Math.min(1, 1 - ao * 0.22));
      let mi = part.mi;
      if (part.skin) {
        const m = part.skin(mv(Rt, p), n);
        if (m) mi = matIndex[m];
      }
      const si = (py * w + px) * samples + sy * SS + sx;
      sMat[si] = mi; sPart[si] = part.id;
      const mt = mats0[mi];
      const diff = Math.max(0, (dot(n, L) + mt.wrap) / (1 + mt.wrap));
      const spec = mt.spec ? mt.spec * Math.pow(Math.max(0, dot(n, Hv)), 10) : 0;
      sLight[si] = Math.min(1, (mt.amb + (1 - mt.amb) * diff) * (1 - mt.ao + mt.ao * ao) + spec);
      sDepth[si] = z;
      sNorm[si * 3] = n[0]; sNorm[si * 3 + 1] = n[1]; sNorm[si * 3 + 2] = n[2];
    }
  }

  // ---- reduce to pixels ----
  const pMat = new Int16Array(N).fill(-1), pPart = new Int16Array(N).fill(-1);
  const pLight = new Float32Array(N), pDepth = new Float32Array(N).fill(-1e9);
  const pNorm = new Float32Array(N * 3);
  const cnt = new Int32Array(Math.max(matNames.length, parts.length) + 1);
  for (let i = 0; i < N; i++) {
    let filled = 0;
    cnt.fill(0);
    for (let s = 0; s < samples; s++) if (sMat[i * samples + s] >= 0) { filled++; cnt[sMat[i * samples + s]]++; }
    if (filled * 2 <= samples) continue;
    let bm = 0;
    for (let m = 1; m < matNames.length; m++) if (cnt[m] > cnt[bm]) bm = m;
    // nearest part among samples of the winning material
    let l = 0, c = 0, nx = 0, ny = 0, nz = 0, bestZ = -1e9, bpart = -1;
    for (let s = 0; s < samples; s++) {
      const si = i * samples + s;
      if (sMat[si] !== bm) continue;
      l += sLight[si]; c++;
      nx += sNorm[si * 3]; ny += sNorm[si * 3 + 1]; nz += sNorm[si * 3 + 2];
      if (sDepth[si] > bestZ) { bestZ = sDepth[si]; bpart = sPart[si]; }
    }
    pMat[i] = bm; pPart[i] = bpart; pLight[i] = l / c; pDepth[i] = bestZ;
    const nn = norm([nx, ny, nz]);
    pNorm[i * 3] = nn[0]; pNorm[i * 3 + 1] = nn[1]; pNorm[i * 3 + 2] = nn[2];
  }

  // ---- quantize light into each material's ramp ----
  const mats = matNames.map((m) => {
    const d = model.materials[m];
    return { ramp: d.ramp.map(hex), line: hex(d.line), bias: d.bias ?? 0, contrast: d.contrast ?? 1 };
  });
  const tone = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    if (pMat[i] < 0) continue;
    const m = mats[pMat[i]];
    const n = m.ramp.length;
    const v = Math.max(0, Math.min(0.999, (1 - pLight[i]) * m.contrast + m.bias));
    tone[i] = Math.min(n - 1, Math.floor(v * n));
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);

  // clean isolated tone pixels (pixel-art banding should not speckle)
  for (let pass = 0; pass < 2; pass++) {
    const t2 = tone.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = at(x, y);
      if (pMat[i] < 0) continue;
      const ns = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].filter((j) => j >= 0 && pMat[j] === pMat[i]);
      // a pixel unlike all its same-material neighbours, or a 1px sliver between two equal tones
      if (ns.length >= 3 && ns.every((j) => tone[j] === tone[ns[0]]) && tone[ns[0]] !== tone[i]) t2[i] = tone[ns[0]];
      else {
        const l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
        const same = (a, b) => a >= 0 && b >= 0 && pMat[a] === pMat[i] && pMat[b] === pMat[i] && tone[a] === tone[b] && tone[a] !== tone[i];
        if (same(l, r) && same(u, d)) t2[i] = tone[l];
      }
    }
    tone.set(t2);
  }

  // colour buffer: [r,g,b] or null
  const col = new Array(N).fill(null);
  for (let i = 0; i < N; i++) if (pMat[i] >= 0) col[i] = mats[pMat[i]].ramp[tone[i]];

  // ---- inner lines: a farther pixel touching a nearer, different part ----
  const lineAt = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y);
    if (pMat[i] < 0) continue;
    for (const j of [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)]) {
      if (j < 0 || pMat[j] < 0 || pPart[j] === pPart[i]) continue;
      const dz = pDepth[j] - pDepth[i];
      const sameMat = pMat[j] === pMat[i];
      const lnk = built.joined?.(parts[pPart[i]], parts[pPart[j]]);
      if (lnk) continue;
      if (dz > (sameMat ? 0.5 : 0.2)) { lineAt[i] = 1; break; }
    }
  }
  for (let i = 0; i < N; i++) if (lineAt[i]) {
    const m = mats[pMat[i]];
    col[i] = mix(m.ramp[m.ramp.length - 1], m.line, 0.65);
  }

  // ---- exterior outline ----
  const out = col.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = at(x, y);
    if (pMat[i] >= 0) continue;
    let best = -1;
    for (const j of [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)]) {
      if (j >= 0 && pMat[j] >= 0 && (best < 0 || pDepth[j] > pDepth[best])) best = j;
    }
    if (best >= 0) out[i] = mats[pMat[best]].line;
  }

  // ---- marks: face details projected from character space ----
  const pc = new PixelCanvas(w, h);
  for (const mk of built.marks || []) {
    const v = mv(R, mk.p);
    const x = Math.floor(v[0] * SC + ox), y = Math.floor(oy - v[1] * SC);
    const i = at(x, y);
    if (i < 0 || pMat[i] < 0) continue;
    if (mk.facing && dot(mv(R, mk.facing), [0, 0, 1]) < (mk.minFacing ?? 0.05)) continue;
    if (pDepth[i] > v[2] + (mk.tol ?? 1.2)) continue; // hidden behind something
    if (mk.onlyMat && matNames[pMat[i]] !== mk.onlyMat) continue;
    for (const [dx, dy, c] of mk.px) {
      const j = at(x + dx, y + dy);
      if (j >= 0 && out[j]) out[j] = hex(c);
    }
  }

  for (let i = 0; i < N; i++) if (out[i]) {
    pc.set(i % w, (i / w) | 0, out[i], 255);
  }
  pc.normals = pNorm;
  pc.mask = pMat;
  return pc;
}

function mix(a, b, t) {
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
}
