// 落盘闸（2026-10-21 对抗性审计复现，Claude Fable 5.1）：「较新 app 写的画 → 覆盖前确认」那一层以前只拦 session-state 自己的保存入口，
//   editor-session 自己的 autosave / 失焦 / 关页 / 退出推云直接 persist → 没确认就把旧格式写回去。复现 = 适配器说「本轮不准写」时 persist 照写。
//   修法 = EditorAdapter.mayWrite?()：false → persist 不 encode 不 save、内存脏保住；true → 照旧。
import { describe, it, assert, eq } from "./runner.mjs";
import { createEditorSession } from "../src/editor-session/index.ts";

function mockStore() {
  const saves = [];
  return {
    saves,
    file(name, opts) {
      return {
        open: async () => new Blob(["BYTES"]),
        save: async (bytes, o) => { saves.push({ name, tryPush: o?.tryPush, mode: opts.mode }); return { pushed: o?.tryPush !== false }; },
        tryMove: async () => ({ ok: true }), trash: async () => ({ status: "trashed" }),
      };
    },
  };
}
function mockEditor(mayWriteRef) {
  let changeCb = () => {};
  let encodes = 0;
  return {
    get encodes() { return encodes; },
    fireChange: () => changeCb(),
    adopt: async () => {},
    encode: async () => { encodes++; return { bytes: new Blob(["DOC"]), peek: null }; },
    onChange: (cb) => { changeCb = cb; },
    mayWrite: () => mayWriteRef.value,
  };
}

describe("editor-session › 落盘闸 mayWrite（覆盖前确认那一层的最后一道）", () => {
  it("mayWrite=false：flushLocal / flushAndPush / forceSaveAndPush 都不 encode 不 save，内存脏与 push-pending 保住；放开后一次落盘", async () => {
    const gate = { value: false };
    const store = mockStore(), editor = mockEditor(gate);
    const es = createEditorSession({ store, editor });
    assert(await es.open("a.ora"));
    editor.fireChange();
    eq(es.isDirty(), true);
    await es.flushLocal(); await es.flushAndPush(); await es.forceSaveAndPush();
    eq(store.saves.length, 0, "没确认 → 一个字节都不写");
    eq(editor.encodes, 0, "连 encode 都不做");
    eq(es.isDirty(), true, "内存脏保住（下次再问）"); eq(es.isPushPending(), true);
    gate.value = true;
    await es.flushAndPush();
    eq(store.saves.length, 1); eq(es.isDirty(), false); eq(es.isPushPending(), false);
  });
  it("mayWrite=false 时切画：open(另一张) 不把旧画写回（旧画的编辑留在内存里由 app 层先问）", async () => {
    const gate = { value: false };
    const store = mockStore(), editor = mockEditor(gate);
    const es = createEditorSession({ store, editor });
    assert(await es.open("a.ora")); editor.fireChange();
    assert(await es.open("b.ora"));
    eq(store.saves.length, 0);
  });
  it("没有 mayWrite 的适配器 = 行为不变（照写）", async () => {
    const store = mockStore(), editor = mockEditor({ value: false }); delete editor.mayWrite;
    const es = createEditorSession({ store, editor });
    assert(await es.open("a.ora")); editor.fireChange();
    await es.flushLocal();
    eq(store.saves.length, 1);
  });
});
