"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelAdminCustomDailyEvent,
  createAdminCustomDailyEvent,
  getAdminCustomDailyEvent,
  listAdminCustomDailyEvents,
  publishAdminCustomDailyEvent,
  searchApprovedCustomDailyScrans,
  updateAdminCustomDailyEvent,
  type CustomDailyDetail,
  type CustomDailyStatus,
  type CustomDailySummary,
} from "@/app/actions/admin-custom-daily";
import { todayMskDate } from "@/lib/daily-timezone";

export type CustomDailyScranChoice = Readonly<{
  id: number;
  name: string;
  imageUrl: string | null;
  price: number;
}>;

type Props = Readonly<{
  bulkScrans?: CustomDailyScranChoice[];
  bulkRevision?: number;
  initialEventId?: number | null;
  onActiveEventChange?: (id: number | null) => void;
  onPublished?: () => void | Promise<void>;
}>;

const EMPTY_EDITOR = {
  id: null as number | null,
  name: "",
  targetDate: todayMskDate(),
  notifyAuthors: false,
  status: "draft" as CustomDailyStatus,
  entries: [] as CustomDailyScranChoice[],
};

export function CustomDailyBuilder({
  bulkScrans = [],
  bulkRevision = 0,
  initialEventId = null,
  onActiveEventChange,
  onPublished,
}: Props): ReactElement {
  const [events, setEvents] = useState<CustomDailySummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<CustomDailyScranChoice[]>([]);
  const appliedBulkRevisionRef = useRef(0);

  const readOnly = editor.status !== "draft";

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const result = await listAdminCustomDailyEvents();
      if (result.ok) setEvents(result.data);
      else toast.error(result.message);
    } catch {
      toast.error("Не удалось загрузить события");
    } finally {
      setEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const newDraft = () => {
    setEditor({ ...EMPTY_EDITOR, targetDate: todayMskDate(), entries: [] });
    setResults([]);
    setSearch("");
    onActiveEventChange?.(null);
  };

  const openEvent = useCallback(async (id: number) => {
    setBusy(true);
    try {
      const result = await getAdminCustomDailyEvent(id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const detail: CustomDailyDetail = result.data;
      setEditor({
        id: detail.id,
        name: detail.name,
        targetDate: detail.targetDate,
        notifyAuthors: detail.notifyAuthors,
        status: detail.status,
        entries: [...detail.entries]
          .sort((a, b) => a.position - b.position)
          .map((entry) => ({
            id: entry.id,
            name: entry.name,
            imageUrl: entry.imageUrl,
            price: entry.price,
          })),
      });
      onActiveEventChange?.(detail.id);
    } catch {
      toast.error("Не удалось открыть событие");
    } finally {
      setBusy(false);
    }
  }, [onActiveEventChange]);

  useEffect(() => {
    if (initialEventId) void openEvent(initialEventId);
  }, [initialEventId, openEvent]);

  useEffect(() => {
    if (
      bulkRevision === 0
      || bulkScrans.length === 0
      || appliedBulkRevisionRef.current >= bulkRevision
    ) return;
    // The builder remounts when returning from the scran table. Wait until the
    // remembered draft is loaded so bulk entries append instead of being overwritten.
    if (initialEventId && editor.id === null) return;
    if (editor.status !== "draft") {
      toast.error("Открытое событие уже нельзя редактировать — выбери черновик");
      return;
    }
    const known = new Set(editor.entries.map((entry) => entry.id));
    const available = bulkScrans.filter((entry) => !known.has(entry.id));
    const room = Math.max(0, 20 - editor.entries.length);
    const added = available.slice(0, room);
    if (added.length === 0) {
      toast.info("Выбранные блюда уже добавлены или список заполнен");
      return;
    }
    appliedBulkRevisionRef.current = bulkRevision;
    setEditor((current) => ({ ...current, entries: [...current.entries, ...added] }));
    toast.success(`В черновик добавлено: ${added.length}`);
    if (available.length > added.length) {
      toast.warning(`Не поместилось: ${available.length - added.length} — лимит 20 блюд`);
    }
  }, [bulkRevision, bulkScrans, editor.id, editor.status, editor.entries, initialEventId]);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    setSearching(true);
    try {
      const result = await searchApprovedCustomDailyScrans(query);
      if (result.ok) setResults(result.data as CustomDailyScranChoice[]);
      else toast.error(result.message);
    } catch {
      toast.error("Поиск не сработал");
    } finally {
      setSearching(false);
    }
  };

  const addScran = (scran: CustomDailyScranChoice) => {
    setEditor((current) => {
      if (current.entries.some((entry) => entry.id === scran.id)) {
        toast.info("Это блюдо уже в событии");
        return current;
      }
      if (current.entries.length >= 20) {
        toast.error("В событии уже 20 блюд");
        return current;
      }
      return { ...current, entries: [...current.entries, scran] };
    });
  };

  const removeScran = (index: number) => {
    setEditor((current) => ({
      ...current,
      entries: current.entries.filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  const moveScran = (index: number, delta: -1 | 1) => {
    setEditor((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.entries.length) return current;
      const entries = [...current.entries];
      [entries[index], entries[target]] = [entries[target], entries[index]];
      return { ...current, entries };
    });
  };

  const swapPair = (pairIndex: number) => {
    setEditor((current) => {
      const left = pairIndex * 2;
      const right = left + 1;
      if (!current.entries[right]) return current;
      const entries = [...current.entries];
      [entries[left], entries[right]] = [entries[right], entries[left]];
      return { ...current, entries };
    });
  };

  const shuffleEntries = () => {
    setEditor((current) => {
      const entries = [...current.entries];
      for (let index = entries.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [entries[index], entries[target]] = [entries[target], entries[index]];
      }
      return { ...current, entries };
    });
  };

  const save = async (): Promise<number | null> => {
    if (!editor.name.trim()) {
      toast.error("Укажи название события");
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editor.targetDate)) {
      toast.error("Укажи дату события");
      return null;
    }
    setBusy(true);
    try {
      const input = {
        name: editor.name,
        targetDate: editor.targetDate,
        notifyAuthors: editor.notifyAuthors,
        scranIds: editor.entries.map((entry) => entry.id),
        bulkAssisted: bulkRevision > 0,
      };
      const result = editor.id
        ? await updateAdminCustomDailyEvent({ id: editor.id, ...input })
        : await createAdminCustomDailyEvent(input);
      if (!result.ok) {
        toast.error(result.message);
        return null;
      }
      const detail: CustomDailyDetail = result.data;
      setEditor((current) => ({ ...current, id: detail.id }));
      onActiveEventChange?.(detail.id);
      await loadEvents();
      toast.success("Черновик сохранён");
      return detail.id;
    } catch {
      toast.error("Не удалось сохранить черновик");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (editor.entries.length !== 20) {
      toast.error("Для публикации нужно ровно 20 блюд");
      return;
    }
    const id = await save();
    if (!id) return;
    if (!window.confirm(`Опубликовать «${editor.name.trim()}» на ${editor.targetDate}?`)) return;
    setBusy(true);
    try {
      const result = await publishAdminCustomDailyEvent(id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Событие опубликовано");
      await Promise.all([loadEvents(), openEvent(id), onPublished?.()]);
    } catch {
      toast.error("Не удалось опубликовать событие");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!editor.id || !window.confirm(`Отменить событие «${editor.name}»?`)) return;
    setBusy(true);
    try {
      const result = await cancelAdminCustomDailyEvent(editor.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Событие отменено");
      await Promise.all([loadEvents(), openEvent(editor.id), onPublished?.()]);
    } catch {
      toast.error("Не удалось отменить событие");
    } finally {
      setBusy(false);
    }
  };

  const pairs = useMemo(
    () => Array.from({ length: 10 }, (_, index) => editor.entries.slice(index * 2, index * 2 + 2)),
    [editor.entries],
  );

  return (
    <div className="space-y-4 [font-family:var(--font-pixel)]">
      <section className="border-2 border-violet-700 bg-violet-950/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-violet-200">
              <CalendarDays aria-hidden="true" className="h-4 w-4" /> События
            </h3>
            <p className="mt-1 text-[10px] text-white/50">Черновики и опубликованные тематические Daily</p>
          </div>
          <button type="button" onClick={newDraft} className="pixel-btn pixel-btn-info cursor-pointer px-3 py-2 text-xs font-bold">
            <Plus aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" /> Новое событие
          </button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {eventsLoading ? <span className="text-xs text-white/50">Загрузка…</span> : null}
          {!eventsLoading && events.length === 0 ? <span className="text-xs text-white/40">Событий пока нет</span> : null}
          {events.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openEvent(item.id)}
              className={`min-w-44 cursor-pointer border-2 p-2 text-left text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 ${editor.id === item.id ? "border-violet-300 bg-violet-900/50" : "border-zinc-700 bg-zinc-950 hover:border-violet-600"}`}
            >
              <span className="block truncate font-bold text-white">{item.name}</span>
              <span className="mt-1 block text-white/50">{item.targetDate} · {statusLabel(item.status)} · {item.entryCount}/20</span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-2 border-zinc-700 bg-zinc-950 p-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <label className="text-[10px] font-bold uppercase tracking-wide text-white/60">
            Название
            <input
              value={editor.name}
              disabled={readOnly}
              maxLength={120}
              onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
              className="pixel-input mt-1 w-full"
              placeholder="Например: Битва бургеров"
            />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wide text-white/60">
            Дата (МСК)
            <input
              type="date"
              value={editor.targetDate}
              disabled={readOnly}
              onChange={(event) => setEditor((current) => ({ ...current, targetDate: event.target.value }))}
              className="pixel-input mt-1 w-full"
            />
          </label>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-white/70">
          <input
            type="checkbox"
            checked={editor.notifyAuthors}
            disabled={readOnly}
            onChange={(event) => setEditor((current) => ({ ...current, notifyAuthors: event.target.checked }))}
            className="pixel-check"
          />
          Уведомить авторов после публикации
        </label>
      </section>

      {!readOnly ? (
        <form onSubmit={(event) => void runSearch(event)} className="flex flex-col gap-2 border-2 border-sky-800 bg-sky-950/20 p-3 sm:flex-row">
          <label className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wide text-sky-200">
            Найти одобренное блюдо
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="pixel-input mt-1 w-full" placeholder="Название или ID" />
          </label>
          <button disabled={searching || !search.trim()} className="pixel-btn pixel-btn-info cursor-pointer self-end px-4 py-2 text-xs font-bold">
            <Search aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" /> {searching ? "Ищу…" : "Найти"}
          </button>
        </form>
      ) : null}

      {results.length > 0 && !readOnly ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((scran) => (
            <button key={scran.id} type="button" onClick={() => addScran(scran)} disabled={editor.entries.some((entry) => entry.id === scran.id)} className="flex cursor-pointer items-center gap-2 border-2 border-zinc-700 bg-zinc-900 p-2 text-left hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-40">
              <ScranThumb scran={scran} />
              <span className="min-w-0"><span className="block truncate text-xs font-bold text-white">{scran.name}</span><span className="text-[10px] text-white/45">#{scran.id} · {formatPrice(scran.price)}</span></span>
              <Plus aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 text-sky-300" />
            </button>
          ))}
        </div>
      ) : null}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white">Сетка пар <span className={editor.entries.length === 20 ? "text-emerald-300" : "text-amber-300"}>{editor.entries.length}/20</span></h3>
          {!readOnly ? (
            <button type="button" disabled={editor.entries.length < 2} onClick={shuffleEntries} className="pixel-btn cursor-pointer px-3 py-1.5 text-xs font-bold">
              <Shuffle aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" /> Перемешать
            </button>
          ) : <span className="border border-violet-500 bg-violet-950 px-2 py-1 text-[10px] font-bold text-violet-200">{statusLabel(editor.status)}</span>}
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          {pairs.map((pair, pairIndex) => (
            <div key={pairIndex} className="border-2 border-zinc-700 bg-zinc-900 p-2">
              <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-white/45">
                <span>Раунд {pairIndex + 1}</span>
                {!readOnly && pair.length === 2 ? <button type="button" onClick={() => swapPair(pairIndex)} className="cursor-pointer text-violet-300 hover:text-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300" aria-label={`Поменять стороны в раунде ${pairIndex + 1}`}><RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /></button> : null}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                <PairSlot scran={pair[0]} index={pairIndex * 2} readOnly={readOnly} onMove={moveScran} onRemove={removeScran} />
                <span className="self-center text-[10px] font-black text-amber-300">VS</span>
                <PairSlot scran={pair[1]} index={pairIndex * 2 + 1} readOnly={readOnly} onMove={moveScran} onRemove={removeScran} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 border-2 border-zinc-600 bg-zinc-950/95 p-3 shadow-[4px_4px_0_rgba(0,0,0,0.6)]">
        {!readOnly ? (
          <>
            <button type="button" disabled={busy} onClick={() => void save()} className="pixel-btn cursor-pointer px-4 py-2 text-xs font-bold"><Save aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" /> Сохранить черновик</button>
            <button type="button" disabled={busy || editor.entries.length !== 20} onClick={() => void publish()} className="pixel-btn pixel-btn-ok cursor-pointer px-4 py-2 text-xs font-bold"><Send aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" /> Опубликовать</button>
          </>
        ) : null}
        {editor.id && editor.status !== "cancelled" ? <button type="button" disabled={busy} onClick={() => void cancel()} className="pixel-btn pixel-btn-danger ml-auto cursor-pointer px-4 py-2 text-xs font-bold"><X aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" /> Отменить событие</button> : null}
      </div>
    </div>
  );
}

function PairSlot({ scran, index, readOnly, onMove, onRemove }: Readonly<{ scran?: CustomDailyScranChoice; index: number; readOnly: boolean; onMove: (index: number, delta: -1 | 1) => void; onRemove: (index: number) => void }>): ReactElement {
  if (!scran) return <div className="flex min-h-20 items-center justify-center border-2 border-dashed border-zinc-700 text-[9px] text-white/25">пусто</div>;
  return (
    <div className="min-w-0 border border-zinc-700 bg-zinc-950 p-1.5">
      <div className="flex min-w-0 items-center gap-1.5"><ScranThumb scran={scran} /><span className="min-w-0"><span className="block truncate text-[10px] font-bold text-white">{scran.name}</span><span className="text-[9px] text-white/40">#{scran.id}</span></span></div>
      {!readOnly ? <div className="mt-1.5 flex justify-end gap-1"><MiniButton label={`Поднять ${scran.name}`} disabled={index === 0} onClick={() => onMove(index, -1)} icon={ArrowUp} /><MiniButton label={`Опустить ${scran.name}`} disabled={index === 19} onClick={() => onMove(index, 1)} icon={ArrowDown} /><MiniButton label={`Убрать ${scran.name}`} onClick={() => onRemove(index)} icon={Trash2} danger /></div> : null}
    </div>
  );
}

function ScranThumb({ scran }: Readonly<{ scran: CustomDailyScranChoice }>): ReactElement {
  return scran.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- admin URLs can be external and are already thumbnail-sized.
    <img src={scran.imageUrl} alt="" className="h-10 w-10 shrink-0 border border-black object-cover" />
  ) : <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-zinc-700 bg-zinc-800 text-[8px] text-white/30">#{scran.id}</span>;
}

function MiniButton({ label, icon: Icon, onClick, disabled = false, danger = false }: Readonly<{ label: string; icon: typeof ArrowUp; onClick: () => void; disabled?: boolean; danger?: boolean }>): ReactElement {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`cursor-pointer border p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-20 ${danger ? "border-red-800 text-red-300 hover:bg-red-950" : "border-zinc-600 text-white/65 hover:bg-zinc-800"}`}><Icon aria-hidden="true" className="h-3 w-3" /></button>;
}

function statusLabel(status: CustomDailyStatus): string {
  return status === "draft" ? "черновик" : status === "published" ? "опубликовано" : "отменено";
}

function formatPrice(price: number): string {
  return `${price.toFixed(2)} ₽`;
}
