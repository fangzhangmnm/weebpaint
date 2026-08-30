// 职责（单一）：云账号 UI —— gallery header 右侧的云 icon 按钮 + 账号 info 行 + 刷新钮。
// 一颗云图标 + 状态色：未登录灰，已登录蓝勾；刷新按钮只在登录后显示。
// （独立登录/退出按钮 2026-08-30 退役：登录并进「连接 OneDrive」、退出并进「断开连接」，见 gallery-manage-ui。）
//
// 不含：anchorPopupToBtn（多 popup 共用，留 app）、document-pointerdown 关 popup
// （三个 popup 共用，留 app）、gallery 自身的云列表/refresh 逻辑。
//
// auth 是公共面：直接 import 自 app-store.js。setStatus / updateSaveStatus / gallery
// 经 ctx 注册表晚绑（拆分期权宜）。

import { t, tLatin } from "../i18n/index.ts";
import { renderGalleryManage } from "./gallery-manage-ui.ts";   // P3：popup = 图库管理面 + 账号（一起刷）
import type { AppContext } from "../app-context.ts";
import { els } from "../els.ts";
import { iconHtml } from "../ui/icon.ts";
import {
  isSignedIn, isAuthConfigured,
  getActiveAccount, retrySilentSignIn,
} from "../app-store.ts";

let updateSaveStatus: AppContext["updateSaveStatus"];
let gallery: AppContext["gallery"];

const ICON_CLOUD_OUT = iconHtml("cloud");
const ICON_CLOUD_IN = iconHtml("cloud-synced");

export function updateCloudAuthUI() {
  try { renderGalleryManage(); } catch { /* P3 管理面未 init（boot 极早）；auth 面照常 */ }
  const signed = isSignedIn();
  const configured = isAuthConfigured();
  const offline = navigator.onLine === false;     // navigator.onLine=undefined 当 true
  if (signed) {
    const acc = getActiveAccount();
    els.cloudIconBtn.innerHTML = ICON_CLOUD_IN;
    els.cloudIconBtn.dataset.cloudState = "signedin";
    const who = acc?.username || acc?.name || t("cf.signedIn");
    els.cloudIconBtn.title = offline ? t("cf.cloudAccountOfflineTitle", { who }) : t("cf.cloudAccountTitle", { who });
    els.cloudAccountInfo.textContent = offline ? t("cf.cloudAccountOfflineInfo", { who }) : t("cf.cloudAccountInfo", { who });
    els.cloudRefreshBtn.classList.toggle("hidden", offline);   // 离线时藏刷新（按了没意义）
  } else {
    els.cloudIconBtn.innerHTML = ICON_CLOUD_OUT;
    els.cloudIconBtn.dataset.cloudState = configured ? "out" : "unconfigured";
    if (offline && configured) {
      els.cloudIconBtn.title = tLatin("cf.cloudOfflineTitle");
      els.cloudAccountInfo.textContent = t("cf.cloudOffline");
    } else {
      els.cloudIconBtn.title = configured ? t("cf.cloudNotSignedInTitle") : t("cf.cloudNotConfigured");
      els.cloudAccountInfo.textContent = configured ? t("cf.cloudNotSignedIn") : t("cf.cloudNotConfigured");
    }
    els.cloudRefreshBtn.classList.add("hidden");
  }
  // 独立登录/退出按钮已退役（2026-08-30 user 拍板）：登录并进「连接 OneDrive」、退出并进「断开连接」
  //   （gallery-manage-ui）；本模块只剩 icon 态 + 账号 info 行 + 刷新钮。
  // 编辑器主菜单登录项（v0.6.22 menuSignIn）已删 2026-08-21：编辑器内登录统一走 smart save 的
  //   「现在登录同步？」sheet（topbar-menu.smartSaveAndPush，同「未登录+已配置+在线」判据）。
  updateSaveStatus();
}

export function initCloudAuthUI(ctx: AppContext) {
  ({ updateSaveStatus, gallery } = ctx);

  // 云 icon popup（anchorPopupToBtn 在 app；toggle 其它 popup 也在 app 的 handler 里——
  // 故云 icon 的 click 仍由 app 绑定 anchorPopupToBtn/互斥关闭。本模块只接登录/退出/刷新动作）。

  els.cloudRefreshBtn.addEventListener("click", async () => {
    // 离线 → 在线 后第一次按"刷新"：若未签到但有缓存账号，silent retry 一次
    if (!isSignedIn() && navigator.onLine !== false) {
      await retrySilentSignIn();
      updateCloudAuthUI();
    }
    gallery.refresh();
  });
}
