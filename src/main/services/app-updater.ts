import { AppError } from '../../shared/errors';
import type { AppUpdateState, PlaybackSnapshot } from '../../shared/types';
import type { UpdateInstallGuard } from './update-install-guard';

export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(silent: boolean, forceRunAfter: boolean): void;
}

interface Dependencies {
  updater: UpdaterLike;
  guard: UpdateInstallGuard;
  currentVersion: string;
  supported: boolean;
  prepare(snapshot: PlaybackSnapshot): Promise<void>;
  publish(state: AppUpdateState): void;
}

function notesText(notes: unknown): string {
  if (typeof notes === 'string') return notes.slice(0, 20000);
  if (Array.isArray(notes)) return notes.map((item) => typeof item.note === 'string' ? item.note : '').join('\n').slice(0, 20000);
  return '';
}

/** Owns the update lifecycle. Renderer requests cannot change the trusted feed. */
export class AppUpdateService {
  private state: AppUpdateState;
  private checking?: Promise<AppUpdateState>;
  private downloading?: Promise<AppUpdateState>;
  private installing?: Promise<AppUpdateState>;
  private handoff = false;
  private installationError?: Error;

  constructor(private readonly dependencies: Dependencies) {
    const { updater, currentVersion, supported } = dependencies;
    this.state = { currentVersion, supported, status: 'idle', canDownload: false, canInstall: false,
      message: supported ? undefined : '开发版和便携版请通过完整安装包或 ZIP 手动更新。' };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.on('update-available', (info) => this.set({ status: 'available', availableVersion: info.version, releaseNotes: notesText(info.releaseNotes), canDownload: true, canInstall: false, message: undefined }));
    updater.on('update-not-available', () => this.set({ status: 'idle', availableVersion: undefined, releaseNotes: undefined, canDownload: false, canInstall: false, message: '当前已是最新版本。' }));
    updater.on('download-progress', (progress) => this.set({ status: 'downloading', progress: Math.max(0, Math.min(100, progress.percent)) }));
    updater.on('update-downloaded', (info) => this.set({ status: 'downloaded', availableVersion: info.version, progress: 100, canDownload: false, canInstall: true, message: '下载并校验完成，可以稍后重启更新。' }));
    updater.on('error', (error: Error) => {
      if (this.state.status === 'preparing') {
        this.installationError = error;
        this.handoff = false;
        dependencies.guard.unlock();
        // BaseUpdater keeps its installation latch after a spawn failure.
        // A second handoff in this process can silently do nothing.
        this.set({ supported: false, canDownload: false, canInstall: false });
        this.fail(new Error(`更新安装器启动失败，请关闭并重新打开应用后重试。${error.message}`));
        return;
      }
      this.fail(error);
    });
  }

  getState(): AppUpdateState { return { ...this.state }; }
  canQuit(): boolean { return !this.dependencies.guard.isLibraryChanging() && (this.state.status !== 'preparing' || this.handoff); }
  canQuitForUpdate(): boolean { return this.state.status === 'preparing' && this.handoff; }
  private set(changes: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...changes };
    this.dependencies.publish(this.getState());
  }
  private fail(error: unknown): void {
    this.set({ status: 'error', message: error instanceof Error ? error.message : String(error) });
  }
  private assertSupported(): void {
    if (!this.state.supported) throw new AppError('DB_ERROR', 'Unsupported update target', this.state.message!);
  }

  check(): Promise<AppUpdateState> {
    if (this.checking) return this.checking;
    try {
      this.assertSupported();
      if (['downloading', 'downloaded', 'preparing'].includes(this.state.status)) throw new Error('请先完成当前更新。');
      this.set({ status: 'checking', message: undefined, canDownload: false, canInstall: false });
      // Invoke immediately; duplicate requests share the same lifetime.
      this.checking = this.dependencies.updater.checkForUpdates()
        .then(() => this.getState()).catch((error) => { this.fail(error); throw error; })
        .finally(() => { this.checking = undefined; });
      return this.checking;
    } catch (error) { return Promise.reject(error); }
  }

  download(): Promise<AppUpdateState> {
    if (this.downloading) return this.downloading;
    try {
      this.assertSupported();
      if (!this.state.canDownload || this.state.status === 'checking' || this.state.status === 'preparing') throw new Error('请先检查可用更新。');
      this.set({ status: 'downloading', message: undefined, progress: 0 });
      this.downloading = this.dependencies.updater.downloadUpdate()
        .then(() => this.getState()).catch((error) => { this.fail(error); throw error; })
        .finally(() => { this.downloading = undefined; });
      return this.downloading;
    } catch (error) { return Promise.reject(error); }
  }

  install(snapshot: PlaybackSnapshot): Promise<AppUpdateState> {
    if (this.installing) return this.installing;
    try {
      this.assertSupported();
      if (!this.state.canInstall) throw new Error('请先下载并校验更新。');
      this.dependencies.guard.lock();
      this.installationError = undefined;
      this.set({ status: 'preparing', message: '正在保存播放记录并备份音乐库…' });
      this.installing = this.dependencies.prepare(snapshot).then(() => {
        this.handoff = true;
        this.dependencies.updater.quitAndInstall(true, true);
        if (this.installationError) throw this.installationError;
        return this.getState();
      }).catch((error) => {
        const attemptedHandoff = this.handoff;
        this.handoff = false;
        this.dependencies.guard.unlock();
        if (this.state.supported) {
          if (attemptedHandoff) {
            this.set({ supported: false, canDownload: false, canInstall: false });
            this.fail(new Error(`更新安装器启动失败，请关闭并重新打开应用后重试。${error instanceof Error ? error.message : String(error)}`));
          } else this.fail(error);
        }
        throw error;
      }).finally(() => { this.installing = undefined; });
      return this.installing;
    } catch (error) { return Promise.reject(error); }
  }
}
