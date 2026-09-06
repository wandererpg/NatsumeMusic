# 许可证材料目录

这里保存 NatsumeMusic 发布前需要随源码或发布包提供的第三方许可证材料。

当前状态：**准备中，不代表法律审查已经完成。**

## 已复制的材料

- `electron/`：从已验证的 Windows 构建中复制的 Electron 和 Chromium 许可文件。
- `npm/`：从当前安装依赖中复制的可直接取得的许可证文本，文件名包含版本号；[`INVENTORY-SNAPSHOT.md`](npm/INVENTORY-SNAPSHOT.md) 是本次运行时依赖元数据审计快照。
- `garbro/`：当前 GARbro 文件指纹和来源核对记录，见 [`PROVENANCE-RECORD.md`](garbro/PROVENANCE-RECORD.md)。

## 还需要人工完成的工作

- 由项目所有者选择 NatsumeMusic 自身的开源许可证，并在仓库根目录创建 `LICENSE`。
- 确认 `resources/tools/garbro` 中 GARbro 二进制的官方来源、版本或 commit。
- 为 GARbro 随附的每个第三方组件核对准确版本、版权人、许可证全文和来源。
- 为没有随 npm 包提供许可证文件的依赖，从其官方仓库或对应版本发布包取得许可证全文；例如 `music-metadata` 官方仓库提供 `LICENSE.txt`，但仍应取得与当前 10.9.1 对应的版本文本，不能只根据 `package.json` 的 `license` 字段猜测版权声明。
- 审查 `THIRD-PARTY-NOTICES.draft.md` 中所有 `REVIEW REQUIRED` 项，完成后再将草稿改名为正式的 `THIRD-PARTY-NOTICES.md`。

## 复核原则

1. 以最终发布 ZIP 中实际携带的文件为准，而不是只看源码依赖树。
2. 不要把 GARbro 的 MIT 许可证套用到它携带的所有 DLL。
3. 不要删除 `LICENSE.electron.txt` 或 `LICENSES.chromium.html`。
4. 如果某个组件的来源或许可证无法确认，应暂缓公开发布，或移除该组件后重新打包。

## 当前 ZIP 状态

`github-release-v1` 中的现有 ZIP 是在本目录材料补齐前生成的：portable ZIP 目前只检出 `better-sqlite3` 的许可证文件，installer ZIP 也没有可检出的根目录许可证材料。因此，完成最终复核后必须重新生成两个 ZIP，并再次检查 ZIP 内的 `LICENSE`、`THIRD-PARTY-NOTICES.md`、`licenses/` 以及 Electron/Chromium 声明。
