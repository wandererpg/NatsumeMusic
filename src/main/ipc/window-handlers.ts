import {
  IPC_WINDOW_CLOSE,
  IPC_WINDOW_MINIMIZE,
  IPC_WINDOW_TOGGLE_MAXIMIZE,
} from '../../shared/ipc';
import { assertArgumentCount } from './validation';
import type { IpcMainLike } from './library-handlers';

export interface WindowLike {
  minimize(): void;
  isMaximized(): boolean;
  maximize(): void;
  unmaximize(): void;
  close(): void;
}

export interface WindowHandlerDependencies {
  ipcMain: IpcMainLike;
  getWindow(event: unknown): WindowLike | undefined;
}

/** Register the tiny allow-listed command set used by the custom title bar. */
export function registerWindowHandlers({ ipcMain, getWindow }: WindowHandlerDependencies): void {
  ipcMain.handle(IPC_WINDOW_MINIMIZE, async (event, ...args) => {
    assertArgumentCount(args, 0, IPC_WINDOW_MINIMIZE);
    getWindow(event)?.minimize();
  });

  ipcMain.handle(IPC_WINDOW_TOGGLE_MAXIMIZE, async (event, ...args) => {
    assertArgumentCount(args, 0, IPC_WINDOW_TOGGLE_MAXIMIZE);
    const window = getWindow(event);
    if (!window) return;
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });

  ipcMain.handle(IPC_WINDOW_CLOSE, async (event, ...args) => {
    assertArgumentCount(args, 0, IPC_WINDOW_CLOSE);
    getWindow(event)?.close();
  });
}

export default registerWindowHandlers;

