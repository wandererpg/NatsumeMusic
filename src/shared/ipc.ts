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
  ScanResult,
  ScanResultEvent,
  ScanResultListener,
  ScanStartRequest,
  Playlist,
  TrackQuery,
  Track,
  TrackUpdate,
  Unsubscribe,
} from './types';
import type { SerializedAppError } from './errors';

// Request channels
export const SCAN_START = 'scan:start' as const;
export const SCAN_CANCEL = 'scan:cancel' as const;
export const LIBRARY_GET_GAMES = 'library:get-games' as const;
export const LIBRARY_GET_TRACKS = 'library:get-tracks' as const;
export const LIBRARY_ADD_TRACKS = 'library:add-tracks' as const;
export const LIBRARY_UPDATE_TRACK = 'library:update-track' as const;
export const LIBRARY_DELETE_TRACK = 'library:delete-track' as const;
export const LIBRARY_SEARCH = 'library:search' as const;
export const LIBRARY_GET_PLAYLISTS = 'library:get-playlists' as const;
export const LIBRARY_CREATE_PLAYLIST = 'library:create-playlist' as const;
export const LIBRARY_DELETE_PLAYLIST = 'library:delete-playlist' as const;
export const LIBRARY_ADD_TRACK_TO_PLAYLIST = 'library:add-track-to-playlist' as const;
export const LIBRARY_REMOVE_TRACK_FROM_PLAYLIST = 'library:remove-track-from-playlist' as const;
export const LIBRARY_UPDATE_GAME = 'library:update-game' as const;
export const LIBRARY_GET_GAME_METADATA = 'library:get-game-metadata' as const;
export const LIBRARY_REFRESH_GAME_METADATA = 'library:refresh-game-metadata' as const;
export const LIBRARY_DELETE_GAME = 'library:delete-game' as const;
export const LIBRARY_BULK_UPDATE_TRACKS = 'library:bulk-update-tracks' as const;
export const DIALOG_SELECT_FOLDER = 'dialog:select-folder' as const;
export const DIALOG_SELECT_FILES = 'dialog:select-files' as const;
export const DIALOG_SELECT_IMAGE = 'dialog:select-image' as const;
export const SHELL_OPEN_EXPLORER = 'shell:open-explorer' as const;
export const APP_GET_SETTINGS = 'app:get-settings' as const;
export const APP_SET_SETTING = 'app:set-setting' as const;
export const APP_SAVE_SETTINGS = 'app:save-settings' as const;
export const APP_CANCEL_APPEARANCE_PREVIEW = 'app:cancel-appearance-preview' as const;
export const WINDOW_MINIMIZE = 'window:minimize' as const;
export const WINDOW_TOGGLE_MAXIMIZE = 'window:toggle-maximize' as const;
export const WINDOW_CLOSE = 'window:close' as const;

// Push/event channels
export const SCAN_PROGRESS = 'scan:progress' as const;
export const SCAN_RESULT = 'scan:result' as const;
export const PLAYER_STATE_CHANGE = 'player:state-change' as const;
export const PLAYER_TIME_UPDATE = 'player:time-update' as const;
export const PLAYER_ERROR = 'player:error' as const;

