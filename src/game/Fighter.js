// LF2-style fighter. Moves on the ground plane (x along the lane, z in depth) and jumps (y).
// Mechanics follow Little Fighter 2:
//   - attack combo (2 hits + finisher that knocks down), jump attack, dash attack (run + A), dash jump
//   - defend (tap D): blocks frontal hits; too many blocked hits break the guard
//   - "fall" points: ~40 makes the target dizzy, 60 knocks it down; airborne hits always knock down
//   - lying fighters cannot be hit; they blink invincible after getting up
//   - HP has a dark-red recoverable part; MP regenerates (faster when hurt) and pays for specials
//   - specials: D + direction + A/J (directions are relative to facing)
import * as THREE from 'three';
import { Sprite3D, prepareTextures } from '../engine/sprite/Sprite3D.js';

export const LANE = { x0: 1.2, x1: 22.8, z0: 4.4, z1: 8.7 };
const G = 34; // gravity (units/s²)
const DEPTH_HIT = 0.6; // how close in z an attack must be to land (LF2 lanes)
const NO_INPUT = { mx: 0, mz: 0, attack: false, jump: false, defend: false, run: 0, cmd: null };
const MAX_HP = 500, MAX_MP = 500;

export class Fighter {
  /**
   * @param {object} sheet loaded sprite sheet ({ meta, cols, rows, pixels })
   * @param {object} def character definition (characters.js)
   * @param {object} o { x, z, face, team (0 = independent), id, human }
   */
  constructor(sheet, def, { x, z, face = 1, team = 0, id = 0, human = false }) {
    const { meta, cols, rows, pixels } = sheet;
    this.def = def;
    this.meta = meta;
    this.id = id; this.team = team; this.human = human;
    this.sprite = new Sprite3D(pixels, {
      grid: [cols, rows], ppu: def.ppu,
      pivotX: meta.anchor[0] / meta.cell[0],
      pivotY: (meta.cell[1] - meta.anchor[1]) / meta.cell[1],
      blob: 0.75,
    });
    this.rows = Object.fromEntries(Object.entries(meta.anims).map(([k, v]) => [k, v.row]));
    this.ghostTex = prepareTextures(pixels).map;
    this.x = x; this.z = z; this.y = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.face = face;
    this.maxHp = MAX_HP; this.hp = MAX_HP; this.hpDark = MAX_HP; this.shownHp = MAX_HP;
    this.maxMp = MAX_MP; this.mp = MAX_MP;
    this.fallPts = 0; this.bdefend = 0;
    this.invuln = 0; this.flash = 0; this.tilt = 0; this.sway = 0;
    this.stats = { kills: 0, attack: 0, hpLost: 0, mpUsage: 0 };
    this.hits = new Map(); // target -> time of its last hit by the current move
    this.comboStep = 0; this.comboQueued = false;
    this.setState('idle');
  }

  get alive() { return this.hp > 0; }
  get canAct() { return ['idle', 'walk', 'run', 'defend'].includes(this.state); }
  get lying() { return ['fall', 'down', 'getup', 'ko'].includes(this.state); }
  get hittable() { return this.alive && !this.lying && this.invuln <= 0; }
  isEnemy(o) { return o !== this && (this.team === 0 || o.team !== this.team); }

  setState(s) { this.state = s; this.t = 0; this.hits.clear(); }
  frames(anim) { return this.meta.anims[anim].frames; }
  loop(anim, fps) { return [this.rows[anim], Math.floor(this.t * fps) % this.frames(anim)]; }

