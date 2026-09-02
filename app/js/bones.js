// 骨あつめ（ごほうび）のデータとルール。
//
// 設計の要点:
//   - **1体ずつ掘るのではない。** 骨は「どの恐竜の どの部位か」がランダムに決まる。
//     所長の言葉は「やるたびにランダムで断片が手に入って、**気づけば**全体骨格ができてくる」。
//     1体ずつにすると「いま ほっているのは◯◯」という、子どもが選んでもいない目標を
//     宣言することになる。子どもは掘っているつもりはなく、字を書いているだけ
//   - ダブりは出さない。**まだ持っていない（恐竜×部位）のマスから引く**。
//     完全ランダムだと終盤がいつまでも終わらない
//   - **あたまは、その恐竜の残り4つがそろうまで出ない。**完成の一撃を、
//     いちばん恐竜らしいパーツにするため
//   - **最初の骨を見つけた時点で恐竜名を明かす。**姿だけは5部位がそろうまで伏せる。
//     年少児が「何の骨を集めているか」を理解できることを優先する
//   - 特注パーツは**部位の呼び名そのものを特別にする**（「どう」→「せなかの いた」）
//   - 点数は報酬にひびかない。**れんしゅうのセットを1つ終えたら必ず1個**

/* 部位。あたまは最後に固定するので、抽選の対象は先の4つだけ */
export const PARTS      = ["body", "forelimb", "hindlimb", "tail"];
export const HEAD       = "head";
export const ALL_PARTS  = [...PARTS, HEAD];

export const PART_LABEL = {
  body:     "どう",
  forelimb: "まえあし",
  hindlimb: "うしろあし",
  tail:     "しっぽ",
  head:     "あたま"
};

/* 共通セット。絵として共通化できる軸は分類群ではなく「四足か二足か」。
   ブラキオ(竜脚類)とトリケラ(鳥盤類)は分類は遠いが、どうとあしは同じ絵で通る。 */
export const LINEAGE = {
  quad:  { label: "よつあし", art: { body:"quad_body", forelimb:"quad_fore", hindlimb:"quad_hind", tail:"quad_tail" } },
  biped: { label: "にほんあし", art: { body:"biped_body", forelimb:"biped_fore", hindlimb:"biped_hind", tail:"biped_tail" } }
};

/* 掘る順番。四足は quad、二足は biped の共通パーツを使う。
   custom = 特注パーツの絵。絵柄は共通と同じで、シルエットだけ変える。
   part   = そのときの部位の呼び名（「どう」→「せなかの いた」）。 */
