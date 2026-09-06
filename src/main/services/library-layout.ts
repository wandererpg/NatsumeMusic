import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

import { AppError } from '../../shared/errors';
import { assertWithin, sanitizeDirectoryName } from '../../shared/paths';
import type { TrackKind } from '../../shared/types';
import { trackKindDirectory } from './track-classification';

export function gameDirectory(libraryPathInput: string, gameName: string): string {
  const libraryPath = path.normalize(path.resolve(libraryPathInput));
  if (!gameName.trim()) {
    throw new AppError('DB_ERROR', 'Game name cannot be empty', '请输入游戏名称。');
  }
  return assertWithin(path.join(libraryPath, sanitizeDirectoryName(gameName)), libraryPath);
}

export function categoryDirectory(gamePath: string, kind: TrackKind): string {
  return path.join(gamePath, trackKindDirectory(kind));
}

export async function collectUsedNames(directory: string): Promise<Set<string>> {
  try {
    return new Set((await readdir(directory)).map((name) => name.toLocaleLowerCase()));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw error;
  }
}

export async function allocateTrackTarget(
  directory: string,
  sourceName: string,
  usedNames: Set<string>,
): Promise<{ fileName: string; filePath: string }> {
  const original = path.basename(sourceName) || 'track.audio';
  const extension = path.extname(original);
  const stem = extension ? original.slice(0, -extension.length) : original;
  for (let suffix = 0; ; suffix += 1) {
    const fileName = suffix === 0 ? original : `${stem} (${suffix})${extension}`;
    const key = fileName.toLocaleLowerCase();
    const filePath = path.join(directory, fileName);
    if (usedNames.has(key)) continue;
    try {
      await access(filePath);
      usedNames.add(key);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      usedNames.add(key);
      return { fileName, filePath };
    }
  }
}
