// ヘッドレス調整ハーネス。
// なぞり動作をマウスで再現して「何点つくか」を測り、画面の絵を work/qa/ に落とす。
// 使い方: node tools/verify.mjs   （事前に nazorin サーバ :8143 を起動しておく）
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan as swScan, writtenVersion } from "./build_sw.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QA = path.join(HERE, "..", "work", "qa");
fs.mkdirSync(QA, { recursive: true });

const URL = process.env.NAZORIN_URL || "http://localhost:8143/";
const shot = (page, name) => page.screenshot({ path: path.join(QA, name) });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const results = [];
const check = (name, ok, note = "") => {
  results.push({ name, ok, note });
  console.log(`${ok ? "OK  " : "NG  "} ${name}${note ? "  — " + note : ""}`);
};
const info = (line) => console.log("     " + line);

/** 1画を、いろいろな下手さで書く。
 *  jitter = 手のふるえ幅 / shift = 線と平行にずらす量
 *  stopAt = 途中でやめる割合 / reverse = 逆向きに書く */
async function traceStroke(page, strokeIndex,
    { jitter = 0, stopAt = 1, startAt = 0, shift = 0, reverse = false } = {}) {
  const plan = await page.evaluate((i, jit, stop, from, sh, rev) => {
    const t = window.__nazorin.tracer;
    const r = t.cv.getBoundingClientRect();
    const s = t.strokes[i];
    if (!s) return null;
    const toPx = (p) => ({ x: r.left + p.x / 109 * r.width, y: r.top + p.y / 109 * r.height });
    const a = Math.floor(s.pts.length * from);
    const b = Math.max(a + 2, Math.floor(s.pts.length * stop));
    const span = s.pts.length - 1;
    const out = [];
    for (let k = a; k < b; k++) {
      const p = s.pts[k];
      // ふるえは「線に対して直角」に入れる。線に沿ってずらしても手本から離れないので、
      // ±16 と書いてあるのに実際は2しか離れていない、という測り方になってしまう
      const q0 = s.pts[Math.max(0, k-1)], q1 = s.pts[Math.min(span, k+1)];
      let tx = q1.x - q0.x, ty = q1.y - q0.y;
      const L = Math.hypot(tx, ty) || 1;
      const nx = -ty / L, ny = tx / L;
      // 子どもの手の模型：ゆっくりした流れ＋こまかいふるえ。
      // 両端は0にする（書きはじめの●は狙って置くので）
      const w = Math.sin(Math.PI * k / span);
      const off = jit * w * (0.75 * Math.sin(k * 0.28 + 1.1) + 0.25 * Math.sin(k * 1.3));
      out.push(toPx({ x: p.x + nx * off, y: p.y + ny * off + sh }));
    }
    if (rev) out.reverse();
    return out;
  }, strokeIndex, jitter, stopAt, startAt, shift, reverse);

  if (!plan || plan.length < 2) return false;
  await page.mouse.move(plan[0].x, plan[0].y);
  await page.mouse.down();
  for (const p of plan) await page.mouse.move(p.x, p.y);
  await page.mouse.up();
  await sleep(70);
  return true;
}

const state = (page) => page.evaluate(() => {
  const t = window.__nazorin.tracer;
  return {
    cur: t.cur, total: t.strokes.length, done: t.done,
    res: t.lastResult,
    inks: t.strokes.map(s => (s.ink ? s.ink.length : 0)),
    scores: t.strokes.map(s => s.score)
  };
});


/** はじまりの絵（キービジュアル）が引くのを待つ。
 *  押して消すのではなく「ひとりでに引く」ことを確かめたいので、待つ。
 *  引かないまま被さっていると、以降のクリックが全部死ぬ（実際に一度そうなった）。 */
async function passSplash(page, limit = 3000) {
  const t0 = Date.now();
  for (;;) {
    const on = await page.evaluate(() => {
      const s = document.getElementById("splash");
      return !!s && s.classList.contains("is-on") && !s.classList.contains("is-off");
    });
    if (!on) return Date.now() - t0;
    if (Date.now() - t0 > limit) return -1;
    await sleep(120);
  }
}

/** ごほうび画面を全部閉じきる。
 *  行かんせいと きょうりゅうかんせいが続けて出るので1回では足りない。
 *  「まだ出ていないだけ」の場合もあるので、待ち行列が空になるまで面倒を見る。 */
async function settleRewards(page) {
  for (let i = 0; i < 10; i++) {
    const r = await page.evaluate(() => window.__nazorin.rewards());
    if (!r.open && !r.queued) return;
    if (r.open) { await page.click("#reward-ok"); await sleep(420); }
    else await sleep(600);
  }
}
const dismissReward = settleRewards;

/** 1字まるごと書ききる */
async function traceChar(page, ch, opts = {}) {
  const settle = opts.settle !== false;
  await settleRewards(page);
  await page.evaluate(c => window.__nazorin.openChar(c), ch);
  await sleep(320);
  const s0 = await state(page);
  for (let i = 0; i < s0.total; i++) await traceStroke(page, i, opts);
  await sleep(240);
  const out = { strokes: s0.total, ...(await state(page)) };
  if (out.done && settle) await settleRewards(page);
  return out;
}

/** れんしゅうのセットを1つ走りきる。1文字を REPS 回、SET 文字ぶん */
async function runSession(page, opts = {}) {
  await settleRewards(page);
  await page.evaluate(() => {
    const N = window.__nazorin;
    N.show(N.el.home);
    N.startSession();
  });
  await sleep(400);
  let traces = 0;
  for (let guard = 0; guard < 40; guard++){
    const alive = await page.evaluate(() => !!window.__nazorin.session);
    if (!alive) break;
    const n = await page.evaluate(() => window.__nazorin.tracer.strokes.length);
    for (let i = 0; i < n; i++) await traceStroke(page, i, opts);
    traces++;
    await sleep(1900);   // 1文字書けたあと、ひとりでに次へ進むのを待つ
  }
  await sleep(600);
  return traces;
}

/** 1画だけ書いて結果を返す（毎回まっさらから） */
async function tryStroke(page, ch, opts, strokeIndex = 0) {
  await dismissReward(page);
  await page.evaluate(c => window.__nazorin.openChar(c), ch);
  await sleep(300);
  await traceStroke(page, strokeIndex, opts);
  await sleep(180);
  return await state(page);
}

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage();
await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

const errors = [];
page.on("pageerror", e => errors.push(String(e)));
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("response", r => { if (r.status() >= 400) errors.push(r.status() + " " + r.url()); });

