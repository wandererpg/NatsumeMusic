import { expect, it, vi } from 'vitest';
import { registerUpdateHandlers, validatePlaybackSnapshot } from '../../src/main/ipc/update-handlers';
import { registerScanHandlers } from '../../src/main/ipc/scan-handlers';
import { UpdateInstallGuard } from '../../src/main/services/update-install-guard';
import { AppUpdateService } from '../../src/main/services/app-updater';
import { UPDATE_CHECK, UPDATE_INSTALL, UPDATE_OPEN_DOWNLOADS, IPC_SCAN_START, IPC_SCAN_CANCEL } from '../../src/shared/ipc';

it('rejects extra update arguments, arbitrary URLs, and invalid playback positions', async () => {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  const service = { getState: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn() };
  const open = vi.fn(async () => {});
  registerUpdateHandlers({ handle: (channel, handler) => { handlers.set(channel, handler); } }, service as unknown as AppUpdateService, () => null, open);
  const invoke = (channel: string, ...args: unknown[]) => Promise.resolve().then(() => handlers.get(channel)!({}, ...args));
  await expect(invoke(UPDATE_CHECK, 'https://untrusted.invalid')).rejects.toThrow();
  await expect(invoke(UPDATE_OPEN_DOWNLOADS, 'cmd.exe')).rejects.toThrow();
  await expect(invoke(UPDATE_INSTALL, { trackId: null, currentTime: -1 })).rejects.toThrow();
  for (const currentTime of [NaN, Infinity, '1', 604801]) expect(() => validatePlaybackSnapshot({ trackId: null, currentTime })).toThrow();
  expect(() => validatePlaybackSnapshot({ trackId: null, currentTime: 0, path: 'C:/anything' })).toThrow();
  expect(service.check).not.toHaveBeenCalled();
  expect(service.install).not.toHaveBeenCalled();
  await invoke(UPDATE_OPEN_DOWNLOADS); expect(open).toHaveBeenCalledOnce();
});

it('guards the import lifecycle from path resolution until cancelled work actually finishes', async () => {
  const guard = new UpdateInstallGuard();
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  let resolvePath!: (path: string) => void;
  let resolveImport!: (result: any) => void;
  const importer = { importGameFolder: vi.fn(() => new Promise<any>((resolve) => { resolveImport = resolve; })) };
  registerScanHandlers({ ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); } }, importer, installGuard: guard,
    getLibraryPath: () => new Promise<string>((resolve) => { resolvePath = resolve; }), idFactory: () => 'one' });
  const invoke = (channel: string, ...args: unknown[]) => Promise.resolve().then(() => handlers.get(channel)!({}, ...args));
  await invoke(IPC_SCAN_START, { sourcePath: 'C:/Game', gameName: 'Game', deepScan: false, includeVoice: false, voiceThresholdSeconds: 18.5 });
  expect(() => guard.lock()).toThrow();
  resolvePath('C:/Music');
  await vi.waitFor(() => expect(importer.importGameFolder).toHaveBeenCalledOnce());
  await invoke(IPC_SCAN_CANCEL, 'one');
  expect(() => guard.lock()).toThrow();
  resolveImport({ found: 0, extracted: 0, copied: 0, skipped: 0, errors: [] });
  await vi.waitFor(() => expect(() => { guard.lock(); guard.unlock(); }).not.toThrow());
  guard.lock();
  await expect(invoke(IPC_SCAN_START, { sourcePath: 'C:/Game', gameName: 'Game', deepScan: false, includeVoice: false, voiceThresholdSeconds: 18.5 })).rejects.toThrow();
});

it('keeps queued asynchronous library mutations protected and preserves synchronous reads', async () => {
  const guard = new UpdateInstallGuard();
  let resolve!: () => void;
  const protectedService = guard.protect({ read: () => 42, write: () => new Promise<void>((finish) => { resolve = finish; }) });
  expect(protectedService.read()).toBe(42);
  const write = protectedService.write();
  expect(() => guard.lock()).toThrow();
  resolve(); await write;
  guard.lock(); expect(() => protectedService.write()).toThrow();
  guard.unlock(); expect(protectedService.read()).toBe(42);
});
