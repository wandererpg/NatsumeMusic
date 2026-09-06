# NatsumeMusic

NatsumeMusic 是一款面向 Windows 的 Galgame 音乐导入、整理与播放工具。选择游戏目录后，它可以递归扫描普通音频和常见资源包，把音乐复制到独立音乐库；即使原游戏之后被移动或删除，音乐库仍然可以离线播放。

当前发布版本：`0.1.0` · Windows x64 · Electron

## 下载与安装

GitHub Release 建议上传下面两个压缩包和校验文件：

| 文件 | 用途 |
| --- | --- |
| `NatsumeMusic-0.1.0-windows-x64-installer.zip` | 安装版。解压后运行 `NatsumeMusic-0.1.0-installer/NatsumeMusic-0.1.0-x64.exe`，可以选择安装目录，并创建桌面/开始菜单快捷方式。 |
| `NatsumeMusic-0.1.0-windows-x64-portable.zip` | 便携版。解压后直接运行 `NatsumeMusic-0.1.0-portable/NatsumeMusic.exe`，不会执行安装流程。 |
| `SHA256SUMS.txt` | 两个 ZIP 的 SHA-256 校验值。 |

便携版不能只拿出一个 `NatsumeMusic.exe` 使用，必须保留旁边的 `resources` 文件夹。安装版和便携版使用同一套应用数据；更新前请先关闭正在运行的旧版 NatsumeMusic。

## 功能

- 递归扫描游戏目录中的 `.ogg`、`.mp3`、`.wav`、`.flac`、`.m4a`、`.aac`、`.opus`、`.wma` 和 `.owp`。
- 深度扫描 `.xp3`、`.rpa`、`.arc`、`.pak` 等 Galgame 资源包，并调用随发布包提供的 GARbro 工具解包。
- 识别 Studio Miris `SM2MPX10` 无扩展名容器：自动导入 `WMSC` 音乐，也可以按需导入 `VOICE*` 语音。
- 导入时复制文件到用户选择的音乐库，按文件哈希去重；原游戏目录不会被修改。
- 根据曲目时长将内容放入每个游戏的 `音乐` 或 `语音` 文件夹，语音阈值可以在设置中调整。
- 支持搜索、收藏、播放列表、曲目编号、顺序/随机/单曲循环/列表循环、进度和音量控制。
- 首次导入游戏后，通过 VNDB 与 Bangumi 的公开 API 查询游戏资料，并尝试下载本地封面。网络失败不会阻止音乐入库。
- 导入完成页会显示 VNDB/Bangumi 的匹配状态：已匹配、无结果、候选不明确、查询失败或待查询；已有游戏可以手动刷新资料。
- 支持七套可即时切换的主题：雨夜青岚、霓虹终端、琥珀胶片、海月玻璃、唱片番台、绯幕金声、音乐手帐。
- 背景图片全局共用，可以导入 PNG/JPG/JPEG/WEBP/GIF，并调整模糊、遮罩、缩放和焦点位置；设置中还可以修改全局主要文字颜色或恢复主题默认颜色。
- 曲目表头采用无彩色液态玻璃样式，右侧音乐库使用统一的外层滚动区域。

## 快速开始

1. 启动 NatsumeMusic，首次运行时选择音乐库目录。默认目录为 `%USERPROFILE%\Music\NatsumeMusic`。
2. 点击“导入游戏音乐”，选择游戏的根目录，并填写用于显示和网络匹配的游戏名。
3. 普通音频可以关闭深度扫描；音频位于 `.xp3`、`.rpa`、`.arc`、`.pak` 或无扩展名游戏资源中时，打开深度扫描。
4. 如果只想导入配乐，保持“包含语音”关闭。对于 `SM2MPX10` 游戏，`WMSC` 会被识别为音乐，`VOICE1`/`VOICE2` 等容器按选项决定是否导入。
5. 等待导入结果。音乐复制完成后，软件会继续显示 VNDB、Bangumi 和本地封面处理结果。
6. 双击曲目播放。打开“设置”可以切换主题、修改背景、文字颜色、音乐库路径、播放模式和语音判定阈值。

## 游戏资料与封面

网络资料是导入后的附加步骤，不是播放的前置条件：

- VNDB 和 Bangumi 查询需要网络，已缓存的资料和封面可以离线显示。
- 名称匹配不明确时不会擅自覆盖封面，游戏编辑器中可以查看候选状态并点击“刷新网络资料”。
- 手动选择的封面优先级最高，不会被后续自动匹配覆盖。
- 没有匹配结果、请求失败或封面下载失败时，曲目仍然保留在音乐库中；联网恢复后可以再次刷新。

