// Theme guard（2026-10-17 从 index.html 内联 <script> 搬成独立文件：CSP 不放行内联脚本；moved by Claude Opus 5.5）。
// 同步 classic script、在样式表之前 → 首帧前落 [data-theme]，和内联时一样不闪白。standalone 打包时 pack-standalone.mjs 把它原样内联回去。
// Theme guard：在样式表生效前把 [data-theme] 落上去，避免 FOUC。
// 键 = device-kv 的 pref:color-theme（P5 2026-08-27：theme SSoT=device-kv 单源——本 guard 与
//   theme.ts 运行时读**同一个键**，JSON 存储所以剥引号；旧 weebpaint.boot.theme 只作升级兜底读）。
//   ⚠ 改键名时**务必**同步改 device-kv.ts 的 PREFIX / app-prefs 的 _dk，否则 guard 静默失效、
//     夜间冷启动闪白（v406-v408 的 webpaint.theme 哑巴回归同款）。
(function () {
  try {
    var saved = localStorage.getItem("weebpaint-bd6cece69075d759:pref:color-theme")
             || localStorage.getItem("weebpaint.boot.theme");
    if (saved) saved = saved.replace(/"/g, "");
    if (saved === "day" || saved === "night" || saved === "auto") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (_) {}
})();
// iPad 没 devtools — 任何脚本错误糊一张底部红色浮卡，方便远程诊断
//   （v0.9.4 从顶部通栏挪到底部浮卡，别压无框顶栏；样式和 src/error-badge.ts BANNER_CSS 保持同步）
(function () {
  function show(text) {
    var bar = document.getElementById("__errBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "__errBar";
      bar.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:max(env(safe-area-inset-bottom,0px), 12px);z-index:9999;width:calc(100% - 24px);max-width:640px;box-sizing:border-box;padding:10px 14px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);background:#c0392b;color:#fff;font:13px/1.4 system-ui;white-space:pre-wrap;word-break:break-word;max-height:50vh;overflow:auto";
      bar.addEventListener("click", function () { bar.remove(); });
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.textContent = text + "  (点击关闭)";
  }
  window.__wp_showFatal = show;
  window.addEventListener("error", function (e) {
    var m = (e && e.message) || (e && e.error && (e.error.message || String(e.error))) || "脚本错误";
    var src = e && e.filename ? " (" + e.filename.split("/").pop() + ":" + e.lineno + ")" : "";
    show(m + src);
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e && e.reason;
    show((r && r.message) || String(r || "promise rejection"));
  });
})();
