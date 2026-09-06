# NatsumeMusic verification record

记录日期：2026-07-27（Asia/Shanghai）  
工作区：`C:\Users\HONOR\Documents\Codex\2026-07-27\galgame music app\galgame-music-app`  
目标平台：Windows 10/11 x64

## 自动化检查

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 单元与组件测试 | `npm test -- --run` | PASS（35 tests，12 test files） |
| TypeScript | `node_modules\\.bin\\tsc.cmd --noEmit` | PASS |
| Electron 构建 | `npm run build` | PASS（main / preload / renderer） |
| 资源校验（无二进制仓库） | `node scripts/verify-resources.mjs` | EXPECTED FAIL：缺少 `resources/tools/garbro/GARbro.exe` |
| 资源校验 fixture | `node_modules\\.bin\\vitest.cmd run tests/scripts/verify-resources.test.ts` | PASS |

测试覆盖共享路径、SQLite 迁移与 CRUD、递归扫描、流式复制、哈希去重、归档临时目录清理、取消信号、IPC 参数校验与错误序列化、Howler 播放队列、渲染壳层、扫描进度、欢迎页和设置面板。

## 手工验收清单

以下项目需要在带有许可 GARbro 二进制的 Windows 环境中执行：

- 安装、启动、卸载和桌面/开始菜单快捷方式。
- 中文与带空格的源目录；`.ogg`、`.mp3`、`.wav`、`.flac` 等普通音频。
- `.xp3`、`.rpa`、`.arc`、`.pak` 深度扫描、失败提示和取消清理。
- 重复导入、50 MB 以上文件、源文件夹删除后的独立副本。
- 关闭重启后音量、播放模式和最后曲目偏好恢复（不自动播放）。
- 无网络启动和播放；缺失文件保留数据库记录并显示可读错误。

当前工作区没有 GARbro 可再分发文件，因此未生成安装包；补齐该文件后运行 `npm run package:win` 即可继续 Windows 安装验收。
