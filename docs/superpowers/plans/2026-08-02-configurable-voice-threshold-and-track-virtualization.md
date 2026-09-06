# Configurable Voice Threshold and Track Virtualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users persist a 1–60 second voice-classification threshold and keep 5,000-track library views responsive by rendering only the visible table rows.

**Architecture:** Extend the existing string-valued settings and scan request contracts with one validated numeric threshold, then pass it into the single classification function used by imports and duplicate refreshes. Add a dependency-free fixed-row virtual window calculator and make `TrackTable` render only that window with semantic spacer rows, while the player queue continues receiving the complete track array from `App`.

**Tech Stack:** Electron 31, React 18, TypeScript 5.6, Zustand, better-sqlite3, Vitest, Testing Library, CSS sticky table headers.

---

### Task 1: Make the classification threshold configurable

**Files:**

- Modify: `src/main/services/track-classification.ts`
- Modify: `tests/main/track-classification.test.ts`

- [ ] **Step 1: Write failing boundary and validation tests**

```ts
import {
  classifyTrack,
  normalizeVoiceThreshold,
  DEFAULT_VOICE_THRESHOLD_SECONDS,
} from '../../src/main/services/track-classification';

it('uses a caller-supplied threshold', () => {
  expect(classifyTrack(10.1, 10)).toBe('music');
  expect(classifyTrack(10, 10)).toBe('voice');
  expect(classifyTrack(null, 10)).toBe('voice');
});

it.each([
  [undefined, 25],
  [Number.NaN, 25],
  [0, 25],
  [61, 25],
  [1, 1],
  [25.5, 25.5],
  [60, 60],
])('normalizes threshold %s to %s', (input, expected) => {
  expect(normalizeVoiceThreshold(input)).toBe(expected);
});

expect(DEFAULT_VOICE_THRESHOLD_SECONDS).toBe(25);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd test -- tests/main/track-classification.test.ts`

Expected: FAIL because `normalizeVoiceThreshold` is missing and `classifyTrack` ignores the second argument.

- [ ] **Step 3: Implement the minimal shared rule**

```ts
export const DEFAULT_VOICE_THRESHOLD_SECONDS = 25;
export const MIN_VOICE_THRESHOLD_SECONDS = 1;
export const MAX_VOICE_THRESHOLD_SECONDS = 60;

export function isValidVoiceThreshold(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= MIN_VOICE_THRESHOLD_SECONDS
    && value <= MAX_VOICE_THRESHOLD_SECONDS;
}

export function normalizeVoiceThreshold(value: unknown): number {
  return isValidVoiceThreshold(value) ? value : DEFAULT_VOICE_THRESHOLD_SECONDS;
}

export function classifyTrack(
  duration: number | null | undefined,
  voiceThresholdSeconds = DEFAULT_VOICE_THRESHOLD_SECONDS,
): TrackKind {
  const threshold = normalizeVoiceThreshold(voiceThresholdSeconds);
  return typeof duration === 'number' && Number.isFinite(duration) && duration > threshold
    ? 'music'
    : 'voice';
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm.cmd test -- tests/main/track-classification.test.ts`

Expected: all classification tests pass, including the original 25-second behavior.

- [ ] **Step 5: Commit checkpoint**

Skip Git commit because this workspace has no Git repository. Mark Task 1 complete in this plan.

### Task 2: Persist the last threshold in application settings

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/main/database/migrations.ts`
- Modify: `src/main/services/settings.ts`
- Modify: `src/main/ipc/library-handlers.ts`
- Modify: `tests/main/database.test.ts`
- Modify: `tests/main/ipc.test.ts`
- Create: `tests/main/settings-threshold.test.ts`
- Modify Track/AppSettings fixtures in: `tests/renderer/components.test.tsx`, `tests/renderer/scan-settings.test.tsx`, `tests/renderer/game-editor.test.tsx`

- [ ] **Step 1: Write failing settings tests**

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/database/migrations';
import { setSetting } from '../../src/main/database/queries/settings';
import { readAppSettings } from '../../src/main/services/settings';

it('defaults the persisted voice threshold to 25 seconds', () => {
  const db = new Database(':memory:');
  migrate(db);
  expect(readAppSettings(db).voiceThresholdSeconds).toBe(25);
  db.close();
});

it.each(['', 'NaN', '0', '61'])('falls back for invalid stored value %s', (value) => {
  const db = new Database(':memory:');
  migrate(db);
  setSetting(db, 'voice_threshold_seconds', value);
  expect(readAppSettings(db).voiceThresholdSeconds).toBe(25);
  db.close();
});

it('reads a valid decimal threshold', () => {
  const db = new Database(':memory:');
  migrate(db);
  setSetting(db, 'voice_threshold_seconds', '18.5');
  expect(readAppSettings(db).voiceThresholdSeconds).toBe(18.5);
  db.close();
});
```

