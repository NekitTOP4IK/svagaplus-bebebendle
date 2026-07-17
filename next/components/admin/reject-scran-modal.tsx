"use client";

import { useState, type ReactElement } from "react";
import { REJECT_REASONS, type RejectReasonCode } from "@/lib/reject-reasons";

type Props = Readonly<{
  scranName: string;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reason: RejectReasonCode, note: string) => void | Promise<void>;
}>;

export function RejectScranModal({
  scranName,
  open,
  busy = false,
  onClose,
  onConfirm,
}: Props): ReactElement | null {
  const [reason, setReason] = useState<RejectReasonCode>("other");
  const [note, setNote] = useState("");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="pixel-container w-full max-w-md border-4 border-black bg-zinc-900 p-4 shadow-xl sm:p-5"
        style={{
          transform: "scale(1)",
          opacity: 1,
          transition: "transform 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease-out",
        }}
      >
        <h2 id="reject-title" className="pixel-text text-lg font-bold text-white">
          Отклонить блюдо
        </h2>
        <p className="mt-1 truncate text-sm text-white/70">{scranName}</p>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-white/50">
          Причина
        </label>
        <div className="mt-2 flex flex-col gap-1.5">
          {REJECT_REASONS.map((r) => (
            <label
              key={r.code}
              className={`flex cursor-pointer items-center gap-2 border-2 px-3 py-2 text-sm transition-colors duration-150 ${
                reason === r.code
                  ? "border-red-500 bg-red-950/50 text-white"
                  : "border-zinc-700 bg-zinc-800/80 text-white/80 hover:border-zinc-500"
              }`}
            >
              <input
                type="radio"
                name="reject-reason"
                value={r.code}
                checked={reason === r.code}
                onChange={() => setReason(r.code)}
                className="sr-only"
              />
              {r.label}
            </label>
          ))}
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-white/50">
          Комментарий (необязательно)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="Попадёт в уведомление автору"
          className="mt-1 w-full border-2 border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-amber-400 focus:outline-none"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="pixel-btn flex-1 bg-zinc-700 px-3 py-2.5 text-sm font-bold text-white hover:bg-zinc-600 disabled:opacity-50 active:scale-[0.97]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm(reason, note)}
            className="pixel-btn flex-1 bg-red-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50 active:scale-[0.97]"
          >
            {busy ? "…" : "Отклонить"}
          </button>
        </div>
      </div>
    </div>
  );
}
