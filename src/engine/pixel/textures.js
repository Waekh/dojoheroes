// Procedural pixel-art surface textures at 16 texels per world unit.
// Each texture is a 64x64 tile (4x4 world units) with a matching height map for normals.
import { PixelCanvas, rng, hash2, hex } from './PixelCanvas.js';

/** Hue-shifted shade: k<0 darkens toward cool violet, k>0 lightens toward warm yellow. */
export function shade(rgb, k) {
  const [r, g, b] = rgb;
  if (k < 0) {
    const t = -k;
    return [r * (1 - 0.55 * t) + 18 * t, g * (1 - 0.6 * t) + 10 * t, b * (1 - 0.42 * t) + 40 * t];
  }
  return [r + (255 - r) * 0.42 * k + 14 * k, g + (255 - g) * 0.38 * k + 6 * k, b + (255 - b) * 0.22 * k - 8 * k];
}

// value noise
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f, s + i * 17) * a; a *= 0.5; f *= 2; }
  return v;
}
// tileable value noise (period p)
function tnoise(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const H = (i, j) => hash2(((i % p) + p) % p, ((j % p) + p) % p, s);
  const a = H(xi, yi), b = H(xi + 1, yi), c = H(xi, yi + 1), d = H(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tfbm(x, y, p, s, oct = 3) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += tnoise(x * f, y * f, p * f, s + i * 31) * a; a *= 0.5; f *= 2; }
  return v;
}

const LIGHT = [-0.55, -0.75]; // texture-space light (upper-left), for baked micro shading

/** Cobblestone road: irregular stones, dark mortar, a little moss and cracks. */
export function cobblestone(seed = 1) {
  const S = 128, cell = 8;
  const pc = new PixelCanvas(S, S);
  const R = rng(seed);
  const n = S / cell;
  const pts = [];
  const stones = ['#8f8679', '#7d7b83', '#98897a', '#727078', '#867d86', '#9a917f'].map(hex);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    pts.push({ x: i * cell + 1.5 + R() * (cell - 3), y: j * cell + 1.5 + R() * (cell - 3), c: stones[Math.floor(R() * stones.length)], tint: R() });
  }
  const near = (x, y) => {
    let d1 = 1e9, d2 = 1e9, best = null;
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ci + di, jj = cj + dj;
      const p = pts[(((jj % n) + n) % n) * n + (((ii % n) + n) % n)];
      const px = p.x + (ii - (((ii % n) + n) % n)) * cell / cell * cell, py = p.y + (jj - (((jj % n) + n) % n)) * cell / cell * cell;
      // anisotropic distance gives slightly rectangular setts
      const dx = (x - px) * 0.95, dy = (y - py) * 1.15;
      const d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    return { d1, d2, p: best };
  };
  const mortar = hex('#3a3236'), moss = hex('#4f6a32'), mossL = hex('#6f8a3c');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const { d1, d2, p } = near(x + 0.5, y + 0.5);
    const edge = d2 - d1;
    if (edge < 1.25) {
      const m = tfbm(x / 8, y / 8, S / 8, seed + 5);
      pc.set(x, y, m > 0.62 ? (hash2(x, y, seed) > 0.5 ? moss : mossL) : shade(mortar, (hash2(x, y, 9) - 0.5) * 0.3));
      pc.setH(x, y, 0);
      continue;
    }
    // stone dome height, flattened top
    const h = Math.min(1, edge / 3.2);
    pc.setH(x, y, h);
  }
  // shade stones from height gradient (baked pixel-art bands, real lighting adds on top via the normal map)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (pc.getH(x, y) === 0) continue;
    const { p } = near(x + 0.5, y + 0.5);
    const gx = pc.getH(x + 1, y) - pc.getH(x - 1, y), gy = pc.getH(x, y + 1) - pc.getH(x, y - 1);
    const lit = -(gx * LIGHT[0] + gy * LIGHT[1]);
    let k = lit > 0.25 ? 0.5 : lit > 0.06 ? 0.2 : lit < -0.25 ? -0.55 : lit < -0.06 ? -0.25 : 0;
    k += (p.tint - 0.5) * 0.2 + (tfbm(x / 4, y / 4, S / 4, seed + 11) - 0.5) * 0.35;
    let c = shade(p.c, k);
    if (hash2(x, y, seed + 3) > 0.985) c = shade(p.c, -0.6); // pits
    pc.set(x, y, c);
  }
  // cracks
  for (let i = 0; i < 6; i++) {
    let x = R() * S, y = R() * S, a = R() * 6.28;
    for (let k = 0; k < 5; k++) {
      if (pc.getH(x | 0, y | 0) > 0.3) { pc.set(x | 0, y | 0, shade(pc.get(x | 0, y | 0), -0.5)); pc.setH(x | 0, y | 0, 0.3); }
      x += Math.cos(a); y += Math.sin(a); a += (R() - 0.5) * 1.2;
    }
  }
  return pc;
}

