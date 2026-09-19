// 液化 golden 用例表（created 2026-09-19 by Claude Fable 5.1）——液化搬 GPU 区域程序（第三批，总账 #71）的「精确翻译」验收锚。
//
// 问题陈述：输入 = 一或多张 doc 图（mock 层：整 doc 缓冲 + 内容 bbox）+ 一条笔画（doc 坐标点列）+ LiquifySettings（+ 可选选区）；
//   输出 = 每叶改写后的整张图字节 + dirty。golden = 旧 CPU LiquifyEngine（v0.14.19）删除前录下的输出（test/fixtures/liquify-golden.json）。
//   验收契约：新引擎（RegionStroke / SoftGl2Port / 真 GL）逐叶整图 |Δ| ≤ tol（CPU 自证 0；GPU ±2/255），golden dirty ⊆ 引擎 dirty。
// 本文件只放「表」+ 纯函数（浏览器可 bundle）；引擎与写靶由生成器/测试注入。

export const DOC_W = 96, DOC_H = 64;

function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/** 叶内容：{x,y,w,h} 内不透明，颜色 = 渐变 + 噪声细节（几何看得出 warp）；外透明；opts.alphaEdge = 右侧 8px 半透明渐隐。 */
export function layerFill(buf, docW, rect, seed, tint) {
  const rnd = lcg(seed);
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
    const i = (y * docW + x) * 4;
    const gx = (x - rect.x) / rect.w, gy = (y - rect.y) / rect.h;
    const n = (rnd() * 40) | 0;
    buf[i] = Math.min(255, (tint[0] * gx + n) | 0); buf[i + 1] = Math.min(255, (tint[1] * gy + n) | 0); buf[i + 2] = Math.min(255, (tint[2] * (1 - gx) + n) | 0);
    const edge = rect.x + rect.w - x;   // 右缘 8px 渐隐（半透明边测 premult 采样）
    buf[i + 3] = edge <= 8 ? Math.round(255 * edge / 9) : 255;
  }
}
export const LEAF_A = { rect: { x: 20, y: 12, w: 50, h: 40 }, seed: 0xA11, tint: [230, 200, 90] };
export const LEAF_B = { rect: { x: 28, y: 6, w: 40, h: 46 }, seed: 0xB22, tint: [60, 180, 240] };

/** 选区 mock（引擎两个读口都要：materializeMaskRegion + sampleAt）：矩形 [22,64)×[10,50) 挖一个圆洞 (46,30) r=6。 */
export function makeSelection() {
  const inside = (x, y) => x >= 22 && x < 64 && y >= 10 && y < 50 && Math.hypot(x - 46, y - 30) >= 6;
  return {
    materializeMaskRegion(x0, y0, w, h) {
      const m = new Uint8Array(Math.max(0, w * h));
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) m[j * w + i] = inside(x0 + i, y0 + j) ? 255 : 0;
      return m;
    },
    sampleAt(x, y) { return (x < 0 || y < 0 || x >= DOC_W || y >= DOC_H) ? 0 : (inside(x, y) ? 255 : 0); },
  };
}

/** 笔画点列（第一个点 = beginStroke 位置，其余 extendStroke）。 */
export function strokePoints(kind) {
  switch (kind) {
    case "push-right":   return [[38, 32], [46, 33], [54, 34], [62, 34]];
    case "push-diag":    return [[30, 20], [40, 30], [50, 40]];
    case "radial":       return [[46, 30], [47, 30], [47, 31]];            // pinch/bloat/twirl：几乎不动，靠半径场
    case "off-edge":     return [[70, 30], [84, 32], [98, 34], [110, 36]];   // 拖出 doc 右缘
    case "back-forth":   return [[40, 30], [52, 30], [40, 30], [52, 30]];
    default: throw new Error("unknown stroke " + kind);
  }
}

const BASE = { size: 14, strength: 1, mode: "push", bleed: "edge", sample: "bilinear" };
export function settingsFor(over) { return { ...BASE, ...over }; }

