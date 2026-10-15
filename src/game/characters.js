// Roster. Artworks and sprite sheets come from the artist (public/sprites, cut by tools/cut_sheet.py); every
// sheet uses the same row order: idle, walk, run, punch, kick, jump, jumpkick.
// Damage numbers are on LF2's scale (500 HP / 500 MP).

// white dobok -> red dobok (light, unsaturated pixels only)
const whiteToRed = ([r, g, b]) => {
  const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
  return mn > 140 && mx - mn < 40 ? [Math.min(255, r * 1.02), g * 0.55, b * 0.6] : [r, g, b];
};
const blueToRed = ([r, g, b]) => (b > r + 25 && b > g + 15 ? [Math.min(255, b * 1.05), g * 0.75, r * 0.8] : [r, g, b]);

export const CHARACTERS = [
  {
    id: 'vovinam',
    name: 'Nam',
    fullName: 'Nam',
    style: 'Vovinam',
    country: 'Viêt Nam',
    sheet: '/sprites/vovinam',
    art: '/art/vovinam.png',
    ppu: 46,
    color: '#3f78ff',
    altCostume: blueToRed,
    walk: 3.4, walkZ: 2.3, run: 7.6, jump: 11.5,
    // basic moves: [frame of the sheet row, ...] active frames
    attack1: { anim: 'punch', fps: 20, active: [3, 4], dmg: 22, fall: 15, reach: [0.1, 1.8], push: 1.6 },
    attack2: { anim: 'punch', fps: 24, start: 2, active: [3, 4], dmg: 22, fall: 15, reach: [0.1, 1.8], push: 1.8 },
    finisher: { anim: 'kick', fps: 16, active: [4], dmg: 40, fall: 70, reach: [0.2, 2.0], push: 5, knock: true },
    jumpAttack: { dmg: 45, fall: 70, reach: [0.1, 2.0], push: 5, knock: true },
    dashAttack: { dmg: 50, fall: 70, reach: [0.1, 2.0], push: 7, knock: true },
    specials: {
      'D>A': { name: 'Liên hoàn đấm', mp: 150, kind: 'rush', anim: 'punch', frames: [3, 4], dur: 0.6, speed: 6.5, dmg: 24, fall: 18, hits: 4, reach: [0.0, 1.9], push: 1.4 },
      'D^J': { name: 'Phi cước', mp: 120, kind: 'flykick', vy: 15.5, vx: 2.5, dmg: 55, fall: 80, reach: [0.0, 2.0], push: 6, knock: true },
    },
  },
  {
    id: 'taekwondo',
    name: 'Kim',
    fullName: 'Kim',
    style: 'Taekwondo',
    country: 'Corée',
    sheet: '/sprites/taekwondo',
    art: '/art/taekwondo.png',
    ppu: 46,
    color: '#ff4060',
    altCostume: whiteToRed,
    walk: 3.7, walkZ: 2.5, run: 8.0, jump: 12.2,
    attack1: { anim: 'punch', fps: 22, active: [3, 4], dmg: 18, fall: 15, reach: [0.1, 1.8], push: 1.5 },
    attack2: { anim: 'punch', fps: 26, start: 2, active: [3, 4], dmg: 18, fall: 15, reach: [0.1, 1.8], push: 1.7 },
    finisher: { anim: 'kick', fps: 18, active: [4], dmg: 48, fall: 70, reach: [0.2, 2.3], push: 5.5, knock: true },
    jumpAttack: { dmg: 50, fall: 70, reach: [0.1, 2.3], push: 5.5, knock: true },
    dashAttack: { dmg: 52, fall: 70, reach: [0.1, 2.3], push: 7, knock: true },
    specials: {
      'D>A': { name: 'Yeonsok chagi', mp: 150, kind: 'rush', anim: 'kick', frames: [3, 4], dur: 0.6, speed: 6, dmg: 26, fall: 18, hits: 4, reach: [0.0, 2.2], push: 1.4 },
      'D^J': { name: 'Twimyeo yeop chagi', mp: 120, kind: 'flykick', vy: 10, vx: 9, dmg: 60, fall: 80, reach: [0.0, 2.3], push: 7, knock: true },
    },
  },
];

// announced fighters: artwork only, playable once their sprite sheet is supplied
export const UPCOMING = [
  { id: 'bjj', name: 'Ricardo', fullName: 'Ricardo', style: 'Jiu-jitsu brésilien', country: 'Brésil', art: '/art/bjj.png', color: '#c8c8d8' },
];

export const byId = (id) => CHARACTERS.find((c) => c.id === id);
