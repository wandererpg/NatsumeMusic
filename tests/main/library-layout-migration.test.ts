import Database from 'better-sqlite3';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { insertTrack, listTracks, updateTrack } from '../../src/main/database/queries/tracks';
import { migrateLibraryLayout } from '../../src/main/services/library-layout-migration';

describe('legacy library layout migration', () => {
  it('moves legacy tracks by duration and preserves row identity and favorites', async () => {
    const library = await mkdtemp(path.join(os.tmpdir(), 'galmusic-layout-'));
    const gameDirectory = path.join(library, 'ATRI');
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });
    await mkdir(gameDirectory, { recursive: true });
    const musicPath = path.join(gameDirectory, 'bgm.ogg');
    const voicePath = path.join(gameDirectory, 'voice.ogg');
    await writeFile(musicPath, 'music');
    await writeFile(voicePath, 'voice');
    insertTrack(db, { id: 'm1', gameId: 'g1', filePath: musicPath, fileName: 'bgm.ogg', duration: 25.001, kind: 'music', format: 'ogg', fileSize: 5, fileHash: 'hm' });
    insertTrack(db, { id: 'v1', gameId: 'g1', filePath: voicePath, fileName: 'voice.ogg', duration: 25, kind: 'music', format: 'ogg', fileSize: 5, fileHash: 'hv' });
    updateTrack(db, 'v1', { isFavorite: true });

    try {
      const first = await migrateLibraryLayout(db, library);
      const tracks = listTracks(db, 'g1');
      expect(first).toMatchObject({ inspected: 2, moved: 2, updated: 2, errors: [] });
      expect(tracks.find((track) => track.id === 'm1')).toMatchObject({ kind: 'music', filePath: path.join(gameDirectory, '音乐', 'bgm.ogg') });
      expect(tracks.find((track) => track.id === 'v1')).toMatchObject({ kind: 'voice', isFavorite: true, filePath: path.join(gameDirectory, '语音', 'voice.ogg') });
      await expect(access(path.join(gameDirectory, '音乐', 'bgm.ogg'))).resolves.toBeUndefined();
      await expect(access(path.join(gameDirectory, '语音', 'voice.ogg'))).resolves.toBeUndefined();

      const second = await migrateLibraryLayout(db, library);
      expect(second).toMatchObject({ inspected: 2, moved: 0, errors: [] });
    } finally {
      db.close();
      await rm(library, { recursive: true, force: true });
    }
  });

  it('does not reclassify a track that is already stored in a category folder', async () => {
    const library = await mkdtemp(path.join(os.tmpdir(), 'galmusic-layout-custom-threshold-'));
    const musicDirectory = path.join(library, 'ATRI', '音乐');
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'ATRI' });
    await mkdir(musicDirectory, { recursive: true });
    const musicPath = path.join(musicDirectory, 'short-bgm.ogg');
    await writeFile(musicPath, 'music');
    insertTrack(db, {
      id: 'm1',
      gameId: 'g1',
      filePath: musicPath,
      fileName: 'short-bgm.ogg',
      duration: 15,
      kind: 'music',
      format: 'ogg',
      fileSize: 5,
      fileHash: 'hm',
    });

    try {
      const result = await migrateLibraryLayout(db, library);
      expect(result).toMatchObject({ inspected: 1, moved: 0, updated: 0, errors: [] });
      expect(listTracks(db, 'g1')[0]).toMatchObject({ kind: 'music', filePath: musicPath });
      await expect(access(musicPath)).resolves.toBeUndefined();
    } finally {
      db.close();
      await rm(library, { recursive: true, force: true });
    }
  });
});
