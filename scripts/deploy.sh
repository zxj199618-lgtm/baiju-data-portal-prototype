#!/usr/bin/env bash
#
# 观星台发版脚本
#
# 通过 git bundle + SSH 直传发布，不依赖服务器访问 GitHub（该服务器访问 GitHub 不稳定）。
# 服务器地址、路径等全部来自环境变量或本地 .deploy.env，仓库内不保存任何服务器信息。
#
# 用法：
#   cp .deploy.env.example .deploy.env   # 填入服务器信息（.deploy.env 已在 .gitignore 中）
#   npm run deploy
#
# 可选环境变量见 .deploy.env.example。

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUNDLE_LOCAL="$(mktemp -t gxt-deploy-XXXXXX.bundle)"
BUNDLE_REMOTE=""
CLEANUP_DONE=0

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  !\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

cleanup() {
  [ "$CLEANUP_DONE" = "1" ] && return 0
  CLEANUP_DONE=1
  rm -f "$BUNDLE_LOCAL" 2>/dev/null || true
  if [ -n "$BUNDLE_REMOTE" ] && [ -n "${DEPLOY_HOST:-}" ]; then
    # shellcheck disable=SC2086
    ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" "rm -f '$BUNDLE_REMOTE'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# 配置：优先取环境变量，其次取本地 .deploy.env（不入库）
# ---------------------------------------------------------------------------
load_env_file() {
  local file="$1" line key value
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    case "$line" in *=*) ;; *) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [ -n "$key" ] || continue
    # 去掉值两端成对的引号
    case "$value" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    # 已存在的环境变量优先，不覆盖
    if [ -z "$(eval "printf '%s' \"\${$key:-}\"")" ]; then export "$key=$value"; fi
  done < "$file"
}

load_env_file "$ROOT/.deploy.env"

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PATH="${DEPLOY_PATH:-}"
DEPLOY_COMPOSE_FILES="${DEPLOY_COMPOSE_FILES:-docker-compose.prod.yml}"
DEPLOY_SERVICE="${DEPLOY_SERVICE:-analysis-gateway}"
DEPLOY_URL="${DEPLOY_URL:-}"
DEPLOY_DOCKER="${DEPLOY_DOCKER:-sudo -n docker}"
DEPLOY_SSH_OPTS="${DEPLOY_SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=15}"
DEPLOY_PUSH="${DEPLOY_PUSH:-1}"
DEPLOY_VERIFY_RETRIES="${DEPLOY_VERIFY_RETRIES:-30}"
DEPLOY_VERIFY_INTERVAL="${DEPLOY_VERIFY_INTERVAL:-10}"
DEPLOY_ALLOW_DIRTY="${DEPLOY_ALLOW_DIRTY:-0}"
DEPLOY_SKIP_TESTS="${DEPLOY_SKIP_TESTS:-0}"

[ -n "$DEPLOY_HOST" ] || die "未配置 DEPLOY_HOST。请复制 .deploy.env.example 为 .deploy.env 并填写服务器信息。"
[ -n "$DEPLOY_PATH" ] || die "未配置 DEPLOY_PATH（服务器上的仓库路径）。"

# shellcheck disable=SC2206
COMPOSE_ARGS=()
if [ -n "$DEPLOY_COMPOSE_FILES" ]; then
  IFS=',' read -r -a __files <<< "$DEPLOY_COMPOSE_FILES"
  for __f in "${__files[@]}"; do
    __f="$(printf '%s' "$__f" | tr -d '[:space:]')"
    [ -n "$__f" ] && COMPOSE_ARGS+=(-f "$__f")
  done
fi

run_remote() {
  # shellcheck disable=SC2086
  ssh $DEPLOY_SSH_OPTS "$DEPLOY_HOST" "$@"
}

# ---------------------------------------------------------------------------
# 1. 前置检查
# ---------------------------------------------------------------------------
log "检查工作区"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  if [ "$DEPLOY_ALLOW_DIRTY" = "1" ]; then
    warn "工作区有未提交改动，按 DEPLOY_ALLOW_DIRTY=1 继续（发布的是当前 HEAD，不含这些改动）"
  else
    git status --short --untracked-files=no
    die "工作区有未提交改动。请先提交，或用 DEPLOY_ALLOW_DIRTY=1 强制继续。"
  fi
fi
COMMIT="$(git rev-parse --short HEAD)"
ok "HEAD = $COMMIT"

log "检查脚本语法"
node --check assets/portal-vue-module.js >/dev/null
node --check assets/portal-vue-module.css 2>/dev/null || true
ok "JS 语法正常"

if [ "$DEPLOY_SKIP_TESTS" = "1" ]; then
  warn "按 DEPLOY_SKIP_TESTS=1 跳过测试"
else
  log "运行 smoke test"
  npm test --silent
  ok "测试通过"
