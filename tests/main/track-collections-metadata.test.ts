import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createGame } from '../../src/main/database/queries/games';
import { migrate } from '../../src/main/database/migrations';
import { insertTrack, listTracks } from '../../src/main/database/queries/tracks';

describe('track collection metadata', () => {
  it('returns the owning work name and searches it without replacing the original file name', () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI -My Dear Moments-' });
    insertTrack(db, {
      id: 't1',
      gameId: 'g1',
      filePath: 'C:/Music/ATRI/01_Opening.ogg',
      fileName: '01_Opening.ogg',
      format: 'ogg',
      fileSize: 128,
      fileHash: 'h1',
      duration: 185.25,
      trackNumber: 1,
    });

    const track = listTracks(db)[0];
    expect(track.gameName).toBe('ATRI -My Dear Moments-');
    expect(track.displayName).toBe('01_Opening.ogg');
    expect(listTracks(db, null, { search: 'ATRI -My Dear Moments-' })).toHaveLength(1);
    db.close();
  });
});