export const DINOS = [
  {
    id: "triceratops", name: "トリケラトプス", lineage: "quad",
    custom: {}, part: {},
    fact: "つのが3ぼん。かおの うしろに おおきな えりかざりが ある",
    detail: {
      description: "3ぼんの つのと、おおきな えりかざりが とくちょう。かたい くちばしで、ひくい ところの しょくぶつを たべていたよ。",
      facts: { diet: "しょくぶつ", size: "ながさ 約9メートル", period: "はくあき こうき（およそ 6800まん〜6600まんねんまえ）", region: "アメリカ" },
      restorationArt: "triceratops_restoration.webp",
      sourceUrl: "https://www.nhm.ac.uk/discover/dino-directory/triceratops.html"
    }
  },
  {
    id: "stegosaurus", name: "ステゴサウルス", lineage: "quad",
    custom: { body: "stego_body" },
    part:   { body: "せなかの いた" },
    fact: "せなかの いたで からだの あつさを ちょうせつ していた かも",
    detail: {
      description: "せなかに おおきな いたが ならび、しっぽには 4ほんの トゲが あったよ。トゲで てきから みを まもったと かんがえられているよ。",
      facts: { diet:"しょくぶつ", size:"ながさ 約9メートル", period:"じゅらき こうき（およそ 1おく5200まん〜1おく4500まんねんまえ）", region:"アメリカ" },
      restorationArt:"stegosaurus_restoration.webp",
      sourceUrl:"https://www.nhm.ac.uk/discover/dino-directory/Stegosaurus.html"
    }
  },
  {
    id: "ankylosaurus", name: "アンキロサウルス", lineage: "quad",
    custom: { tail: "anky_tail" },
    part:   { tail: "ハンマーの しっぽ" },
    fact: "しっぽの さきが ハンマー。てきを たたいて みを まもった",
    detail: {
      description: "からだを かたい よろいのような ホネで まもっていたよ。おもい しっぽの ハンマーは、てきから みを まもるのに つかったと かんがえられているよ。",
      facts: { diet:"しょくぶつ", size:"ながさ 約8メートル", period:"はくあき こうき（およそ 6800まん〜6600まんねんまえ）", region:"カナダ・アメリカ" },
      restorationArt:"ankylosaurus_restoration.webp",
      sourceUrl:"https://www.nhm.ac.uk/discover/dino-directory/ankylosaurus.html"
    }
  },
  {
    id: "iguanodon", name: "イグアノドン", lineage: "quad",
    custom: { forelimb: "iguano_fore" },
    part:   { forelimb: "おやゆびの トゲ" },
    fact: "おやゆびの トゲ。むかしは はなの つの と まちがえられていた",
    detail: {
      description: "まえあしの おやゆびに、おおきな トゲが あったよ。4ほんあしでも 2ほんあしでも あるけたと かんがえられているよ。",
      facts: { diet:"しょくぶつ", size:"ながさ 約10メートル", period:"はくあき ぜんき（およそ 1おく4000まん〜1おく1000まんねんまえ）", region:"ベルギー・イギリス" },
      restorationArt:"iguanodon_restoration.webp",
      sourceUrl:"https://www.nhm.ac.uk/discover/dino-directory/Iguanodon.html"
    }
  },
  {
    id: "brachiosaurus", name: "ブラキオサウルス", lineage: "quad",
    custom: {}, part: {},
    fact: "くびが とても ながい。まえあしが うしろあしより ながい",
    detail: {
      description: "とても ながい くびと、うしろあしより ながい まえあしを もっていたよ。たかい きの はっぱを たべるのが とくいだったよ。",
      facts: { diet:"しょくぶつ", size:"ながさ 約22メートル", period:"じゅらき こうき（およそ 1おく5200まん〜1おく4500まんねんまえ）", region:"アメリカ" },
      restorationArt:"brachiosaurus_restoration.webp",
      sourceUrl:"https://www.nhm.ac.uk/discover/dino-directory/brachiosaurus.html"
    }
  },
  {
    id: "tyrannosaurus", name: "ティラノサウルス", lineage: "biped",
    custom: {}, part: {},
    fact: "おおきな あたまと つよい うしろあしを もっていた",
    detail: {
      description: "おおきな あたまと するどい は、つよい うしろあしが とくちょう。まえあしは ちいさく、2ぼんの ゆびが あったよ。",
      facts: { diet:"にく", size:"ながさ 約12メートル", period:"はくあき こうき（およそ 6800まん〜6600まんねんまえ）", region:"アメリカ・カナダ" },
      restorationArt:"tyrannosaurus_restoration.webp",
      sourceUrl:"https://www.nhm.ac.uk/discover/dino-directory/tyrannosaurus.html"
    }
  }
];

/* まだ絵ができていない恐竜。ここに足すと、絵ができ次第 DINOS へ移せる
   （二足セットと変わり種は1体あたりの絵が高いので後回し） */
export const LATER = ["ヴェロキラプトル", "プテラノドン", "エラスモサウルス"];

/** その恐竜の、その部位に使う絵のキー。特注があればそれ、無ければ共通セット */
export function artKey(dino, part){
  if (part === HEAD) return "head_" + dino.id;
  return (dino.custom && dino.custom[part]) || LINEAGE[dino.lineage].art[part];
}

/** 特注パーツかどうか */
export function isCustom(dino, part){
  return !!(dino.custom && dino.custom[part]);
}

/** その恐竜での、その部位の呼び名。特注は特別な名前になる */
export function partName(dino, part){
  return (dino.part && dino.part[part]) || PART_LABEL[part];
}

/** 恐竜の番号（01〜）。ずかんでは、そろう前から この番号の枠が並んでいる。
 *  名前は隠れていても「6体いて、いま何番が埋まっているか」は見える。 */
export function dinoNo(dino){
  return DINOS.findIndex(d => d.id === dino.id) + 1;
}
export const noLabel = (dino)=> String(dinoNo(dino)).padStart(2, "0");

/** 獲得したときのことば。**正体は言わない**（2026-09-02）。
 *  5こそろった瞬間にはじめて名前が出る。
 *  特注の呼び名（せなかの いた／ハンマーの しっぽ／おやゆびの トゲ）は隠さない —
 *  そこがヒントになって、当てる楽しみが出る。 */
