// Simple CPU opponent: closes the distance, lines up in depth, attacks in range, sometimes
// jumps in with a flying kick or backs off. Produces the same intent object as the keyboard.
export class CpuAI {
  constructor(me, { aggression = 0.6 } = {}) {
    this.me = me;
    this.aggression = aggression;
    this.think = 0;
    this.plan = { mx: 0, mz: 0 };
    this.retreat = 0;
  }
  poll(dt, foe) {
    const me = this.me;
    const intent = { mx: 0, mz: 0, punch: false, kick: false, jump: false, run: 0 };
    if (!foe || foe.hp <= 0) return intent;
    this.think -= dt;
    this.retreat -= dt;
    const dx = foe.x - me.x, dz = foe.z - me.z;
    const adx = Math.abs(dx);
    if (me.state === 'air' && adx < 2.6 && Math.random() < 0.15) intent.kick = true;
    if (this.think > 0) return { ...intent, ...this.plan };
    this.think = 0.12 + Math.random() * 0.18; // reaction time
    const plan = { mx: 0, mz: 0 };
    if (this.retreat > 0) {
      plan.mx = -Math.sign(dx);
      plan.mz = Math.random() < 0.5 ? 1 : -1;
    } else if (adx > 1.6 || Math.abs(dz) > 0.35) {
      // approach: walk toward an attack position in front of the foe
      plan.mx = adx > 1.3 ? Math.sign(dx) : 0;
      plan.mz = Math.abs(dz) > 0.25 ? Math.sign(dz) : 0;
      if (adx > 7 && Math.random() < 0.3) intent.run = Math.sign(dx);
      if (adx > 2.5 && adx < 4.5 && Math.abs(dz) < 0.4 && Math.random() < 0.12 * this.aggression) {
        plan.mx = Math.sign(dx); intent.jump = true;
      }
    } else if (foe.vulnerable) {
      // in range: face the foe and strike
      if (Math.sign(dx) !== me.face) plan.mx = Math.sign(dx);
      else if (Math.random() < this.aggression) {
        if (Math.random() < 0.62) intent.punch = true; else intent.kick = true;
      }
      if (Math.random() < 0.08) this.retreat = 0.5;
    }
    this.plan = plan;
    return { ...intent, ...plan };
  }
}
