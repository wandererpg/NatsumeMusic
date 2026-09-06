import { contextBridge, ipcRenderer } from 'electron';

import {
  IPC_APP_GET_SETTINGS,
  IPC_APP_CANCEL_APPEARANCE_PREVIEW,
  IPC_APP_SAVE_SETTINGS,
  IPC_APP_SET_SETTING,
  IPC_DIALOG_SELECT_FILES,
  IPC_DIALOG_SELECT_FOLDER,
  IPC_DIALOG_SELECT_IMAGE,
  IPC_EVENTS,
  IPC_LIBRARY_ADD_TRACKS,
  IPC_LIBRARY_BULK_UPDATE_TRACKS,
  IPC_LIBRARY_ADD_TRACK_TO_PLAYLIST,
  IPC_LIBRARY_CREATE_PLAYLIST,
  IPC_LIBRARY_DELETE_PLAYLIST,
  IPC_LIBRARY_DELETE_GAME,
  IPC_LIBRARY_DELETE_TRACK,
  IPC_LIBRARY_GET_PLAYLISTS,
  IPC_LIBRARY_GET_GAMES,
  IPC_LIBRARY_GET_TRACKS,
  IPC_LIBRARY_GET_GAME_METADATA,
  IPC_LIBRARY_REFRESH_GAME_METADATA,
  IPC_LIBRARY_REMOVE_TRACK_FROM_PLAYLIST,
  IPC_LIBRARY_SEARCH,
  IPC_LIBRARY_UPDATE_GAME,
  IPC_LIBRARY_UPDATE_TRACK,
  IPC_SCAN_CANCEL,
  IPC_SCAN_PROGRESS,
  IPC_SCAN_RESULT,
  IPC_SCAN_START,
  IPC_SHELL_OPEN_EXPLORER,
  IPC_WINDOW_CLOSE,
  IPC_WINDOW_MINIMIZE,
  IPC_WINDOW_TOGGLE_MAXIMIZE,
  type GalMusicAPI,
} from '../shared/ipc';
import { serializeAppError } from '../shared/errors';
import type { SerializedAppError } from '../shared/errors';
import type {
  AddTracksRequest,
  AppSettings,
  AppSettingsUpdate,
  BulkTrackRequest,
  BulkTrackResult,
  Game,
  GameMetadataSummary,
  GameUpdate,
  PlayerErrorListener,
  PlayerState,
  PlayerStateListener,
  PlayerTimeUpdate,
  PlayerTimeUpdateListener,
  ScanProgress,
  ScanProgressListener,
  ScanResultEvent,
  ScanResultListener,
  ScanStartRequest,
  Playlist,
  TrackQuery,
  Track,
  TrackUpdate,
  Unsubscribe,
} from '../shared/types';

export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (...args: unknown[]) => void): unknown;
  removeListener?(channel: string, listener: (...args: unknown[]) => void): unknown;
  off?(channel: string, listener: (...args: unknown[]) => void): unknown;
}

export interface ContextBridgeLike {
  exposeInMainWorld(name: string, api: GalMusicAPI): void;
}

function isSerializedAppError(error: unknown): error is SerializedAppError {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; userMessage?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.userMessage === 'string';
}

/** Keep the renderer boundary free of Error prototypes and stack details. */
export function serializeRendererError(error: unknown): SerializedAppError {
  if (isSerializedAppError(error)) {
    return { code: error.code, userMessage: error.userMessage };
  }
  return serializeAppError(error);
}

function eventSubscription<T>(
  ipc: IpcRendererLike,
  channel: string,
  listener: (payload: T) => void,
): Unsubscribe {
  const wrapped = (...args: unknown[]) => listener(args[1] as T);
  ipc.on(channel, wrapped);
  return () => {
    if (ipc.removeListener) {
      ipc.removeListener(channel, wrapped);
    } else {
      ipc.off?.(channel, wrapped);
    }
  };
}

function createInvoker(ipc: IpcRendererLike) {
  return async <T>(channel: string, ...args: unknown[]): Promise<T> => {
    try {
      return await ipc.invoke(channel, ...args) as T;
    } catch (error) {
      // Throwing the plain object is intentional: it survives the isolated
      // world boundary and gives the UI a stable code/userMessage pair.
      throw serializeRendererError(error);
    }
  };
}

