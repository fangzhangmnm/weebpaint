// 总账 #3（便条 ai-docs/inbox/20260907-defringe-audit-mergedimage-and-blender-push.md）：defringe 路径对账——**先验证现状，再谈默认值（#5 归 user）**。
// 现状断言（2026-10-21，Claude Fable 5.1）：① .ora 的 mergedimage.png 不 defringe（encodeDocToOra 把调用方给的合成字节原样编码）；
//   ② Blender push 走 session.renderDocToImageBlob 的库级兜底 defringe=false（blender-sync 不传那个形参）。
// 这两条是「代码现在是什么」的锚：谁改了默认值，这里红，顺便逼着去看 #5 的拍板。导出菜单那条路（默认 defringe 开）在 test/defringe.test.mjs。
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
import { ensureZipLoaded } from "./zip-node.mjs";
import { installDomParserShim } from "./xml-shim.mjs";

ensureZipLoaded();
installDomParserShim();
const { encodeDocToOra } = await import("../src/backend/ora.ts");
const { zipReadEntry } = await import("../src/backend/zip.ts");
const { decodePngToBytes } = await import("../src/backend/png-codec.ts");

const mkDoc = (w, h) => ({
  width: w, height: h, activeId: 1, referenceLayerId: null,
  layers: [{
    isGroup: false, id: 1, name: "L", visible: true, opacity: 1, mode: "source-over",
    clippingMask: false, lockAlpha: false, bboxX: 0, bboxY: 0, bboxW: 0, bboxH: 0,
    getImageData: () => { throw new Error("empty leaf must not be sampled"); },
  }],
});

describe("defringe 路径对账（#3）", () => {
  it("现状：.ora mergedimage.png 不 defringe——α=0 像素 RGB 原样（0），不回填边缘色", async () => {
    const w = 4, h = 1;
    const merged = new Uint8ClampedArray(w * h * 4);
    merged.set([200, 30, 10, 255], 0);   // 最左一颗红，右边三颗全透明且 RGB=0（GL merge 按 α 归一后的典型形状）
    const blob = await encodeDocToOra(mkDoc(w, h), { wroteWith: "v-test", mergedBytes: { data: merged, w, h } });
    const png = await zipReadEntry(blob, "mergedimage.png");
    assert(png, "mergedimage.png entry exists");
    const dec = await decodePngToBytes(png);
    eq(dec.w, w); eq(dec.h, h);
    eq([dec.data[0], dec.data[1], dec.data[2], dec.data[3]].join(","), "200,30,10,255", "源像素原样");
    for (let x = 1; x < w; x++) {
      eq(dec.data[x * 4 + 3], 0, `x=${x} α=0`);
      eq([dec.data[x * 4], dec.data[x * 4 + 1], dec.data[x * 4 + 2]].join(","), "0,0,0", `x=${x} RGB 没被回填（现状 = 不 defringe；要改默认先看 #5）`);
    }
  });
  it("现状：Blender push 不传 defringe（走 session.renderDocToImageBlob 的兜底 false）", () => {
    const src = readFileSync(new URL("../src/blender-sync.ts", import.meta.url), "utf8");
    const calls = [...src.matchAll(/renderDocToImageBlob\(([^)]*)\)/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
    eq(calls.length, 1, "blender-sync 只有一处渲 PNG");
    eq(calls[0], 'ctx.doc, "image/png", undefined, scope', "四个实参、没有 defringe（第 6 参）——改了就来对 #5 的拍板");
    const sess = readFileSync(new URL("../src/session.ts", import.meta.url), "utf8");
    assert(/export async function renderDocToImageBlob\([^)]*defringe = false/.test(sess), "session.renderDocToImageBlob 的库级兜底仍是 defringe = false");
  });
});
