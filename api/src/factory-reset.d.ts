/** 还原出厂主流程（topbar-menu 的 menuFactoryReset 调）。全程 in-app sheet（无系统对话框红线）。 */
export declare function runFactoryReset(setStatus: (msg: string, persist?: boolean) => void): Promise<void>;
