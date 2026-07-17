/** Human-readable Russian labels for moderation_audit_log.action */
const LABELS: Record<string, string> = {
  "scran.approve": "Скран одобрен",
  "scran.reject": "Скран отклонён",
  "scran.unpublish": "Скран снят с публикации",
  "scran.delete": "Скран удалён",
  "scran.edit": "Скран отредактирован",
  "scran.restore": "Скран возвращён в очередь",
  "scran.bulk_approve": "Массовое одобрение",
  "scran.bulk_reject": "Массовое отклонение",
  "daily.generate": "Daily сгенерирован",
  "settings.daily_rotation_notify": "Настройка: уведомления о ротации",
  "settings.daily_generation": "Настройка: генерация daily",
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action;
}

/** Prefer dish name from free-text details when present. */
export function auditDetailsPreview(details: string | null | undefined): string {
  if (!details) return "—";
  const trimmed = details.trim();
  if (!trimmed) return "—";
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.name === "string" && parsed.name.trim()) {
      return parsed.name.trim();
    }
    if (typeof parsed.date === "string") {
      return `дата ${parsed.date}`;
    }
    if (typeof parsed.enabled === "boolean") {
      return parsed.enabled ? "включено" : "выключено";
    }
    if (typeof parsed.reason === "string") {
      return String(parsed.reason);
    }
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  } catch {
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }
}
