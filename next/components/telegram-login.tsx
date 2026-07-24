"use client";

import { useEffect, useId, useState, type ReactElement } from "react";

export type TelegramLoginUser = Readonly<{
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}>;

type Props = Readonly<{
  onAuthenticated: (data: Record<string, string>) => Promise<boolean> | boolean;
  context: "player" | "admin";
  /** When true (e.g. Twitch auth in progress), block Telegram widget. */
  disabled?: boolean;
  /** Notify parent so sibling auth methods can disable. */
  onLoadingChange?: (loading: boolean) => void;
}>;

declare global {
  interface Window {
    onTelegramAuth?: (user: TelegramLoginUser) => void;
  }
}

/**
 * Official Telegram Login Widget.
 * Colors/shape of the blue TG button itself are controlled by Telegram
 * (data-size / data-radius / data-userpic only). We style the shell around it.
 */
export function TelegramLogin({
  onAuthenticated,
  context,
  disabled = false,
  onLoadingChange,
}: Props): ReactElement {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const containerId = useId().replace(/:/g, "");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const blocked = disabled || isLoading;

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    if (!botUsername || blocked) return;

    window.onTelegramAuth = async (user: TelegramLoginUser) => {
      setError("");
      setIsLoading(true);
      try {
        const data: Record<string, string> = {};
        for (const [key, value] of Object.entries(user)) {
          if (value != null) {
            data[key] = String(value);
          }
        }
        const success = await onAuthenticated(data);
        if (!success) {
          setError(
            context === "admin"
              ? "Вход выполнен, но для админ-панели нужна роль moderator или admin."
              : "Не удалось войти через Telegram.",
          );
          setIsLoading(false);
        }
        // On success keep loading until navigation unmounts the page.
      } catch {
        setError("Ошибка при входе через Telegram.");
        setIsLoading(false);
      }
    };

    const container = document.getElementById(`telegram-login-${containerId}`);
    if (container) {
      container.innerHTML = "";
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;
      script.setAttribute("data-telegram-login", botUsername);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "0");
      script.setAttribute("data-userpic", "true");
      script.setAttribute("data-lang", "ru");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      script.setAttribute("data-request-access", "write");
      container.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
    };
  }, [botUsername, containerId, context, onAuthenticated, blocked]);

  if (!botUsername) {
    return (
      <p className="text-sm font-bold text-red-400">
        Telegram login not configured. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.
      </p>
    );
  }

  return (
    <div className="text-center">
      <p className="mb-4 text-sm text-white/80">
        {context === "player"
          ? "Войти через Telegram"
          : "Войдите через Telegram. Доступ к админке — по роли."}
      </p>
      {error && (
        <p className="mb-4 text-sm font-bold text-red-400" role="alert">
          {error}
        </p>
      )}
      {isLoading ? (
        <button
          type="button"
          disabled
          className="pixel-btn pixel-btn-tg mx-auto inline-flex min-h-11 w-full max-w-xs cursor-wait items-center justify-center px-6 py-2 text-sm font-bold opacity-90"
          aria-busy="true"
        >
          Авторизовываемся…
        </button>
      ) : (
        <div
          id={`telegram-login-${containerId}`}
          className={`telegram-login-shell mx-auto flex min-h-[60px] justify-center rounded-none border-2 border-black bg-[#1e2732] px-3 py-3 shadow-[inset_2px_2px_0_#3d4f63,inset_-2px_-2px_0_#0d1218] ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
          aria-disabled={disabled || undefined}
        />
      )}
    </div>
  );
}
