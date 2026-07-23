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
  imageUrl: string;
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

/** ISO / Date → value for `<input type="datetime-local">` (local wall time). */
function toDatetimeLocal(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatRu(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU");
}

function snapPct(likes: number, dislikes: number): string {
  const t = likes + dislikes;
  if (t <= 0) return "—";
  return `${Math.round((likes / t) * 100)}%`;
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

type SeasonFormState = {
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;
};

const emptySeasonForm = (): SeasonFormState => ({
  name: "",
  startsAt: "",
  endsAt: "",
  status: "draft",
});

function seasonToForm(s: Season): SeasonFormState {
  return {
    name: s.name,
    startsAt: toDatetimeLocal(s.startsAt),
    endsAt: toDatetimeLocal(s.endsAt),
    status: s.status,
  };
}

function SeasonsSection(): ReactElement {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<SeasonFormState>(emptySeasonForm);
  const [saving, setSaving] = useState(false);

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

  function openCreate() {
    setMode("create");
    setEditId(null);
    setForm(emptySeasonForm());
    setError("");
  }

  function openEdit(s: Season) {
    setMode("edit");
    setEditId(s.id);
    setForm(seasonToForm(s));
    setError("");
  }

  function cancelForm() {
    setMode("list");
    setEditId(null);
    setForm(emptySeasonForm());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.startsAt || !form.endsAt || saving) return;
    setSaving(true);
    setError("");
    const body = {
      name: form.name.trim(),
      startsAt: fromDatetimeLocal(form.startsAt),
      endsAt: fromDatetimeLocal(form.endsAt),
      status: form.status,
    };
    try {
      const res =
        mode === "edit" && editId != null
          ? await apiFetch(`/api/admin/competitive/seasons/${editId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            })
          : await apiFetch("/api/admin/competitive/seasons", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(mode === "edit" ? "Сезон сохранён" : "Сезон создан");
      cancelForm();
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
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
      if (editId === season.id) cancelForm();
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setBusyId(null);
    }
  }

  async function setStatusQuick(season: Season, status: SeasonStatus) {
    if (season.status === status) return;
    setBusyId(season.id);
    setError("");
    try {
      const res = await apiFetch(
        `/api/admin/competitive/seasons/${season.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const msg = await readError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`Статус → ${STATUS_LABEL[status]}`);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="pixel-text text-xl font-bold text-white">Сезоны</h2>
          <p className="text-sm text-white/60">
            Создание, редактирование, статусы, завершение с snapshot рангов
          </p>
        </div>
        {mode === "list" ? (
          <button
            type="button"
            onClick={openCreate}
            className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
          >
            + Новый сезон
          </button>
        ) : (
          <button
            type="button"
            onClick={cancelForm}
            className="pixel-btn px-4 py-2 text-sm font-bold"
          >
            К списку
          </button>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      {(mode === "create" || mode === "edit") && (
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-3 border-2 border-amber-700/50 bg-zinc-950 p-4"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-amber-200/80">
            {mode === "edit" ? `Редактирование #${editId}` : "Новый сезон"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-white/50 sm:col-span-2">
              Название
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                maxLength={120}
                placeholder="Эндовый сезон I"
                className="pixel-input mt-1 block w-full"
              />
            </label>
            <label className="block text-xs text-white/50">
              Начало
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startsAt: e.target.value }))
                }
                required
                className="pixel-input mt-1 block w-full"
              />
            </label>
            <label className="block text-xs text-white/50">
              Конец
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endsAt: e.target.value }))
                }
                required
                className="pixel-input mt-1 block w-full"
              />
            </label>
            <label className="block text-xs text-white/50 sm:col-span-2">
              Статус
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as SeasonStatus,
                  }))
                }
                className="pixel-input mt-1 block w-full max-w-xs"
              >
                {SEASON_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]} ({s})
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-white/35">
                Только один сезон может быть active. Завершение (ended) пишет
                финальные ранги.
              </span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
            >
              {saving
                ? "Сохранение…"
                : mode === "edit"
                  ? "Сохранить"
                  : "Создать"}
            </button>
            <button
              type="button"
              onClick={cancelForm}
              className="pixel-btn px-4 py-2 text-sm font-bold"
            >
              Отмена
            </button>
            {mode === "edit" && editId != null && form.status !== "ended" && (
              <button
                type="button"
                disabled={busyId === editId}
                onClick={() => {
                  const s = seasons.find((x) => x.id === editId);
                  if (s) void endSeason(s);
                }}
                className="pixel-btn pixel-btn-danger px-4 py-2 text-sm font-bold"
              >
                Завершить сезон
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-white/60">Загрузка…</p>
      ) : seasons.length === 0 ? (
        <p className="text-sm text-white/50">
          Сезонов пока нет. Нажми «Новый сезон».
        </p>
      ) : (
        <ul className="space-y-2">
          {seasons.map((s) => (
            <li
              key={s.id}
              className={`border-2 bg-zinc-950 px-3 py-3 ${
                editId === s.id
                  ? "border-amber-500/60"
                  : "border-zinc-700"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="pixel-btn pixel-btn-info px-3 py-1.5 text-xs font-bold"
                  >
                    Редактировать
                  </button>
                  {s.status === "draft" && (
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => void setStatusQuick(s, "countdown")}
                      className="pixel-btn pixel-btn-warn px-3 py-1.5 text-xs font-bold"
                    >
                      → countdown
                    </button>
                  )}
                  {(s.status === "draft" || s.status === "countdown") && (
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => void setStatusQuick(s, "active")}
                      className="pixel-btn pixel-btn-ok px-3 py-1.5 text-xs font-bold"
                    >
                      → active
                    </button>
                  )}
                  {s.status !== "ended" && (
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => void endSeason(s)}
                      className="pixel-btn pixel-btn-danger px-3 py-1.5 text-xs font-bold"
                    >
                      {busyId === s.id ? "…" : "Завершить"}
                    </button>
                  )}
                </div>
              </div>
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

type PoolFilter = "all" | "enabled" | "disabled" | "rotation";

type PoolCandidate = {
  id: number;
  name: string;
  imageUrl: string;
  numberOfLikes: number;
  numberOfDislikes: number;
  totalVotes: number;
};

function PoolSection(): ReactElement {
  const [entries, setEntries] = useState<PoolEntry[]>([]);
  const [candidates, setCandidates] = useState<PoolCandidate[]>([]);
  const [minVotes, setMinVotes] = useState(15);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyScranId, setBusyScranId] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [candFilter, setCandFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<PoolFilter>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [poolRes, candRes] = await Promise.all([
        apiFetch("/api/admin/competitive/pool"),
        apiFetch("/api/admin/competitive/pool/candidates?limit=300"),
      ]);
      if (poolRes.status === 401 || candRes.status === 401) {
        setError("Нужна авторизация администратора");
        return;
      }
      if (!poolRes.ok) {
        setError(await readError(poolRes));
        return;
      }
      if (!candRes.ok) {
        setError(await readError(candRes));
        return;
      }
      const poolJson = (await poolRes.json()) as {
        date: string;
        entries: PoolEntry[];
      };
      const candJson = (await candRes.json()) as {
        minVotes: number;
        candidates: PoolCandidate[];
      };
      setDate(poolJson.date);
      setEntries(poolJson.entries);
      setCandidates(candJson.candidates);
      setMinVotes(candJson.minVotes ?? 15);
      setSelected(new Set());
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible(ids: number[]) {
    setSelected(new Set(ids));
  }

  async function addSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0 || adding) return;
    setAdding(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/competitive/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scranIds: ids }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        addedCount?: number;
        failedCount?: number;
      };
      if (!res.ok) {
        const msg = json.error || `Ошибка ${res.status}`;
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(
        `В пул: ${json.addedCount ?? ids.length}` +
          (json.failedCount ? ` · ошибок: ${json.failedCount}` : ""),
      );
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setAdding(false);
    }
  }

  async function addOne(scranId: number) {
    setBusyScranId(scranId);
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
      toast.success(`#${scranId} → competitive pool`);
      await load();
    } catch {
      setError("Ошибка сети");
      toast.error("Ошибка сети");
    } finally {
      setBusyScranId(null);
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
  let filtered = entries;
  if (statusFilter === "enabled") filtered = filtered.filter((e) => e.enabled);
  if (statusFilter === "disabled") filtered = filtered.filter((e) => !e.enabled);
  if (statusFilter === "rotation")
    filtered = filtered.filter((e) => e.inTodaysRotation);
  if (q) {
    filtered = filtered.filter(
      (e) =>
        String(e.scranId).includes(q) ||
        e.scranName.toLowerCase().includes(q),
    );
  }

  const cq = candFilter.trim().toLowerCase();
  const visibleCandidates = cq
    ? candidates.filter(
        (c) =>
          String(c.id).includes(cq) || c.name.toLowerCase().includes(cq),
      )
    : candidates;

  const enabledCount = entries.filter((e) => e.enabled).length;
  const rotationCount = entries.filter((e) => e.inTodaysRotation).length;

  return (
    <section className="pixel-container space-y-4 border-4 border-black bg-zinc-900/80 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pixel-text text-xl font-bold text-white">Пул</h2>
          <p className="text-sm text-white/60">
            Выбор из одобренных (≥{minVotes} голосов) · bulk · snapshot
            {date ? (
              <span className="text-white/40"> · MSK {date}</span>
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

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="В пуле" value={String(entries.length)} tone="muted" />
        <Stat label="Включено" value={String(enabledCount)} tone="ok" />
        <Stat
          label="В ротации"
          value={String(rotationCount)}
          tone={rotationCount > 0 ? "ok" : "muted"}
        />
        <Stat
          label="Кандидаты"
          value={String(candidates.length)}
          tone={candidates.length > 0 ? "ok" : "warn"}
        />
      </div>

      {error && <ErrorBox message={error} />}

      {/* Candidates picker */}
      <div className="space-y-3 border-2 border-emerald-800/50 bg-zinc-950 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-300/90">
            Добавить из одобренных
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={visibleCandidates.length === 0}
              onClick={() =>
                selectAllVisible(visibleCandidates.map((c) => c.id))
              }
              className="pixel-btn px-3 py-1.5 text-xs font-bold"
            >
              Выбрать все
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setSelected(new Set())}
              className="pixel-btn px-3 py-1.5 text-xs font-bold"
            >
              Снять
            </button>
            <button
              type="button"
              disabled={adding || selected.size === 0}
              onClick={() => void addSelected()}
              className="pixel-btn pixel-btn-ok px-4 py-1.5 text-xs font-bold"
            >
              {adding
                ? "…"
                : `В competitive (${selected.size})`}
            </button>
          </div>
        </div>
        <label className="block text-xs text-white/50">
          Поиск кандидатов
          <input
            type="search"
            value={candFilter}
            onChange={(e) => setCandFilter(e.target.value)}
            placeholder="имя / id…"
            className="pixel-input mt-1 block w-full max-w-md"
          />
        </label>
        {loading ? (
          <p className="text-white/60">Загрузка…</p>
        ) : visibleCandidates.length === 0 ? (
          <p className="text-sm text-white/50">
            Нет кандидатов (нужны approved, ≥{minVotes} голосов, ещё не в пуле).
            Можно добавить кнопку «В competitive» у скрана в списке /admin/scrans.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {visibleCandidates.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 border border-zinc-800 bg-zinc-900/80 px-2 py-1.5 hover:bg-zinc-800/60">
                  <input
                    type="checkbox"
                    className="pixel-check"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                  />
                  <div className="h-10 w-10 shrink-0 overflow-hidden border border-black bg-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm text-white">
                    <span className="font-bold text-amber-200">{c.name}</span>
                    <span className="ml-1.5 text-xs text-white/40">
                      #{c.id} · {c.totalVotes} гол. ·{" "}
                      {snapPct(c.numberOfLikes, c.numberOfDislikes)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busyScranId === c.id || adding}
                    onClick={(e) => {
                      e.preventDefault();
                      void addOne(c.id);
                    }}
                    className="pixel-btn pixel-btn-ok shrink-0 px-2 py-1 text-[10px] font-bold"
                  >
                    +
                  </button>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Current pool */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-[12rem] flex-1 text-xs text-white/50">
          Поиск в пуле
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="поиск…"
            className="pixel-input mt-1 block w-full"
          />
        </label>
        <label className="block text-xs text-white/50">
          Фильтр
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PoolFilter)}
            className="pixel-input mt-1 block w-full min-w-[10rem]"
          >
            <option value="all">Все в пуле</option>
            <option value="enabled">Только вкл</option>
            <option value="disabled">Только выкл</option>
            <option value="rotation">В ротации сегодня</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p className="text-white/60">Загрузка пула…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/50">
          {entries.length === 0 ? "Пул пуст" : "Ничего не найдено"}
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {filtered.map((e) => (
            <li
              key={e.id}
              className={`flex gap-3 border-2 bg-zinc-950 p-3 ${
                e.enabled ? "border-zinc-700" : "border-zinc-800 opacity-70"
              }`}
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden border-2 border-black bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.imageUrl || "/competitive/end_portal.webp"}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={`/admin/scrans?id=${e.scranId}`}
                    className="truncate font-bold text-amber-300 underline-offset-2 hover:underline"
                  >
                    {e.scranName || `Скран #${e.scranId}`}
                  </Link>
                  <span className="text-xs text-white/40">#{e.scranId}</span>
                  {e.inTodaysRotation && (
                    <span className="text-[10px] font-bold uppercase text-sky-300">
                      today
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-white/55">
                  snap {e.likesSnapshot}/{e.dislikesSnapshot} (
                  {snapPct(e.likesSnapshot, e.dislikesSnapshot)}) · live{" "}
                  {e.numberOfLikes}/{e.numberOfDislikes} (
                  {snapPct(e.numberOfLikes, e.numberOfDislikes)})
                </p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  last used: {e.lastUsedDate ?? "—"} ·{" "}
                  {e.enabled ? (
                    <span className="text-emerald-400">вкл</span>
                  ) : (
                    <span className="text-white/40">выкл</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={busyScranId === e.scranId}
                onClick={() => void toggleEnabled(e)}
                className={`pixel-btn h-fit shrink-0 px-3 py-1.5 text-xs font-bold ${
                  e.enabled ? "pixel-btn-warn" : "pixel-btn-ok"
                }`}
              >
                {busyScranId === e.scranId
                  ? "…"
                  : e.enabled
                    ? "Выкл"
                    : "Вкл"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && entries.length > 0 && (
        <p className="text-xs text-white/40">
          В пуле показано: {filtered.length} / {entries.length}
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

