# 202605230813_cjk-mask-preservation-bugfix.md

# TUI 遮罩层后 CJK/中文消失缺陷分析与解决方案文档

本文档记录了关于 OpenCode 终端用户界面（TUI）在弹窗、下拉框等包含半透明背景遮罩（Mask/Backdrop）的页面中，中文字符（及其他双宽 CJK 字符）完全消失的长期存留缺陷（Bug）的成因分析、解决方案，以及后续升级与合并时的维护指南。

---

## 1. 缺陷背景与表现 (Background & Symptoms)

### 1.1 缺陷表现
在 OpenCode 最小化 TUI （Vim TUI）或主 TUI 界面中，当用户激活命令面板（Command Palette）、Leader 快捷键菜单、弹窗对话框或任何带有暗化遮罩背景（Dimming Overlay Mask）的组件时，遮罩层后面的中文字符（CJK）会完全变为空白（消失），但同处于遮罩后的英文字符（ASCII）依然可见且正确被暗化。

该问题在多次上游同步与重构中反复出现，被称为“最顽固的终端渲染 Bug 之一”。

---

## 2. 产生原因深挖 (Root Cause Analysis)

问题的根源出在 `@opentui/core`（也就是基于 Zig 原生核心的 TUI 布局与渲染引擎）在底层处理**双宽 CJK 字符**和**半透明像素混合**时的不一致性：

### 2.1 CJK 字符在 Buffer 中的特殊 Token 编码
在 `opentui` 的渲染体系中：
* 英文字符和普通 ASCII 字符（单单元格宽）直接以其标准的 Unicode 码点形式存在于字符缓冲区（`buffers.char`）中。
* 中文等多字节双宽度字符（CJK）在终端中占用两个单元格。为了处理其双单元格宽度的占位与光标位置，`opentui` 在底层的 JavaScript/TypeScript 封装与 Native 的 FFI 交互中，将 CJK 字符编码为一种特殊的、大于标准 Unicode 范围的高位 32 位 Token（例如十六进制的 `900100ff` 或 `c40100ff`）。

### 2.2 Native（Zig）层混合处理的 Bug
当 TUI 渲染带半透明背景的遮罩时，渲染引擎会调用底层的原生 FFI 接口：
* `lib.bufferFillRect` (填充矩形)
* `lib.bufferDrawBox` (绘制带背景填充的框)

在底层的 Native (Zig/C) 核心逻辑中，混合背景色需要遍历这片矩形区域的每一个单元格。然而：
1. 底层 Native 代码在读取字符单元格的 `char` 值进行重绘/写回时，会校验该值是否为有效的 Unicode 字符。
2. 由于中文字符对应的是特殊的 32 位高位 Token（其数值远远大于 Unicode 标准上限 `0x10FFFF`），**Native 核心错误地将这些 Token 识别为了“无效码点”或“空单元格”**。
3. 随后，Native 混合算法在重构背景色后，**自动将这些“无效单元格”清空并覆写为了普通空格字符（`0x20`）**。

因此，只要叠加了半透明遮罩，底层 Native 代码就会在混合像素的同时，悄无声息地将后面的所有中文字符抹除，使其在最终的终端输出中彻底变成空格消失！

---

## 3. 解决方案 (Resolution Method)

因为 Native 核心被预编译成了不同系统平台的二进制动态链接库（如 macOS 的 `libopentui.dylib`，Linux 的 `.so`，Windows 的 `.dll`），直接修改底层 Zig 源码并重新为全平台编译、打包分发难度很大，且容易随上游版本更新而被覆盖。

我们采用了一种**在 JavaScript/TypeScript 层进行无缝拦截与共享内存混合**的优雅解耦方案：

### 3.1 JS 层像素级混合拦截 (JS-level Alpha Blending)
`@opentui/core` 的 JavaScript 封装拥有通过 FFI 共享的底层 typed arrays（`buffers.char`, `buffers.fg`, `buffers.bg`），这些共享内存允许 JS 以极高的速度直接读写终端的显存。

我们修改了 `OptimizedBuffer` 原型链上的核心方法：

1. **`fillRect` 方法劫持**：
   * **完全不透明拦截**：当遮罩颜色为完全不透明（`alpha === 255`）时，保留原样，直接 delegate 给 Native 原生 FFI 快速路径 `this.lib.bufferFillRect` 以确保性能。
   * **半透明智能混合**：当遮罩颜色为半透明时（即普通的弹窗遮罩），在 JS 层自行执行经典的 Alpha 混合算法：
     $$\text{color}_{\text{new}} = \text{color}_{\text{current}} \times (1 - \alpha) + \text{color}_{\text{overlay}} \times \alpha$$
     在混合前景色（`fg`）和背景色（`bg`）时，**完全保留 `buffers.char` 中已有的、非零的 CJK 高位 Token**，只做颜色混合，从而在中文字符格叠加暗化色彩的同时完整保留了字符本身！

2. **`drawBox` 方法劫持**：
   * 在调用 `drawBox` 且 `options.shouldFill` 为 `true`，同时背景色为半透明时，先将其背景填充职责路由至上文我们重写的 CJK 安全 JS `fillRect`，随后再用 `shouldFill: false` 调用原生的 Native `drawBox` 来绘制边框和标题。这做到了在解决 Bug 的同时，不影响任何原生的精美框体渲染。

---

## 4. 后续更新与升级维护指南 (Maintenance & Upgrade Guide)

由于 `@opentui/core` 是作为外部依赖安装在 `node_modules` 里的，我们通过 **Bun Patch** 机制将此修补程序固化在了版本管理中，确保在未来的任何环境搭建和同步中均可稳定复现。

