// Karateka — volumetric model rendered to pixel art by sdfRender.
// Character space: x = forward (facing right), y = up, z = the character's left (toward the camera).
// Units are sprite pixels. Poses are joint angles in degrees (0 = limb hanging down, 90 = forward).
import { cap, ell, V, M3 } from '../../engine/sprite/sdfRender.js';

const { add, mul, sub } = V;
const R = Math.PI / 180;
const dir = (deg) => [Math.sin(deg * R), -Math.cos(deg * R), 0];
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

export const materials = {
  gi: { ramp: ['#fbf8f1', '#e9e6e4', '#cfd0db', '#a9abc4', '#7c7fa1'], line: '#2f2c45', bias: -0.08, contrast: 1.35 },
  lapel: { ramp: ['#b9bacb', '#a0a2bb', '#8486a4', '#6a6c8f', '#53557a'], line: '#2f2c45', bias: 0.1 },
  skin: { ramp: ['#fcd4aa', '#efb48b', '#d68f69', '#b26b4e', '#8b4d3a'], line: '#4b2421', bias: -0.2, contrast: 1.1 },
  hair: { ramp: ['#6b4f4c', '#45333a', '#2d2128', '#1d161c'], line: '#0f0a0f', bias: -0.1, contrast: 1.25, ao: 0.15 },
  belt: { ramp: ['#56505e', '#37323f', '#25212b', '#18151c'], line: '#0d090e', bias: 0 },
};

export const BASE_POSE = {
  hipX: 0, hipY: 17.2, lean: 6, head: -4,
  armF: { s: 42, e: 70, ab: 30, zi: 4.5 }, armB: { s: 14, e: 96, ab: 34, zi: 5 },
  legF: { h: 32, k: 26, ab: 4 }, legB: { h: -28, k: 6, ab: 6 },
};

