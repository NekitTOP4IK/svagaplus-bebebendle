"use client";

import {
  useCallback,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import {
  newContentBlock,
  type CompetitiveContentBlock,
  type CompetitiveContentDoc,
} from "@/lib/competitive/content";

type Props = Readonly<{
  label: string;
  doc: CompetitiveContentDoc;
  onChange: (doc: CompetitiveContentDoc) => void;
  disabled?: boolean;
  /** Start collapsed (default true — lists are large). */
  defaultCollapsed?: boolean;
}>;

/**
 * Admin editor: ordered categories (title + body + optional image/gif).
 */
export function ContentDocEditor({
  label,
  doc,
  onChange,
  disabled = false,
  defaultCollapsed = true,
}: Props): ReactElement {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const updateBlock = useCallback(
    (id: string, patch: Partial<CompetitiveContentBlock>) => {
      onChange({
        version: 1,
        blocks: doc.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      });
    },
    [doc.blocks, onChange],
  );

  const removeBlock = useCallback(
    (id: string) => {
      onChange({
        version: 1,
        blocks: doc.blocks.filter((b) => b.id !== id),
      });
    },
    [doc.blocks, onChange],
  );

  const addBlock = useCallback(() => {
    const sort =
      doc.blocks.reduce((m, b) => Math.max(m, b.sort), -1) + 1;
    onChange({
      version: 1,
      blocks: [...doc.blocks, newContentBlock({ sort })],
    });
  }, [doc.blocks, onChange]);

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const sorted = [...doc.blocks].sort((a, b) => a.sort - b.sort);
      const idx = sorted.findIndex((b) => b.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= sorted.length) return;
      const a = sorted[idx]!;
      const b = sorted[j]!;
      onChange({
        version: 1,
        blocks: doc.blocks.map((block) => {
          if (block.id === a.id) return { ...block, sort: b.sort };
          if (block.id === b.id) return { ...block, sort: a.sort };
          return block;
        }),
      });
    },
    [doc.blocks, onChange],
  );

  const onUpload = async (
    blockId: string,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingId(blockId);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await apiFetch("/api/admin/competitive/content/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(err?.error || "upload failed");
      }
      const data = (await res.json()) as { url: string };
      updateBlock(blockId, { imageUrl: data.url });
      toast.success("Ассет загружен");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploadingId(null);
    }
  };

  const sorted = [...doc.blocks].sort((a, b) => a.sort - b.sort);
  const count = sorted.length;

  return (
    <div className="space-y-3 border-2 border-zinc-700 bg-zinc-950/80 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <span className="pixel-text text-xs font-bold text-white/70">
            {collapsed ? "▶" : "▼"}
          </span>
          <h4 className="pixel-text text-sm font-bold text-white">{label}</h4>
          <span className="text-[10px] text-white/40">
            ({count}{" "}
            {count === 1 ? "категория" : count > 1 && count < 5 ? "категории" : "категорий"}
            )
          </span>
        </button>
        {!collapsed ? (
          <button
            type="button"
            disabled={disabled}
            onClick={addBlock}
            className="pixel-btn pixel-btn-ok px-3 py-1.5 text-xs font-bold"
          >
            + Категория
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <p className="text-[11px] text-white/40">
          Свернуто. Нажми заголовок, чтобы править категории.
        </p>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-white/45">
          Пока пусто. Добавь категории с текстом и опциональной картинкой/гифкой.
        </p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((block, index) => (
            <li
              key={block.id}
              className="space-y-2 border border-zinc-700 bg-black/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-white/40">#{index + 1}</span>
                <button
                  type="button"
                  className="pixel-btn px-2 py-1 text-[10px] font-bold"
                  disabled={disabled || index === 0}
                  onClick={() => move(block.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="pixel-btn px-2 py-1 text-[10px] font-bold"
                  disabled={disabled || index === sorted.length - 1}
                  onClick={() => move(block.id, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="pixel-btn pixel-btn-danger ml-auto px-2 py-1 text-[10px] font-bold"
                  disabled={disabled}
                  onClick={() => removeBlock(block.id)}
                >
                  Удалить
                </button>
              </div>
              <label className="block text-xs text-white/60">
                Заголовок
                <input
                  type="text"
                  value={block.title}
                  disabled={disabled}
                  maxLength={120}
                  onChange={(e) =>
                    updateBlock(block.id, { title: e.target.value })
                  }
                  className="mt-1 w-full border-2 border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="block text-xs text-white/60">
                Текст
                <textarea
                  value={block.body}
                  disabled={disabled}
                  rows={4}
                  maxLength={8000}
                  onChange={(e) =>
                    updateBlock(block.id, { body: e.target.value })
                  }
                  className="mt-1 w-full border-2 border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                  placeholder="Описание категории…"
                />
              </label>
              <div className="flex flex-wrap items-start gap-3">
                <label className="block min-w-0 flex-1 text-xs text-white/60">
                  URL картинки / гифки
                  <input
                    type="text"
                    value={block.imageUrl ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      updateBlock(block.id, {
                        imageUrl: e.target.value.trim() || null,
                      })
                    }
                    className="mt-1 w-full border-2 border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm text-white"
                    placeholder="/api/competitive/content-assets/… или https://…"
                  />
                </label>
                <label className="pixel-btn pixel-btn-info mt-5 cursor-pointer px-3 py-1.5 text-xs font-bold">
                  {uploadingId === block.id ? "…" : "Загрузить"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={disabled || uploadingId === block.id}
                    onChange={(e) => void onUpload(block.id, e)}
                  />
                </label>
              </div>
              {block.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={block.imageUrl}
                  alt=""
                  className="max-h-28 border-2 border-zinc-700 object-contain"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
