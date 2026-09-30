// 参考窗图标 SSoT 守卫（user 0830「svg 风格从 svg icons 取作 SSoT，不要在其他地方乱塞」）。
// created 2026-08-30 by Claude Fable 5.
// 组件运行时从 index.html 内联 sprite clone <symbol>（零自绘）——这里守住「组件要的每个 id 在 sprite 里都有」，
// 否则运行时会出虚线占位（不炸但丑）。sprite = assets/icons.svg（库提取）+ icons-local.svg（烤字 stopgap），
// 经 tools/inline-sprites.py 贴进 index.html。
// 2026-09-29（edited by Claude Fable 5.1）：组件抽进 @internal/reference-window 包。图标 id 表改读包里的源文件
//   （包的 files 带 src/；组件模块一 import 就要 HTMLElement，node 里不能直接 import，所以照旧读文本）。
//   「组件源码零自绘几何」那条守卫随组件搬进了库仓的 test/redline-guard.test.mjs，这里不再重复。
import { describe, it, assert } from "./runner.mjs";
import { readFileSync } from "node:fs";

const COMPONENT_SRC = new URL("../node_modules/@internal/reference-window/src/reference-window.ts", import.meta.url);

function readIconIds() {
  const src = readFileSync(COMPONENT_SRC, "utf-8");
  const m = src.match(/export const REF_ICON_IDS = \{([\s\S]*?)\} as const;/);
  assert(m, "REF_ICON_IDS not found in @internal/reference-window source");
  const ids = {};
  for (const kv of m[1].matchAll(/(\w+):\s*"([^"]+)"/g)) ids[kv[1]] = kv[2];
  return ids;
}

describe("reference-window 图标 SSoT", () => {
  it("包里的图标 id 表读得出来（至少 10 个）", () => {
    assert(Object.keys(readIconIds()).length >= 10, "REF_ICON_IDS 少于 10 个——解析坏了或包变了");
  });
  it("组件引用的每个图标 id 都在 index.html 内联 sprite 里", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
    const have = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
    for (const [key, id] of Object.entries(readIconIds())) {
      assert(have.has(id), `REF_ICON_IDS.${key}="${id}" 不在 sprite 里（跑 extract-icons / bake-stopgap-glyphs + inline-sprites）`);
    }
  });
});
