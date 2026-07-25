"use server";

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSetting, setSetting } from "@/lib/app-settings";
import { requireRole } from "@/lib/auth-server";
import {
  emptyContentDoc,
  parseContentDoc,
  parseContentDocFromJsonString,
  serializeContentDoc,
  SETTING_COMPETITIVE_MODE_RULES,
  type CompetitiveContentDoc,
} from "@/lib/competitive/content";
import {
  isCompetitiveEnabled,
  setCompetitiveEnabled,
} from "@/lib/competitive/feature";
import {
  parseCompetitiveIntro,
  parseCompetitiveIntroFromJsonString,
  serializeCompetitiveIntro,
  SETTING_COMPETITIVE_INTRO,
  type CompetitiveIntroConfig,
} from "@/lib/competitive/intro";
import { writeAuditLog } from "@/lib/moderation-audit";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import {
  addToPool,
  listPool,
  listPoolCandidates,
  setPoolEnabled,
} from "@/lib/competitive/pool";
import { MIN_COMPETITIVE_VOTES } from "@/lib/competitive/constants";
import { todayMskDate } from "@/lib/daily-timezone";
import {
  createSeason,
  endSeason,
  ensureSeasonTransitions,
  getSeason,
  listSeasons,
  updateSeason,
  type SeasonStatus,
  type UpdateSeasonPatch,
} from "@/lib/competitive/seasons";

type ActionSuccess<T> = { success: true; data: T };
type ActionFailure = { success: false; message: string };
export type CompetitiveAdminActionResult<T> = ActionSuccess<T> | ActionFailure;

export type CompetitiveSeasonView = Readonly<{
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;
  themeKey: string | null;
  themeConfig: unknown;
  createdAt: string;
  updatedAt: string;
}>;

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ||
  (process.cwd() === "/app"
    ? "/app/uploads"
    : path.join(process.cwd(), "../uploads"));

const ALLOWED_CONTENT_TYPES = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

async function requireAdmin(): Promise<{ id: number } | null> {
  try {
    return await requireRole("admin");
  } catch {
    return null;
  }
}

const SEASON_STATUSES = new Set<SeasonStatus>([
  "draft",
  "countdown",
  "active",
  "ended",
]);

function parseSeasonDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validSeasonId(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function seasonView(
  season: Awaited<ReturnType<typeof getSeason>> extends infer T
    ? NonNullable<T>
    : never,
): CompetitiveSeasonView {
  return {
    ...season,
    startsAt: season.startsAt.toISOString(),
    endsAt: season.endsAt.toISOString(),
    createdAt: season.createdAt.toISOString(),
    updatedAt: season.updatedAt.toISOString(),
  };
}

export async function listCompetitiveSeasonsAction(): Promise<
  CompetitiveAdminActionResult<CompetitiveSeasonView[]>
> {
  if (!(await requireAdmin()))
    return { success: false, message: "Unauthorized" };
  try {
    return { success: true, data: (await listSeasons()).map(seasonView) };
  } catch (error) {
    console.error("[competitive-actions] list seasons", error);
    return { success: false, message: "Failed to list seasons" };
  }
}

export async function createCompetitiveSeasonAction(
  input: Readonly<{
    name?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    status?: unknown;
    themeKey?: unknown;
    themeConfig?: unknown;
  }>,
): Promise<
  CompetitiveAdminActionResult<Awaited<ReturnType<typeof createSeason>>>
> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };
  if (typeof input.name !== "string" || !input.name.trim())
    return { success: false, message: "name is required" };
  const startsAt = parseSeasonDate(input.startsAt);
  const endsAt = parseSeasonDate(input.endsAt);
  if (!startsAt || !endsAt)
    return {
      success: false,
      message: "startsAt and endsAt must be valid ISO datetimes",
    };
  if (
    input.status !== undefined &&
    (typeof input.status !== "string" ||
      !SEASON_STATUSES.has(input.status as SeasonStatus))
  )
    return { success: false, message: "Invalid status" };
  if (
    input.themeKey !== undefined &&
    input.themeKey !== null &&
    typeof input.themeKey !== "string"
  )
    return { success: false, message: "Invalid themeKey" };
  try {
    const season = await createSeason({
      name: input.name,
      startsAt,
      endsAt,
      status: input.status as SeasonStatus | undefined,
      themeKey: input.themeKey as string | null | undefined,
      themeConfig: input.themeConfig,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_SEASON_CREATE,
      details: JSON.stringify({
        id: season.id,
        name: season.name,
        status: season.status,
      }),
    });
    return { success: true, data: season };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create season";
    console.error("[competitive-actions] create season", error);
    return { success: false, message };
  }
}

