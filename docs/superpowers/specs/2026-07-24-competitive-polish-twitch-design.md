# Competitive Polish + Anti-Copy Shuffle + Twitch Auth Bridge

**Date:** 2026-07-24  
**Status:** Approved for implementation planning  
**Product:** Bebebendle competitive hub polish, season archive, competitive anti-copy presentation, Twitch login via SVAGA+ identity bridge  
**Related:** `2026-07-23-competitive-daily-design.md` (base competitive mode)

---

## 1. Goals

### 1.1 In scope

1. **Hub UX polish** — countdown formatting, pixel nick on competitive topbar, empty leaderboard copy, silent refresh when countdown hits zero.
2. **Season time correctness** — hot-edit of `endsAt` / `startsAt` must close/open seasons without waiting for midnight cron alone.
3. **Ended season visibility** — players can open stats for a finished season while countdown to the next is active; light archive of all ended seasons.
4. **Admin season inspect** — view final ranks and daily rounds (scran pairs) for any season, including ended.
5. **Competitive anti-copy** — per-user round order shuffle + A/B flip on delivery (casual daily untouched).
6. **Twitch login bridge** — “Sign in with Twitch” that resolves to the same bebebendle user via SVAGA+ `LinkedAccount` (Telegram remains primary identity).
7. **Security pass** — verify casual + competitive daily cannot leak correct answers via Network tab; fix real leaks only.

### 1.2 Explicitly out of scope

- Competitive **rewards** automation (Twitch/SVAGA badges) — later.
- Heavy season theming / art beyond light `themeKey` card accents.
- Changing **casual** daily pairing, order, or scoring.
- Twitch-only accounts in bebebendle (no Telegram ever).
- Merging two existing bebebendle users.
- Global pixel font on all `UserIdentity` surfaces (home/profile stay sans for nick readability).

### 1.3 Success criteria

1. Season end/start countdowns never show `0м Nс`; at zero the hub refreshes without F5.
2. Admin moves `endsAt` into the past → season ends (snapshot ranks) on save and/or next competitive API hit.
3. During next-season countdown, player can open previous season final leaderboard from hub + full archive list.
4. Admin can inspect ended season ranks and rounds.
5. Two players loading competitive daily the same day get the **same 10 pairs**, different presentation order and L/R orientation.
6. Twitch OAuth login succeeds iff SVAGA has `twitch_id → telegram_user_id`; session matches Telegram-login user for that TG id.
7. Public daily APIs do not expose likes/dislikes or other pre-answer spoilers beyond documented trade-offs.

---

## 2. Decisions (from brainstorming)

| Topic | Choice |
|-------|--------|
| Ended season UX | **B** — topbar CTA for last ended + `/competitive/seasons` archive |
| Timer at zero | **A** — silent `router.refresh()` / refetch, no banner |
| Season transitions | **B** — on admin PATCH + lazy on competitive read paths; cron remains backup |
| Twitch auth | **A** — bridge via SVAGA+ LinkedAccount; bebebendle user still keyed by `telegramId` |
| Anti-copy | Competitive only: **round permutation + A/B flip**; casual untouched |
| Difficulty curve | Intentionally diluted for the player after shuffle; generation still stores easy→hard in DB |
| Rewards | Later |

---

## 3. Hub UX polish

### 3.1 Countdown format (`HubCountdown` / `formatCountdown`)

Mode `long`:

- `days > 0` → `Nd Nh Nm` (unchanged; seconds optional as today).
- `hours > 0` → `Nh Nm Ns`.
- `minutes > 0` → `Nm Ns`.
- else → **`Ns` only** (no `0м`).

Mode `hms` unchanged (`HH:MM:SS`).

### 3.2 Expire → silent refresh

- `HubCountdown` accepts optional `onExpire?: () => void`.
- Fire **once** when remaining crosses from `> 0` to `≤ 0` (not every tick while zero).
- Hub / countdown CTA wires `onExpire` → `router.refresh()` (App Router RSC re-fetch).
- No toast, no fullscreen overlay.

### 3.3 Competitive topbar nick font

- Scope: competitive shell profile block (`.c-profile-identity` / auth chip).
- Nick text uses `font-family: var(--font-pixel), monospace`.
- Glow + role badges unchanged.
- Do **not** change global `.user-nick-text` sans choice used on home/profile (case readability).

