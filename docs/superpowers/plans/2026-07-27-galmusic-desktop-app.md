# GalMusic Desktop App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Windows-only, offline Electron desktop app that imports galgame audio (including bundled GARbro archives), stores durable game/track records in SQLite, and plays the library through a distinctive “Afterglow Teal” interface.

**Architecture:** Keep Node-only work in the Electron main process: SQLite, path validation, scanning workers, streaming copies, and GARbro child processes. Expose a typed, allow-listed API through `contextBridge`; keep React/Zustand/Howler in the renderer. Use `electron-vite` for one reproducible dev/build pipeline and dependency externalization for `better-sqlite3`.

**Tech Stack:** Electron 31, React 18, TypeScript 5, Vite 5 via electron-vite, Zustand 4, Howler 2, better-sqlite3 11, music-metadata 10, uuid 10, lucide-react, Vitest, Testing Library, electron-builder, bundled GARbro CLI.

---

## File map

Create this structure before implementing behavior:

```text
galgame-music-app/
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json
├─ vitest.config.ts
├─ electron-builder.yml
├─ src/
│  ├─ main/index.ts
│  ├─ preload/index.ts
│  ├─ shared/
│  │  ├─ types.ts
│  │  ├─ errors.ts
│  │  ├─ ipc.ts
│  │  └─ paths.ts
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx
│        ├─ App.tsx
│        ├─ styles/globals.css
│        ├─ stores/libraryStore.ts
│        ├─ stores/playerStore.ts
│        ├─ stores/uiStore.ts
│        ├─ player/PlayerEngine.ts
│        ├─ components/layout/TitleBar.tsx
│        ├─ components/layout/Sidebar.tsx
│        ├─ components/layout/PlayerBar.tsx
│        ├─ components/library/GameList.tsx
│        ├─ components/library/TrackTable.tsx
│        ├─ components/library/TrackRow.tsx
│        ├─ components/scanner/ScanDialog.tsx
│        ├─ components/scanner/ScanProgress.tsx
│        ├─ components/scanner/ScanResult.tsx
│        └─ components/ui/EmptyState.tsx
├─ src/main/
│  ├─ database/connection.ts
│  ├─ database/migrations.ts
│  ├─ database/queries/games.ts
│  ├─ database/queries/tracks.ts
│  ├─ database/queries/settings.ts
│  └─ services/
│     ├─ settings.ts
│     ├─ hash.ts
│     ├─ formats.ts
│     ├─ metadata.ts
│     ├─ file-copy.ts
│     ├─ scanner.ts
│     ├─ extractor.ts
│     ├─ garbro-runner.ts
│     └─ importer.ts
├─ resources/tools/garbro/GARbro.exe
├─ resources/tools/extract-rpa.mjs
├─ tests/
│  ├─ setup.ts
│  ├─ shared/smoke.test.ts
│  ├─ shared/paths.test.ts
│  ├─ main/database.test.ts
│  ├─ main/scanner.test.ts
│  ├─ main/importer.test.ts
│  ├─ main/ipc.test.ts
│  ├─ renderer/player-engine.test.ts
│  └─ renderer/components.test.tsx
└─ scripts/verify-resources.mjs
```

The source tree is intentionally split by responsibility. Database queries do not scan files; the scanner does not write SQLite; React components do not call Node APIs.

