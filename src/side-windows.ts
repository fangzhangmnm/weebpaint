// 职责（单一）：浮动辅助窗——参考小窗（<wp-reference-window> 组件的**宿主适配层**）+ 调色板小窗。
// C9（家族组件试点）后参考窗分两半：
//   组件（frontend/reference-window.ts）= chrome/手势/渲染/多页模型，宿主 store 零知识；
//   这里 = 全部宿主接线：desk.refPanel(s) 持久化、wp: 事件通道、live 合成（backend 知识）、
//   i18n labels、吸色 → 主 setColor + pin、导入漏斗（decode/转码 = backend/政策模块）。
// referenceWindow 导出 = 组件元素本身；app.ts 晚绑 Object.assign(ctx, {...}) 与 session-state 直接读。
//
// ══ 0830 整改批（spec=ai-docs/20260830-reference-window-rework-spec.md）══
//   多参考：desk.refPanels manifest（index+items[kind/src/vp]，src=refEntryName 与 encode 同函数同索引）；
//   导入唯一漏斗 = addReferenceImage（文件/剪贴板/云盘/未来 genai 全走它；1024² 拍平 jpeg 政策）。

import { t } from "./i18n/index.ts";
import { WpReferenceWindow } from "./frontend/reference-window.ts";
import type { RefItem, RefLiveSource, RefPanelRect, RefViewport } from "./frontend/reference-window.ts";
import { PaletteWindow } from "./palette.ts";
import { els } from "./els.ts";
import { decodeImageFile, imageSourceToBytes } from "./shell/image-io.ts";
import { withBusy } from "./fullscreen-busy.ts";
import { areaResampleBytes } from "./backend/algorithms/resample-bytes.ts";
import { encodeJpegFromBytes } from "./backend/jpeg-codec.ts";
import { refEntryName } from "./backend/ora.ts";
import type { DecodedReference } from "./backend/ora.ts";
import { planRefImport, flattenWhiteInPlace, REF_JPEG_QUALITY } from "./reference-transcode.ts";
import { readImageFromClipboard } from "./session.ts";
import { humanSize } from "./gallery/gallery-view-model.ts";
import { setColor } from "./color-panel.ts";
import { setMenuOpen } from "./settings-menu.ts";
import { registerFloatingWindow, floatingTopFloor, type FloatingWindowHandle } from "./ui/floating-window.ts";   // 2026-09-02 C2 浮窗深模块
import { togglePopupMenu } from "./ui/popup-menu.ts";   // 参考窗 ＋ 菜单端口（挂 body；组件 frontend/ 不得 import ui/）
import { desk } from "./workbench-state.ts";
import { renderNodesToCanvas } from "./backend/doc-render.ts";
import { pickCloudImage } from "./cloud-picker-host.ts";
import { reportError } from "./error-badge.ts";
import type { AppContext } from "./app-context.ts";
const errMsg = (e: unknown): string => String((e as { message?: unknown })?.message || e);

// initSideWindows(ctx) 填入；construct 期 null，仅事件回调（lazy）读取。
let setStatus: AppContext["setStatus"], editMode: AppContext["editMode"], state: AppContext["state"], doc: AppContext["doc"];

// ---- 参考小窗 ----
// 元素在 index.html（slot 文案吃宿主 i18n）；import 上面的组件模块已 define → 此处已升级。
export const referenceWindow = document.getElementById("referencePanel") as WpReferenceWindow;
// 浮窗生命周期端口（2026-09-02 C2）：z 栈 + 点窗置顶 + 视口变时把「出血区地板」推给组件。组件按 C2 目录格律自钳，
//   但地板只准一个出处（floating-window 运行时量顶栏下缘）；open/close 走组件自己的 open 属性，不经 handle。
const _refWin: FloatingWindowHandle = registerFloatingWindow(referenceWindow, {
  id: "reference",
  onViewport: (floor) => { referenceWindow.topFloor = floor; },
});
referenceWindow.topFloor = floatingTopFloor();

// 开/关的**用户路径**（menu/快捷键/菜单关闭项）写 desk（per-doc 标脏）；程序性回灌不经这里。
function refSetOpen(open: boolean) {
  referenceWindow.open = open;
  if (open) _refWin.raise();   // v232：开窗即置顶（window band）
  desk.refPanel.enabled = open;
}

