// 骨の絵の台帳。ここに WebP のファイル名を入れると、1枚ずつ本番の絵に切りかわる。
// 入っていないキー（null）は、その場で描く仮の骨が出る。
//
// 置き場所: app/assets/bones/<ファイル名>（配信用は透過WebP）
// 仕様:     docs/ASSET_SPEC.md
//
// 絵ができた順に null を差し替えるだけ。コードは触らない。
export const ART = {
  /* --- 四足セット（共通。トリケラ・ステゴ・アンキロ・イグアノドン・ブラキオで使い回す） --- */
  quad_body:  "quad_body.webp",
  quad_fore:  "quad_fore.webp",
  quad_hind:  "quad_hind.webp",
  quad_tail:  "quad_tail.webp",

  /* --- 二足セット（共通。ティラノ・ヴェロキラプトルで使い回す） --- */
  biped_body: "biped_body.webp",
  biped_fore: "biped_fore.webp",
  biped_hind: "biped_hind.webp",
  biped_tail: "biped_tail.webp",

  /* --- 特注パーツ（＝正体のヒント。絵柄は共通と同じ、シルエットだけ変える） --- */
  stego_body:  "stego_body.webp",   // 背中の板
  stego_tail:  "stego_tail.webp",   // 太い付け根から先細る尾椎＋4本の尾のとげ
  anky_body:   "anky_body.webp",    // 幅広く頑丈な胴体＋背中の装甲骨
  anky_tail:   "anky_tail.webp",    // ハンマー尾
  iguano_fore: "iguano_fore.webp", // 親指のトゲ
  velo_hind:   null,   // かぎ爪（第2弾）

  /* --- あたま（恐竜ごと。首はここに含める） --- */
  head_triceratops:  "head_triceratops.webp",
  head_stegosaurus:  "head_stegosaurus.webp",
  head_ankylosaurus: "head_ankylosaurus.webp",
  head_iguanodon:    "head_iguanodon.webp",
  head_brachiosaurus: "head_brachiosaurus.webp",
  head_tyrannosaurus: "head_tyrannosaurus.webp",

  /* --- 全身骨格（描き下ろし1枚絵。パーツとは合わせない） --- */
  full_triceratops:   "full_triceratops.webp",
  full_stegosaurus:   "full_stegosaurus.webp",
  full_ankylosaurus:  "full_ankylosaurus.webp",
  full_iguanodon:     "full_iguanodon.webp",
  full_brachiosaurus: "full_brachiosaurus.webp",
  full_tyrannosaurus: "full_tyrannosaurus.webp"
};

export const ART_DIR = "assets/bones/";