await page.goto(URL, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle0" });
const splashMs = await passSplash(page);
check("はじまりの絵が ひとりでに引く（押さなくても消える）",
  splashMs >= 0 && splashMs < 2600, splashMs < 0 ? "消えなかった" : `${splashMs}ms`);
await sleep(400);

/* ================= 1. ホームと 50音表 ================= */
// ホームに50音表は無い。表は「はっくつれんしゅう」ページへ移した（2026-09-02）
const homeShape = await page.evaluate(() => {
  const r = (s)=> { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
  return { cells: document.querySelectorAll("#screen-home .cell").length,
           gear: +r("#btn-settings").width.toFixed(1), start: +r("#btn-start").width.toFixed(1),
           resetOnHome: !!document.querySelector("#screen-home #btn-reset"),
           dig: +r('.home-card[data-go="dig"]').width.toFixed(1),
           train: +r('.home-card[data-go="train"]').width.toFixed(1),
           kana: document.querySelectorAll("#kana-switch .kana-btn").length,
           vw: window.innerWidth };
});
check("ホームに50音表は無い（表はれんしゅうページへ）", homeShape.cells === 0, `${homeShape.cells}マス`);
check("ホームのボタンは たんけん・ずかん・れんしゅう の3つ",
  homeShape.start > homeShape.vw * 0.8 && homeShape.dig > 0 && homeShape.train > 0 &&
  homeShape.start > homeShape.dig * 1.5,
  `たんけん${homeShape.start}px / ずかん${homeShape.dig}px / れんしゅう${homeShape.train}px`);
check("かなの切りかえは たんけんボタンのそば（設定の奥ではない）",
  homeShape.kana === 2 &&
  await page.evaluate(() => {
    const k = document.querySelector("#kana-switch").getBoundingClientRect();
    const s2 = document.querySelector("#btn-start").getBoundingClientRect();
    return Math.abs(k.top - s2.bottom) < 40;
  }), `${homeShape.kana}つ`);
check("設定は小さい", homeShape.gear < 80, `⚙${homeShape.gear}px`);
check("「さいしょから」はホームに出しっぱなしにしない（せっていの中）",
  homeShape.resetOnHome === false);
await shot(page, "01_home.png");

// ここから先は はっくつれんしゅう ページ
await page.evaluate(() => document.querySelector('.home-card[data-go="train"]').click());
await sleep(250);
check("はっくつれんしゅうに ひらがな46字ならぶ",
  await page.$$eval("#screen-train .cell:not(.blank)", e => e.length) === 46);
await shot(page, "01b_train.png");

await page.click('.tab[data-set="dakuon"]'); await sleep(150);
check("だくおんタブに25字", await page.$$eval(".cell:not(.blank)", e => e.length) === 25);
await page.click('.tab[data-set="seion"]'); await sleep(150);

/* ================= 2. カタカナ ================= */
await page.click('#train-kana .seg-btn[data-kana="kata"]');
await sleep(200);
const kataCells = await page.$$eval(".cell:not(.blank)", els => els.map(e => e.textContent));
check("カタカナ表に46字ならぶ", kataCells.length === 46, kataCells.slice(0, 5).join(""));
check("カタカナ表の中身がカタカナ",
  kataCells.every(c => c.codePointAt(0) >= 0x30a1 && c.codePointAt(0) <= 0x30fc));
await shot(page, "02_katakana_table.png");

await page.click('.tab[data-set="small"]'); await sleep(150);
const kataSmall = await page.$$eval(".cell:not(.blank)", els => els.map(e => e.textContent).join(""));
check("カタカナのちいさいじに「ー」がある", kataSmall.includes("ー"), kataSmall);
await page.click('.tab[data-set="seion"]'); await sleep(150);

const kataSession = await page.evaluate(() => {
  const N = window.__nazorin;
  N.startSession();
  return {
    chars: N.session.chars, kana: N.session.kana, set: N.session.set,
    current: document.querySelector("#trace-char").textContent,
    example: document.querySelector("#trace-word").textContent,
    bones: document.querySelector(".bone-dots").textContent.length,
    progress: document.querySelector("#sess").textContent
  };
});
check("カタカナも同じ5文字・3回ルールで開始する",
  kataSession.chars.length === 5 && kataSession.kana === "kata" && kataSession.set === "seion" &&
  kataSession.chars.every(c => c.codePointAt(0) >= 0x30a1 && c.codePointAt(0) <= 0x30fc),
  `${kataSession.kana}/${kataSession.set}: ${kataSession.chars.join("")}`);
check("なぞり画面に今の文字・例・5文字の発掘進捗がまとまっている",
  kataSession.current === kataSession.chars[0] && kataSession.example.length > 0 &&
  kataSession.bones === 10 && kataSession.progress.includes("5もじで ホネ発見"),
  `${kataSession.current}/${kataSession.example}/${kataSession.progress}`);
await page.click("#btn-back"); await sleep(150);

for (const ch of ["ア", "ソ", "ヲ", "ー", "ポ"]) {
  const r = await traceChar(page, ch, { jitter: 4 });
  check(`カタカナ「${ch}」(${r.strokes}画) を最後まで書ける`, r.done === true,
    `${r.cur}/${r.total}画 平均${Math.round(r.scores.reduce((a,b)=>a+b,0)/r.total)}点`);
}
await shot(page, "03_katakana_trace.png");

/* ================= 3. 筆跡が残るか ================= */
await page.evaluate(() => window.__nazorin.setKana("hira"));
const neat = await traceChar(page, "あ", { jitter: 0 });
check("ていねいに書くと完成する", neat.done === true, `${neat.cur}/${neat.total}画`);
check("自分の筆跡が残っている", neat.inks.every(n => n > 5), `画ごとの点数の数 ${neat.inks.join(",")}`);
check("実際になぞった線はターコイズ1色で読みやすい",
  await page.evaluate(() => window.__nazorin.tracer.strokes.every(s => s.color === "#169d94")));

// 保存されているのが「手本の形」ではなく「指が通った道」であること
await traceChar(page, "あ", { jitter: 9 });
const own = await page.evaluate(() => {
  const t = window.__nazorin.tracer;
  const near = (q, pts) => Math.sqrt(Math.min(...pts.map(p => (p.x-q.x)**2 + (p.y-q.y)**2)));
  const out = t.strokes.map(s => {
    const d = s.ink.map(p => near(p, s.pts));
    return { mean: +(d.reduce((a,b)=>a+b,0)/d.length).toFixed(2), max: +Math.max(...d).toFixed(2) };
  });
  return out;
});
check("残っているのは指の道（手本の形ではない）",
  own.every(o => o.mean > 1.5 && o.max > 3),
  own.map(o => `平均${o.mean} 最大${o.max}`).join(" / "));
await shot(page, "04_own_handwriting.png");

/* ================= 4. 類似度で点がつくか ================= */
console.log("\n--- 下手さと点数の関係（「あ」1画目） ---");
const table = [];
for (const jitter of [0, 4, 8, 12, 16]) {
  const st = await tryStroke(page, "あ", { jitter });
  const r = st.res || {};
  table.push({ jitter, value: r.value ?? 0, ok: !!r.ok, reason: r.reason || "-" });
  const stars = r.value >= 85 ? 3 : r.value >= 70 ? 2 : 1;
  info(`ふるえ±${String(jitter).padStart(2)} → ${String(r.value ?? 0).padStart(3)}点 ` +
       `${"★".repeat(stars)}${"☆".repeat(3-stars)}  ${r.ok ? "合格      " : "やりなおし(" + r.reason + ")"}  ` +
       `手本からの平均ズレ ${(r.meanErr ?? 0).toFixed(1)}  はみ出し ${(r.meanStray ?? 0).toFixed(1)}`);
}
console.log("");
check("ていねいに書くと高得点になる", table[0].value >= 85, `${table[0].value}点`);
check("下手になるほど点が下がる",
  table.every((t, i) => i === 0 || t.value <= table[i-1].value + 1),
  table.map(t => `±${t.jitter}:${t.value}`).join(" "));
check("すこしふるえても合格する（ゆるい判定）", table.every(t => t.ok),
  table.map(t => `±${t.jitter}:${t.value}点`).join(" "));
const stars = (v)=> v >= 85 ? 3 : v >= 70 ? 2 : 1;
check("★3は ていねいに書いたときだけ",
  stars(table[1].value) === 3 && stars(table[3].value) <= 2 && stars(table[4].value) <= 2,
  table.map(t => `±${t.jitter}:${"★".repeat(stars(t.value))}`).join(" "));
check("上手・下手で30点以上ひらく", table[0].value - table[4].value >= 30,
  `${table[0].value} → ${table[4].value}`);

/* ================= 5. やりなおしと、その理由 ================= */
const off = await tryStroke(page, "あ", { shift: 18 });
check("線と平行に18ずれたら やりなおし", off.res && !off.res.ok && off.res.reason === "off",
  `${off.res?.value}点 理由=${off.res?.reason}`);

await shot(page, "11_reject.png");   // 書いた線が残ったまま理由が出ている状態
check("やりなおしのとき 書いた線がしばらく残る",
  await page.evaluate(() => window.__nazorin.tracer.ghostAlpha > 0.9));

const rev = await tryStroke(page, "あ", { reverse: true });
check("逆向きに書いたら「はんたいむき」", rev.res && !rev.res.ok && rev.res.reason === "reverse",
  `${rev.res?.value}点 理由=${rev.res?.reason}`);

const late = await tryStroke(page, "あ", { startAt: 0.5 });
check("途中から書きはじめたら「はじめから」", late.res && !late.res.ok && late.res.reason === "start",
  `${late.res?.value}点 理由=${late.res?.reason}`);

const half = await tryStroke(page, "あ", { stopAt: 0.5 });
check("半分でやめたら「さいごまで」", half.res && !half.res.ok && half.res.reason === "short",
  `${half.res?.value}点 理由=${half.res?.reason}`);

// 書き順ちがい：1画目のところで2画目を書いても通らない
const wrong = await tryStroke(page, "あ", {}, 1);
check("2画目から書こうとしても通らない", wrong.cur === 0 && wrong.res && !wrong.res.ok,
  `cur=${wrong.cur} 理由=${wrong.res?.reason}`);

// ただのタップは何も起きない（怒られない）
await page.evaluate(() => window.__nazorin.openChar("あ"));
await sleep(300);
await page.evaluate(() => {
  const t = window.__nazorin.tracer;
  const r = t.cv.getBoundingClientRect();
  const cx = r.left + r.width/2, cy = r.top + r.height/2;
  for (const type of ["pointerdown","pointerup"])
    t.cv.dispatchEvent(new PointerEvent(type, {pointerId:1, clientX:cx, clientY:cy, bubbles:true}));
});
await sleep(200);
const tapped = await state(page);
check("ただのタップは無視される", tapped.res === null && tapped.cur === 0, `cur=${tapped.cur}`);

// やりなおしのあと、書き直せば通る
await tryStroke(page, "あ", { reverse: true });
await traceStroke(page, 0, { jitter: 3 });
await sleep(200);
check("やりなおしのあと 書き直せば進む", (await state(page)).cur === 1);

await page.click("#btn-again"); await sleep(200);
await page.click("#btn-demo"); await sleep(500);
check("おてほんが再生される", await page.evaluate(() => window.__nazorin.tracer.demoing) === true);
await shot(page, "05_demo.png");
await sleep(2600);

/* ================= 6.5 ホネあつめ ================= */
const bones = () => page.evaluate(() => window.__nazorin.bones.boneCount(window.__nazorin.dig));
const rules = await page.evaluate(() => ({ REPS: window.__nazorin.REPS, SET: window.__nazorin.SET }));

// はっくつれんしゅうは「えらぶ → 確かめる → 3回で終わり」
await page.evaluate(() => {
  const N = window.__nazorin;
  N.show(N.el.train);
  N.setKana("kata");
  N.setCategory("seion");
});
await settleRewards(page);        // 前のセットのごほうびが開いたままだと、次が出せない
await page.evaluate(() => { window.__nazorin.show(window.__nazorin.el.train); });
await sleep(200);
const beforePick = await page.$eval("#btn-train-go", e => e.disabled);
await page.evaluate(() => [...document.querySelectorAll("#grid .cell")].find(b => b.textContent === "ア").click());
await sleep(200);
const picked = await page.evaluate(() => ({
  disabled: document.querySelector("#btn-train-go").disabled,
  label: document.querySelector("#btn-train-go").textContent,
  onGrid: [...document.querySelectorAll("#grid .cell.is-picked")].map(e => e.textContent).join(""),
  started: window.__nazorin.session?.mode === "practice"
}));
check("字を押しただけでは始まらない（えらんだ印がつく）",
  beforePick === true && picked.disabled === false && picked.onGrid === "ア" && !picked.started,
  `ボタン「${picked.label}」`);
await page.evaluate(() => document.querySelector("#btn-train-go").click());
await sleep(350);
const free0 = await bones();
const practiceSteps = [];
for (let rep = 0; rep < rules.REPS; rep++){
  const n = await page.evaluate(() => window.__nazorin.tracer.strokes.length);
  for (let i = 0; i < n; i++) await traceStroke(page, i, { jitter: 3 });
  await sleep(2100);
  practiceSteps.push(await page.evaluate(() => ({
    ch: window.__nazorin.char,
    rep: window.__nazorin.session?.rep,
    mode: window.__nazorin.session?.mode,
    over: !window.__nazorin.session,
    nextHidden: document.querySelector("#btn-next").classList.contains("is-hidden")
  })));
}
// 以前は ア→イ→ウ… と表を無限に流れていた。「ぬを繰り返したい」に一度も応えられず、
// 終わりも無かった。いまは えらんだ字だけ3回で終わる
check("はっくつれんしゅうは えらんだ字だけを3回書いて終わる",
  practiceSteps[0].ch === "ア" && practiceSteps[0].rep === 1 && !practiceSteps[0].over &&
  practiceSteps[1].ch === "ア" && practiceSteps[1].rep === 2 && !practiceSteps[1].over &&
  practiceSteps[2].over === true &&
  practiceSteps.slice(0, 2).every(s => s.mode === "practice" && s.nextHidden),
  practiceSteps.map(s => s.over ? "おわり" : `${s.ch}:${s.rep}`).join(" → "));
check("はっくつれんしゅうでは ホネはもらえない", (await bones()) === free0, `${free0} → ${await bones()}`);
// ごほうびは「3回目の判定 → 1.7秒で進む → さらに0.5秒」で出る。出るまで待つ
for (let i = 0; i < 30; i++){
  if (await page.$eval("#reward", e => e.classList.contains("is-on"))) break;
  await sleep(200);
}
const afterPractice = await page.evaluate(() => ({
  reward: document.querySelector("#reward").classList.contains("is-on"),
  title: document.querySelector("#reward-title").textContent,
  recent: [...document.querySelectorAll("#recent-list span")].map(e => e.textContent).join("")
}));
check("3かい書けたら「なぞれた！」が出て、さいきんの もじに残る",
  afterPractice.reward && afterPractice.title.includes("3かい") && afterPractice.recent.includes("ア"),
  `${afterPractice.title} / さいきん:${afterPractice.recent}`);
await settleRewards(page);
check("れんしゅうのあとは れんしゅうページに もどる",
  await page.$eval("#screen-train", e => e.classList.contains("is-on")));
await page.evaluate(() => document.querySelector("#btn-train-back").click());
await sleep(250);
await page.evaluate(() => window.__nazorin.setKana("hira"));

// セットを1つ走りきると ホネが1個
const b0 = await bones();
await page.evaluate(() => { window.__nazorin.rewardLog.length = 0; });
const traces = await runSession(page, { jitter: 4 });
const b1 = await bones();
check(`1文字を${rules.REPS}回・${rules.SET}文字で 1セット`,
  traces === rules.REPS * rules.SET, `${traces}回なぞった（想定 ${rules.REPS * rules.SET}）`);
check("セットを1つ終えると ホネが1こ", b1 === b0 + 1, `${b0} → ${b1}`);
const log1 = await page.evaluate(() => window.__nazorin.rewardLog.map(r => r.title));
check("セットの終わりに ごほうび画面が出る", log1.length >= 1, log1.join(" → ") || "なし");
const ownResult = await page.evaluate(() => {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("nazorin.handwriting.v1")); } catch {}
  const latest = saved && saved.sessions && saved.sessions.at(-1);
  return {
    title: document.querySelector("#reward-title").textContent,
    cards: document.querySelectorAll("#reward-handwriting .hand-card canvas").length,
    savedChars: latest && latest.characters ? latest.characters.length : 0,
    hasPoints: !!(latest && latest.characters && latest.characters.every(c =>
      c.strokes.length && c.strokes.every(s => s.points.length > 1)))
  };
});
check("練習終了後に 自分が書いた5文字が並ぶ",
  ownResult.title.includes("じぶんで かいた") && ownResult.cards === rules.SET,
  `${ownResult.title} / ${ownResult.cards}枚`);
