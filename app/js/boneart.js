// 骨の絵。台帳(assets/manifest.js)にWebPが入っていればそれを、
// 無ければその場で描く「仮の骨」を出す。絵ができた順に差し替えられる。
//
// 仮の骨も本番と同じ3色で描く（輪郭＋骨＋影）。並べたときの重さを見たいので、
// かたちだけ雑で、色と大きさは本番の規格に合わせてある。
import { ART, ART_DIR } from "../assets/manifest.js";

const INK    = "#5a4a3a";   // 輪郭（真っ黒にはしない）
const BONE   = "#f7f0e2";   // 骨
const SHADE  = "#ddd1ba";   // 影（1色だけ）
const U = 100;              // 描画の座標系。実サイズは呼ぶ側が決める

/* ---------- 部品 ---------- */

/** 長い骨。両端にこぶ */
function longBone(c, x1, y1, x2, y2, w, knob){
  const a = Math.atan2(y2-y1, x2-x1), nx = -Math.sin(a), ny = Math.cos(a);
  const k = knob || w * 0.72;
  const ends = [[x1,y1,-1],[x2,y2,1]];
  c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(x1, y1); c.lineTo(x2, y2);
  c.lineWidth = w; c.lineCap = "round"; c.strokeStyle = BONE; c.stroke();
  for (const [x,y] of ends){
    c.beginPath(); c.arc(x + nx*k*0.55, y + ny*k*0.55, k*0.62, 0, 7); c.fill();
    c.beginPath(); c.arc(x - nx*k*0.55, y - ny*k*0.55, k*0.62, 0, 7); c.fill();
  }
  // 輪郭は形をまとめて1本で
  c.lineWidth = 3; c.strokeStyle = INK; c.lineCap = "round";
  c.beginPath(); c.moveTo(x1 + nx*w*0.5, y1 + ny*w*0.5); c.lineTo(x2 + nx*w*0.5, y2 + ny*w*0.5); c.stroke();
  c.beginPath(); c.moveTo(x1 - nx*w*0.5, y1 - ny*w*0.5); c.lineTo(x2 - nx*w*0.5, y2 - ny*w*0.5); c.stroke();
  for (const [x,y] of ends){
    for (const s of [1,-1]){
      c.beginPath(); c.arc(x + nx*k*0.55*s, y + ny*k*0.55*s, k*0.62, 0, 7); c.stroke();
    }
  }
  // 影
  c.fillStyle = SHADE;
  c.globalAlpha = .5;
  c.beginPath(); c.moveTo(x1 - nx*w*0.5, y1 - ny*w*0.5); c.lineTo(x2 - nx*w*0.5, y2 - ny*w*0.5);
  c.lineTo(x2 - nx*w*0.18, y2 - ny*w*0.18); c.lineTo(x1 - nx*w*0.18, y1 - ny*w*0.18); c.closePath(); c.fill();
  c.globalAlpha = 1;
}

/** あばら。背骨＋ぶら下がる肋骨 */
function ribs(c, spread){
  c.strokeStyle = INK; c.lineCap = "round"; c.lineJoin = "round";
  const y0 = 34, x0 = 22, x1 = 80;
  // 肋骨
  const n = 6;
  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    const x = x0 + (x1 - x0) * t;
    const len = 30 + Math.sin(Math.PI * t) * (spread || 16);
    c.lineWidth = 8; c.strokeStyle = BONE;
    c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x - 6, y0 + len*0.7, x + 3, y0 + len); c.stroke();
    c.lineWidth = 11.5; c.strokeStyle = INK;
    c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x - 6, y0 + len*0.7, x + 3, y0 + len); c.stroke();
    c.lineWidth = 8; c.strokeStyle = BONE;
    c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x - 6, y0 + len*0.7, x + 3, y0 + len); c.stroke();
  }
  // 背骨
  c.lineWidth = 13; c.strokeStyle = INK;
  c.beginPath(); c.moveTo(x0 - 5, y0); c.lineTo(x1 + 5, y0); c.stroke();
  c.lineWidth = 9.5; c.strokeStyle = BONE;
  c.beginPath(); c.moveTo(x0 - 5, y0); c.lineTo(x1 + 5, y0); c.stroke();
}

