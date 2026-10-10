// Karateka — volumetric chibi model rendered to pixel art by sdfRender
// (target look: Octopath Traveler CotC sprites — ~42 px tall, head ≈ 40 % of the height,
// dark outline around every part, high-contrast shading).
// Character space: x = forward (facing right), y = up, z = the character's left (toward the camera).
// Units are sprite pixels. Poses are joint angles in degrees (0 = limb hanging down, 90 = forward).
import { cap, ell, V, M3 } from '../../engine/sprite/sdfRender.js';

const { add, mul, sub } = V;
const R = Math.PI / 180;
const dir = (deg) => [Math.sin(deg * R), -Math.cos(deg * R), 0];
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

export const materials = {
  gi: { ramp: ['#ffffff', '#e4e3f0', '#b3b5d3', '#7f82b0', '#545688'], line: '#1a1730', bias: -0.12, contrast: 1.3, wrap: 0.05, amb: 0.12 },
  lapel: { ramp: ['#9a9cba', '#7d80a3', '#64678d'], line: '#1d1a2e', bias: 0.1 },
  skin: { ramp: ['#ffdcb4', '#f7b88a', '#d98a5e', '#a5543c'], line: '#33141a', bias: -0.15, contrast: 1.2, wrap: 0.15 },
  hair: { ramp: ['#9b735a', '#674637', '#422a2a', '#2a1820', '#190e14'], line: '#0c060b', bias: 0.05, contrast: 1.25, ao: 0.2, wrap: 0.1, amb: 0.1, spec: 0.45 },
  hairBase: { ramp: ['#422a2a', '#2a1820', '#190e14'], line: '#0c060b', bias: 0.1, ao: 0 },
  belt: { ramp: ['#5d5868', '#3a3544', '#211d28'], line: '#0e080d', bias: -0.05 },
};

export const BASE_POSE = {
  hipX: 0, lean: 6, head: -4,
  armF: { s: 56, e: 62, ab: 22, zi: 3 }, armB: { s: 8, e: 96, ab: 30, zi: 2 },
  legF: { h: 32, k: 26, ab: 4 }, legB: { h: -28, k: 6, ab: 6 },
};

// parts that grow out of each other: no separation line between them
const JOINED = new Set(['torso|armFS', 'torso|armBS', 'torso|legFP', 'torso|legBP', 'torso|neck', 'neck|head', 'belt|torso', 'hair|hairC']);

