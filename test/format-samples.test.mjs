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
const { FORMAT, judge, FormatTooNewError } = await import("../src/backend/format/migrate.ts");
const { TimelapseDocState } = await import("../src/backend/timelapse/timelapse-state.ts");
const { WeebPaintBackend } = await import("../src/backend/weebpaint-backend.ts");

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

describe("冻结样本 · real/v3（v0.14.44 写入器真写的 format 3；tools/freeze-format-sample.mjs，2026-10-21 Opus 5.5 冻）", () => {
  it("references-live-timelapse：不用归一化；三张卡、像素、录像、desk 全对；往返语义一致、布局不变", async () => {
    const dec = await decodeOraToPainting(load("real/v3/references-live-timelapse.ora"));
    eq(dec._formatVersion, 3); eq(dec._layoutMigrated.length, 0, "format 3 就是当前布局");
    const deck = await readDeck(dec);
    eq(deck.size, 3); eq(deck.index, 2);
    const cards = await cardSummary(deck);
    eq(cards.map((c) => c.kind).join(","), "image,live,image");
    eq(cards[0].bytes, JPEG_STUB); eq(cards[2].bytes, PNG_STUB); eq(cards[2].vp.rot, 0.25);
    eq(dec._editorState.version, 1); eq(dec._editorState.refPanel.enabled, true); eq(dec._editorState.refPanel.position.left, 120);
    eq(joined(dec._timelapseMp4), MP4_STUB);
    const tj = JSON.parse(dec._timelapseJson); eq(tj.v, 1); eq(tj.n, 3); eq(tj.longEdge, 1080);
    eq(pixels(dec).length, 2);
    const before = await semantics(dec, deck);
    const out = await rewrite(dec, deck);
    const dec2 = await decodeOraToPainting(out);
    eq(await semantics(dec2, await readDeck(dec2)), before, "往返语义逐字段一致");
    eq(Object.keys(await zipUnpack(out)).join("|"), CURRENT_LAYOUT([REFERENCES_MANIFEST, `${REFERENCES_DIR}/r0.jpg`, `${REFERENCES_DIR}/r2.png`], true).join("|"));
  });
  it("plain：desk 的非默认值（导出 jpg / 白底）往返不丢", async () => {
    const dec = await decodeOraToPainting(load("real/v3/plain.ora"));
    eq(dec._formatVersion, 3); eq(dec._referenceFiles.size, 0);
    eq(dec._editorState.export.format, "jpg"); eq(dec._editorState.export.bg, "#ffffff");
    const deck = await readDeck(dec);
    const dec2 = await decodeOraToPainting(await rewrite(dec, deck));
    eq(await semantics(dec2, await readDeck(dec2)), await semantics(dec, deck));
    eq(dec2._editorState.export.format, "jpg"); eq(dec2._editorState.export.bg, "#ffffff");
  });
});

describe("冻结样本 · real/v3.0.0（v0.14.46 写入器真写的三级拍子：stack.xml / desk / 录像都带 minor / patch；2026-10-21 Opus 5.5 冻）", () => {
  it("references-live-timelapse：拍子 3.0.0 / 1.0.0 / 1.0.0、判 same；往返语义一致、布局不变", async () => {
    const dec = await decodeOraToPainting(load("real/v3.0.0/references-live-timelapse.ora"));
    eq(JSON.stringify(dec._formatStamp), JSON.stringify({ major: 3, minor: 0, patch: 0 })); eq(judge("ora", dec._formatStamp), "same");
    eq(dec._layoutMigrated.length, 0); eq(dec._extraEntries.size, 0, "本版写的文件没有未知 entry");
    eq(dec._editorState.version, 1); eq(dec._editorState.minor, 0); eq(dec._editorState.patch, 0);
    const tj = JSON.parse(dec._timelapseJson); eq(tj.v, 1); eq(tj.minor, 0); eq(tj.patch, 0);
    const deck = await readDeck(dec);
    eq(deck.size, 3); eq(deck.index, 2);
    const before = await semantics(dec, deck);
    const out = await rewrite(dec, deck);
    const dec2 = await decodeOraToPainting(out);
    eq(await semantics(dec2, await readDeck(dec2)), before, "往返语义逐字段一致");
    eq(Object.keys(await zipUnpack(out)).join("|"), CURRENT_LAYOUT([REFERENCES_MANIFEST, `${REFERENCES_DIR}/r0.jpg`, `${REFERENCES_DIR}/r2.png`], true).join("|"));
  });
  it("plain：desk 非默认值往返不丢", async () => {
    const dec = await decodeOraToPainting(load("real/v3.0.0/plain.ora"));
    eq(dec._editorState.export.format, "jpg"); eq(dec._editorState.export.bg, "#ffffff");
    const deck = await readDeck(dec);
    const dec2 = await decodeOraToPainting(await rewrite(dec, deck));
    eq(await semantics(dec2, await readDeck(dec2)), await semantics(dec, deck));
  });
});

