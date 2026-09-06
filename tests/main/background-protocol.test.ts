import { describe, expect, it, vi } from 'vitest';

import { registerBackgroundProtocol } from '../../src/main/services/background-protocol';
import { toBackgroundUrl } from '../../src/shared/background-url';

describe('background protocol', () => {
  it('serves only the image selected in global appearance settings', async () => {
    let handler: ((request: { url: string }) => Response | Promise<Response>) | undefined;
    const protocol = { handle: vi.fn((_scheme: string, next: typeof handler) => { handler = next; }) };
    const fetchFile = vi.fn(async () => new Response('image-bytes', { status: 200 }));

    registerBackgroundProtocol({
      protocol,
      fetchFile,
      getBackgroundPath: () => 'D:\\Pictures\\scene.png',
    });

    const response = await handler!({ url: toBackgroundUrl('D:\\Pictures\\scene.png') });
    expect(response.status).toBe(200);
    expect(fetchFile).toHaveBeenCalledWith('file:///D:/Pictures/scene.png');
    await expect(handler!({ url: toBackgroundUrl('D:\\Pictures\\other.png') })).resolves.toMatchObject({ status: 403 });
  });

  it('rejects unsupported file types and missing settings', async () => {
    let handler: ((request: { url: string }) => Response | Promise<Response>) | undefined;
    registerBackgroundProtocol({
      protocol: { handle: (_scheme, next) => { handler = next; } },
      fetchFile: vi.fn(),
      getBackgroundPath: () => null,
    });

    await expect(handler!({ url: toBackgroundUrl('D:\\Pictures\\scene.svg') })).resolves.toMatchObject({ status: 400 });
    await expect(handler!({ url: toBackgroundUrl('D:\\Pictures\\scene.png') })).resolves.toMatchObject({ status: 403 });
  });
});
