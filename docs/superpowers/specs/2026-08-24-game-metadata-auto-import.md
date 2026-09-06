# 游戏资料自动匹配与封面导入设计

**日期：** 2026-08-24  
**状态：** 已实现并验证

## 目标

模仿 ReinaManager 的导入体验：用户首次向某个游戏库导入音乐时，NatsumeMusic 自动根据游戏名称查询 VNDB 与 Bangumi 的公开资料，保存匹配结果并下载本地封面；同一游戏后续导入音乐时复用缓存，不重复请求。

## 已确认的范围

- 触发单位是游戏库，不是单首音乐。
- 首次扫描游戏文件夹和后续向已有游戏添加曲目，都使用同一套资料服务。
- 查询来源固定为 VNDB 与 Bangumi。
- 网络查询失败不得阻断音乐复制和曲目入库。
- 自动封面不得覆盖用户手动选择的封面。
- 资料与封面必须保存在本机，软件离线时仍可正常显示已缓存内容。

## 参考实现与外部接口

ReinaManager 0.28.2 的本地数据库包含 `games` 和 `game_sources` 表；`game_sources` 按游戏和来源保存 `external_id` 与 JSON 数据，当前样本包含 `bgm`、`vndb`、`ymgal` 来源。封面位于独立的本地缓存目录。NatsumeMusic 将采用同样的“游戏级来源缓存”思想，但本次只实现用户确认的 VNDB 与 Bangumi。

VNDB 使用官方 Kana HTTPS API：通过 `POST https://api.vndb.org/kana/vn` 的 `search` 过滤器查找条目，再读取标题、别名、简介、开发商、评分、标签和 `image.url`。VNDB 官方文档说明大多数读取接口无需用户认证，并提供请求限流规则。

Bangumi 使用公开 API：通过 `POST https://api.bgm.tv/v0/search/subjects` 搜索游戏类型条目，再使用 `GET https://api.bgm.tv/v0/subjects/{id}` 获取详情，必要时使用 `/image` 获取指定尺寸封面。请求设置带有应用名称和版本号的 User-Agent，不使用网页 DOM 爬取作为主路径。

## 用户流程

```text
导入游戏文件夹或添加曲目
  -> 创建/找到游戏记录
  -> 规范化游戏名称
  -> 查询 VNDB 与 Bangumi（并行、带超时）
  -> 计算候选匹配置信度
  -> 保存来源资料和状态
  -> 在没有手动封面时下载一张本地封面
  -> 刷新游戏列表和游戏标题区域
```

资料查询在音乐扫描和复制完成后执行，但仍属于同一个导入任务的非致命阶段；用户可以看到“获取游戏资料”和“下载封面”进度。若网络不可用，音乐导入先完成，资料任务记录失败原因并允许后续重试。

## 名称规范化与匹配

查询输入由用户填写的 `gameName`、源文件夹名和必要时的原始路径末级目录组成。规范化只用于搜索，不修改游戏在界面中的原名：

- 去除 `[PC]`、`[汉化]`、`汉化版`、`语音版`、`修正版` 等发布标记。
- 去除常见版本号、压缩包标签和平台后缀。
- 合并连续空白，保留日文、中文和拉丁字符。
- 同时用原始名称、清理名称和候选结果的别名进行比较。

候选排序优先级：规范化名称精确相等 > 别名精确相等 > 中文/日文标题相等 > API 搜索排序。只有最高候选达到阈值才自动写入封面；低置信度结果保留候选和“待确认”状态，避免错误封面覆盖正确游戏。

## 数据模型

新增数据库迁移，建立 `game_sources`：

```sql
CREATE TABLE game_sources (
  game_id       TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('vndb', 'bangumi')),
  external_id   TEXT,
  query_name    TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending', 'matched', 'no_match', 'failed', 'ambiguous')),
  data_json     TEXT,
  image_url     TEXT,
  fetched_at    TEXT,
  retry_after   TEXT,
  error_message TEXT,
  PRIMARY KEY (game_id, source),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);
```

`data_json` 保存归一化后的来源资料；当状态为 `ambiguous` 时保存候选摘要数组，供后续手动确认使用。`retry_after` 记录失败后的重试时间，避免每次导入都重复请求不可用的服务。

