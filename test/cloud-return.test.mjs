// test/cloud-return.test.mjs —— 回来时没传的东西分三种（规则书 §1 第 15 条，2026-11-03 夜改写；工单 G2）。
// created 2026-11-03 by Claude Opus 5.5
import { describe, it, eq, assert } from "./runner.mjs";
import { createEditorSession } from "../src/editor-session/index.ts";
const { planReturn, neverUploadedIds } = await import("../src/cloud-return.ts");

describe("planReturn", () => {
  it("什么都没脏：不问不提", () => eq(planReturn(0, 0).kind, "none"));
  it("只有传过的（c）：不问不推，进列表", () => { const p = planReturn(3, 0); eq(p.kind, "list"); eq(p.total, 3); });
  it("只有从没传过的（a）：问，others = 0", () => { const p = planReturn(2, 2); eq(p.kind, "ask"); eq(p.neverUploaded, 2); eq(p.others, 0); });
  it("两样都有：问，两个数都带上", () => { const p = planReturn(5, 2); eq(p.kind, "ask"); eq(p.neverUploaded, 2); eq(p.others, 3); });
  it("数不齐（列举比脏账多）：others 不为负", () => eq(planReturn(1, 2).others, 0));
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
