// 模糊工具黑边回归（user 0823「模糊工具黑边」；v0.12.3 修）。created 2026-08-30 by Claude Fable 5.
// 问题陈述：输入 = 纯红像素 + alpha 羽化边（邻域含透明像素，透明像素 RGB=0）。
//   旧实现 straight RGBA 逐通道 box 平均 → 透明黑被卷进颜色 → 羽化边 straight RGB 变暗（黑边）。
//   期望输出：全图只有一种颜色（纯红）时，模糊只动 alpha，不动色相/明度——
//   所有 a>0 像素反预乘后 RGB 仍 ≈ (255,0,0)。
import { describe, it, eq, assert } from "./runner.mjs";
import { SharpenBlurFilter } from "../src/plugins/sharpen-blur.ts";

function makeImg(w, h, fill) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) fill(d, i * 4, i % w, (i / w) | 0);
  return d;
}

describe("sharpen-blur 预乘黑边回归", () => {
  it("纯红 + 羽化边：模糊后 a>0 像素 RGB 仍纯红（黑边死）", () => {
    const w = 16, h = 16;
    // 左半不透明纯红，中列半透明纯红，右半全透明（RGB=0 = 经典黑边源）
    const src = makeImg(w, h, (d, o, x) => {
      if (x < 7) { d[o] = 255; d[o + 3] = 255; }
      else if (x === 7) { d[o] = 255; d[o + 3] = 128; }
      // x>7：全 0
    });
    const dst = new Uint8ClampedArray(src.length);
    SharpenBlurFilter.bake(src, dst, { amount: -50 }, null, w, h);
    let checked = 0;
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      if (dst[o + 3] === 0) continue;
      checked++;
      assert(dst[o] >= 253, `a>0 像素红通道不得变暗（x=${i % w} y=${(i / w) | 0} r=${dst[o]} a=${dst[o + 3]}）`);
      assert(dst[o + 1] <= 2 && dst[o + 2] <= 2, "绿蓝通道不得被污染");
    }
    assert(checked > 0, "至少要有 a>0 像素被检查");
  });

  it("不透明均色区内部：box blur 恒等（颜色与 alpha 均不动）", () => {
    const w = 8, h = 8;
    const src = makeImg(w, h, (d, o) => { d[o] = 30; d[o + 1] = 200; d[o + 2] = 90; d[o + 3] = 255; });
    const dst = new Uint8ClampedArray(src.length);
    SharpenBlurFilter.bake(src, dst, { amount: -100 }, null, w, h);
    for (let i = 0; i < src.length; i += 4) {
      assert(Math.abs(dst[i] - 30) <= 1 && Math.abs(dst[i + 1] - 200) <= 1 && Math.abs(dst[i + 2] - 90) <= 1, `均色恒等（o=${i}）`);
      eq(dst[i + 3], 255, "alpha 不动");
    }
  });

  it("alpha 通道仍在扩散（模糊没有被修没）", () => {
    const w = 9, h = 1;
    const src = makeImg(w, h, (d, o, x) => { if (x === 4) { d[o] = 255; d[o + 3] = 255; } });
    const dst = new Uint8ClampedArray(src.length);
    SharpenBlurFilter.bake(src, dst, { amount: -10 }, null, w, h);   // N=1，一轮 3×3
    assert(dst[4 * 4 + 3] < 255, "中心 alpha 应被抹开");
    assert(dst[3 * 4 + 3] > 0 && dst[5 * 4 + 3] > 0, "邻居 alpha 应收到扩散");
  });

  it("amount=0 恒等 / 锐化路径冒烟不炸", () => {
    const w = 4, h = 4;
    const src = makeImg(w, h, (d, o, x, y) => { d[o] = x * 60; d[o + 1] = y * 60; d[o + 2] = 128; d[o + 3] = 255; });
    const dst = new Uint8ClampedArray(src.length);
    SharpenBlurFilter.bake(src, dst, { amount: 0 }, null, w, h);
    for (let i = 0; i < src.length; i++) eq(dst[i], src[i], "amount=0 逐字节恒等");
    SharpenBlurFilter.bake(src, dst, { amount: 50 }, null, w, h);
    for (let i = 3; i < src.length; i += 4) eq(dst[i], src[i], "锐化不动 alpha");
  });
});
