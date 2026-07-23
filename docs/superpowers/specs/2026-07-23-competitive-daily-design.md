# Competitive Daily — Design Spec

**Date:** 2026-07-23  
**Status:** Draft for implementation planning  
**Product:** Bebebendle — separate competitive mode with seasons  

**Visual references (approximate, not final):**

- Static mockup: `docs/superpowers/specs/assets/2026-07-23-competitive-hub-mockup-s1.png`
- HTML prototype (layout + palette): `docs/superpowers/specs/assets/competitive-hub-prototype/`

---

## 1. Goals

### 1.1 What we want

- A **separate competitive daily** that preserves the core daily ritual: play once per day → see result → wait for tomorrow.
- **Harder than casual** via close percentage pairs and a difficulty curve (easy → very hard within one day).
- **Fair competition** for a calendar-month season: live leaderboard, smart points, no “who finished first”.
- **Auth-only** play and hub access.
- **Admin-curated** dish pool with freeze-on-rotation / sync-on-cooldown vote snapshots.
- Ship as a **testable v1**; rewards (chat badge via Twitch / SVAGA+) and rich season theming come later, but data hooks are planned.

### 1.2 What we explicitly do not want (v1)

- Replacing or changing casual daily behaviour.
- Time-of-day or “first to finish” bonuses.
- Clans, friends, private leagues.
- Endless retries or catch-up for missed days.
- Full Twitch badge automation in v1.
- Final art polish as a blocker (placeholders OK).

### 1.3 Success criteria (v1)

1. Logged-in user can open hub, play today’s competitive daily once, receive points from frozen snapshots.
2. Missed day contributes 0; cannot be made up.
3. Live season leaderboard ranks by season points (tie-breaks without timestamps).
4. Admin can manage pool + season + generate day.
5. Casual daily, bot, and SVAGA linking remain unchanged.

---

## 2. Product rules

### 2.1 Two independent dailies

| Mode | Identity | Pool / generate | Score |
|------|----------|-----------------|-------|
| Casual (`/daily`) | session + fingerprint (optional user) | existing `daily_scrandles` | 0–10 hits, average/histogram |
| Competitive (`/competitive`) | **userId only** | admin pool + competitive tables | hits (internal) + **smart points** |

Same calendar day (MSK): user may play **both**. Results do not interact.

### 2.2 Daily ritual

- New competitive rounds each MSK day while a season is `active`.
- One finalized result per `(userId, date)`.
- Incomplete run (no finalize) counts as **no result** → **0** for that day.
- 24-hour window: any time during the MSK calendar day is equal; **no timing factor in points**.

### 2.3 Auth gate

- Unauthenticated users **cannot** open the competitive hub or play.
- Server-side: redirect to login/profile (or equivalent existing Telegram auth entry).
- No “Войти” CTA on the hub itself.

### 2.4 Missed days

- No catch-up, no bonus days, no “play yesterday”.
- Season total = sum of day points over season dates; missing date = 0.

### 2.5 Display name

- Optional `competitive_display_name` on `users` for leaderboard.
- Fallback: `@telegramUsername` → `Игрок #id`.
- Prefer **unique** case-insensitive name when set.
- Rate-limit renames (e.g. once per 24h); admin can reset abuse.

---

## 3. Competitive pool & snapshots

### 3.1 Admin allowlist (not auto-pool)

Scrans enter competitive **only** when an admin adds them.

**Add gates:**

- `approved = true`
- Original `likes + dislikes >= 15`
- Not already in pool (or re-enable if disabled)

**Fields (logical):** `scran_id`, `enabled`, `likes_snapshot`, `dislikes_snapshot`, `last_used_date`, audit timestamps/actor.

### 3.2 Freeze vs cooldown

| State | When | Snapshot behaviour |
|-------|------|--------------------|
| **In rotation** | Scran appears in **today’s** competitive rounds | **Frozen.** Round rows store immutable likes/dislikes. Scoring and UI percentages use only that freeze. |
| **Cooldown** | In pool, not in today’s rounds | Snapshot **mirrors original** `scrans` likes/dislikes (single electorate). Sync on vote mutations and/or before generate. |

**Source of truth for a played day:** `competitive_rounds` frozen columns — never live `scrans` counts after generate.

### 3.3 Pair rules

