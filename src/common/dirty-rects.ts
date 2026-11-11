// dirty-rects —— 一帧里改到的那几块（画布像素的方框单子）：整理成两两不相交、块数有上界、总面积过半就说「整张」。
// created 2026-11-11 by Claude Opus 5.5（CatsUp 贴图主线 1-4d 第 6 条：外来薄层报块 → 内核只在这些块里重合；三维的显示图也按同一张单子只拷这些块）。
// 统筹 11-11 定的判据（不定死数，用量法挑）：每帧单子总面积中位 ≤ 画布 1%、第 90 百分位 ≤ 5%；算单子 ≤ 0.2 毫秒；方框两两不相交（一次 draw 画整张单子，
//   重叠的地方会被写两遍：不许赌 pass 的写法）。
// 两级：
//   ① 块数 ≤ RECT_LIST_MAX：先夹进画布、去掉空的；再并到不动点——两块相交（面积 > 0 的重叠）就并，或者合起来的方框面积 ≤ RECT_MERGE_SLACK × 两块面积之和就并
//      （同一片里挨着的多边形并起来；隔得远的两团不并）。并完必两两不相交（相交的都并掉了）。
//   ② 块数超了（或者①并完还超）：落到 RECT_BUCKET 见方的桶里，每一行相邻的桶并成一段（行段两两不相交，块数 ≤ 桶数）。花费随这些块盖住的桶数线性涨。
//   总面积 > RECT_FULL_FRACTION × 画布 = "full"（这一帧整张）。
// 纯函数、零依赖；内核（render-tree）和三维（显示图）用同一份。

export interface DirtyRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }

/** 两块合起来的方框面积 ≤ 它 × 两块面积之和 = 并。 */
export const RECT_MERGE_SLACK = 1.5;
/** 第一级最多几块（超了走桶）。 */
export const RECT_LIST_MAX = 256;
/** 第二级的桶边长（格）。 */
export const RECT_BUCKET = 32;
/** 总面积超过画布的这么多 = 整张。 */
export const RECT_FULL_FRACTION = 0.5;

type Box = [number, number, number, number];   // x0, y0, x1, y1（半开）
const areaOf = (b: Box): number => (b[2] - b[0]) * (b[3] - b[1]);
const overlaps = (a: Box, b: Box): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const unionOf = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/**
 * 一帧的块 → 两两不相交的方框单子（整数格、夹在 W × H 里），或 "full"（总面积过半）。空 = []。
 * stats 给了就填：走了哪一级、输入 / 输出块数（量用）。
 */
export function normalizeDirtyRects(input: readonly DirtyRect[], W: number, H: number, stats?: { level: 1 | 2; inCount: number; outCount: number }): DirtyRect[] | "full" {
  const boxes: Box[] = [];
  for (const r of input) {
    const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y)), x1 = Math.min(W, Math.ceil(r.x + r.w)), y1 = Math.min(H, Math.ceil(r.y + r.h));
    if (x1 > x0 && y1 > y0) boxes.push([x0, y0, x1, y1]);
  }
  let out: Box[] | null = boxes.length <= RECT_LIST_MAX ? mergeToFixpoint(boxes) : null;
  let level: 1 | 2 = 1;
  if (!out || out.length > RECT_LIST_MAX) { out = bucketRuns(boxes, W, H); level = 2; }
  if (stats) { stats.level = level; stats.inCount = input.length; stats.outCount = out.length; }
  let total = 0;
  for (const b of out) total += areaOf(b);
  if (total > RECT_FULL_FRACTION * W * H) return "full";
  return out.map((b) => ({ x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] }));
}

/** 第一级：并到不动点（相交就并；合起来不比分开浪费太多也并）。结果两两不相交。 */
function mergeToFixpoint(boxes: Box[]): Box[] {
  const L = boxes.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < L.length; i++) {
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j], u = unionOf(a, b);
        if (overlaps(a, b) || areaOf(u) <= RECT_MERGE_SLACK * (areaOf(a) + areaOf(b))) {
          L[i] = u; L[j] = L[L.length - 1]; L.pop(); j = i; changed = true;   // 并进 i，i 变大了：从头再比它
        }
      }
    }
  }
  return L;
}

/** 第二级：桶 → 每行相邻的桶并成一段。行段两两不相交。 */
function bucketRuns(boxes: Box[], W: number, H: number): Box[] {
  const B = RECT_BUCKET, cols = Math.ceil(W / B), rows = Math.ceil(H / B), mark = new Uint8Array(cols * rows);
  for (const b of boxes) {
    const c0 = Math.floor(b[0] / B), c1 = Math.floor((b[2] - 1) / B), r0 = Math.floor(b[1] / B), r1 = Math.floor((b[3] - 1) / B);
    for (let r = r0; r <= r1; r++) mark.fill(1, r * cols + c0, r * cols + c1 + 1);
  }
  const out: Box[] = [];
  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!mark[r * cols + c]) { c++; continue; }
      const start = c;
      while (c < cols && mark[r * cols + c]) c++;
      out.push([start * B, r * B, Math.min(W, c * B), Math.min(H, (r + 1) * B)]);
    }
  }
  return out;
}

/** 断言：单子两两不相交（内核画之前查；违反 = 抛，不悄悄画两遍）。 */
export function assertDisjoint(rects: readonly DirtyRect[]): void {
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) throw new Error(`DIRTY_RECTS_OVERLAP:${JSON.stringify(a)}~${JSON.stringify(b)}`);
  }
}
