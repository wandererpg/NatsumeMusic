# NatsumeMusic 已安装应用更新流程

日期：2026-10-13。方案已在 0.1.1 实施，完成隔离安装升级验证与本地打包；尚未发布线上版本。本文保留原方案，操作及发布流程见 `docs/auto-update.md`。

实施结果（2026-10-14）：固定 GitHub 源、显式下载及重启安装、任务互斥、SQLite 安装前/迁移前备份和暂停恢复播放已完成。隔离 NSIS 0.1.1 → 0.1.2 升级已通过；最终代码 TypeScript 检查和 295 项测试通过。0.1.1 本地交付目录为 `release-v0.1.1`；尚未提交、推送或发布 GitHub Release。

**目标：** 安装版用户在应用里检查、下载更新，选择合适时间重启安装，保留音乐库、设置和播放列表。

**架构：** 复用现有 Windows x64 NSIS 安装器，用 `electron-updater` 查询公开 GitHub Releases；更新管理和安装决策在 Electron 主进程执行。首个支持更新的版本定为 0.1.1，后续用 0.1.2 验证完整升级链路。

**技术栈：** 保留当前 Electron 31 / electron-builder 25，新增兼容的 electron-updater 6 系列，并通过安装版验证；不在此次更新功能中升级 Electron。

## 已确认的现状

- 当前版本为 0.1.0，多次打包没有递增版本号。相同版本重新打包不能作为正常自动更新链路。
- `package.json` 未安装 electron-updater，主进程没有检查、下载、安装更新逻辑。
- `electron-builder.yml` 已使用 NSIS、固定 appId `com.galmusic.app`，允许选择安装目录，当前是按用户安装。
- 当前包已生成 `latest.yml`、EXE、blockmap，包内还生成了指向 `wandererpg/NatsumeMusic` 的 `app-update.yml`。这些文件本身不会让应用自动更新。
- 已核实 `wandererpg/NatsumeMusic` 为公开仓库，默认分支 main。
- 数据库位于 Electron userData 下的 `galmusic.db`，采用 WAL；音乐及封面位于用户选定目录。更新不能重新设置这两个位置。

## 推荐给用户的操作方式

1. 第一次：关闭当前应用，运行 0.1.1 安装包，更新现有安装。安装目录保持原位置，无需先卸载。
2. 之后：打开“设置 → 关于与更新”，点击“检查更新”。启动后也可以后台检查，但不自动下载或安装。
3. 有新版时显示版本号和更新说明，用户点击“下载更新”；音乐播放继续。
4. 下载并校验完成后，提供“稍后”和“重启更新”。下载完成不会立即退出程序。
5. 点击“重启更新”后，主进程检查正在进行的导入、复制、移动、删除、封面写入等任务。仍有任务时拒绝安装，并提示等任务完成后重试。
6. 允许安装时，阻止新写入任务，保存播放状态、暂停播放器、备份数据库、关闭数据库，再交给 NSIS 替换程序并重新启动。
7. 重启后显示新版版本号；保留原音乐库、游戏、播放列表、外观和音量。恢复曲目和进度，默认保持暂停。

这属于“应用内更新，重启生效”。此项目的主进程、preload、SQLite 原生模块都可能随版本改变，不能把开发预览的热刷新用于已安装程序的正式升级，也不能保证替换运行中的 app.asar 后立即生效。

## 实施文件与职责

| 文件 | 工作 |
| --- | --- |
| `package.json`、`package-lock.json` | 新增 updater 依赖；递增版本号并同步锁文件 |
| `electron-builder.yml` | 显式配置 GitHub 更新源，保留 appId 和 NSIS 安装方式 |
| `src/main/services/app-updater.ts`（新增） | 更新状态机、检查与下载、错误记录、准备安装、并发请求合并 |
| `src/main/services/update-install-guard.ts`（新增） | 记录后台写入任务；决定是否允许安装，准备阶段阻止新任务 |
| `src/main/index.ts` | 安装版启动后初始化 updater；接入数据库与后台任务生命周期 |
| `src/main/ipc/update-handlers.ts`（新增） | 只接受固定的更新动作，不接受渲染端传入下载 URL、命令或任意文件路径 |
| `src/shared/ipc.ts`、`src/shared/types.ts`、`src/preload/index.ts` | 暴露 getUpdateState / checkForUpdates / downloadUpdate / installUpdate / onUpdateState |
| `src/renderer/src/components/settings/AppUpdatePanel.tsx`（新增） | 显示当前版本、更新说明、进度、错误和操作按钮 |
| `src/renderer/src/components/settings/SettingsPanel.tsx` | 挂载更新面板 |
| `src/renderer/src/stores/playerStore.ts` | 准备安装前保存曲目和进度、暂停播放；启动后恢复但不自动播放 |
| `src/main/ipc/scan-handlers.ts`及文件写入服务 | 让安装检查覆盖实际主进程任务，而不是依赖界面上是否打开了导入弹窗 |

依赖安装命令：`npm install electron-updater@6 --save-exact`。安装时解析具体 6.x 版本并写入锁文件；随后验证其 Node/Electron 兼容性。

更新源配置：

```yaml
publish:
  provider: github
  owner: wandererpg
  repo: NatsumeMusic
```

主进程策略：`autoDownload = false`、`autoInstallOnAppQuit = false`、`allowDowngrade = false`。启动检查不阻塞窗口或离线播放；检查失败后允许手动重试。

更新面板的状态包括 idle、checking、available、downloading、downloaded、preparing、error。相同动作重复点击合并成一个请求；重新打开面板时先拉取当前状态，避免漏掉下载完成事件。

