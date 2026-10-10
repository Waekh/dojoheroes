import * as THREE from 'three';
import { PixelCanvas } from '../pixel/PixelCanvas.js';
import { PPU } from '../constants.js';

/** Copy a loaded image (or a w×h region of it, for sprite sheets) into a PixelCanvas. */
export function imageToPixels(img, sx = 0, sy = 0, w = img.width, h = img.height) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const pc = new PixelCanvas(w, h);
  for (let i = 0; i < w * h; i++) {
    if (src[i * 4 + 3] >= 128) pc.set(i % w, (i / w) | 0, [src[i * 4], src[i * 4 + 1], src[i * 4 + 2]], 255);
  }
  autoBevel(pc);
  return pc;
}

/** Load a PNG sprite (transparent background) as a PixelCanvas. */
export function loadSprite(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(imageToPixels(img));
    img.onerror = () => reject(new Error(`sprite not found: ${url}`));
    img.src = url;
  });
}

/** height for the auto normal map: distance to the silhouette edge (a soft 2-3 px bevel) */
function autoBevel(pc) {
  const { w, h } = pc;
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
    const normalMap = pixels.toNormalTexture({ strength: 1.6, wrap: false });
    normalMap.minFilter = THREE.NearestFilter; normalMap.generateMipmaps = false;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate((0.5 - pivotX) * w, h / 2 - pivotY * h, 0); // pivotY: feet height (fraction from the bottom)
    this.uniforms = { uNormalUp: { value: 0.45 }, uFlash: { value: 0 } };
    const mat = new THREE.MeshLambertMaterial({ map, normalMap, alphaTest: 0.5, side: THREE.DoubleSide });
    // shading is already painted into the sprite: the scene only tints it, so keep part of it self-lit
    mat.emissive.set('#ffffff'); mat.emissiveMap = map; mat.emissiveIntensity = 0.38;
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
