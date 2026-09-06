import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeLibraryPath } from '../../src/main/services/settings';

describe('library path normalization', () => {
  it('stabilizes an existing literal %USERPROFILE% library instead of leaving it cwd-relative', () => {
    const cwd = 'C:\\project';
    const literal = '%USERPROFILE%\\Music\\GalMusic';
    expect(normalizeLibraryPath(literal, {
      cwd,
      environment: { USERPROFILE: 'C:\\Users\\Tester' },
      pathExists: (candidate) => candidate === path.resolve(cwd, literal),
    })).toBe(path.resolve(cwd, literal));
  });

  it('expands %USERPROFILE% when no legacy literal directory exists', () => {
    expect(normalizeLibraryPath('%USERPROFILE%\\Music\\GalMusic', {
      cwd: 'C:\\project',
      environment: { USERPROFILE: 'C:\\Users\\Tester' },
      pathExists: () => false,
    })).toBe(path.resolve('C:\\Users\\Tester\\Music\\GalMusic'));
  });
});
