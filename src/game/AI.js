// CPU player: picks the nearest standing enemy, lines up in depth, attacks in range with combos,
// defends against incoming attacks, uses specials when it has the MP, jumps in, runs when far.
// Produces the same intent object as the keyboard.
const LEVELS = {
  easy: { react: [0.28, 0.45], aggression: 0.35, defend: 0.12, special: 0.04 },
  normal: { react: [0.16, 0.3], aggression: 0.6, defend: 0.3, special: 0.1 },
  hard: { react: [0.08, 0.16], aggression: 0.85, defend: 0.55, special: 0.2 },
};
const ATTACKING = ['attack', 'dashAttack', 'jumpAttack', 'rush', 'flykick'];

export class CpuAI {
  constructor(me, level = 'normal') {
    this.me = me;
    this.cfg = LEVELS[level] || LEVELS.normal;
    this.think = 0;
    this.plan = { mx: 0, mz: 0 };
    this.retreat = 0;
  }

  poll(dt, fighters) {
    const me = this.me, c = this.cfg;
    const intent = { mx: 0, mz: 0, attack: false, jump: false, defend: false, run: 0, cmd: null };
    if (!me.alive) return intent;
    const foes = fighters.filter((f) => me.isEnemy(f) && f.alive);
    if (!foes.length) return intent;
    // prefer standing targets; lying ones cannot be hit anyway
    const dist = (f) => Math.abs(f.x - me.x) + Math.abs(f.z - me.z) * 2 + (f.lying ? 6 : 0);
    const foe = foes.reduce((a, b) => (dist(b) < dist(a) ? b : a));
    const dx = foe.x - me.x, dz = foe.z - me.z, adx = Math.abs(dx);
    const toward = Math.sign(dx) || me.face;

    // in the air: strike when close
    if (me.state === 'air' && adx < 2.4 && Math.abs(dz) < 0.7) intent.attack = true;
    // keep a queued combo going
    if (me.state === 'attack' && adx < 2.2 && Math.random() < c.aggression) intent.attack = true;

    this.think -= dt; this.retreat -= dt;
    if (this.think > 0) return { ...intent, ...this.plan };
    this.think = c.react[0] + Math.random() * (c.react[1] - c.react[0]);
    const plan = { mx: 0, mz: 0 };

    // defend against an attack coming from the front
    const threat = foes.find((f) => ATTACKING.includes(f.state) && Math.abs(f.x - me.x) < 2.6 && Math.abs(f.z - me.z) < 0.7 && Math.sign(me.x - f.x) === f.face);
    if (threat && me.canAct && Math.random() < c.defend) {
      me.face = Math.sign(threat.x - me.x) || me.face;
      intent.defend = true;
      this.plan = plan;
      return { ...intent, ...plan };
    }

    if (this.retreat > 0) {
      plan.mx = -toward; plan.mz = me.z < 6.5 ? 1 : -1;
    } else if (foe.lying) {
      // wait near the fallen foe, like LF2's AI
      plan.mx = adx > 2.5 ? toward : 0;
      plan.mz = Math.abs(dz) > 0.3 ? Math.sign(dz) : 0;
    } else if (adx > 1.7 || Math.abs(dz) > 0.4) {
      plan.mx = adx > 1.4 ? toward : 0;
      plan.mz = Math.abs(dz) > 0.25 ? Math.sign(dz) : 0;
      if (adx > 7 && Math.random() < 0.35) intent.run = toward;
      if (me.state === 'run' && adx < 3 && Math.abs(dz) < 0.5) intent.attack = true; // dash attack
      if (adx > 2.4 && adx < 4.5 && Math.abs(dz) < 0.45 && Math.random() < 0.12 * c.aggression) { plan.mx = toward; intent.jump = true; }
      // long-range special (flying kick) when lined up
      if (adx > 2 && adx < 5 && Math.abs(dz) < 0.4 && me.mp >= 120 && Math.random() < c.special) intent.cmd = `DUJ`;
    } else if (foe.hittable) {
      if (Math.sign(dx) !== me.face) plan.mx = toward;
      else if (me.mp >= 150 && Math.random() < c.special) intent.cmd = `D${toward > 0 ? 'R' : 'L'}A`;
      else if (Math.random() < c.aggression) intent.attack = true;
      if (Math.random() < 0.07) this.retreat = 0.45;
    }
    if (intent.cmd === 'DUJ') me.face = toward;
    this.plan = plan;
    return { ...intent, ...plan };
  }
}
