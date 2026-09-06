import { createReadStream, type ReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';

const OWP_XOR_KEY = 0x39;
const OGG_MAGIC = Buffer.from('OggS', 'ascii');

class OwpDecodeTransform extends Transform {
  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    const decoded = Buffer.allocUnsafe(chunk.length);
    for (let index = 0; index < chunk.length; index += 1) {
      decoded[index] = chunk[index] ^ OWP_XOR_KEY;
    }
    callback(null, decoded);
  }
}

async function assertAnemoiOwp(filePath: string): Promise<void> {
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(OGG_MAGIC.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    for (let index = 0; index < bytesRead; index += 1) {
      header[index] ^= OWP_XOR_KEY;
    }
    if (bytesRead !== OGG_MAGIC.length || !header.equals(OGG_MAGIC)) {
      throw new Error('Unsupported OWP file: decoded stream is not Ogg Vorbis audio');
    }
  } finally {
    await handle.close();
  }
}

/** Open an anemoi OWP file as a streaming, decoded OGG byte source. */
export async function openDecodedOwpStream(filePath: string): Promise<Readable> {
  await assertAnemoiOwp(filePath);
  const source: ReadStream = createReadStream(filePath);
  return source.pipe(new OwpDecodeTransform());
}
