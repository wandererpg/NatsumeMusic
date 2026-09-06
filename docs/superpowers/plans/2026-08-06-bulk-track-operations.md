# 曲目批量操作实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在具体游戏音乐文件夹内提供可与虚拟滚动兼容的批量选择，并可靠完成收藏、取消收藏、移动、加入播放列表及两种删除操作。

**Architecture:** 渲染层以受控 `Set<string>` 保存选择，所有批量写入通过一个受验证的 IPC 请求进入主进程。新的 `bulk-track-service` 统一处理数据库事务、文件暂存、移动和回滚；store 在操作后重新读取权威数据，不在前端猜测多个集合的最终状态。

**Tech Stack:** Electron 31、React 18、TypeScript、Zustand、better-sqlite3、Vitest、Testing Library、Node.js `fs/promises`

**Repository note:** 当前目录没有 `.git`，因此本计划不执行提交命令；每个任务的验证通过即作为检查点。如果之后初始化 Git，可在每个检查点提交对应文件。

---

## 文件结构

- `src/shared/types.ts`：批量请求、操作联合类型、逐项结果类型。
- `src/shared/ipc.ts`：批量 IPC 常量及 `GalMusicAPI.bulkUpdateTracks`。
- `src/preload/index.ts`：受控桥接批量调用。
- `src/main/ipc/library-handlers.ts`：参数白名单、数量和联合类型验证。
- `src/main/database/queries/tracks.ts`：按 ID 批量读取、收藏、位置更新与删除。
- `src/main/database/queries/playlists.ts`：事务友好的批量加入播放列表。
- `src/main/services/bulk-track-service.ts`：批量业务、路径安全、文件移动/暂存/回滚。
- `src/main/index.ts`：把数据库、音乐库路径和文件依赖组装成批量服务。
- `src/renderer/src/components/library/TrackTable.tsx`：表头全选和选择属性透传。
- `src/renderer/src/components/library/TrackRow.tsx`：单行复选框和 Shift 选择事件。
- `src/renderer/src/components/library/BulkTrackToolbar.tsx`：批量工具栏。
- `src/renderer/src/components/library/BulkTargetPicker.tsx`：移动目标与播放列表目标选择。
- `src/renderer/src/components/library/BulkDeleteDialog.tsx`：两种删除模式确认。
- `src/renderer/src/stores/libraryStore.ts`：一次批量调用、权威数据刷新与结果保留。
- `src/renderer/src/stores/playerStore.ts`：移动或删除当前曲目后的播放器协调。
- `src/renderer/src/App.tsx`：选择生命周期、弹窗与批量结果提示。
- `src/renderer/src/styles/globals.css`：选择列、工具栏和确认窗口样式。

### Task 1: 共享批量协议、IPC 校验与 preload 桥接

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipc/library-handlers.ts`
- Test: `tests/main/ipc.test.ts`
- Create: `tests/preload/preload.test.ts`

- [ ] **Step 1: 写 IPC 失败测试**

在 `tests/main/ipc.test.ts` 导入 `IPC_LIBRARY_BULK_UPDATE_TRACKS`，注册带 `bulkUpdateTracks: vi.fn()` 的 library，断言合法请求原样路由：

```ts
const request: BulkTrackRequest = {
  sourceGameId: 'g1',
  trackIds: ['t1', 't2'],
  operation: { type: 'favorite', isFavorite: true },
};
await ipcMain.invoke(IPC_LIBRARY_BULK_UPDATE_TRACKS, request);
expect(library.bulkUpdateTracks).toHaveBeenCalledWith(request);
```

分别断言空数组、重复 ID、2,001 个 ID、未知字段、空 `sourceGameId`、相同源/目标游戏、无目标播放列表、非法删除模式会在 service 调用前失败。

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
npm.cmd test -- --run tests/main/ipc.test.ts
```

Expected: FAIL，原因是批量 IPC 常量和 handler 尚不存在。

- [ ] **Step 3: 定义完整共享类型**

在 `src/shared/types.ts` 添加：

```ts
export type BulkTrackOperation =
  | { type: 'favorite'; isFavorite: boolean }
  | { type: 'playlist-add'; playlistId: string }
  | { type: 'move'; targetGameId: string }
  | { type: 'delete'; deleteFiles: boolean };

export interface BulkTrackRequest {
  sourceGameId: string;
  trackIds: string[];
  operation: BulkTrackOperation;
}

export interface BulkTrackFailure {
  trackId: string;
  userMessage: string;
}

export interface BulkTrackResult {
  succeededIds: string[];
  failures: BulkTrackFailure[];
}
```

