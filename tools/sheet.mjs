// 表情シート（透過PNG・5列2行）から1コマずつ取り出す。
//
// 気をつけていること
//  - マス目でぶつ切りにしない。となりのコマの飾り（💢・✨）が境目をまたぐと切れる。
//    つながっている塊ごとに、いちばん近いコマへ割りあてる。
//  - コマの外接矩形に合わせて縮めない。飾りの分だけ枠が広がるので、
//    飾りの多いコマほど顔が小さくなる。倍率は全コマ共通にして、顔を基準に置く。
import { readPNG } from "./png.mjs";

export const COLS = 5, ROWS = 2;

/** つながっている塊をぜんぶ拾う（4近傍・アルファ>32 を中身とみなす） */
function blobs(W, H, px){
  const N = W * H;
  const solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) solid[i] = px[i*4+3] > 32 ? 1 : 0;
  const lab = new Int32Array(N).fill(-1);
  const stack = new Int32Array(N);
  const out = [];
  for (let s = 0; s < N; s++){
    if (!solid[s] || lab[s] >= 0) continue;
    const id = out.length;
    let sp = 0; stack[sp++] = s; lab[s] = id;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0, sx = 0, sy = 0;
    while (sp){
      const i = stack[--sp], x = i % W, y = (i - x) / W;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0   && solid[i-1] && lab[i-1] < 0){ lab[i-1] = id; stack[sp++] = i-1; }
      if (x < W-1 && solid[i+1] && lab[i+1] < 0){ lab[i+1] = id; stack[sp++] = i+1; }
      if (y > 0   && solid[i-W] && lab[i-W] < 0){ lab[i-W] = id; stack[sp++] = i-W; }
      if (y < H-1 && solid[i+W] && lab[i+W] < 0){ lab[i+W] = id; stack[sp++] = i+W; }
    }
    out.push({ id, x0, y0, x1, y1, area, cx: sx/area, cy: sy/area });
  }
  return { list: out, lab };
}

/**
 * @returns {Array} 10コマ。各コマは
 *   { head:{x0,y0,x1,y1}, full:{x0,y0,x1,y1}, W,H, px, lab, ids:Set }
 */
export function readSheet(file){
  const { w: W, h: H, data: px } = readPNG(file);
  const { list, lab } = blobs(W, H, px);
  const N = W * H;

  // ゴミ（抜き残しの点）は落とす
  const keep = list.filter(b => b.area > N * 0.00002);

  // マスの中心
  const centers = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
    centers.push({ x: (c + 0.5) * W / COLS, y: (r + 0.5) * H / ROWS });

  const cells = centers.map(() => []);
  for (const b of keep){
    let best = 0, bd = Infinity;
    for (let k = 0; k < centers.length; k++){
      // よこの距離を重く見る（列のほうが間隔がせまい）
      const dx = (b.cx - centers[k].x) * 1.6, dy = b.cy - centers[k].y;
      const d = dx*dx + dy*dy;
      if (d < bd){ bd = d; best = k; }
    }
    cells[best].push(b);
  }

  return cells.map((bs) => {
    if (!bs.length) return null;
    const head = bs.reduce((a, b) => b.area > a.area ? b : a);   // いちばん大きい塊＝顔
    const full = bs.reduce((a, b) => ({
      x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)
    }), { x0: W, y0: H, x1: 0, y1: 0 });
    return { head, full, ids: new Set(bs.map(b => b.id)), W, H, px, lab };
  });
}

/** コマを、顔の中心をそろえて 1枚の RGBA に焼く。
 *  scale と 出力サイズ（outW/outH）はキャラ共通の値を渡す＝顔の大きさがそろう。 */
export function render(frame, { scale, outW, outH, anchorX, anchorY }){
  const { W, px, lab, ids, head } = frame;
  const dst = Buffer.alloc(outW * outH * 4);
  const hx = (head.x0 + head.x1 + 1) / 2, hy = (head.y0 + head.y1 + 1) / 2;

  // 出力の画素ごとに、元画のどこを見るか（面積平均でならす）
  const inv = 1 / scale;
  for (let y = 0; y < outH; y++){
    const sy0 = (y - anchorY) * inv + hy, sy1 = (y + 1 - anchorY) * inv + hy;
    for (let x = 0; x < outW; x++){
      const sx0 = (x - anchorX) * inv + hx, sx1 = (x + 1 - anchorX) * inv + hx;
      let r=0,g=0,b=0,a=0,n=0;
      const ya = Math.floor(sy0), yb = Math.max(ya+1, Math.ceil(sy1));
      const xa = Math.floor(sx0), xb = Math.max(xa+1, Math.ceil(sx1));
      for (let yy = ya; yy < yb; yy++){
        if (yy < 0 || yy >= frame.px.length / (4*W)) continue;
        for (let xx = xa; xx < xb; xx++){
          if (xx < 0 || xx >= W) continue;
          n++;
          const i = yy*W + xx;
          if (!ids.has(lab[i])) continue;          // よそのコマの絵は入れない
          const al = px[i*4+3];
          r += px[i*4]*al; g += px[i*4+1]*al; b += px[i*4+2]*al; a += al;
        }
      }
      if (a > 0){
        const o = (y*outW + x)*4;
        dst[o] = Math.round(r/a); dst[o+1] = Math.round(g/a); dst[o+2] = Math.round(b/a);
        dst[o+3] = Math.min(255, Math.round(a/n));
      }
    }
  }
  return { w: outW, h: outH, data: dst };
}
