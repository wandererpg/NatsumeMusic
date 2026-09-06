# Game Metadata Auto-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在首次导入某个游戏库时，通过 VNDB 与 Bangumi 的官方公开 API 匹配游戏资料并把封面缓存到本地；后续导入复用游戏级缓存，网络失败不阻断音乐入库，手动封面始终优先。

**Architecture:** 主进程新增独立的游戏资料服务，负责名称规范化、两个来源的 HTTP 查询、候选评分、来源缓存和安全封面下载；SQLite 以 `games.cover_source` 与 `game_sources` 保存封面归属及每个来源的状态。导入器在音乐复制完成后调用该服务并发查询，IPC 只向渲染器提供脱敏摘要；游戏编辑器通过单独的读取/刷新 IPC 展示资料，渲染器永远不显示远程图片 URL。

**Tech Stack:** Electron 31、TypeScript、better-sqlite3、原生 `fetch`、Node `fs/promises`、React 18、Vitest、React Testing Library。

---

## 文件地图

| 文件 | 责任 |
| --- | --- |
| `src/shared/types.ts` | 游戏资料、来源状态、封面来源和扫描进度的跨进程类型 |
| `src/shared/ipc.ts` | 获取/刷新游戏资料的 IPC 通道和 preload API 契约 |
| `src/main/database/migrations.ts` | v5 数据库迁移：`cover_source` 与 `game_sources` |
| `src/main/database/queries/games.ts` | 读取/写入 `cover_source`，保留手动封面保护 |
| `src/main/database/queries/game-sources.ts` | 来源资料的 upsert、读取和名称变更失效处理 |
| `src/main/services/game-metadata.ts` | VNDB/Bangumi 查询、名称规范化、候选评分、缓存编排和脱敏摘要 |
| `src/main/services/cover-download.ts` | 图片响应校验、大小限制、临时文件和本地封面替换 |
| `src/main/services/importer.ts` | 音乐复制完成后的非致命资料任务入口 |
| `src/main/ipc/library-handlers.ts` | 新增资料读取/刷新的输入校验和 handler |
| `src/main/index.ts` | 生产环境组装 metadata service、数据库和导入器 |
| `src/preload/index.ts` | 暴露资料 API，不暴露 `ipcRenderer` 或远程响应 |
| `src/renderer/src/components/scanner/ScanProgress.tsx` | 显示资料查询和封面下载阶段 |
| `src/renderer/src/components/library/GameEditor.tsx` | 显示来源状态、资料摘要和刷新按钮 |
| `src/renderer/src/App.tsx` | 打开编辑器时加载摘要，刷新后同步游戏列表 |
| `src/renderer/src/styles/globals.css` | 资料摘要区域和状态标签样式 |
| `tests/main/game-metadata.test.ts` | 规范化、API 归一化、匹配、失败和封面下载测试 |
| `tests/main/game-sources.test.ts` | 来源表 upsert、缓存命中、重试和手动封面保护测试 |
| `tests/main/database.test.ts` | v5 迁移和 `cover_source` 回归测试 |
| `tests/main/importer.test.ts` | 导入器资料阶段的成功、失败、取消和进度测试 |
| `tests/main/ipc.test.ts` | 资料 IPC 输入验证和 handler 调用测试 |
| `tests/preload/preload.test.ts` | 新增 preload API 通道映射测试 |
| `tests/renderer/game-editor.test.tsx` | 资料摘要和刷新交互测试 |
| `tests/renderer/scan-settings.test.tsx` | 扫描进度阶段兼容测试 |

## Task 1: Lock shared contracts and database migration

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/database/migrations.ts`
- Modify: `src/main/database/queries/games.ts`
- Create: `src/main/database/queries/game-sources.ts`
- Test: `tests/main/database.test.ts`
- Test: `tests/main/game-sources.test.ts`

- [ ] **Step 1: Write failing type and migration tests**

Add tests that assert the current database upgrades from `user_version = 4` to `5`, creates the source table, adds `games.cover_source`, and marks an existing non-null cover as `manual`:

```ts
it('migrates game metadata storage and preserves legacy covers as manual', () => {
  const db = new Database(':memory:');
  migrate(db);
  db.prepare('INSERT INTO games (id, name, cover_path) VALUES (?, ?, ?)').run('g1', 'ATRI', 'C:/lib/.cover.jpg');

  // Re-run is the upgrade/idempotency path used by an existing v4 database.
  db.pragma('user_version = 4');
  migrate(db);

  expect(db.pragma('user_version', { simple: true })).toBe(5);
  expect(db.prepare('SELECT cover_source AS coverSource FROM games WHERE id = ?').get('g1')).toEqual({ coverSource: 'manual' });
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_sources'").get()).toEqual({ name: 'game_sources' });
  db.close();
});

