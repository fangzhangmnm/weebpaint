// verb-segment（上下文条左段子工具栏）契约测。created 2026-09-06 by Claude Fable 5.1（ADR-0012 修订 ③）
// 钉：每个子工具一颗图标钮（data-verb-sub）+ 尾随分隔；当前项 aria-pressed；refresh 跟 current；dispose 摘干净（点击派发在真浏览器探针）。
import "./dom-shim-first.mjs";
import { describe, it, eq, assert } from "./runner.mjs";
import { mountVerbSegment } from "../src/ui/verb-segment.ts";

describe("verb-segment · 左段子工具栏", () => {
  it("渲染 + pressed + refresh + dispose", () => {
    const host = document.createElement("div");
    let cur = "a";
    const h = mountVerbSegment(host, {
      tools: () => [{ id: "a", icon: "pencil", title: "A" }, { id: "b", icon: "shapes", title: "B" }, { id: "c", icon: "blur", title: "C" }],
      current: () => cur,
      onPick: (id) => { cur = id; },
    });
    const kids = () => [...(h.el.childNodes || h.el.children || [])];
    const btns = kids().filter((b) => b.tagName === "BUTTON" && b.getAttribute("data-verb-sub"));
    eq(btns.length, 3, "三颗子工具钮");
    eq(kids().filter((s) => s.tagName === "SPAN" && (s.className || "").includes("ct-sep")).length, 1, "尾随一个分隔");
    eq(btns[0].getAttribute("aria-pressed"), "true"); eq(btns[1].getAttribute("aria-pressed"), "false");
    assert(btns[1].innerHTML.includes("#shapes"), "钮面是 sprite 图标");
    // 点击派发归真浏览器探针（tools/probes/verb-toolbar.mjs；node shim 无事件派发）
    cur = "c"; h.refresh();
    eq(btns[2].getAttribute("aria-pressed"), "true");
    h.dispose();
    eq([...(host.childNodes || host.children || [])].length, 0, "dispose 摘干净");
  });
});
