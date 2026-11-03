// store 2.2.2 改名面（src/store-ui.ts makeResolveRenameOld；家族工单 B2，Fable 2026-11-03 裁定「接」）。created 2026-11-03 by Claude Opus 5.5
//   ① 面的形状：三个选项（搬走旧的 / 留着旧的 / 取消），zh / en / ja 和 @internal/gallery 0.8.10 的 rn.* 逐字一样，没有第四个、没有删除；
//   ② 人没点就不回答：一直挂着；共用的同步门被别的流程从外面收掉（null）= 不是人点的 → 重新摆出来；
//   ③ 库这一层：回调一直没被人回答的时候，改名一个字节不动（本机还叫旧名、云端旧的原样、回收站空）。
import { readFileSync } from "node:fs";
import { describe, it, eq, assert } from "./runner.mjs";
import { createStore } from "@internal/store";
import { createMockProvider, createMockEncryption, createMockLocal } from "@internal/store/testing";
const { makeResolveRenameOld, storeUI } = await import("../src/store-ui.ts");
const { S } = await import("../src/i18n/strings.ts");
const { t } = await import("../src/i18n/index.ts");
const { DOC_KINDS } = await import("../src/identifiers.ts");

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const PENDING = Symbol("pending");
const settledWithin = (p, ms = 60) => Promise.race([p, tick(ms).then(() => PENDING)]);
/** 假的同步门：记下每次摆出来的面；answer(v) 代替「人点了 v」或「外面收了门（null）」。 */
function fakeGate() {
  const opened = []; let resolveCurrent = null;
  const gate = (opts) => new Promise((res) => { opened.push(opts); resolveCurrent = res; });
  return { gate, opened, answer: (v) => { const r = resolveCurrent; resolveCurrent = null; r?.(v); } };
}
const CTX = { oldName: "猫.ora", newName: "狗.ora", reason: "unknown-lineage" };

describe("store-ui · 改名面（resolveRenameOld）", () => {
  it("正式装配接上了（storeUI.resolveRenameOld 存在）", () => { eq(typeof storeUI.resolveRenameOld, "function"); });
  it("① 三个选项：搬走旧的（进回收站）/ 留着旧的 / 取消——没有第四个、没有删除；去扩展名显示", async () => {
    const g = fakeGate(); const p = makeResolveRenameOld(g.gate)(CTX);
    await tick();
    eq(g.opened.length, 1);
    const o = g.opened[0];
    eq(o.actions.map((a) => a.value).join(","), "trash,keep,cancel");
    assert(o.title.includes("猫") && !o.title.includes(".ora"), "标题用去扩展名的旧名：" + o.title);
    assert(o.message.includes("猫") && o.message.includes("狗"), "正文提到新旧两个名字");
    g.answer("cancel"); eq(await p, "cancel");
  });
  it("① 原因分两句：diverged（别的设备改过）/ unknown-lineage（说不清从哪一版改来）", async () => {
    for (const [reason, key] of [["diverged", "rn.body.diverged"], ["unknown-lineage", "rn.body.unknown"]]) {
      const g = fakeGate(); const p = makeResolveRenameOld(g.gate)({ ...CTX, reason }); await tick();
      eq(g.opened[0].message, t(key, { from: "猫", to: "狗" }), `${reason} → ${key}`);
      eq(g.opened[0].note, t("rn.note"));
      g.answer("keep"); eq(await p, "keep");
    }
  });
  it("① zh / en / ja 文案和 @internal/gallery 0.8.10 的 rn.* 逐字一样（照抄，不另写一套说法）", () => {
    const g = readFileSync("node_modules/@internal/gallery/src/core/text.ts", "utf8");
    for (const k of ["rn.title", "rn.body.diverged", "rn.body.unknown", "rn.note", "rn.act.trash", "rn.act.keep"]) {
      const line = g.split("\n").find((l) => l.trimStart().startsWith(`"${k}":`));
      assert(line, `gallery has ${k}`);
      for (const lang of ["zh", "en", "ja"]) {
        const m = new RegExp(`${lang}: "((?:[^"\\\\]|\\\\.)*)"`).exec(line);
        eq(S[k][lang], m && m[1], `${k}.${lang}`);
      }
    }
  });
  it("② 没人点 → 一直挂着（不超时、不默认回答）", async () => {
    const g = fakeGate(); const p = makeResolveRenameOld(g.gate)(CTX);
    eq(await settledWithin(p, 120), PENDING, "没人点就不回答");
    g.answer("keep"); eq(await p, "keep");
  });
  it("② 门被外面收了（settleSyncGate(null)，不是人点的）→ 重新摆出来、仍不回答；人点了才回答", async () => {
    const g = fakeGate(); const p = makeResolveRenameOld(g.gate)(CTX);
    await tick(); g.answer(null); await tick();
    eq(g.opened.length, 2, "面重新摆了一次");
    eq(await settledWithin(p), PENDING, "null 不当「取消」替人答");
    g.answer("trash"); eq(await p, "trash");
  });
});

