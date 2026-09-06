export const COVER_PROTOCOL_SCHEME = 'galmusic-cover';

export function toCoverUrl(filePath: string): string {
  return `${COVER_PROTOCOL_SCHEME}://local?path=${encodeURIComponent(filePath)}`;
}

export function parseCoverUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== `${COVER_PROTOCOL_SCHEME}:`) return null;
    return url.searchParams.get('path');
  } catch {
    return null;
  }
}
