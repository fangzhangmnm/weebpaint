// 多参考 × ora 契约（format 2；spec=ai-docs/20260830-reference-window-rework-spec.md §1）。
// created 2026-08-30 by Claude Fable 5.
// 锁死：① manifest 驱动 round-trip（含 live 占位对齐）② 旧文件单张兜底链（weebpaint/ 与 webpaint/）
// ③ 根 timelapse.mp4 兜底读 ④ format=2 戳 ⑤ thumbnail 恒最后 ⑥ 非点 weebpaint/ 停写。
import { describe, it, assert, eq } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
import { installDomParserShim } from "./xml-shim.mjs";

ensureZipLoaded();
installDomParserShim();

const { encodeDocToOra, decodeOraToPainting, refEntryName } = await import("../src/backend/ora.ts");
const { ORA_FORMAT_VERSION } = await import("../src/backend/ora-stack-xml.ts");
const { zipPack, zipUnpack } = await import("../src/backend/zip.ts");

const mkDoc = () => ({
  width: 32, height: 32, activeId: 1, referenceLayerId: null,
  layers: [{
    isGroup: false, id: 1, name: "L", visible: true, opacity: 1, mode: "source-over",
    clippingMask: false, lockAlpha: false, bboxX: 0, bboxY: 0, bboxW: 0, bboxH: 0,
    getImageData: () => { throw new Error("empty leaf must not be sampled"); },
  }],
});
const bytesOf = (arr) => new Uint8Array(arr);
const blobText = async (b) => Array.from(new Uint8Array(await b.arrayBuffer())).join(",");
function nameOffset(bytes, name) {
  const pat = new TextEncoder().encode(name);
  outer: for (let i = 0; i + pat.length <= bytes.length; i++) {
    for (let j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
    return i;
  }
  return -1;
}

describe("多参考 · ora 契约（format 2）", () => {
  it("manifest 驱动 round-trip：image/live/image 三页，src 索引与 blob 位置对齐；format=2", async () => {
    const b0 = new Blob([bytesOf([1, 2, 3])], { type: "image/jpeg" });
    const b2 = new Blob([bytesOf([9, 8, 7, 6])], { type: "image/png" });
    const desk = { refPanels: { index: 2, items: [
      { kind: "image", src: refEntryName(0, "image/jpeg"), vp: { tx: 1, ty: 2, scale: 3, rot: 0 } },
      { kind: "live", vp: { tx: 0, ty: 0, scale: 1, rot: 0 } },
      { kind: "image", src: refEntryName(2, "image/png"), vp: { tx: 4, ty: 5, scale: 6, rot: 0 } },
    ] } };
    const blob = await encodeDocToOra(mkDoc(), { wroteWith: "v-test", desk, references: [b0, null, b2] });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // 布局：references 在 thumbnail 之前；扩展名说真话；live 无 entry
    assert(nameOffset(bytes, ".weebpaint/references/r0.jpg") > 0, "r0.jpg 应在");
    assert(nameOffset(bytes, ".weebpaint/references/r2.png") > 0, "r2.png 应在");
    eq(nameOffset(bytes, ".weebpaint/references/r1"), -1, "live 占位不落 entry");
    assert(nameOffset(bytes, ".weebpaint/references/r2.png") < nameOffset(bytes, "Thumbnails/thumbnail.png"), "references 必须排在 thumbnail 之前");

    const dec = await decodeOraToPainting(blob);
    eq(dec._formatVersion, ORA_FORMAT_VERSION, "format 戳 = 当前版本(2)");
    eq(dec._references.length, 3, "manifest 三条全回");
    eq(dec._references[0].kind, "image");
    eq(dec._references[1].kind, "live");
    eq(dec._references[2].kind, "image");
    eq(await blobText(dec._references[0].blob), "1,2,3", "r0 字节保真");
    eq(await blobText(dec._references[2].blob), "9,8,7,6", "r2 字节保真");
    eq(dec._references[0].blob.type, "image/jpeg", "mime 从扩展名恢复");
  });

  it("manifest 指向缺失 entry → 该条跳过不炸；未知 kind → 丢条", async () => {
    const desk = { refPanels: { index: 0, items: [
      { kind: "image", src: ".weebpaint/references/r0.jpg" },        // entry 故意不写
      { kind: "hologram" },                                          // 未来 kind
      { kind: "live" },
    ] } };
    const blob = await encodeDocToOra(mkDoc(), { wroteWith: "v-test", desk, references: [] });
    const dec = await decodeOraToPainting(blob);
    eq(dec._references.length, 1, "只剩 live（缺图跳过、未知 kind 丢条）");
    eq(dec._references[0].kind, "live");
  });

  it("旧文件兜底链：无 manifest + weebpaint/reference.png → 单张；webpaint/ 老名同理", async () => {
    for (const legacyPath of ["weebpaint/reference.png", "webpaint/reference.png"]) {
      const base = await encodeDocToOra(mkDoc(), { wroteWith: "v-test" });
      const files = await zipUnpack(base);
      const entries = Object.entries(files).map(([path, data]) => ({ path, data }));
      entries.push({ path: legacyPath, data: bytesOf([5, 5, 5]) });
      const dec = await decodeOraToPainting(await zipPack(entries));
      eq(dec._references.length, 1, `${legacyPath} 兜底应回单张`);
      eq(dec._references[0].kind, "image");
      eq(await blobText(dec._references[0].blob), "5,5,5");
    }
  });

  it("timelapse.mp4 根目录旧文件兜底读", async () => {
    const base = await encodeDocToOra(mkDoc(), { wroteWith: "v-test" });
    const files = await zipUnpack(base);
    const entries = Object.entries(files).map(([path, data]) => ({ path, data }));
    entries.push({ path: "timelapse.mp4", data: bytesOf([7, 7]) });   // ≤format1 的根目录写法
    const dec = await decodeOraToPainting(await zipPack(entries));
    eq(Array.from(dec._timelapseMp4).join(","), "7,7", "根目录 mp4 必须读得到");
  });

  it("非点 weebpaint/ 停写：新保存文件里一个非点 weebpaint/ entry 都没有", async () => {
    const b0 = new Blob([bytesOf([1])], { type: "image/jpeg" });
    const desk = { refPanels: { index: 0, items: [{ kind: "image", src: refEntryName(0, "image/jpeg") }] } };
    const blob = await encodeDocToOra(mkDoc(), { wroteWith: "v-test", desk, references: [b0] });
    const files = await zipUnpack(blob);
    for (const path of Object.keys(files)) {
      assert(!path.startsWith("weebpaint/"), `非点 weebpaint/ 已停写，发现：${path}`);
    }
  });
});