/** Build the allow-listed API without exposing ipcRenderer itself. */
export function createGalMusicApi(ipc: IpcRendererLike): GalMusicAPI {
  const invoke = createInvoker(ipc);
  return {
    startScan: (options: ScanStartRequest) => invoke<string>(IPC_SCAN_START, options),
    cancelScan: (requestId: string) => invoke<void>(IPC_SCAN_CANCEL, requestId),

    getGames: () => invoke<Game[]>(IPC_LIBRARY_GET_GAMES),
    getTracks: (query: TrackQuery | string | null) => invoke<Track[]>(IPC_LIBRARY_GET_TRACKS, query),
    addTracks: (options: AddTracksRequest) => invoke<Track[]>(IPC_LIBRARY_ADD_TRACKS, options),
    updateTrack: (trackId: string, changes: TrackUpdate) => invoke<Track>(IPC_LIBRARY_UPDATE_TRACK, trackId, changes),
    deleteTrack: (trackId: string) => invoke<void>(IPC_LIBRARY_DELETE_TRACK, trackId),
    search: (query: string) => invoke<Track[]>(IPC_LIBRARY_SEARCH, query),
    getPlaylists: () => invoke<Playlist[]>(IPC_LIBRARY_GET_PLAYLISTS),
    createPlaylist: (name: string) => invoke<Playlist>(IPC_LIBRARY_CREATE_PLAYLIST, name),
    deletePlaylist: (playlistId: string) => invoke<void>(IPC_LIBRARY_DELETE_PLAYLIST, playlistId),
    addTrackToPlaylist: (playlistId: string, trackId: string) => invoke<void>(IPC_LIBRARY_ADD_TRACK_TO_PLAYLIST, playlistId, trackId),
    removeTrackFromPlaylist: (playlistId: string, trackId: string) => invoke<void>(IPC_LIBRARY_REMOVE_TRACK_FROM_PLAYLIST, playlistId, trackId),
    updateGame: (gameId: string, changes: GameUpdate) => invoke<Game>(IPC_LIBRARY_UPDATE_GAME, gameId, changes),
    getGameMetadata: (gameId: string) => invoke<GameMetadataSummary>(IPC_LIBRARY_GET_GAME_METADATA, gameId),
    refreshGameMetadata: (gameId: string) => invoke<GameMetadataSummary>(IPC_LIBRARY_REFRESH_GAME_METADATA, gameId),
    deleteGame: (gameId: string) => invoke<void>(IPC_LIBRARY_DELETE_GAME, gameId),
    bulkUpdateTracks: (request: BulkTrackRequest) =>
      invoke<BulkTrackResult>(IPC_LIBRARY_BULK_UPDATE_TRACKS, request),

    selectFolder: () => invoke<string | null>(IPC_DIALOG_SELECT_FOLDER),
    selectFiles: () => invoke<string[]>(IPC_DIALOG_SELECT_FILES),
    selectImage: () => invoke<string | null>(IPC_DIALOG_SELECT_IMAGE),
    openExplorer: (targetPath: string) => invoke<void>(IPC_SHELL_OPEN_EXPLORER, targetPath),

    getSettings: () => invoke<AppSettings>(IPC_APP_GET_SETTINGS),
    setSetting: (key: string, value: string) => invoke<void>(IPC_APP_SET_SETTING, key, value),
    saveSettings: (changes: AppSettingsUpdate) => invoke<void>(IPC_APP_SAVE_SETTINGS, changes),
    cancelAppearancePreview: () => invoke<void>(IPC_APP_CANCEL_APPEARANCE_PREVIEW),
    minimizeWindow: () => invoke<void>(IPC_WINDOW_MINIMIZE),
    toggleMaximizeWindow: () => invoke<void>(IPC_WINDOW_TOGGLE_MAXIMIZE),
    closeWindow: () => invoke<void>(IPC_WINDOW_CLOSE),

    onScanProgress: (listener: ScanProgressListener) =>
      eventSubscription<ScanProgress>(ipc, IPC_SCAN_PROGRESS, listener),
    onScanResult: (listener: ScanResultListener) =>
      eventSubscription<ScanResultEvent>(ipc, IPC_SCAN_RESULT, listener),
    onPlayerStateChange: (listener: PlayerStateListener) =>
      eventSubscription<PlayerState>(ipc, IPC_EVENTS.playerStateChange, listener),
    onPlayerTimeUpdate: (listener: PlayerTimeUpdateListener) =>
      eventSubscription<PlayerTimeUpdate>(ipc, IPC_EVENTS.playerTimeUpdate, listener),
    onPlayerError: (listener: PlayerErrorListener) =>
      eventSubscription<SerializedAppError>(ipc, IPC_EVENTS.playerError, listener),
  };
}

/** Expose the API in the isolated main world; no raw Electron primitive leaks. */
export function installPreloadBridge(
  bridge: ContextBridgeLike,
  ipc: IpcRendererLike,
): GalMusicAPI {
  const api = createGalMusicApi(ipc);
  bridge.exposeInMainWorld('galMusic', api);
  return api;
}

declare global {
  interface Window {
    galMusic: GalMusicAPI;
  }
}

// Electron provides these objects in the preload context.  The guard keeps the
// module importable in Node-based contract tests where electron is mocked.
if (contextBridge && ipcRenderer) {
  installPreloadBridge(contextBridge, ipcRenderer);
}