### Task 1: Bootstrap the Electron/React workspace and test harness

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`

- [ ] **Step 1: Write the failing smoke test**

Create `tests/setup.ts` and `tests/shared/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs TypeScript tests', () => {
    expect(typeof 'GalMusic').toBe('string');
  });
});
```

- [ ] **Step 2: Run the test before installing the project**

Run: `npm test -- --run tests/shared/smoke.test.ts`  
Expected: fail because the project has no `test` script or Vitest dependency.

- [ ] **Step 3: Add the minimal project manifest and Vite config**

Use this dependency contract in `package.json`:

```json
{
  "name": "galmusic",
  "version": "0.1.0",
  "private": true,
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "package:win": "npm run build && electron-builder --win"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "better-sqlite3": "^11.3.0",
    "howler": "^2.2.4",
    "lucide-react": "^0.468.0",
    "music-metadata": "^10.7.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "uuid": "^10.0.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "electron": "^31.7.7",
    "electron-builder": "^25.1.8",
    "electron-vite": "^2.3.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

`electron.vite.config.ts` must externalize native dependencies and point the renderer at `src/renderer`:

```ts
import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
  },
});
```

`vitest.config.ts` must use Node for main-process tests and jsdom for React tests:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
```

Create `tsconfig.json` with strict shared types and JSX support:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests", "electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Add the minimal renderer entry and make the smoke test pass**

Create `src/renderer/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>GalMusic</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

Create `src/renderer/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function Bootstrap() {
  return <main data-testid="bootstrap">GalMusic</main>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Bootstrap /></StrictMode>,
);
```

Run: `npm install` then `npm test -- --run tests/shared/smoke.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the bootstrap checkpoint**

Run: `git add package.json electron.vite.config.ts tsconfig.json vitest.config.ts tests src/renderer && git commit -m "chore: bootstrap Electron React workspace"`.

### Task 2: Define shared types, errors, IPC names, and path safety

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/errors.ts`
- Create: `src/shared/ipc.ts`
- Create: `src/shared/paths.ts`
- Test: `tests/shared/paths.test.ts`

- [ ] **Step 1: Write path and error tests first**

```ts
import { describe, expect, it } from 'vitest';
import { assertWithin, defaultLibraryPath } from '../../src/shared/paths';

describe('path safety', () => {
  it('uses Music/GalMusic as the default library', () => {
    expect(defaultLibraryPath('C:/Users/Ada')).toBe('C:/Users/Ada/Music/GalMusic');
  });

  it('rejects a path outside the allowed root', () => {
    expect(() => assertWithin('C:/library/other/file.ogg', 'C:/library/game'))
      .toThrowError('Path is outside the allowed root');
  });
});
```

- [ ] **Step 2: Run the tests and verify the helpers are missing**

Run: `npm test -- --run tests/shared/paths.test.ts`  
Expected: FAIL with module/function-not-found errors.

- [ ] **Step 3: Implement the shared contracts**

`src/shared/types.ts` must define `Game`, `Track`, `Playlist`, `PlayMode`, `ScanProgress`, `ScanResult`, `LibraryStats`, and `PlayerState` using the field names from the design spec. `src/shared/errors.ts` must define:

```ts
export type ErrorCode =
  | 'FILE_NOT_FOUND' | 'PERMISSION_DENIED' | 'EXTRACT_FAILED'
  | 'UNSUPPORTED_FORMAT' | 'DB_ERROR' | 'DUPLICATE_TRACK'
  | 'PLAYBACK_ERROR' | 'CANCELLED';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly userMessage: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
```

`src/shared/ipc.ts` exports string constants for every request/event in the spec and a `GalMusicAPI` interface. `src/shared/paths.ts` implements:

```ts
import path from 'node:path';

export const defaultLibraryPath = (userDataRoot: string) =>
  path.normalize(path.join(userDataRoot, 'Music', 'GalMusic'));

export function assertWithin(candidate: string, root: string): string {
  const normalizedCandidate = path.resolve(candidate);
  const normalizedRoot = path.resolve(root);
  const relative = path.relative(normalizedRoot, normalizedCandidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside the allowed root');
  }
  return normalizedCandidate;
}
```

- [ ] **Step 4: Run the shared tests**

Run: `npm test -- --run tests/shared/paths.test.ts`  
Expected: PASS.

### Task 3: Build SQLite migrations and query modules

**Files:**
- Create: `src/main/database/connection.ts`
- Create: `src/main/database/migrations.ts`
- Create: `src/main/database/queries/games.ts`
- Create: `src/main/database/queries/tracks.ts`
- Create: `src/main/database/queries/settings.ts`
- Test: `tests/main/database.test.ts`

- [ ] **Step 1: Write database behavior tests**

```ts
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/main/database/migrations';
import { createGame, listGames } from '../../src/main/database/queries/games';

describe('library database', () => {
  it('migrates and creates a game with zero tracks', () => {
    const db = new Database(':memory:');
    migrate(db);
    const game = createGame(db, { id: 'g1', name: 'ATRI' });
    expect(game.name).toBe('ATRI');
    expect(listGames(db)[0].trackCount).toBe(0);
  });

  it('cascades track deletion when a game is removed', () => {
    const db = new Database(':memory:');
    migrate(db);
    db.prepare('INSERT INTO games (id, name) VALUES (?, ?)').run('g1', 'ATRI');
    db.prepare(`INSERT INTO tracks
      (id, game_id, file_path, file_name, file_hash, format, file_size)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('t1', 'g1', 'C:/lib/a.ogg', 'a.ogg', 'h1', 'ogg', 10);
    db.prepare('DELETE FROM games WHERE id = ?').run('g1');
    expect(db.prepare('SELECT COUNT(*) AS count FROM tracks').get()).toEqual({ count: 0 });
  });
});
```

- [ ] **Step 2: Run the tests and confirm the schema is absent**

Run: `npm test -- --run tests/main/database.test.ts`  
Expected: FAIL because `migrate` and the query modules do not exist.

- [ ] **Step 3: Implement migrations and connection**

Create tables `games`, `tracks`, `playlists`, `playlist_tracks`, and `settings`; enable foreign keys and create indexes on `tracks.game_id`, `tracks.file_hash`, and `tracks.custom_name`. `connection.ts` must create the parent directory, open `galmusic.db`, set `PRAGMA journal_mode = WAL`, and call `migrate(db)` exactly once per connection.

- [ ] **Step 4: Implement parameterized query functions**

Expose focused functions: `createGame`, `listGames`, `getGame`, `deleteGame`, `setGameCover`, `listTracks`, `insertTrack`, `updateTrack`, `deleteTrack`, `findTrackByHash`, `getSetting`, and `setSetting`. `listGames` must include `COUNT(tracks.id) AS trackCount`; all writes must use prepared statements.

- [ ] **Step 5: Run the database tests**

Run: `npm test -- --run tests/main/database.test.ts`  
Expected: PASS.

### Task 4: Implement formats, metadata, streaming copies, and hashing

**Files:**
- Create: `src/main/services/formats.ts`
- Create: `src/main/services/metadata.ts`
- Create: `src/main/services/hash.ts`
- Create: `src/main/services/file-copy.ts`
- Test: `tests/main/scanner.test.ts`

- [ ] **Step 1: Write deterministic format/hash/copy tests**

```ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAudioFile } from '../../src/main/services/formats';
import { hashFile } from '../../src/main/services/hash';
import { copyFileStreaming } from '../../src/main/services/file-copy';

