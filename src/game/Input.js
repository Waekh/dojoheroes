// Keyboard controller producing the same "intent" object the CPU AI produces.
// Physical key codes, so ZQSD on AZERTY works like WASD.
const MAP = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  punch: ['KeyJ'], jump: ['KeyK', 'Space'], kick: ['KeyL'],
};
const DOUBLE_TAP = 0.25; // s, LF2-style run: tap a direction twice

export class KeyboardInput {
  constructor() {
    this.down = new Set();
    this.pressed = new Set(); // keys pressed since the last poll
    this.lastTap = { left: -1, right: -1 };
    this.time = 0;
    this.runTap = 0;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const a = this.action(e.code);
      if (!a) return;
      e.preventDefault();
      this.down.add(a); this.pressed.add(a);
      if (a === 'left' || a === 'right') {
        if (this.time - this.lastTap[a] < DOUBLE_TAP) this.runTap = a === 'right' ? 1 : -1;
        this.lastTap[a] = this.time;
      }
    });
    window.addEventListener('keyup', (e) => { const a = this.action(e.code); if (a) this.down.delete(a); });
    window.addEventListener('blur', () => this.down.clear());
  }
  action(code) {
    for (const [a, codes] of Object.entries(MAP)) if (codes.includes(code)) return a;
    return null;
  }
  /** called once per frame */
  poll(dt) {
    this.time += dt;
    const d = this.down;
    const intent = {
      mx: (d.has('right') ? 1 : 0) - (d.has('left') ? 1 : 0),
      mz: (d.has('down') ? 1 : 0) - (d.has('up') ? 1 : 0),
      punch: this.pressed.has('punch'), kick: this.pressed.has('kick'), jump: this.pressed.has('jump'),
      run: this.runTap,
    };
    this.pressed.clear();
    this.runTap = 0;
    return intent;
  }
}
