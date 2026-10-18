import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  contextBridge: undefined,
  ipcRenderer: undefined,
}));

import { createGalMusicApi, type IpcRendererLike } from '../../src/preload';
import { IPC_LIBRARY_BULK_UPDATE_TRACKS, IPC_LIBRARY_GET_GAME_METADATA, IPC_LIBRARY_REFRESH_GAME_METADATA, IPC_LIBRARY_SEARCH_GAME_METADATA, IPC_LIBRARY_LOOKUP_GAME_METADATA, IPC_LIBRARY_OPEN_METADATA_LINK, UPDATE_GET_STATE, UPDATE_CHECK, UPDATE_DOWNLOAD, UPDATE_INSTALL, UPDATE_STATE } from '../../src/shared/ipc';
import type { BulkTrackRequest } from '../../src/shared/types';

describe('preload bridge', () => {
  it('routes metadata search, ID lookup and official links through fixed channels', async () => {
    const ipc: IpcRendererLike = { invoke: vi.fn(), on: vi.fn() };
    const api = createGalMusicApi(ipc);
    await api.searchGameMetadata!('g1', 'vndb', 'Title');
    await api.lookupGameMetadata!('g1', 'bangumi', '123');
    await api.openMetadataLink!('vndb', 'v17');
    expect(ipc.invoke).toHaveBeenNthCalledWith(1, IPC_LIBRARY_SEARCH_GAME_METADATA, 'g1', 'vndb', 'Title');
    expect(ipc.invoke).toHaveBeenNthCalledWith(2, IPC_LIBRARY_LOOKUP_GAME_METADATA, 'g1', 'bangumi', '123');
    expect(ipc.invoke).toHaveBeenNthCalledWith(3, IPC_LIBRARY_OPEN_METADATA_LINK, 'vndb', 'v17');
  });
  it('exposes fixed update actions and removes update subscriptions', async () => {
    const ipc = { invoke: vi.fn(async () => undefined), on: vi.fn(), removeListener: vi.fn() };
    const api = createGalMusicApi(ipc);
    await api.getUpdateState!(); await api.checkForUpdates!(); await api.downloadUpdate!();
    const snapshot = { trackId: null, currentTime: 0 };
    await api.installUpdate!(snapshot);
    expect(ipc.invoke.mock.calls).toEqual([[UPDATE_GET_STATE], [UPDATE_CHECK], [UPDATE_DOWNLOAD], [UPDATE_INSTALL, snapshot]]);
    const listener = vi.fn(); const unsubscribe = api.onUpdateState!(listener);
    const wrapped = ipc.on.mock.calls[0][1] as (event: unknown, payload: unknown) => void;
    wrapped({}, { status: 'downloaded' }); expect(listener).toHaveBeenCalledWith({ status: 'downloaded' });
    unsubscribe(); expect(ipc.removeListener).toHaveBeenCalledWith(UPDATE_STATE, wrapped);
  });
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
