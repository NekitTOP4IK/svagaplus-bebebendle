/**
 * Competitive hub pixel icons (public/competitive/icons).
 * Swords map leaderboard place → play-button icon.
 */

export const COMPETITIVE_ICONS = {
  logos: {
    /** Mode wordmark: БЕБЕБЕНДЛ + COMPETITIVE */
    competitive: "/competitive/icons/bebebendle_competitive.webp",
    /** Season 1 wordmark: БЕБЕБЕНДЛ + 1СЕЗОН */
    season1: "/competitive/icons/bebebendle_s1.webp",
  },
  /** Full-page hub background (light blur applied in CSS). */
  background: "/competitive/competitive_background.webp",
  clock: "/competitive/icons/clock_00.png",
  /** Daily rotation timer (cake) — not the inverted clock. */
  cake: "/competitive/icons/cake.webp",
  pearl: "/competitive/icons/ender_pearl.png",
  books: {
    /** Competitive mode rules (animated). */
    enchanted: "/competitive/icons/enchanted_book.gif",
    /** Season rules. */
    writable: "/competitive/icons/writable_book.png",
  },
  swords: {
    copper: "/competitive/icons/copper_sword.png",
    iron: "/competitive/icons/iron_sword.png",
    golden: "/competitive/icons/golden_sword.png",
    diamond: "/competitive/icons/diamond_sword.png",
    netherite: "/competitive/icons/netherite_sword.png",
  },
} as const;

export type CompetitiveSwordTier =
  | "copper"
  | "iron"
  | "golden"
  | "diamond"
  | "netherite";

/**
 * Play-button sword by current season place (1 = best).
 * Unranked → iron (default challenger blade).
 */
export function swordTierForPlace(place: number | null | undefined): CompetitiveSwordTier {
  if (place == null || place < 1) return "iron";
  if (place === 1) return "netherite";
  if (place <= 3) return "diamond";
  if (place <= 10) return "golden";
  if (place <= 50) return "iron";
  return "copper";
}

export function swordSrcForPlace(place: number | null | undefined): string {
  return COMPETITIVE_ICONS.swords[swordTierForPlace(place)];
}