- **Reuse of scrans** across days: allowed.
- **Same unordered pair** `{minId, maxId}`: **never** again in competitive history (`pair_key` globally unique).
- Same scran **at most once per day**.
- **Equal percentages forbidden:** `pctA === pctB` after the agreed pct formula → pair rejected.
- Only `enabled` pool entries with current original votes ≥ 15 at generate time.

### 3.4 Difficulty curve (10 rounds)

| Rounds | Band | Target \|Δpct\| (percentage points) |
|--------|------|-------------------------------------|
| 1–2 | easy | 12–25 |
| 3–4 | medium | 7–12 |
| 5–7 | hard | 3–7 |
| 8–10 | very hard | 1–3 |

- Generator searches pairs in-window; if starved, **widen Δ upward** (easier), never to 0; log fallback.
- If still impossible → generate fails with clear admin/cron error (no half day).
- Constants live in one config module.

### 3.5 Generation timing

- Cron ~00:00 MSK when season is `active` and date in `[starts_at, ends_at)`.
- Also admin manual generate/preview.
- No regenerate after any result exists for that date (v1).

---

## 4. Scoring

### 4.1 Correctness

From frozen likes/dislikes only:

```text
pct = likes / (likes + dislikes)
correct = argmax(pctA, pctB)   // ties excluded by generator
isCorrect = chosen == correct
```

Client-sent score is ignored (same integrity idea as casual).

### 4.2 Points formula (v1)

```text
Δ = abs(pctA - pctB) * 100          // percentage points, Δ >= 1 by construction
multiplier = clamp(12 / max(Δ, 1), 1.0, 8.0)
roundPoints = isCorrect ? round(100 * multiplier) : 0
dayPoints = sum(roundPoints)
dayHits = count(isCorrect)          // 0..10, UX/secondary/tie-break only
```

| Example Δ | Mult | Points if correct |
|-----------|------|-------------------|
| 20 | 1.0 | 100 |
| 6 | 2.0 | 200 |
| 3 | 4.0 | 400 |
| 1 | 8.0 | 800 |

**No** streak multiplier, speed bonus, or hour-of-day factor.

### 4.3 Season aggregation

```text
seasonPoints = sum(dayPoints)
daysPlayed   = count(results)
seasonHits   = sum(dayHits)    // optional storage; not primary UI
```

**Rank order:**

1. `seasonPoints` DESC  
2. `daysPlayed` DESC  
3. `seasonHits` DESC  
4. `userId` ASC  

No `created_at` / finish time in ranking.

### 4.4 In-round UI: +N pts

- **Before answer:** centered under VS (or pair): `+N pts` where `N` is potential `roundPoints` from frozen Δ (does not reveal winner).
- **After answer:** percentages on each scran + earned `+N` or `+0`.
- Hub / “already played” show **points only** (“N очков”), not hits.

---

## 5. Seasons

### 5.1 Length & statuses

- Default length: **calendar month**, Europe/Moscow.
- Interval: half-open `[starts_at, ends_at)` in app logic.

| Status | Play | Leaderboard | Hub |
|--------|------|-------------|-----|
| `draft` | no | admin only | hidden / admin |
| `countdown` | no | optional | timer until start (v1: basic) |
| `active` | yes | live | full |
| `ended` | no | frozen snapshot | results / “ended” |

Ops invariant: at most one `active` season (and preferably one `countdown`).

### 5.2 Lifecycle hooks

- Transition `countdown → active` and `active → ended` by schedule (cron) and/or admin.
- On `ended`: write `competitive_season_final_ranks` for future rewards.
- v1: no automatic badge grant.

### 5.3 Future season UX (out of v1 implementation, schema-ready)

- Rich countdown page.
- Per-season visual theme (`theme_key` / `theme_config`) applied to competitive shell only.

---

## 6. Hub UX & visual system

### 6.1 Route

- `/competitive` — hub (auth required).
- Play route: `/competitive/play` (or hub-driven client state); auth required.

### 6.2 Layout (from prototype, with product corrections)

**Keep structure/mood from prototype:**

- End / purple “obsidian” shell, distinct from home.
- Top: profile chip | COMPETITIVE title | exit + home + season mini-status.
- Season hero: art | title + ACTIVE + dates | season countdown + daily countdown.
- Dashboard: progress | leaderboard | rules + rewards.
- Footer: short site blurb + daily countdown optional.

**Product corrections vs prototype HTML:**

