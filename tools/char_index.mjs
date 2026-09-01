// 表情シートのコマ番号を確かめる見本を作る。
// make_chars.mjs の FACES に書く cell 番号は、これを見て決める。
// 倍率固定・重心そろえ＝本番と同じ切り出し方で並べるので、
// 「どのコマを使うか」と「そろって見えるか」を一度に見られる。
// 使い方: node tools/char_index.mjs → work/qa-chars/index_*.png
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readSheet, render } from "./sheet.mjs";
import { writePNG } from "./png.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SRC  = path.join(ROOT, "work", "chars");
const OUT  = path.join(ROOT, "work", "qa-chars");
fs.mkdirSync(OUT, { recursive: true });

const SETS = [
  { who: "yokobo",  box: [300, 224], files: ["yokobo_sheet_a.png",  "yokobo_sheet_b.png"]  },
  { who: "nyabbit", box: [310, 274], files: ["nyabbit_sheet_a.png", "nyabbit_sheet_b.png"] }
];
const CELL = [168, 150], COLS = 5, PAD = 10, BG = [244, 223, 181];

function centroid(f){
  const { W, lab, head } = f;
  let sx = 0, sy = 0, n = 0;
  for (let y = head.y0; y <= head.y1; y++)
    for (let x = head.x0; x <= head.x1; x++)
      if (lab[y*W + x] === head.id){ sx += x; sy += y; n++; }
  return { x: sx/n, y: sy/n };
}

for (const set of SETS){
  const [BW, BH] = set.box;
  const imgs = [];
  for (const file of set.files){
    readSheet(path.join(SRC, file)).forEach((c, i) => {
      if (!c) return;
      const a = centroid(c);
      const hx = (c.head.x0 + c.head.x1 + 1) / 2, hy = (c.head.y0 + c.head.y1 + 1) / 2;
      imgs.push({ file, cell: i,
        im: render(c, { scale: 1, outW: BW, outH: BH,
                        anchorX: BW/2 - (a.x - hx), anchorY: BH/2 - (a.y - hy) }) });
    });
  }

  const rows = Math.ceil(imgs.length / COLS);
  const [CW, CH] = CELL;
  const W = COLS*(CW+PAD) + PAD, H = rows*(CH+PAD+14) + PAD;
  const d = Buffer.alloc(W*H*4);
  for (let i = 0; i < W*H; i++){ d[i*4]=BG[0]; d[i*4+1]=BG[1]; d[i*4+2]=BG[2]; d[i*4+3]=255; }

  imgs.forEach((o, k) => {
    const cx = k % COLS, cy = Math.floor(k / COLS);
    const s = Math.min(CW/o.im.w, CH/o.im.h);
    const w2 = Math.round(o.im.w*s), h2 = Math.round(o.im.h*s);
    const X = PAD + cx*(CW+PAD) + Math.floor((CW-w2)/2), Y = PAD + cy*(CH+PAD+14);
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++){
      const sx = Math.min(o.im.w-1, Math.floor(x/s)), sy = Math.min(o.im.h-1, Math.floor(y/s));
      const si = (sy*o.im.w + sx)*4, a = o.im.data[si+3]/255;
      if (!a) continue;
      const di = ((Y+y)*W + (X+x))*4;
      d[di]   = o.im.data[si]  *a + d[di]  *(1-a);
      d[di+1] = o.im.data[si+1]*a + d[di+1]*(1-a);
      d[di+2] = o.im.data[si+2]*a + d[di+2]*(1-a);
    }
    // 番号は「棒の数」で描く（字を描く道具を持ちこまないため）。棒n本＝コマ n-1
    const bx = X + 4, by = Y + h2 + 2;
    for (let t = 0; t <= k; t++) for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++){
      const di = ((by+y)*W + (bx + t*6 + x))*4;
      if (di >= 0 && di + 2 < d.length){ d[di]=60; d[di+1]=45; d[di+2]=30; }
    }
  });

  const file = path.join(OUT, `index_${set.who}.png`);
  writePNG(file, W, H, d);
  console.log(`${set.who}  ${imgs.length}コマ  → ${path.relative(ROOT, file)}`);
  console.log("  " + imgs.map((o,k)=>`${k}=${o.file.replace(/^.*sheet_/,"").replace(".png","")}#${o.cell}`).join(" "));
}
