"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

type DailyData = {
  date: string;
  exists: boolean;
  canGenerate: boolean;
  candidateCount: number;
  rounds: Array<{
    roundNumber: number;
    scranAId: number;
    scranBId: number;
    scranAName: string | null;
    scranBName: string | null;
  }>;
  calendar: Array<{ date: string; rounds: number }>;
};

type Props = Readonly<{
  role: "moderator" | "admin" | null;
}>;

export function DailyPanel({ role }: Props): ReactElement {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/daily?date=${encodeURIComponent(date)}`);
      if (res.ok) {
        setData((await res.json()) as DailyData);
      } else {
        toast.error("Не удалось загрузить daily");
      }
    } catch {
      toast.error("Ошибка сети daily");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    if (role !== "admin") return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Daily на ${date} создан`);
        await load();
      } else {
        toast.error((json as { error?: string }).error || "Не удалось создать");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pixel-container space-y-4 border-4 border-black bg-zinc-900/80 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pixel-text text-xl font-bold text-white">Daily</h2>
          <p className="text-sm text-white/60">Статус, превью раундов, генерация</p>
        </div>
        <label className="text-xs text-white/50">
          Дата
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block border-2 border-zinc-600 bg-zinc-950 px-2 py-1.5 text-sm text-white"
          />
        </label>
      </div>

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
              value={data.canGenerate ? "Да" : "Нет"}
              tone={data.canGenerate ? "ok" : "muted"}
            />
          </div>

          {role === "admin" && (
            <button
              type="button"
              disabled={busy || !data.canGenerate}
              onClick={() => void generate()}
              className="pixel-btn bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40 active:scale-[0.97]"
            >
              {busy ? "Генерация…" : `Сгенерировать на ${date}`}
            </button>
          )}
          {role !== "admin" && (
            <p className="text-xs text-white/40">Генерация доступна только админу</p>
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
                        {r.scranAName ?? r.scranAId}
                      </td>
                      <td className="py-1.5">{r.scranBName ?? r.scranBId}</td>
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
                  className={`border-2 px-2 py-1 text-xs font-bold transition-colors duration-150 ${
                    c.date === date
                      ? "border-amber-400 bg-amber-400 text-black"
                      : "border-zinc-700 bg-zinc-950 text-white/80 hover:border-zinc-500"
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