describe('file utilities', () => {
  it('accepts galgame audio formats case-insensitively', () => {
    expect(isAudioFile('BGM.OGG')).toBe(true);
    expect(isAudioFile('cover.png')).toBe(false);
  });

  it('copies bytes and returns a stable MD5', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'galmusic-'));
    const source = path.join(dir, 'source.ogg');
    const target = path.join(dir, 'library', 'source.ogg');
    await writeFile(source, Buffer.from('fixture-audio'));
    await copyFileStreaming(source, target);
    expect(await readFile(target, 'utf8')).toBe('fixture-audio');
    expect(await hashFile(target)).toBe('a4bf5a6a598c0c3a432dd40721ef1fb8');
  });
});
```

- [ ] **Step 2: Run the tests and verify the utilities are missing**

Run: `npm test -- --run tests/main/scanner.test.ts`  
Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement the utilities**

`formats.ts` must export `AUDIO_EXTENSIONS`, `ARCHIVE_EXTENSIONS`, `isAudioFile`, and `isArchiveFile`. `hash.ts` must stream the file through MD5 and expose a `quickFingerprint` using file size plus the first 4096 bytes. `file-copy.ts` must use `createReadStream`/`createWriteStream`, create the target parent, and resolve only after the write stream closes. `metadata.ts` must call `music-metadata.parseFile` and return duration, format, and byte size without making metadata failure fatal.

- [ ] **Step 4: Run the utility tests**

Run: `npm test -- --run tests/main/scanner.test.ts`  
Expected: PASS.

### Task 5: Implement the scanner worker and progress model

**Files:**
- Create: `src/main/services/scanner.ts`
- Create: `src/main/services/scanner-worker.ts`
- Modify: `src/shared/types.ts`
- Test: `tests/main/scanner.test.ts`

- [ ] **Step 1: Add scanner tests for recursion, filtering, and cancellation**

The test fixture must contain `music/one.ogg`, `music/two.mp3`, `cover.png`, and a nested `ignore.txt`. Assert that the scanner returns exactly the two audio files, emits `phase: 'scanning'`, and throws `AppError('CANCELLED', ...)` when an `AbortController` is aborted before the second file.

- [ ] **Step 2: Run the scanner tests before implementation**

Run: `npm test -- --run tests/main/scanner.test.ts`  
Expected: FAIL because `scanFolder` is not implemented.

- [ ] **Step 3: Implement the scanner contract**

Use this interface:

```ts
export interface ScanOptions {
  sourcePath: string;
  deepScan: boolean;
  signal: AbortSignal;
  onProgress(progress: ScanProgress): void;
}

