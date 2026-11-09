// 保存这一层的锁（2026-11-08，Claude Fable 5.1；家族「源文件原则上只读」，user「默认的文件你根本不能编辑，一编辑就报错，一保存就报错」）。
//   EditorAdapter.editLocked?(name)：锁着 ∧（内存脏 ∨ 人按了存）→ persist 抛 EditLockedError、脏原样保住（不许吞）；
//   锁着 ∧ 只欠一推 → 不 encode 不 save（补推归库）；新建还没首存的不问；解锁之后一次落盘。
import { describe, it, assert, eq } from "./runner.mjs";
import { createEditorSession, EditLockedError } from "../src/editor-session/index.ts";

function rig({ locked = true, pushOk = true } = {}) {
  const st = { locked, pushOk, saves: [], encodes: 0, change: () => {} };
  const store = { file: (name, opts) => ({
    open: async () => new Blob(["BYTES"]),
    save: async (_b, o) => { st.saves.push({ name, mode: opts.mode, tryPush: o?.tryPush }); return { pushed: o?.tryPush !== false && st.pushOk }; },
    tryMove: async () => ({ ok: true }), trash: async () => ({ status: "trashed" }),
  }) };
  const editor = { adopt: async () => {}, onChange: (cb) => { st.change = cb; }, encode: async () => { st.encodes++; return { bytes: new Blob(["DOC"]), peek: null }; },
    editLocked: (name) => { st.asked = name; return st.locked; } };
  return { st, es: createEditorSession({ store, editor }) };
}
async function throwsLocked(fn, what) {
  try { await fn(); } catch (e) { assert(e instanceof EditLockedError, `${what}: 应当抛 EditLockedError，实得 ${e?.name}: ${e?.message}`); return e; }
  throw new Error(`${what}: 应当抛 EditLockedError，但没抛`);
}

describe("editor-session › 保存这一层的锁（editLocked）", () => {
  it("锁着 ∧ 干净：自动保存 / 退出推都什么也不做（没有东西要存）", async () => {
    const { st, es } = rig();
    assert(await es.open("a.ora"));
    await es.flushLocal(); await es.flushAndPush();
    eq(st.saves.length, 0); eq(st.encodes, 0);
  });
  it("锁着 ∧ 内存脏（界面那层漏了）：flushLocal / flushAndPush 抛 EditLockedError，不 encode 不 save，脏保住；解锁后一次落盘", async () => {
    const { st, es } = rig();
    assert(await es.open("a.ora"));
    st.change();
    const e = await throwsLocked(() => es.flushLocal(), "自动保存");
    eq(e.identifier, "a.ora");
    await throwsLocked(() => es.flushAndPush(), "退出推");
    eq(st.saves.length, 0); eq(st.encodes, 0);
    eq(es.isDirty(), true, "改动还在内存里"); eq(es.isPushPending(), true);
    st.locked = false;
    await es.flushAndPush();
    eq(st.saves.length, 1); eq(es.isDirty(), false);
  });
  it("锁着 ∧ 人按了存（不脏也算）：抛——「一保存就报错」", async () => {
    const { st, es } = rig();
    assert(await es.open("a.ora"));
    await throwsLocked(() => es.forceSaveAndPush(), "人按存");
    eq(st.saves.length, 0);
  });
  it("锁着 ∧ 只欠一推（解着的时候存下了、没推成，之后锁上）：不走保存、不抛，欠的那一推原样记着（补推归库）", async () => {
    const { st, es } = rig({ locked: false, pushOk: false });
    assert(await es.open("a.ora"));
    st.change();
    await es.flushAndPush();
    eq(st.saves.length, 1); eq(es.isDirty(), false); eq(es.isPushPending(), true, "存下了但没推成");
    st.locked = true;
    await es.flushAndPush();
    eq(st.saves.length, 1, "锁着：不再走保存"); eq(es.isPushPending(), true);
  });
  it("新建还没首存的那份不问锁（它还不存在）：首存走 mode:new；首存之后才开始问", async () => {
    const { st, es } = rig();
    es.adopted("new.ora", { create: true });
    eq(es.isCreatePending(), true);
    st.asked = undefined;
    await es.flushLocal();
    eq(st.saves.length, 1); eq(st.saves[0].mode, "new"); eq(st.asked, undefined, "首存没问锁");
    eq(es.isCreatePending(), false);
    st.change();
    await throwsLocked(() => es.flushLocal(), "首存之后、锁着的保存");
  });
  it("没接 editLocked 的宿主：行为不变", async () => {
    const st = { saves: [], change: () => {} };
    const store = { file: (name, opts) => ({ open: async () => new Blob(["B"]), save: async (_b, o) => { st.saves.push(name); return { pushed: true }; }, tryMove: async () => ({ ok: true }), trash: async () => ({ status: "trashed" }) }) };
    const es = createEditorSession({ store, editor: { adopt: async () => {}, onChange: (cb) => { st.change = cb; }, encode: async () => ({ bytes: new Blob(["D"]) }) } });
    assert(await es.open("a.ora")); st.change(); await es.flushLocal();
    eq(st.saves.length, 1);
  });
});
