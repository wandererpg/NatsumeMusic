import type { CSSProperties } from 'react';

import type { AppSettings } from '../../../shared/types';
import { toBackgroundUrl } from '../../../shared/background-url';

export type AppearanceStyle = CSSProperties & Record<`--${string}`, string>;

export function toAppearanceStyle(settings: Pick<AppSettings, 'background' | 'fontColor'>): AppearanceStyle {
  const { background } = settings;
  const image = background.imagePath
    ? `url("${toBackgroundUrl(background.imagePath)}")`
    : 'none';
  const style: AppearanceStyle = {
    '--user-background-image': image,
    '--user-background-blur': `${background.blur}px`,
    '--user-background-dim': background.imagePath ? String(background.dim) : '0',
    '--user-background-scale': `${background.scale}%`,
    '--user-background-position': `${background.positionX}% ${background.positionY}%`,
  };
  if (settings.fontColor) style['--paper-0'] = settings.fontColor;
  return style;
}
