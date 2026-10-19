import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import postcss from 'postcss';
it('parses styles and keeps settings, sync and motion rules outside small-screen queries', () => {
  const ast = postcss.parse(readFileSync('src/renderer/src/styles/globals.css', 'utf8'));
  for (const selector of ['.settings-group__heading', '.sync-panel__actions', '.library-view']) {
    const found: string[] = [];
    ast.walkRules(rule => { if (rule.selector === selector) found.push(rule.parent?.type ?? ''); });
    expect(found).toContain('root');
  }
});