check("筆跡が再利用できる点列として保存される",
  ownResult.savedChars === rules.SET && ownResult.hasPoints,
  `${ownResult.savedChars}文字 / 点列=${ownResult.hasPoints}`);
await shot(page, "15_session_handwriting_result.png");

// れんしゅう中は「つぎ」で飛ばせない（飛ばせると書かずにホネがもらえる）
await settleRewards(page);
await page.evaluate(() => { const N = window.__nazorin; N.show(N.el.home); N.startSession(); });
await sleep(400);
const skip = await page.evaluate(() => {
  const btn = document.querySelector("#btn-next");
  return { hidden: btn.classList.contains("is-hidden"),
           shown: btn.getBoundingClientRect().width > 0 };
});
check("れんしゅう中は「つぎ」で飛ばせない", skip.hidden && !skip.shown, JSON.stringify(skip));
await page.evaluate(() => document.querySelector("#btn-back").click());
await sleep(300);
check("はっくつれんしゅう中も「つぎ」は隠れている",
  await page.evaluate(() => { window.__nazorin.startPractice("た");
    return document.querySelector("#btn-next").classList.contains("is-hidden") &&
      window.__nazorin.session.mode === "practice" &&
      window.__nazorin.session.chars.length === 1; }));
await page.evaluate(() => document.querySelector("#btn-back").click());
await sleep(200);
await shot(page, "14_set_done.png");
await settleRewards(page);

