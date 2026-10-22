// 「未来版本写的」合成样本（家族格式版本纪律 F-69 护栏 3 / 4，统筹 2026-10-21）。created 2026-10-21 by Claude Opus 5.5
// 用当前写入器写一张小画，再按「更新版本的写入器会写成什么样」改字节：
//   synthetic/future-minor/all-parts.ora —— 每个子结构的 minor 都比本版新，并各带一个本版不认识的键：
//       stack.xml weebpaint:format-minor="1"；desk minor 2 + 顶层 futureDesk；录像 json minor 1 + 顶层 futureTimelapse（不带 mp4，
//       让录像状态机走真写入器 toJson 而不是检疫原样）；参考清单 minor 9 + 顶层 futureDeck；外加一个 `.weebpaint/future-notes.json` entry。
//     测：打开 → 改一笔 → 存 → 再读，未知键和未知 entry 都还在，拍子写成本版的（test/format-samples.test.mjs「未来 minor」节 + F11 探针）。
//   synthetic/future-major/ora-4.ora —— stack.xml weebpaint:format="4"（整张 major 更新）：壳层拒开、无头 backend.open 抛。
//   synthetic/future-major/desk-2.ora —— ora 3.0.0、desk version 2（只有 desk 的 major 更新）：desk 按默认显示、原字节带回。
// 规矩同 freeze 工具：只增不改，文件已存在就拒绝。
// 用法：node test/fixtures/format/gen-future.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ensureZipLoaded } from "../../zip-node.mjs";
import { installDomParserShim } from "../../xml-shim.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
ensureZipLoaded();
installDomParserShim();
const { encodeDocToOra } = await import("../../../src/backend/ora.ts");
const { zipPack, zipUnpack } = await import("../../../src/backend/zip.ts");
const { desk } = await import("../../../src/workbench-state.ts");
const { TimelapseDocState } = await import("../../../src/backend/timelapse/timelapse-state.ts");
const { createDeck, encodeDeck } = await import("@internal/reference-window/deck");

//   synthetic/future-app/newer-app-same-format.ora —— 拍子全是本版（3.0.0 / desk 1.0.0），只有 wrote-with 是更新的 app：第二层「说一次 + 落盘前确认」的样本
//       （2026-10-21 审计第 6 条）。stack.xml 的 <layer> 上还放了一个本版不认识的属性 weebpaint:future-layer-flag——本版存一次它就丢，这正是第二层存在的理由。
//   synthetic/future-major/references-2.ora —— 参考清单 version 2（库只认到 1）：目录原样带着、这张画上不能再加参考、存回逐字节相同。
// 已存在的文件跳过不重写（只增不改）；新加的样本用 new 标出来。
const outputs = ["synthetic/future-minor/all-parts.ora", "synthetic/future-major/ora-4.ora", "synthetic/future-major/desk-2.ora",
  "synthetic/future-app/newer-app-same-format.ora", "synthetic/future-major/references-2.ora"];
const skip = new Set(outputs.filter((rel) => existsSync(path.join(here, rel))));
for (const rel of skip) console.log(`  exists, kept: ${rel}`);

const px = (w, h, paint) => { const d = new Uint8ClampedArray(w * h * 4); paint(d, w); return d; };
const red = px(4, 4, (d, w) => { for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.set([255, 0, 0, 255], (y * w + x) * 4); });
const blue = px(1, 1, (d) => d.set([0, 0, 255, 255], 0));
const leaf = (id, name, x, y, w, h, data) => ({
  isGroup: false, id, name, visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false,
  bboxX: x, bboxY: y, bboxW: w, bboxH: h, getImageData: () => ({ data, width: w, height: h }),
});
const doc = () => ({ width: 4, height: 4, activeId: 2, referenceLayerId: null, layers: [leaf(1, "底", 0, 0, 4, 4, red), leaf(2, "点", 3, 3, 1, 1, blue)] });
const enc = new TextEncoder(), dec = new TextDecoder();
const PNG_STUB = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);

