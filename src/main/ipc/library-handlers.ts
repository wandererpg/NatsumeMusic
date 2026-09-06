import { AppError } from '../../shared/errors';
import {
  IPC_APP_GET_SETTINGS,
  IPC_APP_CANCEL_APPEARANCE_PREVIEW,
  IPC_APP_SAVE_SETTINGS,
  IPC_APP_SET_SETTING,
  IPC_LIBRARY_ADD_TRACKS,
  IPC_LIBRARY_BULK_UPDATE_TRACKS,
  IPC_LIBRARY_DELETE_TRACK,
  IPC_LIBRARY_DELETE_GAME,
  IPC_LIBRARY_ADD_TRACK_TO_PLAYLIST,
  IPC_LIBRARY_CREATE_PLAYLIST,
  IPC_LIBRARY_DELETE_PLAYLIST,
  IPC_LIBRARY_GET_PLAYLISTS,
  IPC_LIBRARY_GET_GAMES,
  IPC_LIBRARY_GET_GAME_METADATA,
  IPC_LIBRARY_GET_TRACKS,
  IPC_LIBRARY_REFRESH_GAME_METADATA,
  IPC_LIBRARY_REMOVE_TRACK_FROM_PLAYLIST,
  IPC_LIBRARY_SEARCH,
  IPC_LIBRARY_UPDATE_GAME,
  IPC_LIBRARY_UPDATE_TRACK,
} from '../../shared/ipc';
import { THEME_IDS } from '../../shared/types';
import type {
  AddTracksRequest,
  AppSettings,
  AppSettingsUpdate,
  BulkTrackOperation,
  BulkTrackRequest,
  BulkTrackResult,
  Game,
  GameMetadataSummary,
  GameUpdate,
  Playlist,
  Track,
  TrackQuery,
  TrackUpdate,
} from '../../shared/types';
import {
  assertArgumentCount,
  assertNoUnexpectedKeys,
  assertPath,
  assertRecord,
  assertString,
  invalidArgument,
} from './validation';
import { isValidVoiceThreshold } from '../services/track-classification';

