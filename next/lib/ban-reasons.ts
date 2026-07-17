export const BAN_REASONS = [
  { code: "spam", label: "Спам / мусор" },
  { code: "nsfw", label: "Неприемлемый контент" },
  { code: "abuse", label: "Оскорбления / токсичность" },
  { code: "multi", label: "Мультиаккаунт / обход" },
  { code: "fraud", label: "Обман / накрутка" },
  { code: "custom", label: "Своя причина…" },
] as const;

export type BanReasonCode = (typeof BAN_REASONS)[number]["code"];

export function isBanReasonCode(value: string): value is BanReasonCode {
  return BAN_REASONS.some((r) => r.code === value);
}

/** Final ban reason text stored in DB / shown to user. Custom requires non-empty note. */
export function resolveBanReason(
  code: BanReasonCode,
  customNote: string,
): { ok: true; reason: string } | { ok: false; error: string } {
  if (code === "custom") {
    const note = customNote.trim();
    if (note.length < 3) {
      return { ok: false, error: "Укажи свою причину (минимум 3 символа)" };
    }
    return { ok: true, reason: note.slice(0, 280) };
  }
  const found = BAN_REASONS.find((r) => r.code === code);
  if (!found) {
    return { ok: false, error: "Неизвестная причина" };
  }
  const note = customNote.trim();
  // Optional note can append to preset
  if (note) {
    return { ok: true, reason: `${found.label}: ${note.slice(0, 200)}` };
  }
  return { ok: true, reason: found.label };
}

export function buildBanNotifyMessage(reason: string): string {
  return (
    `🚫 Тебя заблокировали в боте бебебендла.\n` +
    `Причина: ${reason}\n\n` +
    `Предлагать новые блюда больше нельзя. Если считаешь, что это ошибка — напиши администрации.`
  );
}

export function pendingRejectReasonForBan(moderatorLabel: string): string {
  return `пользователь заблокирован модератором ${moderatorLabel}`;
}
