"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { useRouter } from "next/navigation";
import { updateCompetitivePrefs } from "@/app/actions/competitive";
import { setCompetitiveDisplayNameAction } from "@/app/actions/profile";
import {
  COMPETITIVE_DISPLAY_NAME_MAX,
  COMPETITIVE_DISPLAY_NAME_MIN,
  validateCompetitiveDisplayName,
} from "@/lib/competitive/display-name";

/** Legacy localStorage key — migrated to server prefs when present. */
const LEGACY_STORAGE_KEY = "competitiveNickPromptDismissed";

type Props = Readonly<{
  competitiveDisplayName: string | null;
  /** From server competitive_user_prefs. */
  serverDismissed?: boolean;
  onFinished?: () => void;
}>;

function subscribeLegacy(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getLegacySnapshot(): boolean {
  try {
    return Boolean(localStorage.getItem(LEGACY_STORAGE_KEY));
  } catch {
    return false;
  }
}

function getLegacyServerSnapshot(): boolean {
  return false;
}

/**
 * First-visit Ranked prompt: optional pseudonym for the leaderboard.
 * Dismiss state is server-side (admin-resettable).
 */
export function CompetitiveNickPrompt({
  competitiveDisplayName,
  serverDismissed = false,
  onFinished,
}: Props): ReactElement | null {
  const router = useRouter();
  const legacyDismissed = useSyncExternalStore(
    subscribeLegacy,
    getLegacySnapshot,
    getLegacyServerSnapshot,
  );
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const legacySyncedRef = useRef(false);

  // One-shot migrate legacy localStorage → server prefs.
  useEffect(() => {
    if (!legacyDismissed || serverDismissed || legacySyncedRef.current) return;
    legacySyncedRef.current = true;
    void updateCompetitivePrefs({ nickPromptDismissed: true }).catch(() => undefined);
  }, [legacyDismissed, serverDismissed]);

  const hasNick = Boolean(competitiveDisplayName?.trim());
  const open =
    !hasNick &&
    !serverDismissed &&
    !sessionDismissed &&
    !legacyDismissed;

  const validation = useMemo(
    () => validateCompetitiveDisplayName(value),
    [value],
  );
  const canSave = validation.ok && !saving;

  const finish = useCallback(() => {
    setSessionDismissed(true);
    onFinished?.();
  }, [onFinished]);

  const dismissOnServer = useCallback(async () => {
    try {
      await updateCompetitivePrefs({ nickPromptDismissed: true });
    } catch {
      // still finish locally
    }
    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, "1");
      window.dispatchEvent(new Event("storage"));
    } catch {
      // ignore
    }
  }, []);

  const dismiss = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    await dismissOnServer();
    finish();
  }, [saving, dismissOnServer, finish]);

  const save = useCallback(async () => {
    if (!validation.ok || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await setCompetitiveDisplayNameAction(validation.name);
      if (!result.ok) {
        setError(result.message);
        setSaving(false);
        return;
      }
      await dismissOnServer();
      finish();
      router.refresh();
    } catch {
      setError("Ошибка сети");
      setSaving(false);
    }
  }, [validation, saving, dismissOnServer, finish, router]);

  if (!open) return null;

  return (
    <div className="c-faq-modal-root" role="presentation">
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
            onClick={() => void dismiss()}
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
