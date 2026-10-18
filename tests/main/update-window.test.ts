import { expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, dialog: {}, ipcMain: {}, net: {}, protocol: { registerSchemesAsPrivileged: vi.fn() }, shell: {} }));
import { createMainWindow } from '../../src/main/index';

it('keeps the window available while preparing an update and releases it after preparation fails', () => {
  let canClose = false;
  let closeListener!: (event: { preventDefault(): void }) => void;
  class Window {
    loadURL = vi.fn(async () => {});
    loadFile = vi.fn(async () => {});
    on(_event: 'close', listener: typeof closeListener) { closeListener = listener; }
  }
  createMainWindow({ BrowserWindow: Window, canClose: () => canClose });
  const prevented = vi.fn(); closeListener({ preventDefault: prevented });
  expect(prevented).toHaveBeenCalledOnce();
  canClose = true; closeListener({ preventDefault: prevented });
  expect(prevented).toHaveBeenCalledOnce();
});
