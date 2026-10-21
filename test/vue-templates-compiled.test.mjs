// #89（2026-10-21，Claude Fable 5.1）：src/vue-templates.compiled.ts 必须是 src/vue-templates.ts 当前内容的编译结果（改了模板忘了 build = 红）、
//   编译产物不求值字符串、组件里不许长回 `template:`（运行时编译 = new Function = 被 CSP 拦、组件空白）。照 gallery test/templates-compiled.test.mjs。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, assert } from "./runner.mjs";
import { generate } from "../scripts/compile-vue-templates.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
function* walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) yield* walk(p); else if (f.endsWith(".ts")) yield p; } }

describe("vue-templates-compiled", () => {
  it("生成物和模板源一致（改模板后要 npm run build）", async () => {
    assert(read("src/vue-templates.compiled.ts") === (await generate()), "src/vue-templates.compiled.ts is stale — run npm run build");
  });
  it("编译产物里没有 new Function / eval / with", () => {
    assert(!/\bnew Function\b|\beval\s*\(|\bwith\s*\(/.test(read("src/vue-templates.compiled.ts")));
  });
  it("src 里没有运行时 Vue 模板（template: 只准在 src/vue-templates.ts 当 SSoT）", () => {
    const hits = [];
    for (const p of walk(fileURLToPath(new URL("src/", root)))) {   // 路径里有空格：fileURLToPath，别拿 pathname（%20）
      if (p.endsWith("/vue-templates.ts")) continue;
      readFileSync(p, "utf8").split("\n").forEach((l, i) => { if (/^\s*template:\s*[`'"]/.test(l)) hits.push(`${p}:${i + 1}`); });
    }
    assert(hits.length === 0, "runtime Vue templates (write render: VUE_RENDER.x, template in src/vue-templates.ts): " + hits.join(", "));
  });
});
