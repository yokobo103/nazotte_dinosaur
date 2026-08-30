// オフライン用の Service Worker を作る。
// キャッシュする一覧を手で書くと必ず腐るので、app/ を歩いて自動で書き出す。
// 中身が1バイトでも変われば版が変わり、次に開いたときに入れかわる。
// 使い方: node tools/build_sw.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP  = path.join(HERE, "..", "app");
const OUT  = path.join(APP, "sw.js");

// 配らないもの：自分自身と、開発中の下書きページ
const SKIP = new Set(["sw.js"]);
const SKIP_RE = /-complete\.html$/;

// テキストは改行をそろえてから測る。Windowsで作ると CRLF、CIは LF で
// チェックアウトされるので、そろえないと同じ中身でも版が食い違う
const TEXT = /\.(js|mjs|css|html|json|webmanifest|svg|txt|md)$/i;
function read(full){
  const raw = fs.readFileSync(full);
  const CR = String.fromCharCode(13);
  const buf = TEXT.test(full)
    ? Buffer.from(raw.toString("utf8").split(CR).join(""), "utf8")
    : raw;
  return { size: buf.length, hash: crypto.createHash("sha1").update(buf).digest() };
}

export function scan(){
const files = [];
(function walk(dir){
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))){
    const full = path.join(dir, e.name);
    if (e.isDirectory()){ walk(full); continue; }
    const rel = path.relative(APP, full).split(path.sep).join("/");
    if (SKIP.has(rel) || SKIP_RE.test(rel)) continue;
    files.push({ rel, ...read(full) });
  }
})(APP);

// 版＝中身から作る。ファイル名・大きさ・中身のハッシュをまとめて短くする
const h = crypto.createHash("sha1");
for (const f of files){
  h.update(f.rel).update(String(f.size)).update(f.hash);
}
return { files, version: h.digest("hex").slice(0, 10),
         total: files.reduce((n, f) => n + f.size, 0) };
}

/** いま app/sw.js に書かれている版 */
export function writtenVersion(){
  try { return (/const VERSION = "([0-9a-f]+)"/.exec(fs.readFileSync(OUT, "utf8")) || [])[1] || null; }
  catch { return null; }
}

function build(){
const { files, version: VERSION, total } = scan();

const list = files.map(f => `  "${f.rel}"`).join(",\n");
const sw = `// 自動生成。手で編集しない（作り直し: node tools/build_sw.mjs）
// 電波が無くても開けるように、アプリ一式を先に取っておく。
const VERSION = "${VERSION}";
const CACHE = "nazorin-" + VERSION;

const FILES = [
  "./",
${list}
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 1つ失敗しても全部が入らないのは困るので、1つずつ入れる
    await Promise.all(FILES.map(f => c.add(f).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) {
      // 出しつつ、裏で新しいものを取りにいく
      e.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) (await caches.open(CACHE)).put(req, fresh.clone());
        } catch {}
      })());
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    } catch {
      // 画面の遷移はぜんぶ index.html で受ける
      if (req.mode === "navigate") {
        const home = await caches.match("./index.html") || await caches.match("./");
        if (home) return home;
      }
      throw new Error("offline");
    }
  })());
});
`;

fs.writeFileSync(OUT, sw);
console.log(`sw.js を作りました  版 ${VERSION}  ${files.length}ファイル  ${(total/1024).toFixed(0)}KB`);
}

// 直接よばれたときだけ書き出す（検査からは scan/writtenVersion だけ使う）
if (process.argv[1] && process.argv[1].endsWith("build_sw.mjs")) build();