export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  on?(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export interface LibraryService {
  getGames(): Promise<Game[]> | Game[];
  getTracks(query: TrackQuery | string | null): Promise<Track[]> | Track[];
  addTracks?(options: AddTracksRequest): Promise<Track[]> | Track[];
  updateTrack?(trackId: string, changes: TrackUpdate): Promise<Track> | Track;
  deleteTrack?(trackId: string): Promise<void> | void;
  search?(query: string): Promise<Track[]> | Track[];
  getPlaylists?(): Promise<Playlist[]> | Playlist[];
  createPlaylist?(name: string): Promise<Playlist> | Playlist;
  deletePlaylist?(playlistId: string): Promise<void> | void;
  addTrackToPlaylist?(playlistId: string, trackId: string): Promise<void> | void;
  removeTrackFromPlaylist?(playlistId: string, trackId: string): Promise<void> | void;
  updateGame?(gameId: string, changes: GameUpdate): Promise<Game> | Game;
  getGameMetadata?(gameId: string): Promise<GameMetadataSummary> | GameMetadataSummary;
  refreshGameMetadata?(gameId: string): Promise<GameMetadataSummary> | GameMetadataSummary;
  deleteGame?(gameId: string): Promise<void> | void;
  bulkUpdateTracks?(request: BulkTrackRequest): Promise<BulkTrackResult> | BulkTrackResult;
  getSettings?(): Promise<AppSettings> | AppSettings;
  setSetting?(key: string, value: string): Promise<void> | void;
  saveSettings?(changes: AppSettingsUpdate): Promise<void> | void;
}

export interface AppearanceAuthorization {
  previewBackgroundPath: string | null;
}

export interface LibraryHandlerDependencies {
  ipcMain: IpcMainLike;
  library: LibraryService;
  appearanceAuthorization?: AppearanceAuthorization;
}

function serviceMethod<T extends keyof LibraryService>(library: LibraryService, method: T): NonNullable<LibraryService[T]> {
  const candidate = library[method];
  if (typeof candidate !== 'function') {
    throw new AppError('DB_ERROR', `Library service does not implement ${String(method)}`, '库服务暂不可用。');
  }
  return candidate as NonNullable<LibraryService[T]>;
}

function validateGameId(value: unknown): string {
  assertString(value, 'gameId');
  return value;
}

function validateTrackId(value: unknown): string {
  assertString(value, 'trackId');
  return value;
}

function validateTrackQuery(value: unknown): TrackQuery {
  if (value === null) {
    return { section: 'library', gameId: null, playlistId: null, search: '', kind: null };
  }
  if (typeof value === 'string') {
    validateGameId(value);
    return { section: 'library', gameId: value, playlistId: null, search: '', kind: null };
  }
  assertRecord(value, 'query');
  assertNoUnexpectedKeys(value, ['section', 'gameId', 'playlistId', 'search', 'kind'], 'query');
  const section = value.section ?? 'library';
  if (section !== 'library' && section !== 'recent' && section !== 'favorites' && section !== 'playlists') {
    throw invalidArgument('query.section is invalid');
  }
  if (value.gameId !== undefined && value.gameId !== null) {
    validateGameId(value.gameId);
  }
  if (value.playlistId !== undefined && value.playlistId !== null) {
    validateStringId(value.playlistId, 'query.playlistId');
  }
  if (value.search !== undefined) {
    assertString(value.search, 'query.search', { allowEmpty: true });
  }
  if (value.kind !== undefined && value.kind !== null && value.kind !== 'music' && value.kind !== 'voice') {
    throw invalidArgument('query.kind is invalid');
  }
  return {
    section,
    gameId: value.gameId as string | null | undefined,
    playlistId: value.playlistId as string | null | undefined,
    search: (value.search as string | undefined) ?? '',
    kind: value.kind as TrackQuery['kind'],
  };
}

function validateStringId(value: unknown, label: string): string {
  assertString(value, label);
  return value;
}

function validateAddTracks(value: unknown): AddTracksRequest {
  assertRecord(value, 'options');
  assertNoUnexpectedKeys(value, ['gameId', 'filePaths'], 'options');
  const gameId = validateGameId(value.gameId);
  if (!Array.isArray(value.filePaths) || value.filePaths.length === 0) {
    throw invalidArgument('options.filePaths must contain at least one path');
  }
  const filePaths = value.filePaths.map((filePath, index) => {
    assertPath(filePath, `options.filePaths[${index}]`);
    return filePath;
  });
  return { gameId, filePaths };
}

function validateTrackUpdate(value: unknown): TrackUpdate {
  assertRecord(value, 'changes');
  assertNoUnexpectedKeys(value, ['customName', 'trackNumber', 'isFavorite'], 'changes');
  const changes: TrackUpdate = {};
  if (Object.prototype.hasOwnProperty.call(value, 'customName')) {
    if (value.customName !== null) {
      assertString(value.customName, 'changes.customName', { allowEmpty: true });
    }
    changes.customName = value.customName as string | null;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'trackNumber')) {
    if (typeof value.trackNumber !== 'number' || !Number.isInteger(value.trackNumber) || value.trackNumber < 0) {
      throw invalidArgument('changes.trackNumber must be a non-negative integer');
    }
    changes.trackNumber = value.trackNumber;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'isFavorite')) {
    if (typeof value.isFavorite !== 'boolean') {
      throw invalidArgument('changes.isFavorite must be a boolean');
    }
    changes.isFavorite = value.isFavorite;
  }
  return changes;
}

function validateGameUpdate(value: unknown): GameUpdate {
  assertRecord(value, 'changes');
  assertNoUnexpectedKeys(value, ['name', 'coverPath'], 'changes');
  const changes: GameUpdate = {};
  if (Object.prototype.hasOwnProperty.call(value, 'name')) {
    assertString(value.name, 'changes.name');
    if (value.name === '.' || value.name === '..' || /[\\/]/.test(value.name)) {
      throw invalidArgument('changes.name must be a single directory name');
    }
    changes.name = value.name;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'coverPath')) {
    if (value.coverPath !== null) {
      assertPath(value.coverPath, 'changes.coverPath');
    }
    changes.coverPath = value.coverPath as string | null;
  }
  if (Object.keys(changes).length === 0) {
    throw invalidArgument('changes must contain a name or coverPath');
  }
  return changes;
}

function validateBulkTrackOperation(value: unknown, sourceGameId: string): BulkTrackOperation {
  assertRecord(value, 'request.operation');
  if (value.type === 'favorite') {
    assertNoUnexpectedKeys(value, ['type', 'isFavorite'], 'request.operation');
    if (typeof value.isFavorite !== 'boolean') {
      throw invalidArgument('request.operation.isFavorite must be a boolean');
    }
    return { type: 'favorite', isFavorite: value.isFavorite };
  }
  if (value.type === 'playlist-add') {
    assertNoUnexpectedKeys(value, ['type', 'playlistId'], 'request.operation');
    const playlistId = validateStringId(value.playlistId, 'request.operation.playlistId').trim();
    return { type: 'playlist-add', playlistId };
  }
  if (value.type === 'move') {
    assertNoUnexpectedKeys(value, ['type', 'targetGameId'], 'request.operation');
    const targetGameId = validateGameId(value.targetGameId).trim();
    if (targetGameId === sourceGameId) {
      throw invalidArgument('request.operation.targetGameId must differ from sourceGameId');
    }
    return { type: 'move', targetGameId };
  }
  if (value.type === 'delete') {
    assertNoUnexpectedKeys(value, ['type', 'deleteFiles'], 'request.operation');
    if (typeof value.deleteFiles !== 'boolean') {
      throw invalidArgument('request.operation.deleteFiles must be a boolean');
    }
    return { type: 'delete', deleteFiles: value.deleteFiles };
  }
  throw invalidArgument('request.operation.type is invalid');
}

