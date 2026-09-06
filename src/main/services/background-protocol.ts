import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BACKGROUND_PROTOCOL_SCHEME, parseBackgroundUrl } from '../../shared/background-url';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export interface BackgroundProtocolRegistrar {
  handle(scheme: string, handler: (request: { url: string }) => Response | Promise<Response>): void;
}

export interface BackgroundProtocolOptions {
  protocol: BackgroundProtocolRegistrar;
  fetchFile(fileUrl: string): Promise<Response>;
  getBackgroundPath(): string | null | undefined | Promise<string | null | undefined>;
}

function errorResponse(status: number, message: string): Response {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export function registerBackgroundProtocol({ protocol, fetchFile, getBackgroundPath }: BackgroundProtocolOptions): void {
  protocol.handle(BACKGROUND_PROTOCOL_SCHEME, async (request) => {
    const filePath = parseBackgroundUrl(request.url);
    if (!filePath || !path.isAbsolute(filePath) || !IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
      return errorResponse(400, 'Invalid background image path');
    }
    const configuredPath = await getBackgroundPath();
    if (!configuredPath || path.resolve(configuredPath) !== path.resolve(filePath)) {
      return errorResponse(403, 'Background image is not authorized');
    }
    try {
      return await fetchFile(pathToFileURL(filePath).toString());
    } catch {
      return errorResponse(404, 'Background image is unavailable');
    }
  });
}

export default registerBackgroundProtocol;
