# GARbro 随包许可材料

本目录对应仓库中的 `resources/tools/garbro/`，不是 NatsumeMusic 本体的许可证目录。

## 当前结论

- GARbro 官方 `v1.5.44` 源码和发布包附带 MIT License；对应文本已放在 [`../../resources/tools/garbro/LICENSE.txt`](../../resources/tools/garbro/LICENSE.txt)。
- 当前本地目录不是官方 `v1.5.44` 压缩包的逐字节副本。完整比对和来源限制见 [`PROVENANCE-RECORD.md`](PROVENANCE-RECORD.md)。
- 依赖程序集的许可不能由 GARbro 的 MIT 自动覆盖；逐项判断见 [`COMPONENT-INVENTORY.md`](COMPONENT-INVENTORY.md)。
- 当前目录中的 `GARbro.Probe.exe`、`GARbro.Xp3Bridge.exe`、`GARbro.Xp3Bridge.cs` 和 `extract-rpa.mjs` 还没有足够的作者/来源记录，不能把它们标为已清除再分发。

## 发布要求

1. 发布包必须同时携带 `THIRD-PARTY-NOTICES.md`（在本次审计阻塞项完成后由草稿改名）和本目录所列的许可证/版权声明。
2. `Microsoft.Deployment.Compression*.dll` 属于 WiX DTF 代码的 MS-RL 许可范围；如果继续随包发布，应同时提供对应文件的源代码或可取得源代码的正式交付方式。
3. Windows API Code Pack 使用微软自定义软件许可条款，不应写成 MIT/BSD；必须保留原版权和条款，并遵守其 Windows、修改标识和下游条款要求。
4. 只有在本地二进制的 release/commit、构建来源和哈希能够追溯后，才能把“许可证已核验”升级为“该文件可按该许可证再分发”。

## 官方来源索引

- [GARbro `v1.5.44` 发布页](https://github.com/morkt/GARbro/releases/tag/v1.5.44)
- [GARbro `v1.5.44` LICENSE](https://github.com/morkt/GARbro/blob/v1.5.44/LICENSE)
- [WiX 3 DTF 源码](https://github.com/wixtoolset/wix3/tree/wix3101rtm/src/DTF)
- [Windows API Code Pack 原始条款副本](https://github.com/aybe/Windows-API-Code-Pack-1.1/blob/master/LICENCE)
- [Concentus.Oggfile `1.0.6` 固定源码 commit](https://github.com/lostromb/concentus.oggfile/tree/dee65d9de0ef009658c2d60be6fd9b29d362a482)