// 点数は報酬にひびかない。へたに書いてもセットを終えれば もらえる
const b2 = await bones();
await runSession(page, { jitter: 16 });   // わざと下手に
const b3 = await bones();
check("へたに書いても ホネはもらえる（点数は報酬にひびかない）", b3 === b2 + 1, `${b2} → ${b3}`);
await settleRewards(page);

/* --- きょうりゅう ずかん --- */
// 見たい状態を作ってから見る（そろった1体・あと1こ1体・手つかず1体）
await page.evaluate(() => {
  const N = window.__nazorin, B = N.bones;
  N.dig.slots = {
    stegosaurus:   ["head","body","forelimb","hindlimb","tail"],
    ankylosaurus:  ["body","forelimb","hindlimb","tail"],
    brachiosaurus: ["body","tail"],
    triceratops:   ["hindlimb"],
    iguanodon:     [],
    tyrannosaurus: []
  };
  N.dig.done = ["stegosaurus"];
  B.saveDig(N.dig);
  N.renderDig();
  document.querySelector('.nav-btn[data-go="dig"]').click();
});
await sleep(400);
check("きょうりゅうずかんがひらく",
  await page.$eval("#screen-dig", e => e.classList.contains("is-on")));

const cards = await page.evaluate(() => [...document.querySelectorAll("#dig .page.dino")].map(c => ({
  name:  c.querySelector(".page-title").textContent,
  count: c.querySelector(".count").textContent,
  ribbon:(c.querySelector(".ribbon") || {}).textContent || "",
  no:    c.querySelector(".dino-no")?.textContent || "",
  slots: c.querySelectorAll(".slot").length,
  has:   c.querySelectorAll(".slot.has").length,
  art:   !!c.querySelector(".dino-full")
})));
check("6体ぶんならぶ", cards.length === 6, cards.map(c => `${c.name}${c.count}`).join(" "));
// 並びは番号順なので「いちばん上がそろった1体」ではない。数と中身で見る
check("そろった1体だけ 全体像が見える",
  cards.filter(c => c.art).length === 1 &&
  cards.filter(c => c.art)[0].count === "5/5",
  cards.filter(c => c.art).map(c => `${c.no} ${c.name}`).join(",") || "なし");
check("完成カードにも集めた5つのパーツが小さく残る",
  await page.$eval("#dig .page.dino.full", c =>
    c.querySelectorAll(".complete-part").length === 5 &&
    c.querySelector(".complete-parts-title").textContent.includes("5つ")));
// 番号は最初から見えていて、名前だけ そろうまで隠す（2026-09-02に方針を変えた）
check("01〜06 の番号が最初から見えている",
  cards.map(c => c.no).join(",") === "01,02,03,04,05,06", cards.map(c => c.no).join(","));
check("番号順にならぶ（そろった順ではない）",
  cards[0].no === "01" && cards[5].no === "06");
check("そろうまで 名前は出ない",
  cards.filter(c => c.count !== "5/5").every(c => c.name === "？？？？") &&
  cards.filter(c => c.count === "5/5").every(c => c.name !== "？？？？"),
  cards.map(c => `${c.no}:${c.name}${c.count}`).join(" "));
check("掘りかけには「あと n こで しょうたいが わかる」が出る",
  await page.$eval("#dig", d => [...d.querySelectorAll(".dino-left")]
    .some(e => /あと \d+こで しょうたいが わかる/.test(e.textContent))));
check("あと1この恐竜に しるしが出る",
  cards.some(c => c.ribbon.includes("あと 1こ") && c.count === "4/5"),
  cards.map(c => c.ribbon).filter(Boolean).join(" / "));
check("手つかずの恐竜は マスも出さない",
  cards.some(c => c.name === "？？？？" && c.count === "0/5" && c.slots === 0));
check("途中の恐竜は 取ったマスだけ うまっている",
  cards.filter(c => c.slots > 0).every(c => c.has === Number(c.count.split("/")[0])),
  cards.filter(c => c.slots > 0).map(c => `${c.name} ${c.has}/${c.slots}`).join(" "));
check("ホネの合計が出る",
  /^\s*12\s*\/\s*30\s*$/.test(await page.$eval("#dig-total", e => e.textContent)),
  await page.$eval("#dig-total", e => e.textContent));
await shot(page, "13_zukan.png");

const detailLocks = await page.evaluate(() => ({
  buttons: document.querySelectorAll("#dig .dino-open").length,
  incompleteOpen: window.__nazorin.openDinoDetail("ankylosaurus", { updateHistory:false }),
  detailOn: document.querySelector("#screen-dino").classList.contains("is-on")
}));
check("詳細ボタンは完成した恐竜だけに出る", detailLocks.buttons === 1, `${detailLocks.buttons}個`);
check("未完成恐竜はURLや関数からも詳細を開けない",
  detailLocks.incompleteOpen === false && detailLocks.detailOn === false, JSON.stringify(detailLocks));

await page.evaluate(() => window.__nazorin.openDinoDetail("stegosaurus"));
await sleep(300);
const detailBone = await page.evaluate(() => ({
  on: document.querySelector("#screen-dino").classList.contains("is-on"),
  name: document.querySelector("#dino-detail-name").textContent,
  url: new URLSearchParams(location.search).get("dino"),
  bone: !!document.querySelector("#dino-detail-art .bone-art"),
  selected: document.querySelector("#detail-tab-bone").getAttribute("aria-selected")
}));
check("完成済み恐竜の詳細ページへ移動できる",
  detailBone.on && detailBone.name === "ステゴサウルス" && detailBone.url === "stegosaurus",
  JSON.stringify(detailBone));
check("詳細ページでは全身骨格が最初に見える", detailBone.bone && detailBone.selected === "true");
await page.click("#detail-tab-life"); await sleep(180);
const detailLife = await page.evaluate(() => ({
  selected: document.querySelector("#detail-tab-life").getAttribute("aria-selected"),
  image: document.querySelector("#dino-detail-art img")?.getAttribute("src") || "",
  facts: document.querySelectorAll("#dino-detail-facts dd").length,
  source: document.querySelector("#dino-detail-source")?.href || ""
}));
check("骨格と復元表示を切り替えられる",
  detailLife.selected === "true" && detailLife.image.endsWith("stegosaurus_restoration.webp"));
check("説明・基本情報・出典が恐竜データから表示される",
  detailLife.facts === 4 && detailLife.source.includes("nhm.ac.uk"), JSON.stringify(detailLife));
await shot(page, "16_dino_detail.png");

await page.reload({ waitUntil:"networkidle0" }); await passSplash(page); await sleep(300);
const detailReload = await page.evaluate(() => ({
  on: document.querySelector("#screen-dino").classList.contains("is-on"),
  name: document.querySelector("#dino-detail-name").textContent,
  complete: window.__nazorin.bones.isComplete(
    window.__nazorin.dig,
    window.__nazorin.bones.DINOS.find(d => d.id === "stegosaurus"))
}));
check("リロード後も完成状態と詳細ページを維持する",
  detailReload.on && detailReload.complete && detailReload.name === "ステゴサウルス", JSON.stringify(detailReload));
await page.click("#btn-dino-back"); await sleep(200);
check("詳細ページから図鑑一覧へ戻れる",
  await page.$eval("#screen-dig", e => e.classList.contains("is-on")) &&
  !new URLSearchParams(await page.evaluate(() => location.search)).has("dino"));
await page.click('.nav-btn[data-go="home"]'); await sleep(250);

