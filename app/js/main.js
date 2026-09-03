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
  sheet:     $("#part-sheet"),
  certScr:   $("#screen-cert"),
  train:     $("#screen-train"),
  recent:    $("#recent-list"),
  trainGo:   $("#btn-train-go"),
  kanaPick:  $("#kana-switch"),
  setScr:    $("#screen-settings"),
  buddy:     $("#buddy"),
  rewardFace:$("#reward-face"),
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
      set: ["seion", "dakuon", "small"].includes(raw.set) ? raw.set : "seion",
      recent: Array.isArray(raw.recent) ? raw.recent.filter(c => typeof c === "string").slice(0, 3) : []
    };
  } catch { return { kana: "hira", set: "seion", recent: [] }; }
}
function saveUiPrefs(){
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ kana: curKana, set: curSet, recent: uiPrefs.recent || [] }));
  } catch {}
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
  for (const s of [el.home, el.trace, el.digScr, el.dinoScr, el.certScr, el.train, el.setScr]) s.classList.toggle("is-on", s === screen);
}
document.addEventListener("click", (e)=>{
  const b = e.target.closest("[data-go]");
  if (!b) return;
  sfx.unlock(); sfx.pop();
  if (b.dataset.go === "dig"){ show(el.digScr); renderDig(); }
  else if (b.dataset.go === "train"){ show(el.train); renderGrid(); }
  else { show(el.home); renderHome(); }
});

/* ================= ホーム =================
   50音表は「はっくつれんしゅう」へ移した。ホームに残るつまみは かなの種別ひとつだけ。
   設定の奥に隠さず、押すボタンのすぐ下に置く＝子どもが自分でカタカナに行ける。 */
const KANA_LABEL_JA = { hira: "ひらがな", kata: "カタカナ" };

function renderHome(){
  [...el.kanaPick.children].forEach(x => x.classList.toggle("is-on", x.dataset.kana === curKana));
  el.missionMode.textContent = `${KANA_LABEL_JA[curKana]}の はっくつミッション`;
  refreshStart();
  const bones = B.boneCount(dig);
  el.homeBones.textContent = bones >= B.TOTAL_BONES()
    ? "ぜんぶの ホネを はっくつしたよ！"
    : `はっくつした ホネ　${bones} / ${B.TOTAL_BONES()}`;
  // たんけんした文字は「ミッションで出る きほん46字」に対して数える
  // （表の範囲ごとに変わると、ホームの進みぐあいの意味が読めない）
  const list = SETS[curKana].seion.filter(Boolean);
  el.prog.textContent = `🐾 たんけんした もじ　${list.filter(got).length} / ${list.length}`;
}

el.kanaPick.addEventListener("click", (e)=>{
  const t = e.target.closest(".kana-btn");
  if (!t || t.dataset.kana === curKana) return;
  sfx.unlock(); sfx.pop();
  curKana = t.dataset.kana;
  saveUiPrefs();
  session = null;          // 種別が変わったら、とまっているミッションは持ちこさない
  renderHome();
});

/* ================= はっくつれんしゅう（50音表） =================
   字を選んで確かめてから始める（誤タップで始まらない）。
   1もじ3かいで終わり。ホネは出ない ＝ ミッションの「15回で1個」を崩さない。 */
let pickedChar = null;

function renderGrid(){
  [...$("#train-kana").children].forEach(x=>x.classList.toggle("is-on", x.dataset.kana === curKana));
  [...el.tabs.children].forEach(x=>x.classList.toggle("is-on", x.dataset.set === curSet));
  el.grid.innerHTML = "";
  const list = SETS[curKana][curSet].filter(Boolean);
  if (!list.includes(pickedChar)) pickedChar = null;
  for (const ch of SETS[curKana][curSet]){
    if (!ch){
      const b = document.createElement("div");
      b.className = "cell blank";
      el.grid.appendChild(b);
      continue;
    }
    const b = document.createElement("button");
    b.className = "cell" + (got(ch) ? " done" : "") + (ch === pickedChar ? " is-picked" : "");
    b.textContent = ch;
    if (got(ch)) b.dataset.stars = starStr(ch);
    b.setAttribute("aria-label", readingOf(ch));
    b.addEventListener("click", ()=>{ sfx.unlock(); sfx.pop(); pickTrainChar(ch); });
    el.grid.appendChild(b);
  }
  renderRecent();
  renderTrainGo();
}

