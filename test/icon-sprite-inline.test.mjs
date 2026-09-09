// index.html 内联 sprite 与 assets/icons.svg 的对账守卫。created 2026-09-09 by Claude Fable 5.1
// 病例：v0.14.1 往 assets/icons.svg 加了 finger-paint 却没重跑 tools/inline-sprites.py → 手指位「带颜料的手指」钮面一片空白
//   （user 2026-09-09 真机截图）。inline-sprites.py 自陈「改了 assets/icons.svg 就得记得再贴一遍，没有任何机制会提醒」——这就是那个机制。
// 钉：icons.svg 里每个 <symbol> 原文都在 index.html 的 ICON-SPRITE 标记区内（缺 / 改过都红）；icons-local.svg 的补丁 id 也都在。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync, existsSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf-8");
const BEGIN = "<!-- ICON-SPRITE:BEGIN — 由 tools/inline-sprites.py 生成，勿手改 -->";
const END = "<!-- ICON-SPRITE:END -->";

describe("icon-sprite · index.html 内联 sprite = assets/icons.svg（+ icons-local 补丁）", () => {
  it("每个 symbol 原文都在标记区内；陈旧 → 跑 python3 tools/inline-sprites.py", () => {
    const html = read("../index.html");
    const b = html.indexOf(BEGIN), e = html.indexOf(END);
    assert(b >= 0 && e > b, "index.html 缺 ICON-SPRITE 标记区");
    const block = html.slice(b, e);
    const sprite = read("../assets/icons.svg");
    const symbols = [...sprite.matchAll(/<symbol id="([^"]+)".*?<\/symbol>/gs)];
    assert(symbols.length > 100, "assets/icons.svg 应有 >100 个 symbol，实得 " + symbols.length);
    const stale = symbols.filter((m) => !block.includes(m[0])).map((m) => m[1]);
    eq(stale.length, 0, "index.html 内联 sprite 陈旧（缺/改过）：" + stale.join(",") + " → python3 tools/inline-sprites.py");
    const localUrl = new URL("../assets/icons-local.svg", import.meta.url);
    if (existsSync(localUrl)) {
      const ids = [...read("../assets/icons-local.svg").matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
      const missing = ids.filter((id) => !block.includes(`<symbol id="${id}"`));
      eq(missing.length, 0, "icons-local 补丁未内联：" + missing.join(","));
    }
  });
});
