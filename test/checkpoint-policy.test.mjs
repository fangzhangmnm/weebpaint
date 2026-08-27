// checkpoint（撤销更改 / revert）的**纯策略**测试。
// IDB 那层（storage.ts 的 get/put/deleteCheckpoint）node 测不到 → 进真机批；
// 但「何时封存 / key 怎么拼」这些真正容易搞错的判断是纯的，钉在这里。
import { describe, it, assert, eq } from "./runner.mjs";
import { shouldCapture, checkpointKey, checkpointAgeMinutes } from "../src/checkpoint-policy.ts";

describe("checkpoint · 何时封存（这组判断错了 revert 就废）", () => {
  it("打开一幅画的三个入口 → 封存", () => {
    assert(shouldCapture("gallery-open"), "从图库点开");
    assert(shouldCapture("new-doc"), "新建画布（revert = 回到空白）");
    assert(shouldCapture("save-as"), "另存为新身份");
  });

  it("★冷启动 / tab 重开 → **不**封存", () => {
    // 否则用户重开一次 tab，能回退到的「上次打开」就被刷成了现在，revert 变成空操作。
    assert(!shouldCapture("boot-restore"), "boot-restore 绝不封存");
  });

  it("★revert 自己 → **不**封存", () => {
    // 否则刚回滚掉的状态立刻把快照覆盖了 —— 只能 revert 一次，第二次回到的是回滚后的样子。
    assert(!shouldCapture("revert"), "revert 绝不封存");
  });
});

describe("checkpoint · key 结构", () => {
  it("key = <库身份全名>:<slot>，slot 默认 0", () => {
    eq(checkpointKey("画.ora"), "画.ora:0");
    eq(checkpointKey("画.ora", 0), "画.ora:0");
  });

  it("同一幅画的不同 slot 不撞（现在恒 0，但结构先留好）", () => {
    assert(checkpointKey("A.ora", 0) !== checkpointKey("A.ora", 1), "多档余地");
  });

  it("不同画不撞；带文件夹的全路径也各自独立", () => {
    assert(checkpointKey("A.ora") !== checkpointKey("B.ora"));
    assert(checkpointKey("夹/A.ora") !== checkpointKey("A.ora"), "同名不同夹 = 不同身份");
  });

  it("加密件用的也是**明文全名**（.ora，不带 .zip）→ 加解密来回切不会丢快照", () => {
    // 库对加密件在云端追加 .zip，但 app 侧身份恒是 X.ora；key 跟身份走。
    eq(checkpointKey("画.ora"), "画.ora:0");
  });
});

describe("checkpoint · 年龄显示", () => {
  it("向下不低于 1 分钟（不出现「回到 0 分钟前」这种废话）", () => {
    eq(checkpointAgeMinutes(1000, 1000), 1, "刚封存也显示 1");
    eq(checkpointAgeMinutes(0, 20_000), 1, "20 秒 → 1");
  });
  it("正常四舍五入", () => {
    eq(checkpointAgeMinutes(0, 5 * 60_000), 5);
    eq(checkpointAgeMinutes(0, 90 * 60_000), 90);
  });
});

// （S8 的 makeAutosaveGate 已随 v0.4.11「minIdleMs=30s 空闲触发」退役——节流职责并进 background-sync-jobs.register 的 minIdleMs，测试在 background-sync-jobs.test.mjs。）

// ═══ revert v2 ring（P4 2026-08-26，verdicts §2.7；added by Claude Fable 5）═══════════
import { planRingEviction, ringBudget, isNewSitting, SITTING_GAP_MS, RING_BUDGET_DESKTOP, RING_BUDGET_MOBILE, humanCheckpointTime } from "../src/checkpoint-policy.ts";

describe("revert v2 · 新触发点（这组判断错了 undo-revert/坐下锚就废）", () => {
  it("resume-first-input / pre-revert / local-open → 封存", () => {
    assert(shouldCapture("resume-first-input"), "坐下首笔之前");
    assert(shouldCapture("pre-revert"), "revert 前自动拍 = undo revert");
    assert(shouldCapture("local-open"), "file 家打开点快照");
  });
});

describe("revert v2 · 坐下判定（输入间隔 qualifier，不依赖 visibility）", () => {
  it("间隔 ≥ 阈值 = 新坐下；首笔（无历史）不算", () => {
    assert(!isNewSitting(null, 1000), "从没输入过 ≠ 新坐下（开画锚已封）");
    assert(!isNewSitting(1000, 1000 + SITTING_GAP_MS - 1), "差一毫秒不算");
    assert(isNewSitting(1000, 1000 + SITTING_GAP_MS), "到阈值算");
  });
});

describe("revert v2 · ring 淘汰（字节预算，最旧先走）", () => {
  const E = (id, at, size) => ({ id, at, size });
  it("预算内 → 不淘汰", () => {
    eq(planRingEviction([E("a", 1, 10), E("b", 2, 10)], 10, 100).length, 0);
  });
  it("超预算 → 按 at 旧→新淘汰到够放", () => {
    const out = planRingEviction([E("b", 2, 40), E("a", 1, 40)], 40, 100);
    eq(out.join(","), "a", "只淘最旧的一档就够了（40+40+40=120 → 淘 a 剩 80）");
  });
  it("★ 新档永不进淘汰名单：超预算巨档也要存（revert 保护 > 预算洁癖）", () => {
    const out = planRingEviction([E("a", 1, 10), E("b", 2, 10)], 999_999_999, 100);
    eq(out.sort().join(","), "a,b", "现存全淘、巨档照存——宁可 ring 只剩这一档");
  });
  it("预算常量 = 拍板值（桌面 64MB / 移动 32MB）", () => {
    eq(RING_BUDGET_DESKTOP, 64 * 1024 * 1024);
    eq(RING_BUDGET_MOBILE, 32 * 1024 * 1024);
    eq(ringBudget(true), RING_BUDGET_MOBILE);
    eq(ringBudget(false), RING_BUDGET_DESKTOP);
  });
});

describe("revert v2 · 人话时间（「回到 今天 14:02」）", () => {
  const at = new Date(2026, 7, 26, 14, 2).getTime();
  it("同天=today / 隔天=yesterday / 更早=date", () => {
    eq(humanCheckpointTime(at, new Date(2026, 7, 26, 20, 0).getTime()).day, "today");
    eq(humanCheckpointTime(at, new Date(2026, 7, 27, 1, 0).getTime()).day, "yesterday");
    eq(humanCheckpointTime(at, new Date(2026, 7, 30, 1, 0).getTime()).day, "date");
    eq(humanCheckpointTime(at, at).time, "14:02");
    eq(humanCheckpointTime(at, at).date, "8/26");
  });
});