function build(pose) {
  const P = { ...BASE_POSE, ...pose };
  const lean = P.lean * R;
  const u = [Math.sin(lean), Math.cos(lean), 0]; // spine (up)
  const f = [Math.cos(lean), -Math.sin(lean), 0]; // chest forward
  const z = [0, 0, 1];
  const rotT = M3.rotZ(-lean);
  const H = [P.hipX, 12, 0];
  const T = (a, b, c) => add(add(add(H, mul(f, a)), mul(u, b)), mul(z, c)); // torso frame
  // leg chain; abduction swings the leg outward (sideways stance)
  const legJoints = (l, side) => {
    const Hj = T(0, -0.3, 2.4 * side);
    const ab = (l.ab || 0) * R;
    const sw = (d) => [d[0], d[1] * Math.cos(ab), -d[1] * Math.sin(ab) * side];
    const K = add(Hj, mul(sw(dir(l.h)), 6.2));
    const A = add(K, mul(sw(dir(l.h - l.k)), 6.0));
    return { Hj, K, A };
  };
  // grounded poses: move the hips so the lowest sole touches y = 0 (airborne poses set ground:false + hipY)
  if (P.ground !== false) {
    const low = Math.min(legJoints(P.legF, -1).A[1], legJoints(P.legB, 1).A[1]) - 2.0;
    H[1] -= low;
  } else H[1] = P.hipY ?? 14;
  const neck = T(0, 8.4, 0);
  const parts = [];

  // ---- torso (gi jacket) ----
  parts.push({
    name: 'torso', mat: 'gi', k: 1.3, wrinkle: 0.12,
    prims: [
      ell(T(0.1, 5.3, 0), [2.9, 3.4, 4.4], rotT),
      ell(T(0, 2.0, 0), [2.6, 2.6, 3.9], rotT),
      ell(T(0.2, -0.5, 0), [3.0, 2.1, 4.2], rotT),
      cap(T(-0.2, 7.4, 4.0), T(-0.2, 7.4, -4.0), 1.9),
    ],
    // open V collar showing the chest, with a darker lapel band along it
    skin(p) {
      const q = sub(p, neck);
      const qx = V.dot(q, f), qy = V.dot(q, u), qz = q[2];
      if (qx < 0.5 || qy < -5.6 || qy > 1) return null;
      const half = (qy + 5.6) * 0.4;
      if (Math.abs(qz) < half) return 'skin';
      if (Math.abs(qz) < half + 0.8) return 'lapel';
      return null;
    },
  });

  // ---- belt with knot and tails ----
  const knot = T(2.8, 1.0, 1.1);
  parts.push({
    name: 'belt', mat: 'belt', k: 0.4,
    prims: [
      ell(T(0.1, 1.0, 0), [2.9, 0.9, 4.3], rotT),
      ell(knot, [0.8, 0.9, 1.0]),
      cap(knot, add(knot, add(mul(u, -3.6), add(mul(f, 0.4), mul(z, 0.2)))), 0.6, 0.55),
      cap(knot, add(knot, add(mul(u, -3.0), add(mul(f, 0.5), mul(z, 1.6)))), 0.6, 0.55),
    ],
  });

  // ---- neck + big chibi head ----
  const ht = (P.lean + P.head) * R;
  const hu = [Math.sin(ht), Math.cos(ht), 0], hf = [Math.cos(ht), -Math.sin(ht), 0];
  const hc = add(neck, add(mul(u, 6.6), mul(f, 0.4)));
  const Hd = (a, b, c) => add(add(add(hc, mul(hf, a)), mul(hu, b)), mul(z, c)); // head frame
  const rotH = M3.rotZ(-ht);
  parts.push({ name: 'neck', mat: 'skin', k: 0, prims: [cap(sub(neck, mul(u, 1)), add(neck, mul(u, 3)), 1.7, 1.6)] });
  parts.push({
    name: 'head', mat: 'skin', k: 1.3,
    prims: [
      ell(Hd(0, 0.2, 0), [6.2, 6.6, 6.0], rotH),
      ell(Hd(2.0, -3.6, 0), [3.9, 2.9, 4.1], rotH),
      ell(Hd(6.1, -1.3, 0), [0.9, 1.0, 0.7], rotH),
      ell(Hd(-0.7, -0.8, 5.8), [0.9, 1.5, 0.7], rotH),
      ell(Hd(-0.7, -0.8, -5.8), [0.9, 1.5, 0.7], rotH),
    ],
  });

  // ---- messy spiky hair: a dark base cap covered by clumps ----
  // every clump is its own part, so overlapping strands get dark separation lines like hand-drawn hair
  parts.push({ name: 'hair', mat: 'hairBase', k: 0, prims: [ell(Hd(-1.4, 2.6, 0), [6.1, 5.3, 6.2], rotH)] });
  const root = Hd(-0.8, 3.4, 0);
  const clump = (from, to, r0 = 2.6, r1 = 0.35) => parts.push({ name: 'hairC', mat: 'hair', k: 0, prims: [cap(from, to, r0, r1)] });
  // crown spikes, radiating from the top of the skull
  const spikes = [
    [2.5, 9.8, 0.5], [-1.5, 10.2, -1.8], [-5.2, 8.9, 2.2], [-8.6, 5.6, -0.8], [-8.9, 1.4, 2.4], [-7.4, -2.6, -0.4],
    [0.6, 8.2, 6.4], [-2.8, 7.4, -6.4], [4.6, 8.6, 3.6], [5.3, 8.2, -2.6], [-5.2, 4.8, 6.2], [-4.6, 5.6, -5.8],
  ];
  for (const t of spikes) {
    const tip = Hd(...t);
    clump(lerp(root, tip, 0.25), tip, 2.9, 0.4);
  }
  // bangs falling over the forehead at uneven lengths
  for (const [zz, s, drop] of [[-3.4, -1, 3.0], [-0.8, 1, 2.2], [1.8, -1, 3.2], [4.4, 1, 2.0]]) {
    clump(Hd(2.4, 5.8, zz * 0.8), Hd(6.9, drop, zz + 0.9 * s), 1.8, 0.3);
  }
  // sideburns
  for (const s of [1, -1]) clump(Hd(1.0, 2.8, 5.8 * s), Hd(1.8, -2.0, 6.1 * s), 1.1, 0.4);

  // ---- arms (front = left, near the camera) ----
  for (const [key, side] of [['armF', 1], ['armB', -1]]) {
    const a = P[key];
    const S = T(-0.2, 7.2, 4.4 * side);
    // abduction swings the elbow outward (away from the body) around the forward axis
    const swing = (d, ab) => [d[0], d[1] * Math.cos(ab * R), -d[1] * Math.sin(ab * R) * side + Math.abs(d[0]) * Math.sin(ab * R) * side * 0.3];
    const E = add(S, mul(swing(dir(a.s), a.ab || 0), 4.7));
    const W = add(E, mul(dir(a.s + a.e), 4.5));
    W[2] -= side * a.zi;
    parts.push({ name: key + 'S', mat: 'gi', k: 0.7, wrinkle: 0.1, prims: [cap(S, E, 2.3, 2.05), cap(E, lerp(E, W, 0.7), 2.05, 2.3)] });
    const fd = V.norm(sub(W, E));
    parts.push({
      name: key + 'H', mat: 'skin', k: 0.5,
      prims: [cap(lerp(E, W, 0.6), W, 1.05, 1.15), ell(add(W, mul(fd, 0.7)), [1.95, 1.8, 1.7], M3.rotZ((a.s + a.e - 90) * R))],
    });
  }

  // ---- legs: loose gi pants + bare feet ----
  // front leg = far side (right leg) so the stance spreads across the screen in 3/4 view
  for (const [key, side] of [['legF', -1], ['legB', 1]]) {
    const l = P[key];
    const { Hj, K, A } = legJoints(l, side);
    parts.push({ name: key + 'P', mat: 'gi', k: 0.9, wrinkle: 0.12, prims: [cap(Hj, K, 2.8, 2.5), cap(K, lerp(K, A, 0.8), 2.5, 2.75)] });
    const fa = (l.f || 0) * R; // toe pitch: + = toes up
    const fdir = [Math.cos(fa), Math.sin(fa), 0];
    parts.push({
      name: key + 'F', mat: 'skin', k: 0.7,
      prims: [cap(lerp(K, A, 0.7), A, 1.05), ell(add(A, add(mul(fdir, 1.5), [0, -0.9, 0])), [2.5, 1.1, 1.45], M3.rotZ(fa))],
    });
  }

  // ---- face marks (projected, depth-tested) ----
  const facingL = V.norm(add(mul(hf, 0.8), mul(z, 0.6)));
  const facingR = V.norm(add(mul(hf, 0.8), mul(z, -0.6)));
  const eye = '#1c1018', brow = '#24161d', white = '#f2ece6';
  const marks = [
    { p: Hd(5.7, -0.9, 2.7), facing: facingL, px: [[0, 0, eye], [0, 1, eye], [-1, 0, white], [-1, 1, eye], [0, -2, brow], [-1, -2, brow], [1, -2, brow]], onlyMat: 'skin', tol: 2 },
    { p: Hd(5.7, -0.9, -2.6), facing: facingR, minFacing: -0.3, px: [[0, 0, eye], [0, 1, eye], [0, -2, brow]], onlyMat: 'skin', tol: 2.5 },
    { p: Hd(5.6, -4.2, 1.0), facing: hf, px: [[0, 0, '#9b4a3c']], onlyMat: 'skin', tol: 2 },
  ];

  const joined = (a, b) => JOINED.has(`${a.name}|${b.name}`) || JOINED.has(`${b.name}|${a.name}`);
  return { parts, marks, joined };
}

export const KARATEKA = { w: 56, h: 52, origin: [24, 49], scale: 1.12, yaw: 0.8, pitch: 0.2, light: [0.4, 0.75, 0.55], materials, build };

/** a few key poses for the lab */
export const POSES = {
  guard: {},
  punch: { lean: 14, armB: { s: 90, e: 0, ab: 0, zi: -1 }, armF: { s: -10, e: 115, ab: 25, zi: 1 }, legF: { h: 38, k: 30, ab: 4 }, legB: { h: -34, k: 2, ab: 6 } },
  kick: { lean: -14, legF: { h: 98, k: 6, f: 40, ab: 4 }, legB: { h: -6, k: 4, ab: 6 }, armF: { s: 60, e: 80, ab: 30, zi: 4 }, armB: { s: -35, e: 50, ab: 25, zi: 0 } },
};
