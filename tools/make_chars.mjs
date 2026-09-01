// キャラの絵を配信用に焼く。
// 元画: work/chars/*.png（Gitに入れない原画）→ 出力: app/assets/chars/*.webp
//
// やること
//  1. 表情シート（透過PNG・5列2行）から必要なコマだけ形どおりに抜く
//     - 丸く抜かない。背景はもともと透明なので、アルファをそのまま使う
//     - マス目でぶつ切りにしない（となりのコマの飾りが境目をまたぐと切れる）
//     - 倍率は全コマ共通・顔の重心をそろえる
//       （外接矩形に合わせると、飾りの多いコマほど顔が小さくなる）
//  2. ロゴの白地を外側から塗りつぶして透過にする（内側の白は残す）
//  3. キービジュアルと賞状は縮めてWebPにするだけ
//
// 切り出しは Node だけでやる（tools/png.mjs / tools/sheet.mjs）。
// WebPにするところだけヘッドレスChromeを使う。
// 使い方: node tools/make_chars.mjs
import puppeteer from "puppeteer";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { readSheet, render } from "./sheet.mjs";
import { writePNG } from "./png.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SRC  = path.join(ROOT, "work", "chars");
const OUT  = path.join(ROOT, "app", "assets", "chars");
fs.mkdirSync(OUT, { recursive: true });

// 出力の枠（原画の画素のまま）。実測した「重心からの伸び」から決めている。
//   Dr.よこぼ 左130 右150 上112 下104 ／ ニャビット 左152 右155 上137 下132
// 顔は枠の9割ほどを占める＝前の丸バッジと同じ大きさで出せる。
const BOX = {
  yokobo:  { w: 300, h: 224 },
  nyabbit: { w: 310, h: 274 }
};

// どのコマを使うかは `node tools/char_index.mjs` で見本を出して決める。
// 見本の下の棒の数−1 が通し番号、実行時に「13=b#3」のような対応表も出るので、
// その「b#3」を下の sheet/cell に書く。
const FACES = [
  // ニャビット：フラットで角が立っているので小さくても表情が読める＝なぞる画面の相棒
  { who: "nyabbit", sheet: "nyabbit_sheet_b.png", cell: 0, out: "ny_idle.webp"  }, // ふつう
  { who: "nyabbit", sheet: "nyabbit_sheet_b.png", cell: 3, out: "ny_great.webp" }, // 星目＝かんぺき
  { who: "nyabbit", sheet: "nyabbit_sheet_b.png", cell: 2, out: "ny_good.webp"  }, // ＞＜わらい
  { who: "nyabbit", sheet: "nyabbit_sheet_b.png", cell: 5, out: "ny_hmm.webp"   }, // ？＝ちがう線
  { who: "nyabbit", sheet: "nyabbit_sheet_a.png", cell: 0, out: "ny_oops.webp"  }, // あせ＝もういちど
  { who: "nyabbit", sheet: "nyabbit_sheet_b.png", cell: 4, out: "ny_love.webp"  }, // ハート目＝ホネ発見
  // Dr.よこぼ：毛の描き込みが多く小さいと潰れる＝96px以上で使うところだけ
  { who: "yokobo",  sheet: "yokobo_sheet_a.png",  cell: 7, out: "yk_wave.webp"  }, // 手をふる
  { who: "yokobo",  sheet: "yokobo_sheet_b.png",  cell: 2, out: "yk_cheer.webp" }  // 大よろこび
];

/** 顔の重心。外接矩形の中心だと、手や💢に引っぱられて位置がぶれる */
function centroid(frame){
  const { W, lab, head } = frame;
  let sx = 0, sy = 0, n = 0;
  for (let y = head.y0; y <= head.y1; y++)
    for (let x = head.x0; x <= head.x1; x++)
      if (lab[y*W + x] === head.id){ sx += x; sy += y; n++; }
  return { x: sx/n, y: sy/n };
}

/* ---------- 1. 表情シート → 形どおりの切り抜き（いったんPNGに） ---------- */
const sheets = new Map();
const temps = [];
for (const f of FACES){
  if (!sheets.has(f.sheet)) sheets.set(f.sheet, readSheet(path.join(SRC, f.sheet)));
  const frame = sheets.get(f.sheet)[f.cell];
  if (!frame) throw new Error(`${f.sheet} のコマ${f.cell} が空`);
  const box = BOX[f.who];
  const a = centroid(frame);
  const hx = (frame.head.x0 + frame.head.x1 + 1) / 2;
  const hy = (frame.head.y0 + frame.head.y1 + 1) / 2;
  const im = render(frame, {
    scale: 1, outW: box.w, outH: box.h,
    anchorX: box.w/2 - (a.x - hx),
    anchorY: box.h/2 - (a.y - hy)
  });
  const tmp = "_tmp_" + f.out.replace(/\.webp$/, ".png");
  writePNG(path.join(SRC, tmp), im.w, im.h, im.data);
  temps.push(tmp);
  f.tmp = tmp; f.size = [im.w, im.h];
}

