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
        const rig = makeTargets(leafSpecs(c));
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

// ---- 当前引擎（录锚时 = CPU；GPU 版落地后换成 RegionStroke 写靶 + tol 2）----
const { LiquifyEngine } = await import("../src/plugins/liquify-engine.ts");
function cpuTargets(specs) {
  const layers = specs.map((spec) => {
    const buf = new Uint8ClampedArray(DOC_W * DOC_H * 4);
    layerFill(buf, DOC_W, spec.rect, spec.seed, spec.tint);
    const { x, y, w, h } = spec.rect;
    return {
      docW: DOC_W, docH: DOC_H, bboxX: x, bboxY: y, bboxW: w, bboxH: h, buf,
      snapshotImageData() { const data = new Uint8ClampedArray(w * h * 4); for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y + yy) * DOC_W + x) * 4, ((y + yy) * DOC_W + x + w) * 4), yy * w * 4); return { bboxX: x, bboxY: y, bboxW: w, bboxH: h, imageData: { data, width: w, height: h } }; },
      putImageData(x0, y0, img) { for (let yy = 0; yy < img.height; yy++) { const dy = y0 + yy; if (dy < 0 || dy >= DOC_H) continue; buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), (dy * DOC_W + x0) * 4); } },
    };
  });
  return { targets: layers, readAll: () => layers.map((L) => L.buf) };
}
runGoldenSuite("CPU LiquifyEngine 自证", () => new LiquifyEngine(), cpuTargets, 0);