  update(dt, intent, others, fx) {
    const i = { ...(intent || NO_INPUT) };
    const d = this.def;
    this.t += dt;
    this.fallPts = Math.max(0, this.fallPts - 15 * dt);
    this.bdefend = Math.max(0, this.bdefend - 30 * dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.alive) {
      this.mp = Math.min(this.maxMp, this.mp + (18 + (1 - this.hp / this.maxHp) * 45) * dt);
      if (this.hp < this.hpDark && !this.lying && this.state !== 'hurt') this.hp = Math.min(this.hpDark, this.hp + 3 * dt);
    }
    const foes = others.filter((o) => this.isEnemy(o));
    let row = this.rows.idle, col = 0;
    this.sway = 0;

    // specials can start from any free state (including defend, which is how D+dir+A begins)
    if (i.cmd && this.canAct && this.startSpecial(i.cmd, fx)) i.attack = i.jump = false;

    switch (this.state) {
      case 'idle': case 'walk': case 'run': case 'defend': {
        if (this.state === 'defend') {
          row = this.rows.jump; col = 1;
          this.vx *= 0.7; this.vz = 0;
          if (i.defend) this.t = 0;
          if (this.t < 0.32) break;
          this.setState('idle');
        }
        if (i.defend) { this.setState('defend'); this.vx = 0; row = this.rows.jump; col = 1; break; }
        if (i.jump) { this.dashJump = this.state === 'run'; this.setState('jumpPrep'); break; }
        if (i.attack) {
          if (this.state === 'run') this.startDashAttack();
          else this.startCombo(i);
          break;
        }
        if (i.run) { this.face = i.run; this.setState('run'); }
        if (this.state === 'run') {
          // LF2 run keeps going until the opposite direction is pressed
          if (i.mx === -this.face) { this.setState('idle'); this.vx = 0; break; }
          this.vx = this.face * d.run; this.vz = i.mz * d.walkZ * 0.7;
          [row, col] = this.loop('run', 14);
          break;
        }
        this.vx = i.mx * d.walk; this.vz = i.mz * d.walkZ;
        if (i.mx) this.face = i.mx;
        const moving = i.mx || i.mz;
        if (moving && this.state !== 'walk') this.setState('walk');
        if (!moving && this.state !== 'idle') this.setState('idle');
        [row, col] = moving ? this.loop('walk', 11) : this.loop('idle', 7);
        break;
      }
      case 'attack': {
        const m = this.move;
        const n = this.frames(m.anim);
        const f = Math.min(n - 1, (m.start || 0) + Math.floor(this.t * m.fps));
        row = this.rows[m.anim]; col = f;
        this.vx *= 0.82; this.vz = 0;
        if (m.active.includes(f)) { if (m.anim === 'punch') this.vx = this.face * 1.1; this.tryHit(m, foes, fx); }
        if (i.attack) this.comboQueued = true;
        if ((m.start || 0) + this.t * m.fps >= n) {
          if (this.comboQueued && this.comboStep < 3) this.startCombo(i, true);
          else { this.comboStep = 0; this.setState('idle'); }
        }
        break;
      }
      case 'dashAttack':
        row = this.rows.jumpkick; col = 4;
        this.vx *= 1 - 1.6 * dt;
        if (this.y > 0) this.tryHit(d.dashAttack, foes, fx);
        if (this.t > 0.05 && this.landed()) this.setState('landKick');
        break;
      case 'jumpPrep': // crouch before take-off
        row = this.rows.jump; col = 1; this.vz = 0;
        if (this.t > 0.07) {
          if (i.mx) this.face = i.mx;
          this.vx = this.dashJump ? this.face * d.run * 0.95 : i.mx * d.walk * 1.05;
          this.vz = i.mz * d.walkZ * 0.6;
          this.vy = d.jump * (this.dashJump ? 0.92 : 1); this.y = 0.01;
          this.setState('air');
        }
        break;
      case 'air': case 'jumpAttack':
        if (this.state === 'air' && i.attack) this.setState('jumpAttack');
        if (this.state === 'jumpAttack') {
          row = this.rows.jumpkick; col = this.t < 0.07 ? 3 : 4;
          if (col === 4) this.tryHit(d.jumpAttack, foes, fx);
        } else {
          row = this.rows.jump; col = this.vy > 5 ? 2 : this.vy > -3 ? 3 : 4;
        }
        if (this.landed()) this.setState(this.state === 'jumpAttack' ? 'landKick' : 'land');
        break;
      case 'land': case 'landKick':
        this.vx *= 0.6; this.vz = 0;
        row = this.state === 'land' ? this.rows.jump : this.rows.jumpkick; col = 5;
        if (this.t > 0.12) this.setState('idle');
        break;
      case 'rush': { // special: advancing flurry, several hits, the last one knocks down
        const s = this.special;
        row = this.rows[s.anim]; col = s.frames[Math.floor(this.t * 16) % s.frames.length];
        this.vx = this.face * s.speed * (this.t < s.dur * 0.8 ? 1 : 0.3); this.vz = i.mz * 1.2;
        const last = this.t > s.dur * 0.75;
        this.tryHit({ ...s, knock: last, fall: last ? 80 : s.fall }, foes, fx, s.dur / s.hits);
        fx?.ghost(this, 0.05);
        if (this.t > s.dur) this.setState('idle');
        break;
      }
      case 'flykick': {
        const s = this.special;
        row = this.rows.jumpkick; col = this.t < 0.06 ? 3 : 4;
        this.tryHit(s, foes, fx);
        fx?.ghost(this, 0.04);
        if (this.t > 0.1 && this.landed()) this.setState('landKick');
        break;
      }
      case 'hurt':
        this.vx *= 0.82; this.vz = 0;
        row = this.rows.idle; col = 0; this.sway = -0.14 * Math.max(0, 1 - this.t * 4);
        if (this.t > 0.3) this.setState('idle');
        break;
      case 'dizzy': case 'broken':
        this.vx *= 0.85; this.vz = 0;
        row = this.rows.idle; col = 0; this.sway = Math.sin(this.t * 9) * 0.12;
        if (this.t > (this.state === 'dizzy' ? 1.3 : 0.7)) this.setState('idle');
        break;
      case 'fall': // knocked into the air, spinning back
        row = this.rows.jump; col = 4;
        this.tilt = Math.min(1, this.tilt + dt * 4.5);
        if (this.landed()) {
          this.vx *= 0.35; fx?.shake(0.12);
          this.setState(this.hp <= 0 ? 'ko' : 'down');
        }
        break;
      case 'down': case 'ko':
        row = this.rows.jump; col = 4; this.tilt = 1; this.vx *= 0.85; this.vz = 0;
        if (this.state === 'down' && this.t > 0.8) this.setState('getup');
        break;
      case 'getup':
        row = this.rows.jump; col = 1; this.vx = 0;
        this.tilt = Math.max(0, 1 - this.t * 5);
        if (this.t > 0.35) { this.fallPts = 0; this.invuln = 1.0; this.setState('idle'); }
        break;
    }

    // physics
    if (this.y > 0 || this.vy > 0) { this.vy -= G * dt; this.y = Math.max(0, this.y + this.vy * dt); }
    this.x = Math.min(LANE.x1, Math.max(LANE.x0, this.x + this.vx * dt));
    this.z = Math.min(LANE.z1, Math.max(LANE.z0, this.z + this.vz * dt));
    if (this.y <= 0 && !['fall', 'down', 'ko', 'getup'].includes(this.state)) this.tilt = 0;
    this.row = row; this.col = col;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.shownHp += (this.hp - this.shownHp) * Math.min(1, dt * 2.5);
  }

