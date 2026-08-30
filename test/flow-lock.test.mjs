// flow-lock 单飞道测试（案卷 20260830 §BUG D：boot 领养 × redirect 续办的 attach 交错根除）。
// created 2026-08-30 by Claude Fable 5.
import { describe, it, assert, eq } from "./runner.mjs";
import { createFlowLock } from "../src/flow-lock.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("flow-lock · attach/detach 流程互斥", () => {
  it("并发进入按序串行：后到的流程等前一个 settle 才跑", async () => {
    const lock = createFlowLock();
    const log = [];
    let releaseA;
    const gate = new Promise((r) => { releaseA = r; });
    const a = lock(async () => { log.push("A-in"); await gate; log.push("A-out"); });
    const b = lock(async () => { log.push("B"); });
    await tick();
    eq(log.join(","), "A-in", "B 必须还没进（A 未 settle）");
    releaseA();
    await Promise.all([a, b]);
    eq(log.join(","), "A-in,A-out,B");
  });
  it("前序流程抛错不断链：错误穿透给自己的调用方，后续照跑", async () => {
    const lock = createFlowLock();
    const boom = lock(async () => { throw new Error("boom"); });
    const after = lock(async () => "ok");
    let caught = null;
    await boom.catch((e) => { caught = e; });
    assert(caught && String(caught).includes("boom"), "错误原样穿透");
    eq(await after, "ok", "链没被前序失败卡死");
  });
  it("返回值穿透", async () => {
    const lock = createFlowLock();
    eq(await lock(async () => 42), 42);
  });
});
