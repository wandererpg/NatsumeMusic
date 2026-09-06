import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('application branding', () => {
  const projectRoot = process.cwd();
  const builderConfig = readFileSync(path.join(projectRoot, 'electron-builder.yml'), 'utf8');
  const rendererEntry = readFileSync(path.join(projectRoot, 'src/renderer/index.html'), 'utf8');
  const welcome = readFileSync(path.join(projectRoot, 'src/renderer/src/components/settings/Welcome.tsx'), 'utf8');
  const sharedPaths = readFileSync(path.join(projectRoot, 'src/shared/paths.ts'), 'utf8');

  it('uses NatsumeMusic for the HTML title and Windows product metadata', () => {
    expect(rendererEntry).toContain('<title>NatsumeMusic</title>');
    expect(builderConfig).toMatch(/productName:\s*NatsumeMusic/);
    expect(builderConfig).toMatch(/executableName:\s*NatsumeMusic/);
    expect(builderConfig).toMatch(/shortcutName:\s*NatsumeMusic/);
  });

  it('uses NatsumeMusic in the welcome copy and new-library default', () => {
    expect(welcome).toContain('NatsumeMusic');
    expect(sharedPaths).toContain("'NatsumeMusic'");
  });
});
