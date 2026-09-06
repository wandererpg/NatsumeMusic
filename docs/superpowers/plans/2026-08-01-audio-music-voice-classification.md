# Audio Music/Voice Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify imported audio as music or voice using the confirmed 25-second rule, store files under per-game `音乐` and `语音` folders, skip voice by default unless explicitly enabled, migrate existing libraries safely, and add an in-game music/voice filter.

**Architecture:** Keep `TrackKind` in the shared contract, put the pure duration rule and folder mapping in a small main-process service, persist the kind in SQLite, and make importer/query/UI behavior consume that single value. A startup migration reads missing metadata, moves legacy files without changing track IDs, then atomically updates their database paths and kinds; a failed database update moves the file back and records a non-fatal diagnostic.

**Tech Stack:** Electron 31, React 18, TypeScript 5.6, Zustand, better-sqlite3, Vitest, Testing Library, Node filesystem APIs.

---

## Confirmed behavior

- `duration > 25` seconds is `music`.
- `duration <= 25` seconds is `voice`.
- Missing, non-finite, or unreadable duration is conservatively `voice`.
- Files live at `<library>/<game>/音乐` or `<library>/<game>/语音`.
- “导入语音” is a per-import option and is off by default.
- When voice import is off, voice files are not copied or inserted, but increment `ScanResult.skipped`.
- Existing tracks are migrated on startup, preserving track IDs, favorites, playlists, custom names, and ordering.
- The single-game track view gets `全部 / 音乐 / 语音`; other collections continue to show every imported track.

## Task 1: Add the shared kind contract and pure classification rule

**Files:**

- Create: `src/main/services/track-classification.ts`
- Modify: `src/shared/types.ts`
- Create: `tests/main/track-classification.test.ts`

- [ ] Write the failing boundary tests.

```ts
import { describe, expect, it } from 'vitest';
import { classifyTrack, trackKindDirectory } from '../../src/main/services/track-classification';

describe('track classification', () => {
  it.each([
    [25.001, 'music'],
    [25, 'voice'],
    [0, 'voice'],
    [null, 'voice'],
    [undefined, 'voice'],
    [Number.NaN, 'voice'],
  ])('classifies duration %s as %s', (duration, expected) => {
    expect(classifyTrack(duration)).toBe(expected);
  });

  it('maps kinds to the confirmed Chinese directory names', () => {
    expect(trackKindDirectory('music')).toBe('音乐');
    expect(trackKindDirectory('voice')).toBe('语音');
  });
});
```

- [ ] Run `npm.cmd test -- tests/main/track-classification.test.ts` and verify it fails because the service does not exist.

- [ ] Add the shared types.

```ts
export type TrackKind = 'music' | 'voice';

export interface TrackQuery {
  section?: LibrarySection;
  gameId?: string | null;
  playlistId?: string | null;
  search?: string;
  kind?: TrackKind | null;
}

export interface Track {
  // existing fields remain unchanged
  kind: TrackKind;
}

export interface ScanStartRequest {
  sourcePath: string;
  gameName: string;
  deepScan: boolean;
  includeVoice: boolean;
}
```

- [ ] Implement the pure rule and folder mapping.

```ts
import type { TrackKind } from '../../shared/types';

export const MUSIC_DURATION_THRESHOLD_SECONDS = 25;

export function classifyTrack(duration: number | null | undefined): TrackKind {
  return typeof duration === 'number'
    && Number.isFinite(duration)
    && duration > MUSIC_DURATION_THRESHOLD_SECONDS
    ? 'music'
    : 'voice';
}

export function trackKindDirectory(kind: TrackKind): '音乐' | '语音' {
  return kind === 'music' ? '音乐' : '语音';
}
```

- [ ] Run the focused test and verify it passes.

- [ ] Run `npm.cmd test -- tests/shared/smoke.test.ts` and fix every fixture that now requires `Track.kind` or `ScanStartRequest.includeVoice`.

- [ ] Commit checkpoint: skip because this workspace has no Git repository; record Task 1 as completed in this plan instead.

## Task 2: Persist and query track kinds in SQLite

**Files:**

- Modify: `src/main/database/migrations.ts`
- Modify: `src/main/database/queries/tracks.ts`
- Modify: `src/main/ipc/library-handlers.ts`
- Modify: `src/renderer/src/stores/libraryStore.ts`
- Modify: `tests/main/database.test.ts`
- Modify: `tests/main/library-collections.test.ts`
- Modify: `tests/main/ipc.test.ts`

- [ ] Add failing database tests that open a version-2 database, run migrations, and assert:

