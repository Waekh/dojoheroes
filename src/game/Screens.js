// Menu screens in LF2's flow: title -> character select -> (battle) -> results.
// All screens are driven by the same intent object (tap set) as the fighters:
// left/right change the value, ATTACK confirms, JUMP goes back.
import { CHARACTERS } from './characters.js';
import { portrait } from './portrait.js';

const CSS = `
.scr { position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; gap: 18px;
  padding: calc(24px + env(safe-area-inset-top, 0px)) 16px calc(150px + env(safe-area-inset-bottom, 0px));
  overflow-y: auto; background: radial-gradient(ellipse at 50% 40%, rgba(20, 12, 28, 0.55), rgba(8, 5, 12, 0.88));
  font-family: 'Press Start 2P', monospace; color: #fff6e0; text-shadow: 2px 2px 0 #140c1a; text-align: center; }
.scr h1 { margin: 0; font-size: clamp(14px, 2.4vw, 22px); letter-spacing: 2px; color: #ffe070; text-shadow: 3px 3px 0 #a03020, 5px 5px 0 #140c1a; }
.scr .logo { margin-top: 8vh; font-size: clamp(34px, 8vw, 84px); line-height: 1.1; color: #ffe070;
  text-shadow: 4px 4px 0 #c0402a, 8px 8px 0 #3a1830, 12px 12px 0 #140c1a; }
.scr .tag { font: 26px 'VT323', monospace; color: #e8d8b0; }
.scr .blink { animation: blink 1s steps(2) infinite; font-size: 12px; }
@keyframes blink { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .scr .blink { animation: none; } }
.scr .keys { font: 22px 'VT323', monospace; line-height: 24px; color: #d8cfe8; max-width: 640px; }
.scr .keys b { color: #ffe070; font-weight: normal; }
.slots { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; width: 100%; max-width: 1100px; }
.slot { flex: 1 1 200px; max-width: 250px; min-height: 270px; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 12px 8px; background: rgba(20, 12, 26, 0.8); border: 3px solid #5a4a6a; box-shadow: 0 0 0 3px #140c1a; }
.slot.on { border-color: #ffe070; } .slot.off { opacity: 0.4; }
.slot .who { font-size: 11px; color: #ffe070; }
.slot canvas { width: 128px; height: 128px; image-rendering: pixelated; background: #2a1c34; border: 3px solid #140c1a; }
.slot .nm { font: 26px 'VT323', monospace; line-height: 22px; }
.slot .st { font: 20px 'VT323', monospace; color: #b8a8c8; }
.slot .field { font-size: 9px; line-height: 16px; color: #e8d8b0; }
.slot .field.cur { color: #fff; background: #a03020; padding: 2px 6px; }
.prompt { font-size: 11px; line-height: 20px; color: #fff; max-width: 760px; }
.prompt .val { color: #ffe070; }
.moves { font: 21px 'VT323', monospace; color: #d8cfe8; line-height: 22px; }
table.res { border-collapse: collapse; font: 24px 'VT323', monospace; background: rgba(20, 12, 26, 0.85); border: 3px solid #e8d8b0; }
table.res th { font: 9px 'Press Start 2P', monospace; color: #ffe070; padding: 10px 12px; border-bottom: 3px solid #5a4a6a; }
table.res td { padding: 6px 12px; font-variant-numeric: tabular-nums; }
table.res td.p { display: flex; align-items: center; gap: 8px; text-align: left; }
table.res canvas { width: 40px; height: 40px; image-rendering: pixelated; background: #2a1c34; }
table.res .win { color: #8cf07a; } table.res .lose { color: #f07a6a; }
.tablewrap { max-width: 100%; overflow-x: auto; }
`;

function ensureCss() {
  if (document.getElementById('scr-css')) return;
  const st = document.createElement('style'); st.id = 'scr-css'; st.textContent = CSS; document.head.appendChild(st);
}

class Screen {
  constructor(cls) { ensureCss(); this.el = document.createElement('div'); this.el.className = `scr ${cls}`; document.body.appendChild(this.el); }
  dispose() { this.el.remove(); }
}

