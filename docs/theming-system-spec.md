# Bebebendle Theming System Specification

**Version:** 1.0  
**Date:** 2026-07-09  
**Status:** Draft for implementation  
**Audience:** Human developers + AI agents (Grok, etc.)

---

## 1. Overview & Goals

### Purpose
Create a maintainable, extensible theming system for the Bebebendle frontend (strong Minecraft / pixel-art aesthetic) that allows adding new visual styles without major refactoring or touching component code.

### Core Goals
- Support multiple visual themes (e.g. `minecraft`, `retro-blue`, `halloween`, seasonal skins, future game crossovers).
- Enable **fast iteration** during development.
- Maintain high performance (prefer native CSS over heavy runtime solutions).
- Make theme creation declarative, predictable, and well-documented.
- Be future-proof for 5–10+ themes and potential admin-driven theme switching.
- Integrate cleanly with **Tailwind CSS v4**.

### Non-Goals (current scope)
- Full component variant system (e.g. "Button variants").
- End-user theme picker (can be added later).
- Automatic seasonal theme switching (future consideration).

---

## 2. Current State

- **Stack**: Next.js 16 + React 19 + Tailwind CSS v4
- **Current styling approach**:
  - `app/globals.css` with `@import "tailwindcss"`
  - Heavy use of custom pixel classes: `.pixel-btn`, `.pixel-text`, `.pixel-container`, `.pixel-card`, `.retro-bg`, etc.
  - Hardcoded colors, shadows, and borders inside these classes.
  - Some basic CSS variables (`--background`, `--foreground`, `--font-pixel`).
  - `@theme` block for Tailwind configuration.
  - Pixel font: `Press_Start_2P` (loaded in `layout.tsx`).
- **Problems**:
  - Colors are duplicated and scattered.
  - Adding a new style requires editing many places.
  - No clear separation between "base pixel language" and "theme-specific values".
  - Only minimal `prefers-color-scheme` support.

**Key files involved today**:
- `next/app/globals.css`
- `next/app/layout.tsx`
- `next/app/components/**/*.tsx` (many use `pixel-*` classes)
- `next/public/sprites/` (Minecraft assets – part of the visual identity)

---

## 3. Recommended Architecture (Regret-Minimal)

### Primary Pattern
**Design Tokens → CSS Custom Properties → `data-theme` attribute on `<html>`**

This approach is:
- Native and performant.
- Excellent with Tailwind v4.
- Easy to scale.
- Works for both build-time and runtime switching.
- Easy for humans and agents to understand and extend.

### Why this is future-proof
- Tokens become the single source of truth.
- Components stay theme-agnostic.
- New themes are just new sets of variable values.
- Can later be fed from JSON / design tokens tools if needed.

---

## 4. Architecture Details

### Token Layers

1. **Base / Primitive Tokens** (`styles/tokens.css`)
   - Raw or semantic values (colors, spacing, shadows, transitions).
   - Not tied to any specific theme.

2. **Theme Overrides** (`styles/themes/*.css`)
   - Map base tokens to concrete values for a look & feel.
   - Use `[data-theme="name"]` selectors.

3. **Component Tokens**
   - Used inside reusable pixel classes (`.pixel-btn`, etc.).
   - Should reference CSS variables only.

### Theme Application

```html
<html lang="ru" data-theme="minecraft">
```

All theme-aware styles read from variables that are redefined per theme.

---

## 5. Recommended File Structure

```
next/
├── styles/
│   ├── tokens.css                 # Base design tokens (single source of truth)
│   ├── themes/
│   │   ├── index.css              # Imports all active themes
│   │   ├── minecraft.css          # Current default (MC pixel style)
│   │   ├── retro-blue.css
│   │   └── halloween.css
│   └── components/
│       └── pixel.css              # Reusable pixel components using tokens
│
├── app/
│   ├── globals.css                # Main entry point
│   ├── layout.tsx
│   └── providers.tsx
│
├── lib/
│   └── theme.ts                   # Constants, theme list, helpers
│
└── types/
    └── theme.ts                   # TypeScript definitions for themes
```

**Do not** put theme-specific color values directly inside component files or the main `globals.css`.

---

## 6. Token Naming Convention (Strict Rules)

Use consistent prefixes:

| Prefix              | Purpose                     | Example                        |
|---------------------|-----------------------------|--------------------------------|
| `--color-`          | All colors                  | `--color-pixel-bg`             |
| `--shadow-`         | Box and inset shadows       | `--shadow-pixel-inset`         |
| `--border-`         | Border widths / colors      | `--border-pixel`               |
| `--text-shadow-`    | Text shadows                | `--text-shadow-pixel`          |
| `--transition-`     | Transitions & durations     | `--transition-pixel-fast`      |
| `--font-`           | Font variables (existing)   | `--font-pixel`                 |

**Rule**: After migration, **no raw hex/rgb values** are allowed inside `.pixel-*` classes.

---

## 7. Implementation Rules (for Humans and Agents)

