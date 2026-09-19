// smudge golden 生成器 —— **已封存**（created 2026-09-18 by Claude Fable 5.1）。
//   fixture test/fixtures/smudge-golden.json 于 2026-09-18 用旧 CPU SmudgeEngine（v0.14.16，git a700fad）录定，
//   之后旧引擎已被 GPU 区域程序版替换（同一文件名 src/plugins/smudge-engine.ts，签名不同）。
//   这份锚的意义就是「不许用新引擎重录来让测试变绿」——那等于把翻译错误烤进锚。
//   真要重录（= 改锚，例如 user 改了手感数字）：从 git a700fad 复活旧引擎到临时路径，用当时的这份脚本跑
//   （`git show a700fad:test/smudge-golden.gen.mjs`），并在 commit message 里写明为什么改锚。
console.error("smudge-golden.gen.mjs is sealed: the golden was recorded from the CPU engine at git a700fad; the CPU engine is gone. See file header.");
process.exit(1);
