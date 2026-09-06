# NatsumeMusic 第三方组件声明（草稿）

状态：**发布阻断项复核中**

核对日期：2026-09-06

适用项目：wandererpg/NatsumeMusic
适用构建：Windows x64 0.1.0；当前仓库的 resources/tools/garbro/。

这份文件是发布前的事实记录和清单，不是法律意见，也不是“所有组件均已获准再分发”的声明。当前文件仍是草稿，不能在没有完成下方阻断项的情况下改名为正式 THIRD-PARTY-NOTICES.md 或用于发布承诺。

## 先看结论

1. GARbro 官方 v1.5.44 的 MIT 许可证已经取得，文本副本在 resources/tools/garbro/LICENSE.txt。但当前本地 GARbro 目录不是官方 GARbro-v1.5.44.2904.rar 的逐字节副本，来源和改动记录仍未完成。
2. GARbro 随包 DLL 不能统一套用 GARbro 的 MIT。WiX DTF 是 MS-RL；Windows API Code Pack 是微软自定义软件条款；Concentus.Oggfile 1.0.6 是包元数据/固定源码 commit 所指的 MS-PL；ImageSharp 是 Apache-2.0。
3. GARbro.Probe.exe、GARbro.Xp3Bridge.exe/.cs 和 extract-rpa.mjs 的作者、来源、构建记录或本体许可证信息不完整，当前不能清除再分发。
4. NatsumeMusic 自身仍没有根目录正式 LICENSE。项目所有者需要确认许可证和版权持有人；不能由第三方组件的许可证替代。

完整的程序集版本、产品 commit、许可证和条件见 licenses/garbro/COMPONENT-INVENTORY.md；本地文件哈希见 licenses/garbro/PROVENANCE-RECORD.md 和 licenses/garbro/LOCAL-SHA256SUMS.txt。

## 1. NatsumeMusic 本体

| 项目 | 当前状态 |
| --- | --- |
| 根目录许可证 | **REVIEW REQUIRED**：目前没有 LICENSE 文件，也没有 package.json.license 字段。 |
| Copyright 持有人 | **REVIEW REQUIRED**：需要项目所有者提供公开显示的名称（个人、组织或公司）。 |
| 仓库地址 | https://github.com/wandererpg/NatsumeMusic |
| 自有 bridge 文件 | 选择本体许可证后，需明确覆盖 GARbro.Xp3Bridge.cs 和 extract-rpa.mjs；GARbro.Probe.exe/GARbro.Xp3Bridge.exe 还需证明其构建来源。 |

### 需要项目所有者做的选择

推荐给希望允许他人自由使用、修改和再分发源码的项目采用 MIT；如果希望源码衍生作品保持同类开源义务，则另行选择 GPL-3.0-or-later。这里不能替项目所有者做最终法律选择。

确认后应同时完成：

- 在仓库根目录添加与选择一致的 LICENSE 全文；
- 在 package.json 添加相同 SPDX 标识，例如 "license": "MIT"；
- 将版权持有人和年份写入许可证及自有 bridge 的版权声明；
- 把本节从 REVIEW REQUIRED 改为已确认。

## 2. GARbro 核心和来源

| 项目 | 记录 |
| --- | --- |
| 官方项目 | https://github.com/morkt/GARbro |
| 官方基线 | v1.5.44，tag commit 9ec1978bf656b1c0e60e898b8f346d825d20950a |
| 官方许可证 | https://github.com/morkt/GARbro/blob/v1.5.44/LICENSE；本地副本 resources/tools/garbro/LICENSE.txt |
| 官方归档 | https://github.com/morkt/GARbro/releases/download/v1.5.44/GARbro-v1.5.44.2904.rar；SHA-256 C0E64B881F967E0A1473127B1D181C0808068A47E99D8B5F1FBE2D99A6B2ED53 |
| 本地差异 | 本地目录加入许可证文本前 158 个文件；与官方归档同名 53 个，其中 19 个哈希相同、34 个不同；另有 105 个本地独有文件。 |
| 当前判断 | **许可证文本已核验；实际二进制来源/变更未证明**。本地 GARbro.GUI.exe 为 1.5.44.3043，官方归档 GUI 为 1.5.44.2904。 |

官方归档只证明官方发布物的来源和许可证，不能自动证明当前目录中的自定义 bridge、额外依赖或更新后的程序集。具体差异和关键哈希见 licenses/garbro/PROVENANCE-RECORD.md。

## 3. GARbro 随包程序集和原生库

下表是复核摘要；详细文件路径和产品版本见组件清单。许可证已核验只表示找到了相符的许可证资料，不代表当前二进制已完成来源绑定。

