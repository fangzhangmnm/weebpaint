// 冻结样本生成器（持久化立宪，2026-09-29）。created 2026-09-29 by Claude Fable 5.1
//
// 规矩：样本一旦生成就冻结，只增不改；每发过一版格式就再生成一份新目录。格式 round-trip 测试
//   （test/format-samples.test.mjs）必须永远读得了这里的每个文件。
// 用法：node test/fixtures/format/gen.mjs            ← 只在**没有**对应目录时生成；已有的不会被覆盖
// ⚠ 2026-09-29 format 3 之后本脚本跑不了（它用 format 2 的 refEntryName / desk.refPanels）；样本已冻结，留档不删。
//
// 两类样本，README.md 里逐个标明：
//   real/      = 当时的 WeebPaint 代码（写入器）真写出来的字节；
//   synthetic/ = 按 ora.ts 读端兼容路由表**手工拼**的旧布局（本机没有真的历史文件；做法与 test/ora-references.test.mjs 同）。
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ensureZipLoaded } from "../../zip-node.mjs";
import { installDomParserShim } from "../../xml-shim.mjs";

ensureZipLoaded();
installDomParserShim();
const { encodeDocToOra, refEntryName } = await import("../../../src/backend/ora.ts");
const { zipPack, zipUnpack } = await import("../../../src/backend/zip.ts");
const { desk } = await import("../../../src/workbench-state.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const WROTE_WITH = "v0.14.20-2026-09-19";   // 生成样本时的 WeebPaint 版本（分支 wip/reference-window-lib，写入器 = v0.14.20 原样）

// 4×4 的小画：左上 2×2 红、其余透明；第二层 1×1 蓝在 (3,3)。像素往返要逐字节对得上。
const px = (w, h, paint) => { const d = new Uint8ClampedArray(w * h * 4); paint(d, w); return d; };
const red = px(4, 4, (d, w) => { for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) d.set([255, 0, 0, 255], (y * w + x) * 4); });
const blue = px(1, 1, (d) => d.set([0, 0, 255, 255], 0));
const leaf = (id, name, x, y, w, h, data) => ({
  isGroup: false, id, name, visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false,
  bboxX: x, bboxY: y, bboxW: w, bboxH: h, getImageData: () => ({ data, width: w, height: h }),
});
const doc = () => ({ width: 4, height: 4, activeId: 2, referenceLayerId: null, layers: [leaf(1, "底", 0, 0, 4, 4, red), leaf(2, "点", 3, 3, 1, 1, blue)] });