/** しっぽ。だんだん細くなる椎骨のつらなり */
function tail(c, n, endFn, endX){
  const pts = [];
  const x1 = endX || 80;              // 先に何かつける場合は短くする（枠からはみ出す）
  for (let i = 0; i <= n; i++){
    const t = i / n;
    pts.push({ x: 14 + t * (x1 - 14), y: 62 - Math.sin(t * 2.2) * 22, r: 9 - t * 5.5 });
  }
  c.strokeStyle = INK; c.lineWidth = 3;
  for (const p of pts){
    c.fillStyle = BONE;
    c.beginPath(); c.roundRect(p.x - p.r, p.y - p.r, p.r*2, p.r*2, p.r*0.55); c.fill(); c.stroke();
  }
  if (endFn) endFn(c, pts[pts.length-1]);
}

/** あたま。頭骨＋あご。眼窩の穴をあける */
function skull(c, opts){
  const o = opts || {};
  c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 3;
  // 頭
  c.beginPath();
  c.moveTo(20, 46); c.quadraticCurveTo(24, 24, 50, 24);
  c.quadraticCurveTo(74, 24, 82, 42); c.quadraticCurveTo(86, 52, 70, 56);
  c.lineTo(30, 58); c.quadraticCurveTo(18, 56, 20, 46); c.closePath();
  c.fill(); c.stroke();
  // あご
  c.beginPath();
  c.moveTo(28, 60); c.quadraticCurveTo(50, 72, 74, 60);
  c.quadraticCurveTo(56, 66, 28, 60); c.closePath();
  c.fill(); c.stroke();
  // 眼窩（穴）
  c.fillStyle = SHADE;
  c.beginPath(); c.ellipse(58, 40, 8, 7, 0, 0, 7); c.fill();
  c.strokeStyle = INK; c.lineWidth = 2.5; c.stroke();
  // 鼻の穴
  c.fillStyle = SHADE;
  c.beginPath(); c.ellipse(30, 42, 4, 3.4, 0, 0, 7); c.fill(); c.stroke();
  if (o.horns){                       // トリケラ：つのとえりかざり
    c.fillStyle = BONE; c.lineWidth = 3;
    c.beginPath(); c.moveTo(66, 26); c.quadraticCurveTo(78, 6, 88, 12);
    c.quadraticCurveTo(76, 16, 72, 30); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(50, 26); c.quadraticCurveTo(58, 8, 68, 12);
    c.quadraticCurveTo(58, 18, 56, 28); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.arc(72, 42, 24, -1.9, 1.0); c.stroke();
  }
  if (o.neck){                        // ブラキオ：首を含める
    c.strokeStyle = INK; c.lineWidth = 13; c.lineCap = "round";
    c.beginPath(); c.moveTo(30, 56); c.quadraticCurveTo(20, 76, 26, 92); c.stroke();
    c.strokeStyle = BONE; c.lineWidth = 9;
    c.beginPath(); c.moveTo(30, 56); c.quadraticCurveTo(20, 76, 26, 92); c.stroke();
  }
  if (o.beak){                        // イグアノドン：くちばし
    c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.moveTo(20, 46); c.quadraticCurveTo(8, 50, 16, 58);
    c.quadraticCurveTo(24, 56, 24, 50); c.closePath(); c.fill(); c.stroke();
  }
}

