// 一笔的手感拆出来之后的守卫（贴图主线 0-6 第二节第 8 条）。读仓里的源码，所以不进内核名单。created 2026-11-10 by Claude Opus 5.5
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

describe("一笔的手感：守卫（0-6）", () => {
  it("不认识图层的那一段（stroke-core.ts）不 import 图层、画布、显卡的任何东西", () => {
    const src = readFileSync(join("src", "backend", "stroke-core.ts"), "utf8");
    const imports = [...src.matchAll(/^import[^"]*"([^"]+)"/gm)].map((m) => m[1]);
    eq(imports.sort().join(","), "../common/pressure-curve.ts,../common/resolved-brush.ts,./stroke-smoother.ts", "只认压感曲线、笔的参数、平滑器");
  });
  it("缓冲笔的走步循环全仓只有一处（stroke-core.ts walkPath）；BrushEngine 里留着的那一份是像素笔直接落层的（_extendImmediate，1-5 再看）", () => {
    const files = []; const walkDir = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walkDir(p); else if (/\.ts$/.test(n)) files.push(p); } }; walkDir("src");
    const hits = files.filter((f) => /accumDist \+ \(L - pos\) </.test(readFileSync(f, "utf8"))).sort();
    eq(hits.join(","), [join("src", "backend", "brush.ts"), join("src", "backend", "stroke-core.ts")].sort().join(","), "走步循环只在这两处");
    const brush = readFileSync(join("src", "backend", "brush.ts"), "utf8"), loops = brush.match(/accumDist \+ \(L - pos\) </g) ?? [];
    eq(loops.length, 1, "brush.ts 里只剩一份（像素笔）");
    const at = brush.indexOf("accumDist + (L - pos) <"), fn = brush.lastIndexOf("_extendImmediate(", at);
    assert(fn > 0 && !brush.slice(fn, at).includes("\n  }\n"), "brush.ts 剩下的那一份在 _extendImmediate 里");
  });
});
