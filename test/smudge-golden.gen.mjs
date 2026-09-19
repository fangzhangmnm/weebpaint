// smudge golden 生成器（created 2026-09-18 by Claude Fable 5.1）：用**当前** src/plugins/smudge-engine.ts 跑 CASES，写 test/fixtures/smudge-golden.json。
//   只在「录 golden」时手动跑：`node test/smudge-golden.gen.mjs`。删旧 CPU 引擎之前录一次（2026-09-18，v0.14.16）；之后
//   fixture 就是锚，**不许**用新引擎重录来「让测试变绿」（那等于把翻译错误烤进锚）。重录必须在 commit message 里说明为什么。
import "./dom-shim-first.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { SmudgeEngine } from "../src/plugins/smudge-engine.ts";
import { WEEBPAINT_VERSION } from "../src/version.ts";
import { CASES, DOC_W, DOC_H, buildImage, makeByteTarget, runCase, encodeBytes } from "./smudge-golden-cases.mjs";

const out = { recordedWith: WEEBPAINT_VERSION, recordedAt: new Date().toISOString().slice(0, 10), engine: "src/plugins/smudge-engine.ts (CPU)", docW: DOC_W, docH: DOC_H, cases: {} };
const t0 = performance.now();
for (const c of CASES) {
  const buf = buildImage();
  const before = Uint8ClampedArray.from(buf);
  const target = makeByteTarget(buf);
  const dirty = runCase(new SmudgeEngine(), target, c);
  let changed = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] !== before[i]) changed++;
  out.cases[c.name] = { dirty, changedBytes: changed, bytes: encodeBytes(buf) };
  console.log(`${c.name.padEnd(26)} dirty=${JSON.stringify(dirty)} changedBytes=${changed}`);
}
mkdirSync("test/fixtures", { recursive: true });
writeFileSync("test/fixtures/smudge-golden.json", JSON.stringify(out, null, 1) + "\n");
console.log(`wrote test/fixtures/smudge-golden.json (${CASES.length} cases, ${((performance.now() - t0) | 0)} ms)`);