### 3.4 Empty leaderboard copy

`LeaderboardCard` receives season status (or equivalent):

| Condition | Empty text |
|-----------|------------|
| `status === "countdown"` | `Ожидаем начало сезона...` |
| otherwise (active/ended/none) | `Пока никого нет — стань первым!` |

### 3.5 Topbar season mini vs archive CTA

When visible season is `countdown` **and** a previous `ended` season exists:

- Remove secondary `c-season-mini` window (redundant with hero).
- Under «На главную», place button **«Итоги: {endedSeasonName}»** (warn/amber/gold pixel style) → `/competitive/seasons/{id}`.

When not in that state, keep current mini status as appropriate (or simplify later if redundant).

---

## 4. Season transitions

### 4.1 Helper

```ts
// conceptual
async function ensureSeasonTransitions(now = new Date()) {
  return transitionSeasonsByTime(now);
}
```

Existing `transitionSeasonsByTime` already:

1. Ends overdue `active` (via `endSeason` + final ranks).
2. Activates due `countdown`.
3. Ends again if an activated season is already past `endsAt`.

### 4.2 Call sites

1. **Admin** `PATCH` / update season — after successful write of times/status (especially if `endsAt`/`startsAt` changed).
2. **Lazy read paths** (before answering): hub payload, competitive daily GET, vote, finalize, play page season gate (and any other path that uses `getPlayableSeason` / `getVisibleSeason` for player truth).
3. **Cron** `GET /api/cron/competitive` — keep as safety net (midnight MSK ops).

### 4.3 Guarantees

- Idempotent: repeated calls safe.
- Single-active invariant preserved (`assertSingleActive`).
- Play after end: `getPlayableSeason` returns null; vote/finalize reject.

---

## 5. Season archive (player)

### 5.1 Routes (auth-only; same gate as hub → redirect `/profile` if logged out)

| Route | Purpose |
|-------|---------|
| `/competitive/seasons` | List all `ended` seasons (newest `endsAt` first) |
| `/competitive/seasons/[id]` | Final standings for one ended season |

### 5.2 Data

- Source of truth for results: `competitive_season_final_ranks` (frozen at `endSeason`).
- Season meta: `competitive_seasons` (`name`, `startsAt`, `endsAt`, `themeKey`, `themeConfig`, `status`).
- Non-ended id → 404 or redirect to hub (prefer 404 for unknown, redirect if active/countdown “not history yet”).

### 5.3 Detail page UI

- Season title, date range, status badge «Завершён».
- Full final leaderboard (or top N + “you” row if outside; at least top 50 + me).
- Me block: place, points, daysPlayed from snapshot.
- Nav: «← К хабу», «Архив сезонов».

### 5.4 Archive list UI

- Cards/buttons lightly styled by `themeKey` if present (CSS accent only; no heavy art requirement).
- Name + date range + optional “твоё место” if user has a final rank row.

### 5.5 API (optional if pages are pure RSC; prefer small JSON for consistency)

- `GET /api/competitive/seasons` — `{ seasons: [...] }` ended only.
- `GET /api/competitive/seasons/[id]` — summary + ranks + `me`.

Auth required. Feature flag: if competitive disabled, same as hub (disabled message / 403).

### 5.6 Hub payload additions

Extend hub (or parallel query on page) with:

- `previousEndedSeason: { id, name } | null` when visible is countdown and an ended season exists.

Used only for topbar CTA.

---

## 6. Admin season detail

### 6.1 Endpoint

`GET /api/admin/competitive/seasons/[id]/detail` — admin only.

Response sketch:

```json
{
  "season": { "id", "name", "status", "startsAt", "endsAt", "themeKey" },
  "finalRanks": [{ "rank", "userId", "displayNameSnapshot", "points", "daysPlayed", "hits" }],
  "dailies": [
    {
      "date",
      "rounds": [
        {
          "roundNumber",
          "scranA": { "id", "name", "imageUrl" },
          "scranB": { "id", "name", "imageUrl" },
          "likesA", "dislikesA", "likesB", "dislikesB"
        }
      ]
    }
  ]
}
```

