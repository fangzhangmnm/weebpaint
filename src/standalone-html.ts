// standalone-html.ts —— 单文件 html 交付物的运行时接缝（P6；约束调研 = 0825 survey §5，拍板 = verdicts §2.9）。
// created 2026-08-27 by Claude Fable 5.
//
// 打包器（scripts/pack-standalone.mjs）把外部资产灌进 `window.__WEEBPAINT_EMBED__`（文本原文 / 二进制 base64），
//   本模块是**唯一读口**。常规 build 无该全局 → 一切走原路——「html build = 全量 build 运行时 gate」
//   拍板：不做阉割 build，同一个 bundle 两种壳。
// 消费方：sevenzip（7zz.umd.js blob 注入 + wasm bytes）/ app-store（msal blob URL，逃生舱 localhost 用）/
//   brushes、canvas-templates、color-name（json 文本）/ pwa-shell（单文件 = SW 全家放弃，survey §5.3）。
// file:// 能力依据（survey §5.1 实测）：blob classic script ✅、wasm instantiate(ArrayBuffer) ✅、
//   内联 module ✅；fetch("./…") 在 file:// 必死——这正是本接缝存在的理由。

const _embed = (): Record<string, string> | null => {
  const g = globalThis as { __WEEBPAINT_EMBED__?: Record<string, string> };
  return g.__WEEBPAINT_EMBED__ ?? null;
};

/** 单文件形态？（= 打包器灌过资产。⚠ 不等于 file://——单文件也可能被 http 服（itch/逃生舱）。） */
export const isStandaloneHtml = (): boolean => _embed() != null;

/** 文本资产原文（json/js 源）。缺 = null（常规 build 恒 null → 调用方走 fetch 原路）。 */
export function embeddedText(name: string): string | null {
  return _embed()?.[name] ?? null;
}

/** 二进制资产（打包器存 base64）。 */
export function embeddedBytes(name: string): Uint8Array | null {
  const b64 = _embed()?.[name];
  if (b64 == null) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 文本资产 → blob URL（script src 用；每名缓存一份，页面生命周期内不 revoke）。 */
const _blobUrls = new Map<string, string>();
export function embeddedBlobUrl(name: string, mime: string): string | null {
  const hit = _blobUrls.get(name);
  if (hit) return hit;
  const text = embeddedText(name);
  if (text == null) return null;
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  _blobUrls.set(name, url);
  return url;
}