function pickTrainChar(ch){
  pickedChar = ch;
  [...el.grid.children].forEach(b => b.classList.toggle("is-picked", b.textContent === ch));
  renderTrainGo();
}

function renderTrainGo(){
  el.trainGo.disabled = !pickedChar;
  el.trainGo.textContent = pickedChar ? `「${pickedChar}」を れんしゅう →` : "もじを えらんでね";
}

function renderRecent(){
  el.recent.innerHTML = "";
  for (const ch of uiPrefs.recent || []){
    const s2 = document.createElement("span");
    s2.textContent = ch;
    el.recent.appendChild(s2);
  }
}

function pushRecent(ch){
  const list = (uiPrefs.recent || []).filter(c => c !== ch);
  list.unshift(ch);
  uiPrefs.recent = list.slice(0, 3);
  saveUiPrefs();
}

el.trainGo.addEventListener("click", ()=>{
  if (!pickedChar) return;
  sfx.unlock(); sfx.pop();
  startPractice(pickedChar);
});
$("#btn-train-back").addEventListener("click", ()=>{ sfx.pop(); show(el.home); renderHome(); });

el.tabs.addEventListener("click", (e)=>{
  const t = e.target.closest(".tab");
  if (!t) return;
  sfx.unlock(); sfx.pop();
  curSet = t.dataset.set;
  saveUiPrefs();
  renderGrid();
});

$("#train-kana").addEventListener("click", (e)=>{
  const t = e.target.closest(".seg-btn");
  if (!t) return;
  sfx.unlock(); sfx.pop();
  curKana = t.dataset.kana;
  saveUiPrefs();
  renderGrid();
});

/* ================= せってい（おうちのひと向け） ================= */
function renderSettings(){
  $("#set-bones").textContent = `${B.boneCount(dig)} / ${B.TOTAL_BONES()}`;
  const list = SETS[curKana].seion.filter(Boolean);
  $("#set-stars").textContent = `${list.filter(got).length} / ${list.length}（${KANA_LABEL_JA[curKana]}のきほん）`;
}
$("#btn-settings").addEventListener("click", ()=>{
  sfx.unlock(); sfx.pop();
  renderSettings();
  show(el.setScr);
});
$("#btn-settings-back").addEventListener("click", ()=>{ sfx.pop(); show(el.home); renderHome(); });

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
  uiPrefs.recent = [];
  saveUiPrefs();
  renderHome();
  renderGrid();
  renderSettings();
});

/* ================= れんしゅう（セット） ================= */
/** 出す字を SET 文字えらぶ。
 *  まだ書いていない字 → ★の少ない字 → のこりをランダム。
 *  同じ字ばかり出ても飽きるので、種類はばらす。 */
function pickChars(){
  // だくおん・ちいさいじ は「はっくつれんしゅう」で親と一緒にやるもの。
  // ミッションは きほん(清音)46字だけ＝ホームのつまみが1つで済む
  const pool = SETS[curKana].seion.filter(Boolean);
  const fresh = pool.filter(c => !got(c));
  const weak  = pool.filter(c =>  got(c) && starsOf(bestOf(c) || 1) < 3);
  const rest  = pool.filter(c =>  got(c) && starsOf(bestOf(c) || 1) >= 3);
  const shuffle = (a)=> a.map(v=>[Math.random(), v]).sort((x,y)=>x[0]-y[0]).map(v=>v[1]);
  return [...shuffle(fresh), ...shuffle(weak), ...shuffle(rest)].slice(0, SET);
}

/** とまっているミッションがあれば、ホームのボタンを「つづきから」にする */
function refreshStart(){
  const held = session && session.mode === "mission" && session.paused;
  $("#start-main").innerHTML = held
    ? `つづきから <b>→</b>`
    : `たんけんに でる！ <b>→</b>`;
  $("#start-sub").textContent = held
    ? `${session.i + 1}もじめの とちゅうから`
    : `${KANA_LABEL_JA[curKana]}を ${SET}もじ かくと ホネが 1こ！`;
  $("#btn-restart").classList.toggle("is-hidden", !held);
}

$("#btn-restart").addEventListener("click", ()=>{
  sfx.unlock(); sfx.pop();
  session = null;
  startSession();
});

function startSession(){
  session = null;
  const chars = pickChars();
  if (!chars.length) return;
  // 開始時の文字種・分類を固定する。終了記録もこの値を使い、ひらがなとカタカナで同じルールにする。
  session = { mode: "mission", chars, i: 0, rep: 0, attempts: {}, kana: curKana, set: curSet };
  openChar(chars[0]);
}

