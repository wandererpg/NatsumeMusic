import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AppUpdateService } from '../../src/main/services/app-updater';
import { UpdateInstallGuard } from '../../src/main/services/update-install-guard';

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowDowngrade = true;
  allowPrerelease = true;
  checkForUpdates = vi.fn(async () => { this.emit('update-available', { version: '0.1.2', releaseNotes: '改进' }); });
  downloadUpdate = vi.fn(async () => { this.emit('download-progress', { percent: 50 }); this.emit('update-downloaded', { version: '0.1.2' }); });
  quitAndInstall = vi.fn();
}
function fixture(prepare = vi.fn(async () => {})) {
  const updater = new FakeUpdater();
  const guard = new UpdateInstallGuard();
  const service = new AppUpdateService({ updater, guard, currentVersion: '0.1.1', supported: true, prepare, publish: vi.fn() });
  return { updater, guard, service, prepare };
}
const snapshot = { trackId: null, currentTime: 0 };

describe('application update lifecycle', () => {
  it('downloads only on request and installs only after preparation', async () => {
    const { updater, service, prepare, guard } = fixture();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
    await service.check();
    expect(service.getState().status).toBe('available');
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    await service.download();
    expect(service.getState().status).toBe('downloaded');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await service.install(snapshot);
    expect(prepare).toHaveBeenCalledWith(snapshot);
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(() => guard.begin()).toThrow();
  });
  it('refuses installation while a background task is running, including cancelled-but-unfinished work', async () => {
    const { updater, service, guard } = fixture();
    await service.check(); await service.download();
    const finish = guard.begin();
    await expect(service.install(snapshot)).rejects.toThrow('任务');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    finish();
    await service.install(snapshot);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
  it('leaves the application usable after failed preparation and permits retry', async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error('备份失败')).mockResolvedValue(undefined);
    const { updater, service, guard } = fixture(prepare);
    await service.check(); await service.download();
    await expect(service.install(snapshot)).rejects.toThrow('备份失败');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    const finish = guard.begin(); finish();
    await service.install(snapshot);
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
  it('merges duplicate checks and forbids rechecking during a download', async () => {
    const { updater, service } = fixture();
    let finish!: () => void;
    updater.checkForUpdates.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = () => { updater.emit('update-available', { version: '0.1.2' }); resolve(); }; }));
    const first = service.check(); const second = service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    finish(); await Promise.all([first, second]);
    updater.downloadUpdate.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = () => { updater.emit('update-downloaded', { version: '0.1.2' }); resolve(); }; }));
    const download = service.download();
    await expect(service.check()).rejects.toThrow();
    finish(); await download;
  });
  it('unlocks on updater installation errors rather than treating a void return as success', async () => {
    const { updater, service, guard } = fixture();
    await service.check(); await service.download();
    updater.quitAndInstall.mockImplementationOnce(() => { updater.emit('error', new Error('安装器失败')); });
    await expect(service.install(snapshot)).rejects.toThrow('安装器失败');
    expect(service.getState().status).toBe('error');
    const finish = guard.begin(); finish();
  });
  it('keeps unsupported portable or development builds out of the NSIS update flow', async () => {
    const { updater, guard, prepare } = fixture();
    const service = new AppUpdateService({ updater, guard, prepare, currentVersion: '0.1.1', supported: false, publish: vi.fn() });
    await expect(service.check()).rejects.toThrow();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });
  it('rejects a queued updater quit after an asynchronous installer error while allowing ordinary exit', async () => {
    const { updater, service } = fixture();
    await service.check(); await service.download(); await service.install(snapshot);
    expect(service.canQuitForUpdate()).toBe(true);
    updater.emit('error', new Error('无法启动安装器'));
    expect(service.canQuitForUpdate()).toBe(false);
    expect(service.canQuit()).toBe(true);
  });
  it('blocks new work until asynchronous preparation completes', async () => {
    let finish!: () => void;
    const { service, guard } = fixture(vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })));
    await service.check(); await service.download();
    const installing = service.install(snapshot);
    expect(service.canQuit()).toBe(false);
    expect(() => guard.begin()).toThrow();
    finish(); await installing;
    expect(service.canQuit()).toBe(true);
  });
  it('requires a normal app restart after an installer spawn failure instead of locking on a silent second handoff', async () => {
    const { updater, service, guard } = fixture();
    await service.check(); await service.download(); await service.install(snapshot);
    updater.emit('error', new Error('spawn failed'));
    expect(service.getState()).toMatchObject({ supported: false, canInstall: false, canDownload: false });
    expect(service.getState().message).toContain('重新打开');
    await expect(service.check()).rejects.toMatchObject({ userMessage: expect.stringContaining('重新打开') });
    await expect(service.download()).rejects.toMatchObject({ userMessage: expect.stringContaining('重新打开') });
    await expect(service.install(snapshot)).rejects.toMatchObject({ userMessage: expect.stringContaining('重新打开') });
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(service.canQuit()).toBe(true);
    const finish = guard.begin(); finish();
  });
});
