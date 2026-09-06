import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: class {},
  dialog: {},
  ipcMain: {},
  net: {},
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  shell: {},
}));

import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { createPlaylist, listPlaylistTracks } from '../../src/main/database/queries/playlists';
import { getTrack, insertTrack } from '../../src/main/database/queries/tracks';
import { createDatabaseLibraryService } from '../../src/main/index';
import { createBulkTrackService } from '../../src/main/services/bulk-track-service';

describe('bulk track service', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'Game One' });
    createGame(db, { id: 'g2', name: 'Game Two' });
    insertTrack(db, {
      id: 't1', gameId: 'g1', filePath: 'C:/Library/Game One/音乐/t1.ogg',
      fileName: 't1.ogg', format: 'ogg', fileSize: 1, fileHash: 'hash-t1',
    });
    insertTrack(db, {
      id: 't2', gameId: 'g1', filePath: 'C:/Library/Game One/音乐/t2.ogg',
      fileName: 't2.ogg', format: 'ogg', fileSize: 2, fileHash: 'hash-t2',
    });
    insertTrack(db, {
      id: 'other-game-track', gameId: 'g2', filePath: 'C:/Library/Game Two/音乐/other.ogg',
      fileName: 'other.ogg', format: 'ogg', fileSize: 3, fileHash: 'hash-other',
    });
    createPlaylist(db, { id: 'p1', name: 'Playlist One' });
  });

  afterEach(() => {
    db.close();
  });

  it('favorites and unfavorites all valid source-game tracks in one request', async () => {
    const service = createBulkTrackService({ db, getLibraryPath: () => 'C:/Library' });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: ['t1', 't2'],
      operation: { type: 'favorite', isFavorite: true },
    })).resolves.toEqual({ succeededIds: ['t1', 't2'], failures: [] });
    expect(getTrack(db, 't1')?.isFavorite).toBe(true);
    expect(getTrack(db, 't2')?.isFavorite).toBe(true);

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: ['t1', 't2'],
      operation: { type: 'favorite', isFavorite: false },
    })).resolves.toEqual({ succeededIds: ['t1', 't2'], failures: [] });
    expect(getTrack(db, 't1')?.isFavorite).toBe(false);
    expect(getTrack(db, 't2')?.isFavorite).toBe(false);
  });

  it('adds valid tracks to a playlist once while repeated requests remain successful', async () => {
    const service = createBulkTrackService({ db, getLibraryPath: () => 'C:/Library' });
    const request = {
      sourceGameId: 'g1',
      trackIds: ['t2', 't1'],
      operation: { type: 'playlist-add' as const, playlistId: 'p1' },
    };

    await expect(service.execute(request)).resolves.toEqual({ succeededIds: ['t2', 't1'], failures: [] });
    await expect(service.execute(request)).resolves.toEqual({ succeededIds: ['t2', 't1'], failures: [] });
    expect(listPlaylistTracks(db, 'p1').map((track) => track.id)).toEqual(['t2', 't1']);
  });

  it.each([
    { type: 'favorite' as const, isFavorite: true },
    { type: 'playlist-add' as const, playlistId: 'p1' },
  ])('reports missing and cross-game IDs for $type while continuing valid tracks', async (operation) => {
    const service = createBulkTrackService({ db, getLibraryPath: () => 'C:/Library' });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['missing', 't1', 'other-game-track', 't2'],
      operation,
    });

    expect(result.succeededIds).toEqual(['t1', 't2']);
    expect(result.failures).toEqual([
      { trackId: 'missing', userMessage: '找不到指定的曲目。' },
      { trackId: 'other-game-track', userMessage: '曲目不属于当前游戏文件夹。' },
    ]);
  });

  it('rejects the whole playlist request when the target playlist does not exist', async () => {
    const service = createBulkTrackService({ db, getLibraryPath: () => 'C:/Library' });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: ['t1', 'missing'],
      operation: { type: 'playlist-add', playlistId: 'missing-playlist' },
    })).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      userMessage: '找不到指定的播放列表。',
    });
    expect(listPlaylistTracks(db, 'p1')).toHaveLength(0);
  });

  it('exposes the bulk service through the database library service', async () => {
    const library = createDatabaseLibraryService(db, { getLibraryPath: () => 'C:/Library' });

    await expect(library.bulkUpdateTracks?.({
      sourceGameId: 'g1',
      trackIds: ['t1'],
      operation: { type: 'favorite', isFavorite: true },
    })).resolves.toEqual({ succeededIds: ['t1'], failures: [] });
    expect(getTrack(db, 't1')?.isFavorite).toBe(true);
  });

  it('rolls back favorites when fewer rows are affected than the validated track count', async () => {
    db.exec(`
      CREATE TRIGGER ignore_one_bulk_favorite
      BEFORE UPDATE OF is_favorite ON tracks
      WHEN OLD.id = 't2'
      BEGIN
        SELECT RAISE(IGNORE);
      END;
    `);
    const service = createBulkTrackService({ db, getLibraryPath: () => 'C:/Library' });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['t1', 't2'],
      operation: { type: 'favorite', isFavorite: true },
    });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures.map((item) => item.trackId)).toEqual(['t1', 't2']);
    expect(getTrack(db, 't1')?.isFavorite).toBe(false);
    expect(getTrack(db, 't2')?.isFavorite).toBe(false);
  });
});
