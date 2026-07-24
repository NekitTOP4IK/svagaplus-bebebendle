"use client";

import { useCallback, useMemo, type ReactElement } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TelegramLogin } from "@/components/telegram-login";
import { COMPETITIVE_AUTH_NEXT, sanitizeNextPath } from "@/lib/safe-next-path";
import "./competitive.css";

function twitchErrorMessage(
  code: string | null,
  login: string | null,
): string | null {
  if (!code) return null;
  switch (code) {
    case "need_telegram_link":
      return login
        ? `Twitch «${login}» не привязан к Telegram в СВАГА+. Привяжите аккаунт в СВАГА+, затем войдите снова.`
        : "Twitch не привязан к Telegram в СВАГА+. Привяжите аккаунт, затем войдите снова.";
    case "svaga":
      return "СВАГА+ временно недоступна. Войдите через Telegram или попробуйте позже.";
    case "oauth":
      return "Не удалось войти через Twitch. Попробуйте ещё раз.";
    case "denied":
      return "Вход через Twitch отменён.";
    case "config":
      return "Вход через Twitch сейчас недоступен (не настроен).";
    default:
      return "Ошибка входа.";
  }
}

type Props = Readonly<{
  /** Where to send the user after successful auth (default /competitive). */
  nextPath?: string;
}>;

/**
 * Full-page auth gate for competitive mode (not the profile login screen).
 */
export function CompetitiveAuthGate({
  nextPath = COMPETITIVE_AUTH_NEXT,
}: Props): ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(
    () =>
      sanitizeNextPath(
        searchParams.get("next") || nextPath,
        COMPETITIVE_AUTH_NEXT,
      ),
    [searchParams, nextPath],
  );
  const twitchError = useMemo(
    () =>
      twitchErrorMessage(
        searchParams.get("twitch_error"),
        searchParams.get("login"),
      ),
    [searchParams],
  );

  const handleTelegram = useCallback(
    async (data: Record<string, string>) => {
      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) return false;
      router.replace(next);
      router.refresh();
      return true;
    },
    [router, next],
  );

  const twitchHref = `/api/auth/twitch/start?next=${encodeURIComponent(next)}`;

  return (
    <div className="c-hub min-h-dvh">
      <div className="c-hub-bg" aria-hidden>
        <div className="c-hub-bg__image" />
        <div className="c-hub-bg__shade" />
      </div>
      <main className="c-shell flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <section
          className="c-panel w-full max-w-md p-6 text-center sm:p-8"
          aria-labelledby="competitive-auth-title"
        >
          <h1
            id="competitive-auth-title"
            className="pixel-text mb-3 text-xl font-bold text-white sm:text-2xl"
          >
            Ranked
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-white/85 sm:text-base">
            Согласно правилам, в соревновательном режиме могут участвовать
            только авторизованные пользователи.
          </p>

          {twitchError ? (
            <p
              className="mb-4 border-2 border-red-700 bg-red-950/60 px-3 py-2 text-left text-sm text-red-200"
              role="alert"
            >
              {twitchError}
            </p>
          ) : null}

          <TelegramLogin onAuthenticated={handleTelegram} context="player" />

          <div className="mt-5">
            <a
              href={twitchHref}
              className="pixel-btn pixel-btn-twitch inline-flex min-h-11 w-full items-center justify-center px-6 py-2 text-sm font-bold"
            >
              Войти через Twitch
            </a>
            <p className="mt-2 text-[11px] leading-snug text-white/45">
              Twitch — если аккаунт уже привязан к Telegram в СВАГА+.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link
              href="/"
              className="pixel-btn inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-bold"
            >
              ← На главную
            </Link>
            <Link
              href="/profile"
              className="pixel-btn pixel-btn-info inline-flex min-h-11 items-center justify-center px-4 py-2 text-sm font-bold"
            >
              Обычный профиль
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