Add an IPC test proving the persistent setting cannot bypass main-process validation:

```ts
await expect(ipcMain.invoke(IPC_APP_SET_SETTING, 'voice_threshold_seconds', '60.1'))
  .rejects.toMatchObject({ code: 'DB_ERROR' });
expect(library.setSetting).not.toHaveBeenCalled();

await ipcMain.invoke(IPC_APP_SET_SETTING, 'voice_threshold_seconds', '18.5');
expect(library.setSetting).toHaveBeenCalledWith('voice_threshold_seconds', '18.5');
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/main/settings-threshold.test.ts tests/main/database.test.ts`

Expected: FAIL because `AppSettings` and `readAppSettings` do not expose the threshold.

- [ ] **Step 3: Extend shared contracts and schema seed**

```ts
export interface ScanStartRequest {
  sourcePath: string;
  gameName: string;
  deepScan: boolean;
  includeVoice: boolean;
  voiceThresholdSeconds: number;
}

export interface AppSettings {
  libraryPath: string;
  volume: number;
  playMode: PlayMode;
  lastTrackId: string | null;
  voiceThresholdSeconds: number;
  windowWidth?: number;
  windowHeight?: number;
}
```

Add `('voice_threshold_seconds', '25')` to `INITIAL_SCHEMA` and a version-4 migration that inserts the setting for databases already at version 3:

```ts
export const LATEST_SCHEMA_VERSION = 4;

if (userVersion < 4) {
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('voice_threshold_seconds', '25')").run();
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(4);
}
```

- [ ] **Step 4: Parse the persisted value through the shared validator**

```ts
const voiceThresholdRaw = Number(getSetting(db, 'voice_threshold_seconds') ?? '25');
return {
  // existing settings
  voiceThresholdSeconds: normalizeVoiceThreshold(voiceThresholdRaw),
};
```

- [ ] **Step 5: Update typed fixtures with `voiceThresholdSeconds: 25`**

Every object declared as `AppSettings` or returned by mocked `getSettings` must include the required field. Do not make the property optional to silence tests.

In `registerLibraryHandlers`, validate the special setting before delegating:

```ts
if (args[0] === 'voice_threshold_seconds') {
  const parsed = Number(args[1]);
  if (String(args[1]).trim() === '' || !isValidVoiceThreshold(parsed)) {
    throw invalidArgument('voice_threshold_seconds must be a number from 1 to 60');
  }
}
```

- [ ] **Step 6: Run and verify GREEN**

Run: `npm.cmd test -- tests/main/settings-threshold.test.ts tests/main/database.test.ts tests/main/ipc.test.ts`

Expected: settings tests pass and database `user_version` expectations are updated from 3 to 4.

- [ ] **Step 7: Commit checkpoint**

Skip because the workspace has no Git repository.

### Task 3: Validate and use the threshold throughout imports

**Files:**

- Modify: `src/main/ipc/scan-handlers.ts`
- Modify: `src/main/services/importer.ts`
- Modify: `src/main/index.ts`
- Modify: `tests/main/ipc.test.ts`
- Modify: `tests/main/importer.test.ts`
- Modify: `tests/main/importer.test.ts`
- Modify: `tests/main/ipc.test.ts`
- Modify: `tests/renderer/scan-settings.test.tsx`

- [ ] **Step 1: Write failing IPC tests**

