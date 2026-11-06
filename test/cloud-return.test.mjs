// test/cloud-return.test.mjs —— 回来时没传的东西分三种（规则书 §1 第 15 条，2026-11-03 夜改写；工单 G2）。
// created 2026-11-03 by Claude Opus 5.5
import { describe, it, eq, assert } from "./runner.mjs";
import { createEditorSession } from "../src/editor-session/index.ts";
const { planReturn, neverUploadedIds, isOpenDocAutosaveOnly, stillLocalIds } = await import("../src/cloud-return.ts");

describe("planReturn", () => {
  it("什么都没脏：不问不提", () => eq(planReturn(0, 0).kind, "none"));
  it("只有传过的（c）：不问不推，进列表", () => { const p = planReturn(3, 0); eq(p.kind, "list"); eq(p.total, 3); });
  it("只有从没传过的（a）：问，others = 0", () => { const p = planReturn(2, 2); eq(p.kind, "ask"); eq(p.neverUploaded, 2); eq(p.others, 0); });
  it("两样都有：问，两个数都带上", () => { const p = planReturn(5, 2); eq(p.kind, "ask"); eq(p.neverUploaded, 2); eq(p.others, 3); });
  it("数不齐（列举比脏账多）：others 不为负", () => eq(planReturn(1, 2).others, 0));
  // F-200（user 11-05 报的 MoonSinger，同一段代码）：开着这份只是自动保存 = 它不是回来发现的事
  it("只有开着的这份自动保存：什么都不说", () => eq(planReturn(1, 0, true).kind, "none"));
  it("开着的 + 别的一份：说 1 份", () => { const p = planReturn(2, 0, true); eq(p.kind, "list"); eq(p.total, 1); });
  it("开着的从没传过（它是 (a)，不算自动保存）：问", () => { const p = planReturn(1, 1, false); eq(p.kind, "ask"); eq(p.neverUploaded, 1); });
  it("要问 (a) 时不减：现在全传确实会连开着的一起传，面上的数要算它", () => { const p = planReturn(2, 1, true); eq(p.kind, "ask"); eq(p.others, 1); });
});
describe("isOpenDocAutosaveOnly：库和这一页都说是才算", () => {
  const files = [{ identifier: "a.ora", syncState: "unpushed" }, { identifier: "b.ora", syncState: "synced" }, { identifier: "c.ora", syncState: "conflict" }, { identifier: "d.ora", syncState: "float" }];
  it("库说它改过没传、这一页也知道：是", () => assert(isOpenDocAutosaveOnly(files, "a.ora", true)));
  it("人按过存（(b)）/ 刷新后这一页不知道（存钮显示干净、离开不传，通知是唯一的信号）：不是", () => assert(!isOpenDocAutosaveOnly(files, "a.ora", false)));
  it("字节还没落盘 = 不在脏账上（库说 synced）：不是——减了就把别的画藏掉了", () => assert(!isOpenDocAutosaveOnly(files, "b.ora", true)));
  it("分叉（真要人选）/ 从没传过：不是", () => { assert(!isOpenDocAutosaveOnly(files, "c.ora", true)); assert(!isOpenDocAutosaveOnly(files, "d.ora", true)); });
  it("没开着：不是", () => assert(!isOpenDocAutosaveOnly(files, null, true)));
});
describe("stillLocalIds", () => {
  it("点名传过还没传的，不含开着那份、不含从没传过的、不含干净的", () => {
    const f = [{ identifier: "a", syncState: "unpushed" }, { identifier: "b", syncState: "unpushed" }, { identifier: "c", syncState: "conflict" }, { identifier: "d", syncState: "float" }, { identifier: "e", syncState: "synced" }];
    eq(stillLocalIds(f, "a").join(), "b,c");
    eq(stillLocalIds(f, null).join(), "a,b,c");
  });
});

describe("neverUploadedIds", () => {
  it("只认 float：local-only 是干净的，unpushed / conflict / ghost 是传过或撞名的", () => {
    const ids = neverUploadedIds([
      { identifier: "a.ora", syncState: "float" }, { identifier: "b.ora", syncState: "local-only" },
      { identifier: "c.ora", syncState: "unpushed" }, { identifier: "d.ora", syncState: "conflict" },
      { identifier: "e.ora", syncState: "ghost" }, { identifier: "f.ora", syncState: "synced" }, { identifier: "g.ora" },
    ]);
    eq([...ids].join(), "a.ora");
  });
});

describe("EditorSession.isPushOwed：按过存没传成，和只是改过分得开", () => {
  function rig(pushed) {
    let onChange = () => {};
    const st = { pushed };
    const store = { file: () => ({ open: async () => new Blob(["D"]), save: async (_b, o) => ({ pushed: o?.tryPush ? st.pushed : false }) }) };
    const editor = { encode: async () => ({ bytes: new Blob(["D"]), peek: null }), adopt: async () => {}, onChange: (cb) => { onChange = cb; } };
    const es = createEditorSession({ store, editor });
    return { es, st, edit: () => onChange() };
  }
  it("改过 + 自动保存：不欠（pushPending 是真的，但没按存）", async () => {
    const r = rig(false); await r.es.open("x.ora"); r.es.adopted?.("x.ora");
    r.edit(); await r.es.flushLocal();
    assert(r.es.isPushPending()); assert(!r.es.isPushOwed());
  });
  it("按存没传成：欠", async () => {
    const r = rig(false); await r.es.open("x.ora"); r.es.adopted?.("x.ora");
    r.edit(); await r.es.forceSaveAndPush();
    assert(r.es.isPushPending()); assert(r.es.isPushOwed());
  });
  it("按存没传成，之后又改了：不欠（新的那笔没按过存）", async () => {
    const r = rig(false); await r.es.open("x.ora"); r.es.adopted?.("x.ora");
    r.edit(); await r.es.forceSaveAndPush(); r.edit();
    assert(!r.es.isPushOwed());
  });
  it("按存传成了：不欠；续传成了也清", async () => {
    const r = rig(true); await r.es.open("x.ora"); r.es.adopted?.("x.ora");
    r.edit(); await r.es.forceSaveAndPush();
    assert(!r.es.isPushOwed());
    r.st.pushed = false; r.edit(); await r.es.forceSaveAndPush(); assert(r.es.isPushOwed());
    r.st.pushed = true; await r.es.flushAndPush(); assert(!r.es.isPushOwed()); assert(!r.es.isPushPending());
  });
  it("库替它推了（问一次点了现在传）：不欠", async () => {
    const r = rig(false); await r.es.open("x.ora"); r.es.adopted?.("x.ora");
    r.edit(); await r.es.forceSaveAndPush(); r.es.noteExternallyPushed();
    assert(!r.es.isPushOwed()); assert(!r.es.isPushPending());
  });
});
