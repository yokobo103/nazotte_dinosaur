import { KANA } from "../data/kana.js";
import { WORDS, SETS, kanaOf, readingOf } from "./words.js";
import { Tracer, starsOf } from "./tracer.js";
import * as sfx from "./audio.js";
import * as B from "./bones.js";
import { boneElement, allPlaceholder } from "./boneart.js";

const $ = (s)=>document.querySelector(s);
const KEY = "nazorin.stamps.v1";
const HAND_KEY = "nazorin.handwriting.v1";
const UI_KEY = "nazorin.ui.v1";

/* れんしゅうの単位。1文字を REPS 回書いて、SET 文字ぶんで ホネが1個 */
const REPS = 3;
const SET  = 5;

const el = {
  home:    $("#screen-home"),
  trace:   $("#screen-trace"),
  digScr:  $("#screen-dig"),
  dinoScr: $("#screen-dino"),
  grid:    $("#grid"),
  tabs:    $("#tabs"),
  prog:    $("#progress"),
  word:    $("#word"),
  sess:    $("#sess"),
  praise:  $("#praise"),
  canvas:  $("#canvas"),
  stage:   document.querySelector(".stage"),
  conf:    $("#confetti"),
  digWrap: $("#dig"),
  digTotal:$("#dig-total"),
  digNote: $("#dig-note"),
  bonePop: $("#bone-pop"),
  reward:  $("#reward"),
  startSub:$("#start-sub"),
  missionMode:$("#mission-mode"),
  homeBones:$("#home-bones"),
  rewardHand:$("#reward-handwriting"),
  rewardAchievements:$("#reward-achievements")
};

const stamps = loadStamps();
const dig    = B.loadDig();
const handwriting = loadHandwriting();
const uiPrefs = loadUiPrefs();
let curKana = uiPrefs.kana;
let curSet  = uiPrefs.set;
let curChar = null;
let session = null;      // { chars:[], i, rep } れんしゅう中だけ入る

const tracer = new Tracer(el.canvas, $("#measure-path"));

/* ================= 記録 ================= */
// { "あ": { n: なぞった回数, best: いちばん良かった点数 } }
function loadStamps(){
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = (typeof v === "number") ? { n: v, best: 0 } : v;
  return out;
}
function saveStamps(){
  try { localStorage.setItem(KEY, JSON.stringify(stamps)); } catch {}
}

function loadUiPrefs(){
  try {
    const raw = JSON.parse(localStorage.getItem(UI_KEY)) || {};
    return {
      kana: raw.kana === "kata" ? "kata" : "hira",
      set: ["seion", "dakuon", "small"].includes(raw.set) ? raw.set : "seion"
    };
  } catch { return { kana: "hira", set: "seion" }; }
}
function saveUiPrefs(){
  try { localStorage.setItem(UI_KEY, JSON.stringify({ kana: curKana, set: curSet })); } catch {}
}

/* 完成した筆跡はCanvas画像ではなく109座標系の点列で保存する。
   将来、図鑑・新旧比較・練習記録で別サイズに描き直せる。 */
function loadHandwriting(){
  try {
    const raw = JSON.parse(localStorage.getItem(HAND_KEY));
    return raw && Array.isArray(raw.sessions) ? raw : { version: 1, sessions: [] };
  } catch { return { version: 1, sessions: [] }; }
}
function saveHandwriting(){
  // 1セッションは最後に書いた5字だけ。古い順に80件まで残し、容量超過時はさらに減らす。
  handwriting.sessions = handwriting.sessions.slice(-80);
  while (handwriting.sessions.length){
    try { localStorage.setItem(HAND_KEY, JSON.stringify(handwriting)); return; }
    catch { handwriting.sessions.shift(); }
  }
}
const got     = (ch)=> !!stamps[ch];
const bestOf  = (ch)=> (stamps[ch] && stamps[ch].best) || 0;
const starStr = (ch)=> got(ch) ? "★".repeat(starsOf(bestOf(ch) || 1)) : "";

/* ================= 画面きりかえ ================= */
function show(screen){
  for (const s of [el.home, el.trace, el.digScr, el.dinoScr]) s.classList.toggle("is-on", s === screen);
}
document.addEventListener("click", (e)=>{
  const b = e.target.closest("[data-go]");
  if (!b) return;
  sfx.unlock(); sfx.pop();
  if (b.dataset.go === "dig"){ show(el.digScr); renderDig(); }
  else { show(el.home); renderGrid(); }
});

