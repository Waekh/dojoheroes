// Renders every pose of a fighter straight from Node into a contact sheet PNG (no browser, no downscaling).
// Usage: node tools/sprite-sheet.mjs [zoom=6] [out=shots/sheet.png]
import fs from 'fs';
import { renderSprite } from '../src/engine/sprite/sdfRender.js';
import { KARATEKA, POSES } from '../src/game/fighters/karateka.js';
import { Img } from './png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')));
const k = Number(args.zoom || 6);
const out = args.out || 'shots/sheet.png';
const frames = Object.values(POSES).map((p) => renderSprite(KARATEKA, p));
const { w, h } = KARATEKA;
const pad = 8;
const sheet = new Img(frames.length * (w * k + pad) + pad + frames.length * (w * 2 + pad), h * k + pad * 2, [185, 172, 143, 255]);
frames.forEach((f, i) => sheet.blit(f, pad + i * (w * k + pad), pad, k));
// x2 previews (in-game size on a 1080p screen is about x2-x3)
const x2 = pad + frames.length * (w * k + pad);
frames.forEach((f, i) => sheet.blit(f, x2 + i * (w * 2 + pad), pad + h * k - h * 2, 2));
fs.mkdirSync('shots', { recursive: true });
fs.writeFileSync(out, sheet.png());
console.log('saved', out);
