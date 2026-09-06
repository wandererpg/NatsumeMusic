# GalMusic Immersive Theme Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the metadata-heavy theme picker with seven full-card immersive theme previews that show only the theme name and selection state.

**Architecture:** Keep `SettingsPanel` responsible for radio selection and live preview, while moving all visual differentiation into `globals.css` selectors keyed by `data-card-theme`. Simplify the theme registry by removing display metadata that no longer has a consumer. Protect the result with component behavior tests and a CSS selector contract.

**Tech Stack:** React 18, TypeScript, CSS, Vitest, Testing Library, Electron/Vite

---

### Task 1: Lock the simplified card markup with a failing component test

**Files:**
- Modify: `tests/renderer/scan-settings.test.tsx`
- Test: `tests/renderer/scan-settings.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that renders `SettingsPanel`, obtains the theme grid, and asserts that obsolete metadata is absent while every theme remains selectable:

```tsx
it('renders immersive theme cards without codes, descriptions, or swatches', () => {
  const { container } = render(<SettingsPanel settings={appearanceSettings} onClose={vi.fn()} onSave={vi.fn()} />);
  const grid = screen.getByRole('radiogroup', { name: '软件主题' });

  expect(grid).not.toHaveTextContent('A ·');
  expect(grid).not.toHaveTextContent('雨后青绿玻璃');
  expect(container.querySelector('.theme-card__preview')).not.toBeInTheDocument();
  expect(container.querySelector('.theme-card__swatches')).not.toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '雨夜青岚' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: '音乐手帐' })).toBeInTheDocument();
});
```

Use the same complete settings object already used by neighboring settings tests instead of introducing a production helper.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- tests/renderer/scan-settings.test.tsx
```

Expected: FAIL because the current markup still renders `A ·`, descriptions, `.theme-card__preview`, and `.theme-card__swatches`.

### Task 2: Simplify theme data and card markup

**Files:**
- Modify: `src/renderer/src/theme/themes.ts`
- Modify: `src/renderer/src/components/settings/SettingsPanel.tsx`
- Test: `tests/renderer/scan-settings.test.tsx`

- [ ] **Step 1: Remove unused theme presentation metadata**

Change the theme definition to:

```ts
export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  tone: 'dark' | 'light';
}
```

Keep all seven existing IDs, names, and tones, but remove `code`, `description`, and `swatches` from every object.

- [ ] **Step 2: Replace the card contents**

Render the label with a theme-specific data attribute, the hidden radio, one visible name, and an inert selection mark:

```tsx
<label
  key={theme.id}
  className={`theme-card${themeId === theme.id ? ' is-selected' : ''}`}
  data-card-theme={theme.id}
>
  <input
    className="sr-only"
    type="radio"
    name="galmusic-theme"
    value={theme.id}
    checked={themeId === theme.id}
    onChange={() => previewAppearance(theme.id, background)}
    aria-label={theme.name}
  />
  <strong className="theme-card__name">{theme.name}</strong>
  <span className="theme-card__check" aria-hidden="true">✓</span>
</label>
```

- [ ] **Step 3: Run the focused component suite and verify GREEN**

Run:

```powershell
npm test -- tests/renderer/scan-settings.test.tsx
```

Expected: all tests in the file PASS, including live preview and save behavior.

### Task 3: Lock the seven visual treatments with a failing CSS contract test

**Files:**
- Modify: `tests/renderer/theme-css.test.ts`
- Test: `tests/renderer/theme-css.test.ts`

- [ ] **Step 1: Add the CSS contract**

```ts
it('gives every theme an immersive full-card treatment', () => {
  for (const id of THEME_IDS) {
    expect(css).toContain(`[data-card-theme="${id}"]`);
  }
  expect(css).toContain('.theme-card__name');
  expect(css).toContain('.theme-card__check');
  expect(css).not.toContain('.theme-card__swatches');
  expect(css).not.toContain('.theme-card__copy small');
});
```

- [ ] **Step 2: Run the focused CSS test and verify RED**

Run:

```powershell
npm test -- tests/renderer/theme-css.test.ts
```

Expected: FAIL because the seven `data-card-theme` selectors and new name/check styles do not exist yet.

### Task 4: Implement the immersive card materials

**Files:**
- Modify: `src/renderer/src/styles/globals.css`
- Test: `tests/renderer/theme-css.test.ts`

- [ ] **Step 1: Replace the shared card layout**

Use a two-column grid with an 88px card, full-card background layers, isolated stacking contexts, readable centered names, top-right selection checks, hover lift, focus ring, and selected double outline. Remove `.theme-card__preview`, `.theme-card__copy`, `.theme-card__swatches`, and old `data-preview-theme` rules.

The base rules must include these behaviors:

```css
.theme-card { min-height: 88px; overflow: hidden; isolation: isolate; }
.theme-card::before,
.theme-card::after { position: absolute; content: ""; pointer-events: none; }
.theme-card__name { position: relative; z-index: 2; }
.theme-card__check { position: absolute; z-index: 3; top: 9px; right: 10px; opacity: 0; }
.theme-card.is-selected .theme-card__check { opacity: 1; }
```

- [ ] **Step 2: Add one full-card selector per theme**

Implement all seven selectors named in the design:

```css
[data-card-theme="rain-afterglow"] {
  --card-accent: #78e2ce; color: #ecfffb; border-color: rgba(120,226,206,.35);
  background: radial-gradient(circle at 76% 18%, rgba(120,226,206,.23), transparent 31%), linear-gradient(145deg, #07171a, #17373a);
}
[data-card-theme="neon-terminal"] {
  --card-accent: #45f2df; color: #f5efff; border-color: rgba(69,242,223,.38); border-radius: 3px;
  background: linear-gradient(rgba(69,242,223,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,79,163,.08) 1px, transparent 1px), linear-gradient(145deg, #090711, #32175b); background-size: 18px 18px, 18px 18px, auto;
}
[data-card-theme="amber-film"] {
  --card-accent: #f2b45e; color: #fff1dc; border-color: rgba(242,180,94,.4);
  background: radial-gradient(circle at 82% 16%, rgba(242,180,94,.45), transparent 24%), linear-gradient(135deg, #211713, #6a3e28);
}
[data-card-theme="aquarium-glass"] {
  --card-accent: #168fbd; color: #15384a; border-color: rgba(22,143,189,.34); border-radius: 18px;
  background: radial-gradient(circle at 78% 20%, rgba(255,255,255,.78), transparent 20%), radial-gradient(circle at 20% 78%, rgba(22,143,189,.18), transparent 25%), linear-gradient(145deg, #edfaff, #8ddbea);
}
[data-card-theme="record-shop"] {
  --card-accent: #ef5b38; color: #152a45; border-color: rgba(21,42,69,.38); border-radius: 2px;
  background: linear-gradient(115deg, transparent 0 68%, rgba(239,91,56,.8) 68% 79%, transparent 79%), linear-gradient(25deg, #f5eedb, #e4dabd);
}
[data-card-theme="velvet-theatre"] {
  --card-accent: #e3b45d; color: #fff1df; border-color: rgba(227,180,93,.48); border-radius: 18px 18px 5px 5px;
  background: radial-gradient(ellipse at 50% -10%, rgba(255,217,134,.48), transparent 38%), linear-gradient(90deg, rgba(88,8,30,.86), transparent 30% 70%, rgba(88,8,30,.86)), #17080d;
}
[data-card-theme="scrapbook-diary"] {
  --card-accent: #d95f87; color: #514451; border: 1px dashed rgba(131,91,108,.55); border-radius: 10px 5px 12px 7px;
  background: radial-gradient(circle at 82% 20%, rgba(217,95,135,.28), transparent 25%), repeating-linear-gradient(0deg, transparent 0 21px, rgba(130,95,112,.09) 21px 22px), #fff7f4;
}
```

Each selector must define its own `--card-accent`, text color, border, radius, and layered background. Pseudo-elements provide texture without image assets.

- [ ] **Step 3: Preserve responsive and reduced-motion behavior**

Keep the single-column breakpoint at 720px. Under `prefers-reduced-motion: reduce`, disable theme-card transitions and transforms, including hover and selection movement.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
npm test -- tests/renderer/theme-css.test.ts tests/renderer/scan-settings.test.tsx
```

Expected: both test files PASS.

### Task 5: Verify, review, package, and validate the desktop artifact

**Files:**
- Verify: `src/renderer/src/components/settings/SettingsPanel.tsx`
- Verify: `src/renderer/src/styles/globals.css`
- Verify: `release/win-unpacked/resources/app.asar`
- Verify: `C:\Users\HONOR\Desktop\GalMusic.lnk`

- [ ] **Step 1: Run the complete verification suite**

```powershell
npm test
npx tsc --noEmit
npm run verify:resources
npm run build
```

Expected: all tests PASS, TypeScript exits 0, resources verify, and production build succeeds.

- [ ] **Step 2: Perform code review**

Review the exact component/CSS/test changes for requirement coverage, accessibility regression, stale selectors, contrast, overflow, and theme-selection behavior. Fix any findings with a failing test first when behavior is affected.

- [ ] **Step 3: Rebuild the Windows package**

```powershell
npm run package:win
```

Expected: `release/win-unpacked/GalMusic.exe` and `release/GalMusic-0.1.0-x64.exe` receive current timestamps.

- [ ] **Step 4: Validate the packaged renderer**

Use `@electron/asar` to extract the packaged renderer bundle in memory. Compare its SHA-256 with `out/renderer/assets/index-*.js` and assert that it contains `data-card-theme`, `雨夜青岚`, and `音乐手帐`.

- [ ] **Step 5: Verify the desktop shortcut**

Read `C:\Users\HONOR\Desktop\GalMusic.lnk` through `WScript.Shell` and assert that its target exists and equals the current `release\win-unpacked\GalMusic.exe` path.

The project is not a Git repository, so commit steps are intentionally replaced by test/build checkpoints.

## Completion Record

- Implemented all seven full-card theme treatments and removed codes, descriptions, preview thumbnails, and swatches.
- Preserved radio semantics, live preview, keyboard focus, responsive layout, and reduced-motion behavior.
- Code review found and resolved settings-footer clipping, interaction cascade overrides, and selected-hover reduced-motion specificity.
- Final verification: 42 test files / 210 tests passed; TypeScript, resource verification, production build, and Windows packaging passed.
- Packaged renderer JS/CSS hashes match the current `out/renderer` bundles; obsolete description and swatch markers are absent.
- Desktop shortcut target was verified in the real user environment and points to the current `release/win-unpacked/GalMusic.exe`.
