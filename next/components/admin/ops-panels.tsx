"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { auditActionLabel, auditDetailsPreview } from "@/lib/audit-labels";

type Stats = {
  scrans: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    subscribersPending: number;
    unchecked: number;
  };
  users: { total: number; admins: number; moderators: number };
  plays: { results: number; avgScore: number };
  dailyDays: number;
};

type AuditLog = {
  id: number;
  action: string;
  scranId: number | null;
  targetTelegramId: string | null;
  details: string | null;
  createdAt: string;
  actorUsername: string | null;
  actorDisplayName: string | null;
};

type DupGroup = { name: string; count: number; ids: number[] };

type Health = {
  ready: { status: number; body: { status?: string; components?: Record<string, string> } };
  live: { status: number; body: unknown };
  env: string;
  now: string;
};

export function StatsPanel(): ReactElement {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/stats");
        if (!res.ok) {
          if (!cancelled) setError("Не удалось загрузить статистику");
          return;
        }
        const json = (await res.json()) as Stats;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError("Ошибка сети");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <p className="text-sm text-white/60">Загрузка статистики…</p>;

  const cells: [string, string | number][] = [
    ["Всего блюд", data.scrans.total],
    ["В очереди", data.scrans.pending],
    ["Одобрено", data.scrans.approved],
    ["Отклонено", data.scrans.rejected],
    ["SVAGA+ в очереди", data.scrans.subscribersPending],
    ["SVAGA не проверено", data.scrans.unchecked],
    ["Пользователи", data.users.total],
    ["Админы / моды", `${data.users.admins} / ${data.users.moderators}`],
    ["Игр daily", data.plays.results],
    ["Средний скор", data.plays.avgScore],
    ["Дней с daily", data.dailyDays],
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {cells.map(([label, value]) => (
        <div key={label} className="border-2 border-zinc-700 bg-zinc-950 px-3 py-2">
          <p className="text-[10px] uppercase text-white/40">{label}</p>
          <p className="text-lg font-bold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

export function AuditPanel(): ReactElement {
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/audit?limit=80");
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 401 ? "Только для админа" : "Ошибка audit");
            setLogs([]);
          }
          return;
        }
        const json = (await res.json()) as { logs: AuditLog[] };
        if (!cancelled) {
          setLogs(json.logs);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError("Ошибка сети");
          setLogs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!logs) return <p className="text-sm text-white/60">Загрузка…</p>;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setTick((t) => t + 1)}
        className="pixel-btn px-3 py-1.5 text-xs font-bold"
      >
        Обновить
      </button>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-white">
          <thead>
            <tr className="border-b border-zinc-700 text-xs uppercase text-white/50">
              <th className="py-2 pr-3">Время</th>
              <th className="py-2 pr-3">Кто</th>
              <th className="py-2 pr-3">Действие</th>
              <th className="py-2 pr-3">Scran</th>
              <th className="py-2">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {logs.map((l) => {
              const detailLabel = auditDetailsPreview(l.details);
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-xs text-white/50">
                    {new Date(l.createdAt).toLocaleString("ru-RU")}
                  </td>
                  <td className="py-1.5 pr-3 text-xs">
                    {l.actorDisplayName || l.actorUsername || "—"}
                  </td>
                  <td className="py-1.5 pr-3 font-bold">{auditActionLabel(l.action)}</td>
                  <td className="py-1.5 pr-3">
                    {l.scranId != null ? (
                      <Link
                        href={`/admin/scrans?id=${l.scranId}`}
                        className="text-sky-300 underline-offset-2 hover:underline"
                      >
                        #{l.scranId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-xs truncate py-1.5 text-xs text-white/60">
                    {l.scranId != null && detailLabel !== "—" ? (
                      <Link
                        href={`/admin/scrans?id=${l.scranId}`}
                        className="text-amber-200/90 underline-offset-2 hover:underline"
                        title={l.details ?? ""}
                      >
                        {detailLabel}
                      </Link>
                    ) : (
                      <span title={l.details ?? ""}>
                        {detailLabel !== "—" ? detailLabel : l.targetTelegramId || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-white/40">
                  Пока пусто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DuplicatesPanel(): ReactElement {
  const [groups, setGroups] = useState<DupGroup[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/duplicates");
        if (!res.ok) {
          if (!cancelled) setError("Не удалось загрузить дубликаты");
          return;
        }
        const json = (await res.json()) as { groups: DupGroup[] };
        if (!cancelled) setGroups(json.groups ?? []);
      } catch {
        if (!cancelled) setError("Ошибка сети");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!groups) return <p className="text-sm text-white/60">Загрузка…</p>;

  return (
    <ul className="space-y-2">
      {groups.map((g) => (
        <li
          key={g.name}
          className="flex flex-wrap items-center justify-between gap-2 border-2 border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <span className="font-bold text-white">{g.name}</span>
          <span className="text-white/50">
            ×{g.count} · ids {g.ids.join(", ")}
          </span>
        </li>
      ))}
      {groups.length === 0 && (
        <li className="text-sm text-white/40">Точных дубликатов по имени нет</li>
      )}
    </ul>
  );
}

export function HealthPanel(): ReactElement {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/admin/health");
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 401 ? "Только для админа" : "Ошибка health");
          }
          return;
        }
        const json = (await res.json()) as Health;
        if (!cancelled) {
          setData(json);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Ошибка сети");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!data) return <p className="text-sm text-white/60">Проверка…</p>;

  const comps = data.ready.body.components ?? {};

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="border-2 border-zinc-700 bg-zinc-950 px-2 py-1 text-white/70">
          env: <strong className="text-white">{data.env}</strong>
        </span>
        <span
          className={`border-2 px-2 py-1 font-bold ${
            data.ready.status === 200
              ? "border-emerald-600 bg-emerald-950 text-emerald-300"
              : "border-red-600 bg-red-950 text-red-300"
          }`}
        >
          ready: {data.ready.body.status ?? data.ready.status}
        </span>
        <span
          className={`border-2 px-2 py-1 font-bold ${
            data.live.status === 200
              ? "border-emerald-600 bg-emerald-950 text-emerald-300"
              : "border-red-600 bg-red-950 text-red-300"
          }`}
        >
          live: {data.live.status}
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {Object.entries(comps).map(([k, v]) => (
          <li key={k} className="border-2 border-zinc-700 bg-zinc-950 px-3 py-2">
            <p className="text-[10px] uppercase text-white/40">{k}</p>
            <p className={`font-bold ${v === "ok" ? "text-emerald-400" : "text-red-400"}`}>
              {v}
            </p>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={reload}
        className="pixel-btn px-3 py-1.5 text-xs font-bold"
      >
        Обновить
      </button>
      <p className="text-[10px] text-white/30">{data.now}</p>
    </div>
  );
}
