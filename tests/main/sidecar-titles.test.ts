import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { scanFolder } from '../../src/main/services/scanner';

describe('sidecar song titles', () => {
  it('uses CUE track titles for code-named audio files without embedded tags', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-cue-title-'));
    try {
      await mkdir(root, { recursive: true });
      await writeFile(path.join(root, 'bgm_001.ogg'), Buffer.from('not-real-audio'));
      await writeFile(path.join(root, 'soundtrack.cue'), [
        'PERFORMER "Game OST"',
        'FILE "bgm_001.ogg" OGG',
        '  TRACK 01 AUDIO',
        '    TITLE "The Azure Memory"',
      ].join('\n'));

      const candidates = await scanFolder({
        sourcePath: root,
        deepScan: false,
        signal: new AbortController().signal,
        onProgress: () => undefined,
      });

      expect(candidates[0].fileName).toBe('bgm_001.ogg');
      expect(candidates[0].title).toBe('The Azure Memory');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