| 组件 | 本地观察版本 | 许可证/来源结论 | 状态 |
| --- | ---: | --- | --- |
| BCnEncoder.Net | 2.3.0，commit 74eda8a... | MIT OR Unlicense；两份文本已保存 | 许可证已核验 |
| CommunityToolkit.HighPerformance | 8.4.0.1 | MIT；包内另有第三方声明，已保存 | 许可证已核验 |
| Concentus | 2.2.2，commit 6c2328... | BSD 风格条款，包内含 Opus 说明 | 许可证已核验 |
| Concentus.Oggfile | 1.0.6，commit dee65d9... | NuGet 元数据和固定 commit 指向 MS-PL；不要改写成当前默认分支的 MIT | 许可证已核验 |
| SharpZipLib | 1.4.2 | MIT；文本已保存 | 许可证已核验 |
| K4os.Compression.LZ4 | 1.3.8 | MIT；文本已保存 | 许可证已核验 |
| Microsoft.Deployment.Compression / .Cab | 3.10.1.2213 | WiX DTF 的 MS-RL；需提供包含代码文件的源代码或正式 source offer | **条件再分发，来源阻塞** |
| Microsoft.WindowsAPICodePack.* | 8.0.14 | 微软自定义软件许可；不是 MIT/BSD | **条件再分发** |
| NAudio | 2.2.1 | MIT；文本已保存 | 许可证已核验 |
| Newtonsoft.Json | 13.0.4 | MIT；文本已保存 | 许可证已核验 |
| NVorbis | 0.10.5 | MIT；文本已保存 | 许可证已核验 |
| SixLabors.ImageSharp | 2.1.13，commit 2c3967b... | Apache-2.0；文本已保存 | 许可证已核验 |
| Snappier | 1.3.0，commit cbf19e0... | BSD-3-Clause；NuGet 页面另显示该版本的安全告警 | 许可证已核验，需单独处理安全风险 |
| System.Data.SQLite / SQLite.Interop | 1.0.119.0 | SQLite 官方代码为 Public Domain；provider 和 x86/x64 原生库需绑定准确包哈希 | 许可证已核验，来源待绑定 |
| WPFToolkit / System.Windows.Controls.* | 3.5.50211.1 | NuGet 元数据指向 MS-PL；版权为 Microsoft Corp. | 条件再分发 |
| ZstdNet | 1.4.5 | BSD-3-Clause；另有独立的 libzstd 许可证 | 许可证已核验 |
| ZstdSharp.Port | 0.8.7，commit 0ee6121... | MIT；文本已保存 | 许可证已核验 |
| libzstd.dll | 1.4.5 | Zstandard 原生库 BSD-3-Clause | 许可证已核验 |
| libwebp.dll | x86/x64 | WebP 原生库 BSD-3-Clause；同名文件与官方 GARbro 归档哈希一致 | 许可证已核验 |
| Microsoft.Bcl.* / System.* | 多版本 | 多数 Microsoft maintenance packages 为 MIT，但部分包带独立 .NET 第三方声明 | **必须按最终文件清单补齐 NOTICE** |

材料目录：licenses/garbro/。其中 MS-RL.txt、MS-PL.txt、Windows API Code Pack 自定义条款、ImageSharp Apache-2.0 和各组件的许可证/NOTICE 文件应随最终发布物保留。

## 4. 自定义 bridge 和非核心文件

以下文件不能仅因它们放在 resources/tools/garbro/ 下就视为 GARbro 官方文件：

- GARbro.Probe.exe：文件版本 0.0.0.0，没有足够来源和版权记录；
- GARbro.Xp3Bridge.exe：文件版本 0.0.0.0，没有足够来源和版权记录；
- GARbro.Xp3Bridge.cs：当前源文件没有作者/版权/许可证头；
- extract-rpa.mjs：本仓库自有脚本候选，需等 NatsumeMusic 本体许可证确定。

完成方式二选一：

1. 提供这些文件的作者、源代码 commit、构建命令、改动说明和许可证；或
2. 从发布包移除未能证明来源/授权的文件，并重新做功能验收。

## 5. Electron、Chromium 和 npm

| 组件 | 版本/范围 | 材料 |
| --- | --- | --- |
| Electron | 31.7.7 | licenses/electron/LICENSE.electron.txt |
| Chromium、FFmpeg 及 Electron 运行时依赖 | 随 Electron 31.7.7 | licenses/electron/LICENSES.chromium.html |
| 根项目直接 npm 依赖 | 以当前 node_modules 解析版本为准 | licenses/npm/INVENTORY-SNAPSHOT.md 和 licenses/npm/ |

当前 npm 快照记录了 126 个传递包的许可证字段，但字段审计不等于每个包的许可证全文/版权/NOTICE 已经收齐。最终打包前仍应以实际 ZIP/installer 内容为准，并重新检查依赖是否变化。

## 6. 发布门禁

- [ ] 项目所有者确认 NatsumeMusic 的许可证、版权持有人和年份。
- [ ] 根目录添加 LICENSE，package.json.license 与之对应。
- [x] 官方 GARbro v1.5.44 MIT 文本已保存。
- [x] 当前本地 GARbro 目录的文件版本、关键哈希和官方归档基线已记录。
- [ ] 证明当前 GARbro 二进制来自哪个 release/commit/fork，或改用可追溯的官方归档。
- [ ] 为 GARbro.Probe、XP3 bridge、RPA bridge 补齐作者/来源/许可证。
- [ ] 为 MS-RL 的 WiX DTF 文件提供对应源代码交付物或正式 source offer。
- [ ] 按最终发布文件清单收齐所有 .NET/原生组件的许可证和 NOTICE。
- [ ] 重新生成 installer/portable ZIP，把 LICENSE、正式 THIRD-PARTY-NOTICES.md、licenses/ 和 Electron/Chromium 声明放入并逐项检查。
- [ ] 完成 Windows 安装、启动、归档解包和无网络验收。

在所有未完成项关闭之前，发布结论应保持：**暂不宣称可公开再分发**。

## 7. 完成后如何转正式声明

1. 先完成第 6 节的所有来源、源代码交付和本体许可证选择。
2. 将本文件改名为 THIRD-PARTY-NOTICES.md，保留历史/审计说明。
3. 在发布 ZIP 的可见位置同时放置根目录 LICENSE、正式第三方声明、licenses/garbro/ 和 licenses/electron/。
4. 对每个 ZIP 运行 Get-FileHash -Algorithm SHA256，把结果与发布页的 SHA256SUMS.txt 一起上传。
