// 用 bfb9f08（v0.12.6 之后、format 2 之前 = format 1 最后一版写入器）真写两份 format 1 样本。
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureZipLoaded } from "./test/zip-node.mjs";
import { installDomParserShim } from "./test/xml-shim.mjs";
ensureZipLoaded(); installDomParserShim();
const { encodeDocToOra } = await import("./src/backend/ora.ts");
const { desk } = await import("./src/workbench-state.ts");
const { ORA_FORMAT_VERSION } = await import("./src/backend/ora-stack-xml.ts");
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const px = (w, h, paint) => { const d = new Uint8ClampedArray(w * h * 4); paint(d, w); return d; };
const red = px(4, 4, (d, w) => { for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.set([255, 0, 0, 255], (y * w + x) * 4); });
const blue = px(1, 1, (d) => d.set([0, 0, 255, 255], 0));
const leaf = (id, name, x, y, w, h, data) => ({ isGroup: false, id, name, visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false,
  bboxX: x, bboxY: y, bboxW: w, bboxH: h, getImageData: () => ({ data, width: w, height: h }) });
const doc = () => ({ width: 4, height: 4, activeId: 2, referenceLayerId: null, layers: [leaf(1, "底", 0, 0, 4, 4, red), leaf(2, "点", 3, 3, 1, 1, blue)] });
const PNG_STUB = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
const MP4_STUB = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 7, 7]);
const write = async (name, blob) => { const b = new Uint8Array(await blob.arrayBuffer()); writeFileSync(`${out}/${name}`, b); console.log(`  frozen: ${name} (${b.length} bytes)`); };
desk.reset(); desk.export.format = "jpg"; desk.export.bg = "#ffffff";
await write("plain.ora", await encodeDocToOra(doc(), { wroteWith: "v0.12.6-2026-08-30", desk: desk.Serialize() }));
desk.reset(); desk.refPanel.enabled = true; desk.refPanel.viewport = { tx: 7, ty: 8, scale: 2, rot: 0 };
const timelapse = { json: JSON.stringify({ v: 1, on: true, aspect: [16, 9], longEdge: 1080, n: 3, motionSamples: 0 }), mp4: MP4_STUB };
await write("reference-timelapse.ora", await encodeDocToOra(doc(), { wroteWith: "v0.12.6-2026-08-30", desk: desk.Serialize(), referenceImage: new Blob([PNG_STUB], { type: "image/png" }), timelapse }));
console.log("ORA_FORMAT_VERSION at this commit =", ORA_FORMAT_VERSION);
