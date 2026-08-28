// created 2026-08-28 by Claude Opus 5 (subagent)
// 文字水印栅格化壳（#13 导出自定义水印，宣发需要）。文字 → RGBA 字节（straight alpha），
// 交给纯字节合成器 backend/algorithms/watermark.ts 贴到导出平面右下角。
//
// ⚠⚠ **「字节进出不走 canvas」硬原则的一次声明豁免**（family CLAUDE.md / feedback_no_canvas_for_bytes）。
//   理由：运行时把**任意文字**（含 CJK / emoji / 用户自选字体栈）栅格成像素，浏览器里没有纯 TS 替代——
//   要么内嵌字体 + 自写 TrueType 光栅器（一个 hinting/整形的兔子洞，且仍解决不了系统字体），
//   要么用 canvas 的 fillText。这里选后者。
//   **边界（豁免只到这条线为止，别越）**：
//     · canvas 在本文件里只当 **glyph 器官**——setFont / measureText / strokeText+fillText / getImageData，
//       产出立即 `ImageData.data`（straight RGBA）转字节走人；不做缩放、不做合成、不做编码。
//     · 合成（over 数学）、边距、装不下弃贴 全在 backend/algorithms/watermark.ts 的纯字节域，本文件零算法。
//     · 出了这个文件，水印就是一块 { bytes, w, h }，跟画布字节同口径（straight alpha），管线不知道它来自 canvas。
//     · 别把本文件当「canvas 逃生门」复用去搬别的字节。
//
// 降级政策：任何一步失败（无 OffscreenCanvas / getContext 返 null / 度量退化 / 抛异常）→ **返 null**
//   = 静默不加水印，导出照常。水印是锦上添花，永远不许挡住「把画导出去」这件事。

import type { WatermarkRaster } from "./backend/algorithms/watermark.ts";

// 样式固定极简（不开放配置，只开放文字本身）：白字 + 1px 深描边 —— 任何底色上都读得出来。
const FILL = "rgba(255,255,255,0.72)";
const STROKE = "rgba(0,0,0,0.5)";
const STROKE_W = 2;            // 描边居中 → 向外只占 1px（= 设计上的「1px 深描边」）
const PAD = 3;                 // 画布留边：容下描边外沿 + 抗锯齿溢出
const FONT_STACK = `system-ui, -apple-system, "Segoe UI", "Helvetica Neue", "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`;
// 病理输入护栏（maxlength 之外的第二道）：超大栅格直接放弃——反正合成器也会「装不下弃贴」。
const MAX_W = 8192, MAX_H = 1024;

/** 字号 = clamp(导出宽 × 2.5%, 12, 96)。纯数学，单独导出供测试锚住钳制两端。 */
export function watermarkFontPx(exportWidth: number): number {
  const raw = (Number.isFinite(exportWidth) ? exportWidth : 0) * 0.025;
  return Math.round(Math.max(12, Math.min(96, raw)));
}

/**
 * 文字 → 水印 RGBA 块（straight alpha）。
 * @param text        水印文字（调用方负责 trim / 空串判断，这里再兜一次）
 * @param exportWidth 导出平面宽度（决定字号；裁到选区时传选区宽，不是 doc 宽）
 * @returns null = 本环境栅格不了 / 文字为空 → 调用方静默跳过水印
 */
export function rasterWatermarkText(text: string, exportWidth: number): WatermarkRaster | null {
  const s = (text || "").trim();
  if (!s) return null;
  if (typeof OffscreenCanvas === "undefined") return null;   // node / 老 Safari：无 glyph 器官 → 不加水印
  try {
    const fontPx = watermarkFontPx(exportWidth);
    const font = `${fontPx}px ${FONT_STACK}`;

    // ① 度量（1×1 画布，只为拿 ctx 的 measureText）
    const probe = new OffscreenCanvas(1, 1).getContext("2d");
    if (!probe) return null;
    probe.font = font;
    const m = probe.measureText(s);
    const textW = Math.ceil(m.width);
    if (!(textW > 0)) return null;
    // actualBoundingBox* 在部分实现里缺席/为负 → 用字号推的保守值兜底（宁可多留白，不许切掉笔画）
    const asc = Math.max(fontPx * 0.85, Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : 0);
    const desc = Math.max(fontPx * 0.25, Number.isFinite(m.actualBoundingBoxDescent) ? m.actualBoundingBoxDescent : 0);
    const w = textW + PAD * 2;
    const h = Math.ceil(asc + desc) + PAD * 2;
    if (w > MAX_W || h > MAX_H) return null;

    // ② 绘制（先描边后填字：描边在下，白字压在上面）
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.lineWidth = STROKE_W;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.strokeStyle = STROKE;
    ctx.strokeText(s, PAD, PAD + asc);
    ctx.fillStyle = FILL;
    ctx.fillText(s, PAD, PAD + asc);

    // ③ 读出即离场：ImageData 是 **straight**（非预乘）RGBA，与全链口径一致，直接交给纯字节合成器。
    const bytes = ctx.getImageData(0, 0, w, h).data;
    if (bytes.length !== w * h * 4) return null;   // shim / 退化实现（不信任残缺字节）
    return { bytes, w, h };
  } catch {
    return null;   // 静默降级：导出不许因为水印失败而失败
  }
}
