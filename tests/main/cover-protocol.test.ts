import { describe, expect, it, vi } from 'vitest';

import { registerCoverProtocol } from '../../src/main/services/cover-protocol';

describe('cover protocol', () => {
  it('serves only image files inside the configured library', async () => {
    let handler: ((request: { url: string }) => Response | Promise<Response>) | undefined;
    const protocol = { handle: vi.fn((_scheme: string, next: typeof handler) => { handler = next; }) };
    const fetchFile = vi.fn(async () => new Response('cover-bytes', { status: 200 }));

    registerCoverProtocol({ protocol, fetchFile, getLibraryPath: () => 'C:\\Music' });
    const response = await handler!({ url: 'galmusic-cover://local?path=C%3A%5CMusic%5CATRI%5C.cover.png' });

    expect(response.status).toBe(200);
    expect(fetchFile).toHaveBeenCalledWith('file:///C:/Music/ATRI/.cover.png');
    await expect(handler!({ url: 'galmusic-cover://local?path=C%3A%5CMusic%5CATRI%5Ctheme.ogg' })).resolves.toMatchObject({ status: 400 });
  });
});
