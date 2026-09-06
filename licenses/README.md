# 许可证材料目录

这里保存 NatsumeMusic 源码仓库和 Windows 发布包需要携带的第三方许可证材料。

当前状态：**审计材料已补齐一部分；项目本体许可证、GARbro 当前构建来源和少数条件性组件仍未清除。**

## 目录

- electron/：Electron 和 Chromium 的发布声明。
- npm/：当前安装依赖的许可证文本和运行时审计快照。
- garbro/：GARbro 及其随包 .NET/原生组件的版本、来源、许可证和再分发条件。

GARbro 目录的入口是：

- [逐项组件清单](garbro/COMPONENT-INVENTORY.md)
- [来源和哈希记录](garbro/PROVENANCE-RECORD.md)
- [GARbro 材料说明](garbro/README.md)

## 已完成

- 已将官方 GARbro v1.5.44 MIT 文本放到 resources/tools/garbro/LICENSE.txt。
- 已记录官方 GARbro v1.5.44 tag、发布归档 SHA-256，以及当前本地目录与官方归档的差异。
- 已保存当前本地 GARbro 依赖可取得的许可证文本，包括 MIT、BSD、Apache-2.0、MS-PL 和 MS-RL 材料。
- 已保留 Electron LICENSE.electron.txt 和 LICENSES.chromium.html。

## 仍需人工确认

- 由项目所有者选择 NatsumeMusic 本体许可证、版权持有人和年份，并在仓库根目录添加 LICENSE；package.json 的 license 字段也应同步。
- 确认 resources/tools/garbro 当前二进制来自哪个 release、commit、fork 或自行编译，并保存源代码 commit、构建命令和修改清单。
- 为 GARbro.Probe、XP3 bridge 和 RPA bridge 补充作者、版权、来源和许可证；无法证明的文件应从发布包移除。
- 为 MS-RL 的 WiX DTF 文件提供包含对应代码文件的源代码或正式 source offer。
- 以最终 installer/portable ZIP 的实际文件清单为准，补齐所有 .NET/原生依赖的许可证和 NOTICE。
- 关闭全部阻塞项后，才把 THIRD-PARTY-NOTICES.draft.md 改名为正式 THIRD-PARTY-NOTICES.md，并重新生成发布包。

## 复核原则

1. 以最终发布 ZIP 中实际携带的文件为准，而不是只看源码依赖树。
2. 不要把 GARbro 的 MIT 许可证套用到它携带的所有 DLL。
3. 不要删除 Electron/Chromium 的既有许可证文件。
4. 如果某个组件的来源或许可证无法确认，应暂缓公开发布，或移除该组件后重新打包。
