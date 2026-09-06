/** Protocol used to stream imported audio from the main process. */
export const AUDIO_PROTOCOL_SCHEME = 'galmusic-audio';

/** Build a URL that is safe to pass from the renderer to Howler. */
export function toAudioUrl(filePath: string): string {
  if (filePath.toLowerCase().startsWith(`${AUDIO_PROTOCOL_SCHEME}:`)) {
    return filePath;
  }
  return `${AUDIO_PROTOCOL_SCHEME}://local?path=${encodeURIComponent(filePath)}`;
}

/** Recover the filesystem path encoded in an app audio URL. */
export function parseAudioUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== `${AUDIO_PROTOCOL_SCHEME}:`) {
      return null;
    }
    const filePath = url.searchParams.get('path');
    return filePath?.trim() || null;
  } catch {
    return null;
  }
}
