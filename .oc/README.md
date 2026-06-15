# Leader Menu Configuration

opencode-vim 的 Space 菜单（类似 LazyVim 的 leader key）支持通过配置文件自定义。

## 配置文件位置

在项目根目录下创建 `.oc/leader.jsonc`：

```
your-project/
├── .oc/
│   └── leader.jsonc    ← 在这里配置菜单
├── src/
└── ...
```

如果配置文件不存在，会使用内置的默认菜单。

## 配置文件格式

```jsonc
{
  "leader": {
    "groups": [
      {
        "key": "f",           // 按键触发
        "label": "files",     // 显示名称
        "icon": "󰉋",         // 图标（可选）
        "items": [
          {
            "key": "f",       // 二级按键
            "label": "find files",
            "icon": "󰈞",     // 图标（可选）
            "action": "tui",  // 动作类型
            "command": "ff",  // 命令
            "args": ["."]     // 参数（可选）
          },
          // 分隔线（可选）
          { "key": "—", "label": "", "separator": true }
        ]
      }
    ]
  }
}
```

### 分隔线

在 items 数组中添加分隔线来视觉分组：

```jsonc
{
  "key": "—",
  "label": "",
  "separator": true
}
```

## Action 类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `tui` | 启动 TUI 工具（接管终端） | `lazygit`, `yazi`, `nvim` |
| `command` | 调用 opencode 内部命令 | `model.list`, `session.new` |
| `shell` | 执行 shell 命令 | `git log --oneline` |
| `quit` | 退出 opencode | - |
| `clear` | 清屏 | - |

## 内置默认菜单

```
Space →
  a: agent        - 切换 AI 代理
  f: files        - 文件搜索/管理
  g: git          - Git 操作
  m: model        - 模型切换
  s: session      - 会话管理
  t: tools        - 外部工具
  u: ui           - 界面设置
  q: quit         - 退出
```

## 快捷键一览

| 按键 | 分组 | 功能 |
|------|------|------|
| `Space a a` | agent | 打开代理列表 |
| `Space a n` | agent | 下一个代理 |
| `Space a p` | agent | 上一个代理 |
| `Space f f` | files | ff 文件搜索 |
| `Space f r` | files | rf 内容搜索 |
| `Space f y` | files | yazi 文件管理器 |
| `Space f e` | files | nvim 编辑器 |
| `Space g g` | git | lazygit |
| `Space g c` | git | 提交暂存更改 |
| `Space g l` | git | git log |
| `Space g h` | git | hunk diff |
| `Space m m` | model | 切换模型 |
| `Space m v` | model | 切换变体 |
| `Space s n` | session | 新建会话 |
| `Space s l` | session | 会话列表 |
| `Space s w` | session | 切换工作区 |
| `Space s f` | session | 分叉会话 |
| `Space s c` | session | 压缩会话 |
| `Space t b` | tools | btop 系统监控 |
| `Space t t` | tools | tldr 命令手册 |
| `Space u p` | ui | 命令面板 |
| `Space u s` | ui | 状态信息 |
| `Space u t` | ui | 切换主题 |
| `Space u r` | ui | 切换推理模式 |
| `Space u l` | ui | 清屏 |
| `Space q q` | quit | 退出 opencode |

## 自定义示例

### 添加 btop 监控

```jsonc
{
  "leader": {
    "groups": [
      {
        "key": "t",
        "label": "tools",
        "icon": "󰙨",
        "items": [
          { "key": "b", "label": "btop", "icon": "󰔎", "action": "tui", "command": "btop" }
        ]
      }
    ]
  }
}
```

### 添加 git log 别名

```jsonc
{
  "leader": {
    "groups": [
      {
        "key": "g",
        "label": "git",
        "icon": "󰊢",
        "items": [
          { "key": "l", "label": "git log", "action": "tui", "command": "git", "args": ["log", "--oneline", "--graph"] }
        ]
      }
    ]
  }
}
```

### 添加自定义 opencode 命令

```jsonc
{
  "leader": {
    "groups": [
      {
        "key": "s",
        "label": "session",
        "items": [
          { "key": "n", "label": "new session", "action": "command", "command": "session.new" }
        ]
      }
    ]
  }
}
```

## opencode 内置命令列表

以下是可用的 opencode 内部命令（`action: "command"` 时使用）：

| 命令 | 说明 |
|------|------|
| `agent.list` | 代理列表 |
| `agent.cycle` | 下一个代理 |
| `agent.cycle.reverse` | 上一个代理 |
| `model.list` | 模型列表 |
| `variant.list` | 变体列表 |
| `session.new` | 新建会话 |
| `session.list` | 会话列表 |
| `session.fork` | 分叉会话 |
| `session.compact` | 压缩会话 |
| `session.toggle.thinking` | 切换推理模式 |
| `workspace.set` | 切换工作区 |
| `command.palette.show` | 命令面板 |
| `opencode.status` | 状态信息 |
| `theme.switch` | 切换主题 |

## 注意事项

- 配置文件支持 JSONC 格式（可以写注释）
- 修改配置文件后需要重启 opencode-vim 才能生效
- 如果配置文件格式错误，会自动回退到默认菜单
- `tui` 和 `shell` 类型的命令会在当前项目目录下执行
