# opencode-vim

把 [opencode](https://opencode.ai) 变成 vim 风格操作体验的 **纯 TUI 插件**。

不修改 opencode 本身的任何源码：所有功能（vim 模式、LEADER 菜单、状态栏、oceanblack 主题、最近会话）都通过官方插件 API（`api.ui.Prompt`、`api.keymap`、`api.slots`、`api.theme`）实现。

## 功能

- **Vim 模式**：在输入框内按 `Esc` 进入 `NORMAL` 模式（失焦、隐藏光标），按 `i` / `a` / `I` / `A` / `o` / `O` 回到 `INSERT` 模式。
- **状态栏**（`home_footer`）：左下角实时显示 `NORMAL` / `INSERT` 与当前工作目录。
- **LEADER 菜单**：`NORMAL` 模式下按 `Space` 打开，再按分组键进入子菜单，`j/k` 或 `↑/↓` 移动，`Enter` 执行，`Esc` / `Backspace` 返回/关闭。
- **翻页与跳转**（NORMAL 模式）：
  - `j` / `↓`、`k` / `↑`：上/下移动一行
  - `Ctrl+f` / `Ctrl+b`：下/上翻一页
  - `Ctrl+d` / `Ctrl+u`：下/上半页
  - `gg` / `G`：跳到首条 / 末条消息
- **命令面板**：NORMAL 模式按 `:` 打开 opencode 命令面板。
- **lazygit**：LEADER 菜单 `l` → `g`（需系统已安装 `lazygit`）。
- **oceanblack 主题**：插件加载时自动安装并启用。
- **最近会话**（`home_bottom`）：首页底部列出当前目录最近的会话。

## 安装

```bash
# 1. 克隆到任意目录
git clone https://github.com/iamcheyan/opencode-vim.git
cd opencode-vim

# 2. 安装插件依赖（@opentui/* 与 solid-js 需可被插件解析到）
bun install
```

> 依赖版本需与你本地 opencode 内置的 `@opentui` 大版本保持一致。
> 若 `bun install` 后仍出现 “Could not resolve @opentui/solid” 之类的报错，
> 可把本目录的 `node_modules` 中相关包软链到 opencode 实际使用的版本，或把插件放到 opencode 配置目录的 `node_modules` 可解析范围内。

## 配置

在 opencode 的 TUI 配置文件（`~/.config/opencode/tui.json`，没有就新建）里把插件文件路径加入 `plugin` 数组：

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["/absolute/path/to/opencode-vim/index.tsx"]
}
```

重启 opencode 即可。状态栏应显示 `INSERT`，按 `Esc` 切换为 `NORMAL`。

## 使用速查

| 模式 | 按键 | 作用 |
| --- | --- | --- |
| INSERT | `Esc` | 进入 NORMAL |
| NORMAL | `i` `a` `I` `A` `o` `O` | 回到 INSERT |
| NORMAL | `Space` | 打开 LEADER 菜单 |
| NORMAL | `:` | 打开命令面板 |
| NORMAL | `j` `k` `gg` `G` | 滚动 / 跳首尾 |
| NORMAL | `Ctrl+f` `Ctrl+b` | 翻页 |
| LEADER | 分组键 → `j/k` → `Enter` | 执行菜单项 |
| LEADER | `Esc` / `Backspace` | 关闭 / 返回 |

LEADER 菜单分组：`quick`(模型) `a`(agent) `m`(model) `s`(session) `g`(git diff) `w`(workspace) `u`(ui/主题/清理) `l`(lazygit) `x`(帮助/配置备份) `q`(退出)。

## 已知限制

这是「纯插件」方案，因此无法做到 fork 版里那些需要改动 opencode 源码的视觉效果，例如：

- 紧凑消息 / 工具调用渲染
- copy mode（终端复制模式）
- 替换 session / home 的整体布局骨架
- 拦截 `processor.ts` 的权限拒绝行为

这些只能在 opencode 自身支持相应 slot / hook 后才能用插件实现。

## 文件结构

```
index.tsx         插件入口：主题、slot 注册、vim 按键拦截
state.ts          共享信号（NORMAL/INSERT 状态、活动 prompt ref）
leader-menu.ts    LEADER 菜单数据与动作执行
leader-menu-ui.tsx LEADER 菜单弹窗 UI
prompt-slot.tsx  包裹 api.ui.Prompt 并接入 vim 模式
status-bar.tsx    home_footer 状态栏、home_bottom 最近会话
oceanblack.json   oceanblack 主题定义
```