/* ================= 50音表 ================= */
function renderGrid(){
  [...$("#kana-switch").children].forEach(x=>x.classList.toggle("is-on", x.dataset.kana === curKana));
  [...el.tabs.children].forEach(x=>x.classList.toggle("is-on", x.dataset.set === curSet));
  el.grid.innerHTML = "";
  for (const ch of SETS[curKana][curSet]){
    if (!ch){
      const b = document.createElement("div");
      b.className = "cell blank";
      el.grid.appendChild(b);
      continue;
    }
    const b = document.createElement("button");
    b.className = "cell" + (got(ch) ? " done" : "");
    b.textContent = ch;
    if (got(ch)) b.dataset.stars = starStr(ch);
    b.setAttribute("aria-label", readingOf(ch));
    // 表から選ぶ通常練習も、同じ字を3回書いたら自動で次の字へ進む。
    // ホネだけは「たんけんに でる」の5文字セットで受け取る。
    b.addEventListener("click", ()=>{ sfx.unlock(); sfx.pop(); startPractice(ch); });
    el.grid.appendChild(b);
  }
  const list = SETS[curKana][curSet].filter(Boolean);
  el.prog.textContent = `⭐ ${list.filter(got).length} / ${list.length}`;
  const kanaLabel = curKana === "kata" ? "カタカナ" : "ひらがな";
  const setLabel = { seion:"きほん", dakuon:"だくおん", small:"ちいさいじ" }[curSet];
  el.missionMode.textContent = `${kanaLabel}の はっくつミッション`;
  el.startSub.textContent = `${kanaLabel}・${setLabel}を ${SET}もじ かくと ホネが 1こ！`;
  const bones = B.boneCount(dig);
  el.homeBones.textContent = bones >= B.TOTAL_BONES()
    ? "ぜんぶの ホネを はっくつしたよ！"
    : `はっくつした ホネ　${bones} / ${B.TOTAL_BONES()}`;
}

el.tabs.addEventListener("click", (e)=>{
  const t = e.target.closest(".tab");
  if (!t) return;
  sfx.unlock(); sfx.pop();
  [...el.tabs.children].forEach(x=>x.classList.toggle("is-on", x === t));
  curSet = t.dataset.set;
  saveUiPrefs();
  renderGrid();
});

$("#kana-switch").addEventListener("click", (e)=>{
  const t = e.target.closest(".seg-btn");
  if (!t) return;
  sfx.unlock(); sfx.pop();
  [...t.parentNode.children].forEach(x=>x.classList.toggle("is-on", x === t));
  curKana = t.dataset.kana;
  saveUiPrefs();
  renderGrid();
});

$("#btn-reset").addEventListener("click", ()=>{
  if (!confirm("あつめた ホネと ⭐を ぜんぶ けしますか？")) return;
  for (const k of Object.keys(stamps)) delete stamps[k];
  saveStamps();
  for (const d of B.DINOS) dig.slots[d.id] = [];
  dig.done.length = 0;
  B.saveDig(dig);
  handwriting.sessions.length = 0;
  try { localStorage.removeItem(HAND_KEY); } catch {}
  session = null;
  renderGrid();
});

/* ================= れんしゅう（セット） ================= */
/** 出す字を SET 文字えらぶ。
 *  まだ書いていない字 → ★の少ない字 → のこりをランダム。
 *  同じ字ばかり出ても飽きるので、種類はばらす。 */
function pickChars(){
  const pool = SETS[curKana][curSet].filter(Boolean);
  const fresh = pool.filter(c => !got(c));
  const weak  = pool.filter(c =>  got(c) && starsOf(bestOf(c) || 1) < 3);
  const rest  = pool.filter(c =>  got(c) && starsOf(bestOf(c) || 1) >= 3);
  const shuffle = (a)=> a.map(v=>[Math.random(), v]).sort((x,y)=>x[0]-y[0]).map(v=>v[1]);
  return [...shuffle(fresh), ...shuffle(weak), ...shuffle(rest)].slice(0, SET);
}

