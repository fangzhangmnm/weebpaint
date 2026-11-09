// editor-session **数据安全**回归（v417 止血批）。这一整个文件都是"曾经真的会丢画/丢工作"的路径。
//
// 判据（用户 2026-07-18 拍定的词典序优先级，不是加权）：
//   **OneDrive 不丢画 >> 用户当前操作不丢 > 自愈**
// 每个 it() 下面都标了它守的是哪一级。断言按这个排序写——注意 null-base 那组**不**断言"保存必须成功"。
import { describe, it, assert, eq } from "./runner.mjs";
import { createEditorSession } from "../src/editor-session/index.ts";

// mock store：可控 open 返回值 + 可控 save 抛错（模拟撞名护栏 / 本地写失败）。
function mockStore() {
  const saves = [];
  const opened = [];
  return {
    saves, opened,
    _openReturns: new Blob(["DOC"]),
    _saveThrows: null,        // 设成 Error 实例 → 下一次 save 抛它
    _saveThrowsOnce: false,
    file(name, opts) {
      const st = this;
      return {
        open: async () => { opened.push({ name, mode: opts.mode }); return st._openReturns; },
        save: async (bytes, o) => {
          if (st._saveThrows) {
            const e = st._saveThrows;
            if (st._saveThrowsOnce) { st._saveThrows = null; st._saveThrowsOnce = false; }
            throw e;
          }
          saves.push({ name, mode: opts.mode, tryPush: o?.tryPush });
        },
        tryMove: async () => ({ ok: true }),
        delete: async () => {},
      };
    },
  };
}
function mockEditor() {
  let changeCb = () => {};
  const adopted = [];
  return {
    adopted,
    fireChange: () => changeCb(),
    adopt: async (blob) => { adopted.push(blob); },
    encode: async () => ({ bytes: new Blob(["BYTES"]), peek: null }),
    onChange: (cb) => { changeCb = cb; },
  };
}

describe("editor-session › 开一个身份是事务性的（优先级 1：OneDrive 不丢画）", () => {
  it("open 失败（store 返 null）→ 会话**不**指向那个身份，adopt 也没发生", async () => {
    const store = mockStore(), editor = mockEditor();
    store._openReturns = null;                      // 离线纯云端 / 文件锁定 / 本地字节没了
    const es = createEditorSession({ store, editor });
    const ok = await es.open("missing.ora");
    eq(ok, false, "open 必须诚实返回 false");
    eq(editor.adopted.length, 0, "没字节就不该 adopt");
    eq(es.currentName(), null, "★ 绝不能指向一个没装进来的身份");
  });

  it("open 失败后画一笔再 autosave → **一个字节都不写**（旧版会把空白盖到 X.ora）", async () => {
    const store = mockStore(), editor = mockEditor();
    store._openReturns = null;
    const es = createEditorSession({ store, editor });
    await es.open("X.ora");
    editor.fireChange();                            // 用户在空白画布上画了一笔
    await es.flushLocal();
    eq(store.saves.length, 0, "★ boot 恢复失败后的涂鸦绝不能覆盖 X.ora");
  });

  it("已开着 A 时 open B 失败 → 仍持有 A，后续保存写回 A（不写 B）", async () => {
    const store = mockStore(), editor = mockEditor();
    const es = createEditorSession({ store, editor });
    await es.open("A.ora");                         // A 正常打开
    editor.fireChange();
    store._openReturns = null;                      // B 打不开
    const ok = await es.open("B.ora");
    eq(ok, false);
    eq(es.currentName(), "A.ora", "★ 画布上还是 A，身份就该还是 A");
    await es.flushLocal();
    const written = store.saves.filter((s) => s.name === "B.ora");
    eq(written.length, 0, "★ A 的像素绝不能写进 B 的身份");
  });
});