export async function updateCompetitiveSeasonAction(
  input: Readonly<{
    id: unknown;
    name?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    status?: unknown;
    themeKey?: unknown;
    themeConfig?: unknown;
  }>,
): Promise<
  CompetitiveAdminActionResult<
    NonNullable<Awaited<ReturnType<typeof getSeason>>>
  >
> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!validSeasonId(input.id))
    return { success: false, message: "Invalid id" };
  const patch: UpdateSeasonPatch = {};
  const changed: string[] = [];
  if (typeof input.name === "string") {
    patch.name = input.name;
    changed.push("name");
  }
  if (input.startsAt !== undefined) {
    const value = parseSeasonDate(input.startsAt);
    if (!value)
      return {
        success: false,
        message: "startsAt must be a valid ISO datetime",
      };
    patch.startsAt = value;
    changed.push("startsAt");
  }
  if (input.endsAt !== undefined) {
    const value = parseSeasonDate(input.endsAt);
    if (!value)
      return { success: false, message: "endsAt must be a valid ISO datetime" };
    patch.endsAt = value;
    changed.push("endsAt");
  }
  if (input.status !== undefined) {
    if (
      typeof input.status !== "string" ||
      !SEASON_STATUSES.has(input.status as SeasonStatus)
    )
      return { success: false, message: "Invalid status" };
    patch.status = input.status as SeasonStatus;
    changed.push("status");
  }
  if (input.themeKey !== undefined) {
    if (input.themeKey !== null && typeof input.themeKey !== "string")
      return { success: false, message: "Invalid themeKey" };
    patch.themeKey = input.themeKey as string | null;
    changed.push("themeKey");
  }
  if (input.themeConfig !== undefined) {
    patch.themeConfig = input.themeConfig;
    changed.push("themeConfig");
  }
  if (!changed.length) return { success: false, message: "No valid fields" };
  try {
    const updated = await updateSeason(input.id, patch);
    if (!updated) return { success: false, message: "Not found" };
    await ensureSeasonTransitions();
    const season = (await getSeason(input.id)) ?? updated;
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_SEASON_UPDATE,
      details: JSON.stringify({ id: input.id, changed, status: season.status }),
    });
    return { success: true, data: season };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update season";
    console.error("[competitive-actions] update season", error);
    return { success: false, message };
  }
}

export async function endCompetitiveSeasonAction(
  id: unknown,
): Promise<
  CompetitiveAdminActionResult<
    NonNullable<Awaited<ReturnType<typeof getSeason>>>
  >
> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!validSeasonId(id)) return { success: false, message: "Invalid id" };
  try {
    const existing = await getSeason(id);
    if (!existing) return { success: false, message: "Not found" };
    await endSeason(id);
    const season = await getSeason(id);
    if (!season) return { success: false, message: "Not found" };
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_SEASON_END,
      details: JSON.stringify({ id, previousStatus: existing.status }),
    });
    return { success: true, data: season };
  } catch (error) {
    console.error("[competitive-actions] end season", error);
    return { success: false, message: "Failed to end season" };
  }
}

export async function getCompetitiveIntro(): Promise<
  CompetitiveAdminActionResult<{ intro: CompetitiveIntroConfig }>
