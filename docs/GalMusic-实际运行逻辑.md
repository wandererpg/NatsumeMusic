# NatsumeMusic 实际运行逻辑与代码地图

> 本文档以当前工作区源码为准，记录 NatsumeMusic 的真实运行方式、数据流、文件布局和现有实现边界。原有的 `GalMusic-设计文档.md` 是目标设计规格；若两者不一致，以本文和源码为准。
>
> 核对日期：2026-08-23（Asia/Shanghai）

## 1. 一句话概括

NatsumeMusic 是一个 Windows 离线音乐库与播放器：用户选择游戏目录，主进程扫描普通音频并可调用 GARbro 解包资源，将音频复制到独立音乐库；SQLite 保存游戏、曲目、播放列表和设置；React 渲染进程通过 preload 暴露的白名单 API 查询库并用 Howler 播放受保护的音频协议。

核心原则是：

- 原游戏目录只读，导入时复制文件，不依赖游戏继续存在。
- 主进程拥有文件系统、SQLite、解包和 IPC 权限。
- 渲染进程没有 Node.js 文件系统权限，只能使用 `window.galMusic`。
- 音频播放发生在渲染进程，但音频字节由主进程的 `galmusic-audio://` 协议提供。
- 数据库中的显示名称、文件路径、收藏状态等和实际复制文件分别管理。

## 2. 当前验证状态

当前工作区已验证：

| 检查 | 结果 |
| --- | --- |
| `npm test` | 42 个测试文件、205 个测试全部通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run build` | main、preload、renderer 均构建通过 |
| `node scripts/verify-resources.mjs` | 通过，当前 `resources/tools` 中的 GARbro 资源完整 |

测试通过代表自动化契约成立，不等于已经完成带真实游戏资源的人工验收。真实 `.xp3`、`.rpa`、`.arc`、`.pak` 和 SM2MPX 文件仍应在 Windows 环境中抽样验证。

## 3. 总体架构

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Electron 主进程                                                     │
│                                                                     │
│  bootstrapMainProcess                                               │
│   ├─ SQLite / migrations                                            │
│   ├─ 元数据回填与旧音乐库布局迁移                                   │
│   ├─ DatabaseLibraryService                                         │
│   ├─ Importer → Scanner / Extractor / Copy / Metadata               │
│   ├─ IPC handlers                                                    │
│   └─ audio://、cover://、background:// 安全本地资源协议             │
│                                                                     │
├──────────────────── preload contextBridge ──────────────────────────┤
│  只暴露 GalMusicAPI；不暴露 ipcRenderer、fs、path 或其他 Node API     │
├─────────────────────────────────────────────────────────────────────┤
│ React 渲染进程                                                       │
│  App → Sidebar / TrackTable / ScanDialog / Settings / PlayerBar      │
│  Zustand libraryStore / uiStore / playerStore                       │
│  PlayerEngine → Howler → galmusic-audio://                           │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.1 进程职责

#### 主进程

入口是 [`src/main/index.ts`](../src/main/index.ts)。它负责：

1. 等待 Electron 就绪。
2. 打开用户数据目录下的 `galmusic.db`。
3. 初始化默认音乐库路径，规范化旧的 `%USERPROFILE%` 配置。
4. 回填旧曲目的元数据，迁移旧音乐库目录结构。
5. 创建数据库库服务和导入服务。
6. 注册音频、封面、自定义背景协议及全部 IPC handler。
7. 创建一个无边框、开启沙箱的 BrowserWindow。

#### Preload

入口是 [`src/preload/index.ts`](../src/preload/index.ts)。它把 IPC 调用封装成类型化 API，并将未知错误转换成可跨隔离世界传递的 `{ code, userMessage }` 对象。

#### 渲染进程

入口是 [`src/renderer/src/main.tsx`](../src/renderer/src/main.tsx)，根组件是 [`src/renderer/src/App.tsx`](../src/renderer/src/App.tsx)。它只处理界面状态、查询请求和播放器控制，不直接读写音乐文件。

## 4. 启动时序

```text
Electron app.whenReady()
        │
        ▼
openDatabase(userData/galmusic.db)
        │  WAL + busy_timeout + migrations
        ▼
设置 library_path（新用户默认 app.getPath('music')/NatsumeMusic；检测到旧 GalMusic 目录时继续沿用）
        │
        ├─ normalizeLibraryPath（展开环境变量、兼容旧路径）
        ├─ backfillMissingTrackMetadata（补 duration/title）
        └─ migrateLibraryLayout（旧文件移动到 音乐/语音）
        │
        ▼