/** Request channels grouped for handler registration. */
export const IPC_REQUESTS = {
  scanStart: SCAN_START,
  scanCancel: SCAN_CANCEL,
  libraryGetGames: LIBRARY_GET_GAMES,
  libraryGetTracks: LIBRARY_GET_TRACKS,
  libraryAddTracks: LIBRARY_ADD_TRACKS,
  libraryUpdateTrack: LIBRARY_UPDATE_TRACK,
  libraryDeleteTrack: LIBRARY_DELETE_TRACK,
  librarySearch: LIBRARY_SEARCH,
  libraryGetPlaylists: LIBRARY_GET_PLAYLISTS,
  libraryCreatePlaylist: LIBRARY_CREATE_PLAYLIST,
  libraryDeletePlaylist: LIBRARY_DELETE_PLAYLIST,
  libraryAddTrackToPlaylist: LIBRARY_ADD_TRACK_TO_PLAYLIST,
  libraryRemoveTrackFromPlaylist: LIBRARY_REMOVE_TRACK_FROM_PLAYLIST,
  libraryUpdateGame: LIBRARY_UPDATE_GAME,
  libraryGetGameMetadata: LIBRARY_GET_GAME_METADATA,
  libraryRefreshGameMetadata: LIBRARY_REFRESH_GAME_METADATA,
  libraryDeleteGame: LIBRARY_DELETE_GAME,
  libraryBulkUpdateTracks: LIBRARY_BULK_UPDATE_TRACKS,
  dialogSelectFolder: DIALOG_SELECT_FOLDER,
  dialogSelectFiles: DIALOG_SELECT_FILES,
  dialogSelectImage: DIALOG_SELECT_IMAGE,
  shellOpenExplorer: SHELL_OPEN_EXPLORER,
  appGetSettings: APP_GET_SETTINGS,
  appSetSetting: APP_SET_SETTING,
  appSaveSettings: APP_SAVE_SETTINGS,
  appCancelAppearancePreview: APP_CANCEL_APPEARANCE_PREVIEW,
  windowMinimize: WINDOW_MINIMIZE,
  windowToggleMaximize: WINDOW_TOGGLE_MAXIMIZE,
  windowClose: WINDOW_CLOSE,
} as const;

/** Event channels grouped for preload subscriptions. */
export const IPC_EVENTS = {
  scanProgress: SCAN_PROGRESS,
  scanResult: SCAN_RESULT,
  playerStateChange: PLAYER_STATE_CHANGE,
  playerTimeUpdate: PLAYER_TIME_UPDATE,
  playerError: PLAYER_ERROR,
} as const;

/** All channels, useful when validating a channel before registering it. */
export const IPC_CHANNELS = {
  ...IPC_REQUESTS,
  ...IPC_EVENTS,
} as const;

/** Backwards-friendly alias for callers that prefer the short name. */
export const IPC = IPC_CHANNELS;

// Explicit IPC_* aliases make channel usage discoverable at call sites while
// retaining the concise names above for handler maps.
export const IPC_SCAN_START = SCAN_START;
export const IPC_SCAN_CANCEL = SCAN_CANCEL;
export const IPC_LIBRARY_GET_GAMES = LIBRARY_GET_GAMES;
export const IPC_LIBRARY_GET_TRACKS = LIBRARY_GET_TRACKS;
export const IPC_LIBRARY_ADD_TRACKS = LIBRARY_ADD_TRACKS;
export const IPC_LIBRARY_UPDATE_TRACK = LIBRARY_UPDATE_TRACK;
export const IPC_LIBRARY_DELETE_TRACK = LIBRARY_DELETE_TRACK;
export const IPC_LIBRARY_SEARCH = LIBRARY_SEARCH;
export const IPC_LIBRARY_GET_PLAYLISTS = LIBRARY_GET_PLAYLISTS;
export const IPC_LIBRARY_CREATE_PLAYLIST = LIBRARY_CREATE_PLAYLIST;
export const IPC_LIBRARY_DELETE_PLAYLIST = LIBRARY_DELETE_PLAYLIST;
export const IPC_LIBRARY_ADD_TRACK_TO_PLAYLIST = LIBRARY_ADD_TRACK_TO_PLAYLIST;
export const IPC_LIBRARY_REMOVE_TRACK_FROM_PLAYLIST = LIBRARY_REMOVE_TRACK_FROM_PLAYLIST;
export const IPC_LIBRARY_UPDATE_GAME = LIBRARY_UPDATE_GAME;
export const IPC_LIBRARY_GET_GAME_METADATA = LIBRARY_GET_GAME_METADATA;
export const IPC_LIBRARY_REFRESH_GAME_METADATA = LIBRARY_REFRESH_GAME_METADATA;
export const IPC_LIBRARY_DELETE_GAME = LIBRARY_DELETE_GAME;
export const IPC_LIBRARY_BULK_UPDATE_TRACKS = LIBRARY_BULK_UPDATE_TRACKS;
export const IPC_DIALOG_SELECT_FOLDER = DIALOG_SELECT_FOLDER;
export const IPC_DIALOG_SELECT_FILES = DIALOG_SELECT_FILES;
export const IPC_DIALOG_SELECT_IMAGE = DIALOG_SELECT_IMAGE;
export const IPC_SHELL_OPEN_EXPLORER = SHELL_OPEN_EXPLORER;
export const IPC_APP_GET_SETTINGS = APP_GET_SETTINGS;
export const IPC_APP_SET_SETTING = APP_SET_SETTING;
export const IPC_APP_SAVE_SETTINGS = APP_SAVE_SETTINGS;
export const IPC_APP_CANCEL_APPEARANCE_PREVIEW = APP_CANCEL_APPEARANCE_PREVIEW;
export const IPC_WINDOW_MINIMIZE = WINDOW_MINIMIZE;
export const IPC_WINDOW_TOGGLE_MAXIMIZE = WINDOW_TOGGLE_MAXIMIZE;
export const IPC_WINDOW_CLOSE = WINDOW_CLOSE;
export const IPC_SCAN_PROGRESS = SCAN_PROGRESS;
export const IPC_SCAN_RESULT = SCAN_RESULT;
export const IPC_PLAYER_STATE_CHANGE = PLAYER_STATE_CHANGE;
export const IPC_PLAYER_TIME_UPDATE = PLAYER_TIME_UPDATE;
export const IPC_PLAYER_ERROR = PLAYER_ERROR;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
export type IpcRequestChannel = (typeof IPC_REQUESTS)[keyof typeof IPC_REQUESTS];
export type IpcEventChannel = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