fi

log "重建单文件版"
npm run build:standalone --silent >/dev/null
ok "单文件版已生成"

# 期望版本号：取自 index.html 的静态资源查询串，用于发布后核对
EXPECT_VERSION="$(grep -oE 'assets/portal-vue-module\.js\?v=[A-Za-z0-9]+' index.html | head -1 | sed 's/.*?v=//')"
[ -n "$EXPECT_VERSION" ] || die "无法从 index.html 解析静态资源版本号"
ok "期望线上版本号 = $EXPECT_VERSION"

# ---------------------------------------------------------------------------
# 2. 打包并上传
# ---------------------------------------------------------------------------
log "打包 git bundle"
git bundle create "$BUNDLE_LOCAL" main >/dev/null
ok "已生成 $(du -h "$BUNDLE_LOCAL" | cut -f1) bundle"

log "上传到服务器"
BUNDLE_REMOTE="/tmp/gxt-deploy-$$.bundle"
# shellcheck disable=SC2086
scp $DEPLOY_SSH_OPTS "$BUNDLE_LOCAL" "$DEPLOY_HOST:$BUNDLE_REMOTE" >/dev/null
ok "已上传到 $DEPLOY_HOST:$BUNDLE_REMOTE"

# ---------------------------------------------------------------------------
# 3. 服务器：快进合并
# ---------------------------------------------------------------------------
log "服务器端代码更新"
run_remote "set -euo pipefail
cd '$DEPLOY_PATH'
if [ -n \"\$(git status --porcelain --untracked-files=no)\" ]; then
  echo 'DIRTY'
  exit 3
fi
git fetch '$BUNDLE_REMOTE' main >/dev/null 2>&1
git merge --ff-only FETCH_HEAD >/dev/null
echo \"HEAD=\$(git rev-parse --short HEAD)\"" || die "服务器端代码更新失败（若为 DIRTY，请先清理服务器上的未提交改动）"
ok "服务器代码已更新到 $COMMIT"

# ---------------------------------------------------------------------------
# 4. 服务器：重建容器
# ---------------------------------------------------------------------------
log "重建并重启容器（${DEPLOY_SERVICE}）"
run_remote "set -euo pipefail
cd '$DEPLOY_PATH'
$DEPLOY_DOCKER compose ${COMPOSE_ARGS[*]} up -d --build '$DEPLOY_SERVICE' 2>&1 | tail -4"
ok "容器已重建"

# ---------------------------------------------------------------------------
# 5. 推送 GitHub（可选，失败不影响生产）
# ---------------------------------------------------------------------------
if [ "$DEPLOY_PUSH" = "1" ]; then
  log "推送到 GitHub"
  pushed=0
  for i in 1 2 3 4 5; do
    if git push origin main >/dev/null 2>&1; then pushed=1; break; fi
    warn "第 $i 次推送失败，15s 后重试（GitHub 连通性不稳定属常见情况）"
    sleep 15
  done
  if [ "$pushed" = "1" ]; then
    ok "已推送 main"
  else
    warn "GitHub 推送失败，但生产环境已发布完成；稍后手动 git push origin main 即可（Pages 会滞后）"
  fi
else
  warn "按 DEPLOY_PUSH=0 跳过 GitHub 推送"
fi

# ---------------------------------------------------------------------------
# 6. 核对线上版本号
# ---------------------------------------------------------------------------
if [ -n "$DEPLOY_URL" ]; then
  log "核对线上版本号（期望 ${EXPECT_VERSION}）"
  live=""
  for i in $(seq 1 "$DEPLOY_VERIFY_RETRIES"); do
    live="$(curl -fsS --max-time 15 "$DEPLOY_URL" 2>/dev/null | grep -oE 'assets/portal-vue-module\.js\?v=[A-Za-z0-9]+' | head -1 | sed 's/.*?v=//' || true)"
    if [ "$live" = "$EXPECT_VERSION" ]; then break; fi
    warn "[$i/$DEPLOY_VERIFY_RETRIES] 线上为 ${live:-（读取失败）}，等待 ${DEPLOY_VERIFY_INTERVAL}s"
    sleep "$DEPLOY_VERIFY_INTERVAL"
  done
  [ "$live" = "$EXPECT_VERSION" ] || die "线上版本号仍为 ${live:-（读取失败）}，与期望的 $EXPECT_VERSION 不一致，请检查容器与反向代理。"
  ok "线上版本号已更新为 $EXPECT_VERSION"
else
  warn "未配置 DEPLOY_URL，跳过线上版本号核对"
fi

printf '\n\033[1;32m发版完成\033[0m：%s @ %s\n' "$COMMIT" "$(date '+%Y-%m-%d %H:%M:%S')"
[ -n "$DEPLOY_URL" ] && printf '线上地址：%s\n' "$DEPLOY_URL"
