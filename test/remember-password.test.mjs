// 「在这台设备上记住密码」政策（src/remember-password.ts）：开页先比 verifier、对不上 / 没 verifier 就忘；锁定即忘；
// 统一密码被换掉时只跟过得了 verifier 的那把（导入件的会话密码不顶掉记着的）；没勾不记；勾只用一次。created 2026-10-17 by Claude Opus 5.5
import { describe, it, eq, assert } from "./runner.mjs";
const { createPasswordKeeper } = await import("@internal/encryption");
const { setPassword, lock, getPassword } = await import("../src/crypto-state.ts");
const { wireRememberPassword, restoreRemembered, forgetRemembered, rememberedUntil, setRememberChoice } = await import("../src/remember-password.ts");

const DAY = 86400_000;
function memStore() { let rec; return { get: async () => rec, put: async (r) => { rec = r; }, delete: async () => { rec = undefined; }, peek: () => rec }; }
function setup({ verifierPw = "real pw" } = {}) {
  const clock = { t: 1_700_000_000_000 }; const now = () => clock.t;
  const store = memStore();
  const keeper = createPasswordKeeper({ dbName: "test", store, now });
  const v = { pw: verifierPw };
  const remembered = [], errors = [];
  lock();
  wireRememberPassword({
    keeper: () => keeper, now,
    hasVerifier: () => v.pw != null,
    checkVerifier: async (pw) => (v.pw == null ? "none" : pw === v.pw ? "ok" : "bad"),
    setPassword: (pw) => setPassword(pw),
    onError: (e) => errors.push(e),
    onRemembered: (until) => remembered.push(until),
  });
  return { clock, store, keeper, v, remembered, errors };
}
const until = async (fn, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return false; };
const tick = () => new Promise((r) => setTimeout(r, 30));

describe("remember-password · 开页", () => {
  it("没记 → none", async () => { setup(); eq(await restoreRemembered(), "none"); eq(getPassword(null), null); });
  it("记着且过得了 verifier → 解锁、记到哪天可读", async () => {
    const s = setup(); await s.keeper.remember("real pw");
    eq(await restoreRemembered(), "unlocked"); eq(getPassword(null), "real pw"); eq(rememberedUntil(), s.clock.t + 30 * DAY);
  });
  it("记着的过不了 verifier（别的设备改过）→ stale、记录删掉、仍锁着", async () => {
    const s = setup({ verifierPw: "new elsewhere" }); await s.keeper.remember("old");
    eq(await restoreRemembered(), "stale"); eq(getPassword(null), null); eq(s.store.peek(), undefined);
  });
  it("记着却没 verifier（重置过）→ none、记录删掉", async () => {
    const s = setup({ verifierPw: null }); await s.keeper.remember("x");
    eq(await restoreRemembered(), "none"); eq(s.store.peek(), undefined); eq(getPassword(null), null);
  });
});

describe("remember-password · 跟着统一密码走", () => {
  it("勾了 → 下一次统一密码落内存时记住（只用一次）", async () => {
    const s = setup();
    setRememberChoice(true); setPassword("real pw");
    assert(await until(async () => (await s.keeper.recall()) === "real pw"), "remembered");
    eq(s.remembered.length, 1);
    lock(); await forgetRemembered();
    setPassword("real pw"); await tick();
    eq(s.store.peek(), undefined, "勾只用一次：再设一次不会自己记");
  });
  it("没勾 → 不记", async () => { const s = setup(); setPassword("real pw"); await tick(); eq(s.store.peek(), undefined); eq(rememberedUntil(), null); });
  it("锁定 = 忘；也清掉悬着的勾", async () => {
    const s = setup(); setRememberChoice(true); setPassword("real pw");
    await until(async () => rememberedUntil() != null);
    lock(); await forgetRemembered();
    eq(s.store.peek(), undefined); eq(rememberedUntil(), null);
    setRememberChoice(true); lock(); setPassword("real pw"); await tick();
    eq(s.store.peek(), undefined, "锁定清掉了悬着的勾");
  });
  it("改密码（verifier 先换）→ 记新的，过期日不变", async () => {
    const s = setup(); setRememberChoice(true); setPassword("real pw");
    await until(async () => rememberedUntil() != null);
    const u0 = rememberedUntil();
    s.clock.t += 5 * DAY; s.v.pw = "changed"; setPassword("changed");
    assert(await until(async () => (await s.keeper.recall()) === "changed"), "follows the verified new password");
    eq(rememberedUntil(), u0);
  });
  it("会话里换成一把过不了 verifier 的（导入件）→ 不跟，记着的那把留着", async () => {
    const s = setup(); setRememberChoice(true); setPassword("real pw");
    await until(async () => rememberedUntil() != null);
    setPassword("imported file pw"); await tick(); await tick();
    eq(await s.keeper.recall(), "real pw"); eq(s.errors.length, 0);
  });
});
