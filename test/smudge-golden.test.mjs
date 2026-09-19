// smudge golden 对拍（created 2026-09-18 by Claude Fable 5.1）：当前引擎 vs test/fixtures/smudge-golden.json（旧 CPU 引擎 v0.14.16 录）。
//   契约见 smudge-golden-cases.mjs 头。tol：CPU 精确 = 0；GPU 翻译（SoftGl2Port）= 2（/255）。
//   引擎/写靶通过 runGoldenSuite(label, makeEngine, makeTarget, tol) 注入——GPU 版加一个 suite 即可，表不动。
import { describe, it, assert } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { SmudgeEngine } from "../src/plugins/smudge-engine.ts";
import { CASES, buildImage, makeByteTarget, runCase, decodeBytes, compareBytes, rectContains } from "./smudge-golden-cases.mjs";

const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/smudge-golden.json", import.meta.url), "utf8"));

export function runGoldenSuite(label, makeEngine, makeTarget, tol) {
  describe(`smudge golden · ${label}（tol ${tol}/255，锚 = ${GOLDEN.engine} @ ${GOLDEN.recordedWith}）`, () => {
    it("用例表与 fixture 一一对应（少录 = 生成器没跑；多录 = 表删了名）", () => {
      const names = CASES.map((c) => c.name);
      for (const n of names) assert(GOLDEN.cases[n], `fixture 缺用例 ${n}`);
      for (const n of Object.keys(GOLDEN.cases)) assert(names.includes(n), `fixture 有多余用例 ${n}`);
    });
    for (const c of CASES) {
      it(c.name, () => {
        const g = GOLDEN.cases[c.name];
        const buf = buildImage();
        const target = makeTarget(buf);
        const dirty = runCase(makeEngine(), target, c);
        const got = target.readAll ? target.readAll() : buf;
        const want = decodeBytes(g.bytes);
        const r = compareBytes(got, want, tol);
        assert(r.count === 0, `${c.name}: ${r.count} 字节超 tol（max |Δ|=${r.maxDiff}，首处 index ${r.first} = px(${((r.first / 4) | 0) % GOLDEN.docW},${(((r.first / 4) | 0) / GOLDEN.docW) | 0}) ch${r.first % 4}）`);
        assert(rectContains(dirty, g.dirty), `${c.name}: dirty 少报 got=${JSON.stringify(dirty)} want⊇${JSON.stringify(g.dirty)}`);
      });
    }
  });
}

runGoldenSuite("CPU SmudgeEngine 自证", () => new SmudgeEngine(), (buf) => makeByteTarget(buf), 0);
