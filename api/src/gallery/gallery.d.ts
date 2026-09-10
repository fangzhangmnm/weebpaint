import { type GalleryHandle } from "@internal/gallery";
export type { GalleryHandle };
export interface GalleryHost {
    signedIn(): boolean;
    online(): boolean;
    activeName(): string | null;
    confirm(title: string, msg: string): Promise<boolean>;
    input(title: string, def: string, opts?: {
        placeholder?: string;
    }): Promise<string | null>;
    chooseFolder(title: string, msg: string, options: {
        label: string;
        value: string;
    }[]): Promise<string | null>;
    status(msg: string, isError?: boolean): void;
    busy<T>(label: string, fn: () => Promise<T>): Promise<T>;
    /** 本地字节是不是加密容器（纯本地 IDB 读文件头，无网络）。gallery 按夹探测锁态用。 */
    isEncrypted(name: string): Promise<boolean>;
    /** 交互解锁（busy 外弹密码 + verifyPassword）。成功 → true。 */
    unlock(name: string): Promise<boolean>;
}
export declare function mountGallery(el: HTMLElement, host: GalleryHost): GalleryHandle;
