export type CreditSocialPlatform = "twitch" | "telegram" | "twitter" | "youtube";

export type CreditPerson = Readonly<{
  name: string;
  description?: string;
  socials: readonly Readonly<{
    platform: CreditSocialPlatform;
    url: string;
  }>[];
}>;

export type CreditGroup = Readonly<{
  title: string;
  people: readonly CreditPerson[];
}>;

export const CREDIT_SOCIAL_PLATFORMS: readonly CreditSocialPlatform[] = [
  "twitch",
  "telegram",
  "twitter",
  "youtube",
];

export const CREDIT_LIMITS = {
  groups: 12,
  peoplePerGroup: 30,
  socialsPerPerson: CREDIT_SOCIAL_PLATFORMS.length,
  titleLength: 80,
  nameLength: 80,
  descriptionLength: 240,
  urlLength: 500,
} as const;

export const DEFAULT_CREDIT_GROUPS: readonly CreditGroup[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isSocialPlatform(value: unknown): value is CreditSocialPlatform {
  return CREDIT_SOCIAL_PLATFORMS.includes(value as CreditSocialPlatform);
}

function cleanUrl(value: unknown): string | null {
  const url = cleanText(value, CREDIT_LIMITS.urlLength);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** Tolerant reader for persisted settings. Strict validation lives in the admin action. */
export function normalizeCreditGroups(value: unknown): readonly CreditGroup[] {
  if (!Array.isArray(value)) return DEFAULT_CREDIT_GROUPS;

  return value.slice(0, CREDIT_LIMITS.groups).flatMap((rawGroup) => {
    if (!isRecord(rawGroup)) return [];
    const title = cleanText(rawGroup.title, CREDIT_LIMITS.titleLength);
    if (!title || !Array.isArray(rawGroup.people)) return [];

    const people = rawGroup.people
      .slice(0, CREDIT_LIMITS.peoplePerGroup)
      .flatMap((rawPerson): CreditPerson[] => {
        if (!isRecord(rawPerson)) return [];
        const name = cleanText(rawPerson.name, CREDIT_LIMITS.nameLength);
        if (!name) return [];
        const description = cleanText(
          rawPerson.description,
          CREDIT_LIMITS.descriptionLength,
        );
        const socials = Array.isArray(rawPerson.socials)
          ? rawPerson.socials
              .slice(0, CREDIT_LIMITS.socialsPerPerson)
              .flatMap((rawSocial) => {
                if (!isRecord(rawSocial) || !isSocialPlatform(rawSocial.platform)) return [];
                const url = cleanUrl(rawSocial.url);
                return url ? [{ platform: rawSocial.platform, url }] : [];
              })
          : [];

        return [{ name, ...(description ? { description } : {}), socials }];
      });

    return [{ title, people }];
  });
}
