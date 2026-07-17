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
      <div className="pixel-container w-full max-w-md border-4 border-black bg-zinc-900 p-4 shadow-xl sm:p-5">
        <h2 id="reject-title" className="pixel-text text-lg font-bold">
          Отклонить блюдо
        </h2>
        <p className="mt-1 truncate text-sm text-white/70">{scranName}</p>

        <span className="mt-4 block text-xs font-bold uppercase tracking-wide text-white/50">
          Причина
        </span>
        <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label="Причина отклонения">
          {REJECT_REASONS.map((r) => (
            <label
              key={r.code}
              className="pixel-radio-row"
              data-checked={reason === r.code ? "true" : "false"}
            >
              <input
                type="radio"
                name="reject-reason"
                value={r.code}
                checked={reason === r.code}
                onChange={() => setReason(r.code)}
                className="pixel-radio"
              />
              {r.label}
            </label>
          ))}
        </div>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-white/50">
          Комментарий (необязательно)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 280))}
            rows={2}
            placeholder="Попадёт в уведомление автору"
            className="pixel-textarea mt-1"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="pixel-btn flex-1 px-3 py-2.5 text-sm font-bold"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm(reason, note)}
            className="pixel-btn pixel-btn-danger flex-1 px-3 py-2.5 text-sm font-bold"
          >
            {busy ? "…" : "Отклонить"}
          </button>
        </div>
      </div>
    </div>
  );
}