export interface GalMusicAPI {
  startScan(options: ScanStartRequest): Promise<string>;
  cancelScan(requestId: string): Promise<void>;

  getGames(): Promise<Game[]>;
  getTracks(query: TrackQuery | string | null): Promise<Track[]>;
  addTracks(options: AddTracksRequest): Promise<Track[]>;
  updateTrack(trackId: string, changes: TrackUpdate): Promise<Track>;
  deleteTrack(trackId: string): Promise<void>;
  search(query: string): Promise<Track[]>;
  getPlaylists?: () => Promise<Playlist[]>;
  createPlaylist?: (name: string) => Promise<Playlist>;
  deletePlaylist?: (playlistId: string) => Promise<void>;
  addTrackToPlaylist?: (playlistId: string, trackId: string) => Promise<void>;
  removeTrackFromPlaylist?: (playlistId: string, trackId: string) => Promise<void>;
  updateGame?: (gameId: string, changes: GameUpdate) => Promise<Game>;
  getGameMetadata?: (gameId: string) => Promise<GameMetadataSummary>;
  refreshGameMetadata?: (gameId: string) => Promise<GameMetadataSummary>;
  deleteGame?: (gameId: string) => Promise<void>;
  bulkUpdateTracks(request: BulkTrackRequest): Promise<BulkTrackResult>;

  selectFolder(): Promise<string | null>;
  selectFiles(): Promise<string[]>;
  selectImage(): Promise<string | null>;
  openExplorer(targetPath: string): Promise<void>;

  getSettings(): Promise<AppSettings>;
  setSetting(key: string, value: string): Promise<void>;
  saveSettings?: (changes: AppSettingsUpdate) => Promise<void>;
  cancelAppearancePreview?: () => Promise<void>;
  /** Optional for older preload mocks; the production bridge always exposes them. */
  minimizeWindow?: () => Promise<void>;
  toggleMaximizeWindow?: () => Promise<void>;
  closeWindow?: () => Promise<void>;

  onScanProgress(listener: ScanProgressListener): Unsubscribe;
  /** Optional for compatibility with older preload bridges. */
  onScanResult?: (listener: ScanResultListener) => Unsubscribe;
  onPlayerStateChange(listener: PlayerStateListener): Unsubscribe;
  onPlayerTimeUpdate(listener: PlayerTimeUpdateListener): Unsubscribe;
  onPlayerError(listener: PlayerErrorListener): Unsubscribe;
}

/** Payloads used by the push channels when handlers need a named contract. */
export interface IpcEventPayloads {
  [SCAN_PROGRESS]: ScanProgress;
  [SCAN_RESULT]: ScanResultEvent;
  [PLAYER_STATE_CHANGE]: PlayerState;
  [PLAYER_TIME_UPDATE]: PlayerTimeUpdate;
  [PLAYER_ERROR]: SerializedAppError;
}

/** Result shape returned by an import request. */
export type ScanStartResult = ScanResult;
