"use client";

import { useEffect, useState } from "react";
import type { Scran } from "@/types/scran";

interface DeleteScranModalProps {
  scran: Scran | null;
  onClose: () => void;
  onConfirm: (id: number, comment: string) => Promise<boolean>;
}

export function DeleteScranModal({
  scran,
  onClose,
  onConfirm,
}: DeleteScranModalProps) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Close on Escape
  useEffect(() => {
    if (!scran) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scran, onClose, submitting]);

  if (!scran) return null;

  const trimmed = comment.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const ok = await onConfirm(scran.id, trimmed);
    setSubmitting(false);
    if (ok) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="pixel-container w-full max-w-md rounded-none border-4 border-black bg-zinc-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="pixel-text text-xl font-bold text-white">
          Удалить блюдо
        </h2>
        <p className="mt-3 text-sm text-zinc-300">
          Вы собираетесь удалить{" "}
          <span className="font-bold text-white">«{scran.name}»</span>.
          Действие необратимо.
        </p>
        <label
          htmlFor="delete-comment"
          className="pixel-text mt-4 block text-sm font-bold text-white"
        >
          Комментарий (обязателен, отправится автору в Telegram):
        </label>
        <textarea
          id="delete-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          autoFocus
          rows={4}
          placeholder="Укажите причину удаления..."
          className="pixel-textarea mt-2"
          disabled={submitting}
        />
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="pixel-btn px-4 py-2 text-sm font-bold"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canSubmit}
            className="pixel-btn pixel-btn-danger px-4 py-2 text-sm font-bold"
          >
            {submitting ? "Удаление..." : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}
