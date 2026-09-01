// ホーム画面に置くためのアイコンを作る。SVGを1枚書いて、ヘッドレスChromeでPNGに焼く。
// （画像ツールを入れなくても、すでにあるpuppeteerで足りる）
// 使い方: node tools/make_icons.mjs
import puppeteer from "../../20260809_ピタゴラン試作/node_modules/puppeteer/lib/puppeteer/puppeteer.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "app", "icons");
fs.mkdirSync(OUT, { recursive: true });

// maskable 用に、絵は中央の安全圏に収める。
// 顔は make_chars.mjs が焼いた ny_idle.webp（丸抜き透過）を data URI で埋める。
const FACE = fs.readFileSync(path.join(HERE, "..", "app", "assets", "chars", "ny_idle.webp"))
               .toString("base64");
const svg = (size, bleed) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${bleed ? 0 : 112}" fill="#ff9f43"/>
  <circle cx="256" cy="256" r="176" fill="#fffdf8"/>
  <image href="data:image/webp;base64,${FACE}" x="96" y="96" width="320" height="320"/>
</svg>`;

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();

const jobs = [
  { file: "icon-192.png",         size: 192, bleed: false },
  { file: "icon-512.png",         size: 512, bleed: false },
  { file: "icon-maskable.png",    size: 512, bleed: true  },
  { file: "apple-touch-icon.png", size: 180, bleed: true  }
];

for (const j of jobs) {
  await page.setViewport({ width: j.size, height: j.size, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}</style>${svg(j.size, j.bleed)}`,
    { waitUntil: "load" });
  await new Promise(r => setTimeout(r, 120));   // フォントの反映待ち
  await page.screenshot({ path: path.join(OUT, j.file), omitBackground: !j.bleed });
  console.log(`${j.file}  ${j.size}x${j.size}`);
}

await browser.close();
console.log(`→ ${path.relative(process.cwd(), OUT)}`);
