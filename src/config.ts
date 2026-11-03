// Azure AD App registration for WeebPaint。Phase 2（云同步）会用到 MSAL；
// phase 1 本地持久化暂时不读取这里。
//
// 部署清单（已建好的 SPA app，Personal Microsoft accounts only）：
//   - Display name:  WeebPaint
//   - Application (client) ID: 18c496a6-5d86-4ff5-8dd0-67d565480a3e
//   - Object ID:     7ef0ff74-cdcc-44a6-8dca-60ec903fe3aa
//   - Tenant ID:     c1fef054-68f1-48db-9097-61acbe59b8ac
//   - Redirect URIs: SPA × 2（dev https://weebpaint.com/dev/ / prod https://weebpaint.com/）
//
// 官网网址（家族规则书 20261103 §1 第 6 条：一个 app 一处常量；「去官网」文案全部插值它，不许散写进 UI / i18n 字符串）。
//   消费者 = src/site-hint.ts（开局一行）+ src/gallery/gallery-manage-ui.ts（灰入口副标题 / 说明）。added by Claude Opus 5.5 2026-11-03
export const SITE_URL = "https://weebpaint.com";
/** SITE_URL 给人看的那段（「weebpaint.com」）。 */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "");
// 报告入口（家族规则书 §1 第 12 条「没验过的明说 + 报告入口」；工单 B2，Fable 2026-11-03）：本仓 GitHub issues。和 SITE_URL 同规矩——
//   只准在这里出现（test/deployment-guard.test.mjs ④），文案插值 {issues}。消费者 = src/site-hint.ts（浏览器不给存那句）。added by Claude Opus 5.5
export const ISSUES_URL = "https://github.com/fangzhangmnm/weebpaint/issues";
export const ISSUES_HOST = ISSUES_URL.replace(/^https?:\/\//, "");

// 自家前缀 token（家族规则书 §1 第 3 条 / §4 第 1 项：库名、键名、锁名、频道名都带它；永不碰、永不枚举别人的前缀）。
//   仓里只有这一处字面量（test/storage-whitelist.test.mjs 守：src 里别处出现这串 = 红）。theme-guard.js 是首帧前的经典脚本、
//   不进 bundle，只读 device-kv 的主题键，那里照抄一份，守卫同样核它一致。added by Claude Opus 5.5 2026-11-03
export const APP_NS = "weebpaint-bd6cece69075d759";

// CLIENT_ID 占位时（"REPLACE_ME..."）走纯离线，不去碰 MSAL bundle。
export const CLIENT_ID = "18c496a6-5d86-4ff5-8dd0-67d565480a3e";

// consumers = 只认个人 MSA（注册的 Supported account types 已翻成 Personal only，
// 走 /common 会被端点顶回 invalid_request userAudience）
export const AUTHORITY = "https://login.microsoftonline.com/consumers";

// AppFolder = approot 沙盒；offline_access 给 silent refresh token
export const SCOPES = ["Files.ReadWrite.AppFolder", "offline_access"];

// 把 sessionName 转成 cloud / IDB key 文件名。phase 1 只有一个 fixed slot
// （"current"），还用不上这个；phase 2 多 session 时再用。
//   "未命名"          → "未命名.ora"
//   "characters/wall" → "characters/wall.ora"
// **裸名的归一化（SSoT）**。sessionFileName = 本函数 + ".ora"。
//
// ⚠ 它**不是单射**：`[\:*?"<>|]+` 整段换成一个 `_`、按段 trim、丢空段。所以
//   a:b / a*b / a_b / a__b 全都塌成 a_b；" a " 和 a 塌成 a；"" 和 "///" 塌成「未命名」。
// 这本身没问题（文件名就是要合法化），**有问题的是「存原始名、比较时才归一」**：
//   gallery 的 item.name 来自 store（已归一），而 app 侧若存着用户敲的原始名，
//   `item.name === activeName` 这类比较就会永久失配。v437 之前有五处这样的比较，
//   最狠的一处让活动文档改名绕过 es.rename() → 盘上文件改了名、编辑器还指着旧身份 →
//   下次 autosave 以 mode:"existing" 把旧身份重建出来 → **两个文件，可见的那个不是正在编辑的那个**。
// → 纪律：**在赋值处归一化**，别在比较处补救。活动名一旦落地就已经是归一形式。
export function sessionBareName(sessionName: string) {
  const segments = (sessionName || "Untitled")   // 防御 fallback（正常路径名字来自 session-state 的 t("nd.untitled")）；config 在 store 上游不引 i18n
    .split("/")
    .map((s: string) => s.replace(/[\\:*?"<>|]+/g, "_").trim())
    .filter(Boolean);
  if (!segments.length) segments.push("Untitled");
  return segments.join("/");
}

// 把 sessionName 转成 cloud / IDB key 文件名。
//   "未命名"          → "未命名.ora"
//   "characters/wall" → "characters/wall.ora"
export function sessionFileName(sessionName: string) {
  return `${sessionBareName(sessionName)}.ora`;
}

// （encSessionFileName 已删 v415：零调用者。app 不再向 store 注入 encFileName——
//   「加密件云端叫 X.ora.zip」这条命名规则整个由库内部持有（见 app-store.ts 的说明）。）

// 云端 path → session name（sessionFileName/encSessionFileName 的逆）。
// 所有「path 去扩展名」的地方都走这里，别再散落 \.ora$ 正则（加密文件是 .zip）。
export function stripSessionExt(path: string) {
  return String(path).replace(/\.(ora|zip)$/i, "");
}
