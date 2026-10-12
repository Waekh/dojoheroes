// LF2-style fighter: moves on the ground plane (x along the lane, z in depth), jumps (y),
// punches / kicks with active frames, gets hurt, knocked down and gets back up.
import { Sprite3D } from '../engine/sprite/Sprite3D.js';

// animation rows of the sheet (see tools/cut_sheet.py) and timings
const A = {
  idle: { row: 0, fps: 7, loop: true },
  walk: { row: 1, fps: 11, loop: true },
  run: { row: 2, fps: 14, loop: true },
  punch: { row: 3, fps: 20, active: [3, 4], dmg: 7, fall: 22, reach: [0.1, 1.75], push: 2.2 },
  kick: { row: 4, fps: 16, active: [4], dmg: 11, fall: 65, reach: [0.2, 2.0], push: 4.5 },
  jump: { row: 5 },
  jumpkick: { row: 6, dmg: 13, fall: 70, reach: [0.1, 2.0], push: 5 },
};

export const LANE = { x0: 1.2, x1: 22.8, z0: 4.4, z1: 8.7 };
const G = 34; // gravity (units/s²)
const WALK = 3.4, WALK_Z = 2.3, RUN = 7.5, JUMP_V = 11.5;
const NO_INPUT = { mx: 0, mz: 0, punch: false, kick: false, jump: false, run: 0 };
const DEPTH_HIT = 0.55; // how close in z an attack must be to land (LF2 lanes)

export class Fighter {
  constructor(sheet, { name, x, z, face = 1, ppu = 46 }) {
    const { meta, cols, rows, pixels } = sheet;
    this.name = name;
    this.meta = meta;
    this.sprite = new Sprite3D(pixels, {
      grid: [cols, rows], ppu,
      pivotX: meta.anchor[0] / meta.cell[0],
      pivotY: (meta.cell[1] - meta.anchor[1]) / meta.cell[1],
      blob: 0.75,
    });
    this.x = x; this.z = z; this.y = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.face = face;
    this.maxHp = 100; this.hp = 100; this.shownHp = 100;
    this.fallPts = 0;
    this.state = 'idle'; this.t = 0; this.frame = 0;
    this.hits = new Set(); // targets already hit by the current attack
    this.flash = 0;
    this.tilt = 0; // knock-down rotation
    this.setState('idle');
  }

  get grounded() { return this.y <= 0 && this.vy <= 0; }
  get canAct() { return ['idle', 'walk', 'run'].includes(this.state); }
  get vulnerable() { return !['fall', 'down', 'getup', 'ko'].includes(this.state); }

  setState(s) { this.state = s; this.t = 0; this.hits.clear(); }

  /** frame index for a non-looping anim timed from the state start */
  playOnce(anim) {
    const a = A[anim], n = this.meta.anims[anim].frames;
    const f = Math.floor(this.t * a.fps);
    return { f: Math.min(f, n - 1), done: f >= n };
  }

