# [20260629]_Agent Routing 系统设计与实现

## 目标

实现 Leader + Worker 路由模式（参考 Magnitude.dev 架构），让主 agent（build）能根据任务类型，用 `task` 工具委派给专门的 sub-agent。

## 架构

```
User
  ↓ prompt (携带 agent + model 配置)
build (Leader) ← 分析任务复杂度
  ↓
简单任务 → build 直接处理
复杂任务 → 用 task 工具委派
  ├─ scout: 快速代码探索 (read-only)
  ├─ engineer: 实现代码 (read/write/bash)
  └─ critic: 独立审查 (read/diff)
  ↓
build 审阅结果 → 决定下一步
```

### 关键原则

- **Leader 决策**：路由决策由 LLM 自主做出，不靠关键词匹配
- **简单任务不自举**：Leader 自己处理简单问题，不走 Worker
- **Worker 不直接通信**：所有结果通过 Leader 中转
- **每个 Worker 有独立 session、system prompt、tools**

## 配置

### Agent 定义: `.opencode/opencode.jsonc`

```jsonc
{
  "agent": {
    "build": {
      "model": "mimo/mimo-v2.5",           // 免费，做路由决策
      "steps": 25,
      "prompt": "You are a coding agent with access to specialized sub-agents..."
    },
    "scout": {
      "model": "mimo/mimo-v2-pro",          // 快速探索
      "steps": 3,
      "tools": ["read", "glob", "grep", "search", "webfetch", "websearch"],
      "prompt": ".opencode/agent/scout.md"
    },
    "engineer": {
      "model": "mimo/mimo-v2.5-pro",        // 实现代码
      "steps": 15,
      "tools": ["read", "edit", "write", "bash", "glob", "grep", "todowrite"],
      "prompt": ".opencode/agent/engineer.md"
    },
    "critic": {
      "model": "ollama/deepseek-v4-flash:cloud", // 审查代码
      "steps": 5,
      "tools": ["read", "glob", "grep", "bash"],
      "prompt": ".opencode/agent/critic.md"
    }
  }
}
```

### Agent 系统 prompt 文件

| 文件 | 用途 |
|------|------|
| `.opencode/agent/scout.md` | Scout: 快速探索，只读，返回文件路径和摘要 |
| `.opencode/agent/engineer.md` | Engineer: 实现代码，遵循现有风格，运行测试 |
| `.opencode/agent/critic.md` | Critic: 独立审查，找 bug、安全问题、风格问题 |

## 工作原理

### 技术机制

每条用户消息携带 `{agent, model}` 配置：

```ts
// createUserMessage 创建的消息
const info: SessionV1.User = {
  id: ...,
  role: "user",
  agent: "build",         // 当前 agent
  model: { providerID: "mimo", modelID: "mimo-v2.5" },
  ...
}
```

prompt loop 从最新消息读取 agent 和 model：
- `lastUser.agent` → `agents.get(agentName)` → 获取 agent 配置（prompt、tools、model）
- `lastUser.model` → `getModel(providerID, modelID)` → 获取模型

### task 工具委派

当 build agent 调用 `task` 工具时，`packages/opencode/src/tool/task.ts` 处理：

1. 创建子 session，设置 agent 和 model
2. 子 session 有独立的 system prompt 和 tools
3. 子 session 运行完成后返回结构化结果
4. Build agent 审阅结果

### 模型切换

切换 agent 时，model 也随之切换。状态栏会显示当前模型名。

## 与 auto-router plugin 的区别

之前错误的 auto-router plugin (`.opencode/plugins/auto-router.ts`) 试图：
- 用关键词匹配自动切换 agent
- 绕过 LLM 决策，直接在 chat.message hook 中修改 agent

正确的方式：
- 在 `opencode.jsonc` 中配置 agent
- 在 build agent 的 system prompt 中描述委派策略
- 让 LLM 自行决定是否使用 `task` 工具

## 当前状态

- [x] Agent 定义在 opencode.jsonc 中
- [x] Scout、Engineer、Critic 的 system prompt 文件
- [x] Build agent 的 system prompt 包含委派策略
- [x] 已删除错误的 auto-router plugin
- [ ] 测试验证委派是否正常工作

## 测试方法

启动 opencode-vim 后：

1. **简单任务**（不应委派）：
   ```
   什么是 RGBA？
   ```

2. **探索任务**（应委派给 scout）：
   ```
   找到所有用到 RGBA 的文件
   ```

3. **实现任务**（应委派给 engineer）：
   ```
   给 .opencode/agent/scout.md 添加示例部分
   ```

4. **审查任务**（应委派给 critic）：
   ```
   审查 .opencode/opencode.jsonc 的配置
   ```

## 外部调用 (脚本化)

OpenCode 可以从 shell 脚本中调用，自动修复变基冲突：

```bash
opencode run "修复冲突" --model mimo/mimo-v2.5 --dir . --dangerously-skip-permissions
```

实现方式：`fork/update.sh` 集成了自动修复功能。当 `git rebase upstream/dev` 失败时：

1. 从 `config.json` 中发现免费模型（mimo 等 provider）
2. 随机选一个
3. 调用 `opencode run` 自动修复冲突
4. 检查修复结果

免费模型发现策略：
- 扫描 `config.json` 中 provider 名称含 `mimo`、`free`、`local`、`gguf` 的
- 随机选一个
- 如果扫描失败，用 fallback 列表

## 参考

- Magnitude.dev 分析: `fork/docs/20260621_magnitude-dev-analysis.md`
- OpenCode 可行性分析: `fork/docs/20260621_magnitude-opencode-feasibility.md`
