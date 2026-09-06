import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { THEME_IDS } from '../../src/shared/types';

describe('theme CSS contract', () => {
  const css = readFileSync(path.resolve(process.cwd(), 'src/renderer/src/styles/globals.css'), 'utf8');

  it('defines a root selector for every supported theme', () => {
    for (const id of THEME_IDS) expect(css).toContain(`[data-theme="${id}"]`);
    expect(css).not.toContain('[data-theme="washi-sakura"]');
  });

  it('defines semantic surfaces and the isolated global image layers', () => {
    for (const token of ['--panel-bg', '--panel-strong', '--theme-backdrop', '--user-background-image']) {
      expect(css).toContain(token);
    }
    expect(css).toContain('.app-shell__user-background');
    expect(css).toContain('.app-shell__background-shade');
  });

  it('gives every theme an immersive full-card treatment', () => {
    for (const id of THEME_IDS) {
      expect(css).toContain(`[data-card-theme="${id}"]`);
    }
    expect(css).toContain('.theme-card__name');
    expect(css).toContain('.theme-card__check');
    expect(css).not.toContain('.theme-card__swatches');
    expect(css).not.toContain('.theme-card__copy small');
  });

  it('keeps the settings footer visible by constraining the scrollable body', () => {
    expect(css).toMatch(/\.settings-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
    expect(css).toMatch(/\.settings-panel__body\s*\{[^}]*flex:\s*1;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  });

  it('applies shared card interactions after all theme variants', () => {
    const lastVariant = Math.max(...THEME_IDS.map((id) => css.lastIndexOf(`[data-card-theme="${id}"]`)));
    expect(css.lastIndexOf('.theme-card:hover {')).toBeGreaterThan(lastVariant);
    expect(css.lastIndexOf('.theme-card.is-selected {')).toBeGreaterThan(lastVariant);
    expect(css).toMatch(/\[data-card-theme="scrapbook-diary"\][^{]*\{[^}]*rotate:\s*-/s);
  });

  it('preserves focus, responsive, and reduced-motion contracts', () => {
    expect(css).toContain('.theme-card:focus-within');
    expect(css).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.theme-grid[^}]*grid-template-columns:\s*1fr;/);
    const reducedMotion = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotion).toMatch(/\.theme-card[^}]*transition:\s*none;/);
    expect(reducedMotion).toContain('.theme-card.is-selected:hover');
  });
});
