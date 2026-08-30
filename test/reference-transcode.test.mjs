// 参考图压缩政策纯函数验收（spec 20260830 §2；user 拍板：1024² 面积/小图豁免/拍平白底 jpeg；
// 0830 补拍板：豁免加字节条件 500KB + GIF 禁原样只取首帧「两个同时加」）。
// created 2026-08-30 by Claude Fable 5.
import { describe, it, assert, eq } from "./runner.mjs";
import { planRefImport, flattenWhiteInPlace, REF_AREA_MAX, REF_BYTES_MAX } from "../src/reference-transcode.ts";

const KB = 1024;

describe("reference-transcode 政策", () => {
  it("面积 ≤1024² 且字节 ≤500KB 且非 GIF → null（原样豁免）", () => {
    eq(planRefImport(1024, 1024, 300 * KB, "image/png"), null, "正好卡线也豁免");
    eq(planRefImport(64, 64, 2 * KB, "image/png"), null);
    eq(planRefImport(4096, 256, 400 * KB, "image/jpeg"), null, "长边超 1024 但面积没超 → 豁免（面积上限非长边）");
    eq(planRefImport(0, 100, KB, "image/png"), null, "尺寸不可信 → 诚实豁免");
  });

  it("小面积但重字节（>500KB）→ 原尺寸转码（堵高噪 PNG/动图容器洞）", () => {
    const p = planRefImport(1000, 1000, 900 * KB, "image/png");
    assert(p, "重字节必须转码");
    eq(`${p.fw}x${p.fh}`, "1000x1000", "面积达标 → 不重采样，原尺寸拍平转 jpeg");
    eq(p.allowKeepIfBigger, true, "非 GIF 保留压大保原逃生口");
    eq(REF_BYTES_MAX, 500 * KB, "字节线 = user 拍板 500KB");
  });

  it("GIF 一律转码（首帧），压大也不保原（禁原样是硬条件）", () => {
    const small = planRefImport(64, 64, 5 * KB, "image/gif");
    assert(small, "小 GIF 也转");
    eq(small.allowKeepIfBigger, false, "GIF 无压大保原路");
    const big = planRefImport(4000, 3000, 8 * KB * KB, "image/gif");
    assert(big && big.fw * big.fh <= REF_AREA_MAX && big.allowKeepIfBigger === false);
  });

  it("超面积 → 等比缩到 ≤1024²，保长宽比", () => {
    const p = planRefImport(4000, 3000, 5 * KB * KB, "image/jpeg");
    assert(p, "4000×3000 必须转码");
    assert(p.fw * p.fh <= REF_AREA_MAX, `缩后面积必须 ≤ 上限（got ${p.fw}×${p.fh}）`);
    const ratio = (p.fw / p.fh) / (4000 / 3000);
    assert(Math.abs(ratio - 1) < 0.01, "长宽比保持");
    // 极端比例（漫画条）不腰斩
    const strip = planRefImport(400, 20000, 5 * KB * KB, "image/png");
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
