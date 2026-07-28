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
import {
  generateCompetitiveDailyAction,
  getCompetitiveDailyPreviewAction,
  getCompetitiveDebugAction,
  getCompetitiveSeasonDetailAction,
  resetCompetitiveDebugAction,
} from "@/app/actions/admin/queries";
import {
  getCompetitiveIntro,
  getCompetitiveModeRules,
  getCompetitiveSettings,
  listCompetitiveSeasonsAction,
  createCompetitiveSeasonAction,
  updateCompetitiveSeasonAction,
  endCompetitiveSeasonAction,
  addCompetitivePoolEntry,
  getCompetitivePoolAction,
  getCompetitivePoolCandidatesAction,
  setCompetitivePoolEnabledAction,
  saveCompetitiveIntro,
  saveCompetitiveModeRules,
  saveCompetitiveSettings,
} from "@/app/admin/competitive-actions";
import { ContentDocEditor } from "@/components/admin/content-doc-editor";
import {
  emptyContentDoc,
  parseContentDoc,
  parseSeasonThemeConfig,
  type CompetitiveContentDoc,
} from "@/lib/competitive/content";
import { Pagination } from "@/components/admin/pagination";

// ── Types ──────────────────────────────────────────────────────────────────

type SeasonStatus = "draft" | "countdown" | "active" | "ended";