function startSession(){
  const chars = pickChars();
  if (!chars.length) return;
  // 開始時の文字種・分類を固定する。終了記録もこの値を使い、ひらがなとカタカナで同じルールにする。
  session = { mode: "mission", chars, i: 0, rep: 0, attempts: {}, kana: curKana, set: curSet };
  openChar(chars[0]);
}

/** 文字表から始める通常練習。選んだ字から表の順に、各字3回ずつ自動で進む。 */
function startPractice(ch){
  const list = SETS[curKana][curSet].filter(Boolean);
  const at = list.indexOf(ch);
  if (at < 0) return;
  const chars = [...list.slice(at), ...list.slice(0, at)];
  session = { mode: "practice", chars, i: 0, rep: 0, attempts: {}, kana: curKana, set: curSet };
  openChar(chars[0]);
}
$("#btn-start").addEventListener("click", ()=>{ sfx.unlock(); sfx.pop(); startSession(); });

function renderSess(){
  // れんしゅう中は「つぎ」を隠す。押すと書かずに飛ばせてしまう
  $("#btn-next").classList.toggle("is-hidden", !!session);
  if (!session){ el.sess.classList.remove("is-on"); el.sess.innerHTML = ""; return; }
  el.sess.classList.add("is-on");
  const left = REPS - session.rep;
  if (session.mode === "practice"){
    const next = session.chars[(session.i + 1) % session.chars.length];
    el.sess.dataset.mode = "practice";
    el.sess.innerHTML =
      `<span class="sess-label">れんしゅう ${session.rep + 1}/${REPS}</span>` +
      `<span class="dots" aria-label="${session.rep}/${REPS}かい"><b>${"●".repeat(session.rep)}</b>${"○".repeat(REPS - session.rep)}</span>` +
      `<span class="sess-rep">あと ${left}かい <small>つぎは ${next}</small></span>`;
    return;
  }
  el.sess.dataset.mode = "mission";
  el.sess.innerHTML =
    `<span class="sess-label">${session.i + 1}/${session.chars.length}<small>もじ</small></span>` +
    `<span class="bone-dots" aria-label="${session.i}/${session.chars.length}もじ かんせい"><b>${"🦴".repeat(session.i)}</b><span>${"🦴".repeat(session.chars.length - session.i)}</span></span>` +
    `<span class="sess-rep">あと ${left}かい<small>5もじで ホネ発見！</small></span>`;
}

/* ================= なぞり画面 ================= */
function openChar(ch){
  const data = KANA[ch];
  if (!data) return;
  curChar = ch;
  const w = WORDS[ch] || { w:"", e:"" };
  $("#trace-char").textContent = ch;
  $("#trace-emoji").textContent = w.e;
  $("#trace-word").textContent = w.w;
  show(el.trace);
  $("#btn-next").classList.remove("is-ready");
  renderSess();
  fit();
  tracer.load(data);
  say(ch);
}

function fit(){
  const pad = 8;
  const w = el.stage.clientWidth  - pad;
  const h = el.stage.clientHeight - pad;
  tracer.resize(Math.floor(Math.max(200, Math.min(w, h, 460))));
}
window.addEventListener("resize", ()=>{ if (el.trace.classList.contains("is-on")) fit(); });
window.addEventListener("orientationchange", ()=> setTimeout(fit, 250));

$("#btn-back").addEventListener("click", ()=>{ sfx.pop(); session = null; hidePraise(); show(el.home); renderGrid(); });
$("#btn-say").addEventListener("click", ()=>{ sfx.unlock(); say(curChar); });
$("#btn-demo").addEventListener("click", ()=>{ sfx.unlock(); hidePraise(); tracer.demo(); });
$("#btn-again").addEventListener("click", ()=>{
  sfx.unlock(); sfx.pop(); hidePraise();
  $("#btn-next").classList.remove("is-ready");
  tracer.reset();
});
$("#btn-next").addEventListener("click", ()=>{
  sfx.unlock(); sfx.pop(); hidePraise();
  if (session) return advance();
  const list = Object.values(SETS[kanaOf(curChar)]).flat().filter(Boolean);
  openChar(list[(list.indexOf(curChar) + 1) % list.length]);
});

