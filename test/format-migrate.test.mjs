// 格式版本纪律（F-69，家族根 ai-docs/20261021-format-version-discipline.md）：拍子表 / 判决 / 迁移链 / 直通袋 / 笔架咽喉。
// created 2026-10-21 by Claude Opus 5.5
// 冻结样本的全链路往返（打开 → 改一笔 → 存 → 再读）在 format-samples.test.mjs「未来版本写的」节。
import { describe, it, assert, eq } from "./runner.mjs";

const M = await import("../src/backend/format/migrate.ts");
const { FORMAT, MISSING_MAJOR, MAJOR_KEY, STEPS, readStamp, readOraStamp, judge, migrate, stampFields, splitExtra, FormatTooNewError, fmt } = M;
const { desk, deskKnownKeys } = await import("../src/workbench-state.ts");
const { TimelapseDocState, KNOWN_TIMELAPSE_FIELDS } = await import("../src/backend/timelapse/timelapse-state.ts");
const { guardRackFormat } = await import("../src/rack-format-guard.ts");
const { RACK_META_ID, metaAppend, metaRemove, metaMove, metaPrependBuiltins } = await import("../src/brushes.ts");

const J = (x) => JSON.stringify(x);

describe("格式拍子 · 表", () => {
  it("五个子结构都登记了拍子、缺 major 当几、major 键名", () => {
    for (const c of ["ora", "desk", "timelapse", "brush", "rackMeta"]) {
      const s = FORMAT[c];
      assert(Number.isInteger(s.major) && Number.isInteger(s.minor) && Number.isInteger(s.patch), c);
      assert(Number.isInteger(MISSING_MAJOR[c]), c);
    }
    eq(FORMAT.ora.major, 3); eq(MISSING_MAJOR.ora, 0);
    eq(MAJOR_KEY.desk, "version"); eq(MAJOR_KEY.timelapse, "v"); eq(MAJOR_KEY.brush, "version"); eq(MAJOR_KEY.rackMeta, "version");
  });
  it("每个 JSON 子结构从 MISSING_MAJOR 到本版 major 的每一步都有 STEP（纪律：major +1 必须带升级函数）", () => {
    for (const c of ["desk", "timelapse", "brush", "rackMeta"]) {
      for (let v = MISSING_MAJOR[c]; v < FORMAT[c].major; v++) assert(typeof STEPS[c]?.[v] === "function", `${c} v${v}→v${v + 1}`);
    }
  });
});

describe("格式拍子 · 读拍子 / 判决", () => {
  it("JSON：major 键缺 → MISSING_MAJOR；minor / patch 缺或非法 = 0", () => {
    eq(J(readStamp("desk", {})), J({ major: 1, minor: 0, patch: 0 }));
    eq(J(readStamp("desk", { version: 1, minor: 4, patch: 2 })), J({ major: 1, minor: 4, patch: 2 }));
    eq(J(readStamp("timelapse", { v: 1, minor: "x", patch: -1 })), J({ major: 1, minor: 0, patch: 0 }));
    eq(J(readStamp("brush", null)), J({ major: 1, minor: 0, patch: 0 }));
  });
  it("stack.xml 三个属性：无戳 = 0.0.0；非数字当缺", () => {
    eq(J(readOraStamp({})), J({ major: 0, minor: 0, patch: 0 }));
    eq(J(readOraStamp({ format: "3", minor: "1", patch: "2" })), J({ major: 3, minor: 1, patch: 2 }));
    eq(J(readOraStamp({ format: "3", minor: "abc" })), J({ major: 3, minor: 0, patch: 0 }));
  });
  it("判决：major 大 = too-new；同 major 比 minor 再比 patch", () => {
    const m = FORMAT.ora;
    eq(judge("ora", { ...m, major: m.major + 1 }), "too-new");
    eq(judge("ora", { major: m.major - 1, minor: 99, patch: 0 }), "older");
    eq(judge("ora", { ...m, minor: m.minor + 1 }), "newer-minor");
    eq(judge("ora", { ...m, patch: m.patch + 1 }), "newer-patch");
    eq(judge("ora", { ...m }), "same");
    eq(fmt({ major: 3, minor: 1, patch: 2 }), "3.1.2");
  });
});

