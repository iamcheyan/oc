# [202606152140]_OC 的 Rebase 维护模型

> 日期：2026-06-15
>
> 上游：`https://github.com/anomalyco/opencode.git` 的 `dev`

## 结论

OC 改为与 PI 相同的长期维护模型：

```text
upstream/dev: A---B---C---D
                         \
origin/main:              F1---F2---F3
```

`A-D` 是上游提交，`F1-F3` 是 OC 自己的提交。上游更新到 `E` 后执行
rebase，结果变为：

```text
upstream/dev: A---B---C---D---E
                             \
origin/main:                  F1'---F2'---F3'
```

`F1'` 等不是把旧文件直接覆盖回来，而是 Git 按顺序重新应用每个 OC
提交所表达的改动。提交 SHA 会改变，所以推送必须使用
`--force-with-lease`；代码意图保持不变。

## 为什么现在适合整理

旧历史包含多次上游 merge、同步脚本产生的元数据删除，以及已经失效的
核心代码差异。它们不能准确表达当前 OC 的功能边界，而且用户已确认旧
提交历史没有保留价值。

重建后的边界更简单：

- 完整保留最新版上游代码、文档、工作流和 `AGENTS.md`。
- OC 主体位于 `packages/opencode-vim/**`、`packages/miniapps/**`、
  `packages/bedrock-scanner/**` 和 `.oc/**`。
- 根 `package.json` 与 `bun.lock` 只承担 fork workspace 接入。
- `.gitignore` 与 `.opencode/.gitignore` 只承担 fork 本地开发产物过滤。
- 上游源码只保留两个带 `FORK-SEAM (opencode-vim)` 标记的文件。
- `fork/**` 只保存构建、同步、边界检查和维护文档，不保存上游源码镜像。

旧分支已经保存在：

```text
origin/backup/main-before-rebase-20260615
```

## 日常开发

正常在 `main` 开发即可，不需要为每个功能建立长期分支，也不需要把所有
代码塞进 `fork/`。建议按职责提交：

1. fork package 内的功能提交。
2. 必要的上游 seam 提交。
3. 构建、文档或发布提交。

目录隔离能减少文本冲突，但无法避免上游 API 变化。即使 rebase 没有冲突，
仍必须运行测试和构建。

## 上游更新

工作区干净时执行：

```bash
bash fork/update.sh
```

脚本会：

1. fetch `origin` 和 `upstream`。
2. 检查远端当前分支没有本地未知提交。
3. 在 origin 创建带时间戳的安全备份分支。
4. 执行 `git rebase upstream/dev`。
5. 检查 fork ownership 和两个 seam。
6. 运行 Vim TUI 测试、类型检查和完整构建。
7. 使用 `--force-with-lease` 更新 fork 的同名远端分支。

发生冲突时脚本会停止，不会自动选择 ours/theirs。处理方式：

```bash
git status
git diff --name-only --diff-filter=U
# 编辑并理解冲突
git add <resolved-files>
git rebase --continue
```

放弃本次同步：

```bash
git rebase --abort
```

## 冲突判断

| 区域 | 处理原则 |
| --- | --- |
| `packages/opencode-vim/**` | 保留 OC 功能，同时适配上游新 API |
| 其他 fork-owned 目录 | 通常保留 OC，但检查依赖和接口是否变化 |
| 两个 seam 文件 | 以上游新结构为主体，重新放入最小标记逻辑 |
| 普通上游源码 | 采用上游，不能顺手扩大 fork 修改范围 |
| `package.json` / `bun.lock` | 以上游为基础，恢复 workspace 后重新生成 lock |
| README / CI | 上游文件完整保留，fork 使用独立文件名避免覆盖 |

## 与旧覆盖方案的区别

旧方案的“拉一份完整上游，再把 fork 文件覆盖回去”会隐藏删除、重命名和 API
迁移，很容易产生表面更新成功、实际代码仍停留在旧版本的问题。

新方案保存的是提交所表达的修改。Git 能处理路径未冲突的变化；发生冲突时
明确停止；边界检查还能发现意外改动了普通上游文件。因此 rebase 模型更适合
当前“主体独立、注入极少”的 OC。