/* ---------- キーごとの描き分け ---------- */
const DRAW = {
  quad_body:  (c)=> ribs(c, 18),
  quad_fore:  (c)=> longBone(c, 40, 20, 56, 82, 15),
  quad_hind:  (c)=> longBone(c, 38, 18, 58, 84, 17),
  quad_tail:  (c)=> tail(c, 8),

  biped_body: (c)=> ribs(c, 8),
  biped_fore: (c)=> longBone(c, 44, 38, 56, 66, 10),
  biped_hind: (c)=> { longBone(c, 34, 18, 52, 50, 16); longBone(c, 52, 50, 44, 84, 12); },
  biped_tail: (c)=> tail(c, 9),

  stego_body: (c)=> {                      // 特注：背中の板
    ribs(c, 18);
    c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 3;
    const plates = [[28,30],[42,26],[56,24],[70,28]];
    for (const [x, y] of plates){
      c.beginPath();
      c.moveTo(x - 9, y + 6); c.quadraticCurveTo(x, y - 18, x + 9, y + 6);
      c.quadraticCurveTo(x, y + 2, x - 9, y + 6); c.closePath(); c.fill(); c.stroke();
    }
  },
  anky_tail: (c)=> tail(c, 7, (cc, last)=>{ // 特注：ハンマー尾
    cc.fillStyle = BONE; cc.strokeStyle = INK; cc.lineWidth = 3;
    cc.beginPath(); cc.ellipse(last.x + 9, last.y - 2, 13, 11, 0, 0, 7); cc.fill(); cc.stroke();
    cc.beginPath(); cc.ellipse(last.x + 3, last.y - 2, 6, 8, 0, 0, 7); cc.fill(); cc.stroke();
  }, 64),
  iguano_fore: (c)=> {                     // 特注：親指のトゲ
    longBone(c, 40, 20, 54, 70, 14);
    c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.moveTo(46, 72); c.quadraticCurveTo(34, 84, 40, 92);
    c.quadraticCurveTo(50, 84, 54, 74); c.closePath(); c.fill(); c.stroke();
  },
  velo_hind: (c)=> {                       // 特注：かぎ爪
    longBone(c, 34, 18, 52, 52, 13); longBone(c, 52, 52, 44, 76, 10);
    c.fillStyle = BONE; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.moveTo(44, 78); c.quadraticCurveTo(72, 78, 70, 96);
    c.quadraticCurveTo(58, 84, 42, 86); c.closePath(); c.fill(); c.stroke();
  },

  head_triceratops:   (c)=> skull(c, { horns:true }),
  head_stegosaurus:   (c)=> skull(c, {}),
  head_ankylosaurus:  (c)=> skull(c, {}),
  head_iguanodon:     (c)=> skull(c, { beak:true }),
  head_brachiosaurus: (c)=> skull(c, { neck:true })
};

/** 全身骨格の仮絵。パーツを並べただけの「まだ描いていません」の板 */
function fullPlaceholder(c, name){
  const H = U * 0.52;                       // 横長の枠に合わせる
  c.strokeStyle = "#cfc3ac"; c.lineWidth = 2.5; c.setLineDash([5,4]);
  c.strokeRect(6, 5, U-12, H-10);
  c.setLineDash([]);
  // 名前は描かない。カードもモーダルも名前を別に出すので二重になる
  c.fillStyle = "#b3a68c";
  c.textAlign = "center";
  c.font = "500 9px system-ui, sans-serif";
  c.fillText("ぜんしんこっかく", U/2, H/2 - 3);
  c.fillText("（え これから）", U/2, H/2 + 9);
}

/** キーの絵を canvas に描く。size は CSS ピクセル */
export function drawBone(key, size, name){
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  // 全身骨格は横長。正方形で描いて横長の枠に入れると絵がつぶれる
  const wide = key && key.startsWith("full_");
  const h = wide ? Math.round(size * 0.52) : size;
  const cv = document.createElement("canvas");
  cv.width = Math.round(size * dpr); cv.height = Math.round(h * dpr);
  cv.style.width = size + "px"; cv.style.height = h + "px";
  const c = cv.getContext("2d");
  c.setTransform(cv.width / U, 0, 0, cv.height / (wide ? U * 0.52 : U), 0, 0);
  c.lineJoin = "round"; c.lineCap = "round";
  const fn = DRAW[key];
  if (fn) fn(c);
  else if (key && key.startsWith("full_")) fullPlaceholder(c, name);
  else { c.fillStyle = SHADE; c.beginPath(); c.arc(50,50,26,0,7); c.fill(); }
  return cv;
}

/** 絵を1つ返す。台帳にWebPがあればそれ、無ければ仮の骨。
 *  WebPが読めなかったときも黙って仮の骨に落ちる。 */
export function boneElement(key, size, name){
  const wrap = document.createElement("span");
  wrap.className = "bone-art";
  // 全身骨格は横長。正方形の枠に入れると絵が小さくなってしまう
  const wide = key && key.startsWith("full_");
  wrap.style.width = size + "px";
  wrap.style.height = (wide ? Math.round(size * 0.52) : size) + "px";

  const file = ART[key];
  if (file){
    const img = new Image();
    img.src = ART_DIR + file;
    img.alt = "";
    img.style.width = "100%"; img.style.height = "100%";
    img.onerror = ()=>{ wrap.innerHTML = ""; wrap.appendChild(drawBone(key, size, name)); };
    wrap.appendChild(img);
  } else {
    wrap.appendChild(drawBone(key, size, name));
  }
  return wrap;
}

/** 本番の絵がまだ1枚も入っていないか（画面に「絵は仮」と出すため） */
export function allPlaceholder(){
  return Object.values(ART).every(v => !v);
}
