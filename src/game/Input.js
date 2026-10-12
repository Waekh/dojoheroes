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
      this.press(a);
    });
    window.addEventListener('keyup', (e) => { const a = this.action(e.code); if (a) this.release(a); });
    window.addEventListener('blur', () => this.down.clear());
    if (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window) this.touchPad();
  }
  press(a) {
    this.down.add(a); this.pressed.add(a);
    if (a === 'left' || a === 'right') {
      if (this.time - this.lastTap[a] < DOUBLE_TAP) this.runTap = a === 'right' ? 1 : -1;
      this.lastTap[a] = this.time;
    }
  }
  release(a) { this.down.delete(a); }
  /** on-screen controls for phones and tablets */
  touchPad() {
    const st = document.createElement('style');
    st.textContent = `
      .pad { position: fixed; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); display: grid; gap: 8px;
        touch-action: none; user-select: none; -webkit-user-select: none; z-index: 5; }
      .pad.dir { left: 18px; grid-template: repeat(3, 54px) / repeat(3, 54px); }
      .pad.act { right: 18px; grid-template: repeat(2, 62px) / repeat(2, 62px); }
      .pad button { font: 10px 'Press Start 2P', monospace; color: #fff8e8; background: rgba(26, 16, 32, 0.55);
        border: 3px solid rgba(232, 216, 176, 0.8); border-radius: 10px; padding: 0; touch-action: none; }
      .pad button.on { background: rgba(255, 208, 96, 0.55); }
      #hud .help { display: none; }`;
    document.head.appendChild(st);
    const make = (cls, cells) => {
      const el = document.createElement('div'); el.className = `pad ${cls}`;
      for (const [label, action, area] of cells) {
        const b = document.createElement('button');
        b.textContent = label; b.style.gridArea = area; b.setAttribute('aria-label', action);
        const on = (e) => { e.preventDefault(); b.classList.add('on'); this.press(action); };
        const off = (e) => { e.preventDefault(); b.classList.remove('on'); this.release(action); };
        b.addEventListener('pointerdown', on);
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
        el.appendChild(b);
      }
      document.body.appendChild(el);
    };
    make('dir', [['▲', 'up', '1 / 2'], ['◀', 'left', '2 / 1'], ['▶', 'right', '2 / 3'], ['▼', 'down', '3 / 2']]);
    make('act', [['SAUT', 'jump', '1 / 2'], ['POING', 'punch', '2 / 1'], ['PIED', 'kick', '2 / 2']]);
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
