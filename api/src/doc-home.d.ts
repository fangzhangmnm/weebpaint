import type { LocalFileHandle } from "./local-file-session.ts";
/** 一画一家。徽章/保存/导出基名/守卫 全部 switch 此联合类型（exhaustive，编译器守——
 *  消费点请用 switch + assertNever，加第四种家时 tsc 逐点报错，而不是静默走错分支）。 */
export type DocHome = {
    kind: "gallery";
    galleryId: string;
    path: string;
} | {
    kind: "file";
    handle: LocalFileHandle;
    fileName: string;
    lastSeenMtime: number;
} | {
    kind: "transient";
};
/** P3 registry 铸 opaque id 之前的唯一 gallery（单 store 实例现状）。registry 落地后由它供值，此常量退役。 */
export declare const SOLE_GALLERY_ID = "default";
/** 消费点 exhaustive 守卫：switch 落到这儿 = 联合类型加了新成员而这个消费点没跟上。 */
export declare function assertNever(x: never): never;
/** 只读快照（冻结对象；消费者拿不到可变引用，改家只能走 authority 动词）。 */
export declare function docHome(): Readonly<DocHome> | null;
/** file 家的 dirty（非 file 家恒 false）。gallery 家的 dirty 不在这儿——问 editor-session。 */
export declare function fileDirty(): boolean;
export interface HomeAuthority {
    /** 换家（安家/搬家/离家=null）。换家即换世界线：file-dirty 归零（新家相对自己天然干净）。 */
    setHome(h: DocHome | null): void;
    /** file 家标脏（编辑落笔）。非 file 家调用 = 结构 bug，throw（不静默吞）。 */
    markFileDirty(): void;
    /** file 家清脏——**只有写回文件成功后**允许调（导出永不清 dirty 由「导出路径根本拿不到本方法」结构保证）。 */
    clearFileDirty(): void;
    /** 写回成功后前移 mtime 对表基准（陈旧检查的比较对象）。非 file 家 throw。 */
    patchFileMtime(lastSeenMtime: number): void;
}
export declare function claimHomeAuthority(): HomeAuthority;
/** 仅供 node 测试重置 keeper（app 运行时永不调；不导出到任何 UI 路径）。 */
export declare function _resetHomeKeeperForTest(): void;
/** 保存 = 送回家 的路由。implicit（autosave/beforeunload 偷存）对 file/transient = noop——
 *  静默写用户磁盘文件违背 Windows 文件语义（Alt+F4=不保存，human 拍板 spec 20260819 §7.1）；
 *  transient 的 implicit 同理（安家仪式必须显式）。gallery 家 implicit 照走 store（IDB 自家地盘）。 */
export type SaveRoute = "store" | "file-writeback" | "settle" | "noop";
export declare function saveRoute(home: Readonly<DocHome> | null, opts?: {
    implicit?: boolean;
}): SaveRoute;
/** 导出/标题/建议名的展示基名（不是身份！只是给人看的字符串）。
 *  file 家 = 文件 stem（去扩展名）；gallery 家 = 库裸名（自带夹前缀）；transient/无家 = fallback。 */
export declare function homeDisplayName(home: Readonly<DocHome> | null, fallback: string): string;
