# [202605151734]_CLI消息队列方案

## 背景

当前 fork CLI 已经有一层本地串行输入处理能力：

- REPL 会把输入按顺序交给 `processQueue()`
- 一次只执行一个 `turn`
- 当前 turn 结束后才会继续处理下一条

但它还不是 TUI 那种完整的消息队列体验，主要问题是：

- 用户看不到“当前消息是否已入队”
- `Ctrl+C` 只是在中断当前任务，没有明确的“中断后继续下一条”语义
- 队列状态是 `repl.ts` 里的局部变量，不方便展示、测试和后续扩展
- 多行输入和普通输入没有统一成一个正式的队列模型

## 目标

为 CLI 增加一个最小但完整的消息队列能力，接近 TUI 的使用体验：

1. 当前任务执行时，用户仍然可以继续输入新消息
2. 新消息会进入队列，等待前一条完成后进入“继续下一条”确认
3. 用户可以 `Ctrl+C` 中断当前任务，随后决定是否继续处理队列中的下一条
4. 用户能明确看到：
   - 当前是否正在执行
   - 新输入是否已成功排队
   - 当前队列里还有多少条

## 非目标

本轮不做：

- 优先级队列
- 队列消息编辑
- 队列消息持久化到 session/history
- 和 TUI 完全一致的多面板展示
- 复杂的 `/drop <id>`、`/reorder` 等高级管理命令

## CLI 交互设计

### 1. 当前任务执行时继续输入

当 assistant 正在响应时，用户仍可以在 prompt 输入新文本。

输入提交后，不立即执行，而是进入待处理队列。

CLI 立即打印一条轻量反馈，例如：

```text
  Queued #2 · 18 chars
```

或

```text
  Queued · 2 waiting
```

要求：

- 不打断当前正在输出的 assistant 正文
- 不需要完整回显排队消息正文
- 提示应足够短，避免刷屏

### 2. 当前 turn 正常结束

当当前任务正常完成后：

- 如果队列为空，回到普通 prompt
- 如果队列非空，提示用户是否继续下一条

建议显示：

```text
✔ Task #1 completed
  Next: #2 summarize the current branch changes
  Auto-continue? [Y/n/pause]
```

语义：

- `Y` / 回车：继续执行下一条
- `n`：跳过当前下一条，继续询问更后面的下一条
- `pause` / `p`：暂停队列，回到普通 prompt

### 3. Ctrl+C 语义

建议明确为：

- `Ctrl+C`
  中断当前正在执行的 turn
- 中断成功后
  如果后面仍有排队项，则进入“是否继续下一条”的确认
- `Ctrl+C Ctrl+C`
  仍然退出整个 CLI

中断后建议显示：

```text
Interrupted current task
```

如果队列为空，则只显示：

```text
Interrupted current task
```

### 4. 最小队列可见性

第一版不做复杂队列管理，但建议至少有三个 slash 命令：

```text
/queue
/resume-queue
/clear-queue
```

显示：

- 当前是否有 active turn
- 当前待处理条数
- 每条队列消息的简短预览

例如：

```text
Queue:
  Active: running
  Waiting: 2
  1. summarize the branch changes
  2. explain the permission flow
```

## 实现建议

### 1. 把队列状态移出 `repl.ts` 局部变量

当前 `inputQueue` / `processing` 在 `replLoop()` 内部。

建议抽成一个正式 runtime state，例如：

```ts
type QueuedTurn = {
  id: number
  text: string
  createdAt: number
}
```

```ts
type ReplQueueState = {
  activeTurnID?: number
  queuedTurns: QueuedTurn[]
  nextTurnID: number
  processing: boolean
}
```

这样有几个好处：

- slash 命令可以读取队列
- `Ctrl+C` 可以稳定知道当前在中断什么
- 更容易写测试
- 后续扩展 `/queue`、`/clear-queue` 不需要再重构一次

