export const BACKGROUND_PROTOCOL_SCHEME = 'galmusic-background';

export function toBackgroundUrl(filePath: string): string {
  return `${BACKGROUND_PROTOCOL_SCHEME}://local?path=${encodeURIComponent(filePath)}`;
}

export function parseBackgroundUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== `${BACKGROUND_PROTOCOL_SCHEME}:`) return null;
    return url.searchParams.get('path');
  } catch {
    return null;
  }
}
