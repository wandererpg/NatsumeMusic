import { UPDATE_CHECK, UPDATE_DOWNLOAD, UPDATE_GET_STATE, UPDATE_INSTALL, UPDATE_GET_PLAYBACK, UPDATE_OPEN_DOWNLOADS } from '../../shared/ipc';
import type { PlaybackSnapshot } from '../../shared/types';
import type { AppUpdateService } from '../services/app-updater';
import type { IpcMainLike } from './library-handlers';
import { assertArgumentCount, assertRecord, assertNoUnexpectedKeys, invalidArgument } from './validation';

export function validatePlaybackSnapshot(value: unknown): PlaybackSnapshot {
  assertRecord(value, 'playback');
  assertNoUnexpectedKeys(value, ['trackId', 'currentTime'], 'playback');
  if (value.trackId !== null && (typeof value.trackId !== 'string' || value.trackId.length === 0 || value.trackId.length > 200)) throw invalidArgument('Invalid playback track');
  if (typeof value.currentTime !== 'number' || !Number.isFinite(value.currentTime) || value.currentTime < 0 || value.currentTime > 604800) throw invalidArgument('Invalid playback position');
  return { trackId: value.trackId as string | null, currentTime: value.currentTime };
}

export function registerUpdateHandlers(ipc: IpcMainLike, service: AppUpdateService, getPlayback: () => PlaybackSnapshot | null, openDownloads: () => Promise<void>): void {
  const actions = {
    [UPDATE_GET_STATE]: () => service.getState(),
    [UPDATE_CHECK]: () => service.check(),
    [UPDATE_DOWNLOAD]: () => service.download(),
    [UPDATE_GET_PLAYBACK]: getPlayback,
    [UPDATE_OPEN_DOWNLOADS]: openDownloads,
  };
  for (const [channel, action] of Object.entries(actions)) {
    ipc.handle(channel, (_event, ...args) => { assertArgumentCount(args, 0, channel); return action(); });
  }
  ipc.handle(UPDATE_INSTALL, (_event, ...args) => {
    assertArgumentCount(args, 1, UPDATE_INSTALL);
    return service.install(validatePlaybackSnapshot(args[0]));
  });
}