describe("冻结样本 · real/v1（format 1 最后一版写入器 bfb9f08 = v0.12.6 时代真写的；2026-10-21 审计第 2 条，gen-v1-at-bfb9f08.mjs 在该 commit 的源码树上跑出来）", () => {
  it("reference-timelapse：非点 weebpaint/reference.png + 根目录 timelapse.mp4 → 全归一化；单张参考带老视口；录像 json 原样；往返语义一致、写成当前布局", async () => {
    const dec = await decodeOraToPainting(load("real/v1/reference-timelapse.ora"));
    eq(dec._formatVersion, 1); eq(dec._wroteWith, "v0.12.6-2026-08-30");
    for (const m of ["timelapse.mp4 → .weebpaint/timelapse.mp4"]) assert(dec._layoutMigrated.includes(m), dec._layoutMigrated.join("; "));
    assert(dec._layoutMigrated.some((x) => x.startsWith("weebpaint/reference.png →")), dec._layoutMigrated.join("; "));
    const deck = await readDeck(dec);
    eq(deck.size, 1); eq(deck.current.kind, "image"); eq(JSON.stringify(deck.current.vp), JSON.stringify({ tx: 7, ty: 8, scale: 2, rot: 0 }));
    eq(joined(new Uint8Array(await deck.current.bytes.arrayBuffer())), PNG_STUB);
    eq(JSON.parse(dec._timelapseJson).n, 3); eq(joined(dec._timelapseMp4), MP4_STUB);
    eq(dec._editorState.refPanel.enabled, true);
    const before = await semantics(dec, deck);
    const out = await rewrite(dec, deck);
    const dec2 = await decodeOraToPainting(out);
    eq(await semantics(dec2, await readDeck(dec2)), before, "往返语义逐字段一致");
    eq(dec2._formatVersion, ORA_FORMAT_VERSION); eq(dec2._layoutMigrated.length, 0);
    eq(Object.keys(await zipUnpack(out)).join("|"), CURRENT_LAYOUT([REFERENCES_MANIFEST, `${REFERENCES_DIR}/r0.png`], true).join("|"));
  });
  it("plain：desk 非默认值（导出 jpg / 白底）往返不丢", async () => {
    const dec = await decodeOraToPainting(load("real/v1/plain.ora"));
    eq(dec._formatVersion, 1); eq(dec._editorState.export.format, "jpg"); eq(dec._editorState.export.bg, "#ffffff");
    const deck = await readDeck(dec);
    const dec2 = await decodeOraToPainting(await rewrite(dec, deck));
    eq(await semantics(dec2, await readDeck(dec2)), await semantics(dec, deck));
  });
});

describe("冻结样本 · 第二层的理由（2026-10-21 审计第 1 / 6 条）：拍子全是本版、只有 wrote-with 更新的画，stack.xml 图层上的未知属性存一次就丢", () => {
  it("future-app/newer-app-same-format：拍子判 same（第一层放行）；parseAppVersion 判写入 app 更新（第二层要确认）；重写后 future-layer-flag 没了", async () => {
    const { parseAppVersion } = await import("../src/backend/ora.ts");
    const { WEEBPAINT_VERSION } = await import("../src/version.ts");
    const raw = load("synthetic/future-app/newer-app-same-format.ora");
    const dec = await decodeOraToPainting(raw);
    eq(judge("ora", dec._formatStamp), "same"); eq(dec._wroteWith, "v9.9.9-future");
    assert(parseAppVersion(dec._wroteWith) > parseAppVersion(WEEBPAINT_VERSION), "写入 app 比本版新");
    const xmlOf = async (blob) => new TextDecoder().decode((await zipUnpack(blob))["stack.xml"]);
    assert((await xmlOf(raw)).includes("future-layer-flag"), "样本里确实有");
    const out = await rewrite(dec, await readDeck(dec));
    assert(!(await xmlOf(out)).includes("future-layer-flag"), "本版重写后丢了——这就是「覆盖前确认」那层存在的理由");
  });
  it("future-major/references-2：参考清单 major 比库新 → 库抛 DeckManifestTooNewError（壳层整个目录原样带着、拒收导入）", async () => {
    const dec = await decodeOraToPainting(load("synthetic/future-major/references-2.ora"));
    let err = null;
    try { await decodeDeck({ app: "weebpaint", knownKinds: ["image", "live"], getFile: (p) => { const b = dec._referenceFiles.get(p); return b ? new Blob([b], { type: mimeForName(p) }) : null; } }); } catch (e) { err = e; }
    assert(err && err.name === "DeckManifestTooNewError", String(err));
    const saved = await encodeDocToOra(paintingDataToEncodeDoc(dec.data), { wroteWith: "v-test", desk: {}, referenceFiles: dec._referenceFiles });   // 壳层 collectReferenceFilesForSave 带着的就是 _referenceFiles
    const b = await zipUnpack(saved);
    eq(joined(b[REFERENCES_MANIFEST]), joined(dec._referenceFiles.get(REFERENCES_MANIFEST)));
  });
});