/** はっくつれんしゅう。**えらんだ字だけを3回**書いて終わり。
 *  以前は表の順に次の字へ流れていたが、「ぬを繰り返したい」に一度も応えられておらず、
 *  しかも46字を無限に回って終わりが無かった。 */
function startPractice(ch){
  if (!KANA[ch]) return;
  pickedChar = ch;
  pushRecent(ch);
  renderRecent();     // なぞる画面へ行く前に書きかえておく（戻ったときに古いままにならない）
  session = { mode: "practice", chars: [ch], i: 0, rep: 0, attempts: {}, kana: curKana, set: curSet };
  openChar(ch);
}
$("#btn-start").addEventListener("click", ()=>{
  sfx.unlock(); sfx.pop();
  if (session && session.mode === "mission" && session.paused){
    session.paused = false;
    openChar(session.chars[session.i]);
    return;
  }
  startSession();
});

function renderSess(){
  // れんしゅう中は「つぎ」を隠す。押すと書かずに飛ばせてしまう
  const active = session && !session.paused;
  $("#btn-next").classList.toggle("is-hidden", !!active);
  if (!active){ el.sess.classList.remove("is-on"); el.sess.innerHTML = ""; return; }
  el.sess.classList.add("is-on");
  const left = REPS - session.rep;
  if (session.mode === "practice"){
    el.sess.dataset.mode = "practice";
    el.sess.innerHTML =
      `<span class="sess-label">「${session.chars[0]}」の れんしゅう</span>` +
      `<span class="dots" aria-label="${session.rep}/${REPS}かい"><b>${"●".repeat(session.rep)}</b>${"○".repeat(REPS - session.rep)}</span>` +
      `<span class="sess-rep">あと ${left}かい <small>3かいで おわり</small></span>`;
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
  buddyFace("idle");
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
  say(ch, "c:" + ch);
}

function fit(){
  const pad = 8;
  const w = el.stage.clientWidth  - pad;
  const h = el.stage.clientHeight - pad;
  tracer.resize(Math.floor(Math.max(200, Math.min(w, h, 460))));
  fitBuddy();
}
window.addEventListener("resize", ()=>{ if (el.trace.classList.contains("is-on")) fit(); });
window.addEventListener("orientationchange", ()=> setTimeout(fit, 250));

// 5さいの誤タップで、3回×何文字ぶんかが消えていた。
// やめるのではなく「とめておく」。ホームから続きに戻れる。
$("#btn-back").addEventListener("click", ()=>{
  sfx.pop();
  const wasPractice = session && session.mode === "practice";
  if (session && session.mode === "mission") session.paused = true;
  else session = null;
  hidePraise();
  if (wasPractice){ show(el.train); renderGrid(); }
  else { show(el.home); renderHome(); }
});
$("#btn-say").addEventListener("click", ()=>{ sfx.unlock(); say(curChar, "c:" + curChar); });
$("#btn-demo").addEventListener("click", ()=>{ sfx.unlock(); hidePraise(); tracer.demo(); });
$("#btn-again").addEventListener("click", ()=>{
  sfx.unlock(); sfx.pop(); hidePraise();
  $("#btn-next").classList.remove("is-ready");
  tracer.reset();
});
$("#btn-next").addEventListener("click", ()=>{
  sfx.unlock(); sfx.pop(); hidePraise();
  if (session && !session.paused) return advance();
  const list = Object.values(SETS[kanaOf(curChar)]).flat().filter(Boolean);
  openChar(list[(list.indexOf(curChar) + 1) % list.length]);
});


/* ================= なぞる画面の相棒 =================
   まだ字が読めない子に、★や「かたちが ちがうみたい」を顔で伝える。
   文字は消さない（読める大人・読めるようになった子には文字のほうが速い）。 */
const BUDDY = {
  idle:  "ny_idle",   // ふつう
  great: "ny_great",  // 星目 ＝ かんぺき
  good:  "ny_good",   // わらい ＝ じょうず・いいね
  hmm:   "ny_hmm",    // ？ ＝ ちがう線を書いた
  oops:  "ny_oops",   // あせ ＝ とちゅう・はじめの●
  love:  "ny_love"    // ハート目 ＝ ホネが出た
};
const BUDDY_WHY = { reverse:"hmm", off:"hmm", shape:"hmm", start:"oops", short:"oops" };
let buddyTimer = null;
function buddyFace(mood, hold = 1500){
  const img = el.buddy;
  if (!img) return;
  img.src = "assets/chars/" + (BUDDY[mood] || BUDDY.idle) + ".webp";
  img.classList.remove("hop");
  void img.offsetWidth;                       // アニメを最初から出しなおす
  clearTimeout(buddyTimer);
  if (mood === "idle") return;
  img.classList.add("hop");
  buddyTimer = setTimeout(()=> buddyFace("idle"), hold);
}
/** 板の下にあいた土の広さから大きさを決める。せまければ出さない。
    ＝相棒のために字を書くマスを小さくすることはしない */
function fitBuddy(){
  const img = el.buddy;
  if (!img) return;
  const wrap = el.canvas.closest(".canvas-wrap");
  const gap = el.stage.getBoundingClientRect().bottom - wrap.getBoundingClientRect().bottom;
  const size = Math.min(132, Math.floor(gap - 12));
  const shown = size >= 72;
  const slot = img.closest(".buddy-slot") || img;
  slot.style.setProperty("--buddy", Math.max(0, size) + "px");
  img.classList.toggle("is-on", shown);
  // ホネのふきだしが相棒の顔にかぶらないよう、居場所を教えておく
  el.trace.style.setProperty("--buddy-h", (shown ? size : 0) + "px");
}

/** れんしゅう中の進み方。同じ字を REPS 回 → つぎの字 → SET 文字で1セット */
function advance(){
  session.rep += 1;
  if (session.rep < REPS){ renderSess(); tracer.reset(); return; }
  session.rep = 0;
  if (session.mode === "practice"){
    finishPractice();
    return;
  }
  session.i += 1;
  if (session.i < session.chars.length){ openChar(session.chars[session.i]); return; }
  finishSession();
}

/** はっくつれんしゅうの終わり。ホネは出さない（ミッションの「15回で1個」を崩さない）。
 *  出すのは★と、自分で書いた3枚。 */
function finishPractice(){
  const ch = session.chars[0];
  const samples = (session.attempts[ch] || []).slice(-REPS)
    .map(a => ({ ch, score: a.score || 0, strokes: a.strokes || [] }));
  session = null;
  renderSess();
  queueReward({
    kind: "practice",
    kicker: "はっくつれんしゅう",
    title: `「${ch}」を ${REPS}かい なぞれた！`,
    face: "ny_good",
    handwriting: samples,
    achievements: [`${starStr(ch) || "★"} に なった！`],
    sub: "ホネは でないけれど、うまく なっているよ",
    button: "れんしゅうに もどる",
    go: "train",
    speakId: "p:2",
    speak: `${REPS}かい なぞれたね`
  });
  setTimeout(flushRewards, 500);
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

  // どの文字を書いていて掘り当てたのか、骨のほうにも残す。
  // 筆跡は古いものから捨てられるが、日付と文字は軽いので必ず残る
  if (bone){
    dig.log = dig.log || {};
    const now = new Date();
    dig.log[B.logKey(bone.dino, bone.part)] = {
      day: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`,
      chars: done.slice(),
      sid: record.id
    };
    B.saveDig(dig);
  }

  // ① まず「自分で書いた！」を見せる。骨より先に、練習そのものを成果にする。
  queueReward({
    kind: "handwriting",
    kicker: "れんしゅう おつかれさま！",
    face: "yk_cheer",
    title: "じぶんで かいた 5もじ",
    handwriting: samples,
    achievements: [`${done.length}もじ かけた！`, bone ? "あたらしい ホネを はっくつした！" : "ぜんぶの ホネを はっくつした！"],
    sub: "ゆがんでいても だいじょうぶ。これは きみが かいた もじだよ。",
    button: bone ? "ホネを みる →" : "たんけんへ もどる",
    speak: `${done.length}もじ かけたね`,
    speakId: "s:set"
  });

  if (bone){
    queueReward({
      kind: "bone",
      kicker: "はっくつ せいこう！",
      face: "ny_love",
      title: "なにかの ホネ！",
      art:   boneElement(B.artKey(bone.dino, bone.part), 150),
      achievements: [`なにかの ${B.partName(bone.dino, bone.part)}を みつけた！`, "はっくつずかんに きろくした！"],
      sub:   `これは なにかの ホネ。あと ${B.ALL_PARTS.length - B.gotParts(dig, bone.dino).length}こで しょうたいが わかる！`,
      button: bone.complete ? "ぜんしんを みる →" : "ずかんを みる →",
      go: "dig",
      speak: B.foundText(bone.dino, bone.part),
      speakId: `f:${B.partName(bone.dino, bone.part)}`   // 正体は言わない。部位の呼び名だけ
    });
    if (isAllDug() && !dig.certDay){
      dig.certDay = todayISO();
      B.saveDig(dig);
    }
    if (bone.complete){
      queueReward({
        kind: "reveal",
        kicker: "ぜんしんこっかく かんせい！",
        face: "yk_cheer",
        title: bone.dino.name + "！",
        art:   boneElement("full_" + bone.dino.id, 268, bone.dino.name),
        sub:   bone.dino.fact,
        achievements: ["5つの ホネが そろった！", `${bone.dino.name}の ぜんしんが できた！`],
        button: "ずかんで みる →",
        go: "dig",
        speak: `${bone.dino.name}の ホネが そろった`,
        speakId: `r:${bone.dino.id}`
      });
    }
  }
  if (isAllDug()){
    queueReward({
      kind: "cert",
      kicker: "はっくつたい にんてい",
      title: "ずかん コンプリート！",
      face: "yk_cheer",
      achievements: [`ホネを ${B.TOTAL_BONES()}こ ぜんぶ みつけた！`, "しょうじょうを もらった！"],
      sub: "きみは さいこうの はっくつたいだ！",
      button: "しょうじょうを みる →",
      go: "cert",
      speak: "ずかん コンプリート",
      speakId: "s:complete"
    });
  }
  setTimeout(flushRewards, 700);
}

/* ================= きょうりゅう ずかん ================= */
const SLOT_ORDER = ["head", "body", "forelimb", "hindlimb", "tail"];

function slotEl(dino, part, has){
  // 5さいが押した。押せそうに見えるものは、押せなければならない
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "slot" + (has ? " has" : "");
  if (has) slot.appendChild(boneElement(B.artKey(dino, part), 54));
  else {
    const q = document.createElement("span");
    q.className = "slot-q"; q.textContent = "？";
    slot.appendChild(q);
  }
  const full = B.isComplete(dig, dino);
  const cap = document.createElement("span");
  cap.className = "slot-label";
  if (has && !full){
    // そろうまでは正体を出さない。特注の呼び名だけは残す＝これがヒントになる
    cap.innerHTML = `<small>なにかの</small>${B.partName(dino, part)}`;
  } else {
    cap.textContent = has ? B.partName(dino, part) : B.PART_LABEL[part];
  }
  slot.appendChild(cap);
  slot.setAttribute("aria-label",
    has ? `${full ? dino.name : "なにか"}の ${B.partName(dino, part)}。ほりだした きろくを みる`
        : `${B.PART_LABEL[part]}は まだ みつかっていない`);
  slot.addEventListener("click", ()=>{ sfx.unlock(); sfx.pop(); openPartSheet(dino, part, has); });
  return slot;
}

/* ---- ホネ1つの きろく ---- */
const MONTH_DAY = (day)=>{
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || "");
  return m ? `${Number(m[2])}がつ ${Number(m[3])}にち` : null;
};

function openPartSheet(dino, part, has){
  const art  = $("#part-art");
  const hand = $("#part-hand");
  art.innerHTML = ""; hand.innerHTML = "";

  // そろうまでは正体を出さない（ずかんのカードと同じ扱い）
  const dinoFull = B.isComplete(dig, dino);
  $("#part-dino").textContent = has ? (dinoFull ? dino.name : `${B.noLabel(dino)}　？？？？`) : "";
  $("#part-title").textContent = has ? B.partName(dino, part) : `${B.PART_LABEL[part]}は まだ`;

  if (has){
    art.appendChild(boneElement(B.artKey(dino, part), 132));
    const log = B.foundLog(dig, dino, part);
    const when = log && MONTH_DAY(log.day);
    $("#part-day").textContent = when ? `${when}に ほりだした` : "";

    // そのとき書いた文字。筆跡が残っていれば筆跡、無ければ文字だけ
    const rec = log && handwriting.sessions.find(r => r.id === log.sid);
    const chars = (log && log.chars) || [];
    if (rec && rec.characters && rec.characters.length){
      for (const sample of rec.characters) hand.appendChild(handwritingCanvas(sample));
      $("#part-note").textContent = "この もじを かいて みつけたよ";
    } else if (chars.length){
      for (const ch of chars){
        const b = document.createElement("span");
        b.className = "sheet-char"; b.textContent = ch;
        hand.appendChild(b);
      }
      $("#part-note").textContent = "この もじを かいて みつけたよ";
    } else {
      $("#part-note").textContent = "きろくが のこっていない ホネだよ";
    }
  } else {
    const q = document.createElement("span");
    q.className = "sheet-q"; q.textContent = "？";
    art.appendChild(q);
    $("#part-day").textContent = "";
    $("#part-note").textContent = "もじを なぞって さがそう！";
  }
  el.sheet.classList.add("is-on");
  if (has) say(`${dino.name}の ${B.partName(dino, part)}`);
}

function closePartSheet(){ el.sheet.classList.remove("is-on"); }
$("#part-close").addEventListener("click", ()=>{ sfx.pop(); closePartSheet(); });
el.sheet.addEventListener("click", (e)=>{ if (e.target === el.sheet) closePartSheet(); });

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

  // 番号は最初から出す。名前だけ隠す＝「6体いて、いま何番が埋まっているか」は見える
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML =
    `<span class="dino-no">${B.noLabel(dino)}</span>` +
    `<h3 class="page-title${full ? "" : " unknown"}">${full ? dino.name : "？？？？"}</h3>` +
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
    const left2 = document.createElement("p");
    left2.className = "dino-left";
    left2.textContent = left === 1
      ? "あと 1こで しょうたいが わかる！"
      : `あと ${left}こで しょうたいが わかる！`;
    card.appendChild(left2);
  }
  return card;
}


/* ================= しょうじょう =================
   30こ ぜんぶ そろったときの1枚。日付だけ、絵の空欄に書きこむ。 */
const isAllDug = ()=> B.boneCount(dig) >= B.TOTAL_BONES();

function todayISO(){
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}

function renderCert(){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dig.certDay || "");
  $("#cert-year").textContent  = m ? m[1] : "";
  $("#cert-month").textContent = m ? String(Number(m[2])) : "";
  $("#cert-day").textContent   = m ? String(Number(m[3])) : "";
  const bones = B.TOTAL_BONES();
  $("#cert-line").textContent = m
    ? `${m[1]}ねん ${Number(m[2])}がつ ${Number(m[3])}にち、ホネ ${bones}こ ぜんぶ はっくつ かんりょう！`
    : `ホネ ${bones}こ ぜんぶ はっくつ かんりょう！`;
}

function openCert(){
  renderCert();
  show(el.certScr);
}
$("#btn-cert-back").addEventListener("click", ()=>{ sfx.pop(); show(el.digScr); renderDig(); });

// しょうじょうを おおきく。たてのままでも見せたいので絵ごと90度回す。
// 中身は本物を写して出す（日付を2か所に書かない）
const certZoom = $("#cert-zoom");
function openCertZoom(){
  const frame = document.querySelector("#screen-cert .cert-frame");
  if (!frame) return;
  const copy = frame.cloneNode(true);
  // 写しなので id は外す。同じ id が2つあると renderCert がどちらを書くか分からなくなる
  copy.removeAttribute("id");
  for (const e of copy.querySelectorAll("[id]")) e.removeAttribute("id");
  $("#cert-zoom-inner").replaceChildren(copy);
  certZoom.classList.add("is-on");
  sfx.pop();
}
document.querySelector("#screen-cert .cert-frame").addEventListener("click", openCertZoom);
certZoom.addEventListener("click", ()=>{ certZoom.classList.remove("is-on"); sfx.pop(); });

function certCard(){
  const card = document.createElement("section");
  card.className = "page cert-card";
  const head = document.createElement("div");
  head.className = "page-head";
  head.innerHTML = '<h3 class="page-title">🏆 ずかん コンプリート！</h3>';
  card.appendChild(head);
  const p = document.createElement("p");
  p.textContent = "きみは さいこうの はっくつたいだ！";
  card.appendChild(p);
  const btn = document.createElement("button");
  btn.className = "dino-open btn primary";
  btn.id = "btn-cert-open";
  btn.textContent = "しょうじょうを みる →";
  btn.addEventListener("click", ()=>{ sfx.pop(); openCert(); });
  card.appendChild(btn);
  return card;
}

function renderDig(){
  el.digWrap.innerHTML = "";
  // そろった → 掘りかけ → 手つかず。手つかずが上に来ると、進んでいるものが埋もれる
  // 番号順にならべる。番号の枠が最初から6つ見えていることが、この画面の背骨
  if (isAllDug()) el.digWrap.appendChild(certCard());
  for (const d of B.DINOS) el.digWrap.appendChild(dinoCard(d));
  el.digTotal.textContent = `${B.boneCount(dig)} / ${B.TOTAL_BONES()}`;
  $(".dig-intro strong").innerHTML = isAllDug()
    ? "ぜんぶの ホネが そろった！<br>きみは さいこうの はっくつたい！"
    : "ホネを 5こ あつめると<br>しょうたいが わかる！";
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
  buddyFace("love", 2300);
  clearTimeout(bonePopTimer);
  bonePopTimer = setTimeout(()=> el.bonePop.classList.remove("is-on"), 2300);
}

/* ================= 判定からのコールバック ================= */
const PRAISE = { 3: "かんぺき！", 2: "じょうず！", 1: "いいね！" };
const WHY = {
  reverse: "はんたいから かいてるよ",
  start:   "はじめの ●から なぞろう",
  short:   "さいごまで なぞろう",
  off:     "せんの うえを なぞろう",
  shape:   "かたちが ちがうみたい"
};

tracer.on.tick = (p)=> sfx.tick(p);

tracer.on.strokeDone = (i, res)=>{
  sfx.strokeDone(i);
  const st = starsOf(res.value);
  flash(`${"★".repeat(st)}${"☆".repeat(3-st)} ${PRAISE[st]}`, 700, "top");
  buddyFace(st === 3 ? "great" : "good", 900);
};

tracer.on.reject = (res)=>{
  sfx.retry();
  flash(WHY[res.reason] || "もういちど", 1100, "top");
  buddyFace(BUDDY_WHY[res.reason] || "oops", 1300);
  sfx.speak(WHY[res.reason] ? "w:" + res.reason : "w:again");
};

tracer.on.charDone = (avg)=>{
  sfx.charDone();
  const ch  = curChar;
  if (session){
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
    buddyFace(st === 3 ? "great" : "good", 1600);
    confetti();
    // ★の意味を耳でも伝える。字の読みは openChar でもう鳴らしているので、
    // ここで重ねると「あ、ありの あ」が2回続いてくどくなる
    if (!sfx.speak(`p:${st}`)) say(ch);
  }, 160);

  // れんしゅう中はひとりでに進む（子どもに「つぎ」を押させ続けない）
  if (session && !session.paused) setTimeout(()=>{ if (session && !session.paused) advance(); }, 1700);
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

/** その恐竜を掘り出したときの記録。日付と、そのとき書いた文字を出す。
 *  パーツ1つぶんの記録（マスを押すと出るもの）の、恐竜まるごと版。 */
function renderDinoRecord(dino){
  const logs = B.ALL_PARTS.map(part => B.foundLog(dig, dino, part)).filter(Boolean);
  const dayEl   = $("#dino-record-day");
  const leadEl  = $("#dino-record-lead");
  const charsEl = $("#dino-record-chars");
  charsEl.innerHTML = "";

  if (!logs.length){
    dayEl.textContent = "";
    leadEl.textContent = "きろくが のこっていない きょうりゅうだよ";
    return;
  }

  const days = logs.map(l => l.day).filter(Boolean).sort();
  dayEl.textContent = days.length
    ? `${MONTH_DAY(days[days.length-1]) || days[days.length-1]}に かんせい`
    : "";

  // 5本ぶんの文字。同じ字は1回だけ
  const seen = new Set(), chars = [];
  for (const l of logs) for (const ch of (l.chars || [])) if (!seen.has(ch)){ seen.add(ch); chars.push(ch); }

  if (!chars.length){
    leadEl.textContent = days.length ? "" : "きろくが のこっていない きょうりゅうだよ";
    return;
  }
  leadEl.textContent = `この ${chars.length}もじを かいて ほりだしたよ`;

  // 筆跡が残っていれば その子が書いた線、無ければ文字だけ
  const byChar = new Map();
  for (const l of logs){
    const rec = l.sid && handwriting.sessions.find(r => r.id === l.sid);
    for (const sample of (rec && rec.characters) || []){
      if (sample && sample.ch && !byChar.has(sample.ch)) byChar.set(sample.ch, sample);
    }
  }
  for (const ch of chars){
    const sample = byChar.get(ch);
    if (sample && (sample.strokes || []).length) charsEl.appendChild(handwritingCanvas(sample));
    else {
      const b = document.createElement("span");
      b.className = "record-char"; b.textContent = ch;
      charsEl.appendChild(b);
    }
  }
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

  renderDinoRecord(detailDino);
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
  el.rewardFace.classList.toggle("is-on", !!cfg.face);
  if (cfg.face) el.rewardFace.src = "assets/chars/" + cfg.face + ".webp";
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
  say(cfg.speak || cfg.title, cfg.speakId);
}
function flushRewards(){
  if (el.reward.classList.contains("is-on")) return;
  if (rewardQueue.length) openReward(rewardQueue.shift());
}
$("#reward-ok").addEventListener("click", ()=>{
  sfx.pop();
  el.reward.classList.remove("is-on");
  if (rewardQueue.length) setTimeout(flushRewards, 350);
  else if (currentReward && currentReward.go === "train") { show(el.train); renderGrid(); }
  else if (currentReward && currentReward.go === "cert") openCert();
  else if (currentReward && currentReward.go === "dig") { show(el.digScr); renderDig(); }
  else { show(el.home); renderHome(); }
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
function say(text, id){
  // 焼いた声（VOICEVOX:春歌ナナ）があればそれで鳴らす。無ければ端末の合成音声
  if (id && sfx.speak(id)) return;
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
// 電波が無くても開けるようにする。相対パスで登録するので、
// GitHub Pages の /nazotte_dinosaur/ の下でもそのまま効く
if ("serviceWorker" in navigator && location.protocol.startsWith("http")){
  addEventListener("load", ()=> navigator.serviceWorker.register("sw.js").catch(()=>{}));
}

// はじまりの絵。1.6秒でひとりでに引く。押せばすぐ引く。
// 押して閉じるものにすると、開くたびに1タップ増える＝毎日やる練習には重い。
const splash = $("#splash");
let splashTimer = null;
function closeSplash(){
  if (!splash || !splash.classList.contains("is-on")) return;
  clearTimeout(splashTimer);
  splash.classList.add("is-off");
  setTimeout(()=> splash.classList.remove("is-on"), 450);
}
if (splash){
  splashTimer = setTimeout(closeSplash, 1600);
  splash.addEventListener("pointerdown", closeSplash);
}

document.addEventListener("pointerdown", ()=>sfx.unlock(), { once:true });
document.addEventListener("gesturestart", e=>e.preventDefault());
renderHome();
renderGrid();

const params = new URLSearchParams(location.search);
const q = params.get("c");
const demoMatch = params.get("demo")?.match(/^([a-z]+)-complete$/);
const demoDino = demoMatch && B.DINOS.find(dino => dino.id === demoMatch[1]);
if (q && KANA[q]) openChar(q);
else if (demoDino){
  // 公開確認用。保存データは書き換えず、このページを開いている間だけ完成状態にする。
  for (const dino of B.DINOS) dig.slots[dino.id] = [];
  dig.slots[demoDino.id] = B.ALL_PARTS.slice();
  dig.done.length = 0;
  dig.done.push(demoDino.id);
  show(el.digScr);
  renderDig();
}
else if (params.get("dino")) openDinoDetail(params.get("dino"), { updateHistory:false });

// 開発用フック（ヘッドレス調整ハーネスから触る）
window.__nazorin = {
  tracer, stamps, dig, handwriting, bones: B, starsOf,
  openChar, renderGrid, renderDig, openPartSheet, closePartSheet, renderDinoDetail, openDinoDetail, closeDinoDetail,
  popBone, startSession, startPractice, show, el,
  openCert, renderCert, openCertZoom, closeSplash, buddyFace, fitBuddy, renderSettings,
  buddy: ()=>({ src: (el.buddy.getAttribute("src")||"").split("/").pop(),
                shown: el.buddy.classList.contains("is-on"),
                size: (el.buddy.closest(".buddy-slot") || el.buddy).style.getPropertyValue("--buddy") }),
  REPS, SET,
  get char(){ return curChar; },
  get session(){ return session; },
  rewards: ()=>({ queued: rewardQueue.length, open: el.reward.classList.contains("is-on") }),
  rewardLog,
  renderHome, pickTrainChar,
  get picked(){ return pickedChar; },
  setKana(k){
    curKana = k;
    saveUiPrefs();
    renderHome();
    renderGrid();
  },
  setCategory(s){
    curSet = s;
    saveUiPrefs();
    renderGrid();
  }
};