```ts
await ipcMain.invoke(IPC_SCAN_START, {
  sourcePath: 'C:\\Games\\ATRI',
  gameName: 'ATRI',
  deepScan: true,
  includeVoice: false,
  voiceThresholdSeconds: 18.5,
});
await vi.waitFor(() => expect(importer.importGameFolder).toHaveBeenCalledWith(
  expect.objectContaining({ voiceThresholdSeconds: 18.5 }),
));

for (const invalid of [0, 60.1, Number.NaN, Number.POSITIVE_INFINITY, '25']) {
  await expect(ipcMain.invoke(IPC_SCAN_START, {
    sourcePath: 'C:\\Games\\ATRI', gameName: 'ATRI', deepScan: false,
    includeVoice: false, voiceThresholdSeconds: invalid,
  })).rejects.toMatchObject({ code: 'DB_ERROR' });
}
```

- [ ] **Step 2: Write a failing importer boundary test**

Use valid PCM WAV fixtures so the production scanner supplies real durations:

```ts
function wavWithDuration(durationSeconds: number): Buffer {
  const sampleRate = 8000;
  const dataSize = Math.round(sampleRate * durationSeconds);
  const buffer = Buffer.alloc(44 + dataSize, 128);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

await writeFile(path.join(source, 'equal.wav'), wavWithDuration(10));
await writeFile(path.join(source, 'above.wav'), wavWithDuration(10.1));
const result = await importGameFolder({
  sourcePath: source,
  libraryPath: library,
  gameName: 'Custom Threshold',
  deepScan: false,
  includeVoice: true,
  voiceThresholdSeconds: 10,
  signal: new AbortController().signal,
  onProgress: () => undefined,
  db,
});
const imported = listTracks(db, listGames(db)[0].id);
expect(imported.find((track) => track.fileName === 'equal.wav')?.kind).toBe('voice');
expect(imported.find((track) => track.fileName === 'above.wav')?.kind).toBe('music');
expect(result.copied).toBe(2);
```

Extend the existing duplicate-refresh test to pass `voiceThresholdSeconds: 10` and assert its refreshed 1-second WAV remains classified as `voice`.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `npm.cmd test -- tests/main/ipc.test.ts tests/main/importer.test.ts`

Expected: FAIL because the request rejects the new key and importer still uses 25 seconds.

- [ ] **Step 4: Validate the IPC value**

```ts
assertNoUnexpectedKeys(value, [
  'sourcePath', 'gameName', 'deepScan', 'includeVoice', 'voiceThresholdSeconds',
], 'options');
if (!isValidVoiceThreshold(value.voiceThresholdSeconds)) {
  throw invalidArgument('options.voiceThresholdSeconds must be a finite number from 1 to 60');
}
```

Return `voiceThresholdSeconds` in `validateStartRequest` without rounding it.

- [ ] **Step 5: Apply the threshold in both importer classification sites**

```ts
const kind = classifyTrack(candidate.duration, options.voiceThresholdSeconds);
```

```ts
const nextKind = classifyTrack(nextDuration, options.voiceThresholdSeconds);
```

Add `voiceThresholdSeconds` to `ImportOptions`. Manual selected-file imports in `src/main/index.ts` must read `readAppSettings(db).voiceThresholdSeconds` rather than hard-code 25.

- [ ] **Step 6: Update all existing scan/import fixtures**

Use `voiceThresholdSeconds: 25` for tests that are not explicitly testing custom behavior.

- [ ] **Step 7: Run and verify GREEN**

Run: `npm.cmd test -- tests/main/ipc.test.ts tests/main/importer.test.ts tests/main/track-classification.test.ts`

Expected: all focused tests pass.

- [ ] **Step 8: Commit checkpoint**

Skip because the workspace has no Git repository.

### Task 4: Add the remembered threshold control to the import dialog

**Files:**

