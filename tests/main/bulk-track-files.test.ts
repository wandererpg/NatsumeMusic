import Database from 'better-sqlite3';
import {
  access,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { getTrack, insertTrack } from '../../src/main/database/queries/tracks';
import { createBulkTrackService } from '../../src/main/services/bulk-track-service';

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('bulk track file operations', () => {
  let db: Database.Database;
  let temporaryRoot: string;
  let libraryPath: string;
  let sourceMusicDirectory: string;
  let sourceVoiceDirectory: string;

  beforeEach(async () => {
    db = new Database(':memory:');
    migrate(db);
    createGame(db, { id: 'g1', name: 'Source Game' });
    createGame(db, { id: 'g2', name: 'Target Game' });

    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'galmusic-bulk-files-'));
    libraryPath = path.join(temporaryRoot, 'library');
    sourceMusicDirectory = path.join(libraryPath, 'Source Game', '音乐');
    sourceVoiceDirectory = path.join(libraryPath, 'Source Game', '语音');
    await mkdir(sourceMusicDirectory, { recursive: true });
    await mkdir(sourceVoiceDirectory, { recursive: true });
  });

  afterEach(async () => {
    db.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  async function addTrack(
    id: string,
    options: { kind?: 'music' | 'voice'; fileName?: string; filePath?: string } = {},
  ): Promise<string> {
    const kind = options.kind ?? 'music';
    const fileName = options.fileName ?? `${id}.ogg`;
    const filePath = options.filePath
      ?? path.join(kind === 'music' ? sourceMusicDirectory : sourceVoiceDirectory, fileName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `audio-${id}`);
    insertTrack(db, {
      id,
      gameId: 'g1',
      filePath,
      fileName,
      format: 'ogg',
      fileSize: 7,
      fileHash: `hash-${id}`,
      kind,
    });
    return filePath;
  }

  it('moves music and voice files to the matching target categories and updates ownership', async () => {
    const musicSource = await addTrack('music-track', { kind: 'music' });
    const voiceSource = await addTrack('voice-track', { kind: 'voice' });
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['music-track', 'voice-track'],
      operation: { type: 'move', targetGameId: 'g2' },
    });

    expect(result).toEqual({ succeededIds: ['music-track', 'voice-track'], failures: [] });
    expect(getTrack(db, 'music-track')).toMatchObject({
      gameId: 'g2',
      filePath: path.join(libraryPath, 'Target Game', '音乐', 'music-track.ogg'),
      fileName: 'music-track.ogg',
    });
    expect(getTrack(db, 'voice-track')).toMatchObject({
      gameId: 'g2',
      filePath: path.join(libraryPath, 'Target Game', '语音', 'voice-track.ogg'),
      fileName: 'voice-track.ogg',
    });
    expect(await exists(musicSource)).toBe(false);
    expect(await exists(voiceSource)).toBe(false);
    await expect(readFile(getTrack(db, 'music-track')!.filePath, 'utf8')).resolves.toBe('audio-music-track');
  });

  it('uses the shared collision allocator without overwriting existing target files', async () => {
    await addTrack('moving', { fileName: 'theme.ogg' });
    const targetDirectory = path.join(libraryPath, 'Target Game', '音乐');
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(path.join(targetDirectory, 'theme.ogg'), 'original');
    await writeFile(path.join(targetDirectory, 'theme (1).ogg'), 'earlier-duplicate');
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: ['moving'],
      operation: { type: 'move', targetGameId: 'g2' },
    })).resolves.toEqual({ succeededIds: ['moving'], failures: [] });

    expect(getTrack(db, 'moving')?.fileName).toBe('theme (2).ogg');
    await expect(readFile(path.join(targetDirectory, 'theme.ogg'), 'utf8')).resolves.toBe('original');
    await expect(readFile(path.join(targetDirectory, 'theme (2).ogg'), 'utf8')).resolves.toBe('audio-moving');
  });

  it('restores a moved file when the database update fails', async () => {
    const sourcePath = await addTrack('move-failure');
    db.exec(`
      CREATE TRIGGER force_bulk_move_failure
      BEFORE UPDATE ON tracks
      WHEN OLD.id = 'move-failure'
      BEGIN
        SELECT RAISE(ABORT, 'forced update failure');
      END;
    `);
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['move-failure'],
      operation: { type: 'move', targetGameId: 'g2' },
    });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures.map((failure) => failure.trackId)).toEqual(['move-failure']);
    expect(getTrack(db, 'move-failure')).toMatchObject({ gameId: 'g1', filePath: sourcePath });
    await expect(readFile(sourcePath, 'utf8')).resolves.toBe('audio-move-failure');
    expect(await exists(path.join(libraryPath, 'Target Game', '音乐', 'move-failure.ogg'))).toBe(false);
  });

  it.each([
    { targetGameId: 'g1', expectedMessage: '目标游戏不能与当前游戏相同' },
    { targetGameId: 'missing', expectedMessage: '找不到目标游戏' },
  ])('rejects invalid target $targetGameId before changing any file', async ({ targetGameId, expectedMessage }) => {
    const sourcePath = await addTrack(`invalid-${targetGameId}`);
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: [`invalid-${targetGameId}`],
      operation: { type: 'move', targetGameId },
    })).rejects.toMatchObject({ userMessage: expectedMessage });
    await expect(readFile(sourcePath, 'utf8')).resolves.toBe(`audio-invalid-${targetGameId}`);
    expect(getTrack(db, `invalid-${targetGameId}`)?.gameId).toBe('g1');
  });

  it.each([
    { librarySetting: '', operation: { type: 'move' as const, targetGameId: 'g2' } },
    { librarySetting: '   ', operation: { type: 'delete' as const, deleteFiles: true } },
  ])('rejects file operation $operation.type when the library path is blank', async ({ librarySetting, operation }) => {
    const trackId = `blank-library-${operation.type}`;
    const sourcePath = await addTrack(trackId);
    const service = createBulkTrackService({ db, getLibraryPath: () => librarySetting });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: [trackId],
      operation,
    })).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
      userMessage: '音乐库路径未配置。',
    });

    await expect(readFile(sourcePath, 'utf8')).resolves.toBe(`audio-${trackId}`);
    expect(getTrack(db, trackId)).toBeDefined();
  });

  it('removes only database records when deleteFiles is false', async () => {
    const sourcePath = await addTrack('record-only');
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: ['record-only'],
      operation: { type: 'delete', deleteFiles: false },
    })).resolves.toEqual({ succeededIds: ['record-only'], failures: [] });

    expect(getTrack(db, 'record-only')).toBeUndefined();
    await expect(readFile(sourcePath, 'utf8')).resolves.toBe('audio-record-only');
  });

  it('deletes database records and files when deleteFiles is true', async () => {
    const firstPath = await addTrack('hard-one');
    const secondPath = await addTrack('hard-two', { kind: 'voice' });
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath, idFactory: () => 'request-1' });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: ['hard-one', 'hard-two'],
      operation: { type: 'delete', deleteFiles: true },
    })).resolves.toEqual({ succeededIds: ['hard-one', 'hard-two'], failures: [] });

    expect(getTrack(db, 'hard-one')).toBeUndefined();
    expect(getTrack(db, 'hard-two')).toBeUndefined();
    expect(await exists(firstPath)).toBe(false);
    expect(await exists(secondPath)).toBe(false);
    expect(await exists(path.join(libraryPath, '.galmusic-bulk-delete-request-1'))).toBe(false);
  });

  it('restores staged files when the database delete transaction fails', async () => {
    const firstPath = await addTrack('delete-one');
    const secondPath = await addTrack('delete-two');
    db.exec(`
      CREATE TRIGGER force_bulk_delete_failure
      BEFORE DELETE ON tracks
      WHEN OLD.id = 'delete-two'
      BEGIN
        SELECT RAISE(ABORT, 'forced delete failure');
      END;
    `);
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath, idFactory: () => 'rollback' });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['delete-one', 'delete-two'],
      operation: { type: 'delete', deleteFiles: true },
    });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures.map((failure) => failure.trackId)).toEqual(['delete-one', 'delete-two']);
    expect(getTrack(db, 'delete-one')).toBeDefined();
    expect(getTrack(db, 'delete-two')).toBeDefined();
    await expect(readFile(firstPath, 'utf8')).resolves.toBe('audio-delete-one');
    await expect(readFile(secondPath, 'utf8')).resolves.toBe('audio-delete-two');
  });

  it('refuses hard deletion outside the library and preserves the external file', async () => {
    const externalPath = path.join(temporaryRoot, 'external.ogg');
    await addTrack('outside', { filePath: externalPath });
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['outside'],
      operation: { type: 'delete', deleteFiles: true },
    });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures).toEqual([
      { trackId: 'outside', userMessage: '曲目文件不在音乐库中，未执行删除。' },
    ]);
    expect(getTrack(db, 'outside')).toBeDefined();
    await expect(readFile(externalPath, 'utf8')).resolves.toBe('audio-outside');
  });

  it.each([
    { operation: { type: 'move' as const, targetGameId: 'g2' } },
    { operation: { type: 'delete' as const, deleteFiles: true } },
  ])('rejects $operation.type when the source resolves through a link outside the real library root', async ({ operation }) => {
    const trackId = `linked-${operation.type}`;
    const sourcePath = await addTrack(trackId);
    const externalPath = path.join(temporaryRoot, `external-${trackId}.ogg`);
    const service = createBulkTrackService({
      db,
      getLibraryPath: () => libraryPath,
      realpathFile: async (target) => (
        path.resolve(target) === path.resolve(sourcePath)
          ? externalPath
          : realpath(target)
      ),
    });

    const result = await service.execute({ sourceGameId: 'g1', trackIds: [trackId], operation });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures.map((item) => item.trackId)).toEqual([trackId]);
    await expect(readFile(sourcePath, 'utf8')).resolves.toBe(`audio-${trackId}`);
    expect(getTrack(db, trackId)).toBeDefined();
  });

  it('rechecks the created move target directory real path before moving a source file', async () => {
    const sourcePath = await addTrack('escaped-target');
    const externalDirectory = path.join(temporaryRoot, 'external-target');
    const targetGamePath = path.join(libraryPath, 'Target Game');
    const service = createBulkTrackService({
      db,
      getLibraryPath: () => libraryPath,
      realpathFile: async (target) => {
        if (path.resolve(target).startsWith(path.resolve(targetGamePath)) && await exists(target)) {
          return externalDirectory;
        }
        return realpath(target);
      },
    });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['escaped-target'],
      operation: { type: 'move', targetGameId: 'g2' },
    });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures.map((item) => item.trackId)).toEqual(['escaped-target']);
    await expect(readFile(sourcePath, 'utf8')).resolves.toBe('audio-escaped-target');
    expect(getTrack(db, 'escaped-target')?.gameId).toBe('g1');
  });

  it('does not overwrite a target that appears after name allocation and retries with a safe name', async () => {
    const sourcePath = await addTrack('race', { fileName: 'race.ogg' });
    let attempts = 0;
    const service = createBulkTrackService({
      db,
      getLibraryPath: () => libraryPath,
      moveFileExclusive: async (source, target) => {
        attempts += 1;
        if (attempts === 1) {
          await writeFile(target, 'racing-writer');
          const error = new Error('target appeared') as NodeJS.ErrnoException;
          error.code = 'EEXIST';
          throw error;
        }
        await link(source, target);
        await unlink(source);
      },
    });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['race'],
      operation: { type: 'move', targetGameId: 'g2' },
    });

    const targetDirectory = path.join(libraryPath, 'Target Game', '音乐');
    expect(result).toEqual({ succeededIds: ['race'], failures: [] });
    expect(attempts).toBe(2);
    await expect(readFile(path.join(targetDirectory, 'race.ogg'), 'utf8')).resolves.toBe('racing-writer');
    await expect(readFile(path.join(targetDirectory, 'race (1).ogg'), 'utf8')).resolves.toBe('audio-race');
    expect(await exists(sourcePath)).toBe(false);
    expect(getTrack(db, 'race')?.fileName).toBe('race (1).ogg');
  });

  it('returns hard-delete success when committed staging cleanup fails', async () => {
    await addTrack('cleanup-failure');
    const stagingDirectory = path.join(libraryPath, '.galmusic-bulk-delete-cleanup');
    const reportWarning = vi.fn();
    const service = createBulkTrackService({
      db,
      getLibraryPath: () => libraryPath,
      idFactory: () => 'cleanup',
      removeFile: async () => {
        throw new Error('forced cleanup failure');
      },
      reportWarning,
    });

    await expect(service.execute({
      sourceGameId: 'g1',
      trackIds: ['cleanup-failure'],
      operation: { type: 'delete', deleteFiles: true },
    })).resolves.toEqual({ succeededIds: ['cleanup-failure'], failures: [] });
    expect(getTrack(db, 'cleanup-failure')).toBeUndefined();
    expect(await exists(stagingDirectory)).toBe(true);
    expect(reportWarning).toHaveBeenCalledTimes(1);
    expect(reportWarning).toHaveBeenCalledWith(expect.stringContaining(stagingDirectory));
  });

  it('reports exactly which staged file could not be restored after a database failure', async () => {
    const firstPath = await addTrack('restore-fails');
    const secondPath = await addTrack('restore-succeeds');
    db.exec(`
      CREATE TRIGGER force_partial_restore
      BEFORE DELETE ON tracks
      WHEN OLD.id = 'restore-succeeds'
      BEGIN
        SELECT RAISE(ABORT, 'forced delete failure');
      END;
    `);
    const service = createBulkTrackService({
      db,
      getLibraryPath: () => libraryPath,
      idFactory: () => 'partial-restore',
      renameFile: async (source, target) => {
        if (path.resolve(String(target)) === path.resolve(firstPath)) {
          throw new Error('forced restore failure');
        }
        await rename(source, target);
      },
    });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['restore-fails', 'restore-succeeds'],
      operation: { type: 'delete', deleteFiles: true },
    });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures).toEqual([
      { trackId: 'restore-fails', userMessage: '数据库删除失败，且文件自动恢复失败，请检查暂存目录。' },
      { trackId: 'restore-succeeds', userMessage: '操作未能写入音乐库，文件已恢复。' },
    ]);
    expect(await exists(firstPath)).toBe(false);
    await expect(readFile(secondPath, 'utf8')).resolves.toBe('audio-restore-succeeds');
    expect(getTrack(db, 'restore-fails')).toBeDefined();
    expect(getTrack(db, 'restore-succeeds')).toBeDefined();
  });

  it('refuses hard deletion when a corrupted track record points at a directory', async () => {
    const protectedTrackPath = await addTrack('protected-track');
    insertTrack(db, {
      id: 'directory-record',
      gameId: 'g1',
      filePath: sourceMusicDirectory,
      fileName: '音乐',
      format: 'ogg',
      fileSize: 0,
      fileHash: 'hash-directory-record',
      kind: 'music',
    });
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['directory-record'],
      operation: { type: 'delete', deleteFiles: true },
    });

    expect(result).toEqual({
      succeededIds: [],
      failures: [{ trackId: 'directory-record', userMessage: '曲目路径不是普通文件，未执行删除。' }],
    });
    await expect(readFile(protectedTrackPath, 'utf8')).resolves.toBe('audio-protected-track');
    expect(getTrack(db, 'protected-track')).toBeDefined();
    expect(getTrack(db, 'directory-record')).toBeDefined();
    expect(await exists(sourceMusicDirectory)).toBe(true);
  });

  it('serializes overlapping file requests so a second request cannot touch the first request files', async () => {
    const sourcePath = await addTrack('serialized');
    let releaseFirstMove!: () => void;
    const firstMoveGate = new Promise<void>((resolve) => {
      releaseFirstMove = resolve;
    });
    let firstMoveStarted!: () => void;
    const firstMoveStartedPromise = new Promise<void>((resolve) => {
      firstMoveStarted = resolve;
    });
    let fileMoveCalls = 0;
    const service = createBulkTrackService({
      db,
      getLibraryPath: () => libraryPath,
      moveFileExclusive: async (source, target) => {
        fileMoveCalls += 1;
        if (fileMoveCalls === 1) {
          firstMoveStarted();
          await firstMoveGate;
        }
        await link(source, target);
        await unlink(source);
      },
    });

    const moving = service.execute({
      sourceGameId: 'g1',
      trackIds: ['serialized'],
      operation: { type: 'move', targetGameId: 'g2' },
    });
    const deleting = service.execute({
      sourceGameId: 'g1',
      trackIds: ['serialized'],
      operation: { type: 'delete', deleteFiles: true },
    });

    await firstMoveStartedPromise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(fileMoveCalls).toBe(1);
    await expect(readFile(sourcePath, 'utf8')).resolves.toBe('audio-serialized');

    releaseFirstMove();
    await expect(moving).resolves.toEqual({ succeededIds: ['serialized'], failures: [] });
    const deleteResult = await deleting;
    expect(deleteResult.succeededIds).toEqual([]);
    expect(deleteResult.failures.map((item) => item.trackId)).toEqual(['serialized']);
    expect(fileMoveCalls).toBe(1);
    const moved = getTrack(db, 'serialized');
    expect(moved?.gameId).toBe('g2');
    await expect(readFile(moved!.filePath, 'utf8')).resolves.toBe('audio-serialized');
  });

  it('rolls back soft deletion when fewer rows are affected than the validated track count', async () => {
    await addTrack('soft-one');
    await addTrack('soft-two');
    db.exec(`
      CREATE TRIGGER ignore_one_soft_delete
      BEFORE DELETE ON tracks
      WHEN OLD.id = 'soft-two'
      BEGIN
        SELECT RAISE(IGNORE);
      END;
    `);
    const service = createBulkTrackService({ db, getLibraryPath: () => libraryPath });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['soft-one', 'soft-two'],
      operation: { type: 'delete', deleteFiles: false },
    });

    expect(result.succeededIds).toEqual([]);
    expect(result.failures.map((item) => item.trackId)).toEqual(['soft-one', 'soft-two']);
    expect(getTrack(db, 'soft-one')).toBeDefined();
    expect(getTrack(db, 'soft-two')).toBeDefined();
  });

  it('reports per-track recovery when staging a later file fails and an earlier restore also fails', async () => {
    const firstPath = await addTrack('stage-restore-fails');
    const secondPath = await addTrack('stage-never-moved');
    let forwardMoves = 0;
    const service = createBulkTrackService({
      db,
      getLibraryPath: () => libraryPath,
      idFactory: () => 'stage-partial',
      moveFileExclusive: async (source, target) => {
        forwardMoves += 1;
        if (forwardMoves === 2) {
          throw new Error('forced second staging failure');
        }
        await link(source, target);
        await unlink(source);
      },
      renameFile: async (source, target) => {
        if (path.resolve(String(target)) === path.resolve(firstPath)) {
          throw new Error('forced first restore failure');
        }
        await rename(source, target);
      },
    });

    const result = await service.execute({
      sourceGameId: 'g1',
      trackIds: ['stage-restore-fails', 'stage-never-moved'],
      operation: { type: 'delete', deleteFiles: true },
    });

    expect(result).toEqual({
      succeededIds: [],
      failures: [
        {
          trackId: 'stage-restore-fails',
          userMessage: '暂存失败后文件自动恢复失败；原路径缺失，文件保留在暂存目录，请手动恢复。',
        },
        {
          trackId: 'stage-never-moved',
          userMessage: '暂存曲目文件失败，未删除；文件已保留或恢复到原路径。',
        },
      ],
    });
    expect(await exists(firstPath)).toBe(false);
    await expect(readFile(secondPath, 'utf8')).resolves.toBe('audio-stage-never-moved');
    expect(getTrack(db, 'stage-restore-fails')).toBeDefined();
    expect(getTrack(db, 'stage-never-moved')).toBeDefined();
  });
});
