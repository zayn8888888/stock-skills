#!/usr/bin/env bash
# 安装 stock-skills 套件
#
# 用法:
#   ./scripts/install.sh                              # 拷贝模式 + user scope (~/.claude/skills/)
#   ./scripts/install.sh --link                       # 软链模式 (推荐: git pull 自动更新)
#   ./scripts/install.sh --scope project              # 装到当前目录的 .claude/skills/
#   ./scripts/install.sh stock-analyzer               # 只装指定 skill
#   ./scripts/install.sh --link --scope project stock-analyzer
#
# scope:
#   - user (默认): ~/.claude/skills/   全局可用
#   - project:     $PWD/.claude/skills/  仅当前项目可用 (在哪里跑就装到哪里)
#
# 拷贝 vs 软链:
#   - 拷贝: 安全, 本地改动不会污染仓库; 更新需重跑 ./scripts/update.sh
#   - 软链: cd 仓库 git pull 即更新; 但本地改 skill = 改仓库

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# scope 解析后再决定 SKILLS_DIR; CLAUDE_SKILLS_DIR 仍可作为最高优先级覆盖
SCOPE=""
SKILLS_DIR=""

# 自动发现仓库下所有含 SKILL.md 的目录（最多 3 层，支持 group/skill 分组）
# skill 名取目录 basename，安装到 ~/.claude/skills/<skill>/，分组目录对外不可见
# 用并行数组而不是关联数组，兼容 macOS 自带 bash 3.2
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

# 按 skill 名查找其源目录，找不到返回空
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

MODE="copy"
TARGETS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --link|-l) MODE="link"; shift ;;
    --scope) SCOPE="${2:-}"; shift 2 ;;
    --scope=*) SCOPE="${1#*=}"; shift ;;
    --help|-h)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "未知参数: $1" >&2
      exit 1
      ;;
    *) TARGETS+=("$1"); shift ;;
  esac
done

# 解析 SKILLS_DIR：CLAUDE_SKILLS_DIR > --scope > 默认 user
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

mkdir -p "$SKILLS_DIR"

echo "==> 安装目标: $SKILLS_DIR"
echo "==> 模式: $MODE"
echo "==> Skill: ${TARGETS[*]}"
echo

for skill in "${TARGETS[@]}"; do
  src="$(lookup_skill_src "$skill" || true)"
  dst="$SKILLS_DIR/$skill"

  if [ -z "$src" ] || [ ! -d "$src" ]; then
    echo "  ✗ $skill: 仓库中找不到该 skill (无 SKILL.md)，跳过"
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
echo

# --scope project 时自动配置 .claude/settings.json 中的 CLAUDE_SKILLS_DIR
if [ "${SCOPE:-}" = "project" ]; then
  SETTINGS_FILE="$PWD/.claude/settings.json"
  mkdir -p "$PWD/.claude"

  if command -v jq >/dev/null 2>&1; then
    if [ -f "$SETTINGS_FILE" ]; then
      # 合并：保留已有字段，注入/更新 env.CLAUDE_SKILLS_DIR
      jq --arg dir "$SKILLS_DIR" '.env.CLAUDE_SKILLS_DIR = $dir' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" \
        && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    else
      jq -n --arg dir "$SKILLS_DIR" '{"env": {"CLAUDE_SKILLS_DIR": $dir}}' > "$SETTINGS_FILE"
    fi
    echo "已自动配置 ${SETTINGS_FILE}:"
    echo "  env.CLAUDE_SKILLS_DIR = ${SKILLS_DIR}"
    echo
  else
    echo "⚠️  jq 未安装，无法自动写入 ${SETTINGS_FILE}"
    echo "   请手动添加以下配置："
    echo "   {\"env\": {\"CLAUDE_SKILLS_DIR\": \"${SKILLS_DIR}\"}}"
    echo
  fi
fi

echo "提示：event-calendar 的「美国经济日历 / 美股财报日历」需 Finnhub API key（免费）："
echo "  1. 申请：https://finnhub.io/register"
echo "  2. 配置：export FINNHUB_API_KEY=xxxxxx"
echo "     首选写入 ~/.zshenv（non-interactive shell 也生效，对 Claude Code Bash 工具最稳）"
echo "     次选 ~/.zshrc / ~/.bashrc（仅交互 shell 生效，skill 已做 grep 兜底）"
echo "  未配置时 event-calendar 仅启用 Polymarket + Tavily 两源，不阻塞使用。"