> {
  if (!(await requireAdmin()))
    return { success: false, message: "Unauthorized" };

  try {
    const raw = await getSetting(SETTING_COMPETITIVE_INTRO, "");
    return {
      success: true,
      data: { intro: parseCompetitiveIntroFromJsonString(raw || null) },
    };
  } catch (error) {
    console.error("[admin/competitive-actions/intro-get]", error);
    return { success: false, message: "Failed to load intro config" };
  }
}

export async function saveCompetitiveIntro(
  source: unknown,
): Promise<CompetitiveAdminActionResult<{ intro: CompetitiveIntroConfig }>> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { success: false, message: "intro is required" };
  }

  try {
    const intro = parseCompetitiveIntro(source);
    await setSetting(
      SETTING_COMPETITIVE_INTRO,
      serializeCompetitiveIntro(intro),
    );
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_INTRO_UPDATE,
      details: JSON.stringify({
        enabled: intro.enabled,
        titleLen: intro.title.length,
        bodyLen: intro.body.length,
      }),
    });
    return { success: true, data: { intro } };
  } catch (error) {
    console.error("[admin/competitive-actions/intro-save]", error);
    return { success: false, message: "Failed to save intro config" };
  }
}

export async function getCompetitiveSettings(): Promise<
  CompetitiveAdminActionResult<{ competitiveEnabled: boolean }>
> {
  if (!(await requireAdmin()))
    return { success: false, message: "Unauthorized" };

  try {
    return {
      success: true,
      data: { competitiveEnabled: await isCompetitiveEnabled() },
    };
  } catch (error) {
    console.error("[admin/competitive-actions/settings-get]", error);
    return { success: false, message: "Failed to load competitive settings" };
  }
}

export async function saveCompetitiveSettings(
  competitiveEnabled: unknown,
): Promise<CompetitiveAdminActionResult<{ competitiveEnabled: boolean }>> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };
  if (typeof competitiveEnabled !== "boolean") {
    return {
      success: false,
      message: "competitiveEnabled (boolean) is required",
    };
  }

  try {
    await setCompetitiveEnabled(competitiveEnabled);
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_SETTINGS_UPDATE,
      details: JSON.stringify({ competitiveEnabled }),
    });
    return { success: true, data: { competitiveEnabled } };
  } catch (error) {
    console.error("[admin/competitive-actions/settings-save]", error);
    return { success: false, message: "Failed to save competitive settings" };
  }
}

export async function getCompetitiveModeRules(): Promise<
  CompetitiveAdminActionResult<{ doc: CompetitiveContentDoc }>
> {
  if (!(await requireAdmin()))
    return { success: false, message: "Unauthorized" };

  try {
    const raw = await getSetting(SETTING_COMPETITIVE_MODE_RULES, "");
    return {
      success: true,
      data: { doc: parseContentDocFromJsonString(raw || null) },
    };
  } catch (error) {
    console.error("[admin/competitive-actions/mode-rules-get]", error);
    return { success: false, message: "Failed to load mode rules" };
  }
}

export async function saveCompetitiveModeRules(
  source: unknown,
): Promise<CompetitiveAdminActionResult<{ doc: CompetitiveContentDoc }>> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };
  if (source === undefined)
    return { success: false, message: "doc is required" };

  try {
    const doc = parseContentDoc(source);
    await setSetting(SETTING_COMPETITIVE_MODE_RULES, serializeContentDoc(doc));
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_CONTENT_MODE_RULES_UPDATE,
      details: JSON.stringify({ blocks: doc.blocks.length }),
    });
    return {
      success: true,
      data: { doc: doc.blocks.length ? doc : emptyContentDoc() },
    };
  } catch (error) {
    console.error("[admin/competitive-actions/mode-rules-save]", error);
    return { success: false, message: "Failed to save mode rules" };
  }
}

