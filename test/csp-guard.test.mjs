// CSP 守卫（2026-10-17，user「csp…一起上」）：index.html 头上的内容安全策略逐条钉死，不许被悄悄放松；页面也不许长回内联脚本 / 内联事件。
// 'unsafe-eval' 2026-10-21 退场（总账 #89，Claude Fable 5.1）：本仓 Vue 模板构建时编好（src/vue-templates.ts → .compiled.ts）+ gallery 0.8.4 预编译 → 运行时零 eval。
// created 2026-10-17 by Claude Opus 5.5
import { readFileSync } from "node:fs";
import { describe, it, assert, eq } from "./runner.mjs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
const policy = new Map((m?.[1] ?? "").split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const [k, ...v] = d.split(/\s+/); return [k, v.join(" ")]; }));

describe("csp-guard", () => {
  it("index.html 有 CSP meta，且在第一个 <script> 之前", () => {
    assert(m, "no CSP meta");
    assert(html.indexOf(m[0]) < html.indexOf("<script"), "CSP meta must come before any script");
  });
  it("脚本只准本站文件：没有 unsafe-inline / unsafe-eval / 外站 / 通配（wasm-unsafe-eval 给 7z-wasm 等）", () => {
    eq(policy.get("script-src"), "'self' 'wasm-unsafe-eval'");
  });
  it("连接：本站 + https + 本机 Blender（127.0.0.1 / localhost），别的 http 不放", () => {
    eq(policy.get("connect-src"), "'self' https: blob: data: http://127.0.0.1:* http://localhost:*");
  });
  it("iframe 只准本站 + 微软登录；object none / base self / form self / default self", () => {
    eq(policy.get("frame-src"), "'self' https://login.microsoftonline.com https://login.live.com");
    eq(policy.get("object-src"), "'none'");
    eq(policy.get("base-uri"), "'self'");
    eq(policy.get("form-action"), "'self'");
    eq(policy.get("default-src"), "'self'");
  });
  it("没有内联脚本（JSON-LD 数据块除外）、没有内联事件属性", () => {
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/g)].map((x) => x[0]);
    eq(inline.length, 0, `inline <script>: ${inline.join(" ")}`);
    eq((html.match(/\s on[a-z]+\s*=\s*["']/gi) ?? []).length, 0, "inline event handlers");
  });
  it("standalone 打包器会去掉 CSP、把 theme-guard.js 内联回去（单文件版全是内联脚本）", () => {
    const pack = readFileSync(new URL("../scripts/pack-standalone.mjs", import.meta.url), "utf8");
    assert(/Content-Security-Policy/.test(pack) && /theme-guard\.js/.test(pack), "pack-standalone must strip the CSP and inline theme-guard.js");
  });
});
