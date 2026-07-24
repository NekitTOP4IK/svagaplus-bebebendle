# AGENTS.md

Guidelines for agentic coding agents working in the bebebendle repository.

## Project Overview

**Monorepo:** Next.js frontend + Python Telegram bot + PostgreSQL (Docker)

**Services:**
- `next/` - Next.js 16 + React 19 + TypeScript
- `bot/` - Python 3.11 + aiogram
- `db/` - PostgreSQL 15 (Docker container)

## Build, Lint, and Test Commands

### Frontend (Next.js)
**Package Manager:** Bun

```bash
# Development (in next/ directory)
bun run dev              # Start dev server

# Build & Deploy
bun run build            # Build production
make up-build           # Docker: build & start all services

# Linting
bun run lint            # Run ESLint
bun run lint --fix      # Auto-fix ESLint
```

### Python Bot
**Package Manager:** UV

```bash
# Development (in bot/ directory)
uv sync                 # Install dependencies
uv run python src/main.py  # Run bot locally

# Linting & Type Checking
ruff check .            # Run Ruff linter
ruff check --fix .      # Auto-fix issues
mypy src/               # Run MyPy type checker

# Testing
pytest                  # Run all tests
pytest -xvs             # Verbose output
pytest -xvs test_file.py::test_func  # Single test
```

### Database & Docker

```bash
# Database
make migrate            # Run Drizzle migrations
make generate-migration # Generate new migration

# Docker Operations
make up                 # Start all services
make down               # Stop all services
make logs-frontend      # View frontend logs
make logs-bot           # View bot logs
make shell-frontend     # Open shell in frontend container
```

## Code Style Guidelines

### TypeScript (Frontend)

**Configuration:**
- Target: ES2017, Strict mode
- Module: ESNext with bundler resolution
- JSX: react-jsx (no React import needed)

**Imports:**
- Use `@/*` alias: `import { db } from "@/db/schema"`
- Prefer named imports