export async function uploadCompetitiveContentAsset(
  formData: FormData,
): Promise<CompetitiveAdminActionResult<{ url: string }>> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, message: "file is required" };
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return { success: false, message: "file must be 1B…4MiB" };
  }
  const ext = ALLOWED_CONTENT_TYPES.get(file.type);
  if (!ext) {
    return { success: false, message: "allowed: png, jpeg, webp, gif" };
  }

  try {
    const dir = path.join(UPLOADS_DIR, "competitive-content");
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    await writeFile(
      path.join(dir, filename),
      Buffer.from(await file.arrayBuffer()),
    );

    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_CONTENT_UPLOAD,
      details: JSON.stringify({ filename, type: file.type, size: file.size }),
    });

    return {
      success: true,
      data: { url: `/api/competitive/content-assets/${filename}` },
    };
  } catch (error) {
    console.error("[admin/competitive-actions/content-upload]", error);
    return { success: false, message: "Upload failed" };
  }
}

export async function addCompetitivePoolEntry(
  scranId: unknown,
): Promise<CompetitiveAdminActionResult<null>> {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return { success: false, message: "Unauthorized" };
  }
  if (!Number.isInteger(scranId) || Number(scranId) < 1)
    return { success: false, message: "Invalid scran id" };
  try {
    const result = await addToPool(Number(scranId), user.id);
    if (!result.ok) return { success: false, message: result.error };
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_POOL_ADD,
      scranId: Number(scranId),
      details: JSON.stringify({ scranId, entryId: result.entry.id }),
    });
    return { success: true, data: null };
  } catch (error) {
    console.error("[competitive-actions] pool add failed", error);
    return { success: false, message: "Failed to add to pool" };
  }
}

export async function getCompetitivePoolAction(dateInput?: unknown): Promise<
  CompetitiveAdminActionResult<{
    date: string;
    entries: Array<
      Omit<
        Awaited<ReturnType<typeof listPool>>[number],
        "createdAt" | "updatedAt"
      > & { createdAt: string; updatedAt: string }
    >;
  }>
> {
  if (!(await requireAdmin()))
    return { success: false, message: "Unauthorized" };
  const date = typeof dateInput === "string" ? dateInput : todayMskDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { success: false, message: "Invalid date" };
  try {
    const entries = (await listPool(date)).map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    }));
    return { success: true, data: { date, entries } };
  } catch (error) {
    console.error("[competitive-actions] list pool", error);
    return { success: false, message: "Failed to list pool" };
  }
}

export async function getCompetitivePoolCandidatesAction(
  limitInput?: unknown,
): Promise<
  CompetitiveAdminActionResult<{
    minVotes: number;
    candidates: Awaited<ReturnType<typeof listPoolCandidates>>;
  }>
> {
  if (!(await requireAdmin()))
    return { success: false, message: "Unauthorized" };
  const raw = typeof limitInput === "number" ? limitInput : 200;
  const limit = Number.isFinite(raw) ? Math.min(Math.max(1, raw), 300) : 200;
  try {
    return {
      success: true,
      data: {
        minVotes: MIN_COMPETITIVE_VOTES,
        candidates: await listPoolCandidates(limit),
      },
    };
  } catch (error) {
    console.error("[competitive-actions] list pool candidates", error);
    return { success: false, message: "Failed to list candidates" };
  }
}

export async function setCompetitivePoolEnabledAction(
  input: Readonly<{ scranId: unknown; enabled: unknown }>,
): Promise<CompetitiveAdminActionResult<unknown>> {
  const user = await requireAdmin();
  if (!user) return { success: false, message: "Unauthorized" };
  if (!validSeasonId(input.scranId) || typeof input.enabled !== "boolean")
    return { success: false, message: "Invalid pool update" };
  try {
    const result = await setPoolEnabled(input.scranId, input.enabled);
    if (!result.ok) return { success: false, message: result.error };
    await writeAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.COMPETITIVE_POOL_ENABLE,
      scranId: input.scranId,
      details: JSON.stringify({
        scranId: input.scranId,
        enabled: input.enabled,
      }),
    });
    return { success: true, data: result.entry };
  } catch (error) {
    console.error("[competitive-actions] set pool enabled", error);
    return { success: false, message: "Failed to update pool entry" };
  }
}
