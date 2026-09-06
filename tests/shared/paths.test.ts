import { describe, expect, it } from 'vitest';
import { assertWithin, defaultLibraryPath, sanitizeDirectoryName } from '../../src/shared/paths';

describe('path safety', () => {
  it('uses Music/NatsumeMusic as the default library', () => {
    expect(defaultLibraryPath('C:/Users/Ada')).toBe('C:/Users/Ada/Music/NatsumeMusic');
  });

  it('rejects a path outside the allowed root', () => {
    expect(() => assertWithin('C:/library/other/file.ogg', 'C:/library/game'))
      .toThrowError('Path is outside the allowed root');
  });

  it('sanitizes Windows-invalid directory characters without changing the display name', () => {
    expect(sanitizeDirectoryName('as:9-nine-ARTEISIA')).toBe('as_9-nine-ARTEISIA');
    expect(sanitizeDirectoryName('CON')).toBe('_CON');
  });
});
