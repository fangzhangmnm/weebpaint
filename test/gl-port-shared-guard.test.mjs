// gl-port-shared-guard.test.mjs —— 共用别人的显卡画面时的两条结构守卫（created 2026-11-10 by Claude Opus 5.5；CatsUp 贴图主线 0-4）。
// src/shell/browser-gl2-port.ts 的 BrowserGl2Port.fromContext(gl) 会建在宿主（CatsUp = three）的画面上，宿主留下的 GL 状态任意，
// 所以本模块碰 GL 的入口先 _ensureBase()（图块仓里是 this._ensure?.()）把依赖的状态设回默认。这里守两件事（注释不算，先剥掉）：
//   ① 凡是方法体里有画 / 清屏 / 上传 / 读回 / 复制这几类调用的，那一句之前必须先归位——以后加新方法忘了归位就红；
//   ② 本文件不从页面元素（图片 / 画布 / 视频 / ImageBitmap）上传贴图：上传的最后一个参数只能是字节数组或 null（2D 的还得是 9 个参数那种）。
//      有了那种上传，归位的单子要加 UNPACK_COLORSPACE_CONVERSION_WEBGL（_ensureBase 的注释里写着）。
import { describe, it, assert } from "./runner.mjs";
import fs from "node:fs";

const FILE = "src/shell/browser-gl2-port.ts";
const src = fs.readFileSync(new URL(`../${FILE}`, import.meta.url), "utf8");
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

/** 这几类显卡调用（画 / 清屏 / 上传 / 读回 / 复制）出现前必须先归位。 */
const GL_OPS = /\bgl\.(drawArrays|drawArraysInstanced|drawElements|drawElementsInstanced|drawRangeElements|clear|clearBuffer[a-z]+|texImage2D|texImage3D|texSubImage2D|texSubImage3D|compressedTex[A-Za-z0-9]+|readPixels|copyTexImage2D|copyTexSubImage2D|copyTexSubImage3D|blitFramebuffer)\s*\(/;
const ENSURE = /this\._ensureBase\(\)|this\._ensure\?\.\(\)/;

/** 类里每个方法（两格缩进的方法头）→ 方法体（按大括号配对）。 */
function methods(text) {
  const out = [], head = /^  (?:(?:private|public|protected|static|readonly|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\((?:[^()]|\([^()]*\))*\)[^{;=]*\{/gm;   // 参数里允许一层括号（cb: () => void）
  let m;
  while ((m = head.exec(text))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < text.length && depth > 0) { const ch = text[i++]; if (ch === "{") depth++; else if (ch === "}") depth--; }
    out.push({ name: m[1], body: text.slice(m.index + m[0].length, i - 1) });
  }
  return out;
}

/** 调用的参数（顶层逗号切开；括号 / 方括号里的逗号不算）。 */
function callArgs(text, start) {
  let i = start, depth = 0, cur = "", args = [];
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[" || ch === "{") { if (depth++ === 0) continue; }
    else if (ch === ")" || ch === "]" || ch === "}") { if (--depth === 0) { args.push(cur.trim()); break; } }
    else if (ch === "," && depth === 1) { args.push(cur.trim()); cur = ""; continue; }
    if (depth >= 1) cur += ch;
  }
  return args;
}
const TYPED = /^(null|new (Uint8|Uint8Clamped|Int8|Uint16|Int16|Uint32|Int32|Float32|Float64)Array\(.*\)|pixels|bytes|data as (Uint8Array|Uint8ClampedArray|Uint16Array|Int16Array|Uint32Array|Int32Array|Float32Array))$/s;

describe("BrowserGl2Port 共用画面守卫（CatsUp 贴图主线 0-4）", () => {
  it("methods that draw / clear / upload / read back / copy reset the shared GL state first", () => {
    const ms = methods(code), bad = [];
    for (const { name, body } of ms) {
      if (name === "_ensureBase") continue;
      const op = GL_OPS.exec(body);
      if (!op) continue;
      const e = ENSURE.exec(body);
      if (!e || e.index > op.index) bad.push(`${name}() calls gl.${op[1]} before this._ensureBase() / this._ensure?.()`);
    }
    assert(ms.length > 20, `method scan found only ${ms.length} methods — the scanner is broken`);
    assert(bad.length === 0, `missing shared-context reset:\n  ${bad.join("\n  ")}`);
  });

  it("no texture upload from page elements (image / canvas / video / ImageBitmap) — only byte arrays or null", () => {
    const bad = [];
    let seen = 0;
    for (const m of code.matchAll(/\bgl\.(texImage2D|texSubImage2D|texImage3D|texSubImage3D)\s*\(/g)) {
      seen++;
      const args = callArgs(code, m.index + m[0].length - 1), last = args[args.length - 1] ?? "";
      if (/2D$/.test(m[1]) && args.length !== 9) bad.push(`gl.${m[1]}(${args.length} args) — the 2D byte-array form has 9; fewer means an image / canvas / video source`);
      else if (!TYPED.test(last)) bad.push(`gl.${m[1]}(…, ${last}) — source is not a byte array / null`);
    }
    assert(seen >= 4, `upload scan found only ${seen} calls — the scanner is broken`);
    assert(bad.length === 0, `DOM-source upload found (then _ensureBase must also reset UNPACK_COLORSPACE_CONVERSION_WEBGL):\n  ${bad.join("\n  ")}`);
  });
});
