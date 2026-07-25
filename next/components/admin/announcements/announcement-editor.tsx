"use client";

import { useState, type ReactElement } from "react";
import { MarkdownView } from "@/components/announcements/markdown-view";
import { createAnnouncementAction, updateAnnouncementAction } from "@/app/actions/announcements";

type Announcement = {
  id: number;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: number | null;
};

type Props = Readonly<{
  mode: "create" | "edit";
  initial: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
}>;

const TITLE_MAX = 200;
const BODY_MAX = 5000;

export function AnnouncementEditor({
  mode,
  initial,
  onClose,
  onSaved,
}: Props): ReactElement {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit =
    !submitting &&
    title.trim().length > 0 &&
    title.trim().length <= TITLE_MAX &&
    body.trim().length > 0 &&
    body.trim().length <= BODY_MAX;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = { title: title.trim(), body: body.trim(), active };
      const result =
        mode === "create"
          ? await createAnnouncementAction(payload)
          : await updateAnnouncementAction({ id: initial?.id, ...payload });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onSaved();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="pixel-container relative border-4 border-black bg-zinc-900/95 w-full max-w-3xl p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="pixel-text text-lg font-bold">
            {mode === "create" ? "Новое объявление" : `Редактирование #${initial?.id}`}
          </h3>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="pixel-btn h-8 w-8 text-sm"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="mb-3 border-2 border-red-700 bg-red-950/60 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase text-white/50">
                Заголовок · {title.length}/{TITLE_MAX}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                className="pixel-input"
                maxLength={TITLE_MAX}
                placeholder="Заголовок объявления"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs uppercase text-white/50">
                Текст (markdown) · {body.length}/{BODY_MAX}
              </span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                className="pixel-textarea min-h-[14rem]"
                maxLength={BODY_MAX}
                placeholder="Поддерживаются **жирный**, *курсив*, ~~зачёркнутый~~, [ссылки](https://...)"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="pixel-check"
              />
              Активно (показывать пользователям)
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canSubmit}
                className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold"
              >
                {submitting ? "Сохраняю…" : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="pixel-btn px-4 py-2 text-sm font-bold"
              >
                Отмена
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-xs uppercase text-white/50">Превью</span>
            <div className="mc-frame">
              <div className="mc-panel" style={{ padding: 12 }}>
                <div className="text-center">
                  <div
                    className="mc-sign"
                    style={{ margin: "-24px auto 8px" }}
                  >
                    <span className="mc-title">
                      {title.trim() || "Заголовок объявления"}
                    </span>
                  </div>
                </div>
                <div className="mc-body max-h-[55vh] overflow-y-auto">
                  <MarkdownView content={body || "_Превью текста появится тут_"} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
