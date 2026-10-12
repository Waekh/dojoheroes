import * as THREE from 'three';
import { Engine } from './engine/core/Engine.js';
import { buildTerrain, box } from './engine/world/Diorama.js';
import { cobblestone, grass, cliff, wood } from './engine/pixel/textures.js';
import { loadSheet, recolor, blueToRed } from './engine/sprite/SpriteSheet.js';
import { Fighter } from './game/Fighter.js';
import { KeyboardInput } from './game/Input.js';
import { CpuAI } from './game/AI.js';
import { Hud } from './game/Hud.js';

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

// ---------- playable test: P1 (keyboard) vs CPU, LF2-style ----------
const q = new URLSearchParams(location.search);
const demo = q.has('demo'); // both fighters CPU-controlled (for screenshots)
const sheet = await loadSheet('/sprites/karateka');
const p1 = new Fighter(sheet, { name: 'KARATÉKA', x: 9.5, z: 6.6, face: 1 });
const p2 = new Fighter(recolor(sheet, blueToRed), { name: 'CPU', x: 14.5, z: 6.4, face: -1 });
const fighters = [p1, p2];
for (const f of fighters) scene.add(f.sprite);
const keyboard = new KeyboardInput();
const ai2 = new CpuAI(p2, { aggression: 0.55 });
const ai1 = demo ? new CpuAI(p1, { aggression: 0.8 }) : null;
const hud = new Hud(['P1 KARATEKA', 'CPU KARATEKA']);

// hit-stop: freeze both fighters for a few frames on impact (LF2 feel)
let freeze = 0, over = false, restartT = 0;
for (const f of fighters) f.onHit = (target, a) => { freeze = a.fall >= 60 ? 0.11 : 0.07; };

function reset() {
  Object.assign(p1, { x: 9.5, z: 6.6, y: 0, vx: 0, vy: 0, vz: 0, face: 1, hp: 100, shownHp: 100, tilt: 0, fallPts: 0 });
  Object.assign(p2, { x: 14.5, z: 6.4, y: 0, vx: 0, vy: 0, vz: 0, face: -1, hp: 100, shownHp: 100, tilt: 0, fallPts: 0 });
  for (const f of fighters) f.setState('idle');
  over = false; hud.message('');
}
window.addEventListener('keydown', (e) => { if (e.code === 'KeyR') reset(); });

engine.distance = 21;
engine.onUpdate((dt, t) => {
  const i1 = demo ? ai1.poll(dt, p2) : keyboard.poll(dt);
  const i2 = ai2.poll(dt, p1);
  if (freeze > 0) freeze -= dt;
  else {
    p1.update(dt, over ? null : i1, [p2]);
    p2.update(dt, over ? null : i2, [p1]);
  }
  if (!over && (p1.hp <= 0 || p2.hp <= 0)) {
    over = true; restartT = 3.5;
    hud.message('K.O.', p1.hp > 0 ? 'VICTOIRE !  (R pour rejouer)' : 'DEFAITE...  (R pour rejouer)');
  }
  if (over && demo && (restartT -= dt) < 0) reset();
  for (const f of fighters) f.render(engine.camera);
  hud.update(dt, fighters);
  // camera follows the fight
  const mid = (p1.x + p2.x) / 2;
  engine.target.x += (Math.min(16, Math.max(8, mid)) - engine.target.x) * Math.min(1, dt * 3);
  engine.updateCamera();
  for (const l of lanterns) l.L.intensity = l.base * (0.88 + 0.08 * Math.sin(t * 9 + l.seed) + 0.05 * Math.sin(t * 23 + l.seed * 2));
});
engine.start();
window.__game = { p1, p2, reset };
window.__ready = true;
