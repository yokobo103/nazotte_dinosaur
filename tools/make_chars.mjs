// キャラの絵を配信用に焼く。
// 元画: work/chars/*.png（Gitに入れない原画）→ 出力: app/assets/chars/*.webp
//
// やること
//  1. 表情シート（1536x1024・5列4行）から必要なコマだけ丸く切って透過WebPにする
//     ＝背景が茶色で塗ってあるので、そのままUIに置けない
//  2. ロゴの白地を外側から塗りつぶして透過にする（内側の白は残す）
//  3. キービジュアルと賞状は縮めてWebPにするだけ
//
// 画像ツールは使わない。ヘッドレスChromeのcanvasで焼く（make_icons.mjs と同じ型）。
// 使い方: node tools/make_chars.mjs
import puppeteer from "puppeteer";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const SRC  = path.join(ROOT, "work", "chars");
const OUT  = path.join(ROOT, "app", "assets", "chars");
fs.mkdirSync(OUT, { recursive: true });

// 表情シートのコマ番号（work/chars/faces_contact.png で 0〜19 が振ってある）
const FACES = [
  // ニャビット：フラットで角が立っているので小さくても表情が読める＝なぞる画面の相棒
  { sheet: "nyabbit_sheet.png", out: "ny_idle.webp",  cell: 0,  size: 200 }, // ふつう
  { sheet: "nyabbit_sheet.png", out: "ny_great.webp", cell: 3,  size: 200 }, // 星目＝かんぺき
  { sheet: "nyabbit_sheet.png", out: "ny_good.webp",  cell: 1,  size: 200 }, // わらい＝じょうず
  { sheet: "nyabbit_sheet.png", out: "ny_hmm.webp",   cell: 5,  size: 200 }, // ？＝ちがう線
  { sheet: "nyabbit_sheet.png", out: "ny_oops.webp",  cell: 11, size: 200 }, // あせ＝もういちど
  { sheet: "nyabbit_sheet.png", out: "ny_love.webp",  cell: 4,  size: 200 }, // ハート目＝ホネ発見
  // Dr.よこぼ：毛の描き込みが多く小さいと潰れる＝96px以上で使うところだけ
  { sheet: "yokobo_sheet.png",  out: "yk_wave.webp",  cell: 19, size: 200 }, // 手をふる
  { sheet: "yokobo_sheet.png",  out: "yk_cheer.webp", cell: 2,  size: 200 }  // 大よろこび
];

const COLS = 5, ROWS = 4;

// 元画は小さなHTTPサーバから配る。file:// で読むと canvas が汚染されて
// toDataURL が使えない（＝焼けない）。
const server = http.createServer((req, res) => {
  const file = path.join(SRC, path.basename(decodeURIComponent(req.url)));
  fs.readFile(file, (err, data) => {
    if (err) res.writeHead(404).end("404");
    else res.writeHead(200, { "content-type": "image/png" }).end(data);
  });
});
await new Promise(r => server.listen(0, r));
const PORT = server.address().port;

const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.goto(`http://localhost:${PORT}/`);

const srcUrl = (name) => `http://localhost:${PORT}/${name}`;

async function save(name, dataUrl){
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  fs.writeFileSync(path.join(OUT, name), buf);
  return buf.length;
}

const load = (url) => p.evaluate((u) => new Promise((ok, ng) => {
  const im = new Image();
  im.onload = () => { window.__im = im; ok({ w: im.naturalWidth, h: im.naturalHeight }); };
  im.onerror = () => ng(new Error("よめない: " + u));
  im.src = u;
}), url);

/* ---------- 1. 表情シート → 丸バッジ ---------- */
const report = [];
for (const f of FACES){
  const dim = await load(srcUrl(f.sheet));
  const url = await p.evaluate((cell, size, cols, rows, quality) => {
    const im = window.__im;
    const cw = im.naturalWidth / cols, ch = im.naturalHeight / rows;
    const side = Math.min(cw, ch);                       // コマの短辺で正方形に切る
    const cx = (cell % cols) * cw + (cw - side) / 2;
    const cy = Math.floor(cell / cols) * ch + (ch - side) / 2;
    const cv = document.createElement("canvas");
    cv.width = cv.height = size;
    const g = cv.getContext("2d");
    g.drawImage(im, cx, cy, side, side, 0, 0, size, size);
    // 丸く抜く（外側を透過に）
    g.globalCompositeOperation = "destination-in";
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    g.fill();
    return cv.toDataURL("image/webp", quality);
  }, f.cell, f.size, COLS, ROWS, 0.80);
  report.push([f.out, await save(f.out, url), `${f.sheet} コマ${f.cell} ${dim.w}x${dim.h}`]);
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
    return { url: out.toDataURL("image/webp", quality), w: out.width, h: out.height,
             trim: [x0, y0, cw, chh] };
  }, 680, 0.82);
  report.push(["logo.webp", await save("logo.webp", url.url),
               `${dim.w}x${dim.h} → ${url.w}x${url.h}（白地ぬき・余白トリム ${url.trim.join(",")}）`]);
}

/* ---------- 3. キービジュアルと賞状：縮めるだけ ---------- */
for (const j of [
  { src: "keyvisual.png",   out: "keyvisual.webp",   w: 480,  q: 0.74 },
  { src: "certificate.png", out: "certificate.webp", w: 900,  q: 0.80 }
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
  report.push([j.out, await save(j.out, url.url), `${dim.w}x${dim.h} → ${url.w}x${url.h}`]);
}

await b.close();
server.close();

let total = 0;
for (const [name, bytes, note] of report){
  total += bytes;
  console.log(`${name.padEnd(18)} ${String(Math.round(bytes/1024)).padStart(5)}KB  ${note}`);
}
console.log(`${"".padEnd(18)} ${String(Math.round(total/1024)).padStart(5)}KB  合計 ${report.length}枚`);
console.log("→ " + path.relative(ROOT, OUT));
