import { type DocKind, type Identifiers } from "@internal/store";
export declare const ORA_KIND = "ora";
export declare const ORA_SUFFIX = ".ora";
/** 文档种类表：一行。不传 tier = 一等作品（冲突面 / 回收站 / 脏不驱逐全套，store 2.1.0）；自动快照环住 app 自己的 IDB，不进 store。 */
export declare const DOC_KINDS: readonly DocKind[];
export declare const identifiers: Identifiers;