### 4.1 当前修补固化方式
* **补丁文件位置**：`patches/@opentui%2Fcore@0.2.15.patch`
  此补丁记录了在依赖的 `@opentui/core@0.2.15` 中对 `index-3fq5hq97.js` 的修改。
* **依赖声明位置**：在项目根目录 `package.json` 的 `"patchedDependencies"` 中注册了该补丁：
  ```json
  "patchedDependencies": {
    "@opentui/core@0.2.15": "patches/@opentui%2Fcore@0.2.15.patch",
    ...
  }
  ```
  在执行 `bun install` 时，修改会被自动合入本地的 `node_modules` 中。

---

### 4.2 当未来需要升级 `@opentui/core` 时的应对步骤 (Upgrading Node Modules)

当未来因为合并上游或功能需要，需要升级 `@opentui/core`（例如升级到 `0.2.16` 或更高版本）时，请按照以下步骤重新打补丁：

1. **升级依赖包**：
   更新 `package.json` 中的 `@opentui/core` 版本号并执行安装：
   ```bash
   bun install
   ```

2. **手动定位或搜索目标位置**：
   在新版的 `node_modules/@opentui/core/` 目录下的主入口文件（通常是编译出来的混淆/捆绑包 `index-xxxx.js`）中：
   * 搜索方法名：`fillRect(x, y, width, height, bg2) {`
   * 搜索方法名：`drawBox(options) {`

3. **重新写入 CJK 安全修改**：
   * 将 `fillRect` 的实现替换为 CJK 安全版本：
     ```javascript
     fillRect(fillX, fillY, fillWidth, fillHeight, color) {
       this.guard();
       const [cr, cg, cb, ca] = color.toInts();
       if (ca === 0) return;
       if (ca === 255) {
         this.lib.bufferFillRect(this.bufferPtr, fillX, fillY, fillWidth, fillHeight, color);
         return;
       }
       const buffers = this.buffers;
       const chars = buffers.char;
       const fg2 = buffers.fg;
       const bg2 = buffers.bg;
       const bufferWidth = this.width;
       const bufferHeight = this.height;
       const alpha = ca / 255;
       const invAlpha = 1 - alpha;
       for (let dy = 0; dy < fillHeight; dy++) {
         const y = fillY + dy;
         if (y < 0 || y >= bufferHeight) continue;
         for (let dx = 0; dx < fillWidth; dx++) {
           const x = fillX + dx;
           if (x < 0 || x >= bufferWidth) continue;
           const cellIndex = y * bufferWidth + x;
           const colorIndex = cellIndex * 4;
           const bgA = bg2[colorIndex + 3];
           if (bgA === 0) {
             bg2[colorIndex] = cr;
             bg2[colorIndex + 1] = cg;
             bg2[colorIndex + 2] = cb;
             bg2[colorIndex + 3] = ca;
           } else {
             bg2[colorIndex] = Math.round(bg2[colorIndex] * invAlpha + cr * alpha);
             bg2[colorIndex + 1] = Math.round(bg2[colorIndex + 1] * invAlpha + cg * alpha);
             bg2[colorIndex + 2] = Math.round(bg2[colorIndex + 2] * invAlpha + cb * alpha);
             bg2[colorIndex + 3] = 255;
           }
           fg2[colorIndex] = Math.round(fg2[colorIndex] * invAlpha + cr * alpha);
           fg2[colorIndex + 1] = Math.round(fg2[colorIndex + 1] * invAlpha + cg * alpha);
           fg2[colorIndex + 2] = Math.round(fg2[colorIndex + 2] * invAlpha + cb * alpha);
           fg2[colorIndex + 3] = 255;
           if (chars[cellIndex] === 0) {
             chars[cellIndex] = 32;
           }
         }
       }
     }
     ```
   * 将 `drawBox` 替换为半透明拦截版本：
     ```javascript
     drawBox(options) {
       this.guard();
       const style = parseBorderStyle(options.borderStyle, "single");
       const borderChars = options.customBorderChars ?? BorderCharArrays[style];
       const shouldFill = options.shouldFill ?? false;
       const bg2 = options.backgroundColor;
       const isSemiTransparent = bg2 && bg2.a > 0 && bg2.a < 255;
       if (shouldFill && isSemiTransparent) {
         this.fillRect(options.x, options.y, options.width, options.height, bg2);
         const packedOptions = packDrawOptions(options.border, false, options.titleAlignment || "left", options.bottomTitleAlignment || "left");
         this.lib.bufferDrawBox(this.bufferPtr, options.x, options.y, options.width, options.height, borderChars, packedOptions, options.borderColor, bg2, options.title ?? null, options.bottomTitle ?? null);
       } else {
         const packedOptions = packDrawOptions(options.border, shouldFill, options.titleAlignment || "left", options.bottomTitleAlignment || "left");
         this.lib.bufferDrawBox(this.bufferPtr, options.x, options.y, options.width, options.height, borderChars, packedOptions, options.borderColor, bg2, options.title ?? null, options.bottomTitle ?? null);
       }
     }
     ```

4. **重新生成补丁文件**：
   在根目录下运行 `bun patch --commit @opentui/core` 来自动让 Bun 重新捕获这个依赖修改，更新 `package.json` 中的新版本号映射和对应的补丁文件内容。

通过这一科学的维护模型，我们不仅成功抹平了底层渲染层面的 CJK 渲染缺陷，而且确保了未来的迭代与上游拉取（upstream merging）可以百分百从容应对！