// ルールだけを直接まわす（なぞりを何十回もやらずに済む）
const rule = await page.evaluate(() => {
  const B = window.__nazorin.bones;
  const d = { slots: Object.fromEntries(B.DINOS.map(x => [x.id, []])), done: [] };
  const seen = new Set(), dup = [], order = [];
  let headAlwaysLast = true, n = 0;
  for (; n < 200; n++){
    const pick = B.drawBone(d);
    if (!pick) break;
    const key = pick.dino.id + ":" + pick.part;
    if (seen.has(key)) dup.push(key);
    seen.add(key);
    const before = B.gotParts(d, pick.dino).length;
    const r = B.addBone(d, pick);
    if (pick.part === "head" && before !== 4) headAlwaysLast = false;
    if (r && r.complete) order.push(r.dino.name);
  }
  // いろんな恐竜が並行して進むか（最初の10個が何体にまたがるか）
  const firstTen = [...seen].slice(0, 10).map(k => k.split(":")[0]);
  return { n, dup, headAlwaysLast, done: order.length,
           spread: new Set(firstTen).size, after: B.drawBone(d) };
});
check("30こで6体そろう", rule.n === 30 && rule.done === 6, `${rule.n}こ / ${rule.done}体`);
check("ダブりが出ない", rule.dup.length === 0, rule.dup.join(",") || "なし");
check("あたまは その恐竜の残り4つがそろうまで出ない", rule.headAlwaysLast === true);
check("いろんな恐竜が同時に進む（1体ずつではない）", rule.spread >= 2,
  `はじめの10こが ${rule.spread}体にまたがる`);
check("ぜんぶ掘ったら それ以上は出ない", rule.after === null, String(rule.after));

