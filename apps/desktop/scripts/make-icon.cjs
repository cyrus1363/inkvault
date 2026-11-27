// Generates apps/desktop/src-tauri/icons/icon.ico without external dependencies.
// Two images: 32x32 and 256x256, 32bpp BGRA with alpha. Simple lofi owl mark on
// transparent background: cream disc face, dark owl body, two eyes, beak.
"use strict";
const fs = require("fs");
const path = require("path");

function draw(size) {
  const px = new Uint8Array(size * size * 4); // BGRA
  const c = size / 2;
  const put = (x, y, [b, g, r, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const sa = a / 255;
    const da = px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    px[i] = Math.round((b * sa + px[i] * da * (1 - sa)) / oa);
    px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
    px[i + 2] = Math.round((r * sa + px[i + 2] * da * (1 - sa)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };
  const disc = (cx, cy, rx, ry, color, soft = 0.9) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1 + soft) {
          const a = Math.max(0, Math.min(1, (1 + soft - d) / (2 * soft))) * color[3];
          if (a > 0) put(x, y, [color[0], color[1], color[2], a]);
        }
      }
    }
  };
  // lofi cream background disc
  disc(c, c, 0.92 * c, 0.92 * c, [0xe3, 0xd8, 0xc3, 255], 0.15);
  // owl body
  disc(c, c + size * 0.04, 0.62 * c, 0.60 * c, [0x3a, 0x36, 0x33, 255], 0.2);
  // ear tufts
  disc(c - 0.42 * c, c - 0.42 * c, 0.16 * c, 0.22 * c, [0x3a, 0x36, 0x33, 255], 0.25);
  disc(c + 0.42 * c, c - 0.42 * c, 0.16 * c, 0.22 * c, [0x3a, 0x36, 0x33, 255], 0.25);
  // eyes (white + dark pupil)
  disc(c - 0.26 * c, c - 0.05 * c, 0.18 * c, 0.18 * c, [0xf6, 0xf2, 0xe8, 255], 0.2);
  disc(c + 0.26 * c, c - 0.05 * c, 0.18 * c, 0.18 * c, [0xf6, 0xf2, 0xe8, 255], 0.2);
  disc(c - 0.26 * c, c - 0.05 * c, 0.075 * c, 0.075 * c, [0x24, 0x22, 0x20, 255], 0.2);
  disc(c + 0.26 * c, c - 0.05 * c, 0.075 * c, 0.075 * c, [0x24, 0x22, 0x20, 255], 0.2);
  // beak
  disc(c, c + 0.16 * c, 0.10 * c, 0.13 * c, [0xd9, 0xa0, 0x5a, 255], 0.25);
  return px;
}

function bmpFor(size, px) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const stride = size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const data = Buffer.alloc(stride * size + maskStride * size);
  for (let y = 0; y < size; y++) {
    const src = size - 1 - y; // bottom-up
    for (let x = 0; x < size; x++) {
      const si = (src * size + x) * 4;
      const di = y * stride + x * 4;
      data[di] = px[si];
      data[di + 1] = px[si + 1];
      data[di + 2] = px[si + 2];
      data[di + 3] = px[si + 3];
    }
  }
  return Buffer.concat([header, data]);
}

const images = [32, 256].map((size) => ({ size, bmp: bmpFor(size, draw(size)) }));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
  const e = 6 + 16 * i;
  header[e] = img.size >= 256 ? 0 : img.size;
  header[e + 1] = img.size >= 256 ? 0 : img.size;
  header[e + 4] = 1; // planes
  header[e + 6] = 32; // bpp
  header.writeUInt32LE(img.bmp.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.bmp.length;
});
const outDir = path.join(__dirname, "..", "src-tauri", "icons");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.ico"), Buffer.concat([header, ...images.map((i) => i.bmp)]));
console.log("wrote icon.ico");
