export type UserRole = "player" | "streamer" | "moderator" | "admin";

export type IdentityTone = "admin" | "moderator" | "streamer" | "subscriber" | "default";

/** Visual priority: admin > moderator > streamer > SVAGA subscriber > default. */
export function resolveIdentityTone(
  role: UserRole | string | null | undefined,
  isSubscriber: boolean | null | undefined,
): IdentityTone {
  if (role === "admin") return "admin";
  if (role === "moderator") return "moderator";
  if (role === "streamer") return "streamer";
  if (isSubscriber === true) return "subscriber";
  return "default";
}

export function identityBadgeSrc(tone: IdentityTone): string | null {
  if (tone === "admin") return "/red_verified_badge.svg";
  if (tone === "moderator") return "/blue_moderator_badge.svg";
  if (tone === "streamer") return "/streamer-badge.svg";
  if (tone === "subscriber") return "/gold_verified_badge.svg";
  return null;
}

export function identityBadgeTitle(tone: IdentityTone): string {
  if (tone === "admin") return "Администратор";
  if (tone === "moderator") return "Модератор";
  if (tone === "streamer") return "Стример";
  if (tone === "subscriber") return "СВАГА+";
  return "";
}

/** Single tone label for meta line (never duplicate role already in meta). */
export function identityMetaSuffix(
  role: UserRole | string | null | undefined,
  isSubscriber: boolean | null | undefined,
): string {
  if (role === "admin") return " · admin";
  if (role === "moderator") return " · moderator";
  if (role === "streamer") return " · streamer";
  if (isSubscriber === true) return " · СВАГА+";
  if (role === "player") return "";
  return "";
}
