// 图库换密码编排（src/gallery/change-password.ts）。created 2026-09-09 by Claude Fable 5.1
import { describe, it } from "./runner.mjs";
import assert from "node:assert/strict";
import { runChangePassword, REKEY_OK } from "../src/gallery/change-password.ts";

function harness(statuses, { throwOn = [] } = {}) {
  const log = []; const perName = new Map();
  const deps = {
    targets: Object.keys(statuses), oldPassword: "old", newPassword: "new",
    rekey: async (n, pw) => { log.push(["rekey", n, pw]); if (throwOn.includes(n)) throw new Error("boom"); return { status: statuses[n] }; },
    rememberFilePassword: (n, pw) => { log.push(["remember", n, pw]); perName.set(n, pw); },
    forgetFilePassword: (n) => { log.push(["forget", n]); perName.delete(n); },
    commitNewPassword: async (pw) => { log.push(["commit", pw]); },
    onProgress: () => {}, onError: (n, e) => log.push(["error", n, String(e && e.message)]),
  };
  return { deps, log, perName };
}

describe("change-password · 编排", () => {
  it("全部成功：先逐件登记旧钥 → 提交新密码 → 逐件 rekey(新钥) → 忘掉登记；moved 全员、kept 空", async () => {
    const { deps, log, perName } = harness({ "a.ora": "swapped", "b.ora": "cloud-deferred", "c.ora": "conflict" });
    const r = await runChangePassword(deps);
    assert.deepEqual(r.moved, ["a.ora", "b.ora", "c.ora"]); assert.deepEqual(r.kept, []);
    const idx = (k) => log.findIndex((e) => e[0] === k);
    assert.ok(idx("remember") < idx("commit") && idx("commit") < idx("rekey"), "顺序：登记旧钥 → 提交 → rekey");
    assert.ok(log.filter((e) => e[0] === "rekey").every((e) => e[2] === "new"), "rekey 用新钥");
    assert.equal(log.filter((e) => e[0] === "commit").length, 1, "提交一次");
    assert.equal(perName.size, 0, "成功件的旧钥登记全忘掉");
  });
  it("混合：offline / no-local / locked / 抛 → kept 且旧钥登记保留；成功件照常", async () => {
    const { deps, log, perName } = harness({ "a.ora": "swapped", "b.ora": "offline", "c.ora": "no-local", "d.ora": "locked", "e.ora": "swapped" }, { throwOn: ["e.ora"] });
    const r = await runChangePassword(deps);
    assert.deepEqual(r.moved, ["a.ora"]);
    assert.deepEqual(r.kept.map((k) => `${k.name}:${k.status}`), ["b.ora:offline", "c.ora:no-local", "d.ora:locked", "e.ora:error"]);
    assert.deepEqual([...perName.keys()].sort(), ["b.ora", "c.ora", "d.ora", "e.ora"], "失败件仍钉着旧钥（打开时 per-name 兜住）");
    assert.equal(log.filter((e) => e[0] === "error").length, 1, "抛的那件走 onError");
  });
  it("新旧相同 → 什么都不做（不提交、不 rekey）", async () => {
    const { deps, log } = harness({ "a.ora": "swapped" }); deps.newPassword = "old";
    const r = await runChangePassword(deps);
    assert.deepEqual(r, { moved: [], kept: [] }); assert.equal(log.length, 0);
  });
  it("没有目标：仍提交新密码（密码本身换了），moved/kept 空", async () => {
    const { deps, log } = harness({});
    const r = await runChangePassword(deps);
    assert.deepEqual(r, { moved: [], kept: [] }); assert.deepEqual(log, [["commit", "new"]]);
  });
  it("空新密码 → 抛（调用方 bug）；REKEY_OK 恰是三个「本地已换」状态", async () => {
    const { deps } = harness({}); deps.newPassword = "";
    await assert.rejects(() => runChangePassword(deps));
    assert.deepEqual([...REKEY_OK].sort(), ["cloud-deferred", "conflict", "swapped"]);
  });
});
