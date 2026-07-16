"use client";

import type { Scran } from "@/types/scran";
import { getLikesPercentage } from "@/lib/scoring";

type ViewMode = "list" | "queue" | "users";

interface ScranRowProps {
  scran: Scran;
  view?: ViewMode;
  role?: "moderator" | "admin" | null;
  onApprove: (id: number) => void;
  onBan: (id: number) => void;
  onDelete: (scran: Scran) => void;
}

export function ScranRow({ scran, view, role, onApprove, onBan, onDelete }: ScranRowProps) {
  const percentage = getLikesPercentage({
    numberOfLikes: scran.numberOfLikes,
    numberOfDislikes: scran.numberOfDislikes,
  });

  const isQueue = view === "queue";
  const isSub = scran.isSubscriberAtSubmit === true;
  const authorLabel = scran.authorUsername || scran.authorDisplayName || (scran.telegramId ? `tg:${scran.telegramId}` : "аноним");
  const pendingCount = typeof scran.pendingCount === "number" ? scran.pendingCount : undefined;
  const pendingNote = pendingCount != null ? ` (${pendingCount} на модерации)` : "";
  const overLimit = pendingCount != null && pendingCount > 6;

  return (
    <tr className="hover:bg-zinc-800/50">
      <td className="whitespace-nowrap px-6 py-4 text-sm text-white">
        {scran.id}
      </td>
      <td className="px-6 py-4">
        {scran.imageUrl && (
          <img
            src={scran.imageUrl}
            alt={scran.name}
            className="h-12 w-12 rounded-none border-2 border-black object-cover"
          />
        )}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="text-sm font-bold text-white">{scran.name}</div>
          {isSub && (
            <span className="inline-flex rounded-none bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
              SVAGA+
            </span>
          )}
          {scran.isSubscriberAtSubmit === null && (
            <span className="inline-flex rounded-none bg-zinc-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              Не проверено
            </span>
          )}
        </div>
        {scran.description && (
          <div className="text-xs text-zinc-400 line-clamp-1">
            {scran.description}
          </div>
        )}
      </td>
      {isQueue && (
        <td className="whitespace-nowrap px-6 py-4 text-sm text-white">
          <span className="text-white/90">{authorLabel}</span>
          {pendingNote && (
            <span className={`ml-1 text-xs ${overLimit ? "text-red-400 font-bold" : "text-amber-400"}`}>
              {pendingNote}
              {overLimit && " ⚠️"}
            </span>
          )}
          {overLimit && (
            <span className="ml-2 inline rounded-none bg-red-600 px-1 py-0.5 text-[9px] font-bold text-white">{">6"}</span>
          )}
        </td>
      )}
      <td className="whitespace-nowrap px-6 py-4 text-sm text-white">
        {scran.price.toFixed(2)} ₽
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-white">
        👍 {scran.numberOfLikes}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-white">
        👎 {scran.numberOfDislikes}
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-12 overflow-hidden rounded-none border border-zinc-600 bg-zinc-700">
            <div
              className="h-full bg-green-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="text-xs text-white">{percentage}%</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <span
          className={`inline-flex rounded-none px-2 py-1 text-xs font-bold ${
            scran.approved
              ? "bg-green-500 text-white"
              : "bg-yellow-400 text-black"
          }`}
        >
          {scran.approved ? "Approved" : "Pending"}
        </span>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <div className="flex gap-2">
          {!scran.approved && (
            <button
              onClick={() => onApprove(scran.id)}
              className="pixel-btn min-h-11 min-w-11 bg-green-500 px-3 py-1 text-sm font-bold text-white hover:bg-green-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              Approve
            </button>
          )}
          {scran.approved && (
            <button
              onClick={() => onBan(scran.id)}
              className="pixel-btn min-h-11 min-w-11 bg-red-500 px-3 py-1 text-sm font-bold text-white hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
            >
              Ban
            </button>
          )}
          {role === "admin" && (
            <button
              onClick={() => onDelete(scran)}
              className="pixel-btn min-h-11 min-w-11 bg-zinc-700 px-3 py-1 text-sm font-bold text-white hover:bg-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-300"
              title="Удалить с уведомлением автору (admin only)"
            >
              Удалить
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