function build(pose) {
  const P = { ...BASE_POSE, ...pose };
  const lean = P.lean * R;
  const u = [Math.sin(lean), Math.cos(lean), 0]; // spine (up)
  const f = [Math.cos(lean), -Math.sin(lean), 0]; // chest forward
  const z = [0, 0, 1];
  const rotT = M3.rotZ(-lean);
  const H = [P.hipX, P.hipY, 0];
  const T = (a, b, c) => add(add(add(H, mul(f, a)), mul(u, b)), mul(z, c)); // torso frame
  // leg chain; abduction swings the leg outward (sideways stance)
  const legJoints = (l, side) => {
    const Hj = T(0, -0.4, (2.8 + (l.zo || 0)) * side);
    const ab = (l.ab || 0) * R;
    const sw = (d) => [d[0], d[1] * Math.cos(ab), -d[1] * Math.sin(ab) * side];
    const K = add(Hj, mul(sw(dir(l.h)), 9));
    const A = add(K, mul(sw(dir(l.h - l.k)), 8.6));
    return { Hj, K, A };
  };
  // grounded poses: lift/lower the hips so the lowest sole touches y = 0
  if (P.ground !== false) {
    const low = Math.min(legJoints(P.legF, -1).A[1], legJoints(P.legB, 1).A[1]) - 2.3;
    H[1] -= low;
  }
  const neck = T(0, 11.5, 0);
  const parts = [];

  // ---- torso (gi jacket) ----
  parts.push({
    name: 'torso', mat: 'gi', k: 1.6, wrinkle: 0.16,
    prims: [
      ell(T(0.1, 7, 0), [3.4, 4.8, 5.4], rotT),
      ell(T(0, 2.6, 0), [3.1, 3.4, 4.8], rotT),
      ell(T(0.2, -0.6, 0), [3.6, 2.7, 5.1], rotT),
      cap(T(-0.2, 10.3, 4.9), T(-0.2, 10.3, -4.9), 2.3),
    ],
    // open V collar showing the chest, with a darker lapel band along it
    skin(p) {
      const q = sub(p, neck);
      const qx = V.dot(q, f), qy = V.dot(q, u), qz = q[2];
      if (qx < 0.6 || qy < -7 || qy > 1) return null;
      const half = (qy + 7) * 0.36;
      if (Math.abs(qz) < half) return 'skin';
      if (Math.abs(qz) < half + 0.9) return 'lapel';
      return null;
    },
  });

  // ---- belt with knot and tails ----
  const knot = T(3.35, 1.4, 1.3);
  parts.push({
    name: 'belt', mat: 'belt', k: 0.5,
    prims: [
      ell(T(0.1, 1.4, 0), [3.55, 1.05, 5.2], rotT),
      ell(knot, [0.9, 1.0, 1.1]),
      cap(knot, add(knot, add(mul(u, -4.6), add(mul(f, 0.5), mul(z, 0.3)))), 0.7, 0.6),
      cap(knot, add(knot, add(mul(u, -3.8), add(mul(f, 0.6), mul(z, 1.9)))), 0.7, 0.6),
    ],
  });

  // ---- neck + head ----
  const ht = (P.lean + P.head) * R;
  const hu = [Math.sin(ht), Math.cos(ht), 0], hf = [Math.cos(ht), -Math.sin(ht), 0];
  const hc = add(neck, add(mul(u, 6.0), mul(f, 0.4)));
  const Hd = (a, b, c) => add(add(add(hc, mul(hf, a)), mul(hu, b)), mul(z, c)); // head frame
  const rotH = M3.rotZ(-ht);
  parts.push({ name: 'neck', mat: 'skin', k: 0, prims: [cap(sub(neck, mul(u, 1.2)), add(neck, mul(u, 3)), 2.0, 1.9)] });
  parts.push({
    name: 'head', mat: 'skin', k: 1.3,
    prims: [
      ell(Hd(0, 0.2, 0), [5.8, 6.3, 5.6], rotH),
      ell(Hd(1.9, -3.3, 0), [3.7, 2.8, 3.9], rotH),
      ell(Hd(5.7, -1.1, 0), [0.9, 1.0, 0.7], rotH),
      ell(Hd(-0.7, -0.6, 5.4), [0.9, 1.5, 0.7], rotH),
      ell(Hd(-0.7, -0.6, -5.4), [0.9, 1.5, 0.7], rotH),
    ],
  });

  // ---- messy hair: a cap plus clumps ----
  const hair = [ell(Hd(-1.5, 2.9, 0), [5.9, 5.0, 6.0], rotH)];
  for (const [zz, s] of [[-3.1, -1], [-1.1, 1], [1, -1], [3, 1]]) {
    hair.push(cap(Hd(2.0, 5.2, zz), Hd(6.4, 0.9 + ((zz * 7) % 3 + 3) % 3 * 0.45, zz + 0.7 * s), 1.5, 0.3));
  }
  const tips = [[1.6, 8.6, 0.6], [-2.4, 8.4, -2], [-5.4, 7.1, 2.2], [-7.9, 4.3, -1], [-7.6, 0.6, 1.9], [-6.2, -3, 0],
    [0.4, 6.6, 6.1], [-1.4, 5.2, -6.2], [3.6, 7.4, 3.1], [4.3, 6.9, -2.6], [-4.2, 3.2, 5.6]];
  for (const t of tips) hair.push(cap(Hd(-1.2, 3.6, 0), Hd(t[0] * 1.05, t[1] * 1.05 + 0.6, t[2] * 1.05), 2.5, 0.35));
  for (const s of [1, -1]) hair.push(cap(Hd(1.0, 2.5, 5.2 * s), Hd(1.6, -1.6, 5.5 * s), 0.9, 0.4));
  parts.push({ name: 'hair', mat: 'hair', k: 0.9, prims: hair });

  // ---- arms (front = left, near the camera) ----
  for (const [key, side] of [['armF', 1], ['armB', -1]]) {
    const a = P[key];
    const S = T(-0.3, 10, 5.3 * side);
    // abduction swings the elbow outward (away from the body) around the forward axis
    const swing = (d, ab) => [d[0], d[1] * Math.cos(ab * R), -d[1] * Math.sin(ab * R) * side + Math.abs(d[0]) * Math.sin(ab * R) * side * 0.3];
    const E = add(S, mul(swing(dir(a.s), a.ab || 0), 6.4));
    const W = add(E, mul(dir(a.s + a.e), 6));
    W[2] -= side * a.zi;
    parts.push({ name: key + 'S', mat: 'gi', k: 0.8, wrinkle: 0.14, prims: [cap(S, E, 2.9, 2.55), cap(E, lerp(E, W, 0.72), 2.55, 2.85)] });
    const fd = V.norm(sub(W, E));
    parts.push({
      name: key + 'H', mat: 'skin', k: 0.6,
      prims: [cap(lerp(E, W, 0.62), W, 1.3, 1.4), ell(add(W, mul(fd, 0.9)), [2.3, 2.1, 1.95], M3.rotZ((a.s + a.e - 90) * R))],
    });
  }

  // ---- legs: loose gi pants + bare feet ----
  // front leg = far side (right leg) so the stance spreads across the screen in 3/4 view
  for (const [key, side] of [['legF', -1], ['legB', 1]]) {
    const l = P[key];
    const { Hj, K, A } = legJoints(l, side);
    parts.push({ name: key + 'P', mat: 'gi', k: 1, wrinkle: 0.18, prims: [cap(Hj, K, 3.5, 3.05), cap(K, lerp(K, A, 0.84), 3.05, 3.35)] });
    const fa = (l.f || 0) * R; // toe pitch: + = toes up
    const fdir = [Math.cos(fa), Math.sin(fa), 0];
    parts.push({
      name: key + 'F', mat: 'skin', k: 0.8,
      prims: [cap(lerp(K, A, 0.75), A, 1.25), ell(add(A, add(mul(fdir, 1.9), [0, -1.0, 0])), [3.1, 1.3, 1.75], M3.rotZ(fa))],
    });
  }

  // ---- face marks (projected, depth-tested) ----
  const facingL = V.norm(add(mul(hf, 0.8), mul(z, 0.6)));
  const facingR = V.norm(add(mul(hf, 0.8), mul(z, -0.6)));
  const eye = '#231820', brow = '#2a1f27';
  const marks = [
    { p: Hd(5.25, -0.6, 2.4), facing: facingL, px: [[0, 0, eye], [0, 1, eye], [1, 1, '#7a4a3c'], [0, -2, brow], [1, -2, brow]], onlyMat: 'skin', tol: 2 },
    { p: Hd(5.25, -0.6, -2.4), facing: facingR, minFacing: -0.25, px: [[0, 0, eye], [0, 1, eye], [0, -2, brow]], onlyMat: 'skin', tol: 2 },
    { p: Hd(5.2, -3.8, 1.0), facing: hf, px: [[0, 0, '#a85646']], onlyMat: 'skin', tol: 2 },
  ];

  return { parts, marks };
}

export const KARATEKA = { w: 72, h: 66, origin: [32, 63], scale: 1.18, yaw: 0.8, pitch: 0.2, light: [-0.55, 0.7, 0.5], materials, build };

/** a few key poses for the lab */
export const POSES = {
  guard: {},
  punch: { lean: 10, armF: { s: 88, e: 2, ab: 4, zi: 3 }, armB: { s: 12, e: 120, ab: 25, zi: 2 }, legF: { h: 38, k: 30, ab: 4 }, legB: { h: -34, k: 2, ab: 6 }, lean: 12 },
  kick: { lean: -14, hipY: 19.5, legF: { h: 98, k: 6, f: 40, ab: 4 }, legB: { h: -6, k: 4, ab: 6 }, armF: { s: 60, e: 80, ab: 30, zi: 5 }, armB: { s: -35, e: 50, ab: 25, zi: 0 } },
};
