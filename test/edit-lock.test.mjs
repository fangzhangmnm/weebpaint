// 开着的画锁没锁（src/edit-lock.ts）+ 它接的三片奶酪里 app 这一侧的两片：界面的只读锁（interaction-lock 的动态锁）和写门（Workpiece.writeGate / History）。
//   created 2026-11-08 by Claude Fable 5.1。家规 = 家族 CLAUDE.md「源文件原则上只读：手动解锁才能改」；user「默认的文件你根本不能编辑，一编辑就报错，一保存就报错」。
//   保存那一片在 editor-session-edit-lock.test.mjs；库那一片在 @internal/store 自己的测试。
import { describe, it, eq, assert } from "./runner.mjs";
import { initEditLock, isEditLocked, isIdentifierEditLocked, editWriteGate, refreshEditLock, onEditLockChange, onEditLockFlash, _resetEditLockForTest, unlockLocalFile, keepLocalFileUnlocked, isLocalFileOpen, canLockNow, lockLocalFile, takeLookOwed } from "../src/edit-lock.ts";
import { allows, isLocked, policyAllows, _resetLocksForTest } from "../src/ui/interaction-lock.ts";
import { LOOK_OPS, isLookOp, lookOpInFile, controlAllowedWhileLocked } from "../src/edit-lock-table.ts";
import { pointerOp } from "../src/pointer-route.ts";
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

describe("edit-lock · 硬盘上的单个文件（不经过库；锁跟着这一次打开的这个文件）", () => {
  // user 2026-11-08：「硬盘上的一个文件，如果能实现这个功能的话，我觉得也可以」「就取决于这个锁跟着是谁」
  function rigLocal() {
    _resetLocksForTest(); _resetEditLockForTest();
    const st = { handle: { name: "猫.ora" } };
    initEditLock({ store: () => null, activeIdentifier: () => null, createPending: () => false, loading: () => false, localFile: () => st.handle });
    return st;
  }
  it("打开一个硬盘文件：默认锁着（不需要库、不看库的开关）；界面那一片和写门照样拦", () => {
    rigLocal();
    eq(isLocalFileOpen(), true); eq(isEditLocked(), true);
    eq(allows("pointer:draw"), false); eq(allows("pointer:navigate"), true); eq(allows("export:read"), true, "导出照常 = 逃生口");
    eq(editWriteGate("layer.add"), "edit-locked");
  });
  it("人点「接着改」→ 解锁，管到这个文件关掉；换开另一个文件 / 重新打开同一个 → 又锁着", () => {
    const st = rigLocal(); const seen = []; onEditLockChange((l) => seen.push(l));
    eq(unlockLocalFile(), true); eq(isEditLocked(), false); eq(allows("pointer:draw"), true);
    st.handle = { name: "狗.ora" }; refreshEditLock();          // 换开另一个文件
    eq(isEditLocked(), true);
    st.handle = { name: "猫.ora" }; refreshEditLock();          // 同名文件重新打开 = 新的一次打开（新句柄）
    eq(isEditLocked(), true, "同名不等于同一次打开");
    eq(seen.join(), "false,true");
  });
  it("新画刚存成的文件不锁；解着锁时文件换了句柄（加密另写）状态带过去", () => {
    const st = rigLocal();
    const created = { name: "新画.ora" }; st.handle = created; keepLocalFileUnlocked(created);
    eq(isEditLocked(), false);
    const sealed = { name: "新画.ora" }; st.handle = sealed; keepLocalFileUnlocked(sealed);
    eq(isEditLocked(), false);
  });
  it("开着的不是硬盘文件：unlockLocalFile 什么都不做", () => {
    _resetLocksForTest(); _resetEditLockForTest();
    initEditLock({ store: () => null, activeIdentifier: () => null, createPending: () => false, loading: () => false, localFile: () => null });
    eq(unlockLocalFile(), false); eq(isLocalFileOpen(), false); eq(isEditLocked(), false, "空白画布 / 没开东西不锁");
  });
});

