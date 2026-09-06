import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { registerAudioProtocol } from '../../src/main/services/audio-protocol';

type AudioHandler = (request: { url: string }) => Response | Promise<Response>;

describe('audio protocol', () => {
  it('serves an imported audio file through the app protocol', async () => {
    let handler: AudioHandler | undefined;
    const protocol = {
      handle: vi.fn((_scheme: string, next: AudioHandler) => {
        handler = next;
      }),
    };
    const fetchFile = vi.fn(async () => new Response('audio-bytes', { status: 200 }));

    registerAudioProtocol({
      protocol,
      fetchFile,
      getLibraryPath: () => 'C:\\Music',
    });

    expect(protocol.handle).toHaveBeenCalledWith('galmusic-audio', expect.any(Function));
    const response = await handler!({
      url: 'galmusic-audio://local?path=C%3A%5CMusic%5CGalgame%5Copening.ogg',
    });

    expect(response.status).toBe(200);
    expect(fetchFile).toHaveBeenCalledWith('file:///C:/Music/Galgame/opening.ogg');
  });

  it('returns a byte-range response for HTML5 audio seeking', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-audio-range-'));
    const library = path.join(root, 'library');
    const audioPath = path.join(library, 'opening.ogg');
    await mkdir(library, { recursive: true });
    await writeFile(audioPath, Buffer.from('0123456789'));
    let handler: ((request: { url: string; headers: Headers }) => Response | Promise<Response>) | undefined;
    const protocol = {
      handle: vi.fn((_scheme: string, next: typeof handler) => { handler = next; }),
    };

    try {
      registerAudioProtocol({
        protocol,
        fetchFile: vi.fn(),
        getLibraryPath: () => library,
      });
      const response = await handler!({
        url: `galmusic-audio://local?path=${encodeURIComponent(audioPath)}`,
        headers: new Headers({ Range: 'bytes=2-5' }),
      });

      expect(response.status).toBe(206);
      expect(response.headers.get('accept-ranges')).toBe('bytes');
      expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
      expect(response.headers.get('content-length')).toBe('4');
      expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('2345');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
