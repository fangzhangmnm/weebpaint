// bake-cells —— 落层只读回这一笔碰过的格（CatsUp 贴图主线 1-4d 第 8 条；统筹 11-11 定的形状）。created 2026-11-11 by Claude Opus 5.5
// 以前落层（bakeStamps）把这一笔的整个方框一次读回；方框是这一笔碰过的外接框，跨片的笔外接框很大、墨很少（量：读回的 8 × 8 格只有 4–16% 有墨）。
// 现在宿主可以交「这一笔碰过的格」（HostOverlayInput.cells，脏格子位图）。内核：
//   ① 一次画一张小暂存图（bake-pack）：上半 = 报了的每一格原样拷进一个格位（一行 slots 个格位）；下半 = 核对片：方框里每一格一个像素 =
//      这一格里「合出来的 merged」和「这一层原来的 base」任一通道差的最大值，报了的格写 0。
//   ② 一次 readPixels 读整张暂存图（只等显卡一次）。核对片有不是 0 的 = 宿主报漏了 → 照旧读整个方框（绝不少写），报告 box-unreported。
//   ③ 没漏 = 按格位拆回：每一段行程拼成一块交给 apply（宿主的 applyRegionDiff）；图块里没读的部分保持原样。
// 核对比的是「这一格真变了没有」，不是「薄层 α 是不是 0」：α = 0 不改底下只是现在这几种叠法正好成立的性质，以后多一种叠法 / 笔不一定（统筹 11-11）。
// 纯函数部分（planCells / unpackRuns）零依赖；GLSL 的 CPU 孪生在 soft-shaders.ts（bake-pack）。

import type { DirtyCells, DirtyRect } from "../../common/dirty-rects.ts";

/** 格子边长（和 DirtyCells 的 cell 一样；只认 8）。 */
export const BAKE_CELL = 8;
/** 格位数据表（r32f）的宽：第 k 个格位的格子坐标存在 2k、2k + 1。 */
export const BAKE_LIST_W = 2048;
/** 暂存图一行最多几个格位（宽 = 8 × 这个）。 */
export const BAKE_SLOTS_MAX = 256;

/** 一次落层的报告（GLBoard.lastBake）。宿主看 path 记日志；内核不认识宿主的日志。 */
export interface BakeReport {
  /** box = 读整个方框（没报格 / 报的格读回不比方框省）；cells = 只读报的格；box-unreported = 报了格、但报的格以外方框里有格真变了 → 读整个方框。 */
  readonly path: "box" | "cells" | "box-unreported";
  /** 这一次落层 readPixels 了几次（cells = 1：格子和核对片一起读；box-unreported = 2）。 */
  readonly readCalls: number;
  readonly readBytes: number;
  /** 报了几格（方框里的；没报 = 0）。 */
  readonly cells: number;
  /** 报的格以外、方框里真变了的格数（box-unreported 时 > 0）。 */
  readonly strayCells: number;
}

/** 落层的格子计划：报了的格（按行段、从左到右的先后 = 格位的先后）、方框的格子范围、方框里每一格报没报（r8）、暂存图大小。 */
export interface CellPlan {
  /** 报了的格的格子坐标（先后 = 格位）。 */
  readonly list: Float32Array;   // [cx0, cy0, cx1, cy1, …]
  readonly n: number;
  /** 行段（画布像素，按格对齐、夹进画布）：拆回时一段一次 apply。 */
  readonly runs: readonly DirtyRect[];
  /** 方框的格子范围：左上那一格、几列几行。 */
  readonly c0x: number; readonly c0y: number; readonly cw: number; readonly ch: number;
  /** 方框里每一格报没报（cw × ch，255 = 报了，0 = 没报；r8 取样归一 → 1.0 / 0.0）。 */
  readonly mask: Uint8Array;
  /** 暂存图：宽（像素）、格子那一半几行像素、核对片几行、总高。 */
  readonly sw: number; readonly packRows: number; readonly verifyRows: number; readonly sh: number;
}

/**
 * 从宿主报的格算计划。方框外的格不要（方框 = 这一笔碰过的外接框；报在外面的格 merged = base，读了也是白读）。
 * 报的格一格都不在方框里 = null（照旧读方框）。
 */
export function planCells(cells: DirtyCells, bx: number, by: number, bw: number, bh: number): CellPlan | null {
  if (cells.cell !== BAKE_CELL) return null;
  const c = BAKE_CELL, c0x = Math.floor(bx / c), c0y = Math.floor(by / c), c1x = Math.floor((bx + bw - 1) / c), c1y = Math.floor((by + bh - 1) / c);
  const cw = c1x - c0x + 1, ch = c1y - c0y + 1, mask = new Uint8Array(cw * ch), coords: number[] = [], runs: DirtyRect[] = [];
  for (const r of cells.runs()) {
    const cy = r.y / c;
    if (cy < c0y || cy > c1y) continue;
    const k0 = Math.max(r.x / c, c0x), k1 = Math.min(Math.floor((r.x + r.w - 1) / c), c1x);
    if (k1 < k0) continue;
    for (let k = k0; k <= k1; k++) { coords.push(k, cy); mask[(cy - c0y) * cw + (k - c0x)] = 255; }   // r8 取样是归一的：255 = 1.0（写 1 = 1/255，着色器里 > 0.5 判不出来）
    const x = k0 * c, xe = Math.min(cells.w, (k1 + 1) * c);
    runs.push({ x, y: r.y, w: xe - x, h: r.h });
  }
  const n = coords.length / 2;
  if (!n) return null;
  const slots = Math.min(BAKE_SLOTS_MAX, n), sw = slots * c, packRows = Math.ceil(n / slots) * c, verifyRows = Math.ceil((cw * ch) / sw);
  return { list: Float32Array.from(coords), n, runs, c0x, c0y, cw, ch, mask, sw, packRows, verifyRows, sh: packRows + verifyRows };
}

