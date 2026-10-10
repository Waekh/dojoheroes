import * as THREE from 'three';
import { LEVEL } from '../constants.js';

const TEX_UNITS = 4; // a 64px texture covers 4x4 world units (16 px / unit)
const texUnits = (m) => (m.map && m.map.image ? m.map.image.width / 16 : TEX_UNITS);

/**
 * Block terrain for the diorama. heights[j][i] is in terrain levels, tops[j][i] a material key.
 * Tile (i, j) covers x in [i, i+1], z in [j, j+1]. Side faces use the 'cliff' material.
 */
export function buildTerrain({ heights, tops, materials, base = -3 }) {
  const H = heights.length, W = heights[0].length;
  const buf = {};
  const get = (k) => (buf[k] ||= { pos: [], nor: [], uv: [] });
  const hAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? null : heights[j][i] * LEVEL);
  const quad = (b, p, n, uv) => {
    // p: 4 corners (ccw seen from the normal), uv: 4 pairs
    for (const k of [0, 1, 2, 0, 2, 3]) { b.pos.push(...p[k]); b.nor.push(...n); b.uv.push(...uv[k]); }
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const y = hAt(i, j);
    const top = get(tops[j][i]);
    const U = texUnits(materials[tops[j][i]]);
    quad(top, [[i, y, j + 1], [i + 1, y, j + 1], [i + 1, y, j], [i, y, j]], [0, 1, 0],
      [[i / U, -(j + 1) / U], [(i + 1) / U, -(j + 1) / U], [(i + 1) / U, -j / U], [i / U, -j / U]]);
    const side = get('cliff');
    const sides = [
      { n: [0, 0, 1], nb: hAt(i, j + 1), a: [i, j + 1], b: [i + 1, j + 1], u0: i },
      { n: [0, 0, -1], nb: hAt(i, j - 1), a: [i + 1, j], b: [i, j], u0: -i - 1 },
      { n: [1, 0, 0], nb: hAt(i + 1, j), a: [i + 1, j + 1], b: [i + 1, j], u0: -j - 1 },
      { n: [-1, 0, 0], nb: hAt(i - 1, j), a: [i, j], b: [i, j + 1], u0: j },
    ];
    for (const s of sides) {
      const y0 = s.nb === null ? base : s.nb;
      if (y0 >= y) continue;
      const v = (yy) => 1 - (y - yy) / TEX_UNITS;
      quad(side, [[s.a[0], y0, s.a[1]], [s.b[0], y0, s.b[1]], [s.b[0], y, s.b[1]], [s.a[0], y, s.a[1]]], s.n,
        [[s.u0 / TEX_UNITS, v(y0)], [(s.u0 + 1) / TEX_UNITS, v(y0)], [(s.u0 + 1) / TEX_UNITS, v(y)], [s.u0 / TEX_UNITS, v(y)]]);
    }
  }
  const group = new THREE.Group();
  for (const [k, b] of Object.entries(buf)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const m = new THREE.Mesh(g, materials[k]);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  return group;
}

/** A simple textured box prop (crates, posts...). */
export function box(w, h, d, material, { x = 0, y = 0, z = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  // world-scale UVs so the pixel density matches the terrain
  const uv = g.attributes.uv, pos = g.attributes.position, nor = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const px = pos.getX(i) + w / 2, py = pos.getY(i) + h / 2, pz = pos.getZ(i) + d / 2;
    const [u, v] = ny > 0.5 ? [px, pz] : nx > 0.5 ? [pz, py] : [px, py];
    uv.setXY(i, u / 2, v / 2);
  }
  const m = new THREE.Mesh(g, material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
