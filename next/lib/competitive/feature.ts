import {
  getBoolSetting,
  setSetting,
  SETTING_COMPETITIVE_ENABLED,
} from "@/lib/app-settings";

export { SETTING_COMPETITIVE_ENABLED };

export async function isCompetitiveEnabled(): Promise<boolean> {
  return getBoolSetting(SETTING_COMPETITIVE_ENABLED, false);
}

export async function setCompetitiveEnabled(enabled: boolean): Promise<void> {
  await setSetting(SETTING_COMPETITIVE_ENABLED, enabled ? "true" : "false");
}
