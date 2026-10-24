> **创建时间**: 2026-05-15 13:09

# Fork 代码结构重构

## 背景

将 fork 专用 CLI 代码从 `packages/opencode/src/cli-cmd/` 迁移到独立的 `packages/opencode-repl/` 包，实现与上游代码的完全分离。

## 重构内容

### 1. 目录结构变更

**重构前:**
```
packages/opencode/src/cli-cmd/     # fork 代码嵌套在上游包中
packages/opencode/src/cli/cmd/     # 上游代码
```

**重构后:**
```
packages/opencode/                  # 上游核心代码（完全未修改）
packages/opencode-repl/              # fork 专用 CLI（独立包）
├── src/
│   ├── index.ts                    # CLI 入口
│   ├── repl.ts                     # REPL 实现
│   ├── render.ts                   # 渲染逻辑
│   ├── session.ts                  # Session 管理
│   ├── bedrock-test.ts             # Bedrock 测试功能
│   └── ...
├── package.json                    # 独立包配置
└── tsconfig.json                   # TypeScript 配置
```

### 2. 文件移动

从 `packages/opencode/src/cli-cmd/` 移动到 `packages/opencode-repl/src/`:
- `index.ts` - CLI 入口
- `repl.ts` - REPL 实现
- `render.ts` - 渲染逻辑
- `session.ts` - Session 管理
- `bedrock.ts` - Bedrock 相关
- `bedrock-test.ts` - Bedrock 测试（从上游 cli/cmd 移回）
- `render.ts` - 渲染
- `slash.ts`, `slash-model.ts` - Slash 命令
- `styles.ts` - 样式定义
- `state.ts` - 状态管理

### 3. 导入路径更新

**更新前:**
```typescript
import { UI } from "../cli/ui"
import { Process } from "@/util/process"
import { startRepl } from "@/cli-cmd/repl"
```

**更新后:**
```typescript
import { UI } from "@opencode/cli/ui"
import { Process } from "@opencode/util/process"
import { startRepl } from "./repl"
```

所有导入统一使用 `@opencode/*` 别名指向 `packages/opencode/src/*`。

### 4. 配置文件

**package.json:**
```json
{
  "name": "@opencode-ai/cli",
  "type": "module",
  "dependencies": {
    "@opencode-ai/core": "workspace:*"
  }
}
```

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@opencode/*": ["../opencode/src/*"]
    }
  }
}
```

### 5. 构建脚本更新

**fork/build.sh:**
- `ENTRY` 从 `$PKG_DIR/src/opencode-repl/index.ts` 改为 `$CLI_DIR/src/index.ts`
- `cd "$PKG_DIR"` 改为 `cd "$CLI_DIR"`
- Bun 构建 entrypoints 从 `./src/opencode-repl/index.ts` 改为 `./src/index.ts`

**fork/update.sh:**
- `OUR_DIRS` 从 `packages/opencode/src/opencode-repl` 改为 `packages/opencode-repl`

### 6. 文档更新

更新以下文件中的路径引用:
- `AGENTS.md` - Fork Intent 规则
- `README.md` - 项目文档
- `fork/docs/cli-development-status.md`
- `fork/docs/image-paste-in-cli.md`

所有 `cli-cmd` 或 `opencode/src/opencode-repl` 引用统一改为 `opencode-repl`。

## 代码修复

### ANSI 颜色修复

**问题:** 代码高亮时破坏 ANSI 转义序列

**修复:** `render.ts` 中的 `highlightCodeSimple` 函数:
```typescript
// 检查是否在 ANSI 序列内部
const escMatches = before.match(/\x1b\[/g) || []
const resetMatches = before.match(/\x1b\[0m/g) || []
if (escMatches.length > resetMatches.length) {
  return m  // 在 ANSI 序列内，跳过
}
```

**问题:** 颜色状态泄漏到后续行

**修复:** 在 `renderMarkdown` 中每行后添加 `S.reset`:
```typescript
println(formatInline(line) + S.reset)
println(highlighted + S.reset)
```

## 验证

构建成功:
```bash
cd fork && bash build.sh
# Output: Build complete! Binary: .../opencode-linux-x64/bin/opencode-repl
```

## 注意事项

1. **上游代码零修改** - `packages/opencode/` 完全保持原样
2. **独立包结构** - `opencode-repl` 可以作为独立包发布
3. **清晰分离** - 一眼就能看出哪些是 fork 代码
4. **构建简化** - CLI 构建在独立目录，不影响上游

## 相关提交

- 目录重命名和文件移动
- 导入路径更新
- 构建脚本调整
- 文档更新
- ANSI 颜色修复
