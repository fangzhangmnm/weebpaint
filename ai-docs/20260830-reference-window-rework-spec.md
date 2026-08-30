# reference 整改批 spec（user 2026-08-30 逐条拍板定稿）

> created 20260830 by Claude Fable 5
> as-of v0.12.6 / 2026-08-30。出处 = 2026-08-30 对话（多轮 grill，user 逐条裁决）。
> 本文 = 整改批唯一 SSoT；v0.12 台账 park#1 指向这里。

## 1. ora 数据契约（零 backward migration）

**终态目录表**（新保存文件；按 CLAUDE.md「ora 布局变更纪律」上报用）：

```
mimetype                              ← spec 强制第一
stack.xml                             ← 结构 + wrote-with / weebpaint:format=2
mergedimage.png                       ← spec
data/layer<id>.png × N                ← spec
.weebpaint/editor-state.json          ← desk（含 refPanels manifest）
.weebpaint/references/<id>.jpg|.png   ← manifest 驱动，opaque id，扩展名说真话
.weebpaint/timelapse.json
.weebpaint/timelapse.mp4              ← 搬家（与自己的 json 团圆；原根目录）
Thumbnails/thumbnail.png              ← spec 强制，恒最后（byte-range 尾窗契约）
```

- **心智模型**：根目录 = ORA spec 领土；`.weebpaint/` = 全部 WP 私货（与云端 store `.weebpaint/`
  同词根同语义）。非点 `weebpaint/` **停写**（全库唯一写点=reference.png）。
- **manifest**（editor-state.json 内）：
  ```
  refPanel:  { enabled, position, viewport }            // 窗级（既有形状不动）
  refPanels: { index, items: [ { kind:"image", src, vp } | { kind:"live", vp } ] }
  ```
  live=零字节标记，load 按 kind 重绑合成 provider；未知 kind → 丢该条（entry 级降级不炸文件）。
- **读端路由全表**（集中 ora.ts，只在上报时更新）：
  | 读什么 | 新家 | 兜底链（只读不写） |
  |---|---|---|
  | 参考图 | `.weebpaint/references/`+refPanels | → `weebpaint/reference.png` → `webpaint/reference.png` |
  | timelapse mp4 | `.weebpaint/timelapse.mp4` | → 根 `timelapse.mp4` |
  | desk/timelapse.json | `.weebpaint/…` | → `.webpaint/…`（既有 dualRead） |
  | 旧轨 state.json | （停写已久） | `webpaint/state.json`（既有） |
- `ORA_FORMAT_VERSION` 1→2。⚠ `refPanels` 必须进 `freshGroups()`（mergeInto 默认键白名单，
  否则 Unserialize 静默丢）。

## 2. 压缩政策（user：「体量压缩优化是一定要做的」「静默同意」「1024²像素数量」；
##    0830 补拍板：「字节条件同意…用500kb…两个同时加」「gif不应该支持允许…只看第一帧」）

1. 面积 ≤ 1024² px **且字节 ≤ 500KB 且非 GIF** → **原字节原样进 ora**（像素画/小图/贴纸豁免：
   无损、透明顺带保住；字节条件堵「小面积重字节」洞——高噪 PNG/动图容器）；
2. 其余 → 等比缩到 ≤1024² 像素数（已达标则原尺寸），**拍平白底 → jpeg q≈85**（png 分支撤销）；
3. 压完更大 → 保原字节——**GIF 除外**（禁原样是硬条件：显示本来只有首帧，存原件=假 affordance）。
   完成后状态行报「已压缩 X→Y」（变大不谎报）。**无选择对话框**。
- 体量参考：1024² jpeg ≈ 平涂 50–150KB / 照片 150–300KB / 最坏 600KB。
- 管线家规：解码走浏览器解码边界（shell/image-io.ts）、缩放走既有 resample、编码走
  vendored jpeg-js `encodeJpegFromBytes`（纯字节零 canvas）。

## 3. UI（borderless，「丝薄」）

- **标题栏去掉**。常驻件只剩三样：**＋**（角落，半透明，闲置淡至 ~35%）、角 grip（resize，
  可见 affordance 保留——触屏盲边带否决）、N>1 时两枚 ‹ › 半透明 chip（带 n/N 微标；N=1 全消失）。
- **＋ = 菜单 + 拖把**：tap 弹菜单 / 按住拖 = 拖窗（slop 阈值区分）。菜单：导入（本地文件 /
  剪贴板 / 云盘图片 / 画布镜像 live）· 删除这张（菜单内二段确认=防误碰）· 关闭窗口。
- **长按 = 吸色**（吸色钮撤；窗内不能画，长按无歧义，与画布长按吸色肌肉记忆同构）。
- **双击 = 适应/reset**（既有，显式钮撤）。翻页=核心循环故不入菜单（‹ › chip）。
- 最小边 ~96px；窗形自由（细长条贴全身立绘）。
- **0830 落地后补拍板批**：①＋/chips 指针修（pointer，真拖才 grabbing）；②窗体视口护栏四路
  （越界回灌/开窗/浏览器 resize/native resize）；③**图缩放护栏**——放大顶 50×，缩小只护到
  长边显示 ≥16px（user：会故意缩很小看像素图标效果，别护过头）；④**平移护栏**——图 bbox 与
  画布保 ≥24px 重叠（永远找得回来）；⑤**菜单加「1:1 像素」**（1 图像素=1 设备像素、摆正、
  画布中心锚定）；⑥**图层面板头部 PiP shortcut**（✕ 旁；心理学讨论落地，肌肉记忆落点接住）。

## 4. 渲染

- **放大 nearest**（像素画 friendly）：scale 达阈值关 `imageSmoothingEnabled`；缩小保持平滑。
  阈值与编辑器手感对齐，实施时定。
- **小点与主画布对齐**：`background-attachment: fixed`（屏幕空间，拖窗点不动=浮在同一张桌布）
  + y 相位补偿 CSS 变量（GL 原点画布左下 vs CSS 视口左上，差 = 画布高 mod 24px，board resize 时喂）。
  非整数 dpr 档半像素误差接受。

## 5. API（genai era 预留）

`addReferenceImage(blob, opts?)` = 唯一导入漏斗（转码→manifest→翻到新张）；菜单每项与未来
genai 全走它。genai 入口显隐走既有 `.needs-gen-ai`/`body[data-gen-ai]` 接缝，API 本身先立。

## 6. 明确不做 / 已否决

- 缩略图栏 / 多窗（模型=单窗翻页）；导入选择对话框；refs 容器外缓存/囤积库（隐私：参考图常比
  作品更敏感，留容器内让 .ora 加密路线自动覆盖）；旧 entry 追溯搬家（timelapse 旧根目录字节不迁，
  读端兜底）；png 转码分支。
- 「auto convert to jpeg?」疑问句已由压缩政策 supersede（user 拍板必做）。
