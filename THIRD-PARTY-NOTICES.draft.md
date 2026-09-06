# NatsumeMusic 第三方组件声明（草稿）

状态：**发布前复核中**  
核对日期：2026-08-24  
适用构建：Windows x64 `0.1.0`，当前桌面构建 `release-v13`。

这份文件是发布准备清单，不是法律意见，也不是“所有组件均已获准再分发”的声明。正式发布前必须补齐所有 `REVIEW REQUIRED` 项，并由项目所有者确认 NatsumeMusic 自身的许可证。

## 1. NatsumeMusic 本体

| 项目 | 当前状态 |
| --- | --- |
| 项目许可证 | `REVIEW REQUIRED`：根目录目前没有 `LICENSE`，需要项目所有者选择 MIT、GPL 或其他许可证。 |
| Copyright 持有人 | `REVIEW REQUIRED`：需要填写项目所有者/作者名称。 |
| 源码仓库地址 | 发布 GitHub 仓库后补充正式 URL。 |

在项目所有者确认之前，不要把任何第三方许可证文本当作 NatsumeMusic 本体许可证。

## 2. GARbro 及资源解包运行时

GARbro 官方仓库 README 和许可证声明其核心项目使用 MIT License。正式声明应保留官方版权和许可证文本，并注明实际使用的 upstream release 或 commit：

- 官方仓库：https://github.com/morkt/GARbro
- 官方许可证：https://raw.githubusercontent.com/morkt/GARbro/master/LICENSE
- 随包位置：`resources/tools/garbro/`
- 当前本地指纹记录：[`licenses/garbro/PROVENANCE-RECORD.md`](licenses/garbro/PROVENANCE-RECORD.md)
- 当前文件版本信息：GARbro 主程序显示 `1.0.0.0`；`GARbro.Probe.exe` 和 `GARbro.Xp3Bridge.exe` 显示 `0.0.0.0`。
- **REVIEW REQUIRED**：当前二进制目录没有记录 upstream release/commit，不能仅凭文件版本号完成来源证明。

当前目录还包含 `GARbro.Probe.exe`、`GARbro.Xp3Bridge.exe`、`GARbro.Xp3Bridge.cs` 和 `extract-rpa.mjs`。这些文件应分别确认来源、作者、修改情况和许可证，不能自动视为 GARbro 核心项目的一部分。

## 3. GARbro 随附的 .NET 组件

下表根据当前 `resources/tools/garbro` 中的程序集名称和版本整理。许可证列为 `REVIEW REQUIRED` 的项目必须对照实际上游包或源代码逐项确认，不能按名称推断。

| 组件 | 当前程序集版本 | 许可证/来源状态 | 随包位置 |
| --- | ---: | --- | --- |
| BCnEncoder | 2.3.0.0 | REVIEW REQUIRED | `resources/tools/garbro/BCnEncoder.dll` |
| CommunityToolkit.HighPerformance | 8.4.0.0 | REVIEW REQUIRED | `resources/tools/garbro/CommunityToolkit.HighPerformance.dll` |
| Concentus / Concentus.Oggfile | 2.2.2.0 / 1.0.6.0 | REVIEW REQUIRED | `resources/tools/garbro/Concentus*.dll` |
| ICSharpCode.SharpZipLib | 1.4.2.13 | REVIEW REQUIRED | `resources/tools/garbro/ICSharpCode.SharpZipLib.dll` |
| K4os.Compression.LZ4 | 1.3.8.0 | REVIEW REQUIRED | `resources/tools/garbro/K4os.Compression.LZ4.dll` |
| Microsoft.Deployment.Compression | 3.0.0.0 | REVIEW REQUIRED | `resources/tools/garbro/Microsoft.Deployment.Compression*.dll` |
| Microsoft.WindowsAPICodePack | 8.0.14.0 | REVIEW REQUIRED | `resources/tools/garbro/Microsoft.WindowsAPICodePack*.dll` |
| NAudio | 2.2.1.0 | REVIEW REQUIRED | `resources/tools/garbro/NAudio*.dll` |
| Newtonsoft.Json | 13.0.0.0 | REVIEW REQUIRED | `resources/tools/garbro/Newtonsoft.Json.dll` |
| NVorbis | 0.10.5.0 | REVIEW REQUIRED | `resources/tools/garbro/NVorbis.dll` |
| SixLabors.ImageSharp | 2.0.0.0 | REVIEW REQUIRED | `resources/tools/garbro/SixLabors.ImageSharp.dll` |
| Snappier | 1.3.0.0 | REVIEW REQUIRED | `resources/tools/garbro/Snappier.dll` |
| System.Data.SQLite | 1.0.119.0 | REVIEW REQUIRED | `resources/tools/garbro/System.Data.SQLite.dll` |
| WPFToolkit / Windows.Controls.Toolkit | 3.5.40128.1 | REVIEW REQUIRED | `resources/tools/garbro/WPFToolkit.dll`、`System.Windows.Controls.*.dll` |
| ZstdNet / ZstdSharp | 1.4.5.0 / 0.8.7.0 | REVIEW REQUIRED | `resources/tools/garbro/Zstd*.dll` |
| `System.*` / `Microsoft.Bcl.*` 程序集 | 多个版本 | REVIEW REQUIRED：确认它们来自哪个 NuGet/.NET 发布包及其再分发文件 | `resources/tools/garbro/*.dll` |