export interface AudioCandidate {
  sourcePath: string;
  fileName: string;
  format: string;
  fileSize: number;
  duration: number | null;
  fileHash: string;
}

export async function scanFolder(options: ScanOptions): Promise<AudioCandidate[]>;
```

Walk directories with `readdir({ withFileTypes: true })`, normalize every path, skip inaccessible entries with an error record, and check `signal.aborted` before each file. The worker posts serializable progress messages and never writes to SQLite or the destination library.

- [ ] **Step 4: Run the scanner tests**

Run: `npm test -- --run tests/main/scanner.test.ts`  
Expected: PASS.

### Task 6: Integrate the bundled GARbro extractor

**Files:**
- Create: `src/main/services/garbro-runner.ts`
- Create: `src/main/services/extractor.ts`
- Create: `resources/tools/extract-rpa.mjs`
- Create: `tests/fixtures/fake-garbro.cjs`
- Modify: `tests/main/scanner.test.ts`

- [ ] **Step 1: Write extractor tests with an injected fake runner**

The fake runner copies `tests/fixtures/archive-fixture/track.ogg` into the requested output directory and writes one progress line. Assert that `extractArchive` returns the output directory, forwards progress as `phase: 'extracting'`, and maps a non-zero exit to `AppError` code `EXTRACT_FAILED`.

- [ ] **Step 2: Run the extractor tests before implementation**

Run: `npm test -- --run tests/main/scanner.test.ts`  
Expected: FAIL because the extractor modules do not exist.

- [ ] **Step 3: Implement the runner and extractor**

`garbro-runner.ts` must call `spawn(garbroPath, ['--extract', archivePath, '--output', outputDir], { windowsHide: true })`, collect stderr, resolve only on exit code 0, and kill the child when the abort signal fires. `extractor.ts` must select the internal RPA script for `.rpa`, GARbro for `.xp3/.arc/.pak`, create a unique temporary directory under `os.tmpdir()`, and expose `disposeTempDir()` for the importer cleanup.

- [ ] **Step 4: Run the extractor tests**

Run: `npm test -- --run tests/main/scanner.test.ts`  
Expected: PASS.

### Task 7: Orchestrate import, deduplication, and scan results

**Files:**
- Create: `src/main/services/importer.ts`
- Modify: `src/main/database/queries/games.ts`
- Modify: `src/main/database/queries/tracks.ts`
- Test: `tests/main/importer.test.ts`

- [ ] **Step 1: Write the end-to-end import test**

Create a temporary source folder with one ordinary `.ogg`, one archive handled by a fake extractor, and one duplicate hash. Assert the returned result is `{ found: 3, extracted: 1, copied: 2, skipped: 1, errors: [] }`, the game exists, and two files exist under `<library>/<gameName>/`.

- [ ] **Step 2: Run the importer test before implementation**

Run: `npm test -- --run tests/main/importer.test.ts`  
Expected: FAIL because `importGameFolder` is not implemented.

- [ ] **Step 3: Implement the importer**

Use this signature:

```ts
export interface ImportOptions {
  sourcePath: string;
  libraryPath: string;
  gameName: string;
  deepScan: boolean;
  signal: AbortSignal;
  onProgress(progress: ScanProgress): void;
}

