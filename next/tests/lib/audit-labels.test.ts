import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_LABELS, PRODUCTION_AUDIT_ACTIONS, auditActionLabel, auditDetailsPreview } from "@/lib/audit-labels";

const ACTION_LABELS = {
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
  "settings.daily_rotation_notify": "Настройка: уведомления о ротации",
  "settings.daily_generation": "Настройка: генерация daily",
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
} as const;

describe("auditActionLabel", () => {
  it("has labels for the authoritative production action registry", () => {
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual([...PRODUCTION_AUDIT_ACTIONS].sort());
  });

  it.each(Object.entries(ACTION_LABELS))("localizes production action %s", (action, label) => {
    expect(auditActionLabel(action)).toBe(label);
  });

  it("makes an unknown action visible in Russian", () => {
    expect(auditActionLabel("custom.thing")).toBe("Неизвестное действие: custom.thing");
  });
});

describe("auditDetailsPreview", () => {
  it("uses a dish name from JSON details", () => {
    expect(auditDetailsPreview(JSON.stringify({ name: "Борщ", comment: "дубликат" }))).toBe("Борщ");
  });

  it("uses an announcement title from JSON details", () => {
    expect(auditDetailsPreview(JSON.stringify({ id: 4, title: "Новые правила" }))).toBe('объявление «Новые правила»');
  });

  it("formats generated daily details", () => {
    expect(auditDetailsPreview(JSON.stringify({ date: "2026-07-26", rounds: 5 }))).toBe("дата 2026-07-26; раундов: 5");
  });

  it("formats Daily reentry details", () => {
    expect(auditDetailsPreview(JSON.stringify({ dailyReentry: true, bulk: false }))).toBe("одно блюдо");
    expect(auditDetailsPreview(JSON.stringify({ dailyReentry: true, bulk: true, reason: "для теста" }))).toBe("массовая операция; комментарий: для теста");
  });

  it("formats enabled settings", () => {
    expect(auditDetailsPreview(JSON.stringify({ enabled: false }))).toBe("выключено");
    expect(auditDetailsPreview(JSON.stringify({ competitiveEnabled: true }))).toBe("соревновательный режим: включён");
  });

  it("formats changed fields and target users", () => {
    expect(auditDetailsPreview(JSON.stringify({ userId: 42, changed: ["role", "isSubscriber", "lastSyncedAt", "lastSyncAttemptAt", "lastSyncError"] }))).toBe("пользователь #42; изменены поля: роль, подписка, последнее обновление подписки, последняя попытка обновления, ошибка обновления");
  });

  it("formats seasons and pool entries", () => {
    expect(auditDetailsPreview(JSON.stringify({ id: 3, name: "Лето", status: "active" }))).toBe('сезон #3 «Лето»; статус: активен');
    expect(auditDetailsPreview(JSON.stringify({ scranId: 8, entryId: 19 }))).toBe("скран #8; запись пула #19");
    expect(auditDetailsPreview(JSON.stringify({ scranId: 8, enabled: true }))).toBe("скран #8: включён");
  });

  it("formats competitive daily and debug reset details", () => {
    expect(auditDetailsPreview(JSON.stringify({ date: "2026-07-26", dailyId: 11 }))).toBe("дата 2026-07-26; daily #11");
    expect(auditDetailsPreview(JSON.stringify({ targetUserId: 42, telegramId: "7", done: ["modals", "freeze", "nick", "standings", "results"] }))).toBe("пользователь #42 (Telegram: 7); сброшено: модальные окна, заморозка серии, псевдоним, турнирная таблица, результаты");
  });

  it("formats season updates and end details", () => {
    expect(auditDetailsPreview(JSON.stringify({ id: 3, changed: ["name", "startsAt", "endsAt", "status", "themeKey", "themeConfig"], status: "active" }))).toBe("сезон #3; изменены поля: название, дата начала, дата окончания, статус, тема, настройки темы; статус: активен");
    expect(auditDetailsPreview(JSON.stringify({ id: 3, previousStatus: "active" }))).toBe("сезон #3; предыдущий статус: активен");
  });

  it("formats an announcement deletion and localized rejection reasons", () => {
    expect(auditDetailsPreview(JSON.stringify({ id: 4 }))).toBe("объявление #4");
    expect(auditDetailsPreview(JSON.stringify({ id: 4, changed: ["title", "body", "active"] }))).toBe("объявление #4; изменены поля: заголовок, текст, активность");
    expect(auditDetailsPreview(JSON.stringify({ reason: "not_food", note: "не блюдо" }))).toBe("причина: Это не еда; комментарий: не блюдо");
    expect(auditDetailsPreview(JSON.stringify({ reason: "user_banned" }))).toBe("причина: Пользователь забанен");
  });

  it("preserves plain text and safely abbreviates unknown JSON", () => {
    expect(auditDetailsPreview("просто текст")).toBe("просто текст");
    const unknown = JSON.stringify({ unexpected: "x".repeat(100) });
    expect(auditDetailsPreview(unknown)).toBe(`${unknown.slice(0, 80)}…`);
  });
});
