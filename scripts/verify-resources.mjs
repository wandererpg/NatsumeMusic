#!/usr/bin/env node

/**
 * Verify the resources required by a distributable NatsumeMusic build.
 *
 * GARbro is intentionally not checked into this repository. It is a
 * separately licensed Windows tool that must be supplied by the packager.
 * Use `node scripts/verify-resources.mjs --root <resources-root>` to verify a
 * fixture or staging directory without modifying the source tree.
 */

import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseRoot(argv) {
  const index = argv.indexOf('--root');
  if (index >= 0 && argv[index + 1]) {
    return path.resolve(argv[index + 1]);
  }
  return path.resolve(process.env.GALMUSIC_RESOURCE_ROOT ?? path.join(projectRoot, 'resources'));
}

async function isRegularFile(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

export async function verifyResources(resourceRoot = parseRoot(process.argv.slice(2))) {
  const requiredFiles = [
    path.join(resourceRoot, 'tools', 'garbro', 'GARbro.exe'),
    path.join(resourceRoot, 'tools', 'garbro', 'GARbro.Console.exe'),
    path.join(resourceRoot, 'tools', 'garbro', 'GARbro.Xp3Bridge.exe'),
    path.join(resourceRoot, 'tools', 'garbro', 'GARbro.Probe.exe'),
    path.join(resourceRoot, 'tools', 'garbro', 'ArcFormats.dll'),
    path.join(resourceRoot, 'tools', 'garbro', 'GameData', 'Formats.dat'),
    path.join(resourceRoot, 'tools', 'extract-rpa.mjs'),
  ];
  const missing = [];
  for (const filePath of requiredFiles) {
    if (!(await isRegularFile(filePath))) {
      missing.push(filePath);
    }
  }

  if (missing.length > 0) {
    const garbroPath = path.join(resourceRoot, 'tools', 'garbro', 'GARbro.exe');
    const lines = [
      'NatsumeMusic resource verification failed.',
      ...missing.map((filePath) => filePath.endsWith(path.join('garbro', 'GARbro.exe'))
        ? `GARbro.exe is missing or empty: ${filePath}`
        : `Missing or empty file: ${filePath}`),
      '',
      'Supply the complete licensed GARbro bundle and NatsumeMusic XP3 bridge under:',
      `  ${path.dirname(garbroPath)}`,
      'or pass --root <resources-root> (or GALMUSIC_RESOURCE_ROOT) for a staging/fixture directory.',
    ];
    const error = new Error(lines.join('\n'));
    error.code = 'MISSING_RESOURCES';
    throw error;
  }

  return {
    resourceRoot: path.resolve(resourceRoot),
    garbroPath: requiredFiles[0],
    rpaScriptPath: requiredFiles[1],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await verifyResources();
    console.log(`NatsumeMusic resources verified: ${result.resourceRoot}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
