import { REJECT_REASONS } from "@/lib/reject-reasons";
import { PRODUCTION_AUDIT_ACTIONS } from "@/lib/audit-actions";

export { AUDIT_ACTIONS, PRODUCTION_AUDIT_ACTIONS } from "@/lib/audit-actions";

/** Human-readable Russian labels for moderation_audit_log.action */
export const AUDIT_ACTION_LABELS: Record<(typeof PRODUCTION_AUDIT_ACTIONS)[number], string> = {
  "scran.approve": "Скран одобрен",
  "scran.reject": "Скран отклонён",
  "scran.unpublish": "Скран снят с публикации",
  "scran.delete": "Скран удалён",
  "scran.edit": "Скран отредактирован",
  "scran.restore": "Скран возвращён в очередь",
  "scran.bulk_approve": "Массовое одобрение",
  "scran.bulk_reject": "Массовое отклонение",
  "user.ban": "Пользователь забанен",
  "daily.generate": "Daily сгенерирован",
  "daily.reentry_grant": "Повторный допуск в Daily выдан",
  "daily.reentry_revoke": "Повторный допуск в Daily отозван",
  "daily.custom.create": "Событие Daily создано",
  "daily.custom.update": "Событие Daily обновлено",
  "daily.custom.publish": "Событие Daily опубликовано",
  "daily.custom.cancel": "Событие Daily отменено",
  "settings.daily_rotation_notify": "Настройка: уведомления о ротации",
  "settings.daily_generation": "Настройка: генерация daily",
  "settings.soundtrack_metadata": "Метаданные саундтрека обновлены",
  "settings.credits": "Список авторов обновлён",
  "announcements.create": "Объявление создано",
  "announcements.update": "Объявление обновлено",
  "announcements.delete": "Объявление удалено",
  "users.update": "Пользователь обновлён",
  "competitive.season.create": "Соревновательный сезон создан",
  "competitive.season.update": "Соревновательный сезон обновлён",
  "competitive.season.end": "Соревновательный сезон завершён",
  "competitive.intro.update": "Вступление соревновательного режима обновлено",
  "competitive.settings.update": "Настройки соревновательного режима обновлены",
  "competitive.content.mode_rules.update": "Правила режима обновлены",
  "competitive.content.upload": "Файл соревновательного режима загружен",
  "competitive.pool.add": "Скран добавлен в соревновательный пул",
  "competitive.pool.enable": "Статус скрана в соревновательном пуле изменён",
  "competitive.daily.generate": "Соревновательный Daily сгенерирован",
  "competitive.debug.reset": "Отладочные данные игрока сброшены",
};

const FIELD_LABELS: Record<string, string> = {
  active: "активность",
  body: "текст",
  displayName: "имя",
  isSubscriber: "подписка",
  lastSyncedAt: "последнее обновление подписки",
  lastSyncAttemptAt: "последняя попытка обновления",
  lastSyncError: "ошибка обновления",
  name: "название",
  role: "роль",
  startsAt: "дата начала",
  endsAt: "дата окончания",
  status: "статус",
  telegramUsername: "Telegram-имя",
  themeKey: "тема",
  themeConfig: "настройки темы",
  title: "заголовок",
};

const SEASON_STATUS_LABELS: Record<string, string> = {
  active: "активен",
  countdown: "ожидается",
  draft: "черновик",
  ended: "завершён",
};

const REJECTION_REASON_LABELS = Object.fromEntries(REJECT_REASONS.map(({ code, label }) => [code, label])) as Record<string, string>;
const DEBUG_RESET_LABELS: Record<string, string> = {
  modals: "модальные окна",
  freeze: "заморозка серии",
  nick: "псевдоним",
  standings: "турнирная таблица",
  results: "результаты",
};

