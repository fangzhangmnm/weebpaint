// test/exit-rule.test.mjs —— 加密作品的出门规则（家族规则书 §1 第 5 条，user 11-03；工单 G2）。
// created 2026-11-03 by Claude Opus 5.5
//   封口用假端口测逻辑；真容器在 test/probes/probe-cloud-gate.mjs exit 里验（云端 / 下载的字节过库的 isEncryptedBlob）。
import { describe, it, eq, assert } from "./runner.mjs";
import fs from "node:fs";
const { sealForSaveAs } = await import("../src/exit-seal.ts");
const { S } = await import("../src/i18n/strings.ts");

const read = (p) => fs.readFileSync(p, "utf8");
const MAGIC = new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const ports = {
  pack: async (o) => new Blob([MAGIC, o.dataBytes]),
  isContainer: async (b) => { const h = new Uint8Array(await b.slice(0, 6).arrayBuffer()); return MAGIC.every((v, i) => h[i] === v); },
};
const locked = () => new Error("LOCKED");

describe("加密作品另存 = 容器", () => {
  it("给口令：出来的字节是容器", async () => {
    const out = await sealForSaveAs(new Blob(["plain"]), null, "副本", "pw", ports, locked);
    assert(await ports.isContainer(out));
  });
  it("没口令：抛错，不回落明文", async () => {
    let err = null;
    try { await sealForSaveAs(new Blob(["plain"]), null, "副本", null, ports, locked); } catch (e) { err = e; }
    eq(err?.message, "LOCKED");
  });
  it("打出来不是容器：抛错，不写", async () => {
    let err = null;
    try { await sealForSaveAs(new Blob(["plain"]), null, "副本", "pw", { ...ports, pack: async () => new Blob(["plain"]) }, locked); } catch (e) { err = e; }
    eq(err?.message, "LOCKED");
  });
  it("saveAs：加密分支走封口、存的是封口的结果，不带明文头片", () => {
    const src = read("src/session-state.ts");
    const body = src.slice(src.indexOf("async function saveAs(newName: string)"), src.indexOf("// ── 回线/回前台：打开中文档的显式快进"));
    assert(/if \(wasEncrypted\) \{[\s\S]*?sealForSaveAs\([\s\S]*?\.save\(container, \{ tryPush: true \}\);/.test(body));
    assert(/wasEncrypted && !pw\) throw/.test(body), "锁着直接拒");
  });
});

describe("明文路径必经那句话", () => {
  const menu = read("src/export-import-menu.ts");
  it("hub：加密作品主按钮 = 加密文件；明文 .ora 单独一行", () => {
    assert(/enc \? \[\{ label: t\("tm\.hubSaveLocalOraEnc"\), value: "local" as const, primary: true \}\]/.test(menu));
    assert(/enc \? \{ label: t\("tm\.hubSaveLocalOraPlain"\), value: "localPlain" as const \}/.test(menu));
    assert(/choice === "localPlain"\) await saveLocalOraCopy\(true\)/.test(menu), "只有显式那一行才要明文");
  });
  it("hub：给别的软件的格式，加密作品的按钮写着明文", () => {
    assert(/imagePlain \? t\("tm\.hubExportImagePlain"/.test(menu));
    eq((menu.match(/runConfiguredExport\(\)/g) ?? []).length, 1, "导出图片只有 hub 这一个入口");
  });
  it("默认保存走容器：saveLocalOraCopy 不传 plain 时，加密作品不碰 encodeCurrentOra", () => {
    const fn = menu.slice(menu.indexOf("const saveLocalOraCopy = async"), menu.indexOf("session.encodeCurrentOra()", menu.indexOf("const saveLocalOraCopy = async")));
    assert(/session\.enc\.encrypted && !plain/.test(fn) && /readEncryptedBytes\(\)/.test(fn));
  });
  it("录像：加密的画下载前问", () => {
    const tl = read("src/timelapse-ui.ts");
    const fn = tl.slice(tl.indexOf("async function _exportFresh"), tl.indexOf("triggerDownload(new Blob"));
    assert(/_isEncrypted\(\) && !\(await openConfirmSheet\(t\("enc\.plainNote"\)/.test(fn));
    assert(/initTimelapseUi\(\(\) => exportBaseName\(\), \(\) => session\.enc\.encrypted\)/.test(read("src/app.ts")));
  });
  it("文案：那句话四种语言都在、中文一字不差", () => {
    eq(S["enc.plainNote"].zh, "这份是明文、没有加密");
    for (const k of ["enc.plainNote", "tm.hubSaveLocalOraPlain", "tm.hubExportImagePlain", "tm.hubSaveLocalOraEnc", "pushAll.askOnly", "pushAll.askMixed", "pushAll.now", "pushAll.later"]) {
      for (const l of ["zh", "en", "ja", "tok"]) assert(S[k]?.[l], `${k}.${l}`);
    }
    assert(S["tm.hubSaveLocalOraPlain"].zh.includes("这份是明文、没有加密") && S["tm.hubExportImagePlain"].zh.includes("这份是明文、没有加密"));
    eq(S["pushAll.askOnly"].zh, "有 {a} 份只在这台设备，现在传上去？");
    eq(S["pushAll.askMixed"].zh, "有 {a} 份只在这台设备，还有 {c} 份改过没传。现在全传？");
  });
});
