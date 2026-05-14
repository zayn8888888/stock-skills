#!/usr/bin/env bash
# 更新 stock-skills 套件。
#
# 用法:
#   ./scripts/update.sh           # git pull + 自动按已安装的模式同步
#   ./scripts/update.sh --no-pull # 跳过 git pull, 只重新同步本地仓库到 ~/.claude/skills/
#
# 行为:
#   - 软链模式安装的 skill: git pull 后即自动生效, 无需重新拷贝
#   - 拷贝模式安装的 skill: rsync --delete 把仓库目录覆盖到 ~/.claude/skills/<skill>/
#   - 未安装的 skill: 跳过, 不会主动安装新 skill (用 install.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

# 自动发现仓库根目录下所有含 SKILL.md 的目录，避免新增 skill 时改脚本
ALL_SKILLS=()
while IFS= read -r -d '' skill_md; do
  skill_dir="$(basename "$(dirname "$skill_md")")"
  ALL_SKILLS+=("$skill_dir")
done < <(find "$REPO_ROOT" -mindepth 2 -maxdepth 2 -name SKILL.md -print0 | sort -z)

DO_PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) DO_PULL=0 ;;
    --help|-h)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
  esac
done

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
  src="$REPO_ROOT/$skill"
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
