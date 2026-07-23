# Competitive Daily Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an auth-only competitive daily mode with admin-curated pool, frozen close-pair rounds, smart points, monthly seasons, live leaderboard, and a dedicated hub shell — without changing casual daily.

**Architecture:** Separate Postgres tables and `lib/competitive/*` domain. Pure scoring/pair math is unit-tested first. Admin manages pool + seasons; cron generates MSK days while a season is `active`. Play identity is `userId` only. Hub/play routes redirect unauthenticated users. UI is a competitive-specific shell (prototype as mood reference), not a reskin of home.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle ORM, PostgreSQL 15, Bun, Tailwind v4, vitest, existing `getCurrentUser` / `requireRole` auth.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-23-competitive-daily-design.md`
- Visual refs (non-final): `docs/superpowers/specs/assets/competitive-hub-prototype/`, `docs/superpowers/specs/assets/2026-07-23-competitive-hub-mockup-s1.png`
- Package manager: **Bun** (`cd next && bun run lint`, `bun run test:run`)
- Import alias `@/*` under `next/`
- Calendar day: **Europe/Moscow** via existing `todayMskDate()` from `@/lib/daily-timezone`
- Competitive does **not** write to `daily_scrandles`, `scrandle_votes`, or `daily_user_results`
- Auth: hub + play + mutations require `getCurrentUser()`; unauthenticated → redirect `/profile` (Telegram login entry)
- Admin: `requireRole("admin")` for pool/season/generate APIs
- Audit: `writeAuditLog` with prefixes `competitive.pool.*`, `competitive.season.*`, `competitive.daily.*`
- Feature flag key: `competitive_enabled` in `app_settings` (default **false** until ops enables)
- MIN pool votes: **15**; rounds: **10**; pair_key never repeats globally
- Points: `round(100 * clamp(12/max(Δ,1), 1, 8))` if correct else 0; no time-of-day factor
- Public UI: show **«N очков»**, not hits; leaderboard columns `#`, nick, points, days
- Run `bun run lint` before each commit; one commit per task
- Do not implement Twitch/SVAGA badge grant, friends/clans, or per-season themes beyond nullable schema fields

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `next/db/schema.ts` | Modify | Competitive tables + `users.competitiveDisplayName` (+ updatedAt) |
| `next/db/migrations/0012_add_competitive.sql` | Create | SQL migration |
| `next/db/migrations/meta/_journal.json` | Modify | Journal entry `0012` |
| `next/lib/competitive/constants.ts` | Create | MIN_VOTES, bands, formula constants |
| `next/lib/competitive/scoring.ts` | Create | pct, Δ, round points, day aggregate (pure) |
| `next/lib/competitive/pairs.ts` | Create | `pairKey`, band for round, pick pairs (pure helpers) |
| `next/lib/competitive/pool.ts` | Create | add/list/enable, sync snapshots on cooldown |
| `next/lib/competitive/seasons.ts` | Create | CRUD seasons, get playable, end + final ranks |
| `next/lib/competitive/generate.ts` | Create | generate daily for date from pool |
| `next/lib/competitive/play.ts` | Create | vote, finalize, standing upsert |
| `next/lib/competitive/hub.ts` | Create | hub payload assembly |
| `next/lib/competitive/display-name.ts` | Create | validate + set competitive nick |
| `next/lib/competitive/feature.ts` | Create | `isCompetitiveEnabled()` |
| `next/lib/app-settings.ts` | Modify | competitive flag helpers (or only via feature.ts + getBoolSetting) |
| `next/app/api/competitive/**` | Create | hub, daily, vote, finalize, leaderboard, display-name |
| `next/app/api/admin/competitive/**` | Create | seasons, pool, daily generate/preview |
| `next/app/api/cron/competitive/route.ts` | Create | generate day + season transitions |
| `next/app/competitive/page.tsx` | Create | hub (server auth gate) |
| `next/app/competitive/play/page.tsx` | Create | play (server auth gate) |
| `next/components/competitive/**` | Create | shell, progress, leaderboard, CTA, game board, styles |
| `next/app/page.tsx` | Modify | link to competitive for logged-in users (optional if flag on) |
| `next/components/admin/**` + `next/app/admin/competitive/**` | Create | admin UI for pool/seasons/daily |
| `next/tests/lib/competitive-*.test.ts` | Create | unit tests for pure + domain helpers |

---

### Task 1: Schema + migration

**Files:**
- Modify: `next/db/schema.ts`
- Create: `next/db/migrations/0012_add_competitive.sql`
- Modify: `next/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces table symbols and types for all later tasks: `competitivePoolEntries`, `competitiveSeasons`, `competitiveDailies`, `competitiveRounds`, `competitiveVotes`, `competitiveResults`, `competitiveStandings`, `competitiveSeasonFinalRanks`, plus `users.competitiveDisplayName`, `users.competitiveDisplayNameUpdatedAt`.

- [ ] **Step 1: Extend `users` and append competitive tables in `schema.ts`**

On `users` table add:

```ts
competitiveDisplayName: text("competitive_display_name"),
competitiveDisplayNameUpdatedAt: timestamp("competitive_display_name_updated_at", { withTimezone: true }),
```

Add unique index on lower name (in table callback or raw SQL migration if drizzle unique on expression is awkward — prefer raw SQL unique index in migration):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS competitive_display_name_lower_uidx
  ON users (lower(competitive_display_name))
  WHERE competitive_display_name IS NOT NULL;
```

Add tables matching spec §7.1 (serial/int PKs, FKs to `users`/`scrans`, uniques on `pair_key`, `(user_id, date)`, `(daily_id, round_number)`, PK standings `(season_id, user_id)`).

Use `timestamp(..., { withTimezone: true })` for timestamptz fields; `date` columns as `text` (YYYY-MM-DD) consistent with casual daily.

Export types:

```ts
export type CompetitivePoolEntry = typeof competitivePoolEntries.$inferSelect;
export type CompetitiveSeason = typeof competitiveSeasons.$inferSelect;
// ... all tables
```

- [ ] **Step 2: Write `0012_add_competitive.sql`**

Hand-write SQL aligned with schema: all CREATE TABLE + indexes + ALTER users columns. Include:

- `competitive_rounds.pair_key` UNIQUE
- `competitive_results` UNIQUE `(user_id, date)`
- `competitive_dailies.date` UNIQUE
- standings PK, final_ranks PK + UNIQUE `(season_id, rank)`

- [ ] **Step 3: Journal entry**

Append to `_journal.json`:

```json
{
  "idx": 12,
  "version": "7",
  "when": 1784900000000,
  "tag": "0012_add_competitive",
  "breakpoints": true
}
```

- [ ] **Step 4: Apply locally if DB available**

```bash
make migrate
```

Expected: success (or document skip if no local DB; schema still committed).

- [ ] **Step 5: Lint + commit**

```bash
cd next && bun run lint
git add next/db/schema.ts next/db/migrations/0012_add_competitive.sql next/db/migrations/meta/_journal.json
git commit -m "feat(db): add competitive mode tables and display name columns"
```

---

### Task 2: Pure scoring + pair helpers (TDD)

**Files:**
- Create: `next/lib/competitive/constants.ts`
- Create: `next/lib/competitive/scoring.ts`
- Create: `next/lib/competitive/pairs.ts`
- Create: `next/tests/lib/competitive-scoring.test.ts`
- Create: `next/tests/lib/competitive-pairs.test.ts`

**Interfaces:**
- Produces:
  - `MIN_COMPETITIVE_VOTES = 15`
  - `COMPETITIVE_ROUNDS = 10`
  - `DIFFICULTY_BANDS: { roundStart, roundEnd, minDelta, maxDelta }[]`
  - `likesPct(likes, dislikes): number` — `likes / (likes+dislikes)`, `0` if total 0
  - `deltaPp(likesA, dislikesA, likesB, dislikesB): number` — `abs(pctA-pctB)*100`
  - `roundPotentialPoints(deltaPp: number): number` — formula with clamp
  - `roundEarnedPoints(deltaPp: number, isCorrect: boolean): number`
  - `correctScranId(a, b, likes...): number` — argmax pct; if equal throw or return null (generator forbids equal)
  - `pairKey(idA: number, idB: number): string` — `${min}:${max}`
  - `bandForRound(roundNumber: number): { minDelta: number; maxDelta: number }`
  - `isDeltaInBand(delta: number, min: number, max: number): boolean`
  - `computeDayScore(rounds: { deltaPp: number; isCorrect: boolean }[]): { hits: number; points: number }`

- [ ] **Step 1: Write failing tests for scoring**

`next/tests/lib/competitive-scoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  likesPct,
  deltaPp,
  roundPotentialPoints,
  roundEarnedPoints,
  computeDayScore,
} from "@/lib/competitive/scoring";

describe("competitive scoring", () => {
  it("likesPct is likes/(likes+dislikes)", () => {
    expect(likesPct(60, 40)).toBeCloseTo(0.6);
  });

  it("deltaPp is absolute percentage points", () => {
    // 70% vs 50% => 20 pp
    expect(deltaPp(70, 30, 50, 50)).toBeCloseTo(20);
  });

  it("easy wide delta floors at 100 points", () => {
    expect(roundPotentialPoints(20)).toBe(100);
  });

  it("delta 6 => 200 points", () => {
    expect(roundPotentialPoints(6)).toBe(200);
  });

  it("delta 3 => 400 points", () => {
    expect(roundPotentialPoints(3)).toBe(400);
  });

  it("delta 1 caps at 800 points", () => {
    expect(roundPotentialPoints(1)).toBe(800);
  });

  it("wrong answer earns 0", () => {
    expect(roundEarnedPoints(3, false)).toBe(0);
  });

  it("day score sums points and hits", () => {
    const day = computeDayScore([
      { deltaPp: 20, isCorrect: true },
      { deltaPp: 3, isCorrect: true },
      { deltaPp: 1, isCorrect: false },
    ]);
    expect(day.hits).toBe(2);
    expect(day.points).toBe(100 + 400);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd next && bun run test:run tests/lib/competitive-scoring.test.ts
```

Expected: FAIL module not found.

- [ ] **Step 3: Implement `constants.ts` + `scoring.ts`**

```ts
// constants.ts
export const MIN_COMPETITIVE_VOTES = 15;
export const COMPETITIVE_ROUNDS = 10;
export const POINTS_BASE = 100;
export const POINTS_K = 12;
export const POINTS_MIN_MULT = 1;
export const POINTS_MAX_MULT = 8;

export const DIFFICULTY_BANDS = [
  { roundStart: 1, roundEnd: 2, minDelta: 12, maxDelta: 25 },
  { roundStart: 3, roundEnd: 4, minDelta: 7, maxDelta: 12 },
  { roundStart: 5, roundEnd: 7, minDelta: 3, maxDelta: 7 },
  { roundStart: 8, roundEnd: 10, minDelta: 1, maxDelta: 3 },
] as const;
```

```ts
// scoring.ts — implement formula:
// multiplier = clamp(POINTS_K / max(delta, 1), MIN, MAX)
// points = round(POINTS_BASE * multiplier)
```

Use `Math.round` for points. Document that Δ is percentage points (0–100 scale).

- [ ] **Step 4: Tests pass**

```bash
cd next && bun run test:run tests/lib/competitive-scoring.test.ts
```

Expected: PASS.

- [ ] **Step 5: Pair helper tests + implementation**

Tests for `pairKey(3,1) === "1:3"`, `pairKey(5,5)` still `"5:5"` (generator must not use same scran twice), `bandForRound(1).minDelta === 12`, `bandForRound(10).maxDelta === 3`, `bandForRound(0)` throws, equal pct rejected by `assertUnequalPct` or `canPair`.

Implement `pairs.ts` accordingly.

- [ ] **Step 6: Lint + commit**

```bash
cd next && bun run lint && bun run test:run tests/lib/competitive-scoring.test.ts tests/lib/competitive-pairs.test.ts
git add next/lib/competitive next/tests/lib/competitive-scoring.test.ts next/tests/lib/competitive-pairs.test.ts
git commit -m "feat(competitive): pure scoring and pair helpers with tests"
```

---

### Task 3: Feature flag + pool library

**Files:**
- Create: `next/lib/competitive/feature.ts`
- Create: `next/lib/competitive/pool.ts`
- Create: `next/tests/lib/competitive-pool.test.ts` (validation pure parts; DB tests optional)
- Modify: `next/lib/app-settings.ts` — export `SETTING_COMPETITIVE_ENABLED = "competitive_enabled"` if desired

**Interfaces:**
- `isCompetitiveEnabled(): Promise<boolean>` — default **false**
- `setCompetitiveEnabled(enabled: boolean): Promise<void>`
- `addToPool(scranId: number, actorUserId: number): Promise<{ ok: true; entry } | { ok: false; error: string }>`
  - requires approved, votes ≥ 15, not already present
  - init snapshots from original likes/dislikes
- `setPoolEnabled(scranId: number, enabled: boolean): Promise<...>`
- `listPool(): Promise<PoolRow[]>` — join scran name, snapshot, last_used, whether in today’s rotation
- `syncCooldownSnapshots(dateMsk: string): Promise<number>` — for all enabled entries **not** used in competitive rounds for `dateMsk`, set snapshot := original likes/dislikes; return count updated
- `isScranInRotation(scranId: number, dateMsk: string): Promise<boolean>`

- [ ] **Step 1: Feature flag helpers**

```ts
// feature.ts
import { getBoolSetting, setSetting } from "@/lib/app-settings";

export const SETTING_COMPETITIVE_ENABLED = "competitive_enabled";

export async function isCompetitiveEnabled(): Promise<boolean> {
  return getBoolSetting(SETTING_COMPETITIVE_ENABLED, false);
}

export async function setCompetitiveEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_COMPETITIVE_ENABLED, enabled ? "true" : "false");
}
```

- [ ] **Step 2: Unit-test add-gate validation pure function**

Extract pure:

```ts
export function canAddScranToPool(s: {
  approved: boolean;
  rejected: boolean;
  numberOfLikes: number;
  numberOfDislikes: number;
}): { ok: true } | { ok: false; error: string } {
  if (!s.approved || s.rejected) return { ok: false, error: "Скран не одобрен" };
  const votes = s.numberOfLikes + s.numberOfDislikes;
  if (votes < MIN_COMPETITIVE_VOTES) {
    return { ok: false, error: `Нужно ≥${MIN_COMPETITIVE_VOTES} голосов` };
  }
  return { ok: true };
}
```

Test edges: 14 votes fail, 15 pass, rejected fail.

- [ ] **Step 3: Implement pool.ts DB operations**

Use drizzle inserts/updates. On add conflict unique scran_id → friendly error.

`syncCooldownSnapshots`: SQL update join scrans where enabled and scran not in today’s rounds.

- [ ] **Step 4: Lint, test, commit**

```bash
cd next && bun run test:run tests/lib/competitive-pool.test.ts && bun run lint
git add next/lib/competitive next/lib/app-settings.ts next/tests/lib/competitive-pool.test.ts
git commit -m "feat(competitive): feature flag and pool library"
```

---

### Task 4: Seasons library + final ranks

**Files:**
- Create: `next/lib/competitive/seasons.ts`
- Create: `next/tests/lib/competitive-seasons.test.ts` (status transition pure rules)

**Interfaces:**
- Status type: `"draft" | "countdown" | "active" | "ended"`
- `createSeason(input: { name: string; startsAt: Date; endsAt: Date; status?: Status }): Promise<Season>`
- `updateSeason(id, patch): Promise<...>`
- `listSeasons(): Promise<Season[]>`
- `getSeason(id): Promise<Season | null>`
- `getPlayableSeason(now = new Date()): Promise<Season | null>` — status `active` and `startsAt <= now < endsAt`
- `getVisibleSeason(now): Promise<Season | null>` — prefer active, else countdown, else latest ended
- `assertSingleActive(status, excludeId?): Promise<void>` — reject second active
- `transitionSeasonsByTime(now): Promise<{ activated: number; ended: number }>`
  - countdown → active when `now >= startsAt`
  - active → ended when `now >= endsAt` (call `endSeason`)
- `endSeason(seasonId): Promise<void>` — set status ended; snapshot standings into `competitive_season_final_ranks` ordered by points DESC, daysPlayed DESC, hits DESC, userId ASC; display_name_snapshot from competitiveDisplayName / telegram / fallback

Pure helper tests:

```ts
export function shouldActivate(season: { status: string; startsAt: Date }, now: Date): boolean
export function shouldEnd(season: { status: string; endsAt: Date }, now: Date): boolean
```

- [ ] **Step 1: Tests for shouldActivate / shouldEnd**
- [ ] **Step 2: Implement seasons.ts**
- [ ] **Step 3: Lint, test, commit**

```bash
git commit -m "feat(competitive): seasons lifecycle and final rank snapshot"
```

---

### Task 5: Daily generator

**Files:**
- Create: `next/lib/competitive/generate.ts`
- Create: `next/tests/lib/competitive-generate.test.ts` (pure pair selection with fixtures)

**Interfaces:**
- `selectCompetitivePairs(input: {
    candidates: Array<{ scranId: number; likes: number; dislikes: number }>;
    usedPairKeys: Set<string>;
    rounds?: number;
  }): { ok: true; pairs: Array<{ roundNumber; scranAId; scranBId; likesA; dislikesA; likesB; dislikesB; pairKey; deltaPp }> }
    | { ok: false; error: string }`
  - For each round 1..10, use `bandForRound`; filter candidates with total votes ≥ 15, pct unequal, pair_key free, scran not used this day
  - Prefer random among valid in band; if none, widen maxDelta by +2 repeatedly up to 40; never allow delta === 0
- `generateCompetitiveDaily(dateMsk: string): Promise<{ ok: true; dailyId: number } | { ok: false; error: string; status: number }>`
  - flag enabled; playable season; no existing daily for date; `syncCooldownSnapshots(date)`; load candidates from enabled pool with original votes ≥ 15; select pairs; insert daily + rounds with **frozen** snapshots; update `last_used_date` on pool entries

- [ ] **Step 1: Fixture-based unit test for `selectCompetitivePairs`**

Build 30 fake candidates with varied pct so all bands fill. Assert 10 pairs, increasing difficulty trend (average Δ early rounds > late rounds optional soft assert), no duplicate scrans, no zero delta, pair keys unique.

Test failure when too few candidates.

- [ ] **Step 2: Implement select + generate**
- [ ] **Step 3: Lint, test, commit**

```bash
git commit -m "feat(competitive): close-pair daily generator"
```

---

### Task 6: Play integrity (vote + finalize + standings)

**Files:**
- Create: `next/lib/competitive/play.ts`
- Create: `next/tests/lib/competitive-play.test.ts` (pure finalize from round rows)

**Interfaces:**
- `recordCompetitiveVote(input: {
    userId: number;
    date: string;
    roundNumber: number;
    chosenScranId: number;
  }): Promise<{ ok: true; isCorrect: boolean; percentageA: number; percentageB: number; potentialPoints: number; earnedPoints: number } | { ok: false; error: string; status: number }>`
  - Require feature flag, playable season, daily exists, no existing result for user/date
  - Load round; chosen must be A or B
  - Correctness from **frozen** likes only
  - Upsert vote unique (user, round)
- `finalizeCompetitive(input: { userId: number; date: string }): Promise<{ ok: true; hits: number; points: number } | { ok: false; ... }>`
  - Require 10 votes; compute day score; insert result; upsert standings (`points += day`, `days_played += 1`, `hits += dayHits`)
  - Ignore any client score
- `getUserResult(userId, date)` / `hasPlayed(userId, date)`

Pure test: given 10 frozen rounds + choices, finalize math matches `computeDayScore`.

- [ ] **Step 1: Tests for day scoring from frozen fixtures**
- [ ] **Step 2: Implement play.ts**
- [ ] **Step 3: Lint, test, commit**

```bash
git commit -m "feat(competitive): vote finalize and standings upsert"
```

---

### Task 7: Display name + hub assembly

**Files:**
- Create: `next/lib/competitive/display-name.ts`
- Create: `next/lib/competitive/hub.ts`
- Create: `next/tests/lib/competitive-display-name.test.ts`

**Interfaces:**
- `validateCompetitiveDisplayName(raw: unknown): { ok: true; name: string } | { ok: false; error: string }`
  - trim; length 2..24; charset: letters/numbers/`_`/`-`/cyrillic; no empty
- `leaderboardLabel(user: { competitiveDisplayName; telegramUsername; id }): string`
  - name → `@username` → `Игрок #id`
- `setCompetitiveDisplayName(userId, name | null): Promise<...>`
  - rate limit 24h via `competitiveDisplayNameUpdatedAt`
  - unique conflict → error
- `getHubPayload(userId: number): Promise<HubPayload>` including:
  - feature/season state
  - hasDailyToday, hasPlayed, todayPoints
  - me: place, points, daysPlayed, streakDays (compute consecutive MSK dates with results ending today or yesterday)
  - top: top 50 standings with labels
  - myRow if outside top
  - countdowns: season end ISO, next daily midnight MSK ISO

Streak is **UI only** (no points).

- [ ] **Step 1: Display name validation tests**
- [ ] **Step 2: Implement display-name + hub**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(competitive): display names and hub payload"
```

---

### Task 8: User API routes

**Files:**
- Create: `next/app/api/competitive/hub/route.ts` — GET
- Create: `next/app/api/competitive/daily/route.ts` — GET
- Create: `next/app/api/competitive/vote/route.ts` — POST
- Create: `next/app/api/competitive/finalize/route.ts` — POST
- Create: `next/app/api/competitive/leaderboard/route.ts` — GET
- Create: `next/app/api/competitive/display-name/route.ts` — PATCH

**Interfaces (HTTP):**

| Route | Auth | Body / query | Response highlights |
|-------|------|--------------|---------------------|
| GET hub | required | — | hub payload; 401 if no user; 404 if flag off optional → `{ enabled: false }` |
| GET daily | required | — | `{ date, rounds: [{ roundNumber, scranA, scranB, potentialPoints, roundId }] }` **no likes** |
| POST vote | required | `{ roundNumber, chosenScranId }` | correctness + pct + points (after answer OK to reveal pct) |
| POST finalize | required | `{}` or `{ date? }` | `{ hits, points }` |
| GET leaderboard | required | `?limit=&offset=` | rows |
| PATCH display-name | required | `{ name: string \| null }` | updated label |

All mutations: check `isCompetitiveEnabled()`. Rate-limit vote/finalize with existing `rateLimit` middleware pattern (`competitive-vote:${userId}`).

- [ ] **Step 1: Implement routes thin — call libs only**
- [ ] **Step 2: Manual smoke** (if server up): unauthorized → 401
- [ ] **Step 3: Lint + commit**

```bash
git commit -m "feat(competitive): user-facing API routes"
```

---

### Task 9: Admin API + cron

**Files:**
- Create: `next/app/api/admin/competitive/seasons/route.ts` — GET list, POST create
- Create: `next/app/api/admin/competitive/seasons/[id]/route.ts` — PATCH, POST end
- Create: `next/app/api/admin/competitive/pool/route.ts` — GET, POST add
- Create: `next/app/api/admin/competitive/pool/[scranId]/route.ts` — PATCH enable
- Create: `next/app/api/admin/competitive/daily/route.ts` — GET preview, POST generate
- Create: `next/app/api/admin/competitive/settings/route.ts` — GET/PATCH flag
- Create: `next/app/api/cron/competitive/route.ts` — secret-guarded like `api/cron/daily`

**Cron behaviour** (same auth header pattern as casual cron):

1. If `!isCompetitiveEnabled()` → `{ skipped: true }`
2. `transitionSeasonsByTime()`
3. `generateCompetitiveDaily(todayMskDate())` if playable season (ignore 409 already exists)

Admin generate: `requireRole("admin")` + audit log.

Preview: candidate counts per band after sync (best-effort).

- [ ] **Step 1: Mirror casual cron secret check**

Read `next/app/api/cron/daily/route.ts` and copy guard style.

- [ ] **Step 2: Implement admin + cron**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(competitive): admin APIs and generation cron"
```

---

### Task 10: Admin UI pages

**Files:**
- Create: `next/app/admin/competitive/layout.tsx` — staff/admin gate (copy scrans/announcements layout pattern)
- Create: `next/app/admin/competitive/page.tsx` — tabs or sections: Settings flag, Seasons, Pool, Daily preview/generate
- Create: `next/components/admin/competitive-panel.tsx` (and split if large)
- Modify: admin dashboard header link (same place announcements link was added)

**UI requirements:**
- Toggle competitive enabled
- Create season (name, starts/ends datetime-local, status)
- List seasons + end button
- Pool: search/add scran by id, enable/disable, show snapshot L/D and last used
- Daily: preview + generate for today

Pixel admin styling consistent with existing admin panels.

- [ ] **Step 1: Implement panel + page**
- [ ] **Step 2: Lint + commit**

```bash
git commit -m "feat(admin): competitive pool seasons and daily controls"
```

---

### Task 11: Hub page UI

**Files:**
- Create: `next/app/competitive/layout.tsx` — optional shared shell
- Create: `next/app/competitive/page.tsx` — server: `getCurrentUser()` null → `redirect("/profile")`; flag off → simple disabled message; else load hub data and render
- Create: `next/components/competitive/competitive-shell.tsx`
- Create: `next/components/competitive/season-hero.tsx`
- Create: `next/components/competitive/cta-row.tsx`
- Create: `next/components/competitive/progress-card.tsx`
- Create: `next/components/competitive/leaderboard-card.tsx`
- Create: `next/components/competitive/rules-card.tsx`
- Create: `next/components/competitive/rewards-card.tsx`
- Create: `next/components/competitive/streak-fire.tsx` — number + SVG fire + CSS glow
- Create: `next/components/competitive/competitive.css` (or module) — port **palette/structure** from prototype; do not require pixel-identical assets
- Optional assets under `next/public/competitive/` — copy portal placeholder if useful

**Product UI rules (must):**
- No login button; no “сезон не идёт” CTA
- Center: play glow **or** “Уже сыграно · N очков”
- Side slots: e.g. place `#N` and daily countdown — not fake buttons
- Leaderboard: no hits column
- Progress: место, очки сезона, дней, streak with fire
- Countdown timers client component (reuse patterns from `CountdownTimer` if helpful)

- [ ] **Step 1: Server page auth gate**

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-server";

export default async function CompetitiveHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/profile");
  // ...
}
```

- [ ] **Step 2: Build shell components from prototype structure + corrections**
- [ ] **Step 3: Wire play link to `/competitive/play`**
- [ ] **Step 4: Lint + commit**

```bash
git commit -m "feat(competitive): auth-gated hub UI shell"
```

---

### Task 12: Play page UI

**Files:**
- Create: `next/app/competitive/play/page.tsx` — auth gate; if already played redirect hub; if no daily show unavailable
- Create: `next/components/competitive/competitive-game-client.tsx`
- Create: `next/components/competitive/competitive-round.tsx` — A/B + centered `+N pts` before answer; after answer show pct + earned
- Reuse image loading patterns from `components/daily/*` where clean (import and wrap — do not couple identity/session fingerprint)

**Flow:**
1. GET daily → 10 rounds with `potentialPoints`
2. On choose → POST vote → show result overlay for round
3. After 10 → POST finalize → show day points → link back to hub

No fingerprint; only cookies session for auth.

- [ ] **Step 1: Implement client game state machine** (`loading | playing | complete | error`)
- [ ] **Step 2: +N pts pre-answer; percentages post-answer**
- [ ] **Step 3: Lint + commit**

```bash
git commit -m "feat(competitive): play flow with smart points UI"
```

---

### Task 13: Home entry + ops wiring

**Files:**
- Modify: `next/app/page.tsx` — if user logged in and competitive enabled and visible season, show link/button «Competitive» / «Рейтинг»
- Modify: `ops/cron-generate-daily.sh` **or** add `ops/cron-generate-competitive.sh` + document calling `/api/cron/competitive` with same secret
- Modify: `README.md` or `AGENTS.md` short section on competitive
- Modify: admin settings if there is a central ops panel — expose flag there too if easy

- [ ] **Step 1: Home link (logged-in only)**
- [ ] **Step 2: Cron script + README note**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(competitive): home entry and cron ops wiring"
```

---

### Task 14: Integration smoke checklist (manual)

Not a code task — run before calling v1 done:

- [ ] `make migrate` applies 0012
- [ ] Admin enables competitive flag
- [ ] Admin creates active season covering today
- [ ] Admin adds ≥20 scrans with ≥15 votes to pool
- [ ] Generate daily (admin or cron) → 10 rounds, Δ≠0, bands roughly ramp
- [ ] Logged-out `/competitive` → redirect profile
- [ ] Logged-in play once → points on hub + leaderboard
- [ ] Second play same day blocked
- [ ] Casual daily still works independently
- [ ] `bun run lint` + `bun run test:run` green

- [ ] **Step: Commit any fixes found as separate fix commits**

---

## Spec coverage checklist (self-review)

| Spec area | Task |
|-----------|------|
| Separate mode / no casual write | Tasks 1, 5, 6, Global |
| Auth-only hub/play | 11, 12, 8 |
| Admin pool ≥15 | 3, 10 |
| Freeze on rotation / sync cooldown | 3, 5 |
| Difficulty curve + no equal pct | 2, 5 |
| Reuse scrans, never same pair | 5 |
| Smart points formula + no time factor | 2, 6 |
| +N pts in round UI | 12 |
| Season month statuses + final ranks | 4, 9 |
| Live leaderboard | 7, 8, 11 |
| Display name | 7, 8 |
| Hub shell own styles | 11 |
| Missed day = 0 | 6 (no result row) |
| Feature flag | 3, 9, 13 |
| Rewards placeholder only | 11 |
| Cron generate | 9, 13 |

## Placeholder scan

No TBD steps; pure function signatures and HTTP contracts specified.

## Type consistency notes

- Date keys: always MSK `YYYY-MM-DD` strings from `todayMskDate()`.
- Points: integer; hits: integer 0..10.
- Season status string union shared in `seasons.ts` and schema enum-like text.
- `pair_key` format always `pairKey()` from `pairs.ts`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-23-competitive-daily.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans and checkpoints  

Which approach?
