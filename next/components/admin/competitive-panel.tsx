"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────────

type SeasonStatus = "draft" | "countdown" | "active" | "ended";

type Season = {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;
  themeKey: string | null;
  createdAt: string;
  updatedAt: string;
};

type PoolEntry = {
  id: number;
  scranId: number;
  scranName: string;
  enabled: boolean;
  likesSnapshot: number;
  dislikesSnapshot: number;
  numberOfLikes: number;
  numberOfDislikes: number;
  lastUsedDate: string | null;
  inTodaysRotation: boolean;
  addedByUserId: number | null;
  createdAt: string;
  updatedAt: string;
};

type BandPreview = {
  roundStart: number;
  roundEnd: number;
  minDelta: number;
  maxDelta: number;
  pairCount: number;
};

type DailyPreview = {
  date: string;
  enabled: boolean;
  playableSeason: {
    id: number;
    name: string;
    status: string;
    startsAt: string;
    endsAt: string;
  } | null;
  existingDaily: {
    id: number;
    date: string;
    seasonId: number;
    createdAt: string;
  } | null;
  poolEnabledCount: number;
  candidateCount: number;
  minCandidatesNeeded: number;
  syncedRows: number;
  bands: BandPreview[];
};

const SEASON_STATUSES: SeasonStatus[] = [
  "draft",
  "countdown",
  "active",
  "ended",
];

const STATUS_LABEL: Record<SeasonStatus, string> = {
  draft: "черновик",
  countdown: "отсчёт",
  active: "активен",
  ended: "завершён",
};

// ── Date helpers ───────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** datetime-local value → ISO string for API. */
function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function formatRu(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU");
}

function todayDateInput(): string {
  // Prefer local calendar day for the date picker (admin convenience).
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error || `Ошибка ${res.status}`;
  } catch {
    return `Ошибка ${res.status}`;
  }
}

// ── Main panel ─────────────────────────────────────────────────────────────

export function CompetitivePanel(): ReactElement {
  return (
    <div className="space-y-6">
      <SettingsSection />
      <SeasonsSection />
      <PoolSection />
      <DailySection />
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────

function SettingsSection(): ReactElement {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/settings");
      if (res.status === 401) {
        setError("Нужна авторизация администратора");
        return;
      }
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const json = (await res.json()) as { competitiveEnabled: boolean };
      setEnabled(json.competitiveEnabled);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    if (enabled === null || saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitiveEnabled: !enabled }),
      });
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      const json = (await res.json()) as { competitiveEnabled: boolean };
      setEnabled(json.competitiveEnabled);
      toast.success(
        json.competitiveEnabled
          ? "Competitive включён"
          : "Competitive выключен",
      );
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pixel-container space-y-3 border-4 border-black bg-zinc-900/80 p-4">
      <div>
        <h2 className="pixel-text text-xl font-bold text-white">Настройки</h2>
        <p className="text-sm text-white/60">
          Глобальный флаг competitive daily (cron, hub, play)
        </p>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="flex flex-wrap items-center gap-3 border-2 border-zinc-700 bg-zinc-950 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Competitive Daily</p>
          <p className="text-xs text-white/50">
            Если выкл — cron не генерирует, hub/play показывают disabled.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || saving || enabled === null}
          onClick={() => void toggle()}
          className={`pixel-btn px-4 py-2 text-sm font-bold ${
            enabled ? "pixel-btn-ok" : "pixel-btn-danger"
          }`}
          aria-pressed={enabled ?? false}
        >
          {loading ? "…" : enabled ? "Вкл" : "Выкл"}
        </button>
      </div>
    </section>
  );
}

// ── Seasons ────────────────────────────────────────────────────────────────

