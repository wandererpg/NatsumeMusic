# NatsumeMusic

NatsumeMusic 是一款面向 Windows 的 Galgame 音乐导入、整理与播放工具。选择游戏目录后，它可以递归扫描普通音频和常见资源包，把音乐复制到独立音乐库；即使原游戏之后被移动或删除，音乐库仍然可以离线播放。

当前开发版本：`0.2.2` · Windows x64 · Electron。已发布版本以 GitHub Releases 为准。

## 0.2.2 更新

新增与 NatsumeNote 的手动双向同步、AFA 和无扩展名 BGI 音频资源支持；修复曲目前播放键的暂停/继续行为与删除后的滚动位置，并改善界面和键盘操作。完整列表见 [0.2.2 更新说明](docs/releases/0.2.2.md)，同步流程见 [操作指南](docs/library-sync-guide.md)。

## 源码开发与资料确认

日常修改使用 Electron + Vite 开发版。在 PowerShell 执行：

```powershell
Set-Location -LiteralPath 'D:\Codex\galgame music app\galgame-music-app'
npm run dev
```

首次准备依赖时先运行 `npm install`。开发命令会启动 Vite 和 Electron 窗口，前端修改会自动刷新；主进程或接口修改后如未生效，按 `Ctrl+C` 停止后重新运行。开发过程不生成安装包，已安装的 EXE 不会随源码修改自动更新。

进入“编辑游戏 → 网络资料”，分别点击 VNDB / Bangumi 的“选择作品”或“更换匹配”。可查看缓存候选、重新搜索名称，或输入官方作品链接 / ID。选择条目后查看预览，点击“使用此作品”，最后点击“保存更改”才持久化为“已手动确认”。取消选择或关闭编辑器不会改变已保存关联。导入完成页也提供“选择作品 / 确认资料”入口。

“更新已关联资料”按作品 ID 更新，改名后仍保留关联。默认保留当前封面；只有明确选择“使用 VNDB / Bangumi 封面”才更换。封面下载失败时仍保存作品关联、保留旧封面，并显示重试提示。选择了本地封面后，可用“撤销封面更改”恢复网络封面选项。

