// 图库密码验证器 sentinel（v0.4.11，真机 2.3）：密码学核心纯函数（node WebCrypto 真跑）。
import { describe, it, assert, eq } from "./runner.mjs";
const { createVerifierRecord, verifyRecord, createVerifier, clearVerifier, checkVerifier } = await import("../src/password-verifier.ts");
const { wireAppState } = await import("../src/app-state.ts");

describe("password-verifier · sentinel 核心", () => {
  it("往返：对的密码 ok / 错的密码拒绝（GCM tag 验证）", async () => {
    const rec = await createVerifierRecord("正确密码123");
    eq(rec.v, 1);
    assert(await verifyRecord(rec, "正确密码123"), "对的密码通过");
    assert(!(await verifyRecord(rec, "错的密码")), "错的密码拒绝");
    assert(!(await verifyRecord(rec, "")), "空密码拒绝");
  });
  it("记录不含明文/密码派生可逆物（只有 salt/iv/密文）", async () => {
    const rec = await createVerifierRecord("s3cret");
    eq(Object.keys(rec).sort().join(","), "ct,iv,salt,v");
    assert(!JSON.stringify(rec).includes("s3cret"), "序列化不含密码");
  });
  it("两次创建 salt/iv 不同（随机化）", async () => {
    const a = await createVerifierRecord("x"), b = await createVerifierRecord("x");
    assert(a.salt !== b.salt && a.iv !== b.iv);
    assert(await verifyRecord(a, "x") && await verifyRecord(b, "x"));
  });
  it("篡改密文 → 拒绝", async () => {
    const rec = await createVerifierRecord("pw");
    const bad = { ...rec, ct: rec.ct.slice(0, -4) + (rec.ct.endsWith("AAAA") ? "BBBB" : "AAAA") };
    assert(!(await verifyRecord(bad, "pw")));
  });
});

// 家族周账 F-191（2026-11-09，Claude Opus 5.5；同 CatsUp v0.18.27）：设完口令马上关页 / 刷新，验证器不许丢。
function fakeCol(flush) {
  const items = new Map(), calls = [];
  return { calls, getItem: (k, d) => (items.has(k) ? items.get(k) : d), setItem: (k, v) => { items.set(k, v); calls.push("set:" + k); }, flushLocal: () => { calls.push("flush"); return flush(); } };
}
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error("等不到"); await new Promise((r) => setTimeout(r, 5)); } }
describe("password-verifier · 设完马上落本机（F-191）", () => {
  it("createVerifier 先写验证器、再刷本机，刷完才回；clearVerifier 也立刻刷", async () => {
    let release = null;
    const col = fakeCol(() => new Promise((r) => { release = () => r({ ok: true }); }));
    wireAppState(col);
    try {
      let done = false;
      const p = createVerifier("pw-191").then(() => { done = true; });
      await until(() => col.calls.includes("flush"));
      await new Promise((r) => setTimeout(r, 20));
      assert(!done, "本机还没落完就不返回");
      assert(col.calls.indexOf("set:gallery-password-verifier") < col.calls.indexOf("flush"), "先写再刷");
      release(); await p;
      eq(await checkVerifier("pw-191"), "ok");
      clearVerifier();
      eq(col.calls.filter((c) => c === "flush").length, 2, "清掉也立刻刷");
      release();
    } finally { wireAppState(undefined); }
  });
  it("落不进本机：不抛（如实上报 warning），验证器仍在内存", async () => {
    const col = fakeCol(async () => ({ ok: false, error: new Error("quota") }));
    wireAppState(col);
    try {
      await createVerifier("pw-191b");
      eq(await checkVerifier("pw-191b"), "ok");
    } finally { wireAppState(undefined); }
  });
});
