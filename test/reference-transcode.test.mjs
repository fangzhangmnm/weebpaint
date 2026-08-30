// 参考图压缩政策纯函数验收（spec 20260830 §2；user 拍板：1024² 面积/小图豁免/拍平白底 jpeg）。
// created 2026-08-30 by Claude Fable 5.
import { describe, it, assert, eq } from "./runner.mjs";
import { planRefTranscode, flattenWhiteInPlace, REF_AREA_MAX } from "../src/reference-transcode.ts";

describe("reference-transcode 政策", () => {
  it("面积 ≤ 1024² → null（原样豁免：像素画/小图/贴纸走这条）", () => {
    eq(planRefTranscode(1024, 1024), null, "正好卡线也豁免");
    eq(planRefTranscode(64, 64), null);
    eq(planRefTranscode(4096, 256), null, "长边超 1024 但面积没超 → 豁免（面积上限非长边上限）");
    eq(planRefTranscode(0, 100), null, "尺寸不可信 → 诚实豁免");
  });

  it("超面积 → 等比缩到 ≤1024²，保长宽比", () => {
    const p = planRefTranscode(4000, 3000);
    assert(p, "4000×3000 必须转码");
    assert(p.fw * p.fh <= REF_AREA_MAX, `缩后面积必须 ≤ 上限（got ${p.fw}×${p.fh}）`);
    const ratio = (p.fw / p.fh) / (4000 / 3000);
    assert(Math.abs(ratio - 1) < 0.01, "长宽比保持");
    // 极端比例（漫画条）不腰斩
    const strip = planRefTranscode(400, 20000);
    assert(strip && strip.fw >= 1 && strip.fw * strip.fh <= REF_AREA_MAX, "极端长条也合法");
  });

  it("拍平白底：透明→白、半透明按白合成、不透明不动、alpha 全 255", () => {
    const px = new Uint8ClampedArray([
      255, 0, 0, 255,    // 不透明红：不动
      255, 0, 0, 128,    // 半透明红：向白合成
      0, 0, 0, 0,        // 全透明：变纯白
    ]);
    flattenWhiteInPlace(px);
    eq([px[0], px[1], px[2], px[3]].join(","), "255,0,0,255");
    assert(px[4] > 250 && px[5] > 120 && px[5] < 135 && px[7] === 255, `半透明红→粉（got ${px[4]},${px[5]},${px[6]},${px[7]}）`);
    eq([px[8], px[9], px[10], px[11]].join(","), "255,255,255,255");
  });
});
