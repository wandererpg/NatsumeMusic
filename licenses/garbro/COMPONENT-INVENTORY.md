# GARbro 及其随包组件清单

核对日期：2026-09-06

审计范围：`resources/tools/garbro/` 当前 159 个文件，约 73,075,050 字节。
方法：读取本地 PE/程序集版本信息，核对 NuGet 包内 `.nuspec`、固定源码 commit、官方发布包和许可证；除非另有说明，许可证身份核验不等于当前本地文件的构建来源已经证明。

## 状态定义

- **许可证已核验**：已经找到与组件/包版本相符的官方许可证或官方包元数据。
- **条件再分发**：许可证允许对象代码分发，但必须保留声明、满足平台/修改/源代码等附加条件。
- **来源阻塞**：当前文件的实际 upstream release、commit、构建过程或变更记录不足，不能仅凭文件名和版本号清除再分发。
- **项目许可证待定**：属于 NatsumeMusic 自有文件，须等待项目所有者选择根目录许可证和版权持有人。

## 组件表

| 本地文件或文件组 | 本地观察值 | 上游身份与许可证 | 当前判断 |
| --- | --- | --- | --- |
| `GARbro.exe`、`GARbro.Console.exe`、`GARbro.GUI.exe`、`Arc*.dll`、`GameRes.dll`、`GameData/*`、语言资源 | GUI 文件版本 `1.5.44.3043`；`GARbro.exe`/`Console` 为 `1.0.0.0` | [morkt/GARbro](https://github.com/morkt/GARbro)，官方 `v1.5.44` 为 MIT；本地 MIT 文本在 `resources/tools/garbro/LICENSE.txt` | 许可证已核验；**来源阻塞**。当前目录不是官方 `GARbro-v1.5.44.2904.rar` 的逐字节副本，见来源记录 |
| `GARbro.Probe.exe`、`GARbro.Xp3Bridge.exe`、`GARbro.Xp3Bridge.cs` | EXE 文件版本 `0.0.0.0`；源文件无作者/许可证头 | 当前仓库中没有足够的来源、作者、构建 commit 或修改说明 | **来源阻塞**；需由作者补充归属并提供源代码/构建记录，或从发布包移除 |
| `extract-rpa.mjs` | 当前仓库自有脚本，无独立版权头 | 不是 GARbro 官方文件；应按 NatsumeMusic 自有代码处理 | **项目许可证待定**；根目录许可证确定后再明确归属 |
| `BCnEncoder.dll` | `2.3.0`，产品 commit `74eda8a330759d81e6307f19aefc547e40687825` | [BCnEncoder.Net 2.3.0](https://www.nuget.org/packages/BCnEncoder.Net/2.3.0)，MIT OR Unlicense | 许可证已核验；应同时记录其 `CommunityToolkit.HighPerformance`、`Microsoft.Bcl.Numerics` 依赖 |
| `CommunityToolkit.HighPerformance.dll` | `8.4.0.1` | [CommunityToolkit.HighPerformance 8.4.0](https://www.nuget.org/packages/CommunityToolkit.HighPerformance/8.4.0)，MIT；包内另有 `ThirdPartyNotices.txt` | 许可证已核验；发布包应保留该包的第三方声明 |
| `Concentus.dll` | `2.2.2`，产品 commit `6c2328dc19044601e33a9c11628b8d60e1f3011c` | [Concentus 2.2.2](https://www.nuget.org/packages/Concentus/2.2.2)，BSD 风格条款，并包含 Opus 版权/许可声明 | 许可证已核验；必须保留包内 LICENSE 的完整归属和 Opus 说明 |
| `Concentus.Oggfile.dll` | `1.0.6`，产品 commit `dee65d9de0ef009658c2d60be6fd9b29d362a482` | NuGet 包固定声明 MS-PL；对应固定源码 commit 的 LICENSE 也是 Microsoft Public License | 许可证已核验；不要用当前默认分支后来变更的 MIT 文本替代 `1.0.6` 包的 MS-PL |
| `ICSharpCode.SharpZipLib.dll` | `1.4.2` | [SharpZipLib 1.4.2](https://www.nuget.org/packages/SharpZipLib/1.4.2)，MIT | 许可证已核验 |
| `K4os.Compression.LZ4.dll` | `1.3.8` | [K4os.Compression.LZ4 1.3.8](https://www.nuget.org/packages/K4os.Compression.LZ4/1.3.8)，上游 LICENSE 为 MIT | 许可证已核验；本地包文件未嵌入许可证，发布声明须补齐 |
| `Microsoft.Deployment.Compression*.dll` | `3.10.1.2213`；公司字段为 Outercurve Foundation | WiX 3 DTF `wix3101rtm` 源码声明 Microsoft Reciprocal License（MS-RL） | **条件再分发 + 来源阻塞**；MS-RL 要求向接收方提供包含该代码文件的源代码和许可证 |
| `Microsoft.WindowsAPICodePack*.dll` | `8.0.14`；产品版本 `1.0.0+9ca67af3028210831affbbff1f222789695453c7` | [Windows API Code Pack 1.1 条款](https://github.com/aybe/Windows-API-Code-Pack-1.1/blob/master/LICENCE)为微软自定义软件许可 | **条件再分发**；需保留微软版权/条款、不得误用商标，并遵守其修改标识、下游条款和赔偿要求 |
| `NAudio*.dll` | `2.2.1` | [NAudio 2.2.1](https://www.nuget.org/packages/NAudio/2.2.1)，MIT | 许可证已核验 |
| `Newtonsoft.Json.dll` | `13.0.4` | [Newtonsoft.Json 13.0.4](https://www.nuget.org/packages/Newtonsoft.Json/13.0.4)，MIT | 许可证已核验 |
| `NVorbis.dll` | `0.10.5` | [NVorbis 0.10.5](https://www.nuget.org/packages/NVorbis/0.10.5)，MIT | 许可证已核验 |
| `SixLabors.ImageSharp.dll` | `2.1.13`，产品 commit `2c3967b22543545c902fb1fecf57d44025bda84d` | [ImageSharp 2.1.13](https://www.nuget.org/packages/SixLabors.ImageSharp/2.1.13) 的包元数据和固定源码 LICENSE 为 Apache-2.0 | 许可证已核验；发布包必须随附 Apache-2.0 文本和版权声明 |
| `Snappier.dll` | `1.3.0`，产品 commit `cbf19e0f9d3fb4d7bd76ddd108e7f41a99b09885` | [Snappier 1.3.0](https://www.nuget.org/packages/Snappier/1.3.0)，BSD-3-Clause；NuGet 页面同时显示该版本已有安全告警 | 许可证已核验；安全告警是独立的发布决策，不应被许可证表掩盖 |
| `System.Data.SQLite.dll`、`x64/SQLite.Interop.dll`、`x86/SQLite.Interop.dll` | `1.0.119.0` | [System.Data.SQLite.Core 1.0.119](https://www.nuget.org/packages/System.Data.SQLite.Core/1.0.119)；SQLite 引擎官方声明 Public Domain | 许可证已核验；仍需把 provider 与两个原生二进制的确切包来源绑定到哈希 |
| `WPFToolkit.dll`、`System.Windows.Controls.*.dll` | `3.5.50211.1` | [WPFToolkit 3.5.50211.1](https://www.nuget.org/packages/WPFToolkit/3.5.50211.1)，NuGet 元数据指向 MS-PL | 条件再分发；应保留 MS-PL 和 Microsoft 版权声明 |
| `ZstdNet.dll` | `1.4.5` | [ZstdNet](https://github.com/skbkontur/ZstdNet)，BSD-3-Clause，版权归 SKB Kontur | 许可证已核验 |
| `ZstdSharp.dll` | `0.8.7`，产品 commit `0ee6121aaa173b42e68d3c6c8816a68e910e0557` | [ZstdSharp.Port 0.8.7](https://www.nuget.org/packages/ZstdSharp.Port/0.8.7)，MIT | 许可证已核验 |
| `x64/libzstd.dll`、`x86/libzstd.dll` | 原生文件版本 `1.4.5` | Zstd 1.4.5 官方 LICENSE 为 BSD-3-Clause | 许可证已核验；这是 ZstdNet wrapper 之外的独立原生组件，必须单独列示 |
| `x64/libwebp.dll`、`x86/libwebp.dll` | 与官方 GARbro `v1.5.44` 归档中的同名文件哈希一致 | WebP 官方代码使用 BSD-3-Clause | 许可证已核验；保留 WebP 版权/许可文本 |
| `Microsoft.Bcl.*`、`System.*` 可再分发程序集 | 版本分散；例如 `System.Buffers 4.6.1`、`System.Memory 4.6.3`、`Unsafe 6.1.2`、`System.Text.Encoding.CodePages 10.0.5` | 对应 Microsoft maintenance package 多数为 MIT；部分包另有 `.NET` 第三方声明 | 许可证大体可定位，但**必须按最终文件清单和准确包版本补齐 NOTICE**，不能只写一行 `System.*` |

## 发布前必须完成

- 为当前 GARbro 目录补充“来源压缩包/commit → 构建命令 → 修改列表 → 每个最终文件哈希”的可复现记录。
- 为两个 XP3 bridge 和 RPA bridge 补充作者、版权、源代码和许可证；如果它们属于项目本体，应在根目录许可证确定后加入相应版权声明。
- 对 MS-RL 的 WiX DTF 文件提供对应源代码交付物或正式 source offer，并在最终发布包内放入 MS-RL 文本。
- 将本表中每个“许可证已核验”组件的许可证/NOTICE 复制到发布 ZIP，并检查安装包与便携包内容一致。
