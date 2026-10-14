// test/sw-redirect.test.mjs —— 离线壳碰到跳转响应原样交回（家族周账 F-28；同 MoonSinger test/sw-redirect.test.ts）。created 2026-10-14 by Claude Fable 5.1
//   导航请求的 fetch 拿到 301 / 302 时交回的是 type opaqueredirect、status 0 的 Response；withNoStore 拿它的 status 重建 Response 会抛 RangeError → 整次导航失败
//   （搬子域名之后旧地址 301 过来就撞）。这里把 service-worker.js 的源码在 node 里装上假的 self 跑起来，直接喂一个 status 0 的 Response。
//   反证：把 withNoStore 里「跳转响应原样交回」那一行删掉 = 第一条红（RangeError）。
import { describe, it, eq, assert } from "./runner.mjs";
import fs from "node:fs";

function loadSw() {
  const src = fs.readFileSync(new URL("../service-worker.js", import.meta.url), "utf8");
  const self = { addEventListener() {}, location: { pathname: "/", origin: "https://example.invalid", href: "https://example.invalid/" }, skipWaiting() {}, clients: { matchAll: async () => [] }, registration: {} };
  const factory = new Function("self", `${src}\nreturn { withNoStore };`);
  return factory(self);
}
/** 浏览器里的「跳转响应」在 node 里造不出来（Response 构造器不收 status 0）——拿一个真 Response 把 status / type 盖成那样。 */
function opaqueRedirect() {
  const r = new Response(null, { status: 204 });
  Object.defineProperty(r, "status", { value: 0 }); Object.defineProperty(r, "type", { value: "opaqueredirect" }); Object.defineProperty(r, "ok", { value: false });
  return r;
}

describe("离线壳：导航响应（WeebPaint）", () => {
  it("跳转响应（opaqueredirect / status 0）原样交回，不重建、不抛", async () => {
    const sw = loadSw(), r = opaqueRedirect();
    assert((await sw.withNoStore(Promise.resolve(r))) === r, "应该是同一个 Response 对象（原样交回）");
  });
  it("普通 200 导航响应照旧加 Cache-Control: no-store", async () => {
    const sw = loadSw();
    const out = await sw.withNoStore(Promise.resolve(new Response("<html>", { status: 200, headers: { "content-type": "text/html", etag: "x" } })));
    eq(out.status, 200); eq(out.headers.get("cache-control"), "no-store"); eq(out.headers.get("etag"), "x"); eq(await out.text(), "<html>");
  });
});
