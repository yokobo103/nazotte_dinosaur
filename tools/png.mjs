// PNG(8bit RGBA/RGB) を Node だけで読み書きする。
// 画像ツールもヘッドレスChromeも使わずに、画素を直接測りたいときのため。
// 使い方: import { readPNG, writePNG } from "./png.mjs"
import zlib from "node:zlib";
import fs from "node:fs";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** @returns {{w:number,h:number,data:Buffer}} data は RGBA が w*h*4 バイト */
export function readPNG(file){
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("PNGではない: " + file);

  let pos = 8, w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  let palette = null, trns = null;
  while (pos < buf.length){
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR"){
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      depth = body[8]; color = body[9]; interlace = body[12];
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error("8bitのPNGだけ読める（この画は " + depth + "bit）");
  if (interlace) throw new Error("インターレースPNGは読めない");

  const CH = { 0:1, 2:3, 3:1, 4:2, 6:4 }[color];
  if (!CH) throw new Error("色の形式 " + color + " は読めない");

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * CH;
  const out = Buffer.alloc(w * h * CH);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++){
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    line.copy(cur);
    for (let i = 0; i < stride; i++){
      const a = i >= CH ? cur[i - CH] : 0;
      const b = prev[i];
      const c = i >= CH ? prev[i - CH] : 0;
      let v = cur[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4){
        const pp = a + b - c, pa = Math.abs(pp-a), pb = Math.abs(pp-b), pc = Math.abs(pp-c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    prev = cur;
  }

  // どの形式でも RGBA にそろえて返す
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0, n = w * h; i < n; i++){
    let r, g, b2, a = 255;
    if (color === 6){ r = out[i*4]; g = out[i*4+1]; b2 = out[i*4+2]; a = out[i*4+3]; }
    else if (color === 2){ r = out[i*3]; g = out[i*3+1]; b2 = out[i*3+2]; }
    else if (color === 0){ r = g = b2 = out[i]; }
    else if (color === 4){ r = g = b2 = out[i*2]; a = out[i*2+1]; }
    else { const p = out[i]; r = palette[p*3]; g = palette[p*3+1]; b2 = palette[p*3+2];
           if (trns && p < trns.length) a = trns[p]; }
    data[i*4] = r; data[i*4+1] = g; data[i*4+2] = b2; data[i*4+3] = a;
  }
  return { w, h, data };
}

/** RGBA の Buffer を PNG で書き出す */
export function writePNG(file, w, h, data){
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++){
    raw[y * (stride + 1)] = 0;                       // フィルタなし
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([
    SIG, chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]));
}

let TABLE = null;
function crc32(buf){
  if (!TABLE){
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++){
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return c ^ -1;
}
