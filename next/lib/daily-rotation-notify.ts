import { isDailyRotationNotifyEnabled } from "@/lib/app-settings";
import {
  buildDailyRotationMessage,
  sendTelegramMessage,
} from "@/lib/telegram-notify";

export type DailyNotifyScran = {
  id: number;
  name: string;
  telegramId: string | null;
};

/**
 * Group selected scrans by author telegram id and notify once per author
 * (lists all their dishes in today's rotation).
 */
export async function notifyAuthorsDailyRotation(
  date: string,
  selected: DailyNotifyScran[],
): Promise<{ sent: number; skipped: number; disabled: boolean }> {
  if (!(await isDailyRotationNotifyEnabled())) {
    return { sent: 0, skipped: selected.length, disabled: true };
  }

  const byAuthor = new Map<string, string[]>();
  for (const s of selected) {
    const tg = s.telegramId?.trim();
    if (!tg) continue;
    const list = byAuthor.get(tg) ?? [];
    list.push(s.name);
    byAuthor.set(tg, list);
  }

  let sent = 0;
  let skipped = 0;
  for (const [telegramId, names] of byAuthor) {
    const ok = await sendTelegramMessage(
      telegramId,
      buildDailyRotationMessage(date, names),
    );
    if (ok) sent += 1;
    else skipped += 1;
  }

  // authors without telegramId
  skipped += selected.filter((s) => !s.telegramId?.trim()).length;

  return { sent, skipped, disabled: false };
}