  startCombo(i, chained = false) {
    if (i?.mx) this.face = i.mx;
    this.comboStep = chained ? this.comboStep + 1 : 1;
    this.comboQueued = false;
    const d = this.def;
    this.move = this.comboStep === 1 ? d.attack1 : this.comboStep === 2 ? d.attack2 : d.finisher;
    this.setState('attack');
    this.vx = 0;
  }

  startDashAttack() {
    this.setState('dashAttack');
    this.vx = this.face * this.def.run * 1.05; this.vy = 5.5; this.y = 0.01;
  }

  startSpecial(cmd, fx) {
    // the command holds absolute directions; LF2 specials are relative to facing (→ = forward)
    let dir = cmd[1];
    if (dir === 'R' || dir === 'L') { this.face = dir === 'R' ? 1 : -1; dir = '>'; }
    else dir = dir === 'U' ? '^' : 'v';
    const s = this.def.specials[`D${dir}${cmd[2]}`];
    if (!s || this.mp < s.mp) return false;
    this.mp -= s.mp; this.stats.mpUsage += s.mp;
    this.special = s;
    if (s.kind === 'rush') this.setState('rush');
    if (s.kind === 'flykick') { this.setState('flykick'); this.vy = s.vy; this.vx = this.face * s.vx; this.y = 0.01; }
    fx?.callout(this, s.name);
    return true;
  }