export function foundText(dino, part){
  return `なにかの ${partName(dino, part)}を みつけた！`;
}

/* ================= 進みぐあいの保存 ================= */
// { slots: { 恐竜id: [部位...] }, done: [恐竜id...] }
const KEY = "nazorin.dig.v1";

export function loadDig(){
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!d || typeof d !== "object") d = {};

  const done  = Array.isArray(d.done) ? d.done.filter(id => DINOS.some(x => x.id === id)) : [];
  // log["恐竜id:部位"] = { day:"2026-08-30", chars:["あ",...], sid:"セッションid" }
  // 筆跡そのものは handwriting 側にあるが、あちらは古いものから捨てられる。
  // 日付と文字だけは軽い（1件40バイト程度）ので、こちらに持って必ず残す。
  const log = (d.log && typeof d.log === "object") ? d.log : {};
  const slots = {};
  for (const dino of DINOS) slots[dino.id] = [];

  if (d.slots && typeof d.slots === "object"){
    for (const dino of DINOS){
      const got = d.slots[dino.id];
      if (Array.isArray(got)) slots[dino.id] = got.filter(p => ALL_PARTS.includes(p));
    }
  } else if (Number.isInteger(d.i) && Array.isArray(d.got)){
    // 「1体ずつ掘る」だったころの保存からの引っ越し
    const cur = DINOS[d.i];
    if (cur) slots[cur.id] = d.got.filter(p => ALL_PARTS.includes(p));
  }
  for (const id of done) slots[id] = [...ALL_PARTS];
  // ずかんを そろえた日。しょうじょうに書く1行なので、消えないようここに持つ
  const certDay = typeof d.certDay === "string" ? d.certDay : null;
  return { slots, done, log, certDay };
}

export function saveDig(dig){
  try { localStorage.setItem(KEY, JSON.stringify(dig)); } catch {}
}

export const gotParts   = (dig, dino)=> dig.slots[dino.id] || [];
export const isComplete = (dig, dino)=> ALL_PARTS.every(p => gotParts(dig, dino).includes(p));
export const boneCount  = (dig)=> DINOS.reduce((n, d) => n + gotParts(dig, d).length, 0);
export const logKey     = (dino, part)=> dino.id + ":" + part;
export const foundLog   = (dig, dino, part)=> (dig.log || {})[logKey(dino, part)] || null;
export const TOTAL_BONES = () => DINOS.length * ALL_PARTS.length;

/** つぎに出る骨を1つ決める。
 *  まだ持っていない（恐竜×部位）からだけ引く＝ダブりが出ない。
 *  あたまは、その恐竜の残り4つがそろうまで候補に入れない＝正体が分かるのは必ず最後。
 *
 *  **そろいかけを重く引く**（2026-09-02）。均等に引くと6体へバラけて、
 *  1体目が完成するのが20個目のホネ（＝20セット＝300回なぞる）になる。2000回まわして実測した。
 *  名前を隠す作りにすると、その20セットのあいだ ずっと ???? のままになってしまう。
 *  重みを (持っている数+1)^2 にすると 1体目が10個目・同時に掘りかけは平均2.7体。
 *  「1体ずつ掘る」ではない（宣言もしないし、複数が並行して埋まる）。 */
const WEIGHT = (n)=> (n + 1) ** 2;

export function drawBone(dig, rand = Math.random){
  const pool = [];
  for (const dino of DINOS){
    const got = gotParts(dig, dino);
    const w = WEIGHT(got.length);
    for (const part of PARTS) if (!got.includes(part)) pool.push({ dino, part, w });
    if (!got.includes(HEAD) && PARTS.every(p => got.includes(p))) pool.push({ dino, part: HEAD, w });
  }
  if (!pool.length) return null;
  let r = rand() * pool.reduce((sum, x) => sum + x.w, 0);
  for (const x of pool){ r -= x.w; if (r <= 0) return x; }
  return pool[pool.length - 1];
}

/** 骨を1つ入れる。恐竜がそろったら complete:true */
export function addBone(dig, pick){
  if (!pick) return null;
  const { dino, part } = pick;
  const got = dig.slots[dino.id];
  if (!got || got.includes(part)) return null;
  got.push(part);
  const complete = isComplete(dig, dino);
  if (complete && !dig.done.includes(dino.id)) dig.done.push(dino.id);
  saveDig(dig);
  return { dino, part, complete };
}
