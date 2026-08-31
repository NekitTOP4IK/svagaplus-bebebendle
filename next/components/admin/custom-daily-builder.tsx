"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
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
  browseApprovedCustomDailyScrans,
  createAdminCustomDailyEvent,
  getAdminCustomDailyEvent,
  listAdminCustomDailyEvents,
  publishAdminCustomDailyEvent,
  updateAdminCustomDailyEvent,
  updateAdminCustomDailyPresentation,
  type CustomDailyCatalogSort,
  type CustomDailyBadgeStyle,
  type CustomDailyDetail,
  type CustomDailyStatus,
  type CustomDailySummary,
} from "@/app/actions/admin-custom-daily";
import { todayMskDate } from "@/lib/daily-timezone";
import {
  DAILY_EVENT_BADGE_STYLES,
  DailyEventBadge,
} from "@/components/daily/daily-event-badge";

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
  showEventBadge: true,
  showOnHome: false,
  badgeStyle: "violet" as CustomDailyBadgeStyle,
  status: "draft" as CustomDailyStatus,
  entries: [] as CustomDailyScranChoice[],
};

type SlotDragState = Readonly<{
  sourceId: number;
  targetIndex: number | null;
  mode: "pointer" | "keyboard";
}>;

export function moveCustomDailyEntry<T>(
  entries: readonly T[],
  sourceIndex: number,
  targetIndex: number,
): T[] {
  if (sourceIndex < 0 || sourceIndex >= entries.length || entries.length < 2) return [...entries];
  const normalizedTarget = Math.max(0, Math.min(targetIndex, entries.length - 1));
  if (sourceIndex === normalizedTarget) return [...entries];
  const reordered = [...entries];
  const [moved] = reordered.splice(sourceIndex, 1);
  if (moved === undefined) return [...entries];
  reordered.splice(normalizedTarget, 0, moved);
  return reordered;
}

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
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogSort, setCatalogSort] = useState<CustomDailyCatalogSort>("newest");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogItems, setCatalogItems] = useState<CustomDailyScranChoice[]>([]);
  const [catalogTotal, setCatalogTotal] = useState(0);
  const [catalogTotalPages, setCatalogTotalPages] = useState(1);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [dragState, setDragState] = useState<SlotDragState | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const appliedBulkRevisionRef = useRef(0);
  const pointerDragRef = useRef<{
    pointerId: number;
    pointerType: string;
    sourceId: number;
    targetIndex: number | null;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const dragHandleRefs = useRef(new Map<number, HTMLButtonElement>());
  const focusAfterMoveRef = useRef<number | null>(null);
  const catalogRequestRef = useRef(0);

  const readOnly = editor.status !== "draft";

  const clearDrag = useCallback(() => {
    pointerDragRef.current = null;
    setDragState(null);
    setDragPoint(null);
  }, []);

  useEffect(() => {
    const scranId = focusAfterMoveRef.current;
    if (scranId === null) return;
    focusAfterMoveRef.current = null;
    requestAnimationFrame(() => dragHandleRefs.current.get(scranId)?.focus());
  }, [editor.entries]);

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
    clearDrag();
    setEditor({ ...EMPTY_EDITOR, targetDate: todayMskDate(), entries: [] });
    onActiveEventChange?.(null);
  };

  const openEvent = useCallback(async (id: number) => {
    clearDrag();
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
        showEventBadge: detail.showEventBadge,
        showOnHome: detail.showOnHome,
        badgeStyle: detail.badgeStyle,
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
  }, [clearDrag, onActiveEventChange]);

  useEffect(() => {
    if (initialEventId) void openEvent(initialEventId);
  }, [initialEventId, openEvent]);

  useEffect(() => {
    if (readOnly) return;
    const requestId = catalogRequestRef.current + 1;
    catalogRequestRef.current = requestId;
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      void browseApprovedCustomDailyScrans({
        query: catalogQuery,
        page: catalogPage,
        sort: catalogSort,
      }).then((result) => {
        if (catalogRequestRef.current !== requestId) return;
        if (!result.ok) {
          toast.error(result.message);
          return;
        }
        setCatalogItems([...result.data.items]);
        setCatalogTotal(result.data.total);
        setCatalogTotalPages(result.data.totalPages);
        if (result.data.page !== catalogPage) setCatalogPage(result.data.page);
      }).catch(() => {
        if (catalogRequestRef.current === requestId) {
          toast.error("Не удалось загрузить каталог блюд");
        }
      }).finally(() => {
        if (catalogRequestRef.current === requestId) setCatalogLoading(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [catalogPage, catalogQuery, catalogSort, readOnly]);

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
    clearDrag();
    appliedBulkRevisionRef.current = bulkRevision;
    setEditor((current) => ({ ...current, entries: [...current.entries, ...added] }));
    toast.success(`В черновик добавлено: ${added.length}`);
    if (available.length > added.length) {
      toast.warning(`Не поместилось: ${available.length - added.length} — лимит 20 блюд`);
    }
  }, [bulkRevision, bulkScrans, clearDrag, editor.id, editor.status, editor.entries, initialEventId]);

  const addScran = (scran: CustomDailyScranChoice) => {
    clearDrag();
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
    clearDrag();
    setEditor((current) => ({
      ...current,
      entries: current.entries.filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  const moveScran = useCallback((sourceId: number, targetIndex: number | null) => {
    const sourceIndex = editor.entries.findIndex((entry) => entry.id === sourceId);
    const moved = editor.entries[sourceIndex];
    if (!moved || targetIndex === null || editor.entries.length < 2) return;
    const normalizedTarget = Math.max(0, Math.min(targetIndex, editor.entries.length - 1));
    if (sourceIndex === normalizedTarget) return;
    setEditor((current) => ({
      ...current,
      entries: moveCustomDailyEntry(
        current.entries,
        current.entries.findIndex((entry) => entry.id === sourceId),
        normalizedTarget,
      ),
    }));
    focusAfterMoveRef.current = sourceId;
    setDragAnnouncement(
      `${moved.name}: слот ${normalizedTarget + 1}, раунд ${Math.floor(normalizedTarget / 2) + 1}`,
    );
  }, [editor.entries]);

  const pointerDown = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (readOnly || (event.pointerType === "mouse" && event.button !== 0)) return;
    const target = editor.entries[index];
    if (!target) return;
    if (dragState?.mode === "keyboard") {
      event.preventDefault();
      moveScran(dragState.sourceId, index);
      setDragState(null);
      return;
    }
    pointerDragRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      sourceId: target.id,
      targetIndex: index,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best-effort (not available in some embedded browsers).
    }
    setDragState({ sourceId: target.id, targetIndex: index, mode: "pointer" });
    setDragPoint({ x: event.clientX, y: event.clientY });
  };

  const pointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    event.preventDefault();
    const element = document.elementFromPoint?.(event.clientX, event.clientY);
    const rawTarget = Number(element?.closest<HTMLElement>("[data-daily-slot-index]")?.dataset.dailySlotIndex);
    if (Number.isInteger(rawTarget)) {
      drag.targetIndex = Math.max(0, Math.min(rawTarget, editor.entries.length - 1));
    } else {
      drag.targetIndex = null;
    }
    if (drag.pointerType !== "mouse") {
      const edge = 72;
      if (event.clientY < edge) window.scrollBy({ top: -18, behavior: "auto" });
      else if (event.clientY > window.innerHeight - edge) window.scrollBy({ top: 18, behavior: "auto" });
    }
    setDragState({
      sourceId: drag.sourceId,
      targetIndex: drag.targetIndex,
      mode: "pointer",
    });
    setDragPoint({ x: event.clientX, y: event.clientY });
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // The browser may already have released capture after a cancelled gesture.
    }
    if (commit && drag.moved && drag.targetIndex !== null) {
      moveScran(drag.sourceId, drag.targetIndex);
      setDragState(null);
      setDragPoint(null);
    } else if (commit && !drag.moved) {
      const sourceIndex = editor.entries.findIndex((entry) => entry.id === drag.sourceId);
      setDragState({ sourceId: drag.sourceId, targetIndex: sourceIndex, mode: "keyboard" });
      setDragPoint(null);
      setDragAnnouncement(`${editor.entries[sourceIndex]?.name ?? "Блюдо"}: коснись другого блюда или выбери слот стрелками`);
    } else {
      setDragState(null);
      setDragPoint(null);
    }
  };

  const keyboardDrag = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const active = dragState?.mode === "keyboard" ? dragState : null;
    if (!active) {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      const source = editor.entries[index];
      if (!source) return;
      setDragState({ sourceId: source.id, targetIndex: index, mode: "keyboard" });
      setDragAnnouncement(`${editor.entries[index]?.name ?? "Блюдо"}: выберите новый слот стрелками`);
      return;
    }
    if (active.sourceId !== editor.entries[index]?.id) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setDragState(null);
      setDragAnnouncement("Перемещение отменено");
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      moveScran(active.sourceId, active.targetIndex);
      setDragState(null);
      return;
    }
    const delta = event.key === "ArrowLeft"
      ? -1
      : event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp"
          ? -2
          : event.key === "ArrowDown"
            ? 2
            : 0;
    if (!delta) return;
    event.preventDefault();
    const targetIndex = Math.max(0, Math.min((active.targetIndex ?? index) + delta, editor.entries.length - 1));
    setDragState({ ...active, targetIndex });
    setDragAnnouncement(`Целевой слот ${targetIndex + 1}, раунд ${Math.floor(targetIndex / 2) + 1}`);
  };

  const shuffleEntries = () => {
    clearDrag();
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
        showEventBadge: editor.showEventBadge,
        showOnHome: editor.showOnHome,
        badgeStyle: editor.badgeStyle,
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

  const savePresentation = async () => {
    if (!editor.id || editor.status === "cancelled") return;
    setBusy(true);
    try {
      const result = await updateAdminCustomDailyPresentation({
        id: editor.id,
        showEventBadge: editor.showEventBadge,
        showOnHome: editor.showOnHome,
        badgeStyle: editor.badgeStyle,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setEditor((current) => ({
        ...current,
        showEventBadge: result.data.showEventBadge,
        showOnHome: result.data.showOnHome,
        badgeStyle: result.data.badgeStyle,
      }));
      await loadEvents();
      toast.success("Оформление события обновлено");
    } catch {
      toast.error("Не удалось обновить оформление события");
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

        <div className="mt-4 border-t-2 border-zinc-800 pt-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-violet-200">Оформление события</h3>
              <p className="mt-1 text-[9px] leading-relaxed text-white/45">
                Управляет подписью на главной и плашкой во время игры
              </p>
            </div>
            {editor.showEventBadge ? (
              <DailyEventBadge
                name={editor.name.trim() || "Название события"}
                style={editor.badgeStyle}
                preview
              />
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <PresentationSwitch
              checked={editor.showEventBadge}
              disabled={editor.status === "cancelled"}
              title="Плашка в дейлике"
              description="Показывать «событие» над игровым полем"
              onChange={(checked) => setEditor((current) => ({ ...current, showEventBadge: checked }))}
            />
            <PresentationSwitch
              checked={editor.showOnHome}
              disabled={editor.status === "cancelled"}
              title="Текст под кнопкой"
              description="Показывать название события под кнопкой Daily"
              onChange={(checked) => setEditor((current) => ({ ...current, showOnHome: checked }))}
            />
          </div>

          <fieldset disabled={editor.status === "cancelled"} className="mt-3 disabled:opacity-45">
            <legend className="mb-2 text-[9px] font-bold uppercase tracking-wide text-white/50">
              Стиль плашки
            </legend>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {DAILY_EVENT_BADGE_STYLES.map(([value, label]) => (
                <label
                  key={value}
                  className={`cursor-pointer border-2 p-2 text-center text-[9px] transition-colors ${editor.badgeStyle === value ? "border-violet-300 bg-violet-950/60 text-white" : "border-zinc-700 bg-zinc-900 text-white/55 hover:border-zinc-500"}`}
                >
                  <input
                    type="radio"
                    name="custom-daily-badge-style"
                    value={value}
                    checked={editor.badgeStyle === value}
                    onChange={() => setEditor((current) => ({ ...current, badgeStyle: value }))}
                    className="sr-only"
                  />
                  <span className="block font-bold">{label}</span>
                  <span className="mt-1 block text-[8px] text-white/35">
                    {value === "neon" || value === "rainbow" ? "анимация" : "статичный"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      </section>

      {!readOnly ? (
        <section className="space-y-3 border-2 border-sky-800 bg-sky-950/20 p-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-sky-200">
                <Search aria-hidden="true" className="h-4 w-4" /> Каталог блюд
              </h3>
              <p className="mt-1 text-[10px] text-white/45">
                Все одобренные блюда · {catalogTotal} найдено
              </p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[minmax(14rem,1fr)_11rem]">
              <label className="text-[9px] font-bold uppercase tracking-wide text-white/50">
                Фильтр
                <input
                  value={catalogQuery}
                  maxLength={100}
                  onChange={(event) => {
                    setCatalogQuery(event.target.value);
                    setCatalogPage(1);
                  }}
                  className="pixel-input mt-1 w-full"
                  placeholder="Название или ID — необязательно"
                />
              </label>
              <label className="text-[9px] font-bold uppercase tracking-wide text-white/50">
                Сортировка
                <select
                  value={catalogSort}
                  onChange={(event) => {
                    setCatalogSort(event.target.value as CustomDailyCatalogSort);
                    setCatalogPage(1);
                  }}
                  className="pixel-input mt-1 w-full cursor-pointer"
                >
                  <option value="newest">Сначала новые</option>
                  <option value="name">По названию</option>
                  <option value="price_asc">Сначала дешевле</option>
                  <option value="price_desc">Сначала дороже</option>
                </select>
              </label>
            </div>
          </div>

          <div className="grid min-h-28 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={catalogLoading}>
            {catalogLoading && catalogItems.length === 0 ? (
              <div className="col-span-full flex items-center justify-center py-8 text-xs text-sky-200/60">
                Загружаю каталог…
              </div>
            ) : null}
            {!catalogLoading && catalogItems.length === 0 ? (
              <div className="col-span-full border-2 border-dashed border-zinc-700 py-8 text-center text-xs text-white/35">
                Блюд по этому фильтру нет
              </div>
            ) : null}
            {catalogItems.map((scran) => {
              const selected = editor.entries.some((entry) => entry.id === scran.id);
              return (
                <button
                  key={scran.id}
                  type="button"
                  onClick={() => selected
                    ? removeScran(editor.entries.findIndex((entry) => entry.id === scran.id))
                    : addScran(scran)}
                  className={`group flex min-w-0 cursor-pointer items-center gap-2 border-2 p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 ${selected ? "border-emerald-500 bg-emerald-950/50" : "border-zinc-700 bg-zinc-900 hover:border-sky-500"}`}
                  aria-pressed={selected}
                >
                  <ScranThumb scran={scran} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-white">{scran.name}</span>
                    <span className="text-[9px] text-white/45">#{scran.id} · {formatPrice(scran.price)}</span>
                    <span className={`mt-1 block text-[9px] font-bold ${selected ? "text-emerald-300" : "text-sky-300"}`}>
                      {selected ? "Добавлено · убрать" : "Добавить в событие"}
                    </span>
                  </span>
                  <Plus aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform ${selected ? "rotate-45 text-emerald-300" : "text-sky-300 group-hover:scale-125"}`} />
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-sky-900 pt-2 text-[10px] text-white/55">
            <button
              type="button"
              disabled={catalogLoading || catalogPage <= 1}
              onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}
              className="pixel-btn cursor-pointer px-2 py-1 disabled:cursor-not-allowed"
            >
              <ChevronLeft aria-hidden="true" className="mr-1 inline h-3 w-3" /> Назад
            </button>
            <span>Страница {catalogPage} / {catalogTotalPages}</span>
            <button
              type="button"
              disabled={catalogLoading || catalogPage >= catalogTotalPages}
              onClick={() => setCatalogPage((page) => Math.min(catalogTotalPages, page + 1))}
              className="pixel-btn cursor-pointer px-2 py-1 disabled:cursor-not-allowed"
            >
              Далее <ChevronRight aria-hidden="true" className="ml-1 inline h-3 w-3" />
            </button>
          </div>
        </section>
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
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                <PairSlot
                  scran={pair[0]}
                  index={pairIndex * 2}
                  readOnly={readOnly}
                  dragging={dragState?.sourceId === pair[0]?.id}
                  dropTarget={dragState?.targetIndex === pairIndex * 2}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={(event) => finishPointerDrag(event, true)}
                  onPointerCancel={(event) => finishPointerDrag(event, false)}
                  onKeyDown={keyboardDrag}
                  onRemove={removeScran}
                  setHandleRef={(node) => {
                    if (!pair[0]) return;
                    if (node) dragHandleRefs.current.set(pair[0].id, node);
                    else dragHandleRefs.current.delete(pair[0].id);
                  }}
                />
                <span className="self-center text-[10px] font-black text-amber-300">VS</span>
                <PairSlot
                  scran={pair[1]}
                  index={pairIndex * 2 + 1}
                  readOnly={readOnly}
                  dragging={dragState?.sourceId === pair[1]?.id}
                  dropTarget={dragState?.targetIndex === pairIndex * 2 + 1}
                  onPointerDown={pointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={(event) => finishPointerDrag(event, true)}
                  onPointerCancel={(event) => finishPointerDrag(event, false)}
                  onKeyDown={keyboardDrag}
                  onRemove={removeScran}
                  setHandleRef={(node) => {
                    if (!pair[1]) return;
                    if (node) dragHandleRefs.current.set(pair[1].id, node);
                    else dragHandleRefs.current.delete(pair[1].id);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="sr-only" aria-live="polite">{dragAnnouncement}</p>
      {dragState?.mode === "pointer" && dragPoint ? (
        <div
          className="pointer-events-none fixed z-[100] max-w-52 -translate-x-1/2 -translate-y-[120%] border-2 border-violet-300 bg-violet-950 px-3 py-2 text-[10px] font-bold text-white shadow-[4px_4px_0_rgba(0,0,0,0.65)]"
          style={{ left: dragPoint.x, top: dragPoint.y }}
        >
          <GripVertical aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 text-violet-300" />
          {editor.entries.find((entry) => entry.id === dragState.sourceId)?.name}
        </div>
      ) : null}

      <div className="sticky bottom-2 z-10 flex flex-wrap gap-2 border-2 border-zinc-600 bg-zinc-950/95 p-3 shadow-[4px_4px_0_rgba(0,0,0,0.6)]">
        {editor.id && editor.status === "published" ? (
          <button type="button" disabled={busy} onClick={() => void savePresentation()} className="pixel-btn pixel-btn-info cursor-pointer px-4 py-2 text-xs font-bold">
            <Save aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" /> Сохранить оформление
          </button>
        ) : null}
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

function PresentationSwitch({
  checked,
  disabled,
  title,
  description,
  onChange,
}: Readonly<{
  checked: boolean;
  disabled: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}>): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex cursor-pointer items-center justify-between gap-3 border-2 p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-not-allowed ${checked ? "border-emerald-600 bg-emerald-950/35" : "border-zinc-700 bg-zinc-900"}`}
    >
      <span className="min-w-0">
        <span className="block text-[10px] font-bold text-white">{title}</span>
        <span className="mt-1 block text-[8px] leading-relaxed text-white/45">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 border-2 border-black shadow-[inset_1px_1px_0_rgba(255,255,255,0.22)] ${checked ? "bg-emerald-600" : "bg-zinc-700"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 border border-black bg-white shadow-[1px_1px_0_rgba(0,0,0,0.5)] transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function PairSlot({
  scran,
  index,
  readOnly,
  dragging,
  dropTarget,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
  onRemove,
  setHandleRef,
}: Readonly<{
  scran?: CustomDailyScranChoice;
  index: number;
  readOnly: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onPointerDown: (index: number, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyDown: (index: number, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onRemove: (index: number) => void;
  setHandleRef: (node: HTMLButtonElement | null) => void;
}>): ReactElement {
  const slotClass = dropTarget
    ? "border-violet-300 bg-violet-950/70 shadow-[inset_0_0_0_2px_rgba(196,181,253,0.45)]"
    : "border-zinc-700 bg-zinc-950";
  if (!scran) {
    return (
      <div
        data-daily-slot-index={index}
        className={`flex min-h-20 items-center justify-center border-2 border-dashed text-[9px] text-white/25 ${slotClass}`}
      >
        пусто
      </div>
    );
  }
  return (
    <div
      data-daily-slot-index={index}
      className={`min-w-0 border-2 p-1.5 transition-[opacity,background-color,border-color,box-shadow] ${slotClass} ${dragging ? "opacity-35" : "opacity-100"}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {!readOnly ? (
          <button
            type="button"
            aria-label={`Перетащить ${scran.name}`}
            title="Перетащить мышью или нажать Enter и выбрать слот стрелками"
            aria-pressed={dragging}
            ref={setHandleRef}
            onPointerDown={(event) => onPointerDown(index, event)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onKeyDown={(event) => onKeyDown(index, event)}
            className="touch-none cursor-grab border border-violet-700 bg-violet-950 p-1.5 text-violet-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-300 active:cursor-grabbing"
          >
            <GripVertical aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
        <ScranThumb scran={scran} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-bold text-white">{scran.name}</span>
          <span className="text-[9px] text-white/40">#{scran.id} · слот {index + 1}</span>
        </span>
        {!readOnly ? (
          <button
            type="button"
            aria-label={`Убрать ${scran.name}`}
            title={`Убрать ${scran.name}`}
            onClick={() => onRemove(index)}
            className="cursor-pointer border border-red-800 p-1 text-red-300 hover:bg-red-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed"
          >
            <Trash2 aria-hidden="true" className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ScranThumb({ scran }: Readonly<{ scran: CustomDailyScranChoice }>): ReactElement {
  return scran.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- admin URLs can be external and are already thumbnail-sized.
    <img src={scran.imageUrl} alt="" className="h-10 w-10 shrink-0 border border-black object-cover" />
  ) : <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-zinc-700 bg-zinc-800 text-[8px] text-white/30">#{scran.id}</span>;
}

function statusLabel(status: CustomDailyStatus): string {
  return status === "draft" ? "черновик" : status === "published" ? "опубликовано" : "отменено";
}

function formatPrice(price: number): string {
  return `${price.toFixed(2)} ₽`;
}