  update(dt, intent, foes) {
    this.t += dt;
    this.fallPts = Math.max(0, this.fallPts - 25 * dt);
    const i = intent || NO_INPUT;
    let row = 0, col = 0;

    switch (this.state) {
      case 'idle': case 'walk': case 'run': {
        if (i.jump) { this.setState('jumpPrep'); break; }
        if (i.punch) { const wasRun = this.state === 'run'; this.setState('punch'); this.vx = wasRun ? this.face * 3 : 0; break; }
        if (i.kick) { this.setState('kick'); break; }
        if (i.run) { this.face = i.run; this.setState('run'); }
        if (this.state === 'run') {
          // LF2 run: keeps going until the opposite direction is pressed
          if (i.mx === -this.face) { this.setState('idle'); this.vx = 0; break; }
          this.vx = this.face * RUN; this.vz = i.mz * WALK_Z * 0.7;
          row = A.run.row; col = Math.floor(this.t * A.run.fps) % this.meta.anims.run.frames;
          break;
        }
        this.vx = i.mx * WALK; this.vz = i.mz * WALK_Z;
        if (i.mx) this.face = i.mx;
        const moving = i.mx || i.mz;
        if (moving && this.state !== 'walk') this.setState('walk');
        if (!moving && this.state !== 'idle') this.setState('idle');
        const a = moving ? 'walk' : 'idle';
        row = A[a].row; col = Math.floor(this.t * A[a].fps) % this.meta.anims[a].frames;
        break;
      }
      case 'punch': case 'kick': {
        const a = A[this.state];
        const { f, done } = this.playOnce(this.state);
        this.vx *= 0.85; this.vz = 0;
        if (this.state === 'punch' && f >= 3 && f <= 4) this.vx = this.face * 1.2; // small lunge
        row = a.row; col = f;
        if (a.active.includes(f)) this.tryHit(a, foes);
        if (done) this.setState('idle');
        break;
      }
      case 'jumpPrep': // crouch before take-off
        row = A.jump.row; col = 1; this.vz = 0;
        if (this.t > 0.07) {
          const keep = Math.abs(this.vx) > WALK + 0.1 ? 1 : 0.9;
          this.vx = (i.mx || Math.sign(this.vx)) * Math.max(Math.abs(this.vx), Math.abs(i.mx) * WALK) * keep;
          this.vz = i.mz * WALK_Z * 0.6;
          this.vy = JUMP_V; this.y = 0.01;
          this.setState('air');
        }
        break;
      case 'air': case 'jumpkick': {
        if (this.state === 'air' && i.punch || this.state === 'air' && i.kick) this.setState('jumpkick');
        if (this.state === 'jumpkick') {
          row = A.jumpkick.row;
          col = this.t < 0.08 ? 3 : 4;
          if (col === 4) this.tryHit(A.jumpkick, foes);
        } else {
          row = A.jump.row;
          col = this.vy > 5 ? 2 : this.vy > -3 ? 3 : 4;
        }
        if (this.landed()) this.setState(this.state === 'jumpkick' ? 'landKick' : 'land');
        break;
      }
      case 'land': case 'landKick':
        this.vx *= 0.6; this.vz = 0;
        row = this.state === 'land' ? A.jump.row : A.jumpkick.row; col = 5;
        if (this.t > 0.12) this.setState('idle');
        break;
      case 'hurt':
        this.vx *= 0.82; this.vz = 0;
        row = A.jump.row; col = 1; // braced crouch
        if (this.t > 0.32) this.setState('idle');
        break;
      case 'fall': // knocked into the air, spinning back
        row = A.jump.row; col = 4;
        this.tilt = Math.min(1, this.tilt + dt * 4.5);
        if (this.landed()) { this.vx *= 0.3; this.setState(this.hp <= 0 ? 'ko' : 'down'); }
        break;
      case 'down': case 'ko':
        row = A.jump.row; col = 4; this.tilt = 1; this.vx *= 0.8; this.vz = 0;
        if (this.state === 'down' && this.t > 0.75) this.setState('getup');
        break;
      case 'getup':
        row = A.jump.row; col = 1; this.vx = 0;
        this.tilt = Math.max(0, 1 - this.t * 5);
        if (this.t > 0.35) { this.fallPts = 0; this.setState('idle'); }
        break;
    }

    // physics
    if (this.y > 0 || this.vy > 0) { this.vy -= G * dt; this.y = Math.max(0, this.y + this.vy * dt); }
    this.x = Math.min(LANE.x1, Math.max(LANE.x0, this.x + this.vx * dt));
    this.z = Math.min(LANE.z1, Math.max(LANE.z0, this.z + this.vz * dt));
    if (this.grounded && !['fall', 'down', 'ko'].includes(this.state)) this.tilt = 0;
    this.row = row; this.col = col;
    this.flash = Math.max(0, this.flash - dt * 6);
  }

  landed() {
    if (this.vy <= 0 && this.y <= 0) { this.y = 0; this.vy = 0; return true; }
    return false;
  }

  tryHit(a, foes) {
    for (const f of foes) {
      if (this.hits.has(f) || !f.vulnerable) continue;
      const dx = (f.x - this.x) * this.face;
      if (dx < a.reach[0] || dx > a.reach[1]) continue;
      if (Math.abs(f.z - this.z) > DEPTH_HIT) continue;
      if (Math.abs(f.y - this.y) > 1.6) continue;
      this.hits.add(f);
      f.takeHit(this, a);
      this.onHit?.(f, a);
    }
  }

  takeHit(from, a) {
    this.hp = Math.max(0, this.hp - a.dmg);
    this.fallPts += a.fall;
    this.face = -from.face;
    this.flash = 1;
    if (this.hp <= 0 || this.fallPts >= 60 || this.y > 0.3) {
      this.setState('fall');
      this.vx = from.face * a.push; this.vy = 7.5; this.y = Math.max(this.y, 0.01);
      this.fallPts = 0;
    } else {
      this.setState('hurt');
      this.vx = from.face * a.push;
    }
  }

  /** sync the 3D sprite */
  render(camera) {
    const s = this.sprite;
    s.position.set(this.x, 0, this.z);
    s.mesh.position.y = this.y + (this.tilt ? 0.25 * this.tilt : 0);
    s.mesh.rotation.z = this.tilt * (Math.PI / 2) * this.face;
    s.setFrame(this.col, this.row);
    s.setFlip(this.face < 0);
    s.flash = this.flash * 0.85;
    s.blob.scale.set(1.25 * (1 - Math.min(0.4, this.y * 0.12)), 0.75, 1);
    s.face(camera);
  }
}
