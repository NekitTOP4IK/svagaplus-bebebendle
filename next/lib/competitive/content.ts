/**
 * Structured competitive FAQ / rewards content.
 * Stored as JSON in app_settings (mode rules) or season.themeConfig (season rules + rewards).
 */

export const SETTING_COMPETITIVE_MODE_RULES = "competitive_mode_rules";

export type CompetitiveContentBlock = Readonly<{
  id: string;
  /** Category / section title */
  title: string;
  /** Plain text or light markdown-ish body */
  body: string;
  /** Optional image/gif/webp URL (public or /api/images/…) */
  imageUrl: string | null;
  /** Sort order ascending */
  sort: number;
}>;

export type CompetitiveContentDoc = Readonly<{
  version: 1;
  blocks: CompetitiveContentBlock[];
}>;

export function emptyContentDoc(): CompetitiveContentDoc {
  return { version: 1, blocks: [] };
}

export function newContentBlock(
  partial?: Partial<CompetitiveContentBlock>,
): CompetitiveContentBlock {
  return {
    id:
      partial?.id ??
      `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: partial?.title ?? "Новая категория",
    body: partial?.body ?? "",
    imageUrl: partial?.imageUrl ?? null,
    sort: partial?.sort ?? 0,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseContentDoc(raw: unknown): CompetitiveContentDoc {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.blocks)) {
    return emptyContentDoc();
  }
  const blocks: CompetitiveContentBlock[] = [];
  for (const item of raw.blocks) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === "string" && item.id ? item.id : newContentBlock().id;
    const title =
      typeof item.title === "string" ? item.title.trim().slice(0, 120) : "";
    const body = typeof item.body === "string" ? item.body.slice(0, 8000) : "";
    let imageUrl: string | null = null;
    if (typeof item.imageUrl === "string" && item.imageUrl.trim()) {
      imageUrl = item.imageUrl.trim().slice(0, 500);
    }
    const sort =
      typeof item.sort === "number" && Number.isFinite(item.sort)
        ? item.sort
        : blocks.length;
    if (!title && !body && !imageUrl) continue;
    blocks.push({ id, title: title || "Без названия", body, imageUrl, sort });
  }
  blocks.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  return { version: 1, blocks };
}

export function parseContentDocFromJsonString(
  raw: string | null | undefined,
): CompetitiveContentDoc {
  if (!raw || !raw.trim()) return emptyContentDoc();
  try {
    return parseContentDoc(JSON.parse(raw) as unknown);
  } catch {
    return emptyContentDoc();
  }
}

/** themeConfig shape helpers */
export type SeasonThemeConfig = {
  rules?: CompetitiveContentDoc;
  rewards?: CompetitiveContentDoc;
  [key: string]: unknown;
};

export function parseSeasonThemeConfig(raw: unknown): SeasonThemeConfig {
  if (!isRecord(raw)) return {};
  const out: SeasonThemeConfig = { ...raw };
  if (raw.rules !== undefined) out.rules = parseContentDoc(raw.rules);
  if (raw.rewards !== undefined) out.rewards = parseContentDoc(raw.rewards);
  return out;
}

export function serializeContentDoc(doc: CompetitiveContentDoc): string {
  const normalized = parseContentDoc(doc);
  return JSON.stringify(normalized);
}
