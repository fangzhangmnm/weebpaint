// 液化 golden 对拍（created 2026-09-19 by Claude Fable 5.1）：当前引擎 vs test/fixtures/liquify-golden.json（旧 CPU 引擎录）。
//   契约见 liquify-golden-cases.mjs 头。tol：CPU 自证 0；GPU 翻译 ±2/255。引擎与写靶经 runGoldenSuite 注入。
import { describe, it, assert } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { CASES, DOC_W, DOC_H, layerFill, leafSpecs, runCase, compareBytes, rectContains } from "./liquify-golden-cases.mjs";

const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/liquify-golden.json", import.meta.url), "utf8"));
const dec = (b64) => { const b = inflateRawSync(Buffer.from(b64, "base64")); return new Uint8ClampedArray(b.buffer, b.byteOffset, b.byteLength); };

/**
 * makeTargets(specs) → { targets, readAll(): Uint8ClampedArray[], dispose() }：targets 交给引擎，readAll 收回每叶整图。
 */
export function runGoldenSuite(label, makeEngine, makeTargets, tol) {
  describe(`liquify golden · ${label}（tol ${tol}/255，锚 = ${GOLDEN.engine} @ ${GOLDEN.recordedWith}）`, () => {
    it("用例表与 fixture 一一对应", () => {
      const names = CASES.map((c) => c.name);
      for (const n of names) assert(GOLDEN.cases[n], `fixture 缺用例 ${n}`);
      for (const n of Object.keys(GOLDEN.cases)) assert(names.includes(n), `fixture 有多余用例 ${n}`);
    });
    for (const c of CASES) {
      it(c.name, () => {
        const g = GOLDEN.cases[c.name];
        const rig = makeTargets(leafSpecs(c), c);
        const dirty = runCase(makeEngine(), rig.targets, c);
        const got = rig.readAll();
        rig.dispose?.();
        for (let li = 0; li < got.length; li++) {
          const want = dec(g.leaves[li]);
          const r = compareBytes(got[li], want, tol);
          assert(r.count === 0, `${c.name} 叶${li}: ${r.count} 字节超 tol（max |Δ|=${r.maxDiff}，首处 px(${((r.first / 4) | 0) % DOC_W},${(((r.first / 4) | 0) / DOC_W) | 0}) ch${r.first % 4}）`);
        }
        assert(rectContains(dirty, g.dirty), `${c.name}: dirty 少报 got=${JSON.stringify(dirty)} want⊇${JSON.stringify(g.dirty)}`);
      });
    }
  });
}

// ---- GPU 引擎（区域程序，SoftGl2Port 孪生跑）vs CPU 锚 ±2/255：组液化多叶共享一个 GlRoom（场纹理挂第一叶）----
const { LiquifyEngine } = await import("../src/plugins/liquify-engine.ts");
const { SoftGl2Port } = await import("../src/backend/soft-gl2-port.ts");
const { GlRoom } = await import("../src/backend/gl/gl-room.ts");
const { gpuLayer } = await import("./region-target.mjs");
const { makeSelection } = await import("./liquify-golden-cases.mjs");
function gpuTargets(specs, c) {
  const room = new GlRoom(new SoftGl2Port(), 64);
  const Ls = specs.map((spec, i) => { const L = gpuLayer(DOC_W, DOC_H, { room, leafId: i + 1, snapshot: true }); layerFill(L.buf, DOC_W, spec.rect, spec.seed, spec.tint); return L; });
  const sel = c.sel ? makeSelection() : null;
  const rss = Ls.map((L) => L.open(sel));
  return {
    targets: rss,
    readAll: () => { Ls.forEach((L, i) => L.close(rss[i])); return Ls.map((L) => L.buf); },
    dispose: () => { Ls.forEach((L) => L.dispose()); room.dispose(); },
  };
}
runGoldenSuite("GPU LiquifyEngine · SoftGl2Port", () => new LiquifyEngine(), gpuTargets, 2);