describe("格式拍子 · migrate", () => {
  it("major 比本版新 → FormatTooNewError，带两份拍子，什么都不改", () => {
    const input = { version: FORMAT.desk.major + 1, minor: 3, x: 1 };
    const before = J(input);
    let err = null;
    try { migrate("desk", input); } catch (e) { err = e; }
    assert(err instanceof FormatTooNewError, String(err));
    eq(err.component, "desk"); eq(J(err.fileStamp), J({ major: FORMAT.desk.major + 1, minor: 3, patch: 0 })); eq(J(err.appStamp), J(FORMAT.desk));
    eq(J(input), before, "输入没被改");
  });
  it("minor 更新：判 newer-minor，值原样（未知键留在 json 里给 splitExtra）", () => {
    const r = migrate("desk", { version: 1, minor: 5, futureKey: 1 });
    eq(r.verdict, "newer-minor"); eq(r.json.futureKey, 1);
  });
  it("缺 major 键 → 补上（下游形状检查不用开例外）", () => {
    eq(migrate("timelapse", { on: true }).json.v, 1);
  });
  it("STEPS 链（注入）：老 major 一步步升；漏一步 = 响亮抛；STEP 没写 major 键 = 响亮抛", () => {
    const mine = FORMAT.desk.major;
    const steps = { desk: { [mine - 1]: (j) => ({ ...j, version: mine, upgraded: true }) } };
    const r = migrate("desk", { version: mine - 1 }, steps);
    eq(r.json.upgraded, true); eq(r.json.version, mine); eq(r.verdict, "older");
    let e1 = null; try { migrate("desk", { version: mine - 1 }, {}); } catch (e) { e1 = e; }
    assert(e1 && /no step registered/.test(e1.message), String(e1));
    let e2 = null; try { migrate("desk", { version: mine - 1 }, { desk: { [mine - 1]: (j) => ({ ...j }) } }); } catch (e) { e2 = e; }
    assert(e2 && /did not set version/.test(e2.message), String(e2));
  });
  it("stampFields = 本版拍；splitExtra 不收已知键也不收拍子键", () => {
    eq(J(stampFields("desk")), J({ version: FORMAT.desk.major, minor: FORMAT.desk.minor, patch: FORMAT.desk.patch }));
    eq(J(stampFields("timelapse")), J({ v: FORMAT.timelapse.major, minor: FORMAT.timelapse.minor, patch: FORMAT.timelapse.patch }));
    eq(J(splitExtra("desk", { version: 1, minor: 2, patch: 3, known: 1, alien: 2 }, ["known"])), J({ alien: 2 }));
  });
});

describe("desk 直通袋", () => {
  it("不认识的顶层键原样带回；已知键赢；拍子写本版的；退役键不带", () => {
    desk.reset();
    const r = desk.Unserialize({ version: 1, minor: 7, patch: 1, brushTool: { size: 9 }, futureDesk: { a: [1, 2] }, bucket: { threshold: 9 }, ruler: { on: true } });
    eq(r.verdict, "newer-minor"); eq(J(r.stamp), J({ major: 1, minor: 7, patch: 1 }));
    const out = desk.Serialize();
    eq(J(out.futureDesk), J({ a: [1, 2] }), "未知键带回");
    eq(out.brushTool.size, 9);
    eq(out.version, FORMAT.desk.major); eq(out.minor, FORMAT.desk.minor); eq(out.patch, FORMAT.desk.patch);
    assert(!("bucket" in out) && !("ruler" in out), "退役键不进直通袋");
  });
  it("已知键和直通袋撞名时已知键赢（袋子里不会有已知键，写入顺序也保证）", () => {
    desk.reset();
    desk.Unserialize({ brushTool: { size: 5 } });
    eq(desk.Serialize().brushTool.size, 5);
    assert(deskKnownKeys().includes("brushTool") && deskKnownKeys().includes("refPanels"));
  });
  it("reset 清直通袋（上一张画的未知键不进新画）", () => {
    desk.reset(); desk.Unserialize({ futureDesk: 1 });
    desk.reset();
    assert(!("futureDesk" in desk.Serialize()));
  });
  it("major 比本版新 → 抛，desk 不变", () => {
    desk.reset(); desk.Unserialize({ brushTool: { size: 21 } });
    let err = null; try { desk.Unserialize({ version: FORMAT.desk.major + 1, brushTool: { size: 99 } }); } catch (e) { err = e; }
    assert(err instanceof FormatTooNewError);
    eq(desk.Serialize().brushTool.size, 21, "抛之前什么都没改");
  });
});

