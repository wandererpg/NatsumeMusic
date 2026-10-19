import Database from 'better-sqlite3';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { migrate } from '../../src/main/database/migrations';
import { createGame } from '../../src/main/database/queries/games';
import { registerLibrarySyncHandlers } from '../../src/main/ipc/library-sync-handlers';
import { exportLibraryPackage } from '../../src/main/services/library-sync';
import { UpdateInstallGuard } from '../../src/main/services/update-install-guard';
import { SYNC_PREVIEW, SYNC_APPLY, SYNC_EXPORT } from '../../src/shared/library-sync';

const roots: string[] = []; const databases: Database.Database[] = [];
afterEach(async () => { databases.splice(0).forEach(db => db.close()); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sync-ipc-')); roots.push(root);
  const library = path.join(root, 'music'); await mkdir(library);
  const db = new Database(':memory:'); migrate(db); databases.push(db);
  const pkg = await exportLibraryPackage(db, library, root, 'NatsumeNote');
  const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: [pkg.manifestPath] });
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const guard = new UpdateInstallGuard(); let currentLibrary = library;
  registerLibrarySyncHandlers({ ipc: { handle: (channel, listener) => { handlers.set(channel, listener); } }, dialog: { showOpenDialog }, db, guard, getLibraryPath: async () => currentLibrary, application: 'NatsumeMusic' });
  const event = { sender: {} };
  const call = async (channel: string, ...args: unknown[]) => handlers.get(channel)!(event, ...args) as any;
  return { root, library, db, pkg, showOpenDialog, guard, handlers, call, event, changeLibrary: () => { currentLibrary += '-changed'; } };
}
it('requires a native preview and a sender-bound, single-use token', async () => {
  const f = await setup();
  await expect(f.call(SYNC_APPLY, 'path.json', 'local')).rejects.toThrow();
  await expect(f.call(SYNC_PREVIEW, 'path.json')).rejects.toThrow();
  const preview = await f.call(SYNC_PREVIEW);
  await expect(f.handlers.get(SYNC_APPLY)!({ sender: {} }, preview.token, 'local')).rejects.toThrow();
  await expect(f.call(SYNC_APPLY, preview.token, 'invalid')).rejects.toThrow();
  await expect(f.call(SYNC_APPLY, preview.token, 'local')).resolves.toMatchObject({ tracks: 0 });
  await expect(f.call(SYNC_APPLY, preview.token, 'local')).rejects.toThrow();
});
it('invalidates previews if the package, database, or library changed', async () => {
  const f = await setup();
  let preview = await f.call(SYNC_PREVIEW);
  await writeFile(f.pkg.manifestPath, (await readFile(f.pkg.manifestPath, 'utf8')) + ' ');
  await expect(f.call(SYNC_APPLY, preview.token, 'incoming')).rejects.toThrow('重新预览');
  preview = await f.call(SYNC_PREVIEW);
  createGame(f.db, { id: 'added-after-preview', name: 'new' });
  await expect(f.call(SYNC_APPLY, preview.token, 'incoming')).rejects.toThrow('重新预览');
  preview = await f.call(SYNC_PREVIEW); f.changeLibrary();
  await expect(f.call(SYNC_APPLY, preview.token, 'incoming')).rejects.toThrow('重新预览');
});
it('blocks background mutations during native selection and always releases the lock', async () => {
  const f = await setup(); let release!: (result: { canceled: boolean; filePaths: string[] }) => void;
  f.showOpenDialog.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const pending = f.call(SYNC_PREVIEW);
  expect(() => f.guard.begin()).toThrow();
  release({ canceled: true, filePaths: [] }); await expect(pending).resolves.toBeNull();
  expect(() => f.guard.run(() => undefined)).not.toThrow();
  const finish = f.guard.begin();
  await expect(f.call(SYNC_EXPORT)).rejects.toThrow(); finish();
});
