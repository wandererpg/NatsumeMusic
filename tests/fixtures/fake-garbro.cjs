#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const archivePath = process.argv.find((value, index) => index >= 2 && !value.startsWith('-'));
  if (!process.argv.includes('-x') || !archivePath) {
    console.error('missing -x <archive>');
    process.exitCode = 2;
  } else if (process.env.FAKE_GARBRO_FAIL === '1') {
    console.error('fake GARbro failure');
    process.exitCode = 7;
  } else {
    const fixture = path.join(__dirname, 'archive-fixture', 'track.ogg');
    const outputDir = process.cwd();
    await fs.mkdir(outputDir, { recursive: true });
    await fs.copyFile(fixture, path.join(outputDir, 'track.ogg'));
    process.stdout.write('fake GARbro: extracted track.ogg\n');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