/** れんしゅう中の進み方。同じ字を REPS 回 → つぎの字 → SET 文字で1セット */
function advance(){
  session.rep += 1;
  if (session.rep < REPS){ renderSess(); tracer.reset(); return; }
  session.rep = 0;
  if (session.mode === "practice"){
    session.i = (session.i + 1) % session.chars.length;
    openChar(session.chars[session.i]);
    return;
  }
  session.i += 1;
  if (session.i < session.chars.length){ openChar(session.chars[session.i]); return; }
  finishSession();
}

function finishSession(){
  const done = session.chars.slice();
  const sessionKana = session.kana;
  const sessionSet = session.set;
  const samples = done.map((ch)=>{
    const attempts = session.attempts[ch] || [];
    const last = attempts[attempts.length - 1] || {};
    return { ch, score: last.score || 0, strokes: last.strokes || [] };
  });
  session = null;
  renderSess();

  // ホネは「セットを1つ終えたら1個」。点数にも、なぞった回数にもよらない
  const pick = B.drawBone(dig);
  const bone = pick ? B.addBone(dig, pick) : null;

  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    completedAt: new Date().toISOString(),
    kana: sessionKana,
    set: sessionSet,
    characters: samples,
    reward: bone ? {
      dinosaurId: bone.dino.id,
      part: bone.part,
      artKey: B.artKey(bone.dino, bone.part),
      complete: bone.complete
    } : null
  };
  handwriting.sessions.push(record);
  saveHandwriting();

  // ① まず「自分で書いた！」を見せる。骨より先に、練習そのものを成果にする。
  queueReward({
    kind: "handwriting",
    kicker: "れんしゅう おつかれさま！",
    title: "じぶんで かいた 5もじ",
    handwriting: samples,
    achievements: [`${done.length}もじ かけた！`, bone ? "あたらしい ホネを はっくつした！" : "ぜんぶの ホネを はっくつした！"],
    sub: "ゆがんでいても だいじょうぶ。これは きみが かいた もじだよ。",
    button: bone ? "ホネを みる →" : "たんけんへ もどる",
    speak: `${done.length}もじ かけたね`
  });

  if (bone){
    queueReward({
      kind: "bone",
      kicker: "はっくつ せいこう！",
      title: `${bone.dino.name}の ホネ！`,
      art:   boneElement(B.artKey(bone.dino, bone.part), 150),
      achievements: [`${bone.dino.name}の ${B.partName(bone.dino, bone.part)}を みつけた！`, "はっくつずかんに きろくした！"],
      sub:   `これは ${bone.dino.name}の ホネ。あと ${B.ALL_PARTS.length - B.gotParts(dig, bone.dino).length}こで ぜんしんこっかく！`,
      button: bone.complete ? "ぜんしんを みる →" : "ずかんを みる →",
      go: "dig",
      speak: B.foundText(bone.dino, bone.part)
    });
    if (bone.complete){
      queueReward({
        kind: "reveal",
        kicker: "ぜんしんこっかく かんせい！",
        title: bone.dino.name + "！",
        art:   boneElement("full_" + bone.dino.id, 268, bone.dino.name),
        sub:   bone.dino.fact,
        achievements: ["5つの ホネが そろった！", `${bone.dino.name}の ぜんしんが できた！`],
        button: "ずかんで みる →",
        go: "dig",
        speak: `${bone.dino.name}の ホネが そろった`
      });
    }
  }
  setTimeout(flushRewards, 700);
}

/* ================= きょうりゅう ずかん ================= */
const SLOT_ORDER = ["head", "body", "forelimb", "hindlimb", "tail"];

function slotEl(dino, part, has){
  const slot = document.createElement("div");
  slot.className = "slot" + (has ? " has" : "");
  if (has) slot.appendChild(boneElement(B.artKey(dino, part), 54));
  else {
    const q = document.createElement("span");
    q.className = "slot-q"; q.textContent = "？";
    slot.appendChild(q);
  }
  const cap = document.createElement("span");
  cap.className = "slot-label";
  cap.textContent = has ? B.partName(dino, part) : B.PART_LABEL[part];   // 特別な名前は取ってから
  slot.appendChild(cap);
  return slot;
}