export async function importGameFolder(options: ImportOptions): Promise<ScanResult>;
```

The importer must create `<libraryPath>/<gameName>`, scan ordinary files, extract archives into temporary directories, merge candidates, check `findTrackByHash` before copying, generate collision-safe filenames, insert rows in a SQLite transaction, and always remove temporary directories in `finally`. It must emit `scanning`, `extracting`, and `copying` progress and preserve successful rows when a later candidate fails.

- [ ] **Step 4: Run the importer tests**

Run: `npm test -- --run tests/main/importer.test.ts`  
Expected: PASS.

### Task 8: Wire the main process and typed preload API

**Files:**
- Modify: `src/main/index.ts`
- Create: `src/main/ipc/library-handlers.ts`
- Create: `src/main/ipc/scan-handlers.ts`
- Create: `src/main/ipc/dialog-handlers.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/main/ipc.test.ts`

- [ ] **Step 1: Write IPC contract tests**

Mock `ipcMain.handle`, `ipcMain.on`, and a temporary library service. Assert that `library:get-games` returns query results, `scan:start` returns a request id, `scan:cancel` aborts the matching controller, and unknown renderer arguments are rejected before reaching the filesystem.

- [ ] **Step 2: Run IPC tests before implementation**

Run: `npm test -- --run tests/main/ipc.test.ts`  
Expected: FAIL because the handler modules are missing.

- [ ] **Step 3: Implement the main window and handlers**

Create a `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and the preload path. In development load `process.env.ELECTRON_RENDERER_URL`; in production load the bundled `index.html`. Register handlers for every request in `src/shared/ipc.ts`, validate strings and paths, and forward scan progress with `webContents.send('scan:progress', progress)`.

- [ ] **Step 4: Implement the allow-listed preload bridge**

Expose only `window.galMusic` methods matching `GalMusicAPI`; do not expose `ipcRenderer` itself. Convert thrown `AppError` instances into `{ code, userMessage }` serializable objects.

- [ ] **Step 5: Run IPC tests and the renderer build**

Run: `npm test -- --run tests/main/ipc.test.ts` then `npm run build`  
Expected: PASS and a successful Electron/Vite build.

### Task 9: Implement the Howler player engine and Zustand state

**Files:**
- Create: `src/renderer/src/player/PlayerEngine.ts`
- Create: `src/renderer/src/stores/playerStore.ts`
- Create: `src/renderer/src/hooks/usePlayer.ts`
- Test: `tests/renderer/player-engine.test.ts`

- [ ] **Step 1: Write player tests against a mocked Howl**

Mock `howler.Howl` and assert `play`, `pause`, `seek`, `volume`, and `unload` calls. Add tests for sequential, random, single-loop, and list-loop end behavior; random mode must not choose the current index when the queue has more than one item.

- [ ] **Step 2: Run player tests before implementation**

Run: `npm test -- --run tests/renderer/player-engine.test.ts`  
Expected: FAIL because the engine and store are missing.

- [ ] **Step 3: Implement `PlayerEngine`**

Construct Howl with `{ src: [fileUrl], html5: true, format: [extension], volume }`, unload the previous Howl before loading a new track, emit play/pause/time/end/error callbacks, and expose `play`, `pause`, `toggle`, `seek`, `setVolume`, `setQueue`, and `dispose`.