function SeasonsSection(): ReactElement {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [status, setStatus] = useState<SeasonStatus>("draft");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/seasons");
      if (res.status === 401) {
        setError("Нужна авторизация администратора");
        return;
      }
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      setSeasons((await res.json()) as Season[]);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startsAt || !endsAt || creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startsAt: fromDatetimeLocal(startsAt),
          endsAt: fromDatetimeLocal(endsAt),
          status,
        }),
      });
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Сезон создан");
      setName("");
      setStartsAt("");
      setEndsAt("");
      setStatus("draft");
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setCreating(false);
    }
  }

  async function endSeason(season: Season) {
    if (season.status === "ended") return;
    if (
      !window.confirm(
        `Завершить сезон #${season.id} «${season.name}» и зафиксировать ранги?`,
      )
    ) {
      return;
    }
    setBusyId(season.id);
    setError("");
    try {
      const res = await apiFetch(
        `/api/admin/competitive/seasons/${season.id}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`Сезон #${season.id} завершён`);
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="pixel-container space-y-4 border-4 border-black bg-zinc-900/80 p-4">
      <div>
        <h2 className="pixel-text text-xl font-bold text-white">Сезоны</h2>
        <p className="text-sm text-white/60">
          Создание, список, завершение с snapshot рангов
        </p>
      </div>

      {error && <ErrorBox message={error} />}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="space-y-3 border-2 border-zinc-700 bg-zinc-950 p-3"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-white/50">
          Новый сезон
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-white/50 sm:col-span-2">
            Название
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="Июль 2026"
              className="pixel-input mt-1 block w-full"
            />
          </label>
          <label className="block text-xs text-white/50">
            Начало
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="pixel-input mt-1 block w-full"
            />
          </label>
          <label className="block text-xs text-white/50">
            Конец
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              required
              className="pixel-input mt-1 block w-full"
            />
          </label>
          <label className="block text-xs text-white/50">
            Статус
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SeasonStatus)}
              className="pixel-input mt-1 block w-full"
            >
              {SEASON_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]} ({s})
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
        >
          {creating ? "Создание…" : "Создать сезон"}
        </button>
      </form>

      {loading ? (
        <p className="text-white/60">Загрузка…</p>
      ) : seasons.length === 0 ? (
        <p className="text-sm text-white/50">Сезонов пока нет</p>
      ) : (
        <ul className="space-y-2">
          {seasons.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-start justify-between gap-3 border-2 border-zinc-700 bg-zinc-950 px-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-white/45">#{s.id}</p>
                <h3 className="pixel-text text-base font-bold text-white">
                  {s.name}
                </h3>
                <p className="mt-1 text-xs text-white/50">
                  {formatRu(s.startsAt)} → {formatRu(s.endsAt)}
                </p>
                <p className="mt-0.5 text-xs">
                  <StatusBadge status={s.status} />
                </p>
              </div>
              {s.status !== "ended" && (
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => void endSeason(s)}
                  className="pixel-btn pixel-btn-danger shrink-0 px-3 py-1.5 text-xs font-bold"
                >
                  {busyId === s.id ? "…" : "Завершить"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: SeasonStatus }): ReactElement {
  const tone =
    status === "active"
      ? "text-emerald-400"
      : status === "countdown"
        ? "text-amber-300"
        : status === "ended"
          ? "text-white/40"
          : "text-sky-300";
  return (
    <span className={`font-bold ${tone}`}>
      {STATUS_LABEL[status]} ({status})
    </span>
  );
}

// ── Pool ───────────────────────────────────────────────────────────────────

function PoolSection(): ReactElement {
  const [entries, setEntries] = useState<PoolEntry[]>([]);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scranIdInput, setScranIdInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyScranId, setBusyScranId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/pool");
      if (res.status === 401) {
        setError("Нужна авторизация администратора");
        return;
      }
      if (!res.ok) {
        setError(await readError(res));
        return;
      }
      const json = (await res.json()) as { date: string; entries: PoolEntry[] };
      setDate(json.date);
      setEntries(json.entries);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const scranId = Number(scranIdInput.trim());
    if (!Number.isInteger(scranId) || scranId <= 0 || adding) return;
    setAdding(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scranId }),
      });
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`Скран #${scranId} добавлен в пул`);
      setScranIdInput("");
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setAdding(false);
    }
  }

  async function toggleEnabled(entry: PoolEntry) {
    setBusyScranId(entry.scranId);
    setError("");
    try {
      const res = await apiFetch(
        `/api/admin/competitive/pool/${entry.scranId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !entry.enabled }),
        },
      );
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(
        entry.enabled
          ? `Скран #${entry.scranId} выключен`
          : `Скран #${entry.scranId} включён`,
      );
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setBusyScranId(null);
    }
  }

  const q = filter.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          String(e.scranId).includes(q) ||
          e.scranName.toLowerCase().includes(q),
      )
    : entries;

  return (
    <section className="pixel-container space-y-4 border-4 border-black bg-zinc-900/80 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pixel-text text-xl font-bold text-white">Пул</h2>
          <p className="text-sm text-white/60">
            Allowlist скранов · snapshot L/D · last used
            {date ? (
              <span className="text-white/40"> · ротация {date}</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="pixel-btn px-3 py-1.5 text-xs font-bold"
        >
          Обновить
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      <form
        onSubmit={(e) => void onAdd(e)}
        className="flex flex-wrap items-end gap-2 border-2 border-zinc-700 bg-zinc-950 p-3"
      >
        <label className="block min-w-[10rem] flex-1 text-xs text-white/50">
          Добавить scran id
          <input
            type="number"
            min={1}
            step={1}
            value={scranIdInput}
            onChange={(e) => setScranIdInput(e.target.value)}
            required
            placeholder="1234"
            className="pixel-input mt-1 block w-full"
          />
        </label>
        <button
          type="submit"
          disabled={adding}
          className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
        >
          {adding ? "…" : "Добавить"}
        </button>
      </form>

      <label className="block text-xs text-white/50">
        Фильтр (id / имя)
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="поиск…"
          className="pixel-input mt-1 block w-full max-w-sm"
        />
      </label>

      {loading ? (
        <p className="text-white/60">Загрузка…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/50">
          {entries.length === 0 ? "Пул пуст" : "Ничего не найдено"}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm text-white">
            <thead>
              <tr className="border-b border-zinc-700 text-left text-xs uppercase text-white/50">
                <th className="py-2 pr-3">Scran</th>
                <th className="py-2 pr-3">Snap L/D</th>
                <th className="py-2 pr-3">Live L/D</th>
                <th className="py-2 pr-3">Last used</th>
                <th className="py-2 pr-3">Статус</th>
                <th className="py-2">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3">
                    <Link
                      href={`/admin/scrans?id=${e.scranId}`}
                      className="font-bold text-amber-300 underline-offset-2 hover:underline"
                    >
                      {e.scranName || `Скран #${e.scranId}`}
                    </Link>
                    <span className="ml-1.5 text-xs text-white/40">
                      #{e.scranId}
                    </span>
                    {e.inTodaysRotation && (
                      <span className="ml-2 text-[10px] font-bold uppercase text-sky-300">
                        today
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-white/80">
                    {e.likesSnapshot}/{e.dislikesSnapshot}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-white/50">
                    {e.numberOfLikes}/{e.numberOfDislikes}
                  </td>
                  <td className="py-2 pr-3 text-xs text-white/60">
                    {e.lastUsedDate ?? "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {e.enabled ? (
                      <span className="text-emerald-400">вкл</span>
                    ) : (
                      <span className="text-white/40">выкл</span>
                    )}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      disabled={busyScranId === e.scranId}
                      onClick={() => void toggleEnabled(e)}
                      className={`pixel-btn px-2 py-1 text-xs font-bold ${
                        e.enabled ? "pixel-btn-warn" : "pixel-btn-ok"
                      }`}
                    >
                      {busyScranId === e.scranId
                        ? "…"
                        : e.enabled
                          ? "Выкл"
                          : "Вкл"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && entries.length > 0 && (
        <p className="text-xs text-white/40">
          Всего: {entries.length}
          {q ? ` · показано: ${filtered.length}` : ""} · включено:{" "}
          {entries.filter((e) => e.enabled).length}
        </p>
      )}
    </section>
  );
}

// ── Daily preview / generate ───────────────────────────────────────────────

function DailySection(): ReactElement {
  const [date, setDate] = useState(todayDateInput);
  const [preview, setPreview] = useState<DailyPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(
        `/api/admin/competitive/daily?date=${encodeURIComponent(date)}`,
      );
      if (res.status === 401) {
        setError("Нужна авторизация администратора");
        setPreview(null);
        return;
      }
      if (!res.ok) {
        setError(await readError(res));
        setPreview(null);
        return;
      }
      setPreview((await res.json()) as DailyPreview);
    } catch {
      setError("Ошибка сети");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        dailyId?: number;
        message?: string;
      };
      if (!res.ok) {
        const msg = json.error || `Ошибка ${res.status}`;
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(
        json.message ||
          `Competitive daily на ${date} создан` +
            (json.dailyId ? ` (#${json.dailyId})` : ""),
      );
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = Boolean(
    preview &&
      preview.enabled &&
      preview.playableSeason &&
      !preview.existingDaily &&
      preview.candidateCount >= preview.minCandidatesNeeded,
  );

  const blockReason = (() => {
    if (!preview) return null;
    if (!preview.enabled) return "Competitive выключен (флаг)";
    if (!preview.playableSeason) return "Нет playable сезона (active/countdown)";
    if (preview.existingDaily)
      return `Daily уже есть (#${preview.existingDaily.id})`;
    if (preview.candidateCount < preview.minCandidatesNeeded) {
      return `Мало кандидатов: ${preview.candidateCount} / ${preview.minCandidatesNeeded}`;
    }
    return null;
  })();

  return (
    <section className="pixel-container space-y-4 border-4 border-black bg-zinc-900/80 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pixel-text text-xl font-bold text-white">
            Daily (competitive)
          </h2>
          <p className="text-sm text-white/60">
            Превью пар по bands и генерация (MSK date)
          </p>
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

      {error && <ErrorBox message={error} />}

      {loading ? (
        <p className="text-white/60">Загрузка превью…</p>
      ) : preview ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Флаг"
              value={preview.enabled ? "Вкл" : "Выкл"}
              tone={preview.enabled ? "ok" : "warn"}
            />
            <Stat
              label="Сезон"
              value={
                preview.playableSeason
                  ? `#${preview.playableSeason.id} ${preview.playableSeason.name}`
                  : "—"
              }
              tone={preview.playableSeason ? "ok" : "warn"}
            />
            <Stat
              label="Есть daily"
              value={preview.existingDaily ? "Да" : "Нет"}
              tone={preview.existingDaily ? "ok" : "muted"}
            />
            <Stat
              label="Кандидаты"
              value={`${preview.candidateCount} / ${preview.minCandidatesNeeded}`}
              tone={
                preview.candidateCount >= preview.minCandidatesNeeded
                  ? "ok"
                  : "warn"
              }
            />
          </div>

          <p className="text-xs text-white/40">
            Пул enabled: {preview.poolEnabledCount} · sync cooldown:{" "}
            {preview.syncedRows} · дата {preview.date}
            {preview.playableSeason
              ? ` · сезон status=${preview.playableSeason.status}`
              : ""}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-white">
              <thead>
                <tr className="border-b border-zinc-700 text-left text-xs uppercase text-white/50">
                  <th className="py-2 pr-3">Раунды</th>
                  <th className="py-2 pr-3">Δ min</th>
                  <th className="py-2 pr-3">Δ max</th>
                  <th className="py-2">Пар</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {preview.bands.map((b) => (
                  <tr key={`${b.roundStart}-${b.roundEnd}`}>
                    <td className="py-1.5 pr-3 text-white/80">
                      {b.roundStart}–{b.roundEnd}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-white/50">
                      {b.minDelta}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-white/50">
                      {b.maxDelta === Infinity || b.maxDelta > 1e8
                        ? "∞"
                        : b.maxDelta}
                    </td>
                    <td
                      className={`py-1.5 tabular-nums font-bold ${
                        b.pairCount > 0 ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {b.pairCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              disabled={busy || !canGenerate}
              onClick={() => void generate()}
              className="pixel-btn pixel-btn-ok shrink-0 px-4 py-2 text-sm font-bold"
            >
              {busy ? "Генерация…" : `Сгенерировать на ${date}`}
            </button>
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void load()}
              className="pixel-btn shrink-0 px-3 py-2 text-xs font-bold"
            >
              Обновить превью
            </button>
            {!canGenerate && blockReason && (
              <p className="text-xs font-bold leading-snug text-amber-300 sm:max-w-md">
                {blockReason}
              </p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

// ── Shared UI bits ─────────────────────────────────────────────────────────

function ErrorBox({ message }: { message: string }): ReactElement {
  return (
    <p className="border-2 border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-200">
      {message}
    </p>
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
}): ReactElement {
  const color =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-white";
  return (
    <div className="border-2 border-zinc-700 bg-zinc-950 px-3 py-2">
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className={`truncate text-base font-bold ${color}`} title={value}>
        {value}
      </p>
    </div>
  );
}

