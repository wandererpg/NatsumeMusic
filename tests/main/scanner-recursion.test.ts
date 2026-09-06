import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/shared/errors';
import { scanFolder } from '../../src/main/services/scanner';

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-scan-'));
  const music = path.join(root, 'music');
  const nested = path.join(music, 'nested');
  await mkdir(nested, { recursive: true });

  await writeFile(path.join(music, 'one.ogg'), Buffer.from('one-audio'));
  await writeFile(path.join(music, 'two.mp3'), Buffer.from('two-audio'));
  await writeFile(path.join(music, 'cover.png'), Buffer.from('not-audio'));
  await writeFile(path.join(nested, 'ignore.txt'), Buffer.from('not-audio'));

  return root;
}

describe('folder scanner', () => {
  it('recurses, filters non-audio files, and reports scanning progress', async () => {
    const root = await createFixture();
    const progress: Array<{ phase: string; current: number; total: number; currentFile: string }> = [];

    const candidates = await scanFolder({
      sourcePath: root,
      deepScan: true,
      signal: new AbortController().signal,
      onProgress: (event) => progress.push(event),
    });

    expect(candidates.map((candidate) => candidate.fileName)).toEqual(['one.ogg', 'two.mp3']);
    expect(candidates.map((candidate) => candidate.sourcePath)).toEqual([
      path.resolve(root, 'music', 'one.ogg'),
      path.resolve(root, 'music', 'two.mp3'),
    ]);
    expect(progress.length).toBe(2);
    expect(progress.every((event) => event.phase === 'scanning')).toBe(true);
    expect(progress.map((event) => [event.current, event.total])).toEqual([[1, 2], [2, 2]]);
  });

  it('stops before the next file when the abort signal is triggered', async () => {
    const root = await createFixture();
    const controller = new AbortController();

    await expect(
      scanFolder({
        sourcePath: root,
        deepScan: true,
        signal: controller.signal,
        onProgress: (event) => {
          if (event.current === 1) {
            controller.abort();
          }
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'CANCELLED' });
      return true;
    });
  });

  it('recurses into ordinary directories even when deep archive scanning is disabled', async () => {
    const root = await createFixture();
    await writeFile(path.resolve(root, 'music', 'nested', 'nested.ogg'), Buffer.from('nested-audio'));

    const candidates = await scanFolder({
      sourcePath: root,
      deepScan: false,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });

    expect(candidates.map((candidate) => candidate.fileName).sort()).toEqual([
      'nested.ogg',
      'one.ogg',
      'two.mp3',
    ]);
  });
});