function completePartsEl(dino){
  const wrap = document.createElement("div");
  wrap.className = "complete-parts-wrap";
  const title = document.createElement("p");
  title.className = "complete-parts-title";
  title.textContent = "あつめた 5つの ホネ";
  wrap.appendChild(title);
  const row = document.createElement("div");
  row.className = "complete-parts";
  for (const part of SLOT_ORDER){
    const item = document.createElement("div");
    item.className = "complete-part";
    item.appendChild(boneElement(B.artKey(dino, part), 34));
    const label = document.createElement("span");
    label.textContent = B.partName(dino, part);
    item.appendChild(label);
    row.appendChild(item);
  }
  wrap.appendChild(row);
  return wrap;
}

function dinoCard(dino){
  const gotP = B.gotParts(dig, dino);
  const full = B.isComplete(dig, dino);
  const left = B.ALL_PARTS.length - gotP.length;

  const card = document.createElement("section");
  card.className = "page dino" + (full ? " full" : gotP.length ? "" : " untouched");

  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML =
    `<h3 class="page-title">${gotP.length ? dino.name : "？"}</h3>` +
    (left === 1 ? `<span class="ribbon">あと 1こ！</span>` :
     full        ? `<span class="ribbon">そろった 🎉</span>` : "") +
    `<span class="count">${gotP.length}/${B.ALL_PARTS.length}</span>`;
  card.appendChild(head);

  if (full){
    const art = document.createElement("div");
    art.className = "dino-full";
    art.appendChild(boneElement("full_" + dino.id, 300, dino.name));
    card.appendChild(art);
    card.appendChild(completePartsEl(dino));
    const note = document.createElement("p");
    note.className = "dino-reveal-note";
    note.textContent = dino.detail && dino.detail.restorationArt
      ? "ほねの すがた　｜　いきていた すがたも みられるよ！"
      : "ほねの すがた　｜　ふくげんイラストは じゅんびちゅう";
    card.appendChild(note);
    const open = document.createElement("button");
    open.className = "dino-open btn primary";
    open.textContent = "きょうりゅうを みる →";
    open.setAttribute("aria-label", `${dino.name}を くわしく みる`);
    open.addEventListener("click", ()=> openDinoDetail(dino.id));
    card.appendChild(open);
  } else if (gotP.length){
    const g = document.createElement("div");
    g.className = "dig-grid";
    for (const part of SLOT_ORDER) g.appendChild(slotEl(dino, part, gotP.includes(part)));
    card.appendChild(g);
  }
  return card;
}

function renderDig(){
  el.digWrap.innerHTML = "";
  const done = B.DINOS.filter(d => B.isComplete(dig, d));
  const rest = B.DINOS.filter(d => !B.isComplete(dig, d));
  for (const d of [...done, ...rest]) el.digWrap.appendChild(dinoCard(d));
  el.digTotal.textContent = `${B.boneCount(dig)} / ${B.TOTAL_BONES()}`;
  el.digNote.textContent = allPlaceholder() ? "※ ホネの えは まだ 仮のものです" : "";
}

/** なぞり画面で「ホネを みつけた！」を小さく出す */
let bonePopTimer = null;
function popBone(dino, part){
  el.bonePop.innerHTML = "";
  el.bonePop.appendChild(boneElement(B.artKey(dino, part), 54));
  const t = document.createElement("span");
  t.textContent = B.foundText(dino, part);
  el.bonePop.appendChild(t);
  el.bonePop.classList.add("is-on");
  clearTimeout(bonePopTimer);
  bonePopTimer = setTimeout(()=> el.bonePop.classList.remove("is-on"), 2300);
}

/* ================= 判定からのコールバック ================= */
const PRAISE = { 3: "かんぺき！", 2: "じょうず！", 1: "いいね！" };
const WHY = {
  reverse: "はんたいから かいてるよ",
  start:   "はじめの ●から なぞろう",
  short:   "さいごまで なぞろう",
  off:     "せんの うえを なぞろう"
};

tracer.on.tick = (p)=> sfx.tick(p);

tracer.on.strokeDone = (i, res)=>{
  sfx.strokeDone(i);
  const st = starsOf(res.value);
  flash(`${"★".repeat(st)}${"☆".repeat(3-st)} ${PRAISE[st]}`, 700, "top");
};

tracer.on.reject = (res)=>{
  sfx.retry();
  flash(WHY[res.reason] || "もういちど", 1100, "top");
};

