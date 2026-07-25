"use client";

import { useCallback, useState, type ReactElement } from "react";
import { updateCompetitivePrefs } from "@/app/actions/competitive";
import { MarkdownView } from "@/components/announcements/markdown-view";

type Props = Readonly<{
  title: string;
  body: string;
  onDismissed: () => void;
}>;

/**
 * Admin-configured first-visit Ranked intro. Shown once (server prefs).
 */
export function CompetitiveIntroModal({
  title,
  body,
  onDismissed,
}: Props): ReactElement {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateCompetitivePrefs({ introDismissed: true });
      if (!result.ok) {
        setError(result.message);
        setSaving(false);
        return;
      }
      onDismissed();
    } catch {
      setError("Ошибка сети");
      setSaving(false);
    }
  }, [saving, onDismissed]);

  return (
    <div className="c-faq-modal-root" role="presentation">
      <div
        className="c-faq-modal c-faq-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-modal-title"
      >
        <header className="c-faq-modal__head">
          <h4 id="intro-modal-title">{title}</h4>
        </header>
        <div className="c-faq-modal__body prose-invert max-w-none text-left text-sm text-white/90">
          <MarkdownView content={body} />
          {error ? (
            <p className="mt-3 text-xs text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="c-faq-modal__foot flex w-full justify-end">
          <button
            type="button"
            className="pixel-btn pixel-btn-ok px-5 py-2 text-sm font-bold"
            disabled={saving}
            onClick={() => void dismiss()}
          >
            {saving ? "…" : "Понятно"}
          </button>
        </footer>
      </div>
    </div>
  );
}
