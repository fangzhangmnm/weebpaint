// Sheet 系统（src/ui/sheet.ts）：单 backdrop / 栈与 band / busy 期开 sheet 响亮 throw / gate 穿透 / dismiss 语义。
// created 2026-09-02 by Claude Fable 5.1（UI 纪元 C3）。dom-shim 上跑：用 index.html 里的真 sheet 节点。
import { describe, it, eq, assert } from "./runner.mjs";
import { openSheet, closeSheet, isSheetOpen, topSheet, anySheetOpen, closeAllSheets, sheetBackdrop } from "../src/ui/sheet.ts";
import { acquireLock, _resetLocksForTest } from "../src/ui/interaction-lock.ts";

const $ = (id) => document.getElementById(id);
const backdrop = () => sheetBackdrop();   // shim 的 getElementById 对未知 id 会造新节点，走模块句柄

describe("sheet · 单 backdrop + 栈", () => {
  it("开一个：backdrop 现建且可见、z=modal；sheet 去 hidden；关：backdrop 隐、栈空", () => {
    _resetLocksForTest(); closeAllSheets();
    const s = $("shortcutsSheet");
    openSheet(s);
    assert(backdrop() && !backdrop().classList.contains("hidden"), "backdrop 可见");
    assert(!s.classList.contains("hidden") && isSheetOpen(s));
    eq(backdrop().style.zIndex, "500"); eq(s.style.zIndex, "501");
    closeSheet(s);
    assert(backdrop().classList.contains("hidden") && !anySheetOpen() && s.classList.contains("hidden"));
  });
  it("叠：gate 压在普通 sheet 上——backdrop 升到 gate band 并戴 sync-gate-backdrop；关 gate 后回 modal", () => {
    closeAllSheets();
    const a = $("readmeSheet"), g = $("syncGateSheet");
    openSheet(a);
    openSheet(g, { band: "gate", allowDuringBusy: true, dismissible: false });
    eq(topSheet(), g); eq(backdrop().style.zIndex, "540"); assert(backdrop().classList.contains("sync-gate-backdrop"));
    eq(g.style.zIndex, "542"); eq(a.style.zIndex, "501");
    closeSheet(g);
    eq(topSheet(), a); eq(backdrop().style.zIndex, "500"); assert(!backdrop().classList.contains("sync-gate-backdrop"));
    closeAllSheets();
  });
  it("同一 sheet 重复 open = 幂等（不重复入栈）", () => {
    closeAllSheets();
    const s = $("diagLogSheet");
    openSheet(s); openSheet(s);
    closeSheet(s);
    assert(!anySheetOpen());
  });
});

describe("sheet · 与交互锁", () => {
  it("busy 期开普通 sheet → 响亮 throw（08-19 死锁案结构解）；gate 传 allowDuringBusy 可开", () => {
    closeAllSheets();
    const r = acquireLock("busy");
    let threw = false;
    try { openSheet($("readmeSheet")); } catch (e) { threw = /not allowed while locked/.test(String(e)); }
    assert(threw);
    assert(!anySheetOpen(), "抛了就不该入栈");
    openSheet($("syncGateSheet"), { band: "gate", allowDuringBusy: true });
    assert(anySheetOpen(), "gate 穿透 busy");
    closeAllSheets(); r();
  });
  it("dismiss：onDismiss 接管取消语义；dismissible:false 的 sheet 不被 backdrop/Escape 关", () => {
    closeAllSheets();
    let dismissed = 0;
    const s = $("readmeSheet");
    openSheet(s, { onDismiss: () => { dismissed++; closeSheet(s); } });
    for (const fn of backdrop()._listeners.get("click") ?? []) fn({ type: "click" });
    eq(dismissed, 1); assert(!anySheetOpen());
    openSheet(s, { dismissible: false });
    for (const fn of backdrop()._listeners.get("click") ?? []) fn({ type: "click" });
    assert(anySheetOpen(), "不可 dismiss");
    closeAllSheets();
  });
});
