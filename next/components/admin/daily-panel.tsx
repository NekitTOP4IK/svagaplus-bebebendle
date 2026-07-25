"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { todayMskDate } from "@/lib/daily-timezone";
import {
  generateAdminDaily,
  getAdminDailySettings,
  getAdminDailyView,
  updateAdminDailySettings,
} from "@/app/actions/admin-daily";

type DailyData = {
  date: string;
  exists: boolean;
  canGenerate: boolean;
  candidateCount: number;
  minScrans?: number;
  blockReason: string | null;
  rounds: Array<{
    roundNumber: number;
    scranAId: number;
    scranBId: number;
    scranAName: string | null;
    scranBName: string | null;
  }>;
  calendar: Array<{ date: string; rounds: number }>;
};

type Settings = {
  dailyRotationNotify: boolean;
  dailyGenerationEnabled: boolean;
  dailyDisabledReason: string;
};

type Props = Readonly<{
  role: "moderator" | "admin" | null;
}>;

export function DailyPanel({ role }: Props): ReactElement {
  const [date, setDate] = useState(() => todayMskDate());
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [reasonDraft, setReasonDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAdminDailyView({ date });
      if (result.ok) {
        setData(result.data as DailyData);
      } else {
        toast.error("Не удалось загрузить daily");
      }
    } catch {
      toast.error("Ошибка сети daily");
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const result = await getAdminDailySettings();
      if (result.ok) {
        setSettings(result.data);
        setReasonDraft(result.data.dailyDisabledReason ?? "");
      }
    } catch {
      // non-fatal
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const generate = async () => {
    if (role !== "admin") return;
    setBusy(true);
    try {
      const result = await generateAdminDaily({ date });
      if (result.ok) {
        const n = result.data.notify as { sent?: number; skipped?: number; disabled?: boolean } | null;
        if (n && !n.disabled) {
          toast.success(
            `Daily на ${date} создан · TG: ${n.sent ?? 0} отправлено` +
              (n.skipped ? `, ${n.skipped} пропущено` : ""),
          );
        } else {
          toast.success(`Daily на ${date} создан`);
        }
        await load();
      } else {
        toast.error(result.message || "Не удалось создать");
      }
    } finally {
      setBusy(false);
    }
  };

  const patchSettings = async (patch: Partial<Settings> & { dailyDisabledReason?: string }) => {
    if (role !== "admin") return;
    setSettingsSaving(true);
    try {
      const result = await updateAdminDailySettings(patch);
      if (result.ok) {
        setSettings(result.data);
        setReasonDraft(result.data.dailyDisabledReason ?? "");
        toast.success("Настройки сохранены");
      } else {
        toast.error("Не удалось сохранить");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSettingsSaving(false);
    }
  };

  const genEnabled = settings?.dailyGenerationEnabled !== false;
  const poolOk = Boolean(data?.canGenerate);
  const canGenerate = poolOk && genEnabled && role === "admin";

  const generateBlockedReason = (() => {
    if (role !== "admin") return "Генерация доступна только админу";
    if (!genEnabled) {
      return `Генерация выключена${
        settings?.dailyDisabledReason
          ? `: ${settings.dailyDisabledReason}`
          : ""
      }`;
    }
    if (data?.blockReason) return data.blockReason;
    if (!poolOk) return "Сейчас сгенерировать нельзя";
    return null;
  })();

  return (
    <div className="pixel-container space-y-4 border-4 border-black bg-zinc-900/80 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pixel-text text-xl font-bold text-white">Daily</h2>
          <p className="text-sm text-white/60">Статус, превью, генерация, переключатели</p>
        </div>
        <label className="text-xs text-white/50">
          Дата
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="pixel-input mt-1 block w-auto min-w-[10.5rem]"
          />
        </label>
      </div>

      {role === "admin" && (
        <div className="space-y-3 border-2 border-zinc-700 bg-zinc-950 p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">Генерация daily</p>
              <p className="text-xs text-white/50">
                Если выкл — cron и кнопка не создают ротацию; игрокам показывается причина.
              </p>
            </div>
            <button
              type="button"
              disabled={settingsLoading || settingsSaving}
              onClick={() =>
                void patchSettings({ dailyGenerationEnabled: !genEnabled })
              }
              className={`pixel-btn px-4 py-2 text-sm font-bold ${
                genEnabled ? "pixel-btn-ok" : "pixel-btn-danger"
              }`}
              aria-pressed={genEnabled}
            >
              {settingsLoading ? "…" : genEnabled ? "Вкл" : "Выкл"}
            </button>
          </div>

          {!genEnabled && (
            <div className="space-y-2">
              <label className="block text-xs text-white/50">
                Причина для игроков
                <textarea
                  value={reasonDraft}
                  onChange={(e) => setReasonDraft(e.target.value.slice(0, 500))}
                  rows={2}
                  placeholder="Например: техработы, загляни вечером"
                  className="pixel-textarea mt-1"
                />
              </label>
              <button
                type="button"
                disabled={settingsSaving}
                onClick={() =>
                  void patchSettings({ dailyDisabledReason: reasonDraft })
                }
                className="pixel-btn px-3 py-1.5 text-xs font-bold"
              >
                Сохранить причину
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white">TG: блюдо в ротации</p>
              <p className="text-xs text-white/50">
                Уведомлять авторов, когда их блюдо попало в daily.
              </p>
            </div>
            <button
              type="button"
              disabled={settingsLoading || settingsSaving}
              onClick={() =>
                void patchSettings({
                  dailyRotationNotify: !settings?.dailyRotationNotify,
                })
              }
              className={`pixel-btn px-4 py-2 text-sm font-bold ${
                settings?.dailyRotationNotify ? "pixel-btn-ok" : ""
              }`}
            >
              {settingsLoading
                ? "…"
                : settings?.dailyRotationNotify
                  ? "Вкл"
                  : "Выкл"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-white/60">Загрузка…</p>
      ) : data ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Stat
              label="Есть daily"
              value={data.exists ? "Да" : "Нет"}
              tone={data.exists ? "ok" : "warn"}
            />
            <Stat label="Кандидаты" value={String(data.candidateCount)} />
            <Stat
              label="Можно сгенерировать"
              value={canGenerate ? "Да" : "Нет"}
              tone={canGenerate ? "ok" : "muted"}
            />
          </div>

          {role === "admin" && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <button
                type="button"
                disabled={busy || !canGenerate}
                onClick={() => void generate()}
                className="pixel-btn pixel-btn-ok shrink-0 px-4 py-2 text-sm font-bold"
              >
                {busy ? "Генерация…" : `Сгенерировать на ${date}`}
              </button>
              {!canGenerate && generateBlockedReason && (
                <p className="text-xs font-bold leading-snug text-amber-300 sm:max-w-md">
                  {generateBlockedReason}
                </p>
              )}
            </div>
          )}
          {role !== "admin" && (
            <p className="text-xs font-bold text-white/50">
              Генерация доступна только админу
            </p>
          )}

          {data.rounds.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-white">
                <thead>
                  <tr className="border-b border-zinc-700 text-left text-xs uppercase text-white/50">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">A</th>
                    <th className="py-2">B</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {data.rounds.map((r) => (
                    <tr key={r.roundNumber}>
                      <td className="py-1.5 pr-3 text-white/50">{r.roundNumber}</td>
                      <td className="py-1.5 pr-3">
                        <ScranAdminLink id={r.scranAId} name={r.scranAName} />
                      </td>
                      <td className="py-1.5">
                        <ScranAdminLink id={r.scranBId} name={r.scranBName} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/50">
              Календарь (последние дни)
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(data.calendar ?? []).map((c) => (
                <button
                  key={c.date}
                  type="button"
                  onClick={() => setDate(c.date)}
                  className={`pixel-btn px-2 py-1 text-xs font-bold ${
                    c.date === date ? "pixel-btn-warn" : ""
                  }`}
                  title={`${c.rounds} раундов`}
                >
                  {c.date.slice(5)}
                </button>
              ))}
              {(data.calendar ?? []).length === 0 && (
                <span className="text-sm text-white/40">Пока пусто</span>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ScranAdminLink({
  id,
  name,
}: {
  id: number;
  name: string | null;
}): ReactElement {
  return (
    <Link
      href={`/admin/scrans?id=${id}`}
      className="font-bold text-amber-300 underline-offset-2 hover:text-amber-200 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
      title={`Открыть скран #${id}`}
    >
      {name ?? `Скран #${id}`}
      <span className="ml-1.5 text-xs font-normal text-white/40">#{id}</span>
    </Link>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const color =
    tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-400" : "text-white";
  return (
    <div className="border-2 border-zinc-700 bg-zinc-950 px-3 py-2">
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
