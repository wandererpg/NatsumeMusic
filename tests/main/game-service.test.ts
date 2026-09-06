import Database from 'better-sqlite3';
import { access, link, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: class {},
  dialog: {},
  ipcMain: {},
  net: {},
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  shell: {},
}));

import { createDatabaseLibraryService } from '../../src/main/index';
import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { getGameSources, upsertGameSource } from '../../src/main/database/queries/game-sources';
import { getTrack, insertTrack } from '../../src/main/database/queries/tracks';
import { createBulkTrackService } from '../../src/main/services/bulk-track-service';
import type { GameMetadataService } from '../../src/main/services/game-metadata';
import type { GameMetadataSummary } from '../../src/shared/types';

describe('database library service', () => {
  it('renames one game folder, updates copied paths, and stores a copied cover', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-game-edit-'));
    const library = path.join(root, 'library');
    const oldDirectory = path.join(library, 'Old Game');
    const sourceCover = path.join(root, 'cover.png');
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(oldDirectory, { recursive: true });
      await writeFile(path.join(oldDirectory, 'theme.ogg'), Buffer.from('audio'));
      await writeFile(sourceCover, Buffer.from('cover'));
      createGame(db, { id: 'g1', name: 'Old Game' });
      insertTrack(db, {
        id: 't1',
        gameId: 'g1',
        filePath: path.join(oldDirectory, 'theme.ogg'),
        fileName: 'theme.ogg',
        format: 'ogg',
        fileSize: 5,
        fileHash: 'hash-1',
        trackNumber: 1,
      });

      const service = createDatabaseLibraryService(db, { getLibraryPath: () => library });
      const updated = await service.updateGame?.('g1', { name: 'New Game', coverPath: sourceCover });

      expect(updated?.name).toBe('New Game');
      await expect(access(oldDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(path.join(library, 'New Game', 'theme.ogg'), 'utf8')).resolves.toBe('audio');
      await expect(readFile(path.join(library, 'New Game', '.cover.png'), 'utf8')).resolves.toBe('cover');
      expect(db.prepare('SELECT file_path AS filePath FROM tracks WHERE id = ?').get('t1')).toEqual({
        filePath: path.join(library, 'New Game', 'theme.ogg'),
      });
      expect(updated?.coverPath).toBe(path.join(library, 'New Game', '.cover.png'));
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('deletes a game record and its managed music folder', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-game-delete-'));
    const library = path.join(root, 'library');
    const gameDirectory = path.join(library, 'Delete Me');
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(gameDirectory, { recursive: true });
      await writeFile(path.join(gameDirectory, 'theme.ogg'), Buffer.from('audio'));
      createGame(db, { id: 'g-delete', name: 'Delete Me' });
      insertTrack(db, {
        id: 't-delete', gameId: 'g-delete', filePath: path.join(gameDirectory, 'theme.ogg'),
        fileName: 'theme.ogg', format: 'ogg', fileSize: 5, fileHash: 'delete-hash', trackNumber: 1,
      });

      const service = createDatabaseLibraryService(db, { getLibraryPath: () => library });
      await service.deleteGame?.('g-delete');

      expect(db.prepare('SELECT id FROM games WHERE id = ?').get('g-delete')).toBeUndefined();
      await expect(access(gameDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('invalidates cached source metadata when a game is renamed', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-game-metadata-invalidate-'));
    const library = path.join(root, 'library');
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(path.join(library, 'Old Game'), { recursive: true });
      createGame(db, { id: 'g-meta', name: 'Old Game' });
      upsertGameSource(db, {
        gameId: 'g-meta', source: 'vndb', externalId: 'v17', queryName: 'Old Game', status: 'matched',
        dataJson: JSON.stringify({ matched: { title: 'Old Game' }, candidates: [] }), imageUrl: null,
        fetchedAt: '2026-08-24T00:00:00.000Z', retryAfter: null, errorMessage: null,
      });

      const service = createDatabaseLibraryService(db, { getLibraryPath: () => library });
      await service.updateGame?.('g-meta', { name: 'New Game' });

      expect(getGameSources(db, 'g-meta')).toEqual([]);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('ensures pending metadata when an existing game is opened', async () => {
    const db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g-pending', name: 'Pending Game' });
    const pending: GameMetadataSummary = {
      gameId: 'g-pending',
      coverSource: null,
      sources: [
        { source: 'vndb', status: 'pending', queryName: 'Pending Game', externalId: null, title: null, titleCn: null, developer: null, summary: null, score: null, rank: null, fetchedAt: null, errorMessage: null },
        { source: 'bangumi', status: 'pending', queryName: 'Pending Game', externalId: null, title: null, titleCn: null, developer: null, summary: null, score: null, rank: null, fetchedAt: null, errorMessage: null },
      ],
    };
    const complete: GameMetadataSummary = { ...pending, sources: pending.sources.map((source) => ({ ...source, status: 'no_match' as const })) };
    const metadata: GameMetadataService = {
      getSummary: vi.fn().mockReturnValue(pending),
      ensure: vi.fn().mockResolvedValue(complete),
      refresh: vi.fn().mockResolvedValue(complete),
    };
    const service = createDatabaseLibraryService(db, { metadata });

    await expect(service.getGameMetadata?.('g-pending')).resolves.toEqual(complete);
    expect(metadata.ensure).toHaveBeenCalledWith('g-pending', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    db.close();
  });

  it('serializes a single-track deletion behind a pending bulk move and then uses the refreshed path', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-library-queue-'));
    const library = path.join(root, 'library');
    const sourceDirectory = path.join(library, 'Source Game', '音乐');
    const sourcePath = path.join(sourceDirectory, 'queued.ogg');
    const db = new Database(':memory:');
    migrate(db);

    try {
      await mkdir(sourceDirectory, { recursive: true });
      await writeFile(sourcePath, 'queued-audio');
      createGame(db, { id: 'g1', name: 'Source Game' });
      createGame(db, { id: 'g2', name: 'Target Game' });
      insertTrack(db, {
        id: 'queued-track', gameId: 'g1', filePath: sourcePath,
        fileName: 'queued.ogg', format: 'ogg', fileSize: 12, fileHash: 'queued-hash', kind: 'music',
      });

      let releaseMove!: () => void;
      const moveGate = new Promise<void>((resolve) => { releaseMove = resolve; });
      let markMoveStarted!: () => void;
      const moveStarted = new Promise<void>((resolve) => { markMoveStarted = resolve; });
      const bulkService = createBulkTrackService({
        db,
        getLibraryPath: () => library,
        moveFileExclusive: async (source, target) => {
          markMoveStarted();
          await moveGate;
          await link(source, target);
          await unlink(source);
        },
      });
      const service = createDatabaseLibraryService(db, {
        getLibraryPath: () => library,
        bulkService,
      });

      const moving = service.bulkUpdateTracks?.({
        sourceGameId: 'g1',
        trackIds: ['queued-track'],
        operation: { type: 'move', targetGameId: 'g2' },
      });
      let deletionSettled = false;
      const deleting = Promise.resolve(service.deleteTrack?.('queued-track')).finally(() => {
        deletionSettled = true;
      });

      await Promise.race([
        moveStarted,
        new Promise<void>((resolve) => setTimeout(resolve, 30)),
      ]);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(deletionSettled).toBe(false);
      expect(getTrack(db, 'queued-track')?.gameId).toBe('g1');
      await expect(readFile(sourcePath, 'utf8')).resolves.toBe('queued-audio');

      releaseMove();
      await expect(moving).resolves.toEqual({ succeededIds: ['queued-track'], failures: [] });
      await expect(deleting).resolves.toBeUndefined();
      expect(getTrack(db, 'queued-track')).toBeUndefined();
      expect(await access(path.join(library, 'Target Game', '音乐', 'queued.ogg')).then(() => true, () => false)).toBe(false);
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
