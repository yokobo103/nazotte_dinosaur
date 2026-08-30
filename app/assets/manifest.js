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
  anky_tail:   null,   // ハンマー尾
  iguano_fore: null,   // 親指のトゲ
  velo_hind:   null,   // かぎ爪（第2弾）

  /* --- あたま（恐竜ごと。首はここに含める） --- */
  head_triceratops:  "head_triceratops.webp",
  head_stegosaurus:  "head_stegosaurus.webp",
  head_ankylosaurus: null,
  head_iguanodon:    null,
  head_brachiosaurus: "head_brachiosaurus.webp",
  head_tyrannosaurus: "head_tyrannosaurus.webp",

  /* --- 全身骨格（描き下ろし1枚絵。パーツとは合わせない） --- */
  full_triceratops:   "full_triceratops.webp",
  full_stegosaurus:   "full_stegosaurus.webp",
  full_ankylosaurus:  null,
  full_iguanodon:     null,
  full_brachiosaurus: "full_brachiosaurus.webp",
  full_tyrannosaurus: "full_tyrannosaurus.webp"
};

export const ART_DIR = "assets/bones/";
