// 自動生成。手で編集しない（作り直し: node tools/build_sw.mjs）
// 電波が無くても開けるように、アプリ一式を先に取っておく。
const VERSION = "58af8a011b";
const CACHE = "nazorin-" + VERSION;

const FILES = [
  "./",
  "assets/bones/anky_tail.webp",
  "assets/bones/biped_body.webp",
  "assets/bones/biped_fore.webp",
  "assets/bones/biped_hind.webp",
  "assets/bones/biped_tail.webp",
  "assets/bones/full_ankylosaurus.webp",
  "assets/bones/full_brachiosaurus.webp",
  "assets/bones/full_iguanodon.webp",
  "assets/bones/full_stegosaurus.webp",
  "assets/bones/full_triceratops.webp",
  "assets/bones/full_tyrannosaurus.webp",
  "assets/bones/head_ankylosaurus.webp",
  "assets/bones/head_brachiosaurus.webp",
  "assets/bones/head_iguanodon.webp",
  "assets/bones/head_stegosaurus.webp",
  "assets/bones/head_triceratops.webp",
  "assets/bones/head_tyrannosaurus.webp",
  "assets/bones/iguano_fore.webp",
  "assets/bones/metadata.json",
  "assets/bones/quad_body.webp",
  "assets/bones/quad_fore.webp",
  "assets/bones/quad_hind.webp",
  "assets/bones/quad_tail.webp",
  "assets/bones/stego_body.webp",
  "assets/chars/certificate.webp",
  "assets/chars/keyvisual.webp",
  "assets/chars/logo_training.webp",
  "assets/chars/logo_zukan.webp",
  "assets/chars/logo.webp",
  "assets/chars/ny_good.webp",
  "assets/chars/ny_great.webp",
  "assets/chars/ny_hmm.webp",
  "assets/chars/ny_idle.webp",
  "assets/chars/ny_love.webp",
  "assets/chars/ny_oops.webp",
  "assets/chars/yk_cheer.webp",
  "assets/chars/yk_dig.webp",
  "assets/chars/yk_wave.webp",
  "assets/dinosaurs/ankylosaurus_restoration.webp",
  "assets/dinosaurs/brachiosaurus_restoration.webp",
  "assets/dinosaurs/iguanodon_restoration.webp",
  "assets/dinosaurs/metadata.json",
  "assets/dinosaurs/stegosaurus_restoration.webp",
  "assets/dinosaurs/triceratops_restoration.webp",
  "assets/dinosaurs/tyrannosaurus_restoration.webp",
  "assets/manifest.js",
  "assets/voice.json",
  "assets/voice.opus",
  "css/style.css",
  "data/kana.js",
  "index.html",
  "js/audio.js",
  "js/boneart.js",
  "js/bones.js",
  "js/main.js",
  "js/tracer.js",
  "js/words.js",
  "manifest.webmanifest"
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