PDB、XML、config 和桥接源文件也应随对应组件一起保留或说明来源；它们不是许可证豁免项。

## 4. Electron 与 Chromium

| 组件 | 版本 | 状态 | 许可证材料 |
| --- | --- | --- | --- |
| Electron | 31.7.7 | 已随构建携带 | [`licenses/electron/LICENSE.electron.txt`](licenses/electron/LICENSE.electron.txt) |
| Chromium、FFmpeg 及 Electron 运行时依赖 | 随 Electron 31.7.7 | 已随构建携带，但发布前仍应保留 | [`licenses/electron/LICENSES.chromium.html`](licenses/electron/LICENSES.chromium.html) |

不要从便携版的 `resources` 或 Electron 输出目录中删除这些文件。

## 5. npm 依赖

版本来自当前安装的 `node_modules`，不是只来自根目录的 semver 范围。

| 包 | 安装版本 | package.json 许可证字段 | 类型 | 许可证文件 |
| --- | ---: | --- | --- | --- |
| `@vitejs/plugin-react` | 4.7.0 | MIT | 构建时 | 当前发布应用不应依赖它运行；源码发布仍需保留依赖信息 |
| `better-sqlite3` | 11.10.0 | MIT | 运行时 | [`licenses/npm/better-sqlite3-11.10.0-LICENSE.txt`](licenses/npm/better-sqlite3-11.10.0-LICENSE.txt) |
| `howler` | 2.2.4 | MIT | 运行时 | [`licenses/npm/howler-2.2.4-LICENSE.md`](licenses/npm/howler-2.2.4-LICENSE.md) |
| `lucide-react` | 0.468.0 | ISC | 运行时 | [`licenses/npm/lucide-react-0.468.0-LICENSE.txt`](licenses/npm/lucide-react-0.468.0-LICENSE.txt) |
| `music-metadata` | 10.9.1 | MIT | 运行时 | [`licenses/npm/music-metadata-10.9.1-LICENSE.txt`](licenses/npm/music-metadata-10.9.1-LICENSE.txt)；文本取自当前安装包 README 的许可证段落，仍需在发布前与对应上游 tag 复核 |
| `react` | 18.3.1 | MIT | 运行时 | [`licenses/npm/react-18.3.1-LICENSE.txt`](licenses/npm/react-18.3.1-LICENSE.txt) |
| `react-dom` | 18.3.1 | MIT | 运行时 | [`licenses/npm/react-dom-18.3.1-LICENSE.txt`](licenses/npm/react-dom-18.3.1-LICENSE.txt) |
| `uuid` | 10.0.0 | MIT | 运行时 | [`licenses/npm/uuid-10.0.0-LICENSE.md`](licenses/npm/uuid-10.0.0-LICENSE.md) |
| `zustand` | 4.5.7 | MIT | 运行时 | [`licenses/npm/zustand-4.5.7-LICENSE.txt`](licenses/npm/zustand-4.5.7-LICENSE.txt) |

这张表只列根项目直接声明的包。正式发布前还要对最终打包产物中实际存在的传递依赖进行一次完整清单核对。

## 6. 正式发布前的阻断项

- [ ] 项目所有者选择并添加 NatsumeMusic 自身的 `LICENSE`。
- [ ] 记录 GARbro 二进制的官方 release/commit、下载地址和校验值。
- [ ] 为 GARbro 依赖表中的每个 `REVIEW REQUIRED` 项找到官方许可证文本和版权声明。
- [x] 已从当前安装的 `music-metadata@10.9.1` README 许可证段落保存许可证文本。
- [ ] 发布前仍需将该文本与对应上游 `10.9.1` tag 的 `LICENSE.txt` 做一次逐字复核。
- [ ] 对最终 portable ZIP 和 installer ZIP 做一次文件清单核对。
- [ ] 将本草稿改名为 `THIRD-PARTY-NOTICES.md`，并在 GitHub Release 说明中链接它。