// ③ 库这一层：照 internal-store test/open-heal-rename-ask.test.ts「本机 etag 记录丢了 + 脏 → unknown-lineage」搭状态
const enc = (s) => new TextEncoder().encode(s);
const kvRaw = () => { const m = new Map(); return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), remove: (k) => m.delete(k), keys: () => [...m.keys()] }; };
async function asStr(x) { if (x == null) return null; if (x instanceof Blob) return x.text(); return new TextDecoder().decode(x instanceof Uint8Array ? x : new Uint8Array(x)); }

describe("store-ui · 改名面 × 库：回调没被人回答时库不动旧的", () => {
  it("③ unknown-lineage：问了 → 人一直没点 → 本机还叫旧名、没有新名、云端只有旧的且原样、回收站空；人点「取消」→ 不改名", async () => {
    const provider = createMockProvider(); const local = createMockLocal(); const kv = kvRaw();
    const g = fakeGate(); const asks = [];
    const resolveRenameOld = makeResolveRenameOld(g.gate);
    const ui = { busy: (_l, fn) => fn(), resolveConflict: async () => "cancel", reportError: () => {}, resolveRenameOld: async (c) => { asks.push(c.reason); return resolveRenameOld(c); } };
    const page = () => createStore({ docKinds: DOC_KINDS, reconcilePolicy: "app-driven", encryption: createMockEncryption(), persistence: "none", appId: "wp", provider, ui, validateAdopt: () => true, kv, local, isOnline: () => true, signedIn: () => true, skipMigration: true });
    const cloudFiles = () => provider._dump().filter((i) => !i.isFolder && !/\.trash\//.test(i.path)).map((i) => i.path).sort();
    const cloudTrash = () => provider._dump().filter((i) => !i.isFolder && /\.trash\//.test(i.path)).length;
    const cloudText = async (name) => { const it = provider._dump().find((i) => i.path?.endsWith(name)); return it ? asStr(await provider.download(it.ref ?? it.id)) : null; };

    const s1 = page(); const f1 = s1.file("猫.ora", { mode: "existing" });
    eq((await f1.save(enc("V1"), { tryPush: true })).pushed, true, "V1 推上去");
    await f1.save(enc("V2"), { tryPush: false });   // 本机脏
    await s1.dispose();
    for (const k of kv.keys()) if (/etag/.test(k)) kv.remove(k);   // 这台说不清自己从哪一版改来

    const s2 = page();
    const moving = s2.file("猫.ora", { mode: "existing" }).tryMove("狗.ora");
    await tick(150);
    eq(asks.join(), "unknown-lineage", "库问了一次");
    eq(await settledWithin(moving, 120), PENDING, "人没点 → 改名还在等");
    assert(await local.exists("猫.ora"), "本机还叫旧名"); assert(!(await local.exists("狗.ora")), "本机没有新名");
    eq(JSON.stringify(cloudFiles()), '["猫.ora"]', "云端只有旧的"); eq(await cloudText("猫.ora"), "V1", "云端旧的原样"); eq(cloudTrash(), 0, "回收站空");

    g.answer("cancel");
    const r = await moving;
    eq(r.ok, false, "取消 = 不改名"); eq(r.reason, "cancelled");
    assert(await local.exists("猫.ora"), "取消后本机还叫旧名"); eq(JSON.stringify(cloudFiles()), '["猫.ora"]', "取消后云端没动");
    await s2.dispose();
  });
});
