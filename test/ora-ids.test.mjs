// .ora 里图层的 id（2026-11-12 CatsUp 统筹批）：读的时候 weebpaint:id 不是安全范围的非负整数 = 当没有、自动编号；写的时候没有可用 id = 不写这个属性、经 warn 报一句、
//   像素文件名换成不会撞的 data/layer-<第几个>.png；「选中」「参考」只认可用 id（以前 activeId === node.id 两边都是 undefined 也算）。
// 起因：CatsUp v0.19.60 及以前的存盘器给「开始画了一笔没画」的画编空白分层字节时那一层没有 id → 写成 weebpaint:id="undefined"、src="data/layerundefined.png"
//   → 以前读回来 id 和选中都是 NaN → 画板的当前图层是 NaN、一笔都画不上。样本 = 用 v0.14.88 的内核（v0.19.60 用的那份）+ v0.19.60 存盘器里原样的数据编的真字节。
// 内核自己的测试：只 import 内核和测试工具。created 2026-11-12 by Claude Opus 5.5
import { describe, it, assert, eq } from "./runner.mjs";
import "./kernel-shim.mjs";   // 内核测试：zip.js 由它挂（不能用 zip-node.mjs：那个文件连着内核以外的 src）
import { installDomParserShim } from "./xml-shim.mjs";

installDomParserShim();
const { encodeDocToOra, decodeOraToPainting, paintingDataToEncodeDoc } = await import("../src/backend/ora.ts");
const { parseStackXml, buildStackXml, usableLayerId } = await import("../src/backend/ora-stack-xml.ts");
const { zipReadEntry } = await import("../src/backend/zip.ts");
const { WeebPaintBackend } = await import("../src/backend/weebpaint-backend.ts");

/** CatsUp v0.19.60 写的「开始画了一笔没画就存」的空白画（64 × 64，一层，没有 id）。生成：画画仓 v0.14.88（3c3fe37）的 encodeDocToOra(paintingDataToEncodeDoc(
 *  { width: 64, height: 64, nodes: [{ name: "Layer 1", visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false, pixels: null }] }))，
 *  数据 = CatsUp 6064f7f7 src/paint/save.ts 第 164 行原样。stack.xml 里是 weebpaint:id="undefined"、src="data/layerundefined.png"。 */
const CATSUP_V0_19_60_BLANK = Uint8Array.from(Buffer.from("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", "base64"));
const txt = (u) => new TextDecoder().decode(u);
const stackOf = async (bytes) => txt(await zipReadEntry(new Blob([bytes]), "stack.xml"));
const decode = async (bytes) => { const d = await decodeOraToPainting(new Blob([bytes])); return d.data ?? d; };
const leaves = (ns, out = []) => { for (const n of ns) { if ("children" in n) leaves(n.children, out); else out.push(n); } return out; };
const toBytes = async (blob) => new Uint8Array(await blob.arrayBuffer());