- Modify: `src/renderer/src/components/scanner/ScanDialog.tsx`
- Modify: `src/renderer/src/styles/globals.css`
- Modify: `tests/renderer/scan-settings.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

```tsx
window.galMusic = {
  selectFolder: vi.fn().mockResolvedValue('C:/Games/ATRI'),
  getSettings: vi.fn().mockResolvedValue({
    libraryPath: 'C:/Music/GalMusic', volume: 0.8, playMode: 'list-loop',
    lastTrackId: null, voiceThresholdSeconds: 18.5,
  }),
  setSetting: vi.fn().mockResolvedValue(undefined),
  startScan: vi.fn().mockResolvedValue('scan-1'),
  onScanProgress: vi.fn().mockReturnValue(() => undefined),
  onScanResult: vi.fn().mockReturnValue(() => undefined),
} as unknown as typeof window.galMusic;

render(<ScanDialog onClose={vi.fn()} />);
const input = await screen.findByRole('spinbutton', { name: '语音时长阈值' });
expect(input).toHaveValue(18.5);
fireEvent.change(input, { target: { value: '12.5' } });
fireEvent.click(screen.getByRole('button', { name: /开始导入/ }));
await waitFor(() => expect(window.galMusic.setSetting).toHaveBeenCalledWith('voice_threshold_seconds', '12.5'));
expect(window.galMusic.startScan).toHaveBeenCalledWith(expect.objectContaining({ voiceThresholdSeconds: 12.5 }));
```

Add separate cases for empty, 0, and 60.1 values; each must show an alert, disable the start button, and call neither `setSetting` nor `startScan`.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/renderer/scan-settings.test.tsx`

Expected: FAIL because the spinbutton does not exist.

- [ ] **Step 3: Load, validate, save, then start**

```tsx
const [voiceThresholdInput, setVoiceThresholdInput] = useState('25');
const voiceThresholdSeconds = Number(voiceThresholdInput);
const thresholdValid = voiceThresholdInput.trim() !== ''
  && isValidVoiceThreshold(voiceThresholdSeconds);

useEffect(() => {
  void getApi()?.getSettings?.()
    .then((settings) => setVoiceThresholdInput(String(settings.voiceThresholdSeconds)))
    .catch(() => undefined);
}, []);
```

Inside `startScan`, before setting the running phase:

```ts
if (!thresholdValid) {
  setError('语音时长阈值必须在 1–60 秒之间。');
  return;
}
await api.setSetting?.('voice_threshold_seconds', String(voiceThresholdSeconds));
const started = await api.startScan({
  sourcePath,
  gameName: gameName.trim(),
  deepScan,
  includeVoice,
  voiceThresholdSeconds,
});
```

- [ ] **Step 4: Render the numeric control**

```tsx
<label className="scan-dialog__field scan-dialog__threshold">
  <span className="scan-dialog__field-heading">
    <span>语音时长阈值</span><small>允许 1–60 秒</small>
  </span>
  <input
    aria-label="语音时长阈值"
    type="number"
    min="1"
    max="60"
    step="0.1"
    value={voiceThresholdInput}
    onChange={(event) => setVoiceThresholdInput(event.target.value)}
    disabled={phase === 'running'}
  />
  <small>{thresholdValid
    ? `${voiceThresholdSeconds} 秒及以下或无法识别时长的音频会归为语音`
    : '请输入 1–60 之间的秒数'}</small>
</label>
```

- [ ] **Step 5: Run and verify GREEN**

Run: `npm.cmd test -- tests/renderer/scan-settings.test.tsx`

Expected: remembered-value, validation, persistence, and scan request tests pass.

- [ ] **Step 6: Commit checkpoint**

Skip because the workspace has no Git repository.

### Task 5: Implement a pure virtual-window calculator

**Files:**

- Create: `src/renderer/src/components/library/virtual-track-window.ts`
- Create: `tests/renderer/virtual-track-window.test.ts`

- [ ] **Step 1: Write the failing calculator tests**

```ts
import { calculateVirtualTrackWindow } from '../../src/renderer/src/components/library/virtual-track-window';

it('limits a 5000-track list to the viewport plus overscan', () => {
  expect(calculateVirtualTrackWindow({
    itemCount: 5000, rowHeight: 60, viewportHeight: 600, scrollTop: 0, overscan: 8,
  })).toEqual({ start: 0, end: 18, topSpacer: 0, bottomSpacer: 298920, totalHeight: 300000 });
});

it('clamps the final window to the list end', () => {
  const result = calculateVirtualTrackWindow({
    itemCount: 5000, rowHeight: 60, viewportHeight: 600, scrollTop: 299400, overscan: 8,
  });
  expect(result.end).toBe(5000);
  expect(result.start).toBeGreaterThan(4900);
  expect(result.bottomSpacer).toBe(0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/renderer/virtual-track-window.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the calculator**

```ts
export interface VirtualTrackWindowInput {
  itemCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan: number;
}

