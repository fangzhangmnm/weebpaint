// 网页标题 = 只是「WeebPaint」：index.html 写死，运行时谁都不改 document.title。
// 画名进标题 = 浏览器历史按画名记那个地址（user 2026-10-14「weebpaint也有这个问题」「就放一个自己的名字，不解释，google也这么干的」）。
// created 2026-10-14 by Claude Opus 5.5
import { describe, it, assert, eq } from "./runner.mjs";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");

describe("网页标题", () => {
  it("index.html 的 <title> 和 og:title 都只是 WeebPaint", () => {
    const html = read("index.html");
    eq(html.match(/<title>([^<]*)<\/title>/)?.[1], "WeebPaint");
    eq(html.match(/<meta property="og:title" content="([^"]*)"/)?.[1], "WeebPaint");
  });
  it("src 里没有人改 document.title", () => {
    const hits = readdirSync(new URL("src/", root), { recursive: true })
      .filter((f) => /\.(ts|mjs|js|vue)$/.test(f) && !f.includes("vendor"))
      .filter((f) => /document\.title\s*=/.test(read(`src/${f}`)));
    assert(hits.length === 0, `这些文件在改 document.title：${hits}`);
  });
});
