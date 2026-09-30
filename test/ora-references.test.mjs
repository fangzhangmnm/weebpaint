// 参考目录 × ora 契约（format 3；2026-09-29 持久化立宪）。
// created 2026-08-30 by Claude Fable 5；2026-09-29 按 format 3 重写（edited by Claude Fable 5.1）。
// 锁死：① 参考目录原样进出（codec 对清单零知识，manifest.json 在字节文件之前）② 目录里任何文件都原样带（不认识的种类也一样）
// ③ format=3 戳 ④ thumbnail 恒最后 ⑤ 非点 weebpaint/ 停写 ⑥ 目录外的路径响亮拒绝。
// 历史布局的读法不在这里——见 test/format-layout.test.mjs（归一化表）与 test/format-samples.test.mjs（冻结样本）。
import { describe, it, assert, eq } from "./runner.mjs";
import { ensureZipLoaded } from "./zip-node.mjs";
import { installDomParserShim } from "./xml-shim.mjs";

ensureZipLoaded();
installDomParserShim();

const { encodeDocToOra, decodeOraToPainting } = await import("../src/backend/ora.ts");
const { ORA_FORMAT_VERSION } = await import("../src/backend/ora-stack-xml.ts");
const { zipUnpack } = await import("../src/backend/zip.ts");
const { REFERENCES_DIR } = await import("../src/backend/format/layout.ts");

const mkDoc = () => ({
  width: 32, height: 32, activeId: 1, referenceLayerId: null,
  layers: [{
    isGroup: false, id: 1, name: "L", visible: true, opacity: 1, mode: "source-over",
    clippingMask: false, lockAlpha: false, bboxX: 0, bboxY: 0, bboxW: 0, bboxH: 0,
    getImageData: () => { throw new Error("empty leaf must not be sampled"); },
  }],
});
const bytesOf = (arr) => new Uint8Array(arr);
const joined = (u8) => Array.from(u8).join(",");
function nameOffset(bytes, name) {
  const pat = new TextEncoder().encode(name);
  outer: for (let i = 0; i + pat.length <= bytes.length; i++) {
    for (let j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
    return i;
  }
  return -1;
}
const D = REFERENCES_DIR;

describe("参考目录 · ora 契约（format 3）", () => {
  it("目录原样进出：manifest.json + 两张卡 + 一个不认识的种类；顺序 manifest 在前、全部在 thumbnail 之前；format=3", async () => {
    const referenceFiles = new Map([
      [`${D}/manifest.json`, new TextEncoder().encode('{"version":1,"index":2,"items":[]}')],
      [`${D}/r0.jpg`, bytesOf([1, 2, 3])],
      [`${D}/r1.holo`, bytesOf([4, 4])],        // 未来种类：codec 不认识也照带
      [`${D}/r2.png`, bytesOf([9, 8, 7, 6])],
    ]);
    const blob = await encodeDocToOra(mkDoc(), { wroteWith: "v-test", referenceFiles });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert(nameOffset(bytes, `${D}/manifest.json`) > 0 && nameOffset(bytes, `${D}/manifest.json`) < nameOffset(bytes, `${D}/r0.jpg`), "manifest 在字节文件之前");
    assert(nameOffset(bytes, `${D}/r2.png`) < nameOffset(bytes, "Thumbnails/thumbnail.png"), "references 必须排在 thumbnail 之前");

    const dec = await decodeOraToPainting(blob);
    eq(dec._formatVersion, ORA_FORMAT_VERSION, "format 戳 = 当前版本(3)");
    eq(dec._layoutMigrated.length, 0, "当前布局的文件读时零搬动");
    eq([...dec._referenceFiles.keys()].join("|"), `${D}/manifest.json|${D}/r0.jpg|${D}/r1.holo|${D}/r2.png`);
    eq(joined(dec._referenceFiles.get(`${D}/r0.jpg`)), "1,2,3");
    eq(joined(dec._referenceFiles.get(`${D}/r1.holo`)), "4,4", "不认识的种类字节保真");
    eq(joined(dec._referenceFiles.get(`${D}/r2.png`)), "9,8,7,6");
  });

  it("没有参考 → 空表（不是 undefined）；Blob 和 Uint8Array 都收", async () => {
    const dec0 = await decodeOraToPainting(await encodeDocToOra(mkDoc(), { wroteWith: "v-test" }));
    eq(dec0._referenceFiles.size, 0);
    const referenceFiles = new Map([[`${D}/r0.jpg`, new Blob([bytesOf([5, 5])])]]);
    const dec1 = await decodeOraToPainting(await encodeDocToOra(mkDoc(), { wroteWith: "v-test", referenceFiles }));
    eq(joined(dec1._referenceFiles.get(`${D}/r0.jpg`)), "5,5");
  });

  it("目录外的路径响亮拒绝（codec 只认 .weebpaint/references/ 下）", async () => {
    let msg = "";
    try { await encodeDocToOra(mkDoc(), { wroteWith: "v-test", referenceFiles: new Map([["weebpaint/reference.png", bytesOf([1])]]) }); }
    catch (e) { msg = String(e.message); }
    assert(msg.includes("outside"), `应当拒绝，实得：${msg}`);
  });

  it("非点 weebpaint/ 停写：新保存文件里一个非点 weebpaint/ entry 都没有", async () => {
    const referenceFiles = new Map([[`${D}/r0.jpg`, bytesOf([1])]]);
    const blob = await encodeDocToOra(mkDoc(), { wroteWith: "v-test", referenceFiles });
    const files = await zipUnpack(blob);
    for (const path of Object.keys(files)) assert(!path.startsWith("weebpaint/"), `非点 weebpaint/ 已停写，发现：${path}`);
  });
});
