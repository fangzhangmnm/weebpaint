// site-hint.ts —— 开局一行：① itch / 备用版「这一份连不了网盘……完整版在 weebpaint.com」；② 浏览器不给存（Safari 双击等）「没测过 + 存不住 + 报告入口」（家族规则书 ai-docs/20261103-three-shapes-rulebook.md
//   §1 第 6 条 / §4 第 10 项：文案进 i18n、SITE_URL 插值、**不弹窗不重复**）。created 2026-11-03 by Claude Opus 5.5（家族工单 B）
//   走通知条（workbench-elements notice，info 级、可关、15 s 自己收；和 format-notice 同一种），一页一次。官网（siteHint=false）什么都不说。
//   文案两句选一：这里挂得上本地文件夹图库（备用版的 Chromium 桌面）→「可以放在本地文件夹图库」；挂不上（itch、Firefox / Safari 双击）→「存成下载的文件」。
//   挂不挂得上由调用方（app.ts）问 gallery-connect.canPickFolderGallery() 递进来——本模块不 import 图库那一串。
import { showNotice } from "@internal/workbench-elements";
import { currentPolicy } from "./deployment-policy.ts";
import { SITE_HOST, ISSUES_URL, ISSUES_HOST } from "./config.ts";
import { t } from "./i18n/index.ts";

let _said = false;

/** 开局调一次。说了 → true；官网 / 已经说过 → false。 */
export function sayHintOnce(opts: { folderGallery: boolean }): boolean {
  if (_said || !currentPolicy().siteHint) return false;
  _said = true;
  showNotice({
    id: "site-hint",
    level: "info",
    text: t(opts.folderGallery ? "boot.siteHintFolder" : "boot.siteHintNoFolder", { site: SITE_HOST }),
    dismissLabel: t("upd.dismiss"),
    autoHideMs: 15_000,
  });
  return true;
}

let _saidBlocked = false;
/** 浏览器不给存（app-store storeAbsentReason === "storage-blocked"；规则书 §1 第 12 条，工单 B2）：开局一句「这个浏览器我们没测过、
 *  存不住设置和崩溃备份、作品存成文件、有问题去 issues」+ 一个「去报告」钮（新标签开 ISSUES_URL）。警告级、不自己收、一页一次、不弹窗。
 *  开发开关（?nostore）不走这里——那不是「浏览器不行」。 */
export function sayStorageBlockedOnce(): boolean {
  if (_saidBlocked) return false;
  _saidBlocked = true;
  showNotice({
    id: "storage-blocked",
    level: "warning",
    text: t("boot.storageBlocked", { issues: ISSUES_HOST }),
    actions: [{ label: t("boot.reportIssue"), onClick: () => { try { window.open(ISSUES_URL, "_blank", "noopener"); } catch { /* 开不了新标签：网址就在正文里 */ } } }],
    dismissLabel: t("upd.dismiss"),
  });
  return true;
}