describe("editor-session › 保存失败不得宣布干净（优先级 2：用户当前操作不丢）", () => {
  it("save 抛错 → isDirty 仍为 true（退出重试环靠它武装）", async () => {
    const store = mockStore(), editor = mockEditor();
    const es = createEditorSession({ store, editor });
    await es.open("a.ora");
    editor.fireChange();
    eq(es.isDirty(), true);
    store._saveThrows = new Error("撞名护栏 / 本地写失败");
    let threw = false;
    try { await es.flushLocal(); } catch { threw = true; }
    eq(threw, true, "失败必须抛给调用方 surface");
    eq(es.isDirty(), true, "★ 保存没成功就不许说干净");
  });

  it("save 抛错后重试成功 → 正常落盘（脏标记没被吃掉）", async () => {
    const store = mockStore(), editor = mockEditor();
    const es = createEditorSession({ store, editor });
    await es.open("a.ora");
    editor.fireChange();
    store._saveThrows = new Error("瞬态失败"); store._saveThrowsOnce = true;
    try { await es.flushLocal(); } catch { /* 预期 */ }
    await es.flushLocal();                          // 重试：need 门必须还是 true
    eq(store.saves.length, 1, "★ 重试要真的写进去");
    eq(es.isDirty(), false, "成功后才允许清脏");
  });

  it("force save 一个不脏的 doc 失败 → 不制造假的脏 badge（还原入场态，不是无脑置脏）", async () => {
    const store = mockStore(), editor = mockEditor();
    const es = createEditorSession({ store, editor });
    await es.open("a.ora");
    eq(es.isDirty(), false);
    store._saveThrows = new Error("推失败");
    try { await es.forceSaveAndPush(); } catch { /* 预期 */ }
    eq(es.isDirty(), false, "本来就干净（内容==盘上）→ 失败后仍该是干净");
  });
});

describe("editor-session › create 标记是 per-name，不会跨文档泄漏（优先级 2）", () => {
  it("新建首存失败 → 不把 mode:\"new\" 传染给之后打开的别的文件", async () => {
    const store = mockStore(), editor = mockEditor();
    const es = createEditorSession({ store, editor });
    es.adopted("imported.ora", { create: true });   // 导入 → 首存应走 mode:"new"
    store._saveThrows = new Error("CloudNameCollisionError"); store._saveThrowsOnce = true;
    try { await es.flushLocal(); } catch { /* 预期：重名导入 */ }

    // 旧版这里 _createNext 被永久钉在 true → 之后每个文件的每次保存都走 mode:"new" → 撞本地副本 → 全线保存失败。
    // 注意 open() 会先把还脏的 imported.ora 落盘（脏标记在失败后被正确还原了，见上一组）——
    //   那次重试**仍该是 new**（imported.ora 这个身份确实还没建起来），而新开的文件**必须是 existing**。
    //   两者同时成立，正是"per-name 而非会话级"的意思。
    await es.open("existing.ora");
    editor.fireChange();
    await es.flushLocal();

    const retry = store.saves.filter((s) => s.name === "imported.ora");
    eq(retry.length, 1, "切 doc 前把失败的那次重试掉了（工作没丢）");
    eq(retry[0].mode, "new", "imported.ora 身份仍未建 → 重试仍走首存护栏");

    const other = store.saves.filter((s) => s.name === "existing.ora");
    eq(other.length, 1);
    eq(other[0].mode, "existing", "★ 打开的已有文件必须走 existing，不能被上一次失败传染成 new");
  });

  it("新建首存成功 → 该身份转 existing（后续 autosave 是编辑不是新建）", async () => {
    const store = mockStore(), editor = mockEditor();
    const es = createEditorSession({ store, editor });
    es.adopted("fresh.ora", { create: true });
    await es.flushLocal();
    eq(store.saves[0].mode, "new", "首存 = new（撞名不静默覆盖）");
    editor.fireChange();
    await es.flushLocal();
    eq(store.saves[1].mode, "existing", "第二次起 = existing");
  });

  it("open 一个正待新建的同名身份 → 该身份已存在，转 existing", async () => {
    const store = mockStore(), editor = mockEditor();
    const es = createEditorSession({ store, editor });
    es.adopted("dup.ora", { create: true });
    await es.open("dup.ora");                        // 它能从 store 打开 = 已经建好了
    editor.fireChange();
    await es.flushLocal();
    eq(store.saves[0].mode, "existing", "★ 能打开就说明身份已建，别再走首存护栏");
  });
});