Frozen likes visible **only** in admin (not public player APIs).

### 6.2 UI

In `competitive-panel` season list: button **«Просмотр»** (all statuses useful; required for `ended`) opens panel/modal/section with ranks + per-day rounds.

---

## 7. Competitive anti-copy presentation

### 7.1 Principle

- **Generation** unchanged: DB stores rounds 1..N with difficulty bands (easy → hard).
- **Presentation** per player: reorder rounds + flip A/B so shared “round 3 = left” spoilers fail.

### 7.2 Seed

Deterministic:

```
seed = HMAC-SHA256(pepper, `${userId}:${date}:${dailyId}`)
```

- `pepper` from env e.g. `COMPETITIVE_PRESENTATION_SECRET` (fallback: existing app secret if documented; prefer dedicated).
- Same user + same day + same daily → stable order across reloads.
- Different users → independent permutations.

### 7.3 Algorithm (pure, unit-tested)

1. Load N frozen rounds from DB ordered by `roundNumber`.
2. Derive permutation of indices from seed (Fisher–Yates with seeded PRNG).
3. For each presented slot, optionally swap A↔B (and likes/dislikes sides) from seed bits.
4. Emit client payload:

```ts
{
  date,
  totalRounds,
  rounds: [{
    // presentation order 1..N for UI only
    displayRoundNumber: number,
    roundId: number,          // DB competitive_rounds.id — vote identity
    roundNumber: number,      // canonical DB round number (optional; prefer vote by roundId)
    potentialPoints: number,
    scranA: PublicScran,
    scranB: PublicScran,
    // no likes/dislikes
  }]
}
```

### 7.4 Vote / finalize integrity

- Prefer **`roundId` + `chosenScranId`** as vote keys (harden if currently only `roundNumber`).
- Server ignores client display order and A/B placement.
- Correctness always from frozen DB likes on that `roundId`.
- Reject choices not in `{scranAId, scranBId}` of that row.

### 7.5 Trade-offs (accepted)

- Player-facing difficulty curve is no longer monotonic easy→hard.
- Global pair set remains fair (everyone plays the same 10 pairs).
- `potentialPoints` on GET still leaks relative hardness of the *shown* pair order — acceptable known trade-off (needed for UI).

### 7.6 Casual

No changes to `/api/daily`, generation, or presentation.

---

## 8. Twitch auth bridge (SVAGA+)

### 8.1 Identity rule

- Bebebendle `users.telegram_id` remains **required primary key** for accounts.
- Twitch is an **alternate login path** that must resolve to a Telegram id via SVAGA+.
- No Twitch-only bebebendle user in this iteration.

### 8.2 SVAGA+ existing pieces

| Piece | Role |
|-------|------|
| `LinkedAccount` | `twitch_id` ↔ optional `telegram_user_id` |
| Bot `viewer_link` | Creates/updates TG↔Twitch link |
| `POST /api/twitch/viewer` | Viewer Twitch OAuth → JWT; may return `telegram_linked: false` |

### 8.3 New SVAGA+ internal endpoint (bebebendle-facing)

Example:

`POST /api/internal/bebebendle/twitch-identity`  
Header: `X-Internal-Secret` (same family as subscription-status).

**Request:**

```json
{
  "contract_version": 1,
  "twitch_id": "123456789"
}
```

**Response (linked):**

```json
{
  "contract_version": 1,
  "linked": true,
  "twitch_id": "123456789",
  "twitch_username": "login",
  "avatar_url": "https://...",
  "telegram_user_id": 987654321
}
```

**Response (not linked):**

```json
{
  "contract_version": 1,
  "linked": false,
  "twitch_id": "123456789",
  "twitch_username": "login",
  "avatar_url": "https://..."
}
```

Rules:

- Strict body keys; positive integer telegram id when linked.
- Never return OAuth tokens.
- Lookup by `LinkedAccount.twitch_id` only.

### 8.4 Bebebendle OAuth flow

