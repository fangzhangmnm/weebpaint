// 「记到哪天」的显示（2026-10-17 在这台设备上记住密码）：跟界面语言走；toki pona 没有月份名 → 数字日期。created by Claude Opus 5.5
import { lang } from "./i18n/index.ts";

const LOCALE = { zh: "zh-CN", en: "en", ja: "ja-JP" } as const;
export function rememberDayText(ms: number): string {
  const l = lang();
  if (l === "tok") { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  return new Date(ms).toLocaleDateString(LOCALE[l], { month: "long", day: "numeric" });
}
