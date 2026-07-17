"use client";

import { useMemo, useState, type ReactElement } from "react";
import { BAN_REASONS, type BanReasonCode } from "@/lib/ban-reasons";

type Props = Readonly<{
  open: boolean;
  busy?: boolean;
  telegramId: string;
  displayName?: string | null;
  onClose: () => void;
  onConfirm: (payload: {
    reasonCode: BanReasonCode;
    customNote: string;
  }) => void | Promise<void>;
}>;

export function BanUserModal({
  open,
  busy = false,
  telegramId,
  displayName,
  onClose,
  onConfirm,
}: Props): ReactElement | null {
  const [reasonCode, setReasonCode] = useState<BanReasonCode | null>(null);
  const [customNote, setCustomNote] = useState("");

  const canSubmit = useMemo(() => {
    if (!reasonCode || busy) return false;
    if (reasonCode === "custom") {
      return customNote.trim().length >= 3;
    }
    return true;
  }, [reasonCode, customNote, busy]);

  if (!open) return null;

  const label = displayName?.trim() || `tg:${telegramId}`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/75 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ban-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="pixel-container w-full max-w-md border-4 border-black bg-zinc-900 p-4 shadow-xl sm:p-5">
        <h2 id="ban-title" className="pixel-text text-lg font-bold text-white">
          Забанить пользователя
        </h2>
        <p className="mt-2 text-sm text-white/80">
          Вы хотите забанить пользователя{" "}
          <span className="font-bold text-amber-200">{label}</span>?
        </p>
        <p className="mt-1 text-xs text-white/50">
          Telegram id {telegramId}. Все pending-блюда уйдут в reject, бот
          перестанет принимать предложения.
        </p>

        <span className="mt-4 block text-xs font-bold uppercase tracking-wide text-white/50">
          Причина (обязательно)
        </span>
        <div
          className="mt-2 flex flex-col gap-1.5"
          role="radiogroup"
          aria-label="Причина бана"
        >
          {BAN_REASONS.map((r) => (
            <label
              key={r.code}
              className="pixel-radio-row"
              data-checked={reasonCode === r.code ? "true" : "false"}
            >
              <input
                type="radio"
                name="ban-reason"
                value={r.code}
                checked={reasonCode === r.code}
                onChange={() => setReasonCode(r.code)}
                className="pixel-radio"
              />
              {r.label}
            </label>
          ))}
        </div>

        {reasonCode === "custom" && (
          <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-white/50">
            Своя причина
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value.slice(0, 280))}
              rows={3}
              placeholder="Минимум 3 символа — без этого бан недоступен"
              className="pixel-textarea mt-1"
              autoFocus
            />
          </label>
        )}

        {reasonCode && reasonCode !== "custom" && (
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-white/40">
            Комментарий (необязательно)
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value.slice(0, 200))}
              rows={2}
              placeholder="Доп. детали к выбранной причине"
              className="pixel-textarea mt-1"
            />
          </label>
        )}

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
            disabled={!canSubmit}
            onClick={() => {
              if (!reasonCode || !canSubmit) return;
              void onConfirm({ reasonCode, customNote });
            }}
            className="pixel-btn pixel-btn-danger flex-1 px-3 py-2.5 text-sm font-bold"
            title={
              canSubmit
                ? "Подтвердить бан"
                : "Выбери причину (для своей — заполни текст)"
            }
          >
            {busy ? "…" : "Забанить"}
          </button>
        </div>
      </div>
    </div>
  );
}
