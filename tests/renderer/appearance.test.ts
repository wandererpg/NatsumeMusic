import { describe, expect, it } from 'vitest';

import { toAppearanceStyle } from '../../src/renderer/src/theme/appearance';
import { THEMES } from '../../src/renderer/src/theme/themes';
import type { AppSettings } from '../../src/shared/types';

describe('renderer appearance model', () => {
  it('registers A and C through H without the rejected light paper theme', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual([
      'rain-afterglow',
      'neon-terminal',
      'amber-film',
      'aquarium-glass',
      'record-shop',
      'velvet-theatre',
      'scrapbook-diary',
    ]);
    expect(THEMES.map((theme) => theme.name)).not.toContain('月白樱纸');
  });

  it('maps the global background settings to root CSS properties', () => {
    const settings = {
      background: {
        imagePath: 'D:\\Pictures\\夏空.png',
        blur: 18,
        dim: 0.6,
        scale: 135,
        positionX: 35,
        positionY: 70,
      },
    } as AppSettings;

    expect(toAppearanceStyle(settings)).toEqual({
      '--user-background-image': 'url("galmusic-background://local?path=D%3A%5CPictures%5C%E5%A4%8F%E7%A9%BA.png")',
      '--user-background-blur': '18px',
      '--user-background-dim': '0.6',
      '--user-background-scale': '135%',
      '--user-background-position': '35% 70%',
    });
  });

  it('disables the image layer when no custom background is selected', () => {
    const settings = { background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 } } as AppSettings;
    expect(toAppearanceStyle(settings)['--user-background-image']).toBe('none');
    expect(toAppearanceStyle(settings)['--user-background-dim']).toBe('0');
  });

  it('overrides the primary text color only when a custom color is set', () => {
    const background = { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 };
    expect(toAppearanceStyle({ background, fontColor: '#ff77aa' } as AppSettings)['--paper-0']).toBe('#ff77aa');
    expect(toAppearanceStyle({ background, fontColor: null } as AppSettings)['--paper-0']).toBeUndefined();
  });
});
