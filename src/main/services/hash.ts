import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';

/**
 * Compute an MD5 digest without loading the complete audio file into memory.
 * MD5 is used here for stable local de-duplication, not for security.
 */
export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('md5');
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }

  return hash.digest('hex');
}

/**
 * Build a cheap fingerprint from the file size and its first 4096 bytes.
 * The size is included in the digest input so files with the same prefix but
 * different lengths do not collide in the fast path as readily.
 */
export async function quickFingerprint(filePath: string): Promise<string> {
  const fileStats = await stat(filePath);
  const sampleLength = Math.min(fileStats.size, 4096);
  const sample = Buffer.alloc(sampleLength);
  const handle = await open(filePath, 'r');

  try {
    if (sampleLength > 0) {
      await handle.read(sample, 0, sampleLength, 0);
    }
  } finally {
    await handle.close();
  }

  const sampleHash = createHash('md5')
    .update(String(fileStats.size))
    .update('\0')
    .update(sample)
    .digest('hex');

  return `${fileStats.size}:${sampleHash}`;
}

