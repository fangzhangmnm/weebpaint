// select-field 钮面三档 + 角落小三角（2026-09-11 user「工具条上的自定义下拉框应该定宽，不然遇到英文会被撑的很宽」「加入定宽的缩写用来显示」
//   「手指的 context bar 的第一个下拉框只显示图标」「比起用下箭头不如复用小三角」）。created 2026-09-11 by Claude Fable 5.1
// 钉：face=label 画全名；face=short 画 SelectItem.short（没缩写退回全名）+ 定宽类；face=icon 只画图标、该项没图标就退回缩写（钮面永不空白）；
//   角标 = .select-field-caret（slotCaretHtml 的同一枚三角），chevron-down 退役。像素宽度归真浏览器探针 tools/probes/context-toolbar.mjs。
import "./dom-shim-first.mjs";
import { describe, it, eq, assert } from "./runner.mjs";
import { createSelectField } from "../src/ui/select-field.ts";
import { slotCaretHtml } from "../src/ui/icon.ts";

const ITEMS = [
  { value: "a", label: "Pigment mix", short: "Pigment", icon: "finger" },
  { value: "b", label: "Plain mix", short: "Plain" },
  { value: "c", label: "No short" },
];
const kids = (f) => [...(f.el.childNodes || [])];
const byCls = (f, cls) => kids(f).find((n) => (n.className || "").includes(cls));

describe("select-field · face", () => {
  it("label 档（默认）画全名，不定宽", () => {
    const f = createSelectField({ items: () => ITEMS, value: () => "a", onChange: () => {} });
    eq(byCls(f, "select-field-label").textContent, "Pigment mix");
    eq(f.el.dataset.face, "label");
    assert(!f.el.classList.contains("select-field--fixed"), "label 档不加定宽类");
    f.dispose();
  });
  it("short 档画缩写 + 定宽类；没缩写退回全名", () => {
    let v = "a";
    const f = createSelectField({ face: "short", items: () => ITEMS, value: () => v, onChange: () => {} });
    eq(byCls(f, "select-field-label").textContent, "Pigment");
    assert(f.el.classList.contains("select-field--fixed"), "short 档 = 定宽类");
    v = "c"; f.refresh();
    eq(byCls(f, "select-field-label").textContent, "No short", "无 short → 全名");
    f.dispose();
  });
  it("icon 档只画图标；换到无图标项退回缩写（永不空白）", () => {
    let v = "a";
    const f = createSelectField({ face: "icon", items: () => ITEMS, value: () => v, onChange: () => {} });
    const label = byCls(f, "select-field-label");
    eq(label.textContent, "", "有图标 → 文字空");
    eq(label.hidden, true);
    assert(byCls(f, "select-field-icon")?.innerHTML.includes("#finger"), "钮面画图标");
    v = "b"; f.refresh();
    eq(label.textContent, "Plain", "无图标项 → 缩写顶上");
    eq(label.hidden, false);
    f.dispose();
  });
  it("角标 = 角落小三角（与变体槽同一枚），不再是 chevron-down", () => {
    const f = createSelectField({ items: () => ITEMS, value: () => "a", onChange: () => {} });
    const caret = byCls(f, "select-field-caret");
    assert(caret, "有 .select-field-caret");
    eq(caret.innerHTML, slotCaretHtml(""), "同一枚三角 svg（无 class 版）");
    assert(!caret.innerHTML.includes("chevron-down"), "chevron 退役");
    assert(slotCaretHtml().includes('class="lasso-slot-caret"') && slotCaretHtml().includes("M7.2 2.8 V7.2 H2.8 Z"), "默认 class 版供变体槽");
    f.dispose();
  });
});