`games` 增加封面来源字段 `cover_source`，取值为 `manual`、`vndb`、`bangumi` 或 `NULL`。现有非空封面迁移为 `manual`，保证升级后不会被自动匹配覆盖。用户在游戏编辑器中选择或移除封面时，将 `cover_source` 更新为 `manual` 或 `NULL`。

自动下载的封面保存到对应游戏目录下的 `.cover.<扩展名>`，并通过已有的 `galmusic-cover` 协议显示；下载内容必须限制为图片类型、限制大小，并通过临时文件完成，成功后再替换目标文件。

## 服务边界

新增独立的 `game-metadata` 服务，不让数据库查询层直接访问网络：

- `searchVndb(name, signal)`：构造 VNDB JSON 查询并归一化响应。
- `searchBangumi(name, signal)`：构造 Bangumi 搜索与详情请求并归一化响应。
- `resolveGameMetadata(game, options)`：并行查询两个来源、排序候选并写入来源状态。
- `downloadCover(url, targetDirectory, signal)`：安全下载并返回本地路径。

主进程负责所有网络请求、数据库写入和文件下载，渲染进程只接收脱敏后的来源摘要，不接触原始网络响应或任意远程图片 URL。

## 缓存、超时与失败处理

- 已存在 `matched` 资料且本地封面仍存在时，后续导入直接复用，不发网络请求。
- 每个来源请求设置独立超时；VNDB 或 Bangumi 单独失败不影响另一来源。
- 没有结果写入 `no_match`，导入仍成功。
- 网络错误写入 `failed`，导入仍成功；后续显式刷新或冷却时间后重新导入时允许重试。
- `ambiguous` 只保存候选摘要，不自动替换已有手动封面。
- 取消导入时终止正在进行的请求，并清理未完成的临时封面文件。

## 界面变化

- 导入进度新增“获取游戏资料”和“下载封面”阶段。
- 游戏标题区域继续使用自动下载的本地封面。
- 游戏编辑器增加网络资料摘要：VNDB/Bangumi 匹配状态、标题、开发商、评分和简介摘要。
- 导入完成页显示两个来源的查询结果和封面落地结果，避免网络任务静默失败。
- 增加“刷新网络资料”操作；刷新不会清除音乐，也不会覆盖手动封面。
- 打开已有游戏时自动补查尚未完成的来源，并在缓存命中但本地封面缺失时重新落地封面。
- 资料无结果或查询失败时显示可理解的状态，不弹出阻断导入的错误对话框。

## 测试策略

- 测试名称规范化、候选排序和置信度阈值。
- 测试 VNDB/Bangumi 响应归一化、空结果和非法响应。
- 使用注入的 HTTP 客户端测试超时、取消、429/5xx 和单来源失败。
- 测试数据库迁移、来源 upsert、缓存命中和手动封面保护。
- 测试导入流程：音乐复制成功时，元数据失败仍返回成功；匹配成功时保存来源和本地封面。
- 测试图片下载的扩展名、内容类型、大小限制、临时文件清理和路径越界保护。
- 完成后运行完整 Vitest、`npx tsc --noEmit`、`npm run build` 和 Windows 打包验证。

## 实现验证

- `npm test`：48 个测试文件、261 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run verify:resources`：通过。
- `npm run build`：通过，主进程、preload 和 renderer 均成功构建。
- `npm run package:win`：退出码为 0；已核对 `release-v13/win-unpacked/NatsumeMusic.exe` 与 x64 NSIS 安装包均已生成。
- 针对实际运行反馈新增回归：移除 VNDB 当前 API 不支持的 `rank` 请求字段；保留上游错误正文；旧游戏启动后自动补查；导入完成页保留可见的资料/封面结果；常见日文发行版后缀（包括“～追憶～”）可回退匹配基础条目；Bangumi 返回的旧式 HTTP 图片地址会在下载前升级为 HTTPS。

实现使用的官方接口文档：[VNDB Kana API](https://api.vndb.org/kana) 与 [Bangumi API OpenAPI](https://raw.githubusercontent.com/bangumi/api/master/open-api/v0.yaml)。

## 明确不做的事项

- 不直接抓取 VNDB/Bangumi 网页 HTML。
- 不把远程图片 URL 直接交给渲染器长期显示。
- 不在本次功能中实现用户登录、VNDB token 或 Bangumi OAuth；公开读取失败时保持可用，并保留后续增加凭据设置的扩展点。
- 不自动修改用户填写的游戏名称或原始游戏目录。