```ts
expect(columns).toContainEqual(expect.objectContaining({ name: 'kind' }));
expect(readTrack.kind).toBe('music');
expect(listTracks(db, game.id, { kind: 'voice' }).map((track) => track.id)).toEqual(['voice-id']);
```

- [ ] Add a version-3 migration with a compatibility default.

```ts
export const LATEST_SCHEMA_VERSION = 3;

// In migration 3:
db.exec("ALTER TABLE tracks ADD COLUMN kind TEXT NOT NULL DEFAULT 'music' CHECK (kind IN ('music', 'voice'))");
db.exec('CREATE INDEX IF NOT EXISTS idx_tracks_game_kind ON tracks(game_id, kind)');
```

The SQL default only makes old rows readable during migration. The startup layout migration in Task 5 must recompute every legacy row, including rows with unknown duration.

- [ ] Extend `TrackInput`, `TrackRow`, `TRACK_SELECT`, insert/update mapping, and the returned `Track` with `kind`.

```ts
kind: row.kind as TrackKind,
```

- [ ] Extend `listTracks` options and SQL predicates.

```ts
if (options.kind) {
  clauses.push('t.kind = ?');
  params.push(options.kind);
}
```

- [ ] Add one storage update helper used by imports and migration.

```ts
export function updateTrackStorage(
  db: Database.Database,
  id: string,
  changes: { filePath: string; fileName: string; duration: number | null; kind: TrackKind },
): void {
  db.prepare(`UPDATE tracks
    SET file_path = ?, file_name = ?, duration = ?, kind = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`)
    .run(changes.filePath, changes.fileName, changes.duration, changes.kind, id);
}
```

- [ ] Validate `TrackQuery.kind` in `library-handlers.ts`: allow only `music`, `voice`, `null`, or omission; reject unexpected values before calling the service.

- [ ] Add `kind` to `normalizeQuery` and `initialState.currentQuery` in `libraryStore.ts` so `Required<TrackQuery>` remains type-correct.

- [ ] Run:

```powershell
npm.cmd test -- tests/main/database.test.ts tests/main/library-collections.test.ts tests/main/ipc.test.ts
```

Expected: all focused persistence and query tests pass.

- [ ] Commit checkpoint: skip because this workspace has no Git repository.

## Task 3: Route new imports into `音乐` and `语音`, with voice off by default

**Files:**

- Create: `src/main/services/library-layout.ts`
- Modify: `src/main/services/importer.ts`
- Modify: `tests/main/importer.test.ts`

- [ ] Replace importer fixtures with explicit metadata durations and add failing tests for:

  - a 25.001-second file copied into `<game>/音乐` and inserted as `music`;
  - a 25-second file skipped when `includeVoice: false`;
  - a 25-second file copied into `<game>/语音` when `includeVoice: true`;
  - a null-duration file treated the same as voice;
  - both category directories created for an import that contains both kinds and enables voice;
  - duplicate metadata enrichment reclassifying and moving a file when its duration becomes known.

- [ ] Extract safe layout helpers from the importer.

```ts
export function gameDirectory(libraryPath: string, gameName: string): string {
  return path.join(libraryPath, sanitizeGameDirectoryName(gameName));
}

export function categoryDirectory(gamePath: string, kind: TrackKind): string {
  return path.join(gamePath, trackKindDirectory(kind));
}

export async function allocateTrackTarget(directory: string, fileName: string): Promise<string> {
  // Preserve the importer's existing collision suffix behavior exactly.
}
```

- [ ] In the candidate loop, read metadata before allocating/copying, then classify exactly once.

```ts
const metadata = await readMetadata(candidate.filePath);
const kind = classifyTrack(metadata.duration);
if (kind === 'voice' && !options.includeVoice) {
  skipped += 1;
  continue;
}
const destinationDirectory = categoryDirectory(targetGameDirectory, kind);
await mkdir(destinationDirectory, { recursive: true });
const targetPath = await allocateTrackTarget(destinationDirectory, candidate.fileName);
```

- [ ] Insert `kind` with every new track. Preserve the existing hash duplicate logic, title extraction, progress callbacks, cancellation, and temporary extraction cleanup.

- [ ] When a duplicate row has missing duration and metadata enrichment changes its kind, move the existing library file to the correct category and call `updateTrackStorage`. If the database update fails, rename the file back before rethrowing.

- [ ] Update every importer call in tests to include `includeVoice`; use `false` unless the test specifically verifies voice import.

- [ ] Run `npm.cmd test -- tests/main/importer.test.ts` and verify all cases pass.

