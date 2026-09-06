import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { AppError } from '../../src/shared/errors';
import { extractArchive, disposeTempDir, type ArchiveRunner } from '../../src/main/services/extractor';

async function makeArchiveFixture(): Promise<{ root: string; archivePath: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-extractor-test-'));
  const archivePath = path.join(root, 'game.xp3');
  await writeFile(archivePath, Buffer.from('not-a-real-archive'));
  return { root, archivePath };
}

describe('archive extractor', () => {
  it('creates a temporary output directory and forwards extracting progress', async () => {
    const { root, archivePath } = await makeArchiveFixture();
    const progress: Array<{ phase: string; currentFile: string }> = [];
    const runner: ArchiveRunner = async ({ outputDir, onOutput }) => {
      await writeFile(path.join(outputDir, 'track.ogg'), Buffer.from('fixture-audio'));
      onOutput?.('fake garbro: extracted track.ogg');
    };

    try {
      const outputDir = await extractArchive(archivePath, {
        runner,
        onProgress: (event) => progress.push({ phase: event.phase, currentFile: event.currentFile }),
      });

      expect(outputDir).toContain(path.join(os.tmpdir(), 'galmusic-extract-'));
      expect(await readFile(path.join(outputDir, 'track.ogg'), 'utf8')).toBe('fixture-audio');
      expect(progress.some((event) => event.phase === 'extracting')).toBe(true);

      await disposeTempDir(outputDir);
      await expect(access(outputDir)).rejects.toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('maps a non-zero archive runner exit to EXTRACT_FAILED', async () => {
    const { root, archivePath } = await makeArchiveFixture();
    const runner: ArchiveRunner = async () => {
      throw new AppError('EXTRACT_FAILED', 'fake garbro failed', 'Could not extract archive');
    };

    try {
      await expect(extractArchive(archivePath, { runner })).rejects.toMatchObject({
        code: 'EXTRACT_FAILED',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts an extensionless SM2MPX container and selects the Probe bridge', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-sm2mpx-extractor-'));
    const archivePath = path.join(root, 'WMSC');
    const header = Buffer.alloc(32);
    header.write('SM2MPX10', 0, 'ascii');
    header.write('WMSC', 16, 'ascii');
    await writeFile(archivePath, header);
    let receivedUseProbe = false;
    const runner: ArchiveRunner = async ({ outputDir, useProbe }) => {
      receivedUseProbe = useProbe === true;
      await writeFile(path.join(outputDir, '02.ogg'), Buffer.from('fixture-audio'));
    };

    try {
      const outputDir = await extractArchive(archivePath, { runner });
      expect(receivedUseProbe).toBe(true);
      await expect(readFile(path.join(outputDir, '02.ogg'), 'utf8')).resolves.toBe('fixture-audio');
      await disposeTempDir(outputDir);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