1. Profile: **«Войти через Twitch»**.
2. Redirect to Twitch authorize (allowlisted redirect → bebebendle callback).
3. Callback exchanges `code` for Twitch user (`id`, `login`, avatar) — either direct Helix from bebebendle or delegated exchange via SVAGA viewer endpoint with careful secret handling; **prefer bebebendle owns redirect + code exchange** then internal lookup only (clearer trust boundary).
4. Call SVAGA internal `twitch-identity`.
5. If `linked: true`:
   - Upsert/login bebebendle user by `telegram_user_id` (same session issuance as Telegram widget login).
   - Optionally refresh display fields from Twitch avatar if TG photo missing (product choice: do not overwrite TG identity fields aggressively).
6. If `linked: false`:
   - Show UI: Twitch recognized but not linked to Telegram in SVAGA+; instruct to link via bot/extension; no session created (or ephemeral “pending” without competitive access — prefer **no session**).

### 8.5 Env / config (bebebendle)

- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_REDIRECT_URI` (or document reuse of SVAGA authorize-url if proxying).
- Existing `SVAGAPLUS_INTERNAL_URL`, `SVAGAPLUS_INTERNAL_SECRET`.
- Twitch redirect allowlist on Twitch console + server validation.

### 8.6 Security

- CSRF: OAuth `state` bound to httpOnly cookie / session.
- Rate-limit callback and internal calls.
- Auth date / token errors → generic messages.

### 8.7 Out of scope for this bridge

- Rewards / badge grant after login.
- Auto-creating SVAGA LinkedAccount from bebebendle.
- Unlinking Twitch from bebebendle UI (SVAGA remains SoT for link).

---

## 9. Daily security pass

### 9.1 Checklist

| Surface | Requirement |
|---------|-------------|
| `GET /api/daily` | No likes/dislikes; no correct side |
| `GET /api/competitive/daily` | No likes/dislikes; presentation shuffle applied; `potentialPoints` allowed (documented leak of difficulty, not of which side wins) |
| Vote responses | `isCorrect` / % only **after** that user’s vote for the round |
| Finalize / results | No bulk dump of unanswered rounds’ answers to other clients |
| Admin competitive detail | Admin-only; may show frozen likes |
| Internal SVAGA | Secret + strict schema |

### 9.2 Actions

- Audit competitive game client + vote/finalize routes during implementation.
- Fix only confirmed spoilers.
- Add/adjust unit tests for “public scran mapper never includes vote counts”.

---

## 10. Implementation order

1. Countdown format + `onExpire` refresh + empty leaderboard text + competitive pixel nick.
2. `ensureSeasonTransitions` on admin update + competitive read/play paths.
3. Competitive presentation shuffle + A/B flip + vote identity hardening + tests.
4. Player archive pages + hub previous-ended CTA + APIs.
5. Admin season detail endpoint + panel UI.
6. SVAGA internal `twitch-identity` + bebebendle Twitch OAuth + profile UI.
7. Security checklist verification + residual fixes.

---

## 11. Testing notes

- Pure: `formatCountdown` edge cases (`0s`, `1м 0с`, `0м` must not appear as minutes-only zero).
- Pure: seeded permutation stable for same seed; different users differ; flip toggles A/B.
- Seasons: `shouldEnd` after PATCH `endsAt` in past; `ensureSeasonTransitions` ends + snapshot.
- API: public competitive daily has no likes fields; vote by `roundId` with flipped presentation still scores correctly.
- Twitch: linked → session; unlinked → no session + `needsTelegramLink`.
- Auth gates on archive routes.

---

## 12. Files likely touched (indicative)

**Bebebendle**

- `next/components/competitive/hub-countdown.tsx`, `cta-row.tsx`, `season-hero.tsx`, `leaderboard-card.tsx`, `competitive-shell.tsx`, `competitive.css`
- `next/lib/competitive/seasons.ts`, `hub.ts`, `play.ts`, new `presentation.ts` (seed shuffle)
- `next/app/competitive/page.tsx`, new `seasons/` pages
- `next/app/api/competitive/*`, admin seasons detail
- `next/app/api/auth/twitch/*`, `next/lib/svaga.ts` (or sibling), profile UI
- Tests under `next/tests/lib/`

**SVAGA+ Server** (separate repo)

- `backend/routes/bebebendle_internal.py` (+ tests) for `twitch-identity`

---

## 13. Non-goals reminder

Rewards, casual shuffle, Twitch-only users, design-doc git commit policy for this workstream is left to the operator (do not assume commit of this file).