export function calculateVirtualTrackWindow(input: VirtualTrackWindowInput) {
  const visibleStart = Math.floor(Math.max(0, input.scrollTop) / input.rowHeight);
  const visibleCount = Math.ceil(Math.max(input.rowHeight, input.viewportHeight) / input.rowHeight);
  const start = Math.max(0, visibleStart - input.overscan);
  const end = Math.min(input.itemCount, visibleStart + visibleCount + input.overscan);
  const totalHeight = input.itemCount * input.rowHeight;
  return {
    start,
    end,
    topSpacer: start * input.rowHeight,
    bottomSpacer: Math.max(0, totalHeight - end * input.rowHeight),
    totalHeight,
  };
}
```

- [ ] **Step 4: Run and verify GREEN**

Run: `npm.cmd test -- tests/renderer/virtual-track-window.test.ts`

Expected: both calculations pass.

- [ ] **Step 5: Commit checkpoint**

Skip because the workspace has no Git repository.

### Task 6: Virtualize TrackTable without changing callbacks or the player queue

**Files:**

- Modify: `src/renderer/src/components/library/TrackTable.tsx`
- Modify: `src/renderer/src/styles/globals.css`
- Create: `tests/renderer/track-table-virtualization.test.tsx`
- Modify: `tests/renderer/components.test.tsx`

- [ ] **Step 1: Write a failing 5,000-track integration test**

```tsx
const tracks = Array.from({ length: 5000 }, (_, index) => ({
  ...baseTrack,
  id: `track-${index}`,
  fileName: `track-${index}.ogg`,
  displayName: `Track ${index}`,
  trackNumber: index + 1,
}));

const { rerender } = render(<TrackTable tracks={tracks} onPlayTrack={onPlayTrack} />);
const scroller = screen.getByTestId('track-table-scroller');
expect(screen.getAllByTestId(/^track-row-/).length).toBeLessThanOrEqual(26);
expect(screen.queryByTestId('track-row-track-4999')).not.toBeInTheDocument();

Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 600 });
fireEvent.scroll(scroller, { target: { scrollTop: 299400 } });
expect(await screen.findByTestId('track-row-track-4999')).toBeInTheDocument();
expect(screen.queryByTestId('track-row-track-0')).not.toBeInTheDocument();

rerender(<TrackTable tracks={tracks.slice(0, 10)} onPlayTrack={onPlayTrack} />);
expect(scroller.scrollTop).toBe(0);
```

Double-click one visible row and assert `onPlayTrack` receives `tracks[index]`, not a cloned or partial object.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test -- tests/renderer/track-table-virtualization.test.tsx`

Expected: FAIL because all 5,000 rows are mounted and the scroller test ID is missing.

- [ ] **Step 3: Add fixed-height virtual state to TrackTable**

```tsx
const TRACK_ROW_HEIGHT = 60;
const TRACK_OVERSCAN = 8;
const FALLBACK_VIEWPORT_HEIGHT = 600;
const scrollerRef = useRef<HTMLDivElement>(null);
const [scrollTop, setScrollTop] = useState(0);
const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT);

const window = calculateVirtualTrackWindow({
  itemCount: tracks.length,
  rowHeight: TRACK_ROW_HEIGHT,
  viewportHeight,
  scrollTop,
  overscan: TRACK_OVERSCAN,
});
const visibleTracks = tracks.slice(window.start, window.end);
```

Use `ResizeObserver` when available and `clientHeight || FALLBACK_VIEWPORT_HEIGHT` otherwise. On `tracks` identity change, set `scrollTop` to zero and assign `scrollerRef.current.scrollTop = 0`.

- [ ] **Step 4: Render semantic spacer rows and visible tracks**