/** 读回来的暂存图里核对片有几格不是 0（= 报的格以外真变了的格数）。 */
export function strayCount(px: Uint8Array, plan: CellPlan): number {
  let n = 0;
  const total = plan.cw * plan.ch, base = plan.packRows * plan.sw * 4;
  for (let v = 0; v < total; v++) { const o = base + v * 4; if (px[o] | px[o + 1] | px[o + 2] | px[o + 3]) n++; }
  return n;
}

/**
 * 按格位拆回：每一段行程拼成一块（行段的宽 × 高，RGBA 字节）交给 apply。格位的先后 = planCells 的先后（行段从上到下、每段从左到右）。
 * 返回各段 apply 交回来的变了的图块（去重）。apply 中途抛 = 原样抛出去（这一笔整笔不落归调用的人：令牌取消、已写的回滚）。
 */
export function unpackRuns(
  px: Uint8Array, plan: CellPlan,
  apply: (px: Uint8ClampedArray, x: number, y: number, w: number, h: number) => { tx: number; ty: number }[],
): { tx: number; ty: number }[] {
  const c = BAKE_CELL, slots = plan.sw / c, seen = new Set<string>(), out: { tx: number; ty: number }[] = [];
  let k = 0;
  for (const r of plan.runs) {
    const buf = new Uint8ClampedArray(r.w * r.h * 4), ncell = Math.ceil(r.w / c);
    for (let j = 0; j < ncell; j++, k++) {
      const sx = (k % slots) * c, sy = Math.floor(k / slots) * c, cwid = Math.min(c, r.w - j * c);
      for (let yy = 0; yy < r.h; yy++) {
        const so = ((sy + yy) * plan.sw + sx) * 4, dO = (yy * r.w + j * c) * 4;
        buf.set(px.subarray(so, so + cwid * 4), dO);
      }
    }
    for (const t of apply(buf, r.x, r.y, r.w, r.h)) { const key = `${t.tx},${t.ty}`; if (!seen.has(key)) { seen.add(key); out.push(t); } }
  }
  return out;
}

/** bake-pack 的片元（顶点 = COMPOSITE_VERT 铺满暂存图）。CPU 孪生 = soft-shaders.ts bakePack，逐行镜像。 */
export const BAKE_PACK_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_merged;   // 合出来的（底 ⊕ 薄层），画布大小
uniform sampler2D u_base;     // 这一层原来的（同一个合成器、不带薄层），画布大小
uniform sampler2D u_list;     // r32f：第 k 个格位的格子坐标在 2k、2k + 1（${BAKE_LIST_W} 宽折行）
uniform sampler2D u_mask;     // r8：方框里每一格报没报（cw × ch）
uniform vec2 u_size;          // 暂存图（像素）
uniform float u_n;            // 报了几格
uniform float u_packRows;     // 格子那一半几行像素
uniform vec4 u_cells;         // 方框的格子范围：c0x, c0y, cw, ch
uniform vec4 u_box;           // 方框（画布像素）：x0, y0, x1, y1（右下不含）
float listAt(int i){ return texelFetch(u_list, ivec2(i % ${BAKE_LIST_W}, i / ${BAKE_LIST_W}), 0).r; }
void main(){
  ivec2 p = ivec2(floor(v_uv * u_size));
  int sw = int(u_size.x);
  if (p.y < int(u_packRows)) {
    int slot = (p.y / ${BAKE_CELL}) * (sw / ${BAKE_CELL}) + p.x / ${BAKE_CELL};
    if (slot >= int(u_n)) { o = vec4(0.0); return; }
    ivec2 q = ivec2(int(listAt(2 * slot)) * ${BAKE_CELL} + p.x % ${BAKE_CELL}, int(listAt(2 * slot + 1)) * ${BAKE_CELL} + p.y % ${BAKE_CELL});
    ivec2 ds = textureSize(u_merged, 0);
    o = (q.x < ds.x && q.y < ds.y) ? texelFetch(u_merged, q, 0) : vec4(0.0);
    return;
  }
  int v = (p.y - int(u_packRows)) * sw + p.x, cw = int(u_cells.z), ch = int(u_cells.w);
  if (v >= cw * ch) { o = vec4(0.0); return; }
  int gx = v % cw, gy = v / cw;
  if (texelFetch(u_mask, ivec2(gx, gy), 0).r > 0.5) { o = vec4(0.0); return; }
  int cx = int(u_cells.x) + gx, cy = int(u_cells.y) + gy;
  float d = 0.0;
  for (int yy = 0; yy < ${BAKE_CELL}; yy++) for (int xx = 0; xx < ${BAKE_CELL}; xx++) {
    ivec2 q = ivec2(cx * ${BAKE_CELL} + xx, cy * ${BAKE_CELL} + yy);
    if (q.x < int(u_box.x) || q.y < int(u_box.y) || q.x >= int(u_box.z) || q.y >= int(u_box.w)) continue;
    vec4 e = abs(texelFetch(u_merged, q, 0) - texelFetch(u_base, q, 0));
    d = max(d, max(max(e.r, e.g), max(e.b, e.a)));
  }
  o = vec4(d);
}`;
