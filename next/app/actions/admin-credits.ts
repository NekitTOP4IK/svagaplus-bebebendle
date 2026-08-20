"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-server";
import type { ActionResult } from "@/lib/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit-actions";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  CREDIT_LIMITS,
  CREDIT_SOCIAL_PLATFORMS,
  type CreditGroup,
  type CreditSocialPlatform,
} from "@/lib/credits";
import { getCreditGroups, setCreditGroups } from "@/lib/credits-settings";

type CreditsSettingsError =
  | "unauthorized"
  | "forbidden"
  | "invalid_input"
  | "internal";

async function requireAdmin(): Promise<
  | { ok: true; userId: number }
  | { ok: false; result: ActionResult<never, CreditsSettingsError> }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false,
      result: { ok: false, code: "unauthorized", message: "Authentication is required." },
    };
  }
  if (user.role !== "admin") {
    return {
      ok: false,
      result: { ok: false, code: "forbidden", message: "Administrator access is required." },
    };
  }
  return { ok: true, userId: user.id };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isPlatform(value: unknown): value is CreditSocialPlatform {
  return CREDIT_SOCIAL_PLATFORMS.includes(value as CreditSocialPlatform);
}

function validateCreditGroups(
  input: unknown,
): ActionResult<readonly CreditGroup[], "invalid_input"> {
  if (!Array.isArray(input) || input.length > CREDIT_LIMITS.groups) {
    return { ok: false, code: "invalid_input", message: "Некорректный список групп." };
  }

  const groups: CreditGroup[] = [];
  for (const rawGroup of input) {
    if (!isRecord(rawGroup) || typeof rawGroup.title !== "string" || !Array.isArray(rawGroup.people)) {
      return { ok: false, code: "invalid_input", message: "Некорректная группа авторов." };
    }
    const title = rawGroup.title.trim();
    if (!title || title.length > CREDIT_LIMITS.titleLength) {
      return { ok: false, code: "invalid_input", message: "Проверь название группы." };
    }
    if (rawGroup.people.length > CREDIT_LIMITS.peoplePerGroup) {
      return { ok: false, code: "invalid_input", message: `В группе может быть не больше ${CREDIT_LIMITS.peoplePerGroup} авторов.` };
    }

    const people: CreditGroup["people"][number][] = [];
    for (const rawPerson of rawGroup.people) {
      if (!isRecord(rawPerson) || typeof rawPerson.name !== "string" || !Array.isArray(rawPerson.socials)) {
        return { ok: false, code: "invalid_input", message: "Некорректная карточка автора." };
      }
      const name = rawPerson.name.trim();
      const description = typeof rawPerson.description === "string" ? rawPerson.description.trim() : "";
      if (!name || name.length > CREDIT_LIMITS.nameLength) {
        return { ok: false, code: "invalid_input", message: "Проверь имя автора." };
      }
      if (description.length > CREDIT_LIMITS.descriptionLength) {
        return { ok: false, code: "invalid_input", message: "Описание автора слишком длинное." };
      }
      if (rawPerson.socials.length > CREDIT_LIMITS.socialsPerPerson) {
        return { ok: false, code: "invalid_input", message: "Слишком много социальных ссылок." };
      }

      const seenPlatforms = new Set<CreditSocialPlatform>();
      const socials: CreditGroup["people"][number]["socials"][number][] = [];
      for (const rawSocial of rawPerson.socials) {
        if (!isRecord(rawSocial) || !isPlatform(rawSocial.platform) || typeof rawSocial.url !== "string") {
          return { ok: false, code: "invalid_input", message: "Некорректная социальная ссылка." };
        }
        const url = rawSocial.url.trim();
        if (
          seenPlatforms.has(rawSocial.platform) ||
          !url ||
          url.length > CREDIT_LIMITS.urlLength ||
          !validUrl(url)
        ) {
          return { ok: false, code: "invalid_input", message: `Проверь ссылку ${rawSocial.platform}.` };
        }
        seenPlatforms.add(rawSocial.platform);
        socials.push({ platform: rawSocial.platform, url });
      }
      people.push({ name, ...(description ? { description } : {}), socials });
    }
    groups.push({ title, people });
  }
  return { ok: true, data: groups };
}

export async function getAdminCreditGroups(): Promise<
  ActionResult<readonly CreditGroup[], CreditsSettingsError>
> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;
  try {
    return { ok: true, data: await getCreditGroups() };
  } catch (error) {
    console.error("[actions/admin-credits] load failed", error);
    return { ok: false, code: "internal", message: "Не удалось загрузить авторов." };
  }
}

export async function updateAdminCreditGroups(
  input: unknown,
): Promise<ActionResult<readonly CreditGroup[], CreditsSettingsError>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.result;
  const validated = validateCreditGroups(input);
  if (!validated.ok) return validated;

  try {
    await setCreditGroups(validated.data);
    await writeAuditLog({
      actorUserId: auth.userId,
      action: AUDIT_ACTIONS.SETTINGS_CREDITS,
      details: JSON.stringify({
        groups: validated.data.length,
        people: validated.data.reduce((total, group) => total + group.people.length, 0),
      }),
    });
    revalidatePath("/");
    return { ok: true, data: validated.data };
  } catch (error) {
    console.error("[actions/admin-credits] update failed", error);
    return { ok: false, code: "internal", message: "Не удалось сохранить авторов." };
  }
}