## 数据位置与备份

- SQLite 数据库位于 Electron 的用户数据目录中的 `galmusic.db`；Windows 通常是 `%APPDATA%\galmusic\galmusic.db`。
- 音乐文件和自动下载的封面位于用户选择的音乐库目录中。
- 备份时请同时备份数据库文件和整个音乐库目录。只备份数据库会留下没有对应音频文件的曲目记录，单独备份音乐文件也会丢失收藏、播放列表和封面关联。

## 常见问题

### 设置里看不到主题

请确认运行的是当前版本的 `NatsumeMusic.exe` 或安装版，而不是旧的 `GalMusic.lnk`。旧快捷方式可能仍然指向旧安装目录；重新运行安装版或直接打开便携版目录中的 `NatsumeMusic.exe` 即可。

### 导入游戏后没有找到音乐

请选择游戏根目录而不是某一个内部文件，并开启深度扫描。对于无扩展名资源，软件只会把文件头为 `SM2MPX10` 且容器名为 `WMSC` 的内容识别为音乐；`VOICE*` 需要打开包含语音选项。GARbro 诊断日志位于用户数据目录的 `logs/garbro.log`。

### 没有自动封面

先检查导入完成页中的 VNDB/Bangumi 状态。候选不明确、无结果、网络失败和封面下载失败都不会影响播放；打开游戏编辑器后点击“刷新网络资料”，也可以直接选择本地封面。

### 便携版无法启动或提示缺少文件

请重新完整解压 ZIP，不要只复制 `NatsumeMusic.exe`。`resources` 文件夹必须与可执行文件保持相邻，且不要从压缩包内直接运行。

## 开发与自行打包

环境要求：Node.js 20+、Windows x64，以及可正常运行的 npm。

```powershell
npm install
npm run dev
```

验证代码、资源和生产构建：

```powershell
npm test -- --run
npx tsc --noEmit
npm run verify:resources
npm run build
```

生成 Windows x64 NSIS 安装包：

```powershell
npm run package:win
```

深度扫描依赖 `resources/tools/garbro/` 下的 GARbro 文件。发布包已经携带这套运行时资源；从源码自行打包前，请先确认资源校验通过，并确认 GARbro 及其依赖允许以你的发布方式再分发。

## Git 与 SSH 上传

本目录已配置 GitHub SSH 远程：`git@github.com:wandererpg/NatsumeMusic.git`。后续修改可以使用项目自带脚本一键提交并上传：

```powershell
.\scripts\sync-to-github.ps1 -Message "feat: describe the change"
```

脚本只会添加未被 `.gitignore` 排除的文件，并使用普通非强制推送；远程分支出现冲突时会停止，不会覆盖远程历史。只想检查提交内容而暂不上传时，加上 `-NoPush`。

更详细的真实运行逻辑、代码地图和验证记录见：

- [`docs/GalMusic-实际运行逻辑.md`](docs/GalMusic-实际运行逻辑.md)
- [`docs/verification.md`](docs/verification.md)
- [`docs/superpowers/plans/2026-08-24-game-metadata-auto-import.md`](docs/superpowers/plans/2026-08-24-game-metadata-auto-import.md)

## 许可证与第三方组件

发布包包含 GARbro、Electron/Chromium 以及多个 npm/.NET 依赖。许可证材料和当前逐项复核状态见 [`THIRD-PARTY-NOTICES.draft.md`](THIRD-PARTY-NOTICES.draft.md)、[`licenses/README.md`](licenses/README.md) 和 [`licenses/garbro/COMPONENT-INVENTORY.md`](licenses/garbro/COMPONENT-INVENTORY.md)。当前仍缺少项目本体的根目录正式 `LICENSE`，且 GARbro 当前构建的来源尚未完全证明；草稿完成所有门禁后才能改名为正式声明。

## GitHub 发布建议

1. 将源码、`README.md`、必要的许可证和第三方声明放在仓库根目录。
2. 不要把 `node_modules`、`out`、旧的 `release-v*` 构建目录或用户音乐库提交到源码仓库。
3. 创建 GitHub Release，建议使用标签 `v0.1.0`。
4. 在 Release Assets 中上传 `NatsumeMusic-0.1.0-windows-x64-installer.zip`、`NatsumeMusic-0.1.0-windows-x64-portable.zip` 和 `SHA256SUMS.txt`。
5. 发布前确认 GARbro 和其他随包第三方组件的许可证、版权声明及再分发条件；如需要，请把对应的 `LICENSE`/`NOTICE` 文件一并放入仓库和发布说明。
