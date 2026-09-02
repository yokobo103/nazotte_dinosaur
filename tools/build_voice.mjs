// 読み上げの声を焼く。
//
// 声は **VOICEVOX:春歌ナナ（ノーマル・styleId 54）**。
// CM動画作成パイプライン（20260702）でニャビットに使っている声と同じ＝
// ラボの中でキャラの声がそろう。Dr.よこぼは雀松朱司(52)だが、
// このアプリで話すのはニャビットだけなので使っていない。
//
// 元になる文は app/js/words.js と app/js/bones.js から取る。台本は書かない。
// 出力: app/assets/voice.opus（全部つないだ1本）と app/assets/voice.json（どこに何があるか）
//
// 前もって VOICEVOX エンジンを起こしておく:
//   "%LOCALAPPDATA%/Programs/VOICEVOX/vv-engine/run.exe" --host 127.0.0.1 --port 50021
// 使い方: node tools/build_voice.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const WORK = path.join(ROOT, "work", "voice");
const OUT  = path.join(ROOT, "app", "assets");
fs.mkdirSync(WORK, { recursive: true });

const BASE = process.env.VOICEVOX_URL || "http://127.0.0.1:50021";
const SPEAKER = 54;                     // 春歌ナナ ノーマル ＝ ニャビット
const CREDIT = "VOICEVOX:春歌ナナ";
// CMは 1.2〜1.25倍で流していくが、こちらは字を教える場面なので少しゆっくり。
// intonationScale は CM と同じ 1.2（平板だと機械音声に戻ってしまう）
const PARAMS = { speedScale: 1.05, intonationScale: 1.2, pitchScale: 0.0 };
const GAP = 0.12;                        // つなぎ目に入れる無音（秒）

const { WORDS, SETS, readingOf } = await import(pathToFileURL(path.join(ROOT, "app/js/words.js")).href);
const B = await import(pathToFileURL(path.join(ROOT, "app/js/bones.js")).href);

/* ---------- 何を焼くか ---------- */
const lines = [];                        // { id, text }
const add = (id, text) => { if (!lines.some(l => l.id === id)) lines.push({ id, text }); };

// 1. 字（178）。いまアプリが読んでいる文そのまま（「あ、ありの あ」）
for (const kana of ["hira", "kata"])
  for (const set of Object.values(SETS[kana]))
    for (const ch of set.flat())
      if (ch) add("c:" + ch, readingOf(ch));

// 2. ほめことば。いまは字で出しているだけで、声にはなっていない。
//    まだ字が読めない子には、声のほうが速い
add("p:3", "かんぺき！");
add("p:2", "じょうず！");
add("p:1", "いいね！");

// 3. やりなおしの理由。これも字だけだった（●は読めないので「まる」に開く）
add("w:reverse", "はんたいから かいてるよ");
add("w:start",   "はじめの まるから なぞろう");
add("w:short",   "さいごまで なぞろう");
add("w:off",     "せんの うえを なぞろう");
add("w:shape",   "かたちが ちがうみたい");
add("w:again",   "もういちど");

// 4. ごほうび。
//    ホネが出たときは **正体を言わない**（2026-09-02）ので、恐竜×部位の30通りではなく
//    部位の呼び名ごとの8通りで足りる。特注の呼び名（せなかの いた など）はヒントとして残す。
//    完成した瞬間だけ名前を出す。
add("s:set", "5もじ かけたね");
for (const d of B.DINOS){
  for (const part of B.ALL_PARTS) add(`f:${B.partName(d, part)}`, B.foundText(d, part));
  add(`r:${d.id}`, `${d.name}の ホネが そろった`);
}
add("s:complete", "ずかん コンプリート");

console.log(`${lines.length}本 焼きます（声: ${CREDIT} / speaker ${SPEAKER}）`);

