"use client";

import { useState, type ReactElement } from "react";
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
          <div className="flex min-w-[7.5rem] flex-col gap-2 sm:min-w-0 sm:flex-row sm:flex-wrap">
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
            {isRejected && onRestore && (
              <button
                type="button"
                onClick={() => onRestore(scran.id)}
                className="pixel-btn pixel-btn-info min-h-10 px-3 py-1.5 text-xs font-bold sm:text-sm"
              >
                В очередь
              </button>
            )}
            {scran.approved && role === "admin" && (
              <button
                type="button"
                onClick={() => onBan(scran.id)}
                className="pixel-btn pixel-btn-warn min-h-10 px-3 py-1.5 text-xs font-bold sm:text-sm"
              >
                Снять
              </button>
            )}
            {role === "admin" && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(scran)}
                className="pixel-btn min-h-10 px-3 py-1.5 text-xs font-bold sm:text-sm"
              >
                Edit
              </button>
            )}
            {role === "admin" && (
              <button
                type="button"
                onClick={() => onDelete(scran)}
                className="pixel-btn min-h-10 px-3 py-1.5 text-xs font-bold sm:text-sm"
                title="Жёсткое удаление с уведомлением (admin)"
              >
                Удалить
              </button>
            )}
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
