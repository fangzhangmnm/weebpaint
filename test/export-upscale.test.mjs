// 图片导出整数倍放大（家族周账 F-230，2026-11-09，Claude Opus 5.5；user 11-08「像素化的导出能不能做一个上采样的选项」）。
//   纯函数（倍数表 / 上限 / 最近邻放大）+ 接线守卫（编码前最后一步、四个去向都传、不进 desk）。真 GL 合成那段没在 node 里跑。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { UPSCALE_FACTORS, UPSCALE_MAX_SIDE, UPSCALE_MAX_PIXELS, upscaleFits, largestFittingUpscale, upscaleRgba } from "../src/export-upscale.ts";

const src = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

describe("export-upscale · 纯函数（F-230）", () => {
  it("2×2 放大 ×3 = 6×6，每个 3×3 块都是原来那一颗（straight RGBA 原样，α 也复制）；×1 原样返回同一份", () => {
    const d = new Uint8ClampedArray([255, 0, 0, 255,  0, 255, 0, 128,   0, 0, 255, 0,  9, 8, 7, 6]);
    const r = upscaleRgba(d, 2, 2, 3);
    eq(r.w, 6); eq(r.h, 6); eq(r.data.length, 6 * 6 * 4);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const s = (Math.floor(y / 3) * 2 + Math.floor(x / 3)) * 4, o = (y * 6 + x) * 4;
      eq([...r.data.subarray(o, o + 4)].join(","), [...d.subarray(s, s + 4)].join(","), `(${x},${y})`);
    }
    const same = upscaleRgba(d, 2, 2, 1);
    assert(same.data === d && same.w === 2 && same.h === 2);
  });
  it("上限：单边 ≤ 16384、面积 ≤ 4096²；放不下的倍数降到表里能做的最大那个", () => {
    eq(UPSCALE_FACTORS.join(","), "1,2,3,4,8");
    eq(UPSCALE_MAX_SIDE, 16384); eq(UPSCALE_MAX_PIXELS, 4096 * 4096);
    eq(largestFittingUpscale(64, 64, 8), 8, "像素画小图 ×8 照做");
    eq(largestFittingUpscale(2048, 2048, 8), 2, "2048² ×2 = 4096² 正好；×3 超面积");
    eq(largestFittingUpscale(5000, 10, 4), 3, "单边：×4 = 20000 超，×3 = 15000 可以");
    eq(largestFittingUpscale(5000, 5000, 2), 1);
    assert(upscaleFits(5000, 5000, 1), "×1 永远放得下");
    eq(largestFittingUpscale(64, 64, 1), 1, "没选放大 = 1");
  });
});

describe("export-upscale · 接线守卫（F-230）", () => {
  it("renderDocToImageBlob：PNG 支放大紧挨着编码（底色 / defringe / 护栏统计都在原尺寸上做完）；JPG 支在铺底之后放大", () => {
    const s = src("src/session.ts");
    assert(/plane = upscaleRgba\(plane\.data, plane\.w, plane\.h, upscale\);\n\s*const png = await encodePngFromBytes\(plane\.data, plane\.w, plane\.h\);/.test(s), "PNG 支");
    assert(/const up = upscaleRgba\(flattenToBg\([^\n]*\), plane\.w, plane\.h, upscale\);/.test(s), "JPG 支");
    assert(/onAudit\?: \(a: AlphaAudit\) => void, upscale = 1\) \{\n[\s\S]*?renderDocToImageBlob\(doc, "image\/png", undefined, scope, cropRect, defringe, bg, selMask, onAudit, upscale\)/.test(s), "剪贴板那条也传");
  });
  it("png / jpg 导出器把 upscale 传下去；导出菜单四个去向都带；倍数不写进 desk（不改 .ora 格式）", () => {
    const e = src("src/exporters.ts");
    eq((e.match(/, upscale\) as Promise<Blob>/g) ?? []).length, 2, "png + jpg");
    const m = src("src/export-import-menu.ts");
    eq((m.match(/onAudit: _auditSink, upscale \}/g) ?? []).length, 3, "打印 / 云盘 / 文件分享");
    assert(/copyImageToClipboard\([^)]*_auditSink, upscale\)/.test(m), "剪贴板");
    assert(/const upscale = largestFittingUpscale\(sz\.w, sz\.h, _upscale\)/.test(m), "导出时按真尺寸再核一次");
    assert(!/desk\.export\.upscale/.test(m) && !/upscale/.test(src("src/workbench-state.ts")), "倍数不进 desk / workbench-state");
  });
});
