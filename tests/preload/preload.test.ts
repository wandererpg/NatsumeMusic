import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  contextBridge: undefined,
  ipcRenderer: undefined,
}));

import { createGalMusicApi, type IpcRendererLike } from '../../src/preload';
import { IPC_LIBRARY_BULK_UPDATE_TRACKS, IPC_LIBRARY_GET_GAME_METADATA, IPC_LIBRARY_REFRESH_GAME_METADATA } from '../../src/shared/ipc';
import type { BulkTrackRequest } from '../../src/shared/types';

describe('preload bridge', () => {
  it('exposes bulk track updates as one allow-listed IPC invocation', async () => {
    const request: BulkTrackRequest = {
      sourceGameId: 'g1',
      trackIds: ['t1', 't2'],
      operation: { type: 'playlist-add', playlistId: 'p1' },
    };
    const result = { succeededIds: ['t1', 't2'], failures: [] };
    const ipc: IpcRendererLike = {
      invoke: vi.fn().mockResolvedValue(result),
      on: vi.fn(),
    };
    const api = createGalMusicApi(ipc);

    await expect(api.bulkUpdateTracks(request)).resolves.toEqual(result);
    expect(ipc.invoke).toHaveBeenCalledOnce();
    expect(ipc.invoke).toHaveBeenCalledWith(IPC_LIBRARY_BULK_UPDATE_TRACKS, request);
  });

  it('exposes game metadata read and refresh without leaking ipcRenderer', async () => {
    const summary = { gameId: 'g1', coverSource: null, sources: [] };
    const ipc: IpcRendererLike = {
      invoke: vi.fn().mockResolvedValue(summary),
      on: vi.fn(),
    };
    const api = createGalMusicApi(ipc);

    await expect(api.getGameMetadata?.('g1')).resolves.toEqual(summary);
    await expect(api.refreshGameMetadata?.('g1')).resolves.toEqual(summary);
    expect(ipc.invoke).toHaveBeenNthCalledWith(1, IPC_LIBRARY_GET_GAME_METADATA, 'g1');
    expect(ipc.invoke).toHaveBeenNthCalledWith(2, IPC_LIBRARY_REFRESH_GAME_METADATA, 'g1');
  });
});
