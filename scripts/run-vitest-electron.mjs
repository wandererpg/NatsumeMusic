import { spawnSync } from 'node:child_process';
import path from 'node:path';

import electronPath from 'electron';

const vitestCli = path.resolve('node_modules/vitest/vitest.mjs');
const result = spawnSync(electronPath, [vitestCli, 'run', ...process.argv.slice(2)], {
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Failed to launch Electron test runner: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
