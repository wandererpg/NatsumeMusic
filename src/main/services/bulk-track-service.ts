import { randomUUID } from 'node:crypto';
import { link, mkdir, realpath, rename, rm, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../../shared/errors';
import { assertWithin } from '../../shared/paths';
import type { BulkTrackFailure, BulkTrackRequest, BulkTrackResult, Track } from '../../shared/types';
import type { SQLiteDatabase } from '../database/connection';
import { getGame } from '../database/queries/games';
import { listPlaylists, addTracksToPlaylist } from '../database/queries/playlists';
import {
  deleteTracks,
  getTracksByIds,
  moveTrackRecord,
  setTracksFavorite,
} from '../database/queries/tracks';
import {
  allocateTrackTarget,
  categoryDirectory,
  collectUsedNames,
  gameDirectory,
} from './library-layout';

export interface BulkTrackServiceDependencies {
  db: SQLiteDatabase;
  getLibraryPath: () => Promise<string> | string;
  renameFile?: typeof rename;
  removeFile?: typeof rm;
  makeDirectory?: typeof mkdir;
  realpathFile?: (target: string) => Promise<string>;
  statFile?: (target: string) => Promise<{ isFile(): boolean }>;
  moveFileExclusive?: (source: string, target: string) => Promise<void>;
  reportWarning?: (message: string) => void;
  idFactory?: () => string;
}

export interface BulkTrackService {
  execute(request: BulkTrackRequest): Promise<BulkTrackResult>;
}

interface ValidatedTracks {
  tracks: Track[];
  failures: BulkTrackFailure[];
}

interface StagedTrack {
  track: Track;
  stagedPath: string;
}

function failure(trackId: string, userMessage: string): BulkTrackFailure {
  return { trackId, userMessage };
}

function databaseFailureMessage(): string {
  return '操作未能写入音乐库，文件已恢复。';
}

function restoreFailureMessage(): string {
  return '数据库删除失败，且文件自动恢复失败，请检查暂存目录。';
}

async function resolveConfiguredLibraryPath(
  getLibraryPath: () => Promise<string> | string,
): Promise<string> {
  const configuredPath = (await getLibraryPath()).trim();
  if (!configuredPath) {
    throw new AppError(
      'FILE_NOT_FOUND',
      'Audio library path is not configured',
      '音乐库路径未配置。',
    );
  }
  return path.resolve(configuredPath);
}

async function restoreStagedTracks(
  staged: StagedTrack[],
  restoreFile: (source: string, target: string) => Promise<void>,
): Promise<Set<string>> {
  const failedIds = new Set<string>();
  for (const item of [...staged].reverse()) {
    try {
      await restoreFile(item.stagedPath, item.track.filePath);
    } catch {
      failedIds.add(item.track.id);
    }
  }
  return failedIds;
}

async function moveFileWithoutOverwrite(source: string, target: string): Promise<void> {
  await link(source, target);
  try {
    await unlink(source);
  } catch (error) {
    try {
      await unlink(target);
    } catch {
      // Keep the original error; the source still exists and the linked copy is recoverable.
    }
    throw error;
  }
}

async function resolveNearestExistingRealPath(
  target: string,
  realpathFile: (candidate: string) => Promise<string>,
): Promise<string> {
  let candidate = path.resolve(target);
  for (;;) {
    try {
      return await realpathFile(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

async function validateRegularFileWithinRealRoot(
  filePath: string,
  lexicalLibraryPath: string,
  realLibraryPath: string,
  realpathFile: (target: string) => Promise<string>,
  statFile: (target: string) => Promise<{ isFile(): boolean }>,
): Promise<'valid' | 'outside' | 'not-file' | 'missing'> {
  try {
    assertWithin(filePath, lexicalLibraryPath);
    const actualPath = await realpathFile(filePath);
    assertWithin(actualPath, realLibraryPath);
    return (await statFile(filePath)).isFile() ? 'valid' : 'not-file';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    return 'outside';
  }
}

async function removeDirectoryBestEffort(
  directory: string,
  removeFile: typeof rm,
  reportWarning: (message: string) => void,
): Promise<void> {
  try {
    await removeFile(directory, { recursive: true, force: true });
  } catch (error) {
    reportWarning(`无法清理批量删除暂存目录，请手动检查：${path.resolve(directory)}；${error instanceof Error ? error.message : String(error)}`);
    // A committed deletion remains successful. The staging directory is intentionally
    // retained as recoverable data when cleanup is unavailable.
  }
}

function validateSourceTracks(
  db: SQLiteDatabase,
  sourceGameId: string,
  trackIds: string[],
): ValidatedTracks {
  const tracksById = new Map(getTracksByIds(db, trackIds).map((track) => [track.id, track]));
  const tracks: Track[] = [];
  const failures: BulkTrackFailure[] = [];

  for (const trackId of trackIds) {
    const track = tracksById.get(trackId);
    if (!track) {
      failures.push({ trackId, userMessage: '找不到指定的曲目。' });
    } else if (track.gameId !== sourceGameId) {
      failures.push({ trackId, userMessage: '曲目不属于当前游戏文件夹。' });
    } else {
      tracks.push(track);
    }
  }

  return { tracks, failures };
}

export function createBulkTrackService(
  dependencies: BulkTrackServiceDependencies,
): BulkTrackService {
  const { db } = dependencies;
  const renameFile = dependencies.renameFile ?? rename;
  const removeFile = dependencies.removeFile ?? rm;
  const makeDirectory = dependencies.makeDirectory ?? mkdir;
  const realpathFile = dependencies.realpathFile ?? ((target: string) => realpath(target));
  const statFile = dependencies.statFile ?? ((target: string) => stat(target));
  const moveFileExclusive = dependencies.moveFileExclusive ?? moveFileWithoutOverwrite;
  const restoreFile = dependencies.renameFile ?? moveFileExclusive;
  const reportWarning = dependencies.reportWarning ?? ((message: string) => console.warn(message));
  const idFactory = dependencies.idFactory ?? randomUUID;
  let operationQueue: Promise<void> = Promise.resolve();

  const executeNow = async (request: BulkTrackRequest): Promise<BulkTrackResult> => {
      if (request.operation.type === 'playlist-add') {
        const playlistId = request.operation.playlistId;
        const playlistExists = listPlaylists(db).some(
          (playlist) => playlist.id === playlistId,
        );
        if (!playlistExists) {
          throw new AppError(
            'FILE_NOT_FOUND',
            `Playlist not found: ${playlistId}`,
            '找不到指定的播放列表。',
          );
        }
      }

      const { tracks, failures } = validateSourceTracks(db, request.sourceGameId, request.trackIds);
      const succeededIds = tracks.map((track) => track.id);

      if (request.operation.type === 'favorite') {
        const isFavorite = request.operation.isFavorite;
        try {
          const updateFavorites = db.transaction(() => {
            const updated = setTracksFavorite(db, succeededIds, isFavorite);
            if (updated !== succeededIds.length) {
              throw new Error('One or more tracks disappeared during bulk favorite update');
            }
          });
          updateFavorites();
          return { succeededIds, failures };
        } catch {
          return {
            succeededIds: [],
            failures: [
              ...failures,
              ...tracks.map((track) => failure(track.id, '无法更新曲目收藏状态。')),
            ],
          };
        }
      }

      if (request.operation.type === 'playlist-add') {
        const playlistId = request.operation.playlistId;
        const addToPlaylist = db.transaction(() => {
          addTracksToPlaylist(db, playlistId, succeededIds);
        });
        addToPlaylist();
        return { succeededIds, failures };
      }

      if (request.operation.type === 'move') {
        const targetGameId = request.operation.targetGameId;
        if (targetGameId === request.sourceGameId) {
          throw new AppError(
            'DB_ERROR',
            'Source and target game are identical',
            '目标游戏不能与当前游戏相同',
          );
        }
        const targetGame = getGame(db, targetGameId);
        if (!targetGame) {
          throw new AppError(
            'FILE_NOT_FOUND',
            `Target game not found: ${targetGameId}`,
            '找不到目标游戏',
          );
        }

        const libraryPath = await resolveConfiguredLibraryPath(dependencies.getLibraryPath);
        const realLibraryPath = await realpathFile(libraryPath);
        const targetGameDirectory = gameDirectory(libraryPath, targetGame.name);
        const sourceGame = getGame(db, request.sourceGameId);
        if (sourceGame && path.resolve(gameDirectory(libraryPath, sourceGame.name)) === path.resolve(targetGameDirectory)) {
          throw new AppError(
            'DB_ERROR',
            'Source and target game directories are identical',
            '目标游戏与当前游戏使用同一个文件夹',
          );
        }

        const movableTracks: Track[] = [];
        for (const track of tracks) {
          const validation = await validateRegularFileWithinRealRoot(
            track.filePath,
            libraryPath,
            realLibraryPath,
            realpathFile,
            statFile,
          );
          if (validation === 'valid') {
            movableTracks.push(track);
          } else if (validation === 'not-file') {
            failures.push(failure(track.id, '曲目路径不是普通文件，未执行移动。'));
          } else if (validation === 'missing') {
            failures.push(failure(track.id, '找不到曲目文件，未执行移动。'));
          } else {
            failures.push(failure(track.id, '曲目文件不在音乐库中，未执行移动。'));
          }
        }

        const destinationDirectories = new Set(
          movableTracks.map((track) => categoryDirectory(targetGameDirectory, track.kind)),
        );
        for (const destinationDirectory of destinationDirectories) {
          assertWithin(destinationDirectory, libraryPath);
          const realAncestor = await resolveNearestExistingRealPath(destinationDirectory, realpathFile);
          assertWithin(realAncestor, realLibraryPath);
        }

        const usedNamesByDirectory = new Map<string, Set<string>>();
        const movedIds: string[] = [];
        for (const track of movableTracks) {
          const destinationDirectory = categoryDirectory(targetGameDirectory, track.kind);
          try {
            await makeDirectory(destinationDirectory, { recursive: true });
            assertWithin(await realpathFile(destinationDirectory), realLibraryPath);
            let usedNames = usedNamesByDirectory.get(destinationDirectory);
            if (!usedNames) {
              usedNames = await collectUsedNames(destinationDirectory);
              usedNamesByDirectory.set(destinationDirectory, usedNames);
            }
            let target: { fileName: string; filePath: string };
            for (;;) {
              target = await allocateTrackTarget(destinationDirectory, track.fileName, usedNames);
              assertWithin(target.filePath, libraryPath);
              try {
                await moveFileExclusive(track.filePath, target.filePath);
                break;
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
              }
            }

            try {
              const updateRecord = db.transaction(() => {
                if (!moveTrackRecord(db, track.id, {
                  gameId: targetGameId,
                  filePath: target.filePath,
                  fileName: target.fileName,
                })) {
                  throw new Error(`Track disappeared while moving: ${track.id}`);
                }
              });
              updateRecord();
              movedIds.push(track.id);
            } catch {
              try {
                await restoreFile(target.filePath, track.filePath);
                failures.push(failure(track.id, databaseFailureMessage()));
              } catch {
                failures.push(failure(track.id, '数据库更新失败，且文件自动恢复失败，请检查音乐库。'));
              }
            }
          } catch (error) {
            failures.push(failure(
              track.id,
              (error as NodeJS.ErrnoException).code === 'ENOENT'
                ? '找不到曲目文件，未执行移动。'
                : '移动曲目文件失败。',
            ));
          }
        }
        return { succeededIds: movedIds, failures };
      }

      if (request.operation.type === 'delete') {
        if (!request.operation.deleteFiles) {
          try {
            const deleteRecords = db.transaction(() => {
              const deleted = deleteTracks(db, succeededIds);
              if (deleted !== succeededIds.length) {
                throw new Error('One or more tracks disappeared during bulk library removal');
              }
            });
            deleteRecords();
            return { succeededIds, failures };
          } catch {
            return {
              succeededIds: [],
              failures: [
                ...failures,
                ...tracks.map((track) => failure(track.id, '无法从音乐库移除曲目。')),
              ],
            };
          }
        }

        const libraryPath = await resolveConfiguredLibraryPath(dependencies.getLibraryPath);
        const realLibraryPath = await realpathFile(libraryPath);
        const deletableTracks: Track[] = [];
        for (const track of tracks) {
          const validation = await validateRegularFileWithinRealRoot(
            track.filePath,
            libraryPath,
            realLibraryPath,
            realpathFile,
            statFile,
          );
          if (validation === 'valid' || validation === 'missing') {
            deletableTracks.push(track);
          } else if (validation === 'not-file') {
            failures.push(failure(track.id, '曲目路径不是普通文件，未执行删除。'));
          } else {
            failures.push(failure(track.id, '曲目文件不在音乐库中，未执行删除。'));
          }
        }
        if (deletableTracks.length === 0) {
          return { succeededIds: [], failures };
        }

        const stagingDirectory = assertWithin(
          path.join(libraryPath, `.galmusic-bulk-delete-${idFactory()}`),
          libraryPath,
        );
        const staged: StagedTrack[] = [];
        try {
          const realStagingAncestor = await resolveNearestExistingRealPath(stagingDirectory, realpathFile);
          assertWithin(realStagingAncestor, realLibraryPath);
          await makeDirectory(stagingDirectory, { recursive: true });
          assertWithin(await realpathFile(stagingDirectory), realLibraryPath);
          for (const [index, track] of deletableTracks.entries()) {
            const stagedPath = assertWithin(
              path.join(stagingDirectory, `${index}-${path.basename(track.filePath)}`),
              stagingDirectory,
            );
            try {
              await moveFileExclusive(track.filePath, stagedPath);
              staged.push({ track, stagedPath });
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
          }
        } catch {
          const restoreFailures = await restoreStagedTracks(staged, restoreFile);
          if (restoreFailures.size === 0) {
            await removeDirectoryBestEffort(stagingDirectory, removeFile, reportWarning);
          }
          return {
            succeededIds: [],
            failures: [
              ...failures,
              ...deletableTracks.map((track) => failure(
                track.id,
                restoreFailures.has(track.id)
                  ? '暂存失败后文件自动恢复失败；原路径缺失，文件保留在暂存目录，请手动恢复。'
                  : '暂存曲目文件失败，未删除；文件已保留或恢复到原路径。',
              )),
            ],
          };
        }

        try {
          const deleteRecords = db.transaction(() => {
            const deleted = deleteTracks(db, deletableTracks.map((track) => track.id));
            if (deleted !== deletableTracks.length) {
              throw new Error('One or more tracks disappeared during bulk deletion');
            }
          });
          deleteRecords();
        } catch {
          const restoreFailures = await restoreStagedTracks(staged, restoreFile);
          if (restoreFailures.size === 0) {
            await removeDirectoryBestEffort(stagingDirectory, removeFile, reportWarning);
          }
          return {
            succeededIds: [],
            failures: [
              ...failures,
              ...deletableTracks.map((track) => failure(
                track.id,
                restoreFailures.has(track.id) ? restoreFailureMessage() : databaseFailureMessage(),
              )),
            ],
          };
        }

        await removeDirectoryBestEffort(stagingDirectory, removeFile, reportWarning);
        return {
          succeededIds: deletableTracks.map((track) => track.id),
          failures,
        };
      }

      throw new AppError(
        'DB_ERROR',
        'Bulk operation is not implemented',
        '该批量操作暂不可用。',
      );
  };

  return {
    execute(request): Promise<BulkTrackResult> {
      const result = operationQueue.then(() => executeNow(request));
      operationQueue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
