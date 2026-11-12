// 正常文档不变（CatsUp 统筹 11-12，ora 图层 id 那一改的钉子）：仓里每一份 ora 样本「解开 → 再编」的 stack.xml 字符串和条目名单，
//   和改之前的代码（画画仓 3c3fe37 = v0.14.88）做出来的逐字节一样（金样本 test/fixtures/format/ora-reencode-golden.json）；正常样本上 warn 一次都不响。
// 读仓里的样本文件 = 不是内核测试（内核那几条在 test/ora-ids.test.mjs）。created 2026-11-12 by Claude Opus 5.5
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync } from "node:fs";
import "./kernel-shim.mjs";
import { installDomParserShim } from "./xml-shim.mjs";

installDomParserShim();
const { encodeDocToOra, decodeOraToPainting, paintingDataToEncodeDoc } = await import("../src/backend/ora.ts");
const { zipUnpack } = await import("../src/backend/zip.ts");
const GOLDEN = JSON.parse(readFileSync(new URL("./fixtures/format/ora-reencode-golden.json", import.meta.url), "utf8")).samples;

describe("ora 图层 id：正常文档写出来和以前一样（CatsUp 统筹 11-12）", () => {
  it("仓里每一份 ora 样本解开再编：stack.xml 字符串和条目名单和改之前逐字节一样；warn 一次都不响", async () => {
    const keys = Object.keys(GOLDEN);
    assert(keys.length >= 10, `样本够多（${keys.length}）`);
    let leaves = 0;
    for (const k of keys) {
      const d = await decodeOraToPainting(new Blob([readFileSync(new URL(`./fixtures/${k}`, import.meta.url))]));
      const warns = [];
      const files = await zipUnpack(await encodeDocToOra(paintingDataToEncodeDoc(d.data ?? d), { wroteWith: "golden", warn: (m) => warns.push(m) }));
      eq(new TextDecoder().decode(files["stack.xml"]), GOLDEN[k].stack, `${k}：stack.xml 一样`);
      eq(JSON.stringify(Object.keys(files).sort()), JSON.stringify(GOLDEN[k].entries), `${k}：条目名单一样`);
      eq(warns.length, 0, `${k}：warn 没响（${warns.join(" | ")}）`);
      leaves += GOLDEN[k].entries.filter((e) => e.startsWith("data/")).length;
    }
    assert(leaves >= 20, `一共比了 ${leaves} 片叶的像素条目`);
  }, { timeout: 60000 });
});
