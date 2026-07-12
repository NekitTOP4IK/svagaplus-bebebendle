import type { Scran } from "@/types/scran";

/**
 * Extended scran shape for queue computation and display.
 * Includes subscriber snapshot and author linkage info (from join or fallback).
 */
export interface ScranWithMeta extends Scran {
  telegramId?: string | null;
  submittedByUserId?: number | null;
  isSubscriberAtSubmit?: boolean | null;
  /** Joined or derived author info for display */
  authorUsername?: string | null;
  authorDisplayName?: string | null;
  /** Computed for this scran's submitter (total pending by them) */
  pendingCount?: number;
}

/**
 * Compute a priority score for ordering within subscriber or regular buckets.
 *
 * Formula (per design spec):
 *   score = (is_subscriber_at_submit ? 1200 : 0) +
 *           (waiting_hours * 8) -
 *           (Math.min(pending_count - 1, 6) * 35)
 *
 * Higher score = earlier in queue (within group).
 */
export function computeQueueScore(
  scran: ScranWithMeta,
  pendingCount: number,
  hoursWaiting: number
): number {
  const subscriberBonus = (scran.isSubscriberAtSubmit ?? false) ? 1200 : 0;
  const waitScore = (hoursWaiting || 0) * 8;
  const floodPenalty = Math.min(Math.max((pendingCount || 0) - 1, 0), 6) * 35;
  return subscriberBonus + waitScore - floodPenalty;
}

/**
 * Merge pre-sorted subscriber and regular lists using 3:1 interleaving for fairness.
 *
 * - Emit up to 3 subscriber scrans
 * - Then 1 regular scran (if any)
 * - Repeat until both lists exhausted
 *
 * Input lists should already be sorted by descending score (highest first).
 * Preserves relative order for equal-score items.
 */
export function interleaveQueue(
  subscriberScrans: ScranWithMeta[],
  regularScrans: ScranWithMeta[]
): ScranWithMeta[] {
  const result: ScranWithMeta[] = [];
  let subIndex = 0;
  let regIndex = 0;

  while (subIndex < subscriberScrans.length || regIndex < regularScrans.length) {
    // Up to 3 subscribers
    for (let i = 0; i < 3 && subIndex < subscriberScrans.length; i++) {
      result.push(subscriberScrans[subIndex++]);
    }
    // Then 1 regular
    if (regIndex < regularScrans.length) {
      result.push(regularScrans[regIndex++]);
    }
  }

  return result;
}

/**
 * Helper to derive a stable author key for grouping pending counts.
 * Prefers submittedByUserId when present (logged-in submitter), falls back to telegramId.
 */
export function getAuthorKey(scran: ScranWithMeta): string {
  if (scran.submittedByUserId != null) {
    return `u:${scran.submittedByUserId}`;
  }
  if (scran.telegramId) {
    return `t:${scran.telegramId}`;
  }
  return "anon";
}

/**
 * Hard cap enforcement helper: max 6 pending per user.
 *
 * SHOULD be called at INSERT time (in bot suggestion path and any web submit)
 * before creating a new pending scran for a (logged-in or telegram) user.
 * We surface warnings in queue UI for any that slipped through (legacy data etc).
 */
export function canUserSubmitMore(pendingCountForUser: number): boolean {
  return (pendingCountForUser ?? 0) < 6;
}
