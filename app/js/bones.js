// 骨あつめ（ごほうび）のデータとルール。
//
// 設計の要点:
//   - **1体ずつ掘るのではない。** 骨は「どの恐竜の どの部位か」がランダムに決まる。
//     所長の言葉は「やるたびにランダムで断片が手に入って、**気づけば**全体骨格ができてくる」。
//     1体ずつにすると「いま ほっているのは◯◯」という、子どもが選んでもいない目標を
//     宣言することになる。子どもは掘っているつもりはなく、字を書いているだけ
//   - ダブりは出さない。**まだ持っていない（恐竜×部位）の25マスから引く**。
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

/* 掘る順番。第1弾は四足5体だけ（二足・変わり種は絵ができてから足す）。
   custom = 特注パーツの絵。絵柄は共通と同じで、シルエットだけ変える。
   part   = そのときの部位の呼び名（「どう」→「せなかの いた」）。 */
export const DINOS = [
  {
    id: "triceratops", name: "トリケラトプス", lineage: "quad",
    custom: {}, part: {},
    fact: "つのが3ぼん。かおの うしろに おおきな えりかざりが ある",
    detail: {
      description: "3ぼんの つのと、おおきな えりかざりが とくちょう。",
      facts: { diet: null, size: null, period: null, region: null },
      restorationArt: null
    }
  },
  {
    id: "stegosaurus", name: "ステゴサウルス", lineage: "quad",
    custom: { body: "stego_body" },
    part:   { body: "せなかの いた" },
    fact: "せなかの いたで からだの あつさを ちょうせつ していた かも",
    detail: { description: null, facts: { diet:null, size:null, period:null, region:null }, restorationArt:null }
  },
  {
    id: "ankylosaurus", name: "アンキロサウルス", lineage: "quad",
    custom: { tail: "anky_tail" },
    part:   { tail: "ハンマーの しっぽ" },
    fact: "しっぽの さきが ハンマー。てきを たたいて みを まもった",
    detail: { description: null, facts: { diet:null, size:null, period:null, region:null }, restorationArt:null }
  },
  {
    id: "iguanodon", name: "イグアノドン", lineage: "quad",
    custom: { forelimb: "iguano_fore" },
    part:   { forelimb: "おやゆびの トゲ" },
    fact: "おやゆびの トゲ。むかしは はなの つの と まちがえられていた",
    detail: { description: null, facts: { diet:null, size:null, period:null, region:null }, restorationArt:null }
  },
  {
    id: "brachiosaurus", name: "ブラキオサウルス", lineage: "quad",
    custom: {}, part: {},
    fact: "くびが とても ながい。まえあしが うしろあしより ながい",
    detail: { description: null, facts: { diet:null, size:null, period:null, region:null }, restorationArt:null }
  }
];

/* まだ絵ができていない恐竜。ここに足すと、絵ができ次第 DINOS へ移せる
   （二足セットと変わり種は1体あたりの絵が高いので後回し） */
export const LATER = ["ティラノサウルス", "ヴェロキラプトル", "プテラノドン", "エラスモサウルス"];

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

/** 獲得したときのことば。最初の骨から恐竜名を伝える。 */
export function foundText(dino, part){
  return `${dino.name}の ${partName(dino, part)}を みつけた！`;
}

/* ================= 進みぐあいの保存 ================= */
// { slots: { 恐竜id: [部位...] }, done: [恐竜id...] }
const KEY = "nazorin.dig.v1";

export function loadDig(){
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!d || typeof d !== "object") d = {};

  const done  = Array.isArray(d.done) ? d.done.filter(id => DINOS.some(x => x.id === id)) : [];
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
  return { slots, done };
}

export function saveDig(dig){
  try { localStorage.setItem(KEY, JSON.stringify(dig)); } catch {}
}

export const gotParts   = (dig, dino)=> dig.slots[dino.id] || [];
export const isComplete = (dig, dino)=> ALL_PARTS.every(p => gotParts(dig, dino).includes(p));
export const boneCount  = (dig)=> DINOS.reduce((n, d) => n + gotParts(dig, d).length, 0);
export const TOTAL_BONES = () => DINOS.length * ALL_PARTS.length;

/** つぎに出る骨を1つ決める。
 *  まだ持っていない（恐竜×部位）からだけ引く＝ダブりが出ない。
 *  あたまは、その恐竜の残り4つがそろうまで候補に入れない。 */
export function drawBone(dig, rand = Math.random){
  const pool = [];
  for (const dino of DINOS){
    const got = gotParts(dig, dino);
    for (const part of PARTS) if (!got.includes(part)) pool.push({ dino, part });
    if (!got.includes(HEAD) && PARTS.every(p => got.includes(p))) pool.push({ dino, part: HEAD });
  }
  if (!pool.length) return null;
  return pool[Math.floor(rand() * pool.length)];
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