- [ ] **Step 4: 添加 IPC 常量、接口与校验**

在 `src/shared/ipc.ts` 添加 `LIBRARY_BULK_UPDATE_TRACKS = 'library:bulk-update-tracks'`，纳入 `IPC_REQUESTS`、`IPC_CHANNELS` 和导出别名；给 `GalMusicAPI` 添加：

```ts
bulkUpdateTracks(request: BulkTrackRequest): Promise<BulkTrackResult>;
```

在 preload 返回对象中添加一次 `invoke`。在 handler 中新增 `validateBulkTrackRequest`：只允许 `sourceGameId/trackIds/operation`；ID 去空白、非空、最大 2,000 且不得重复；按 `operation.type` 使用各自字段白名单；`move.targetGameId !== sourceGameId`。扩展 `LibraryService`：

```ts
bulkUpdateTracks?(request: BulkTrackRequest): Promise<BulkTrackResult> | BulkTrackResult;
```

- [ ] **Step 5: 补 preload 契约测试并验证 GREEN**

在 `tests/preload/preload.test.ts` 调用 `api.bulkUpdateTracks(request)`，断言 `ipc.invoke` 只收到新通道和单个请求对象。运行：

```powershell
npm.cmd test -- --run tests/main/ipc.test.ts tests/preload/preload.test.ts
```

Expected: PASS。

### Task 2: 数据库批量原语

**Files:**
- Modify: `src/main/database/queries/tracks.ts`
- Modify: `src/main/database/queries/playlists.ts`
- Test: `tests/main/bulk-track-queries.test.ts`

- [ ] **Step 1: 写数据库失败测试**

创建内存数据库和两个游戏、三首曲目、一个播放列表，测试：

```ts
expect(getTracksByIds(db, ['t2', 't1']).map((track) => track.id)).toEqual(['t2', 't1']);
expect(setTracksFavorite(db, ['t1', 't2'], true)).toBe(2);
expect(moveTrackRecord(db, 't1', {
  gameId: 'g2', filePath: 'C:/Library/G2/音乐/a.ogg', fileName: 'a.ogg',
})).toBe(true);
expect(deleteTracks(db, ['t1', 't2'])).toBe(2);
```

测试 `addTracksToPlaylist` 按输入顺序分配连续 position，重复加入不改变计数。

- [ ] **Step 2: 运行并确认 RED**

```powershell
npm.cmd test -- --run tests/main/bulk-track-queries.test.ts
```

Expected: FAIL，缺少这些查询函数。

- [ ] **Step 3: 实现批量查询函数**

在 `tracks.ts` 添加并导出：

```ts
export function getTracksByIds(db: SQLiteDatabase, ids: string[]): Track[];
export function setTracksFavorite(db: SQLiteDatabase, ids: string[], value: boolean): number;
export function moveTrackRecord(
  db: SQLiteDatabase,
  id: string,
  changes: { gameId: string; filePath: string; fileName: string },
): boolean;
export function deleteTracks(db: SQLiteDatabase, ids: string[]): number;
```

所有动态 `IN` 查询只生成 `?` 占位符并通过参数绑定；空数组直接返回空结果或 0。`getTracksByIds` 用 Map 恢复请求顺序。`moveTrackRecord` 只更新 `game_id/file_path/file_name/updated_at`，保留曲目 ID、分类、收藏、自定义名和播放列表外键。

在 `playlists.ts` 添加：

```ts
export function addTracksToPlaylist(
  db: SQLiteDatabase,
  playlistId: string,
  trackIds: string[],
): number;
```

先读取现有最大 position，再逐项 `INSERT OR IGNORE`；只有真正插入时递增 position。

- [ ] **Step 4: 验证 GREEN**

```powershell
npm.cmd test -- --run tests/main/bulk-track-queries.test.ts tests/main/database.test.ts
```

Expected: PASS，现有数据库测试无回归。

### Task 3: 收藏与播放列表批量服务

