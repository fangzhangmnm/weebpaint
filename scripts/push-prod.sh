#!/usr/bin/env bash
# created 2026-08-28 by Claude Fable 5
# push prod ritual（user 2026-08-28 拍板成文）。
# ⚠ 家规硬规则 #5：跑本脚本 = push prod，**必须先获得人类明确指令**——AI 永不自行运行。
# 步骤：全量测试 → standalone 重打 + smoke → 版本号命名的两份交付物 → main 快进 prod
#       → GH release 挂 standalone（gh 可用时；user 2026-08-28 拍板自动化，edited by Claude Fable 5）。
# 交付物（gitignored，本地件）：dist/weebpaint-standalone-<vX.Y.Z>.html（可下载单文件）、
#   dist/weebpaint-itch-<vX.Y.Z>.zip（内含 index.html，itch「浏览器可玩」上传用）。
#   itch 上传走 butler 进 ritual（user 2026-08-29 拍板；scripts/push-itch.sh，同 channel 原地更新
#   保同一条记录；首次需 butler login + itch 后台一次性勾选，详该脚本头注释。edited by Claude Fable 5 2026-08-29）。
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
echo "[push-prod] ✓ dist/weebpaint-itch-$VER.zip（SharedArrayBuffer 保持关）"
# GH release：单文件版自动挂 release（与 itch zip 同一份构建，GH 放裸 html）。
# release 失败只警告不炸 ritual——prod 此刻已经推完，别让收尾步骤谎报整场失败。
if command -v gh >/dev/null 2>&1; then
  if gh release view "$VER" >/dev/null 2>&1; then
    echo "[push-prod] ⚠ GH release $VER 已存在，跳过（重传资产：gh release upload $VER \"dist/weebpaint-standalone-$VER.html\" --clobber）"
  elif gh release create "$VER" --target prod "dist/weebpaint-standalone-$VER.html" \
        --title "$VER" \
        --notes "Single-file offline build. Download the .html and open it in a browser. Same build as the itch.io upload."; then
    echo "[push-prod] ✓ GH release $VER 已挂 standalone"
  else
    echo "[push-prod] ⚠ GH release 创建失败——手动补：gh release create $VER --target prod \"dist/weebpaint-standalone-$VER.html\" --title $VER"
  fi
else
  echo "[push-prod] ⚠ gh CLI 不可用——release 没发。手动补：gh release create $VER --target prod \"dist/weebpaint-standalone-$VER.html\" --title $VER"
fi
# itch 上传（user 2026-08-29 拍板进 ritual）：butler 同 channel 原地更新，记录/统计不换条目。
# 失败只警告不炸——理由同 GH release：prod 此刻已推完，收尾步骤别谎报整场失败。
if bash scripts/push-itch.sh "$VER"; then
  echo "[push-prod] ✓ itch 已推（butler → fangzhangmnm/weebpaint:html）"
else
  echo "[push-prod] ⚠ itch 上传失败/未开通——手动补：bash scripts/push-itch.sh $VER"
fi
