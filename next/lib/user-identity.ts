export type UserRole = "player" | "moderator" | "admin";

export type IdentityTone = "admin" | "moderator" | "subscriber" | "default";

/** Visual priority: admin > moderator > SVAGA subscriber > default. */
export function resolveIdentityTone(
  role: UserRole | string | null | undefined,
  isSubscriber: boolean | null | undefined,
): IdentityTone {
  if (role === "admin") return "admin";
  if (role === "moderator") return "moderator";
  if (isSubscriber === true) return "subscriber";
  return "default";
}

export function identityBadgeSrc(tone: IdentityTone): string | null {
  if (tone === "admin") return "/red_verified_badge.svg";
  if (tone === "moderator") return "/blue_moderator_badge.svg";
  if (tone === "subscriber") return "/gold_verified_badge.svg";
  return null;
}

export function identityBadgeTitle(tone: IdentityTone): string {
  if (tone === "admin") return "Администратор";
  if (tone === "moderator") return "Модератор";
  if (tone === "subscriber") return "СВАГА+";
  return "";
}

export function identityMetaSuffix(
  role: UserRole | string | null | undefined,
  isSubscriber: boolean | null | undefined,
): string {
  if (role === "admin") return " · admin";
  if (role === "moderator") return " · moderator";
  if (isSubscriber === true) return " · СВАГА+";
  return "";
}
