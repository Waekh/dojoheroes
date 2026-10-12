// Keyboard (+ touch) controller with LF2's three buttons: Attack, Jump, Defend.
// Produces the same "intent" object the CPU AI produces. Physical key codes, so ZQSD on AZERTY
// works like WASD.
//   run      : tap left/right twice
//   specials : Defend, then a direction, then Attack or Jump (e.g. D → A), like LF2
const MAP = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  attack: ['KeyJ', 'Enter'], jump: ['KeyK', 'Space'], defend: ['KeyL', 'ShiftLeft', 'ShiftRight'],
};
const DOUBLE_TAP = 0.25; // s
const CMD_WINDOW = 0.6; // s, max time for a D + dir + A/J command
const DIR = { left: 'L', right: 'R', up: 'U', down: 'D' };

export class KeyboardInput {
  constructor() {
    this.down = new Set();
    this.taps = new Set(); // actions pressed since the last poll
    this.events = []; // same, in order and with repeats (menus)
    this.lastTap = { left: -1, right: -1 };
    this.history = []; // [{ a, t }] recent presses, for commands
    this.time = 0;
    this.runTap = 0;
    this.cmd = null;
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
    this.down.add(a); this.taps.add(a); this.events.push(a);
    if (a === 'left' || a === 'right') {
      if (this.time - this.lastTap[a] < DOUBLE_TAP) this.runTap = a === 'right' ? 1 : -1;
      this.lastTap[a] = this.time;
    }
    // D + direction + A/J
    if (a === 'attack' || a === 'jump') {
      const recent = this.history.filter((h) => this.time - h.t < CMD_WINDOW);
      const d = recent.map((h) => h.a).lastIndexOf('defend');
      const dir = d >= 0 ? recent.slice(d + 1).reverse().find((h) => DIR[h.a]) : null;
      if (dir) { this.cmd = `D${DIR[dir.a]}${a === 'attack' ? 'A' : 'J'}`; this.history = []; }
    }
    this.history.push({ a, t: this.time });
    if (this.history.length > 12) this.history.shift();
  }
  release(a) { this.down.delete(a); }

  action(code) {
    for (const [a, codes] of Object.entries(MAP)) if (codes.includes(code)) return a;
    return null;
  }

  /** called once per frame */
  poll(dt) {
    this.time += dt;
    const d = this.down, t = this.taps;
    const intent = {
      mx: (d.has('right') ? 1 : 0) - (d.has('left') ? 1 : 0),
      mz: (d.has('down') ? 1 : 0) - (d.has('up') ? 1 : 0),
      attack: t.has('attack'), jump: t.has('jump'), defend: t.has('defend'),
      run: this.runTap, cmd: this.cmd,
      events: this.events, // ordered presses, for menus
    };
    this.taps.clear();
    this.events = [];
    this.runTap = 0;
    this.cmd = null;
    return intent;
  }

  /** on-screen controls for phones and tablets */
  touchPad() {
    const st = document.createElement('style');
    st.textContent = `
      .pad { position: fixed; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); display: grid; gap: 8px;
        touch-action: none; user-select: none; -webkit-user-select: none; z-index: 20; }
      .pad.dir { left: 16px; grid-template: repeat(3, 52px) / repeat(3, 52px); }
      .pad.act { right: 16px; grid-template: repeat(2, 60px) / repeat(2, 60px); }
      .pad button { font: 9px 'Press Start 2P', monospace; color: #fff8e8; background: rgba(26, 16, 32, 0.55);
        border: 3px solid rgba(232, 216, 176, 0.8); border-radius: 10px; padding: 0; touch-action: none; }
      .pad button.on { background: rgba(255, 208, 96, 0.55); }
      .help { display: none !important; }`;
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
    make('act', [['SAUT', 'jump', '1 / 1'], ['DEF', 'defend', '1 / 2'], ['ATT', 'attack', '2 / 1 / 3 / 3']]);
  }
}
