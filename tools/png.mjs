// Minimal RGBA PNG encoder (no dependencies) for baking sprites from Node.
import zlib from 'zlib';

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** @param {Uint8Array|Uint8ClampedArray} rgba w*h*4 bytes */
export function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** simple RGBA image buffer for composing contact sheets */
export class Img {
  constructor(w, h, bg = [0, 0, 0, 0]) {
    this.w = w; this.h = h; this.data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) this.data.set(bg, i * 4);
  }
  /** nearest-neighbour blit of src (w,h,data) scaled by k, alpha over */
  blit(src, x0, y0, k = 1) {
    for (let y = 0; y < src.h * k; y++) for (let x = 0; x < src.w * k; x++) {
      const tx = x0 + x, ty = y0 + y;
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
      const si = (((y / k) | 0) * src.w + ((x / k) | 0)) * 4;
      const a = src.data[si + 3] / 255;
      if (!a) continue;
      const di = (ty * this.w + tx) * 4;
      for (let c = 0; c < 3; c++) this.data[di + c] = src.data[si + c] * a + this.data[di + c] * (1 - a);
      this.data[di + 3] = 255;
    }
  }
  png() { return encodePNG(this.w, this.h, this.data); }
}
