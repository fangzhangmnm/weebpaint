#!/usr/bin/env bash
# created 2026-08-29 by Claude Fable 5
# itch 上传（butler 通道）—— user 2026-08-29 拍板进 push-prod ritual。
# 依据（itch.io/docs/butler/pushing.html，2026-08-29 查证）：butler 对同一 channel 重复 push =
#   原地更新同一条 upload，下载记录/统计延续（「Pushing to the same channel again will update that file」）；
#   .zip 会被自动解包推内容。⚠ 首次 butler push 会**新建**一条 upload（老的手传条目是独立记录，
#   带不过来）——首推后 user 需在 itch 后台一次性：勾「This file will be played in the browser」+
#   处理旧手传条目（隐藏/删）。SharedArrayBuffer 是页面级设置，butler push 不影响，保持关。
# 认证（一次性）：`tools/butler/butler login`（浏览器授权，本机留凭据）；CI 可用 BUTLER_API_KEY。
# 两个 channel（user 2026-08-29 拍板：itch 页要「浏览器可玩」+「可下载」两个条目）：
#   html       = 浏览器可玩 embed（后台勾「played in the browser」，一次性）
#   standalone = 下载条目（后台**不勾** playable；butler 管的下载给到用户是 zip，内含 weebpaint-standalone.html）
# 用法：bash scripts/push-itch.sh [vX.Y.Z]   # 不给版本则读 src/version.ts
set -euo pipefail
cd "$(dirname "$0")/.."

USERGAME="fangzhangmnm/weebpaint"
BUTLER="./tools/butler/butler"

# 没 butler 自动 curl 一份（模式同 build.sh 的 esbuild；tools/ = 构建工具，gitignored 不进 git）
if [ ! -x "$BUTLER" ]; then
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) plat="linux-amd64" ;;
    *) echo "[push-itch] 未知平台 $(uname -s)-$(uname -m)——去 https://itchio.itch.io/butler 手动装进 tools/butler/" >&2; exit 1 ;;
  esac
  echo "[push-itch] 拉 butler ($plat LATEST)..."
  mkdir -p tools/butler
  TMPZ=$(mktemp)
  curl -fsSL "https://broth.itch.zone/butler/$plat/LATEST/archive/default" -o "$TMPZ"
  unzip -oq "$TMPZ" -d tools/butler
  rm -f "$TMPZ"
  chmod +x "$BUTLER"
  "$BUTLER" -V
fi

VER="${1:-}"
if [ -z "$VER" ]; then
  FULLVER=$(grep -o '"v[0-9][^"]*"' src/version.ts | head -1 | tr -d '"')
  VER=${FULLVER%%-*}   # v0.11.46-2026-08-29 → v0.11.46
fi
[ -n "$VER" ] || { echo "[push-itch] 解析不到版本号"; exit 1; }
ZIP="dist/weebpaint-itch-$VER.zip"
[ -f "$ZIP" ] || { echo "[push-itch] 找不到 $ZIP（先跑 push-prod.sh 备货）"; exit 1; }

if "$BUTLER" push "$ZIP" "$USERGAME:html" --userversion "$VER"; then
  echo "[push-itch] ✓ 已推 $USERGAME:html（浏览器可玩，$VER）"
else
  echo "[push-itch] ✗ butler push 失败。若是未登录：跑一次 $BUTLER login（浏览器授权）后重跑：bash scripts/push-itch.sh $VER" >&2
  exit 1
fi

STANDALONE="dist/weebpaint-standalone-$VER.html"
[ -f "$STANDALONE" ] || { echo "[push-itch] ✗ 找不到 $STANDALONE（先跑 push-prod.sh 备货）" >&2; exit 1; }
rm -rf tmp/itch-standalone && mkdir -p tmp/itch-standalone
cp "$STANDALONE" tmp/itch-standalone/weebpaint-standalone.html   # 内名不带版本号=补丁 diff 更省；版本在 build 标签上
if "$BUTLER" push tmp/itch-standalone "$USERGAME:standalone" --userversion "$VER"; then
  echo "[push-itch] ✓ 已推 $USERGAME:standalone（下载版，$VER）"
else
  echo "[push-itch] ✗ standalone channel 推送失败（html 已推成功）——重试：bash scripts/push-itch.sh $VER" >&2
  exit 1
fi