// 名前をそろうまで隠す作りなので、1体目が遅すぎると ずっと ???? のままになる。
// 均等に引くと1体目は20個目だった（実測）。そろいかけを重く引いて10個目まで縮めてある。
const pace = await page.evaluate(() => {
  const B = window.__nazorin.bones;
  const first = [], spread = [];
  for (let i = 0; i < 600; i++){
    const d = { slots: Object.fromEntries(B.DINOS.map(x => [x.id, []])), done: [] };
    let got = 0;
    for (let n = 1; n <= 30; n++){
      const pick = B.drawBone(d);
      const r = B.addBone(d, pick);
      if (n === 5) spread.push(B.DINOS.filter(x => B.gotParts(d, x).length > 0).length);
      if (r && r.complete && !got){ got = n; }
    }
    first.push(got);
  }
  const med = (a)=> [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
  return { first: med(first), worst: Math.max(...first),
           spread: +(spread.reduce((s,x)=>s+x,0)/spread.length).toFixed(1) };
});
check("1体目の正体が 10セットあたりで わかる", pace.first <= 13 && pace.worst <= 22,
  `中央 ${pace.first}個目 / いちばん遅くて ${pace.worst}個目`);
check("それでも 複数の恐竜が同時に埋まっていく", pace.spread >= 2.2,
  `5個目の時点で 平均${pace.spread}体が掘りかけ`);

/* --- マスを押したら きろくが出る（5さいが押していた） --- */
await page.evaluate(() => {
  const N = window.__nazorin, B = N.bones;
  const d = B.DINOS[0];
  N.dig.slots = Object.fromEntries(B.DINOS.map(x => [x.id, []]));
  N.dig.slots[d.id] = ["body", "tail"];
  N.dig.done = [];
  N.dig.log = { [B.logKey(d, "body")]: { day: "2026-08-30", chars: ["あ","い","う","え","お"], sid: "x" } };
  B.saveDig(N.dig);
  N.renderDig();
  document.querySelector('.nav-btn[data-go="dig"]').click();
});
await sleep(400);

check("ずかんのマスは 押せる",
  await page.$$eval("#dig .slot", els => els.length > 0 && els.every(e => e.tagName === "BUTTON")));

// 取れているマス → いつ・どの文字で掘ったかが出る
await page.evaluate(() => {
  const s = [...document.querySelectorAll("#dig .slot.has")];
  s.find(e => e.textContent.includes("どう")).click();
});
await sleep(350);
const sheet = await page.evaluate(() => ({
  open:  document.querySelector("#part-sheet").classList.contains("is-on"),
  title: document.querySelector("#part-title").textContent,
  day:   document.querySelector("#part-day").textContent,
  chars: [...document.querySelectorAll("#part-hand .sheet-char, #part-hand canvas")].length,
  art:   !!document.querySelector("#part-art .bone-art")
}));
check("取れたマスを押すと きろくが出る",
  sheet.open && sheet.art && /ほりだした/.test(sheet.day) && sheet.chars === 5,
  `${sheet.title} / ${sheet.day} / もじ${sheet.chars}`);
check("そろっていない恐竜の きろくでも 名前は出ない",
  /？？？？/.test(await page.$eval("#part-dino", e => e.textContent)),
  await page.$eval("#part-dino", e => e.textContent));
check("ほりだした日が 子ども向けに出る", /8がつ 30にち/.test(sheet.day), sheet.day);
await shot(page, "16_part_record.png");
await page.click("#part-close"); await sleep(250);
check("とじられる", await page.$eval("#part-sheet", e => !e.classList.contains("is-on")));

// まだのマスも 押したら反応する（無反応がいちばん伝わらない）
await page.evaluate(() => document.querySelector("#dig .slot:not(.has)").click());
await sleep(300);
const yet = await page.evaluate(() => ({
  open: document.querySelector("#part-sheet").classList.contains("is-on"),
  note: document.querySelector("#part-note").textContent
}));
check("まだのマスを押しても 反応がある", yet.open && /さがそう/.test(yet.note), yet.note);
await page.click("#part-close"); await sleep(200);

// 並び：そろった → 掘りかけ → 手つかず
await page.evaluate(() => {
  const N = window.__nazorin, B = N.bones;
  N.dig.slots[B.DINOS[1].id] = [...B.ALL_PARTS];
  N.dig.done = [B.DINOS[1].id];
  B.saveDig(N.dig); N.renderDig();
});
await sleep(350);
const order = await page.evaluate(() => [...document.querySelectorAll("#dig .page.dino")].map(c => ({
  n: c.querySelector(".page-title").textContent,
  c: c.querySelector(".count").textContent
})));
check("並びは番号順（そろっても場所が動かない）",
  order[1].c === "5/5" && order[0].c === "2/5",
  order.map(o => o.c).join(" "));

/* ================= 7. データ ================= */
const dataOk = await page.evaluate(async () => {
  const m = await import("./data/kana.js");
  const w = await import("./js/words.js");
  const t = window.__nazorin.tracer;
  const bad = [];
  for (const [ch, d] of Object.entries(m.KANA)) {
    if (!d.s.length || d.s.length !== d.n.length) { bad.push(ch + ":番号"); continue; }
    for (const p of d.s) {
      t.mp.setAttribute("d", p);
      if (!(t.mp.getTotalLength() > 3)) { bad.push(ch + ":短すぎ"); break; }
    }
  }
  const listed = [...Object.values(w.SETS.hira).flat(), ...Object.values(w.SETS.kata).flat()].filter(Boolean);
  return { count: Object.keys(m.KANA).length, bad,
           noWord: listed.filter(c => !w.WORDS[c]), noShape: listed.filter(c => !m.KANA[c]) };
});
check("178字ぶんのストロークが健全", dataOk.count === 178 && dataOk.bad.length === 0,
  `${dataOk.count}字 / 異常:${dataOk.bad.join(",") || "なし"}`);
check("表にならぶ字は ことばも形もそろっている",
  dataOk.noWord.length === 0 && dataOk.noShape.length === 0,
  `ことば欠け:${dataOk.noWord.join("") || "なし"} 形欠け:${dataOk.noShape.join("") || "なし"}`);

// 仮の骨が描画枠からはみ出していないか（はみ出すと黙って切り取られる）
const strayArt = await page.evaluate(async () => {
  const art = await import("./js/boneart.js");
  const m   = await import("./assets/manifest.js");
  const over = [];
  for (const key of Object.keys(m.ART)){
    const cv = art.drawBone(key, 200);
    const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width;
    let x0 = W, y0 = W, x1 = -1, y1 = -1;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++){
      if (d[(y*W + x)*4 + 3] > 16){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    }
    if (x1 < 0){ over.push(key + ":空"); continue; }
    if (x0 <= 1 || y0 <= 1 || x1 >= W-2 || y1 >= W-2) over.push(key);
  }
  return over;
});
check("仮の骨が枠からはみ出していない", strayArt.length === 0, strayArt.join(",") || "なし");

const webpAssets = await page.evaluate(async () => {
  const m = await import("./assets/manifest.js");
  const files = Object.values(m.ART).filter(Boolean);
  const status = await Promise.all(files.map(async f => ({ f, ok: (await fetch("./assets/bones/" + f)).ok })));
  return { files, failed: status.filter(x => !x.ok).map(x => x.f) };
});
check("配信用の骨画像は WebPでそろっている",
  webpAssets.files.length === 23 && webpAssets.files.every(f => f.endsWith(".webp")) && webpAssets.failed.length === 0,
  `${webpAssets.files.length}枚 / 読込失敗:${webpAssets.failed.join(",") || "なし"}`);

const restorations = await page.evaluate(async () => {
  const B = await import("./js/bones.js");
  const files = B.DINOS.map(d => d.detail && d.detail.restorationArt).filter(Boolean);
  const status = await Promise.all(files.map(async f => ({ f, ok:(await fetch("./assets/dinosaurs/" + f)).ok })));
  return { files, failed:status.filter(x => !x.ok).map(x => x.f), facts:B.DINOS.map(d => Object.values(d.detail.facts).filter(Boolean).length) };
});
check("6体の復元画は軽量WebPでそろっている",
  restorations.files.length === 6 && restorations.files.every(f => f.endsWith(".webp")) && restorations.failed.length === 0,
  `${restorations.files.length}枚 / 読込失敗:${restorations.failed.join(",") || "なし"}`);
check("6体に4項目の基本情報がある", restorations.facts.every(n => n === 4), restorations.facts.join(","));
const periodLabels = await page.evaluate(async () => {
  const B = await import("./js/bones.js");
  return B.DINOS.map(d => d.detail.facts.period);
});
check("生きていた年代に漢字やカタカナが残っていない",
  periodLabels.every(label => !/[一-龠々〆ヵヶァ-ヶ]/.test(label)), periodLabels.join(" / "));

await page.goto(URL.replace(/\/?$/, "/") + "triceratops-complete.html", { waitUntil: "networkidle0" });
await passSplash(page);
const triDemo = await page.evaluate(() => {
  const card = [...document.querySelectorAll("#dig .page.dino")].find(c => c.querySelector(".dino-full"));
  return {
    path: location.pathname,
    demo: new URLSearchParams(location.search).get("demo"),
    digOn: document.querySelector("#screen-dig").classList.contains("is-on"),
    name: card?.querySelector(".page-title")?.textContent,
    count: card?.querySelector(".count")?.textContent,
    full: !!card,
    total: document.querySelector("#dig-total")?.textContent
  };
});
check("トリケラトプス完成状態の専用ページが開く",
  triDemo.demo === "triceratops-complete" && triDemo.digOn && triDemo.name === "トリケラトプス" &&
  triDemo.count === "5/5" && triDemo.full && /^\s*5\s*\/\s*30\s*$/.test(triDemo.total),
  JSON.stringify(triDemo));

const addedDinoDemos = [];
for (const [id, name] of [
  ["stegosaurus", "ステゴサウルス"],
  ["ankylosaurus", "アンキロサウルス"],
  ["iguanodon", "イグアノドン"],
  ["brachiosaurus", "ブラキオサウルス"],
  ["tyrannosaurus", "ティラノサウルス"]
]) {
  await page.goto(URL.replace(/\/?$/, "/") + `${id}-complete.html`, { waitUntil:"networkidle0" });
  await passSplash(page);
  addedDinoDemos.push(await page.evaluate(([expectedId, expectedName]) => {
    // 番号順にならぶので、先頭ではなく「そろっているカード」を探す
    const card = [...document.querySelectorAll("#dig .page.dino")].find(c => c.querySelector(".dino-full"));
    return {
      id: expectedId,
      name: card?.querySelector(".page-title")?.textContent,
      expectedName,
      count: card?.querySelector(".count")?.textContent,
      full: card?.querySelector(".dino-full img")?.getAttribute("src") || "",
      parts: [...(card?.querySelectorAll(".complete-part img") || [])].map(img => img.getAttribute("src"))
    };
  }, [id, name]));
}
check("追加5体の完成確認ページが開く",
  addedDinoDemos.every(d => d.name === d.expectedName && d.count === "5/5" &&
    d.full.endsWith(`full_${d.id}.webp`) && d.parts.length === 5 && d.parts.every(Boolean)),
  JSON.stringify(addedDinoDemos));
check("ティラノの4部位は二足恐竜共通セットを使う",
  ["biped_body.webp", "biped_fore.webp", "biped_hind.webp", "biped_tail.webp"].every(file =>
    addedDinoDemos.find(d => d.id === "tyrannosaurus").parts.some(src => src.endsWith(file))),
  addedDinoDemos.find(d => d.id === "tyrannosaurus").parts.join(","));

/* --- とちゅうでやめても つづきから戻れる（5さいの誤タップ対策） --- */
await settleRewards(page);
await page.evaluate(() => { const N = window.__nazorin; N.show(N.el.home); N.startSession(); });
await sleep(400);
{
  // 2文字目の途中まで進める
  const n = await page.evaluate(() => window.__nazorin.tracer.strokes.length);
  for (let i = 0; i < n; i++) await traceStroke(page, i, { jitter: 3 });
  await sleep(1900);
}
const midway = await page.evaluate(() => {
  const s = window.__nazorin.session;
  return s ? { i: s.i, rep: s.rep, chars: s.chars.length } : null;
});
check("れんしゅうが すすんでいる", !!midway && (midway.i > 0 || midway.rep > 0),
  JSON.stringify(midway));

await page.evaluate(() => document.querySelector("#btn-back").click());
await sleep(350);
const held = await page.evaluate(() => ({
  home:    document.querySelector("#screen-home").classList.contains("is-on"),
  alive:   !!window.__nazorin.session,
  paused:  !!(window.__nazorin.session && window.__nazorin.session.paused),
  label:   document.querySelector("#start-main").textContent.trim(),
  sub:     document.querySelector("#start-sub").textContent.trim(),
  restart: !document.querySelector("#btn-restart").classList.contains("is-hidden")
}));
check("とちゅうで もどっても れんしゅうが消えない",
  held.home && held.alive && held.paused, JSON.stringify(held));
check("ホームが「つづきから」になる",
  /つづきから/.test(held.label) && /もじめ/.test(held.sub) && held.restart,
  `${held.label} / ${held.sub}`);

await page.evaluate(() => document.querySelector("#btn-start").click());
await sleep(400);
const resumed = await page.evaluate(() => {
  const s = window.__nazorin.session;
  return { trace: document.querySelector("#screen-trace").classList.contains("is-on"),
           i: s && s.i, rep: s && s.rep, paused: !!(s && s.paused) };
});
check("つづきから おなじ場所で 再開する",
  resumed.trace && !resumed.paused && resumed.i === midway.i && resumed.rep === midway.rep,
  JSON.stringify(resumed));

await page.evaluate(() => document.querySelector("#btn-back").click());
await sleep(300);
await page.evaluate(() => document.querySelector("#btn-restart").click());
await sleep(400);
const restarted = await page.evaluate(() => {
  const s = window.__nazorin.session;
  return { i: s && s.i, rep: s && s.rep, paused: !!(s && s.paused) };
});
check("「さいしょから」で 最初にもどる",
  restarted.i === 0 && restarted.rep === 0 && !restarted.paused, JSON.stringify(restarted));
await page.evaluate(() => { window.__nazorin.session && document.querySelector("#btn-back").click(); });
await sleep(250);
await page.evaluate(() => { const N = window.__nazorin; N.show(N.el.home); document.querySelector("#btn-restart").classList.add("is-hidden"); });

/* --- かたちを見ているか（5さいが「す」を「ナ」のように書いて通った） --- */
const shapeCheck = await page.evaluate(async () => {
  const t = window.__nazorin.tracer;
  const m = await import("./data/kana.js");
  const w = await import("./js/words.js");
  const chars = [...new Set([...Object.values(w.SETS.hira).flat(),
                             ...Object.values(w.SETS.kata).flat()])].filter(Boolean);
  // その画を「始点から終点まで まっすぐ」引いただけの線
  const straight = (s) => {
    const a = s.pts[0], z = s.pts[s.pts.length - 1];
    return Array.from({ length: 20 }, (_, k) => ({
      x: a.x + (z.x - a.x) * k / 19, y: a.y + (z.y - a.y) * k / 19 }));
  };
  // 手のふるえ（線に直角）
  const wobble = (s, jit) => {
    const span = s.pts.length - 1;
    return s.pts.map((q, k) => {
      const q0 = s.pts[Math.max(0, k-1)], q1 = s.pts[Math.min(span, k+1)];
      const tx = q1.x - q0.x, ty = q1.y - q0.y, L = Math.hypot(tx, ty) || 1;
      const wv = Math.sin(Math.PI * k / span);
      const off = jit * wv * (0.75 * Math.sin(k*0.28 + 1.1) + 0.25 * Math.sin(k*1.3));
      return { x: q.x + (-ty/L)*off, y: q.y + (tx/L)*off };
    });
  };

  let straightPass = 0, wobbleFail = 0, wobbleTotal = 0;
  for (const ch of chars){
    t.load(m.KANA[ch]);
    for (const s of t.strokes){
      const r = t.score(straight(s), s);
      if (r && r.ok) straightPass++;
      for (const j of [0, 4, 8, 12, 16]){
        const g = t.score(wobble(s, j), s);
        wobbleTotal++;
        if (!g || !g.ok) wobbleFail++;
      }
    }
  }
  // 報告そのもの：「す」の2画目を「ナ」のように まっすぐ書く
  t.load(m.KANA["す"]);
  const su = t.score(straight(t.strokes[1]), t.strokes[1]);
  return { straightPass, wobbleFail, wobbleTotal,
           su: { ok: su.ok, reason: su.reason, flow: +su.meanFlow.toFixed(1) } };
});
check("「す」を「ナ」のように まっすぐ書くと通らない",
  shapeCheck.su.ok === false && shapeCheck.su.reason === "shape",
  `理由=${shapeCheck.su.reason} 形のズレ${shapeCheck.su.flow}`);
check("ていねい〜かなり下手（±16）まで、正しい形はぜんぶ通る",
  shapeCheck.wobbleFail === 0, `落ちた ${shapeCheck.wobbleFail}/${shapeCheck.wobbleTotal}`);
check("まっすぐ引くだけで通るのは もともと直線の画だけ",
  shapeCheck.straightPass <= 345,
  `${shapeCheck.straightPass}本（曲がった画は止まる）`);

/* ================= キャラ ================= */
// まだ字が読めない子に、★とやりなおしの理由を顔で伝えている。
// 出ているか・変わるか・書くマスを狭めていないか の3つを見る。
{
  await settleRewards(page);
  await page.evaluate(() => { const N = window.__nazorin; N.show(N.el.home); N.startSession(); });
  await sleep(400);

  const box = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); const b = e.getBoundingClientRect();
                         return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { buddy: r("#buddy"), wrap: r(".canvas-wrap"), stage: r(".stage"),
             shown: document.querySelector("#buddy").classList.contains("is-on") };
  });
  check("なぞる画面に 相棒が出る",
    box.shown && box.buddy.h >= 72, `${box.buddy.h}px`);
  check("相棒は 字を書くマスの下（板を小さくしていない）",
    box.buddy.t >= box.wrap.b && box.buddy.b <= box.stage.b + 1,
    `板の下端${box.wrap.b} / 相棒${box.buddy.t}-${box.buddy.b} / 土の下端${box.stage.b}`);

  const faceOf = () => page.evaluate(() => window.__nazorin.buddy().src);
  await traceStroke(page, 0, { reverse: true });
  await sleep(200);
  const badFace = await faceOf();
  check("ちがう線を書くと 相棒が こまった顔になる",
    badFace === "ny_hmm.webp" || badFace === "ny_oops.webp", badFace);

  await page.evaluate(() => window.__nazorin.tracer.reset());
  await traceStroke(page, 0);
  await sleep(200);
  const goodFace = await faceOf();
  check("ていねいに書くと 相棒が よろこぶ顔になる",
    goodFace === "ny_great.webp" || goodFace === "ny_good.webp", goodFace);

  // ホネのふきだしが顔に重なっていた（相棒を入れて初めて起きた）
  await page.evaluate(() => {
    const N = window.__nazorin, B = N.bones;
    N.popBone(B.DINOS[0], "body");
  });
  await sleep(300);
  const overlap = await page.evaluate(() => {
    const a = document.querySelector("#bone-pop").getBoundingClientRect();
    const b = document.querySelector("#buddy").getBoundingClientRect();
    return { pop: Math.round(a.bottom), face: Math.round(b.top),
             hit: a.bottom > b.top && a.top < b.bottom };
  });
  check("ホネのふきだしが 相棒の顔に かぶらない",
    !overlap.hit, `ふきだし下端${overlap.pop} / 顔の上端${overlap.face}`);
  await shot(page, "20_buddy.png");

  await page.evaluate(() => { const N = window.__nazorin; N.show(N.el.home); });
}

