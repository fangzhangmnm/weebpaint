// 宿主薄层 / 笔尖边缘曲线的守卫（贴图主线 0-5 第二节第 6 条）。读仓里的源码，所以不进内核名单。created 2026-11-10 by Claude Opus 5.5
//   ① gl-room.ts 的 _addOverlay：二维笔尖和宿主薄层共用后半段——「预乘转直值」那一句全文件只出现一次，两支都调同一个后半段。
//   ② 笔尖从硬芯到边缘怎么淡下去，全仓只有一处（src/backend/gl/stamp-falloff.ts：GLSL 片段 + 同算式 JS 各一份）。
//      别的地方出现同一个多项式 / 内置 smoothstep / 拿 innerR 做减法 = 又抄了一份 → 红。下面白名单里的几处不是笔尖边缘，各写了为什么。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const tsFiles = (() => { const out = []; const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(n)) out.push(p); } }; walk("src"); return out.sort(); })();
/** 去掉 // 注释（行尾的和整行的；不碰字符串里的 //——src 里着色器源码不含 //）。 */
const code = (f) => readFileSync(f, "utf8").split("\n").map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1")).join("\n");
const count = (re) => tsFiles.flatMap((f) => (code(f).match(re) ?? []).map(() => f));
const tally = (files) => { const m = {}; for (const f of files) m[f] = (m[f] ?? 0) + 1; return Object.entries(m).map(([f, n]) => `${f}×${n}`).sort().join(", "); };

describe("宿主薄层：守卫（0-5）", () => {
  it("_addOverlay 两支共用后半段：预乘转直值（presentTo）在 gl-room.ts 里只出现一次，二维笔尖和宿主薄层都调 _addPremulOverlay", () => {
    const src = code(join("src", "backend", "gl", "gl-room.ts"));
    eq((src.match(/\.presentTo\(/g) ?? []).length, 1, "presentTo 只有一处");
    const def = src.indexOf("private _addPremulOverlay("), use = src.indexOf(".presentTo(");
    assert(def > 0 && use > def && use < src.indexOf("\n  }\n", def), "那一处就在 _addPremulOverlay 里");
    eq((src.match(/this\._addPremulOverlay\(/g) ?? []).length, 2, "两支各调一次（二维笔尖、宿主薄层）");
    const host = src.slice(src.indexOf('ov.kind === "host"'), src.indexOf('ov.kind === "host"') + 300);
    assert(/_addPremulOverlay\(ov\.tex, false,/.test(host), "宿主那一支：owned = false（宿主借的图内核不归还）");
  });

  it("笔尖边缘的算式全仓只有一处（stamp-falloff.ts）；同一个多项式别处只许白名单里那几处", () => {
    const poly = /(\b\w+)\s*\*\s*\1\s*\*\s*\(\s*3(?:\.0)?\s*-\s*2(?:\.0)?\s*\*\s*\1\s*\)/g;
    const ALLOW = [
      `${join("src", "backend", "gl", "stamp-falloff.ts")}×2`,     // 本尊：GLSL 片段 + JS 函数
      `${join("src", "backend", "gl", "region-programs.ts")}×1`,   // 液化的形变强度（1 − r/R，不带硬度），不是笔尖边缘
      `${join("src", "backend", "soft-shaders.ts")}×1`,            // 上一条在软件显卡里的镜像
      `${join("src", "common", "color-ramp.ts")}×1`,               // 颜色渐变的 ease 插值，不是笔尖边缘
    ].sort().join(", ");
    eq(tally(count(poly)), ALLOW, "smoothstep 多项式出现的地方");
  });

  it("内置 smoothstep() 只在屏幕点网格的抗锯齿里用；拿 innerR 做加减除只在 stamp-falloff.ts", () => {
    eq(tally(count(/\bsmoothstep\s*\(/g)), `${join("src", "backend", "gl", "gl-compositor.ts")}×1`, "内置 smoothstep 只有点网格那一处");
    eq(tally(count(/[-+/]\s*(?:u_)?innerR\b|\b(?:u_)?innerR\s*[-+/]/g)), `${join("src", "backend", "gl", "stamp-falloff.ts")}×4`, "innerR 的算术只在 stamp-falloff.ts");
  });

  it("GLSL 里调 stampFalloff 的着色器都带上了片段（STAMP_FALLOFF_GLSL）", () => {
    for (const f of tsFiles) {
      const src = code(f);
      if (f.endsWith("stamp-falloff.ts") || !/float \w+ = stampFalloff\(/.test(src)) continue;
      assert(/\$\{STAMP_FALLOFF_GLSL\}/.test(src), `${f} 的着色器调了 stampFalloff 但没插片段`);
    }
  });
});