**Files:**
- Create: `src/main/services/bulk-track-service.ts`
- Create: `tests/main/bulk-track-service.test.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: 写收藏与播放列表失败测试**

使用真实内存数据库建立 `createBulkTrackService({ db, getLibraryPath })`，断言：

```ts
await expect(service.execute({
  sourceGameId: 'g1', trackIds: ['t1', 't2'],
  operation: { type: 'favorite', isFavorite: true },
})).resolves.toEqual({ succeededIds: ['t1', 't2'], failures: [] });
```

确认两首均为收藏；取消收藏后均为 false。播放列表操作应一次加入两首、重复请求仍成功且不重复。混入不存在 ID 或其他游戏 ID 时，对应 ID 进入 failures，合法曲目继续成功。

- [ ] **Step 2: 运行并确认 RED**

```powershell
npm.cmd test -- --run tests/main/bulk-track-service.test.ts
```

Expected: FAIL，service 模块不存在。

- [ ] **Step 3: 实现服务边界和非文件操作**

导出：

```ts
export interface BulkTrackServiceDependencies {
  db: SQLiteDatabase;
  getLibraryPath: () => Promise<string> | string;
  renameFile?: typeof rename;
  removeFile?: typeof rm;
  makeDirectory?: typeof mkdir;
  idFactory?: () => string;
}

export interface BulkTrackService {
  execute(request: BulkTrackRequest): Promise<BulkTrackResult>;
}

export function createBulkTrackService(
  dependencies: BulkTrackServiceDependencies,
): BulkTrackService;
```

服务先 `getTracksByIds`，把不存在或 `gameId !== sourceGameId` 的 ID放入 failures。favorite 和 playlist-add 对合法 ID 各使用一个 `db.transaction`；目标播放列表不存在时整个请求以 `AppError('FILE_NOT_FOUND', ...)` 拒绝。

在 `createDatabaseLibraryService` 内创建一次 bulk service，并暴露 `bulkUpdateTracks: request => bulkService.execute(request)`。

- [ ] **Step 4: 验证 GREEN**

```powershell
npm.cmd test -- --run tests/main/bulk-track-service.test.ts tests/main/ipc.test.ts
```

Expected: PASS。

### Task 4: 文件移动与两种删除的回滚安全

**Files:**
- Modify: `src/main/services/bulk-track-service.ts`
- Modify: `src/main/database/queries/tracks.ts`
- Test: `tests/main/bulk-track-files.test.ts`

- [ ] **Step 1: 写真实临时目录失败测试**

用 `mkdtemp` 建立音乐库、源游戏和目标游戏。覆盖以下独立用例：

- 移动 music/voice 到目标对应分类目录并更新 `gameId/filePath/fileName`。
- 目标同名时生成 `name (2).ogg`，原文件不被覆盖。
- 在测试数据库建立 `BEFORE UPDATE ON tracks` 且执行 `RAISE(ABORT, 'forced update failure')` 的临时 trigger 后，文件恢复到源路径。
- `deleteFiles: false` 删除数据库记录但保留源文件。
- `deleteFiles: true` 删除数据库记录和文件。
- 在测试数据库建立 `BEFORE DELETE ON tracks` 且执行 `RAISE(ABORT, 'forced delete failure')` 的临时 trigger 后，暂存文件恢复。
- 数据库中的文件路径越过音乐库根目录时，硬删除失败且外部文件保留。

- [ ] **Step 2: 运行并确认 RED**

```powershell
npm.cmd test -- --run tests/main/bulk-track-files.test.ts
```

Expected: FAIL，因为 move/delete 分支尚未实现。

- [ ] **Step 3: 实现移动算法**

对每首合法曲目依次：读取目标游戏；使用 `gameDirectory`、`categoryDirectory`、`collectUsedNames` 和 `allocateTrackTarget` 生成目标；`assertWithin` 同时校验源和目标处于音乐库内；创建目录；rename 文件；在事务内 `moveTrackRecord`。事务失败时 rename 回源。每首成功或失败写入结果，继续下一首。

目标游戏不存在或等于源游戏时在移动任何文件前拒绝整个请求。

- [ ] **Step 4: 实现删除算法**

仅移除模式在一个事务中 `deleteTracks`。硬删除模式为每首曲目在音乐库下生成 `.galmusic-bulk-delete-<requestId>` 暂存目录，将存在的文件 rename 到暂存位置；所有已暂存文件就绪后在事务中删除数据库记录。事务失败则逆序恢复；成功后 `rm(stagingDirectory, { recursive: true, force: true })`。不存在的源文件仍可删除数据库记录，但在结果中不制造伪失败。

- [ ] **Step 5: 验证 GREEN**

```powershell
npm.cmd test -- --run tests/main/bulk-track-files.test.ts tests/main/game-service.test.ts tests/main/library-layout-migration.test.ts
```

Expected: PASS，目录迁移和单游戏删除无回归。

### Task 5: 虚拟列表批量选择

**Files:**
- Modify: `src/renderer/src/components/library/TrackTable.tsx`
- Modify: `src/renderer/src/components/library/TrackRow.tsx`
- Modify: `src/renderer/src/styles/globals.css`
- Test: `tests/renderer/track-table-selection.test.tsx`
- Test: `tests/renderer/track-table-virtualization.test.tsx`

- [ ] **Step 1: 写选择失败测试**

以受控 harness 渲染 `TrackTable`：

```tsx
<TrackTable
  tracks={tracks}
  selectionEnabled
  selectedTrackIds={selectedIds}
  onSelectionChange={setSelectedIds}