/* ---------- Chrome を立ち上げる（WebPにするためだけ） ---------- */
const server = http.createServer((req, res) => {
  let d = null;
  try { d = fs.readFileSync(path.join(SRC, path.basename(decodeURIComponent(req.url)))); } catch {}
  if (d) res.writeHead(200, { "content-type": "image/png" }).end(d);
  else res.writeHead(404, { "content-type": "text/plain" }).end("404");
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto(`http://localhost:${PORT}/`);
const srcUrl = (name) => `http://localhost:${PORT}/${name}`;

const load = (url) => p.evaluate((u) => new Promise((ok, ng) => {
  const im = new Image();
  im.onload = () => { window.__im = im; ok({ w: im.naturalWidth, h: im.naturalHeight }); };
  im.onerror = () => ng(new Error("よめない: " + u));
  im.src = u;
}), url);

function save(name, dataUrl){
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(OUT, name), buf);
  return buf.length;
}

const report = [];
for (const f of FACES){
  await load(srcUrl(f.tmp));
  const url = await p.evaluate((q) => {
    const im = window.__im;
    const cv = document.createElement("canvas");
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    cv.getContext("2d").drawImage(im, 0, 0);
    return cv.toDataURL("image/webp", q);
  }, 0.80);
  report.push([f.out, save(f.out, url), `${f.sheet} コマ${f.cell} → ${f.size.join("x")}`]);
}

/* ---------- 2. ロゴ：白地を外から塗りつぶして透過 ---------- */
{
  const dim = await load(srcUrl("logo.png"));
  const url = await p.evaluate((outW, quality) => {
    const im = window.__im, W = im.naturalWidth, H = im.naturalHeight;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H), px = d.data;

    // 外周から白いところだけ塗りつぶす（絵の中の白は残る）
    const seen = new Uint8Array(W * H);
    const stack = [];
    const white = (i) => px[i*4] > 236 && px[i*4+1] > 236 && px[i*4+2] > 236;
    for (let x = 0; x < W; x++){ stack.push(x); stack.push((H-1)*W + x); }
    for (let y = 0; y < H; y++){ stack.push(y*W); stack.push(y*W + W-1); }
    while (stack.length){
      const i = stack.pop();
      if (seen[i] || !white(i)) continue;
      seen[i] = 1;
      px[i*4+3] = 0;
      const x = i % W, y = (i - x) / W;
      if (x > 0)   stack.push(i-1);
      if (x < W-1) stack.push(i+1);
      if (y > 0)   stack.push(i-W);
      if (y < H-1) stack.push(i+W);
    }
    g.putImageData(d, 0, 0);

    // 中身の入っている範囲だけ切り出す（余白は縮めたときの目減りになる）
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      if (px[(y*W + x)*4 + 3] > 8){
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = Math.round(outW * chh / cw);
    out.getContext("2d").drawImage(cv, x0, y0, cw, chh, 0, 0, out.width, out.height);
    return { url: out.toDataURL("image/webp", quality), w: out.width, h: out.height };
  }, 680, 0.82);
  report.push(["logo.webp", save("logo.webp", url.url),
               `${dim.w}x${dim.h} → ${url.w}x${url.h}（白地ぬき・余白トリム）`]);
}

/* ---------- 3. キービジュアルと賞状：縮めるだけ ---------- */
for (const j of [
  { src: "keyvisual.png",   out: "keyvisual.webp",   w: 480, q: 0.74 },
  { src: "certificate.png", out: "certificate.webp", w: 900, q: 0.80 }
]){
  const dim = await load(srcUrl(j.src));
  const url = await p.evaluate((outW, quality) => {
    const im = window.__im;
    const cv = document.createElement("canvas");
    cv.width = outW;
    cv.height = Math.round(outW * im.naturalHeight / im.naturalWidth);
    cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
    return { url: cv.toDataURL("image/webp", quality), w: cv.width, h: cv.height };
  }, j.w, j.q);
  report.push([j.out, save(j.out, url.url), `${dim.w}x${dim.h} → ${url.w}x${url.h}`]);
}

await b.close();
server.close();
for (const t of temps) fs.unlinkSync(path.join(SRC, t));

let total = 0;
for (const [name, bytes, note] of report){
  total += bytes;
  console.log(`${name.padEnd(18)} ${String(Math.round(bytes/1024)).padStart(5)}KB  ${note}`);
}
console.log(`${"".padEnd(18)} ${String(Math.round(total/1024)).padStart(5)}KB  合計 ${report.length}枚`);
console.log("→ " + path.relative(ROOT, OUT));
