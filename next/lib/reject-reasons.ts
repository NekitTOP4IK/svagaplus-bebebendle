export const REJECT_REASONS = [
  { code: "nsfw", label: "Неприемлемый контент", template: "неприемлемый контент" },
  { code: "not_food", label: "Это не еда", template: "это не еда" },
  { code: "low_quality", label: "Плохое качество фото", template: "плохое качество фото" },
  { code: "duplicate", label: "Дубликат", template: "похожее блюдо уже есть" },
  { code: "spam", label: "Спам / мусор", template: "спам" },
  { code: "wrong_info", label: "Неверные данные", template: "неверные название/цена/описание" },
  { code: "other", label: "Другое", template: "решение модерации" },
] as const;

export type RejectReasonCode = (typeof REJECT_REASONS)[number]["code"];

export function isRejectReasonCode(value: string): value is RejectReasonCode {
  return REJECT_REASONS.some((r) => r.code === value);
}

export function buildRejectMessage(
  scranName: string,
  reasonCode: RejectReasonCode,
  note?: string,
): string {
  const reason = REJECT_REASONS.find((r) => r.code === reasonCode) ?? REJECT_REASONS[6];
  const detail = note?.trim()
    ? `${reason.template}: ${note.trim()}`
    : reason.template;
  return `❌ Блюдо «${scranName}» отклонено модерацией (${detail}).`;
}
