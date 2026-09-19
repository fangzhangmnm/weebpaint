// 液化 golden 生成器（created 2026-09-19 by Claude Fable 5.1）：用**当前 CPU** src/plugins/liquify-engine.ts 跑 CASES，写 test/fixtures/liquify-golden.json。
//   只在「录 golden」时手动跑（`node test/liquify-golden.gen.mjs`）；旧引擎删除后本脚本封存（同 smudge-golden.gen.mjs 的下场）。
import "./dom-shim-first.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { LiquifyEngine } from "../src/plugins/liquify-engine.ts";
import { WEEBPAINT_VERSION } from "../src/version.ts";
import { CASES, DOC_W, DOC_H, layerFill, leafSpecs, runCase } from "./liquify-golden-cases.mjs";

// CPU mock 层（= test/liquify-group.test.mjs 同款：整 doc 缓冲 + 内容 bbox + snapshotImageData/putImageData）
function mockLayer(docW, docH, spec) {
  const buf = new Uint8ClampedArray(docW * docH * 4);
  layerFill(buf, docW, spec.rect, spec.seed, spec.tint);
  const { x, y, w, h } = spec.rect;
  return {
    docW, docH, bboxX: x, bboxY: y, bboxW: w, bboxH: h, buf,
    snapshotImageData() {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let yy = 0; yy < h; yy++) data.set(buf.subarray(((y + yy) * docW + x) * 4, ((y + yy) * docW + x + w) * 4), yy * w * 4);
      return { bboxX: x, bboxY: y, bboxW: w, bboxH: h, imageData: { data, width: w, height: h } };
    },
    putImageData(x0, y0, img) {
      for (let yy = 0; yy < img.height; yy++) {
        const dy = y0 + yy; if (dy < 0 || dy >= docH) continue;
        buf.set(img.data.subarray(yy * img.width * 4, (yy + 1) * img.width * 4), (dy * docW + x0) * 4);
      }
    },
  };
}
const enc = (u8) => Buffer.from(deflateRawSync(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength))).toString("base64");

const out = { recordedWith: WEEBPAINT_VERSION, recordedAt: new Date().toISOString().slice(0, 10), engine: "src/plugins/liquify-engine.ts (CPU)", docW: DOC_W, docH: DOC_H, cases: {} };
const t0 = performance.now();
for (const c of CASES) {
  const layers = leafSpecs(c).map((spec) => mockLayer(DOC_W, DOC_H, spec));
  const befores = layers.map((L) => Uint8ClampedArray.from(L.buf));
  const dirty = runCase(new LiquifyEngine(), layers, c);
  const changed = layers.map((L, i) => { let n = 0; for (let k = 0; k < L.buf.length; k++) if (L.buf[k] !== befores[i][k]) n++; return n; });
  out.cases[c.name] = { dirty, changedBytes: changed, leaves: layers.map((L) => enc(L.buf)) };
  console.log(`${c.name.padEnd(24)} dirty=${JSON.stringify(dirty)} changedBytes=${JSON.stringify(changed)}`);
}
mkdirSync("test/fixtures", { recursive: true });
writeFileSync("test/fixtures/liquify-golden.json", JSON.stringify(out, null, 1) + "\n");
console.log(`wrote test/fixtures/liquify-golden.json (${CASES.length} cases, ${((performance.now() - t0) | 0)} ms)`);