| Prototype | Target |
|-----------|--------|
| CTA “Войти” | Remove; auth gate before page |
| CTA “Сезон не идёт” | Remove from CTA strip |
| Four-button CTA row | **Center:** play / already played; **sides:** secondary info slots (e.g. mini rank, daily countdown), not fake CTAs |
| `8 hits • 126 pts` | **“N очков”** only |
| Streak as circles | Number + fire SVG + glow (UI only, no points) |
| Leaderboard `Σ hits` column | Omit from public UI v1 |
| Labels | Prefer Russian user-facing copy |
| Assets | Placeholder OK; final icons/bg/rewards later |

### 6.3 Styling approach

- **Dedicated competitive visual system** (own components/styles under `components/competitive/`, `app/competitive/`).
- Reuse selectively: auth, image CDN, some game board primitives if useful.
- Do **not** force home splash/background as the competitive base.
- Prototype CSS is a **reference**, not a mandatory 1:1 port; implement cleanly in React (Tailwind and/or scoped CSS).
- Season 1 mood: End / purple void; final art replaced later.

### 6.4 Hub states (center)

| State | Center content |
|-------|----------------|
| Active + not played + daily exists | Glowing **«Играть сегодня»** |
| Active + played | **«Уже сыграно · N очков»** |
| Active + no daily generated | Neutral status (no fake play) |
| Countdown | “Сезон начнётся …” |
| Ended | “Сезон завершён” + final standing teaser |

### 6.5 Leaderboard

- Live top (e.g. 50) + highlight current user row (even if outside top).
- Columns: `#`, nick, points, days played.
- Link/scroll to self if needed.

### 6.6 Rewards block

- Placeholder copy: badge in chat (Twitch / SVAGA+) — soon.
- Visual will change; integration is phase 2.

### 6.7 Entry from main site

- Optional link/button on home for logged-in users to `/competitive` (implementation detail in plan).
- Logged-out users hitting the link hit auth first.

---

## 7. Data model

### 7.1 Tables

```text
competitive_pool_entries
  id serial PK
  scran_id int UNIQUE NOT NULL → scrans
  enabled bool NOT NULL default true
  likes_snapshot int NOT NULL
  dislikes_snapshot int NOT NULL
  last_used_date text null
  added_by_user_id int null → users
  created_at, updated_at

competitive_seasons
  id serial PK
  name text NOT NULL
  starts_at timestamptz NOT NULL
  ends_at timestamptz NOT NULL
  status text NOT NULL  -- draft | countdown | active | ended
  theme_key text null
  theme_config jsonb null
  created_at, updated_at

competitive_dailies
  id serial PK
  date text NOT NULL UNIQUE  -- YYYY-MM-DD MSK
  season_id int NOT NULL → competitive_seasons
  created_at

competitive_rounds
  id serial PK
  daily_id int NOT NULL → competitive_dailies
  round_number int NOT NULL  -- 1..10
  scran_a_id int NOT NULL
  scran_b_id int NOT NULL
  likes_a int NOT NULL
  dislikes_a int NOT NULL
  likes_b int NOT NULL
  dislikes_b int NOT NULL
  pair_key text NOT NULL UNIQUE  -- "min:max"
  UNIQUE (daily_id, round_number)

competitive_votes
  id serial PK
  round_id int NOT NULL → competitive_rounds
  user_id int NOT NULL → users
  chosen_scran_id int NOT NULL
  created_at
  UNIQUE (user_id, round_id)

competitive_results
  id serial PK
  user_id int NOT NULL → users
  date text NOT NULL
  season_id int NOT NULL → competitive_seasons
  hits int NOT NULL
  points int NOT NULL
  created_at
  UNIQUE (user_id, date)

competitive_standings
  season_id int NOT NULL
  user_id int NOT NULL
  points int NOT NULL default 0
  days_played int NOT NULL default 0
  hits int NOT NULL default 0
  updated_at
  PRIMARY KEY (season_id, user_id)

competitive_season_final_ranks
  season_id int NOT NULL
  user_id int NOT NULL
  rank int NOT NULL
  points int NOT NULL
  days_played int NOT NULL
  hits int NOT NULL
  display_name_snapshot text
  PRIMARY KEY (season_id, user_id)
  UNIQUE (season_id, rank)
```

### 7.2 Users columns