it('upserts both source statuses without exposing raw JSON to the public summary', () => {
  const db = new Database(':memory:');
  migrate(db);
  createGame(db, { id: 'g1', name: 'ATRI' });
  upsertGameSource(db, {
    gameId: 'g1', source: 'vndb', externalId: 'v17', queryName: 'ATRI', status: 'matched',
    dataJson: JSON.stringify({ matched: { title: 'ATRI', developer: 'Frontwing' }, candidates: [] }),
    imageUrl: 'https://example.invalid/cover.jpg', fetchedAt: '2026-08-24T00:00:00.000Z', retryAfter: null, errorMessage: null,
  });

  expect(getGameSources(db, 'g1')[0]).toMatchObject({ source: 'vndb', status: 'matched', externalId: 'v17' });
  db.close();
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm test -- tests/main/database.test.ts tests/main/game-sources.test.ts
```

Expected: FAIL because schema version 5, `cover_source`, `game_sources`, `upsertGameSource`, and `getGameSources` do not exist yet.

- [ ] **Step 3: Add shared metadata contracts**

Add these contracts to `src/shared/types.ts`; keep image URLs and candidate arrays out of the renderer-facing summary:

```ts
export type MetadataSource = 'vndb' | 'bangumi';
export type MetadataStatus = 'pending' | 'matched' | 'no_match' | 'failed' | 'ambiguous';
export type CoverSource = 'manual' | MetadataSource | null;

export interface GameMetadataSourceSummary {
  source: MetadataSource;
  status: MetadataStatus;
  queryName: string;
  externalId: string | null;
  title: string | null;
  titleCn: string | null;
  developer: string | null;
  summary: string | null;
  score: number | null;
  rank: number | null;
  fetchedAt: string | null;
  errorMessage: string | null;
}

export interface GameMetadataSummary {
  gameId: string;
  coverSource: CoverSource;
  sources: GameMetadataSourceSummary[];
}
```

Extend `Game` with `coverSource: CoverSource`, add `metadata` and `cover` phases to `ScanProgress`, and add `getGameMetadata`/`refreshGameMetadata` signatures to the later IPC-facing types in the same change set. `GameUpdate` remains `{ name?, coverPath? }`; callers cannot forge `coverSource`.

- [ ] **Step 4: Implement migration v5**

Set `LATEST_SCHEMA_VERSION = 5`. In the `userVersion < 5` block:

```ts
const gameColumns = db.prepare('PRAGMA table_info(games)').all() as Array<{ name: string }>;
if (!gameColumns.some((column) => column.name === 'cover_source')) {
  db.exec("ALTER TABLE games ADD COLUMN cover_source TEXT CHECK (cover_source IN ('manual', 'vndb', 'bangumi'))");
}
db.exec(`
  UPDATE games
  SET cover_source = 'manual'
  WHERE cover_path IS NOT NULL AND cover_source IS NULL;
  CREATE TABLE IF NOT EXISTS game_sources (
    game_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('vndb', 'bangumi')),
    external_id TEXT,
    query_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'matched', 'no_match', 'failed', 'ambiguous')),
    data_json TEXT,
    image_url TEXT,
    fetched_at TEXT,
    retry_after TEXT,
    error_message TEXT,
    PRIMARY KEY (game_id, source),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
  );
`);
db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(5);
```

Keep the existing v1-v4 blocks unchanged and set `user_version` to the new constant only after all blocks run.

- [ ] **Step 5: Add source queries and game cover-source mapping**

Create `game-sources.ts` with a typed `GameSourceRow`, `GameSourceInput`, `getGameSource`, `getGameSources`, `upsertGameSource`, and `deleteGameSources`. `upsertGameSource` must use SQLite `ON CONFLICT(game_id, source) DO UPDATE` and write all fields, including `retry_after`.

Update `games.ts` to select `g.cover_source AS coverSource`, map it to `CoverSource`, and change `setGameCover` to accept an optional source:

```ts
export function setGameCover(
  db: SQLiteDatabase,
  id: string,
  coverPath: string | null,
  coverSource: CoverSource = coverPath ? 'manual' : null,
): Game | undefined;
```

The default makes all existing manual editor calls safe; the metadata service will pass `vndb` or `bangumi` explicitly.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```powershell
npm test -- tests/main/database.test.ts tests/main/game-sources.test.ts
```

Expected: PASS, with the existing database test expectation updated from schema version `4` to `5` and every `Game` fixture updated with `coverSource: null` where TypeScript requires it.

## Task 2: Implement matching, official API clients, and safe cover download

**Files:**
- Create: `src/main/services/game-metadata.ts`
- Create: `src/main/services/cover-download.ts`
- Create: `tests/main/game-metadata.test.ts`

- [ ] **Step 1: Write failing pure matching tests**

Cover the release-marker cleanup, Japanese/Chinese title comparison, exact aliases, ambiguous candidates, and no-result behavior:

```ts
it('normalizes release markers without changing the display name', () => {
  expect(normalizeGameName('家族計画 ～追憶～ [PC][汉化版] v1.2')).toBe('家族計画 ～追憶～');
});

it('accepts an exact alias and rejects a low-confidence first search result', () => {
  const candidates = [
    candidate({ externalId: 'v1', title: 'Another Game', aliases: ['家族計画 ～追憶～'] }),
    candidate({ externalId: 'v2', title: 'Unrelated Game', aliases: [] }),
  ];
  expect(resolveCandidate('家族計画 ～追憶～', candidates)).toMatchObject({ status: 'matched', matched: { externalId: 'v1' } });
  expect(resolveCandidate('完全不存在', candidates).status).toBe('ambiguous');
  expect(resolveCandidate('完全不存在', []).status).toBe('no_match');
});

it('marks close exact candidates ambiguous instead of choosing a cover', () => {
  const result = resolveCandidate('ATRI', [candidate({ externalId: 'v1', title: 'ATRI' }), candidate({ externalId: 'v2', title: 'ATRI' })]);
  expect(result.status).toBe('ambiguous');
  expect(result.matched).toBeNull();
});
```

- [ ] **Step 2: Run the matching tests and verify they fail**

Run:

```powershell
npm test -- tests/main/game-metadata.test.ts
```

Expected: FAIL because the metadata service and exported pure functions do not exist.

- [ ] **Step 3: Add the internal normalized candidate model and scoring**

In `game-metadata.ts`, define the internal model that may contain `imageUrl` but is never returned across IPC:

```ts
export interface NormalizedMetadataCandidate {
  externalId: string;
  title: string;
  titleCn: string | null;
  aliases: string[];
  developer: string | null;
  summary: string | null;
  score: number | null;
  rank: number | null;
  imageUrl: string | null;
  sourceUrl: string;
}

export interface CandidateResolution {
  status: 'matched' | 'no_match' | 'ambiguous';
  matched: NormalizedMetadataCandidate | null;
  candidates: NormalizedMetadataCandidate[];
}
```

Implement `normalizeGameName` with these exact rules: trim, remove bracketed platform/release labels (`[PC]`, `[汉化]`, `[汉化版]`), remove `汉化版`/`语音版`/`修正版`, remove a trailing version token (`v1.2`, `Ver. 1.0`), remove common archive suffixes (`.zip`, `.7z`, `.rar`), collapse whitespace, and return the original trimmed name if cleanup would become empty.

Implement `resolveCandidate` with scores of 100 for exact normalized main title, 92 for exact normalized alias/alternate/CN title, 70 for a normalized title containment match, and 40 plus a small API-rank bonus for remaining candidates. Accept only a top score of at least 90 with an 8-point lead; equal/near-equal top scores become `ambiguous`, and an empty list becomes `no_match`.

- [ ] **Step 4: Add injectable HTTP clients for VNDB and Bangumi**

Use a small injectable interface so tests never access the network:

```ts
export interface MetadataHttpResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface MetadataHttpClient {
  fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }): Promise<MetadataHttpResponse>;
}
```

Implement `searchVndb(name, signal, http)` using `POST https://api.vndb.org/kana/vn`, a JSON body containing `filters: ['search', '=', name]`, `results: 10`, and fields for id/title/alternate titles/aliases/description/developers/rating/rank/image URL. Implement `searchBangumi(name, signal, http)` using `POST https://api.bgm.tv/v0/search/subjects` with game type `4`, `limit: 10`, and an application User-Agent such as `NatsumeMusic/0.1.0`; fetch details from `GET https://api.bgm.tv/v0/subjects/{id}` for the top three valid search results. Reject non-2xx and malformed payloads as source-local errors, normalize missing values to `null`, and accept only `https:` image URLs.

