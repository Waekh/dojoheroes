// Retro pixel HUD (DOM overlay): two HP bars with a damage trail, round message, controls help.
const CSS = `
#hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Press Start 2P', monospace; color: #fff8e8;
  text-shadow: 2px 2px 0 #1a1020; image-rendering: pixelated; }
#hud .bar { position: absolute; top: 22px; width: min(38vw, 560px); }
#hud .bar.p1 { left: 24px; } #hud .bar.p2 { right: 24px; text-align: right; }
#hud .name { font-size: 13px; margin-bottom: 8px; letter-spacing: 1px; }
#hud .frame { height: 18px; background: #1a1020; padding: 3px; box-shadow: 0 0 0 3px #e8d8b0, 0 0 0 6px #1a1020; }
#hud .track { position: relative; height: 100%; background: #3a1a2a; overflow: hidden; }
#hud .trail, #hud .hp { position: absolute; top: 0; bottom: 0; }
#hud .p1 .trail, #hud .p1 .hp { left: 0; } #hud .p2 .trail, #hud .p2 .hp { right: 0; }
#hud .trail { background: #ffd060; }
#hud .hp { background: linear-gradient(#9cf58a 0 35%, #4fc24a 35% 75%, #2e8a3a 75%); }
#hud .hp.low { background: linear-gradient(#ffb070 0 35%, #f05a3a 35% 75%, #a8302a 75%); }
#hud .msg { position: absolute; top: 38%; width: 100%; text-align: center; font-size: 56px; color: #ffe070;
  text-shadow: 4px 4px 0 #a03020, 8px 8px 0 #1a1020; display: none; }
#hud .sub { position: absolute; top: calc(38% + 90px); width: 100%; text-align: center; font-size: 14px; display: none; }
#hud .help { position: absolute; bottom: 16px; width: 100%; text-align: center; font-size: 10px; line-height: 18px; opacity: 0.9; }
`;

export class Hud {
  constructor(names) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div'); el.id = 'hud';
    el.innerHTML = ['p1', 'p2'].map((p, i) => `<div class="bar ${p}"><div class="name">${names[i]}</div>
      <div class="frame"><div class="track"><div class="trail"></div><div class="hp"></div></div></div></div>`).join('')
      + `<div class="msg"></div><div class="sub"></div>
      <div class="help">FLECHES / ZQSD : bouger &nbsp; 2x GAUCHE/DROITE : courir &nbsp; J : poing &nbsp; L : pied &nbsp; K / ESPACE : sauter (+J/L en l'air : coup de pied saute) &nbsp; R : rejouer</div>`;
    document.body.appendChild(el);
    this.el = el;
    this.bars = ['p1', 'p2'].map((p) => ({ hp: el.querySelector(`.${p} .hp`), trail: el.querySelector(`.${p} .trail`) }));
    this.msg = el.querySelector('.msg'); this.sub = el.querySelector('.sub');
  }
  update(dt, fighters) {
    fighters.forEach((f, i) => {
      f.shownHp += (f.hp - f.shownHp) * Math.min(1, dt * 2.5); // trail catches up
      const b = this.bars[i];
      b.hp.style.width = `${(f.hp / f.maxHp) * 100}%`;
      b.trail.style.width = `${(Math.max(f.hp, f.shownHp) / f.maxHp) * 100}%`;
      b.hp.classList.toggle('low', f.hp < f.maxHp * 0.3);
    });
  }
  message(text, sub = '') {
    this.msg.textContent = text; this.msg.style.display = text ? 'block' : 'none';
    this.sub.textContent = sub; this.sub.style.display = sub ? 'block' : 'none';
  }
}
