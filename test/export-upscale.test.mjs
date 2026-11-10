// 图片导出整数倍放大（家族周账 F-230，2026-11-09，Claude Opus 5.5；user 11-08「像素化的导出能不能做一个上采样的选项」）。
//   纯函数（倍数表 / 上限 / 最近邻放大）+ 接线守卫（编码前最后一步、四个去向都传、不进 desk）。真 GL 合成那段没在 node 里跑。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { UPSCALE_FACTORS, UPSCALE_MAX_SIDE, UPSCALE_MAX_PIXELS, upscaleFits, largestFittingUpscale, upscaleRgba, snapUpscale } from "../src/export-upscale.ts";

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
  it("png / jpg 导出器把 upscale 传下去；导出菜单四个去向都带；倍数从 desk 读", () => {
    const e = src("src/exporters.ts");
    eq((e.match(/, upscale\) as Promise<Blob>/g) ?? []).length, 2, "png + jpg");
    const m = src("src/export-import-menu.ts");
    eq((m.match(/onAudit: _auditSink, upscale \}/g) ?? []).length, 3, "打印 / 云盘 / 文件分享");
    assert(/copyImageToClipboard\([^)]*_auditSink, upscale\)/.test(m), "剪贴板");
    assert(/const upscale = largestFittingUpscale\(sz\.w, sz\.h, wantUp\)/.test(m), "导出时按真尺寸再核一次");
    assert(/const wantUp = desk\.export\.upscale;/.test(m) && !/let _upscale/.test(m), "倍数从这幅画的 desk 读，不再是模块变量");
  });
});

// 倍数跟着每幅画存（user 2026-11-09「记住」「我同意，然后让fable做文件格式」；Claude Fable 5.2 2026-11-09）。
const { desk, deskKnownKeys } = await import("../src/workbench-state.ts");
const { FORMAT } = await import("../src/backend/format/migrate.ts");
describe("export-upscale · 跟着画存（desk 顶层键 exportUpscale）", () => {
  it("snapUpscale：怪值 = 1，表外的往下靠", () => {
    eq(snapUpscale(4), 4); eq(snapUpscale(5), 4); eq(snapUpscale(99), 8); eq(snapUpscale(0), 1); eq(snapUpscale(-3), 1);
    eq(snapUpscale("4"), 1); eq(snapUpscale(null), 1); eq(snapUpscale(NaN), 1); eq(snapUpscale(2.9), 2);
  });
  it("存：顶层键 exportUpscale（一个数；不在 export 里——旧版本对已知对象里的未知子键不直通）；读回来还是它；新画 = 1", () => {
    desk.reset(); eq(desk.export.upscale, 1);
    desk.export.upscale = 4;
    const out = desk.Serialize();
    eq(out.exportUpscale, 4); assert(!("upscale" in out.export), "不嵌进 export");
    assert(deskKnownKeys().includes("exportUpscale"));
    desk.reset(); eq(desk.export.upscale, 1, "开新画回 1");
    desk.Unserialize(JSON.parse(JSON.stringify(out))); eq(desk.export.upscale, 4);
    desk.reset();
  });
  it("旧画（没这个键）= 1；文件里是什么怪东西都不抛、读成 1 / 往下靠；不改就原样存回；改了就写成表里的值", () => {
    desk.reset(); desk.Unserialize({ version: 1, export: { format: "jpg" } }); eq(desk.export.upscale, 1);
    for (const bad of [null, "boom", { factor: 4 }, [4], true, -2, 1e9 + 0.5]) {
      desk.Unserialize({ version: 1, exportUpscale: bad });
      const got = desk.export.upscale;
      assert(got === 1 || got === 8, `怪值 ${JSON.stringify(bad)} → ${got}`);
      desk.export.upscale = 2; eq(desk.export.upscale, 2, `怪值 ${JSON.stringify(bad)} 之后还能改`);
    }
    desk.Unserialize({ version: 1, exportUpscale: 6 }); eq(desk.export.upscale, 4); eq(desk.Serialize().exportUpscale, 6, "没改 = 文件里的原值存回");
    desk.export.upscale = 3; eq(desk.Serialize().exportUpscale, 3);
    desk.reset();
  });
  it("拍子：desk 1.1.0（加可选字段 = minor，家族格式规矩）", () => {
    eq(JSON.stringify(FORMAT.desk), JSON.stringify({ major: 1, minor: 1, patch: 0 }));
  });
  it("编码这一层自己也拦：放不下的倍数抛，不出空图（上一层先降、先告诉人）", () => {
    const s = src("src/session.ts");
    assert(/if \(!upscaleFits\(plane\.w, plane\.h, upscale\)\) throw new Error\(/.test(s));
    assert(s.indexOf("if (!upscaleFits(plane.w, plane.h, upscale)) throw") < s.indexOf("plane = upscaleRgba("), "拦在放大之前");
  });
});