## 首次接入与验证

1. 实施以上逻辑，保留现有音乐目录保存修复；版本从 0.1.0 改为 0.1.1：`npm version 0.1.1 --no-git-tag-version`。
2. 运行 updater 状态机、IPC、写入任务阻止安装、数据库备份失败、播放器保存失败、UI 状态恢复的针对性测试，以及 `npx tsc --noEmit`。
3. 本地打包，显式禁止上传：

   ```powershell
   npm run rebuild:native
   npm run verify:resources
   npm run build
   npx electron-builder --win --publish never
   ```

   前一步失败就停止；执行原生模块重建前关闭会占用该模块的开发进程。

4. 给当前用户提供 0.1.1 安装器，安装到原目录。它是旧版接入自动更新所必需的一次手动升级。
5. 以隔离的 Windows 用户或测试环境安装 0.1.1，准备测试音乐、播放列表和设置；生产音乐库不作为测试样本。
6. 本地制作 0.1.2 测试包，用仅监听 `127.0.0.1:8765` 的测试更新源托管 EXE、blockmap、latest.yml；该本地源仅写入测试包，正式包固定使用 GitHub。
7. 在真正安装的 0.1.1 测试应用里完成检测、下载、重启安装；验证最终版本为 0.1.2，安装位置和应用数据保持原样。
8. 测试断网、下载中断、损坏包、更新源没有新版、重复点击、导入过程中点击安装以及备份失败。每种失败都应保留当前可用应用；失败时不调用 quitAndInstall。
9. 用 GitHub 的测试预发布版本补做真实 provider 检查，测试客户端允许预发布，正式客户端只接收稳定版。发布测试版本也是外部操作，实施时由用户明确授权。

数据库备份由 SQLite 的 backup API 产生一致快照，保存到 userData 的版本化 backups 目录；不能在 WAL 写入期间只复制 galmusic.db。下一版启动前、迁移前再对原数据库做一次快照。首次 updater 发布不修改数据库结构，不承诺跨不兼容迁移自动降级。

数据库关闭逻辑须能安全重复调用：当前 before-quit 会执行 db.close()，安装准备阶段不能先关闭后又在退出事件中报错。安装准备失败时释放写入锁并让用户继续使用当前版本；下载或准备状态不能改变设置页面中尚未保存的编辑内容。

## 每次正式发布的固定流程

1. 完成修改和相关检查，版本递增为 0.1.2、0.1.3 等；不复用旧版本号、旧 tag 或旧版本更新文件。
2. 按上述命令本地打包并检查包内代码、SQLite 原生模块、更新源和安装器版本一致。
3. 准备与该版本完全对应的三个自动更新资产：

   ```text
   NatsumeMusic-0.1.2-x64.exe
   NatsumeMusic-0.1.2-x64.exe.blockmap
   latest.yml
   ```

   EXE 和 latest.yml 必须上传原文件，不能只上传 installer.zip。便携 ZIP 和 SHA256SUMS.txt 可作为额外人工下载资产。

4. 在 GitHub 创建该版本的 Draft Release，例如 v0.1.2；对应源代码和 tag 也须一致。上传完整资产后核对 latest.yml 引用的文件名、大小和 SHA-512 与实际 EXE 一致。
5. 把具体 Release 和资产清单交给用户检查；确认发布授权后再把 Draft Release 发布为稳定版。这一步之前已有安装用户不会收到此草稿更新。
6. 已安装的 0.1.1 用户打开应用或手动检查，按下载、稍后/重启流程升级。保留上一版安装包和对应数据库备份，出现问题时人工恢复；不默认在线自动降级。

公开更新源不需要向用户分发 GitHub Token。发布权限留在发布者环境，应用包中不包含上传凭据。下载使用 updater 自带的文件校验；校验通过不等于发布者身份签名，当前项目的 Windows 包尚未签名。

## 首期范围与后续扩展

- 首期正式支持 NSIS 安装版。当前“便携版”是 win-unpacked 的压缩包，不让其自动运行 NSIS 变成安装版；便携用户通过完整 ZIP 手动更新。
- 不实现运行中替换二进制、远程 JavaScript 热执行、自动强制重启或跳过哈希校验。
- GitHub 在用户网络中无法访问时，保留手动下载安装器的入口。后续若确需更稳定的国内分发，再增加可信 HTTPS 静态更新源，不需要为了首期功能部署业务服务器。
- CI 自动构建和发布可在人工发布流程跑通后增加。

## 完成标准

- 当前已安装 0.1.0 能通过一次手动安装进入支持更新的 0.1.1。
- 0.1.1 能在应用内升级至 0.1.2，用户不用再次手动找安装器。
- 更新下载不打断播放；安装只发生在用户点击后，且主进程确认无进行中的文件写入。
- 音乐文件、原音乐目录、播放列表、设置和安装目录保持一致；数据库存在可验证的备份。
- 离线和失败路径仍能使用旧版；正式发布资产能被 updater 正确读取。

## 依据

- 本项目：package.json、electron-builder.yml、main/index.ts、database/connection.ts、ipc/scan-handlers.ts，以及 2026-10-13 新包的 app-update.yml / latest.yml。
- [electron-builder 自动更新说明](https://www.electron.build/v26/docs/features/auto-update/)：electron-updater、Windows NSIS、更新事件与安装版验证。
- [electron-builder 发布配置](https://www.electron.build/v26/docs/publish/)：GitHub provider 与更新文件分发。

官方参考页为 v26 文档；当前项目使用 builder 25。实施时只采用已在当前版本配置与依赖中验证的能力，不把新版本专属选项直接加入现有构建。
