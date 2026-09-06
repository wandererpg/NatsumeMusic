import path from 'node:path';

import { AppError } from '../../shared/errors';

/** Raise a stable error for malformed values arriving from the renderer. */
export function invalidArgument(message: string): AppError {
  return new AppError('DB_ERROR', `Invalid IPC argument: ${message}`, '请求参数无效。');
}

export function assertArgumentCount(args: readonly unknown[], expected: number, channel: string): void {
  if (args.length !== expected) {
    throw invalidArgument(`${channel} expects ${expected} argument${expected === 1 ? '' : 's'}`);
  }
}

export function assertString(value: unknown, label: string, options: { allowEmpty?: boolean } = {}): asserts value is string {
  if (typeof value !== 'string' || (!options.allowEmpty && value.trim().length === 0)) {
    throw invalidArgument(`${label} must be a non-empty string`);
  }
  if (value.includes('\u0000')) {
    throw invalidArgument(`${label} contains an invalid character`);
  }
}

/** Validate a path without touching the filesystem.  Resolution is deferred to the service. */
export function assertPath(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  // `resolve` catches malformed values on the current platform while keeping
  // relative paths valid for callers that intentionally use them.
  try {
    path.resolve(value);
  } catch {
    throw invalidArgument(`${label} is not a valid path`);
  }
}

export function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidArgument(`${label} must be an object`);
  }
}

export function assertNoUnexpectedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw invalidArgument(`${label}.${key} is not supported`);
    }
  }
}

export function assertGameName(value: unknown, label = 'gameName'): asserts value is string {
  assertString(value, label);
  // A game name becomes a directory name during import.  Disallow traversal,
  // separators, and reserved dot entries before the importer sees it.
  if (value === '.' || value === '..' || path.basename(value) !== value || /[\\/]/.test(value)) {
    throw invalidArgument(`${label} must be a single directory name`);
  }
}