- [ ] Commit checkpoint: skip because this workspace has no Git repository.

## Task 4: Carry and validate the import option through IPC and the dialog

**Files:**

- Modify: `src/main/ipc/scan-handlers.ts`
- Modify: `src/renderer/src/components/scanner/ScanDialog.tsx`
- Modify: `tests/main/ipc.test.ts`
- Modify: `tests/renderer/scan-settings.test.tsx`

- [ ] Add IPC tests proving `includeVoice: true` reaches `importGameFolder`, omission is rejected, and a string such as `'true'` is rejected.

- [ ] Update validation without applying a hidden default in the main process.

```ts
assertNoUnexpectedKeys(value, ['sourcePath', 'gameName', 'deepScan', 'includeVoice'], 'options');
if (typeof value.includeVoice !== 'boolean') {
  throw invalidArgument('options.includeVoice must be a boolean');
}
return {
  sourcePath: value.sourcePath,
  gameName: value.gameName,
  deepScan: value.deepScan,
  includeVoice: value.includeVoice,
};
```

- [ ] Add a renderer test that opens the scan dialog and verifies “导入语音” is unchecked, then checks it and verifies the submitted request contains `includeVoice: true`.

- [ ] Add local dialog state and reset it whenever a fresh import dialog is opened.

```tsx
const [includeVoice, setIncludeVoice] = useState(false);

<label>
  <input
    type="checkbox"
    checked={includeVoice}
    onChange={(event) => setIncludeVoice(event.target.checked)}
  />
  导入语音
</label>
```

- [ ] Submit `{ sourcePath, gameName, deepScan, includeVoice }`. Add nearby help text: `25 秒及以下或无法识别时长的音频会归为语音。`

- [ ] Run:

```powershell
npm.cmd test -- tests/main/ipc.test.ts tests/renderer/scan-settings.test.tsx
```

- [ ] Commit checkpoint: skip because this workspace has no Git repository.

## Task 5: Migrate existing libraries without losing collection state

**Files:**

- Create: `src/main/services/library-layout-migration.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/main/metadata-backfill.test.ts`
- Create: `tests/main/library-layout-migration.test.ts`

- [ ] Write failing migration tests using a temporary library and real SQLite database. Cover:

  - existing long track moves from game root to `音乐`;
  - existing short track moves to `语音`;
  - missing duration is backfilled when readable, otherwise classified as voice;
  - track ID, custom name, favorite flag, playlist membership, and track number do not change;
  - running migration twice makes no second move and no duplicate row;
  - a simulated database update failure renames the file back to its original location;
  - one missing or locked file is logged and does not prevent later rows from migrating.

- [ ] Implement a dependency-injectable migration result.

```ts
export interface LayoutMigrationResult {
  inspected: number;
  moved: number;
  updated: number;
  errors: Array<{ trackId: string; filePath: string; message: string }>;
}

export async function migrateLibraryLayout(
  db: Database.Database,
  libraryPath: string,
  options: {
    readMetadata?: typeof readAudioMetadata;
    moveFile?: typeof rename;
    appendLog?: (line: string) => Promise<void>;
  } = {},
): Promise<LayoutMigrationResult> {
  // Iterate listTracks(db, null), classify, move if needed, then update DB.
}
```

- [ ] For each row, compute the target from the configured library root and database game name, not from string replacement on the old path. Treat a file already under the correct category directory as idempotently placed.

- [ ] Use this rollback sequence:

```ts
await mkdir(path.dirname(targetPath), { recursive: true });
await moveFile(sourcePath, targetPath);
try {
  updateTrackStorage(db, track.id, { filePath: targetPath, fileName: path.basename(targetPath), duration, kind });
} catch (error) {
  await moveFile(targetPath, sourcePath);
  throw error;
}
```

- [ ] Append one JSON line per migration error to `<userData>/logs/library-layout-migration.log`, including ISO timestamp, track ID, old path, intended path, and error message. Logging failures must not abort startup.

- [ ] In `bootstrapMainProcess`, keep metadata backfill before layout migration, then await layout migration before creating the renderer window. This prevents the UI from briefly receiving stale paths.

- [ ] Run:

```powershell
npm.cmd test -- tests/main/library-layout-migration.test.ts tests/main/metadata-backfill.test.ts tests/main/track-collections-metadata.test.ts
```

- [ ] Commit checkpoint: skip because this workspace has no Git repository.

## Task 6: Preserve nested paths during game rename and manual add operations

**Files:**

