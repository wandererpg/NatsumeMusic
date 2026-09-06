export type ErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'EXTRACT_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'DB_ERROR'
  | 'DUPLICATE_TRACK'
  | 'PLAYBACK_ERROR'
  | 'CANCELLED';

/** Error shape safe to send over Electron IPC. */
export interface SerializedAppError {
  code: ErrorCode;
  userMessage: string;
}

/**
 * Domain error with a stable machine-readable code and a user-facing message.
 * Keep the technical `message` for logs and diagnostics; renderers should use
 * `userMessage` instead.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly userMessage: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
    // Required when targeting runtimes whose built-in Error subclassing does
    // not preserve the prototype chain after transpilation.
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): SerializedAppError {
    return { code: this.code, userMessage: this.userMessage };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function serializeAppError(error: unknown): SerializedAppError {
  if (error instanceof AppError) {
    return error.toJSON();
  }

  return {
    code: 'DB_ERROR',
    userMessage: error instanceof Error ? error.message : String(error),
  };
}
