// 色彩类滤镜笔（模糊/锐化）间距地板 10%（created 2026-09-05 by Claude Fable 5.1）。
// user 2026-09-05 晚：「大滤镜笔性能确实不可接受，有模糊的话改回 10%」「模糊锐化自己的地板同意」——v0.13.4 让模糊跟笔的
//   间距（出厂滤镜笔 2%）→ 每颗 dab 一次卷积，大笔一笔 4.7s。地板 = 笔间距 <10% 时按 10% 撒点；≥10% 照笔。
import { describe, it, eq, assert } from "./runner.mjs";
import { SharpenBlurFilter } from "../src/plugins/sharpen-blur.ts";
import { COLOR_BRUSH_MIN_SPACING } from "../src/filters.ts";

function mockLayer(docW, docH) {
  const buf = new Uint8ClampedArray(docW * docH * 4).fill(200);
  const L = {
    docW, docH, buf, bboxX: 0, bboxY: 0, bboxW: docW, bboxH: docH, puts: 0,
    getImageData(x0, y0, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x0 + w) * 4), yy * w * 4); return new ImageData(data, w, h); },
    putImageData(x0, y0, img) { L.puts++; for (let yy = 0; yy < img.height; yy++) buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y0 + yy) * docW + x0) * 4); },
  };
  return L;
}
// 一笔 200px 直线，返回 dab 数（= putImageData 次数）
function dabs(spacing) {
  const L = mockLayer(300, 60);
  const st = SharpenBlurFilter.beginBrushStroke([L], { amount: -40 }, { size: 40, hardness: 0.5, flow: 1, spacing }, null, 40, 30, 1);
  for (let x = 41; x <= 240; x++) SharpenBlurFilter.extendBrushStamp(st, x, 30, 1);
  SharpenBlurFilter.endBrushStroke(st);
  return L.puts;
}

describe("color-brush 间距地板", () => {
  it("地板常数 = 10%", () => { eq(COLOR_BRUSH_MIN_SPACING, 0.1); });
  it("笔间距 2% 与 10% 撒同样多的 dab（地板生效）；20% 更少", () => {
    const n2 = dabs(0.02), n10 = dabs(0.1), n20 = dabs(0.2);
    eq(n2, n10, `2%=${n2} vs 10%=${n10}`);
    assert(n20 < n10, `20%=${n20} 应少于 10%=${n10}`);
    // 直径 40 × 10% = 4px 一颗：200px ≈ 50 颗（首颗在 begin）
    assert(n10 >= 48 && n10 <= 53, `10% 约 50 颗，得 ${n10}`);
  });
});