- [ ] **Step 4: Implement `playerStore`**

Store `currentTrack`, `playlist`, `playMode`, `isPlaying`, `volume`, `progress`, `duration`, and `currentTime`. Persist volume, play mode, and last track id through `app:set-setting`; never auto-play after restart.

- [ ] **Step 5: Run player tests**

Run: `npm test -- --run tests/renderer/player-engine.test.ts`  
Expected: PASS.

### Task 10: Build the renderer shell and library states

**Files:**
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/stores/libraryStore.ts`
- Create: `src/renderer/src/stores/uiStore.ts`
- Create: `src/renderer/src/components/layout/TitleBar.tsx`
- Create: `src/renderer/src/components/layout/Sidebar.tsx`
- Create: `src/renderer/src/components/layout/PlayerBar.tsx`
- Create: `src/renderer/src/components/library/GameList.tsx`
- Create: `src/renderer/src/components/library/TrackTable.tsx`
- Create: `src/renderer/src/components/library/TrackRow.tsx`
- Create: `src/renderer/src/components/ui/EmptyState.tsx`
- Create: `src/renderer/src/styles/globals.css`
- Test: `tests/renderer/components.test.tsx`

- [ ] **Step 1: Write component tests for the required states**

Mock `window.galMusic.getGames` and `getTracks`. Assert the app renders the empty-library CTA when no games exist, renders a game list and track rows when data exists, and calls `playTrack` after a track row double-click.

- [ ] **Step 2: Run component tests before implementation**

Run: `npm test -- --run tests/renderer/components.test.tsx`  
Expected: FAIL because `App` and the components are missing.

- [ ] **Step 3: Implement stores and layout**

`libraryStore` loads games on mount, loads tracks when `selectedGameId` changes, and exposes `renameTrack`, `deleteTrack`, and `search`. `uiStore` owns the selected game, search text, scan dialog visibility, and current modal. `App` composes `TitleBar`, `Sidebar`, main content, and `PlayerBar` without direct Node access.

- [ ] **Step 4: Implement the Afterglow Teal visual system**

In `globals.css`, define the approved tokens (`#0E171E`, `#14232B`, `#1B3039`, `#7DE2D1`, `#3EA59B`, `#F6A4C0`, `#E8F3F4`, `#90A8AD`), use layered gradients/noise, 12–16px radii, focus-visible outlines, compact metadata typography, and a reduced-motion media query. Keep the title bar and content z-index above decorations.

- [ ] **Step 5: Run component tests and inspect the dev window**

Run: `npm test -- --run tests/renderer/components.test.tsx` then `npm run dev`  
Expected: PASS; the window shows the dark blue-green library shell and an accessible empty state.

### Task 11: Add scan dialog, progress, result summary, and settings

**Files:**
- Create: `src/renderer/src/components/scanner/ScanDialog.tsx`
- Create: `src/renderer/src/components/scanner/ScanProgress.tsx`
- Create: `src/renderer/src/components/scanner/ScanResult.tsx`
- Create: `src/renderer/src/components/settings/Welcome.tsx`
- Create: `src/renderer/src/components/settings/SettingsPanel.tsx`
- Modify: `src/renderer/src/stores/uiStore.ts`
- Modify: `src/renderer/src/App.tsx`
- Test: `tests/renderer/components.test.tsx`

- [ ] **Step 1: Add failing dialog state tests**

Assert that opening “导入游戏音乐” shows folder selection and inferred game name, starting a scan switches to phase/progress content, cancel calls `scan:cancel`, and completion shows found/extracted/copied/skipped/errors counts.

- [ ] **Step 2: Run the tests before implementing the dialog**

Run: `npm test -- --run tests/renderer/components.test.tsx`  
Expected: FAIL for the missing scan dialog behavior.

- [ ] **Step 3: Implement the scan dialog and event subscription**

Call `selectFolder`, call `scan:start` with `{ sourcePath, gameName, deepScan }`, subscribe to `onScanProgress`, render progress by phase, and unsubscribe on unmount. Disable the start button until a folder exists and show a cancel button while scanning.

