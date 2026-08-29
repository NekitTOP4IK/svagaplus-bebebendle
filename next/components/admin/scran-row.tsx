"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ClipboardList,
  EyeOff,
  Pencil,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Scran } from "@/types/scran";
import { getLikesPercentage } from "@/lib/scoring";
import { ScranImageLightbox } from "@/components/admin/scran-image-lightbox";

type ViewMode = "list" | "queue" | "users";

interface ScranRowProps {
  scran: Scran;
  view?: ViewMode;
  role?: "moderator" | "admin" | null;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onBan: (id: number) => void;
  onDelete: (scran: Scran) => void;
  onAuthor?: (telegramId: string | null | undefined) => void;
  onEdit?: (scran: Scran) => void;
  onRestore?: (id: number) => void;
  onRecheck?: (id: number) => void;
  onGrantDailyReentry?: (id: number) => void;
}

export function ScranRow({
  scran,
  view,
  role,
  selected,
  onToggleSelect,
  onApprove,
  onReject,
  onBan,
  onDelete,
  onAuthor,
  onEdit,
  onRestore,
  onRecheck,
  onGrantDailyReentry,
}: ScranRowProps): ReactElement {
  const [lightbox, setLightbox] = useState(false);
  const percentage = getLikesPercentage({
    numberOfLikes: scran.numberOfLikes,
    numberOfDislikes: scran.numberOfDislikes,
  });

  const isQueue = view === "queue";
  const isSub = scran.isSubscriberAtSubmit === true;
  const authorLabel =
    scran.authorUsername ||
    scran.authorDisplayName ||
    (scran.telegramId ? `tg:${scran.telegramId}` : "аноним");
  const pendingCount = typeof scran.pendingCount === "number" ? scran.pendingCount : undefined;
  const pendingNote = pendingCount != null ? ` (${pendingCount} на модерации)` : "";
  const overLimit = pendingCount != null && pendingCount > 6;
  const isRejected = scran.rejected === true;
  const isPending = !scran.approved && !isRejected;

  return (
    <>
      <tr className="hover:bg-zinc-800/50">
        {onToggleSelect && (
          <td className="px-2 py-3">
            <input
              type="checkbox"
              checked={!!selected}
              onChange={() => onToggleSelect(scran.id)}
              className="pixel-check"
              aria-label={`Выбрать ${scran.id}`}
            />
          </td>
        )}
        <td className="whitespace-nowrap px-3 py-3 text-sm text-white sm:px-4">
          {scran.id}
        </td>
        <td className="px-3 py-3 sm:px-4">
          {scran.imageUrl ? (
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="block overflow-hidden border-2 border-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
              title="Открыть фото"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scran.imageUrl}
                alt={scran.name}
                className="h-16 w-16 object-cover sm:h-20 sm:w-20"
              />
            </button>
          ) : (
            <span className="text-xs text-white/40">—</span>
          )}
        </td>
        <td className="max-w-[12rem] px-3 py-3 sm:max-w-xs sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/admin/scrans?id=${scran.id}`}
              className="text-sm font-bold text-amber-200 underline-offset-2 hover:underline"
            >
              {scran.name}
            </a>
            {isSub && (
              <span className="inline-flex bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                SVAGA+
              </span>
            )}
            {scran.isSubscriberAtSubmit === null && (
              <span className="inline-flex bg-zinc-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                Не проверено
              </span>
            )}
          </div>
          {scran.description && (
            <div className="line-clamp-2 text-xs text-zinc-400">{scran.description}</div>
          )}
          {isRejected && scran.rejectReason && (
            <div className="mt-0.5 text-[10px] text-red-300/80">{scran.rejectReason}</div>
          )}
        </td>
        <td className="px-3 py-3 text-sm text-white sm:px-4">
          {scran.telegramId || scran.authorUsername || scran.authorDisplayName ? (
            <button
              type="button"
              className="text-left text-sky-300 underline-offset-2 hover:underline"
              onClick={() => onAuthor?.(scran.telegramId)}
            >
              {authorLabel}
            </button>
          ) : (
            <span className="text-white/40">—</span>
          )}
          {isQueue && pendingNote && (
            <span
              className={`ml-1 text-xs ${overLimit ? "font-bold text-red-400" : "text-amber-400"}`}
            >
              {pendingNote}
              {overLimit && " ⚠️"}
            </span>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-sm text-white sm:px-4">
          {scran.price.toFixed(2)} ₽
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-sm text-white sm:px-4">
          👍 {scran.numberOfLikes}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-sm text-white sm:px-4">
          👎 {scran.numberOfDislikes}
        </td>
        <td className="whitespace-nowrap px-3 py-3 sm:px-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-12 overflow-hidden border border-zinc-600 bg-zinc-700">
              <div className="h-full bg-green-500" style={{ width: `${percentage}%` }} />
            </div>
            <span className="text-xs text-white">{percentage}%</span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-3 sm:px-4">
          <span
            className={`inline-flex px-2 py-1 text-xs font-bold ${
              scran.approved
                ? "bg-green-500 text-white"
                : isRejected
                  ? "bg-red-600 text-white"
                  : "bg-yellow-400 text-black"
            }`}
          >
            {scran.approved ? "Approved" : isRejected ? "Rejected" : "Pending"}
          </span>
        </td>
        <td className="px-3 py-3 sm:px-4">
          <div className="flex min-w-[7.5rem] flex-col gap-2 sm:min-w-0 sm:flex-row sm:flex-wrap sm:items-center">
            {isPending && (
              <>
                <button
                  type="button"
                  onClick={() => onApprove(scran.id)}
                  className="pixel-btn pixel-btn-ok min-h-10 px-3 py-1.5 text-xs font-bold sm:text-sm"
                >
                  Одобрить
                </button>
                <button
                  type="button"
                  onClick={() => onReject(scran.id)}
                  className="pixel-btn pixel-btn-danger min-h-10 px-3 py-1.5 text-xs font-bold sm:text-sm"
                >
                  Отклонить
                </button>
              </>
            )}
            <ScranActionsMenu
              scran={scran}
              role={role}
              onAuthor={onAuthor}
              onBan={onBan}
              onDelete={onDelete}
              onEdit={onEdit}
              onRestore={onRestore}
              onRecheck={onRecheck}
              onGrantDailyReentry={onGrantDailyReentry}
            />
          </div>
        </td>
      </tr>
      {lightbox && scran.imageUrl && (
        <ScranImageLightbox
          src={scran.imageUrl}
          alt={scran.name}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  );
}

type MenuPosition = Readonly<{
  right: number;
  top?: number;
  bottom?: number;
}>;

function ScranActionsMenu({
  scran,
  role,
  onAuthor,
  onBan,
  onDelete,
  onEdit,
  onRestore,
  onRecheck,
  onGrantDailyReentry,
}: Readonly<{
  scran: Scran;
  role?: "moderator" | "admin" | null;
  onAuthor?: (telegramId: string | null | undefined) => void;
  onBan: (id: number) => void;
  onDelete: (scran: Scran) => void;
  onEdit?: (scran: Scran) => void;
  onRestore?: (id: number) => void;
  onRecheck?: (id: number) => void;
  onGrantDailyReentry?: (id: number) => void;
}>): ReactElement {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    if (window.innerHeight - rect.bottom < 420) {
      setPosition({ right, bottom: window.innerHeight - rect.top + 6 });
    } else {
      setPosition({ right, top: rect.bottom + 6 });
    }

    const close = () => {
      setOpen(false);
      setPosition(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        button.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const select = (action: () => void) => {
    setOpen(false);
    setPosition(null);
    action();
  };
  const isAdmin = role === "admin";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setPosition(null);
          setOpen((value) => !value);
        }}
        className={`pixel-btn inline-flex min-h-10 cursor-pointer items-center gap-2 px-3 py-1.5 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:text-sm ${
          open ? "pixel-btn-info" : ""
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Действия для ${scran.name}`}
        title="Действия"
      >
        <Settings2 aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        <span>Действия</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Действия для ${scran.name}`}
              className="fixed z-[100] max-h-[calc(100vh-1rem)] w-[19rem] overflow-y-auto border-4 border-black bg-zinc-900 p-2 text-sm text-white shadow-[6px_6px_0_rgba(0,0,0,0.65)] [font-family:var(--font-pixel)]"
              style={position}
            >
              <div className="mb-2 flex items-center gap-3 border-2 border-zinc-600 bg-[linear-gradient(180deg,#18181b_0%,#09090b_100%)] p-2 shadow-[inset_2px_2px_0_rgba(255,255,255,0.06)]">
                {scran.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scran.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 border-2 border-black object-cover shadow-[2px_2px_0_rgba(255,255,255,0.12)]"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold leading-snug text-white">{scran.name}</p>
                  <p className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-[0.08em] text-zinc-400">
                    #{scran.id} · {scran.approved ? "опубликовано" : scran.rejected ? "отклонено" : "на проверке"}
                  </p>
                </div>
              </div>

              <MenuSection icon={ShieldCheck} label="Модерация" tone="amber">
              <a
                href={`/admin/scrans?id=${scran.id}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setPosition(null);
                }}
                className="group flex w-full cursor-pointer items-center gap-3 border border-transparent px-2 py-2 text-left transition-[background-color,border-color,transform] duration-75 hover:border-amber-500/50 hover:bg-amber-950/45 focus-visible:border-amber-300 focus-visible:bg-amber-950/45 focus-visible:outline-none active:translate-x-px active:translate-y-px"
              >
                <MenuIcon icon={ClipboardList} tone="amber" />
                <MenuCopy label="Открыть карточку" hint="История, автор и Daily" />
              </a>
              {(scran.telegramId || scran.authorUsername || scran.authorDisplayName) && onAuthor ? (
                <MenuButton
                  icon={UserRound}
                  label="Открыть автора"
                  hint="Карточка и ограничения"
                  tone="amber"
                  onSelect={() => select(() => onAuthor(scran.telegramId))}
                />
              ) : null}
              {scran.rejected && onRestore ? (
                <MenuButton
                  icon={RotateCcw}
                  label="Вернуть в очередь"
                  hint="Снова отправить на проверку"
                  tone="amber"
                  onSelect={() => select(() => onRestore(scran.id))}
                />
              ) : null}
              {scran.approved && isAdmin ? (
                <MenuButton
                  icon={EyeOff}
                  label="Снять с публикации"
                  hint="Убрать из публичного списка"
                  tone="amber"
                  onSelect={() => select(() => onBan(scran.id))}
                />
              ) : null}
              </MenuSection>

              {isAdmin ? (
                <>
                  <MenuSection icon={Wrench} label="Администрирование" tone="sky">
                  {onEdit ? (
                    <MenuButton
                      icon={Pencil}
                      label="Редактировать"
                      hint="Название, описание и цена"
                      tone="sky"
                      onSelect={() => select(() => onEdit(scran))}
                    />
                  ) : null}
                  {onGrantDailyReentry && scran.approved ? (
                    <MenuButton
                      icon={RotateCcw}
                      label="Повтор в Daily"
                      hint="Одно дополнительное участие"
                      tone="sky"
                      onSelect={() => select(() => onGrantDailyReentry(scran.id))}
                    />
                  ) : null}
                  {onRecheck ? (
                    <MenuButton
                      icon={RefreshCw}
                      label="Перепроверить SVAGA+"
                      hint="Обновить статус подписки"
                      tone="sky"
                      onSelect={() => select(() => onRecheck(scran.id))}
                    />
                  ) : null}
                  </MenuSection>
                  <MenuSection icon={TriangleAlert} label="Опасная зона" tone="red">
                  <MenuButton
                    icon={Trash2}
                    label="Удалить блюдо"
                    hint="Блюдо и связанные данные"
                    tone="red"
                    onSelect={() => select(() => onDelete(scran))}
                  />
                  </MenuSection>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function MenuButton({
  icon,
  label,
  hint,
  tone,
  onSelect,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  hint: string;
  tone: MenuTone;
  onSelect: () => void;
}>): ReactElement {
  const hoverClass =
    tone === "red"
      ? "hover:border-red-500/60 hover:bg-red-950/50 focus-visible:border-red-300 focus-visible:bg-red-950/50"
      : tone === "sky"
        ? "hover:border-sky-500/50 hover:bg-sky-950/45 focus-visible:border-sky-300 focus-visible:bg-sky-950/45"
        : "hover:border-amber-500/50 hover:bg-amber-950/45 focus-visible:border-amber-300 focus-visible:bg-amber-950/45";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`group flex w-full cursor-pointer items-center gap-3 border border-transparent px-2 py-2 text-left transition-[background-color,border-color,transform] duration-75 focus-visible:outline-none active:translate-x-px active:translate-y-px ${hoverClass}`}
    >
      <MenuIcon icon={icon} tone={tone} />
      <MenuCopy label={label} hint={hint} danger={tone === "red"} />
    </button>
  );
}

type MenuTone = "amber" | "sky" | "red";

function MenuSection({
  children,
  icon: Icon,
  label,
  tone,
}: Readonly<{
  children: ReactNode;
  icon: LucideIcon;
  label: string;
  tone: MenuTone;
}>): ReactElement {
  const toneClass =
    tone === "red"
      ? "border-red-900/70 bg-red-950/15 text-red-300"
      : tone === "sky"
        ? "border-sky-900/70 bg-sky-950/15 text-sky-300"
        : "border-amber-900/70 bg-amber-950/15 text-amber-300";
  return (
    <section className={`mt-2 overflow-hidden border-2 p-1 ${toneClass}`}>
      <h3 className="flex items-center gap-1.5 border-b border-current/20 px-1.5 py-1.5 text-[9px] font-black uppercase tracking-[0.12em]">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
        {label}
      </h3>
      <div className="pt-1">{children}</div>
    </section>
  );
}

function MenuIcon({ icon: Icon, tone }: Readonly<{ icon: LucideIcon; tone: MenuTone }>): ReactElement {
  const toneClass =
    tone === "red"
      ? "border-red-700 bg-red-950 text-red-300"
      : tone === "sky"
        ? "border-sky-700 bg-sky-950 text-sky-300"
        : "border-amber-700 bg-amber-950 text-amber-300";
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center border-2 shadow-[inset_1px_1px_0_rgba(255,255,255,0.12)] ${toneClass}`}>
      <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={2.25} />
    </span>
  );
}

function MenuCopy({
  label,
  hint,
  danger = false,
}: Readonly<{ label: string; hint: string; danger?: boolean }>): ReactElement {
  return (
    <span className="min-w-0">
      <span className={`block text-[11px] font-bold leading-tight ${danger ? "text-red-200" : "text-white"}`}>
        {label}
      </span>
      <span className="mt-1 block text-[9px] leading-[1.35] text-zinc-400">{hint}</span>
    </span>
  );
}
