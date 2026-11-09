// 开着的画锁没锁（src/edit-lock.ts）+ 它接的三片奶酪里 app 这一侧的两片：界面的只读锁（interaction-lock 的动态锁）和写门（Workpiece.writeGate / History）。
//   created 2026-11-08 by Claude Fable 5.1。家规 = 家族 CLAUDE.md「源文件原则上只读：手动解锁才能改」；user「默认的文件你根本不能编辑，一编辑就报错，一保存就报错」。
//   保存那一片在 editor-session-edit-lock.test.mjs；库那一片在 @internal/store 自己的测试。
import { describe, it, eq, assert } from "./runner.mjs";
import { initEditLock, isEditLocked, isIdentifierEditLocked, editWriteGate, refreshEditLock, onEditLockChange, onEditLockFlash, _resetEditLockForTest } from "../src/edit-lock.ts";
import { allows, isLocked, _resetLocksForTest } from "../src/ui/interaction-lock.ts";
import { Workpiece, WriteRefusedError } from "../src/backend/workpiece/workpiece.ts";
import { History } from "../src/backend/workpiece/history.ts";

function rig({ lockOn = true, active = "画.ora", createPending = false, loading = false, unlocked = [] } = {}) {
  _resetLocksForTest();
  const st = { lockOn, active, createPending, loading, unlocked: new Set(unlocked), watchers: new Set(), store: null };
  const mkStore = () => ({ get lockByDefault() { return st.lockOn; }, unlockOf: (id) => (st.unlocked.has(id) ? { identifier: id } : null),
    watchUnlocks: (cb) => { st.watchers.add(cb); cb([]); return () => st.watchers.delete(cb); } });
  st.store = mkStore(); st.mkStore = mkStore;
  st.setUnlocked = (id, on) => { if (on) st.unlocked.add(id); else st.unlocked.delete(id); for (const w of [...st.watchers]) w([]); };
  initEditLock({ store: () => st.store, activeIdentifier: () => st.active, createPending: () => st.createPending, loading: () => st.loading });
  return st;
}

describe("edit-lock · 什么时候算锁着", () => {
  it("库开了锁 ∧ 开着图库里的画 ∧ 没有活着的解锁 → 锁着", () => { rig(); eq(isEditLocked(), true); });
  it("库没开开关 / 没挂库 / 没开着图库里的画（本地文件、空白、图库态）→ 不锁", () => {
    rig({ lockOn: false }); eq(isEditLocked(), false);
    const a = rig(); a.store = null; eq(isEditLocked(), false);
    rig({ active: null }); eq(isEditLocked(), false);
  });
  it("刚新建、还没首存的不算锁着（它还不存在）", () => { rig({ createPending: true }); eq(isEditLocked(), false); });
  it("有活着的解锁 → 不锁；解锁没了（锁上 / 过期）→ 又锁上。每次问都现算", () => {
    const st = rig({ unlocked: ["画.ora"] });
    eq(isEditLocked(), false);
    st.unlocked.delete("画.ora");                    // 不发任何通知，直接问
    eq(isEditLocked(), true);
    eq(isIdentifierEditLocked("画.ora"), true); eq(isIdentifierEditLocked("别的.ora"), true);
  });
});

describe("edit-lock · 界面那一片（interaction-lock 的只读锁，现算）", () => {
  it("锁着：落笔 / 粘贴 / 改 doc / 保存 不收；平移缩放 / 吸色 / 复制 / 导出 / 开菜单 照常", () => {
    rig();
    eq(isLocked("readonly"), true);
    for (const no of ["pointer:draw", "paste", "doc:mutate", "persist"]) eq(allows(no), false, no);
    for (const yes of ["pointer:navigate", "pointer:pick", "copy", "export:read", "menu", "dialog"]) eq(allows(yes), true, yes);
    eq(allows("key:shortcut", { shortcutCategory: "sc.cat.view" }), true); eq(allows("key:shortcut", { shortcutCategory: "sc.cat.edit" }), false);
  });
  it("解了锁：全都放行；锁态一变就通知（界面重画）", () => {
    const st = rig(); const seen = [];
    onEditLockChange((l) => seen.push(l));
    st.setUnlocked("画.ora", true);
    eq(allows("pointer:draw"), true); eq(isLocked("readonly"), false);
    st.setUnlocked("画.ora", false);
    eq(allows("pointer:draw"), false);
    eq(seen.join(), "false,true");
  });
  it("蹭到了（被只读锁拦下的动作）→ 门闪一下；放行的动作不闪", () => {
    rig(); let flashes = 0; onEditLockFlash(() => flashes++);
    allows("pointer:navigate"); eq(flashes, 0);
    allows("pointer:draw"); eq(flashes, 1);
    allows("paste"); eq(flashes, 2);
  });
  it("换画 / 换库：refreshEditLock 对上新的事实（换库重订解锁的订阅）", () => {
    const st = rig({ unlocked: ["画.ora"] }); const seen = [];
    onEditLockChange((l) => seen.push(l));
    st.active = "旧画.ora"; refreshEditLock();          // 换到一幅没解锁的
    st.store = st.mkStore(); refreshEditLock();          // 换库
    eq(st.watchers.size, 1, "旧库的订阅退了、新库订上了");
    st.active = null; refreshEditLock();                 // 回图库
    eq(seen.join(), "true,false");
  });
});

describe("edit-lock · 写门（图层面板 / 滤镜 / 撤销这些不经交互锁的入口）", () => {
  const mkWp = () => { const h = new History({ maxQuotaBytes: 1 << 30, onUnrecoverable: () => {} }); const wp = new Workpiece({ undo: h.stack, onTokenLeak: () => {} }); h.attach(wp); return { h, wp }; };
  it("锁着：开写令牌被拒（WriteRefusedError）、门闪一下；撤销 / 重做不动。装入文档时不拦", () => {
    const st = rig(); let flashes = 0; onEditLockFlash(() => flashes++);
    const { h, wp } = mkWp(); wp.writeGate = () => editWriteGate();
    let err = null; try { wp.begin("layer.add"); } catch (e) { err = e; }
    assert(err instanceof WriteRefusedError, "抛 WriteRefusedError"); eq(err.reason, "edit-locked"); eq(flashes, 1);
    eq(h.undo(), false); eq(h.redo(), false);
    eq(editWriteGate("load"), null, "整份装入（换画 / 新建）不是改这幅锁着的画：放行");
    st.loading = true;
    eq(editWriteGate(), null, "装入期间不拦");
  });
  it("解了锁：令牌照开", () => {
    rig({ unlocked: ["画.ora"] });
    const { wp } = mkWp(); wp.writeGate = () => editWriteGate();
    const tok = wp.begin("x"); tok.cancel();
  });
  it("withPoint 在锁着时：拒绝直接抛给调用方（不吞成 ok:false），什么都没改", () => {
    rig();
    const { h, wp } = mkWp(); wp.writeGate = () => editWriteGate();
    let threw = false; let ran = false;
    try { h.withPoint("x", {}, () => { ran = true; }); } catch (e) { threw = e instanceof WriteRefusedError; }
    eq(threw, true); eq(ran, false);
  });
});

describe("edit-lock · 收尾", () => {
  it("拆掉接线（模块是单例：不拆会让后面的测试以为有一幅锁着的画）", () => { _resetEditLockForTest(); _resetLocksForTest(); eq(isEditLocked(), false); eq(allows("pointer:draw"), true); });
});
