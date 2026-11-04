export interface ExitSealPorts {
    pack(o: {
        dataBytes: Uint8Array;
        fileName: string;
        ext: string;
        peek: Uint8Array | null;
        password: string;
    }): Promise<Blob>;
    isContainer(b: Blob): Promise<boolean>;
}
/** 明文工程字节 → 容器。password 为空（锁着）或打出来不是容器：抛 `lockedError()`，调用方什么都不写。 */
export declare function sealForSaveAs(bytes: Blob, peek: Blob | null, fileName: string, password: string | null, ports: ExitSealPorts, lockedError: () => Error): Promise<Blob>;
