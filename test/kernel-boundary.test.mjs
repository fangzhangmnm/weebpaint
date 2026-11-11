// kernel-boundary.test.mjs —— 画画内核的边界 + 「内核自己的测试」名单不过时（created 2026-11-10 by Claude Opus 5.5；CatsUp 贴图主线 0-1）。
// CatsUp 把内核（src/backend、src/common、src/shell/browser-gl2-port.ts、src/shell/gl-board.ts，先不含 timelapse）原样拷过去用（scripts/pull-paint-kernel.sh 按 test/kernel-tests.json 拉）。
// 守三件事：
//   ① 内核文件只 import 内核自己（不含 excludeDirs）和名单里的 vendor 文件；不许裸包名（node: 除外）。
//   ② src/backend、src/common 不许用界面的全局（document. / window. / HTMLElement / localStorage / indexedDB / navigator.），
//      也不许新添浏览器专用的 createImageBitmap / OffscreenCanvas / new ImageData；现有的几处列成白名单，只许变短（多了红、少了也红 = 把白名单改短）。
//   ③ 名单：列着的测试只碰内核 + vendor 名单 + helpers 名单、不读仓里的文件；反过来，符合这个判据的测试都得列上（加了新的内核测试就进名单）。
// 注释不算（先剥掉再查）。说明 = ai-docs/20261110-kernel-own-tests.md。
import { describe, it, assert } from "./runner.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const list = JSON.parse(rd("test/kernel-tests.json"));
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.posix.join(d, e.name)) : [path.posix.join(d, e.name)]));
const CODE = /\.(m?[jt]s)$/;
const excluded = (f) => list.excludeDirs.some((d) => f === d || f.startsWith(d + "/"));
const kernelDirFiles = list.kernelDirs.flatMap(walk).filter((f) => CODE.test(f));
const kernelFiles = [...kernelDirFiles.filter((f) => !excluded(f)), ...list.kernelFiles];
const kernelSet = new Set(kernelFiles), vendorSet = new Set(list.vendor), helperSet = new Set(list.helpers);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const importsOf = (rel) => { const s = strip(rd(rel)), out = [], re = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g; let m; while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]); return out; };
const resolveRel = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));

/** 白名单：src/backend、src/common 里现有的浏览器专用 API（文件 → 词 → 处数）。只许变短。 */
const BROWSER_ONLY_ALLOWED = {
  "src/backend/doc-render.ts": { OffscreenCanvas: 1 },
  "src/backend/ora.ts": { "new ImageData": 1 },
  "src/backend/selection.ts": { "new ImageData": 1 },
  "src/backend/stroke-session.ts": { "new ImageData": 2 },
  "src/backend/workpiece/layer-tiles.ts": { "new ImageData": 1 },
  "src/backend/workpiece/painting-view.ts": { "new ImageData": 2 },
};
const UI_GLOBALS = [/\bdocument\./g, /\bwindow\./g, /\bHTMLElement\b/g, /\blocalStorage\b/g, /\bindexedDB\b/g, /\bnavigator\./g];
const BROWSER_ONLY = { createImageBitmap: /\bcreateImageBitmap\b/g, OffscreenCanvas: /\bOffscreenCanvas\b/g, "new ImageData": /\bnew ImageData\b/g };