const bytes = (arr) => new Uint8Array(arr);
const JPEG_STUB = bytes([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3, 0xff, 0xd9]);   // 假的 jpeg 字节：样本只验「原样带回」，不解码
const PNG_STUB = bytes([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
const MP4_STUB = bytes([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 7, 7]);

function out(rel, blob) {
  const p = path.join(here, rel);
  if (existsSync(p)) { console.log(`  跳过（已冻结）: ${rel}`); return; }
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, blob);
  console.log(`  生成: ${rel} (${blob.length} 字节)`);
}

// ---- real/v2：v0.14.20 写入器真写出来的 format 2 ----
async function realV2() {
  desk.reset?.();
  desk.refPanel.enabled = true;
  desk.refPanel.position = { left: 120, top: 110, width: 240, height: 200 };
  desk.refPanels = { index: 2, items: [
    { kind: "image", src: refEntryName(0, "image/jpeg"), vp: { tx: 1, ty: 2, scale: 3, rot: 0 } },
    { kind: "live", vp: { tx: 0, ty: 0, scale: 1, rot: 0 } },
    { kind: "image", src: refEntryName(2, "image/png"), vp: { tx: 4, ty: 5, scale: 6, rot: 0.25 } },
  ] };
  const references = [new Blob([JPEG_STUB], { type: "image/jpeg" }), null, new Blob([PNG_STUB], { type: "image/png" })];
  const timelapse = { json: JSON.stringify({ v: 1, settings: { on: true }, n: 3 }), mp4: MP4_STUB };
  const full = await encodeDocToOra(doc(), { wroteWith: WROTE_WITH, desk: desk.Serialize(), references, timelapse });
  out("real/v2/references-live-timelapse.ora", new Uint8Array(await full.arrayBuffer()));

  desk.reset?.();
  const plain = await encodeDocToOra(doc(), { wroteWith: WROTE_WITH, desk: desk.Serialize() });
  out("real/v2/plain.ora", new Uint8Array(await plain.arrayBuffer()));
}

// ---- synthetic：旧布局（按 ora.ts 读端路由表拼）----
async function synthetic() {
  desk.reset?.();
  const base = await encodeDocToOra(doc(), { wroteWith: WROTE_WITH, desk: desk.Serialize() });
  const files = await zipUnpack(base);
  const entriesOf = (f) => Object.entries(f).map(([p, data]) => ({ path: p, data }));
  const dec = new TextDecoder(), enc = new TextEncoder();

  // format 0（无 weebpaint:format 戳）：非点 webpaint/ 时代——旧轨 state.json + 单张 reference.png + 根目录 timelapse.mp4 + .webpaint/ 点目录
  {
    const f = { ...files };
    delete f[".weebpaint/editor-state.json"];
    f["stack.xml"] = enc.encode(dec.decode(files["stack.xml"]).replace(/\s*weebpaint:format="\d+"/, ""));
    f["webpaint/state.json"] = enc.encode(JSON.stringify({ color: "#ff0000", activeId: 2 }));
    f["webpaint/reference.png"] = PNG_STUB;
    f["timelapse.mp4"] = MP4_STUB;
    f[".webpaint/timelapse.json"] = enc.encode(JSON.stringify({ v: 1, settings: { on: false }, n: 0 }));
    const d = JSON.parse(dec.decode(files[".weebpaint/editor-state.json"]));
    d.refPanel = { enabled: true, position: null, viewport: { tx: 7, ty: 8, scale: 2, rot: 0 } };
    f[".webpaint/editor-state.json"] = enc.encode(JSON.stringify(d));
    // Thumbnails 必须最后：重新排一下
    const es = entriesOf(f).filter((e) => e.path !== "Thumbnails/thumbnail.png");
    es.push({ path: "Thumbnails/thumbnail.png", data: f["Thumbnails/thumbnail.png"] });
    out("synthetic/v0/webpaint-dirs.ora", new Uint8Array(await (await zipPack(es)).arrayBuffer()));
  }
  // format 1：非点 weebpaint/ 时代——weebpaint/reference.png 单张 + 根目录 timelapse.mp4 + .weebpaint/ 点目录
  {
    const f = { ...files };
    f["stack.xml"] = enc.encode(dec.decode(files["stack.xml"]).replace(/weebpaint:format="\d+"/, 'weebpaint:format="1"'));
    f["weebpaint/reference.png"] = PNG_STUB;
    f["timelapse.mp4"] = MP4_STUB;
    f[".weebpaint/timelapse.json"] = enc.encode(JSON.stringify({ v: 1, settings: { on: true }, n: 2 }));
    const d = JSON.parse(dec.decode(files[".weebpaint/editor-state.json"]));
    d.refPanel = { enabled: true, position: null, viewport: { tx: 0, ty: 0, scale: 1, rot: 0 } };   // 默认视口 = 从没动过
    f[".weebpaint/editor-state.json"] = enc.encode(JSON.stringify(d));
    const es = entriesOf(f).filter((e) => e.path !== "Thumbnails/thumbnail.png");
    es.push({ path: "Thumbnails/thumbnail.png", data: f["Thumbnails/thumbnail.png"] });
    out("synthetic/v1/weebpaint-nondot.ora", new Uint8Array(await (await zipPack(es)).arrayBuffer()));
  }
}

console.log("[fixtures/format] 生成冻结样本…");
await realV2();
await synthetic();
console.log("[fixtures/format] 完成。");