type Season = {
  id: number;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;
  themeKey: string | null;
  themeConfig?: unknown;
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

type SeasonDetailRank = {
  rank: number;
  userId: number;
  displayNameSnapshot: string | null;
  points: number;
  daysPlayed: number;
  hits: number;
};

type SeasonDetailScran = {
  id: number;
  name: string;
  imageUrl: string;
};

type SeasonDetailRound = {
  roundNumber: number;
  scranA: SeasonDetailScran;
  scranB: SeasonDetailScran;
  likesA: number;
  dislikesA: number;
  likesB: number;
  dislikesB: number;
};

type SeasonDetailDaily = {
  date: string;
  rounds: SeasonDetailRound[];
};

type SeasonDetail = {
  season: {
    id: number;
    name: string;
    status: SeasonStatus;
    startsAt: string;
    endsAt: string;
    themeKey: string | null;
  };
  finalRanks: SeasonDetailRank[];
  dailies: SeasonDetailDaily[];
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

// ── Main panel ─────────────────────────────────────────────────────────────

export function CompetitivePanel(): ReactElement {
  return (
    <div className="space-y-6">
      <SettingsSection />
      <IntroSection />
      <DebugSection />
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
  const [modeRules, setModeRules] =
    useState<CompetitiveContentDoc>(emptyContentDoc());
  const [rulesSaving, setRulesSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsResult, rulesResult] = await Promise.all([
        getCompetitiveSettings(),
        getCompetitiveModeRules(),
      ]);
      if (!settingsResult.success) {
        setError(settingsResult.message);
        return;
      }
      setEnabled(settingsResult.data.competitiveEnabled);
      if (rulesResult.success) {
        setModeRules(parseContentDoc(rulesResult.data.doc));
      }
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
      const result = await saveCompetitiveSettings(!enabled);
      if (!result.success) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      setEnabled(result.data.competitiveEnabled);
      toast.success(
        result.data.competitiveEnabled
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

  async function saveModeRules() {
    if (rulesSaving) return;
    setRulesSaving(true);
    try {
      const result = await saveCompetitiveModeRules(modeRules);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setModeRules(parseContentDoc(result.data.doc));
      toast.success("Правила режима сохранены");
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setRulesSaving(false);
    }
  }

  return (
    <section className="pixel-container space-y-3 border-4 border-black bg-zinc-900/80 p-4">
      <div>
        <h2 className="pixel-text text-xl font-bold text-white">Настройки</h2>
        <p className="text-sm text-white/60">
          Глобальный флаг competitive daily (cron, hub, play) и правила режима
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

      <ContentDocEditor
        label="Правила режима (глобально)"
        doc={modeRules}
        onChange={setModeRules}
        disabled={loading || rulesSaving}
      />
      <button
        type="button"
        disabled={loading || rulesSaving}
        onClick={() => void saveModeRules()}
        className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
      >
        {rulesSaving ? "Сохранение…" : "Сохранить правила режима"}
      </button>
    </section>
  );
}

// ── Intro modal ────────────────────────────────────────────────────────────

function IntroSection(): ReactElement {
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getCompetitiveIntro();
      if (!result.success) {
        setError(result.message);
        return;
      }
      setEnabled(result.data.intro.enabled);
      setTitle(result.data.intro.title);
      setBody(result.data.intro.body);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveCompetitiveIntro({ enabled, title, body });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setEnabled(result.data.intro.enabled);
      setTitle(result.data.intro.title);
      setBody(result.data.intro.body);
      toast.success("Intro-модалка сохранена");
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pixel-container space-y-3 border-4 border-black bg-zinc-900/80 p-4">
      <div>
        <h2 className="pixel-text text-xl font-bold text-white">
          Intro-модалка Ranked
        </h2>
        <p className="text-sm text-white/60">
          Показывается один раз при первом заходе (после псевдонима, если он
          спрашивался). Markdown. Сброс — в «Отладка аккаунта».
        </p>
      </div>
      {error && <ErrorBox message={error} />}
      {loading ? (
        <p className="text-white/50">Загрузка…</p>
      ) : (
        <>
          <label className="flex items-center gap-3 border-2 border-zinc-700 bg-zinc-950 p-3">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-bold text-white">
              Показывать intro-модалку
            </span>
          </label>
          <label className="block text-xs text-white/50">
            Заголовок
            <input
              type="text"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              className="pixel-input mt-1 block w-full"
              disabled={saving}
            />
          </label>
          <label className="block text-xs text-white/50">
            Текст (Markdown)
            <textarea
              value={body}
              maxLength={4000}
              rows={8}
              onChange={(e) => setBody(e.target.value)}
              className="pixel-input mt-1 block w-full font-mono text-sm"
              disabled={saving}
              placeholder="Текст приветствия…"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
          >
            {saving ? "Сохранение…" : "Сохранить intro"}
          </button>
        </>
      )}
    </section>
  );
}

// ── Account debug ──────────────────────────────────────────────────────────

function DebugSection(): ReactElement {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"userId" | "telegramId">("telegramId");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    user: {
      id: number;
      telegramId: number;
      telegramUsername: string | null;
      competitiveDisplayName: string | null;
    };
    prefs: { introDismissed: boolean; nickPromptDismissed: boolean };
    freezesUsed: number;
    resultsCount: number;
    standingsCount: number;
  } | null>(null);
  const [flags, setFlags] = useState({
    resetModals: true,
    resetFreeze: true,
    resetNick: false,
    resetStandings: false,
    resetResults: false,
  });

  async function lookup() {
    const q = query.trim();
    if (!q) {
      toast.error("Введи ID");
      return;
    }
    setLoading(true);
    setSnapshot(null);
    try {
      const result = await getCompetitiveDebugAction(
        mode === "userId" ? { userId: q } : { telegramId: q },
      );
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setSnapshot(result.data as typeof snapshot);
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    if (!snapshot || busy) return;
    if (!Object.values(flags).some(Boolean)) {
      toast.error("Выбери хотя бы один пункт");
      return;
    }
    if (
      flags.resetResults &&
      !window.confirm(
        "Удалить ВСЕ competitive results? Стрик и дневные очки обнулятся.",
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await resetCompetitiveDebugAction({
        userId: snapshot.user.id,
        ...flags,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      const json = result.data as { done: string[] };
      toast.success(`Сброшено: ${json.done.join(", ")}`);
      await lookup();
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pixel-container space-y-3 border-4 border-black bg-zinc-900/80 p-4">
      <div>
        <h2 className="pixel-text text-xl font-bold text-white">
          Отладка аккаунта
        </h2>
        <p className="text-sm text-white/60">
          Сброс модалок, заморозки, псевдонима, standings / results.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs text-white/50">
          Искать по
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "userId" | "telegramId")}
            className="pixel-input mt-1 block min-w-[10rem]"
          >
            <option value="telegramId">Telegram ID</option>
            <option value="userId">User ID</option>
          </select>
        </label>
        <label className="block min-w-[12rem] flex-1 text-xs text-white/50">
          ID
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pixel-input mt-1 block w-full"
            placeholder={mode === "telegramId" ? "123456789" : "42"}
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void lookup()}
          className="pixel-btn px-4 py-2 text-sm font-bold"
        >
          {loading ? "…" : "Найти"}
        </button>
      </div>

      {snapshot ? (
        <div className="space-y-3 border-2 border-zinc-700 bg-zinc-950 p-3 text-sm text-white/80">
          <p>
            <span className="text-white/50">user </span>#{snapshot.user.id}
            {" · "}
            <span className="text-white/50">tg </span>
            {snapshot.user.telegramId}
            {snapshot.user.telegramUsername
              ? ` (@${snapshot.user.telegramUsername})`
              : ""}
          </p>
          <p>
            nick:{" "}
            <span className="text-amber-200">
              {snapshot.user.competitiveDisplayName || "—"}
            </span>
            {" · "}
            intro dismissed: {String(snapshot.prefs.introDismissed)}
            {" · "}
            nick prompt dismissed: {String(snapshot.prefs.nickPromptDismissed)}
          </p>
          <p>
            freezes used: {snapshot.freezesUsed}
            {" · "}
            results: {snapshot.resultsCount}
            {" · "}
            standings: {snapshot.standingsCount}
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["resetModals", "Модалки (intro + nick prompt)"],
                ["resetFreeze", "Заморозка (все сезоны)"],
                ["resetNick", "Псевдоним Ranked"],
                ["resetStandings", "Standings (очки сезонов)"],
                ["resetResults", "Results (стрик + дни) ⚠"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-xs text-white/75"
              >
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={(e) =>
                    setFlags((f) => ({ ...f, [key]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void reset()}
            className="pixel-btn pixel-btn-danger px-4 py-2 text-sm font-bold"
          >
            {busy ? "…" : "Сбросить выбранное"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

// ── Seasons ────────────────────────────────────────────────────────────────

type SeasonFormState = {
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;
  rules: CompetitiveContentDoc;
  rewards: CompetitiveContentDoc;
};

const emptySeasonForm = (): SeasonFormState => ({
  name: "",
  startsAt: "",
  endsAt: "",
  status: "draft",
  rules: emptyContentDoc(),
  rewards: emptyContentDoc(),
});

function seasonToForm(s: Season): SeasonFormState {
  const theme = parseSeasonThemeConfig(s.themeConfig);
  return {
    name: s.name,
    startsAt: toDatetimeLocal(s.startsAt),
    endsAt: toDatetimeLocal(s.endsAt),
    status: s.status,
    rules: theme.rules ?? emptyContentDoc(),
    rewards: theme.rewards ?? emptyContentDoc(),
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

  const [viewId, setViewId] = useState<number | null>(null);
  const [detail, setDetail] = useState<SeasonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listCompetitiveSeasonsAction();
      if (!result.success) {
        if (result.message === "Unauthorized") {
          setError("Нужна авторизация администратора");
        } else {
          setError(result.message);
        }
        return;
      }
      setSeasons(result.data as Season[]);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openView(season: Season) {
    if (viewId === season.id && detail) {
      // Toggle closed if already open for this season
      setViewId(null);
      setDetail(null);
      setDetailError("");
      return;
    }
    setViewId(season.id);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const result = await getCompetitiveSeasonDetailAction(season.id);
      if (!result.success) {
        setDetailError(
          result.message === "Unauthorized"
            ? "Нужна авторизация администратора"
            : result.message,
        );
        return;
      }
      setDetail(result.data as SeasonDetail);
    } catch {
      setDetailError("Ошибка сети");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeView() {
    setViewId(null);
    setDetail(null);
    setDetailError("");
    setDetailLoading(false);
  }

  function openCreate() {
    setMode("create");
    setEditId(null);
    setForm(emptySeasonForm());
    setError("");
    closeView();
  }

  function openEdit(s: Season) {
    setMode("edit");
    setEditId(s.id);
    setForm(seasonToForm(s));
    setError("");
    closeView();
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
      themeConfig: {
        rules: form.rules,
        rewards: form.rewards,
      },
    };
    try {
      const result =
        mode === "edit" && editId != null
          ? await updateCompetitiveSeasonAction({ id: editId, ...body })
          : await createCompetitiveSeasonAction(body);
      if (!result.success) {
        const msg = result.message;
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
      const result = await endCompetitiveSeasonAction(season.id);
      if (!result.success) {
        const msg = result.message;
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
      const result = await updateCompetitiveSeasonAction({
        id: season.id,
        status,
      });
      if (!result.success) {
        const msg = result.message;
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
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

          <ContentDocEditor
            label="Правила сезона (категории + ассеты)"
            doc={form.rules}
            onChange={(rules) => setForm((f) => ({ ...f, rules }))}
            disabled={saving}
          />
          <ContentDocEditor
            label="Награды сезона (категории + ассеты)"
            doc={form.rewards}
            onChange={(rewards) => setForm((f) => ({ ...f, rewards }))}
            disabled={saving}
          />

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
                editId === s.id ? "border-amber-500/60" : "border-zinc-700"
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
                    onClick={() => void openView(s)}
                    disabled={detailLoading && viewId === s.id}
                    className={`pixel-btn px-3 py-1.5 text-xs font-bold ${
                      viewId === s.id ? "pixel-btn-warn" : ""
                    }`}
                  >
                    {detailLoading && viewId === s.id
                      ? "…"
                      : viewId === s.id
                        ? "Скрыть"
                        : "Просмотр"}
                  </button>
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

              {viewId === s.id && (
                <SeasonDetailPanel
                  loading={detailLoading}
                  error={detailError}
                  detail={detail}
                  onClose={closeView}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SeasonDetailPanel({
  loading,
  error,
  detail,
  onClose,
}: {
  loading: boolean;
  error: string;
  detail: SeasonDetail | null;
  onClose: () => void;
}): ReactElement {
  if (loading) {
    return (
      <div className="mt-3 border-2 border-zinc-700 bg-zinc-900/80 p-3">
        <p className="text-sm text-white/60">Загрузка деталей сезона…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 space-y-2 border-2 border-red-800/60 bg-zinc-900/80 p-3">
        <ErrorBox message={error} />
        <button
          type="button"
          onClick={onClose}
          className="pixel-btn px-3 py-1.5 text-xs font-bold"
        >
          Закрыть
        </button>
      </div>
    );
  }

  if (!detail) return <></>;

  const ranksSource =
    detail.season.status === "ended" ? "Финальные ранги" : "Живые standings";

  return (
    <div className="mt-3 space-y-4 border-2 border-amber-700/40 bg-zinc-900/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-amber-200/80">
            Просмотр · #{detail.season.id}
          </p>
          <p className="text-sm text-white/70">
            {detail.season.name} · <StatusBadge status={detail.season.status} />
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {formatRu(detail.season.startsAt)} →{" "}
            {formatRu(detail.season.endsAt)}
            {detail.season.themeKey
              ? ` · theme: ${detail.season.themeKey}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="pixel-btn px-3 py-1.5 text-xs font-bold"
        >
          Закрыть
        </button>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/70">
          {ranksSource} ({detail.finalRanks.length})
        </h4>
        {detail.finalRanks.length === 0 ? (
          <p className="text-sm text-white/45">Рангов пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-700 text-white/50">
                  <th className="px-2 py-1.5 font-bold">#</th>
                  <th className="px-2 py-1.5 font-bold">Ник</th>
                  <th className="px-2 py-1.5 font-bold">userId</th>
                  <th className="px-2 py-1.5 font-bold">очки</th>
                  <th className="px-2 py-1.5 font-bold">дней</th>
                  <th className="px-2 py-1.5 font-bold">хиты</th>
                </tr>
              </thead>
              <tbody>
                {detail.finalRanks.map((r) => (
                  <tr
                    key={`${r.rank}-${r.userId}`}
                    className="border-b border-zinc-800 text-white/85"
                  >
                    <td className="px-2 py-1.5 font-bold text-amber-200/90">
                      {r.rank}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.displayNameSnapshot?.trim() || `Игрок #${r.userId}`}
                    </td>
                    <td className="px-2 py-1.5 text-white/45">{r.userId}</td>
                    <td className="px-2 py-1.5">{r.points}</td>
                    <td className="px-2 py-1.5">{r.daysPlayed}</td>
                    <td className="px-2 py-1.5">{r.hits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/70">
          Дни и раунды ({detail.dailies.length})
        </h4>
        {detail.dailies.length === 0 ? (
          <p className="text-sm text-white/45">
            Дней для этого сезона ещё нет.
          </p>
        ) : (
          <ul className="space-y-3">
            {detail.dailies.map((day) => (
              <li
                key={day.date}
                className="border border-zinc-700 bg-zinc-950/80 p-2"
              >
                <p className="mb-2 text-xs font-bold text-emerald-300/90">
                  {day.date} · {day.rounds.length} раунд
                  {day.rounds.length === 1 ? "" : "ов"}
                </p>
                {day.rounds.length === 0 ? (
                  <p className="text-xs text-white/40">Раундов нет</p>
                ) : (
                  <ul className="space-y-1.5">
                    {day.rounds.map((round) => {
                      const pctA = snapPct(round.likesA, round.dislikesA);
                      const pctB = snapPct(round.likesB, round.dislikesB);
                      return (
                        <li
                          key={round.roundNumber}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/80"
                        >
                          <span className="w-8 shrink-0 font-bold text-white/50">
                            R{round.roundNumber}
                          </span>
                          <span className="min-w-0">
                            <span className="font-bold text-sky-200/90">
                              {round.scranA.name}
                            </span>
                            <span className="text-white/40">
                              {" "}
                              ({pctA}, {round.likesA}/{round.dislikesA})
                            </span>
                          </span>
                          <span className="text-white/35">vs</span>
                          <span className="min-w-0">
                            <span className="font-bold text-fuchsia-200/90">
                              {round.scranB.name}
                            </span>
                            <span className="text-white/40">
                              {" "}
                              ({pctB}, {round.likesB}/{round.dislikesB})
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
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
const POOL_PAGE_SIZE = 20;

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
  const [poolPage, setPoolPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [poolResult, candidatesResult] = await Promise.all([
        getCompetitivePoolAction(),
        getCompetitivePoolCandidatesAction(300),
      ]);
      if (!poolResult.success) {
        setError(
          poolResult.message === "Unauthorized"
            ? "Нужна авторизация администратора"
            : poolResult.message,
        );
        return;
      }
      if (!candidatesResult.success) {
        setError(
          candidatesResult.message === "Unauthorized"
            ? "Нужна авторизация администратора"
            : candidatesResult.message,
        );
        return;
      }
      setDate(poolResult.data.date);
      setEntries(poolResult.data.entries as PoolEntry[]);
      setCandidates(candidatesResult.data.candidates as PoolCandidate[]);
      setMinVotes(candidatesResult.data.minVotes ?? 15);
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
      const results = await Promise.all(
        ids.map((scranId) => addCompetitivePoolEntry(scranId)),
      );
      const addedCount = results.filter((result) => result.success).length;
      const failedCount = results.length - addedCount;
      toast.success(
        `В пул: ${addedCount}` +
          (failedCount ? ` · ошибок: ${failedCount}` : ""),
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
      const result = await addCompetitivePoolEntry(scranId);
      if (!result.success) {
        const msg = result.message;
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
      const result = await setCompetitivePoolEnabledAction({
        scranId: entry.scranId,
        enabled: !entry.enabled,
      });
      if (!result.success) {
        const msg = result.message;
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
  if (statusFilter === "disabled")
    filtered = filtered.filter((e) => !e.enabled);
  if (statusFilter === "rotation")
    filtered = filtered.filter((e) => e.inTodaysRotation);
  if (q) {
    filtered = filtered.filter(
      (e) =>
        String(e.scranId).includes(q) || e.scranName.toLowerCase().includes(q),
    );
  }
  const poolTotalPages = Math.max(1, Math.ceil(filtered.length / POOL_PAGE_SIZE));
  const visiblePoolPage = Math.min(poolPage, poolTotalPages);
  const paginatedEntries = filtered.slice(
    (visiblePoolPage - 1) * POOL_PAGE_SIZE,
    visiblePoolPage * POOL_PAGE_SIZE,
  );

  const cq = candFilter.trim().toLowerCase();
  const visibleCandidates = cq
    ? candidates.filter(
        (c) => String(c.id).includes(cq) || c.name.toLowerCase().includes(cq),
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
            {date ? <span className="text-white/40"> · MSK {date}</span> : null}
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
              {adding ? "…" : `В competitive (${selected.size})`}
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
            Можно добавить кнопку «В competitive» у скрана в списке
            /admin/scrans.
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
            onChange={(e) => {
              setFilter(e.target.value);
              setPoolPage(1);
            }}
            placeholder="поиск…"
            className="pixel-input mt-1 block w-full"
          />
        </label>
        <label className="block text-xs text-white/50">
          Фильтр
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as PoolFilter);
              setPoolPage(1);
            }}
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
          {paginatedEntries.map((e) => (
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
                {busyScranId === e.scranId ? "…" : e.enabled ? "Выкл" : "Вкл"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && filtered.length > 0 && (
        <Pagination
          currentPage={visiblePoolPage}
          totalPages={poolTotalPages}
          onPageChange={setPoolPage}
        />
      )}
      {!loading && entries.length > 0 && (
        <p className="text-xs text-white/40">
          {filtered.length === entries.length
            ? `В пуле: ${entries.length}`
            : `Найдено: ${filtered.length} из ${entries.length}`}
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
      const result = await getCompetitiveDailyPreviewAction(date);
      if (!result.success) {
        setError(
          result.message === "Unauthorized"
            ? "Нужна авторизация администратора"
            : result.message,
        );
        setPreview(null);
        return;
      }
      setPreview(result.data as DailyPreview);
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
      const result = await generateCompetitiveDailyAction(date);
      const json = (result.success ? result.data : {}) as {
        error?: string;
        dailyId?: number;
        message?: string;
      };
      if (!result.success) {
        const msg = result.message;
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
    if (!preview.playableSeason)
      return "Нет playable сезона (active/countdown)";
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
