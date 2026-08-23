"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-server";
import type { ActionResult } from "@/lib/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  SOUNDTRACK_FIELD_MAX_LENGTH,
  SOUNDTRACK_SLOTS,
  type SoundtrackMetadata,
  type SoundtrackSlotId,
} from "@/lib/audio/soundtrack-metadata";
import {
  getSoundtrackMetadata,
  setSoundtrackMetadata,
} from "@/lib/audio/soundtrack-settings";

type SoundtrackSettingsError =
  | "unauthorized"
  | "forbidden"
  | "invalid_input"
  | "internal";

async function requireAdmin(): Promise<
  | { ok: true; userId: number }
  | { ok: false; result: ActionResult<never, SoundtrackSettingsError> }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "unauthorized",
        message: "Authentication is required.",
      },
    };
  }
  if (user.role !== "admin") {
    return {
      ok: false,
      result: {
        ok: false,
        code: "forbidden",
        message: "Administrator access is required.",
      },
    };
  }
  return { ok: true, userId: user.id };
}

function validateMetadata(
  input: unknown,
): ActionResult<SoundtrackMetadata, "invalid_input"> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      ok: false,
      code: "invalid_input",
      message: "Некорректные данные саундтрека.",
    };
  }

  const source = input as Record<string, unknown>;
  const entries = {} as Record<SoundtrackSlotId, { title: string; artist: string }>;
  for (const { id } of SOUNDTRACK_SLOTS) {
    const raw = source[id];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, code: "invalid_input", message: `Не заполнен слот ${id}.` };
    }
    const entry = raw as Record<string, unknown>;
    if (typeof entry.title !== "string" || typeof entry.artist !== "string") {
      return { ok: false, code: "invalid_input", message: `Некорректные поля слота ${id}.` };
    }
    const title = entry.title.trim();
    const artist = entry.artist.trim();
    if (!title) {
      return { ok: false, code: "invalid_input", message: "Название трека не может быть пустым." };
    }
    if (
      title.length > SOUNDTRACK_FIELD_MAX_LENGTH ||
      artist.length > SOUNDTRACK_FIELD_MAX_LENGTH
    ) {
      return {
        ok: false,
        code: "invalid_input",
        message: `Название и автор должны быть короче ${SOUNDTRACK_FIELD_MAX_LENGTH + 1} символов.`,
      };
    }
    entries[id] = { title, artist };
  }
  return { ok: true, data: entries };
}

export async function getAdminSoundtrackMetadata(): Promise<
  ActionResult<SoundtrackMetadata, SoundtrackSettingsError>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;
  try {
    return { ok: true, data: await getSoundtrackMetadata() };
  } catch (error) {
    console.error("[actions/admin-soundtrack] load failed", error);
    return { ok: false, code: "internal", message: "Не удалось загрузить метаданные." };
  }
}

export async function updateAdminSoundtrackMetadata(
  input: unknown,
): Promise<ActionResult<SoundtrackMetadata, SoundtrackSettingsError>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;
  const validated = validateMetadata(input);
  if (!validated.ok) return validated;

  try {
    await setSoundtrackMetadata(validated.data);
    await writeAuditLog({
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.SETTINGS_SOUNDTRACK_METADATA,
      details: JSON.stringify({ slots: SOUNDTRACK_SLOTS.map(({ id }) => id) }),
    });
    revalidatePath("/", "layout");
    return { ok: true, data: validated.data };
  } catch (error) {
    console.error("[actions/admin-soundtrack] update failed", error);
    return { ok: false, code: "internal", message: "Не удалось сохранить метаданные." };
  }
}
