import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c, table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// Draws a simple snowflake-on-blue icon: background square + white cross + diagonals
function makeIcon(size) {
  const bg = [0x16, 0x6f, 0xc4]; // blue
  const fg = [0xff, 0xff, 0xff]; // white
  const rowBytes = size * 3;
  const raw = Buffer.alloc((rowBytes + 1) * size);
  const cx = size / 2, cy = size / 2;
  const armLen = size * 0.36;
  const thickness = Math.max(2, size * 0.06);

  function isOnArm(x, y) {
    const dx = x - cx, dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > armLen) return false;
    const angle = Math.atan2(dy, dx);
    // 6 arms at 0,60,120,180,240,300 degrees -> use modulo on angle in degrees
    let deg = (angle * 180 / Math.PI + 360) % 60;
    const angDist = Math.min(deg, 60 - deg) * (Math.PI / 180) * dist;
    return angDist < thickness;
  }

  for (let y = 0; y < size; y++) {
    let offset = y * (rowBytes + 1);
    raw[offset] = 0; // filter byte: none
    for (let x = 0; x < size; x++) {
      const px = offset + 1 + x * 3;
      const onArm = isOnArm(x, y);
      const color = onArm ? fg : bg;
      raw[px] = color[0];
      raw[px + 1] = color[1];
      raw[px + 2] = color[2];
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  const buf = makeIcon(size);
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, buf);
  console.log('wrote', path, buf.length, 'bytes');
}
