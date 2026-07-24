# Announcements System — Design

**Date:** 2026-07-18
**Status:** Approved (design)
**Scope:** Single-feature spec — admin-managed on-site announcements with markdown support, FIFO delivery, one-time-per-browser display.

## 1. Overview

Administrators create "announcements" (header + markdown body) via `/admin/announcements`. The site homepage (`/`) shows the oldest active announcement a given browser has not yet seen, exactly once. One announcement is shown at a time. Identifying "already seen" is purely client-side via `localStorage`. Editing an announcement does **not** surface it again to users who have already dismissed/auto-seen it.

The Minecraft pixel visual language of the existing site is preserved (`.pixel-container`, `.pixel-btn`, `.pixel-text`, `bg-zinc-900`, `border-4 border-black`).

## 2. Goals & Non-Goals

### Goals
- Admin CRUD for announcements (title, markdown body, active flag).
- Markdown rendering with GFM features (bold, italic, strikethrough, lists, links).
- One-per-browser, one-at-a-time delivery, oldest-first.
- Long bodies scroll inside the card.
- Stylistic continuity with the existing site.

### Non-Goals (explicitly out of scope, will not be implemented)
- Priority/tag/scheduling/segment-target fields.
- Image uploads or attachments.
- Server-side per-user seen tracking (analytics/CTR).
- Re-surfacing on edit; "reset all views" admin button.
- Mobile push, Telegram, email.
- Public API endpoint for fetching announcements (the homepage fetches server-side).

## 3. Decisions (confirmed with user)

| Topic | Decision |
|---|---|
| Seen-identity | Client-side `localStorage` only |
| Display location | Only on the homepage (`next/app/page.tsx`) |
| Show queue | FIFO by `createdAt ASC` (oldest unseen) |
| Edit behaviour | Silent — same `id` stays "seen"; to re-show, admin creates a new announcement |
| Permissions | `admin` role only (CRUD) |
| Delivery mechanism | Server fetches list in `page.tsx`, client component filters by `localStorage` after mount |

## 4. Architecture

### 4.1 Delivery approach (windowed client-overlay)

Server component `next/app/page.tsx` performs one DB read of all currently-active announcements ordered by `createdAt ASC`, passes that list into a new client overlay component. The list is **not** included in the rendered HTML payload in a way that flashes before the user; the client overlay only commits the chosen announcement to the DOM after `useEffect` reads `localStorage`, so already-seen announcements never flash on reload.

This avoids three anti-patterns:

1. **Flash of seen content** (Approach C: render in SSR HTML) — rejected.
2. **Extra HTTP round-trip** (Approach A: `/api/announcements`) — rejected; the homepage is already a server component doing DB reads.
3. **Server-side per-browser seen store** — rejected by user; overkill.

### 4.2 Data model

New table `announcements` (migration `0011_add_announcements.sql`):

```ts
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),                    // 1..200 chars (validated)
  body: text("body").notNull(),                      // 1..5000 chars (validated), GFM markdown
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
}, (t) => ({
  activeCreatedIdx: index("announcements_active_created_idx").on(t.active, t.createdAt),
}));

export type Announcement = typeof announcements.$inferSelect;
```

- Index `(active, createdAt)` makes the common read `WHERE active=true ORDER BY createdAt ASC` cheap.
- Hard `onDelete: "set null"` on the author FK so deleting an admin user never cascades into announcement data loss; `createdByUserId` becomes informational.

### 4.3 Module boundaries

| Layer | File | Responsibility |
|---|---|---|
| Schema | `next/db/schema.ts` | Add `announcements` table + types |
| Migration | `next/db/migrations/0011_add_announcements.sql` | `CREATE TABLE announcements ...; CREATE INDEX ...` |
| Server lib | `next/lib/announcements.ts` | `getActiveAnnouncements()`, `listAllAnnouncements()`, `createAnnouncement()`, `updateAnnouncement()`, `deleteAnnouncement()`, `validateAnnouncement({title, body})` |
| Server actions / API route | `next/app/api/admin/announcements/route.ts` + `[id]/route.ts` | Admin-only REST, mirrors `/api/admin/settings` shape |
| Home integration | `next/app/page.tsx` | One additional awaited call; passes list to overlay |
| Client overlay | `next/components/announcements/announcement-overlay.tsx` | `"use client"`, filters by `localStorage`, renders chosen card + dismisses |
| Markdown rendering | `next/components/announcements/markdown-view.tsx` | `react-markdown` + `remark-gfm`, custom components for links (new-tab, no-opener) and pixel-friendly typography |
| Admin list | `next/app/admin/announcements/page.tsx` + `layout.tsx` | Staff-gated layout (copy of `scrans/layout.tsx` pattern), list of all announcements |
| Admin editor | `next/components/admin/announcements/announcement-editor.tsx` | Create/edit form with live preview |
| Audit logging | Reuse `next/lib/moderation-audit.ts` | New audit actions: `announcements.create`, `announcements.update`, `announcements.delete` |

### 4.4 New dependency

- `react-markdown` — safe by default (no raw HTML rendering).
- `remark-gfm` — provides strikethrough, tables, autolinks, task lists.

