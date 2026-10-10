import * as THREE from 'three';
import { Engine } from './engine/core/Engine.js';
import { buildTerrain, box } from './engine/world/Diorama.js';
import { cobblestone, grass, cliff, wood } from './engine/pixel/textures.js';
import { Sprite3D, frameToPixels } from './engine/sprite/Sprite3D.js';
import { FRAME, PALETTE } from './game/sprites/fighter_idle.js';

const engine = new Engine(document.getElementById('app'));
const { scene } = engine;

// ---------- sky & atmosphere (golden hour) ----------
const sky = document.createElement('canvas');
sky.width = 4; sky.height = 256;
const sg = sky.getContext('2d');
const grad = sg.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#3a4a7a'); grad.addColorStop(0.55, '#d88a6a'); grad.addColorStop(1, '#ffd2a0');
sg.fillStyle = grad; sg.fillRect(0, 0, 4, 256);
const skyTex = new THREE.CanvasTexture(sky);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog('#e8a880', 30, 70);

// ---------- materials ----------
const mat = (pc, opts = {}) => new THREE.MeshLambertMaterial({ map: pc.toTexture(), normalMap: pc.toNormalTexture({ strength: opts.strength ?? 2.2 }), ...opts.extra });
const cob = cobblestone(7), grs = grass(11), clf = cliff(5), wd = wood(3);
const materials = { cobble: mat(cob, { strength: 3 }), grass: mat(grs, { strength: 1.6 }), cliff: mat(clf, { strength: 2.4 }) };
const woodMat = mat(wd, { strength: 2 });

// ---------- diorama layout: a lane-shaped arena along X ----------
const W = 24, D = 17, OFF = 4; // OFF rows of tall backdrop behind the lane
const heights = [], tops = [];
for (let j = 0; j < D; j++) {
  heights.push([]); tops.push([]);
  for (let i = 0; i < W; i++) {
    let h = 0, t = 'grass';
    const jj = j - OFF;
    if (jj < 0) h = 7 + (jj < -2 ? 3 : 0) + ((i * 7 + j * 3) % 5 === 0 ? 1 : 0); // backdrop cliffs
    else if (jj <= 2) h = 3;                       // back ledge
    else if (jj === 3) h = (i > 7 && i < 11) ? 2 : (i % 7 === 0 ? 2 : 1); // broken step
    else if (jj >= 4 && jj <= 8) t = 'cobble'; // fighting lane
    if (jj >= 11) h = -1;                     // front drop toward the camera
    if (jj === 3 && i >= 15 && i <= 17) h = 3;
    heights[j].push(h); tops[j].push(t);
  }
}
const Z0 = -OFF; // shift so the lane keeps its coordinates
const terrain = buildTerrain({ heights, tops, materials });
terrain.position.z = Z0;
scene.add(terrain);

// props: crates, lantern posts
scene.add(box(0.9, 0.9, 0.9, woodMat, { x: 4.6, y: 0, z: 9.6 }));
scene.add(box(0.7, 0.7, 0.7, woodMat, { x: 5.5, y: 0, z: 9.9 }));
scene.add(box(0.8, 0.8, 0.8, woodMat, { x: 4.9, y: 0.9, z: 9.6 }));
scene.add(box(1.0, 0.9, 1.0, woodMat, { x: 19.5, y: 1.5, z: 1.5 }));

const lanterns = [];
function lantern(x, z, y = 0) {
  scene.add(box(0.18, 1.7, 0.18, woodMat, { x, y, z }));
  const lampMat = new THREE.MeshLambertMaterial({ color: '#2a1a14', emissive: '#ffb050', emissiveIntensity: 2.2 });
  const lamp = box(0.34, 0.36, 0.34, lampMat, { x, y: y + 1.62, z });
  lamp.castShadow = false;
  scene.add(lamp);
  const L = new THREE.PointLight('#ffa850', 9, 7.5, 2);
  L.position.set(x, y + 1.85, z + 0.25);
  scene.add(L);
  lanterns.push({ L, base: 9, seed: x * 3.1 });
}
lantern(8.5, 4.3);
lantern(16.5, 9.4);

// ---------- light: warm low sun + cool sky fill ----------
const sun = new THREE.DirectionalLight('#ffc888', 4.6);
sun.position.set(engine.target.x - 10, 11, engine.target.z + 3);
sun.target.position.copy(engine.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.left = -18; sc.right = 18; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 50;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 2.5;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight('#7f9ae0', '#4a3022', 0.7));

// ---------- fighters (hand-made placeholder pixel art) ----------
const px = frameToPixels(FRAME, PALETTE);
const a = new Sprite3D(px, { pivotX: 0.42 });
a.position.set(10.6, 0, 6.6);
const b = new Sprite3D(px, { pivotX: 0.42, flip: true });
b.position.set(13.4, 0, 6.2);
scene.add(a, b);
const sprites = [a, b];

// ?zoom=1 : close-up camera for inspecting sprites
const q = new URLSearchParams(location.search);
if (q.get('zoom')) { engine.distance = 11; engine.target.set(12, 1.2, 6.4); engine.updateCamera(); }

engine.onUpdate((dt, t) => {
  for (const s of sprites) s.face(engine.camera);
  for (const l of lanterns) l.L.intensity = l.base * (0.88 + 0.08 * Math.sin(t * 9 + l.seed) + 0.05 * Math.sin(t * 23 + l.seed * 2));
});
engine.start();
window.__ready = true;
