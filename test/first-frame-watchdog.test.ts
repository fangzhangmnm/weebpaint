// 图库首帧看门狗（2026-08-31 案：watchFolder 首帧永不来 → loading 空白）。
// created 2026-08-31 by Claude Fable 5.
// 守：①到点未来帧 → onStall 一次带 folder/elapsed ②来帧解除 ③别夹的帧不算 ④cancel 解除 ⑤重 arm 重置计时 ⑥报过一次不再报。
import { test, eq, assert } from "./runner.mjs";
import { createFirstFrameWatchdog, type WatchdogTimers } from "../src/gallery/first-frame-watchdog.ts";

function fakeClock() {
  let now = 0, seq = 0;
  const due = new Map<number, { at: number; fn: () => void }>();
  const timers: WatchdogTimers = {
    set: (fn, ms) => { const id = ++seq; due.set(id, { at: now + ms, fn }); return id; },
    clear: (h) => { due.delete(h as number); },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at)) { if (t.at <= now) { due.delete(id); t.fn(); } }
  };
  return { timers, advance, now: () => now };
}
function harness() {
  const clock = fakeClock();
  const stalls: { folder: string; elapsedMs: number }[] = [];
  const wd = createFirstFrameWatchdog((i) => stalls.push(i), { timeoutMs: 1000, timers: clock.timers, now: clock.now });
  return { wd, stalls, advance: clock.advance };
}

test("到点未来帧 → onStall 恰好一次，带 folder + elapsed", () => {
  const { wd, stalls, advance } = harness();
  wd.arm("A");
  advance(999); eq(stalls.length, 0);
  advance(1); eq(stalls.length, 1); eq(stalls[0].folder, "A"); eq(stalls[0].elapsedMs, 1000);
  assert(!wd.isArmed(), "报过即解除");
  advance(5000); eq(stalls.length, 1, "不重复报");
});

test("来帧解除：同夹帧销账，之后到点不报", () => {
  const { wd, stalls, advance } = harness();
  wd.arm("A"); advance(500); wd.frame("A");
  assert(!wd.isArmed()); advance(2000); eq(stalls.length, 0);
});

test("别夹的帧不算（换夹途中旧帧不能替新夹销账）", () => {
  const { wd, stalls, advance } = harness();
  wd.arm("B"); wd.frame("A");
  assert(wd.isArmed(), "A 的帧不解除 B 的门"); advance(1000); eq(stalls.length, 1); eq(stalls[0].folder, "B");
});

test("cancel 解除；重 arm 重置计时", () => {
  const { wd, stalls, advance } = harness();
  wd.arm("A"); advance(900); wd.cancel(); advance(1000); eq(stalls.length, 0, "cancel 后不报");
  wd.arm("A"); advance(900); wd.arm("A"); advance(900); eq(stalls.length, 0, "重 arm 计时归零"); advance(100); eq(stalls.length, 1);
});
