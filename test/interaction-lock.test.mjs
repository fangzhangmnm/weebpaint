// 交互锁（src/ui/interaction-lock.ts）：策略表 = 白名单 SSoT（busy 全禁只留 gate/notice/修饰键；readonly 读全放写全禁、快捷键按类）。
// created 2026-09-02 by Claude Fable 5.1（UI 纪元 C8）。
import { describe, it, eq, assert } from "./runner.mjs";
import { policyAllows, acquireLock, allows, assertAllows, isLocked, activeLocks, intentForPointerRole, _resetLocksForTest, READONLY_SHORTCUT_CATEGORIES } from "../src/ui/interaction-lock.ts";

const INTENTS = ["pointer:draw","pointer:navigate","pointer:pick","key:shortcut","key:modifier","paste","copy","doc:mutate","persist","export:read","menu","dialog","gate","notice"];

describe("interaction-lock · 策略表（白名单 SSoT）", () => {
  it("busy：只放行 gate / notice / 修饰键清位；其余全禁（连导航也禁——遮罩本来就盖着）", () => {
    const allowed = INTENTS.filter((i) => policyAllows("busy", i));
    eq(JSON.stringify(allowed), JSON.stringify(["key:modifier", "gate", "notice"]));
  });
  it("readonly：读全放（导航/吸色/复制/导出/菜单/对话/gate/通知/修饰键）；写全禁（落笔/粘贴/改 doc/持久化）", () => {
    const allowed = INTENTS.filter((i) => policyAllows("readonly", i));
    eq(JSON.stringify(allowed), JSON.stringify(["pointer:navigate", "pointer:pick", "key:shortcut", "key:modifier", "copy", "export:read", "menu", "dialog", "gate", "notice"]));
  });
  it("readonly 快捷键按类：视图/工具/窗格/笔粗放行；编辑/套索禁", () => {
    for (const c of READONLY_SHORTCUT_CATEGORIES) assert(policyAllows("readonly", "key:shortcut", { shortcutCategory: c }), c);
    assert(!policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.edit" }));
    assert(!policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.lasso" }));
    assert(!policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.other" }));
    assert(!policyAllows("busy", "key:shortcut", { shortcutCategory: "sc.cat.view" }), "busy 不按类，全禁");
  });
});

describe("interaction-lock · 运行时", () => {
  it("无锁全放；拉锁后按策略；多把锁都得同意；放锁幂等；嵌套计数", () => {
    _resetLocksForTest();
    assert(allows("pointer:draw") && allows("dialog"));
    const r1 = acquireLock("busy"), r2 = acquireLock("busy");
    eq(JSON.stringify(activeLocks()), JSON.stringify(["busy"]));
    assert(!allows("pointer:draw") && !allows("dialog") && allows("gate") && allows("notice"));
    r1(); assert(isLocked("busy"), "嵌套：外层还在");
    r2(); r2(); assert(!isLocked(), "幂等放锁");
    const ro = acquireLock("readonly");
    assert(allows("pointer:navigate") && !allows("pointer:draw") && allows("key:shortcut", { shortcutCategory: "sc.cat.view" }) && !allows("key:shortcut", { shortcutCategory: "sc.cat.edit" }));
    const b = acquireLock("busy");
    assert(!allows("pointer:navigate"), "busy + readonly：任一禁即禁");
    b(); ro();
    assert(!isLocked());
  });
  it("assertAllows：busy 期开对话框 = 响亮 throw（08-19 死锁案的结构解）", () => {
    _resetLocksForTest();
    const r = acquireLock("busy");
    let threw = false;
    try { assertAllows("dialog", "confirm sheet"); } catch (e) { threw = /not allowed while locked \(busy\)/.test(String(e)); }
    assert(threw);
    r();
    assertAllows("dialog", "confirm sheet");   // 无锁不抛
  });
  it("pointer role → intent", () => {
    eq(intentForPointerRole("draw"), "pointer:draw"); eq(intentForPointerRole("erase"), "pointer:draw"); eq(intentForPointerRole("lasso"), "pointer:draw");
    eq(intentForPointerRole("pan"), "pointer:navigate"); eq(intentForPointerRole("gesture"), "pointer:navigate");
    eq(intentForPointerRole("pick"), "pointer:pick"); eq(intentForPointerRole("ignore"), null); eq(intentForPointerRole(null), null);
  });
});