tracer.on.charDone = (avg)=>{
  sfx.charDone();
  const ch  = curChar;
  if (session && session.mode === "mission"){
    if (!session.attempts[ch]) session.attempts[ch] = [];
    session.attempts[ch].push({ score: avg, strokes: tracer.snapshot() || [] });
  }
  const rec = stamps[ch] || { n: 0, best: 0 };
  rec.n += 1;
  rec.best = Math.max(rec.best, avg);   // ★は表示だけ。ホネには一切ひびかない
  stamps[ch] = rec;
  saveStamps();

  $("#btn-next").classList.add("is-ready");
  const st = starsOf(avg);
  setTimeout(()=>{
    flash(`${"★".repeat(st)}${"☆".repeat(3-st)}  ${PRAISE[st]}`, 1400, "top", true);
    confetti();
    say(ch);
  }, 160);

  // れんしゅう中はひとりでに進む（子どもに「つぎ」を押させ続けない）
  if (session) setTimeout(()=>{ if (session) advance(); }, 1700);
};

/* ================= ごほうび画面 ================= */
const rewardQueue = [];
const rewardLog = [];
let currentReward = null;
function queueReward(cfg){ rewardQueue.push(cfg); }

function handwritingCanvas(sample){
  const size = 70;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement("canvas");
  cv.width = size * dpr; cv.height = size * dpr;
  cv.style.width = size + "px"; cv.style.height = size + "px";
  cv.setAttribute("role", "img");
  cv.setAttribute("aria-label", `じぶんが かいた ${sample.ch}`);
  const c = cv.getContext("2d");
  const S = size * dpr / 109;
  c.setTransform(S,0,0,S,0,0); c.lineCap = "round"; c.lineJoin = "round";
  for (const stroke of sample.strokes || []){
    const pts = stroke.points || [];
    if (!pts.length) continue;
    const path = new Path2D();
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++){
      path.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0]+pts[i+1][0])/2, (pts[i][1]+pts[i+1][1])/2);
    }
    if (pts.length > 1) path.lineTo(pts[pts.length-1][0], pts[pts.length-1][1]);
    c.strokeStyle = stroke.color || "#168f86";
    c.globalAlpha = .16; c.lineWidth = 8.6; c.stroke(path);
    c.globalAlpha = 1; c.lineWidth = 6.6; c.stroke(path);
  }
  return cv;
}

/* ================= きょうりゅう詳細 ================= */
const FACT_LABELS = {
  diet: ["🌿", "たべもの"], size: ["📏", "おおきさ"],
  period: ["🕰️", "くらしていた じだい"], region: ["🌍", "みつかった ところ"]
};
let detailDino = null;

function detailUrl(id){
  const url = new URL(location.href);
  url.searchParams.delete("c");
  url.searchParams.set("dino", id);
  return url.pathname + url.search + url.hash;
}

function renderDinoDetail(view = "bone"){
  if (!detailDino || !B.isComplete(dig, detailDino)) return false;
  const data = detailDino.detail || {};
  $("#dino-detail-name").textContent = detailDino.name;
  document.querySelectorAll("[data-detail-view]").forEach(btn => {
    const on = btn.dataset.detailView === view;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-selected", String(on));
  });

  const art = $("#dino-detail-art");
  const note = $("#dino-detail-art-note");
  art.innerHTML = "";
  if (view === "bone"){
    art.className = "detail-bone-art";
    art.appendChild(boneElement("full_" + detailDino.id, 360, detailDino.name));
    note.textContent = "5つの ホネを あつめて かんせいした ぜんしんこっかく！";
  } else if (data.restorationArt){
    art.className = "detail-life-art";
    const img = new Image();
    img.src = "assets/dinosaurs/" + data.restorationArt;
    img.alt = `${detailDino.name}の いきていた すがた`;
    art.appendChild(img);
    note.textContent = "いきていたころの すがたを そうぞうして えにしたものだよ。";
  } else {
    art.className = "detail-life-empty";
    const empty = document.createElement("div");
    empty.innerHTML = "<span>🖼️</span><strong>ふくげんイラスト<br>じゅんびちゅう</strong>";
    art.appendChild(empty);
    note.textContent = "イラストが できたら、ここで きりかえて みられるよ。";
  }

  $("#dino-detail-description").textContent = data.description || detailDino.fact || "くわしい せつめいは じゅんびちゅうです。";
  const facts = $("#dino-detail-facts");
  facts.innerHTML = "";
  for (const [key, [icon, label]] of Object.entries(FACT_LABELS)){
    const value = data.facts && data.facts[key];
    if (!value) continue;
    const row = document.createElement("div");
    row.innerHTML = `<dt>${icon} ${label}</dt><dd></dd>`;
    row.querySelector("dd").textContent = value;
    facts.appendChild(row);
  }
  facts.classList.toggle("is-empty", !facts.children.length);
  if (!facts.children.length){
    const row = document.createElement("div");
    row.className = "fact-pending";
    row.textContent = "くわしい データは じゅんびちゅう";
    facts.appendChild(row);
  }
  const source = $("#dino-detail-source");
  source.hidden = !data.sourceUrl;
  source.href = data.sourceUrl || "";
  return true;
}