describe("kernel boundary (CatsUp copies this kernel)", () => {
  it("kernel files import only the kernel itself and the listed vendor files", () => {
    const bad = [];
    for (const f of kernelFiles) for (const sp of importsOf(f)) {
      if (!sp.startsWith(".")) { if (!sp.startsWith("node:")) bad.push(`${f} -> ${sp} (bare package)`); continue; }
      const r = resolveRel(f, sp);
      if (kernelSet.has(r) || vendorSet.has(r)) continue;
      if (r.startsWith("vendor/")) bad.push(`${f} -> ${r} (vendor file not in test/kernel-tests.json "vendor")`);
      else if (excluded(r)) bad.push(`${f} -> ${r} (excluded dir: CatsUp does not copy it)`);
      else bad.push(`${f} -> ${r} (outside the kernel)`);
    }
    assert(bad.length === 0, `kernel import boundary broken:\n  ${bad.join("\n  ")}`);
  });

  it("src/backend and src/common use no UI globals", () => {
    const bad = [];
    for (const f of kernelDirFiles) { const s = strip(rd(f)); for (const re of UI_GLOBALS) { const n = (s.match(re) ?? []).length; if (n) bad.push(`${f}: ${re.source} ×${n}`); } }
    assert(bad.length === 0, `UI globals in the kernel (keep them in the shell / inject them):\n  ${bad.join("\n  ")}`);
  });

  it("browser-only APIs in src/backend and src/common: exactly the whitelist (it may only shrink)", () => {
    const seen = {};
    for (const f of kernelDirFiles) { const s = strip(rd(f)); for (const [k, re] of Object.entries(BROWSER_ONLY)) { const n = (s.match(re) ?? []).length; if (n) (seen[f] ??= {})[k] = n; } }
    const diff = [];
    for (const f of new Set([...Object.keys(seen), ...Object.keys(BROWSER_ONLY_ALLOWED)])) for (const k of Object.keys(BROWSER_ONLY)) {
      const have = seen[f]?.[k] ?? 0, allow = BROWSER_ONLY_ALLOWED[f]?.[k] ?? 0;
      if (have > allow) diff.push(`${f}: ${k} ×${have} (allowed ×${allow}) — new browser-only use in the kernel`);
      else if (have < allow) diff.push(`${f}: ${k} ×${have} (whitelist says ×${allow}) — shrink BROWSER_ONLY_ALLOWED`);
    }
    assert(diff.length === 0, diff.join("\n  "));
  });
});

/** 一个测试（连同它走到的 helper）只碰内核 + 名单里的 vendor / helper，且不读仓里的文件。 */
function kernelTestVerdict(t, helpersMustBeListed = true) {
  let touchesKernel = false;
  const seen = new Set(), why = [];
  const visit = (f) => {
    if (seen.has(f)) return; seen.add(f);
    if (f !== "test/run-kernel.mjs" && f !== "test/kernel-shim.mjs" && /readFileSync|readdirSync|existsSync|statSync/.test(strip(rd(f)))) why.push(`${f} reads files`);
    for (const sp of importsOf(f)) {
      if (!sp.startsWith(".")) { if (!sp.startsWith("node:")) why.push(`${f} -> ${sp}`); continue; }
      const r = resolveRel(f, sp);
      if (kernelSet.has(r)) { touchesKernel = true; continue; }
      if (vendorSet.has(r)) continue;
      if (r.startsWith("test/") && fs.existsSync(path.join(ROOT, r))) { if (helpersMustBeListed && !helperSet.has(r) && r !== t) why.push(`${f} -> ${r} (helper not listed)`); visit(r); continue; }
      why.push(`${f} -> ${r}`);
    }
  };
  visit(t);
  return { ok: why.length === 0, touchesKernel, why };
}

describe("kernel tests list (test/kernel-tests.json)", () => {
  it("every listed file exists", () => {
    const missing = [...list.tests, ...list.helpers, ...list.vendor, ...list.kernelFiles, list.runner].filter((f) => !fs.existsSync(path.join(ROOT, f)));
    assert(missing.length === 0, `listed but missing: ${missing.join(", ")}`);
  });
  it("listed tests stay inside the kernel, the listed vendor files and helpers, and read no repo files", () => {
    const bad = [];
    for (const t of list.tests) { const v = kernelTestVerdict(t); if (!v.ok) bad.push(`${t}: ${v.why.join("; ")}`); else if (!v.touchesKernel) bad.push(`${t}: imports no kernel file`); }
    assert(bad.length === 0, `not a kernel test any more:\n  ${bad.join("\n  ")}`);
  });
  it("every test that qualifies as a kernel test is listed", () => {
    const listed = new Set(list.tests), missing = [];
    for (const f of fs.readdirSync(path.join(ROOT, "test"))) {
      if (!/\.test\.(m?[jt]s)$/.test(f)) continue;
      const t = `test/${f}`;
      if (listed.has(t)) continue;
      const v = kernelTestVerdict(t, false);   // 没列的 helper 不算出局：新内核测试连同它的 helper 一起报出来
      if (v.ok && v.touchesKernel) missing.push(t);
    }
    assert(missing.length === 0, `kernel tests missing from test/kernel-tests.json "tests" (list their helpers too): ${missing.join(", ")}`);
  });
});
