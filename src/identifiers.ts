// 身份的语法（store 0.16 文档种类表）。created 2026-10-21 by Claude Fable 5.1（周账 F-56 迁库，ai-docs/20261021-store-2x-gallery-08x-migration.md §5）
//   WeebPaint 只有一种文档：画（`<名>.ora`，zip 容器；缩略图 = 容器里的 Thumbnails/thumbnail.png，见 gallery/cloud-thumbs.ts）。
//   这张表报给 createStore（app-store.ts）；同一张表在这里再造一份 identifiers 给纯代码和测试用——两边永远是同一套切法
//   （提案 = store 仓 ai-docs/20260929-proposal-doc-types.md；WXHW src/identifiers.ts 同形）。
//   身份 / 云端名 / 加密容器名和 0.15.2 一个字节不变：身份 = `X.ora`，加密件云端 = `X.ora.zip`（库自己管那个 .zip）。
//   这是 @internal/store 的第二个值级 import 点（scripts/build.sh B 分层 lint 放行）：createIdentifiers 是纯函数，不碰存储、不碰云。
//   用词（user 2026-09-29 定）：identifier 身份 / folder / stem 主干 / suffix 后缀 / kind 种类。app 内部仍用裸名（config.ts
//   sessionFileName / stripSessionExt 在边界转），那是另一刀，不在迁库里（迁库 doc §6）。
import { createIdentifiers, type DocKind, type Identifiers } from "@internal/store";

export const ORA_KIND = "ora";
export const ORA_SUFFIX = ".ora";
/** 文档种类表：一行。不传 tier = 一等作品（冲突面 / 回收站 / 脏不驱逐全套，store 2.1.0）；自动快照环住 app 自己的 IDB，不进 store。 */
export const DOC_KINDS: readonly DocKind[] = Object.freeze([
  { kind: ORA_KIND, suffix: ORA_SUFFIX, container: "zip" },
]);
export const identifiers: Identifiers = createIdentifiers(DOC_KINDS);   // 显式标类型：createIdentifiers 返回的是库内的超集，声明生成（gen-api）命名不了它