`rehype-raw` is **deliberately NOT added**; markdown never renders raw HTML, which removes the largest XSS surface. Admin-only authoring further shrinks the surface.

## 5. API contract (admin-only)

All admin endpoints require `requireRole("admin")` (from `@/lib/auth-server`).

### `GET /api/admin/announcements`
Returns all announcements (active + disabled), newest first by `createdAt`.

Response: `200 OK`
```json
[
  { "id": 1, "title": "...", "body": "...", "active": true,
    "createdAt": "2026-07-18T10:00:00Z", "updatedAt": "...",
    "createdByUserId": 3 }
]
```

### `POST /api/admin/announcements`
Body: `{ "title": string, "body": string, "active"?: boolean }`
- Validates: `title` 1..200, `body` 1..5000 (whitespace-trimmed).
- Writes audit `announcements.create` with `{ id, title }` in details.
- Returns `201 Created` with the new row.

### `PATCH /api/admin/announcements/[id]`
Body: any subset of `{ "title", "body", "active" }`.
- Same length validation as POST.
- Bumps `updatedAt`.
- Writes audit `announcements.update` with diff keys.
- Returns `200 OK` with the updated row.
- Returns `404` if `id` does not exist.

### `DELETE /api/admin/announcements/[id]`
- Hard delete (no soft-delete column; admin CRUD is explicit).
- Writes audit `announcements.delete` with `{ id, title }`.
- Returns `204 No Content`.
- Returns `404` if `id` does not exist.

Public read — none. The homepage reads from DB directly; there is no public endpoint.

## 6. Delivery contract (client overlay)

### 6.1 Storage schema in `localStorage`

- Key: `"seenAnnouncementIds"`
- Value: JSON-encoded `number[]`, e.g. `[1, 7, 12]`.
- If parse fails or shape is wrong, treat as `[]` and overwrite on next write with a clean array.

### 6.2 Lifecycle (client)

```
1. Client receives prop `active: Announcement[]` (createdAt ASC).
2. After mount, useEffect reads localStorage "seenAnnouncementIds".
3. If invalid or empty/unparseable -> [].
4. pick = active.find(a => !seen.includes(a.id))
5. if !pick -> render nothing, do not write localStorage.
6. else:
     setSelected(pick)
     localStorage["seenAnnouncementIds"] = JSON.stringify([pick.id, ...seen].slice(0, 200))
7. Render card immediately on commit.
```

- **Mark-on-render**: simply rendering the card counts as "seen". This is the "one time at site entry" behaviour requested.
- **Dismiss UX**: an `X` button (`.pixel-btn`) is provided for users who want to close the card visually; it does not add a separate `dismissed` key — `seenIds` already contains the id.
- **Backdrop click**: also dismissed (hides the visible card). Pressing Escape hides it too. None of these adjust `seenIds`; the id is already recorded.
- **Cap `seenIds` at 200 entries**: keeps `localStorage` bounded; oldest entries (front of array after slice) are dropped — equivalent to "treat old absence as seen", no functional impact because the visible list is bounded by DB row count which is tiny for an admin tool.
- **Reduced motion**: overlay fade uses `framer-motion` with short `0.2s` duration; `prefers-reduced-motion: reduce` is respected (animate via the user-agent CSS setting / `useReducedMotion`).

### 6.3 Visual language

```
Backdrop: fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4
Card:    .pixel-container border-4 border-black bg-zinc-900/95 max-w-xl w-full p-5 sm:p-6
Header:  flex justify-between items-start
         title: .pixel-text text-lg sm:text-xl (truncated to 1 line + ellipsis on overflow)
         X:     .pixel-btn square ~2rem, "✕"
Body:    mt-3 max-h-[60vh] overflow-y-auto pr-2 text-zinc-200 text-sm leading-relaxed
```

Body is scrollable up to `60vh`. Below the cap it lays out naturally.

### 6.4 Markdown styling (inside `markdown-view.tsx`)

`react-markdown` with `remark-gfm`. Custom component mapping (no `rehype-raw`):

