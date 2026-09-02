// in-app 说明书面板（user 2026-09-02「内置 readme panel」）。created 2026-09-02 by Claude Fable 5.1.
// 内容 SSoT = readme-docs.ts；本模块 = 渲染 + sheet 开关 + 深链（#help/<id>，可甩给朋友的链接）+ 菜单入口。
// 第一消费者 = pressure-toast（「没压感？」toast 的「详情」跳到 windows-ink 节）。
import { README_SECTIONS } from "./readme-docs.ts";
import { renderMdLite, escapeHtml } from "./ui/md-lite.ts";
import { tEntry } from "./i18n/index.ts";
import { setMenuOpen } from "./settings-menu.ts";
import { openSheet, closeSheet } from "./ui/sheet.ts";   // 2026-09-02 C3

const byId = (id: string) => document.getElementById(id);
let _rendered = false;

function render() {
  const body = byId("readmeBody");
  if (!body) return;
  body.innerHTML = README_SECTIONS.map((s) =>
    `<section class="readme-section" id="readme-${s.id}" data-section="${s.id}">`
    + `<h3>${escapeHtml(tEntry(s.title))}</h3>${renderMdLite(tEntry(s.body))}</section>`).join("");
  _rendered = true;
}

/** 打开说明书；带 sectionId 则滚到该节并闪一下（id 见 readme-docs.ts）。 */
export function openReadmePanel(sectionId?: string): void {
  const sheet = byId("readmeSheet");
  if (!sheet) return;
  if (!_rendered) render();
  openSheet(sheet);
  if (sectionId) {
    const sec = byId(`readme-${sectionId}`);
    if (sec) {
      sec.scrollIntoView({ block: "start" });
      sec.classList.remove("flash");
      void sec.offsetWidth;   // 重启 CSS 动画
      sec.classList.add("flash");
    }
  }
}
export function closeReadmePanel(): void {
  closeSheet(byId("readmeSheet"));
}

/** 深链：#help 或 #help/<id>。返回是否命中。 */
export function readmeSectionFromHash(hash: string): { section: string | null } | null {
  const m = /^#help(?:\/([\w-]+))?\/?$/.exec(hash);
  return m ? { section: m[1] ?? null } : null;
}

export function initReadmePanel(): void {
  byId("menuReadme")?.addEventListener("click", () => { setMenuOpen(false); openReadmePanel(); });
  byId("readmeClose")?.addEventListener("click", closeReadmePanel);
  const fromHash = () => {
    const h = readmeSectionFromHash(location.hash);
    if (h) openReadmePanel(h.section ?? undefined);
  };
  fromHash();
  window.addEventListener("hashchange", fromHash);
}
