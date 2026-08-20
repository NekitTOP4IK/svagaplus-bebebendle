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

/** Add credit groups and people here; the modal renders this structure automatically. */
export const CREDIT_GROUPS: readonly CreditGroup[] = [];
