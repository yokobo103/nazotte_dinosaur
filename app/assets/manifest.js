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

  /* --- 二足セット（共通。第2弾） --- */
  biped_body: null,
  biped_fore: null,
  biped_hind: null,
  biped_tail: null,

  /* --- 特注パーツ（＝正体のヒント。絵柄は共通と同じ、シルエットだけ変える） --- */
  stego_body:  "stego_body.webp",   // 背中の板
  anky_tail:   null,   // ハンマー尾
  iguano_fore: null,   // 親指のトゲ
  velo_hind:   null,   // かぎ爪（第2弾）

  /* --- あたま（恐竜ごと。首はここに含める） --- */
  head_triceratops:  "head_triceratops.webp",
  head_stegosaurus:  null,
  head_ankylosaurus: null,
  head_iguanodon:    null,
  head_brachiosaurus: null,

  /* --- 全身骨格（描き下ろし1枚絵。パーツとは合わせない） --- */
  full_triceratops:   "full_triceratops.webp",
  full_stegosaurus:   "full_stegosaurus.webp",
  full_ankylosaurus:  null,
  full_iguanodon:     null,
  full_brachiosaurus: null
};

export const ART_DIR = "assets/bones/";