export class TitleScreen extends Screen {
  constructor() {
    super('title');
    this.el.innerHTML = `<div class="logo">DOJO<br>HEROES</div>
      <div class="tag">Arts martiaux · combat en HD-2D</div>
      <div class="blink">ATTAQUE (J) : MODE VS</div>
      <div class="keys"><b>Flèches / ZQSD</b> se déplacer · <b>J</b> attaque · <b>K</b> saut · <b>L</b> défense<br>
      <b>2× gauche/droite</b> courir · <b>course + J</b> attaque en course · <b>saut + J</b> attaque sautée<br>
      <b>L puis avant puis J</b> / <b>L puis haut puis K</b> : coups spéciaux (coûtent des PM)</div>`;
  }
  update(i) { return i.events.includes('attack') ? 'select' : null; }
}

const TEAMS = ['Indépendant', 'Équipe 1', 'Équipe 2', 'Équipe 3', 'Équipe 4'];
const LEVELS = [['easy', 'Facile'], ['normal', 'Normal'], ['hard', 'Difficile']];
const RANDOM = { id: 'random', fullName: 'Aléatoire', style: '?', country: '' };

/** LF2-like character select: player 1, then number of CPUs, each CPU, then difficulty. */
export class SelectScreen extends Screen {
  constructor(sheets, prev) {
    super('select');
    this.sheets = sheets;
    // keep the previous selection when coming back (like LF2)
    this.cfg = prev ? structuredClone(prev) : { players: [{ char: 0, team: 0, human: true }], cpuCount: 1, level: 1 };
    while (this.cfg.players.length < 4) this.cfg.players.push({ char: CHARACTERS.length, team: 0, human: false }); // random
    this.steps = [];
    this.buildSteps();
    this.step = 0;
    this.el.innerHTML = `<h1>SÉLECTION DES COMBATTANTS</h1><div class="slots"></div><div class="prompt"></div><div class="moves"></div>`;
    this.render();
  }
  buildSteps() {
    const s = [['char', 0], ['team', 0], ['cpu']];
    for (let k = 1; k <= this.cfg.cpuCount; k++) s.push(['char', k], ['team', k]);
    s.push(['level'], ['go']);
    this.steps = s;
  }
  choices(k) { return k === 0 ? CHARACTERS : [...CHARACTERS, RANDOM]; }
  update(i) {
    for (const a of i.events) {
      const r = this.handle(a);
      if (r) return r;
    }
    return null;
  }
  handle(a) {
    const [kind, k] = this.steps[this.step];
    const dx = a === 'right' || a === 'down' ? 1 : a === 'left' || a === 'up' ? -1 : 0;
    const P = this.cfg.players;
    if (dx) {
      const wrap = (v, n) => (v + dx + n) % n;
      if (kind === 'char') P[k].char = wrap(P[k].char, this.choices(k).length);
      if (kind === 'team') P[k].team = wrap(P[k].team, TEAMS.length);
      if (kind === 'cpu') { this.cfg.cpuCount = Math.min(3, Math.max(1, this.cfg.cpuCount + dx)); this.buildSteps(); }
      if (kind === 'level') this.cfg.level = wrap(this.cfg.level, LEVELS.length);
      this.render();
    }
    if (a === 'attack') {
      if (kind === 'go') return 'fight';
      this.step++; this.render();
    }
    if (a === 'jump') {
      if (this.step === 0) return 'title';
      this.step--; this.render();
    }
    return null;
  }
  /** the final roster: resolves "random" and drops unused CPU slots */
  result() {
    const players = this.cfg.players.slice(0, this.cfg.cpuCount + 1).map((p) => ({
      ...p, charId: (p.char >= CHARACTERS.length ? CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)] : CHARACTERS[p.char]).id,
    }));
    return { players, level: LEVELS[this.cfg.level][0], cfg: this.cfg };
  }
  render() {
    const [kind, k] = this.steps[this.step];
    const P = this.cfg.players;
    const slots = this.el.querySelector('.slots');
    slots.innerHTML = '';
    P.forEach((p, n) => {
      const used = n <= this.cfg.cpuCount;
      const c = this.choices(n)[p.char];
      const el = document.createElement('div');
      el.className = `slot${k === n && (kind === 'char' || kind === 'team') ? ' on' : ''}${used ? '' : ' off'}`;
      el.innerHTML = `<div class="who">${n === 0 ? 'JOUEUR 1' : `ORDINATEUR ${n}`}</div>`;
      if (used && c.id !== 'random') el.appendChild(portrait(this.sheets.get(c.id), 128));
      else { const ph = document.createElement('canvas'); ph.width = ph.height = 1; el.appendChild(ph); }
      el.insertAdjacentHTML('beforeend', used
        ? `<div class="nm">${c.fullName}</div><div class="st">${c.style}${c.country ? ` · ${c.country}` : ''}</div>
           <div class="field${k === n && kind === 'char' ? ' cur' : ''}">◀ PERSO ▶</div>
           <div class="field${k === n && kind === 'team' ? ' cur' : ''}">${TEAMS[p.team].toUpperCase()}</div>`
        : '<div class="nm">—</div>');
      slots.appendChild(el);
    });
    const lv = LEVELS[this.cfg.level][1];
    const prompts = {
      char: 'GAUCHE/DROITE : choisir le combattant · ATTAQUE : valider · SAUT : retour',
      team: 'GAUCHE/DROITE : choisir l\'équipe · ATTAQUE : valider · SAUT : retour',
      cpu: `Nombre d'ordinateurs : <span class="val">◀ ${this.cfg.cpuCount} ▶</span> · ATTAQUE : valider`,
      level: `Difficulté : <span class="val">◀ ${lv.toUpperCase()} ▶</span> · ATTAQUE : valider`,
      go: `Mode VS · ${this.cfg.cpuCount + 1} combattants · ${lv}<br><span class="val">ATTAQUE : COMBATTRE !</span> · SAUT : retour`,
    };
    this.el.querySelector('.prompt').innerHTML = prompts[kind];
    // special moves of the character being chosen
    const shown = kind === 'char' ? this.choices(k)[P[k].char] : CHARACTERS[P[0].char];
    this.el.querySelector('.moves').innerHTML = shown.specials
      ? Object.entries(shown.specials).map(([cmd, s]) => `${cmd.replace('D', 'DEF ').replace('>', '+ AVANT ').replace('^', '+ HAUT ').replace(/A$/, '+ ATT').replace(/J$/, '+ SAUT')} : ${s.name}`).join('<br>')
      : '';
  }
}