describe("timelapse 直通袋", () => {
  it("minor 更新的未知键在真写入器里带回、拍子写本版的；新开录 / 清除时清空", () => {
    const st = TimelapseDocState.restore(JSON.stringify({ v: 1, minor: 3, on: true, aspect: [1, 1], longEdge: 512, n: 4, motionSamples: 0, futureTimelapse: { k: 1 } }), null);
    eq(st.formatVerdict, "newer-minor"); eq(st.restoreIssue, null);
    const j = JSON.parse(st.serializeForSave(null, 512, 512).json);
    eq(J(j.futureTimelapse), J({ k: 1 })); eq(j.v, 1); eq(j.minor, FORMAT.timelapse.minor); eq(j.n, 4);
    st.clear(); eq(J(st.extra), "{}");
    assert(KNOWN_TIMELAPSE_FIELDS.includes("motionSamples"));
  });
  it("major 更新照旧进检疫区原样带回", () => {
    const raw = JSON.stringify({ v: 2, whatever: true });
    const st = TimelapseDocState.restore(raw, null);
    eq(st.restoreIssue, "too-new"); eq(st.serializeForSave(null, 1, 1).json, raw);
  });
});

// ── 笔架咽喉 ──
function memRack(items) {
  const m = new Map(items.map(([id, value]) => [id, { id, uat: 1, value }]));
  const writes = [];
  return {
    _m: m, _writes: writes,
    init: async () => {}, entries: () => [...m.values()],
    getItem: (id, def) => (m.has(id) ? m.get(id).value : typeof def === "function" ? def() : def),
    setItem: (id, value) => { writes.push(id); m.set(id, { id, uat: 2, value }); },
    deleteItem: (id) => { writes.push(`-${id}`); m.delete(id); },
    onChange: () => () => {}, flushLocal: async () => ({ ok: true }),
  };
}
describe("笔架咽喉（rack-format-guard）", () => {
  const futureMajor = { id: "b-new", name: "新", tool: "brush", version: FORMAT.brush.major + 1, alienShape: 1 };
  const futureMinor = { id: "b-minor", name: "次", tool: "brush", version: 1, minor: 4, alienField: "keep" };
  const old = { id: "b-old", name: "旧", tool: "brush" };
  it("读：major 更新的笔不出现；minor 更新的照常出现、未知字段在；无拍的老笔照常", () => {
    const g = guardRackFormat(memRack([["b-new", futureMajor], ["b-minor", futureMinor], ["b-old", old]]));
    const ids = g.entries().map((e) => e.id);
    eq(J(ids), J(["b-minor", "b-old"]));
    eq(g.getItem("b-new", "DEF"), "DEF", "getItem 对 major 更新的条目给默认值");
    eq(g.getItem("b-minor").alienField, "keep");
  });
  it("写：盖本版拍、未知字段原样；目标是 major 更新的条目 → 不写不删", () => {
    const inner = memRack([["b-new", futureMajor], ["b-minor", futureMinor]]);
    const g = guardRackFormat(inner);
    g.setItem("b-minor", { ...g.getItem("b-minor"), folder: "X" });   // 控制器的写法：整支浅拷贝
    const v = inner._m.get("b-minor").value;
    eq(v.alienField, "keep"); eq(v.folder, "X"); eq(v.version, FORMAT.brush.major); eq(v.minor, FORMAT.brush.minor);
    g.setItem("b-new", { id: "b-new", name: "还原出厂", tool: "brush" });
    g.deleteItem("b-new");
    eq(inner._m.get("b-new").value.alienShape, 1, "major 更新的条目原封不动");
    eq(J(inner._writes), J(["b-minor"]));
  });
  it(".meta：major 更新 → 读给默认、不写；纯函数改顺序时保住未知键", () => {
    const inner = memRack([[RACK_META_ID, { version: FORMAT.rackMeta.major + 1, folderOrder: ["A"], order: { A: ["x"] } }]]);
    const g = guardRackFormat(inner);
    eq(J(g.getItem(RACK_META_ID, () => ({ folderOrder: [], order: {} }))), J({ folderOrder: [], order: {} }));
    g.setItem(RACK_META_ID, { folderOrder: [], order: {} });
    eq(inner._m.get(RACK_META_ID).value.version, FORMAT.rackMeta.major + 1);
    const meta = { folderOrder: ["A"], order: { A: ["x"] }, version: 1, minor: 3, futureMeta: { pinned: ["x"] } };
    for (const out of [metaAppend(meta, "A", "y"), metaRemove(meta, "x"), metaMove(meta, "x", "B"), metaPrependBuiltins(meta, { A: ["d"] })]) {
      eq(J(out.futureMeta), J({ pinned: ["x"] }));
    }
  });
  it("reconcileWithRemote 缺席照样缺席（无库器官没有远端）", () => {
    const g = guardRackFormat(memRack([]));
    eq(g.reconcileWithRemote, undefined);
    const withRemote = guardRackFormat({ ...memRack([]), reconcileWithRemote: async () => ({ ok: true }) });
    eq(typeof withRemote.reconcileWithRemote, "function");
  });
});
