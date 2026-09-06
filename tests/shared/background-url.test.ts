import { describe, expect, it } from 'vitest';

import { parseBackgroundUrl, toBackgroundUrl } from '../../src/shared/background-url';

describe('background URL', () => {
  it('round-trips Windows paths without exposing them as file URLs', () => {
    const filePath = 'D:\\Pictures\\夏空 scene.png';
    const url = toBackgroundUrl(filePath);

    expect(url).toContain('galmusic-background://local');
    expect(url).not.toContain('file://');
    expect(parseBackgroundUrl(url)).toBe(filePath);
  });

  it('rejects unrelated schemes and malformed input', () => {
    expect(parseBackgroundUrl('file:///D:/Pictures/scene.png')).toBeNull();
    expect(parseBackgroundUrl('not a url')).toBeNull();
  });
});