/** LF2's result table: kills, damage dealt, HP lost, MP used, win/lose. */
export class ResultScreen extends Screen {
  constructor(fighters, sheets, winners) {
    super('results');
    const rows = fighters.map((f) => {
      const win = winners.includes(f);
      return `<tr><td class="p" data-i="${fighters.indexOf(f)}"><span>${f.human ? 'J1' : 'CPU'} · ${f.def.fullName}${f.team ? ` (É${f.team})` : ''}</span></td>
        <td>${f.stats.kills}</td><td>${Math.round(f.stats.attack)}</td><td>${Math.round(f.stats.hpLost)}</td><td>${Math.round(f.stats.mpUsage)}</td>
        <td class="${win ? 'win' : 'lose'}">${win ? 'GAGNÉ' : 'PERDU'}</td></tr>`;
    }).join('');
    this.el.innerHTML = `<h1>RÉSULTATS</h1><div class="tablewrap"><table class="res">
      <tr><th>COMBATTANT</th><th>K.O.</th><th>ATTAQUE</th><th>PV PERDUS</th><th>PM UTILISÉS</th><th>STATUT</th></tr>${rows}</table></div>
      <div class="prompt">ATTAQUE : rejouer · SAUT : sélection des combattants</div>`;
    this.el.querySelectorAll('td.p').forEach((td) => {
      const f = fighters[Number(td.dataset.i)];
      td.prepend(portrait(sheets.get(f), 40));
    });
  }
  update(i) {
    if (i.events.includes('attack')) return 'again';
    if (i.events.includes('jump')) return 'select';
    return null;
  }
}
