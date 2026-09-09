// select-field 带图标（2026-09-09 user「手指的几种工具用下拉框吧，图标太打哑谜了」）。created 2026-09-09 by Claude Fable 5.1
// 钉：SelectItem.icon → 钮面 .select-field-icon 画当前项的 sprite 图标、随 value 换、换到无图标项就摘。
// 「图标在 label 前」的排版与弹层项 icon 归真浏览器探针 tools/probes/verb-toolbar.mjs（node shim 的 querySelector 自动顺从返回游离节点，label 位在 shim 里不落树）。
import "./dom-shim-first.mjs";
import { describe, it, eq, assert } from "./runner.mjs";
import { createSelectField } from "../src/ui/select-field.ts";

describe("select-field · icon", () => {
  it("钮面图标跟当前项走", () => {
    let v = "a";
    const f = createSelectField({
      items: () => [{ value: "a", label: "A", icon: "finger" }, { value: "b", label: "B", icon: "blur" }, { value: "c", label: "C" }],
      value: () => v, onChange: (nv) => { v = nv; },
    });
    const kids = () => [...(f.el.childNodes || [])];
    const iconEl = () => kids().find((n) => (n.className || "").includes("select-field-icon"));
    assert(iconEl() && iconEl().innerHTML.includes("#finger"), "初始钮面 = 当前项图标");
    v = "b"; f.refresh();
    assert(iconEl().innerHTML.includes("#blur"), "换值 → 换图标");
    v = "c"; f.refresh();
    eq(iconEl(), undefined, "无图标项 → 摘掉图标位");
    v = "a"; f.refresh();
    assert(iconEl() && iconEl().innerHTML.includes("#finger"), "再回有图标项 → 重建");
    f.dispose();
  });
});
