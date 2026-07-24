# Competitive Polish + Anti-Copy + Twitch Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship competitive hub polish, reliable season transitions, player/admin season history, per-user competitive pair presentation (shuffle + A/B flip), Twitch login via SVAGA+ Telegram bridge, and a daily security audit — without changing casual daily or shipping rewards.

**Architecture:** Pure helpers first (countdown format, seeded presentation, transition ensure). Wire transitions into admin PATCH + competitive read/play paths. Presentation transforms DB rounds only at GET-daily time; vote hardens on `roundId`. Archive/detail use `competitive_season_final_ranks`. Twitch OAuth lives in bebebendle; identity resolution is a new SVAGA+ internal endpoint over existing `LinkedAccount`.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle, PostgreSQL, Bun, vitest; SVAGA+ Flask internal API (separate repo).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-competitive-polish-twitch-design.md`
- Base competitive: `docs/superpowers/specs/2026-07-23-competitive-daily-design.md`
- Package manager: **Bun** (`cd next && bun run lint`, `bunx vitest run …`)
- Calendar day: **Europe/Moscow** via `@/lib/daily-timezone`
- **Casual daily is frozen** — do not modify pair order, generation, or public daily mapper except if security pass finds a real leak
- **Rewards out of scope**
- Auth: competitive hub/play/archive require `getCurrentUser()`; unauthenticated → redirect `/profile`
- Admin: `requireRole("admin")`
- Feature flag: `competitive_enabled` still gates competitive surfaces
- Identity: bebebendle user remains `telegramId`-primary; Twitch is login bridge only
- Anti-copy: competitive only; seed = HMAC over `userId:date:dailyId` + env pepper
- Vote identity: prefer `roundId` + `chosenScranId`; never trust client display order
- Git: working tree may show Windows metadata noise — **stage only intentional paths**; commit only when user asks (default: implement + verify, no bulk commits of noise)
- SVAGA+ repo path (this machine): `/mnt/data/dev/Other projects/SvagaPlus Server`

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `next/components/competitive/hub-countdown.tsx` | Modify | `formatCountdown` zero-minute fix; `onExpire` once |
| `next/components/competitive/cta-row.tsx` | Modify | wire `onExpire`; pass season status to leaderboard if needed |
| `next/components/competitive/season-hero.tsx` | Modify | wire `onExpire` on season end / start timers |
| `next/components/competitive/leaderboard-card.tsx` | Modify | empty copy by season status |
| `next/components/competitive/competitive-shell.tsx` | Modify | pixel nick; previous-ended CTA; drop mini when countdown+previous |
| `next/components/competitive/competitive.css` | Modify | CTA button + pixel nick |
| `next/lib/competitive/seasons.ts` | Modify | export `ensureSeasonTransitions` alias or re-export; helpers for previous ended |
| `next/lib/competitive/hub.ts` | Modify | call ensure; `previousEndedSeason` |
| `next/lib/competitive/presentation.ts` | Create | seed PRNG, permute, flip; pure |
| `next/lib/competitive/play.ts` | Modify | vote by `roundId` (keep roundNumber fallback optional) |
| `next/app/api/competitive/daily/route.ts` | Modify | ensure transitions; apply presentation |
| `next/app/api/competitive/vote/route.ts` | Modify | accept `roundId` |
| `next/app/api/competitive/finalize/route.ts` | Modify | ensure transitions |
| `next/app/api/competitive/hub/route.ts` | Modify | ensure (if not only via hub.ts) |
| `next/app/api/admin/competitive/seasons/[id]/route.ts` | Modify | ensure after PATCH |
| `next/app/api/admin/competitive/seasons/[id]/detail/route.ts` | Create | admin ranks + dailies |
| `next/app/api/competitive/seasons/route.ts` | Create | list ended |
| `next/app/api/competitive/seasons/[id]/route.ts` | Create | ended detail + ranks |
| `next/app/competitive/seasons/page.tsx` | Create | archive list |
| `next/app/competitive/seasons/[id]/page.tsx` | Create | season results |
| `next/components/admin/competitive-panel.tsx` | Modify | «Просмотр» detail UI |
| `next/components/competitive/competitive-game-client.tsx` | Modify | send `roundId` on vote |
| `next/lib/svaga.ts` or `next/lib/svaga-twitch.ts` | Modify/Create | twitch-identity client |
| `next/app/api/auth/twitch/start/route.ts` | Create | OAuth redirect + state cookie |
| `next/app/api/auth/twitch/callback/route.ts` | Create | code exchange + session |
| `next/app/profile/page.tsx` | Modify | Twitch login button + unlinked state |
| `next/tests/lib/competitive-presentation.test.ts` | Create | pure shuffle tests |
| `next/tests/lib/hub-countdown-format.test.ts` | Create | or extend existing countdown tests |
| `next/.env.sample` / ops env examples | Modify | `COMPETITIVE_PRESENTATION_SECRET`, Twitch vars |
| **SVAGA+** `backend/routes/bebebendle_internal.py` | Modify | `twitch-identity` endpoint |
| **SVAGA+** `backend/tests/test_bebebendle_internal.py` | Modify | contract tests |

---

### Task 1: Countdown format + onExpire

**Files:**
- Modify: `next/components/competitive/hub-countdown.tsx`
- Modify: `next/components/competitive/cta-row.tsx`
- Modify: `next/components/competitive/season-hero.tsx`
- Create or modify: `next/tests/lib/competitive-countdown.test.ts` (pure `formatCountdown` export)

**Interfaces:**
- Produces: `formatCountdown(targetMs, nowMs, mode)` without `0м` when minutes are zero; `HubCountdown` props `{ onExpire?: () => void }`
- Consumes: existing `targetIso`, `mode`

- [ ] **Step 1: Write failing tests for `formatCountdown` long mode**

```ts
import { describe, it, expect } from "vitest";
import { formatCountdown } from "@/components/competitive/hub-countdown";