function validateBulkTrackRequest(value: unknown): BulkTrackRequest {
  assertRecord(value, 'request');
  assertNoUnexpectedKeys(value, ['sourceGameId', 'trackIds', 'operation'], 'request');
  const sourceGameId = validateGameId(value.sourceGameId).trim();
  if (!Array.isArray(value.trackIds) || value.trackIds.length === 0 || value.trackIds.length > 2_000) {
    throw invalidArgument('request.trackIds must contain between 1 and 2000 ids');
  }
  const trackIds = value.trackIds.map((trackId, index) => {
    assertString(trackId, `request.trackIds[${index}]`);
    return trackId.trim();
  });
  if (new Set(trackIds).size !== trackIds.length) {
    throw invalidArgument('request.trackIds must not contain duplicates');
  }
  return {
    sourceGameId,
    trackIds,
    operation: validateBulkTrackOperation(value.operation, sourceGameId),
  };
}

/** Register all read/write library and settings requests. */
export function registerLibraryHandlers({ ipcMain, library, appearanceAuthorization }: LibraryHandlerDependencies): void {
  ipcMain.handle(IPC_LIBRARY_GET_GAMES, async (_event, ...args) => {
    assertArgumentCount(args, 0, IPC_LIBRARY_GET_GAMES);
    return await serviceMethod(library, 'getGames')();
  });

  ipcMain.handle(IPC_LIBRARY_GET_TRACKS, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_GET_TRACKS);
    return await serviceMethod(library, 'getTracks')(validateTrackQuery(args[0]));
  });

  ipcMain.handle(IPC_LIBRARY_ADD_TRACKS, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_ADD_TRACKS);
    return await serviceMethod(library, 'addTracks')(validateAddTracks(args[0]));
  });

  ipcMain.handle(IPC_LIBRARY_UPDATE_TRACK, async (_event, ...args) => {
    assertArgumentCount(args, 2, IPC_LIBRARY_UPDATE_TRACK);
    const trackId = validateTrackId(args[0]);
    return await serviceMethod(library, 'updateTrack')(trackId, validateTrackUpdate(args[1]));
  });

  ipcMain.handle(IPC_LIBRARY_DELETE_TRACK, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_DELETE_TRACK);
    return await serviceMethod(library, 'deleteTrack')(validateTrackId(args[0]));
  });

  ipcMain.handle(IPC_LIBRARY_SEARCH, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_SEARCH);
    assertString(args[0], 'query', { allowEmpty: true });
    return await serviceMethod(library, 'search')(args[0]);
  });

  ipcMain.handle(IPC_LIBRARY_GET_PLAYLISTS, async (_event, ...args) => {
    assertArgumentCount(args, 0, IPC_LIBRARY_GET_PLAYLISTS);
    return await serviceMethod(library, 'getPlaylists')();
  });

  ipcMain.handle(IPC_LIBRARY_CREATE_PLAYLIST, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_CREATE_PLAYLIST);
    assertString(args[0], 'name');
    return await serviceMethod(library, 'createPlaylist')(args[0]);
  });

  ipcMain.handle(IPC_LIBRARY_DELETE_PLAYLIST, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_DELETE_PLAYLIST);
    return await serviceMethod(library, 'deletePlaylist')(validateStringId(args[0], 'playlistId'));
  });

  ipcMain.handle(IPC_LIBRARY_ADD_TRACK_TO_PLAYLIST, async (_event, ...args) => {
    assertArgumentCount(args, 2, IPC_LIBRARY_ADD_TRACK_TO_PLAYLIST);
    return await serviceMethod(library, 'addTrackToPlaylist')(
      validateStringId(args[0], 'playlistId'),
      validateTrackId(args[1]),
    );
  });

  ipcMain.handle(IPC_LIBRARY_REMOVE_TRACK_FROM_PLAYLIST, async (_event, ...args) => {
    assertArgumentCount(args, 2, IPC_LIBRARY_REMOVE_TRACK_FROM_PLAYLIST);
    return await serviceMethod(library, 'removeTrackFromPlaylist')(
      validateStringId(args[0], 'playlistId'),
      validateTrackId(args[1]),
    );
  });

  ipcMain.handle(IPC_LIBRARY_UPDATE_GAME, async (_event, ...args) => {
    assertArgumentCount(args, 2, IPC_LIBRARY_UPDATE_GAME);
    return await serviceMethod(library, 'updateGame')(
      validateGameId(args[0]),
      validateGameUpdate(args[1]),
    );
  });

  ipcMain.handle(IPC_LIBRARY_GET_GAME_METADATA, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_GET_GAME_METADATA);
    return await serviceMethod(library, 'getGameMetadata')(validateGameId(args[0]));
  });

  ipcMain.handle(IPC_LIBRARY_REFRESH_GAME_METADATA, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_REFRESH_GAME_METADATA);
    return await serviceMethod(library, 'refreshGameMetadata')(validateGameId(args[0]));
  });

  ipcMain.handle(IPC_LIBRARY_DELETE_GAME, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_DELETE_GAME);
    return await serviceMethod(library, 'deleteGame')(validateGameId(args[0]));
  });

  ipcMain.handle(IPC_LIBRARY_BULK_UPDATE_TRACKS, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_LIBRARY_BULK_UPDATE_TRACKS);
    return await serviceMethod(library, 'bulkUpdateTracks')(validateBulkTrackRequest(args[0]));
  });

  ipcMain.handle(IPC_APP_GET_SETTINGS, async (_event, ...args) => {
    assertArgumentCount(args, 0, IPC_APP_GET_SETTINGS);
    return await serviceMethod(library, 'getSettings')();
  });

  ipcMain.handle(IPC_APP_SET_SETTING, async (_event, ...args) => {
    assertArgumentCount(args, 2, IPC_APP_SET_SETTING);
    assertString(args[0], 'key');
    assertString(args[1], 'value', { allowEmpty: true });
    const allowedKeys = new Set(['library_path', 'volume', 'play_mode', 'last_track_id', 'voice_threshold_seconds', 'window_width', 'window_height']);
    if (!allowedKeys.has(args[0])) throw invalidArgument(`setting key is not writable: ${args[0]}`);
    if (args[0] === 'voice_threshold_seconds') {
      const parsed = Number(args[1]);
      if (args[1].trim() === '' || !isValidVoiceThreshold(parsed)) {
        throw invalidArgument('voice_threshold_seconds must be a number from 1 to 60');
      }
    }
    return await serviceMethod(library, 'setSetting')(args[0], args[1]);
  });

  ipcMain.handle(IPC_APP_SAVE_SETTINGS, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_APP_SAVE_SETTINGS);
    const value = args[0];
    assertRecord(value, 'settings');
    assertNoUnexpectedKeys(value, ['libraryPath', 'volume', 'playMode', 'themeId', 'background'], 'settings');
    assertString(value.libraryPath, 'settings.libraryPath');
    if (typeof value.volume !== 'number' || !Number.isFinite(value.volume) || value.volume < 0 || value.volume > 1) throw invalidArgument('settings.volume must be from 0 to 1');
    if (!['sequential', 'random', 'single-loop', 'list-loop'].includes(value.playMode as string)) throw invalidArgument('settings.playMode is invalid');
    if (!THEME_IDS.includes(value.themeId as typeof THEME_IDS[number])) throw invalidArgument('settings.themeId is invalid');
    assertRecord(value.background, 'settings.background');
    assertNoUnexpectedKeys(value.background, ['imagePath', 'blur', 'dim', 'scale', 'positionX', 'positionY'], 'settings.background');
    if (value.background.imagePath !== null) assertPath(value.background.imagePath, 'settings.background.imagePath');
    const numericRanges = { blur: [0, 40], dim: [0, .85], scale: [100, 180], positionX: [0, 100], positionY: [0, 100] } as const;
    for (const [key, [minimum, maximum]] of Object.entries(numericRanges)) {
      const number = value.background[key];
      if (typeof number !== 'number' || !Number.isFinite(number) || number < minimum || number > maximum) throw invalidArgument(`settings.background.${key} is out of range`);
    }
    const current = await serviceMethod(library, 'getSettings')();
    const imagePath = value.background.imagePath as string | null;
    if (imagePath && imagePath !== current.background.imagePath && imagePath !== appearanceAuthorization?.previewBackgroundPath) {
      throw invalidArgument('settings.background.imagePath was not selected by the main process');
    }
    await serviceMethod(library, 'saveSettings')(value as unknown as AppSettingsUpdate);
    if (appearanceAuthorization) appearanceAuthorization.previewBackgroundPath = null;
  });

  ipcMain.handle(IPC_APP_CANCEL_APPEARANCE_PREVIEW, async (_event, ...args) => {
    assertArgumentCount(args, 0, IPC_APP_CANCEL_APPEARANCE_PREVIEW);
    if (appearanceAuthorization) appearanceAuthorization.previewBackgroundPath = null;
  });
}

export default registerLibraryHandlers;