// live 镜像合成（S9：走 GL doc-render，respect clip/mode/组）。白纸显示常量（doc 无纸色，
// 同 board docBg）。组件只吃这个 provider；返回 null = GL 不可用 → 组件保留上帧。
let _liveCanvas: HTMLCanvasElement | null = null;
function composeLiveFrame(): RefLiveSource | null {
  const merged = renderNodesToCanvas(doc.layers, doc.width, doc.height);
  if (!merged) return null;
  const W = doc.width, H = doc.height;
  if (!_liveCanvas) _liveCanvas = document.createElement("canvas");
  if (_liveCanvas.width !== W || _liveCanvas.height !== H) { _liveCanvas.width = W; _liveCanvas.height = H; }
  const cx = _liveCanvas.getContext("2d")!;
  cx.clearRect(0, 0, W, H);
  cx.fillStyle = "#ffffff";
  cx.fillRect(0, 0, W, H);
  cx.drawImage(merged, 0, 0);
  return _liveCanvas;
}

// ---- desk 同步（组件状态 → refPanels manifest；src 与 encode 同函数同索引 = 防漂移）----
const _DEFAULT_VP: RefViewport = { tx: 0, ty: 0, scale: 1, rot: 0 };
function syncRefsToDesk(): void {
  const st = referenceWindow.getRefState?.();
  if (!st) return;   // 无 CE 环境（boot smoke dom-shim）：组件未升级，desk 保持现状
  desk.refPanels = {
    index: st.index,
    items: st.items.map((it, i) => it.kind === "image"
      ? { kind: "image" as const, src: refEntryName(i, it.blob?.type || ""), vp: it.vp ?? { ..._DEFAULT_VP } }
      : { kind: "live" as const, vp: it.vp ?? { ..._DEFAULT_VP } }),
  };
  const cur = st.items[st.index];
  if (cur?.vp) desk.refPanel.viewport = { ...cur.vp };   // 旧字段镜像当前页（读端兼容/心智延续）
}

/** 保存收集（session-state _buildOraMeta 调）：先同步 desk manifest，再交出与 manifest **位置对齐**
 *  的 blob 列表（live 占位 null，encode 跳过但保索引）。 */
export function collectReferenceBlobsForSave(): (Blob | null)[] {
  syncRefsToDesk();
  const st = referenceWindow.getRefState?.();
  if (!st) return [];
  return st.items.map((it) => (it.kind === "image" ? it.blob : null));
}

/** 载入恢复（session-state 在 desk.Unserialize **之后**调）：decode 的 _references（manifest 顺序）
 *  → bitmap → 组件整表灌入；vp 按 desk.refPanels 对位取（旧文件单张 → desk.refPanel.viewport）。 */
export async function applyLoadedReferences(refs: DecodedReference[]): Promise<void> {
  const manifest = desk.refPanels;
  const legacySingle = manifest.items.length === 0;
  const items: RefItem[] = [];
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    const vp = legacySingle
      ? (legacyVpOrNull())
      : (manifest.items[i]?.vp ? { ...manifest.items[i].vp } : null);
    if (r.kind === "live") { items.push({ kind: "live", vp }); continue; }
    try {
      const bitmap = await createImageBitmap(r.blob);
      items.push({ kind: "image", bitmap, blob: r.blob, vp });
    } catch (e) {
      reportError(new Error("[side-windows] reference bitmap decode failed (item skipped): " + String(e)), "log");
    }
  }
  referenceWindow.setItems?.(items, legacySingle ? 0 : manifest.index);
}
function legacyVpOrNull(): RefViewport | null {
  const v = desk.refPanel.viewport;
  // 默认单位 vp = 从没动过（旧文件也可能真是单位 vp——fit 一下无损）
  return (v && (v.tx !== 0 || v.ty !== 0 || v.scale !== 1 || v.rot !== 0)) ? { ...v } : null;
}

// ---- 调色板小窗（v87）----
export const paletteWindow = new PaletteWindow({
  root: document.getElementById("paletteWindow")!,
  onColorSampled: (hex: string) => setColor(hex),
  getCurrentColor: () => state.color,
});
// 调色板小窗（v87 → v94 撤掉 menu 入口）：UI 已删，code 留 P2（backlog）

