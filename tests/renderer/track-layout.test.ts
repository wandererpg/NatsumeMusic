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

  it('keeps the virtualized row height and avoids per-row blur', () => {
    expect(css).toMatch(/\.track-row td\s*\{[^}]*height:\s*60px;/s);
    expect(css).not.toMatch(/\.track-row\s*\{[^}]*backdrop-filter:/s);
  });

  it('keeps solid surfaces available when transparency is reduced', () => {
    const fallback = css.slice(css.indexOf('@media (prefers-reduced-transparency: reduce)'), css.indexOf('/* Dialogs'));
    expect(fallback).toContain('.track-table th');
    expect(fallback).toContain('.settings-panel');
    expect(fallback).toContain('backdrop-filter: none');
    expect(fallback).toContain('background: var(--ink-1)');
    expect(css).not.toContain('natsume-liquid-refraction');
  });
});