/** 当前写入器写 → 解成 entry 表 → patch(files) 改 → 按原顺序重打（缩略图垫尾）。 */
async function forge(rel, opts, patch) {
  if (skip.has(rel)) return;
  const files = await zipUnpack(await encodeDocToOra(doc(), { wroteWith: "v9.9.9-future", ...opts }));
  patch(files);
  const order = Object.keys(files).filter((p) => p !== "Thumbnails/thumbnail.png");
  const entries = [...order, "Thumbnails/thumbnail.png"].filter((p) => p in files).map((p) => ({ path: p, data: files[p] }));
  const blob = await zipPack(entries, { lastModDate: new Date(Date.UTC(1980, 0, 1)) });
  const out = path.join(here, rel);
  mkdirSync(path.dirname(out), { recursive: true });
  const buf = new Uint8Array(await blob.arrayBuffer());
  writeFileSync(out, buf);
  console.log(`  forged: ${path.relative(root, out)} (${buf.length} bytes) — ${Object.keys(files).join(" ")}`);
}
const editJson = (files, p, fn) => { files[p] = enc.encode(JSON.stringify(fn(JSON.parse(dec.decode(files[p]))))); };
const editXml = (files, fn) => { files["stack.xml"] = enc.encode(fn(dec.decode(files["stack.xml"]))); };

// ① future-minor：每个子结构 minor 更新 + 各一个未知键 + 一个未知 entry
desk.reset();
desk.refPanel.enabled = true;
const deck = createDeck();
deck.add({ kind: "image", bytes: new Blob([PNG_STUB], { type: "image/png" }), vp: { tx: 1, ty: 2, scale: 3, rot: 0 } });
const tl = new TimelapseDocState();
tl.startRecording({ aspectW: 16, aspectH: 9, longEdge: 512 });
await forge(outputs[0], { desk: desk.Serialize(), referenceFiles: encodeDeck(deck.snapshot(), { app: "weebpaint" }), timelapse: { json: tl.toJson(0), mp4: new Uint8Array(0) } }, (files) => {
  editXml(files, (x) => x.replace(/weebpaint:format-minor="\d+"/, 'weebpaint:format-minor="1"'));
  editJson(files, ".weebpaint/editor-state.json", (j) => ({ ...j, minor: 2, futureDesk: { gizmo: true, level: 3 } }));
  editJson(files, ".weebpaint/timelapse.json", (j) => ({ ...j, minor: 1, futureTimelapse: "keep me" }));
  editJson(files, ".weebpaint/references/manifest.json", (j) => ({ ...j, minor: 9, futureDeck: ["a", "b"] }));
  files[".weebpaint/future-notes.json"] = enc.encode(JSON.stringify({ hello: "from a newer WeebPaint" }));
});

// ② future-major：整张 ora 的 major 更新
desk.reset();
await forge(outputs[1], { desk: desk.Serialize() }, (files) => {
  editXml(files, (x) => x.replace(/weebpaint:format="\d+"/, 'weebpaint:format="4"'));
});

// ③ future-major：只有 desk 的 major 更新（ora 仍是本版）
desk.reset();
await forge(outputs[2], { desk: desk.Serialize() }, (files) => {
  editJson(files, ".weebpaint/editor-state.json", (j) => ({ version: 2, minor: 0, patch: 0, panels: { reshaped: true }, brushTool: "now a string" }));
});
// ④ future-app：拍子全是本版，只有 wrote-with 更新；<layer> 上一个本版不认识的属性
desk.reset();
await forge(outputs[3], { desk: desk.Serialize() }, (files) => {
  editXml(files, (x) => x.replace('weebpaint:active="true"', 'weebpaint:active="true" weebpaint:future-layer-flag="glow"'));
});

// ⑤ future-major：只有参考清单的 major 更新（库 DeckManifestTooNewError）
desk.reset(); desk.refPanel.enabled = true;
const deck2 = createDeck();
deck2.add({ kind: "image", bytes: new Blob([PNG_STUB], { type: "image/png" }), vp: { tx: 1, ty: 2, scale: 3, rot: 0 } });
await forge(outputs[4], { desk: desk.Serialize(), referenceFiles: encodeDeck(deck2.snapshot(), { app: "weebpaint" }) }, (files) => {
  editJson(files, ".weebpaint/references/manifest.json", (j) => ({ ...j, version: 2, minor: 0, patch: 0, reshaped: true }));
});
console.log("now add rows to test/fixtures/format/README.md");
