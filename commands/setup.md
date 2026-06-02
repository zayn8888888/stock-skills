---
description: 初始化 stock-skills 脚本路径，plugin 安装后运行一次即可
allowed-tools: Bash
---

检测 stock-skills plugin 的安装路径，写入 `CLAUDE_SKILLS_DIR` 到 Claude Code 全局配置，重启后生效。

## 步骤

**1. 探测 plugin 路径**

```bash
SKILLS_DIR=$(
  ls -d "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/plugins/cache/*/stock-skills/*/futu 2>/dev/null | tail -1
)
echo "探测结果: ${SKILLS_DIR:-未找到}"
```

- 有结果 → 继续步骤 2
- 无结果 → 提示用户：stock-skills 未通过 plugin 安装，请先运行 `/plugin install stock-skills@stock-skills`

**2. 写入全局配置**

```bash
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

if ! command -v jq &>/dev/null; then
  echo "❌ 未找到 jq，请先安装：brew install jq"
  exit 1
fi

write_env() {
  local file="$1"
  [ -f "$file" ] || return
  tmp=$(mktemp)
  jq --arg v "$SKILLS_DIR" '.env.CLAUDE_SKILLS_DIR = $v' "$file" > "$tmp" && mv "$tmp" "$file"
  echo "✅ 已写入 $file"
}

# 写标准 CC 和 ft-claude-code 的配置（有哪个写哪个）
write_env "$CONFIG_DIR/settings.json"
write_env "$CONFIG_DIR/ft-settings.json"
```

**3. 验证**

```bash
python3 "${SKILLS_DIR}/futuapi/scripts/quote/get_snapshot.py" --help 2>&1 | head -3
```

- 输出 usage 信息 → 配置成功
- 报 `No such file` → 探测路径有误，告知用户手动检查

**4. 完成**

告知用户：**重启 Claude Code**（新开会话）后所有 futuapi 相关 skill 即可正常使用。
