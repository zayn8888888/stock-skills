---
name: test-env
description: 测试 CLAUDE_SKILLS_DIR 环境变量是否注入
triggers:
  - test env
  - 测试环境变量
---

用 Python 打印 `CLAUDE_SKILLS_DIR` 的值，验证 plugin settings.json env 注入是否生效。

## 执行

```bash
python3 - <<'EOF'
import os
val = os.environ.get('CLAUDE_SKILLS_DIR', 'NOT_SET')
print(f'CLAUDE_SKILLS_DIR = {val}')
EOF
```

将结果直接输出给用户。
