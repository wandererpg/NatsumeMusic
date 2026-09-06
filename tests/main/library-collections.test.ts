import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import {
  insertTrack,
  listTracks,
  updateTrack,
} from '../../src/main/database/queries/tracks';
import {
  addTrackToPlaylist,
  createPlaylist,
  listPlaylistTracks,
  listPlaylists,
} from '../../src/main/database/queries/playlists';

function makeTrack(id: string, gameId: string, createdAt: string, trackNumber: number) {
  return insertTrack(db, {
    id,
    gameId,
    filePath: `C:/GalMusic/${id}.ogg`,
    fileName: `${id}.ogg`,
    format: 'ogg',
    fileSize: 10,
    fileHash: `hash-${id}`,
    trackNumber,
  });
}

let db: Database.Database;

describe('library collection queries', () => {
  it('keeps all, recent, favorites, and playlist scopes independent', () => {
    db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });
    createGame(db, { id: 'g2', name: 'Nine' });
    makeTrack('t1', 'g1', '2026-01-01T00:00:00.000Z', 1);
    makeTrack('t2', 'g1', '2026-01-03T00:00:00.000Z', 2);
    makeTrack('t3', 'g2', '2026-01-02T00:00:00.000Z', 1);
    db.prepare('UPDATE tracks SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', 't1');
    db.prepare('UPDATE tracks SET created_at = ? WHERE id = ?').run('2026-01-03T00:00:00.000Z', 't2');
    db.prepare('UPDATE tracks SET created_at = ? WHERE id = ?').run('2026-01-02T00:00:00.000Z', 't3');
    updateTrack(db, 't2', { isFavorite: true });

    const playlist = createPlaylist(db, { id: 'p1', name: 'Night Drive' });
    addTrackToPlaylist(db, playlist.id, 't3');

    expect(listTracks(db)).toHaveLength(3);
    expect(listTracks(db, 'g1')).toHaveLength(2);
    expect(listTracks(db, undefined, { favoritesOnly: true }).map((track) => track.id)).toEqual(['t2']);
    expect(listTracks(db, undefined, { order: 'recent' }).map((track) => track.id)).toEqual(['t2', 't3', 't1']);
    expect(listPlaylistTracks(db, 'p1').map((track) => track.id)).toEqual(['t3']);
    expect(listPlaylists(db)[0]).toMatchObject({ id: 'p1', name: 'Night Drive', trackCount: 1 });

    db.close();
  });
});
