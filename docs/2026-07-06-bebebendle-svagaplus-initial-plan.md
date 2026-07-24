# Bebebendle x Svaga+ Initial Plan

## Context

- `svagaplus-bebebendle` remains a separate open-source repository and a separate service.
- `SvagaPlus Server` remains the primary private product and the parent platform.
- There will be no repo merge and no direct code sharing that would make the open-source project depend on private Svaga+ internals.
- Public Bebebendle UX should remain close to the current behavior.

## Product Direction

### What stays the same

- Bebebendle remains a standalone public-facing game.
- Viewer flow stays familiar:
  - landing page
  - daily game
  - score/result sharing
- Telegram bot remains the main ingestion channel for new dishes.

### What changes

- Administration and moderation become easier and more explicit.
- Deployment and operations become simpler and more repeatable.
- Known missing pieces from the previous maintainer are completed.

## Current System Summary

### Bebebendle today

- `next/` contains:
  - public website
  - admin page
  - API routes
  - daily generation logic
- `bot/` contains:
  - Telegram submission flow
  - Telegram voting flow
- Shared PostgreSQL stores:
  - dishes
  - daily rounds
  - user results
  - Telegram votes
- Shared uploads directory is used for dish images.

### Svaga+ role

- Svaga+ should become the parent operational surface.
- Bebebendle should remain independently deployable.
- Integration should happen through explicit service boundaries.

## Target Architecture

### Service model

Two independent services:

1. `Bebebendle`
   - public website
   - game logic
   - Telegram bot
   - own database and assets
   - own cron/daily generation

2. `Svaga+`
   - admin and moderation control plane
   - internal tools for operators
   - optional mirror of moderation actions and content review state
   - internal integration API/client for Bebebendle

### Integration principle

- Svaga+ does not directly own Bebebendle runtime.
- Svaga+ communicates with Bebebendle through a small internal admin API.
- Bebebendle keeps enough native admin capability to function independently if needed.

## Recommended Direction

### Phase 1 recommendation

Keep Bebebendle as a standalone service and improve it first.

Reason:

- lowest migration risk
- preserves open-source separation
- allows quick operational wins
- avoids coupling game logic to private platform code too early

### Phase 2 recommendation

Expose limited internal admin endpoints from Bebebendle and let Svaga+ consume them.

Examples:

- list pending submissions
- approve submission
- reject or delete submission
- trigger daily generation
- fetch service health and moderation stats

## Planned Workstreams

## 1. Stabilize Bebebendle Core

- verify which behavior must be taken from `mc`
- preserve the newer daily generation algorithm
- remove ambiguity between stale docs and real runtime behavior
- document the actual system layout

## 2. Moderation and Admin Improvements

- review current admin flow in Next admin page
- decide final moderation model:
  - approve
  - reject
  - delete
  - optional comment/reason
- add better visibility into submission state
- make Telegram-side author notifications consistent
- define which actions stay in Bebebendle admin and which move into Svaga+

## 3. Image Handling Fix

- solve the current image serving/build problem
- goal: uploaded dish images must become visible without manual rebuild rituals
- likely direction:
  - serve uploads dynamically from runtime storage
  - stop relying on static asset assumptions for new uploads

## 4. Deployment Simplification

- make local and production startup reproducible
- reduce hidden manual steps
- separate migration, runtime startup, and cron concerns more cleanly
- document required environment variables and service dependencies

## 5. Internal Admin API

- define a minimal authenticated API from Bebebendle to Svaga+
- keep it narrow and operational
- avoid leaking public game internals unless necessary

Initial candidate endpoints:

- `GET /internal/admin/submissions`
- `POST /internal/admin/submissions/:id/approve`
- `POST /internal/admin/submissions/:id/reject`
- `POST /internal/admin/submissions/:id/delete`
- `POST /internal/admin/daily/generate`
- `GET /internal/admin/stats`

## 6. Svaga+ Integration Layer

- build a private Svaga+ module that talks to Bebebendle
- use it as the main operator interface
- keep Bebebendle’s own admin as fallback or maintenance mode

## Non-Goals For Now

- full gameplay redesign
- major frontend rewrite for viewers
- repo merge between Svaga+ and Bebebendle
- hard dependency from open-source Bebebendle onto private Svaga+ code

## Main Risks

1. `main` and `mc` behavior divergence
2. stale docs causing wrong operational assumptions
3. image pipeline still tied to static serving assumptions
4. moderation logic split between bot, Next admin, and future Svaga+ admin
5. over-integrating too early and losing repo independence

## Proposed Execution Order

1. Audit and document actual Bebebendle behavior
2. Diff `main` vs `mc` and decide what must be preserved
3. Fix image delivery model
4. Improve native Bebebendle moderation flow
5. Define and implement internal admin API
6. Add Bebebendle admin surface inside Svaga+
7. Simplify deployment and write runbooks

## Open Questions

- Should Bebebendle native admin stay fully usable long-term, or become a fallback-only console?
- Should Svaga+ store any mirrored moderation metadata, or should Bebebendle remain the only source of truth?
- Should Telegram moderation feedback become mandatory for reject/delete actions?
- Should daily generation remain cron-triggered only, or also be operable from Svaga+ manually?

## Immediate Next Step

Write a more detailed technical integration plan after:

- reviewing the `mc` branch behavior in detail
- mapping current Bebebendle admin and bot responsibilities
- deciding the first version of the internal admin API contract
