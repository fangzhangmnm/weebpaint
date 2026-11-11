// 撤销出口的两条守卫（贴图主线 0-2）：翻的那段循环全仓只有一处；workpiece.ts 只拿撤销栈的类型。读仓里的源码，所以不进内核名单（行为测试在 hosted-steps.test.mjs）。
// created 2026-11-10 by Claude Opus 5.5
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

describe("撤销出口的守卫（0-2）", () => {
  it("守卫：翻的那段循环全仓只有一处（undo-stack.ts applyStep）；workpiece.ts 只拿撤销栈的类型", () => {
    const files = []; const walkDir = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walkDir(p); else if (/\.ts$/.test(n)) files.push(p); } }; walkDir("src");
    const hits = files.filter((f) => /\.swapRecord\(\s*e\.data\s*\)/.test(readFileSync(f, "utf8")));
    eq(hits.join(","), join("src", "backend", "workpiece", "undo-stack.ts"), "swapRecord 循环只在 undo-stack.ts");
    const us = readFileSync(join("src", "backend", "workpiece", "undo-stack.ts"), "utf8"), body = us.slice(us.indexOf("export function applyStep"), us.indexOf("export class UndoStack"));
    eq((us.match(/\.swapRecord\(/g) ?? []).length, (body.match(/\.swapRecord\(/g) ?? []).length, "undo-stack.ts 里的 swapRecord 都在 applyStep 里");
    const wp = readFileSync(join("src", "backend", "workpiece", "workpiece.ts"), "utf8");
    assert(!/^import\s+\{[^}]*\}\s+from\s+"\.\/undo-stack\.ts"/m.test(wp) && /^import type \{[^}]*\}\s+from\s+"\.\/undo-stack\.ts"/m.test(wp), "workpiece.ts 只 import type 撤销栈");
    assert(!/new UndoStack/.test(wp), "workpiece.ts 不建 UndoStack");
  });

});
