// 构建时把 src/vue-templates.ts 的 Vue 模板编成 render 函数 → src/vue-templates.compiled.ts（生成物进仓）。created 2026-10-21 by Claude Fable 5.1（总账 #89）
// 为什么：页面 CSP 不放行 'unsafe-eval'（ADR-0015）；Vue 运行时编译模板要 new Function，会被拦、组件空白。做法照 @internal/gallery 0.8.4。
//   编译器 = @vue/compiler-dom 的 prod 构建，版本钉死 = vendor/vue 的运行时版本（vendor/vue/VERSION）。版本对不上 = 拒绝生成。
// 用法：node scripts/compile-vue-templates.mjs（build.sh 在 tsc 门之前跑它）；--check = 只比对、不写（守卫测试也直接 import generate()）。
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${ROOT}src/vue-templates.compiled.ts`;
const require = createRequire(import.meta.url);
export const VUE_VERSION = readFileSync(`${ROOT}vendor/vue/VERSION`, "utf8").trim();

export async function generate() {
  const pkg = JSON.parse(readFileSync(require.resolve("@vue/compiler-dom/package.json"), "utf8"));
  if (pkg.version !== VUE_VERSION) throw new Error(`@vue/compiler-dom is ${pkg.version}, expected ${VUE_VERSION} (= vendor/vue/VERSION, the runtime the page ships)`);
  const { compile } = require("@vue/compiler-dom/dist/compiler-dom.cjs.prod.js");
  const T = await import(`${ROOT}src/vue-templates.ts`);
  const names = Object.keys(T).filter((k) => k.endsWith("_TEMPLATE")).sort();
  if (!names.length) throw new Error("no *_TEMPLATE exports in src/vue-templates.ts");
  const helpers = new Set();
  let body = "", table = "";
  for (const key of names) {
    const tpl = T[key];
    const name = key.slice(0, -"_TEMPLATE".length).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (typeof tpl !== "string" || !tpl.trim()) throw new Error(`template ${key} missing`);
    const r = compile(tpl, { mode: "function", prefixIdentifiers: true, hoistStatic: true, cacheHandlers: true, comments: false });
    const m = r.code.match(/^const \{ ([^}]*) \} = Vue/m);
    if (m) for (const pair of m[1].split(",")) helpers.add(pair.split(":")[0].trim());
    if (/\bnew Function\b|\beval\s*\(|\bwith\s*\(/.test(r.code)) throw new Error(`compiled ${key} still evaluates strings`);
    body += `\nexport function ${name}Render(Vue: any): any {\n${r.code.replace(/^/gm, "  ")}\n}\n`;
    table += `    ${name}: ${name}Render(Vue),\n`;
  }
  return `// 生成物 —— scripts/compile-vue-templates.mjs 自 src/vue-templates.ts 编译（@vue/compiler-dom ${VUE_VERSION} prod）。勿手改：改模板后 npm run build。
// 用途：组件用这些 render 函数、运行时不编译模板 = 页面 CSP 不放行 eval（总账 #89，ADR-0015）。入口 = src/vue-render.ts。
/* eslint-disable */
// @ts-nocheck
export const COMPILED_WITH_VUE = "${VUE_VERSION}";
/** render 函数要从 Vue 里拿的 helper（vendor/vue 完整构建全有）。 */
export const HELPERS: readonly string[] = ${JSON.stringify([...helpers].sort())};
${body}
/** 一次拿全：组件按名取 render（src/vue-render.ts 把 vendor 的 Vue 递进来）。 */
export function renders(Vue: any) {
  return {
${table}  };
}
`;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {   // 路径里有空格：比解码后的路径，不比 URL
  const code = await generate();
  if (process.argv.includes("--check")) {
    const cur = readFileSync(OUT, "utf8");
    if (cur !== code) { console.error("[compile-vue-templates] ✗ src/vue-templates.compiled.ts is stale — run npm run build"); process.exit(1); }
    console.log("[compile-vue-templates] up to date");
  } else {
    writeFileSync(OUT, code);
    console.log(`[compile-vue-templates] wrote src/vue-templates.compiled.ts (${(code.length / 1024).toFixed(1)} KB)`);
  }
}
