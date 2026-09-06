import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, copyFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../shared/errors';
import { assertWithin, sanitizeDirectoryName } from '../shared/paths';
import type { Game, GameUpdate, Playlist, TrackQuery, TrackUpdate } from '../shared/types';
import { getSetting, setSetting } from './database/queries/settings';
import { deleteGame as deleteGameRecord, getGame, listGames, renameGame as renameGameRecord, setGameCover as setGameCoverRecord } from './database/queries/games';
import { deleteGameSources } from './database/queries/game-sources';
import { addTrackToPlaylist, createPlaylist as createPlaylistRecord, deletePlaylist as deletePlaylistRecord, listPlaylistTracks, listPlaylists, removeTrackFromPlaylist } from './database/queries/playlists';
import { deleteTrack, getTrack, listTracks, updateTrack, updateTrackFilePath } from './database/queries/tracks';
import { openDatabase, type SQLiteDatabase } from './database/connection';
import { importGameFolder } from './services/importer';
import { createGameMetadataService, type GameMetadataService } from './services/game-metadata';
import { configureGarbroLogPath } from './services/garbro-runner';
import { backfillMissingGameMetadata, backfillMissingTrackMetadata } from './services/metadata-backfill';
import { migrateLibraryLayout } from './services/library-layout-migration';
import { normalizeLibraryPath, readAppSettings, saveAppSettings, writeAppSetting } from './services/settings';
import { registerAudioProtocol } from './services/audio-protocol';
import { registerBackgroundProtocol } from './services/background-protocol';
import { registerCoverProtocol } from './services/cover-protocol';
import { createBulkTrackService, type BulkTrackService } from './services/bulk-track-service';
import {
  registerDialogHandlers,
  type DialogLike,
  type ShellLike,
} from './ipc/dialog-handlers';
import {
  registerLibraryHandlers,
  type IpcMainLike,
  type LibraryService,
  type AppearanceAuthorization,
} from './ipc/library-handlers';
import {
  registerScanHandlers,
  type ImporterService,
} from './ipc/scan-handlers';
import { registerWindowHandlers, type WindowLike } from './ipc/window-handlers';

export interface BrowserWindowLike {
  loadURL(url: string): Promise<unknown>;
  loadFile(filePath: string): Promise<unknown>;
  isDestroyed?(): boolean;
  webContents?: { send(channel: string, payload: unknown): void };
  minimize?(): void;
  isMaximized?(): boolean;
  maximize?(): void;
  unmaximize?(): void;
  close?(): void;
}

export interface MainProcessServices {
  library: LibraryService;
  importer: ImporterService;
  getLibraryPath?: () => string | Promise<string>;
}

export interface CreateWindowOptions {
  BrowserWindow: new (options: Record<string, unknown>) => BrowserWindowLike;
  preloadPath?: string;
  rendererEntry?: string;
  rendererUrl?: string;
}

let mainWindow: BrowserWindowLike | undefined;

