// deployment.ts —— 「我装在哪」「我被套在别人页面里没有」的唯一回答处（家族规则书 ai-docs/20261103-three-shapes-rulebook.md §1 第 9 条 / §3；
//   全家同名同形，WeebPaint 是样板）。created 2026-11-03 by Claude Opus 5.5（家族工单 B）
//
// 规矩：**全仓只有这个文件准看 `location.protocol` / `window.top` / 打包烤进来的 `<meta name="deployment">`**
//   （test/deployment-guard.test.mjs 守）。消费者不问「是哪种」，只问「能不能」——去读 deployment-policy.ts 的开关；
//   本文件零依赖（叶子），谁都能 import，不会成环。
//
// 三种形态（规则书 §0）：
//   "site"  = 官网（weebpaint.com，含 /dev/；也含「单文件经 http://localhost 服」的逃生舱——那是 http 源，存储 / 登录都按官网走）
//   "itch"  = 整份交给 itch、被套在 itch 页面里（scripts/pack-standalone.mjs 往 itch 那份 index.html 里烤 meta）
//   "local" = 备用版：单文件 html 下载后双击打开（file:）
// 判定顺序：file: 协议 → "local"（优先于标记：存储现实按协议走——itch 那份 zip 被人下载下来双击，也是共桶的本地文件）；
//   有 `<meta name="deployment" content="itch">` → "itch"；否则 "site"。一页之内不会变，算一次缓存住。

export type Deployment = "site" | "itch" | "local";

let _cached: Deployment | null = null;

/** 打包器烤进 itch 那份 index.html 的标记（scripts/pack-standalone.mjs 写同一串；test/deployment-guard.test.mjs 核两边一致）。 */
export const DEPLOYMENT_META = '<meta name="deployment" content="itch" />';

/** 纯判定（单测逐条钉）：协议 + 标记 → 部署方式。 */
export function classifyDeployment(protocol: string | undefined, marker: string | null | undefined): Deployment {
  if (protocol === "file:") return "local";
  if (marker === "itch") return "itch";
  return "site";
}

function _detect(): Deployment {
  let protocol: string | undefined;
  let marker: string | null = null;
  try { protocol = typeof location !== "undefined" ? location.protocol : undefined; } catch { /* 没有 location（node 测试） */ }
  try { marker = typeof document !== "undefined" ? document.querySelector('meta[name="deployment"]')?.getAttribute("content") ?? null : null; } catch { /* 没有 DOM */ }
  return classifyDeployment(protocol, marker);
}

/** 这一份装在哪。 */
export function deployment(): Deployment {
  return (_cached ??= _detect());
}

/** 被套在别人页面里（window.self !== window.top；跨源访问 top 抛异常也算被套着）。没有 window（node）= 没被套。
 *  消费者：文件选择器 / 选文件夹框（浏览器在跨源子框里一律禁，itch 实锤 2026-08-28）。
 *  注意比旧的 pickerAllowedInFrame 严一点：同源 iframe 现在也算被套着（家族同一个定义；WeebPaint 没有被同源页面套着用的出货形态）。 */
export function embedded(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.self !== window.top; } catch { return true; }
}

/** 备用版（file:）时这个 html 的文件名（逃生舱说明里要提它：「在这个文件所在的文件夹起本地服务器」）；不是本地文件 = null。 */
export function localFileName(): string | null {
  if (deployment() !== "local") return null;
  try { return decodeURIComponent(location.pathname.split("/").pop() || "") || "weebpaint-standalone.html"; }
  catch { return "weebpaint-standalone.html"; }
}
