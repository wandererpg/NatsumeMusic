import { AppError } from '../../shared/errors';

/** Counts actual service lifetimes, including queued writes and cancelled imports. */
export class UpdateInstallGuard {
  private active = 0;
  private locked = false;
  private libraryChanging = false;

  isLibraryChanging(): boolean { return this.libraryChanging; }

  async changeLibrary(operation: () => Promise<void>): Promise<void> {
    // The calling protected settings operation accounts for one active task.
    if (this.locked || this.active > 1) throw new Error('仍有后台任务正在进行，请等导入、扫描或文件整理完成后再切换音乐库。');
    this.locked = true;
    this.libraryChanging = true;
    try { await operation(); } finally { this.libraryChanging = false; this.locked = false; }
  }

  begin(): () => void {
    if (this.locked) {
      const message = this.libraryChanging ? '正在切换并扫描音乐库，请稍候。' : '正在准备更新，请稍候。';
      throw new AppError('DB_ERROR', message, message);
    }
    this.active++;
    let finished = false;
    return () => { if (!finished) { finished = true; this.active--; } };
  }

  lock(): void {
    if (this.locked || this.active > 0) {
      throw new AppError('DB_ERROR', '仍有后台任务正在进行，请等导入、文件整理或封面下载完成后重试。', '仍有后台任务正在进行，请等导入、文件整理或封面下载完成后重试。');
    }
    this.locked = true;
  }

  unlock(): void { this.locked = false; }

  /** Preserve synchronous service methods, while tracking promises to completion. */
  run<T>(operation: () => T): T {
    const finish = this.begin();
    try {
      const result = operation();
      if (result && typeof (result as unknown as PromiseLike<unknown>).then === 'function') {
        return Promise.resolve(result).finally(finish) as T;
      }
      finish();
      return result;
    } catch (error) { finish(); throw error; }
  }

  protect<T extends object>(service: T): T {
    return new Proxy(service, {
      get: (target, key) => {
        const value = Reflect.get(target, key);
        return typeof value === 'function'
          ? (...args: unknown[]) => this.run(() => value.apply(target, args))
          : value;
      },
    });
  }
}
