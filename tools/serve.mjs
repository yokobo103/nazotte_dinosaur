// app/ を配るだけの小さなサーバ。
// ポートは PORT 環境変数（無ければ 8143）。python -m http.server は
// ポートを引数でしか受け取れず、取り合いになったときに逃げられないので置きかえた。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "app");
const PORT = Number(process.env.PORT || 8143);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",   // ESモジュールなので必須
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png":  "image/png",
  ".webp": "image/webp",
  ".jpg":  "image/jpeg",
  ".svg":  "image/svg+xml",
  ".mp3":  "audio/mpeg",
  ".woff2":"font/woff2"
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT)){ res.writeHead(403).end("no"); return; }

  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("404"); return; }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache"
    }).end(data);
  });
}).listen(PORT, () => console.log(`なぞりん: http://localhost:${PORT}/`));
