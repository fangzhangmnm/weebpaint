// P5 器官测试：device-kv（无地降级纯内存）+ resume-slate（回执条：typed 三态/原子记录/播种/per-gallery）。
// created 2026-08-27 by Claude Fable 5. node 无 localStorage → device-kv 走内存层（这正是无地降级路径本身）。
import { describe, it, assert, eq } from "./runner.mjs";
import { deviceKvGet, deviceKvSet, deviceKvGetJson, deviceKvSetJson } from "../src/device-kv.ts";
import { readSlate, setOpened, setRestoreAttempt, seedSlateFromLegacy } from "../src/resume-slate.ts";

describe("device-kv · 无地降级（node 无 localStorage = Safari file:// 同路）", () => {
  it("读写 roundtrip（内存层）；null=删", () => {
    deviceKvSet("t:a", "v1");
    eq(deviceKvGet("t:a"), "v1");
    deviceKvSet("t:a", null);
    eq(deviceKvGet("t:a"), null);
  });
  it("JSON helpers：坏 JSON 落 fallback，不 throw", () => {
    deviceKvSetJson("t:j", { x: 1 });
    eq(deviceKvGetJson("t:j", null).x, 1);
    deviceKvSet("t:bad", "{oops");
    eq(deviceKvGetJson("t:bad", "FB"), "FB");
  });
});

describe("resume-slate · 回执条（三态 typed + 崩溃标记同记录）", () => {
  it("空条 = {opened:null, restoreAttempt:null}（首次语义）", () => {
    const s = readSlate("g-empty");
    eq(s.opened, null); eq(s.restoreAttempt, null);
  });
  it("setOpened(doc) → 开画成功即清崩溃标记（同记录原子；v0.10.9 语义并入）", () => {
    setRestoreAttempt("危画", "g-a");
    eq(readSlate("g-a").restoreAttempt, "危画");
    setOpened({ kind: "doc", path: "夏音" }, "g-a");
    const s = readSlate("g-a");
    eq(s.opened.path, "夏音");
    eq(s.restoreAttempt, null, "★ 拿住画 = 断路标记解除");
  });
  it("setOpened(gallery/null) **不**清标记（没拿住任何画，断路语义保留）", () => {
    setRestoreAttempt("危画", "g-b");
    setOpened({ kind: "gallery" }, "g-b");
    eq(readSlate("g-b").restoreAttempt, "危画");
  });
  it("per-gallery 隔离（兄妹各库各条）", () => {
    setOpened({ kind: "doc", path: "哥哥的画" }, "g-bro");
    setOpened({ kind: "doc", path: "妹妹的画" }, "g-sis");
    eq(readSlate("g-bro").opened.path, "哥哥的画");
    eq(readSlate("g-sis").opened.path, "妹妹的画");
  });
});

describe("resume-slate · legacy 播种（三态字符串 → union，幂等）", () => {
  it("null=首次 / \"\"=图库 / 名=画 三态映射", () => {
    seedSlateFromLegacy({ currentFile: null, restoreAttempt: null }, "g-s1");
    eq(readSlate("g-s1").opened, null);
    seedSlateFromLegacy({ currentFile: "", restoreAttempt: null }, "g-s2");
    eq(readSlate("g-s2").opened.kind, "gallery");
    seedSlateFromLegacy({ currentFile: "夏音", restoreAttempt: "夏音" }, "g-s3");
    eq(readSlate("g-s3").opened.path, "夏音");
    eq(readSlate("g-s3").restoreAttempt, "夏音", "崩溃标记一并迁（升级当口的断路语义不丢）");
  });
  it("★ 幂等：已有回执条（含播种过的）→ 绝不覆盖（回执条是唯一真相后 legacy 不再有发言权）", () => {
    seedSlateFromLegacy({ currentFile: "画A", restoreAttempt: null }, "g-s4");
    seedSlateFromLegacy({ currentFile: "画B", restoreAttempt: null }, "g-s4");
    eq(readSlate("g-s4").opened.path, "画A");
    setOpened({ kind: "gallery" }, "g-s4");
    seedSlateFromLegacy({ currentFile: "画C", restoreAttempt: null }, "g-s4");
    eq(readSlate("g-s4").opened.kind, "gallery", "用户后续动作不被 legacy 倒灌");
  });
});
