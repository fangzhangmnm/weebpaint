// deployment-policy.ts —— 部署方式 × 行为（家族规则书 ai-docs/20261103-three-shapes-rulebook.md §2 那张表；纯函数）。
//   created 2026-11-03 by Claude Opus 5.5（家族工单 B）
//
// 消费者只问开关（「能不能」），不问「是哪种」。每个开关都必须有真消费者（规则书 §4 第 13 项：没有恒 true / 只接一半）：
//   test/deployment-guard.test.mjs 逐格钉死这张表，并 grep 每个键在本文件以外至少被一个源码文件读到。
//   cloud                         → src/app-store.ts（false = 不建 OneDrive provider：不载 MSAL、initAuth 无事可做）
//                                   + src/gallery/gallery-manage-ui.ts（入口灰 +「去官网」）
//   folderGallery                 → src/gallery-connect.ts（选文件夹当图库）
//   rememberPassword              → src/app.ts → src/remember-password.ts（enabled）
//   rememberPasswordSharedBucket  → src/app.ts（口令面板勾选框旁的披露句）
//   serviceWorker                 → src/pwa-shell.ts（离线壳注册）
//   siteHint                      → src/site-hint.ts（开局一行）+ src/gallery/gallery-manage-ui.ts（灰入口副标题）
// 前五个键是家族同名同形的那一组（规则书 §3）；rememberPasswordSharedBucket 是 WeebPaint 多出来的一格：§2「记住口令」那行
//   备用版是「✓ + 共桶披露」，一个布尔装不下（user 11-03 知情同意，ADR-0015 追加注）。
import { deployment, type Deployment } from "./deployment.ts";

export interface DeploymentPolicy {
  /** 网盘（OneDrive）。false = 不载 MSAL、不 initAuth；入口画灰 +「去官网」。 */
  readonly cloud: boolean;
  /** 选本地文件夹当图库（还要叠浏览器能力：有选文件夹框、没被跨源套着）。 */
  readonly folderGallery: boolean;
  /** 在这台设备上记住图库密码（≤ 30 天，库上限）。 */
  readonly rememberPassword: boolean;
  /** 记住口令的勾旁要说一句「这台电脑上双击打开的别的网页也拿得到这把钥匙」（Chromium 里所有双击打开的网页共一个存储桶）。 */
  readonly rememberPasswordSharedBucket: boolean;
  /** 离线壳（service worker）。 */
  readonly serviceWorker: boolean;
  /** 开局一行 + 灰入口副标题里的「去官网」（SITE_URL）。 */
  readonly siteHint: boolean;
}

const TABLE: Readonly<Record<Deployment, DeploymentPolicy>> = Object.freeze({
  //            网盘          文件夹图库            记住口令                 共桶披露                             离线壳                去官网
  site:  Object.freeze({ cloud: true,  folderGallery: true,  rememberPassword: true,  rememberPasswordSharedBucket: false, serviceWorker: true,  siteHint: false }),
  itch:  Object.freeze({ cloud: false, folderGallery: false, rememberPassword: false, rememberPasswordSharedBucket: false, serviceWorker: false, siteHint: true }),
  local: Object.freeze({ cloud: false, folderGallery: true,  rememberPassword: true,  rememberPasswordSharedBucket: true,  serviceWorker: false, siteHint: true }),
});

/** 某种部署方式的开关（纯函数；单测逐格钉）。 */
export function policy(d: Deployment): DeploymentPolicy {
  return TABLE[d];
}

/** 这一份的开关（= policy(deployment())）。 */
export function currentPolicy(): DeploymentPolicy {
  return TABLE[deployment()];
}