- [ ] **Step 4: Implement first-run welcome and settings**

When `library_path` is empty, show a welcome view with the default `%USERPROFILE%/Music/GalMusic` path and a folder picker. Save the chosen path before loading games. Settings must also expose library path, volume, and play mode without adding any online dependency.

- [ ] **Step 5: Run component tests**

Run: `npm test -- --run tests/renderer/components.test.tsx`  
Expected: PASS.

### Task 12: Add packaging, resource verification, and Windows build configuration

**Files:**
- Create: `electron-builder.yml`
- Create: `scripts/verify-resources.mjs`
- Modify: `resources/tools/extract-rpa.mjs`
- Add binary: `resources/tools/garbro/GARbro.exe`
- Modify: `package.json`

- [ ] **Step 1: Write the resource verification test**

Run the verifier with a temporary resource directory and assert it exits non-zero with `GARbro.exe is missing` when the binary is absent, then exits zero when a fixture file exists.

- [ ] **Step 2: Implement the verifier and build metadata**

`verify-resources.mjs` must check the exact GARbro path and the RPA script before packaging. `electron-builder.yml` must set `appId: com.galmusic.app`, `productName: GalMusic`, NSIS x64 target, desktop/start-menu shortcuts, and copy `resources/tools` through `extraResources`.

- [ ] **Step 3: Add the bundled resource contract**

Place a licensed GARbro executable at `resources/tools/garbro/GARbro.exe`. The build must fail clearly if it is not present; tests continue to use the fake runner and do not require the binary.

- [ ] **Step 4: Build and package**

Run: `node scripts/verify-resources.mjs`  
Expected: PASS after the binary and RPA script are present.

Run: `npm run build`  
Expected: PASS and output for main, preload, and renderer.

Run: `npm run package:win`  
Expected: an x64 NSIS installer under `release/` with `resources/tools/garbro/GARbro.exe` inside the installed app.

### Task 13: Run the full verification matrix and document the handoff

**Files:**
- Create: `docs/verification.md`
- Modify: `README.md`

- [ ] **Step 1: Run automated verification**

Run: `npm test -- --run`  
Expected: all shared, database, scanner, importer, IPC, player, and component tests PASS.

Run: `npm run build`  
Expected: PASS without TypeScript or native-module errors.

- [ ] **Step 2: Run Windows manual checks**

Verify Windows 10/11 install/uninstall, Chinese and space-containing paths, ordinary `.ogg/.mp3/.wav/.flac` import, `.xp3/.rpa/.arc/.pak` deep scan, cancellation, duplicate import, 50MB+ audio, source-folder deletion, restart restoration, offline operation, and readable logs under `%APPDATA%/GalMusic/logs/`.

- [ ] **Step 3: Record evidence**

`docs/verification.md` must list the exact commands, date, Windows version, installer version, fixture paths, and observed pass/fail result for each check. `README.md` must document development (`npm install`, `npm run dev`), test, Windows packaging, library location, and the requirement that GARbro is bundled under `resources/tools/garbro/GARbro.exe`.

- [ ] **Step 4: Commit the completed checkpoints**

Run: `git add . && git commit -m "feat: build GalMusic desktop library and player"`.

## Self-review checklist

- Spec coverage: architecture (Tasks 1, 7, 8), UI/UX (Tasks 9–11), SQLite/data flow (Tasks 3–7), GARbro (Task 6 and 12), Howler playback (Task 9), errors/cancellation (Tasks 5–8 and 11), testing/Windows acceptance (Task 13).
- Placeholder scan: no unfinished markers or vague instructions; every task names exact files and commands.
- Type consistency: `Game`, `Track`, `ScanProgress`, `ScanResult`, `PlayMode`, `AppError`, `GalMusicAPI`, `ScanOptions`, and `ImportOptions` are defined before their consumers.
- Scope: online metadata, cloud sync, cross-platform support, tray controls, media keys, cover editor, and waveform cache remain explicitly out of this implementation cycle.