/>
```

断言单击 `选择 Track 1` 只选择 t1；Shift 点击 t4 选择 t1–t4；表头“选择当前全部曲目”选择传入的全部 IDs；部分选择时表头 checkbox 的 `indeterminate === true`；滚动到底部后选择仍存在，挂载行仍不超过 26。

- [ ] **Step 2: 运行并确认 RED**

```powershell
npm.cmd test -- --run tests/renderer/track-table-selection.test.tsx
```

Expected: FAIL，组件没有选择属性和复选框。

- [ ] **Step 3: 实现受控选择 API**

给 `TrackTableProps` 添加：

```ts
selectionEnabled?: boolean;
selectedTrackIds?: ReadonlySet<string>;
onSelectionChange?: (next: Set<string>) => void;
selectionDisabled?: boolean;
```

TrackTable 保存 `lastSelectionIndexRef`，按 `tracks` 的完整索引计算 Shift 范围，不能按 `visibleTracks` 计算。表头 checkbox 用 ref 设置 `indeterminate`。选择列和行 checkbox 都调用 `stopPropagation`，不触发播放。

给 `TrackRow` 添加 `selectionEnabled/isSelected/onSelect/selectionDisabled`；首个 `<td>` 为选择框，编号仍在下一列。启用选择后所有 spacer 和表头 `colSpan` 从 6 调整为 7。

- [ ] **Step 4: 验证 GREEN 与虚拟列表回归**

```powershell
npm.cmd test -- --run tests/renderer/track-table-selection.test.tsx tests/renderer/track-table-virtualization.test.tsx
```

Expected: PASS，虚拟化挂载数量不增长。

### Task 6: 批量工具栏、目标窗口、删除窗口和 store

**Files:**
- Create: `src/renderer/src/components/library/BulkTrackToolbar.tsx`
- Create: `src/renderer/src/components/library/BulkTargetPicker.tsx`
- Create: `src/renderer/src/components/library/BulkDeleteDialog.tsx`
- Modify: `src/renderer/src/stores/libraryStore.ts`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/styles/globals.css`
- Create: `tests/renderer/bulk-track-operations.test.tsx`

- [ ] **Step 1: 写界面流程失败测试**

用两个 game、三首当前曲目、一个 playlist mock `window.galMusic`。进入 game-1 后断言：

- 勾选两首出现“已选择 2 首”。
- “收藏”只调用一次 `bulkUpdateTracks`，operation 为 `{ type:'favorite', isFavorite:true }`。
- “取消收藏”发送 false。
- “移动到…”窗口不显示当前游戏，选择 game-2 后发送 `{ type:'move', targetGameId:'game-2' }`。
- “加入播放列表…”发送 playlist-add。
- “删除…”先出现两个明确按钮，分别发送 `deleteFiles:false/true`。
- 搜索、分类、游戏切换后选择清空。
- 返回部分失败时只保留失败 ID 的选择并显示“成功 1 首，失败 1 首”。

- [ ] **Step 2: 运行并确认 RED**

```powershell
npm.cmd test -- --run tests/renderer/bulk-track-operations.test.tsx
```

Expected: FAIL，批量工具栏和 API 尚未接入。

- [ ] **Step 3: 实现 store 单次批量动作**

给 `LibraryStore` 添加：

```ts
bulkUpdateTracks: (request: BulkTrackRequest) => Promise<BulkTrackResult | null>;
```

