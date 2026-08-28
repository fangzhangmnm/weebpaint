// cloud-capability —— 「云端/图库能力」判定的**单一接缝**（2026-08-21 立；P3 sunset 2026-08-27 换真相源）。
//
// P3 sunset（P5 §9.8 判死缓的落地）：cloud-enabled toggle 退役——「关云」的真身 = **没挂图库**。
//   isCloudEnabled() 从「device pref 开关」改读**真状态**：当前有活店（attachment attached，或 legacy
//   预建店在岗）= true；null-store（已卸下/无库模式）/ store-absent = false。
//   auth 无关化：本地文件夹图库无需登录也是「有库」——老定义 isAuthConfigured 门会把 folder 库误杀。
// 消费方（audit 走本模块 import 图）：settings-menu gating / save-status 徽章 / topbar-menu smart save +
//   图库入口 / boot 冷启动恢复门 / gallery-shell 中央兜底闸 / export-import-menu / crash-banner。
//
// 【自愈红线】判定是**纯读**，零数据变更；开关动词（连接/卸下）在 gallery-manage-ui，数据安全在
//   attachment 器官的绿灯门里，与本模块无关。
//
// cloudPrefEnabled：退役遗产的**播种源**——只供 gallery-registry 播种读（false → lastActive=null，
//   即「关着云」播成「没挂库」）。UI 不再有 toggle；pref 键物理清理挂 P7 还原出厂设置。

import { preferences } from "./app-prefs.ts";
import { hasLiveStore } from "./app-store.ts";

/** 能力变更广播（window 事件；消费方自己重读 isCloudEnabled()）。P3 起由换库事件驱动。 */
export const CLOUD_CAPABILITY_EVENT = "wp:cloud-capability-changed";

/** 退役 pref 的播种源读口（见头注释；除播种外别再消费）。 */
export function cloudPrefEnabled(): boolean {
  return preferences.get("cloud-enabled");
}

/** 图库能力真状态：有活店 = true（folder 库不需要登录也是有库）；无库模式/absent = false。 */
export function isCloudEnabled(): boolean {
  return hasLiveStore();
}

// 换库/卸库（wp:gallery-changed）→ 能力事件重贴（消费方一处订阅不用改）。
try {
  window.addEventListener("wp:gallery-changed", () => {
    try { window.dispatchEvent(new Event(CLOUD_CAPABILITY_EVENT)); } catch { /* noop */ }
  });
} catch { /* node 测试环境无 window */ }