// ── 2026-11-09（Claude Fable 5.1；家族周账 F-187 + 同一段代码里查出来的跨写）：保存排队 + 每一轮钉住「存给谁」──
//   以前：有一轮在存，后来的调用直接返回（`_saving` 单飞锁）。两个原样复现过的后果——
//     · 人按存撞上在飞的自动保存：什么都没做就返回，快照之后的那一笔既没存也没推，界面照常说「已保存」；
//     · 自动保存编码到一半时换开另一份：旧文档的内容被写到**新文档的名字**下面（优先级 1：别的画被盖掉）。
//   判据不变：OneDrive 不丢画 >> 用户当前操作不丢 > 自愈。
describe("editor-session · 保存排队 + 钉身份（在飞的那一轮落地之前，别的动作不许抢跑、也不许被当成做完了）", () => {
  const text = async (b) => (b && typeof b.text === "function" ? await b.text() : String(b));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  // 可控的台子：encode 第 N 次调用可以卡住，等手动放行（像真的那样在 worker 里编码几百毫秒到几秒）。
  function rig({ holdEncodes = [1], pushOk = true } = {}) {
    const log = [];                                   // 按发生顺序记：save / open / adopt / trash / move
    let content = "空";                               // 画布上现在是什么
    let encodeCalls = 0; const gates = new Map();
    const store = { _saveThrows: null, file(name, opts) { return {
      open: async () => { log.push(`open ${name}`); return new Blob([`${name}@disk`]); },
      save: async (bytes, o) => { if (store._saveThrows) { const e = store._saveThrows; store._saveThrows = null; throw e; } log.push(`save ${name} = ${await text(bytes)}${o?.tryPush ? " +push" : ""} (${opts.mode})`); return { pushed: !!o?.tryPush && pushOk }; },
      tryMove: async (to) => { log.push(`move ${name} -> ${to}`); return { ok: true }; },
      trash: async () => { log.push(`trash ${name}`); },
    }; } };
    let changeCb = () => {};
    const editor = {
      adopt: async (blob) => { content = await text(blob); log.push(`adopt ${content}`); },
      encode: async () => { const n = ++encodeCalls, snap = content; if (holdEncodes.includes(n)) await new Promise((r) => gates.set(n, r)); return { bytes: new Blob([snap]), peek: null }; },
      onChange: (cb) => { changeCb = cb; },
      onSaved: (name) => { log.push(`onSaved ${name}`); },
    };
    const es = createEditorSession({ store, editor, policy: { autosaveMs: 0, pushOn: ["exit"] } });
    return { es, log, store, edit: (c) => { content = c; changeCb(); }, setContent: (c) => { content = c; }, release: (n = 1) => gates.get(n)?.(), saves: () => log.filter((l) => l.startsWith("save ")) };
  }

  it("【优先级 1】自动保存编码到一半时换开另一份：旧文档的字节落在**旧名字**下，新名字一个字节都没被写；换身份等保存落地", async () => {
    const r = rig();
    await r.es.open("A.ora"); r.edit("A 改过");
    const auto = r.es.flushLocal(); await tick();      // 自动保存：编码卡住
    let openedAt = null; const opening = r.es.open("B.ora").then((ok) => { openedAt = r.log.length; return ok; });
    await tick(); await tick();
    eq(r.es.currentName(), "A.ora", "保存没落地之前身份不换");
    eq(openedAt, null, "open 还在等");
    r.release(); await auto; eq(await opening, true);
    // 两次都落在 A 名下：第一次 = 在飞的那轮自动保存（只落本机）；第二次 = open 自己的「切走之前先存旧的并推」（退出语义，以前被那句直接返回一起吞掉了）。
    eq(r.saves().join(" | "), "save A.ora = A 改过 (existing) | save A.ora = A 改过 +push (existing)");
    assert(!r.log.some((l) => l.startsWith("save B.ora")), "新开的那份没有被写：" + r.log.join(" / "));
    assert(r.log.lastIndexOf("save A.ora = A 改过 +push (existing)") < r.log.indexOf("open B.ora"), "先存完旧的，才去开新的：" + r.log.join(" / "));
    eq(r.es.currentName(), "B.ora"); eq(r.es.isDirty(), false);
  });

  it("【优先级 1】同步换身份（新建 / 导入的 adopted）插进一轮保存中间：字节仍落起跑时那个名字；新文档的脏旗不被那一轮清掉", async () => {
    const r = rig();
    await r.es.open("A.ora"); r.edit("A 改过");
    const auto = r.es.flushLocal(); await tick();
    r.setContent("新画的第一笔"); r.es.adopted("新画.ora", { create: true });   // 画布已经是新画了，A 的那一轮还在编码
    r.release(); await auto;
    eq(r.saves().join(" | "), "save A.ora = A 改过 (existing)", "A 的快照落在 A 名下，不是「新画.ora」");
    eq(r.es.currentName(), "新画.ora"); eq(r.es.isDirty(), true, "新画还没存：脏旗不许被上一轮顺手清掉"); eq(r.es.isPushPending(), true);
    eq(r.es.isCreatePending(), true, "新画的「首存走 new」也还在");
    await r.es.flushLocal();
    eq(r.saves()[1], "save 新画.ora = 新画的第一笔 (new)");
  });

  it("【周账 F-187】人按存撞上在飞的自动保存：等它落地，再完整存一遍并推；快照之后的那一笔这次真的存了、推了", async () => {
    const r = rig();
    await r.es.open("A.ora"); r.edit("第一笔");
    const auto = r.es.flushLocal(); await tick();
    r.edit("第二笔");                                   // 自动保存取了快照之后又画了一笔
    let done = false; const forced = r.es.forceSaveAndPush().then(() => { done = true; });
    await tick(); await tick();
    eq(done, false, "按存不许在什么都没存的时候就说自己完了");
    eq(r.saves().length, 0);
    r.release(); await auto; await forced;
    eq(r.saves().join(" | "), "save A.ora = 第一笔 (existing) | save A.ora = 第二笔 +push (existing)");
    eq(r.es.isDirty(), false); eq(r.es.isPushPending(), false);
  });

  it("flushLocal 撞上在飞的那一轮：落地时调用之前的改动都在盘上了（没变就不重存）", async () => {
    const r = rig();
    await r.es.open("A.ora"); r.edit("第一笔");
    const first = r.es.flushLocal(); await tick();
    const second = r.es.flushLocal();                  // 中间没有新改动
    r.release(); await first; await second;
    eq(r.saves().length, 1, "前一轮已经把该存的存了，后一个不重复编码");
    r.edit("第二笔");
    const r2 = rig();                                   // 另一种：中间有新改动
    await r2.es.open("A.ora"); r2.edit("第一笔");
    const a = r2.es.flushLocal(); await tick(); r2.edit("第二笔"); const b = r2.es.flushLocal();
    r2.release(); await a; await b;
    eq(r2.saves().join(" | "), "save A.ora = 第一笔 (existing) | save A.ora = 第二笔 (existing)");
    eq(r2.es.isDirty(), false);
  });

  it("同名重开（云端快进 / 换世界线用的那条）也排在在飞的保存后面：装进来的是保存之后的字节，不是之前的", async () => {
    const r = rig();
    await r.es.open("A.ora"); r.edit("A 改过");
    const auto = r.es.flushLocal(); await tick();
    const re = r.es.open("A.ora");
    await tick(); eq(r.log.filter((l) => l === "open A.ora").length, 1, "第二次 open 还没开始读盘");
    r.release(); await auto; await re;
    assert(r.log.indexOf("save A.ora = A 改过 (existing)") < r.log.lastIndexOf("open A.ora"), r.log.join(" / "));
  });

  it("改名、删除也排队：在飞的保存先落到旧名字，再搬 / 再进回收站（不是刚删掉又被存回来）", async () => {
    const r = rig();
    await r.es.open("A.ora"); r.edit("A 改过");
    const auto = r.es.flushLocal(); await tick();
    const mv = r.es.rename("B.ora");
    r.release(); await auto; eq((await mv).ok, true);
    assert(r.log.indexOf("save A.ora = A 改过 (existing)") < r.log.indexOf("move A.ora -> B.ora"), r.log.join(" / "));
    eq(r.es.currentName(), "B.ora");
    const d = rig();
    await d.es.open("A.ora"); d.edit("A 改过");
    const auto2 = d.es.flushLocal(); await tick();
    const del = d.es.delete();
    d.release(); await auto2; await del;
    assert(d.log.indexOf("save A.ora = A 改过 (existing)") < d.log.indexOf("trash A.ora"), d.log.join(" / "));
    eq(d.es.currentName(), null);
    assert(!d.log.slice(d.log.indexOf("trash A.ora")).some((l) => l.startsWith("save ")), "进回收站之后没有再写");
  });

  it("前一轮失败不把队卡死：失败只报给它自己的调用方，后面的照常跑", async () => {
    const r = rig({ holdEncodes: [] });
    await r.es.open("A.ora"); r.edit("第一笔");
    r.store._saveThrows = new Error("磁盘满了");
    let firstErr = null; const first = r.es.flushLocal().catch((e) => { firstErr = e; });
    const second = r.es.flushLocal();
    await first; await second;
    assert(firstErr && /磁盘满了/.test(firstErr.message), "第一轮的失败给了第一轮的调用方");
    eq(r.es.isDirty(), false, "第二轮接着跑、存成了");
    eq(r.saves().join(" | "), "save A.ora = 第一笔 (existing)");
  });

  it("一轮保存中间身份被换走之后那一轮才失败：不把新文档的旗标改成旧文档的", async () => {
    const r = rig();
    await r.es.open("A.ora"); r.edit("A 改过");
    r.store._saveThrows = new Error("写不进去");
    let err = null; const auto = r.es.flushLocal().catch((e) => { err = e; }); await tick();
    r.setContent("新画"); r.es.adopted("新画.ora", { create: true });
    r.release(); await auto;
    assert(err, "那一轮的失败照常抛");
    eq(r.es.currentName(), "新画.ora"); eq(r.es.isDirty(), true); eq(r.es.isCreatePending(), true);
  });
});
