#!/usr/bin/env bash
# created 2026-08-28 by Claude Fable 5
# push prod ritual（user 2026-08-28 拍板成文）。
# ⚠ 家规硬规则 #5：跑本脚本 = push prod，**必须先获得人类明确指令**——AI 永不自行运行。
# 步骤：全量测试 → standalone 重打 + smoke → 版本号命名的两份交付物 → main 快进 prod。
# 交付物（gitignored，本地件）：dist/weebpaint-standalone-<vX.Y.Z>.html（可下载单文件）、
#   dist/weebpaint-itch-<vX.Y.Z>.zip（内含 index.html，itch「浏览器可玩」上传用）。
#   itch 上传是人类手动动作——脚本只备货并提示。
set -euo pipefail
cd "$(dirname "$0")/.."
FULLVER=$(grep -o '"v[0-9][^"]*"' src/version.ts | head -1 | tr -d '"')
VER=${FULLVER%%-*}   # v0.11.44-2026-08-28 → v0.11.44（文件名只带语义版本号）
[ -n "$VER" ] || { echo "[push-prod] 解析不到版本号（src/version.ts）"; exit 1; }
echo "[push-prod] 版本 $FULLVER（交付名 $VER）"
npm test
bash scripts/build-standalone.sh          # 从当前 dist bundle 打单文件（发版 ritual 已跑过 build.sh）
node tools/standalone-smoke.mjs
cp dist/weebpaint-standalone.html "dist/weebpaint-standalone-$VER.html"
rm -rf tmp/itch-pack && mkdir -p tmp/itch-pack
cp dist/weebpaint-standalone.html tmp/itch-pack/index.html
(cd tmp/itch-pack && zip -q -X "../../dist/weebpaint-itch-$VER.zip" index.html)
git push origin main:prod
echo "[push-prod] ✓ prod 已快进到 main（$FULLVER）"
echo "[push-prod] ✓ dist/weebpaint-standalone-$VER.html"
echo "[push-prod] ✓ dist/weebpaint-itch-$VER.zip   ← itch 手动上传这份（SharedArrayBuffer 保持关）"
