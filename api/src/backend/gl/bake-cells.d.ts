import type { DirtyCells, DirtyRect } from "../../common/dirty-rects.ts";
/** 格子边长（和 DirtyCells 的 cell 一样；只认 8）。 */
export declare const BAKE_CELL = 8;
/** 格位数据表（r32f）的宽：第 k 个格位的格子坐标存在 2k、2k + 1。 */
export declare const BAKE_LIST_W = 2048;
/** 暂存图一行最多几个格位（宽 = 8 × 这个）。 */
export declare const BAKE_SLOTS_MAX = 256;
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
    readonly list: Float32Array;
    readonly n: number;
    /** 行段（画布像素，夹进方框）：拆回时一段一次 apply。k0 / k1 / cy = 这一段跨的格（格位按这个先后排）。
     *  夹进方框：方框外合出来的那张不是「落层」的那一块（薄层只合进方框；方框外全透明却带颜色的像素合一遍会变成 0，写回去 = 改了原来存着的字节）。 */
    readonly runs: readonly (DirtyRect & {
        readonly k0: number;
        readonly k1: number;
        readonly cy: number;
    })[];
    /** 方框的格子范围：左上那一格、几列几行。 */
    readonly c0x: number;
    readonly c0y: number;
    readonly cw: number;
    readonly ch: number;
    /** 方框里每一格报没报（cw × ch，255 = 报了，0 = 没报；r8 取样归一 → 1.0 / 0.0）。 */
    readonly mask: Uint8Array;
    /** 暂存图：宽（像素）、格子那一半几行像素、核对片几行、总高。 */
    readonly sw: number;
    readonly packRows: number;
    readonly verifyRows: number;
    readonly sh: number;
}
/**
 * 从宿主报的格算计划。方框外的格不要（方框 = 这一笔碰过的外接框；报在外面的格 merged = base，读了也是白读）。
 * 报的格一格都不在方框里 = null（照旧读方框）。
 */
export declare function planCells(cells: DirtyCells, bx: number, by: number, bw: number, bh: number): CellPlan | null;
/** 读回来的暂存图里核对片有几格不是 0（= 报的格以外真变了的格数）。 */
export declare function strayCount(px: Uint8Array, plan: CellPlan): number;
/**
 * 按格位拆回：每一段行程拼成一块（行段的宽 × 高，RGBA 字节）交给 apply。格位的先后 = planCells 的先后（行段从上到下、每段从左到右）。
 * 返回各段 apply 交回来的变了的图块（去重）。apply 中途抛 = 原样抛出去（这一笔整笔不落归调用的人：令牌取消、已写的回滚）。
 */
export declare function unpackRuns(px: Uint8Array, plan: CellPlan, apply: (px: Uint8ClampedArray, x: number, y: number, w: number, h: number) => {
    tx: number;
    ty: number;
}[]): {
    tx: number;
    ty: number;
}[];
/** bake-pack 的片元（顶点 = COMPOSITE_VERT 铺满暂存图）。CPU 孪生 = soft-shaders.ts bakePack，逐行镜像。 */
export declare const BAKE_PACK_FRAG = "#version 300 es\nprecision highp float;\nin vec2 v_uv;\nout vec4 o;\nuniform sampler2D u_merged;   // \u5408\u51FA\u6765\u7684\uFF08\u5E95 \u2295 \u8584\u5C42\uFF09\uFF0C\u753B\u5E03\u5927\u5C0F\nuniform sampler2D u_base;     // \u8FD9\u4E00\u5C42\u539F\u6765\u7684\uFF08\u540C\u4E00\u4E2A\u5408\u6210\u5668\u3001\u4E0D\u5E26\u8584\u5C42\uFF09\uFF0C\u753B\u5E03\u5927\u5C0F\nuniform sampler2D u_list;     // r32f\uFF1A\u7B2C k \u4E2A\u683C\u4F4D\u7684\u683C\u5B50\u5750\u6807\u5728 2k\u30012k + 1\uFF082048 \u5BBD\u6298\u884C\uFF09\nuniform sampler2D u_mask;     // r8\uFF1A\u65B9\u6846\u91CC\u6BCF\u4E00\u683C\u62A5\u6CA1\u62A5\uFF08cw \u00D7 ch\uFF09\nuniform vec2 u_size;          // \u6682\u5B58\u56FE\uFF08\u50CF\u7D20\uFF09\nuniform float u_n;            // \u62A5\u4E86\u51E0\u683C\nuniform float u_packRows;     // \u683C\u5B50\u90A3\u4E00\u534A\u51E0\u884C\u50CF\u7D20\nuniform vec4 u_cells;         // \u65B9\u6846\u7684\u683C\u5B50\u8303\u56F4\uFF1Ac0x, c0y, cw, ch\nuniform vec4 u_box;           // \u65B9\u6846\uFF08\u753B\u5E03\u50CF\u7D20\uFF09\uFF1Ax0, y0, x1, y1\uFF08\u53F3\u4E0B\u4E0D\u542B\uFF09\nfloat listAt(int i){ return texelFetch(u_list, ivec2(i % 2048, i / 2048), 0).r; }\nvoid main(){\n  ivec2 p = ivec2(floor(v_uv * u_size));\n  int sw = int(u_size.x);\n  if (p.y < int(u_packRows)) {\n    int slot = (p.y / 8) * (sw / 8) + p.x / 8;\n    if (slot >= int(u_n)) { o = vec4(0.0); return; }\n    ivec2 q = ivec2(int(listAt(2 * slot)) * 8 + p.x % 8, int(listAt(2 * slot + 1)) * 8 + p.y % 8);\n    ivec2 ds = textureSize(u_merged, 0);\n    o = (q.x < ds.x && q.y < ds.y) ? texelFetch(u_merged, q, 0) : vec4(0.0);\n    return;\n  }\n  int v = (p.y - int(u_packRows)) * sw + p.x, cw = int(u_cells.z), ch = int(u_cells.w);\n  if (v >= cw * ch) { o = vec4(0.0); return; }\n  int gx = v % cw, gy = v / cw;\n  if (texelFetch(u_mask, ivec2(gx, gy), 0).r > 0.5) { o = vec4(0.0); return; }\n  int cx = int(u_cells.x) + gx, cy = int(u_cells.y) + gy;\n  float d = 0.0;\n  for (int yy = 0; yy < 8; yy++) for (int xx = 0; xx < 8; xx++) {\n    ivec2 q = ivec2(cx * 8 + xx, cy * 8 + yy);\n    if (q.x < int(u_box.x) || q.y < int(u_box.y) || q.x >= int(u_box.z) || q.y >= int(u_box.w)) continue;\n    vec4 m = texelFetch(u_merged, q, 0), b = texelFetch(u_base, q, 0);\n    if (m.a == 0.0 && b.a == 0.0) continue;   // \u524D\u540E\u90FD\u5168\u900F\u660E = \u6CA1\u53D8\uFF08\u5168\u900F\u660E\u7684\u50CF\u7D20\u989C\u8272\u770B\u4E0D\u89C1\u3001\u4E0D\u662F\u753B\uFF1B\u5408\u6210\u4E00\u904D\u4F1A\u628A\u5B83\u5F52 0\uFF0C\u8BFB\u6574\u6846\u90A3\u6761\u8DEF\u672C\u6765\u4E5F\u8FD9\u6837\uFF09\n    vec4 e = abs(m - b);\n    d = max(d, max(max(e.r, e.g), max(e.b, e.a)));\n  }\n  o = vec4(d);\n}";
