import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import {
  addTracksToPlaylist,
  createPlaylist,
  listPlaylistTracks,
} from '../../src/main/database/queries/playlists';
import {
  deleteTracks,
  getTrack,
  getTracksByIds,
  insertTrack,
  moveTrackRecord,
  setTracksFavorite,
} from '../../src/main/database/queries/tracks';

describe('bulk track database queries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'Game One' });
    createGame(db, { id: 'g2', name: 'Game Two' });

    for (const [index, id] of ['t1', 't2', 't3'].entries()) {
      insertTrack(db, {
        id,
        gameId: 'g1',
        filePath: `C:/Library/G1/音乐/${id}.ogg`,
        fileName: `${id}.ogg`,
        customName: id === 't1' ? 'Opening' : null,
        duration: 60 + index,
        format: 'ogg',
        fileSize: 100 + index,
        fileHash: `hash-${id}`,
        trackNumber: index + 1,
        kind: id === 't2' ? 'voice' : 'music',
      });
    }

    createPlaylist(db, { id: 'p1', name: 'Favorites' });
  });

  afterEach(() => {
    db.close();
  });

  it('gets tracks in requested order and ignores missing IDs', () => {
    expect(getTracksByIds(db, ['t2', 'missing', 't1']).map((track) => track.id)).toEqual(['t2', 't1']);
    expect(getTracksByIds(db, [])).toEqual([]);
  });

  it('sets favorite state for all matching tracks', () => {
    expect(setTracksFavorite(db, ['t1', 't2', 'missing'], true)).toBe(2);
    expect(getTrack(db, 't1')?.isFavorite).toBe(true);
    expect(getTrack(db, 't2')?.isFavorite).toBe(true);

    expect(setTracksFavorite(db, ['t1', 't2'], false)).toBe(2);
    expect(getTrack(db, 't1')?.isFavorite).toBe(false);
    expect(setTracksFavorite(db, [], true)).toBe(0);
  });

  it('moves only storage ownership fields and preserves track metadata and playlist membership', () => {
    setTracksFavorite(db, ['t1'], true);
    addTracksToPlaylist(db, 'p1', ['t1']);

    expect(moveTrackRecord(db, 't1', {
      gameId: 'g2',
      filePath: 'C:/Library/G2/音乐/a.ogg',
      fileName: 'a.ogg',
    })).toBe(true);

    const moved = getTrack(db, 't1');
    expect(moved).toMatchObject({
      id: 't1',
      gameId: 'g2',
      filePath: 'C:/Library/G2/音乐/a.ogg',
      fileName: 'a.ogg',
      displayName: 'Opening',
      customName: 'Opening',
      kind: 'music',
      isFavorite: true,
    });
    expect(listPlaylistTracks(db, 'p1').map((track) => track.id)).toEqual(['t1']);
    expect(moveTrackRecord(db, 'missing', {
      gameId: 'g2',
      filePath: 'C:/Library/G2/音乐/missing.ogg',
      fileName: 'missing.ogg',
    })).toBe(false);
  });

  it('deletes all matching tracks and cascades playlist membership', () => {
    addTracksToPlaylist(db, 'p1', ['t1', 't2', 't3']);

    expect(deleteTracks(db, ['t1', 'missing', 't2'])).toBe(2);
    expect(getTracksByIds(db, ['t1', 't2'])).toEqual([]);
    expect(listPlaylistTracks(db, 'p1').map((track) => track.id)).toEqual(['t3']);
    expect(deleteTracks(db, [])).toBe(0);
  });

  it('adds tracks in input order using contiguous positions and ignores duplicates', () => {
    expect(addTracksToPlaylist(db, 'p1', ['t2', 't1'])).toBe(2);
    expect(listPlaylistTracks(db, 'p1').map((track) => track.id)).toEqual(['t2', 't1']);

    expect(addTracksToPlaylist(db, 'p1', ['t2', 't3', 't1'])).toBe(1);
    expect(listPlaylistTracks(db, 'p1').map((track) => track.id)).toEqual(['t2', 't1', 't3']);
    expect(db.prepare(`
      SELECT position
      FROM playlist_tracks
      WHERE playlist_id = ?
      ORDER BY position ASC
    `).all('p1')).toEqual([{ position: 0 }, { position: 1 }, { position: 2 }]);
    expect(addTracksToPlaylist(db, 'p1', [])).toBe(0);
  });
});
