// 冻结样本往返（持久化立宪的验收，照 CatsUp 契约 §7.9「完美」的定义）：
//   任何发布版写出的任何文件，当前版都能开且语义无损 —— 读样本 → 用当前写入器写 → 再读，语义逐字段一致，且写出来的是当前布局。
// created 2026-09-29 by Claude Fable 5.1
// 样本 = test/fixtures/format/（real/ = 当时代码真写的；synthetic/ = 按旧路由表拼的旧布局；README 逐个标明）。只增不改。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { ensureZipLoaded } from "./zip-node.mjs";
import { installDomParserShim } from "./xml-shim.mjs";

ensureZipLoaded();
installDomParserShim();
const { encodeDocToOra, decodeOraToPainting, paintingDataToEncodeDoc } = await import("../src/backend/ora.ts");
const { ORA_FORMAT_VERSION } = await import("../src/backend/ora-stack-xml.ts");
const { zipUnpack } = await import("../src/backend/zip.ts");
const { REFERENCES_DIR, REFERENCES_MANIFEST } = await import("../src/backend/format/layout.ts");
const { desk } = await import("../src/workbench-state.ts");
const { createDeck, decodeDeck, encodeDeck, mimeForName } = await import("@internal/reference-window/deck");

const FIX = new URL("./fixtures/format/", import.meta.url);
const load = (rel) => new Blob([readFileSync(new URL(rel, FIX))]);
const joined = (u8) => Array.from(u8).join(",");
const JPEG_STUB = "255,216,255,219,1,2,3,255,217", PNG_STUB = "137,80,78,71,9,9,9", MP4_STUB = "0,0,0,24,102,116,121,112,7,7";

// 壳层的读法（side-windows.applyLoadedReferences 同款）：目录 → 库解清单 → 牌组
async function readDeck(dec) {
  const d = await decodeDeck({ app: "weebpaint", knownKinds: ["image", "live"], getFile: (p) => { const b = dec._referenceFiles.get(p); return b ? new Blob([b], { type: mimeForName(p) }) : null; } });
  const deck = createDeck(); deck.restore(d); return deck;
}
// 当前写入器：像素 + desk + 参考目录 + timelapse 原样
async function rewrite(dec, deck) {
  desk.reset(); if (dec._editorState != null) desk.Unserialize(dec._editorState);
  const timelapse = dec._timelapseJson ? { json: dec._timelapseJson, mp4: dec._timelapseMp4 ?? new Uint8Array(0) } : null;
  return encodeDocToOra(paintingDataToEncodeDoc(dec.data), { wroteWith: "v-test", desk: desk.Serialize(), referenceFiles: encodeDeck(deck.snapshot(), { app: "weebpaint" }), timelapse });
}
const cardSummary = async (deck) => Promise.all(deck.cards().map(async (c) => ({ kind: c.kind, vp: c.vp, bytes: c.bytes ? joined(new Uint8Array(await c.bytes.arrayBuffer())) : null })));
const pixels = (dec) => dec.data.nodes.map((n) => n.pixels ? `${n.id}@${n.pixels.rect.x},${n.pixels.rect.y}:${joined(n.pixels.bytes)}` : `${n.id}:blank`);

/** 语义快照：往返前后必须逐字段一致的东西。 */
async function semantics(dec, deck) {
  return JSON.stringify({
    size: [dec.data.width, dec.data.height], active: dec.data.activeId, pixels: pixels(dec),
    cards: await cardSummary(deck), index: deck.index,
    refPanel: dec._editorState?.refPanel ?? null,
    timelapseJson: dec._timelapseJson ?? null, timelapseMp4: dec._timelapseMp4 ? joined(dec._timelapseMp4) : null,
    legacyState: dec._weebpaintState ?? null,
  });
}
const CURRENT_LAYOUT = (withRefs, withTimelapse) => [
  "mimetype", "stack.xml", "mergedimage.png", "data/layer1.png", "data/layer2.png",
  ...(withTimelapse ? [".weebpaint/timelapse.mp4", ".weebpaint/timelapse.json"] : []),
  ...withRefs, ".weebpaint/editor-state.json", "Thumbnails/thumbnail.png",
];

