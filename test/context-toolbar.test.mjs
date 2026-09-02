// 顶栏条登记表守卫（src/ui/context-toolbar.ts）：index.html 里每条 .lasso-toolbar-stack / .crop-toolbar 都必须由 owner 登记——
//   漏登记 = popup 让位高度算不到它（T2 复发）。跑在 app-boot 之后（app.ts 已 import，各 owner 的 init 已跑）。
// created 2026-09-02 by Claude Fable 5.1（UI 纪元 C4）。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";

describe("context-toolbar · 登记表 = index.html 顶栏条全集", () => {
  it("index.html 里的每条顶栏条都登记了（owner init 各一行；anchored-popup 不再手填 id）", async () => {
    const { contextToolbarIds, contextToolbarBottom } = await import("../src/ui/context-toolbar.ts");
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
    const inHtml = [...html.matchAll(/<div class="(?:lasso-toolbar-stack|crop-toolbar)[^"]*" id="([A-Za-z]+)"/g)].map((m) => m[1]);
    assert(inHtml.length >= 6, "index.html 应有 ≥6 条顶栏条，实得 " + inHtml.length);
    const registered = new Set(contextToolbarIds());
    const missing = inHtml.filter((id) => !registered.has(id));
    eq(missing.length, 0, "未登记的顶栏条：" + missing.join(",") + "（已登记：" + [...registered].join(",") + "）");
    eq(typeof contextToolbarBottom(), "number");
  });
  it("anchored-popup 源码不再持顶栏 id 数组", () => {
    const src = readFileSync(new URL("../src/anchored-popup.ts", import.meta.url), "utf-8");
    assert(!/_TOP_TOOLBAR_IDS\s*=/.test(src), "anchored-popup 不该再有 _TOP_TOOLBAR_IDS 数组");
  });
});
