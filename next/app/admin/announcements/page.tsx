"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import Link from "next/link";
import { deleteAnnouncementAction, listAnnouncementsAction, updateAnnouncementAction } from "@/app/actions/announcements";
import { AnnouncementEditor } from "@/components/admin/announcements/announcement-editor";

type Announcement = {
  id: number;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: number | null;
};

export default function AdminAnnouncementsPage(): ReactElement {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editorMode, setEditorMode] = useState<null | "create" | "edit">(null);
  const [editing, setEditing] = useState<Announcement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await listAnnouncementsAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRows(result.data);
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(row: Announcement) {
    try {
      const result = await updateAnnouncementAction({ id: row.id, active: !row.active });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } catch {
      setError("Ошибка сети");
    }
  }

  async function remove(row: Announcement) {
    if (!window.confirm(`Удалить объявление #${row.id} «${row.title}»?`)) return;
    try {
      const result = await deleteAnnouncementAction(row.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } catch {
      setError("Ошибка сети");
    }
  }

  function openCreate() {
    setEditing(null);
    setEditorMode("create");
  }
  function openEdit(row: Announcement) {
    setEditing(row);
    setEditorMode("edit");
  }
  function closeEditor() {
    setEditorMode(null);
    setEditing(null);
  }

  return (
    <div className="retro-bg relative min-h-dvh">
      <div className="retro-overlay pointer-events-none fixed inset-0" />
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="pixel-text text-2xl font-bold">Объявления</h1>
          <div className="flex gap-2">
            <Link href="/admin" className="pixel-btn px-3 py-2 text-sm font-bold">
              ← Админ-панель
            </Link>
            <button
              type="button"
              onClick={openCreate}
              className="pixel-btn pixel-btn-ok px-3 py-2 text-sm font-bold"
            >
              + Создать
            </button>
          </div>
        </div>

        {loading && <p className="text-white/60">Загрузка…</p>}
        {error && (
          <p className="mb-3 border-2 border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        {!loading && rows.length === 0 && !error && (
          <p className="text-sm text-white/50">Пока нет ни одного объявления</p>
        )}

        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="pixel-container border-4 border-black bg-zinc-900/90 p-4 text-white"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/45">#{row.id}</p>
                  <h3 className="pixel-text text-base font-bold truncate">{row.title}</h3>
                  <p className="mt-1 text-xs text-white/50">
                    {new Date(row.createdAt).toLocaleString("ru-RU")} ·{" "}
                    {row.active ? (
                      <span className="text-green-400">активно</span>
                    ) : (
                      <span className="text-white/40">выключено</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="pixel-btn px-3 py-1.5 text-xs font-bold"
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(row)}
                    className="pixel-btn pixel-btn-warn px-3 py-1.5 text-xs font-bold"
                  >
                    {row.active ? "Выключить" : "Включить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(row)}
                    className="pixel-btn pixel-btn-danger px-3 py-1.5 text-xs font-bold"
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs text-white/50 hover:text-white/80">
                  Показать текст
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-300">
                  {row.body}
                </pre>
              </details>
            </li>
          ))}
        </ul>

        {editorMode && (
          <AnnouncementEditor
            mode={editorMode}
            initial={editing}
            onClose={closeEditor}
            onSaved={() => {
              closeEditor();
              void load();
            }}
          />
        )}
      </div>
    </div>
  );
}