/** Lush grass top: painterly clumps lit from the upper-left, a few flowers in small clusters. */
export function grass(seed = 2) {
  const S = 128;
  const pc = new PixelCanvas(S, S);
  const R = rng(seed);
  const G = ['#264a26', '#33602b', '#447a30', '#5a9236', '#78aa42', '#9cc456'].map(hex);
  // soft base: large-scale variation only
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = tfbm(x / 16, y / 16, S / 16, seed);
    pc.set(x, y, G[n > 0.55 ? 2 : 1]);
    pc.setH(x, y, 0.1);
  }
  // clumps: rounded tufts with a bright top-left rim and a dark bottom-right underside
  for (let k = 0; k < 480; k++) {
    const cx = R() * S, cy = R() * S, r = 2.2 + R() * 3.2;
    const tone = R() < 0.3 ? 1 : 0;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.25;
      const d = Math.hypot(dx, dy) + (hash2(x, y, seed + k) - 0.5) * 1.1;
      if (d > r) continue;
      const lit = -(dx * 0.6 + dy * 0.8) / r;
      let i = 2 + tone + (lit > 0.45 ? 2 : lit > 0.05 ? 1 : 0);
      if (d > r - 1 && lit < -0.2) i = 1;
      pc.set(x, y, G[Math.min(5, i)]);
      pc.setH(x, y, 0.3 + (1 - d / r) * 0.6);
    }
  }
  // a few individual blade tips
  for (let k = 0; k < 560; k++) {
    const x = Math.floor(R() * S), y = Math.floor(R() * S);
    pc.set(x, y, G[5]); pc.set(x, y + 1, G[3]);
  }
  // small flower clusters
  const F = [['#f4f0e6', '#e8c840'], ['#f2a8c8', '#fff0a0'], ['#ffd860', '#e88a20']].map((p) => p.map(hex));
  for (let c = 0; c < 9; c++) {
    const cx = R() * S, cy = R() * S;
    const [petal, core] = F[Math.floor(R() * F.length)];
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(cx + (R() - 0.5) * 8), y = Math.floor(cy + (R() - 0.5) * 6);
      pc.set(x - 1, y, petal); pc.set(x + 1, y, petal); pc.set(x, y - 1, petal); pc.set(x, y + 1, shade(petal, -0.35)); pc.set(x, y, core);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) pc.setH(x + dx, y + dy, 1);
    }
  }
  return pc;
}

/** Earth cliff face: grass lip on top, layered soil, pebbles and roots. */
export function cliff(seed = 3) {
  const S = 64;
  const pc = new PixelCanvas(S, S);
  const R = rng(seed);
  const soil = ['#4a3426', '#5c4030', '#6e4e38', '#82603f', '#3a2a22'].map(hex);
  const G = ['#2f5a2a', '#3d6e2e', '#4f8434', '#66983c'].map(hex);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const strata = Math.sin((y + tfbm(x / 8, y / 8, 8, seed) * 6) * 0.55) * 0.5 + 0.5;
    const n = tfbm(x / 5, y / 5, 64 / 5 | 0, seed + 1);
    let i = Math.floor(strata * 2 + n * 2.2);
    i = Math.max(0, Math.min(3, i));
    let c = soil[i];
    if (n < 0.28) c = soil[4];
    pc.set(x, y, c);
    pc.setH(x, y, 0.3 + n * 0.4 + strata * 0.2);
  }
  // pebbles
  for (let k = 0; k < 40; k++) {
    const cx = R() * S, cy = 8 + R() * (S - 8), rx = 1 + R() * 2.2, ry = 0.8 + R() * 1.4;
    const base = hex(['#7a746c', '#8a8078', '#6a6470'][Math.floor(R() * 3)]);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      const k2 = -u * 0.5 - v * 0.6;
      pc.set(x, y, shade(base, k2 > 0.25 ? 0.4 : k2 < -0.25 ? -0.45 : 0));
      pc.setH(x, y, 1 - (u * u + v * v) * 0.5);
    }
  }
  // roots
  for (let k = 0; k < 7; k++) {
    let x = R() * S, y = 3;
    for (let j = 0; j < 10 + R() * 12; j++) {
      pc.set(x | 0, y | 0, hex('#2e2018')); pc.setH(x | 0, y | 0, 0.7);
      y += 1; x += (R() - 0.5) * 1.6;
    }
  }
  // grass lip hanging over the top edge (rows 0..4, ragged)
  for (let x = 0; x < S; x++) {
    const d = 2 + Math.floor(tnoise(x / 3, 0, 64 / 3 | 0, seed + 9) * 4);
    for (let y = 0; y < d; y++) {
      pc.set(x, y, G[y === d - 1 ? 0 : y === 0 ? 3 : 1 + ((x + y) % 2)]);
      pc.setH(x, y, 1);
    }
    pc.set(x, d, shade(pc.get(x, d), -0.5)); // shadow under the lip
  }
  return pc;
}

/** Weathered wooden planks. */
export function wood(seed = 4) {
  const S = 32;
  const pc = new PixelCanvas(S, S);
  const W = ['#4a2e1e', '#5e3c26', '#734a2e', '#8a5c38', '#a07048'].map(hex);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const plank = Math.floor(y / 8);
    const g = Math.sin(x * 0.4 + plank * 3 + tfbm(x / 6, y / 4, 4, seed + plank) * 4) * 0.5 + 0.5;
    let i = 1 + Math.round(g * 2.4);
    if (y % 8 === 0) i = 0;
    if (y % 8 === 1) i = Math.min(4, i + 1);
    pc.set(x, y, W[Math.max(0, Math.min(4, i))]);
    pc.setH(x, y, y % 8 === 0 ? 0 : 0.5 + g * 0.3);
  }
  for (const [x, y] of [[3, 4], [27, 12], [5, 20], [24, 28]]) { pc.set(x, y, hex('#2a1a12')); pc.set(x + 1, y, hex('#c8a060')); }
  return pc;
}