describe(".ora 里图层的 id（CatsUp 统筹 11-12）", () => {
  it("样本（CatsUp v0.19.60 真代码写的空白画）：stack.xml 里确实是 id=\"undefined\"；读回来那一层的 id 是正常的数、选中指着它", async () => {
    const xml = await stackOf(CATSUP_V0_19_60_BLANK);
    assert(xml.includes('weebpaint:id="undefined"') && xml.includes("data/layerundefined.png"), "样本是那份坏的");
    const d = await decode(CATSUP_V0_19_60_BLANK), L = leaves(d.nodes);
    eq(L.length, 1);
    assert(usableLayerId(L[0].id), `那一层的 id 是可用的数（${L[0].id}）`);
    eq(d.activeId, L[0].id, "选中指着它");
  });
  it("样本：打开后在当前图层落一笔，像素变了（以前当前图层是 NaN，一笔都画不上）", async () => {
    const { backend: be } = await WeebPaintBackend.open(CATSUP_V0_19_60_BLANK, { appVersion: "v0.0.0-test" });
    const id = be.docInfo().activeId;
    assert(usableLayerId(id), `当前图层是正常的数（${id}）`);
    const sid = be.strokeBegin(id, { size: 8, color: "#e04020", opacity: 1, mode: "brush" });
    be.strokeAppend(sid, new Float32Array([10, 10, 0.8, 0, 50, 40, 0.8, 16])); be.strokeEnd(sid);
    const px = be.wp2.layerTiles.getRegion(id, 0, 0, 64, 64);
    let a = 0; for (let i = 3; i < px.length; i += 4) a += px[i];
    assert(a > 0, "画上了");
    be.dispose();
  });
  it("读：weebpaint:id 不是安全范围的非负整数（undefined / NaN / -1 / 1.5 / 12abc / 空 / 没有）= 当没有；纯数字照读", () => {
    const xml = (v) => `<?xml version="1.0"?><image w="4" h="4"><stack name="root">${v === null ? '<layer name="L" src="data/a.png" x="0" y="0" />' : `<layer name="L" src="data/a.png" x="0" y="0" weebpaint:id="${v}" />`}</stack></image>`;
    for (const v of ["undefined", "NaN", "-1", "1.5", "12abc", "", " 3", "1e3", "99999999999999999999", null]) eq(parseStackXml(xml(v)).nodes[0].id, null, `「${v}」当没有`);
    eq(parseStackXml(xml("7")).nodes[0].id, 7); eq(parseStackXml(xml("0")).nodes[0].id, 0); eq(parseStackXml(xml("007")).nodes[0].id, 7);
  });
  it("写：没有可用 id 的层不写 weebpaint:id、像素文件名不撞（两层都没有 id 也各是各的）、经 warn 报一句；「选中」「参考」不认 undefined === undefined；读回来每层的像素都对、id 各不相同", async () => {
    const W = 8, H = 8, px = (r) => { const u = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { u[4 * i] = r; u[4 * i + 3] = 255; } return u; };
    const leaf = (id, name, r) => ({ ...(id === "absent" ? {} : { id }), name, visible: true, opacity: 1, mode: "source-over", clippingMask: false, lockAlpha: false, pixels: { rect: { x: 0, y: 0, w: W, h: H }, bytes: px(r) } });
    const data = { width: W, height: H, nodes: [leaf("absent", "甲", 10), leaf(NaN, "乙", 20), leaf(5, "丙", 30), { name: "组", visible: true, opacity: 1, mode: "pass-through", clippingMask: false, children: [leaf(undefined, "丁", 40)] }] };
    const warns = [];
    const bytes = await toBytes(await encodeDocToOra(paintingDataToEncodeDoc(data), { wroteWith: "test", warn: (m) => warns.push(m) }));
    const xml = await stackOf(bytes);
    assert(!/undefined|NaN/.test(xml), "stack.xml 里没有 undefined / NaN");
    assert(!xml.includes('weebpaint:active="true"') && !xml.includes('weebpaint:reference="true"'), "没有 activeId / referenceLayerId 时谁都不是选中 / 参考（以前没 id 的那层会被标成选中）");
    assert(xml.includes('src="data/layer5.png"') && xml.includes('weebpaint:id="5"'), "有 id 的照旧");
    eq(warns.length, 4, `四层没有可用 id（三片叶 + 一个组），各报一句：${warns.join(" | ")}`);
    const d = await decode(bytes), L = leaves(d.nodes), ids = L.map((n) => n.id);
    assert(ids.every(usableLayerId) && new Set(ids).size === ids.length, `读回来每片叶的 id 都可用、各不相同（${ids.join(",")}）`);
    eq(L.find((n) => n.name === "丙").id, 5, "有 id 的那层还是 5");
    for (const [name, r] of [["甲", 10], ["乙", 20], ["丙", 30], ["丁", 40]]) { const n = L.find((x) => x.name === name); eq(n.pixels.bytes[0], r, `「${name}」的像素是它自己的（文件名没撞）`); }
    assert(usableLayerId(d.activeId) && ids.includes(d.activeId), "选中落在某一片叶上");
  });
  it("画画软件自己的路：存出来的每一层、每个组都带 weebpaint:id（调用的人该传 id，靠这条钉）", async () => {
    const be = WeebPaintBackend.blank({ width: 16, height: 16 }, { appVersion: "v0.0.0-test" });
    be.layerAdd("二"); be.layerAdd("三");
    const bytes = await be.encodeOra({});
    const xml = await stackOf(bytes), els = [...xml.matchAll(/<(layer|stack)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !t.includes('name="root"'));
    assert(els.length >= 3, `有几层（${els.length}）`);
    for (const t of els) assert(/weebpaint:id="\d+"/.test(t), `每一个都带 id：${t.slice(0, 80)}`);
    be.dispose();
  });
});
