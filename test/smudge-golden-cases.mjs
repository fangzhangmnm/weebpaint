// smudge golden 用例表（created 2026-09-18 by Claude Fable 5.1）——手指 GPU 化轮的「精确翻译」验收锚。
//
// 问题陈述（家规：math 类先写清输入输出）：
//   输入 = 一张确定性合成的 doc 图（色块 + 透明区 + 半透明块 + 噪声带）+ 一条笔画（点列 + 压感）+ SmudgeSettings（+ 可选选区）；
//   输出 = 改写后的整张图字节 + 引擎报的 dirty bbox。
//   golden = 旧 CPU SmudgeEngine（v0.14.16，smudge-engine.ts）在删除前录下的输出（test/fixtures/smudge-golden.json）。
//   验收契约：新引擎（RegionStroke / SoftGl2Port / 真 GL）对同一输入，整图逐字节 |Δ| ≤ tol（CPU 自证 0；GPU ±2/255，
//   差异来源只有 f64→f32、sRGB LUT vs pow、归约求和顺序），且 golden 的 dirty ⊆ 引擎报的 dirty（多报无害，少报是 bug）。
//   提案与出处：ai-docs/20260918-region-programs-formalism-and-gpu-contract.md §3.5。
//
// 本文件只放「表」+ 纯函数，不 import 引擎——生成器与测试各自注入引擎/写靶，GPU 版换写靶即可复用整张表。

export const DOC_W = 72, DOC_H = 48;

// ---- 确定性输入图 ----
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
/** straight RGBA 字节，DOC_W×DOC_H：左红 | 中蓝(绿条) | 右透明；中下半透明块；底部噪声带；中央 alpha=0 洞。 */
export function buildImage() {
  const buf = new Uint8ClampedArray(DOC_W * DOC_H * 4);
  const set = (x, y, r, g, b, a) => { const i = (y * DOC_W + x) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; };
  for (let y = 0; y < DOC_H; y++) for (let x = 0; x < DOC_W; x++) {
    if (x < 24) set(x, y, 255, 0, 0, 255);
    else if (x < 48) set(x, y, 0, 0, 255, 255);
    else set(x, y, 0, 0, 0, 0);
  }
  for (let y = 10; y < 14; y++) for (let x = 24; x < 48; x++) set(x, y, 0, 200, 0, 255);      // 绿条（蓝区内）
  for (let y = 20; y < 30; y++) for (let x = 30; x < 42; x++) set(x, y, 255, 255, 0, 128);   // 半透明黄块
  for (let y = 16; y < 20; y++) for (let x = 12; x < 18; x++) set(x, y, 0, 0, 0, 0);         // 红区里的透明洞
  const rnd = lcg(0x5eed);
  for (let y = 32; y < DOC_H; y++) for (let x = 0; x < DOC_W; x++) {                          // 噪声带（drag lines 有纹理可搬）
    set(x, y, (rnd() * 255) | 0, (rnd() * 255) | 0, (rnd() * 255) | 0, x < 56 ? 255 : 0);
  }
  return buf;
}

// ---- 笔画点列 ----
/** kind → [{x,y,p}]；第一个点给 beginStroke，其余给 extendStroke。 */
export function strokePoints(kind) {
  const pts = [];
  const push = (x, y, p = 1) => pts.push({ x, y, p });
  switch (kind) {
    case "h-red-to-clear":      for (let x = 8; x <= 66; x += 1) push(x, 24); break;              // 横穿三区，拖进透明
    case "h-blue-to-red":       for (let x = 44; x >= 6; x -= 1) push(x, 12); break;              // 反向，过绿条
    case "diag-subpx":          for (let t = 0; t <= 60; t++) push(6 + t * 0.7, 6 + t * 0.55); break;   // 亚像素步
    case "sine":                for (let t = 0; t <= 70; t++) push(4 + t * 0.9, 24 + 8 * Math.sin(t / 6)); break;
    case "p-ramp":              for (let t = 0; t <= 60; t++) push(6 + t, 26, 0.15 + 0.85 * (t / 60)); break;  // 压感 0.15→1
    case "noise-band":          for (let x = 4; x <= 66; x += 1) push(x, 40); break;              // 噪声带里拖
    case "off-edge":            for (let x = 40; x <= 90; x += 1) push(x, 8); break;              // 拖出 doc 右缘之外
    case "from-outside":        for (let x = -12; x <= 30; x += 1) push(x, 36); break;            // 从 doc 外进来
    case "tap":                 push(20, 24); break;                                              // 只 begin（首 dab 只沾不放）
    case "short-back-forth":    for (let x = 20; x <= 40; x++) push(x, 24); for (let x = 39; x >= 20; x--) push(x, 24); break;
    default: throw new Error("unknown stroke kind " + kind);
  }
  return pts;
}

