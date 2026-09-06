# GalMusic Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six new runtime-switchable themes and one persisted global custom-background system while preserving the existing GalMusic layout.

**Architecture:** Shared theme/background types define the persisted contract. Main-process settings normalize stored values and a dedicated protocol serves only the selected background image. The renderer applies a theme ID plus CSS custom properties at the app root, while the settings panel edits a draft and persists it through the existing settings IPC.

**Tech Stack:** Electron 31, React 18, TypeScript 5.6, Zustand, CSS custom properties, Vitest, Testing Library, better-sqlite3.

**Status:** Implemented and verified on 2026-08-23: 205 tests passed, TypeScript passed, resources verified, and the production build completed. Post-review hardening added main-process-only temporary image authorization, transactional settings persistence, and save/cancel operation locking.

---

### Task 1: Define and normalize appearance settings

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/services/settings.ts`
- Create: `tests/main/appearance-settings.test.ts`

- [ ] **Step 1: Write the failing normalization tests**

```ts
expect(readAppSettings(db)).toMatchObject({
  themeId: 'rain-afterglow',
  background: { imagePath: null, blur: 12, dim: 0.42, scale: 100, positionX: 50, positionY: 50 },
});
setSetting(db, 'theme_id', 'neon-terminal');
setSetting(db, 'background_blur', '18');
expect(readAppSettings(db).themeId).toBe('neon-terminal');
expect(readAppSettings(db).background.blur).toBe(18);
```

- [ ] **Step 2: Run `npm test -- tests/main/appearance-settings.test.ts` and verify the missing fields fail**

- [ ] **Step 3: Add `ThemeId`, `BackgroundSettings`, defaults, allow-list parsing, and numeric clamping**

```ts
export const THEME_IDS = ['rain-afterglow', 'neon-terminal', 'amber-film', 'aquarium-glass', 'record-shop', 'velvet-theatre', 'scrapbook-diary'] as const;
export type ThemeId = typeof THEME_IDS[number];
```

- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 2: Serve only the authorized custom background

**Files:**
- Create: `src/shared/background-url.ts`
- Create: `src/main/services/background-protocol.ts`
- Modify: `src/main/index.ts`
- Create: `tests/main/background-protocol.test.ts`
- Create: `tests/shared/background-url.test.ts`

- [ ] **Step 1: Write failing URL round-trip and protocol authorization tests**

```ts
expect(parseBackgroundUrl(toBackgroundUrl('D:\\Pictures\\scene.png'))).toBe('D:\\Pictures\\scene.png');
expect(await request('D:\\Pictures\\scene.png')).toMatchObject({ status: 200 });
expect(await request('D:\\Pictures\\other.png')).toMatchObject({ status: 403 });
```

- [ ] **Step 2: Run both focused tests and verify imports are missing**

- [ ] **Step 3: Implement the URL helper and a protocol handler that compares the requested path with `background_image_path`**

```ts
if (!configuredPath || path.resolve(filePath) !== path.resolve(configuredPath)) {
  return new Response('Background image is not authorized', { status: 403 });
}
```

- [ ] **Step 4: Register `galmusic-background` as privileged and install the handler during startup**

- [ ] **Step 5: Re-run focused tests and verify they pass**

### Task 3: Define the renderer theme registry and root style mapping

**Files:**
- Create: `src/renderer/src/theme/themes.ts`
- Create: `src/renderer/src/theme/appearance.ts`
- Create: `tests/renderer/appearance.test.ts`

- [ ] **Step 1: Write failing tests for the seven registered themes and background style conversion**

```ts
expect(THEMES.map((theme) => theme.id)).toEqual([
  'rain-afterglow', 'neon-terminal', 'amber-film', 'aquarium-glass',
  'record-shop', 'velvet-theatre', 'scrapbook-diary',
]);
expect(toAppearanceStyle(settings)['--user-background-position']).toBe('35% 70%');
```

- [ ] **Step 2: Run the focused test and verify the new modules are missing**

- [ ] **Step 3: Implement immutable metadata and a pure CSS-property mapper using `toBackgroundUrl`**

- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 4: Add appearance controls to settings

**Files:**
- Modify: `src/renderer/src/components/settings/SettingsPanel.tsx`
- Modify: `tests/renderer/scan-settings.test.tsx`

- [ ] **Step 1: Extend the component test to select `霓虹终端`, choose a background, and change blur**

```tsx
fireEvent.click(screen.getByRole('radio', { name: /霓虹终端/ }));
fireEvent.click(screen.getByRole('button', { name: /导入背景图片/ }));
fireEvent.change(screen.getByRole('slider', { name: /背景模糊度/ }), { target: { value: '18' } });
expect(onAppearancePreview).toHaveBeenLastCalledWith(expect.objectContaining({ themeId: 'neon-terminal' }));
```

- [ ] **Step 2: Run the focused test and verify the new controls are absent**

- [ ] **Step 3: Add theme cards, image actions, five labeled sliders, draft preview, cancel restoration, and complete save payload**

- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 5: Wire persistence and live application state

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Create: `tests/renderer/app-appearance.test.tsx`

- [ ] **Step 1: Write a failing integration test that loads a stored theme and saves a changed theme without losing background settings**

```ts
expect(await screen.findByTestId('app-shell')).toHaveAttribute('data-theme', 'amber-film');
expect(setSetting).toHaveBeenCalledWith('theme_id', 'neon-terminal');
expect(setSetting).toHaveBeenCalledWith('background_image_path', 'D:/Pictures/scene.png');
```

- [ ] **Step 2: Run the focused test and verify the root has no theme attribute**

- [ ] **Step 3: Apply loaded appearance to `app-shell`, preview settings drafts, persist all appearance keys, and restore drafts on cancel**

- [ ] **Step 4: Re-run the focused test and verify it passes**

### Task 6: Implement the seven visual languages

**Files:**
- Modify: `src/renderer/src/styles/globals.css`

- [ ] **Step 1: Add a source-level contract test that checks every theme selector and required semantic token exists**

```ts
for (const id of THEME_IDS) expect(css).toContain(`[data-theme="${id}"]`);
for (const token of ['--ink-0', '--paper-0', '--teal-0', '--panel-bg']) expect(css).toContain(token);
```

- [ ] **Step 2: Run the test and verify selectors C through H are missing**

- [ ] **Step 3: Add semantic panel/background variables, global image layers, and theme-specific token blocks/effects**

- [ ] **Step 4: Add focused settings-card styles and reduced-motion handling**

- [ ] **Step 5: Run renderer tests and verify they pass**

### Task 7: Verify and document

**Files:**
- Modify: `docs/GalMusic-实际运行逻辑.md`

- [ ] **Step 1: Run `npm test` and expect all suites to pass**

- [ ] **Step 2: Run `npx tsc --noEmit` and expect exit code 0**

- [ ] **Step 3: Run `npm run verify:resources` and expect GARbro verification to pass**

- [ ] **Step 4: Run `npm run build` and expect main, preload, and renderer bundles to complete**

- [ ] **Step 5: Document theme loading, background authorization, renderer application, and persistence flow**