```tsx
<div
  ref={scrollerRef}
  className="track-table-wrap"
  data-testid="track-table-scroller"
  tabIndex={0}
  aria-label={`曲目列表，共 ${tracks.length} 首`}
  onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
>
  <table className="track-table">
    <caption className="sr-only">曲目列表</caption>
    <thead>
      <tr>
        <th scope="col" className="track-table__index">#</th>
        <th scope="col">曲目</th>
        <th scope="col">格式</th>
        <th scope="col">时长</th>
        <th scope="col">大小</th>
        <th scope="col" className="track-table__actions"><span className="sr-only">操作</span></th>
      </tr>
    </thead>
    <tbody>
      {window.topSpacer > 0 && <tr aria-hidden="true"><td colSpan={6} style={{ height: window.topSpacer, padding: 0 }} /></tr>}
      {visibleTracks.map((track, offset) => {
        const index = window.start + offset;
        return (
          <TrackRow
            key={track.id}
            track={track}
            index={track.trackNumber || index + 1}
            isPlaying={track.id === playingTrackId}
            onPlayTrack={onPlayTrack ?? playTrack ?? onPlay ?? onTrackPlay}
            onRename={onRename}
            onDelete={onDelete}
            onOpenFolder={onOpenFolder}
            onToggleFavorite={onToggleFavorite}
            onAddToPlaylist={onAddToPlaylist}
            onRemoveFromPlaylist={onRemoveFromPlaylist}
          />
        );
      })}
      {window.bottomSpacer > 0 && <tr aria-hidden="true"><td colSpan={6} style={{ height: window.bottomSpacer, padding: 0 }} /></tr>}
    </tbody>
  </table>
</div>
```

- [ ] **Step 5: Make the table body scroll efficiently**

```css
.track-table-wrap {
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 300px;
  max-height: clamp(360px, calc(100vh - 390px), 720px);
  contain: layout paint;
  scrollbar-gutter: stable;
}

.track-table thead {
  position: sticky;
  z-index: 2;
  top: 0;
  background: #14232b;
}
```

- [ ] **Step 6: Run and verify GREEN**

Run: `npm.cmd test -- tests/renderer/track-table-virtualization.test.tsx tests/renderer/components.test.tsx`

Expected: only the virtual window is mounted, scrolling reaches the last row, callbacks retain full objects, and existing renderer tests pass.

- [ ] **Step 7: Commit checkpoint**

Skip because the workspace has no Git repository.

### Task 7: Full regression and performance verification

**Files:**

- Expected fixture-only regression files: `tests/renderer/player-bar.test.tsx`, `tests/renderer/player-engine.test.ts`, `tests/main/game-service.test.ts`, and `tests/main/library-collections.test.ts`. Modify one only when the named verification command reports a missing required threshold field or a query expectation changed by the new contract.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm.cmd test`

Expected: all test files pass, including GARbro extraction, classification, settings, importer, player, collections, virtual-window, and 5,000-row tests.

- [ ] **Step 2: Run static type checking**

Run: `npx.cmd tsc --noEmit`

Expected: zero errors; every `ScanStartRequest` and `AppSettings` fixture contains `voiceThresholdSeconds`.

- [ ] **Step 3: Verify resources and production build**

Run: `npm.cmd run verify:resources`

Expected: bundled GARbro and XP3 bridge verification succeeds.

Run: `npm.cmd run build`

Expected: main, preload, and renderer bundles build successfully.

- [ ] **Step 4: Manual acceptance**

Start with `npm.cmd run dev`, then verify:

1. Open import: threshold is 25 on first use.
2. Change to 18.5 and start import: the value is sent and saved.
3. Reopen import: threshold is 18.5.
4. Enter 0, 60.1, or clear the field: import is disabled and an error is visible.
5. Import audio around the chosen boundary: equal duration is voice and greater duration is music.
6. Open a collection containing thousands of tracks: initial render remains responsive and fast scrolling does not mount all rows.
7. Play, favorite, rename, and delete visible rows; the player queue still contains the full filtered list.

- [ ] **Step 5: Final checkpoint**

Record exact test totals, type-check result, resource verification, build result, and any remaining limitation. Git commit remains skipped because this workspace is not a Git repository.