```text
users.competitive_display_name text null
  -- unique index on lower(competitive_display_name) WHERE NOT NULL
users.competitive_display_name_updated_at timestamptz null
```

### 7.3 Isolation from casual

Do **not** write competitive pairs into `daily_scrandles` or results into `daily_user_results`. Competitive is a separate bounded context (`lib/competitive/*`, own APIs).

---

## 8. API surface (sketch)

### 8.1 User

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/competitive/hub` | season, me, CTA state, top board, progress |
| GET | `/api/competitive/daily` | today’s rounds; no likes; include `potentialPoints` |
| POST | `/api/competitive/vote` | auth; roundNumber, chosenScranId |
| POST | `/api/competitive/finalize` | compute hits/points from votes+frozen; upsert standing |
| GET | `/api/competitive/leaderboard` | seasonId, pagination |
| PATCH | `/api/competitive/display-name` | set/clear; rate limit |

Public round payload must not leak likes before answer; `potentialPoints` is allowed.

### 8.2 Admin

| Area | Capabilities |
|------|----------------|
| Seasons | CRUD, status transitions, dates, name, theme fields |
| Pool | list, add, enable/disable |
| Daily | preview candidate bands, generate |
| Moderation | reset display name |

### 8.3 Cron

- Generate competitive daily at MSK midnight when applicable.
- Season status transitions by `starts_at` / `ends_at`.
- Optional pool sync pass.

### 8.4 Feature flag

- `competitive_enabled` (app_settings or env) to hide routes/cron safely.

---

## 9. Integrity & anti-abuse (v1)

- Auth required for all competitive mutations and hub.
- Server loads pairs from DB; client A/B ids not trusted for correctness.
- Score computed only from stored votes + frozen round stats.
- One result per user per date.
- Rate limits on vote/finalize/display-name (reuse existing middleware patterns).
- Deeper multi-account defense: later.

---

## 10. Rewards integration (phase 2 seam)

On season `ended`:

1. Persist `competitive_season_final_ranks` (rank, points, display name snapshot).
2. Later: resolve user → SVAGA+ → Twitch id → grant chat badge.

v1 does not call Twitch or SVAGA+ reward APIs.

---

## 11. Testing (minimum)

- Unit: points formula, pair_key, difficulty windows, reject Δ=0.
- Unit: finalize ignores client score and live likes.
- Integration: one result per user/day; standing sort order.
- Pool: freeze during rotation day; cooldown sync mirrors original.
- Auth: unauthenticated hub/play denied.

---

## 12. Delivery boundaries

### 12.1 v1 in scope

- Schema + migrations  
- Admin pool + seasons + generate  
- Freeze / cooldown snapshot rules  
- Play flow + smart points + +N UI  
- Hub shell (prototype-inspired, product-corrected)  
- Live leaderboard + display name  
- Final ranks on season end  
- Feature flag  
- Docs/runbook notes as needed  

### 12.2 Explicitly later

- Twitch / SVAGA+ badge grant  
- Polished countdown + per-season themes  
- Final icons, background, reward art  
- Streak point bonuses, friends/clans  
- Soft profanity filter on nicks  
- Minimum rest days between scran reuses  
- Separate competitive-only electorate (not mirror of original)  

---

## 13. Risks

| Risk | Mitigation |
|------|------------|
| Small pool / hard windows | Admin preview; widen Δ fallback; 15 vote floor |
| Generate failure on empty day | Clear ops error; flag in admin |
| Multi-accounts | Auth-only; later hardening |
| UI spoiler via +N | Acceptable; does not reveal correct side |
| Prototype ≠ final art | Treat as layout/mood only |
| Casual pool exhaustion | Competitive reuses; does not burn casual unused rule |

---

## 14. Open implementation choices (plan may pick)

These do not change product intent:

1. Server Actions vs Route Handlers for vote/finalize (prefer consistency with casual or clear split).
2. Standings table updated on finalize vs pure SQL aggregate for small N (standings table recommended).
3. Exact side-slot content on CTA row (decorative vs mini-stats).
4. Home entry point copy/placement.

---

## 15. Summary for implementers

Competitive is a **second daily** with:

- admin pool,  
- frozen per-day pair stats,  
- close-pair difficulty ramp,  
- smart points without timing,  
- monthly seasons + live board,  
- auth-only hub with its **own End-themed shell**,  

Casual remains the chill daily; competitive is the ranked ritual.
