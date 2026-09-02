// in-app 说明书内容 SSoT（user 2026-09-02「内置 readme panel…这是第一个用例」）。created 2026-09-02 by Claude Fable 5.1.
// 每节 = { id（可深链：#help/<id>）, title, body }，四语同居同 i18n/strings.ts 纪律（zh/en/ja 必填，tok 可选→fallback en）。
// body 是 md-lite（段落 / `- ` 列表 / **粗体** / [文字](https://…)），渲染在 readme-panel.ts。
// 加一节 = 在这里加一条；toast / 状态栏 / 外链只需引用 id。措辞 user 过目（第一节基底 = README FAQ + itch 页文案）。
import type { Entry } from "./i18n/strings.ts";

export interface ReadmeSection { id: string; title: Entry; body: Entry; }

export const README_SECTIONS: ReadmeSection[] = [
  {
    id: "windows-ink",
    title: {
      zh: "Windows 上没有压感？",
      en: "No pen pressure on Windows?",
      ja: "Windows で筆圧が効かない？",
    },
    body: {
      zh: `浏览器只能通过 **Windows Ink** 拿到笔压。如果你在 Windows 上用数位板画出来的线条粗细恒定，多半是驱动把笔当成了鼠标在发送。

- 打开数位板驱动面板（Huion 绘王 / XP-Pen / Wacom），在数位笔设置里勾选 **启用 Windows Ink**。
- **关闭所有浏览器窗口再重新打开**，回到 WeebPaint。
- 用带压感的笔刷试一笔；名字带「固定」的笔刷本来就不响应压感。

这和 Clip Studio Paint（优动漫）/ Photoshop 不冲突：它们可以继续用 WinTab。如果开了 Windows Ink 之后出现墨迹波纹或长按弹右键菜单，去 Windows 设置 →「笔和 Windows Ink」里关掉即可。`,
      en: `Browsers only receive pen pressure through **Windows Ink**. If your strokes come out at a constant width on a Windows PC with a pen tablet, the driver is most likely sending mouse input instead.

- Open your tablet driver panel (Huion / XP-Pen / Wacom) and enable **Windows Ink** in its pen settings.
- **Close every browser window and reopen it**, then come back to WeebPaint.
- Try a pressure brush; the brushes whose names say "fixed" ignore pressure by design.

This doesn't conflict with Clip Studio Paint or Photoshop: they can keep using WinTab. If Windows Ink brings back the ink ripple or the long-press right-click menu, turn those off in Windows Settings → Pen & Windows Ink.`,
      ja: `ブラウザは **Windows Ink** 経由でしか筆圧を受け取れません。Windows でペンタブレットを使っていて線の太さが一定なら、ドライバーがペンをマウスとして送っている可能性が高いです。

- タブレットドライバーの設定（Huion / XP-Pen / Wacom）を開き、ペン設定で **Windows Ink を有効** にします。
- **ブラウザのウィンドウをすべて閉じてから開き直し**、WeebPaint に戻ります。
- 筆圧対応のブラシで一筆試してください。名前に「固定」が付くブラシは筆圧に反応しない仕様です。

Clip Studio Paint や Photoshop とは干渉しません（そちらは WinTab を使い続けられます）。Windows Ink を有効にしてインクの波紋や長押し右クリックが出る場合は、Windows の設定 →「ペンと Windows Ink」で無効にできます。`,
    },
  },
];
