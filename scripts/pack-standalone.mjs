#!/usr/bin/env node
// pack-standalone.mjs —— P6 单文件 html 打包器（0825 verdicts §2.9 / survey §5.3）。
// created 2026-08-27 by Claude Fable 5.
//
// 输入 = 常规 build 产物（同一个全量 bundle——「html build = 全量 build 运行时 gate」拍板，不做阉割 build）；
// 输出 = dist/weebpaint-standalone.html：自包含（css/字体/zip-js/bundle 内联；7z/msal/三份 json 灌
//   window.__WEEBPAINT_EMBED__，运行时接缝 = src/standalone-html.ts）。**gitignored**——生成物不进仓不进
//   pages 部署；itch 上传 / 双击分发前本地跑 `bash scripts/build-standalone.sh`。
// 安全细节：内联 JS 里的 "</script" 一律替换为 "<\/script"（字符串/正则语义不变，HTML 解析不再早收）；
//   JSON 里 "</" 同理。自检：不残留任何外链 src/href、体积上限、必含 EMBED 标记——违约非零退出。

import { readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p));
const readText = (p) => read(p).toString("utf8");
const b64 = (p) => read(p).toString("base64");
const escScript = (js) => js.replace(/<\/script/gi, "<\\/script");
const escJson = (s) => s.replace(/<\//g, "<\\/");
const die = (msg) => { console.error("[pack-standalone] ✗ " + msg); process.exit(1); };

let html = readText("index.html");
const version = (readText("src/version.ts").match(/WEEBPAINT_VERSION = "([^"]+)"/) || [])[1] || "unknown";

// ---- 1. bundle 路径（index.html 现值 = build.sh sed 过的 content-hash 名）----
const bundleM = html.match(/<script type="module" src="\.\/(dist\/weebpaint-[0-9a-f]+\.mjs)"><\/script>/);
if (!bundleM) die("找不到 bundle <script> 标签（先跑 scripts/build.sh）");

// ---- 2. styles.css 内联（vendor 字体 → data:）----
let css = readText("styles.css");
css = css.replace(/url\("?(vendor\/[^")]+)"?\)/g, (_, p) => {
  const mime = p.endsWith(".otf") ? "font/otf" : p.endsWith(".woff2") ? "font/woff2" : "application/octet-stream";
  return `url("data:${mime};base64,${b64(p)}")`;
});
if (css.includes("url(\"vendor") || css.includes("url(vendor")) die("styles.css 还有未内联的 vendor url()");
html = html.replace(/<link rel="stylesheet" href="\.\/styles\.css[^"]*" \/>/, () => `<style>\n${css}\n</style>`);

// ---- 3. zip-js 内联（classic script；defer 去掉=就地执行，只定义全局，顺序无关）----
html = html.replace(/<script defer src="\.\/vendor\/zip-js\/zip-full\.min\.js"><\/script>/,
  () => `<script>\n${escScript(readText("vendor/zip-js/zip-full.min.js"))}\n</script>`);

// ---- 4. EMBED 资产 + bundle 内联 ----
const embed = {
  "7zz.umd.js": readText("vendor/7z-wasm/7zz.umd.js"),
  "7zz.wasm": b64("vendor/7z-wasm/7zz.wasm"),
  "msal-browser.min.js": readText("vendor/msal/msal-browser.min.js"),
  "builtin-brushes.json": readText("builtin-brushes.json"),
  "canvas-templates.json": readText("canvas-templates.json"),
  "color-words.json": readText("color-words.json"),
};
const embedTag = `<script>/* pack-single ${version} */window.__WEEBPAINT_EMBED__ = ${escJson(JSON.stringify(embed))};</script>`;
html = html.replace(bundleM[0], () => `${embedTag}\n    <script type="module">\n${escScript(readText(bundleM[1]))}\n</script>`);

// ---- 5. 剥 PWA 外链（manifest/图标——单文件无这些文件，剥掉免 404 噪音；SW 由运行时 gate 跳）----
html = html.replace(/^\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*\/>\s*$/gm, "");

// ---- 6. 自检（违约=非零退出，别把残废文件当交付物）----
const leftovers = [...html.matchAll(/(?:src|href)="\.\/[^"]+"/g)].map((m) => m[0]);
if (leftovers.length) die("残留外链引用：" + leftovers.join(" "));
if (!html.includes("__WEEBPAINT_EMBED__")) die("EMBED 段缺失");
const out = resolve(root, "dist/weebpaint-standalone.html");
writeFileSync(out, html);
const mb = statSync(out).size / 1024 / 1024;
if (mb > 25) die(`体积超限 ${mb.toFixed(1)}MB > 25MB（TiddlyWiki 经验 ~20MB 起明显变慢）`);
console.log(`[pack-standalone] ✓ dist/weebpaint-standalone.html（${version}，${mb.toFixed(2)} MB）`);
console.log("[pack-standalone] 验法：双击 file:// 开（Chromium/Firefox）；itch 上传该文件；夹具 = tools/itch-iframe-fixture.html");
