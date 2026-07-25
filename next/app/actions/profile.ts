"use server";

import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { getCurrentUser } from "@/lib/auth-server";
import type { ActionResult } from "@/lib/action-result";
import { getProfileView, getSvagaStatusView } from "@/lib/profile";
import { svagaStatusService } from "@/lib/svaga-status-service";
import { setCompetitiveDisplayName } from "@/lib/competitive/display-name-server";

export async function refreshSvagaStatus(): Promise<ActionResult<{
  isSubscriber: boolean | null; source: string; checkedAt: string | null; error: string | null;
}, "unauthorized" | "rate_limited" | "unavailable">> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthorized", message: "Authentication required." };
  const limit = await checkRateLimit(`svaga-refresh:${user.telegramId}`, 5, 60);
  if (!limit.allowed) return { ok: false, code: "rate_limited", message: "Too many requests. Please wait." };
  try {
    const result = await svagaStatusService.resolve(user.telegramId);
    const data = { isSubscriber: result.isSubscriber, source: result.source, checkedAt: result.checkedAt?.toISOString() ?? null, error: result.error ?? null };
    if (result.source === "unknown") return { ok: false, code: "unavailable", message: result.error ?? "Service unavailable." };
    revalidatePath("/profile");
    return { ok: true, data };
  } catch {
    return { ok: false, code: "unavailable", message: "Service unavailable." };
  }
}

export async function getProfileSnapshot() {
  const user = await getCurrentUser();
  return user ? getSvagaStatusView(user) : null;
}

export async function getProfileViewAction(): Promise<ActionResult<Awaited<ReturnType<typeof getProfileView>>, "unauthorized" | "unavailable">> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthorized", message: "Authentication required." };
  try {
    return { ok: true, data: await getProfileView(user) };
  } catch (error) {
    console.error("[profile] view load failed", error);
    return { ok: false, code: "unavailable", message: "Could not load profile." };
  }
}

export async function setCompetitiveDisplayNameAction(name: string | null): Promise<ActionResult<{
  competitiveDisplayName: string | null; label: string;
}, "unauthorized" | "invalid" | "cooldown">> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthorized", message: "Authentication required." };
  const result = await setCompetitiveDisplayName(user.id, name);
  if (!result.ok) return { ok: false, code: result.status === 429 ? "cooldown" : "invalid", message: result.error };
  revalidatePath("/profile");
  revalidatePath("/competitive");
  return { ok: true, data: { competitiveDisplayName: result.competitiveDisplayName, label: result.label } };
}