function shorten(value: string): string {
  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatChanged(value: unknown): string | null {
  if (!Array.isArray(value) || !value.every((field) => typeof field === "string")) return null;
  return value.map((field) => FIELD_LABELS[field] ?? field).join(", ");
}

function formatSeasonStatus(value: unknown): string | null {
  return typeof value === "string" ? SEASON_STATUS_LABELS[value] ?? value : null;
}

/** Formats the known audit detail payloads written by the application. */
function formatKnownDetails(details: Record<string, unknown>): string | null {
  if (typeof details.eventId === "number") {
    const name = typeof details.name === "string" && details.name.trim()
      ? ` «${details.name.trim()}»`
      : "";
    const date = typeof details.date === "string" ? `; дата ${details.date}` : "";
    return `событие Daily #${details.eventId}${name}${date}`;
  }

  if (details.dailyReentry === true) {
    const scope = details.bulk === true ? "массовая операция" : "одно блюдо";
    const reason = typeof details.reason === "string" && details.reason.trim()
      ? `; комментарий: ${details.reason.trim()}`
      : "";
    return `${scope}${reason}`;
  }

  if (typeof details.targetUserId === "number") {
    const telegram = typeof details.telegramId === "string" || typeof details.telegramId === "number"
      ? ` (Telegram: ${details.telegramId})`
      : "";
    const done = Array.isArray(details.done) && details.done.every((item) => typeof item === "string")
      ? `; сброшено: ${details.done.map((item) => DEBUG_RESET_LABELS[item] ?? item).join(", ")}`
      : "";
    return `пользователь #${details.targetUserId}${telegram}${done}`;
  }

  if (typeof details.userId === "number") {
    const changed = formatChanged(details.changed);
    return `пользователь #${details.userId}${changed ? `; изменены поля: ${changed}` : ""}`;
  }

  const changed = formatChanged(details.changed);
  const announcementChanged = Array.isArray(details.changed)
    && details.changed.every((field) => field === "title" || field === "body" || field === "active");
  if (typeof details.id === "number" && announcementChanged) {
    return `объявление #${details.id}${changed ? `; изменены поля: ${changed}` : ""}`;
  }

  if (typeof details.id === "number" && (typeof details.previousStatus === "string" || Array.isArray(details.changed))) {
    const status = formatSeasonStatus(details.status);
    const previousStatus = formatSeasonStatus(details.previousStatus);
    const parts = [`сезон #${details.id}`];
    if (changed) parts.push(`изменены поля: ${changed}`);
    if (status) parts.push(`статус: ${status}`);
    if (previousStatus) parts.push(`предыдущий статус: ${previousStatus}`);
    return parts.join("; ");
  }

  if (typeof details.scranId === "number") {
    const entry = typeof details.entryId === "number" ? `; запись пула #${details.entryId}` : "";
    if (typeof details.enabled === "boolean") return `скран #${details.scranId}: ${details.enabled ? "включён" : "выключен"}`;
    return `скран #${details.scranId}${entry}`;
  }

  if (typeof details.date === "string") {
    const extras: string[] = [];
    if (typeof details.rounds === "number") extras.push(`раундов: ${details.rounds}`);
    if (typeof details.dailyId === "number") extras.push(`daily #${details.dailyId}`);
    return [`дата ${details.date}`, ...extras].join("; ");
  }

  if (typeof details.name === "string" && details.name.trim()) {
    if (typeof details.id === "number" && typeof details.status === "string") {
      const status = formatSeasonStatus(details.status) ?? details.status;
      return `сезон #${details.id} «${details.name.trim()}»; статус: ${status}`;
    }
    return details.name.trim();
  }

  if (typeof details.title === "string" && details.title.trim()) return `объявление «${details.title.trim()}»`;

  if (typeof details.competitiveEnabled === "boolean") {
    return `соревновательный режим: ${details.competitiveEnabled ? "включён" : "выключен"}`;
  }

  if (typeof details.enabled === "boolean") return details.enabled ? "включено" : "выключено";

  if (typeof details.filename === "string") {
    const parts = [`файл: ${details.filename}`];
    if (typeof details.type === "string") parts.push(`тип: ${details.type}`);
    if (typeof details.size === "number") parts.push(`размер: ${details.size} Б`);
    return parts.join("; ");
  }

  if (typeof details.blocks === "number") return `блоков: ${details.blocks}`;

  if (changed) return `изменены поля: ${changed}`;

  if (typeof details.reason === "string") {
    const reason = REJECTION_REASON_LABELS[details.reason] ?? (details.reason === "user_banned" ? "Пользователь забанен" : details.reason);
    const note = typeof details.note === "string" && details.note.trim() ? `; комментарий: ${details.note.trim()}` : "";
    return `причина: ${reason}${note}`;
  }
  if (typeof details.id === "number") return `объявление #${details.id}`;
  return null;
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action as keyof typeof AUDIT_ACTION_LABELS] ?? `Неизвестное действие: ${action}`;
}

/** Returns a concise Russian preview for known audit details. */
export function auditDetailsPreview(details: string | null | undefined): string {
  if (!details) return "—";
  const trimmed = details.trim();
  if (!trimmed) return "—";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? formatKnownDetails(parsed) ?? shorten(trimmed) : shorten(trimmed);
  } catch {
    return shorten(trimmed);
  }
}
