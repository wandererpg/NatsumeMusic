import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { SYNC_EXPORT, SYNC_PREVIEW, SYNC_APPLY, type SyncPreference } from '../../shared/library-sync';
import { exportLibraryPackage, readLibraryPackage, previewLibraryPackage, applyLibraryPackage } from '../services/library-sync';
import type { UpdateInstallGuard } from '../services/update-install-guard';
import type { DialogLike } from './dialog-handlers';
import type { IpcMainLike } from './library-handlers';
import { assertArgumentCount, invalidArgument } from './validation';

export interface SyncHandlerDependencies {
  ipc: IpcMainLike; dialog: DialogLike; db: Database.Database;
  guard: UpdateInstallGuard; getLibraryPath: () => Promise<string>;
  application: string;
}
/** Only native-selected packages may be imported. Renderer paths are never accepted. */
export function registerLibrarySyncHandlers(deps: SyncHandlerDependencies): void {
  const databaseChanges = () => (deps.db.prepare('SELECT total_changes() AS count').get() as { count: number }).count;
  const previews = new Map<unknown, { token: string; path: string; fingerprint: string; libraryPath: string; databaseChanges: number }>();
  const owner = (event: unknown) => (event as { sender?: { getOwnerBrowserWindow?: () => unknown } }).sender?.getOwnerBrowserWindow?.();
  const sender = (event: unknown) => (event as { sender?: unknown }).sender;
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    deps.guard.lock();
    try { return await action(); } finally { deps.guard.unlock(); }
  };
  deps.ipc.handle(SYNC_EXPORT, async (event, ...args) => {
    assertArgumentCount(args, 0, SYNC_EXPORT);
    return exclusive(async () => {
      const result = await deps.dialog.showOpenDialog(owner(event), { properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled || !result.filePaths[0]) return null;
      return exportLibraryPackage(deps.db, await deps.getLibraryPath(), result.filePaths[0], deps.application);
    });
  });
  deps.ipc.handle(SYNC_PREVIEW, async (event, ...args) => {
    assertArgumentCount(args, 0, SYNC_PREVIEW);
    return exclusive(async () => {
      const result = await deps.dialog.showOpenDialog(owner(event), { properties: ['openFile'], filters: [{ name: 'Natsume 同步清单', extensions: ['json'] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      const pkg = await readLibraryPackage(result.filePaths[0]);
      const token = randomUUID();
      previews.set(sender(event), { token, path: result.filePaths[0], fingerprint: pkg.fingerprint, libraryPath: await deps.getLibraryPath(), databaseChanges: databaseChanges() });
      return { ...await previewLibraryPackage(deps.db, pkg.manifest), token };
    });
  });
  deps.ipc.handle(SYNC_APPLY, async (event, ...args) => {
    assertArgumentCount(args, 2, SYNC_APPLY);
    const [token, preference] = args;
    if (typeof token !== 'string' || !['local', 'incoming'].includes(String(preference))) throw invalidArgument('无效的同步确认。');
    return exclusive(async () => {
      const preview = previews.get(sender(event));
      if (!preview || preview.token !== token) throw invalidArgument('请先选择同步包并预览差异。');
      const pkg = await readLibraryPackage(preview.path);
      const libraryPath = await deps.getLibraryPath();
      if (pkg.fingerprint !== preview.fingerprint || libraryPath !== preview.libraryPath || databaseChanges() !== preview.databaseChanges) throw invalidArgument('同步包或本地音乐库已改变，请重新预览。');
      const result = await applyLibraryPackage(deps.db, libraryPath, pkg, preference as SyncPreference);
      previews.delete(sender(event));
      return result;
    });
  });
}