describe("edit-lock · 分类表（src/edit-lock-table.ts）——「锁着时什么能动」只此一处", () => {
  // user 2026-11-08：「这些看法…你可以修，但只是说…没法保存到文件里」「每个 app 要给自己分类，同意，就逼出窄接口」
  it("名单是明文的：图层可见性（进文件）、选区（不进文件）；别的一律内容", () => {
    eq(Object.keys(LOOK_OPS).sort().join(), "layerVisible,selection");
    eq(lookOpInFile("layerVisible"), true); eq(lookOpInFile("selection"), false);
    for (const content of ["layerProp", "stroke", "addLayer", "fill", "floatTransform", "liftFloat", "clearSelectionPixels", "cutClip", "selection+fill", "toString", "__proto__", "", undefined, null]) {
      eq(isLookOp(content), false, String(content)); eq(lookOpInFile(content), false, String(content));
    }
  });
  it("面板按钮上的 data-op：view 和看法放行；content、认不出来的词、空的都不放", () => {
    for (const ok of ["view", "layerVisible", "selection"]) eq(controlAllowedWhileLocked(ok), true, ok);
    for (const no of ["content", "fill", "liftFloat", "Selection", "", undefined, null]) eq(controlAllowedWhileLocked(no), false, String(no));
  });
});

describe("edit-lock · 写门按操作分类（看法放行、内容照拒）", () => {
  it("锁着：看法类放行、不闪；内容类照拒、闪", () => {
    rig(); let flashes = 0; onEditLockFlash(() => flashes++);
    eq(editWriteGate("layerVisible"), null); eq(editWriteGate("selection"), null); eq(flashes, 0);
    const content = ["layerProp", "stroke", "addLayer", "moveLayer", "fill", "liftFloat", "floatTransform", "clearSelectionPixels", "undo", "redo", "selection+fill", undefined];
    for (const c of content) eq(editWriteGate(c), "edit-locked", String(c));
    eq(flashes, content.length);
  });
  it("锁着时动过要进文件的看法 → 记一笔欠着，解锁之后取走（问一次清一次）；只动过选区 → 什么都不欠", () => {
    // user 2026-11-08：「切换可见性在编辑模式里面当然是需要保存的…只是说在锁定模式的时候，你 dirty 的时候也没法写」
    rig(); eq(takeLookOwed(), false);
    editWriteGate("selection"); eq(takeLookOwed(), false, "选区从不进文件");
    editWriteGate("layerVisible"); eq(takeLookOwed(), true); eq(takeLookOwed(), false, "取走就清");
  });
  it("没锁的时候动看法不记（那时候本来就照常标脏照常存）；装入期间也不记", () => {
    const st = rig({ unlocked: ["画.ora"] });
    editWriteGate("layerVisible"); eq(takeLookOwed(), false);
    st.unlocked.clear(); st.loading = true;
    editWriteGate("layerVisible"); eq(takeLookOwed(), false);
  });
  it("换了一幅画（整份装入）→ 上一幅欠着的作废（没解锁就关掉 = 文件没动过）", () => {
    rig(); editWriteGate("layerVisible");
    eq(editWriteGate("load"), null);
    eq(takeLookOwed(), false);
  });
});

