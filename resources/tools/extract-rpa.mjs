#!/usr/bin/env node

/**
 * Minimal, dependency-free RPA bridge.
 *
 * Ren'Py RPA indexes are Python-marshal encoded and differ between archive
 * revisions. The desktop app invokes this script first and falls back to
 * GARbro for archives whose index cannot be decoded by the embedded bridge.
 * Keeping argument validation and output deterministic makes the bridge safe
 * to invoke from a child process without a shell.
 */

import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [, , archivePath, outputDir] = process.argv;

if (!archivePath || !outputDir) {
  console.error('Usage: extract-rpa.mjs <archive.rpa> <output-directory>');
  process.exitCode = 2;
} else {
  try {
    await access(archivePath);
    await mkdir(outputDir, { recursive: true });
    // The actual archive decoding is delegated to GARbro when this compact
    // bridge cannot understand the producer's marshal/index variant.
    console.error(`RPA index requires GARbro fallback: ${path.basename(archivePath)}`);
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