// ---- 选区 mock：x<40 全选，40..48 线性软边，圆洞 (20,24) r=5 ----
export function makeSelection() {
  return {
    materializeMaskRegion(x0, y0, w, h) {
      const m = new Uint8Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = x0 + i, y = y0 + j;
        let v = x < 40 ? 255 : x < 48 ? Math.round(255 * (48 - x) / 8) : 0;
        if (Math.hypot(x - 20, y - 24) < 5) v = 0;
        m[j * w + i] = v;
      }
      return m;
    },
  };
}

// ---- 设置 ----
const BASE = {
  mode: "smear", dull: 0, size: 12, hardness: 0.7, spacing: 0.1, strength: 0.7,
  sizeCoeff: 0, flowCoeff: 0, opaCoeff: 0, pressureGamma: 1, pressureCurve: null,
  colorRate: 0, dilution: 0, memoryLength: 0, color: [0.1, 0.9, 0.3], mix: "srgb", lockAlpha: false,
};
const PAINT = { mode: "paint", colorRate: 0.49, dull: 0.5, dilution: 0.32, memoryLength: 0.085 };   // = plugins/smudge.ts PAINT_DEFAULTS
export function settingsFor(over) { return { ...BASE, ...over }; }

/** 用例表：name / settings 覆写 / 笔画 / 是否带选区。编号只加不改（golden 文件按 name 索引）。 */
export const CASES = [
  { name: "smear-srgb",            s: {},                                            stroke: "h-red-to-clear" },
  { name: "smear-oklab",           s: { mix: "oklab" },                              stroke: "h-red-to-clear" },
  { name: "smear-spectral",        s: { mix: "spectral" },                           stroke: "h-red-to-clear" },
  { name: "dull-srgb",             s: { mode: "dull", dull: 1 },                     stroke: "h-blue-to-red" },
  { name: "dull-oklab",            s: { mode: "dull", dull: 1, mix: "oklab" },       stroke: "h-blue-to-red" },
  { name: "dull-spectral",         s: { mode: "dull", dull: 1, mix: "spectral" },    stroke: "h-blue-to-red" },
  { name: "paint-srgb",            s: { ...PAINT },                                  stroke: "sine" },
  { name: "paint-oklab",           s: { ...PAINT, mix: "oklab" },                    stroke: "sine" },
  { name: "paint-spectral",        s: { ...PAINT, mix: "spectral" },                 stroke: "sine" },
  { name: "smear-strength1",       s: { strength: 1, hardness: 1 },                  stroke: "h-red-to-clear" },
  { name: "smear-strength0",       s: { strength: 0 },                               stroke: "h-red-to-clear" },
  { name: "smear-selection",       s: {},                                            stroke: "h-red-to-clear", sel: true },
  { name: "dull-selection-oklab",  s: { mode: "dull", dull: 1, mix: "oklab" },       stroke: "h-blue-to-red", sel: true },
  { name: "smear-lockAlpha",       s: { lockAlpha: true },                           stroke: "h-red-to-clear" },
  { name: "paint-lockAlpha",       s: { ...PAINT, lockAlpha: true },                 stroke: "h-red-to-clear" },
  { name: "smear-off-edge",        s: {},                                            stroke: "off-edge" },
  { name: "smear-from-outside",    s: {},                                            stroke: "from-outside" },
  { name: "tap-only",              s: {},                                            stroke: "tap" },
  { name: "dull-mid-0.5",          s: { mode: "dull", dull: 0.5 },                   stroke: "noise-band" },
  { name: "dull-mid-0.25-spectral",s: { mode: "dull", dull: 0.25, mix: "spectral" }, stroke: "noise-band" },
  { name: "smear-soft-h0.2",       s: { hardness: 0.2 },                             stroke: "noise-band" },
  { name: "smear-pressure",        s: { sizeCoeff: 0.6, flowCoeff: 0.5, opaCoeff: 0.5, pressureGamma: 1.6 }, stroke: "p-ramp" },
  { name: "smear-subpx-spacing",   s: { spacing: 0.03, size: 9 },                    stroke: "diag-subpx" },
  { name: "paint-dilution-only",   s: { mode: "paint", colorRate: 0.4, dilution: 0.8, memoryLength: 0, dull: 0 }, stroke: "h-red-to-clear" },
  { name: "paint-memory-long",     s: { ...PAINT, memoryLength: 1.5 },               stroke: "sine" },
  { name: "smear-big-40",          s: { size: 40, spacing: 0.06 },                   stroke: "h-red-to-clear" },
  { name: "smear-back-forth",      s: { strength: 0.9 },                             stroke: "short-back-forth" },
];