### 2. 输入处理语义

普通输入提交时：

- 如果当前没有 active turn，立即执行
- 如果当前有 active turn，则进入 `queuedTurns`

多行粘贴和普通输入都走同一套排队逻辑，不再分散成单独的临时变量语义。

### 3. 中断后的调度

`Ctrl+C` 时：

- abort 当前 `turn`
- 调用 `sdk.session.abort({ sessionID })`
- 清理 active turn 标记
- 如果 `queuedTurns.length > 0`，立即调度下一条

重点是：

- 不要把整个队列一起清空
- 不要因为 abort 把 `processing` 状态弄乱
- 不要让 `processQueue()` 和 `SIGINT` 后的恢复调度重复触发

### 4. 输出展示

建议把队列提示做成 dim 行，不要和 assistant 正文一个视觉层级。

例如：

```text
  Queued #3 · 1 waiting
```

优先级：

- 易懂
- 不抢正文视觉焦点
- 能在连续使用时快速扫一眼理解状态

## 测试建议

自动测试优先覆盖：

1. 当前无 active turn 时，输入立即执行
2. 当前有 active turn 时，输入进入队列
3. 当前 turn 完成后，下一条自动开始
4. `Ctrl+C` 中断当前 turn 后，队列保留
5. 中断后若队列非空，下一条会自动执行
6. `/queue` 能反映当前状态

手动测试建议：

- 单条执行中输入第二条消息
- 执行中连续输入两条消息
- 执行中 `Ctrl+C` 后观察是否自动切到下一条
- 队列为空时 `Ctrl+C`
- permission prompt 出现时再输入内容，确认不会污染队列

## MVP 范围

第一版建议只做：

- 正式消息队列状态
- 执行中继续输入并排队
- 当前 turn 完成后自动处理下一条
- `Ctrl+C` 中断当前并继续下一条
- `/queue` 查看队列

先不做：

- 删除指定单条队列项
- 重新排序
- 队列持久化
- 恢复历史排队项

## 当前实现状态

当前已落地：

- [x] 正式的 runtime queue state
- [x] 执行中继续输入并排队
- [x] 队列入队提示
- [x] 当前 turn 完成后询问是否继续下一条
- [x] `Ctrl+C` 中断当前后保留队列并等待下一步决策
- [x] `/queue` 查看当前队列
- [x] `/resume-queue` 恢复暂停中的队列
- [x] `/clear-queue` 清空等待中的队列项

当前未做：

- [ ] 删除指定单条队列项
- [ ] 重新排序
- [ ] 队列持久化

## 手动测试

建议按下面顺序测试：

1. 启动 `opencode-repl`
2. 输入一个会执行较久的问题
3. 在 assistant 仍在工作时，再输入第二条和第三条消息
4. 观察是否出现：
   - `Queued #2 ...`
   - `Queued #3 ...`
5. 输入 `/queue`
   检查 active 和 waiting 是否正确
6. 等第一条任务结束
   检查是否出现：
   - `✔ Task #1 completed`
   - `Next: #2 ...`
   - `Auto-continue? [Y/n/pause]`
7. 分别测试：
   - 回车：继续下一条
   - `n`：跳过这一条
   - `pause`：暂停队列
8. 输入 `/queue`
   检查 mode 是否变成 `paused` 或 `awaiting-confirmation`
9. 输入 `/resume-queue`
   检查是否恢复继续执行
10. 输入 `/clear-queue`
   检查等待项是否被清空

## 结论

这个功能在当前 fork CLI 中是值得做的，而且实现成本可控。

原因不是“和 TUI 对齐”本身，而是它能显著改善 CLI 的连续工作体验：

- 用户不必等一条完全结束再输入下一条
- 中断当前任务后不会丢失后续意图
- CLI 在长任务和工具密集场景下更接近可连续操作的工作台

建议按 MVP 方式落地，不要第一版就做复杂队列管理。
