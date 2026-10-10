import * as THREE from 'three';

/** Renderer + diorama camera + main loop. */
export class Engine {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    // Diorama camera: narrow FOV, far away, looking down ~30 degrees, perpendicular to the arena's X axis
    this.camera = new THREE.PerspectiveCamera(28, 16 / 9, 1, 200);
    this.target = new THREE.Vector3(12, 0, 6.5);
    this.pitch = THREE.MathUtils.degToRad(30);
    this.distance = 24;
    this.updateCamera();
    this.clock = new THREE.Clock();
    this.updaters = [];
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  updateCamera() {
    const c = this.camera, t = this.target;
    c.position.set(t.x, t.y + Math.sin(this.pitch) * this.distance, t.z + Math.cos(this.pitch) * this.distance);
    c.lookAt(t);
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  onUpdate(fn) { this.updaters.push(fn); }
  start() {
    const loop = () => {
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;
      for (const fn of this.updaters) fn(dt, t);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