describe("冻结样本 · real/v2（v0.14.20 写入器真写的 format 2）", () => {
  it("references-live-timelapse：清单从 desk 搬成 manifest.json；三张卡、像素、录像、desk 全对；往返语义一致且写成 format 3 布局", async () => {
    const dec = await decodeOraToPainting(load("real/v2/references-live-timelapse.ora"));
    eq(dec._formatVersion, 2);
    assert(dec._layoutMigrated.includes(`editor-state.json#refPanels → ${REFERENCES_MANIFEST}`), dec._layoutMigrated.join("; "));
    eq([...dec._referenceFiles.keys()].sort().join("|"), `${REFERENCES_MANIFEST}|${REFERENCES_DIR}/r0.jpg|${REFERENCES_DIR}/r2.png`);
    const deck = await readDeck(dec);
    eq(deck.size, 3); eq(deck.index, 2);
    const cards = await cardSummary(deck);
    eq(cards.map((c) => c.kind).join(","), "image,live,image");
    eq(cards[0].bytes, JPEG_STUB); eq(cards[2].bytes, PNG_STUB); eq(cards[2].vp.rot, 0.25);
    eq(dec._editorState.refPanels, undefined, "desk 里的 refPanels 已搬走");
    eq(dec._editorState.refPanel.enabled, true); eq(dec._editorState.refPanel.position.left, 120);
    eq(joined(dec._timelapseMp4), MP4_STUB); eq(JSON.parse(dec._timelapseJson).n, 3);
    eq(pixels(dec).length, 2);

    const before = await semantics(dec, deck);
    const out = await rewrite(dec, deck);
    const dec2 = await decodeOraToPainting(out);
    eq(dec2._formatVersion, ORA_FORMAT_VERSION); eq(dec2._layoutMigrated.length, 0, "写出来的已经是当前布局");
    eq(await semantics(dec2, await readDeck(dec2)), before, "往返语义逐字段一致");
    eq(Object.keys(await zipUnpack(out)).join("|"), CURRENT_LAYOUT([REFERENCES_MANIFEST, `${REFERENCES_DIR}/r0.jpg`, `${REFERENCES_DIR}/r2.png`], true).join("|"));
    const m = JSON.parse(new TextDecoder().decode((await zipUnpack(out))[REFERENCES_MANIFEST]));
    eq(m.version, 1, "写出的清单带版本戳"); eq(JSON.parse(new TextDecoder().decode((await zipUnpack(out))[".weebpaint/editor-state.json"])).version, 1, "写出的 desk 带版本戳");
  });
  it("plain：没有参考没有录像的画，往返一致", async () => {
    const dec = await decodeOraToPainting(load("real/v2/plain.ora"));
    eq(dec._referenceFiles.size, 0);
    const deck = await readDeck(dec);
    const before = await semantics(dec, deck);
    const dec2 = await decodeOraToPainting(await rewrite(dec, deck));
    eq(await semantics(dec2, await readDeck(dec2)), before);
    eq(dec2._layoutMigrated.length, 0);
  });
});

describe("冻结样本 · synthetic（按旧路由表拼的历史布局）", () => {
  it("v0 webpaint-dirs：无 format 戳、非点 webpaint/、.webpaint/、根目录 mp4 —— 全部归一化；单张参考带老视口；旧轨 state.json 还在", async () => {
    const dec = await decodeOraToPainting(load("synthetic/v0/webpaint-dirs.ora"));
    eq(dec._formatVersion, 0);
    for (const m of [".webpaint/editor-state.json → .weebpaint/editor-state.json", "timelapse.mp4 → .weebpaint/timelapse.mp4"]) assert(dec._layoutMigrated.includes(m), dec._layoutMigrated.join("; "));
    assert(dec._layoutMigrated.some((x) => x.startsWith("webpaint/reference.png →")), dec._layoutMigrated.join("; "));
    const deck = await readDeck(dec);
    eq(deck.size, 1); eq(deck.current.kind, "image"); eq(JSON.stringify(deck.current.vp), JSON.stringify({ tx: 7, ty: 8, scale: 2, rot: 0 }));
    eq(joined(new Uint8Array(await deck.current.bytes.arrayBuffer())), PNG_STUB);
    eq(dec._weebpaintState.color, "#ff0000"); eq(JSON.parse(dec._timelapseJson).n, 0); eq(joined(dec._timelapseMp4), MP4_STUB);
    const before = await semantics(dec, deck);
    const dec2 = await decodeOraToPainting(await rewrite(dec, deck));
    eq(dec2._formatVersion, ORA_FORMAT_VERSION); eq(dec2._layoutMigrated.length, 0);
    // 旧轨 state.json 当前写入器不写（v0.8.21 停写）——往返语义里它会变成 null，其余必须一致
    const after = JSON.parse(await semantics(dec2, await readDeck(dec2))), expect = JSON.parse(before); expect.legacyState = null;
    eq(JSON.stringify(after), JSON.stringify(expect));
  });
  it("v1 weebpaint-nondot：非点 weebpaint/reference.png + 根目录 mp4；老视口是默认值 → 卡的 vp 留空", async () => {
    const dec = await decodeOraToPainting(load("synthetic/v1/weebpaint-nondot.ora"));
    eq(dec._formatVersion, 1);
    const deck = await readDeck(dec);
    eq(deck.size, 1); eq(deck.current.vp, null);
    eq(joined(new Uint8Array(await deck.current.bytes.arrayBuffer())), PNG_STUB);
    eq(joined(dec._timelapseMp4), MP4_STUB); eq(JSON.parse(dec._timelapseJson).n, 2);
    const before = await semantics(dec, deck);
    const dec2 = await decodeOraToPainting(await rewrite(dec, deck));
    eq(await semantics(dec2, await readDeck(dec2)), before);
    eq(Object.keys(await zipUnpack(await rewrite(dec, deck))).join("|"), CURRENT_LAYOUT([REFERENCES_MANIFEST, `${REFERENCES_DIR}/r0.png`], true).join("|"));
  });
  it("样本目录里的每个 .ora 都读得开（新加样本自动纳入）", async () => {
    const walk = (dir) => readdirSync(new URL(dir, FIX), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}${e.name}/`) : (e.name.endsWith(".ora") ? [`${dir}${e.name}`] : []));
    const all = walk("");
    assert(all.length >= 4, `样本数 ${all.length}`);
    for (const rel of all) { const dec = await decodeOraToPainting(load(rel)); assert(dec.data.nodes.length > 0, rel); }
  });
});