/** 用例表：name / settings 覆写 / 笔画 / 叶（A 或 A+B）/ 是否带选区。编号只加不改。 */
export const CASES = [
  { name: "push-bilinear",          s: {},                                       stroke: "push-right",  leaves: "A" },
  { name: "push-nearest",           s: { sample: "nearest" },                    stroke: "push-right",  leaves: "A" },
  { name: "push-bicubic",           s: { sample: "bicubic" },                    stroke: "push-right",  leaves: "A" },
  { name: "push-spline",            s: { sample: "spline" },                     stroke: "push-right",  leaves: "A" },
  { name: "push-diag-bicubic-s0.6", s: { sample: "bicubic", strength: 0.6 },     stroke: "push-diag",   leaves: "A" },
  { name: "pinch",                  s: { mode: "pinch", size: 20 },              stroke: "radial",      leaves: "A" },
  { name: "bloat",                  s: { mode: "bloat", size: 20 },              stroke: "radial",      leaves: "A" },
  { name: "twirl",                  s: { mode: "twirl", size: 20 },              stroke: "radial",      leaves: "A" },
  { name: "twirlCW-bicubic",        s: { mode: "twirlCW", size: 20, sample: "bicubic" }, stroke: "radial", leaves: "A" },
  { name: "reconstruct-noop",       s: { mode: "reconstruct", size: 20 },        stroke: "radial",      leaves: "A" },
  { name: "sel-edge",               s: {},                                       stroke: "push-right",  leaves: "A", sel: true },
  { name: "sel-clip",               s: { bleed: "clip" },                        stroke: "push-right",  leaves: "A", sel: true },
  { name: "sel-import",             s: { bleed: "import" },                      stroke: "push-right",  leaves: "A", sel: true },
  { name: "sel-edge-bicubic",       s: { sample: "bicubic" },                    stroke: "push-diag",   leaves: "A", sel: true },
  { name: "sel-edge-nearest",       s: { sample: "nearest" },                    stroke: "push-right",  leaves: "A", sel: true },
  { name: "off-edge",               s: {},                                       stroke: "off-edge",    leaves: "A" },
  { name: "back-forth-s2",          s: { strength: 2 },                          stroke: "back-forth",  leaves: "A" },
  { name: "group-AB",               s: {},                                       stroke: "push-right",  leaves: "AB" },
  { name: "group-AB-sel-bicubic",   s: { sample: "bicubic" },                    stroke: "push-diag",   leaves: "AB", sel: true },
  { name: "big-size-40",            s: { size: 40 },                             stroke: "push-diag",   leaves: "A" },
];

export function leafSpecs(c) { return c.leaves === "AB" ? [LEAF_A, LEAF_B] : [LEAF_A]; }

/**
 * 跑一个用例。targets = 引擎写靶数组（CPU mock 层 / RegionStroke）；engine 形 = beginStroke(targets, settings, x, y, sel) /
 * extendStroke(x, y) / flushDirty / endStroke。返回 dirty。
 */
export function runCase(engine, targets, c) {
  const pts = strokePoints(c.stroke);
  const sel = c.sel ? makeSelection() : null;
  engine.beginStroke(targets, settingsFor(c.s), pts[0][0], pts[0][1], sel);
  for (let i = 1; i < pts.length; i++) engine.extendStroke(pts[i][0], pts[i][1]);
  const dirty = engine.flushDirty();
  engine.endStroke();
  return dirty;
}

export function compareBytes(a, b, tol) {
  if (a.length !== b.length) throw new Error(`length mismatch ${a.length} vs ${b.length}`);
  let maxDiff = 0, count = 0, first = -1;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > maxDiff) maxDiff = d; if (d > tol) { count++; if (first < 0) first = i; } }
  return { maxDiff, count, first };
}
export function rectContains(outer, inner) {
  if (!inner) return true;
  if (!outer) return false;
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}
