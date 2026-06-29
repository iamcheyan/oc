#!/bin/bash
set -euo pipefail

OPENCODE="./fork/dist/opencode-linux-arm64/bin/opencode"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# 从 config.jsonc 中发现免费模型，随机选一个
pick_free_model() {
  local cfg candidates
  # 尝试多个 config 路径
  for f in "$ROOT_DIR/config.json" "$ROOT_DIR/.opencode/opencode.jsonc" "$HOME/.config/opencode/config.json" "$HOME/.opencode.jsonc"; do
    [ -f "$f" ] && cfg="$f" && break
  done
  if [ -n "${cfg:-}" ]; then
    candidates=$(python3 -c "
import json, re, sys, random

def strip(s):
    s = re.sub(r'//.*', '', s)
    s = re.sub(r',\s*([}\]])', r'\1', s)
    return s

with open('$cfg') as f:
    raw = f.read()
cleaned = strip(raw)
config = json.loads(cleaned)

# 免费 provider 关键词
free_keywords = ['mimo', 'free', 'local', 'gguf']
models = []
for pid, p in config.get('provider', {}).items():
    pid_lower = pid.lower()
    if any(kw in pid_lower for kw in free_keywords):
        for mid in p.get('models', {}):
            models.append(f'{pid}/{mid}')

if models:
    print(random.choice(models))
else:
    print('')
" 2>/dev/null || true)
  fi
  if [ -z "${candidates:-}" ]; then
    # fallback: 已知免费模型
    candidates=("mimo/mimo-v2.5" "mimo/mimo-v2-pro" "mimo/mimo-v2.5-pro")
    echo "${candidates[$RANDOM % ${#candidates[@]}]}"
  else
    echo "$candidates"
  fi
}

echo "=== Fetching upstream ==="
git fetch upstream

echo ""
echo "=== Current state ==="
git log --oneline -3 origin/main 2>/dev/null || echo "(no origin/main)"
echo "..."
git log --oneline -3 HEAD

echo ""
echo "=== Rebase on upstream/dev ==="
BACKUP_BRANCH="backup/main-before-upstream-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_BRANCH"
echo "Backup created: $BACKUP_BRANCH"

if git rebase upstream/dev; then
  echo ""
  echo "=== Rebase complete ==="
  echo "If successful, push with: git push origin main --force-with-lease"
  echo "To rollback: git checkout main && git reset --hard $BACKUP_BRANCH"
  exit 0
fi

echo ""
echo "=== Rebase failed, attempting auto-fix ==="
MODEL=$(pick_free_model)
echo "Using model: $MODEL"

"$OPENCODE" run "
变基 upstream/dev 失败，有冲突需要解决。
请执行以下步骤：
1. 查看冲突文件：git status
2. 修复所有冲突（编辑冲突文件，选择正确的内容）
3. 执行 git add 标记已解决
4. 执行 git rebase --continue
5. 确认变基成功：git log --oneline -3
" --model "$MODEL" --dir "$ROOT_DIR" --dangerously-skip-permissions --format json 2>/dev/null || true

# 检查是否仍有冲突
if git rebase --continue 2>&1; then
  echo ""
  echo "=== Auto-fix succeeded ==="
  echo "Push with: git push origin main --force-with-lease"
elif git status 2>&1 | grep -q "rebasing"; then
  echo ""
  echo "=== Auto-fix incomplete, manual resolution needed ==="
  echo "Continue with: git rebase --continue"
  echo "Or abort with: git rebase --abort"
  exit 1
fi
