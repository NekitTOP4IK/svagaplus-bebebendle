import { eq } from "drizzle-orm";
import { appSettings, db } from "@/db/schema";

export const SETTING_DAILY_ROTATION_NOTIFY = "daily_rotation_notify";

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
