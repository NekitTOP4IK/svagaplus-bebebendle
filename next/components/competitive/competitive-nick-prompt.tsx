"use client";

import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import {
  COMPETITIVE_DISPLAY_NAME_MAX,
  COMPETITIVE_DISPLAY_NAME_MIN,
  validateCompetitiveDisplayName,
} from "@/lib/competitive/display-name";

const STORAGE_KEY = "competitiveNickPromptDismissed";

type Props = Readonly<{
  /** Current competitive nick; prompt only if null/empty. */
  competitiveDisplayName: string | null;
}>;

function subscribeDismissed(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function getDismissedSnapshot(): boolean {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

/** SSR: hide prompt (no flash). */
function getDismissedServerSnapshot(): boolean {
  return true;
}

function markDismissedInStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
    // same-tab listeners of useSyncExternalStore only get storage events
    // from other documents — force a synthetic notify via custom event.
    window.dispatchEvent(new Event("storage"));
  } catch {
    // ignore
  }
}

/**
 * First-visit Ranked prompt: optional pseudonym for the leaderboard.
 * Shows once per browser until Save or «Нет, спасибо» (localStorage).
 */
export function CompetitiveNickPrompt({
  competitiveDisplayName,
}: Props): ReactElement | null {
  const router = useRouter();
  const storageDismissed = useSyncExternalStore(
    subscribeDismissed,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );
  /** Same-tab dismiss before storage re-read. */
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasNick = Boolean(competitiveDisplayName?.trim());
  const open = !storageDismissed && !sessionDismissed && !hasNick;

  const validation = useMemo(
    () => validateCompetitiveDisplayName(value),
    [value],
  );
  const canSave = validation.ok && !saving;

  const dismiss = useCallback(() => {
    markDismissedInStorage();
    setSessionDismissed(true);
  }, []);

  const save = useCallback(async () => {
    if (!validation.ok || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/competitive/display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: validation.name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || `Ошибка ${res.status}`);
        setSaving(false);
        return;
      }
      markDismissedInStorage();
      setSessionDismissed(true);
      router.refresh();
    } catch {
      setError("Ошибка сети");
      setSaving(false);
    }
  }, [validation, saving, router]);

  if (!open) return null;

  return (
    <div
      className="c-faq-modal-root"
      role="presentation"
      // no click-outside dismiss — must choose Save or No thanks
    >
      <div
        className="c-faq-modal c-faq-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nick-prompt-title"
      >
        <header className="c-faq-modal__head">
          <h4 id="nick-prompt-title">Псевдоним в Ranked</h4>
        </header>
        <div className="c-faq-modal__body">
          <p className="mb-3 text-sm leading-relaxed text-white/85">
            Хочешь поставить псевдоним для таблицы лидеров? Его увидят другие
            игроки вместо Telegram-ника.
          </p>
          <p className="mb-3 border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-xs leading-snug text-amber-100">
            Псевдоним можно менять не чаще раза в 24 часа. Удалить (сбросить)
            можно в любой момент в профиле.
          </p>
          <label className="block text-left text-xs text-white/55">
            Псевдоним ({COMPETITIVE_DISPLAY_NAME_MIN}–
            {COMPETITIVE_DISPLAY_NAME_MAX} символов)
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={COMPETITIVE_DISPLAY_NAME_MAX}
              placeholder="Например Ace_Player"
              className="mt-1 w-full border-2 border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white"
              disabled={saving}
              autoFocus
            />
          </label>
          {value.trim() && !validation.ok ? (
            <p className="mt-2 text-left text-xs text-red-300">{validation.error}</p>
          ) : null}
          {error ? (
            <p className="mt-2 text-left text-xs text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="c-faq-modal__foot flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="pixel-btn px-4 py-2 text-sm font-bold"
            disabled={saving}
            onClick={dismiss}
          >
            Нет, спасибо
          </button>
          <button
            type="button"
            className="pixel-btn pixel-btn-ok px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            onClick={() => void save()}
          >
            {saving ? "…" : "Сохранить"}
          </button>
        </footer>
      </div>
    </div>
  );
}