describe("冻结样本 · desk 结构等价（每份样本：文件里 desk 的每个顶层键，读 → 写 → 再读，值逐字段不变）", () => {
  // 家族格式版本纪律 F-69 护栏 1（统筹 10-21）：动 desk 读写之前，先钉住「现有每一种 desk 都原样往返」。
  //   比的是文件里（布局归一化之后）有的键：当前写入器会补上缺的默认组，那不算变化；version 归写入器自己（只写当前拍）。
  const walk = (dir) => readdirSync(new URL(dir, FIX), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}${e.name}/`) : (e.name.endsWith(".ora") ? [`${dir}${e.name}`] : []));
  it("所有带 desk 的样本", async () => {
    let checked = 0;
    for (const rel of walk("")) {
      const dec = await decodeOraToPainting(load(rel));
      if (dec._editorState == null || typeof dec._editorState !== "object") continue;
      try { desk.reset(); desk.Unserialize(dec._editorState); } catch (e) { if (e?.name === "FormatTooNewError") continue; throw e; }   // 比本版新的样本另测
      const out = JSON.parse(JSON.stringify(desk.Serialize()));
      for (const [k, v] of Object.entries(dec._editorState)) {
        if (["version", "minor", "patch"].includes(k)) continue;
        eq(JSON.stringify(out[k]), JSON.stringify(v), `${rel}: desk.${k}`);
      }
      checked++;
    }
    assert(checked >= 3, `checked ${checked} desks`);
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

describe("冻结样本 · 未来版本写的（家族格式版本纪律 F-69 护栏 3 / 4；样本 = synthetic/future-*，gen-future.mjs 拼）", () => {
  // 壳层的保存链路，每个子结构都走真写入器：desk.Serialize（直通袋）/ TimelapseDocState.serializeForSave（直通袋）/
  //   encodeDeck（库的直通）/ extraEntries（`.weebpaint/` 不认识的 entry）。和 session-state _buildOraMeta + timelapseForSave 同形。
  const dec8 = (u8) => new TextDecoder().decode(u8);
  const entry = async (blob, p) => (await zipUnpack(blob))[p];

  it("minor 更新的每一部分：打开 → 改一笔 → 存 → 再读，未知键 / 未知 entry 都还在，拍子写成本版的", async () => {
    const dec = await decodeOraToPainting(load("synthetic/future-minor/all-parts.ora"));
    eq(judge("ora", dec._formatStamp), "newer-minor");
    eq([...dec._extraEntries.keys()].join("|"), ".weebpaint/future-notes.json");
    // 打开（壳层同款）
    desk.reset();
    eq(desk.Unserialize(dec._editorState).verdict, "newer-minor");
    const tl = TimelapseDocState.restore(dec._timelapseJson ?? null, dec._timelapseMp4 ?? null);
    eq(tl.formatVerdict, "newer-minor"); eq(tl.restoreIssue, null);
    const decoded = await decodeDeck({ app: "weebpaint", knownKinds: ["image", "live"], getFile: (p) => { const b = dec._referenceFiles.get(p); return b ? new Blob([b], { type: mimeForName(p) }) : null; } });
    eq(decoded.verdict, "newer-minor");
    const deck = createDeck(); deck.restore(decoded);
    // 改一笔：底层 (3,0) 涂成绿
    const base = dec.data.nodes.find((n) => n.id === 1);
    const w = base.pixels.rect.w, i = (0 * w + 3) * 4;
    base.pixels.bytes.set([0, 255, 0, 255], i);
    // 存
    const saved = await encodeDocToOra(paintingDataToEncodeDoc(dec.data), {
      wroteWith: "v-test", desk: desk.Serialize(), referenceFiles: encodeDeck(deck.snapshot(), { app: "weebpaint" }),
      timelapse: tl.serializeForSave(null, 4, 4), extraEntries: dec._extraEntries,
    });
    // 再读
    const back = await decodeOraToPainting(saved);
    eq(JSON.stringify(back._formatStamp), JSON.stringify(FORMAT.ora), "stack.xml 写本版拍");
    eq(JSON.stringify(back._editorState.futureDesk), JSON.stringify({ gizmo: true, level: 3 }), "desk 未知键还在");
    eq(back._editorState.minor, FORMAT.desk.minor, "desk 拍子写本版的");
    const tlj = JSON.parse(back._timelapseJson);
    eq(tlj.futureTimelapse, "keep me", "录像未知键还在"); eq(tlj.minor, FORMAT.timelapse.minor);
    const man = JSON.parse(dec8(back._referenceFiles.get(REFERENCES_MANIFEST)));
    eq(JSON.stringify(man.futureDeck), JSON.stringify(["a", "b"]), "参考清单未知键还在（库直通）");
    eq(dec8(back._extraEntries.get(".weebpaint/future-notes.json")), JSON.stringify({ hello: "from a newer WeebPaint" }), "未知 entry 原样");
    const names = Object.keys(await zipUnpack(saved));
    eq(names[names.length - 1], "Thumbnails/thumbnail.png", "缩略图仍垫尾");
    const b2 = back.data.nodes.find((n) => n.id === 1);
    eq(Array.from(b2.pixels.bytes.slice((0 * b2.pixels.rect.w + 3) * 4, (0 * b2.pixels.rect.w + 3) * 4 + 4)).join(","), "0,255,0,255", "那一笔在");
  });

  it("整张 ora 的 major 更新：判 too-new；无头 backend.open 拒开（抛 FormatTooNewError）", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("synthetic/future-major/ora-4.ora", FIX)));
    const dec = await decodeOraToPainting(new Blob([bytes]));
    eq(judge("ora", dec._formatStamp), "too-new"); eq(dec._formatStamp.major, 4);
    let err = null;
    try { await WeebPaintBackend.open(bytes, { appVersion: "v-test" }); } catch (e) { err = e; }
    assert(err instanceof FormatTooNewError, String(err)); eq(err.component, "ora");
  });

  it("只有 desk 的 major 更新：desk 抛；保存递原字节 → 写回的 editor-state.json 与文件逐字节相同", async () => {
    const dec = await decodeOraToPainting(load("synthetic/future-major/desk-2.ora"));
    eq(judge("ora", dec._formatStamp), "same");
    let err = null; desk.reset();
    try { desk.Unserialize(dec._editorState); } catch (e) { err = e; }
    assert(err instanceof FormatTooNewError, String(err)); eq(err.component, "desk");
    const saved = await encodeDocToOra(paintingDataToEncodeDoc(dec.data), { wroteWith: "v-test", desk: dec._editorStateBytes });
    eq(joined(await entry(saved, ".weebpaint/editor-state.json")), joined(dec._editorStateBytes));
  });

  it("无头 backend（MCP 存盘路径）：open 的 sidecar 整份递回 encodeOra = desk / 录像 / 参考 / 未知 entry 全部原样", async () => {
    const bytes = new Uint8Array(readFileSync(new URL("synthetic/future-minor/all-parts.ora", FIX)));
    const { backend, sidecar } = await WeebPaintBackend.open(bytes, { appVersion: "v-test" });
    const out = await backend.encodeOra({ editorSidecar: sidecar.editorStateBytes, referenceFiles: sidecar.referenceFiles, timelapse: sidecar.timelapse, extraEntries: sidecar.extraEntries });
    const a = await zipUnpack(new Blob([bytes])), b = await zipUnpack(new Blob([out]));
    for (const p of [".weebpaint/editor-state.json", ".weebpaint/timelapse.json", REFERENCES_MANIFEST, `${REFERENCES_DIR}/r0.png`, ".weebpaint/future-notes.json"]) {
      assert(b[p], `missing ${p}`); eq(joined(b[p]), joined(a[p]), p);
    }
    backend.dispose();
  });
});
