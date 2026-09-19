// 色彩类滤镜笔（模糊/锐化）间距地板 10%（created 2026-09-05 by Claude Fable 5.1）。
// user 2026-09-05 晚：「大滤镜笔性能确实不可接受，有模糊的话改回 10%」「模糊锐化自己的地板同意」——v0.13.4 让模糊跟笔的
//   间距（出厂滤镜笔 2%）→ 每颗 dab 一次卷积，大笔一笔 4.7s。地板 = 笔间距 <10% 时按 10% 撒点；≥10% 照笔。
import { describe, it, eq, assert } from "./runner.mjs";
import { SharpenBlurFilter } from "../src/plugins/sharpen-blur.ts";
import { COLOR_BRUSH_MIN_SPACING } from "../src/filters.ts";

import { gpuLayer } from "./region-target.mjs";   // 2026-09-18 GPU 写靶（RegionStroke，snapshot=W₀）
function mockLayer(w, h) { const L = gpuLayer(w, h, { snapshot: true }); L.buf.fill(200); return L; }
// 一笔 200px 直线，返回 dab 数（2026-09-06 wash 幂等后写回按 flush 不按 dab → 观测 state.dabs）
function dabs(spacing) {
  const L = mockLayer(300, 60);
  const rs = L.open();
  const st = SharpenBlurFilter.beginBrushStroke([rs], { amount: -40 }, { size: 40, hardness: 0.5, flow: 1, spacing }, null, 40, 30, 1);
  for (let x = 41; x <= 240; x++) SharpenBlurFilter.extendBrushStamp(st, x, 30, 1);
  SharpenBlurFilter.endBrushStroke(st);
  assert(rs.dirty, "抬笔要把 pending dab 合成掉（W 有 dirty）");
  L.close(rs);
  return st.dabs;
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
