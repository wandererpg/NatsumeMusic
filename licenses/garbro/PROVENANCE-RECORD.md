# GARbro 来源记录

核对日期：2026-09-06

对应本地目录：`resources/tools/garbro/`
当前状态：**许可证文本已取得；当前本地二进制的官方来源和构建链仍未证明**

## 官方基线

- 项目：[morkt/GARbro](https://github.com/morkt/GARbro)
- 官方 `v1.5.44` 标签 commit：`9ec1978bf656b1c0e60e898b8f346d825d20950a`
- 官方发布包：[GARbro-v1.5.44.2904.rar](https://github.com/morkt/GARbro/releases/download/v1.5.44/GARbro-v1.5.44.2904.rar)
- 官方发布包 SHA-256：`C0E64B881F967E0A1473127B1D181C0808068A47E99D8B5F1BE2D99A6B2ED53`
- 官方发布包大小：`9,767,775` 字节
- 官方 `v1.5.44` 许可证：[LICENSE](https://github.com/morkt/GARbro/blob/v1.5.44/LICENSE)，文本副本位于 [`resources/tools/garbro/LICENSE.txt`](../../resources/tools/garbro/LICENSE.txt)

## 当前本地文件事实

- 文件数：`159`
- 总大小：`73,075,050` 字节
- `GARbro.GUI.exe` 文件版本：`1.5.44.3043`
- `GARbro.GUI.exe` 本地 SHA-256：`56C57E09F597930643AC968BBF59F50BDE3DA925266019CBD5FC17417405605F`
- 官方 `v1.5.44.2904` 的 `GARbro.GUI.exe` SHA-256：`923C51D091EF0F9A6394F6D4AF98710B0A5B9B5A405EEDBCA8AEA73447737EA2`
- 当前本地 `GameData/Formats.dat` SHA-256：`E0A9A8A78027B679975B357C0413C6BFBABEEEC6CBDD981A41DF75CC21B4F3B5`

将本地目录与官方 `v1.5.44.2904` 归档解压结果按相对路径和 SHA-256 比对得到：

| 项目 | 数量 |
| --- | ---: |
| 本地文件 | 158（加入本地许可证文本前） |
| 官方归档文件 | 56 |
| 同名文件 | 53 |
| 同名且哈希相同 | 19 |
| 同名但哈希不同 | 34 |
| 仅本地存在 | 105 |
| 仅官方归档存在 | 3（`LICENSE.txt`、`README.txt`、`supported.html`） |

结论：本地目录不是官方 `v1.5.44.2904` 归档的逐字节副本。主程序版本、依赖版本、额外 bridge 和本地格式数据库均表明它是另一套构建结果；不能只因官方 GARbro 项目使用 MIT 就宣称当前所有文件都已获得同一许可覆盖。

## 当前关键文件 SHA-256

完整清单见 [`LOCAL-SHA256SUMS.txt`](LOCAL-SHA256SUMS.txt)。下表保留便于人工审查的关键入口：

| 文件 | SHA-256 |
| --- | --- |
| `GARbro.exe` | `07528723B6BE526D83095A176C5582291570778A251EBE6495ADE5C9834EDA10` |
| `GARbro.Console.exe` | `EC3BE4EB009564C991067387A1936EAA9D4956434ED13E41C4E09A71238CD1A5` |
| `GARbro.GUI.exe` | `56C57E09F597930643AC968BBF59F50BDE3DA925266019CBD5FC17417405605F` |
| `GARbro.Probe.exe` | `C654F51F47A37AE52D32373CDB5EA0C0F0F928BDE1D569E81D1FC3EDC75A8569` |
| `GARbro.Xp3Bridge.exe` | `BDC4E4DBDD2D5A294F82298931EE6615B154FE82CF1702BB1741324BF2D54988` |
| `GARbro.Xp3Bridge.cs` | `D7581985060B2FB0527A5DD416657BB9DC951977D22FE6570FF4FB3CC7A4563D` |
| `GameData/Formats.dat` | `E0A9A8A78027B679975B357C0413C6BFBABEEEC6CBDD981A41DF75CC21B4F3B5` |
| `x64/libzstd.dll` | `0C245A3C93AD074469F675FB6F1401461F8D46D0EAD253E459757D102B8AE562` |
| `x86/libzstd.dll` | `6EA0AE72419B6E59BFA49F487C0CFCCBFD4A315C4826DF7F5EAB549456EAF8A9` |
| `resources/tools/extract-rpa.mjs` | `6A41C0F4063C04DA5FB2B50369797214AAD8F8A60EDA0DE2158034D355B7F6FB` |

## 待项目所有者完成的来源动作

1. 说明本地目录来自哪个 release、commit、fork 或自行编译；保存原始下载地址/归档 SHA-256。
2. 如果是自行编译，保存源代码 commit、依赖锁定文件、构建工具版本和修改列表；对每个与官方归档不同的文件给出解释。
3. 单独确认 `GARbro.Probe.exe`、`GARbro.Xp3Bridge.exe/.cs` 和 `extract-rpa.mjs` 的作者、版权及许可证。
4. 对 MS-RL 的 `Microsoft.Deployment.Compression*.dll` 提供对应源代码交付物或正式 source offer。
5. 只有上述记录完成后，才能将本文件状态改为“来源已证明”，并把 `THIRD-PARTY-NOTICES.draft.md` 改名为正式声明。