1. **Never hardcode visual values** in pixel classes after the migration is complete.
2. When a user asks to "add a new style", **create a new file** in `styles/themes/`, not edit existing classes.
3. All new visual elements that should vary by theme **must** use CSS variables.
4. Update the following when adding a theme:
   - `styles/themes/index.css`
   - `lib/theme.ts` (theme registry)
   - This spec if the structure changes
5. Keep animation keyframes and structural utilities in base files (they rarely change per theme).
6. Prefer semantic variable names over raw values in markup when possible (e.g. `bg-pixel-bg` via Tailwind mapping).

---

## 8. Theme Switching Strategies

### Development (Fastest Feedback)
- Query parameter support: `?theme=halloween`
- Should be implemented early for rapid testing.
- Works with Next.js Hot Module Replacement.

### Production
- Default theme via environment variable: `NEXT_PUBLIC_DEFAULT_THEME=minecraft`
- Can be overridden by:
  - Cookie (for user preference)
  - Database setting (for admin-controlled global theme)
- Theme is applied on the server in `layout.tsx` (Server Component) so no flash.

### Future
- Admin panel theme switcher (with live preview).
- Per-user theme (stored in cookie or user profile).

---

## 9. Integration with Tailwind CSS v4

- Continue using the `@theme` directive for Tailwind-specific configuration (fonts, breakpoints, etc.).
- Map key theme variables into Tailwind when useful:
  ```css
  @theme {
    --color-pixel-bg: var(--color-pixel-bg);
  }
  ```
- You can then use classes like `bg-pixel-bg` in components.
- Prefer this over inline `style={{ background: 'var(--color-pixel-bg)' }}` for most cases.

---

## 10. Development Workflow

1. Run `bun run dev` in the `next/` directory.
2. To test a new style quickly:
   - Create `styles/themes/my-new-style.css`
   - Add the import
   - Navigate to `http://localhost:3000?theme=my-new-style`
3. Iterate on variables → instant visual feedback.
4. Once satisfied, commit the theme file.
5. To make a theme the default, update the environment variable or the default in code.

---

## 11. Production Considerations

- Theme choice should be resolved as early as possible (in `layout.tsx` or middleware) to avoid layout shift.
- Keep the number of CSS variables reasonable (group related values).
- For very different visual directions, consider whether a completely separate set of component styles is needed (rare).
- Nginx / reverse proxy (when added) does **not** affect theming — it is purely a frontend concern.

---

## 12. Migration Plan (Current → New System)

1. Create `styles/tokens.css` and seed it with current values under `[data-theme="minecraft"]`.
2. Refactor all hardcoded values in `.pixel-btn`, `.pixel-card`, `.pixel-container`, etc. to use variables.
3. Update `globals.css` to import the new token/theme structure.
4. Add `data-theme="minecraft"` to the `<html>` tag.
5. Implement query parameter theme switching for development.
6. Clean up duplicated styles.
7. Add at least one additional example theme to validate the system.
8. Update `lib/theme.ts` with the list of available themes.
9. Document usage in this spec and in README if appropriate.

---

## 13. Rules for AI Agents

When asked to work on styles or themes:

- Always prefer extending the token + `data-theme` system.
- Never introduce new hardcoded colors in the `pixel-*` classes.
- If the user asks for "a new style", create a file in `styles/themes/`.
- Update the theme registry (`lib/theme.ts`) and `styles/themes/index.css`.
- If you modify base pixel classes, ensure they continue to work for all existing themes.
- Reference this spec file (`docs/theming-system-spec.md`) in your reasoning when making decisions.

---

## 14. Related Project Context

- **Project Structure**: Monorepo with `next/` and `bot/`. Shared assets live in root `uploads/`.
- **Current Visual Identity**: Minecraft / pixel-art (sprites, 8-bit fonts, retro shadows, `image-rendering: pixelated`).
- **Nginx**: Currently not present. When added, it should simply proxy to the Next.js app on port 3000. Theming is handled entirely inside the Next.js app.
- **Image Handling**: Uses `/cdn/[filename]` route + root `uploads/` directory. Theming must not interfere with image paths.
- **Branching**: The `mc` branch introduced the current Minecraft design. Theming system must preserve and extend this identity.

---

## 15. Open Questions & Future Work

- Should we support live theme preview inside the admin panel?
- Do we want date-based automatic themes (e.g. Halloween in October)?
- Should the background image be fully themeable or handled separately?
- Do we need a visual theme switcher for regular users in the future?
- Should we generate themes from a JSON tokens file (for designer handoff)?

---

## Appendix: Quick Start for a New Theme

1. Create `next/styles/themes/my-theme.css`
2. Add the following structure:

```css
[data-theme="my-theme"] {
  --color-pixel-bg: #your-color;
  --color-pixel-border: #your-color;
  /* override only what you need */
}
```

3. Import it in `styles/themes/index.css`
4. Test with `?theme=my-theme`
5. Add to `lib/theme.ts`

---

**This document should be the single source of truth for all theming work in the project.**

When working on styles, both humans and agents should read and follow this spec.