function openDinoDetail(id, { updateHistory = true } = {}){
  const dino = B.DINOS.find(d => d.id === id);
  // URLを直接入力しても、未完成なら詳細は絶対に表示しない。
  if (!dino || !B.isComplete(dig, dino)){
    detailDino = null;
    show(el.digScr); renderDig();
    const url = new URL(location.href);
    url.searchParams.delete("dino");
    window.history.replaceState({ screen:"dig" }, "", url.pathname + url.search + url.hash);
    return false;
  }
  detailDino = dino;
  show(el.dinoScr);
  renderDinoDetail("bone");
  if (updateHistory) window.history.pushState({ screen:"dino", dino:id }, "", detailUrl(id));
  return true;
}

function closeDinoDetail({ updateHistory = true } = {}){
  detailDino = null;
  show(el.digScr); renderDig();
  if (updateHistory){
    const url = new URL(location.href);
    url.searchParams.delete("dino");
    window.history.replaceState({ screen:"dig" }, "", url.pathname + url.search + url.hash);
  }
}

document.querySelector(".detail-tabs").addEventListener("click", e => {
  const btn = e.target.closest("[data-detail-view]");
  if (!btn) return;
  sfx.unlock(); sfx.pop(); renderDinoDetail(btn.dataset.detailView);
});
$("#btn-dino-back").addEventListener("click", ()=>{ sfx.pop(); closeDinoDetail(); });
$("#btn-dino-list").addEventListener("click", ()=>{ sfx.pop(); closeDinoDetail(); });
window.addEventListener("popstate", ()=>{
  const id = new URLSearchParams(location.search).get("dino");
  if (id) openDinoDetail(id, { updateHistory:false });
  else closeDinoDetail({ updateHistory:false });
});

function renderHandwriting(samples){
  el.rewardHand.innerHTML = "";
  el.rewardHand.classList.toggle("is-on", !!(samples && samples.length));
  for (const sample of samples || []){
    const card = document.createElement("div");
    card.className = "hand-card";
    card.appendChild(handwritingCanvas(sample));
    el.rewardHand.appendChild(card);
  }
}

function openReward(cfg){
  currentReward = cfg;
  rewardLog.push({ title: cfg.title || "", emojis: cfg.emojis || "" });
  $("#reward-kicker").textContent = cfg.kicker || "";
  $("#reward-title").textContent = cfg.title || "";
  renderHandwriting(cfg.handwriting);
  $("#reward-emojis").textContent = cfg.emojis || "";
  const art = $("#reward-art");
  art.innerHTML = "";
  if (cfg.art) art.appendChild(cfg.art);
  el.rewardAchievements.innerHTML = "";
  const achievements = cfg.achievements || [];
  el.rewardAchievements.classList.toggle("is-on", achievements.length > 0);
  for (const text of achievements){
    const row = document.createElement("div");
    row.className = "achievement"; row.textContent = text;
    el.rewardAchievements.appendChild(row);
  }
  $("#reward-sub").textContent = cfg.sub || "";
  $("#reward-ok").textContent = cfg.button || "つぎへ →";
  el.reward.classList.add("is-on");
  sfx.charDone();
  confetti();
  say(cfg.speak || cfg.title);
}
function flushRewards(){
  if (el.reward.classList.contains("is-on")) return;
  if (rewardQueue.length) openReward(rewardQueue.shift());
}
$("#reward-ok").addEventListener("click", ()=>{
  sfx.pop();
  el.reward.classList.remove("is-on");
  if (rewardQueue.length) setTimeout(flushRewards, 350);
  else if (currentReward && currentReward.go === "dig") { show(el.digScr); renderDig(); }
  else { show(el.home); renderGrid(); }
});