// ---- 跑一个用例：engine 是 SmudgeEngine 形（beginStroke/extendStroke/flushDirty/endStroke），target 是写靶 ----
//   target 有 open/close（GPU 写靶，test/smudge-gpu-target.mjs）→ 一笔一个 RegionStroke；否则按旧 CPU 签名直接传（录 golden 时的路径，已封存）。
export function runCase(engine, target, c) {
  const pts = strokePoints(c.stroke);
  const sel = c.sel ? makeSelection() : null;
  const rs = target.open ? target.open(sel) : null;
  if (rs) engine.beginStroke(rs, settingsFor(c.s), pts[0].x, pts[0].y, pts[0].p);
  else engine.beginStroke(target, settingsFor(c.s), pts[0].x, pts[0].y, pts[0].p, sel);
  for (let i = 1; i < pts.length; i++) engine.extendStroke(pts[i].x, pts[i].y, pts[i].p);
  const dirty = engine.flushDirty();
  engine.endStroke();
  if (rs) target.close(rs);
  return dirty;
}

/** CPU 写靶（= StrokeTarget 的字节子集）：docW/docH + getImageData/putImageData + buf。 */
export function makeByteTarget(buf, docW = DOC_W, docH = DOC_H) {
  return {
    docW, docH, buf,
    bboxX: 0, bboxY: 0, bboxW: docW, bboxH: docH,
    getImageData(x0, y0, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x0 + w) * 4), yy * w * 4);
      return new ImageData(data, w, h);
    },
    putImageData(x0, y0, img) {
      for (let yy = 0; yy < img.height; yy++) buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y0 + yy) * docW + x0) * 4);
    },
  };
}

// ---- 编解码（fixture 里存整图：deflateRaw + base64）----
import { deflateRawSync, inflateRawSync } from "node:zlib";
export function encodeBytes(u8) { return Buffer.from(deflateRawSync(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength))).toString("base64"); }
export function decodeBytes(b64) { const b = inflateRawSync(Buffer.from(b64, "base64")); return new Uint8ClampedArray(b.buffer, b.byteOffset, b.byteLength); }

/** 逐字节比较：返回 {maxDiff, count(>tol), first(index)}。 */
export function compareBytes(a, b, tol) {
  if (a.length !== b.length) throw new Error(`length mismatch ${a.length} vs ${b.length}`);
  let maxDiff = 0, count = 0, first = -1;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxDiff) maxDiff = d;
    if (d > tol) { count++; if (first < 0) first = i; }
  }
  return { maxDiff, count, first };
}
export function rectContains(outer, inner) {
  if (!inner) return true;
  if (!outer) return false;
  return outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
}