/* ================= せってい（おうちのひと向け） ================= */
// 外へ出るリンクは、子どもが踏まない場所に置く。ホーム画面から起動したPWAだと
// ブラウザが開いてアプリに戻れなくなる
{
  await settleRewards(page);
  await page.evaluate(() => { const N = window.__nazorin; N.show(N.el.home); N.renderHome(); });
  await sleep(150);
  await page.evaluate(() => document.querySelector("#btn-settings").click());
  await sleep(250);
  const set = await page.evaluate(() => {
    const a = document.querySelector("#lab-link");
    return { on: document.querySelector("#screen-settings").classList.contains("is-on"),
             href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"),
             tap: Math.round(Math.min(a.getBoundingClientRect().width, a.getBoundingClientRect().height)),
             reset: !!document.querySelector("#screen-settings #btn-reset"),
             bones: document.querySelector("#set-bones").textContent,
             stars: document.querySelector("#set-stars").textContent,
             kanji: /[一-龠]/.test(document.querySelector(".set-lab p").textContent) };
  });
  check("⚙ で せってい が開き、ラボへの入口がある",
    set.on && set.href.startsWith("https://yokobo-ai-lab.vercel.app/experiments") && set.reset,
    set.href);
  check("外へ出るリンクは 新しいタブ＋noopener", set.target === "_blank" && (set.rel || "").includes("noopener"),
    `${set.target} / ${set.rel}`);
  check("せっていに この端末の記録が出る",
    /\d+ \/ 30/.test(set.bones) && /\d+ \/ 46/.test(set.stars), `${set.bones} / ${set.stars}`);
  // ほかの画面は全部ひらがな。ここだけ漢字＝見た目で「大人のページ」と分かる
  check("せっていだけ漢字で書いてある", set.kanji === true);
  check("ラボへのボタンが押せる大きさ", set.tap >= 44, `${set.tap}px`);
  await shot(page, "22_settings.png");
  await page.evaluate(() => document.querySelector("#btn-settings-back").click());
  await sleep(200);
}

