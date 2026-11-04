import { CloudGate } from "./cloud-gate.ts";
export interface CloudGateHostDeps {
    attached(): boolean;
    authBoot: Promise<unknown>;
    isSignedIn(): boolean;
    retrySilentSignIn(): Promise<boolean>;
    /** 问云端一次（选了离线时用；app-store.cloudReachable）。 */
    reachable(): Promise<void>;
    /** 交互登录：在点击的同步栈里调（iOS 红线）。 */
    signIn(): void;
    check(g: {
        abandoned: () => boolean;
        onLongWait: () => void;
    }): Promise<unknown>;
    dirtyCount(): Promise<number>;
    openAttentionList(): void;
    catchUp(): Promise<void>;
    afterPass(): void;
    note(msg: string): void;
}
export declare function createCloudGateHost(d: CloudGateHostDeps): {
    gate: CloudGate;
    wake: (why: string) => void;
    retrySilentQuietly: (why: string) => void;
    paintBar: () => void;
    tune: {
        offlineRetryMs: number;
        recheckMs: number;
    };
};
