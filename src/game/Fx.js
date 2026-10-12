// Combat feedback: hit-stop, soft impact glow (no pixel particles), camera shake,
// special-move afterimages and the special's name popping above the fighter.
import * as THREE from 'three';

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.9)');
  gr.addColorStop(0.6, 'rgba(255,170,80,0.35)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export class Fx {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera;
    this.freeze = 0;
    this.shakeT = 0; this.shakeAmp = 0;
    this.items = []; // { obj, t, life, update }
    this.ghostTimers = new Map();
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:4';
    document.body.appendChild(this.layer);
  }

  hit(target, from, { blocked = false, knock = false } = {}) {
    this.freeze = Math.max(this.freeze, knock ? 0.11 : 0.065);
    if (knock) this.shake(0.18, 0.12);
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), color: blocked ? '#9fd8ff' : '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(mat);
    s.position.set((target.x + from.x) / 2 + target.face * -0.1, target.y + 1.75, target.z + 0.15);
    this.scene.add(s);
    const big = knock ? 1.9 : 1.2;
    this.items.push({ obj: s, t: 0, life: 0.16, update: (k) => { s.scale.setScalar(0.4 + big * k); mat.opacity = 1 - k; } });
  }

  shake(time = 0.12, amp = 0.08) { this.shakeT = Math.max(this.shakeT, time); this.shakeAmp = Math.max(this.shakeAmp, amp); }

  /** leave an afterimage of fighter f every `every` seconds */
  ghost(f, every) {
    const now = performance.now() / 1000;
    if (now - (this.ghostTimers.get(f) ?? -1) < every) return;
    this.ghostTimers.set(f, now);
    const g = f.makeGhost(f.def.color);
    this.scene.add(g);
    this.items.push({ obj: g, t: 0, life: 0.28, update: (k) => { g.material.opacity = 0.5 * (1 - k); } });
  }

  callout(f, text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `position:absolute;font:28px 'VT323',monospace;color:#fff6d8;white-space:nowrap;
      text-shadow:2px 2px 0 ${f.def.color},4px 4px 0 #120a18;transform:translate(-50%,-100%)`;
    this.layer.appendChild(el);
    const pos = new THREE.Vector3();
    this.items.push({
      dom: el, t: 0, life: 1.0,
      update: (k) => {
        pos.set(f.x, f.y + 3.4 + k * 0.6, f.z).project(this.camera);
        el.style.left = `${(pos.x * 0.5 + 0.5) * innerWidth}px`;
        el.style.top = `${(-pos.y * 0.5 + 0.5) * innerHeight}px`;
        el.style.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      },
    });
  }

  update(dt) {
    this.freeze = Math.max(0, this.freeze - dt);
    for (const it of this.items) {
      it.t += dt;
      it.update(Math.min(1, it.t / it.life));
    }
    for (const it of this.items.filter((x) => x.t >= x.life)) {
      if (it.obj) { this.scene.remove(it.obj); it.obj.material.map !== glowTexture() && it.obj.material.map?.dispose(); it.obj.material.dispose(); }
      it.dom?.remove();
    }
    this.items = this.items.filter((x) => x.t < x.life);
    // camera shake offset, applied after the camera is placed
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shakeAmp * 2;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeAmp * 2;
    } else this.shakeAmp = 0;
  }

  clear() {
    for (const it of this.items) { if (it.obj) this.scene.remove(it.obj); it.dom?.remove(); }
    this.items = [];
    this.freeze = 0;
  }
}
