// 届いた絵の透明余白を詰めて、枠いっぱいに置き直す。
// 正方形キャンバスに横長の絵を入れると縦が3割しか使えず、
// 表示サイズを指定しても実際にはその半分の大きさでしか出ない。
//
// 元の絵は work/art-src/ に退避してから、app/assets/bones/ を置きかえる。
// 使い方: node tools/fit_art.mjs [余白%]   （既定 8）
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR  = path.join(HERE, "..", "app", "assets", "bones");
const SRC  = path.join(HERE, "..", "work", "art-src");
fs.mkdirSync(SRC, { recursive: true });

const MARGIN = Number(process.argv[2] || 8) / 100;
const SIZE = 512;
const URL = process.env.NAZORIN_URL || "http://localhost:8143/";

const files = fs.readdirSync(DIR).filter(f => f.endsWith(".png"));
if (!files.length){ console.log("絵がありません"); process.exit(0); }

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle0" });

for (const f of files){
  const src = path.join(DIR, f);
  const keep = path.join(SRC, f);
  if (!fs.existsSync(keep)) fs.copyFileSync(src, keep);   // 元は1度だけ退避

  const res = await page.evaluate(async (name, size, margin) => {
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = "/assets/bones/" + name + "?raw=" + Math.random(); });
    const w = img.naturalWidth, h = img.naturalHeight;
    const m = document.createElement("canvas"); m.width = w; m.height = h;
    const mc = m.getContext("2d"); mc.drawImage(img, 0, 0);
    const d = mc.getImageData(0, 0, w, h).data;

    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      if (d[(y*w + x)*4 + 3] > 16){ if (x<x0)x0=x; if (x>x1)x1=x; if (y<y0)y0=y; if (y>y1)y1=y; }
    }
    if (x1 < 0) return null;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;

    // 全身骨格だけは正方形にしない。横長の絵を正方形に入れると高さが4割しか使えず、
    // 表示サイズを指定しても実際にはその半分でしか出ない
    const wide = name.startsWith("full_");
    const outW = size;
    const outH = wide ? Math.round(size * (bh / bw)) : size;
    const out = document.createElement("canvas"); out.width = outW; out.height = outH;
    const oc = out.getContext("2d");
    oc.imageSmoothingQuality = "high";
    const k = Math.min(outW * (1 - margin*2) / bw, outH * (1 - margin*2) / bh);
    const dw = bw * k, dh = bh * k;
    oc.drawImage(img, x0, y0, bw, bh, (outW - dw)/2, (outH - dh)/2, dw, dh);
    return { url: out.toDataURL("image/png"),
             before: `幅${(bw/w*100).toFixed(0)}% 高さ${(bh/h*100).toFixed(0)}%`,
             after:  `${outW}x${outH} の中で 幅${(dw/outW*100).toFixed(0)}% 高さ${(dh/outH*100).toFixed(0)}%` };
  }, f, SIZE, MARGIN);

  if (!res){ console.log(`${f}: 中身が空`); continue; }
  fs.writeFileSync(src, Buffer.from(res.url.split(",")[1], "base64"));
  console.log(`${f.padEnd(24)} ${res.before}  →  ${res.after}`);
}

await browser.close();
console.log(`\n元の絵は ${path.relative(process.cwd(), SRC)} に退避しました`);