export function initSideWindows(ctx: AppContext) {
  setStatus = ctx.setStatus;
  editMode = ctx.editMode;
  state = ctx.state;
  doc = ctx.doc;
  const ref = referenceWindow;

  // live 合成端口：一次性 set（组件在当前页 kind=live 时消费；合成知识在宿主）。
  ref.liveProvider = composeLiveFrame;
  // ＋ 菜单端口（2026-09-02）：菜单挂 body 走 popup-menu 深模块（overflow:hidden 裁不到、z 在 menu band）；组件只描述项。
  ref.menuPort = (o) => togglePopupMenu(o);

  // ---- 组件事件 → desk 持久化（宿主 store 解耦：组件不认识 desk）----
  ref.addEventListener("viewportchange", () => syncRefsToDesk());
  ref.addEventListener("itemschange", () => {
    syncRefsToDesk();
    // 参考集合变（翻页/删除/加 live 页）= sidecar 变（S5·ADR-0007：跟 ora 走 ∧ 不进 undo）
    window.dispatchEvent(new CustomEvent("wp:sidecarchange", { detail: { kind: "reference" } }));
  });
  ref.addEventListener("rectchange", (e) => {
    // 值没变就不写：RO 在程序性回灌/开窗后也 fire，回声不许误标脏（旧 _savePos 同款守卫）
    const d = (e as CustomEvent).detail as RefPanelRect;
    const cur = desk.refPanel.position;
    if (cur && cur.left === d.left && cur.top === d.top && cur.width === d.width && cur.height === d.height) return;
    desk.refPanel.position = { ...d };
  });
  ref.addEventListener("openchange", (e) => {
    desk.refPanel.enabled = !!((e as CustomEvent).detail as { open: boolean }).open;
  });

  // ---- ＋ 菜单意图（组件只发意图；文件对话框/剪贴板/picker 都是宿主知识）----
  ref.addEventListener("requestload", () => {
    els.referenceFileInput.value = "";
    els.referenceFileInput.click();
  });
  ref.addEventListener("requestpaste", async () => {
    let blob: Blob | null | undefined;
    try { blob = await readImageFromClipboard(); }
    catch (e) { setStatus(t("mi.referenceLoadFailed", { err: errMsg(e) })); return; }
    if (!blob) { setStatus(t("se.clipboardNoImage"), true); return; }
    try { await addReferenceImage(blob); }
    catch (e) { setStatus(t("mi.referenceLoadFailed", { err: errMsg(e) })); }
  });
  ref.addEventListener("requestcloudload", async () => {
    try {
      const file = await pickCloudImage();
      if (file) await addReferenceImage(file);
    } catch (err) {
      setStatus(t("mi.referenceLoadFailed", { err: errMsg(err) }));
    }
  });

  // ---- 吸色桥：组件读自家像素发事件，宿主接主吸色（setColor + wp:pickerShow pin）----
  ref.addEventListener("colorpickstart", () => setStatus(t("ref.picking")));
  ref.addEventListener("colorpick", (e) => {
    const { hex, screenX, screenY } = (e as CustomEvent).detail as { hex: string | null; screenX: number; screenY: number };
    if (!hex) { window.dispatchEvent(new CustomEvent("wp:pickerHide")); return; }   // 透明 → 没东西吸
    setColor(hex);
    window.dispatchEvent(new CustomEvent("wp:pickerShow", { detail: { sx: screenX, sy: screenY, hex } }));
  });
  ref.addEventListener("colorpickend", () => window.dispatchEvent(new CustomEvent("wp:pickerHide")));

  // ---- 宿主全局通道 → 组件（组件不监听 window；wp: 事件是宿主约定）----
  // doc 像素或图层结构变 → live 脏标（真合成组件内按脏标+节流做）
  // ?.：元素在无 customElements 的环境（boot smoke dom-shim）不升级、方法不存在——这两条在 boot
  // 期就会被派发，不 ?. 会把 dispatchEvent 炸穿（2026-08-10 挂死链的教训）
  window.addEventListener("wp:docpixeldirty", () => ref.markLiveDirty?.());
  window.addEventListener("wp:histchange", () => ref.markLiveDirty?.());
  // desk apply-on-load：程序性属性下灌**不发事件** → 不回写 desk、载入不标脏。
  //   （多参考的 items/vp 由 applyLoadedReferences 灌——那条有 bitmap 异步，走 session-state。）
  window.addEventListener("wp:applyEditorState", () => {
    ref.rect = desk.refPanel.position;
    ref.open = desk.refPanel.enabled;
    if (desk.refPanel.enabled) _refWin.raise();
  });
  window.addEventListener("wp:toggleReference", () => refSetOpen(!ref.open));

  // 吸管工具态桥：editMode.current()（wp:modechange 通知）→ 组件 pick 属性（光标 + 点吸行为）。
  const syncPick = () => ref.toggleAttribute("pick", editMode.current() === "picker");
  window.addEventListener("wp:modechange", syncPick);
  syncPick();

  // i18n：shadow 内菜单/chip 文案走 labels property（slot 够不到）。语言切换 = 整页 reload，boot 一次即可。
  ref.labels = {
    load: t("ref.load"), paste: t("ref.paste"), cloud: t("ref.cloud"), live: t("ref.live"),
    oneToOne: t("ref.oneToOne"),
    del: t("ref.delete"), delConfirm: t("ref.deleteConfirm"), closeWin: t("ref.closeWin"),
    prev: t("ref.prevRef"), next: t("ref.nextRef"), menu: t("ref.menu"), move: t("ref.move"),
    resize: t("ref.resize"), resizeAria: t("ref.resizeAria"),
  };

  els.menuReference.addEventListener("click", () => {
    setMenuOpen(false);
    refSetOpen(true);
  });
  // 图层面板头 PiP shortcut（user 0830「同意图层加一个 pip」；心理学讨论落地：肌肉记忆落点接住）
  document.getElementById("layersPanelRefBtn")?.addEventListener("click", () => refSetOpen(!ref.open));
  els.referenceFileInput.addEventListener("change", async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      await addReferenceImage(file);
    } catch (err) {
      setStatus(t("mi.referenceLoadFailed", { err: errMsg(err) }));
    }
  });
}