交互参考仓库 [ReinaManager](https://github.com/huoshen80/ReinaManager) 已克隆到工作区的同名目录，仅参考交互设计，未复制其业务代码或素材。

资料搜索、保存和刷新失败时会显示具体错误原因。若提示“正在切换并扫描音乐库”，请等扫描完成再重试；若提示当前应用未加载资料更新功能，请退出正在运行的开发应用，并在启动它的终端按 `Ctrl+C` 后重新运行 `npm run dev`。重新启动前先关闭旧开发窗口，避免依赖重建时提示文件被占用。

## 下载与安装

正式发布时上传安装器、更新元数据、便携包和校验文件：

| 文件 | 用途 |
| --- | --- |
| `NatsumeMusic-0.2.2-x64.exe` | 安装版，可以选择安装目录，并创建桌面/开始菜单快捷方式。 |
| `NatsumeMusic-0.2.2-x64.exe.blockmap`、`latest.yml` | 安装版自动更新所需，必须与对应 EXE 一起发布。 |
| `NatsumeMusic-0.2.2-windows-x64-portable.zip` | 便携版。解压后运行文件夹内的 `NatsumeMusic.exe`。 |
| `SHA256SUMS.txt` | 发布文件的 SHA-256 校验值。 |

便携版不能只拿出一个 `NatsumeMusic.exe` 使用，必须保留旁边的 `resources` 文件夹。安装版和便携版使用同一套应用数据；更新前请先关闭正在运行的旧版 NatsumeMusic。

已安装 0.1.0 的用户需要手动运行一次 0.1.1 安装器，选择原安装目录。之后在「设置 → 关于与更新」中检查、下载新版本，点击「重启更新」安装。音乐库、歌单与设置会保留；重启后恢复上一首歌曲和进度并保持暂停。便携版继续手动更新。操作及发布流程见 [更新说明](docs/auto-update.md)。

## 功能

### 选择已有歌曲的音乐目录

在「设置」中更换音乐库目录并保存，应用会递归识别普通音频，刷新作品和歌曲列表。文件保持原位置；相同内容的歌曲会重新关联，保留收藏、曲目名称和歌单。新增或改名歌曲后，点击「重新扫描歌曲」。只修改外观、音量或播放模式时直接保存，不扫描音乐文件。

当前库只显示所选目录内仍存在的歌曲，旧目录的独有记录会保留。扫描目录中的作品重命名只修改显示名称；删除作品只删除当前库对应的音频，不删除游戏程序、存档或其他文件。NWA/OWP 转换及资源包提取仍需使用游戏导入流程。


- 递归扫描游戏目录中的 `.ogg`、`.mp3`、`.wav`、`.flac`、`.m4a`、`.aac`、`.opus`、`.wma`、`.owp` 和 VisualArt/RealLive `.nwa`。
- 导入 `.nwa` 时通过随包提供的 GARbro NWA bridge 自动转换为标准 `.wav`；原始游戏文件保持不变。
- 深度扫描 `.afa`、`.xp3`、`.rpa`、`.arc`、`.pak` 等 Galgame 资源包。AFA 1/2 直接读取音频，其他归档通过随发布包提供的工具解包。
- AFA 1/2 支持 UTF-8、日文 Shift JIS 和中文 GBK 文件名，跳过不含音频的图片/脚本资源包；关闭“导入语音”时跳过常见的 `*Voice.afa` / `*Voice1.afa` 语音包。
- BGI/Ethornell 的 `BURIKO ARC20` / `PackFile` 资源包直接识别无扩展名音频，移除 BW 封装并输出标准 OGG，跳过图片和脚本。关闭“导入语音”时先根据 BW 头内的采样数和采样率筛除短音频，避免解出大量语音文件。
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
3. 普通音频可以关闭深度扫描；音频位于 `.afa`、`.xp3`、`.rpa`、`.arc`、`.pak` 或无扩展名游戏资源中时，打开深度扫描。
4. 如果只想导入配乐，保持“包含语音”关闭。对于 `SM2MPX10` 游戏，`WMSC` 会被识别为音乐，`VOICE1`/`VOICE2` 等容器按选项决定是否导入。
5. 等待导入结果。音乐复制完成后，软件会继续显示 VNDB、Bangumi 和本地封面处理结果。
6. 双击曲目播放。打开“设置”可以切换主题、修改背景、文字颜色、音乐库路径、播放模式和语音判定阈值。

对于《素晴日》这类 BGI 游戏，选择包含 `data05000.arc` 的游戏目录并开启深度扫描即可。曲名优先保留游戏内部名称（如 `bgm001`）；分类依据时长，因此较长的音效或对白也可能归入音乐。目录内的诊断备份会递归扫描并按音频哈希去重；遇到无法识别的其他 ARC 文件时单独报告错误，已成功导入的音频仍会保留。

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

请选择游戏根目录而不是某一个内部文件，并开启深度扫描。`.nwa` 会直接被识别并在导入时转换为 `.wav`；如果转换失败，请确认发布包中的 `resources/tools/garbro/GARbro.NwaBridge.exe` 与 GARbro DLL 位于原位置。对于无扩展名资源，软件只会把文件头为 `SM2MPX10` 且容器名为 `WMSC` 的内容识别为音乐；`VOICE*` 需要打开包含语音选项。GARbro 诊断日志位于用户数据目录的 `logs/garbro.log`。

### 没有自动封面

先检查导入完成页中的 VNDB/Bangumi 状态。候选不明确、无结果、网络失败和封面下载失败都不会影响播放；打开游戏编辑器后点击“刷新网络资料”，也可以直接选择本地封面。

### 便携版无法启动或提示缺少文件

请重新完整解压 ZIP，不要只复制 `NatsumeMusic.exe`。`resources` 文件夹必须与可执行文件保持相邻，且不要从压缩包内直接运行。

## 开发与自行打包

日常修改使用现有 Electron + Vite 开发模式，按改动范围进行必要验证。仅在明确要求打包 EXE 或准备发布安装包时生成发布产物；版本号在准备发布时统一更新。

环境要求：Node.js 20+、Windows x64，以及可正常运行的 npm。

```powershell
npm install
npm run dev
```

开发模式下，界面修改由 Vite 热更新；涉及 Electron 主进程或预加载脚本的修改需要重新加载或重启开发应用。已安装版本需通过安装包或已发布的更新获得新代码。

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

## 本次对话优化记录（2026-09-14）

本次针对 `wandererpg/NatsumeMusic` 完成了以下优化。NatsumeNote 的分页手账和白板功能属于另一个项目，不包含在本仓库或 NatsumeMusic 发布包中。

- **补充 VisualArt/RealLive `.nwa` 支持**：扫描时识别 `.nwa`，读取固定头获取音频信息，导入时通过随包的 `GARbro.NwaBridge.exe` 自动转换为标准 `.wav`；原始游戏文件不会被修改。已使用真实的 `BGM01.nwa` 完成 `RIFF/WAVE` 输出验证。
- **修复文件夹按钮行为**：曲目和作品音乐区域的文件夹按钮现在调用 `shell.showItemInFolder`，打开资源管理器并定位曲目文件，不再根据 Windows 文件关联启动媒体播放器。
- **更新 Windows 发布产物**：重新生成 Windows x64 便携版和 NSIS 安装版，并修复桌面 `NatsumeMusic.lnk` 指向旧沙盒路径的问题。便携版必须完整保留 `resources` 文件夹。
- **同步文档、资源门禁和许可证记录**：更新运行逻辑、README、GARbro 组件清单、第三方声明草稿和资源校验脚本，登记 NWA bridge 及其当前待复核的来源与再分发状态。
- **完成验证**：`npm test`（48 个测试文件、265 个测试）、`npx tsc --noEmit`、`npm run build`、`npm run verify:resources`、真实 NWA 转换和新版 EXE 启动检查均已通过。

详细的文件级变更、验证过程、ZIP 使用说明和发布前待办见 [`docs/NatsumeMusic-本次对话优化记录.md`](docs/NatsumeMusic-本次对话优化记录.md)。当前仍需项目所有者补充根目录正式 `LICENSE`，完成 GARbro 及相关依赖的许可证/来源复核，并根据分发渠道决定是否配置代码签名。

更详细的真实运行逻辑、代码地图和验证记录见：

- [`docs/GalMusic-实际运行逻辑.md`](docs/GalMusic-实际运行逻辑.md)
- [`docs/verification.md`](docs/verification.md)
- [`docs/superpowers/plans/2026-08-24-game-metadata-auto-import.md`](docs/superpowers/plans/2026-08-24-game-metadata-auto-import.md)

## 许可证与第三方组件

发布包包含 GARbro、Electron/Chromium 以及多个 npm/.NET 依赖。许可证材料和当前逐项复核状态见 [`THIRD-PARTY-NOTICES.draft.md`](THIRD-PARTY-NOTICES.draft.md)、[`licenses/README.md`](licenses/README.md) 和 [`licenses/garbro/COMPONENT-INVENTORY.md`](licenses/garbro/COMPONENT-INVENTORY.md)。当前仍缺少项目本体的根目录正式 `LICENSE`，且 GARbro 当前构建的来源尚未完全证明；草稿完成所有门禁后才能改名为正式声明。

## GitHub 发布建议

1. 将源码、`README.md`、必要的许可证和第三方声明放在仓库根目录。
2. 不要把 `node_modules`、`out`、旧的 `release-v*` 构建目录或用户音乐库提交到源码仓库。
3. 当前准备版本为 `0.2.1`，创建 GitHub Release 时使用标签 `v0.2.2`；发布说明见 [`docs/releases/0.2.2.md`](docs/releases/0.2.2.md)。
4. 在 Release Assets 中分别上传 `NatsumeMusic-0.2.2-x64.exe`、对应 `.exe.blockmap`、`latest.yml`、`NatsumeMusic-0.2.2-windows-x64-portable.zip` 和 `SHA256SUMS.txt`。若使用汇总包 `NatsumeMusic-0.2.2-release-assets.zip`，先解压再上传，确保应用可以直接访问更新文件。
5. 发布前确认 GARbro 和其他随包第三方组件的许可证、版权声明及再分发条件；如需要，请把对应的 `LICENSE`/`NOTICE` 文件一并放入仓库和发布说明。