调用一次 `api()?.bulkUpdateTracks(request)`；成功后并行/顺序执行 `loadTracks(currentQuery)`、`loadGames()`、`loadPlaylists()`，返回主进程结果；失败时设置 `error` 并返回 null。

- [ ] **Step 4: 实现三个界面组件**

`BulkTrackToolbar` 仅接收 count、busy 和六个回调，不直接访问 store。`BulkTargetPicker` 通过 `mode: 'game' | 'playlist'` 渲染目标，game 模式过滤 sourceGameId。`BulkDeleteDialog` 用两个危险等级不同的确认按钮呈现 `deleteFiles` 选择，按钮文字必须包含“保留硬盘文件”和“删除硬盘文件”。

- [ ] **Step 5: 在 App 中管理选择生命周期**

新增：

```ts
const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
const [bulkDialog, setBulkDialog] = useState<'move' | 'playlist' | 'delete' | null>(null);
const [bulkBusy, setBulkBusy] = useState(false);
const selectionEnabled = activeSection === 'library' && Boolean(selectedGameId);
```

用 `selectedGameId/searchText/trackKindFilter/activeSection` 的 effect 清空选择。`runBulk(operation)` 捕获当前 ID，发送带 sourceGameId 的请求，成功后把 `succeededIds` 从选择中移除、保留 failures；关闭弹窗并显示结果摘要。当前筛选后的 `tracks` 就是表头全选范围。

- [ ] **Step 6: 验证 GREEN**

```powershell
npm.cmd test -- --run tests/renderer/bulk-track-operations.test.tsx tests/renderer/components.test.tsx
```

Expected: PASS，单曲收藏、删除、播放列表入口继续工作。

### Task 7: 播放器协调、完整回归与正式构建

**Files:**
- Modify: `src/renderer/src/stores/playerStore.ts`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/renderer/player-engine.test.ts`
- Test: `tests/renderer/bulk-track-operations.test.tsx`

- [ ] **Step 1: 写当前播放曲目失败测试**

测试批量移动当前曲目成功后，播放器队列中的同 ID 曲目替换为重新加载后的新路径且保持暂停；批量删除当前曲目成功后，播放器停止、currentTrack 置空并从队列移除。删除或移动失败时播放器不改变。

- [ ] **Step 2: 运行并确认 RED**

```powershell
npm.cmd test -- --run tests/renderer/player-engine.test.ts tests/renderer/bulk-track-operations.test.tsx
```

Expected: FAIL，player store 没有批量结果协调方法。

- [ ] **Step 3: 实现播放器协调 API**

给 `PlayerStore` 添加：

```ts
reconcileLibraryTracks: (
  refreshedTracks: Track[],
  removedIds: ReadonlySet<string>,
) => void;
```

把当前 queue 中仍存在的 ID 替换为刷新后的 Track；removedIds 从 queue 移除。若 currentTrack 被删除，`playerEngine.setQueue([])` 并清空播放状态；若路径改变，暂停并用更新后的 queue 重设 engine，不能继续引用已移动文件。App 在 store 刷新完成后调用该方法。

- [ ] **Step 4: 运行全部验证**

```powershell
npm.cmd test -- --run
npx.cmd tsc --noEmit -p tsconfig.json
npm.cmd run build
```

Expected: 所有测试通过，TypeScript 无错误，Electron main/preload/renderer 三个 bundle 均构建成功。

- [ ] **Step 5: 手动验收**

```powershell
npm.cmd run dev
```

在一个含音乐和语音的游戏文件夹中验证：筛选后全选只选当前结果；滚动选择不丢失；批量收藏/取消收藏；加入播放列表不重复；移动到另一游戏后文件位于正确分类目录；两种删除模式分别保留或删除硬盘文件；正在播放的曲目被移动或删除时不报播放路径错误。

## 计划自检

- 规格中的选择、工具栏、收藏、取消收藏、移动、播放列表、两种删除、部分失败、路径安全、虚拟滚动和播放器协调均有对应任务。
- 所有生产行为都有先失败后实现的测试步骤。
- 共享类型、IPC 方法和 service 方法在所有任务中保持一致：`BulkTrackRequest`、`BulkTrackResult`、`bulkUpdateTracks`、`execute`。
- 没有未定义的占位任务；当前唯一无法执行的是 Git 提交，因为项目本身没有 `.git`。