Add a 12-second `AbortSignal` timeout per source; compose it with the caller signal so cancelling an import aborts both requests. Tests should inject response fixtures and assert request URLs, methods, bodies, and headers.

- [ ] **Step 5: Write failing cover-download tests**

Add tests for content type, 8 MiB limit, extension selection, temporary-file cleanup, and path safety:

```ts
it('downloads an image through a temporary file and returns a local cover path', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'natsume-cover-'));
  const http = response(200, { 'content-type': 'image/jpeg' }, Buffer.from('jpeg')); 
  await expect(downloadCover('https://img.example/cover', target, new AbortController().signal, httpClient(http)))
    .resolves.toBe(path.join(target, '.cover.jpg'));
  await expect(readFile(path.join(target, '.cover.jpg'))).resolves.toEqual(Buffer.from('jpeg'));
});

it('rejects non-image and oversized responses without leaving a temp file', async () => {
  const target = await mkdtemp(path.join(os.tmpdir(), 'natsume-cover-'));
  await expect(downloadCover('https://img.example/html', target, signal, httpClient(response(200, { 'content-type': 'text/html' }, Buffer.from('x'))))).rejects.toThrow();
  await expect(readdir(target)).resolves.toEqual([]);
});
```

- [ ] **Step 6: Implement `downloadCover` and pass the service tests**

