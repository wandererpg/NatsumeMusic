import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { inspectSm2MpxArchive } from '../../src/main/services/formats';

function sm2MpxHeader(name: string): Buffer {
  const header = Buffer.alloc(32);
  header.write('SM2MPX10', 0, 'ascii');
  header.write(name, 16, 'ascii');
  return header;
}

describe('SM2MPX containers', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it.each([
    ['WMSC', 'music'],
    ['VOICE1', 'voice'],
    ['VOICE2', 'voice'],
    ['SE', 'other'],
  ] as const)('classifies %s as %s', async (name, expected) => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-sm2mpx-format-'));
    temporaryRoots.push(root);
    const filePath = path.join(root, name);
    await writeFile(filePath, sm2MpxHeader(name));

    await expect(inspectSm2MpxArchive(filePath)).resolves.toBe(expected);
  });
});
