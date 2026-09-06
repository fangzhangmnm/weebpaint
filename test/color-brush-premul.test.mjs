// 滤镜笔混回图层那一步的预乘回归（created 2026-09-05 by Claude Fable 5.1）。
// 问题陈述：v0.12.3 只把模糊**卷积**搬进预乘空间，attachColorBrushBehavior 的 _colorBrushStamp 末步
//   `layer = layer·(1−a) + dst·a` 仍在 straight RGBA 逐通道做——透明像素 RGB=(0,0,0) 按 (1−a) 掺进来，
//   模糊扩进原本透明像素的地方（stamp 软边）颜色被拉黑。期望：纯红 + 透明邻域，模糊笔刷过之后
//   所有 a>0 像素去预乘后仍是纯红。
import { describe, it, assert } from "./runner.mjs";
import { SharpenBlurFilter } from "../src/plugins/sharpen-blur.ts";

function mockLayer(docW, docH) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  return {
    docW, docH, buf, bboxX: 0, bboxY: 0, bboxW: docW, bboxH: docH,
    fill(x, y, w, h, [r, g, b, a]) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = (yy * docW + xx) * 4; buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; } },
    getImageData(x0, y0, w, h) { const data = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y0 + yy) * docW + x0) * 4, ((y0 + yy) * docW + x0 + w) * 4), yy * w * 4); return new ImageData(data, w, h); },
    putImageData(x0, y0, img) { for (let yy = 0; yy < img.height; yy++) buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), ((y0 + yy) * docW + x0) * 4); },
  };
}

describe("color-brush 末步预乘（模糊笔黑边残留）", () => {
  it("纯红块 + 透明邻域，模糊笔软边刷过 → a>0 像素仍纯红", () => {
    const L = mockLayer(48, 24);
    L.fill(0, 0, 20, 24, [255, 0, 0, 255]);
    const bs = { size: 12, hardness: 0.3, flow: 0.6, spacingValue: 0.2 };
    const st = SharpenBlurFilter.beginBrushStroke([L], { amount: -60 }, bs, null, 14, 12, 1);
    for (let x = 15; x <= 30; x++) SharpenBlurFilter.extendBrushStamp(st, x, 12, 1);
    SharpenBlurFilter.endBrushStroke(st);
    let checked = 0, spread = 0;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4;
      const a = L.buf[i + 3];
      if (a === 0) continue;
      checked++;
      if (x >= 20) spread++;
      assert(L.buf[i] >= 250, `(${x},${y}) r=${L.buf[i]} a=${a}：a>0 像素不得变暗`);
      assert(L.buf[i + 1] <= 3 && L.buf[i + 2] <= 3, `(${x},${y}) 绿蓝不得被污染`);
    }
    assert(checked > 0 && spread > 0, "模糊应把 alpha 扩进原本透明的一侧（否则测不到边）");
  });
});

describe("滤镜笔间距沿笔（2026-09-05 user「模糊也改，都统一」）", () => {
  it("同一笔画：spacing 0.1 的 dab 数明显多于 0.5；缺 spacing 时 spacingValue 兜底", () => {
    // 2026-09-06 wash 幂等后 bake 按 flush 只算一次（不再逐 dab）→ dab 数改读 state.dabs
    const count = (bs) => {
      const L = mockLayer(80, 24); L.fill(0, 0, 80, 24, [200, 100, 50, 255]);
      const st = SharpenBlurFilter.beginBrushStroke([L], { amount: -20 }, bs, null, 10, 12, 1);
      for (let x = 11; x <= 60; x++) SharpenBlurFilter.extendBrushStamp(st, x, 12, 1);
      SharpenBlurFilter.endBrushStroke(st);
      return st.dabs;
    };
    const coarse = count({ size: 10, hardness: 0.5, flow: 1, spacing: 0.5 });
    const fine = count({ size: 10, hardness: 0.5, flow: 1, spacing: 0.1 });
    const legacy = count({ size: 10, hardness: 0.5, flow: 1, spacingValue: 0.5 });
    assert(fine > coarse * 3, `0.1 应比 0.5 多得多 (fine=${fine}, coarse=${coarse})`);
    assert(Math.abs(legacy - coarse) <= 1, `spacingValue 兜底与 spacing 同值同 dab 数 (legacy=${legacy}, coarse=${coarse})`);
  });
});