describe("formatCountdown long", () => {
  const now = Date.parse("2026-07-24T12:00:00.000Z");

  it("shows only seconds when under one minute", () => {
    const target = now + 42_000;
    expect(formatCountdown(target, now, "long")).toBe("42с");
  });

  it("shows minutes+seconds without leading zero-hour noise", () => {
    const target = now + (5 * 60 + 12) * 1000;
    expect(formatCountdown(target, now, "long")).toBe("5м 12с");
  });

  it("never starts with 0м", () => {
    const target = now + 9_000;
    expect(formatCountdown(target, now, "long")).not.toMatch(/^0м/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL or wrong assertion on current `0м Nс`**

```bash
cd next && bunx vitest run tests/lib/competitive-countdown.test.ts
```

- [ ] **Step 3: Fix `formatCountdown`**

In `long` mode after computing `days/hours/minutes/seconds`:

```ts
if (days > 0) return `${days}д ${hours}ч ${minutes}м`;
if (hours > 0) return `${hours}ч ${minutes}м ${seconds}с`;
if (minutes > 0) return `${minutes}м ${seconds}с`;
return `${seconds}с`;
```

- [ ] **Step 4: Add `onExpire` to `HubCountdown`**

```ts
type Props = Readonly<{
  targetIso: string | null;
  mode?: "hms" | "long";
  fallback?: string;
  className?: string;
  onExpire?: () => void;
}>;
```

In the interval tick:
- Track `expiredRef` (useRef) so callback fires once.
- If `targetIso` valid and `Date.now() >= targetMs` and not yet fired → `expiredRef.current = true; onExpire?.()`.
- Reset `expiredRef` when `targetIso` changes.

- [ ] **Step 5: Wire expire on hub**

`cta-row.tsx` and `season-hero.tsx` are server components today — they cannot call `router.refresh` directly. Options (pick one, prefer A):

**A (recommended):** thin client wrapper `HubCountdownRefresh` that renders `HubCountdown` with `onExpire={() => router.refresh()}`.

**B:** make only the countdown parent a client island.

Create `next/components/competitive/hub-countdown-refresh.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { HubCountdown } from "./hub-countdown";

export function HubCountdownRefresh(
  props: Omit<React.ComponentProps<typeof HubCountdown>, "onExpire">,
) {
  const router = useRouter();
  return (
    <HubCountdown
      {...props}
      onExpire={() => {
        router.refresh();
      }}
    />
  );
}
```

Replace season-start / season-end countdown usages that need auto-refresh with `HubCountdownRefresh`. Daily `hms` timer may also refresh at midnight if desired (same component).

- [ ] **Step 6: Re-run tests + lint path**

```bash
cd next && bunx vitest run tests/lib/competitive-countdown.test.ts && bun run lint
```

---

### Task 2: Leaderboard empty copy + pixel nick

**Files:**
- Modify: `next/components/competitive/leaderboard-card.tsx`
- Modify: `next/app/competitive/page.tsx` (pass status)
- Modify: `next/components/competitive/competitive.css`
- Modify: `next/components/competitive/competitive-shell.tsx` (font only in this task; CTA in Task 5)

**Interfaces:**
- `LeaderboardCard` props: add `seasonStatus: string | null | undefined`

- [ ] **Step 1: Empty copy**

```tsx
const emptyText =
  seasonStatus === "countdown"
    ? "Ожидаем начало сезона..."
    : "Пока никого нет — стань первым!";
```

- [ ] **Step 2: Pixel nick on competitive shell only**

In `competitive.css`:

```css
.c-profile-identity .user-nick-text {
  font-family: var(--font-pixel), monospace;
  /* keep max-width rules already present */
}
```

Do **not** change global `.user-nick-text` in `globals.css`.

- [ ] **Step 3: Manual check** — hub topbar nick uses pixel font; home menu still sans.

---

### Task 3: ensureSeasonTransitions

**Files:**
- Modify: `next/lib/competitive/seasons.ts`
- Modify: `next/lib/competitive/hub.ts`
- Modify: `next/lib/competitive/play.ts` (vote + finalize entry)
- Modify: `next/app/api/competitive/daily/route.ts`
- Modify: `next/app/api/admin/competitive/seasons/[id]/route.ts`
- Modify: `next/app/competitive/play/page.tsx` (before getPlayableSeason)

**Interfaces:**
- Produces:

```ts
export async function ensureSeasonTransitions(
  now: Date = new Date(),
): Promise<{ activated: number; ended: number }> {
  return transitionSeasonsByTime(now);
}
```

- [ ] **Step 1: Export thin alias `ensureSeasonTransitions`** (same body as `transitionSeasonsByTime` or re-export). Prefer one implementation to avoid drift.

- [ ] **Step 2: Call at start of `getHubPayload`** before `getVisibleSeason`.

- [ ] **Step 3: Call at start of `recordCompetitiveVote` and finalize path** before `getPlayableSeason`.

- [ ] **Step 4: Call in competitive daily GET** before loading today’s daily.

- [ ] **Step 5: Call in play page** after auth/feature checks, before playable season gate.

- [ ] **Step 6: After successful admin `updateSeason` in PATCH** (and POST end if separate), call `ensureSeasonTransitions()` so hot-edited `endsAt` in the past ends immediately even without waiting for a player hit.

```ts
const updated = await updateSeason(id, patch);
if (updated) {
  await ensureSeasonTransitions();
  // re-fetch if response should reflect post-transition status
  const fresh = await getSeason(id);
  ...
}
```

- [ ] **Step 7: Unit tests remain pure for `shouldEnd`/`shouldActivate`** — already exist. No DB test required if not in suite; document manual: set endsAt to past in admin → status `ended` + ranks after save.

---

### Task 4: Competitive presentation shuffle + A/B flip + vote by roundId

**Files:**
- Create: `next/lib/competitive/presentation.ts`
- Create: `next/tests/lib/competitive-presentation.test.ts`
- Modify: `next/app/api/competitive/daily/route.ts`
- Modify: `next/lib/competitive/play.ts`
- Modify: `next/app/api/competitive/vote/route.ts`
- Modify: `next/components/competitive/competitive-game-client.tsx`
- Modify: env samples for `COMPETITIVE_PRESENTATION_SECRET`

**Interfaces:**

```ts
// presentation.ts
export type CanonicalRound = Readonly<{
  id: number;
  roundNumber: number;
  scranAId: number;
  scranBId: number;
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
}>;

export type PresentedRound = Readonly<{
  displayRoundNumber: number; // 1..N for UI
  roundId: number;
  roundNumber: number; // canonical DB
  scranAId: number;
  scranBId: number;
  // likes still available server-side for potentialPoints only
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
  flipped: boolean;
}>;

export function presentationSeed(
  pepper: string,
  userId: number,
  date: string,
  dailyId: number,
): Buffer;

export function presentRounds(
  rounds: readonly CanonicalRound[],
  seed: Buffer,
): PresentedRound[];
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from "vitest";
import {
  presentRounds,
  presentationSeed,
} from "@/lib/competitive/presentation";

const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
  id: n * 10,
  roundNumber: n,
  scranAId: n * 2,
  scranBId: n * 2 + 1,
  likesA: 10,
  dislikesA: 0,
  likesB: 5,
  dislikesB: 5,
}));

describe("presentRounds", () => {
  it("is stable for same seed", () => {
    const seed = presentationSeed("pepper", 1, "2026-07-24", 99);
    const a = presentRounds(base, seed);
    const b = presentRounds(base, seed);
    expect(a.map((r) => r.roundId)).toEqual(b.map((r) => r.roundId));
    expect(a.map((r) => r.flipped)).toEqual(b.map((r) => r.flipped));
  });

  it("differs across users (usually)", () => {
    const s1 = presentationSeed("pepper", 1, "2026-07-24", 99);
    const s2 = presentationSeed("pepper", 2, "2026-07-24", 99);
    const a = presentRounds(base, s1).map((r) => r.roundId).join(",");
    const b = presentRounds(base, s2).map((r) => r.roundId).join(",");
    // Extremely unlikely equal for N=10; if flaky, assert seed buffers differ
    expect(s1.equals(s2)).toBe(false);
    expect(a === b).toBe(false);
  });

  it("preserves multiset of roundIds", () => {
    const seed = presentationSeed("pepper", 7, "2026-07-24", 1);
    const out = presentRounds(base, seed);
    expect(out.map((r) => r.roundId).sort()).toEqual(
      base.map((r) => r.id).sort(),
    );
  });

  it("flip swaps scran ids", () => {
    const seed = presentationSeed("pepper", 1, "2026-07-24", 99);
    const out = presentRounds(base, seed);
    for (const row of out) {
      const canon = base.find((c) => c.id === row.roundId)!;
      if (row.flipped) {
        expect(row.scranAId).toBe(canon.scranBId);
        expect(row.scranBId).toBe(canon.scranAId);
      } else {
        expect(row.scranAId).toBe(canon.scranAId);
      }
    }
  });
});
```

- [ ] **Step 2: Implement with `crypto.createHmac` + seeded Fisher–Yates**

Use a small mulberry32 or chacha-based PRNG from seed bytes. Pepper:

```ts
function getPepper(): string {
  return (
    process.env.COMPETITIVE_PRESENTATION_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "dev-insecure-presentation-pepper"
  );
}
```

Log once in dev if falling back. Document in `.env.sample`.

- [ ] **Step 3: Apply in daily GET after loading rounds**

Require user (already). Build presented list; map public scrans using **presented** A/B ids; compute `potentialPoints` from **presented** likes sides (same delta). Response fields:

```ts
{
  date,
  totalRounds,
  rounds: presented.map((p, i) => ({
    displayRoundNumber: i + 1,
    roundId: p.roundId,
    roundNumber: p.roundNumber, // optional legacy
    potentialPoints: ...,
    scranA: mapPublicScran(...),
    scranB: mapPublicScran(...),
  })),
}
```

Call `ensureSeasonTransitions` first (Task 3).

- [ ] **Step 4: Harden `recordCompetitiveVote`**

Accept either:

```ts
{ userId, date, roundId, chosenScranId }
// or legacy { roundNumber } during transition — prefer roundId required after client update
```

Load round by `id = roundId` and `dailyId` match for today. Ignore client A/B order.

- [ ] **Step 5: Update vote API body parsing + game client**

Client on vote:

```ts
body: JSON.stringify({
  date,
  roundId: current.roundId,
  chosenScranId,
})
```

Use `displayRoundNumber` only for UI label «раунд X/10».

- [ ] **Step 6: Tests + lint**

```bash
cd next && bunx vitest run tests/lib/competitive-presentation.test.ts tests/lib/competitive-play.test.ts
```

Update play tests if signatures change.

---

### Task 5: Player archive + hub CTA

**Files:**
- Create: `next/lib/competitive/archive.ts` (optional pure helpers)
- Create: `next/app/api/competitive/seasons/route.ts`
- Create: `next/app/api/competitive/seasons/[id]/route.ts`
- Create: `next/app/competitive/seasons/page.tsx`
- Create: `next/app/competitive/seasons/[id]/page.tsx`
- Modify: `next/lib/competitive/hub.ts` — `previousEndedSeason`
- Modify: `next/lib/competitive/seasons.ts` — `getLatestEndedSeason`, `listEndedSeasons`
- Modify: `next/components/competitive/competitive-shell.tsx`
- Modify: `next/components/competitive/competitive.css`
- Modify: `next/app/competitive/page.tsx`

**Interfaces:**

```ts
export async function listEndedSeasons(): Promise<Season[]>;
export async function getLatestEndedSeason(): Promise<Season | null>;

// hub addition
previousEndedSeason: { id: number; name: string } | null;
```

- [ ] **Step 1: Domain queries**

`listEndedSeasons`: `status = ended` order by `endsAt desc`, `id desc`.  
`getLatestEndedSeason`: limit 1.  
In `getHubPayload`: after `ensure` + `getVisibleSeason`, if `season?.status === "countdown"`, set `previousEndedSeason` from latest ended (if any).

- [ ] **Step 2: API list**

`GET /api/competitive/seasons` — auth, feature flag, return ended summaries only.

- [ ] **Step 3: API detail**

`GET /api/competitive/seasons/[id]` — auth; 404 if missing or not `ended`; load final ranks ordered by `rank` asc; include `me` if user in ranks.

- [ ] **Step 4: Pages (RSC)**

- Auth redirect like hub.
- List: cards with name, dates, link to detail; optional `themeKey` class `c-season-card--${themeKey}` with safe CSS fallback.
- Detail: table of final ranks (no hits column for players — match hub: `#`, nick, points, days); highlight me; link back.

Prefer RSC data loaders calling domain functions directly (same as hub) to avoid extra HTTP; API still useful for future client UI.

- [ ] **Step 5: Shell CTA**

Props:

```ts
previousEndedSeason?: { id: number; name: string } | null;
```

When `season?.status === "countdown" && previousEndedSeason`:

- Hide `c-season-mini`.
- Under «На главную»:

```tsx
<Link
  href={`/competitive/seasons/${previousEndedSeason.id}`}
  className="pixel-btn pixel-btn-warn px-3 py-1.5 text-xs font-bold sm:text-sm"
>
  Итоги: {previousEndedSeason.name}
</Link>
```

Add link to full archive on detail page and optionally in CTA strip later (not required).

- [ ] **Step 6: Manual** — countdown season + ended previous → button works; refresh after end via Task 1.

---

### Task 6: Admin season detail

**Files:**
- Create: `next/app/api/admin/competitive/seasons/[id]/detail/route.ts`
- Modify: `next/components/admin/competitive-panel.tsx`

**Interfaces:** Response as in spec §6.1.

- [ ] **Step 1: Admin GET detail**

`requireRole("admin")`. Join dailies for `seasonId`, rounds ordered by date/roundNumber, scrans names/images, final ranks from `competitive_season_final_ranks` (or live standings if not ended — prefer final ranks when status ended else live standings for active).

- [ ] **Step 2: Panel UI**

Button «Просмотр» → expand section or modal:

- Final/live ranks table
- Per day: round list with scran names + like% (admin only)

- [ ] **Step 3: Lint**

---

### Task 7: SVAGA+ `twitch-identity` internal endpoint

**Repo:** `/mnt/data/dev/Other projects/SvagaPlus Server`

**Files:**
- Modify: `backend/routes/bebebendle_internal.py`
- Modify: `backend/tests/test_bebebendle_internal.py`
- Confirm blueprint registration already mounts bebebendle internal prefix.

**Interfaces:** Spec §8.3.

- [ ] **Step 1: Extend tests (contract style like subscription-status)**

Cases:

- missing secret → 401
- bad body keys → 400
- unknown twitch_id → `linked: false` (if account missing) OR 404 — **prefer 200 + linked:false** only when we have no row; if you return helix-less lookup by id only, missing row ⇒ `linked: false` without username (username optional null)
- row with `telegram_user_id` → `linked: true` + fields
- row without telegram → `linked: false` + twitch username/avatar if present

- [ ] **Step 2: Implement endpoint**

```python
@bebebendle_internal_bp.post('/twitch-identity')
def twitch_identity():
    # same secret auth as subscription_status
    # body: contract_version=1, twitch_id=non-empty string
    from models import LinkedAccount
    account = LinkedAccount.query.filter_by(twitch_id=twitch_id).first()
    if not account:
        return jsonify({
            'contract_version': 1,
            'linked': False,
            'twitch_id': twitch_id,
        })
    if not account.telegram_user_id:
        return jsonify({
            'contract_version': 1,
            'linked': False,
            'twitch_id': account.twitch_id,
            'twitch_username': account.twitch_username,
            'avatar_url': account.avatar_url,
        })
    return jsonify({
        'contract_version': 1,
        'linked': True,
        'twitch_id': account.twitch_id,
        'twitch_username': account.twitch_username,
        'avatar_url': account.avatar_url,
        'telegram_user_id': int(account.telegram_user_id),
    })
```

Strict key sets per branch (mirror subscription-status discipline as much as practical).

- [ ] **Step 3: Run SVAGA tests**

```bash
cd "/mnt/data/dev/Other projects/SvagaPlus Server/backend" && uv run pytest tests/test_bebebendle_internal.py -q
```

(or project’s usual pytest entry)

---

### Task 8: Bebebendle Twitch OAuth bridge

**Files:**
- Create: `next/lib/twitch-oauth.ts` (token + helix user helpers)
- Create: `next/lib/svaga-twitch.ts` or extend `next/lib/svaga.ts` with `getTwitchIdentity(twitchId)`
- Create: `next/app/api/auth/twitch/start/route.ts`
- Create: `next/app/api/auth/twitch/callback/route.ts`
- Modify: `next/app/profile/page.tsx`
- Modify: env samples

**Interfaces:**

```ts
// svaga
export type TwitchIdentityResult =
  | {
      status: "ok";
      linked: true;
      telegramUserId: number;
      twitchId: string;
      twitchUsername: string | null;
      avatarUrl: string | null;
    }
  | {
      status: "ok";
      linked: false;
      twitchId: string;
      twitchUsername: string | null;
      avatarUrl: string | null;
    }
  | { status: "unavailable"; reason: string };
```

- [ ] **Step 1: start route**

- Rate limit by IP.
- Generate `state` (32 random bytes hex), store in httpOnly cookie `twitch_oauth_state` (ShortMaxAge 10m, SameSite=Lax, Secure in prod).
- Redirect to `https://id.twitch.tv/oauth2/authorize?client_id&redirect_uri&response_type=code&scope=&state=`.

Env: `TWITCH_CLIENT_ID`, `TWITCH_REDIRECT_URI` (exact allowlist match).

- [ ] **Step 2: callback route**

- Validate `state` vs cookie; clear cookie.
- Exchange code → access_token (server-side; never expose secret to client).
- Helix `GET /users` → `id`, `login`, `profile_image_url`.
- `getTwitchIdentity(twitchId)` → SVAGA internal.
- If unavailable → redirect profile `?twitch_error=svaga`.
- If `linked: false` → redirect profile `?twitch_error=need_telegram_link&login=...`.
- If linked: same upsert/session path as Telegram route (`users` onConflict telegramId, `createSessionManager`, `setSessionCookies`), then redirect `/profile` or `/competitive`.

Display name: prefer existing user fields; on insert use twitch login as `displayName` fallback.

- [ ] **Step 3: Profile UI**

- Button «Войти через Twitch» → `/api/auth/twitch/start` (link or location).
- If query `need_telegram_link`: explain that Twitch must be linked to Telegram in SVAGA+/bot first (short RU copy).
- Logged-in users: hide Twitch login or show «привязка уже через TG».

- [ ] **Step 4: Manual / staging test matrix**

| Case | Expect |
|------|--------|
| Twitch linked in SVAGA to TG that has bebebendle user | Session for that user |
| Twitch linked to new TG | Creates user + session |
| Twitch not linked | No session + message |
| Bad state | 400, no session |

---

### Task 9: Security pass (casual + competitive)

**Files (read/audit; modify only if leak found):**
- `next/app/api/daily/route.ts`
- `next/app/api/competitive/daily/route.ts`
- `next/lib/daily-integrity.ts` / vote routes
- `next/components/competitive/competitive-game-client.tsx`
- Tests asserting public mappers omit likes

- [ ] **Step 1: Checklist (write results into PR notes or short `docs/` snippet only if user wants — default: comment in commit message)**

Confirm:

1. Public GET daily: no `numberOfLikes` / `likesA` / etc.
2. Competitive GET: no frozen likes; only `potentialPoints`.
3. Vote reveals correctness only after that user’s vote.
4. Admin detail not reachable without admin.
5. Internal SVAGA endpoints require secret.

- [ ] **Step 2: Add regression test for public scran map** if not present:

```ts
it("mapPublicScran does not include like fields", () => {
  const keys = Object.keys(mapPublicScran(fakeScran));
  expect(keys).not.toContain("numberOfLikes");
  expect(keys).not.toContain("likesA");
});
```

(Export mapper or test via response shape helper.)

- [ ] **Step 3: Fix only confirmed leaks**

---

### Task 10: AGENTS.md touch-up (optional, small)

**Files:**
- Modify: `AGENTS.md` — bullet for season archive routes, Twitch bridge, presentation secret env, competitive cron still transitions.

Keep short; no essay.

---

## Verification gate (end of plan)

```bash
cd next && bun run lint && bunx vitest run
```

Manual smoke:

1. Countdown under 1 minute shows `Nс`; at 0 hub refreshes.
2. Admin sets endsAt past → season ended without waiting for midnight.
3. Countdown season: «Итоги: …» → final board; `/competitive/seasons` lists ended.
4. Two users: different round order / L-R; scores still fair.
5. Twitch linked / unlinked matrix.
6. Network tab: no likes on competitive/casual daily GET.

---

## Spec coverage checklist

| Spec section | Task |
|--------------|------|
| §3 Hub UX polish | 1, 2 |
| §4 Season transitions | 3 |
| §5 Archive | 5 |
| §6 Admin detail | 6 |
| §7 Anti-copy presentation | 4 |
| §8 Twitch bridge | 7, 8 |
| §9 Security | 9 |
| §1.2 out of scope rewards/casual shuffle | respected |

---

## Execution notes

- Prefer implementing Tasks 1→3→4→5→6 then Twitch 7→8, then 9.
- Windows git noise: never `git add -A`; stage explicit paths.
- Do not commit this plan or the design doc unless the user requests.