/* ---------- VOICEVOX で1本ずつ ---------- */
async function synth(text){
  const q = await fetch(`${BASE}/audio_query?speaker=${SPEAKER}&text=${encodeURIComponent(text)}`,
                        { method: "POST" });
  if (!q.ok) throw new Error("audio_query 失敗: " + text);
  const query = await q.json();
  Object.assign(query, PARAMS);
  // ことばの無い字（を・づ・ぢ・ゔ）は1拍しかなく、0.26秒で終わってしまう。
  // 聞き取れるように、短い文だけゆっくりにする
  if (text.length <= 3) query.speedScale = 0.85;
  query.prePhonemeLength = 0.02;         // 前後の無音は自分で詰める
  query.postPhonemeLength = 0.02;
  const r = await fetch(`${BASE}/synthesis?speaker=${SPEAKER}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(query)
  });
  if (!r.ok) throw new Error("synthesis 失敗: " + text);
  return Buffer.from(await r.arrayBuffer());
}

const safe = (id) => id.replace(/[^a-zA-Z0-9]/g, c => "_" + c.codePointAt(0).toString(36));
let n = 0;
for (const l of lines){
  const file = path.join(WORK, safe(l.id) + ".wav");
  if (!fs.existsSync(file)) fs.writeFileSync(file, await synth(l.text));
  l.file = file;
  if (++n % 25 === 0) console.log(`  ${n}/${lines.length}`);
}

/* ---------- 焼き損じ（無音）を見つける ----------
   VOICEVOXがたまに音の無いWAVを返す。長さは普通なので、あとから気づけない。
   WAV(24kHz/16bit/mono)のPCMをそのまま読んで、いちばん大きい値を見る。 */
function dataChunk(b){
  let at = 12;
  while (at + 8 <= b.length){
    const id = b.toString("ascii", at, at + 4), len = b.readUInt32LE(at + 4);
    if (id === "data") return { at: at + 8, end: Math.min(b.length, at + 8 + len) };
    at += 8 + len + (len & 1);
  }
  return null;
}
function peak(file){
  const b = fs.readFileSync(file), d = dataChunk(b);
  if (!d) return 0;
  let m = 0;
  for (let i = d.at; i + 1 < d.end; i += 2) m = Math.max(m, Math.abs(b.readInt16LE(i)));
  return m / 32768;
}
/** 大きさをそろえて写す。ことばの無い「を」「づ」だけ小さく聞こえていた
 *  （実測 0.06〜0.10 に対して、ことばつきは 0.34 前後）。
 *  上げすぎるとノイズも上がるので、かける倍率は8倍まで。 */
function copyLeveled(src, dst, target = 0.72){
  const b = Buffer.from(fs.readFileSync(src)), d = dataChunk(b);
  const p0 = peak(src);
  const gain = (!d || p0 < 0.005) ? 1 : Math.min(8, target / p0);
  if (gain > 1.02 && d){
    for (let i = d.at; i + 1 < d.end; i += 2){
      const v = Math.max(-32768, Math.min(32767, Math.round(b.readInt16LE(i) * gain)));
      b.writeInt16LE(v, i);
    }
  }
  fs.writeFileSync(dst, b);
  return gain;
}
const silent = lines.filter(l => peak(l.file) < 0.02).map(l => l.id);
if (silent.length){
  console.log(`⚠ 音が入っていない ${silent.length}本: ` + silent.slice(0, 8).join(" / "));
  console.log("  work/voice/ の該当ファイルを消して焼きなおしてください");
}

/* ---------- 長さを測って、1本につなぐ ---------- */
const dur = (f) => {
  const out = execFileSync("ffprobe", ["-v","error","-show_entries","format=duration",
                                       "-of","default=nw=1:nk=1", f], { encoding:"utf8" });
  return parseFloat(out.trim());
};
for (const l of lines) l.dur = dur(l.file);

// ffmpeg の concat は、リストに日本語のパスが入ると Windows で読めないことがある
// （このリポジトリのフォルダ名が日本語）。ASCIIだけの作業場に写してから繋ぐ。
const STAGE = path.join(os.tmpdir(), "nazorin_voice");
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
const silence = path.join(STAGE, "_gap.wav");
execFileSync("ffmpeg", ["-y","-v","error","-f","lavfi","-i",
                        `anullsrc=r=24000:cl=mono:d=${GAP}`, silence]);
const parts = [];
let at = 0;
let lifted = 0;
lines.forEach((l, i) => {
  const copy = path.join(STAGE, String(i).padStart(4, "0") + ".wav");
  if (copyLeveled(l.file, copy) > 1.02) lifted++;
  parts.push(copy); l.start = at; at += l.dur;
  parts.push(silence); at += GAP;
});
console.log(`大きさをそろえた: ${lifted}/${lines.length}本`);
const listFile = path.join(STAGE, "_concat.txt");
fs.writeFileSync(listFile,
  parts.map(f => `file '${f.split(path.sep).join("/")}'`).join(String.fromCharCode(10)), "utf8");

// 2つの形式で出す。
//  voice.opus … 小さい（771KB）。ふだんはこちら。先取りキャッシュにも入れる
//  voice.m4a  … 大きい（1378KB）が、decodeAudioData がどの端末でも通る。
//               古い iOS Safari は Opus を decodeAudioData で読めないことがあるので、
//               読めなかったときだけ落ちてくる。先取りはしない（使う人だけが落とす）
const opus = path.join(OUT, "voice.opus");
execFileSync("ffmpeg", ["-y","-v","error","-f","concat","-safe","0","-i",listFile,
                        "-ac","1","-ar","24000","-c:a","libopus","-b:a","20k",
                        "-application","voip","-vbr","on", opus]);
const m4a = path.join(OUT, "voice.m4a");
execFileSync("ffmpeg", ["-y","-v","error","-f","concat","-safe","0","-i",listFile,
                        "-ac","1","-ar","24000","-c:a","aac","-b:a","32k", m4a]);

const index = {
  credit: CREDIT,
  speaker: SPEAKER,
  gap: GAP,
  total: +at.toFixed(3),
  silent,                                // 音が入っていなかったもの（検査が見る）
  clips: Object.fromEntries(lines.map(l => [l.id, [ +l.start.toFixed(3), +l.dur.toFixed(3) ]]))
};
fs.writeFileSync(path.join(OUT, "voice.json"), JSON.stringify(index));

const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log(`voice.opus  ${kb(opus)}KB  ${at.toFixed(1)}秒  ${lines.length}本（ふだんはこちら）`);
console.log(`voice.m4a   ${kb(m4a)}KB  Opusが読めない端末むけ（先取りしない）`);
console.log(`voice.json  ${kb(path.join(OUT, "voice.json"))}KB`);
console.log(`クレジット: ${CREDIT}`);