/* ================= 読み上げの声 ================= */
// 焼いた声（VOICEVOX:春歌ナナ）が全字ぶんそろっているか、鳴る長さがあるか。
// 無音を焼き損じても画面には何も出ないので、静かに壊れる側＝検査で止める。
{
  const APP2 = path.join(HERE, "..", "app");
  const idxFile = path.join(APP2, "assets", "voice.json");
  const opFile  = path.join(APP2, "assets", "voice.opus");
  const has = fs.existsSync(idxFile) && fs.existsSync(opFile);
  check("焼いた声が置いてある", has,
    has ? `${Math.round(fs.statSync(opFile).size/1024)}KB` : "まだ焼いていない");

  if (has){
    const idx = JSON.parse(fs.readFileSync(idxFile, "utf8"));
    const need = await page.evaluate(async () => {
      const w = await import("./js/words.js");
      const B = await import("./js/bones.js");
      const chars = [];
      for (const kana of ["hira", "kata"])
        for (const set of Object.values(w.SETS[kana]))
          for (const ch of set.flat()) if (ch) chars.push(ch);
      const rewards = [];
      for (const d of B.DINOS){
        for (const p2 of B.ALL_PARTS) rewards.push(`f:${B.partName(d, p2)}`);
        rewards.push(`r:${d.id}`);
      }
      return { chars, rewards };
    });
    const missChar = need.chars.filter(ch => !idx.clips["c:" + ch]);
    check("50音表から出るぜんぶの字に 読みがある",
      missChar.length === 0 && need.chars.length >= 160,
      `${need.chars.length}字 / 欠け ${missChar.length}`);

    const fixed = ["p:1","p:2","p:3","w:reverse","w:start","w:short","w:off","w:shape","w:again",
                   "s:set","s:complete", ...need.rewards];
    const missFixed = fixed.filter(id => !idx.clips[id]);
    check("ほめことば・やりなおしの理由・ごほうびの声もそろっている",
      missFixed.length === 0, missFixed.length ? missFixed.slice(0,5).join(" ") : `${fixed.length}本`);

    // 「を」「づ」のように ことばの無い字は1拍しかなく、それでも0.29秒ある。
    // 0.15秒を切るのは焼けていないとき
    const short = Object.entries(idx.clips).filter(([, c]) => c[1] < 0.15);
    check("焼けていない（0.15秒未満）ものが無い",
      short.length === 0, short.length ? short.slice(0,5).map(x=>x[0]).join(" ") : "なし");
    // 「ン」の読みが「ん」だけのとき、VOICEVOXは音の無いWAVを返していた。
    // 長さは普通なので、波形を見ないと気づけない
    check("音が入っていない焼き損じが無い",
      Array.isArray(idx.silent) && idx.silent.length === 0,
      (idx.silent || ["（記録なし）"]).join(" ") || "なし");

    const last = Object.values(idx.clips).reduce((a, c) => Math.max(a, c[0] + c[1]), 0);
    check("位置がファイルの長さの中に収まっている",
      last <= idx.total + 0.05, `いちばん後ろ ${last.toFixed(1)}秒 / 全体 ${idx.total.toFixed(1)}秒`);

    check("クレジットが画面に出ている",
      (await page.$eval("#voice-credit", e => e.textContent)).includes(idx.credit),
      idx.credit);
  }
}

/* ================= しょうじょう ================= */
{
  const before = await page.evaluate(() => {
    const N = window.__nazorin;
    N.show(N.el.digScr); N.renderDig();
    return !!document.querySelector("#btn-cert-open");
  });
  check("そろう前は しょうじょうを出さない", before === false);

  const after = await page.evaluate(() => {
    const N = window.__nazorin, B = N.bones;
    for (const d of B.DINOS) N.dig.slots[d.id] = B.ALL_PARTS.slice();
    N.dig.done = B.DINOS.map(d => d.id);
    N.dig.certDay = "2026-09-01";
    B.saveDig(N.dig);
    N.renderDig();
    return { open: !!document.querySelector("#btn-cert-open"),
             intro: document.querySelector(".dig-intro strong").textContent };
  });
  check("30こ そろうと ずかんの先頭に しょうじょうが出る",
    after.open && after.intro.includes("そろった"), after.intro);

  const cert = await page.evaluate(() => {
    window.__nazorin.openCert();
    const img = document.querySelector("#screen-cert img");
    return { on: document.querySelector("#screen-cert").classList.contains("is-on"),
             src: img.getAttribute("src"),
             y: document.querySelector("#cert-year").textContent,
             m: document.querySelector("#cert-month").textContent,
             d: document.querySelector("#cert-day").textContent,
             line: document.querySelector("#cert-line").textContent };
  });
  check("しょうじょうに そろえた日が 入る",
    cert.on && cert.src.endsWith("certificate.webp") &&
    cert.y === "2026" && cert.m === "9" && cert.d === "1" && cert.line.includes("30こ"),
    JSON.stringify(cert));
  await shot(page, "21_cert.png");

  // 空欄の位置は絵に合わせてある。ずれると日付が枠の外に出る
  const fit = await page.evaluate(() => {
    const f = document.querySelector(".cert-frame").getBoundingClientRect();
    return ["#cert-year", "#cert-month", "#cert-day"].map(sel => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { in: b.left > f.left && b.right < f.right && b.top > f.top && b.bottom < f.bottom,
               x: Math.round(((b.left + b.right) / 2 - f.left) / f.width * 1000) / 10 };
    });
  });
  check("日付が しょうじょうの枠の中に おさまる",
    fit.every(x => x.in), fit.map(x => x.x + "%").join(" / "));

  // たてに持ったままでも大きく見せるため、絵ごと90度回して出す
  const zoom = await page.evaluate(() => {
    const normal = document.querySelector("#screen-cert .cert-frame").getBoundingClientRect();
    window.__nazorin.openCertZoom();
    const big = document.querySelector("#cert-zoom .cert-frame").getBoundingClientRect();
    return { normal: Math.round(normal.width),
             long: Math.round(Math.max(big.width, big.height)),
             inView: big.left > -1 && big.top > -1 &&
                     big.right <= innerWidth + 1 && big.bottom <= innerHeight + 1,
             day: document.querySelector("#cert-zoom .cert-day")?.textContent,
             dupIds: document.querySelectorAll("#cert-zoom [id]").length };
  });
  check("しょうじょうを押すと 大きくなり、画面からはみ出さない",
    zoom.long > zoom.normal * 1.3 && zoom.inView && zoom.day === "1" && zoom.dupIds === 1,
    `ふつう${zoom.normal}px → 拡大${zoom.long}px`);
  await page.evaluate(() => document.querySelector("#cert-zoom").click());
  await sleep(200);
  const certLab = await page.evaluate(() => {
    const a = document.querySelector(".cert-lab a");
    return a ? { href: a.getAttribute("href"), target: a.getAttribute("target") } : null;
  });
  check("しょうじょうにも ラボへの入口がある",
    !!certLab && certLab.href.includes("yokobo-ai-lab") && certLab.target === "_blank",
    certLab ? certLab.href : "無い");
  check("しょうじょうの拡大は 押すと とじる",
    await page.$eval("#cert-zoom", e => !e.classList.contains("is-on")));

  await page.evaluate(() => {
    const N = window.__nazorin, B = N.bones;
    for (const d of B.DINOS) N.dig.slots[d.id] = [];
    N.dig.done = []; N.dig.certDay = null;
    B.saveDig(N.dig);
    N.show(N.el.home);
  });
}

/* ================= 8. オフライン ================= */
{
  const s = swScan();
  check("sw.js が最新（node tools/build_sw.mjs を回し忘れていない）",
    s.version === writtenVersion(), `いま ${s.version} / 書いてある ${writtenVersion()}`);
  // キャラの絵で 458KB、焼いた声で 806KB ふえた。初回だけ落ちて、あとはオフラインで動く。
  // voice.m4a（Opusが読めない端末むけ）は先取りしていないので、ここには入らない。
  check("配信サイズが 3.2MB を超えていない", s.total < 3.2 * 1024 * 1024,
    `${(s.total/1024).toFixed(0)}KB / ${s.files.length}ファイル`);
}

const swReady = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "つかえない";
  const reg = await Promise.race([
    navigator.serviceWorker.ready.then(()=> "ready"),
    new Promise(r => setTimeout(()=> r("おそい"), 8000))
  ]);
  return reg;
});
check("Service Worker が登録される", swReady === "ready", swReady);

await sleep(3000);   // 一式が入るのを待つ
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  if (!keys.length) return { n: 0, name: "なし" };
  const c = await caches.open(keys[0]);
  return { n: (await c.keys()).length, name: keys[0] };
});
check("アプリ一式がキャッシュされる", cached.n >= 35, `${cached.n}件 (${cached.name})`);

await page.setOfflineMode(true);
await page.reload({ waitUntil: "domcontentloaded" });
await sleep(1200);
await passSplash(page);
const offlineView = await page.evaluate(() => {
  document.querySelector('.home-card[data-go="train"]').click();
  return { title: document.title,
           cells: document.querySelectorAll("#screen-train .cell:not(.blank)").length,
           art:   !!document.querySelector("#btn-start"),
           logo:  !!document.querySelector("#train-title img") };
});
check("電波が無くても ひらける（れんしゅうの表・ロゴまで出る）",
  offlineView.cells === 46 && offlineView.art && offlineView.logo,
  `${offlineView.cells}マス / ${offlineView.title}`);
await shot(page, "17_offline.png");
await page.setOfflineMode(false);

check("JSエラー・404なし", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();

const ng = results.filter(r => !r.ok);
console.log(`\n=== ${results.length - ng.length}/${results.length} OK ===`);
console.log(`絵は ${path.relative(process.cwd(), QA)} に出しました`);
process.exit(ng.length ? 1 : 0);
