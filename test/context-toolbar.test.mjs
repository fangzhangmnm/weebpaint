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
    assert(inHtml.length >= 3, "index.html 应有 ≥3 条静态顶栏条（套索/透视/裁切；滤镜笔/吸色/尺子条由工厂生成——形状条 2026-09-09 随尺子模型退役），实得 " + inHtml.length);
    const registered = new Set(contextToolbarIds());
    const missing = inHtml.filter((id) => !registered.has(id));
    eq(missing.length, 0, "未登记的顶栏条：" + missing.join(",") + "（已登记：" + [...registered].join(",") + "）");
    eq(typeof contextToolbarBottom(), "number");
    // 几何条 rulerToolbar 2026-09-10 晚插头已拔（app.ts 不再 initRulerUi）→ 不在登记表；插回时把它加回这条断言
    assert(registered.has("filterBrushToolbar") && registered.has("pickerToolbar") && !registered.has("rulerToolbar"), "工厂 mount 的滤镜笔条/吸色条在登记表（init 即 mount）；几何条插头已拔：" + [...registered].join(","));
  });
  // 2026-09-11 叠放归工厂（user「几何对齐还会不小心变成右对齐，然后换 context 的时候会突然空出来一大堆白」「应该走的是同一套代码」）：
  //   owner 不许再自己量别人的 bottom 写 top、不许右对齐特例——几何条插回时也只 mountContextToolbar + show/hide。
  it("多条叠放只在工厂：ruler-ui 不算 top / 不 ct-tail；styles 无 .ct-tail；工厂导出 relayoutContextToolbars", async () => {
    const ruler = readFileSync(new URL("../src/ruler-ui.ts", import.meta.url), "utf-8");
    assert(!/style\.top\s*=/.test(ruler), "ruler-ui 不该再写 el.style.top");
    assert(!/classList\.add\("ct-tail"\)|contextToolbarBottomExcept\(/.test(ruler), "ruler-ui 不该再挂 ct-tail / 调 contextToolbarBottomExcept（注释里提到不算）");
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf-8");
    assert(!/\.ct-tail\s*\{/.test(css), "styles.css 不该再有 .ct-tail 规则");
    const mod = await import("../src/ui/context-toolbar.ts");
    eq(typeof mod.relayoutContextToolbars, "function");
    eq(typeof mod.contextToolbarBottomExcept, "undefined", "contextToolbarBottomExcept 退役");
  });
  it("anchored-popup 源码不再持顶栏 id 数组", () => {
    const src = readFileSync(new URL("../src/anchored-popup.ts", import.meta.url), "utf-8");
    assert(!/_TOP_TOOLBAR_IDS\s*=/.test(src), "anchored-popup 不该再有 _TOP_TOOLBAR_IDS 数组");
  });
});