describe("edit-lock · 界面那一头也查同一张表（指针 / 快捷键带着 op 来问）", () => {
  it("只读锁：静态表不放的意图，带上看法类的 op 就放；带内容类的 op 不放；busy / 闸门不看 op", () => {
    eq(policyAllows("readonly", "pointer:draw"), false);
    eq(policyAllows("readonly", "pointer:draw", { op: "selection" }), true);
    eq(policyAllows("readonly", "pointer:draw", { op: "fill" }), false);
    eq(policyAllows("readonly", "pointer:draw", { op: "floatTransform" }), false);
    eq(policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.lasso" }), false);
    eq(policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.lasso", op: "selection" }), true);
    eq(policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.edit", op: "stroke" }), false, "撤销：要翻的那一步是内容 → 不收");
    eq(policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.edit", op: "layerVisible" }), true, "撤销：要翻的那一步是看法 → 收");
    eq(policyAllows("readonly", "key:shortcut", { shortcutCategory: "sc.cat.edit", op: undefined }), false, "没有可翻的 → 不收");
    eq(policyAllows("readonly", "copy"), true, "复制是读");
    for (const k of ["busy", "gate"]) { eq(policyAllows(k, "pointer:draw", { op: "selection" }), false, k); eq(policyAllows(k, "copy"), false, k); }
  });
  it("指针要做的操作：套索工具画选区 = selection；油漆桶 = fill；浮着的时候 = floatTransform；别的 role 不细分", () => {
    eq(pointerOp("lasso", "lasso", false), "selection");
    eq(pointerOp("lasso", "fill", false), "fill");
    eq(pointerOp("lasso", "lasso", true), "floatTransform");
    eq(pointerOp("lasso", "transform", true), "floatTransform");
    for (const r of ["draw", "erase", "filterBrush", "shapeBrush", "pan", "pick", null]) eq(pointerOp(r, "brush", false), undefined, String(r));
  });
  it("接起来：锁着的画上，套索画选区收、油漆桶不收、落笔不收（门闪一下只在被拒的时候）", () => {
    rig(); let flashes = 0; onEditLockFlash(() => flashes++);
    eq(allows("pointer:draw", { op: pointerOp("lasso", "lasso", false) }), true); eq(flashes, 0);
    eq(allows("pointer:draw", { op: pointerOp("lasso", "fill", false) }), false); eq(flashes, 1);
    eq(allows("pointer:draw", { op: pointerOp("draw", "brush", false) }), false); eq(flashes, 2);
  });
});

describe("edit-lock · 写门每一步都问（并进同一步的微步、撤销重做）", () => {
  class ValComp {
    constructor(wp, kind) { this._wp = wp; this.kind = kind; this.v = 0; this._origin = null; }
    set(x) { this._wp._componentWrite(this); if (this._origin === null) this._origin = { v: this.v }; this.v = x; }
    sealRecord() { const o = this._origin; this._origin = null; return !o || o.v === this.v ? null : o; }
    swapRecord(d) { const cur = this.v; this.v = d.v; return { v: cur }; }
    recordBytes() { return 8; } disposeRecord() {}
  }
  class TestWp extends Workpiece { constructor(o) { super(o); this.a = new ValComp(this, "a"); this.register(this.a, { undo: "recorded" }); } }
  const mk = () => { const h = new History({ maxQuotaBytes: 1 << 30, onUnrecoverable: (e) => { throw e; } }); const wp = new TestWp({ undo: h.stack, onTokenLeak: () => {} }); h.attach(wp); wp.writeGate = (l) => editWriteGate(l); return { h, wp }; };

  it("先一个放行的操作留开令牌，后面不放行的不许搭车过门", () => {
    rig();
    const { h, wp } = mk();
    eq(h.withPoint("selection", { checkpoint: false }, () => wp.a.set(1)).ok, true);
    let threw = false, ran = false;
    try { h.withPoint("fill", {}, () => { ran = true; wp.a.set(2); }); } catch (e) { threw = e instanceof WriteRefusedError; }
    eq(threw, true); eq(ran, false); eq(wp.a.v, 1, "被拒的那一步没进去，前面那一步还在");
    h.sealCheckpoint(); eq(h.stack.peekLabel("undo"), "selection");
  });
  it("嵌套：外层放行、里层不放行 → 整步回滚", () => {
    rig();
    const { h, wp } = mk();
    const r = h.withPoint("selection", {}, () => { wp.a.set(1); h.withPoint("addLayer", { checkpoint: false }, () => wp.a.set(2)); });
    eq(r.ok, false); eq(wp.a.v, 0); eq(h.canUndo(), false);
  });
  it("几个不同名字的微步并成的一步，标签 = 名字用 + 连起来（不会被当成开头那个操作）", () => {
    const st = rig({ unlocked: ["画.ora"] });
    const { h, wp } = mk();
    h.withPoint("layerVisible", { checkpoint: false }, () => wp.a.set(1));
    h.withPoint("layerProp", { checkpoint: false }, () => wp.a.set(2));
    h.withPoint("layerVisible", {}, () => wp.a.set(3));
    eq(h.stack.peekLabel("undo"), "layerVisible+layerProp");
    st.unlocked.clear();                                   // 现在锁上
    eq(h.undo(), false, "这一步里混着内容：锁着不许翻"); eq(wp.a.v, 3);
  });
  it("撤销 / 重做按要翻的那一步的操作算：锁着能翻自己刚动的看法，翻到内容那一步就停", () => {
    const st = rig({ unlocked: ["画.ora"] });
    const { h, wp } = mk();
    h.withPoint("stroke", {}, () => wp.a.set(1));          // 解着的时候画了一笔
    st.unlocked.clear();                                   // 锁上
    let flashes = 0; onEditLockFlash(() => flashes++);
    h.withPoint("selection", {}, () => wp.a.set(2));       // 锁着：框了个选区
    h.withPoint("layerVisible", {}, () => wp.a.set(3));    // 锁着：关了一层
    eq(takeLookOwed(), true);
    eq(h.peekLabel("undo"), "layerVisible");
    eq(h.undo(), true); eq(wp.a.v, 2); eq(takeLookOwed(), true, "翻回可见性 = 又动了一次要进文件的看法");
    eq(h.undo(), true); eq(wp.a.v, 1); eq(takeLookOwed(), false, "翻回选区不欠");
    eq(flashes, 0);
    eq(h.peekLabel("undo"), "stroke");
    eq(h.undo(), false, "再往前是画面内容：不动"); eq(wp.a.v, 1); eq(flashes, 1);
    eq(h.redo(), true); eq(h.redo(), true); eq(wp.a.v, 3);
    eq(h.redo(), false, "没有可重做的了：不问门、不闪"); eq(flashes, 1);
  });
  it("顶上还没封口的那一步：peekLabel 认得到；撤销先补封再按它的标签问", () => {
    rig();
    const { h, wp } = mk();
    h.withPoint("selection", { checkpoint: false }, () => wp.a.set(5));
    eq(h.peekLabel("undo"), "selection");
    eq(h.undo(), true); eq(wp.a.v, 0);
  });
});

describe("edit-lock · 什么时候可以「锁上」（画布文件菜单那一项出不出现）", () => {
  it("图库里的画：解着才可以锁；锁着 / 空白 / 刚新建没存的 / 库没开开关 → 不出现", () => {
    rig({ unlocked: ["画.ora"] }); eq(canLockNow(), true);
    rig(); eq(canLockNow(), false, "已经锁着");
    rig({ createPending: true }); eq(canLockNow(), false, "刚新建还没存");
    rig({ active: null }); eq(canLockNow(), false, "没开着画");
    rig({ lockOn: false, unlocked: ["画.ora"] }); eq(canLockNow(), false, "库没开修改锁");
  });
  it("硬盘文件：解着才可以锁；lockLocalFile 之后又锁着", () => {
    _resetLocksForTest(); _resetEditLockForTest();
    const h = { name: "猫.ora" };
    initEditLock({ store: () => null, activeIdentifier: () => null, createPending: () => false, loading: () => false, localFile: () => h });
    eq(canLockNow(), false); unlockLocalFile(); eq(canLockNow(), true);
    lockLocalFile(); eq(isEditLocked(), true); eq(canLockNow(), false);
  });
});

describe("edit-lock · 收尾", () => {
  it("拆掉接线（模块是单例：不拆会让后面的测试以为有一幅锁着的画）", () => { _resetEditLockForTest(); _resetLocksForTest(); eq(isEditLocked(), false); eq(allows("pointer:draw"), true); });
});
