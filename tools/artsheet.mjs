// ホネの絵の比較シート。
// 届いた絵を「実際に表示される大きさ」で「実際の背景の上に」並べて撮る。
// 拡大して眺めると必ず判断を外すので、実寸で見る。
// 使い方: node tools/artsheet.mjs
import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "work", "qa-art");
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.NAZORIN_URL || "http://localhost:8143/";

// アプリの中で実際に使われている表示サイズ
const SIZES = [
  { px: 54,  where: "なぞり画面のポップ" },
  { px: 62,  where: "ほりだしの台" },
  { px: 108, where: "ずかんのカード" },
  { px: 190, where: "かんせい画面" }
];

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: "networkidle0" });

const keys = await page.evaluate(async () => {
  const m = await import("/assets/manifest.js");
  return Object.entries(m.ART).filter(([, v]) => v).map(([k]) => k);
});
console.log("本番の絵が入っているキー:", keys.join(", ") || "なし");
if (!keys.length){ await browser.close(); process.exit(0); }

await page.evaluate(async (keys, SIZES) => {
  const art = await import("/js/boneart.js");
  const m   = await import("/assets/manifest.js");
  document.body.innerHTML = "";
  document.body.style.cssText =
    "background:#fff6e9;font-family:'Hiragino Maru Gothic ProN','Yu Gothic UI',Meiryo,sans-serif;" +
    "color:#4a3b2a;padding:18px;margin:0";

  const h = document.createElement("h1");
  h.textContent = "ホネの絵：本番 と 仮 を、実際の大きさで";
  h.style.cssText = "font-size:18px;margin:0 0 4px";
  document.body.appendChild(h);
  const note = document.createElement("p");
  note.textContent = "上＝届いた絵 / 下＝仮の骨。数字は画面での表示サイズ（CSSピクセル）。背景は本番と同じ色。";
  note.style.cssText = "font-size:11px;color:#a3937c;margin:0 0 14px";
  document.body.appendChild(note);

  for (const key of keys){
    const card = document.createElement("section");
    card.style.cssText = "background:#fffdf8;border-radius:18px;padding:12px 14px;margin-bottom:12px;box-shadow:0 3px 0 #efe2cd";
    const t = document.createElement("div");
    t.textContent = key + "  （" + m.ART[key] + "）";
    t.style.cssText = "font-size:12px;color:#a3937c;margin-bottom:8px";
    card.appendChild(t);

    for (const label of ["本番", "仮"]){
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:flex-end;gap:18px;margin-bottom:10px";
      const tag = document.createElement("span");
      tag.textContent = label;
      tag.style.cssText = "font-size:11px;width:26px;color:" + (label === "本番" ? "#ff9f43" : "#a3937c");
      row.appendChild(tag);

      for (const s of SIZES){
        const cell = document.createElement("div");
        cell.style.cssText = "text-align:center";
        const box = document.createElement("div");
        box.style.cssText = `width:${s.px}px;height:${s.px}px;display:flex;align-items:center;justify-content:center`;
        if (label === "本番"){
          const img = new Image();
          img.src = "/assets/bones/" + m.ART[key];
          img.style.cssText = "width:100%;height:100%;object-fit:contain;display:block";
          box.appendChild(img);
        } else {
          box.appendChild(art.drawBone(key, s.px, key.startsWith("full_") ? "ステゴサウルス" : ""));
        }
        cell.appendChild(box);
        const cap = document.createElement("div");
        cap.textContent = s.px + "px";
        cap.style.cssText = "font-size:9px;color:#c9bda9;margin-top:3px";
        cell.appendChild(cap);
        row.appendChild(cell);
      }
      card.appendChild(row);
    }
    const where = document.createElement("div");
    where.textContent = SIZES.map(s => `${s.px}=${s.where}`).join(" / ");
    where.style.cssText = "font-size:9px;color:#c9bda9";
    card.appendChild(where);
    document.body.appendChild(card);
  }
}, keys, SIZES);

await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: path.join(OUT, "compare.png"), fullPage: true });
console.log("→ " + path.relative(process.cwd(), path.join(OUT, "compare.png")));

await browser.close();