// The renderer runs from http://localhost during development and from a local
// bundle after packaging. A privileged streaming scheme works in both modes.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'galmusic-audio',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
  {
    scheme: 'galmusic-cover',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
  {
    scheme: 'galmusic-background',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

/** Resolve the preload bundle emitted by electron-vite. */
export function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.js');
}

/** Resolve the production renderer bundle emitted by electron-vite. */
export function getRendererEntry(): string {
  return path.join(__dirname, '../renderer/index.html');
}

/** Create the single application window with a hardened renderer boundary. */
export function createMainWindow({
  BrowserWindow: Window,
  preloadPath = getPreloadPath(),
  rendererEntry = getRendererEntry(),
  rendererUrl = process.env.ELECTRON_RENDERER_URL,
}: CreateWindowOptions): BrowserWindowLike {
  const window = new Window({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b1518',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(rendererEntry);
  }
  mainWindow = window;
  return window;
}

export interface DatabaseLibraryServiceOptions {
  importer?: ImporterService;
  getLibraryPath?: () => string | Promise<string>;
  bulkService?: BulkTrackService;
  metadata?: GameMetadataService;
}

function normalizeTrackQuery(input: TrackQuery | string | null): Required<TrackQuery> {
  if (input === null || typeof input === 'string') {
    return { section: 'library', gameId: input, playlistId: null, search: '', kind: null };
  }
  return {
    section: input.section ?? 'library',
    gameId: input.gameId ?? null,
    playlistId: input.playlistId ?? null,
    search: input.search?.trim() ?? '',
    kind: input.kind ?? null,
  };
}

function gameDirectory(libraryPath: string, gameName: string): string {
  return assertWithin(path.join(libraryPath, sanitizeDirectoryName(gameName)), libraryPath);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function imageExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) {
    throw new AppError('UNSUPPORTED_FORMAT', `Unsupported cover image: ${extension || 'unknown'}`, '请选择 PNG、JPG、WEBP 或 GIF 图片。');
  }
  return extension;
}

function isPathInside(candidate: string, root: string): boolean {
  try {
    assertWithin(candidate, root);
    return true;
  } catch {
    return false;
  }
}

/** SQLite-backed library service shared by the IPC handlers and the renderer. */
export function createDatabaseLibraryService(
  db: SQLiteDatabase,
  options: DatabaseLibraryServiceOptions = {},
): LibraryService {
  const resolveLibraryPath = options.getLibraryPath ?? (() => getSetting(db, 'library_path') ?? '');
  const bulkService = options.bulkService ?? createBulkTrackService({ db, getLibraryPath: resolveLibraryPath });
  let mutationQueue: Promise<void> = Promise.resolve();
  const enqueueMutation = <T>(mutation: () => Promise<T> | T): Promise<T> => {
    const result = mutationQueue.then(mutation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const requireTrack = (trackId: string) => {
    const track = getTrack(db, trackId);
    if (!track) {
      throw new AppError('FILE_NOT_FOUND', `Track not found: ${trackId}`, '找不到指定的曲目。');
    }
    return track;
  };
  const requireImporter = (): ImporterService => {
    if (!options.importer) {
      throw new AppError('DB_ERROR', 'Importer service is not configured', '导入服务暂不可用。');
    }
    return options.importer;
  };

  const getTracksForQuery = (input: TrackQuery | string | null) => {
    const query = normalizeTrackQuery(input);
    if (query.section === 'recent') {
      return listTracks(db, null, { search: query.search, order: 'recent' });
    }
    if (query.section === 'favorites') {
      return listTracks(db, null, { search: query.search, favoritesOnly: true, order: 'recent' });
    }
    if (query.section === 'playlists') {
      if (!query.playlistId) return [];
      const playlistTracks = listPlaylistTracks(db, query.playlistId);
      if (!query.search) return playlistTracks;
      const needle = query.search.toLocaleLowerCase();
      return playlistTracks.filter((track) =>
        track.fileName.toLocaleLowerCase().includes(needle)
        || track.displayName.toLocaleLowerCase().includes(needle)
        || track.gameName?.toLocaleLowerCase().includes(needle),
      );
    }
    return listTracks(db, query.gameId, { search: query.search, kind: query.kind });
  };

  const updateGameNow = async (gameId: string, changes: GameUpdate): Promise<Game> => {
    const existing = getGame(db, gameId);
    if (!existing) {
      throw new AppError('FILE_NOT_FOUND', `Game not found: ${gameId}`, '找不到指定的游戏。');
    }
    const libraryPathValue = await resolveLibraryPath();
    if (!libraryPathValue.trim()) {
      throw new AppError('DB_ERROR', 'Library path is not configured', '请先设置音乐库目录。');
    }
    const libraryPath = path.resolve(libraryPathValue);
    const nextName = changes.name?.trim() || existing.name;
    const nameChanged = nextName !== existing.name;
    const oldDirectory = existing.folderPath && isPathInside(existing.folderPath, libraryPath)
      ? path.resolve(existing.folderPath)
      : gameDirectory(libraryPath, existing.name);
    const nextDirectory = gameDirectory(libraryPath, nextName);
    const directoryChanged = nameChanged && oldDirectory !== nextDirectory;
    const oldDirectoryExists = await pathExists(oldDirectory);
    const nextDirectoryExists = await pathExists(nextDirectory);
    let movedDirectory = false;

    if (directoryChanged && oldDirectoryExists && !nextDirectoryExists) {
      await rename(oldDirectory, nextDirectory);
      movedDirectory = true;
    } else if (directoryChanged && oldDirectoryExists && nextDirectoryExists) {
      throw new AppError('DB_ERROR', `Target game directory already exists: ${nextDirectory}`, '目标游戏文件夹已存在，请换一个名称。');
    }

    const hasCoverChange = Object.prototype.hasOwnProperty.call(changes, 'coverPath');
    let copiedCoverPath: string | null | undefined;
    let previousCoverPath = existing.coverPath;
    try {
      if (hasCoverChange && changes.coverPath) {
        const extension = imageExtension(changes.coverPath);
        await mkdir(nextDirectory, { recursive: true });
        copiedCoverPath = path.join(nextDirectory, `.cover${extension}`);
        if (path.resolve(changes.coverPath) !== path.resolve(copiedCoverPath)) {
          await copyFile(changes.coverPath, copiedCoverPath);
        }
      } else if (hasCoverChange) {
        copiedCoverPath = null;
      }

      const save = db.transaction(() => {
        const gameTracks = listTracks(db, gameId);
        if (nameChanged) {
          for (const track of gameTracks) {
            if (!isPathInside(track.filePath, oldDirectory)) continue;
            const relative = path.relative(oldDirectory, track.filePath);
            updateTrackFilePath(db, track.id, path.join(nextDirectory, relative));
          }
        }

        let nextCoverPath = existing.coverPath;
        if (existing.coverPath && directoryChanged && isPathInside(existing.coverPath, oldDirectory)) {
          nextCoverPath = path.join(nextDirectory, path.basename(existing.coverPath));
        }
        if (hasCoverChange) {
          nextCoverPath = copiedCoverPath ?? null;
        }

        if (nameChanged) {
          renameGameRecord(db, gameId, nextName);
          deleteGameSources(db, gameId);
        }
        if (hasCoverChange || nextCoverPath !== existing.coverPath) {
          setGameCoverRecord(db, gameId, nextCoverPath);
        }
        return getGame(db, gameId);
      });

      const result = save();
      if (!result) {
        throw new AppError('DB_ERROR', `Unable to update game: ${gameId}`, '更新游戏失败。');
      }
      if (previousCoverPath && previousCoverPath !== result.coverPath && isPathInside(previousCoverPath, libraryPath)) {
        await rm(previousCoverPath, { force: true }).catch(() => undefined);
      }
      return result;
    } catch (error) {
      if (copiedCoverPath && copiedCoverPath !== previousCoverPath) {
        await rm(copiedCoverPath, { force: true }).catch(() => undefined);
      }
      if (movedDirectory) {
        await rename(nextDirectory, oldDirectory).catch(() => undefined);
      }
      throw error;
    }
  };

  return {
    getGames: () => listGames(db),
    getTracks: (query) => getTracksForQuery(query),
    addTracks: ({ gameId, filePaths }) => enqueueMutation(async () => {
      const game = getGame(db, gameId);
      if (!game) {
        throw new AppError('FILE_NOT_FOUND', `Game not found: ${gameId}`, '找不到指定的游戏。');
      }
      const libraryPath = await resolveLibraryPath();
      if (!libraryPath.trim()) {
        throw new AppError('DB_ERROR', 'Library path is not configured', '请先设置音乐库目录。');
      }
      const importer = requireImporter();
      for (const filePath of filePaths) {
        await importer.importGameFolder({
          sourcePath: filePath,
          libraryPath,
          gameName: game.name,
          deepScan: false,
          includeVoice: true,
          voiceThresholdSeconds: readAppSettings(db).voiceThresholdSeconds,
          signal: new AbortController().signal,
          onProgress: () => undefined,
        });
      }
      return listTracks(db, gameId);
    }),
    updateTrack: (trackId: string, changes: TrackUpdate) => {
      requireTrack(trackId);
      const updated = updateTrack(db, trackId, changes);
      if (!updated) {
        throw new AppError('DB_ERROR', `Unable to update track: ${trackId}`, '更新曲目失败。');
      }
      return updated;
    },
    deleteTrack: (trackId: string) => enqueueMutation(async () => {
      const track = requireTrack(trackId);
      if (!deleteTrack(db, trackId)) {
        throw new AppError('DB_ERROR', `Unable to delete track: ${trackId}`, '删除曲目失败。');
      }
      const libraryPath = await resolveLibraryPath();
      if (libraryPath.trim()) {
        try {
          assertWithin(track.filePath, libraryPath);
          await rm(track.filePath, { force: true });
        } catch {
          // The database row is authoritative if the copied file was moved.
        }
      }
    }),
    search: (query) => listTracks(db, null, { search: query }),
    getPlaylists: () => listPlaylists(db),
    createPlaylist: (name) => createPlaylistRecord(db, { id: randomUUID(), name }),
    deletePlaylist: (playlistId) => {
      if (!deletePlaylistRecord(db, playlistId)) {
        throw new AppError('FILE_NOT_FOUND', `Playlist not found: ${playlistId}`, '找不到指定的播放列表。');
      }
    },
    addTrackToPlaylist: (playlistId, trackId) => {
      requireTrack(trackId);
      if (!addTrackToPlaylist(db, playlistId, trackId)) {
        const playlist = listPlaylists(db).some((item) => item.id === playlistId);
        if (!playlist) {
          throw new AppError('FILE_NOT_FOUND', `Playlist not found: ${playlistId}`, '找不到指定的播放列表。');
        }
      }
    },
    removeTrackFromPlaylist: (playlistId, trackId) => {
      removeTrackFromPlaylist(db, playlistId, trackId);
    },
    bulkUpdateTracks: (request) => enqueueMutation(() => bulkService.execute(request)),
    updateGame: (gameId, changes) => enqueueMutation(() => updateGameNow(gameId, changes)),
    getGameMetadata: options.metadata
      ? (gameId) => options.metadata!.ensure(gameId, { signal: new AbortController().signal })
      : undefined,
    refreshGameMetadata: options.metadata ? (gameId) => options.metadata!.refresh(gameId) : undefined,
    deleteGame: (gameId: string) => enqueueMutation(async () => {
      const existing = getGame(db, gameId);
      if (!existing) {
        throw new AppError('FILE_NOT_FOUND', `Game not found: ${gameId}`, '找不到指定的游戏。');
      }
      const libraryPathValue = await resolveLibraryPath();
      if (!libraryPathValue.trim()) {
        throw new AppError('DB_ERROR', 'Library path is not configured', '请先设置音乐库目录。');
      }
      const libraryPath = path.resolve(libraryPathValue);
      const directory = existing.folderPath && isPathInside(existing.folderPath, libraryPath)
        ? path.resolve(existing.folderPath)
        : gameDirectory(libraryPath, existing.name);
      const stagingDirectory = assertWithin(
        path.join(libraryPath, `.galmusic-delete-${randomUUID()}`),
        libraryPath,
      );
      const directoryExists = await pathExists(directory);
      if (directoryExists) await rename(directory, stagingDirectory);
      try {
        const removeRecord = db.transaction(() => deleteGameRecord(db, gameId));
        if (!removeRecord()) {
          throw new AppError('DB_ERROR', `Unable to delete game: ${gameId}`, '删除音乐文件夹失败。');
        }
      } catch (error) {
        if (directoryExists) await rename(stagingDirectory, directory).catch(() => undefined);
        throw error;
      }
      if (directoryExists) await rm(stagingDirectory, { recursive: true, force: true });
    }),
    getSettings: () => readAppSettings(db),
    setSetting: (key, value) => {
      writeAppSetting(db, key, value);
    },
    saveSettings: (changes) => {
      saveAppSettings(db, changes);
    },
  };
}

/** Explicit fallback for tests or embedders that do not provide importing. */
export function createUnavailableImporter(): ImporterService {
  return {
    async importGameFolder(): Promise<never> {
      throw new AppError('DB_ERROR', 'No importer service was configured', '导入服务暂不可用。');
    },
  };
}

export interface RegisterIpcOptions {
  services: MainProcessServices;
  ipcMain?: IpcMainLike;
  dialog?: DialogLike;
  shell?: ShellLike;
  appearanceAuthorization?: AppearanceAuthorization;
}

/** Register the allow-listed request handlers against injectable Electron services. */
export function registerIpcHandlers({
  services,
  ipcMain: main = ipcMain as unknown as IpcMainLike,
  dialog: appDialog = dialog as unknown as DialogLike,
  shell: appShell = shell as unknown as ShellLike,
  appearanceAuthorization = { previewBackgroundPath: null },
}: RegisterIpcOptions): void {
  const resolveLibraryPath = services.getLibraryPath ?? (async () => {
    const settings = await services.library.getSettings?.();
    return settings?.libraryPath ?? '';
  });
  registerLibraryHandlers({ ipcMain: main, library: services.library, appearanceAuthorization });
  registerScanHandlers({
    ipcMain: main,
    importer: services.importer,
    getLibraryPath: resolveLibraryPath,
  });
  registerDialogHandlers({ ipcMain: main, dialog: appDialog, shell: appShell, onImageSelected: (filePath) => { appearanceAuthorization.previewBackgroundPath = filePath; } });
  registerWindowHandlers({
    ipcMain: main,
    getWindow: (event) => {
      const senderWindow = (event as { sender?: { getOwnerBrowserWindow?: () => WindowLike | undefined } }).sender?.getOwnerBrowserWindow?.();
      return senderWindow ?? (mainWindow as (WindowLike & BrowserWindowLike) | undefined);
    },
  });
}

export interface BootstrapOptions {
  services?: MainProcessServices;
  userDataDirectory?: string;
}

/** Start the Electron lifecycle.  Exported for deterministic integration tests. */
export async function bootstrapMainProcess(options: BootstrapOptions = {}): Promise<BrowserWindowLike> {
  await app.whenReady();

  const userDataDirectory = options.userDataDirectory ?? app.getPath('userData');
  configureGarbroLogPath(path.join(userDataDirectory, 'logs', 'garbro.log'));
  const db = openDatabase(userDataDirectory);
  const defaultLibrary = path.join(app.getPath('music'), 'NatsumeMusic');
  const legacyDefaultLibrary = path.join(app.getPath('music'), 'GalMusic');
  if (!getSetting(db, 'library_path')) {
    setSetting(db, 'library_path', existsSync(legacyDefaultLibrary) ? legacyDefaultLibrary : defaultLibrary);
  }
  const configuredLibrary = getSetting(db, 'library_path') ?? defaultLibrary;
  const normalizedLibrary = normalizeLibraryPath(configuredLibrary, {
    cwd: process.cwd(),
    environment: process.env,
    pathExists: existsSync,
  });
  if (normalizedLibrary !== configuredLibrary) {
    setSetting(db, 'library_path', normalizedLibrary);
  }
  await backfillMissingTrackMetadata(db);
  await migrateLibraryLayout(db, normalizedLibrary, {
    logPath: path.join(userDataDirectory, 'logs', 'library-layout-migration.log'),
  });
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
  const appearanceAuthorization: AppearanceAuthorization = { previewBackgroundPath: null };
  registerAudioProtocol({
    protocol,
    fetchFile: (fileUrl) => net.fetch(fileUrl),
    getLibraryPath: services.getLibraryPath ?? (() => getSetting(db, 'library_path') ?? defaultLibrary),
  });
  registerCoverProtocol({
    protocol,
    fetchFile: (fileUrl) => net.fetch(fileUrl),
    getLibraryPath: services.getLibraryPath ?? (() => getSetting(db, 'library_path') ?? defaultLibrary),
  });
  registerBackgroundProtocol({
    protocol,
    fetchFile: (fileUrl) => net.fetch(fileUrl),
    getBackgroundPath: () => appearanceAuthorization.previewBackgroundPath ?? getSetting(db, 'background_image_path') ?? null,
  });
  registerIpcHandlers({ services, appearanceAuthorization });

  const window = createMainWindow({ BrowserWindow });
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed?.()) {
      createMainWindow({ BrowserWindow });
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  app.on('before-quit', () => {
    db.close();
  });

  // Older libraries predate automatic game metadata. Run this after the first
  // window is ready so the UI opens immediately while legacy games are
  // enriched and missing covers are downloaded in the background.
  void backfillMissingGameMetadata(db, metadata).catch(() => undefined);

  return window;
}

// electron-vite executes this module in the main process.  The guard keeps
// imports safe for Node-based tests where Electron is not bootstrapped.
if (app && typeof app.whenReady === 'function') {
  void bootstrapMainProcess();
}

export { mainWindow };
