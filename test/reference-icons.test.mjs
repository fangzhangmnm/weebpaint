// 参考窗图标 SSoT 守卫（user 0830「svg 风格从 svg icons 取作 SSoT，不要在其他地方乱塞」）。
// created 2026-08-30 by Claude Fable 5.
// 组件运行时从 index.html 内联 sprite clone <symbol>（零自绘）——这里守住「组件要的每个 id 在 sprite 里都有」，
// 否则运行时会出虚线占位（不炸但丑）。sprite = assets/icons.svg（库提取）+ icons-local.svg（烤字 stopgap），
// 经 tools/inline-sprites.py 贴进 index.html。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { REF_ICON_IDS } from "../src/frontend/reference-window.ts";

describe("reference-window 图标 SSoT", () => {
  it("组件引用的每个图标 id 都在 index.html 内联 sprite 里", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
    const have = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
    for (const [key, id] of Object.entries(REF_ICON_IDS)) {
      assert(have.has(id), `REF_ICON_IDS.${key}="${id}" 不在 sprite 里（跑 extract-icons / bake-stopgap-glyphs + inline-sprites）`);
    }
  });
  it("组件源码零自绘几何（不允许出现内联 <path d= / <rect 常量）", () => {
    const src = readFileSync(new URL("../src/frontend/reference-window.ts", import.meta.url), "utf-8");
    // 只允许 icon-missing 占位那一个 <rect>（虚线方框），其余几何一律来自 sprite clone
    const rects = (src.match(/<rect /g) || []).length;
    const paths = (src.match(/<path /g) || []).length;
    eq(paths, 0, "组件里不该有手写 <path>");
    eq(rects, 1, "组件里只允许 icon-missing 占位那一个 <rect>");
  });
});
