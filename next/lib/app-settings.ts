import { eq } from "drizzle-orm";
import { appSettings, db } from "@/db/schema";

export const SETTING_DAILY_ROTATION_NOTIFY = "daily_rotation_notify";
export const SETTING_DAILY_GENERATION_ENABLED = "daily_generation_enabled";
export const SETTING_DAILY_DISABLED_REASON = "daily_disabled_reason";
/** Competitive mode master flag (default false until ops enables). */
export const SETTING_COMPETITIVE_ENABLED = "competitive_enabled";

export const DEFAULT_DAILY_DISABLED_REASON =
  "Дейлик временно недоступен. Загляни позже.";

export async function getSetting(key: string, defaultValue = ""): Promise<string> {
  try {
    const rows = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);
    return rows[0]?.value ?? defaultValue;
  } catch (error) {
    console.error("[app-settings] get failed", key, error);
    return defaultValue;
  }
}

export async function getBoolSetting(key: string, defaultValue = false): Promise<boolean> {
  const raw = await getSetting(key, defaultValue ? "true" : "false");
  return raw === "true" || raw === "1" || raw === "yes";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function isDailyRotationNotifyEnabled(): Promise<boolean> {
  return getBoolSetting(SETTING_DAILY_ROTATION_NOTIFY, false);
}

export async function setDailyRotationNotifyEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_DAILY_ROTATION_NOTIFY, enabled ? "true" : "false");
}

export async function isDailyGenerationEnabled(): Promise<boolean> {
  return getBoolSetting(SETTING_DAILY_GENERATION_ENABLED, true);
}

export async function setDailyGenerationEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_DAILY_GENERATION_ENABLED, enabled ? "true" : "false");
}

export async function getDailyDisabledReason(): Promise<string> {
  const reason = await getSetting(SETTING_DAILY_DISABLED_REASON, "");
  const trimmed = reason.trim();
  return trimmed || DEFAULT_DAILY_DISABLED_REASON;
}

export async function setDailyDisabledReason(reason: string): Promise<void> {
  await setSetting(SETTING_DAILY_DISABLED_REASON, reason.trim().slice(0, 500));
}

export type DailyPublicStatus = {
  generationEnabled: boolean;
  hasDaily: boolean;
  available: boolean;
  reason: string | null;
};

export async function getDailyPublicStatus(hasDaily: boolean): Promise<DailyPublicStatus> {
  const generationEnabled = await isDailyGenerationEnabled();
  if (hasDaily) {
    return {
      generationEnabled,
      hasDaily: true,
      available: true,
      reason: null,
    };
  }
  if (!generationEnabled) {
    return {
      generationEnabled: false,
      hasDaily: false,
      available: false,
      reason: await getDailyDisabledReason(),
    };
  }
  return {
    generationEnabled: true,
    hasDaily: false,
    available: false,
    reason: null,
  };
}
