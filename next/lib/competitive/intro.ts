/**
 * Admin-configurable Ranked first-visit intro modal.
 * Stored as JSON in app_settings.
 */

export const SETTING_COMPETITIVE_INTRO = "competitive_intro";

export type CompetitiveIntroConfig = Readonly<{
  enabled: boolean;
  title: string;
  body: string;
}>;

export const DEFAULT_COMPETITIVE_INTRO: CompetitiveIntroConfig = {
  enabled: false,
  title: "Добро пожаловать в Ranked",
  body: "Соревнуйся каждый день, набирай очки и поднимайся в таблице лидеров сезона.",
};

const TITLE_MAX = 120;
const BODY_MAX = 4000;

export function parseCompetitiveIntro(raw: unknown): CompetitiveIntroConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_COMPETITIVE_INTRO };
  }
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true || o.enabled === "true" || o.enabled === 1;
  const title =
    typeof o.title === "string" && o.title.trim()
      ? o.title.trim().slice(0, TITLE_MAX)
      : DEFAULT_COMPETITIVE_INTRO.title;
  const body =
    typeof o.body === "string" ? o.body.slice(0, BODY_MAX) : DEFAULT_COMPETITIVE_INTRO.body;
  return { enabled, title, body };
}

export function parseCompetitiveIntroFromJsonString(
  raw: string | null | undefined,
): CompetitiveIntroConfig {
  if (!raw?.trim()) return { ...DEFAULT_COMPETITIVE_INTRO };
  try {
    return parseCompetitiveIntro(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_COMPETITIVE_INTRO };
  }
}

export function serializeCompetitiveIntro(
  config: CompetitiveIntroConfig,
): string {
  const clean = parseCompetitiveIntro(config);
  return JSON.stringify({
    enabled: clean.enabled,
    title: clean.title.slice(0, TITLE_MAX),
    body: clean.body.slice(0, BODY_MAX),
  });
}

/** Whether the intro should be offered to a user (enabled + non-empty body). */
export function introShouldShow(
  config: CompetitiveIntroConfig,
  dismissed: boolean,
): boolean {
  if (dismissed) return false;
  if (!config.enabled) return false;
  return config.body.trim().length > 0;
}
