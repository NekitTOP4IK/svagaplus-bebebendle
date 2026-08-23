import "server-only";

import { getSetting, setSetting } from "@/lib/app-settings";
import {
  DEFAULT_CREDIT_GROUPS,
  normalizeCreditGroups,
  type CreditGroup,
} from "@/lib/credits";

export const SETTING_CREDIT_GROUPS = "credit_groups";

export async function getCreditGroups(): Promise<readonly CreditGroup[]> {
  const fallback = JSON.stringify(DEFAULT_CREDIT_GROUPS);
  const raw = await getSetting(SETTING_CREDIT_GROUPS, fallback);
  try {
    return normalizeCreditGroups(JSON.parse(raw));
  } catch {
    return DEFAULT_CREDIT_GROUPS;
  }
}

export async function setCreditGroups(groups: readonly CreditGroup[]): Promise<void> {
  await setSetting(SETTING_CREDIT_GROUPS, JSON.stringify(groups));
}