In `cover-download.ts`, allow only `https:` URLs, require `content-type` beginning with `image/`, reject a declared or actual body larger than `8 * 1024 * 1024`, map `image/jpeg`, `image/png`, `image/webp`, and `image/gif` to `.jpg`, `.png`, `.webp`, and `.gif`, write to `.${randomUUID()}.cover.tmp` inside the target directory, then rename to `.cover.<ext>`. Use `assertWithin` for both temporary and final paths. On every error or abort, remove the temporary file and never write outside the target directory.

Run:

```powershell
npm test -- tests/main/game-metadata.test.ts
```

Expected: PASS for matching, HTTP normalization, timeout/abort, and cover-download tests.

## Task 3: Add cached metadata orchestration and cover selection

**Files:**
- Modify: `src/main/services/game-metadata.ts`
- Modify: `src/main/database/queries/game-sources.ts`
- Modify: `src/main/database/queries/games.ts`
- Create: `tests/main/game-sources.test.ts` additions
- Modify: `tests/main/game-metadata.test.ts`

- [ ] **Step 1: Write cache-behavior tests**

Test that a first call queries both sources in parallel, a second call with matched/no-match rows makes zero HTTP calls, a failed source respects `retry_after`, a forced refresh bypasses the cache, and an automatic cover never replaces a manual cover:

```ts
it('queries each source once and reuses the game-level cache', async () => {
  const http = fixtureHttpClient();
  const service = createGameMetadataService({ db, getLibraryPath: () => library, http, now: () => fixedNow });
  await service.ensure('g1', { signal: new AbortController().signal });
  await service.ensure('g1', { signal: new AbortController().signal });
  expect(http.calls.filter((call) => call.kind === 'search')).toHaveLength(2);
});

it('does not replace a manually selected cover', async () => {
  setGameCover(db, 'g1', manualCover, 'manual');
  await service.ensure('g1', { signal: new AbortController().signal });
  expect(getGame(db, 'g1')?.coverPath).toBe(manualCover);
  expect(getGame(db, 'g1')?.coverSource).toBe('manual');
});
```

