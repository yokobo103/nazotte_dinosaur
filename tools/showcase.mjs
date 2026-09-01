// 見たい状態を作って実画面を撮る。
// 検査のついでに撮れる絵は状態が偶然まかせなので、こちらで作る。
// 使い方: node tools/showcase.mjs
import puppeteer from "puppeteer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "work", "qa-art");
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.NAZORIN_URL || "http://localhost:8143/";
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(URL, { waitUntil: "networkidle0" });
await sleep(2200);   // はじまりの絵が引くまで待つ

const state = () => p.evaluate(() => {
  const N = window.__nazorin, B = N.bones;
  N.dig.slots = {
    stegosaurus:   ["head","body","forelimb","hindlimb","tail"],
    ankylosaurus:  ["body","forelimb","hindlimb","tail"],
    brachiosaurus: ["body","tail"],
    triceratops:   ["hindlimb"],
    iguanodon:     []
  };
  N.dig.done = ["stegosaurus"];
  B.saveDig(N.dig);
  N.stamps["あ"] = { n: 3, best: 92 };
  N.stamps["い"] = { n: 1, best: 71 };
  N.stamps["う"] = { n: 1, best: 63 };
  N.renderGrid();
});

// ホーム（れんしゅう）
await state();
await sleep(300);
await p.screenshot({ path: path.join(OUT, "home.png") });

// きょうりゅう ずかん
await p.evaluate(() => document.querySelector('.nav-btn[data-go="dig"]').click());
await sleep(400);
await p.screenshot({ path: path.join(OUT, "zukan.png"), fullPage: true });

// トリケラトプスの6点セット（共通4パーツ＋固有頭＋完成全身）の見え方
await p.evaluate(() => {
  const N = window.__nazorin, B = N.bones;
  N.dig.slots.triceratops = ["head","body","forelimb","hindlimb","tail"];
  N.dig.done = ["triceratops"];
  B.saveDig(N.dig);
  N.renderDig();
  document.querySelector("#screen-dig").scrollTop = 0;
});
await sleep(400);
await p.screenshot({ path: path.join(OUT, "triceratops_complete.png"), fullPage: true });

// れんしゅう中（何もんめ・何かいめ が出ている）
await p.evaluate(() => {
  const N = window.__nazorin;
  N.show(N.el.home);
  N.startSession();
});
await sleep(500);
await p.screenshot({ path: path.join(OUT, "session.png") });

// ホネをもらった瞬間
await p.evaluate(() => {
  const N = window.__nazorin;
  N.popBone(N.bones.DINOS.find(d => d.id === "stegosaurus"), "body");
});
await sleep(500);
await p.screenshot({ path: path.join(OUT, "pop_named.png") });

console.log("→ " + path.relative(process.cwd(), OUT));
await b.close();
