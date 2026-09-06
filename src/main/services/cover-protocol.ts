import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { assertWithin } from '../../shared/paths';
import { COVER_PROTOCOL_SCHEME, parseCoverUrl } from '../../shared/cover-url';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export interface CoverProtocolRegistrar {
  handle(scheme: string, handler: (request: { url: string }) => Response | Promise<Response>): void;
}

export interface CoverProtocolOptions {
  protocol: CoverProtocolRegistrar;
  fetchFile(fileUrl: string): Promise<Response>;
  getLibraryPath(): string | Promise<string>;
}

function errorResponse(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export function registerCoverProtocol({ protocol, fetchFile, getLibraryPath }: CoverProtocolOptions): void {
  protocol.handle(COVER_PROTOCOL_SCHEME, async (request) => {
    const filePath = parseCoverUrl(request.url);
    if (!filePath || !path.isAbsolute(filePath) || !IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      return errorResponse(400, 'Invalid cover path');
    }
    const libraryPath = await getLibraryPath();
    if (!libraryPath.trim()) return errorResponse(403, 'Audio library is not configured');
    try {
      assertWithin(filePath, libraryPath);
      return await fetchFile(pathToFileURL(filePath).toString());
    } catch {
      return errorResponse(404, 'Cover image is unavailable');
    }
  });
}

export default registerCoverProtocol;
