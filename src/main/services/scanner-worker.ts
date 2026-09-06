import { isMainThread, parentPort } from 'node:worker_threads';

import { serializeAppError } from '../../shared/errors';
import type { ScanProgress } from '../../shared/types';
import { scanFolder, type AudioCandidate } from './scanner';

/** Message sent by the main process to start a worker scan. */
export interface ScannerWorkerStartMessage {
  type: 'start';
  requestId: string;
  sourcePath: string;
  deepScan: boolean;
}

/** Message sent by the main process to cancel a worker scan. */
export interface ScannerWorkerCancelMessage {
  type: 'cancel';
  requestId: string;
}

export type ScannerWorkerRequest = ScannerWorkerStartMessage | ScannerWorkerCancelMessage;

export interface ScannerWorkerProgressMessage {
  type: 'progress';
  requestId: string;
  progress: ScanProgress;
}

export interface ScannerWorkerResultMessage {
  type: 'result';
  requestId: string;
  candidates: AudioCandidate[];
}

export interface ScannerWorkerErrorMessage {
  type: 'error';
  requestId: string;
  error: ReturnType<typeof serializeAppError>;
}

export type ScannerWorkerResponse =
  | ScannerWorkerProgressMessage
  | ScannerWorkerResultMessage
  | ScannerWorkerErrorMessage;

export type ScannerWorkerPostMessage = (message: ScannerWorkerResponse) => void;

/**
 * Execute one scan and translate callbacks/errors into structured,
 * worker-safe messages.  This function is exported for deterministic tests
 * and for callers that use a worker-like transport other than parentPort.
 */
export async function runScannerWorker(
  request: ScannerWorkerStartMessage,
  postMessage: ScannerWorkerPostMessage,
  signal: AbortSignal,
): Promise<void> {
  try {
    const candidates = await scanFolder({
      sourcePath: request.sourcePath,
      deepScan: request.deepScan,
      signal,
      onProgress: (progress) => {
        postMessage({
          type: 'progress',
          requestId: request.requestId,
          progress,
        });
      },
    });

    postMessage({
      type: 'result',
      requestId: request.requestId,
      candidates,
    });
  } catch (error) {
    // AppError is already serializable; normalize unknown failures to the
    // same shape before crossing the worker boundary.
    const serialized = serializeAppError(error);
    postMessage({
      type: 'error',
      requestId: request.requestId,
      error: serialized,
    });
  }
}

/**
 * Worker entrypoint.  It intentionally contains no SQLite/library imports:
 * the worker only reads source files and emits serializable messages.
 */
if (!isMainThread && parentPort) {
  const workerPort = parentPort;
  let activeRequestId: string | undefined;
  let activeController: AbortController | undefined;

  workerPort.on('message', (message: ScannerWorkerRequest) => {
    if (message.type === 'cancel') {
      if (activeRequestId === message.requestId) {
        activeController?.abort();
      }
      return;
    }

    activeController?.abort();
    activeRequestId = message.requestId;
    activeController = new AbortController();
    const requestController = activeController;

    void runScannerWorker(
      message,
      (response) => workerPort.postMessage(response),
      requestController.signal,
    ).finally(() => {
      if (activeController === requestController) {
        activeController = undefined;
        activeRequestId = undefined;
      }
    });
  });
}

export default runScannerWorker;
