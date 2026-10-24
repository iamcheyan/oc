# [202605200203]_Bedrock Scanner 开发记录

## 为什么要这么做 (Why)

需要一个专门的工具来扫描 AWS Bedrock 可用模型、测试调用权限，并将结果写入 `~/.config/opencode/config.json`。同时希望这个 scanner 既能独立运行，也能从 `opencode-repl` 和 `opencode-vim` 中通过 `bedrock-test` 子命令调用。

## 这么做的好处 (Benefits)

1. 用户无需手动翻 `aws cli` 输出，交互式选择即可完成 Bedrock 模型配置
2. 自动测试每个模型的调用权限（invoke-model），只保留可用的
3. scanner 逻辑作为 workspace package 可被 REPL 和 Minimal 共享，无需重复实现
4. 默认预选 `moonshotai.kimi-k2.5`（如果可用），减少用户操作

## 改了哪些东西 (What Changed)

### 新增文件
- `packages/opencode-vim/src/bedrock-test.ts` — Minimal 的 `bedrock-test` yargs 子命令，导入并调用 `runBedrockScanner()`

### 修改文件

#### `packages/bedrock-scanner/src/index.ts`
- 导出 `runBedrockScanner()` 函数，替代原来的 `main()` 自执行
- 使用 `if (import.meta.main)` 守卫：作为 CLI 运行时自动执行，被其他包 `import` 时不执行
- 模型选择默认改为查找 `moonshotai.kimi-k2.5`，如果存在则默认选中

#### `packages/bedrock-scanner/package.json`
- 添加 `"exports"` 字段，允许 workspace 内其他包通过 `"bedrock-scanner"` import

#### `packages/opencode-vim/package.json`
- 添加 `"bedrock-scanner": "workspace:*"` 依赖

#### `packages/opencode-vim/src/index.ts`
- 注册 `BedrockTestCommand` 子命令
- 检测 `bedrock-test` 子命令时跳过 TUI 初始化（`applyMinimalModeDefaults` + `Log.init`）

#### `packages/opencode-repl/src/bedrock.ts`
- `selectModel()` 调用加上 `currentLabel: "amazon-bedrock/moonshotai.kimi-k2.5"`，模型列表中有则自动预选

## 使用方式

```bash
# 1. 独立运行（直接交互式终端）
cd packages/bedrock-scanner && bun run .

# 2. 从 opencode-repl 启动
opencode-repl bedrock-test

# 3. 从 opencode-vim 启动
opencode-vim bedrock-test
```

### 交互流程
1. 选择 AWS profile（默认 `common-api-dev`）
2. 选择 region（默认 `us-east-1`）
3. 自动调用 `aws bedrock list-foundation-models` 拉取模型列表
4. 逐个调用 `aws bedrock-runtime invoke-model` 测试可用性
5. 如果有 `moonshotai.kimi-k2.5`，默认选中
6. 结果写入 `~/.config/opencode/config.json`

## 经验与教训 (Lessons Learned)

### 1. `fs/promises` 没有 `readFileSync`
`fs/promises` 只导出异步方法（`readFile`, `writeFile` 等），不导出 `readFileSync`。如果误用 `import fs from "fs/promises"` 再调用 `fs.readFileSync()`，会在运行时抛出 `TypeError`。但在有 `try/catch` 的情况下错误会被沉默吞掉，导致函数静默返回空结果，排查难度大。

**教训**：需要同步方法用 `import fs from "fs"`；需要异步方法用 `fs.promises.readFile` / `fs.promises.writeFile`；不要混用。

### 2. `import.meta.main` 实现 CLI + Library 双模式
Bun 支持 `import.meta.main` 判断当前文件是否被直接执行。利用这个特性可以让一个文件同时作为 CLI 入口和可导入库：

```ts
export async function runBedrockScanner(): Promise<string | null> { ... }

if (import.meta.main) {
  runBedrockScanner().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
```

### 3. Minimal 包有 `@opentui/solid` 预存导入错误
`opencode-vim` 的入口文件静态 import 了 `@opencode-ai/core/global`，该模块间接依赖 `@opentui/solid`。在本地环境中 `@opentui/solid/jsx-runtime.d.ts` 存在加载问题，导致任何子命令（包括 `bedrock-test`）都启动失败。临时方案是使用 `process.argv.includes("bedrock-test")` 跳过 TUI 初始化，但顶层的 `import` 仍然会被加载。

**解决方向**：编译到二进制时该问题可能消失（Bun build 会正确处理 jsx-runtime）。