- [ ] **Step 2: Implement service input/output and source cache rules**

Implement:

```ts
export interface MetadataProgress {
  phase: 'metadata' | 'cover';
  current: number;
  total: number;
  currentFile: string;
}

export interface GameMetadataService {
  ensure(gameId: string, options: { signal: AbortSignal; force?: boolean; onProgress?: (progress: MetadataProgress) => void }): Promise<GameMetadataSummary>;
  getSummary(gameId: string): GameMetadataSummary;
  refresh(gameId: string, signal?: AbortSignal): Promise<GameMetadataSummary>;
}

export interface GameMetadataServiceOptions {
  db: SQLiteDatabase;
  getLibraryPath: () => string | Promise<string>;
  http?: MetadataHttpClient;
  now?: () => Date;
  download?: typeof downloadCover;
}
```

For each source, reuse rows with `matched`, `no_match`, or `ambiguous` unless `force` is true. Retry `failed` only when `retry_after <= now`; set `retry_after` to 30 minutes after a failed source request. Persist each source independently, so a VNDB failure cannot discard a valid Bangumi match. Preserve normalized source data in `data_json` as `{ matched, candidates }`; `ambiguous` stores candidates and has no matched external id.

- [ ] **Step 3: Implement cover selection and progress**

After source resolution, prefer a matched VNDB candidate with an image, then a matched Bangumi candidate with an image. If `game.coverSource === 'manual'`, skip download. If the selected local automatic cover still exists, skip download; otherwise call `downloadCover`, set `games.cover_path` and `cover_source` in one database update, and remove only the previous automatic cover after the new file is in place. Emit `metadata` progress with total equal to the number of source requests and `cover` progress with `0/1` and `1/1`. A failed image download leaves source data matched but sets its `error_message`; it does not throw into the music import.

Use the existing `gameDirectory`/`sanitizeDirectoryName` rules and `assertWithin` to resolve the game folder. `getSummary` must parse only the normalized data fields needed for `GameMetadataSourceSummary`; never return `imageUrl`, raw API JSON, or an arbitrary URL to the renderer.

- [ ] **Step 4: Add name-change invalidation and run tests**

When `updateGameNow` renames a game, call `deleteGameSources(db, gameId)` inside the same SQLite transaction after `renameGameRecord`. Keep an existing automatic cover until a future match replaces it, but no longer report stale source metadata. Manual cover changes call `setGameCover` with the default `manual`/`null` source.

Run:

```powershell
npm test -- tests/main/game-metadata.test.ts tests/main/game-sources.test.ts tests/main/database.test.ts
```

Expected: PASS for cache hits, retry cooldown, forced refresh, ambiguous matches, automatic/manual cover behavior, migration, and rename invalidation.

## Task 4: Integrate the service into folder import and add progress phases

**Files:**
- Modify: `src/main/services/importer.ts`
- Modify: `src/shared/types.ts`
- Modify: `src/renderer/src/components/scanner/ScanProgress.tsx`
- Modify: `tests/main/importer.test.ts`
- Modify: `tests/renderer/scan-settings.test.tsx`

- [ ] **Step 1: Write failing importer tests**

Inject a fake `GameMetadataService` into `ImportOptions` and assert it runs after audio rows are copied, runs only through the cache-aware service, emits `metadata`/`cover` progress, and cannot make a successful music import fail:

```ts
it('enriches a successful import without making metadata failure fatal', async () => {
  const progress: ScanProgress[] = [];
  const metadata = {
    ensure: vi.fn().mockRejectedValue(new Error('offline')),
    getSummary: vi.fn(),
    refresh: vi.fn(),
  } satisfies GameMetadataService;
  const result = await importGameFolder({ ...request, metadata, onProgress: (event) => progress.push(event) });
  expect(result.copied).toBe(1);
  expect(metadata.ensure).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(progress.some((event) => event.phase === 'copying')).toBe(true);
});

it('propagates cancellation during metadata work and still cleans temporary import state', async () => {
  const controller = new AbortController();
  const metadata = { ensure: vi.fn(async () => { controller.abort(); throw new Error('aborted'); }), getSummary: vi.fn(), refresh: vi.fn() } satisfies GameMetadataService;
  await expect(importGameFolder({ ...request, signal: controller.signal, metadata })).rejects.toMatchObject({ code: 'CANCELLED' });
});
```

