#!/usr/bin/env bash
# 卸载 stock-skills 套件 —— 从指定 skills 目录删除本仓库提供的 skill
#
# 用法:
#   ./scripts/uninstall.sh                              # 卸载 user scope (~/.claude/skills/) 全部 skill (有确认)
#   ./scripts/uninstall.sh --scope project              # 卸载当前目录的 .claude/skills/ 下的
#   ./scripts/uninstall.sh stock-analyzer               # 只卸指定 skill
#   ./scripts/uninstall.sh --link-only                  # 只卸软链 (拷贝模式安装的不动)
#   ./scripts/uninstall.sh --dry-run                    # 干跑只列要删的
#   ./scripts/uninstall.sh -y                           # 跳过确认
#
# scope:
#   - user (默认): ~/.claude/skills/
#   - project:     $PWD/.claude/skills/
#
# 安全策略:
#   - 只动"目录名在本仓库 skill 列表"内的 dst, 不会扫到其他来源的 skill
#   - 软链额外校验 readlink 指向本仓库, 不指向时跳过
#   - 拷贝模式无法 100% 验证来源, 但目录名匹配视为本仓库的, 卸载时会显式列出目标供你 review

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SCOPE=""
SKILLS_DIR=""

# 复用 install/update 的扫描逻辑：找仓库下所有 SKILL.md (最多 3 层, 排除 .git/scripts)
ALL_SKILLS=()
ALL_SKILL_SRCS=()
while IFS= read -r -d '' skill_md; do
  src_dir="$(dirname "$skill_md")"
  skill_dir="$(basename "$src_dir")"
  ALL_SKILLS+=("$skill_dir")
  ALL_SKILL_SRCS+=("$src_dir")
done < <(find "$REPO_ROOT" -mindepth 2 -maxdepth 3 -name SKILL.md \
           -not -path "*/.git/*" -not -path "*/scripts/*" -print0 | sort -z)

is_repo_skill() {
  local target="$1"
  local s
  for s in "${ALL_SKILLS[@]}"; do
    [ "$s" = "$target" ] && return 0
  done
  return 1
}

DRY_RUN=0
LINK_ONLY=0
ASSUME_YES=0
TARGETS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n) DRY_RUN=1; shift ;;
    --link-only) LINK_ONLY=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --scope=*) SCOPE="${1#*=}"; shift ;;
    --help|-h)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "未知参数: $1" >&2
      exit 1
      ;;
    *) TARGETS+=("$1"); shift ;;
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

if [ ${#TARGETS[@]} -eq 0 ]; then
  TARGETS=("${ALL_SKILLS[@]}")
fi

if [ ! -d "$SKILLS_DIR" ]; then
  echo "$SKILLS_DIR 不存在, 没有可卸载的内容"
  exit 0
fi

# 第一遍：分类要删的目标 (区分 symlink/dir/missing/foreign)
TO_REMOVE_NAMES=()
TO_REMOVE_PATHS=()
TO_REMOVE_KINDS=()  # symlink | dir
SKIPPED_LINES=()

for skill in "${TARGETS[@]}"; do
  if ! is_repo_skill "$skill"; then
    SKIPPED_LINES+=("  - $skill: 不在本仓库 skill 列表, 跳过")
    continue
  fi

  dst="$SKILLS_DIR/$skill"

  if [ ! -e "$dst" ] && [ ! -L "$dst" ]; then
    SKIPPED_LINES+=("  - $skill: 未安装, 跳过")
    continue
  fi

  if [ -L "$dst" ]; then
    target="$(readlink "$dst")"
    # 软链必须指向本仓库内才删
    case "$target" in
      "$REPO_ROOT"/*)
        TO_REMOVE_NAMES+=("$skill")
        TO_REMOVE_PATHS+=("$dst")
        TO_REMOVE_KINDS+=("symlink")
        ;;
      *)
        SKIPPED_LINES+=("  - $skill: 软链指向 $target (不在本仓库内), 跳过")
        ;;
    esac
    continue
  fi

  if [ "$LINK_ONLY" = "1" ]; then
    SKIPPED_LINES+=("  - $skill: 拷贝模式, --link-only 跳过")
    continue
  fi

  if [ -d "$dst" ]; then
    TO_REMOVE_NAMES+=("$skill")
    TO_REMOVE_PATHS+=("$dst")
    TO_REMOVE_KINDS+=("dir")
  fi
done

# 展示计划
echo "==> 卸载目标: $SKILLS_DIR"
[ "$DRY_RUN" = "1" ] && echo "==> 模式: dry-run (不会真删)"

if [ ${#TO_REMOVE_NAMES[@]} -eq 0 ]; then
  echo
  echo "没有可卸载的 skill。"
  if [ ${#SKIPPED_LINES[@]} -gt 0 ]; then
    echo
    printf '%s\n' "${SKIPPED_LINES[@]}"
  fi
  exit 0
fi

echo
echo "将删除以下 ${#TO_REMOVE_NAMES[@]} 项:"
for i in "${!TO_REMOVE_NAMES[@]}"; do
  echo "  ✗ ${TO_REMOVE_NAMES[$i]} (${TO_REMOVE_KINDS[$i]}) → ${TO_REMOVE_PATHS[$i]}"
done

if [ ${#SKIPPED_LINES[@]} -gt 0 ]; then
  echo
  echo "跳过:"
  printf '%s\n' "${SKIPPED_LINES[@]}"
fi

# 确认
if [ "$DRY_RUN" = "1" ]; then
  echo
  echo "(dry-run, 未执行)"
  exit 0
fi

if [ "$ASSUME_YES" != "1" ]; then
  echo
  read -r -p "确认删除? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "已取消"; exit 0 ;;
  esac
fi

# 执行
echo
removed=0
for i in "${!TO_REMOVE_PATHS[@]}"; do
  rm -rf "${TO_REMOVE_PATHS[$i]}"
  echo "  ✓ ${TO_REMOVE_NAMES[$i]} 已删除"
  removed=$((removed + 1))
done

echo
echo "完成: 卸载 $removed 个。重启 Claude Code 或新开会话即可生效。"

# --scope project 时清理 .claude/settings.json 中的 CLAUDE_SKILLS_DIR
if [ "${SCOPE:-}" = "project" ]; then
  SETTINGS_FILE="$PWD/.claude/settings.json"
  if [ -f "$SETTINGS_FILE" ] && command -v jq >/dev/null 2>&1; then
    if jq -e '.env.CLAUDE_SKILLS_DIR' "$SETTINGS_FILE" >/dev/null 2>&1; then
      jq 'del(.env.CLAUDE_SKILLS_DIR) | if .env == {} then del(.env) else . end' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
      echo "已从 $SETTINGS_FILE 移除 env.CLAUDE_SKILLS_DIR"
    fi
  fi
fi
