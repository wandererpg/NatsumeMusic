# GARbro 来源记录（待补齐）

状态：**仅完成当前本地文件指纹记录，尚未完成上游来源证明**  
记录日期：2026-08-24  
对应构建：`release-v13` / Windows x64 `0.1.0`

## 当前随包位置

- 源码树：`resources/tools/garbro/`
- 未打包构建：`release-v13/win-unpacked/resources/tools/garbro/`
- 官方项目：https://github.com/morkt/GARbro
- 官方许可证：https://raw.githubusercontent.com/morkt/GARbro/master/LICENSE

## 当前文件 SHA-256

这些哈希只能固定本机当前文件，不能证明它们来自哪个 upstream release 或 commit。

| 文件 | SHA-256 |
| --- | --- |
| `GARbro.exe` | `07528723B6BE526D83095A176C5582291570778A251EBE6495ADE5C9834EDA10` |
| `GARbro.Console.exe` | `EC3BE4EB009564C991067387A1936EAA9D4956434ED13E41C4E09A71238CD1A5` |
| `GARbro.GUI.exe` | `56C57E09F597930643AC968BBF59F50BDE3DA925266019CBD5FC17417405605F` |
| `GARbro.Probe.exe` | `C654F51F47A37AE52D32373CDB5EA0C0F0F928BDE1D569E81D1FC3EDC75A8569` |
| `GARbro.Xp3Bridge.exe` | `BDC4E4DBDD2D5A294F82298931EE6615B154FE82CF1702BB1741324BF2D54988` |
| `GARbro.Xp3Bridge.cs` | `D7581985060B2FB0527A5DD416657BB9DC951977D22FE6570FF4FB3CC7A4563D` |
| `resources/tools/extract-rpa.mjs` | `6A41C0F4063C04DA5FB2B50369797214AAD8F8A60EDA0DE2158034D355B7F6FB` |

## 发布前必须补齐

1. 说明 GARbro 是从官方 release、官方 commit 还是自行编译得到；记录 URL、版本/commit 和原始压缩包 SHA-256。
2. 将上游文件与上表哈希逐项比对；若不一致，说明修改内容和修改者。
3. 单独确认 `GARbro.Xp3Bridge.cs/.exe` 与 `extract-rpa.mjs` 的作者、版权和许可证；它们不能自动归入 GARbro 的 MIT 声明。
4. 为 DLL、原生库、`GameData` 数据文件和资源程序集建立完整组件清单；只确认主程序许可证是不够的。