- [ ] **Step 2: Run the importer tests and verify they fail**

Run:

```powershell
npm test -- tests/main/importer.test.ts
```

Expected: FAIL because `ImportOptions.metadata`, the new progress phases, and the post-copy metadata call are absent.

- [ ] **Step 3: Add the non-fatal post-copy metadata hook**

Add `metadata?: GameMetadataService` to `ImportOptions`. After the track-copy loop has produced `completedResult`, call:

```ts
if (options.metadata) {
  try {
    await options.metadata.ensure(game.id, {
      signal: options.signal,
      onProgress: (progress) => options.onProgress({ ...progress, currentFile: options.gameName }),
    });
  } catch (error) {
    if (options.signal.aborted || isAppError(error) && error.code === 'CANCELLED') throw cancelledError();
    // Metadata is deliberately non-fatal. The service records source-local
    // failure state; audio rows and the ScanResult remain successful.
  }
}
```

Call `throwIfAborted` before and after the metadata task. Do not add metadata failures to `ScanResult.errors`, because the source table and progress UI carry that independent status. Existing importer callers without an injected service remain entirely offline and retain their current result shape.

- [ ] **Step 4: Update the progress renderer and pass tests**

Extend `phaseCopy` with `metadata: '正在获取游戏资料'` and `cover: '正在下载游戏封面'`, using `Globe2` and `ImageDown` icons. Keep the existing progress-bar math and cancellation presentation unchanged.

Run:

```powershell
npm test -- tests/main/importer.test.ts tests/renderer/scan-settings.test.tsx
```

Expected: PASS, including all pre-existing archive/audio tests.

## Task 5: Wire database service, IPC, preload, and production bootstrap

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/library-handlers.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `tests/main/ipc.test.ts`
- Modify: `tests/preload/preload.test.ts`

- [ ] **Step 1: Write failing IPC contract tests**

Add handler tests that accept exactly one string game id for both `library:get-game-metadata` and `library:refresh-game-metadata`, reject extra arguments/non-strings, and return the injected service result. Add preload tests that assert the new methods invoke exactly those channels.

- [ ] **Step 2: Add IPC channels and typed API methods**

Add `LIBRARY_GET_GAME_METADATA = 'library:get-game-metadata'` and `LIBRARY_REFRESH_GAME_METADATA = 'library:refresh-game-metadata'` to request maps and explicit `IPC_*` aliases. Extend `GalMusicAPI` with:

```ts
getGameMetadata?: (gameId: string) => Promise<GameMetadataSummary>;
refreshGameMetadata?: (gameId: string) => Promise<GameMetadataSummary>;
```

Keep them optional in the public bridge type so older renderer test mocks remain valid; the production `createGalMusicApi` always exposes both functions.

- [ ] **Step 3: Register handlers and service methods**

Add optional `getGameMetadata` and `refreshGameMetadata` methods to `LibraryService`. Validate the id with the existing `validateGameId`; use `serviceMethod` to call `metadata.getSummary` and `metadata.refresh` and throw the existing localized `DB_ERROR` if a custom/test service has no metadata implementation. Refresh must create an `AbortController`, call `metadata.refresh`, and return the redacted summary.

Add `metadata?: GameMetadataService` to `DatabaseLibraryServiceOptions`. The returned database library service should expose the two methods only when the dependency exists; `updateGameNow` must still preserve the manual-cover behavior described in Task 3.

- [ ] **Step 4: Assemble the production service and run contract tests**

In `bootstrapMainProcess`, create one metadata service using the opened database and the configured library path, then inject the same instance into the default importer and `createDatabaseLibraryService`:

```ts
const metadata = createGameMetadataService({
  db,
  getLibraryPath: () => getSetting(db, 'library_path') ?? defaultLibrary,
});
const defaultImporter: ImporterService = {
  importGameFolder: (importOptions) => importGameFolder({ ...importOptions, db, metadata }),
};
const services = options.services ?? {
  library: createDatabaseLibraryService(db, { importer: defaultImporter, metadata }),
  importer: defaultImporter,
  getLibraryPath: () => getSetting(db, 'library_path') ?? defaultLibrary,
};
```

