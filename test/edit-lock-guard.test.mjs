// 守卫（结构，不是行为）：解锁只许由人的手势发起。created 2026-11-08 by Claude Fable 5.1
//   家规（家族 CLAUDE.md「源文件原则上只读」）+ 库的契约（@internal/store README §2.2）：`files.unlock` 只在人点了钮之后调——代码替人解锁 = 这把锁白装。
//   src 里能碰到解锁的地方只有两处：那扇门（edit-lock-door.ts 的两个钮，经 app.ts 接到图库库的动词）和图库库自己的菜单。别处出现 = 红。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, assert, eq } from "./runner.mjs";

function* walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) yield* walk(p); else if (/\.(ts|mjs|js)$/.test(f)) yield p.replace(/\\/g, "/"); } }
const UNLOCK = [/\bfiles\s*\.\s*unlock\s*\(/, /\bunlockEdit\s*\(/, /\bsaveVersionThenUnlock\s*\(/, /(?<!function )\bunlockLocalFile\s*\(/, /\bd\.unlockLocal\s*\(/];   // 最后两个 = 硬盘上单个文件的「接着改」
const ALLOWED = new Set(["src/app.ts", "src/edit-lock-door.ts"]);   // 接线点（把图库库的两个动词递给那扇门）+ 那扇门自己（两个钮；下面单独钉它只经注入的函数解）

describe("守卫 · 解锁只在人的手势里", () => {
  it("src 里调解锁的地方只有 app.ts 的接线和那扇门的两个钮", () => {
    const hits = [];
    for (const p of walk("src")) {
      if (ALLOWED.has(p)) continue;
      readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (/^\s*(\/\/|\*|\/\*)/.test(l)) return; for (const re of UNLOCK) if (re.test(l.replace(/\/\/.*$/, ""))) hits.push(`${p}:${i + 1}: ${l.trim().slice(0, 120)}`); });
    }
    assert(hits.length === 0, "unlock called outside the door wiring:\n" + hits.join("\n"));
  });
  it("app.ts 里的解锁只出现在递给那扇门的那一段", () => {
    const src = readFileSync("src/app.ts", "utf8");
    const i = src.indexOf("initEditLockDoor({"), j = src.indexOf("});", i);
    assert(i > 0 && j > i, "initEditLockDoor wiring not found");
    const outside = src.slice(0, i) + src.slice(j);
    for (const re of UNLOCK) assert(!re.test(outside.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")), "unlock call outside initEditLockDoor({...}) in app.ts: " + re);
  });
  it("锁模块自己没有解锁的口；那扇门只经注入的两个函数解", () => {
    const lock = readFileSync("src/edit-lock.ts", "utf8"), door = readFileSync("src/edit-lock-door.ts", "utf8");
    const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, "")).join("\n");   // 不看注释
    assert(!/requireStore|@internal\/store|\.unlock\s*\(/.test(code(lock)), "edit-lock.ts must not reach the store or unlock anything");
    assert(!/requireStore|@internal\/store|files\s*\.\s*unlock/.test(code(door)), "edit-lock-door.ts must only use the injected unlock functions");
    eq((door.match(/d\.unlock\(|d\.saveVersionThenUnlock\(|d\.unlockLocal\(/g) ?? []).length, 3, "exactly the three buttons (gallery: two; local file: one)");
  });
  it("硬盘文件「算解着」的口（keepLocalFileUnlocked）只在两处：新画存成文件、解着锁时加密换了句柄", () => {
    const hits = [];
    for (const p of walk("src")) {
      if (p === "src/edit-lock.ts") continue;
      readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (/^\s*(\/\/|\*|\/\*)/.test(l) || /^import /.test(l)) return; if (/\bkeepLocalFileUnlocked\s*\(/.test(l.replace(/\/\/.*$/, ""))) hits.push(`${p}:${i + 1}`); });
    }
    eq(hits.length, 2, "keepLocalFileUnlocked call sites: " + hits.join(", "));
    assert(hits.every((h) => h.startsWith("src/session-state.ts:")), hits.join(", "));
  });
});
