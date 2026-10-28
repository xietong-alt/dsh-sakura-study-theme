---
name: deepseek-harness-theme
description: Install or customize the Sakura Study wallpaper and dark glass theme for DeepSeek Harness. Use for changing its wallpaper, panel opacity or blur, or fixing a washed-out background. Not for editing images or changing the DeepSeek website.
---

# DeepSeek Harness 背景主题

为用户安装或调整 `dsh-sakura-study-theme`。项目地址：<https://github.com/xietong-alt/dsh-sakura-study-theme>。

## 取得插件

如果当前目录包含同名 `package.json`，直接使用该项目；否则将上述仓库克隆或下载到任务工作区，再读取它的 `README.md`。单独安装本 skill 不等于安装 Harness 插件；没有仓库源码时，应先取得源码。不要假定某台电脑的用户名、磁盘或 Harness 安装位置。

仓库提交了可直接安装的 `client.js`，安装默认背景无需 Node 依赖或构建。用户提供图片时使用其原文件，支持 JPEG、PNG、WebP；不要自行重新生成图片。图片和代码的授权分别见 `ASSET_LICENSE.md` 与 `LICENSE`。

## 定制与安装

修改仓库副本的 `theme.config.json`：`dimTop`、`dimBottom`、`sidebarOpacity`、`composerOpacity` 为 0–1；`sidebarBlur`、`composerBlur` 为 0–48 像素。主区域保持透明；不要用白色半透明层冲淡原图。参考默认值先做用户实际要求的调整。

用本地 Node 运行：

```text
node scripts/build-theme.mjs --image /absolute/path/to/wallpaper.jpg --out /absolute/path/to/theme-bundle
```

省略 `--image` 使用仓库背景；省略 `--out` 更新仓库副本。构建会把图片内嵌到 `client.js`，无需图片服务器；不要手工编辑其中的 Base64。输出目录须位于用户的工作区中。构建不修改 Harness 配置，也不会自动安装。

在 Harness 中优先使用其当前版本提供的插件开发指引与 `plugin_manager` 的 `install_bundle`，`target` 传构建后的绝对目录。没有该工具时，使用「插件 → 添加插件」输入目录或仓库地址；可用的官方 CLI 是另一个选项，先检查 `dsh plugin --help` 和当前 profile，再执行 `dsh plugin --profile <当前配置> add <绝对目录>`。不要直接改写 profile 的 `package.json` 或 `cordis.patch.yml`。

已安装同名插件时，按该版本插件管理器的更换流程处理。读取安装返回的应用状态；安装成功不代表正在运行的页面已经加载了新代码。需要重启时优先正常退出应用，注意关闭窗口可能只是收进系统托盘。不要把本次安装授权扩展为强制结束进程的授权。

## 验证与修复

查看真实 Harness 界面：确认是指定图片、主区没有白色遮罩、侧栏与输入框保持可读，且插件可关闭恢复外观。无法查看界面时说明验证限制，不把源码检查当成显示成功。

默认适配 Harness `0.2.1-rc.3`。布局类名可能随版本改变；当前规则包括 `.mP3x-q_frame`、`.mP3x-q_centerCol`、`.mP3x-q_sidebarCol`、`.GRgSLq_card`。新版显示异常时检查当前版本的布局和主题接口后再适配。

背景发白通常来自内置浅色 token 或旧主题的 `body:not([data-ds-dark-theme])` 规则。使用本包的 `html body[data-sakura-study]` 深色调色板与透明主区，避免依赖一次性的临时外观切换。只在生命周期 `ctx.effect` 内添加样式和标记，并保留清理函数。

若修改构建或生命周期代码，运行 `node --test tests/*.test.mjs`。任务结束时给出实际安装位置、效果验证结果，以及任何需要用户执行的剩余步骤。