  landed() {
    if (this.vy <= 0 && this.y <= 0) { this.y = 0; this.vy = 0; return true; }
    return false;
  }

  /** hit every foe inside the move's box; rehit: seconds before the same target can be hit again */
  tryHit(m, foes, fx, rehit = Infinity) {
    for (const f of foes) {
      const last = this.hits.get(f);
      if (last !== undefined && this.t - last < rehit) continue;
      if (!f.hittable) continue;
      const dx = (f.x - this.x) * this.face;
      if (dx < m.reach[0] || dx > m.reach[1]) continue;
      if (Math.abs(f.z - this.z) > DEPTH_HIT) continue;
      if (f.y - this.y > 1.8 || this.y - f.y > 1.4) continue;
      this.hits.set(f, this.t);
      f.takeHit(this, m, fx);
    }
  }

  takeHit(from, m, fx) {
    const facingAttacker = Math.sign(from.x - this.x || -from.face) === this.face;
    if (this.state === 'defend' && facingAttacker) {
      // blocked: a sliver of damage, pushback, the guard wears down
      const dmg = Math.round(m.dmg * 0.1);
      this.hp = Math.max(1, this.hp - dmg);
      this.bdefend += m.dmg * 1.4;
      this.vx = from.face * m.push * 0.5;
      from.stats.attack += dmg; this.stats.hpLost += dmg;
      fx?.hit(this, from, { blocked: true });
      if (this.bdefend >= 100) { this.bdefend = 0; this.setState('broken'); }
      return;
    }
    const before = this.hp;
    this.hp = Math.max(0, this.hp - m.dmg);
    this.hpDark = Math.max(this.hp, this.hpDark - m.dmg / 3);
    from.stats.attack += before - this.hp; this.stats.hpLost += before - this.hp;
    this.fallPts += m.fall;
    this.face = -from.face;
    this.flash = 1;
    this.comboStep = 0;
    const knock = this.hp <= 0 || m.knock || this.fallPts >= 60 || this.y > 0.2;
    fx?.hit(this, from, { knock });
    if (this.hp <= 0) from.stats.kills++;
    if (knock) {
      this.setState('fall');
      this.vx = from.face * m.push; this.vy = 8; this.y = Math.max(this.y, 0.01);
      this.fallPts = 0;
    } else if (this.fallPts >= 40 && this.state !== 'dizzy') {
      this.setState('dizzy');
      this.vx = from.face * m.push * 0.6;
    } else {
      this.setState('hurt');
      this.vx = from.face * m.push;
    }
  }

  /** sync the 3D sprite */
  render(camera) {
    const s = this.sprite;
    s.position.set(this.x, 0, this.z);
    s.mesh.position.y = this.y + (this.tilt ? 0.25 * this.tilt : 0);
    s.mesh.rotation.z = (this.tilt * (Math.PI / 2) - this.sway) * this.face;
    s.setFrame(this.col, this.row);
    s.setFlip(this.face < 0);
    s.flash = this.flash * 0.85;
    // invincible after getting up: blink like LF2
    s.mesh.visible = !(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0);
    s.blob.scale.set(1.25 * (1 - Math.min(0.4, this.y * 0.12)), 0.75, 1);
    s.face(camera);
  }

  /** a fading copy of the current frame (special-move afterimage) */
  makeGhost(color) {
    const tex = this.ghostTex.clone();
    tex.repeat.copy(this.sprite.maps[0].repeat); tex.offset.copy(this.sprite.maps[0].offset);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity: 0.5, depthWrite: false, alphaTest: 0.3, side: THREE.DoubleSide });
    const g = new THREE.Mesh(this.sprite.mesh.geometry, mat);
    this.sprite.mesh.updateWorldMatrix(true, false);
    g.matrixAutoUpdate = false;
    g.matrix.copy(this.sprite.mesh.matrixWorld);
    return g;
  }
}
