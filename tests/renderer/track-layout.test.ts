import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('right-side library layout', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'src/renderer/src/styles/globals.css'), 'utf8');

  it('keeps scrolling on main content and removes the nested track card surface', () => {
    expect(css).toMatch(/\.main-content\s*\{[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.track-table-wrap\s*\{[^}]*overflow-y:\s*visible;/s);
    expect(css).toMatch(/\.track-table-wrap\s*\{[^}]*border:\s*0;/s);
    expect(css).toMatch(/\.track-table-wrap\s*\{[^}]*background:\s*transparent;/s);
    expect(css).not.toMatch(/\.track-table-wrap\s*\{[^}]*max-height:/s);
  });

  it('uses a theme-aware liquid-glass surface for the table header', () => {
    expect(css).toMatch(/\.track-table\s*\{[^}]*border-collapse:\s*separate;/s);
    expect(css).toMatch(/\.track-table th\s*\{[^}]*backdrop-filter:\s*blur\(18px\)/s);
    expect(css).toMatch(/\.track-table th\s*\{[^}]*-webkit-backdrop-filter:\s*blur\(18px\)/s);
    expect(css).toMatch(/\.track-table th\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.055\)/s);
    expect(css).toMatch(/@supports not \(backdrop-filter:\s*blur\(1px\)\)/s);
  });

  it('adds edge refraction, specular layers, and accessibility fallbacks', () => {
    expect(css).toMatch(/\.track-table__head\s*\{[^}]*isolation:\s*isolate;/s);
    expect(css).toMatch(/\.track-table__head::before\s*\{/s);
    expect(css).toMatch(/\.track-table__head::after\s*\{/s);
    expect(css).toMatch(/backdrop-filter:\s*url\(#natsume-liquid-refraction\)/s);
    expect(css).toMatch(/saturate\(1\.85\)/s);
    expect(css).toMatch(/brightness\(1\.08\)/s);
    expect(css).toMatch(/prefers-reduced-transparency:\s*reduce/s);
  });

  it('keeps the glass material neutral instead of using colored gradients', () => {
    const tableGlass = css.slice(css.indexOf('.track-table__head'), css.indexOf('.track-table td'));
    expect(tableGlass).not.toMatch(/\.track-table__head::before\s*\{[^}]*linear-gradient/s);
    expect(tableGlass).not.toMatch(/\.track-table__head::after\s*\{[^}]*linear-gradient/s);
    expect(tableGlass).not.toMatch(/\.track-table th\s*\{[^}]*linear-gradient/s);
    expect(tableGlass).not.toMatch(/rgba\(120, 226, 206|rgba\(159, 139, 255|rgba\(246, 164, 192/);
    expect(tableGlass).toMatch(/\.track-table th\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.055\)/s);
  });

  it('uses one continuous neutral glass slab per track row without cell edge treatments', () => {
    expect(css).toMatch(/\.track-row\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.028\)/s);
    expect(css).toMatch(/\.track-row\s*\{[^}]*backdrop-filter:\s*blur\(14px\) saturate\(1\.1\)/s);
    expect(css).toMatch(/\.track-row\s*\{[^}]*-webkit-backdrop-filter:\s*blur\(14px\) saturate\(1\.1\)/s);
    expect(css).toMatch(/\.track-row td\s*\{[^}]*background:\s*transparent/s);
    expect(css).toMatch(/\.track-row td\s*\{[^}]*border-bottom:\s*0/s);
    expect(css).toMatch(/\.track-row:hover(?:,\s*\.track-row:focus-visible)?\s*\{[^}]*background:\s*rgba\(255, 255, 255, 0\.055\)/s);
    expect(css).not.toMatch(/\.track-row td:first-child\s*\{/s);
    expect(css).not.toMatch(/\.track-row td:last-child\s*\{/s);
    expect(css).not.toMatch(/\.track-row:hover td/);
    expect(css).toMatch(/@supports not \(backdrop-filter:\s*blur\(1px\)\)\s*\{[^}]*\.track-row\s*\{/s);
    expect(css).toMatch(/prefers-reduced-transparency:\s*reduce[\s\S]*\.track-row td/s);
    expect(css).not.toMatch(/\.track-row\s*\{[^}]*box-shadow:/s);
    expect(css).not.toMatch(/\.track-row\s*\{[^}]*linear-gradient/s);
  });
});
