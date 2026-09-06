import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

interface ProjectPackage {
  scripts?: Record<string, string>;
}

describe('Electron native-module setup', () => {
  it('rebuilds better-sqlite3 for Electron after install and before dev', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as ProjectPackage;
    const scripts = packageJson.scripts ?? {};

    expect(scripts['rebuild:native']).toContain('electron-rebuild');
    expect(scripts['rebuild:native']).toContain('better-sqlite3');
    expect(scripts.postinstall).toContain('rebuild:native');
    expect(scripts.predev).toContain('rebuild:native');
    expect(scripts.test).toContain('run-vitest-electron');
  });
});
