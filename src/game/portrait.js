// Head-and-shoulders portrait cropped from the first idle frame of a sprite sheet (pixel exact).
const cache = new Map();

/** @param {object} sheet { meta, pixels } (pixels may be a recoloured costume) */
export function portrait(sheet, size = 64) {
  let src = cache.get(sheet.pixels);
  if (!src) {
    const { meta, pixels } = sheet;
    const [cw] = meta.cell, [ax] = meta.anchor;
    // first opaque row of the idle frame = top of the head
    let top = 0;
    search: for (let y = 0; y < meta.cell[1]; y++) for (let x = 0; x < cw; x++) if (pixels.data[(y * pixels.w + x) * 4 + 3]) { top = y; break search; }
    const box = 74;
    src = document.createElement('canvas');
    src.width = src.height = box;
    src.getContext('2d').drawImage(pixels.toCanvas(), Math.round(ax - box / 2), Math.max(0, top - 4), box, box, 0, 0, box, box);
    cache.set(sheet.pixels, src);
  }
  const c = document.createElement('canvas');
  c.width = c.height = src.width;
  c.getContext('2d').drawImage(src, 0, 0);
  c.style.width = c.style.height = `${size}px`;
  return c;
}
