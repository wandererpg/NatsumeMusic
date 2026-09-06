import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const { parseFile, loadMusicMetadata } = vi.hoisted(() => ({
  parseFile: vi.fn(),
  loadMusicMetadata: vi.fn(),
}));
vi.mock('music-metadata', () => ({ loadMusicMetadata, parseFile: undefined }));

import { readAudioMetadata } from '../../src/main/services/metadata';

describe('audio metadata titles', () => {
  it('keeps the embedded work title for display while retaining duration and format', async () => {
    loadMusicMetadata.mockResolvedValue({ parseFile });
    parseFile.mockResolvedValue({
      common: { title: '桜の詩' },
      format: { duration: 185.25, container: 'Ogg' },
    });
    const directory = await mkdtemp(path.join(os.tmpdir(), 'galmusic-metadata-title-'));
    const filePath = path.join(directory, 'bgm_001.ogg');
    await writeFile(filePath, Buffer.from('audio'));

    await expect(readAudioMetadata(filePath)).resolves.toMatchObject({
      title: '桜の詩',
      duration: 185.25,
      format: 'Ogg',
      fileSize: 5,
    });
  });
});
