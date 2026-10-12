// LF2 VS mode: everybody fights until only one team (or one independent fighter) is left standing.
import { Fighter } from './Fighter.js';
import { CpuAI } from './AI.js';
import { Hud } from './Hud.js';
import { Fx } from './Fx.js';
import { byId } from './characters.js';
import { recolor } from '../engine/sprite/SpriteSheet.js';

const SPAWN = [[7, 6.6, 1], [16, 6.2, -1], [17, 7.9, -1], [15.5, 4.8, -1]];

export class Battle {
  /**
   * @param {object} setup { players: [{ charId, team, human }], level }
   * @param {Map} sheets charId -> loaded sheet
   */
  constructor(setup, sheets, engine, demo = false) {
    this.engine = engine;
    this.fx = new Fx(engine.scene, engine.camera);
    this.fighterSheets = new Map();
    const used = new Map();
    this.fighters = setup.players.map((p, n) => {
      const def = byId(p.charId);
      // duplicates of a character wear an alternate costume, as in LF2 team colours
      const count = used.get(def.id) || 0;
      used.set(def.id, count + 1);
      let sheet = sheets.get(def.id);
      if (count > 0) sheet = costume(sheet, def, count);
      const [x, z, face] = SPAWN[n];
      const f = new Fighter(sheet, def, { x, z, face, team: p.team, id: n, human: p.human && !demo });
      this.fighterSheets.set(f, sheet);
      engine.scene.add(f.sprite);
      return f;
    });
    this.ais = new Map(this.fighters.filter((f) => !f.human).map((f) => [f, new CpuAI(f, f.id === 0 ? 'hard' : setup.level)]));
    this.hud = new Hud(this.fighters, this.fighterSheets);
    this.over = 0; this.winners = null;
    this.hud.message('FIGHT !');
    this.intro = 1.0;
  }

  /** returns true when the battle is finished (results can be shown) */
  update(dt, input) {
    const F = this.fighters;
    this.fx.update(dt);
    if (this.intro > 0) { this.intro -= dt; if (this.intro <= 0) this.hud.message(''); }
    if (this.fx.freeze <= 0) {
      for (const f of F) {
        const intent = this.winners || this.intro > 0 ? null : f.human ? input : this.ais.get(f).poll(dt, F);
        f.update(dt, intent, F, this.fx);
      }
    }
    for (const f of F) f.render(this.engine.camera);
    this.hud.update();
    this.followCamera(dt);

    if (!this.winners) {
      const alive = F.filter((f) => f.alive);
      const sides = new Set(alive.map((f) => (f.team ? `t${f.team}` : `s${f.id}`)));
      if (sides.size <= 1) {
        this.winners = alive;
        const human = F.find((f) => f.human);
        this.hud.message(human ? (alive.includes(human) ? 'VICTOIRE !' : 'DÉFAITE...') : 'FIN DU COMBAT');
      }
    } else if ((this.over += dt) > 2.6) return true;
    return false;
  }

  followCamera(dt) {
    const e = this.engine;
    const alive = this.fighters.filter((f) => f.alive);
    const xs = (alive.length ? alive : this.fighters).map((f) => f.x);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    const spread = Math.max(...xs) - Math.min(...xs);
    const k = Math.min(1, dt * 3);
    e.target.x += (Math.min(16, Math.max(8, mid)) - e.target.x) * k;
    e.distance += (Math.min(27, Math.max(19, 15 + spread * 0.9)) - e.distance) * k;
    e.updateCamera();
  }

  dispose() {
    for (const f of this.fighters) this.engine.scene.remove(f.sprite);
    this.fx.clear();
    this.fx.layer.remove();
    this.hud.dispose();
  }
}

const costumes = new Map();
function costume(sheet, def, n) {
  const key = `${def.id}:${n}`;
  if (!costumes.has(key)) {
    // 2nd copy: the character's alternate costume; further copies: other colours of the same cloth
    const base = def.altCostume;
    const fn = n === 1 ? base : (px) => {
      const out = base(px);
      if (out.every((v, j) => v === px[j])) return px; // not cloth
      const [a, b, c] = out;
      return n === 2 ? [b, a, c] : [c, b, a];
    };
    costumes.set(key, recolor(sheet, fn));
  }
  return costumes.get(key);
}