创建 importer + database library service
        │
        ├─ registerAudioProtocol
        ├─ registerCoverProtocol
        ├─ registerLibraryHandlers
        ├─ registerScanHandlers
        ├─ registerDialogHandlers
        └─ registerWindowHandlers
        │
        ▼
createMainWindow() → renderer
        │
        ├─ 读取设置
        ├─ 读取游戏和播放列表
        ├─ 初始化播放器（恢复音量/模式，不自动播放）
        └─ 根据当前选择加载曲目
```

数据库连接在 `before-quit` 时关闭。窗口关闭不会删除音乐文件或数据库。

## 5. 代码地图

| 目录/文件 | 实际职责 |
| --- | --- |
| `src/shared/types.ts` | Game、Track、Playlist、Scan、Player、Settings 等跨进程类型 |
| `src/shared/ipc.ts` | IPC channel 常量、`GalMusicAPI` 接口、事件载荷类型 |
| `src/shared/paths.ts` | 默认路径、Windows 目录名清理、根目录 containment 校验 |
| `src/shared/errors.ts` | `AppError`、错误码和 IPC 安全序列化 |
| `src/shared/audio-url.ts` / `cover-url.ts` | 协议 URL 编码与解析 |
| `src/main/database/connection.ts` | SQLite 路径、连接、WAL 和迁移入口 |
| `src/main/database/migrations.ts` | schema version 1–4、表和索引 |
| `src/main/database/queries/*` | games、tracks、playlists、settings 的 SQL CRUD |
| `src/main/services/scanner.ts` | 普通目录递归、音频筛选、sidecar 标题、元数据和 MD5 |
| `src/main/services/scanner-worker.ts` | 可独立运行的 worker scanner 封装；当前生产导入链路没有接入它 |
| `src/main/services/importer.ts` | 扫描、解包、分类、去重、复制和 SQLite 持久化的总编排器 |
| `src/main/services/extractor.ts` | 临时目录、RPA/GARbro/Probe 解包及取消清理 |
| `src/main/services/garbro-runner.ts` | 无 shell 参数数组启动外部 GARbro，并处理输出、退出码和日志 |
| `src/main/services/file-copy.ts` | 流式复制及 OWP 解码复制 |
| `src/main/services/owp.ts` | Anemoi OWP 的 XOR 0x39 解码为 OGG 流 |
| `src/main/services/metadata.ts` | `music-metadata` 解析 duration、container 和嵌入标题 |
| `src/main/services/track-classification.ts` | 音乐/语音阈值分类 |
| `src/main/services/library-layout.ts` | `音乐`/`语音`目录、冲突文件名分配 |
| `src/main/services/library-layout-migration.ts` | 启动时迁移旧的未分类曲目 |
| `src/main/services/bulk-track-service.ts` | 批量收藏、加入列表、移动和删除，含文件/数据库回滚 |
| `src/main/services/audio-protocol.ts` | 只允许音乐库内音频，支持 Range 请求 |
| `src/main/services/cover-protocol.ts` | 只允许音乐库内图片 |
| `src/main/ipc/*` | 参数校验、对话框、库、扫描和窗口命令的 handler |
| `src/renderer/src/stores/*` | 库查询、UI 选择、播放状态的 Zustand store |
| `src/renderer/src/player/PlayerEngine.ts` | Howler 生命周期、队列、模式和时间更新 |
| `src/renderer/src/components/*` | React 视图、编辑器、扫描界面、批量操作和播放器栏 |
| `scripts/*` | Electron 测试启动器、资源校验 |
| `resources/tools/*` | GARbro 资源和 RPA bridge；打包时作为 extraResources 携带 |

## 6. 数据库模型

当前 schema version 是 4。数据库文件位于 Electron 的 user data 目录：

```text
<userData>/galmusic.db
```

### 6.1 表

| 表 | 关键字段 | 用途 |
| --- | --- | --- |
| `games` | `id`, `name`, `cover_path`, `created_at`, `updated_at` | 游戏/作品分组。`name` 是显示名，不一定等于磁盘目录名 |
| `tracks` | `id`, `game_id`, `file_path`, `file_name`, `custom_name`, `duration`, `kind`, `format`, `file_size`, `file_hash`, `track_number`, `is_favorite` | 已复制曲目和播放所需元数据 |
| `playlists` | `id`, `name`, `created_at` | 用户创建的播放列表 |
| `playlist_tracks` | `playlist_id`, `track_id`, `position` | 播放列表与曲目的多对多关系，按 position 排序 |
| `settings` | `key`, `value` | 所有设置按字符串保存 |
| `schema_migrations` | `version`, `applied_at` | 迁移记录 |

`tracks.kind` 只能是 `music` 或 `voice`。删除游戏或曲目时，SQLite 外键级联删除关联记录；主进程启动时开启 `foreign_keys = ON`。

### 6.2 对外 Track 映射

SQL 查询会把数据库字段映射成前端对象：

```text
customName 为空 → displayName = fileName
customName 非空 → displayName = customName
is_favorite 0/1 → isFavorite false/true
g.name       → gameName
```

因此，修改歌曲名称只改 `custom_name`，不会改动实际文件名；移动曲目只改归属游戏、路径和文件名，不会丢失标题、时长、收藏等元数据。

### 6.3 设置

实际读取的设置包括：

- `library_path`
- `volume`
- `play_mode`
- `last_track_id`
- `voice_threshold_seconds`
- 可选的 `window_width`、`window_height`

旧 schema 中的 `theme` 字段已由当前 `theme_id` 外观设置取代，设置面板可以即时预览并保存主题。窗口尺寸字段已定义，但当前启动流程仍没有把窗口尺寸持久化为用户设置。

## 7. IPC 边界

所有请求 channel 在 [`src/shared/ipc.ts`](../src/shared/ipc.ts) 定义，preload 只暴露对应方法。

### 7.1 请求

| Channel | 作用 | 真实返回/行为 |
| --- | --- | --- |
| `scan:start` | 开始异步导入 | 立即返回 `requestId`；结果通过 `scan:result` 推送 |
| `scan:cancel` | 取消导入 | 触发匹配的 `AbortController` |
| `library:get-games` | 读取游戏列表 | 包含 `trackCount` 和推导出的 `folderPath` |
| `library:get-tracks` | 按 section/game/playlist/search/kind 查询 | 返回 Track 数组 |
| `library:add-tracks` | 将选中的音频加入已有游戏 | 当前服务逐个调用 importer，使用 `deepScan: false` |
| `library:update-track` | 改显示名、编号或收藏 | 返回更新后的 Track |
| `library:delete-track` | 删除单曲数据库记录并尽力删除库内文件 | 删除文件失败不会让数据库行恢复 |
| `library:search` | 全库搜索 | 返回搜索后的 Track 数组 |
| `library:get-playlists` | 读取播放列表及曲目数 | 返回 Playlist 数组 |
| `library:create-playlist` | 创建播放列表 | 返回新 Playlist |
| `library:delete-playlist` | 删除播放列表 | 级联删除关系 |
| `library:add-track-to-playlist` | 添加一首曲目 | 重复添加会被忽略 |
| `library:remove-track-from-playlist` | 移除一首曲目 | 删除关联行 |
| `library:update-game` | 重命名游戏、设置/清除封面 | 可能移动整个游戏目录并同步曲目路径 |
| `library:delete-game` | 删除游戏 | 先暂存目录，再事务删除记录，成功后删除暂存目录 |
| `library:bulk-update-tracks` | 批量收藏、列表、移动、删除 | 返回成功 ID 和逐条失败原因 |
| `dialog:select-folder` | 选择目录 | 返回路径或 null |
| `dialog:select-files` | 选择音频文件 | 支持多选，包含 `.owp` |
| `dialog:select-image` | 选择封面图片 | 只接受 PNG/JPG/WEBP/GIF |
| `shell:open-explorer` | 用资源管理器打开路径 | 主进程调用 `shell.openPath` |
| `app:get-settings` / `app:set-setting` | 读写设置 | 值在 IPC 层以字符串传输 |
| `window:minimize` / `window:toggle-maximize` / `window:close` | 无边框窗口控制 | 只操作发送请求的窗口 |

### 7.2 推送事件

| Event | 作用 |
| --- | --- |
| `scan:progress` | 扫描、解包、复制阶段进度和当前文件 |
| `scan:result` | `{ requestId, result }` 或 `{ requestId, error }` |
| `player:state-change` | 已定义并由 preload 订阅，但当前实际播放状态由渲染进程 Zustand 管理，主进程没有播放器 handler |
| `player:time-update` | 同上，当前由 Howler 的 250ms 定时器在渲染进程更新 |
| `player:error` | 同上，当前 Howler 错误通过 PlayerEngine 回调进入 store |

IPC handler 会在调用服务前检查参数数量、类型、未知字段、路径格式、游戏名和语音阈值，避免把任意 renderer 输入直接交给文件系统或 SQL。

## 8. 导入流程

导入总编排位于 [`src/main/services/importer.ts`](../src/main/services/importer.ts)。

```text
选择源目录 + 游戏名 + 深度扫描 + 是否导入语音 + 阈值
                         │
                         ▼
创建 <library>/<安全游戏目录>
                         │
                         ▼
scanFolder：递归普通目录，筛选音频，读取 metadata，读取 sidecar，计算 MD5
                         │
             deepScan？ ─┴─ 否 → 直接进入候选曲目
                 │ 是
                 ▼
walkArchives：找 .xp3/.rpa/.arc/.pak 和 extensionless SM2MPX
                 │
                 ▼
逐个解包到临时目录 → 再次 scanFolder → 合并候选曲目
                         │
                         ▼
按 duration 分类 music/voice
                         │
                         ▼
MD5 去重（数据库已有 + 本次导入已见）
                         │
                         ▼
分配不冲突的目标文件名 → 流式复制 → 单条 SQLite transaction
                         │
                         ▼
删除所有归档临时目录，返回 found/extracted/copied/skipped/errors
```

### 8.1 普通扫描

`scanFolder` 的行为：

1. 将源路径规范化成绝对路径。
2. 源路径可以是单个文件，也可以是目录。
3. 目录始终递归；`deepScan` 不会阻止普通子目录中的音频被发现。
4. 跳过符号链接和特殊文件，避免循环或逃逸用户选择的目录。
5. 只接受以下音频扩展名，大小写不敏感：

   ```text
   .ogg .mp3 .wav .flac .m4a .aac .opus .wma .owp
   ```

6. 扫描前先读取同目录的 `.cue`、`.m3u`、`.m3u8` sidecar，给没有嵌入标题的文件补显示标题。
7. 每个候选文件读取大小、尽力解析元数据，并用流式 MD5 计算哈希。
8. 单个子目录或文件读取失败会进入 `errors` 并继续；源根目录读取失败则使整个导入失败。

### 8.2 元数据与标题优先级

标题优先级为：

```text
嵌入音频标签 title
        ↓ 没有
CUE/M3U/M3U8 sidecar 标题
        ↓ 还没有
文件名（displayName 的最终回退值）
```

嵌入标题或 sidecar 标题会写入 `custom_name`，实际复制文件仍保留原文件名。`music-metadata` 解析失败不会阻止导入，duration 可以为空，format 回退到文件扩展名。

### 8.3 音乐/语音分类

分类函数是 [`src/main/services/track-classification.ts`](../src/main/services/track-classification.ts)：

```text
duration > voiceThresholdSeconds → music
duration <= voiceThresholdSeconds → voice
duration 不可识别              → voice
```

默认阈值是 25 秒，允许用户设置 1–60 秒的小数。扫描窗口默认关闭“导入语音”；关闭时，分类为 voice 的候选会被跳过。`includeVoice` 还会影响 extensionless SM2MPX 容器：`WMSC` 作为音乐处理，`VOICE*` 只有打开导入语音后才会解包。

### 8.4 去重与重复导入

- 去重键是完整文件 MD5，而不是文件名。
- 先查数据库中已有的 `file_hash`，再查本次导入过程中的 `seenHashes`。
- 重复文件不再次复制，计入 `skipped`。
- 如果旧记录没有标题而本次发现了标题，或旧记录没有 duration 而本次发现了 duration，会刷新元数据。
- 如果刷新 duration 后 music/voice 分类发生变化，已有库内文件会被移动到新的分类目录，同时更新数据库路径。

### 8.5 复制与失败恢复

普通文件使用 `createReadStream`/`createWriteStream` 流式复制，不把大音频整体读入内存。目标文件名冲突时使用：

```text
track.ogg
track (1).ogg
track (2).ogg
```

每复制一个候选文件后立即开启一条小事务插入 `tracks`。后续文件失败不会回滚前面已经成功的曲目；当前候选复制失败时会删除不完整目标文件。取消信号会停止继续处理并尽力删除当前目标文件。

## 9. 归档与特殊格式

### 9.1 归档发现

当前实际支持的扩展名只有：

```text
.xp3 .rpa .arc .pak
```

旧设计文档提到的 `.dat` 不在当前 `ARCHIVE_EXTENSIONS` 中。无扩展名文件只有在文件头符合 `SM2MPX10` 时才会被识别：偏移 16–28 的容器名为 `WMSC` 时归为音乐，`VOICE*` 时归为语音，其他容器不导入。

对《家族計画 ～追憶～》目录的实测：选择整个游戏目录后，深度扫描发现无扩展名 `WMSC`；`GARbro.Probe.exe WMSC` 可退出成功并解出 27 个 `.ogg`。`VOICE1`、`VOICE2` 只有打开“导入语音”后才会解包，`SE`、`GGD`、`GGD2`、`ISF`、`DATA` 不作为音乐容器导入。

因此用户不需要重命名或手动解包文件：在“导入游戏音乐”中选择游戏根目录，保持“深度扫描归档”开启即可；只导入音乐时保持“导入语音”关闭。应用会将解包结果放入临时目录，原始游戏目录保持不变。

### 9.2 解包工具选择

| 输入 | 实际工具路径/参数 |
| --- | --- |
| `.rpa` | 先启动 `resources/tools/extract-rpa.mjs`；当前 bridge 是轻量失败回退桥，通常转交 GARbro；失败后调用 GARbro |
| `.xp3` | 若存在，使用 `GARbro.Xp3Bridge.exe <archive>`，用于非交互方案选择 |
| `.arc` / `.pak` | 使用 `GARbro.Console.exe -x <archive>`，工作目录为临时输出目录 |
| extensionless SM2MPX | 使用 `GARbro.Probe.exe <archive>`，不附加 `-x` |

解包由 [`src/main/services/extractor.ts`](../src/main/services/extractor.ts) 创建唯一临时目录。GARbro runner 使用参数数组而不是 shell 字符串，监听 stdout/stderr，检查退出码、错误诊断和输出文件数；失败、取消或复制结束后都会清理临时目录。GARbro 日志写入 user data 下的 `logs/garbro.log`。

### 9.3 OWP

`.owp` 是导入候选格式，不是最终库格式。[`src/main/services/owp.ts`](../src/main/services/owp.ts) 先验证 XOR 解码后是否为 `OggS`，然后以流方式将每个字节与 `0x39` 异或，目标文件改名为 `.ogg`。数据库中的 format、播放器传给 Howler 的 format 也以最终 `.ogg` 为准。

## 10. 音乐库磁盘布局

实际目录为：

```text
<library_path>/
└─ <sanitizeDirectoryName(game.name)>/
   ├─ 音乐/
   │  ├─ track.ogg
   │  └─ track (1).ogg
   ├─ 语音/
   │  └─ line.mp3
   └─ .cover.png
```

规则：

- `games.name` 保留用户输入用于界面显示。
- 写磁盘时用 `sanitizeDirectoryName` 替换 Windows 非法字符，并处理 `CON`、`PRN` 等保留设备名。
- 游戏名在 IPC 层还禁止路径分隔符、`.` 和 `..`。
- 音乐和语音用独立子目录隔离。
- 封面复制到游戏目录内的 `.cover.<ext>`，不保存源图片路径作为唯一依赖。
- 同一个游戏目录内不覆盖已有文件。
- 设置音乐库路径只更新设置值；真正的旧库迁移在下次启动的布局迁移流程中按当前配置处理，不会在设置保存动作里自动搬运整库。

## 11. 音频与封面安全访问

渲染进程不会收到直接的 `file://` 音频路径，而是得到：

```text
galmusic-audio://local?path=<urlencoded absolute path>
galmusic-cover://local?path=<urlencoded absolute path>
```

主进程协议 handler 会：

1. 解析协议参数。
2. 检查路径是绝对路径且扩展名在允许集合内。
3. 检查路径位于当前音乐库根目录内。
4. 音频请求支持 HTTP Range，方便 Howler/HTML5 Audio 拖动进度和流式读取。
5. 封面只允许 PNG、JPG、JPEG、WEBP、GIF。

`assertWithin` 使用 `path.relative` 判断 containment，避免把 `game-old` 误判成 `game` 的子路径。批量移动/删除另外会解析 realpath，防止库内符号链接把文件操作引到音乐库外。

## 12. 库服务与管理操作

数据库库服务在 [`src/main/index.ts`](../src/main/index.ts) 的 `createDatabaseLibraryService` 中创建，并通过 mutation queue 串行化会修改文件或数据库的操作。

### 12.1 查询范围

`library:get-tracks` 的 `TrackQuery` 支持：

- `library`：可按 `gameId`、搜索词和 `kind` 查询。
- `recent`：全库按创建时间倒序。
- `favorites`：只读收藏曲目，按最近添加倒序。
- `playlists`：按 playlist position 返回，可进一步按曲名、文件名和游戏名过滤。

普通曲目默认按 `track_number`、文件名和 ID 排序。搜索匹配文件名、custom name 和游戏名。

### 12.2 重命名游戏与封面

更新游戏名称时：

1. 计算旧的游戏目录和新的安全目录名。
2. 目标目录不存在时移动整个目录；若冲突则拒绝。
3. 在一条数据库事务中更新游戏名、所有曲目路径和封面路径。
4. 新封面先复制到新目录的 `.cover.<ext>`。
5. 数据库成功后删除旧封面；出错时尽力恢复目录和新封面。

### 12.3 删除游戏和曲目

删除游戏会先把整个游戏目录改名到库根目录下的临时 `.galmusic-delete-<uuid>`，然后事务删除数据库记录；数据库失败时尝试改回原目录，数据库成功后再递归删除暂存目录。

单曲删除先删数据库记录，再尽力删除库内文件；批量删除使用暂存目录、数据库事务和逐条恢复报告，安全性更高。批量操作返回：

```ts
{
  succeededIds: string[],
  failures: { trackId: string, userMessage: string }[]
}
```

批量移动会按目标游戏的 `音乐`/`语音`分类目录移动文件，同时更新 `game_id`、`file_path`、`file_name`，保留其他曲目元数据。批量删除可以选择“只从库移除”或“同时删除硬盘文件”。

## 13. React 界面与状态流

### 13.1 初始化和查询

`App` 挂载后：

1. 读取设置。
2. 加载 games 和 playlists。
3. 初始化 playerStore；恢复音量、播放模式和最后曲目 ID，但不自动播放。
4. 如果没有游戏，显示 Welcome 页面。
5. 当 section、游戏、播放列表、搜索词或音乐/语音筛选变化时，等待 120ms 后调用 `loadTracks`。
6. 请求使用递增序号，旧请求返回时不会覆盖新查询结果。

### 13.2 主要 UI 功能

- 左侧按全部音乐、最近添加、收藏、播放列表切换。
- 游戏条目显示封面/首字母和曲目数量。
- 游戏详情可以编辑显示名、封面和删除整个音乐文件夹。
- 曲目可以播放、改显示名、收藏、加入/移出播放列表、打开文件夹、从库删除。
- 选中具体游戏后才启用多选、Shift 范围选择和批量操作。
- 超过视口的曲目使用固定行高虚拟列表，不一次挂载全部行。
- 导入窗口是文件夹优先流程，自动打开一次原生文件夹选择器。
- 设置面板保存音乐库路径、默认音量和播放模式。

### 13.3 播放器

播放器由 [`PlayerEngine`](../src/renderer/src/player/PlayerEngine.ts) 和 `playerStore` 组成：

```text
TrackRow 双击/播放按钮
        ▼
playerStore.playTrack(track, 当前曲目列表)
        ▼
PlayerEngine.setQueue / Howl
        ▼
Howl({ src: [galmusic-audio://...], html5: true, format, volume })
        ▼
每 250ms 读取 duration/seek → Zustand → PlayerBar
```

支持四种模式：

- `sequential`：到队尾停止。
- `random`：下一曲不会选择当前曲目；队列只有一首时按模式决定停止或重播。
- `single-loop`：当前曲目结束后 seek 到 0 并重新播放。
- `list-loop`：队尾回到第一首。

播放器会在 Howl 切换时卸载旧实例，避免旧文件句柄和事件继续存在。当前曲目 ID、音量和播放模式会通过 `app:set-setting` 持久化；重启只恢复偏好，不自动播放。

当批量移动或删除正在播放的曲目时，App 会用刷新后的路径重建队列；当前曲目删除成功后会停止并清空播放器，操作失败则保留原播放状态。

## 14. 错误、取消和恢复

统一错误类型是 [`src/shared/errors.ts`](../src/shared/errors.ts) 的 `AppError`，当前错误码包括：

```text
FILE_NOT_FOUND
PERMISSION_DENIED
EXTRACT_FAILED
UNSUPPORTED_FORMAT
DB_ERROR
DUPLICATE_TRACK
PLAYBACK_ERROR
CANCELLED
```

渲染进程只接收 `userMessage` 和 `code`，不会跨 IPC 传递 Error prototype 或 stack。扫描中的非致命错误会进入 `ScanResult.errors`；根路径不存在、取消、无法建立关键服务等错误会通过 `scan:result.error` 返回。

扫描取消由 `requestId → AbortController` 管理。扫描、归档子进程、流式复制和临时目录清理都检查取消信号；GARbro/RPA 子进程取消时会尽力 kill，关闭回调负责最终 settle。

## 15. 开发、构建和打包

### 15.1 常用命令

```powershell
npm install
npm run dev
npm test -- --run
node_modules\.bin\tsc.cmd --noEmit
npm run build
node scripts/verify-resources.mjs
npm run package:win
```

`postinstall` 和 `predev` 会用 `electron-rebuild` 为 Electron 31.7.7 重编译 `better-sqlite3`。

### 15.2 打包结构

`electron-builder.yml` 配置：

- 应用 ID：`com.galmusic.app`
- Windows x64 NSIS
- `out` 和 `package.json` 放入 asar
- `better-sqlite3` 解包
- `resources/tools` 作为 `extraResources` 复制到安装包的 `resources/tools`
- 使用 `build/icon.ico`

资源校验要求这些文件存在且非空：

```text
GARbro.exe
GARbro.Console.exe
GARbro.Xp3Bridge.exe
GARbro.Probe.exe
ArcFormats.dll
GameData/Formats.dat
extract-rpa.mjs
```

当前工作区的 `node scripts/verify-resources.mjs` 已通过。GARbro 的二进制是外部工具，本项目源码只负责启动和解释结果。

## 16. 设计文档与当前实现的差异

以下项目出现在旧设计或目标规格中，但当前源码的实际情况不同：

1. **播放不是主进程服务。** 目标设计提到主进程 Player Service；当前 Howler 和完整播放状态都在 renderer，主进程只提供音频协议。
2. **`scanner-worker.ts` 尚未接入生产导入流程。** 当前 importer 直接调用 `scanFolder`；worker 文件保留了可测试的 worker 封装，但没有被主进程导入。
3. **当前归档集合不含 `.dat`。** 实际 `ARCHIVE_EXTENSIONS` 是 `.xp3/.rpa/.arc/.pak`。
4. **RPA bridge 不是完整 RPA 解码器。** `extract-rpa.mjs` 会验证参数和文件存在，然后以失败状态让 extractor 回退到 GARbro。
5. **手动文件选择 API 已存在，但主界面当前是文件夹优先。** preload 和 service 支持 `selectFiles`/`addTracks`，但当前 `App` 没有把它们作为独立入口接入 UI。
6. **拖拽、系统托盘、媒体键、在线元数据和波形没有当前实现。** 当前程序坚持离线，不包含 VGMdb 等联网模块。
7. **统计服务不是完整目标接口。** 数据库有游戏/曲目计数查询，但当前共享 API 没有独立的 `getStats` IPC。
8. **设置音乐库路径不会立即搬迁整库。** 设置保存只是写入 `library_path`；旧路径修复和布局迁移发生在启动阶段。
9. **旧的 `docs/verification.md` 记录曾描述 GARbro 缺失。** 当前实际资源校验已经通过，应以本次命令结果为准。

这些是实现现状，不是未经确认的修改方案。后续提出功能变更时，应先判断它属于导入、库管理、IPC、安全边界、播放器、UI 或打包哪一层，再补对应测试。

## 17. 后续修改的落点指南

| 提议类型 | 首要修改位置 | 必须同步检查 |
| --- | --- | --- |
| 新音频/归档格式 | `formats.ts`、`extractor.ts`、`garbro-runner.ts`、`importer.ts` | scanner、资源校验、导入测试、播放器 MIME/format |
| 导入选项或分类 | `types.ts`、`scan-handlers.ts`、`ScanDialog.tsx`、`track-classification.ts` | IPC 校验、导入结果、迁移和设置回填 |
| 文件库布局 | `library-layout.ts`、`importer.ts`、`library-layout-migration.ts` | audio/cover protocol、rename/move/delete 回滚 |
| 游戏/曲目 CRUD | database queries、`createDatabaseLibraryService`、library handlers、libraryStore | SQLite 事务、路径安全、队列和 UI 刷新 |
| 批量操作 | `bulk-track-service.ts`、`Bulk*` components、`App.tsx` | 文件回滚、并发串行、播放队列路径刷新 |
| 播放行为 | `PlayerEngine.ts`、`playerStore.ts`、`PlayerBar.tsx` | Howler lifecycle、模式、时间比例、重启偏好 |
| 新界面 | `App.tsx`、对应 components、`globals.css` | renderer 测试、键盘/无障碍、虚拟列表 |
| 新主题或背景行为 | `theme/themes.ts`、`theme/appearance.ts`、`SettingsPanel.tsx`、`globals.css` | settings 规范化、背景协议授权、主题 CSS 契约 |
| 打包和外部工具 | `electron-builder.yml`、`verify-resources.mjs`、`resources/tools` | Windows x64 构建和资源校验 |

具体修改前应先把提议转成可验证的行为：输入是什么、数据库/文件应如何变化、失败时是否回滚、UI 应显示什么，以及需要新增或调整哪些测试。

## 18. 多主题与全局自定义背景

### 18.1 主题注册与应用

主题清单位于 [`src/renderer/src/theme/themes.ts`](../src/renderer/src/theme/themes.ts)。当前支持：

```text
rain-afterglow    雨夜青岚（默认，原 A）
neon-terminal     霓虹终端（C）
amber-film        琥珀胶片（D）
aquarium-glass    海月玻璃（E）
record-shop       唱片番台（F）
velvet-theatre    绯幕金声（G）
scrapbook-diary   音乐手帐（H）
```

B「月白樱纸」没有进入实现。`App` 把当前主题写入根节点的 `data-theme`；[`globals.css`](../src/renderer/src/styles/globals.css) 用七组语义令牌控制底色、面板、文字、强调色、边线、阴影、圆角和字体，再用少量主题专属规则添加网格、胶片颗粒、磨砂玻璃、直角唱片排版、剧院装饰或手帐虚线。组件结构和功能逻辑不随主题复制。

### 18.2 设置读取、预览与保存

`AppSettings` 的外观部分由 `themeId` 和 `background` 组成。主进程 [`src/main/services/settings.ts`](../src/main/services/settings.ts) 从现有字符串型 `settings` 表读取字段，主题值通过白名单验证，数值按允许范围钳制；旧数据库缺少字段时自动使用 A 主题和默认背景参数。

设置面板中的修改分为两个状态：已保存的 `settings` 是关闭设置后仍然生效的值，`appearancePreview` 是面板打开时的即时预览草稿。主题、模糊、遮罩、缩放和焦点位置先更新草稿；取消时清除主进程临时授权并恢复已保存值；保存时通过专用 `app:save-settings` 在一个 SQLite 事务中写入全部用户设置。背景设置与主题分开存储，所以切换主题不会重置用户图片和参数。

### 18.3 自定义背景渲染

[`src/renderer/src/theme/appearance.ts`](../src/renderer/src/theme/appearance.ts) 把背景设置转换成根节点 CSS 属性：

```text
--user-background-image
--user-background-blur
--user-background-dim
--user-background-scale
--user-background-position
```

`.app-shell__user-background` 独立负责图片、焦点、缩放和模糊，`.app-shell__background-shade` 独立负责遮罩。两层都在标题栏、侧栏、曲目区和播放器下方，因此模糊滤镜不会影响文字与按钮。

### 18.4 背景图片安全协议

用户选择的背景可能位于音乐库外，不能复用只允许音乐库内部文件的 `galmusic-cover://`。新增的 [`src/main/services/background-protocol.ts`](../src/main/services/background-protocol.ts) 注册 `galmusic-background://`：只接受绝对路径和 PNG/JPG/JPEG/WEBP/GIF，请求路径必须与当前 `background_image_path` 完全一致。其他图片路径返回 403，非法格式返回 400，读取失败返回 404。

主进程文件选择器会把用户刚选中的路径放进仅驻留内存的临时授权，数据库不会因预览而改变。保存时只有“当前已保存路径”或“主进程刚授权的路径”能进入事务；取消时清除临时授权。通用 `app:set-setting` 使用严格键白名单，并明确禁止修改背景路径。URL 编解码集中在 [`src/shared/background-url.ts`](../src/shared/background-url.ts)，渲染进程仍然不能使用 `file://`，也拿不到 `fs`、`path` 或原始 `ipcRenderer`。
