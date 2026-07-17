"use client";

import { useState, type ReactElement } from "react";
import type { Scran } from "@/types/scran";

type Props = Readonly<{
  scran: Scran | null;
  busy?: boolean;
  onClose: () => void;
  onSave: (patch: { name: string; description: string; price: number }) => void | Promise<void>;
}>;

export function EditScranModal({ scran, busy, onClose, onSave }: Props): ReactElement | null {
  const [name, setName] = useState(scran?.name ?? "");
  const [description, setDescription] = useState(scran?.description ?? "");
  const [price, setPrice] = useState(String(scran?.price ?? "0"));

  if (!scran) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="pixel-container w-full max-w-md border-4 border-black bg-zinc-900 p-4 sm:p-5">
        <h2 className="pixel-text text-lg font-bold text-white">Редактировать #{scran.id}</h2>
        <label className="mt-3 block text-xs text-white/50">
          Название
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border-2 border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Описание
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="mt-1 w-full border-2 border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="mt-3 block text-xs text-white/50">
          Цена
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="mt-1 w-full border-2 border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="pixel-btn flex-1 bg-zinc-700 py-2 text-sm font-bold text-white active:scale-[0.97]"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              void onSave({
                name: name.trim(),
                description: description.trim(),
                price: parseFloat(price) || 0,
              })
            }
            className="pixel-btn flex-1 bg-amber-400 py-2 text-sm font-bold text-black active:scale-[0.97] disabled:opacity-50"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