| Element | Style |
|---|---|
| `p` | `my-2 leading-relaxed` |
| `h1`/`h2`/`h3` | `.pixel-text text-base mt-3 mb-1` (capped so long headers don't dominate) |
| `ul`/`ol` | `list-disc pl-5 my-2 space-y-1` |
| `li` | `leading-relaxed` |
| `a` | render `<a target="_blank" rel="noopener noreferrer" className="text-amber-300 underline">` |
| `strong` | `font-bold text-white` |
| `em` | `italic text-zinc-100` |
| `del` | `line-through text-zinc-400` |
| `code` (inline) | `font-mono text-amber-200 bg-black/40 px-1` |
| `pre` (block) | `bg-black/40 border border-black/60 p-3 overflow-x-auto` |
| `blockquote` | `border-l-4 border-zinc-600 pl-3 text-zinc-300 italic` |
| `table` | `border-collapse text-xs` (GFM) |
| `hr` | `my-4 border-t border-zinc-700` |

Headings inside body are intentionally not `.pixel-text` large — keeps dense content readable. `.pixel-text` is reserved for the card title in the header.

### 6.5 Live preview (admin editor)

Editor form: title input, body textarea, and a freeze-rendered preview beside/below it using the same `markdown-view.tsx` component (reuse, single source of truth). The preview height is also capped with `max-h-[60vh] overflow-y-auto` to mirror production behaviour for the editor.

## 7. Home integration (`next/app/page.tsx`)

Current server actions before render:
- `hasDailyForToday()`
- `getDailyPublicStatus(hasDaily)`

Add:
- `const announcements = await getActiveAnnouncements();`

Pass to `<AnnouncementOverlay active={announcements} />` rendered once near the bottom of the existing tree (sibling to `<DailyPlayButton>` block). No change to existing layout.

The homepage already declares `export const dynamic = "force-dynamic"`, so no caching concerns.

## 8. Admin UI

### 8.1 Layout gate

`next/app/admin/announcements/layout.tsx` — identical structure to `next/app/admin/scrans/layout.tsx`: redirects to `/admin` if not staff. The page itself restricts write actions to `admin` via the API.

### 8.2 List page

`next/app/admin/announcements/page.tsx`:

- `useEffect` fetches `GET /api/admin/announcements` via `apiFetch` (existing `@/lib/api-client`).
- Shows a Minecraft-styled table/list of rows: `#id`, title (truncated 60 chars), createdAt (ru-RU), active badge (green `/`dark), and action buttons:
  - Edit → opens the editor inline as a modal/expanded panel **on the same page** (no separate route; keeps admin surface minimal and matches the existing `/admin` dashboard pattern where all moderation happens on one page).
  - Disable / Enable → `PATCH {active}`.
  - Delete → `DELETE` with `confirm()` prompt.
- "Создать объявление" button at the top opens the same editor (empty).
- Re-use `.pixel-btn` variants: `.pixel-btn-ok` for create, `.pixel-btn-danger` for delete, plain `.pixel-btn` for edit / toggle.

### 8.3 Editor

`next/components/admin/announcements/announcement-editor.tsx`:

- Props: `{ mode: "create" | "edit", initial?: Announcement, onClose: () => void, onSaved: () => void }`.
- Two-column layout on `sm+` (form left, live preview right), stacked on mobile.
- Fields:
  - `title`: `.pixel-input`, maxLength 200, char counter.
  - `body`: `.pixel-textarea` (resizable off; `min-h-[12rem]`), maxLength 5000, char counter.
  - `active`: `.pixel-check` checkbox, default `true` for create, `initial.active` for edit.
- Save → POST or PATCH depending on mode.
- Validates client-side lengths to avoid 400 round-trips.

## 9. Validation & Security

- **Auth**: every API route starts with `await requireRole("admin")`; non-admins get `401`, mirroring `app/api/admin/settings/route.ts`.
- **Markdown XSS**: `react-markdown` is safe by default (no raw HTML parsing). `rehype-raw` is **not** added. Links are rendered with `target="_blank" rel="noopener noreferrer"`.
- **Length limits**: enforced both client (form) and server (validation). Title `1..200`, body `1..5000`, trimmed before validation.
- **Audit log**: every mutation writes via `writeAuditLog` with actorUserId and diff.
- **No PII in announcements body**: out of scope (an admin could paste PII, but admin trust is already established for moderation, settings, bans).
- **localStorage pollution**: capped at 200 ids in the overlay, never stores body.

## 10. Testing

- **vitest** unit tests under `next/tests/` (matching existing structure):
  - `announcements.test.ts` — `validateAnnouncement` (lengths, empty, whitespace-only, boundary values).
  - `announcement-overlay.test.tsx` — given `active=[A,B,C]` and localStorage `[B]`, picks A (oldest unseen); writes `[A,B]` to localStorage; renders card for A; on second mount with localStorage `[A,B,C]` renders nothing.
- **Manual smoke**: admin creates, edits, disables, enables, deletes; incognito tab sees oldest unseen once, then none on reload.

## 11. Lint / Type

- `bun run lint` before commit (existing ESLint flat config; no new rules needed).
- TypeScript strict: all server APIs and client components typed; `Announcement` type exported from schema.
- No changes to MyPy/Ruff, no bot changes.

## 12. Migration plan

1. Add schema table + types + migration SQL.
2. Run `make migrate` (`bunx drizzle-kit migrate`) — equivalent: apply the new SQL against Postgres.
3. Add `next/lib/announcements.ts` (pure server, no React).
4. Add `next/app/api/admin/announcements/route.ts` + `[id]/route.ts`.
5. Add admin list page + editor component.
6. Add `react-markdown`, `remark-gfm` to dependencies via `bun`.
7. Add `next/components/announcements/markdown-view.tsx` + `announcement-overlay.tsx`.
8. Wire `next/app/page.tsx`.
9. Add tests, run `bun run lint`, smoke manually.

## 13. Out-of-scope reminders (will not appear in the implementation plan)

- priority field, tags, scheduling, start/end dates, subscription targeting, images, uploads, analytics, re-show-on-edit, "reset views" button, public `/api/announcements` endpoint.