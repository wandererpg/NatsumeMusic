import type { ThemeId } from '../../../shared/types';

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tone: 'dark' | 'light';
  primaryTextColor: string;
}

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'rain-afterglow', name: '雨夜青岚', tone: 'dark', primaryTextColor: '#eaf8f5' },
  { id: 'neon-terminal', name: '霓虹终端', tone: 'dark', primaryTextColor: '#f3eeff' },
  { id: 'amber-film', name: '琥珀胶片', tone: 'dark', primaryTextColor: '#fff1dc' },
  { id: 'aquarium-glass', name: '海月玻璃', tone: 'light', primaryTextColor: '#15384a' },
  { id: 'record-shop', name: '唱片番台', tone: 'light', primaryTextColor: '#152a45' },
  { id: 'velvet-theatre', name: '绯幕金声', tone: 'dark', primaryTextColor: '#fff1df' },
  { id: 'scrapbook-diary', name: '音乐手帐', tone: 'light', primaryTextColor: '#514451' },
] as const;

export function getTheme(themeId: ThemeId): ThemeDefinition {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}
