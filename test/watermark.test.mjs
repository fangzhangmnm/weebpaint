// created 2026-08-28 by Claude Opus 5 (subagent)
// #13 导出自定义水印（宣发需要）。两层分开测：
//   ① 纯字节合成器 backend/algorithms/watermark.ts —— 落点/边距/装不下弃贴/over 数学（node 全可测）。
//   ② 文字栅格壳 watermark-raster.ts —— node 无 OffscreenCanvas，只能测**降级返 null** 那条腿
//      （= 导出照常、静默不加水印的产品契约）+ 字号钳制这段纯数学。
import { describe, it } from "./runner.mjs";
import assert from "node:assert/strict";
import { compositeWatermark } from "../src/backend/algorithms/watermark.ts";
import { rasterWatermarkText, watermarkFontPx } from "../src/watermark-raster.ts";

/** 全透明画布（straight RGBA）。 */
function blank(w, h) { return new Uint8ClampedArray(w * h * 4); }
/** 铺一层不透明底色。 */
function filled(w, h, r, g, b, a = 255) {
  const d = blank(w, h);
  for (let p = 0; p < w * h; p++) { d[p * 4] = r; d[p * 4 + 1] = g; d[p * 4 + 2] = b; d[p * 4 + 3] = a; }
  return d;
}
const px = (d, w, x, y) => [...d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
/** 纯色不透明水印块（落点测试用：一眼看得出贴哪了）。 */
function markSolid(w, h, r, g, b, a = 255) { return { bytes: filled(w, h, r, g, b, a), w, h }; }
/** 合成器内部的边距公式（测试独立复算一遍，别从实现 import 常数——那样等于自证）。 */
const marginOf = (dw, dh) => Math.max(8, Math.min(64, Math.round(Math.min(dw, dh) * 0.02)));

describe("watermark 合成器（#13，纯字节）", () => {
  it("落点：贴右下角，左/上邻位不被碰", () => {
    const dw = 400, dh = 300, mw = 40, mh = 20;
    const dst = blank(dw, dh);
    compositeWatermark(dst, dw, dh, markSolid(mw, mh, 255, 0, 0));
    const m = marginOf(dw, dh);                       // 300*0.02=6 → 钳到 8
    assert.equal(m, 8, "短边 2% 被下限钳到 8px");
    const x1 = dw - m - 1, y1 = dh - m - 1;           // 水印右下角像素
    const x0 = dw - m - mw, y0 = dh - m - mh;         // 水印左上角像素
    assert.deepEqual(px(dst, dw, x1, y1), [255, 0, 0, 255], "右下角贴上了");
    assert.deepEqual(px(dst, dw, x0, y0), [255, 0, 0, 255], "左上角也在块内");
    assert.deepEqual(px(dst, dw, x0 - 1, y0), [0, 0, 0, 0], "块左边一列没被碰");
    assert.deepEqual(px(dst, dw, x0, y0 - 1), [0, 0, 0, 0], "块上边一行没被碰");
    assert.deepEqual(px(dst, dw, x1 + 1, y1), [0, 0, 0, 0], "右边距区没被碰");
    assert.deepEqual(px(dst, dw, x1, y1 + 1), [0, 0, 0, 0], "下边距区没被碰");
    assert.deepEqual(px(dst, dw, dw - 1, dh - 1), [0, 0, 0, 0], "画布最角落是留白，不是水印");
  });

  it("边距：短边 2%，上钳 64px（大画不许离边越来越远）", () => {
    // 短边 6000 → 2% = 120 > 64 → 钳到 64。用小图不好验，这里只验公式两端 + 一次真贴。
    assert.equal(marginOf(6000, 8000), 64, "上钳 64");
    assert.equal(marginOf(100, 100), 8, "下钳 8");
    const dw = 2000, dh = 1000;                        // 短边 1000 → 20px（区间内，不钳）
    assert.equal(marginOf(dw, dh), 20);
    const dst = blank(dw, dh);
    compositeWatermark(dst, dw, dh, markSolid(10, 10, 0, 255, 0));
    assert.deepEqual(px(dst, dw, dw - 20 - 1, dh - 20 - 1), [0, 255, 0, 255], "右下角内缩 20px");
    assert.deepEqual(px(dst, dw, dw - 20, dh - 20 - 1), [0, 0, 0, 0], "边距带空着");
  });

  it("装不下就弃贴：目标一个字节都不动（宁可不贴，不缩到糊）", () => {
    const dw = 60, dh = 60;                            // margin = 8
    for (const mark of [markSolid(60, 10, 255, 0, 0), markSolid(10, 60, 255, 0, 0), markSolid(53, 53, 255, 0, 0)]) {
      const dst = filled(dw, dh, 9, 9, 9);
      const before = new Uint8ClampedArray(dst);
      compositeWatermark(dst, dw, dh, mark);
      assert.deepEqual([...dst], [...before], `${mark.w}×${mark.h} 装不下（含边距）→ 原样`);
    }
    // 边界另一侧：恰好装得下（w + margin === dw）就该贴
    const dst = filled(dw, dh, 9, 9, 9);
    compositeWatermark(dst, dw, dh, markSolid(52, 52, 255, 0, 0));
    assert.deepEqual(px(dst, dw, dw - 8 - 1, dh - 8 - 1), [255, 0, 0, 255], "52+8=60 → 恰好贴上");
  });

  it("over 数学：straight-alpha 合成（不透明覆盖 / 半透明混色 / 全透明像素跳过）", () => {
    const dw = 40, dh = 40, m = marginOf(dw, dh);      // 8
    // ① 半透明白字压在不透明黑底上：α=128 → 结果 RGB ≈ 128、α=255
    {
      const dst = filled(dw, dh, 0, 0, 0);
      const mark = markSolid(4, 4, 255, 255, 255, 128);
      compositeWatermark(dst, dw, dh, mark);
      const [r, g, b, a] = px(dst, dw, dw - m - 1, dh - m - 1);
      assert.equal(a, 255, "底不透明 → 输出仍不透明");
      const sa = 128 / 255;
      const want = Math.round((255 * sa + 0 * 1 * (1 - sa)) / 1);
      assert.deepEqual([r, g, b], [want, want, want], `over 混色 = ${want}`);
    }
    // ② 半透明白字压在**全透明**底上：α 不变、RGB 保源色（不该被黑底污染）
    {
      const dst = blank(dw, dh);
      compositeWatermark(dst, dw, dh, markSolid(4, 4, 255, 255, 255, 128));
      assert.deepEqual(px(dst, dw, dw - m - 1, dh - m - 1), [255, 255, 255, 128], "透明底上 = 源色源 α");
    }
    // ③ 水印里 α=0 的像素跳过：底原样（水印块是矩形，字之间大片透明，绝不能挖洞）
    {
      const dst = filled(dw, dh, 7, 8, 9);
      const mark = markSolid(4, 4, 255, 0, 0, 0);      // 整块全透明
      const before = new Uint8ClampedArray(dst);
      compositeWatermark(dst, dw, dh, mark);
      assert.deepEqual([...dst], [...before], "α=0 一律跳过");
    }
    // ④ 不透明水印直接覆盖
    {
      const dst = filled(dw, dh, 7, 8, 9);
      compositeWatermark(dst, dw, dh, markSolid(4, 4, 12, 34, 56));
      assert.deepEqual(px(dst, dw, dw - m - 1, dh - m - 1), [12, 34, 56, 255]);
    }
  });
});

describe("watermark 文字栅格壳（#13，canvas 豁免域）", () => {
  it("字号 = clamp(导出宽 × 2.5%, 12, 96)", () => {
    assert.equal(watermarkFontPx(2000), 50, "区间内按比例");
    assert.equal(watermarkFontPx(100), 12, "小图钳到 12");
    assert.equal(watermarkFontPx(400), 12, "400×2.5%=10 → 钳 12");
    assert.equal(watermarkFontPx(8000), 96, "大图钳到 96");
    assert.equal(watermarkFontPx(0), 12);
    assert.equal(watermarkFontPx(NaN), 12, "脏输入不炸");
  });

  it("降级：无 OffscreenCanvas → 返 null = 静默不加水印，导出照常", () => {
    // hermetic：别的测试（app-boot / doc-*）会往 globalThis 漏 OffscreenCanvas stub，
    // 这里自己造「没有 glyph 器官」的环境，不依赖注册顺序。
    const prev = globalThis.OffscreenCanvas;
    delete globalThis.OffscreenCanvas;
    try {
      assert.equal(typeof OffscreenCanvas, "undefined", "前提：本次确实没有 glyph 器官");
      assert.equal(rasterWatermarkText("@夏音", 2000), null);
    } finally {
      if (prev !== undefined) globalThis.OffscreenCanvas = prev;
    }
  });

  it("空文字一律 null（开关开着但没填字 ≠ 贴个空白块）", () => {
    assert.equal(rasterWatermarkText("", 2000), null);
    assert.equal(rasterWatermarkText("   ", 2000), null);
    assert.equal(rasterWatermarkText(undefined, 2000), null);
  });
});
