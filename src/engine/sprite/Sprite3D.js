import * as THREE from 'three';
import { PixelCanvas, hex } from '../pixel/PixelCanvas.js';
import { PPU } from '../constants.js';

/** Build a PixelCanvas from a hand-made frame (array of strings + palette). */
export function frameToPixels(rows, palette) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const pc = new PixelCanvas(w, h);
  const cols = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, hex(v)]));
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = cols[row[x]];
      if (c) pc.set(x, y, c, 255);
    }
  });
  // height for the auto normal map: distance to the silhouette edge (a soft 2-3 px bevel)
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && pc.data[(y * w + x) * 4 + 3] > 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    let d = 3;
    for (let r = 1; r <= 3 && d === 3; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (!inside(x + dx, y + dy)) { d = Math.min(d, r - 1); }
      }
    }
    const lum = (pc.data[(y * w + x) * 4] + pc.data[(y * w + x) * 4 + 1] + pc.data[(y * w + x) * 4 + 2]) / 765;
    pc.setH(x, y, d / 3 * 0.8 + lum * 0.2);
  }
  return pc;
}

/** normal map straight from the renderer's view-space normals (softened: shading is partly baked) */
function normalsTexture(pc, amount = 0.6) {
  const { w, h, normals, mask } = pc;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, o = ((h - 1 - y) * w + x) * 4; // DataTexture rows start at the bottom
    let n = [0, 0, 1];
    if (mask[i] >= 0) n = [normals[i * 3] * amount, normals[i * 3 + 1] * amount, 1 - amount + normals[i * 3 + 2] * amount];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    data[o] = (n[0] / l * 0.5 + 0.5) * 255; data[o + 1] = (n[1] / l * 0.5 + 0.5) * 255; data[o + 2] = (n[2] / l * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, w, h);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
  return t;
}

/**
 * A pixel-art character standing upright in the 3D diorama.
 * - faces the camera (rotates around Y only)
 * - lit by the scene (normal map from the sprite's silhouette + bent normals)
 * - alpha-tested, casts a real shadow, plus a soft contact shadow
 */
export class Sprite3D extends THREE.Group {
  constructor(pixels, { pivotX = 0.5, pivotY = 0, flip = false } = {}) {
    super();
    const w = pixels.w / PPU, h = pixels.h / PPU;
    const map = pixels.toTexture({ repeat: false });
    map.minFilter = THREE.NearestFilter; map.generateMipmaps = false;
    // volumetric sprites carry their real per-pixel normals; hand-made ones get a bevel from the silhouette
    const normalMap = pixels.normals ? normalsTexture(pixels, 0.3) : pixels.toNormalTexture({ strength: 1.6, wrap: false });
    normalMap.minFilter = THREE.NearestFilter; normalMap.generateMipmaps = false;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate((0.5 - pivotX) * w, h / 2 - pivotY * h, 0); // pivotY: feet height (fraction from the bottom)
    this.uniforms = { uNormalUp: { value: 0.45 }, uFlash: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ map, normalMap, alphaTest: 0.5, side: THREE.DoubleSide });
    if (pixels.normals) {
      // shading is already painted into the sprite: the scene only tints it, so keep part of it self-lit
      mat.emissive.set('#ffffff'); mat.emissiveMap = map; mat.emissiveIntensity = 0.38;
    }
    mat.normalScale.set(1, 1);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNormalUp;\nuniform float uFlash;')
        // bend the shading normal toward world-up so the sun lights sprites like volumes, not flat cards
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
          normal = normalize( mix( normal, upV, uNormalUp ) + normal * 0.35 );`)
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( 1.0 ), uFlash );');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // alpha-tested shadow caster
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide });
    if (flip) this.mesh.scale.x = -1;
    this.add(this.mesh);
    // contact shadow blob
    const blob = new THREE.Mesh(new THREE.CircleGeometry(w * 0.32, 24), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55 }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    blob.scale.set(1.25, 0.75, 1);
    blob.renderOrder = 1;
    this.add(blob);
    this.blob = blob;
  }
  /** keep the card facing the camera horizontally (cylindrical billboard) */
  face(camera) {
    const dx = camera.position.x - this.position.x, dz = camera.position.z - this.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(10,6,20,1)'); gr.addColorStop(0.6, 'rgba(10,6,20,0.6)'); gr.addColorStop(1, 'rgba(10,6,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}
