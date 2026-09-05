// 第一方调色 / 调整插件 barrel
// app.js 一次 import 这里就完成所有 built-in filter 注册。
//
// 加新内建插件：在下面 import 一行即可。
// 第三方下载插件（mosaic、halftone、stained glass、教堂彩窗 等）后期走
// fetch + dynamic import + window.WeebPaint.registerFilter(...)，
// 不需要 ship 时打包进 bundle。论证：ai-docs/20260528-backlog.md AI 插件 / artist filter 段

// 调色组（category="adjustment"）
import "./hsb.ts";
import "./color-balance.ts";
import "./curves.ts";
// 笔刷类（modes=["brush"]）：sharpenBlur 和 liquify 走 filter brush engine
import "./sharpen-blur.ts";
import "./liquify.ts";
import "./smudge.ts";        // 2026-09-05 手指 / 涂抹（smear / dull / paint；toolbar 手指钮 + fx 菜单两入口）
// 风格化组（category="artist"）—— 3 个同主题合一个 plugin 文件
import "./stylize-filters.ts";
