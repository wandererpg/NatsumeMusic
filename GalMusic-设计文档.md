# GalMusic — Galgame 音乐管理播放器 设计文档

> **文档目的**：本文档是为 GPT/Claude 等 AI 编程助手编写的完整设计规格。  
> **读者**：AI 编程助手（实现者）  
> **最后更新**：2026-07-27  
> **版本**：v1.0

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [项目架构](#3-项目架构)
4. [核心模块设计](#4-核心模块设计)
5. [数据库设计](#5-数据库设计)
6. [UI 设计](#6-ui-设计)
7. [扫描与提取流程](#7-扫描与提取流程)
8. [播放器功能](#8-播放器功能)
9. [文件组织与打包](#9-文件组织与打包)
10. [开发路线图](#10-开发路线图)
11. [实现注意事项](#11-实现注意事项)

---

## 1. 项目概述

### 1.1 痛点
用户玩完 galgame 后会删除游戏本体，但希望保留游戏配乐随时聆听。目前的做法是手动在各游戏文件夹中翻找 `.ogg`/`.mp3` 文件，效率低下且容易遗漏。

### 1.2 目标
打造一款 **Windows 桌面应用**，集「自动提取 galgame 配乐」+「音乐库管理」+「精美播放器」于一体。

### 1.3 核心功能清单

| 编号 | 功能 | 优先级 | 说明 |
|------|------|--------|------|
| F1 | 扫描提取 | P0 | 选择 galgame 文件夹，自动扫描并提取所有音频文件到音乐库 |
| F2 | 解包支持 | P0 | 自动识别 .xp3/.rpa/.arc 等归档文件并解包提取 |
| F3 | 手动导入 | P1 | 支持拖拽/浏览添加单个或批量音频文件 |
| F4 | 音乐播放 | P0 | 播放/暂停、上/下一曲、进度条拖拽、音量控制 |
| F5 | 播放模式 | P0 | 顺序播放、随机播放、单曲循环、列表循环 |
| F6 | 重命名 | P1 | 自定义歌曲显示名称（不改变文件名） |
| F7 | 按游戏浏览 | P0 | 左侧游戏列表 → 右侧曲目列表，按游戏名分类 |
| F8 | 搜索 | P1 | 按曲名/游戏名模糊搜索 |
| F9 | 播放列表 | P2 | 创建自定义播放列表 |
| F10 | 封面显示 | P2 | 每个游戏可设置封面图 |
| F11 | 系统托盘 | P2 | 最小化到托盘，托盘控制播放 |
| F12 | 媒体键 | P2 | 响应键盘媒体键（播放/暂停/上/下一曲） |

### 1.4 非功能需求
- **仅支持 Windows 10/11**（不跨平台，降低复杂度）
- **安装包 < 200MB**
- **内存占用 < 300MB**（空闲时 < 150MB）
- **纯本地运行**，不依赖网络

---

## 2. 技术栈

### 2.1 核心框架

| 层级 | 技术 | 版本 | 理由 |
|------|------|------|------|
| 桌面框架 | Electron | ^31.x | 用户选择，Web 技术 UI 最灵活 |
| 前端框架 | React | ^18.x | 生态最丰富，社区最大 |
| 构建工具 | Vite | ^5.x | 快，Electron 支持好 |
| 语言 | TypeScript | ^5.x | 类型安全，减少运行时错误 |
| 样式 | Tailwind CSS | ^3.x | 快速构建自定义 UI |
| 状态管理 | Zustand | ^4.x | 轻量，比 Redux 简单 |
| 音频播放 | Howler.js | ^2.x | 成熟稳定，支持所有主流格式 |
| 数据库 | better-sqlite3 | ^11.x | 同步 API，Electron 主进程最佳选择 |
| 打包 | electron-builder | ^24.x | Windows NSIS 安装包 |

### 2.2 开发依赖

```json
{
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.0.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.0.0",
    "autoprefixer": "^10.0.0"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "zustand": "^4.0.0",
    "howler": "^2.2.0",
    "better-sqlite3": "^11.0.0",
    "music-metadata": "^10.0.0",
    "uuid": "^10.0.0",
    "lucide-react": "^0.400.0"
  }
}
```

### 2.3 音频格式支持
通过 Howler.js（底层 HTML5 Audio）支持：
- `.ogg` (Vorbis) — galgame 最常见格式
- `.mp3` — 通用格式
- `.wav` — 无损
- `.flac` — 无损
- `.m4a` / `.aac` — Apple 格式
- `.opus` — 新型高效格式

---

## 3. 项目架构

### 3.1 进程模型

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Scanner  │ │ Library  │ │  Player  │ │ Archive       │  │
│  │ Service  │ │ Service  │ │  Service │ │ Extractor     │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
│  ┌──────────────────┐ ┌──────────────────────────────────┐  │
│  │   SQLite (DB)    │ │   IPC Handlers (ipcMain)         │  │
│  └──────────────────┘ └──────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     IPC Bridge (contextBridge)               │
├─────────────────────────────────────────────────────────────┤
│                  Electron Renderer Process                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   React Application                    │   │
│  │  ┌────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐  │   │
│  │  │Sidebar │ │TrackList │ │Player  │ │ScanDialog  │  │   │
│  │  │(Games) │ │          │ │Bar     │ │            │  │   │
│  │  └────────┘ └──────────┘ └────────┘ └────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
galmusic/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── electron-builder.yml
├── electron/                    # 主进程代码
│   ├── main.ts                  # 入口：窗口创建、IPC注册
│   ├── preload.ts               # contextBridge 暴露 API
│   ├── services/
│   │   ├── scanner.ts           # 扫描服务：递归扫描音频文件
│   │   ├── extractor.ts         # 解包服务：调用外部工具解包
│   │   ├── library.ts           # 库管理：CRUD、导入导出
│   │   └── player.ts            # 播放器状态管理（主进程侧）
│   ├── database/
│   │   ├── connection.ts        # SQLite 连接管理
│   │   ├── migrations.ts        # 数据库迁移
│   │   └── queries/             # SQL 查询
│   │       ├── games.ts
│   │       ├── tracks.ts
│   │       └── playlists.ts
│   └── utils/
│       ├── file.ts              # 文件操作工具
│       ├── hash.ts              # 文件哈希（去重）
│       └── formats.ts           # 音频格式判断
├── src/                         # 渲染进程代码
│   ├── main.tsx                 # React 入口
│   ├── App.tsx                  # 根组件
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx      # 左侧游戏列表
│   │   │   ├── MainContent.tsx  # 主内容区
│   │   │   └── PlayerBar.tsx    # 底部播放条
│   │   ├── library/
│   │   │   ├── GameList.tsx     # 游戏列表
│   │   │   ├── TrackTable.tsx   # 曲目表格
│   │   │   └── TrackRow.tsx     # 单行曲目
│   │   ├── scanner/
│   │   │   ├── ScanDialog.tsx   # 扫描对话框
│   │   │   ├── ScanProgress.tsx # 扫描进度
│   │   │   └── ScanResult.tsx   # 扫描结果
│   │   ├── player/
│   │   │   ├── PlayerControls.tsx  # 播放控制按钮
│   │   │   ├── ProgressBar.tsx     # 进度条
│   │   │   ├── VolumeSlider.tsx    # 音量滑块
│   │   │   └── NowPlaying.tsx      # 当前播放信息
│   │   └── ui/
│   │       ├── SakuraBg.tsx     # 樱花飘落背景
│   │       ├── GlassCard.tsx    # 毛玻璃卡片
│   │       ├── SearchBar.tsx    # 搜索框
│   │       └── Modal.tsx        # 通用弹窗
│   ├── stores/
│   │   ├── libraryStore.ts     # 音乐库状态
│   │   ├── playerStore.ts      # 播放器状态
│   │   └── uiStore.ts          # UI 状态（主题等）
│   ├── hooks/
│   │   ├── usePlayer.ts        # 播放器控制 hook
│   │   ├── useLibrary.ts       # 库操作 hook
│   │   └── useScanner.ts       # 扫描 hook
│   ├── styles/
│   │   ├── globals.css          # 全局样式 + Tailwind
│   │   └── animations.css       # 樱花动画等
│   └── types/
│       └── index.ts             # 共享类型定义
├── resources/                   # 静态资源
│   ├── icons/                   # 应用图标
│   ├── sakura.png              # 樱花花瓣素材
│   └── default-cover.png       # 默认封面
├── tools/                       # 外部工具
│   └── garbro/                  # 打包的 GARbro
└── scripts/                     # 构建脚本
    └── postinstall.js           # 安装后编译 native 模块
```

### 3.3 IPC 通信设计

渲染进程通过 `contextBridge` 暴露的 API 调用主进程功能：

```typescript
// preload.ts — 暴露给渲染进程的 API
interface GalMusicAPI {
  // 扫描
  scanFolder(folderPath: string): Promise<ScanResult>;
  extractArchive(archivePath: string, outputDir: string): Promise<ExtractResult>;
  
  // 库管理
  getGames(): Promise<Game[]>;
  getTracks(gameId: string): Promise<Track[]>;
  addTracks(tracks: TrackInput[]): Promise<Track[]>;
  updateTrackName(trackId: string, name: string): Promise<void>;
  deleteTrack(trackId: string): Promise<void>;
  setGameCover(gameId: string, imagePath: string): Promise<void>;
  
  // 播放器
  playTrack(trackId: string): Promise<void>;
  getAudioDuration(filePath: string): Promise<number>;
  
  // 文件
  selectFolder(): Promise<string | null>;
  selectFiles(filters: FileFilter[]): Promise<string[] | null>;
  selectImage(): Promise<string | null>;
  openInExplorer(path: string): Promise<void>;
  
  // 事件
  onScanProgress(callback: (progress: ScanProgress) => void): void;
  onPlayerStateChange(callback: (state: PlayerState) => void): void;
}
```

---

## 4. 核心模块设计

### 4.1 Scanner Service（扫描服务）

**职责**：递归扫描文件夹，发现所有音频文件。

```typescript
// electron/services/scanner.ts

interface ScanOptions {
  sourcePath: string;          // 源文件夹
  libraryPath: string;         // 目标音乐库根目录
  gameName: string;            // 游戏名（用于建子文件夹）
  deepScan: boolean;           // 是否扫描归档文件
  onProgress: (progress: ScanProgress) => void;
}

interface ScanProgress {
  phase: 'scanning' | 'extracting' | 'copying';
  current: number;
  total: number;
  currentFile: string;
}

interface ScanResult {
  found: number;               // 发现音频文件数
  extracted: number;           // 从归档中提取数
  copied: number;              // 成功复制到库的数
  skipped: number;             // 重复跳过数
  errors: string[];
}
```

**扫描逻辑**：
1. 使用 `fs.readdir` 递归遍历源文件夹
2. 对每个文件检查扩展名（`.ogg`, `.mp3`, `.wav`, `.flac`, `.m4a`, `.aac`, `.opus`, `.wma`）
3. 如果 `deepScan=true`，额外检查归档扩展名（`.xp3`, `.rpa`, `.arc`, `.pak`, `.dat`）
4. 计算每个音频文件的 MD5/SHA256 哈希，与库中已有文件去重
5. 将新文件复制到 `{libraryPath}/{gameName}/` 下

### 4.2 Extractor Service（解包服务）

**职责**：调用外部工具解包 galgame 资源归档文件。

**支持的归档格式与工具：**

| 格式 | 引擎 | 解包工具 | 调用方式 |
|------|------|----------|----------|
| `.rpa` | Ren'Py | `unrpa` (Python) | 内嵌 Python 脚本 |
| `.xp3` | Kirikiri | GARbro CLI | `child_process.spawn` |
| `.arc` | 多种 | GARbro CLI | `child_process.spawn` |
| `.pak` | Unity/多种 | GARbro CLI | `child_process.spawn` |

**GARbro 集成方案**：
- 将 GARbro 的 `GARbro.exe` 打包到 `tools/garbro/` 目录
- 通过命令行调用：`GARbro.exe --extract <archive> --output <dir>`
- 如果 GARbro 不支持纯命令行模式，则使用 Python 脚本作为桥接：

```python
# tools/extract.py — Python 解包桥接脚本
import sys, os, subprocess

def extract_rpa(archive_path, output_dir):
    """使用 unrpa 解包 Ren'Py .rpa"""
    subprocess.run([sys.executable, '-m', 'unrpa', archive_path, output_dir])

def extract_xp3(archive_path, output_dir, garbro_path):
    """使用 GARbro 解包 .xp3"""
    subprocess.run([garbro_path, '--extract', archive_path, '--output', output_dir])

# 根据扩展名自动选择解包方式
```

**解包流程**：
1. 主进程检测到归档文件
2. `child_process.spawn('python', ['tools/extract.py', archive_path, tempDir])`
3. 监听 stdout/stderr 获取进度
4. 解包完成后扫描临时目录中的音频文件
5. 将音频文件复制到音乐库
6. 清理临时目录

### 4.3 Library Service（库管理服务）

**职责**：管理 SQLite 数据库中的音乐库数据。

```typescript
// electron/services/library.ts

class LibraryService {
  // 游戏 CRUD
  async getGames(): Promise<Game[]>;
  async getGame(id: string): Promise<Game>;
  async createGame(name: string): Promise<Game>;
  async deleteGame(id: string): Promise<void>;
  async setGameCover(id: string, coverPath: string): Promise<void>;
  
  // 曲目 CRUD
  async getTracks(gameId?: string): Promise<Track[]>;
  async addTrack(data: TrackInput): Promise<Track>;
  async addTracksBulk(data: TrackInput[]): Promise<Track[]>;
  async updateTrack(id: string, updates: Partial<Track>): Promise<void>;
  async deleteTrack(id: string): Promise<void>;
  
  // 搜索
  async search(query: string): Promise<SearchResult>;
  
  // 去重
  async findByHash(hash: string): Promise<Track | null>;
  
  // 统计
  async getStats(): Promise<LibraryStats>;
}
```

### 4.4 Player Service（播放器服务）

**职责**：管理音频播放状态。播放本身在渲染进程（Howler.js），但主进程提供文件路径和元数据。

```typescript
// 播放器状态（在 Zustand store 中）
interface PlayerState {
  currentTrack: Track | null;
  playlist: Track[];           // 当前播放列表
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number;              // 0-1
  progress: number;            // 0-1
  duration: number;            // 秒
  currentTime: number;         // 秒
}

type PlayMode = 'sequential' | 'random' | 'single-loop' | 'list-loop';
```

---

## 5. 数据库设计

### 5.1 ER 图

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│    games     │       │    tracks     │       │  playlists  │
├─────────────┤       ├──────────────┤       ├─────────────┤
│ id (PK)     │──1:N──│ id (PK)      │       │ id (PK)     │
│ name        │       │ game_id (FK)  │       │ name        │
│ cover_path  │       │ file_path     │       │ created_at  │
│ created_at  │       │ file_name     │       └─────────────┘
│ updated_at  │       │ custom_name   │              │
└─────────────┘       │ duration      │              │ M:N
                      │ format        │              │
                      │ size          │       ┌──────────────┐
                      │ file_hash     │       │playlist_tracks│
                      │ track_number  │       ├──────────────┤
                      │ created_at    │       │ playlist_id  │
                      │ updated_at    │       │ track_id     │
                      └──────────────┘       │ position     │
                                             └──────────────┘
```

### 5.2 建表 SQL

```sql
-- 游戏表
CREATE TABLE games (
    id          TEXT PRIMARY KEY,         -- UUID
    name        TEXT NOT NULL,            -- 游戏名称
    cover_path  TEXT,                     -- 封面图片路径（本地）
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 曲目表
CREATE TABLE tracks (
    id            TEXT PRIMARY KEY,       -- UUID
    game_id       TEXT NOT NULL,          -- 所属游戏
    file_path     TEXT NOT NULL,          -- 音频文件绝对路径
    file_name     TEXT NOT NULL,          -- 原始文件名
    custom_name   TEXT,                   -- 用户自定义显示名
    duration      REAL,                   -- 时长（秒）
    format        TEXT,                   -- 格式（ogg/mp3/flac/wav）
    file_size     INTEGER,               -- 文件大小（字节）
    file_hash     TEXT NOT NULL,           -- MD5 哈希（去重用）
    track_number  INTEGER DEFAULT 0,      -- 排序序号
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_tracks_game_id ON tracks(game_id);
CREATE INDEX idx_tracks_file_hash ON tracks(file_hash);
CREATE INDEX idx_tracks_custom_name ON tracks(custom_name);

-- 播放列表表
CREATE TABLE playlists (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 播放列表-曲目关联表
CREATE TABLE playlist_tracks (
    playlist_id TEXT NOT NULL,
    track_id    TEXT NOT NULL,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);

-- 设置表（键值对）
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);
```

### 5.3 默认数据

首次启动时自动插入：
```sql
INSERT INTO settings (key, value) VALUES 
  ('library_path', ''),          -- 用户首次使用时设置
  ('volume', '0.8'),
  ('play_mode', 'list-loop'),
  ('theme', 'sakura');           -- 主题：sakura | dark
```

---

## 6. UI 设计

### 6.1 整体布局

```
┌──────────────────────────────────────────────────────────┐
│  [≡]  GalMusic                              [🔍____] [-]□×│ ← 标题栏（自绘）
├────────┬─────────────────────────────────────────────────┤
│        │  █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█   │
│ 游戏   │  █ 千恋＊万花 — 曲目列表                   █   │
│ 列表   │  █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█   │
│        │                                                 │
│ ┌────┐ │  ┌───┬──────────┬──────┬────────┐              │
│ │樱花│▸│  │ # │ 曲名     │ 时长  │ 格式   │              │
│ │之诗│ │  ├───┼──────────┼──────┼────────┤              │
│ │    │ │  │ 1 │ 桜の詩   │ 3:24 │ .ogg   │  ← 当前播放 │
│ └────┘ │  │ 2 │ 春風     │ 2:18 │ .ogg   │              │
│ ┌────┐ │  │ 3 │ 夕暮れ   │ 4:01 │ .mp3   │              │
│ │千恋│ │  │ 4 │ 星空     │ 5:12 │ .ogg   │              │
│ │万花│ │  └───┴──────────┴──────┴────────┘              │
│ └────┘ │                                                 │
│ ┌────┐ │                                                 │
│ │+导入│ │                                                 │
│ └────┘ │                                                 │
├────────┴─────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐ │
│ │ 🎵 桜の詩 — サクラノ詩                    [≡] [🔀] [🔁] │ │
│ │ ████████████████░░░░░░░░░░  1:24 / 3:24   🔊 ████░░ │ │
│ │ ⏮  ▶  ⏭                                           │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**布局说明：**
- **标题栏**：自绘，隐藏原生标题栏。左侧汉堡菜单 + 标题，右侧搜索框 + 窗口控制
- **左侧边栏**（240px）：游戏列表，每项显示封面缩略图 + 名称，底部"+导入"按钮
- **主内容区**：曲目表格，可排序，点击播放，右键重命名
- **底部播放条**（80px）：当前曲目信息 + 进度条 + 控制按钮 + 音量

### 6.2 视觉主题（Sakura Theme）

**色彩方案：**
```
主色调：#F8A5C2（樱花粉）
辅色1：#F78FB3（深粉）
辅色2：#FCE4EC（浅粉背景）
辅色3：#FFF0F5（极浅粉）
文字色：#2D1B2E（深紫黑）
强调色：#E91E63（品红）
危险色：#FF4757（红）
成功色：#2ED573（绿）
```

**CSS 变量定义：**
```css
:root {
  --color-primary: #F8A5C2;
  --color-primary-dark: #F78FB3;
  --color-bg: #FFF0F5;
  --color-bg-card: rgba(255, 255, 255, 0.7);
  --color-text: #2D1B2E;
  --color-text-secondary: #8B7B8D;
  --color-accent: #E91E63;
  --color-border: rgba(248, 165, 194, 0.3);
  
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  
  --shadow-sm: 0 2px 8px rgba(248, 165, 194, 0.15);
  --shadow-md: 0 4px 16px rgba(248, 165, 194, 0.2);
  --shadow-lg: 0 8px 32px rgba(248, 165, 194, 0.25);
  
  --glass-bg: rgba(255, 255, 255, 0.6);
  --glass-border: rgba(255, 255, 255, 0.3);
  --glass-blur: blur(12px);
}
```

**设计语言：**
- **毛玻璃效果**：卡片和面板使用 `backdrop-filter: blur(12px)` + 半透明背景
- **圆角**：所有容器使用大圆角（12-16px）
- **柔和阴影**：粉色系投影，不透明度 15-25%
- **渐变**：按钮和强调元素使用粉→紫渐变
- **自定义滚动条**：细窄粉色滚动条
- **微交互**：hover 时轻微上浮 + 阴影加深，点击涟漪效应

### 6.3 樱花飘落背景

**实现方式**：纯 CSS 动画 + 少量 JS 生成花瓣

```css
/* 樱花飘落动画 */
@keyframes sakura-fall {
  0% {
    transform: translateY(-10vh) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(110vh) rotate(720deg);
    opacity: 0;
  }
}

@keyframes sakura-sway {
  0%, 100% { margin-left: 0; }
  50% { margin-left: 30px; }
}

.sakura-petal {
  position: fixed;
  top: -10vh;
  z-index: 0;
  pointer-events: none;
  animation: sakura-fall linear forwards,
             sakura-sway ease-in-out infinite;
  /* 每片花瓣随机：大小 12-24px, 下落时间 8-15s, sway 时间 3-6s */
}
```

**性能注意**：花瓣数量控制在 15-20 片，使用 `will-change: transform`，所有内容区 `z-index: 1`。

### 6.4 空状态设计

每个需要数据的区域都有空状态设计：

- **无游戏时**：中央显示插画 + "还没有保存任何游戏的配乐~" + "导入游戏音乐" 按钮
- **游戏中无曲目时**："这个游戏还没有提取曲目" + "扫描文件夹" 按钮
- **搜索无结果时**："没有找到匹配的曲目 (´；ω；`)"

### 6.5 右键菜单

在曲目上右键显示：
- 重命名...
- 在资源管理器中打开
- 从库中删除
- 添加到播放列表 →

---

## 7. 扫描与提取流程

### 7.1 完整流程

```
用户点击 [+导入]
  │
  ▼
弹出扫描对话框
  ├─ 选择 galgame 文件夹
  ├─ 输入游戏名称（自动从文件夹名推断）
  ├─ ☑ 深度扫描（解包归档文件）（默认开启）
  └─ [开始扫描]
        │
        ▼
  ┌─────────────────────────────────────┐
  │ Phase 1: 扫描裸露音频               │
  │  - 递归遍历文件夹                    │
  │  - 匹配音频扩展名                    │
  │  - 记录找到的文件列表                │
  │  - 进度：找到 N 个音频文件           │
  └──────────────┬──────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────┐
  │ Phase 2: 扫描归档文件（可选）         │
  │  - 检测 .xp3/.rpa/.arc/.pak         │
  │  - 逐个解包到临时目录                │
  │  - 扫描临时目录中的音频              │
  │  - 进度：正在解包 xxx.xp3           │
  └──────────────┬──────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────┐
  │ Phase 3: 复制到音乐库                │
  │  - 计算每个文件的哈希值              │
  │  - 查重：跳过库中已有文件            │
  │  - 复制新文件到库目录                │
  │  - 写入数据库记录                    │
  │  - 清理临时目录                      │
  │  - 进度：已复制 12/45               │
  └──────────────┬──────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────┐
  │ 显示结果                             │
  │  ✓ 发现 45 个音频文件               │
  │  ✓ 从 2 个归档中提取 8 个           │
  │  ✓ 成功导入 50 个（3 个重复跳过）    │
  └─────────────────────────────────────┘
```

### 7.2 去重策略

```
哈希计算：MD5（前 4096 字节）+ 文件大小
           ↓
         快速比较
           ↓
    命中？→ 跳过（不重复复制）
           ↓
    未命中 → 完整 MD5 → 插入库
```

### 7.3 音乐库目录结构

```
D:\GalMusic\                      ← 用户设置的库根目录
├── サクラノ詩\                    ← 游戏名 = 文件夹名
│   ├── 01_桜の詩.ogg
│   ├── 02_春風.ogg
│   ├── 03_夕暮れ.mp3
│   └── cover.jpg                 ← 封面图（可选）
├── 千恋＊万花\
│   ├── BGM01.ogg
│   ├── BGM02.ogg
│   └── cover.png
├── ATRI\
│   ├── bgm_001.ogg
│   └── bgm_002.ogg
└── galmusic.db                   ← SQLite 数据库文件
```

---

## 8. 播放器功能

### 8.1 播放引擎

使用 **Howler.js** 在渲染进程中播放：

```typescript
// hooks/usePlayer.ts 核心逻辑
import { Howl } from 'howler';

class PlayerEngine {
  private howl: Howl | null = null;
  
  play(filePath: string) {
    this.howl?.unload();
    this.howl = new Howl({
      src: [filePath],            // 支持 file:// 协议
      format: [getExtension(filePath)],
      html5: true,                // 大文件使用 HTML5 Audio
      volume: this.volume,
      onplay: () => this.emit('play'),
      onpause: () => this.emit('pause'),
      onend: () => this.handleEnd(),
      onloaderror: () => this.emit('error'),
    });
    this.howl.play();
  }
  
  handleEnd() {
    switch (this.playMode) {
      case 'single-loop':
        this.howl?.play();        // 重新播放同首
        break;
      case 'list-loop':
        this.playNext();           // 下一首，到末尾循环
        break;
      case 'sequential':
        if (!isLastTrack) this.playNext();
        break;
      case 'random':
        this.playRandom();
        break;
    }
  }
}
```

### 8.2 播放控制

| 操作 | 触发方式 | 行为 |
|------|----------|------|
| 播放/暂停 | 点击 ▶/⏸ 按钮 或 空格键 | 切换播放状态 |
| 上一曲 | 点击 ⏮ 或 媒体键上一曲 | 列表循环模式下：最后一首→第一首 |
| 下一曲 | 点击 ⏭ 或 媒体键下一曲 | 列表循环模式下：第一首→最后一首 |
| 进度跳转 | 拖拽进度条 或 点击进度条位置 | `howl.seek(position)` |
| 音量调节 | 拖拽音量滑块 或 滚轮 | 0-100%，记忆到 settings |
| 切换模式 | 点击模式按钮 | 图标切换显示当前模式 |
| 双击曲目 | 曲目列表双击某行 | 立即播放该曲目 |

### 8.3 播放模式切换

```
按钮图标循环切换：
[🔀] → 随机播放（图标高亮）
[🔁] → 列表循环 → 单曲循环 → 不循环 → 列表循环 ...
         (图标显示 ① 表示单曲循环)
```

### 8.4 进度条

```
┌──────────────────────────────────────────┐
│ ████████████████░░░░░░░░░░░░░░░░░░░░░░░ │
│ ▲ 可拖拽手柄    1:24              3:24  │
└──────────────────────────────────────────┘
```
- CSS 实现，隐藏原生 `<input range>` 外观，自定义粉色主题样式
- 实时显示当前时间 / 总时长
- hover 时手柄放大，显示精确时间 tooltip

---

## 9. 文件组织与打包

### 9.1 electron-builder 配置

```yaml
# electron-builder.yml
appId: com.galmusic.app
productName: GalMusic
copyright: Copyright © 2026

directories:
  output: dist
  buildResources: resources

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icons/icon.ico
  artifactName: ${productName}-Setup-${version}.${ext}

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: GalMusic

extraResources:
  - from: tools/
    to: tools/
    filter:
      - "**/*"

files:
  - "!src/**/*"
  - "!electron/**/*"
  - "dist-electron/**/*"
  - "dist/**/*"
  - "package.json"
```

### 9.2 外部工具打包

打包时需包含：
1. **GARbro.exe** → `resources/tools/garbro/GARbro.exe`
2. **Python 提取脚本** → `resources/tools/extract.py`
3. **Python 嵌入式环境**（可选，或要求用户安装 Python）

> **备选方案**：如果 Python 依赖太重，可以：
> - `.rpa` 格式：用 Node.js 直接实现解包（RPA 格式较简单，本质是 zlib 压缩的 tar）
> - `.xp3` 格式：用 Node.js + zlib 实现（XP3 格式也是 zlib 压缩）
> - 尽可能减少外部依赖

### 9.3 首次启动流程

```
应用启动
  │
  ├─ 检查是否首次运行（settings.library_path 为空）
  │    │
  │    ├─ 是 → 显示欢迎页面
  │    │      ├─ 选择音乐库存储位置（默认 ~/Music/GalMusic）
  │    │      └─ 显示快速入门指引
  │    │
  │    └─ 否 → 直接进入主界面
  │
  └─ 加载游戏列表和曲目数据
```

---

## 10. 开发路线图

### Phase 1：最小可用（MVP）— 预计 3-5 天

- [x] Electron + React + Vite 项目脚手架
- [ ] 主窗口 + 基础布局（侧边栏 + 内容区 + 播放条）
- [ ] SQLite 数据库初始化
- [ ] 手动导入音乐文件功能
- [ ] 基础播放器（播放/暂停、进度条、音量）
- [ ] 按游戏分类显示曲目

### Phase 2：扫描提取 — 预计 2-3 天

- [ ] 文件夹扫描（递归查找音频）
- [ ] 文件复制 + 去重
- [ ] 扫描进度 UI
- [ ] 扫描结果展示

### Phase 3：解包支持 — 预计 2-3 天

- [ ] .rpa 解包（Node.js zlib）
- [ ] .xp3 解包（集成）
- [ ] GARbro 降级方案（手动引导）

### Phase 4：完整体验 — 预计 2-3 天

- [ ] 自定义曲名
- [ ] 四种播放模式
- [ ] 搜索功能
- [ ] 游戏封面设置
- [ ] 空状态设计

### Phase 5：打磨 — 预计 2-3 天

- [ ] 樱花飘落背景
- [ ] 毛玻璃 UI 效果
- [ ] 自定义标题栏
- [ ] 系统托盘 + 后台播放
- [ ] 媒体键支持
- [ ] 窗口状态记忆
- [ ] 打包配置 + 测试

### Phase 6：播放列表（可选）

- [ ] 创建/编辑/删除播放列表
- [ ] 拖拽排序
- [ ] 导出播放列表

---

## 11. 实现注意事项

### 11.1 Electron 主进程安全

```typescript
// main.ts 窗口创建
const mainWindow = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,        // 必须开启
    nodeIntegration: false,        // 必须关闭
    sandbox: true,                 // 开启沙箱
  },
  frame: false,                    // 自绘标题栏
  titleBarStyle: 'hidden',
});
```

### 11.2 大文件处理

- 使用 `fs.createReadStream` + `fs.createWriteStream` 流式复制，避免大文件撑爆内存
- 大文件 (>50MB) 的哈希计算使用流式 `crypto.createHash`

### 11.3 Howler.js 注意事项

- 必须使用 `html5: true` 以支持 `file://` 协议的本地文件
- Howler 的 `format` 参数必须与文件扩展名匹配
- 不支持 `.opus` 时需要降级提示

### 11.4 中文路径处理

- Windows 中文路径是最常见的坑
- 所有文件路径使用 `path.normalize()`
- SQLite 存储 UTF-8，查询无需转义
- child_process 传递中文参数时设置 `shell: true`

### 11.5 better-sqlite3 编译

```bash
# Windows 上需要安装原生编译工具
npm install --save-dev windows-build-tools
# 或使用预编译版本
npm install better-sqlite3@11.0.0
```

### 11.6 性能优化

- **虚拟滚动**：曲目超过 200 首时使用 `react-window` 虚拟列表
- **数据库查询分页**：默认加载前 100 首，滚动加载更多
- **音频波形缓存**（可选）：首次加载计算波形，存为 JSON 缓存文件
- **图片懒加载**：封面图使用 IntersectionObserver

### 11.7 错误处理约定

```typescript
// 统一的错误类型
class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public userMessage: string  // 展示给用户的友好信息
  ) {}
}

enum ErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  EXTRACT_FAILED = 'EXTRACT_FAILED',
  DB_ERROR = 'DB_ERROR',
  PLAYBACK_ERROR = 'PLAYBACK_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
}
```

### 11.8 日志

- 使用 `electron-log` 记录主进程日志
- 日志文件位置：`%APPDATA%/GalMusic/logs/`
- 级别：error / warn / info / debug
- 渲染进程错误通过 IPC 发送到主进程记录

---

## 附录 A：Electron IPC 通道清单

```typescript
// 主进程 → 渲染进程（推送事件）
'scan:progress'        // 扫描进度更新
'player:state-change'  // 播放器状态变化
'player:time-update'   // 播放时间更新（每秒）
'player:error'         // 播放错误

// 渲染进程 → 主进程（请求）
'scan:start'           // 开始扫描
'scan:cancel'          // 取消扫描
'library:get-games'    // 获取游戏列表
'library:get-tracks'   // 获取曲目列表
'library:add-tracks'   // 添加曲目
'library:update-track' // 更新曲目信息
'library:delete-track' // 删除曲目
'library:search'       // 搜索
'dialog:select-folder' // 打开文件夹选择
'dialog:select-files'  // 打开文件选择
'shell:open-explorer'  // 在资源管理器打开
'app:get-settings'     // 获取设置
'app:set-setting'      // 更新设置
```

## 附录 B：TypeScript 类型定义

```typescript
// types/index.ts

export interface Game {
  id: string;
  name: string;
  coverPath: string | null;
  trackCount?: number;       // 渲染时计算
  createdAt: string;
  updatedAt: string;
}

export interface Track {
  id: string;
  gameId: string;
  filePath: string;
  fileName: string;
  customName: string | null;
  displayName: string;        // customName || fileName
  duration: number | null;
  format: string;
  fileSize: number;
  fileHash: string;
  trackNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface TrackInput {
  gameId: string;
  filePath: string;
  fileName: string;
  format: string;
  fileSize: number;
  fileHash: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  createdAt: string;
}

export type PlayMode = 'sequential' | 'random' | 'single-loop' | 'list-loop';

export interface PlayerState {
  currentTrack: Track | null;
  playlist: Track[];
  playMode: PlayMode;
  isPlaying: boolean;
  volume: number;
  progress: number;
  duration: number;
  currentTime: number;
}

export interface ScanProgress {
  phase: 'scanning' | 'extracting' | 'copying';
  current: number;
  total: number;
  currentFile: string;
}

export interface ScanResult {
  found: number;
  extracted: number;
  copied: number;
  skipped: number;
  errors: string[];
}

export interface LibraryStats {
  totalGames: number;
  totalTracks: number;
  totalDuration: number;     // 秒
  totalSize: number;         // 字节
}
```

---

> **给 AI 实现者的提示**：  
> 1. 请严格按照 Phase 1→5 的顺序逐步实现，每完成一个 Phase 进行功能验证  
> 2. 先跑通 MVP（Phase 1），确保 Electron 基础架构正确，再逐步添加功能  
> 3. 解包模块（Phase 3）技术风险最高，建议先用已知格式的测试文件验证  
> 4. 保持 IPC 通信简洁，避免主进程和渲染进程紧耦合  
> 5. 所有 UI 文字使用中文，代码注释使用英文  
> 6. 优先保证功能正确，再优化视觉效果
