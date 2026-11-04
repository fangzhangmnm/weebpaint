// src/exit-seal.ts —— 加密作品「另存」的封口（家族规则书 §1 第 5 条，user 11-03：加密作品另存默认给加密容器，明文永远是显式选项）。
// created 2026-11-03 by Claude Opus 5.5
//   纯函数 + 注入端口：session-state.saveAs 用真 7z，测试用假端口。打不出容器 = 抛错，绝不回落明文。

export interface ExitSealPorts {
  pack(o: { dataBytes: Uint8Array; fileName: string; ext: string; peek: Uint8Array | null; password: string }): Promise<Blob>;
  isContainer(b: Blob): Promise<boolean>;
}

/** 明文工程字节 → 容器。password 为空（锁着）或打出来不是容器：抛 `lockedError()`，调用方什么都不写。 */
export async function sealForSaveAs(
  bytes: Blob, peek: Blob | null, fileName: string, password: string | null,
  ports: ExitSealPorts, lockedError: () => Error,
): Promise<Blob> {
  if (!password) throw lockedError();
  const container = await ports.pack({
    dataBytes: new Uint8Array(await bytes.arrayBuffer()),
    fileName, ext: "ora",
    peek: peek ? new Uint8Array(await peek.arrayBuffer()) : null,
    password,
  });
  if (!(await ports.isContainer(container))) throw lockedError();
  return container;
}
