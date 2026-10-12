// Sprite sheets cut by tools/cut_sheet.py: <name>.png (uniform cells, one row per animation)
// plus <name>.json ({ cell: [w, h], anchor: [x, y] feet point in the cell, anims: { name: { row, frames } } }).
import { imageToPixels } from './Sprite3D.js';

// a standalone build can embed assets: window.__ASSETS = { '/sprites/x.json': {...}, '/sprites/x.png': 'data:...' }
const embedded = (path) => window.__ASSETS?.[path];

export async function loadSheet(base) {
  const [meta, img] = await Promise.all([
    embedded(`${base}.json`) ?? fetch(`${base}.json`).then((r) => r.json()),
    new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error(`sheet not found: ${base}.png`));
      i.src = embedded(`${base}.png`) ?? `${base}.png`;
    }),
  ]);
  const cols = Math.round(img.width / meta.cell[0]), rows = Math.round(img.height / meta.cell[1]);
  return { meta, cols, rows, img, pixels: imageToPixels(img) };
}

/** Copy of a sheet's pixels with a colour remap (e.g. a second costume): fn([r,g,b]) -> [r,g,b] */
export function recolor(sheet, fn) {
  const c = document.createElement('canvas');
  c.width = sheet.img.width; c.height = sheet.img.height;
  const g = c.getContext('2d');
  g.drawImage(sheet.img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    if (!d.data[i + 3]) continue;
    const [r, gg, b] = fn([d.data[i], d.data[i + 1], d.data[i + 2]]);
    d.data[i] = r; d.data[i + 1] = gg; d.data[i + 2] = b;
  }
  g.putImageData(d, 0, 0);
  return { ...sheet, pixels: imageToPixels(c) };
}

/** blue cloth -> red cloth (keeps skin, hair, belt and outlines) */
export const blueToRed = ([r, g, b]) => (b > r + 25 && b > g + 15 ? [Math.min(255, b * 1.05), g * 0.75, r * 0.8] : [r, g, b]);
