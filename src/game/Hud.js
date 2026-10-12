// Battle HUD, LF2 layout: one panel per fighter along the top with portrait, HP (bright red,
// with the recoverable part in dark red) and MP (blue). Plus the round banner and controls help.
import { portrait } from './portrait.js';

const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; z-index: 5; font-family: 'Press Start 2P', monospace; color: #fff6e0;
  text-shadow: 2px 2px 0 #140c1a; }
#hud .panels { position: absolute; top: calc(10px + env(safe-area-inset-top, 0px)); left: 12px; right: 12px; display: flex; gap: 10px; flex-wrap: wrap; }
#hud .pl { flex: 1 1 210px; max-width: 330px; display: flex; gap: 8px; padding: 6px; background: rgba(20, 12, 26, 0.72);
  border: 3px solid #e8d8b0; box-shadow: 0 0 0 3px #140c1a; }
#hud .pl canvas { width: 52px; height: 52px; image-rendering: pixelated; background: #2a1c34; border: 2px solid #140c1a; }
#hud .pl .info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
#hud .pl .nm { font: 20px 'VT323', monospace; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#hud .pl .nm b { font-weight: normal; color: var(--c); }
#hud .bar { position: relative; height: 9px; background: #0c0710; border: 2px solid #140c1a; }
#hud .bar div { position: absolute; left: 0; top: 0; bottom: 0; }
#hud .hp .dark { background: #6e1620; } #hud .hp .cur { background: linear-gradient(#ff8a7a 0 30%, #e8302c 30% 80%, #a01818 80%); }
#hud .mp .cur { background: linear-gradient(#9fd2ff 0 30%, #3a7cf0 30% 80%, #1f46a8 80%); }
#hud .pl.out { opacity: 0.45; }
#hud .banner { position: absolute; top: 36%; width: 100%; text-align: center; font-size: clamp(28px, 6vw, 60px); color: #ffe070;
  text-shadow: 4px 4px 0 #a03020, 8px 8px 0 #140c1a; }
#hud .help { position: absolute; bottom: 12px; width: 100%; text-align: center; font-size: 9px; line-height: 16px; opacity: 0.85; }
`;

export class Hud {
  constructor(fighters, sheets) {
    if (!document.getElementById('hud-css')) {
      const st = document.createElement('style'); st.id = 'hud-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    const el = document.createElement('div'); el.id = 'hud';
    el.innerHTML = `<div class="panels"></div><div class="banner" hidden></div>
      <div class="help">J : ATTAQUE &nbsp; K : SAUT &nbsp; L : DEFENSE &nbsp; 2x GAUCHE/DROITE : COURIR &nbsp; L puis AVANT puis J / L puis HAUT puis K : COUPS SPECIAUX</div>`;
    document.body.appendChild(el);
    this.el = el;
    const panels = el.querySelector('.panels');
    this.rows = fighters.map((f) => {
      const p = document.createElement('div'); p.className = 'pl';
      p.style.setProperty('--c', f.def.color);
      p.appendChild(portrait(sheets.get(f), 52));
      const info = document.createElement('div'); info.className = 'info';
      const who = f.human ? 'J1' : 'CPU';
      const team = f.team ? ` · É${f.team}` : '';
      info.innerHTML = `<div class="nm"><b>${who}</b> ${f.def.fullName}${team}</div>
        <div class="bar hp"><div class="dark"></div><div class="cur"></div></div><div class="bar mp"><div class="cur"></div></div>`;
      p.appendChild(info);
      panels.appendChild(p);
      return { f, p, dark: info.querySelector('.hp .dark'), hp: info.querySelector('.hp .cur'), mp: info.querySelector('.mp .cur') };
    });
    this.banner = el.querySelector('.banner');
  }
  update() {
    for (const r of this.rows) {
      const f = r.f;
      r.dark.style.width = `${(f.hpDark / f.maxHp) * 100}%`;
      r.hp.style.width = `${(f.shownHp / f.maxHp) * 100}%`;
      r.mp.style.width = `${(f.mp / f.maxMp) * 100}%`;
      r.p.classList.toggle('out', !f.alive);
    }
  }
  message(text) { this.banner.textContent = text; this.banner.hidden = !text; }
  dispose() { this.el.remove(); }
}
