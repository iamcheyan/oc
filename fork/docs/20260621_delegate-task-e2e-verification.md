# delegate_task 端到端验证步骤

> 日期: 2026-06-21
> 目的: 手动验证 `mina_delegate_task` 全链路可用。
> 前置: Step 1–5 已完成，plugin 已注册。

---

## 准备

### 1. 确认配置文件存在

```bash
cat .opencode/mina-routing.jsonc
```

预期内容（最少）:

```jsonc
{
  "routing": {
    "enabled": true,
    "agents": {
      "leader":   { "agent": "build",    "model": "ollama/glm-5.2:cloud" },
      "scout":    { "agent": "scout",    "model": "ollama/deepseek-v4-flash:cloud" },
      "engineer": { "agent": "engineer", "model": "mimo/mimo-v2.5-pro" },
      "critic":   { "agent": "critic",   "model": "ollama/glm-5.2:cloud" }
    }
  }
}
```

如果文件不存在，手动创建。

### 2. 确认 plugin 已注册

```bash
grep "mina-delegate-task\|delegate-task/plugin" .opencode/opencode.jsonc
```

预期: 文件中 `"plugin"` 数组包含 delegate-task plugin 路径。

### 3. 启动 OpenCode

正常启动 opencode-vim 或 opencode CLI。

---

## 验证步骤

### V1: 基本委派 — scout 探索

在主 agent (build) 中输入:

```
使用 mina_delegate_task 让 scout 列出 fork/adapter/ 目录下的所有 .ts 文件
```

| 检查项 | 预期 | 失败表现 |
|--------|------|----------|
| tool 被调用 | build 调用 `mina_delegate_task` | build 使用内置 `task` 而不是 `mina_delegate_task` |
| subagent_type | `"scout"` | 用了其他 agent |
| 使用的模型 | `ollama/deepseek-v4-flash:cloud`（来自 routing config） | 用了默认模型而不是配置模型 |
| 返回内容 | 包含文件列表 + `Session ID` | 无结果或报错 |

### V2: 基本委派 — engineer 实现

```
使用 mina_delegate_task 让 engineer 在 fork/adapter/oh-my-opencode/delegate-task/ 下创建一个 hello.txt 文件，内容为 "hello from engineer"
```

| 检查项 | 预期 | 失败表现 |
|--------|------|----------|
| tool 被调用 | build 调用 `mina_delegate_task` | build 使用内置 `task` |
| subagent_type | `"engineer"` | — |
| 使用的模型 | `mimo/mimo-v2.5-pro`（来自 routing config） | 用了默认模型 |
| 文件创建 | `hello.txt` 存在且内容正确 | 文件未创建 |
| 返回内容 | 包含 `Session ID` | 无 Session ID |

### V3: Session 续接

V2 返回的 Session ID 记为 `<SESSION_ID>`。

```
使用 mina_delegate_task 续接 session_id="<SESSION_ID>"，让 engineer 把 hello.txt 内容改为 "hello continued"
```

| 检查项 | 预期 | 失败表现 |
|--------|------|----------|
| session_id 续接 | 不创建新 session | 创建了新 session（丢失上下文） |
| 文件更新 | hello.txt 内容变为 "hello continued" | 文件未更新或内容错误 |
| 上下文保留 | engineer 知道之前创建了 hello.txt | engineer 不知道之前做了什么 |

### V4: 显式 model 覆盖

```
使用 mina_delegate_task 让 scout 探索 .opencode/ 目录，但用 mimo/mimo-v2.5-pro 模型
```

| 检查项 | 预期 | 失败表现 |
|--------|------|----------|
| 模型 | `mimo/mimo-v2.5-pro`（显式传入，覆盖 routing config） | 用了 routing config 的模型 |
| subagent_type | `"scout"` | — |

### V5: Routing disabled

手动编辑 `.opencode/mina-routing.jsonc`，设置 `"enabled": false`。

```
使用 mina_delegate_task 让 engineer 列出当前目录的文件
```

| 检查项 | 预期 | 失败表现 |
|--------|------|----------|
| 使用的模型 | agent 默认模型（不是 routing config 中的模型） | 仍用 routing config 的模型 |

验证完成后恢复 `"enabled": true`。

### V6: 配置文件缺失

重命名 `.opencode/mina-routing.jsonc` 为 `.opencode/mina-routing.jsonc.bak`。

```
使用 mina_delegate_task 让 scout 列出 src/ 目录
```

| 检查项 | 预期 | 失败表现 |
|--------|------|----------|
| 是否报错 | 不报错，正常执行 | 抛异常或中断 |
| 使用的模型 | agent 默认模型 | — |

验证完成后恢复文件名。

### V7: TUI 面板联动（需要 Step 4 完成后才能验证）

在 TUI routing 面板中修改 engineer 的模型为 `ollama/glm-5.2:cloud`，保存。

```bash
grep engineer .opencode/mina-routing.jsonc
```

| 检查项 | 预期 | 失败表现 |
|--------|------|----------|
| 文件更新 | engineer 的 model 字段已更新 | 文件未变化 |
| 下次调用 | `mina_delegate_task({ subagent_type: "engineer" })` 使用新模型 | 仍用旧模型 |

---

## 已知问题

（验证过程中发现问题时记录在这里）

| 日期 | 问题 | 影响范围 | 状态 |
|------|------|----------|------|
| — | — | — | — |

---

## 完成标准

以下全部满足视为验证通过：

- [ ] V1: scout 探索使用配置模型
- [ ] V2: engineer 实现使用配置模型并创建文件
- [ ] V3: session_id 续接保留上下文
- [ ] V4: 显式 model 覆盖生效
- [ ] V5: routing disabled 时 fallback 到默认模型
- [ ] V6: 配置文件缺失时不报错
- [ ] V7: TUI 面板写入的配置被 plugin 读取（需 Step 4）