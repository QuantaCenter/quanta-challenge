import zlib from 'node:zlib';

const CRC_TABLE = (() => {
   const table = new Uint32Array(256);
   for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
         c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
   }
   return table;
})();

function crc32(buf: Buffer): number {
   let c = 0xffffffff;
   for (const byte of buf) {
      c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
   }
   return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
   const length = Buffer.alloc(4);
   length.writeUInt32BE(data.length);
   const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
   const crc = Buffer.alloc(4);
   crc.writeUInt32BE(crc32(body));
   return Buffer.concat([length, body, crc]);
}

/**
 * 生成一张单色 PNG（RGB），供 E2E 封面图使用；纯 Node 实现，无图像依赖。
 * 半数行做明暗相间条纹，避免截图里整块纯色看不出加载成功。
 */
export function createPng(
   width: number,
   height: number,
   [r, g, b]: [number, number, number],
): Buffer {
   const ihdr = Buffer.alloc(13);
   ihdr.writeUInt32BE(width, 0);
   ihdr.writeUInt32BE(height, 4);
   ihdr[8] = 8; // bit depth
   ihdr[9] = 2; // color type: truecolor RGB

   const rows: Buffer[] = [];
   for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(1 + width * 3);
      const bright = Math.floor(y / 16) % 2 === 0 ? 1 : 0.6;
      for (let x = 0; x < width; x++) {
         row[1 + x * 3] = Math.round(r * bright);
         row[2 + x * 3] = Math.round(g * bright);
         row[3 + x * 3] = Math.round(b * bright);
      }
      rows.push(row);
   }

   return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
      chunk('IEND', Buffer.alloc(0)),
   ]);
}