- Modify: `src/main/index.ts`
- Modify: `tests/main/game-service.test.ts`
- Modify the main-process manual-add service at its current implementation site in `src/main/index.ts`
- Modify: `tests/main/library-collections.test.ts`

- [ ] Add failing rename tests with one track in `旧游戏/音乐/a.ogg` and one in `旧游戏/语音/b.ogg`. Assert the renamed paths are `新游戏/音乐/a.ogg` and `新游戏/语音/b.ogg`, and both remain playable file paths.

- [ ] Ensure rename uses `path.relative(oldGameDirectory, track.filePath)` and joins that relative path to the new game directory. Reject any relative result that escapes with `..`.

- [ ] Add manual-add tests that classify selected files with the same duration rule, store them in the appropriate category, and default to music-only only if the existing manual-add UI has no voice opt-in. If manual add is exposed inside the scan dialog, pass its `includeVoice` value instead.

- [ ] Reuse `classifyTrack`, `categoryDirectory`, and `allocateTrackTarget`; do not add a second duration threshold.

- [ ] Run:

```powershell
npm.cmd test -- tests/main/game-service.test.ts tests/main/library-collections.test.ts
```

- [ ] Commit checkpoint: skip because this workspace has no Git repository.

## Task 7: Add the single-game `全部 / 音乐 / 语音` filter

**Files:**

- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/stores/libraryStore.ts`
- Modify: `tests/renderer/components.test.tsx`

- [ ] Add a renderer integration test with a selected game and mixed tracks. Assert:

  - the segmented filter is rendered only for the single-game library view;
  - `全部` is selected initially and requests `kind: null`;
  - clicking `音乐` requests `kind: 'music'`;
  - clicking `语音` requests `kind: 'voice'`;
  - switching to another game resets the filter to `全部`;
  - Recent, Favorites, All Music, Search, and Playlist views do not force a kind filter.

- [ ] Add state scoped to the selected game view.

```tsx
const [trackKindFilter, setTrackKindFilter] = useState<TrackKind | null>(null);

useEffect(() => {
  setTrackKindFilter(null);
}, [selectedGameId]);
```

- [ ] Include the filter only in the game query.

```ts
const query: TrackQuery = {
  section: activeSection,
  gameId: activeSection === 'library' ? selectedGameId : null,
  playlistId: activeSection === 'playlists' ? selectedPlaylistId : null,
  search: searchQuery,
  kind: activeSection === 'library' && selectedGameId ? trackKindFilter : null,
};
```

- [ ] Render an accessible three-button segmented control above the track list, using `aria-pressed` and the app's existing visual tokens. Keep tracks in the same list and player queue; this feature must not create separate game cards or sidebar collections.

- [ ] Run `npm.cmd test -- tests/renderer/components.test.tsx`.

- [ ] Commit checkpoint: skip because this workspace has no Git repository.

## Task 8: Regression verification and acceptance check

**Files:**

- Modify only files required to fix regressions discovered by these commands.

- [ ] Run the full test suite:

```powershell
npm.cmd test
```

Expected: every Vitest file passes, including GARbro extraction, playback, progress bar, collection, importer, migration, and renderer tests.

- [ ] Run static type checking:

```powershell
npx.cmd tsc --noEmit
```

Expected: zero TypeScript errors, especially no missing `kind` or `includeVoice` fields in fixtures.

- [ ] Verify bundled extraction resources and production build:

```powershell
npm.cmd run verify:resources
npm.cmd run build
```

Expected: GARbro and the XP3 bridge are still present; Electron/Vite build completes.

- [ ] Perform a bounded manual acceptance test with a small fixture folder containing one audio file over 25 seconds and one at or below 25 seconds:

  1. Import with “导入语音” off: only the long file appears under `音乐`; skipped increases by one.
  2. Import under a fresh game name with “导入语音” on: both category folders exist and both tracks appear.
  3. Select that game and switch among `全部 / 音乐 / 语音`.
  4. Favorite the voice track, add it to a playlist, restart the app, and verify it remains in both collections.
  5. Rename the game and confirm both nested category paths remain valid.

- [ ] Inspect `library-layout-migration.log`; no entry should exist for a clean migration. If a deliberately broken path was tested, its error must be present while the app still starts.

- [ ] Re-run `npm.cmd test`, `npx.cmd tsc --noEmit`, `npm.cmd run verify:resources`, and `npm.cmd run build` after any acceptance-test fix.

- [ ] Final checkpoint: summarize changed behavior, exact verification results, and any non-fatal migration errors. Git commit is skipped because the workspace has no Git repository.