**Naming Conventions:**
- Components: PascalCase (`UserProfile.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Directories: kebab-case (`user-profile/`)
- Configs: kebab-case (`eslint.config.mjs`)

**React Patterns:**
- Functional components with explicit return types
- Use `Readonly<>` for props: `type Props = Readonly<{ name: string }>`
- Prefer early returns
- Server Components by default; add `"use client"` only when needed

**Error Handling:**
- Strict null checks
- Try/catch for async operations
- Avoid `any`; use `unknown` with type guards

### Python (Bot)

**Configuration:**
- Python 3.11+, MyPy strict typing
- Ruff linting (line-length: 100)

**Naming Conventions:**
- Functions/variables: snake_case
- Classes: PascalCase
- Constants: UPPER_SNAKE_CASE

**Type Hints:**
- All functions must have type hints
- Use `from __future__ import annotations` for forward references

### Styling (Tailwind CSS v4)

- Use CSS syntax: `@import "tailwindcss"; @theme inline { ... }`
- Prefer Tailwind utility classes over inline styles
- CSS variables for theming

### Database (Drizzle ORM)

- Define schemas in `next/db/schema.ts`
- Prefer type-safe Drizzle queries
- Use migrations via `bunx drizzle-kit generate`

### ESLint & Formatting

- **No Prettier** - rely on ESLint
- ESLint 9 flat config
- Extends Next.js core-web-vitals and TypeScript rules
- Run `bun run lint` before committing

## Testing

**Frontend:** vitest + some component/lib tests (in next/tests/)
```bash
cd next
# (bun test or npx vitest run)  -- note: bun required for full
```

**Backend:** pytest configured:
```bash
pytest                  # Run all tests
pytest -xvs             # Verbose mode
pytest -k test_name     # Run tests matching pattern
```

## Project Structure

```
next/                   # Next.js frontend
├── app/               # App Router pages
│   ├── admin/        # Admin panel (incl. /admin/competitive)
│   ├── api/          # API routes (incl. /svaga/* , /competitive/* , /cron/competitive)
│   ├── competitive/  # Competitive hub + play (auth-only)
│   ├── components/   # React components (incl. competitive/)
│   ├── profile/      # User profile (SVAGA link UI + history)
│   └── lib/          # Utility functions (svaga.ts, auth-server.ts, competitive/*)
├── db/               # Drizzle schema & migrations (users + svaga + competitive_*)
├── public/           # Static assets
└── scripts/          # Utility scripts (backfill, refresh-subscribers)
├── app/api/middleware/rateLimit.ts  # used for daily + now internal svaga
├── app/api/admin/announcements/      # CRUD REST (admin only) for on-site announcements
├── app/admin/announcements/          # Admin list + editor for announcements
├── components/announcements/          # Overlay + MarkdownView shown on home
└── lib/announcements.ts              # server library: getActiveAnnouncements + CRUD

bot/                   # Python Telegram bot
├── src/              # Source code
│   ├── main.py       # Bot handlers (get_svaga_subscriber_status on suggest)
│   └── database.py   # Database operations (insert with is_subscriber_at_submit)
└── pyproject.toml    # Dependencies & config
```

## Important Notes

- Next.js 16 with React 19
- PostgreSQL via Docker (was SQLite)
- Dark mode via `prefers-color-scheme`
- Geist font for typography
- Bun for frontend, UV for Python

## New Flow (User Accounts + SVAGA+ Linking) - Task 9 Polish Notes

- Optional Telegram login (via /admin widget for now) creates local `users` row.
- SVAGA+ linking: profile page -> POST /api/svaga/link (uses lib/svaga.ts to call svagaplus internal).
- Subscriber status: cached in users; bot calls GET /api/internal/svaga/subscription-status (X-Internal-Secret) before insert_scran to snapshot `is_subscriber_at_submit`.
- Internal endpoint is rate-limited (using existing rateLimit.ts middleware, 30/60s per tg id).
- Logging added: `[svaga]`, `[svaga-link]`, `[svaga-status]`, `[svaga-internal]` prefixes for checks and linking.
- Error UI: profile shows inline red error box for SVAGA link failures (no more alert(); specific msgs like service unavailable).
- Anonymous plays fully independent: daily uses only sessionId + fingerprint (see /api/daily/results, actions/daily.ts, no getCurrentUser calls). UserId optional in daily_user_results.
- Bot README and AGENTS updated for the flow.
- See design spec risks: cached status on SVAGA+ downtime; rate limits + interleaving for abuse.
- Run `bun run lint` before commits. Multiple small commits for polish.

## Announcements System (Task 10)

- Admin-managed on-site cards shown once per browser on `/`. FIFO by `createdAt ASC`.
- `localStorage["seenAnnouncementIds"]` = `number[]` (capped at 200); mark-on-render = seen.
- Markdown via `react-markdown` + `remark-gfm` (no `rehype-raw` → no raw HTML, XSS-safe).
- Admin-only CRUD at `/admin/announcements`; REST at `/api/admin/announcements[/:id]`.
- Audit actions: `announcements.create`, `announcements.update`, `announcements.delete`.
- Schema: `next/db/schema.ts` → `announcements` table; migration `0011_add_announcements.sql`.
- Editing an announcement is silent: same `id` stays seen; to re-show, admin duplicates it.
- See design: `docs/superpowers/specs/2026-07-18-announcements-design.md`; plan: `docs/superpowers/plans/2026-07-18-announcements.md`.

## Competitive Daily

Separate season-ranked daily for **authenticated** users only. Does not touch casual daily tables/APIs.

**Routes / domain:**
- Player: `/competitive` (hub), `/competitive/play` — auth gate → `/profile` if logged out
- Archive: `/competitive/seasons`, `/competitive/seasons/[id]` (ended seasons + final standings)
- APIs: `/api/competitive/*` (hub, daily, vote, finalize, leaderboard, display-name, seasons)
- Admin: `/admin/competitive` + `/api/admin/competitive/*` (pool, seasons, daily generate, settings flag)
- Cron: `GET /api/cron/competitive` with `Authorization: Bearer ${CRON_SECRET}` (same secret as casual)
- Domain: `next/lib/competitive/*`; schema tables `competitive_*` (migration `0012_*`)
- Feature flag: app_settings `competitive_enabled` (`isCompetitiveEnabled` / admin Competitive panel)

**Home entry:** `next/app/page.tsx` shows **Competitive** link only when user is logged in, flag is on, and `getVisibleSeason()` returns a season.

**Polish wave (UX / anti-copy / Twitch):**
- Season archive routes `/competitive/seasons` (+ `[id]` for final board)
- Twitch login bridge via SVAGA `twitch-identity` (Telegram remains primary auth)
- `COMPETITIVE_PRESENTATION_SECRET` — per-user shuffle + L/R flip of competitive presentation
- `ensureSeasonTransitions` on hub / play / admin (not only midnight cron)

**Ops:**
```bash
# Host crontab (00:00 MSK) — independent of casual
0 0 * * * TZ=Europe/Moscow /opt/bebebendle/current/ops/cron-generate-competitive.sh >> /opt/bebebendle/shared/logs/competitive-cron.log 2>&1
```
Script: `ops/cron-generate-competitive.sh` sources `shared/.env` and hits `/api/cron/competitive`. Skipped cleanly if disabled / no playable season.

See design: `docs/superpowers/specs/2026-07-23-competitive-daily-design.md`; plan: `docs/superpowers/plans/2026-07-23-competitive-daily.md`. Polish: `docs/superpowers/specs/2026-07-24-competitive-polish-twitch-design.md`.
