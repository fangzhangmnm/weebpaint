// 手势三角对拍：本仓 src/common/pointer-gesture.ts 与 @internal/reference-window 包里那份拷贝，输出必须逐位相同。
// created 2026-09-29 by Claude Fable 5.1
// 背景：参考窗抽库之后这两个函数有了两份（本仓这份主画布的输入还在用，不能搬走）。它们过去就各抄过一份、
//   漂过（见 pointer-gesture.ts 头注释「过去各抄一份的那段三角」），所以这里用同一组输入喂两边来守。
// 包那份按相对路径 import 它编译好的 js：不走包的 exports（对拍用，不为此扩大包的公共面）。
import { describe, it, eq } from "./runner.mjs";
import { pinchScaleRot as ours1, solveAnchorTranslation as ours2 } from "../src/common/pointer-gesture.ts";
import { pinchScaleRot as lib1, solveAnchorTranslation as lib2 } from "../node_modules/@internal/reference-window/dist/pointer-gesture.js";

// 固定种子的小随机数发生器：失败可复现
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

describe("手势三角对拍（本仓 vs 参考窗包）", () => {
  it("pinchScaleRot 2000 组随机输入逐位相同", () => {
    const r = rng(20260929);
    for (let i = 0; i < 2000; i++) {
      const start = { dist: 1 + r() * 500, angle: (r() - 0.5) * 2 * Math.PI, vp: { scale: 0.01 + r() * 40, rot: (r() - 0.5) * 8 } };
      const dist = 1 + r() * 500, angle = (r() - 0.5) * 2 * Math.PI, lo = 0.01 + r() * 0.5, hi = 1 + r() * 60;
      const a = ours1(start, dist, angle, lo, hi), b = lib1(start, dist, angle, lo, hi);
      eq(a.scale, b.scale, `scale @${i}`); eq(a.rot, b.rot, `rot @${i}`);
    }
  });
  it("solveAnchorTranslation 2000 组随机输入逐位相同", () => {
    const r = rng(929);
    for (let i = 0; i < 2000; i++) {
      const pt = { x: (r() - 0.5) * 4000, y: (r() - 0.5) * 4000 };
      const scale = 0.01 + r() * 50, rot = (r() - 0.5) * 8, sx = (r() - 0.5) * 3000, sy = (r() - 0.5) * 3000;
      const a = ours2(pt, scale, rot, sx, sy), b = lib2(pt, scale, rot, sx, sy);
      eq(a.tx, b.tx, `tx @${i}`); eq(a.ty, b.ty, `ty @${i}`);
    }
  });
});
