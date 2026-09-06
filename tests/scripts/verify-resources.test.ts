import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const scriptPath = path.resolve(process.cwd(), 'scripts/verify-resources.mjs');

describe('resource verification', () => {
  it('accepts a complete staging directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-resources-'));
    await mkdir(path.join(root, 'tools', 'garbro'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.exe'), 'fixture-garbro');
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.Console.exe'), 'fixture-console');
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.Xp3Bridge.exe'), 'fixture-xp3-bridge');
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.Probe.exe'), 'fixture-probe');
    await writeFile(path.join(root, 'tools', 'garbro', 'ArcFormats.dll'), 'fixture-formats');
    await mkdir(path.join(root, 'tools', 'garbro', 'GameData'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'garbro', 'GameData', 'Formats.dat'), 'fixture-schemes');
    await writeFile(path.join(root, 'tools', 'extract-rpa.mjs'), '// fixture');

    const { stdout } = await execFileAsync(process.execPath, [scriptPath, '--root', root]);
    expect(stdout).toContain('NatsumeMusic resources verified');
  });

  it('rejects a GARbro bundle without the non-interactive XP3 bridge', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-resources-no-bridge-'));
    await mkdir(path.join(root, 'tools', 'garbro', 'GameData'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.exe'), 'fixture-garbro');
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.Console.exe'), 'fixture-console');
    await writeFile(path.join(root, 'tools', 'garbro', 'ArcFormats.dll'), 'fixture-formats');
    await writeFile(path.join(root, 'tools', 'garbro', 'GameData', 'Formats.dat'), 'fixture-schemes');
    await mkdir(path.join(root, 'tools'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'extract-rpa.mjs'), '// fixture');

    await expect(execFileAsync(process.execPath, [scriptPath, '--root', root])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('GARbro.Xp3Bridge.exe'),
    });
  });

  it('rejects a GARbro bundle without the SM2MPX Probe bridge', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-resources-no-probe-'));
    await mkdir(path.join(root, 'tools', 'garbro', 'GameData'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.exe'), 'fixture-garbro');
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.Console.exe'), 'fixture-console');
    await writeFile(path.join(root, 'tools', 'garbro', 'GARbro.Xp3Bridge.exe'), 'fixture-xp3-bridge');
    await writeFile(path.join(root, 'tools', 'garbro', 'ArcFormats.dll'), 'fixture-formats');
    await writeFile(path.join(root, 'tools', 'garbro', 'GameData', 'Formats.dat'), 'fixture-schemes');
    await mkdir(path.join(root, 'tools'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'extract-rpa.mjs'), '// fixture');

    await expect(execFileAsync(process.execPath, [scriptPath, '--root', root])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('GARbro.Probe.exe'),
    });
  });

  it('fails with an actionable message when GARbro is absent', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'galmusic-resources-missing-'));
    await mkdir(path.join(root, 'tools'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'extract-rpa.mjs'), '// fixture');

    await expect(execFileAsync(process.execPath, [scriptPath, '--root', root])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('GARbro.exe is missing'),
    });
  });
});
