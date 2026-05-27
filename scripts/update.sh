#!/usr/bin/env bash
# 更新 stock-skills 套件
#
# 用法:
#   ./scripts/update.sh                       # git pull + 同步 user scope (~/.claude/skills/)
#   ./scripts/update.sh --no-pull             # 跳过 git pull, 只同步
#   ./scripts/update.sh --scope project       # 同步当前目录的 .claude/skills/
#
# scope:
#   - user (默认): ~/.claude/skills/
#   - project:     $PWD/.claude/skills/  在哪里跑就同步哪里
#
# 行为:
#   - 软链模式安装的 skill: git pull 后即自动生效, 无需重新拷贝
#   - 拷贝模式安装的 skill: rsync --delete 把仓库目录覆盖到 <skills_dir>/<skill>/
#   - 未安装的 skill: 跳过, 不会主动新增 (用 install.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SCOPE=""
SKILLS_DIR=""

# 自动发现仓库下所有含 SKILL.md 的目录（最多 3 层，支持 group/skill 分组）
# 用并行数组兼容 macOS 自带 bash 3.2
ALL_SKILLS=()
ALL_SKILL_SRCS=()
while IFS= read -r -d '' skill_md; do
  src_dir="$(dirname "$skill_md")"
  skill_dir="$(basename "$src_dir")"
  for existing in "${ALL_SKILLS[@]:-}"; do
    if [ "$existing" = "$skill_dir" ]; then
      echo "  ✗ skill 名重复: $skill_dir" >&2
      exit 1
    fi
  done
  ALL_SKILLS+=("$skill_dir")
  ALL_SKILL_SRCS+=("$src_dir")
done < <(find "$REPO_ROOT" -mindepth 2 -maxdepth 3 -name SKILL.md \
           -not -path "*/.git/*" -not -path "*/scripts/*" -print0 | sort -z)

lookup_skill_src() {
  local target="$1"
  local i
  for i in "${!ALL_SKILLS[@]}"; do
    if [ "${ALL_SKILLS[$i]}" = "$target" ]; then
      printf '%s' "${ALL_SKILL_SRCS[$i]}"
      return 0
    fi
  done
  return 1
}

DO_PULL=1
while [ $# -gt 0 ]; do
  case "$1" in
    --no-pull) DO_PULL=0; shift ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --scope=*) SCOPE="${1#*=}"; shift ;;
    --help|-h)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 1
      ;;
  esac
done

if [ -n "${CLAUDE_SKILLS_DIR:-}" ]; then
  SKILLS_DIR="$CLAUDE_SKILLS_DIR"
else
  case "${SCOPE:-user}" in
    user|"") SKILLS_DIR="$HOME/.claude/skills" ;;
    project) SKILLS_DIR="$PWD/.claude/skills" ;;
    *)
      echo "无效 --scope 值: $SCOPE (支持 user / project)" >&2
      exit 1
      ;;
  esac
fi

if [ "$DO_PULL" = "1" ]; then
  if [ -d "$REPO_ROOT/.git" ]; then
    echo "==> git pull"
    git -C "$REPO_ROOT" pull --ff-only
    echo
  else
    echo "==> 跳过 git pull (不是 git 仓库)"
  fi
fi

if [ ! -d "$SKILLS_DIR" ]; then
  echo "$SKILLS_DIR 不存在, 先用 install.sh 安装"
  exit 1
fi

if command -v rsync >/dev/null 2>&1; then
  SYNC_CMD="rsync"
else
  SYNC_CMD="cp"
fi

echo "==> 同步到 $SKILLS_DIR (sync: $SYNC_CMD)"

updated=0
skipped=0
for skill in "${ALL_SKILLS[@]}"; do
  src="$(lookup_skill_src "$skill" || true)"
  dst="$SKILLS_DIR/$skill"

  if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then
    echo "  - $skill: 未安装, 跳过"
    skipped=$((skipped + 1))
    continue
  fi

  if [ -L "$dst" ]; then
    target="$(readlink "$dst")"
    echo "  ✓ $skill (symlink → $target, git pull 已生效)"
    updated=$((updated + 1))
    continue
  fi

  if [ ! -d "$src" ]; then
    echo "  ✗ $skill: 源目录不存在 ($src)，跳过"
    continue
  fi

  if [ "$SYNC_CMD" = "rsync" ]; then
    rsync -a --delete "$src/" "$dst/"
  else
    rm -rf "$dst"
    cp -R "$src" "$dst"
  fi
  echo "  ✓ $skill (copied)"
  updated=$((updated + 1))
done

echo
echo "完成: 更新 $updated 个, 跳过 $skipped 个未安装的"
