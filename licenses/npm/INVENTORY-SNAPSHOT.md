# npm 运行时依赖审计快照

记录日期：2026-08-24  
数据来源：本地 `node_modules`，命令为 `npm ls --omit=dev --all --parseable`，再读取每个包的 `package.json`。

## 结果

- 共发现 127 个路径条目，其中 1 个是 NatsumeMusic 根包，第三方包为 126 个。
- 126 个第三方包的 `package.json` 都有非空 `license` 字段。
- 这只是 SPDX/许可证字段审计，不等于已经收集了每个包的许可证全文、版权声明或 NOTICE 文件。
- 根项目目前没有 `license` 字段；这不影响第三方包统计，但需要由项目所有者单独决定 NatsumeMusic 的许可证。

主要许可证字段计数：

| 许可证字段 | 包数量 |
| --- | ---: |
| MIT | 106 |
| ISC | 12 |
| Apache-2.0 | 3 |
| BSD-3-Clause | 2 |
| CC-BY-4.0 | 1 |
| `(BSD-2-Clause OR MIT OR Apache-2.0)` | 1 |
| `(MIT OR WTFPL)` | 1 |

除 MIT/ISC 外，发布前至少要逐项定位以下包的许可证全文和版权声明：

- `baseline-browser-mapping@2.11.4` — Apache-2.0
- `caniuse-lite@1.0.30001806` — CC-BY-4.0
- `detect-libc@2.1.2` — Apache-2.0
- `expand-template@2.0.3` — MIT OR WTFPL
- `ieee754@1.2.1` — BSD-3-Clause
- `rc@1.2.8` — BSD-2-Clause OR MIT OR Apache-2.0
- `source-map-js@1.2.1` — BSD-3-Clause
- `tunnel-agent@0.6.0` — Apache-2.0

## 下次发布前重跑

```powershell
npm ls --omit=dev --all --parseable
npm ls --omit=dev --all --json
```

依赖版本变化后，不要继续使用这份快照；应重新核对 `THIRD-PARTY-NOTICES.md` 和 `licenses/npm/` 中的文本。
