import { randomUUID } from 'node:crypto';

import { AppError, serializeAppError } from '../../shared/errors';
import { IPC_SCAN_CANCEL, IPC_SCAN_PROGRESS, IPC_SCAN_RESULT, IPC_SCAN_START } from '../../shared/ipc';
import type { ScanProgress, ScanResult, ScanStartRequest } from '../../shared/types';
import {
  assertArgumentCount,
  assertGameName,
  assertNoUnexpectedKeys,
  assertPath,
  assertRecord,
  assertString,
  invalidArgument,
} from './validation';
import type { IpcMainLike } from './library-handlers';
import { isValidVoiceThreshold } from '../services/track-classification';

export interface ImportOptions extends ScanStartRequest {
  libraryPath: string;
  signal: AbortSignal;
  onProgress(progress: ScanProgress): void;
}

export interface ImporterService {
  importGameFolder(options: ImportOptions): Promise<ScanResult>;
}

export interface ScanEventSender {
  send(channel: string, payload: unknown): void;
}

export interface ScanHandlerDependencies {
  ipcMain: IpcMainLike;
  importer: ImporterService;
  getLibraryPath: () => string | Promise<string>;
  idFactory?: () => string;
  onError?: (error: unknown, requestId: string) => void;
}

interface ScanRequestState {
  controller: AbortController;
  sender?: ScanEventSender;
}

function validateStartRequest(value: unknown): ScanStartRequest {
  assertRecord(value, 'options');
  assertNoUnexpectedKeys(value, ['sourcePath', 'gameName', 'deepScan', 'includeVoice', 'voiceThresholdSeconds'], 'options');
  assertPath(value.sourcePath, 'options.sourcePath');
  assertGameName(value.gameName, 'options.gameName');
  if (typeof value.deepScan !== 'boolean') {
    throw invalidArgument('options.deepScan must be a boolean');
  }
  if (typeof value.includeVoice !== 'boolean') {
    throw invalidArgument('options.includeVoice must be a boolean');
  }
  if (!isValidVoiceThreshold(value.voiceThresholdSeconds)) {
    throw invalidArgument('options.voiceThresholdSeconds must be a finite number from 1 to 60');
  }
  return {
    sourcePath: value.sourcePath,
    gameName: value.gameName,
    deepScan: value.deepScan,
    includeVoice: value.includeVoice,
    voiceThresholdSeconds: value.voiceThresholdSeconds,
  };
}

function validateRequestId(value: unknown): string {
  assertString(value, 'requestId');
  return value;
}

/**
 * Register asynchronous import requests.  A scan returns its id immediately;
 * progress is pushed over `scan:progress` while the injected importer runs.
 */
export function registerScanHandlers({
  ipcMain,
  importer,
  getLibraryPath,
  idFactory = randomUUID,
  onError,
}: ScanHandlerDependencies): { activeRequests: ReadonlyMap<string, ScanRequestState> } {
  const activeRequests = new Map<string, ScanRequestState>();

  const cancel = (requestId: string): void => {
    activeRequests.get(requestId)?.controller.abort();
  };

  ipcMain.handle(IPC_SCAN_START, async (event, ...args) => {
    assertArgumentCount(args, 1, IPC_SCAN_START);
    const request = validateStartRequest(args[0]);
    const requestId = idFactory();
    const controller = new AbortController();
    const sender = (event as { sender?: ScanEventSender }).sender;
    activeRequests.set(requestId, { controller, sender });

    // Resolve the configured library path before invoking the importer, but
    // do not block the renderer's request on a potentially long scan.
    void Promise.resolve(getLibraryPath())
      .then((libraryPath) => {
        assertPath(libraryPath, 'libraryPath');
        const state = activeRequests.get(requestId);
        if (!state || state.controller.signal.aborted) {
          return undefined;
        }
        return importer.importGameFolder({
          ...request,
          libraryPath,
          signal: state.controller.signal,
          onProgress: (progress) => state.sender?.send(IPC_SCAN_PROGRESS, progress),
        });
      })
      .then((result) => {
        const state = activeRequests.get(requestId);
        state?.sender?.send(IPC_SCAN_RESULT, { requestId, result });
        return result;
      })
      .catch((error: unknown) => {
        const state = activeRequests.get(requestId);
        state?.sender?.send(IPC_SCAN_RESULT, { requestId, error: serializeAppError(error) });
        onError?.(error, requestId);
      })
      .finally(() => {
        activeRequests.delete(requestId);
      });

    return requestId;
  });

  // The typed preload uses invoke, while this event listener keeps cancellation
  // compatible with older renderer callers that used ipcRenderer.send.
  ipcMain.on?.(IPC_SCAN_CANCEL, (_event, ...args) => {
    try {
      assertArgumentCount(args, 1, IPC_SCAN_CANCEL);
      cancel(validateRequestId(args[0]));
    } catch (error) {
      onError?.(error, 'cancel');
    }
  });

  ipcMain.handle(IPC_SCAN_CANCEL, async (_event, ...args) => {
    assertArgumentCount(args, 1, IPC_SCAN_CANCEL);
    cancel(validateRequestId(args[0]));
  });

  return { activeRequests };
}

export default registerScanHandlers;
