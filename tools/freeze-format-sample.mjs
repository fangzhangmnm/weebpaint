// 冻结样本工具（家族格式版本纪律，`../ai-docs/20261021-format-version-discipline.md` §3；WXHW tools/freeze-format-sample.mjs 同用途）。
//   created 2026-10-21 by Claude Opus 5.5
// 用**当前**写入器（src/backend/ora.ts encodeDocToOra + desk.Serialize + @internal/reference-window encodeDeck + timelapse json）写两份小画，
//   冻进 test/fixtures/format/real/<目录>/。规矩：只增不改——目录已存在就拒绝（要新样本 = 新目录）。
// 什么时候跑：任何一个子结构（stack.xml 布局 / desk / timelapse / 参考清单）的拍子变了、或换了写法，发版前跑一次，再在 README 登记一行。
// 用法：node tools/freeze-format-sample.mjs <目录名>      例：node tools/freeze-format-sample.mjs v3
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ensureZipLoaded } from "../test/zip-node.mjs";
import { installDomParserShim } from "../test/xml-shim.mjs";

const dirName = process.argv[2];
if (!dirName || !/^[A-Za-z0-9._-]+$/.test(dirName)) { console.error("usage: node tools/freeze-format-sample.mjs <dir-name>   (e.g. v3)"); process.exit(2); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "test/fixtures/format/real", dirName);
if (existsSync(outDir)) { console.error(`refusing: ${path.relative(root, outDir)} already exists (frozen samples are append-only — pick a new dir name)`); process.exit(1); }

ensureZipLoaded();
installDomParserShim();
const { encodeDocToOra } = await import("../src/backend/ora.ts");
const { desk } = await import("../src/workbench-state.ts");
const { WEEBPAINT_VERSION } = await import("../src/version.ts");
const { createDeck, encodeDeck } = await import("@internal/reference-window/deck");

// 4×4 的小画：左上 2×2 红、其余透明；第二层 1×1 蓝在 (3,3)。和 real/v2 同一张，往返测试能拿同一套断言比。
const px = (w, h, paint) => { const d = new Uint8ClampedArray(w * h * 4); paint(d, w); return d; };
const red = px(4, 4, (d, w) => { for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.set([255, 0, 0, 255], (y * w + x) * 4); });
const blue = px(1, 1, (d) => d.set([0, 0, 255, 255], 0));
const leaf = (id, name, x, y, w, h, data) => ({
  isGroup: false, id, name, visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false,
  bboxX: x, bboxY: y, bboxW: w, bboxH: h, getImageData: () => ({ data, width: w, height: h }),
});
const doc = () => ({ width: 4, height: 4, activeId: 2, referenceLayerId: null, layers: [leaf(1, "底", 0, 0, 4, 4, red), leaf(2, "点", 3, 3, 1, 1, blue)] });
const bytes = (arr) => new Uint8Array(arr);
const JPEG_STUB = bytes([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);   // 假字节：样本只验「原样带回」，不解码
const PNG_STUB = bytes([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
const MP4_STUB = bytes([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 7, 7]);

async function write(name, blob) {
  mkdirSync(outDir, { recursive: true });
  const buf = new Uint8Array(await blob.arrayBuffer());
  writeFileSync(path.join(outDir, name), buf);
  console.log(`  frozen: ${path.relative(root, path.join(outDir, name))} (${buf.length} bytes)`);
}

// plain：没有参考、没有录像；desk 改两个非默认值（导出格式 / 底色）
desk.reset();
desk.export.format = "jpg"; desk.export.bg = "#ffffff";
await write("plain.ora", await encodeDocToOra(doc(), { wroteWith: WEEBPAINT_VERSION, desk: desk.Serialize() }));

// references-live-timelapse：参考窗开着 + 三张卡（图片 / 画布小窗 / 图片，当前第三张）+ 录像 json（合法的 v1 形状）+ mp4 桩字节
desk.reset();
desk.refPanel.enabled = true;
desk.refPanel.position = { left: 120, top: 110, width: 240, height: 200 };
const deck = createDeck();
deck.add({ kind: "image", bytes: new Blob([JPEG_STUB], { type: "image/jpeg" }), vp: { tx: 1, ty: 2, scale: 3, rot: 0 } });
deck.add({ kind: "live", vp: { tx: 0, ty: 0, scale: 1, rot: 0 } });
deck.add({ kind: "image", bytes: new Blob([PNG_STUB], { type: "image/png" }), vp: { tx: 4, ty: 5, scale: 6, rot: 0.25 } });
deck.select(2);
const timelapse = { json: JSON.stringify({ v: 1, on: true, aspect: [16, 9], longEdge: 1080, n: 3, motionSamples: 0 }), mp4: MP4_STUB };
await write("references-live-timelapse.ora", await encodeDocToOra(doc(), { wroteWith: WEEBPAINT_VERSION, desk: desk.Serialize(), referenceFiles: encodeDeck(deck.snapshot(), { app: "weebpaint" }), timelapse }));
console.log(`writer = ${WEEBPAINT_VERSION}; now add a row to test/fixtures/format/README.md`);
