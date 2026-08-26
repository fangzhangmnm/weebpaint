// naming.ts —— 命名器官（P1；提案 = ai-docs/20260825-localfile-knight-proposal-api.md NamingOrgan）。
// created 2026-08-26 by Claude Fable 5（无地骑士 P1；拍板 = verdicts §2.1 命名三粒度）。
//
// 三粒度拍板：画 = `yyyymmdd-hex4`（日粒度+消歧码，v217 惯例沿用）；下载版本 = `名-YYYYMMDD-HHMM`；
//   项目=月粒度（不归本器官）。**禁「未命名」**：空输入/默认值一律落日期名，不落 untitled 字面。
// 撞名 -1/-2：只有能探测占用的去向才做得到（云 sink = cloud-image-model.nextFreeExportName 绑
//   store.files.nameOccupied；本地下载探测不了磁盘，浏览器自己补 (1)）——后缀逻辑留在有占用谓词的
//   sink 侧，本器官只出基名。
// 纯模块（now 可注入 → node 可测）；提拔自 gallery-shell._newDocName + export-import-menu.stampNow，
//   两处原件已删，别再各自长一份。

const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;

/** 画的默认名 = yyyymmdd-hex4（v217 惯例：同步生成无延迟；冲突概率 1/65536，
 *  真撞由调用方的 uniqueNameFor / mode:"new" 护栏兜）。 */
export function galleryDefaultName(now: Date = new Date()): string {
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${ymd(now)}-${rand}`;
}

/** 下载版本时间戳 = YYYYMMDD-HHMM（分钟粒度：同分连导靠 sink 侧后缀/浏览器 (1) 消歧）。 */
export function downloadStamp(now: Date = new Date()): string {
  return `${ymd(now)}-${p2(now.getHours())}${p2(now.getMinutes())}`;
}

/** 下载/导出文件基名 = `名-YYYYMMDD-HHMM`（不含扩展名）。 */
export function downloadName(base: string, now: Date = new Date()): string {
  return `${base}-${downloadStamp(now)}`;
}