Wire the preload methods through `invoke` just like `getGames` and `updateGame`. Run:

```powershell
npm test -- tests/main/ipc.test.ts tests/preload/preload.test.ts
```

Expected: PASS with exact argument validation and no raw Electron/network object crossing the bridge.

## Task 6: Add renderer metadata summary and refresh UI

**Files:**
- Modify: `src/renderer/src/components/library/GameEditor.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/globals.css`
- Modify: `tests/renderer/game-editor.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add a `GameMetadataSummary` fixture and test that the editor displays VNDB/Bangumi status, title, developer, score, and summary; ambiguous/failed states are understandable; clicking `刷新网络资料` calls the handler and shows a busy label; and no `img` element receives a remote metadata URL.

- [ ] **Step 2: Extend `GameEditor` props and render only redacted summaries**

Add:

```ts
metadata?: GameMetadataSummary | null;
onRefreshMetadata?: () => Promise<GameMetadataSummary | null>;
```

Render a `.game-editor__metadata` section with one row per source. Show `未查询`, `已匹配`, `无结果`, `待确认`, or `查询失败` based on `status`; for a matched row show only `title`, `developer`, `score`, and a two-line-clamped `summary`. The refresh button calls `onRefreshMetadata` and updates local metadata state. Use the existing local `coverPath` preview only; never use `source.imageUrl` because it is not part of `GameMetadataSummary`.

- [ ] **Step 3: Load and refresh metadata from `App.tsx`**

Create an `openGameEditor(game)` helper that sets the editing game/modal immediately, clears stale metadata, then calls `getGameMetadata(game.id)` if available. Pass the result into `GameEditor`. Replace both sidebar and hero inline edit callbacks with the helper. On refresh, call `refreshGameMetadata`, update the editor state, and reload games so the newly downloaded local cover appears in the hero/sidebar. On close, clear both editing game and metadata.

- [ ] **Step 4: Style, test, and preserve existing liquid-glass UI**

Add compact styles for source rows, status pills, summary text, and refresh action using existing theme variables and the current liquid-glass panel surface. Do not alter the row-glass track styles. Run:

```powershell
npm test -- tests/renderer/game-editor.test.tsx tests/renderer/track-layout.test.ts tests/renderer/theme-css.test.ts
```

Expected: PASS, with the new metadata section visible only in the game editor and existing glass styling unchanged.

## Task 7: End-to-end verification, documentation, and release package

**Files:**
- Modify: `docs/superpowers/specs/2026-08-24-game-metadata-auto-import.md` (mark implemented behavior and verification results)
- Modify: `README.md` or the project user guide file discovered during verification (document offline fallback, cache, refresh, and manual-cover precedence)
- Create: `release-v10` by copying the verified `release` output (no deletion of `release-v9`)

- [ ] **Step 1: Run the complete test suite and fix regressions**

Run:

```powershell
npm test
npx tsc --noEmit
```

Expected: all Vitest files pass and TypeScript reports no errors. If an existing test fixture constructs `Game` directly, add `coverSource: null` rather than making the field optional in production types.

- [ ] **Step 2: Build and verify resources**

Run:

```powershell
npm run verify:resources
npm run build
```

Expected: resource verification passes and Electron bundles main, preload, renderer, and the new metadata modules.

- [ ] **Step 3: Produce a new Windows package without overwriting the previous release**

Run:

```powershell
npm run package:win
Copy-Item -LiteralPath 'release' -Destination 'release-v10' -Recurse -Force
```

Verify `release-v10/win-unpacked/NatsumeMusic.exe` exists and the packaged app opens the existing database, shows the new metadata fields, and keeps `release-v9` untouched. Do not update the desktop shortcut as part of this feature unless the user separately requests changing the shortcut target.

- [ ] **Step 4: Record final behavior in the specification**

Update the spec status to `已实现并验证`, add the exact test/build commands and results, and document the two official API references used by the implementation: [VNDB Kana API](https://api.vndb.org/kana) and [Bangumi API OpenAPI](https://raw.githubusercontent.com/bangumi/api/master/open-api/v0.yaml).
