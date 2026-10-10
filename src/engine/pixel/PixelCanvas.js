import * as THREE from 'three';

/** Seeded PRNG (mulberry32). Procedural content must look identical on every load. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function hex(c) {
  const n = parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A small RGBA pixel buffer with a parallel height buffer (used to derive normal maps). */
export class PixelCanvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.height = new Float32Array(w * h);
  }
  set(x, y, rgb, a = 255) {
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; this.data[i + 3] = a;
  }
  get(x, y) {
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  setH(x, y, v) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; this.height[y * this.w + x] = v; }
  getH(x, y, wrap = true) {
    if (!wrap && (x < 0 || y < 0 || x >= this.w || y >= this.h)) return 0;
    x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h;
    return this.height[y * this.w + x];
  }
  toCanvas() {
    const c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    c.getContext('2d').putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return c;
  }
  /** Color texture: sRGB, NEAREST, mip-mapped minification so distant pixels do not shimmer. */
  toTexture({ repeat = true } = {}) {
    const t = new THREE.CanvasTexture(this.toCanvas());
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.generateMipmaps = true;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  /** Tangent-space normal map from the height buffer. */
  toNormalTexture({ strength = 2.5, wrap = true } = {}) {
    const out = new PixelCanvas(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const dx = (this.getH(x + 1, y, wrap) - this.getH(x - 1, y, wrap)) * strength;
        const dy = (this.getH(x, y + 1, wrap) - this.getH(x, y - 1, wrap)) * strength;
        const n = [-dx, dy, 1];
        const l = Math.hypot(n[0], n[1], n[2]);
        out.set(x, y, [((n[0] / l) * 0.5 + 0.5) * 255, ((n[1] / l) * 0.5 + 0.5) * 255, ((n[2] / l) * 0.5 + 0.5) * 255]);
      }
    }
    const t = new THREE.CanvasTexture(out.toCanvas());
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
}
