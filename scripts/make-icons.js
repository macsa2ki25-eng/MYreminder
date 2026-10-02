'use strict';

// アイコン画像（assets/icon.png, assets/tray.png）を作る。依存なしのPNG書き出し。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 青い丸に白い「！」（0..1 の座標で、図形の内側なら true）
function shape(u, v) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  if (dx * dx + dy * dy > 0.25) return 'none';
  const bar = Math.abs(dx) < 0.075 && v > 0.2 && v < 0.6;
  const barCap = (dx * dx + (v - 0.2) * (v - 0.2) < 0.075 * 0.075) || (dx * dx + (v - 0.6) * (v - 0.6) < 0.075 * 0.075);
  const dot = dx * dx + (v - 0.77) * (v - 0.77) < 0.085 * 0.085;
  return bar || barCap || dot ? 'mark' : 'bg';
}

function render(size) {
  const ss = 4;
  return png(size, (x, y) => {
    let bg = 0;
    let mark = 0;
    for (let i = 0; i < ss; i++) {
      for (let j = 0; j < ss; j++) {
        const s = shape((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size);
        if (s === 'bg') bg++;
        else if (s === 'mark') mark++;
      }
    }
    const total = ss * ss;
    const a = (bg + mark) / total;
    if (a === 0) return [0, 0, 0, 0];
    const m = mark / (bg + mark);
    const blue = [31, 95, 191];
    return [
      Math.round(blue[0] + (255 - blue[0]) * m),
      Math.round(blue[1] + (255 - blue[1]) * m),
      Math.round(blue[2] + (255 - blue[2]) * m),
      Math.round(a * 255),
    ];
  });
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), render(256));
fs.writeFileSync(path.join(out, 'tray.png'), render(32));
console.log('assets/icon.png, assets/tray.png を作りました');
