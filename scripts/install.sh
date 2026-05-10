#!/usr/bin/env bash
# 安装 stock-skills 套件到 ~/.claude/skills/
#
# 用法:
#   ./scripts/install.sh                          # 拷贝模式安装全部 skill
#   ./scripts/install.sh --link                   # 软链模式安装全部 skill (推荐: git pull 自动更新)
#   ./scripts/install.sh stock-analyzer           # 只装指定 skill (拷贝模式)
#   ./scripts/install.sh --link stock-analyzer market-scanner   # 只装指定 skill (软链模式)
#
# 拷贝 vs 软链:
#   - 拷贝: 安全, 本地改动不会污染仓库; 更新需重跑 ./scripts/update.sh
#   - 软链: cd 仓库 git pull 即更新; 但本地改 skill = 改仓库

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
ALL_SKILLS=(market-scanner stock-analyzer stock-fundamentals stock-valuation)

MODE="copy"
TARGETS=()

for arg in "$@"; do
  case "$arg" in
    --link|-l) MODE="link" ;;
    --help|-h)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "未知参数: $arg" >&2
      exit 1
      ;;
    *) TARGETS+=("$arg") ;;
  esac
done

if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=("${ALL_SKILLS[@]}")
fi

mkdir -p "$SKILLS_DIR"

echo "==> 安装目标: $SKILLS_DIR"
echo "==> 模式: $MODE"
echo "==> Skill: ${TARGETS[*]}"
echo

for skill in "${TARGETS[@]}"; do
  src="$REPO_ROOT/$skill"
  dst="$SKILLS_DIR/$skill"

  if [ ! -d "$src" ]; then
    echo "  ✗ $skill: 源目录不存在 ($src)，跳过"
    continue
  fi

  if [ -e "$dst" ] || [ -L "$dst" ]; then
    rm -rf "$dst"
  fi

  if [ "$MODE" = "link" ]; then
    ln -s "$src" "$dst"
    echo "  ✓ $skill (symlink → $src)"
  else
    cp -R "$src" "$dst"
    echo "  ✓ $skill (copied)"
  fi
done

echo
echo "完成。重启 Claude Code 或新开会话即可使用。"