/* ================= ほめ表示 ================= */
let praiseTimer = null;
function flash(text, ms = 620, spot = "top", big = false){
  el.praise.innerHTML = "<span></span>";
  el.praise.firstChild.textContent = text;
  el.praise.classList.toggle("top", spot === "top");
  el.praise.classList.toggle("big", big);
  el.praise.classList.add("is-on");
  clearTimeout(praiseTimer);
  praiseTimer = setTimeout(hidePraise, ms);
}
function hidePraise(){ el.praise.classList.remove("is-on"); }

/* ================= よみあげ ================= */
function say(text){
  if (!text || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(WORDS[text] ? readingOf(text) : text);
    u.lang = "ja-JP"; u.rate = 0.85; u.pitch = 1.15;
    speechSynthesis.speak(u);
  } catch {}
}

/* ================= 紙ふぶき ================= */
function confetti(){
  const cv = el.conf, c = cv.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  c.setTransform(dpr,0,0,dpr,0,0);
  cv.classList.add("is-on");
  const cols = ["#ff8a5c","#4ecdc4","#ffc93c","#a78bfa","#5db2ff","#ff7eb6"];
  const ps = Array.from({length:70}, ()=>({
    x: innerWidth/2 + (Math.random()-.5)*140, y: innerHeight*0.42,
    vx: (Math.random()-.5)*9, vy: -Math.random()*11 - 4,
    r: 4 + Math.random()*6, a: Math.random()*7, va: (Math.random()-.5)*.35,
    col: cols[(Math.random()*cols.length)|0]
  }));
  const t0 = performance.now();
  const step = ()=>{
    const t = performance.now() - t0;
    c.clearRect(0,0,innerWidth,innerHeight);
    for (const p of ps){
      p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.a += p.va;
      c.save(); c.translate(p.x,p.y); c.rotate(p.a);
      c.fillStyle = p.col; c.fillRect(-p.r/2, -p.r/2, p.r, p.r*.65);
      c.restore();
    }
    if (t < 1900) requestAnimationFrame(step);
    else { c.clearRect(0,0,innerWidth,innerHeight); cv.classList.remove("is-on"); }
  };
  step();
}

/* ================= 起動 ================= */
document.addEventListener("pointerdown", ()=>sfx.unlock(), { once:true });
document.addEventListener("gesturestart", e=>e.preventDefault());
renderGrid();

const params = new URLSearchParams(location.search);
const q = params.get("c");
if (q && KANA[q]) openChar(q);
else if (params.get("demo") === "triceratops-complete"){
  // 公開確認用。保存データは書き換えず、このページを開いている間だけ完成状態にする。
  for (const dino of B.DINOS) dig.slots[dino.id] = [];
  const tri = B.DINOS.find(dino => dino.id === "triceratops");
  dig.slots.triceratops = B.ALL_PARTS.slice();
  dig.done.length = 0;
  dig.done.push(tri.id);
  show(el.digScr);
  renderDig();
}
else if (params.get("dino")) openDinoDetail(params.get("dino"), { updateHistory:false });

// 開発用フック（ヘッドレス調整ハーネスから触る）
window.__nazorin = {
  tracer, stamps, dig, handwriting, bones: B, starsOf,
  openChar, renderGrid, renderDig, renderDinoDetail, openDinoDetail, closeDinoDetail,
  popBone, startSession, startPractice, show, el,
  REPS, SET,
  get char(){ return curChar; },
  get session(){ return session; },
  rewards: ()=>({ queued: rewardQueue.length, open: el.reward.classList.contains("is-on") }),
  rewardLog,
  setKana(k){
    curKana = k;
    saveUiPrefs();
    renderGrid();
  },
  setCategory(s){
    curSet = s;
    saveUiPrefs();
    renderGrid();
  }
};
