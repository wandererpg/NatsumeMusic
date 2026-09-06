import { describe, expect, it, vi } from 'vitest';

import {
  IPC_APP_CANCEL_APPEARANCE_PREVIEW,
  IPC_APP_SAVE_SETTINGS,
  IPC_APP_SET_SETTING,
  IPC_DIALOG_SELECT_FILES,
  IPC_LIBRARY_CREATE_PLAYLIST,
  IPC_LIBRARY_BULK_UPDATE_TRACKS,
  IPC_LIBRARY_GET_PLAYLISTS,
  IPC_LIBRARY_GET_GAMES,
  IPC_LIBRARY_GET_TRACKS,
  IPC_LIBRARY_GET_GAME_METADATA,
  IPC_LIBRARY_REFRESH_GAME_METADATA,
  IPC_LIBRARY_UPDATE_GAME,
  IPC_SCAN_CANCEL,
  IPC_SCAN_START,
} from '../../src/shared/ipc';
import type { BulkTrackRequest } from '../../src/shared/types';
import { registerLibraryHandlers } from '../../src/main/ipc/library-handlers';
import { registerDialogHandlers } from '../../src/main/ipc/dialog-handlers';
import { registerScanHandlers } from '../../src/main/ipc/scan-handlers';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();
  readonly listeners = new Map<string, Handler>();

  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }

  on(channel: string, listener: Handler): void {
    this.listeners.set(channel, listener);
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for ${channel}`);
    }
    return await handler({ sender: { send: vi.fn() } }, ...args);
  }
}

describe('main-process IPC handlers', () => {
  it('offers OWP files in the audio file picker', async () => {
    const ipcMain = new FakeIpcMain();
    const dialog = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: [] }) };
    registerDialogHandlers({
      ipcMain,
      dialog,
      shell: { openPath: vi.fn().mockResolvedValue('') },
    });

    await ipcMain.invoke(IPC_DIALOG_SELECT_FILES);

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(undefined, expect.objectContaining({
      filters: [{ name: 'Audio', extensions: expect.arrayContaining(['owp']) }],
    }));
  });

  it('returns library query results from library:get-games', async () => {
    const ipcMain = new FakeIpcMain();
    const games = [{
      id: 'game-1',
      name: 'ATRI',
      coverPath: null,
      trackCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }];
    const library = {
      getGames: vi.fn().mockResolvedValue(games),
      getTracks: vi.fn(),
    };

    registerLibraryHandlers({ ipcMain, library });

    await expect(ipcMain.invoke(IPC_LIBRARY_GET_GAMES)).resolves.toEqual(games);
    expect(library.getGames).toHaveBeenCalledOnce();
  });

  it('starts an import with an id and cancels the matching controller', async () => {
    const ipcMain = new FakeIpcMain();
    let resolveImport!: () => void;
    const importFinished = new Promise<void>((resolve) => {
      resolveImport = resolve;
    });
    let receivedSignal: AbortSignal | undefined;
    const importer = {
      importGameFolder: vi.fn(async (options: { signal: AbortSignal }) => {
        receivedSignal = options.signal;
        await importFinished;
        return { found: 0, extracted: 0, copied: 0, skipped: 0, errors: [] };
      }),
    };

    registerScanHandlers({
      ipcMain,
      importer,
      getLibraryPath: () => 'C:\\GalMusic',
      idFactory: () => 'scan-1',
    });

    await expect(ipcMain.invoke(IPC_SCAN_START, {
      sourcePath: 'C:\\Games\\ATRI',
      gameName: 'ATRI',
      deepScan: true,
      includeVoice: true,
      voiceThresholdSeconds: 18.5,
    })).resolves.toBe('scan-1');

    // The importer starts asynchronously after the request id is returned.
    await vi.waitFor(() => expect(importer.importGameFolder).toHaveBeenCalledOnce());
    expect(importer.importGameFolder).toHaveBeenCalledWith(expect.objectContaining({ voiceThresholdSeconds: 18.5 }));
    expect(receivedSignal?.aborted).toBe(false);

    await expect(ipcMain.invoke(IPC_SCAN_CANCEL, 'scan-1')).resolves.toBeUndefined();
    expect(receivedSignal?.aborted).toBe(true);

    resolveImport();
    await vi.waitFor(() => expect(importer.importGameFolder).toHaveReturned());
  });

  it('rejects malformed renderer arguments before calling the library or filesystem', async () => {
    const ipcMain = new FakeIpcMain();
    const library = {
      getGames: vi.fn(),
      getTracks: vi.fn(),
    };
    registerLibraryHandlers({ ipcMain, library });

    await expect(ipcMain.invoke(IPC_LIBRARY_GET_TRACKS, 42)).rejects.toMatchObject({
      code: 'DB_ERROR',
    });
    await expect(ipcMain.invoke(IPC_LIBRARY_GET_TRACKS, 'bad\u0000path')).rejects.toMatchObject({
      code: 'DB_ERROR',
    });
    expect(library.getTracks).not.toHaveBeenCalled();
  });

  it('routes collection queries and game metadata updates through the library service', async () => {
    const ipcMain = new FakeIpcMain();
    const library = {
      getGames: vi.fn().mockResolvedValue([]),
      getTracks: vi.fn().mockResolvedValue([]),
      getPlaylists: vi.fn().mockResolvedValue([]),
      createPlaylist: vi.fn().mockResolvedValue({ id: 'p1', name: 'Night', trackIds: [], createdAt: '' }),
      updateGame: vi.fn().mockResolvedValue({ id: 'g1', name: 'New', coverPath: null, trackCount: 0, createdAt: '', updatedAt: '' }),
    };
    registerLibraryHandlers({ ipcMain, library });

    await ipcMain.invoke(IPC_LIBRARY_GET_TRACKS, { section: 'favorites', gameId: null, playlistId: null, search: 'theme', kind: null });
    await ipcMain.invoke(IPC_LIBRARY_GET_PLAYLISTS);
    await ipcMain.invoke(IPC_LIBRARY_CREATE_PLAYLIST, 'Night');
    await ipcMain.invoke(IPC_LIBRARY_UPDATE_GAME, 'g1', { name: 'New' });

    expect(library.getTracks).toHaveBeenCalledWith({ section: 'favorites', gameId: null, playlistId: null, search: 'theme', kind: null });
    expect(library.getPlaylists).toHaveBeenCalledOnce();
    expect(library.createPlaylist).toHaveBeenCalledWith('Night');
    expect(library.updateGame).toHaveBeenCalledWith('g1', { name: 'New' });
  });

  it('reads and refreshes sanitized game metadata with strict arguments', async () => {
    const ipcMain = new FakeIpcMain();
    const summary = { gameId: 'g1', coverSource: null, sources: [] };
    const library = {
      getGames: vi.fn(),
      getTracks: vi.fn(),
      getGameMetadata: vi.fn().mockResolvedValue(summary),
      refreshGameMetadata: vi.fn().mockResolvedValue(summary),
    };
    registerLibraryHandlers({ ipcMain, library });

    await expect(ipcMain.invoke(IPC_LIBRARY_GET_GAME_METADATA, 'g1')).resolves.toEqual(summary);
    await expect(ipcMain.invoke(IPC_LIBRARY_REFRESH_GAME_METADATA, 'g1')).resolves.toEqual(summary);
    await expect(ipcMain.invoke(IPC_LIBRARY_GET_GAME_METADATA, 'g1', 'extra')).rejects.toMatchObject({ code: 'DB_ERROR' });
    expect(library.getGameMetadata).toHaveBeenCalledWith('g1');
    expect(library.refreshGameMetadata).toHaveBeenCalledWith('g1');
  });

  it('rejects an invalid voice option before starting a scan', async () => {
    const ipcMain = new FakeIpcMain();
    const importer = { importGameFolder: vi.fn() };
    registerScanHandlers({ ipcMain, importer, getLibraryPath: () => 'C:\\Music', idFactory: () => 'scan-2' });

    await expect(ipcMain.invoke(IPC_SCAN_START, {
      sourcePath: 'C:\\Games\\ATRI', gameName: 'ATRI', deepScan: true, includeVoice: 'true',
      voiceThresholdSeconds: 25,
    })).rejects.toMatchObject({ code: 'DB_ERROR' });
    expect(importer.importGameFolder).not.toHaveBeenCalled();
  });

  it('rejects invalid scan thresholds', async () => {
    const ipcMain = new FakeIpcMain();
    const importer = { importGameFolder: vi.fn() };
    registerScanHandlers({ ipcMain, importer, getLibraryPath: () => 'C:\\Music', idFactory: () => 'scan-3' });

    for (const voiceThresholdSeconds of [0, 60.1, Number.NaN, Number.POSITIVE_INFINITY, '25']) {
      await expect(ipcMain.invoke(IPC_SCAN_START, {
        sourcePath: 'C:\\Games\\ATRI', gameName: 'ATRI', deepScan: false,
        includeVoice: false, voiceThresholdSeconds,
      })).rejects.toMatchObject({ code: 'DB_ERROR' });
    }
    expect(importer.importGameFolder).not.toHaveBeenCalled();
  });

  it('validates a persisted voice threshold before calling the library service', async () => {
    const ipcMain = new FakeIpcMain();
    const library = { getGames: vi.fn(), getTracks: vi.fn(), setSetting: vi.fn() };
    registerLibraryHandlers({ ipcMain, library });

    await expect(ipcMain.invoke(IPC_APP_SET_SETTING, 'voice_threshold_seconds', '60.1'))
      .rejects.toMatchObject({ code: 'DB_ERROR' });
    expect(library.setSetting).not.toHaveBeenCalled();
    await ipcMain.invoke(IPC_APP_SET_SETTING, 'voice_threshold_seconds', '18.5');
    expect(library.setSetting).toHaveBeenCalledWith('voice_threshold_seconds', '18.5');
  });

  it.each(['background_image_path', 'made_up_key'])('rejects renderer writes to protected setting %s', async (key) => {
    const ipcMain = new FakeIpcMain();
    const library = { getGames: vi.fn(), getTracks: vi.fn(), setSetting: vi.fn() };
    registerLibraryHandlers({ ipcMain, library });
    await expect(ipcMain.invoke(IPC_APP_SET_SETTING, key, 'D:/Pictures/secret.png')).rejects.toMatchObject({ code: 'DB_ERROR' });
    expect(library.setSetting).not.toHaveBeenCalled();
  });

  it('atomically saves only a background path authorized by the main-process picker', async () => {
    const ipcMain = new FakeIpcMain();
    const saved = { libraryPath: '', volume: 0.8, playMode: 'list-loop', lastTrackId: null, voiceThresholdSeconds: 25, themeId: 'rain-afterglow', background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 } } as const;
    const changes = { libraryPath: 'C:/Music', volume: 0.5, playMode: 'random', themeId: 'neon-terminal', background: { imagePath: 'D:/Pictures/scene.png', blur: 18, dim: 0.5, scale: 120, positionX: 40, positionY: 60 } } as const;
    const library = { getGames: vi.fn(), getTracks: vi.fn(), getSettings: vi.fn().mockResolvedValue(saved), saveSettings: vi.fn() };
    const authorization = { previewBackgroundPath: null as string | null };
    registerLibraryHandlers({ ipcMain, library, appearanceAuthorization: authorization });

    await expect(ipcMain.invoke(IPC_APP_SAVE_SETTINGS, changes)).rejects.toMatchObject({ code: 'DB_ERROR' });
    authorization.previewBackgroundPath = changes.background.imagePath;
    await expect(ipcMain.invoke(IPC_APP_SAVE_SETTINGS, changes)).resolves.toBeUndefined();
    expect(library.saveSettings).toHaveBeenCalledOnce();
    expect(authorization.previewBackgroundPath).toBeNull();
  });

  it('cancels appearance preview without writing settings', async () => {
    const ipcMain = new FakeIpcMain();
    const authorization = { previewBackgroundPath: 'D:/Pictures/scene.png' as string | null };
    const library = { getGames: vi.fn(), getTracks: vi.fn() };
    registerLibraryHandlers({ ipcMain, library, appearanceAuthorization: authorization });
    await ipcMain.invoke(IPC_APP_CANCEL_APPEARANCE_PREVIEW);
    expect(authorization.previewBackgroundPath).toBeNull();
  });

  it('routes one valid bulk-track request unchanged to the library service', async () => {
    const ipcMain = new FakeIpcMain();
    const request: BulkTrackRequest = {
      sourceGameId: 'g1',
      trackIds: ['t1', 't2'],
      operation: { type: 'favorite', isFavorite: true },
    };
    const result = { succeededIds: ['t1', 't2'], failures: [] };
    const library = {
      getGames: vi.fn(),
      getTracks: vi.fn(),
      bulkUpdateTracks: vi.fn().mockResolvedValue(result),
    };
    registerLibraryHandlers({ ipcMain, library });

    await expect(ipcMain.invoke(IPC_LIBRARY_BULK_UPDATE_TRACKS, request)).resolves.toEqual(result);
    expect(library.bulkUpdateTracks).toHaveBeenCalledWith(request);
  });

  it.each([
    ['empty track list', { sourceGameId: 'g1', trackIds: [], operation: { type: 'favorite', isFavorite: true } }],
    ['duplicate track ids', { sourceGameId: 'g1', trackIds: ['t1', 't1'], operation: { type: 'favorite', isFavorite: true } }],
    ['duplicate ids after trimming', { sourceGameId: 'g1', trackIds: ['t1', ' t1 '], operation: { type: 'favorite', isFavorite: true } }],
    ['more than 2,000 ids', { sourceGameId: 'g1', trackIds: Array.from({ length: 2_001 }, (_, index) => `t${index}`), operation: { type: 'favorite', isFavorite: true } }],
    ['blank source game', { sourceGameId: '   ', trackIds: ['t1'], operation: { type: 'favorite', isFavorite: true } }],
    ['blank track id', { sourceGameId: 'g1', trackIds: [' '], operation: { type: 'favorite', isFavorite: true } }],
    ['unknown request field', { sourceGameId: 'g1', trackIds: ['t1'], operation: { type: 'favorite', isFavorite: true }, unexpected: true }],
    ['unknown operation field', { sourceGameId: 'g1', trackIds: ['t1'], operation: { type: 'favorite', isFavorite: true, unexpected: true } }],
    ['invalid favorite value', { sourceGameId: 'g1', trackIds: ['t1'], operation: { type: 'favorite', isFavorite: 'true' } }],
    ['missing playlist target', { sourceGameId: 'g1', trackIds: ['t1'], operation: { type: 'playlist-add' } }],
    ['same move target', { sourceGameId: 'g1', trackIds: ['t1'], operation: { type: 'move', targetGameId: 'g1' } }],
    ['invalid delete mode', { sourceGameId: 'g1', trackIds: ['t1'], operation: { type: 'delete', deleteFiles: 'yes' } }],
    ['unknown operation type', { sourceGameId: 'g1', trackIds: ['t1'], operation: { type: 'archive' } }],
  ])('rejects an invalid bulk-track request: %s', async (_name, request) => {
    const ipcMain = new FakeIpcMain();
    const library = {
      getGames: vi.fn(),
      getTracks: vi.fn(),
      bulkUpdateTracks: vi.fn(),
    };
    registerLibraryHandlers({ ipcMain, library });

    await expect(ipcMain.invoke(IPC_LIBRARY_BULK_UPDATE_TRACKS, request)).rejects.toMatchObject({ code: 'DB_ERROR' });
    expect(library.bulkUpdateTracks).not.toHaveBeenCalled();
  });
});
