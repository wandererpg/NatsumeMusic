import path from 'node:path';

const WINDOWS_RESERVED_DIRECTORY_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const WINDOWS_INVALID_DIRECTORY_CHARACTERS = /[<>:"\/\\|?*\u0000-\u001f]/g;

/**
 * Return the default location used for imported audio and the library
 * database.  The value is deliberately independent of the current working
 * directory so it can be derived from Electron's user-data directory.
 *
 * We expose forward slashes here to keep the value stable when it crosses the
 * IPC boundary (Windows accepts them for filesystem APIs as well).  All
 * filesystem operations should still pass the value through `path` helpers.
 */
export const defaultLibraryPath = (userDataRoot: string): string => {
  const normalized = path.normalize(path.join(userDataRoot, 'Music', 'NatsumeMusic'));
  return normalized.replaceAll('\\', '/');
};

/**
 * Convert a user-facing game name into a directory component accepted by
 * Windows while leaving the original name available for display/database
 * records.  Invalid characters become underscores, and device names receive
 * a prefix so they cannot be interpreted as special DOS paths.
 */
export function sanitizeDirectoryName(value: string): string {
  const sanitized = value
    .replace(WINDOWS_INVALID_DIRECTORY_CHARACTERS, '_')
    .replace(/[ .]+$/g, '')
    .trim();
  const fallback = sanitized || 'untitled-game';

  return WINDOWS_RESERVED_DIRECTORY_NAME.test(fallback) ? `_${fallback}` : fallback;
}

/**
 * Resolve a path and assert that it is contained by the supplied root.
 *
 * `path.relative` is used rather than a string-prefix comparison, which
 * avoids treating sibling paths such as `C:/library/game-old` as children of
 * `C:/library/game`.
 */
export function assertWithin(candidate: string, root: string): string {
  const normalizedCandidate = path.resolve(candidate);
  const normalizedRoot = path.resolve(root);
  const relative = path.relative(normalizedRoot, normalizedCandidate);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside the allowed root');
  }

  return normalizedCandidate;
}