/** 导入唯一漏斗（spec §5；genai era 同入口）：转码政策（1024² / 小图原样豁免 / 拍平白底 jpeg /
 *  压大保原）→ 追加为新页并翻到 → desk manifest 同步 + sidecar 标脏 + 状态行（压缩了就报 X→Y）。
 *  file input / 剪贴板 / 云盘 picker / import-image drop 路径全走这里。 */
export async function addReferenceImage(file: File | Blob): Promise<void> {
  // busy 普查（v0.10.3）：decode + 缩小 + jpeg 编码是秒级重活，且全程无交互段——整包 busy。
  const r = await withBusy(
    t("mi.importingBusy", { name: (file as File).name || t("mi.defaultImportName") }),
    async () => {
      const decoded = await decodeImageFile(file);          // C：鲁棒解码（修 Windows createImageBitmap 失效）
      const sw = decoded.width || (decoded as HTMLImageElement).naturalWidth;
      const sh = decoded.height || (decoded as HTMLImageElement).naturalHeight;
      const plan = planRefImport(sw, sh, file.size, file.type || "");
      if (!plan) return { bitmap: decoded, blob: file, note: "" };          // 政策 1：面积+字节双达标豁免（非 GIF）
      const px = imageSourceToBytes(decoded);
      const needResample = plan.fw !== sw || plan.fh !== sh;
      const small = needResample ? areaResampleBytes(px.data, sw, sh, plan.fw, plan.fh) : px.data;
      flattenWhiteInPlace(small);                                           // 政策 2：拍平白底
      const jpeg = encodeJpegFromBytes(small, plan.fw, plan.fh, REF_JPEG_QUALITY);
      if (plan.allowKeepIfBigger && jpeg.length >= file.size) return { bitmap: decoded, blob: file, note: "" };   // 政策 3：压大保原（GIF 无此路）
      const blob = new Blob([jpeg as unknown as BlobPart], { type: "image/jpeg" });
      const bitmap = await createImageBitmap(blob);         // 显示位图 = 存的字节（所见即所存）
      (decoded as ImageBitmap).close?.();
      // 变大（只可能是 GIF 强转）不写「已压缩」——不谎报
      const note = jpeg.length < file.size ? t("mi.referenceCompressed", { from: humanSize(file.size), to: humanSize(jpeg.length) }) : "";
      return { bitmap, blob, note };
    },
  );
  refSetOpen(true);
  referenceWindow.addImage?.(r.bitmap as ImageBitmap, r.blob);
  syncRefsToDesk();
  // v0.8.5（S5·ADR-0007）：参考图 = sidecar（跟 ora 走 ∧ 不进 undo）——走正名的 wp:sidecarchange 通道。
  window.dispatchEvent(new CustomEvent("wp:sidecarchange", { detail: { kind: "reference" } }));
  setStatus(t("mi.referenceLoaded", { name: (file as File).name || "", scaled: r.note }));
}
