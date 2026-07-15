# OpenCode Plugin Management Notes

## Current Mental Model

OpenCode manages plugins through config entries. A plugin is loaded because a config file declares it, or because it is auto-discovered from a local plugin directory.

There are two relevant plugin surfaces:

1. Server plugins
   - Config file: `opencode.json` / `opencode.jsonc`.
   - Project-local examples: `./opencode.jsonc`, `.opencode/opencode.jsonc`.
   - Global config: `~/.config/opencode/opencode.jsonc`.
   - Current repo example: `.opencode/opencode.jsonc` declares `../fork/adapter/oh-my-opencode/delegate-task/plugin.ts`.

2. TUI plugins
   - Config file: `tui.json`.
   - Project-local example: `.opencode/tui.json`.
   - Global config: `~/.config/opencode/tui.json`.
   - TUI plugins are loaded by the TUI plugin runtime, not by the server plugin runtime.

## Plugin Config Shape

`plugin` is an array. Entries can be:

```jsonc
{
  "plugin": [
    "npm-plugin-name",
    "npm-plugin-name@1.2.3",
    "./local-plugin.ts",
    "file:///absolute/path/plugin.js",
    ["npm-plugin-name", { "option": "value" }]
  ]
}
```

For server plugins, local files under `.opencode/plugin/*.ts`, `.opencode/plugins/*.ts`, `.opencode/plugin/*.js`, and `.opencode/plugins/*.js` are also auto-discovered.

For TUI plugins, there is no directory auto-discovery; they must be listed in `tui.json`.

## How To See Installed Plugins

Server plugin config can be checked with:

```bash
opencode debug info
```

That prints the merged external plugin list unless `--pure` / `OPENCODE_PURE=1` disables external plugins.

The direct source of truth is still the config files:

```bash
.opencode/opencode.jsonc
.opencode/tui.json
~/.config/opencode/opencode.jsonc
~/.config/opencode/tui.json
```

Inside the TUI, the built-in plugin manager command is:

```text
Plugins / plugins.list
```

It lists internal and external TUI plugins and shows desired `enabled` state versus actual `active` state.

## Install, Disable, Uninstall

CLI install exists:

```bash
opencode plugin <module>
opencode plugin <module> --global
opencode plugin <module> --force
```

This installs an npm package and patches the relevant config.

There is no complete external plugin uninstall CLI in the current code. To uninstall a plugin, remove it from the relevant `plugin` array. For an auto-discovered server plugin, delete or move the file from `.opencode/plugin(s)/`.

TUI plugin manager `deactivate(id)` is a runtime disable. It persists desired enabled state in KV, but it is not the same as uninstalling the plugin from config.

## Important Fork Rule

In the current opencode-vim mode, fork-owned UI behavior should live in `packages/opencode-vim/**` or the small upstream seam files. A workspace TUI plugin that re-registers routes, slots, keybinds, or modal UI can conflict with opencode-vim's direct TUI ownership.

For that reason, the old local TUI smoke/vim-style plugin should not be loaded by default in this repo mode. Keeping it in `.opencode/plugins/` is fine for future reference, but `.opencode/tui.json` should not list it unless we are explicitly testing the plugin runtime.

`["./plugins/tui-smoke.tsx", { "enabled": false }]` is not enough for this rule: the plugin is still declared and may still be resolved by the runtime. To ensure it is not loaded, remove it from the `plugin` array.

There is also a global conflict case: `~/.config/opencode/tui.json` can declare an experimental plugin such as `/home/tetsuya/development/oc-vim/index.tsx`. Because TUI config merges global config first, that plugin still loads even when the current repo's `.opencode/tui.json` has an empty `plugin` array.

The fork-owned `opencode-vim` launch path therefore sets `OPENCODE_PURE=1` by default in `packages/opencode-vim/src/runtime.ts`. In upstream's TUI plugin runtime, pure mode skips external TUI plugins from merged config while keeping internal TUI plugins available. This makes the packaged opencode-vim mode mutually exclusive with the old standalone `oc-vim` plugin experiment.

If we need to test external TUI plugins explicitly, run opencode-vim with `OPENCODE_PURE=0` or use the normal upstream TUI instead.
