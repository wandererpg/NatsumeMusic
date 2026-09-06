# NatsumeMusic verification record

记录日期：2026-09-06（Asia/Shanghai）

工作区：C:\Users\HONOR\Documents\Codex\2026-07-27\galgame music app\galgame-music-app
目标平台：Windows 10/11 x64

## 自动化检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 单元与组件测试 | npm test -- --run | PASS（48 个测试文件，262 个测试） |
| TypeScript | npx tsc --noEmit | PASS |
| Electron 构建 | npm run build | PASS（main / preload / renderer） |
| 资源校验 | npm run verify:resources | PASS（当前仓库含 GARbro 运行时和 Formats.dat） |
| 资源校验 fixture | node_modules\.bin\vitest.cmd run tests/scripts/verify-resources.test.ts | PASS |
| Electron-builder 目录打包 | npx electron-builder --dir --config electron-builder.yml --config.win.signAndEditExecutable=false | PASS；app.asar 含第三方声明和 licenses/ 材料 |
| 第三方许可材料 | 人工核对组件清单、NuGet 元数据、官方 release/commit 和本地 PE 版本 | PARTIAL；仍有发布阻断项，见 THIRD-PARTY-NOTICES.draft.md |

测试覆盖共享路径、SQLite 迁移与 CRUD、递归扫描、流式复制、哈希去重、归档临时目录清理、取消信号、IPC 参数校验与错误序列化、Howler 播放队列、渲染壳层、扫描进度、欢迎页和设置面板。

## 手工验收清单

以下项目需要在 Windows x64 环境中执行，并使用许可证来源已确认的最终 GARbro 发布包：

- 安装、启动、卸载和桌面/开始菜单快捷方式。
- 中文与带空格的源目录；.ogg、.mp3、.wav、.flac 等普通音频。
- .xp3、.rpa、.arc、.pak 深度扫描、失败提示和取消清理。
- 重复导入、50 MB 以上文件、源文件夹删除后的独立副本。
- 关闭重启后音量、播放模式和最后曲目偏好恢复（不自动播放）。
- 无网络启动和播放；缺失文件保留数据库记录并显示可读错误。

## 发布材料检查

当前源码树已包含 GARbro 运行时和一组许可证审计材料，但还不能据此宣称当前二进制可公开再分发。发布前必须：

1. 添加项目根目录 LICENSE，并在 package.json 写入一致的 SPDX 标识。
2. 完成 GARbro 当前目录的来源/构建/修改记录，或替换为可追溯官方归档。
3. 补齐自定义 bridge 的作者、来源和许可证。
4. 为 WiX DTF 的 MS-RL 文件提供对应源代码或正式 source offer。
5. 重新运行 npm run package:win，在 installer 和 portable ZIP 中检查 LICENSE、正式 THIRD-PARTY-NOTICES.md、licenses/、Electron/Chromium 声明和 GARbro 运行时均存在。

说明：本机直接运行默认的 electron-builder --dir 时，Windows rcedit 在写入应用图标/版本资源阶段报告 “Unable to commit changes”；手动执行同一 rcedit 命令可成功。上表使用 signAndEditExecutable=false 仅用于验证 app.asar 内容，不代表已完成带图标/版本资源的正式安装包验收。
